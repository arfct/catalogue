// Link-preview metadata: the description, preview image and icon a page
// advertises to crawlers (iMessage, Slack, X, Discord, WhatsApp…).
//
// Pure helpers (summarize, plainText) plus the image side: templates ask for
// an image or icon URL during the build, which registers a render job keyed
// by a hash of its inputs; the eleventy.after hook renders every registered
// job into <output>/og/. Renders are cached in .cache/og/ so rebuilds and
// `eleventy --serve` don't redo them.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const xCard = require("./x-card");

// Bump when the rendering changes, so every image gets a new URL and the
// platforms that cache previews by image URL fetch the new one.
const VERSION = 4;

const CARD = { width: 1200, height: 630 };
const ICON_SIZE = 180;
const MAX_BYTES = 580 * 1024; // WhatsApp skips og:image files much over ~600 KB
const DESCRIPTION_MAX = 200;

// ─── Text ────────────────────────────────────────────────────────────────────

// Markdown (or HTML) to one line of plain text.
function plainText(markdown) {
  return String(markdown ?? "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "") // frontmatter
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1") // reference links
    .replace(/^\s{0,3}\[[^\]]+\]:.*$/gm, " ") // link definitions
    .replace(/<[^>]+>/g, " ") // HTML tags
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "") // list markers
    .replace(/(\*\*|__)(.+?)\1/g, "$2") // bold
    .replace(/(^|[^\w*])[*_](?!\s)(.+?)(?<!\s)[*_](?![\w*])/g, "$1$2") // italic
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The first sentence(s) of a text, at most `max` characters. Whole sentences
// when the first one fits; otherwise the first sentence cut at a word
// boundary with an ellipsis. Always a single line.
function summarize(text, max = DESCRIPTION_MAX) {
  const flat = plainText(text);
  if (!flat) return "";
  if (flat.length <= max) return flat;
  const sentences = flat.split(/(?<=[.!?…]["'”’)\]]?)\s+(?=["'“‘(\[]?[\p{Lu}\p{N}])/u);
  let out = "";
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > max) break;
    out = next;
  }
  if (out) return out;
  const cut = flat.slice(0, max); // max-1 chars plus the ellipsis
  const atWord = cut.slice(0, max - 1).replace(/\s+\S*$/, "");
  return `${(atWord || cut.slice(0, max - 1)).replace(/[\s,;:.\-—–]+$/, "")}…`;
}

// The body of a Markdown file, without its frontmatter.
function readBody(inputPath) {
  try {
    return fs.readFileSync(inputPath, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  } catch {
    return "";
  }
}

// ─── Image jobs ──────────────────────────────────────────────────────────────

const jobs = new Map(); // file name → job

function fileHash(file) {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

function slugify(value) {
  return String(value || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
}

// Register a render job and return its file name under /og/. `inputs` holds
// everything that changes the pixels; local source files are hashed by content.
function register(kind, name, inputs, ext) {
  const sources = (inputs.files || []).map((f) => [f, fileHash(f)]);
  if (sources.some(([, hash]) => !hash)) return null;
  const key = crypto
    .createHash("sha1")
    .update(JSON.stringify({ VERSION, kind, ...inputs, files: sources.map(([, h]) => h) }))
    .digest("hex")
    .slice(0, 10);
  const file = `${slugify(name)}.${key}.${ext}`;
  jobs.set(file, { kind, file, key, ...inputs });
  return file;
}

// A 1200×630 card from a local image, or, for pages with no image of their
// own, the site card: icon, wordmark or title, and description.
function cardJob({ name, image, icon, title, wordmark, description, fonts, colors, background }) {
  if (image) return register("image", name, { files: [image], background }, "jpg");
  const fontFiles = resolveFonts(fonts);
  if (!fontFiles) return null;
  const files = [icon, wordmark, ...Object.values(fontFiles)].filter(Boolean);
  return register("site", name, { files, icon, title, wordmark, description, fonts: fontFiles, colors }, "jpg");
}

function resolveFonts(fonts) {
  const out = {};
  for (const [role, spec] of Object.entries({ ...xCard.DEFAULT_FONTS, ...(fonts || {}) })) {
    out[role] = xCard.resolveFont(spec);
    if (!out[role]) return null;
  }
  return out;
}

// The composed card for X: title or wordmark, description, icon, hero, the
// category and tags line, and the site's wordmark (see x-card.js).
function xCardJob({ name, title, wordmark, description, descriptionShort, icon, iconKind, iconShape, hero, kicker, siteWordmark, siteTitle, fonts, colors }) {
  const fontFiles = resolveFonts(fonts);
  if (!fontFiles) return null;
  const files = [hero, icon, wordmark, siteWordmark, ...Object.values(fontFiles)].filter(Boolean);
  return register(
    "x",
    `${name}-x`,
    { files, title, wordmark, description, descriptionShort, icon, iconKind, iconShape: iconShape || "squircle", hero, kicker, siteWordmark, siteTitle, fonts: fontFiles, colors },
    "jpg"
  );
}

// A square PNG icon (apple-touch-icon size), flattened onto a background since
// iOS fills transparency with black. `inset` pads art that has no shape of its own.
function iconJob({ name, icon, background, inset = 0 }) {
  if (!icon) return null;
  return register("icon", `${name}-icon`, { files: [icon], background, inset }, "png");
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function load(sharp, file) {
  return sharp(file, /\.svg$/i.test(file) ? { density: 384 } : {});
}

async function encodeCard(pipeline) {
  for (const quality of [90, 86, 80, 72, 64, 56]) {
    const buf = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (buf.length <= MAX_BYTES) return buf;
  }
  return pipeline.jpeg({ quality: 48, mozjpeg: true }).toBuffer();
}

async function renderImageCard(sharp, job) {
  const { width: W, height: H } = CARD;
  const source = job.files[0];
  const meta = await load(sharp, source).metadata();
  const ratio = meta.width / meta.height;
  // Close to 1.91:1: fill the card. Anything else: letterbox it whole on the
  // background, so tall phone screenshots and square art aren't cropped.
  if (Math.abs(ratio / (W / H) - 1) < 0.12) {
    const filled = load(sharp, source).resize(W, H, { fit: "cover" }).flatten({ background: job.background });
    return encodeCard(filled);
  }
  const pad = 48;
  const boxW = W - pad * 2;
  const boxH = H - pad * 2;
  const scale = Math.min(boxW / meta.width, boxH / meta.height, 2); // upscale at most 2×
  const w = Math.round(meta.width * scale);
  const h = Math.round(meta.height * scale);
  const art = await load(sharp, source).resize(w, h).png().toBuffer();
  const card = sharp({ create: { width: W, height: H, channels: 3, background: job.background } }).composite([
    { input: art, left: Math.round((W - w) / 2), top: Math.round((H - h) / 2) },
  ]);
  return encodeCard(sharp(await card.png().toBuffer()));
}

async function renderIcon(sharp, job) {
  const inner = Math.round(ICON_SIZE * (1 - 2 * job.inset));
  const art = await load(sharp, job.files[0])
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const offset = Math.round((ICON_SIZE - inner) / 2);
  const composed = await sharp({ create: { width: ICON_SIZE, height: ICON_SIZE, channels: 3, background: job.background } })
    .composite([{ input: art, left: offset, top: offset }])
    .png()
    .toBuffer();
  return sharp(composed).flatten({ background: job.background }).png({ compressionLevel: 9 }).toBuffer();
}

async function renderJob(sharp, job) {
  if (job.kind === "image") return renderImageCard(sharp, job);
  if (job.kind === "site") return encodeCard(sharp(await xCard.renderSiteCard(sharp, job)));
  if (job.kind === "x") return encodeCard(sharp(await xCard.renderXCard(sharp, job)));
  return renderIcon(sharp, job);
}

// Render every registered job into <outputDir>/og/, through the cache.
async function renderAll(outputDir, { cacheDir = path.join(".cache", "og"), log = () => {} } = {}) {
  if (!jobs.size) return [];
  const sharp = require("sharp");
  const outDir = path.join(outputDir, "og");
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  const written = [];
  for (const job of jobs.values()) {
    const cached = path.join(cacheDir, job.file);
    if (!fs.existsSync(cached)) {
      try {
        fs.writeFileSync(cached, await renderJob(sharp, job));
      } catch (err) {
        log(`link preview: could not render ${job.file} from ${job.files.join(", ")}: ${err.message}`);
        continue;
      }
    }
    fs.copyFileSync(cached, path.join(outDir, job.file));
    written.push(job.file);
  }
  return written;
}

module.exports = {
  CARD,
  ICON_SIZE,
  DESCRIPTION_MAX,
  plainText,
  summarize,
  readBody,
  cardJob,
  xCardJob,
  iconJob,
  renderAll,
  jobs,
};
