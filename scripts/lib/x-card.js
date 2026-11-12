// The composed 1200×630 card served to X (Twitterbot) as twitter:image.
//
// X shows a large card as the image alone, with no title or description under
// it, so this card carries them: the entry's category and tags, its icon and
// title (or its wordmark), the short description, its first image, and the
// site's wordmark. Everyone else gets the plain image through og:image.
//
// Text is set as SVG paths from font files with opentype.js, so the card
// renders the same on any machine (no system fonts involved).

const fs = require("fs");
const opentype = require("opentype.js");

const W = 1200;
const H = 630;

const DEFAULT_FONTS = {
  title: "@fontsource/inter/files/inter-latin-600-normal.woff",
  text: "@fontsource/inter/files/inter-latin-400-normal.woff",
  label: "@fontsource/inter/files/inter-latin-500-normal.woff",
};

// A font path from the config, or a package file (resolved from the site).
function resolveFont(spec) {
  if (fs.existsSync(spec)) return spec;
  try {
    return require.resolve(spec, { paths: [process.cwd(), __dirname] });
  } catch {
    return null;
  }
}

const fontCache = new Map();
function loadFont(file) {
  if (!fontCache.has(file)) {
    const buf = fs.readFileSync(file);
    fontCache.set(file, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)));
  }
  return fontCache.get(file);
}

const escapeXml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function width(font, text, size, tracking = 0) {
  return font.getAdvanceWidth(text, size) + tracking * size * Math.max(text.length - 1, 0);
}

// One line of text as an SVG path; tracking in em, set glyph by glyph.
function textPath(font, text, x, y, size, fill, tracking = 0) {
  if (!tracking) return `<path d="${font.getPath(text, x, y, size).toPathData(2)}" fill="${fill}"/>`;
  let cursor = x;
  const parts = [];
  for (const ch of text) {
    parts.push(font.getPath(ch, cursor, y, size).toPathData(2));
    cursor += font.getAdvanceWidth(ch, size) + tracking * size;
  }
  return `<path d="${parts.join(" ")}" fill="${fill}"/>`;
}

// Greedy word wrap into at most `maxLines`, the last one ellipsized.
function wrap(font, text, size, maxWidth, maxLines) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || width(font, next, size) <= maxWidth) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.includes(" ") && width(font, `${last}…`, size) > maxWidth) last = last.replace(/\s*\S+$/, "");
  kept[maxLines - 1] = `${last.replace(/[\s,;:.\-—–]+$/, "")}…`;
  return kept;
}

// The squircle the site draws with CSS (corner-shape: superellipse(1.39) at
// 26% × 1.24418), as an SVG path.
function squirclePath(size) {
  const r = size * 0.26 * 1.24418;
  const n = 2 ** 1.39;
  const corner = (cx, cy, sx, sy) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * (Math.PI / 2);
      const x = cx + sx * r * (1 - Math.cos(t) ** (2 / n));
      const y = cy + sy * r * (1 - Math.sin(t) ** (2 / n));
      pts.push([x, y]);
    }
    return pts;
  };
  // Each corner runs from the edge midpoint side toward the next edge.
  const pts = [
    ...corner(size, 0, -1, 1).reverse(), // top-right
    ...corner(size, size, -1, -1), // bottom-right
    ...corner(0, size, 1, -1).reverse(), // bottom-left
    ...corner(0, 0, 1, 1), // top-left
  ];
  return `M${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join("L")}Z`;
}

// Material-style elevation under a masked icon: a tight key shadow offset
// down and a wider, fainter ambient one, both cast from the icon's own alpha.
// Values scale with the icon (set for a 132 px icon, Material elevation 3).
const ICON_SHADOWS = [
  { dy: 0.03, sigma: 0.025, opacity: 0.3 }, // key
  { dy: 0.06, sigma: 0.07, opacity: 0.15 }, // ambient
];
async function shadowLayers(sharp, png, size, left, top) {
  // Built step by step in JS: sharp reorders chained operations, so a single
  // pipeline (extract alpha → scale → pad → blur) doesn't run in that order.
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = [];
  for (const { dy, sigma, opacity } of ICON_SHADOWS) {
    const s = Math.max(0.3, sigma * size);
    const pad = Math.ceil(s * 3);
    const w = info.width + pad * 2;
    const h = info.height + pad * 2;
    const mask = Buffer.alloc(w * h);
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        mask[(y + pad) * w + x + pad] = Math.round(data[(y * info.width + x) * info.channels + 3] * opacity);
      }
    }
    const blurred = await sharp(await sharp(mask, { raw: { width: w, height: h, channels: 1 } }).blur(s).png().toBuffer()).extractChannel(0).raw().toBuffer();
    const input = await sharp({ create: { width: w, height: h, channels: 3, background: "#000000" } })
      .joinChannel(blurred, { raw: { width: w, height: h, channels: 1 } })
      .png()
      .toBuffer();
    out.push({ input, left: Math.round(left - pad), top: Math.round(top - pad + dy * size) });
  }
  return out;
}

