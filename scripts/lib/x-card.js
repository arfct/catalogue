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
  const split = job.hero ? 620 : W; // the hero panel takes the right side
  const colW = split - pad - (job.hero ? 56 : pad);

  // Hero panel.
  if (job.hero) {
    svg.push(`<rect x="${split}" y="0" width="${W - split}" height="${H}" fill="${colors.panel}"/>`);
    const inset = 40;
    const art = await fitted(sharp, job.hero, W - split - inset * 2, H - inset * 2);
    layers.push({ input: art.input, left: split + Math.round((W - split - art.w) / 2), top: Math.round((H - art.h) / 2) });
  }

  // Kicker: category and tags, small uppercase, as on the site.
  let y = 96;
  if (job.kicker) {
    const size = 17;
    let kicker = job.kicker.toUpperCase();
    while (width(fonts.label, kicker, size, 0.1) > colW && kicker.includes(" · ")) kicker = kicker.replace(/ · [^·]*$/, "");
    svg.push(textPath(fonts.label, kicker, pad, y, size, colors.muted, 0.1));
  }

  // Icon and title (or wordmark) on one row.
  const rowTop = job.kicker ? 132 : 88;
  const iconBox = 96;
  let textX = pad;
  if (job.icon) {
    const icon = await iconLayer(sharp, job.icon, job.iconKind, job.iconShape, iconBox);
    layers.push({ input: icon.input, left: pad + icon.offset, top: rowTop + icon.offset });
    textX = pad + iconBox + 28;
  }
  const titleW = pad + colW - textX;
  let rowBottom = rowTop + (job.icon ? iconBox : 0);
  if (job.wordmark) {
    const mark = await fitted(sharp, job.wordmark, titleW, job.icon ? iconBox * 0.8 : 110);
    const top = job.icon ? rowTop + Math.round((iconBox - mark.h) / 2) : rowTop;
    layers.push({ input: mark.input, left: textX, top });
    rowBottom = Math.max(rowBottom, top + mark.h);
  } else {
    let size = 64;
    while (size > 40 && width(fonts.title, job.title, size) > titleW) size -= 2;
    const lines = width(fonts.title, job.title, size) > titleW ? wrap(fonts.title, job.title, size, titleW, 2) : [job.title];
    const lineH = size * 1.12;
    const block = lineH * (lines.length - 1) + size * 0.72; // cap height to baseline
    const base = job.icon ? rowTop + (iconBox - block) / 2 + size * 0.72 : rowTop + size * 0.8;
    lines.forEach((line, i) => svg.push(textPath(fonts.title, line, textX, base + i * lineH, size, colors.text, -0.01)));
    rowBottom = Math.max(rowBottom, base + (lines.length - 1) * lineH + size * 0.25);
  }

  // Description.
  const footerTop = H - pad - 34;
  if (job.description) {
    const size = 27;
    const lineH = 39;
    const top = rowBottom + 40;
    const maxLines = Math.max(1, Math.floor((footerTop - 28 - top) / lineH));
    const lines = wrap(fonts.text, job.description, size, colW, Math.min(maxLines, 6));
    lines.forEach((line, i) => svg.push(textPath(fonts.text, line, pad, top + size + i * lineH, size, colors.text)));
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

module.exports = { renderXCard, resolveFont, DEFAULT_FONTS, wrap, loadFont, squirclePath, escapeXml };
