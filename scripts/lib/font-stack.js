// Fonts for the composed cards, with a fallback chain chosen glyph by glyph.
//
// The primary font is a file (default: Inter's latin subset). When it comes
// from a Fontsource package, its other subsets (latin-ext, cyrillic, greek,
// vietnamese) join the stack. Characters none of those draw come from the
// fallbacks below: Noto Sans Math (arrows, maths, Greek), Noto Sans Symbols 2,
// Noto Sans SC (CJK) and Noto Emoji (monochrome outlines). A character no font
// has is replaced by its compatibility form when that is drawable (ﬁ → fi,
// ₂ → 2) and otherwise dropped, so a card never shows a .notdef box.
//
// Subset files are loaded only when a character in their unicode-range is
// needed: call `await stack.prepare(text)` before measuring or drawing.

const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");

// Fontsource packages tried in order after the primary font.
const FALLBACKS = [
  "@fontsource/noto-sans-math",
  "@fontsource/noto-sans-symbols-2",
  "@fontsource-variable/noto-sans-sc",
  "@fontsource/noto-emoji",
];

// Invisible joiners and selectors: skipped rather than looked up. Regional
// indicators too: opentype.js doesn't apply the ligature that makes a pair a
// flag, and two loose letters in boxes read worse than nothing.
const INVISIBLE = /[\u200B-\u200D\u2060\uFE00-\uFE0F\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u;

function parseRanges(spec) {
  return String(spec)
    .split(",")
    .map((part) => part.trim().replace(/^U\+/i, ""))
    .filter(Boolean)
    .map((part) => {
      const [a, b] = part.split("-").map((h) => parseInt(h, 16));
      return [a, Number.isNaN(b) || b === undefined ? a : b];
    });
}

function packageDir(pkg) {
  try {
    return path.dirname(require.resolve(`${pkg}/package.json`, { paths: [process.cwd(), __dirname] }));
  } catch {
    return null;
  }
}

// A Fontsource package as a list of {ranges, file} subsets at one weight.
function fontsourceFamily(dir, weight, style = "normal") {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  let meta;
  let unicode;
  try {
    meta = read("metadata.json");
    unicode = read("unicode.json");
  } catch {
    return null;
  }
  const variable = fs.existsSync(path.join(dir, "files")) && fs.readdirSync(path.join(dir, "files")).some((f) => /-wght-normal\.woff2$/.test(f));
  const weights = meta.weights || [400];
  const w = weights.reduce((best, x) => (Math.abs(x - weight) < Math.abs(best - weight) ? x : best), weights[0]);
  const subsets = [];
  for (const [key, range] of Object.entries(unicode)) {
    const subset = key.replace(/[[\]]/g, "");
    const base = variable ? `${meta.id}-${subset}-wght-${style}` : `${meta.id}-${subset}-${w}-${style}`;
    const file = [`${base}.woff`, `${base}.woff2`].map((f) => path.join(dir, "files", f)).find((f) => fs.existsSync(f));
    if (file) subsets.push({ ranges: parseRanges(range), file });
  }
  // A one-file package is tried for every character: its unicode.json can
  // list less than the file holds (Noto Sans Math's says latin only).
  if (subsets.length === 1) subsets[0].ranges = null;
  return subsets.length ? { name: meta.id, subsets } : null;
}

// The primary file's family: its Fontsource siblings when it is one of a
// package's subset files, else the file alone (covering whatever it covers).
function primaryFamily(file) {
  file = path.resolve(file);
  const m = path.basename(file).match(/^(.+?)-([a-z0-9-]+)-(\d{3})-(normal|italic)\.woff2?$/);
  const dir = path.dirname(path.dirname(file));
  if (m && fs.existsSync(path.join(dir, "unicode.json"))) {
    const family = fontsourceFamily(dir, Number(m[3]), m[4]);
    if (family) {
      // The configured file first, so its metrics lead.
      family.subsets.sort((a, b) => (b.file === file) - (a.file === file));
      return family;
    }
  }
  return { name: path.basename(file), subsets: [{ ranges: null, file }] };
}

// WOFF2 (opentype.js reads only TTF/OTF/WOFF). wawoff2 hands back a view
// of its WebAssembly memory, which the next call overwrites: decompress one
// file at a time and copy the result out before starting another.
let woff2Queue = Promise.resolve();
function decompressWoff2(buf) {
  const run = woff2Queue.then(async () => Buffer.from(Uint8Array.prototype.slice.call(await require("wawoff2").decompress(buf))));
  woff2Queue = run.catch(() => {});
  return run;
}

const parsed = new Map(); // file → Promise<opentype.Font>
function loadFile(file) {
  if (!parsed.has(file)) {
    parsed.set(
      file,
      (async () => {
        let buf = fs.readFileSync(file);
        if (/\.woff2$/i.test(file)) buf = await decompressWoff2(buf);
        return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
      })()
    );
  }
  return parsed.get(file);
}

class FontStack {
  constructor(primaryFile, { fallbacks = FALLBACKS } = {}) {
    const weight = Number((path.basename(primaryFile).match(/-(\d{3})-/) || [])[1]) || 400;
    this.weight = weight;
    this.families = [primaryFamily(primaryFile)];
    for (const pkg of fallbacks) {
      const dir = packageDir(pkg);
      const family = dir && fontsourceFamily(dir, weight);
      if (family) this.families.push(family);
    }
    this.loaded = new Map(); // file → Font
    this.primaryFile = path.resolve(primaryFile);
  }

  // Load the primary font and every subset file `text` needs.
  // Walks the chain for each character and stops at the first font that
  // draws it, so a fallback file is read only when something needs it.
  async prepare(...texts) {
    await this.load(this.primaryFile);
    this.primary = this.loaded.get(this.primaryFile);
    this.unitsPerEm = this.primary.unitsPerEm;
    this.tables = this.primary.tables;
    const seen = new Set();
    for (const text of texts) {
      for (const ch of String(text ?? "").normalize("NFC")) {
        if (seen.has(ch) || /\s/.test(ch) || INVISIBLE.test(ch)) continue;
        seen.add(ch);
        if (await this.find(ch)) continue;
        const compat = ch.normalize("NFKC");
        if (compat !== ch) for (const c of compat) await this.find(c);
      }
    }
    return this;
  }

  async load(file) {
    if (!this.loaded.has(file)) this.loaded.set(file, await loadFile(file));
  }

  async find(ch) {
    const cp = ch.codePointAt(0);
    for (const family of this.families) {
      for (const subset of family.subsets) {
        if (subset.ranges && !subset.ranges.some(([a, b]) => cp >= a && cp <= b)) continue;
        await this.load(subset.file);
        if (this.loaded.get(subset.file).charToGlyphIndex(ch) > 0) return true;
      }
    }
    return false;
  }

  // The first loaded font that has a glyph for `ch`, else null.
  fontFor(ch) {
    const cp = ch.codePointAt(0);
    for (const family of this.families) {
      for (const subset of family.subsets) {
        if (subset.ranges && !subset.ranges.some(([a, b]) => cp >= a && cp <= b)) continue;
        const font = this.loaded.get(subset.file);
        if (font && font.charToGlyphIndex(ch) > 0) return font;
      }
    }
    return null;
  }

  // The text as it can be drawn: NFC, invisible selectors removed,
  // undrawable characters replaced by a drawable compatibility form or
  // dropped, and the spaces a drop leaves collapsed.
  clean(text) {
    let out = "";
    for (const ch of String(text ?? "").normalize("NFC")) {
      if (INVISIBLE.test(ch)) continue;
      if (/\s/.test(ch)) {
        out += " ";
        continue;
      }
      if (this.fontFor(ch)) {
        out += ch;
        continue;
      }
      const compat = ch.normalize("NFKC");
      if (compat !== ch && [...compat].every((c) => /\s/.test(c) || this.fontFor(c))) out += compat;
    }
    return out.replace(/ {2,}/g, " ").replace(/ ([,.;:!?)\]])/g, "$1").trim();
  }

  // Runs of consecutive characters drawn by the same font.
  runs(text) {
    const runs = [];
    for (const ch of String(text)) {
      const font = this.fontFor(ch) || (/\s/.test(ch) ? this.primary : null);
      if (!font) continue;
      const last = runs[runs.length - 1];
      if (last && last.font === font) last.text += ch;
      else runs.push({ font, text: ch });
    }
    return runs;
  }

  getAdvanceWidth(text, size) {
    return this.runs(text).reduce((sum, run) => sum + run.font.getAdvanceWidth(run.text, size), 0);
  }

  // A stroke, in em, that brings a lighter font up to the stack's weight.
  // opentype.js draws a variable font at its default instance (Noto Sans
  // SC's is Thin), so CJK beside semibold Latin would look hairline.
  extraStroke(font) {
    const axis = font.tables.fvar?.axes?.find((a) => a.tag === "wght");
    const drawn = axis ? axis.defaultValue : font.tables.os2?.usWeightClass || this.weight;
    return Math.max(0, this.weight - drawn) * 0.00017;
  }

  // One line starting at (x, y) as SVG <path> elements.
  svg(text, x, y, size, fill) {
    let cursor = x;
    const plain = [];
    const out = [];
    for (const run of this.runs(text)) {
      const d = run.font.getPath(run.text, cursor, y, size).toPathData(2);
      const stroke = this.extraStroke(run.font) * size;
      if (stroke > 0.05) out.push(`<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="${stroke.toFixed(2)}" stroke-linejoin="round"/>`);
      else plain.push(d);
      cursor += run.font.getAdvanceWidth(run.text, size);
    }
    if (plain.length) out.unshift(`<path d="${plain.join(" ")}" fill="${fill}"/>`);
    return out.join("");
  }
}

const stacks = new Map();
// One stack per primary font file, loaded for the given texts.
async function fontStack(file, ...texts) {
  if (!stacks.has(file)) stacks.set(file, new FontStack(file));
  return stacks.get(file).prepare(...texts);
}

// What the fallbacks are, for the render cache key: a new package version
// may draw differently.
function fallbackVersions() {
  return FALLBACKS.map((pkg) => {
    const dir = packageDir(pkg);
    try {
      return `${pkg}@${dir ? JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version : "-"}`;
    } catch {
      return `${pkg}@-`;
    }
  });
}

module.exports = { FontStack, fontStack, fallbackVersions, FALLBACKS };