async function iconLayer(sharp, file, kind, shape, box) {
  const svgOpts = /\.svg$/i.test(file) ? { density: 384 } : {};
  if (kind === "macos") {
    // Apple's macOS grid draws the shape at 824 of 1024; scale so the shape,
    // not the canvas, fills the box, and let the shadow spill past it.
    const size = Math.round(box / (824 / 1024));
    const input = await sharp(file, svgOpts).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return { input, offset: -Math.round((size - box) / 2), size };
  }
  const art = await sharp(file, svgOpts).resize(box, box, { fit: shape === "none" ? "contain" : "cover", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  if (shape === "none") return { input: art, offset: 0, size: box };
  const mask = shape === "circle"
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}"><circle cx="${box / 2}" cy="${box / 2}" r="${box / 2}"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}"><path d="${squirclePath(box)}"/></svg>`;
  const input = await sharp(art).composite([{ input: Buffer.from(mask), blend: "dest-in" }]).png().toBuffer();
  return { input, offset: 0, size: box };
}

// An image fitted into a box (never upscaled past 2×), returned with its size.
async function fitted(sharp, file, boxW, boxH) {
  const svgOpts = /\.svg$/i.test(file) ? { density: 384 } : {};
  const meta = await sharp(file, svgOpts).metadata();
  const scale = Math.min(boxW / meta.width, boxH / meta.height, /\.svg$/i.test(file) ? 8 : 2);
  const w = Math.max(1, Math.round(meta.width * scale));
  const h = Math.max(1, Math.round(meta.height * scale));
  return { input: await sharp(file, svgOpts).resize(w, h).png().toBuffer(), w, h };
}

async function renderXCard(sharp, job) {
  const colors = { background: "#ffffff", text: "#1a1a1a", muted: "#767676", panel: "#f2f2f2", ...(job.colors || {}) };
  const fonts = {};
  for (const role of ["title", "text", "label"]) fonts[role] = loadFont(job.fonts[role]);

  const layers = [];
  const svg = [];
  const pad = 64;
  const split = job.hero ? W - H : W; // the hero panel: a 630×630 square on the right
  const colW = job.hero ? split - pad - 56 : 940;

  // Hero panel.
  if (job.hero) {
    svg.push(`<rect x="${split}" y="0" width="${W - split}" height="${H}" fill="${colors.panel}"/>`);
    const inset = 40;
    const art = await fitted(sharp, job.hero, W - split - inset * 2, H - inset * 2);
    layers.push({ input: art.input, left: split + Math.round((W - split - art.w) / 2), top: Math.round((H - art.h) / 2) });
  }

  // Kicker: category and tags, small uppercase, as on the site.
  let y = 86;
  if (job.kicker) {
    const size = 17;
    let kicker = job.kicker.toUpperCase();
    while (width(fonts.label, kicker, size, 0.1) > colW && kicker.includes(" · ")) kicker = kicker.replace(/ · [^·]*$/, "");
    svg.push(textPath(fonts.label, kicker, pad, y, size, colors.muted, 0.1));
  }

  // Kicker, title (or wordmark) and description stack tightly from the top.
  const kickerBase = y;
  const iconBox = job.icon ? (job.hero ? 132 : 156) : 0;
  const bottom = H - pad;
  let rowBottom;
  if (job.wordmark) {
    const mark = await fitted(sharp, job.wordmark, colW, 80);
    const top = job.kicker ? kickerBase + 20 : pad;
    layers.push({ input: mark.input, left: pad, top: Math.round(top) });
    rowBottom = top + mark.h;
  } else {
    const tracking = -0.01;
    const capRatio = (fonts.title.tables.os2?.sCapHeight || fonts.title.unitsPerEm * 0.72) / fonts.title.unitsPerEm;
    let size = job.hero ? 64 : 84;
    while (size > 40 && width(fonts.title, job.title, size, tracking) > colW) size -= 2;
    const lines = width(fonts.title, job.title, size, tracking) > colW ? wrap(fonts.title, job.title, size, colW, 2) : [job.title];
    const lineH = size * 1.1;
    const cap = size * capRatio;
    const firstBase = (job.kicker ? kickerBase + 20 : pad) + cap;
    lines.forEach((line, i) => svg.push(textPath(fonts.title, line, pad, firstBase + i * lineH, size, colors.text, tracking)));
    rowBottom = firstBase + (lines.length - 1) * lineH;
  }

  // Description, directly under the title; it stops above the icon and the
  // site wordmark.
  if (job.description) {
    const size = job.hero ? 27 : 34;
    const lineH = Math.round(size * 1.38);
    const top = rowBottom + 22;
    const limit = bottom - (job.hero ? 34 : Math.max(iconBox, 34)) - 24;
    const maxLines = Math.max(1, Math.floor((limit - top) / lineH));
    // One line more than the short summary needs, filled from the longer text.
    const want = job.descriptionShort ? wrap(fonts.text, job.descriptionShort, size, colW, 6).length + 1 : 6;
    const lines = wrap(fonts.text, job.description, size, colW, Math.min(maxLines, want));
    lines.forEach((line, i) => svg.push(textPath(fonts.text, line, pad, top + size + i * lineH, size, colors.text)));
  }

  if (job.icon) {
    const icon = await iconLayer(sharp, job.icon, job.iconKind, job.iconShape, iconBox);
    // Bottom right of the preview square (of the text column when there is
    // no hero), its bottom edge on the site wordmark's.
    const right = job.hero ? W - pad : pad + colW;
    const left = Math.round(right - iconBox + icon.offset);
    const top = Math.round(bottom - iconBox + icon.offset);
    // macOS icons carry their own drawn shadow; logo marks (shape none) get none.
    if (job.iconKind !== "macos" && job.iconShape !== "none") layers.push(...(await shadowLayers(sharp, icon.input, iconBox, left, top)));
    layers.push({ input: icon.input, left, top });
  }

  // The site's wordmark, bottom left.
  if (job.siteWordmark) {
    const mark = await fitted(sharp, job.siteWordmark, 260, 34);
    layers.push({ input: mark.input, left: pad, top: H - pad - mark.h });
  } else if (job.siteTitle) {
    svg.push(textPath(fonts.title, job.siteTitle, pad, H - pad - 4, 24, colors.muted));
  }

  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${colors.background}"/>${svg.join("")}</svg>`;
  return sharp(Buffer.from(base)).composite(layers).png().toBuffer();
}

// The card for the index and pages: the site's icon, its wordmark (else its
// title) and its description, centred on white.
async function renderSiteCard(sharp, job) {
  const colors = { background: "#ffffff", text: "#1a1a1a", muted: "#767676", ...(job.colors || {}) };
  const fonts = {};
  for (const role of ["title", "text"]) fonts[role] = loadFont(job.fonts[role]);
  const layers = [];
  const svg = [];
  const iconSize = job.icon ? 168 : 0;
  const descSize = 30;
  const lineH = 42;
  const lines = job.description ? wrap(fonts.text, job.description, descSize, 880, 2) : [];
  const markH = job.wordmark ? 76 : 72;
  const gap = 36;
  const total = iconSize + (iconSize ? gap : 0) + markH + (lines.length ? gap + lineH * lines.length : 0);
  let y = Math.round((H - total) / 2);
  if (job.icon) {
    const icon = await fitted(sharp, job.icon, iconSize, iconSize);
    layers.push({ input: icon.input, left: Math.round((W - icon.w) / 2), top: y });
    y += iconSize + gap;
  }
  if (job.wordmark) {
    const mark = await fitted(sharp, job.wordmark, 560, markH);
    layers.push({ input: mark.input, left: Math.round((W - mark.w) / 2), top: y + Math.round((markH - mark.h) / 2) });
  } else {
    const size = 64;
    svg.push(textPath(fonts.title, job.title, (W - width(fonts.title, job.title, size)) / 2, y + size * 0.85, size, colors.text));
  }
  y += markH + gap;
  lines.forEach((line, i) => {
    svg.push(textPath(fonts.text, line, (W - width(fonts.text, line, descSize)) / 2, y + descSize + i * lineH, descSize, colors.muted));
  });
  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${colors.background}"/>${svg.join("")}</svg>`;
  return sharp(Buffer.from(base)).composite(layers).png().toBuffer();
}

module.exports = { renderXCard, renderSiteCard, resolveFont, DEFAULT_FONTS, wrap, loadFont, squirclePath, escapeXml };
