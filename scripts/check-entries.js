#!/usr/bin/env node
// Checks catalogue entries against the format in projects/_sample.md.
//
//   npm run check                       entries in projects/
//   npm run check -- --dir ../app/.artifact   a product repo's source folder
//   npm run check -- --remote           also fetch every link and remote image
//   npm run check -- --report           one table row per entry, warnings included
//
// Errors fail the run (exit 1). Warnings are things to fix before an entry is
// done: guesses still marked unconfirmed, placeholder media, missing links.

const fs = require("fs");
const path = require("path");
const schema = require("./lib/schema");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const config = schema.loadConfig();
const kinds = schema.linkKinds(config);
const categoryIds = schema.categories(config).map((c) => c.id);
const vocabulary = schema.tagVocabulary();
const sourceFolder = option("--dir");
const remote = flag("--remote");
const mediaBase =
  config.stack === "cloudflare" ? (config.cloudflare?.r2_media_base_url || "").replace(/\/$/, "") : null;

const MAX_BYTES = 2 * 1024 * 1024;
const DATE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

function entryFiles() {
  const dir = sourceFolder || "projects";
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md")
    .map((f) => path.join(dir, f));
}

// In projects/, media paths are relative to media/; in a source folder they
// are bare filenames beside the entry.
function localMediaPath(src) {
  return sourceFolder ? path.join(sourceFolder, src) : path.join("media", src);
}

async function fetchStatus(url) {
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "catalogue-check" } });
    return { status: response.status, text: url.includes("testflight.apple.com") ? await response.text() : "" };
  } catch (error) {
    return { status: 0, text: String(error.cause?.code || error.message) };
  }
}

async function checkMedia(src, { errors, warnings }, label) {
  if (/^https?:\/\//.test(src)) {
    if (remote) {
      const { status } = await fetchStatus(src);
      if (status !== 200) errors.push(`${label} ${src} returns ${status}`);
    }
    return null;
  }
  const file = localMediaPath(src);
  if (fs.existsSync(file)) {
    const bytes = fs.readFileSync(file);
    if (bytes.length > MAX_BYTES) errors.push(`${label} ${src} is ${(bytes.length / 1048576).toFixed(1)} MB (max 2 MB)`);
    return schema.imageSize(bytes);
  }
  if (remote && mediaBase) {
    const { status } = await fetchStatus(`${mediaBase}/${src}`);
    if (status !== 200) errors.push(`${label} ${src} is not in media/ and returns ${status} from ${mediaBase}`);
  } else if (!mediaBase || sourceFolder) {
    errors.push(`${label} ${src} doesn't exist`);
  } else {
    warnings.push(`${label} ${src} isn't in media/ (run with --remote to check ${mediaBase})`);
  }
  return null;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function checkEntry(file) {
  const slug = path.basename(file, ".md");
  const errors = [];
  const warnings = [];
  const problems = { errors, warnings };

  let data;
  try {
    data = schema.parseEntry(fs.readFileSync(file, "utf8")).data;
  } catch (error) {
    return { slug, errors: [`frontmatter doesn't parse: ${error.message}`], warnings };
  }

  if (!data.title) errors.push("missing title");
  const date = data.date instanceof Date ? data.date.toISOString().slice(0, 7) : String(data.date ?? "");
  if (!date) errors.push("missing date");
  else if (!DATE.test(date)) errors.push(`date "${date}" isn't YYYY or YYYY-MM`);

  if (data.category === undefined) {
    if (categoryIds.length > 1) errors.push(`missing category (one of ${categoryIds.join(", ")})`);
  } else if (!categoryIds.includes(data.category)) {
    errors.push(`category "${data.category}" isn't one of ${categoryIds.join(", ")}`);
  }

  const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
  for (const tag of tags) {
    if (tag !== tag.toLowerCase()) warnings.push(`tag "${tag}" isn't lowercase`);
    if (vocabulary && !vocabulary.has(tag)) errors.push(`tag "${tag}" isn't in tags.yml`);
  }

  if (data.url !== undefined && !/^https:\/\//.test(data.url)) errors.push(`url "${data.url}" isn't https://`);

  const links = data.links || {};
  if (typeof links !== "object" || Array.isArray(links)) errors.push("links must be a map of kind: url");
  for (const [kind, url] of Object.entries(links)) {
    const known = kinds[kind];
    if (!known) {
      errors.push(`unknown links key "${kind}" (known: ${Object.keys(kinds).join(", ")})`);
      continue;
    }
    if (!/^https:\/\//.test(String(url))) errors.push(`links.${kind} isn't https://`);
    else if (known.hosts?.length && !known.hosts.includes(hostOf(url))) {
      errors.push(`links.${kind} points at ${hostOf(url)}, expected ${known.hosts.join(" or ")}`);
    }
  }
  if (data.url && /github\.com/.test(data.url) && Object.keys(links).length) {
    warnings.push("url is a GitHub repo; use the product page, and put the repo in links.source");
  }
  for (const [tag, wanted] of Object.entries(schema.STORE_TAGS)) {
    if (tags.includes(tag) && !wanted.some((kind) => links[kind])) {
      warnings.push(`tagged ${tag} but has no ${wanted.join(" or ")} link`);
    }
  }

  const media = Array.isArray(data.media) ? data.media : [];
  if (!media.length) errors.push("missing media");
  for (const [i, item] of media.entries()) {
    const label = i === 0 ? "first image" : `media ${i + 1}`;
    if (!item?.src) {
      errors.push(`${label} has no src`);
      continue;
    }
    if (!item.alt) warnings.push(`${label} ${item.src} has no alt text`);
    if (String(item.src).includes("_sample/")) warnings.push(`${label} is a placeholder (${item.src})`);
    if (String(item.src).match(/(^|\/)icon\.(png|svg)$/)) errors.push(`${label} is the icon; icons are found by name, not listed in media`);
    const size = await checkMedia(String(item.src), problems, label);
    if (i === 0 && size && Math.abs(size.width / size.height - 4 / 3) > 4 / 3 / 10) {
      warnings.push(`first image is ${size.width}×${size.height}; the index card crops it to 4:3`);
    }
  }

  const iconSrc = sourceFolder ? schema.ICON_FILES(slug).find((f) => fs.existsSync(path.join(sourceFolder, f))) : data.icon;
  if (data.icon_shape !== undefined && !schema.ICON_SHAPES.includes(data.icon_shape)) {
    errors.push(`icon_shape "${data.icon_shape}" isn't one of ${schema.ICON_SHAPES.join(", ")}`);
  }
  if (iconSrc) {
    const size = await checkMedia(String(iconSrc), problems, "icon");
    if (size) {
      if (size.width !== size.height) errors.push(`icon is ${size.width}×${size.height}; it must be square`);
      else if (size.width < 512) warnings.push(`icon is ${size.width}px; use 1024 (512 minimum)`);
      if (size.alpha && (data.icon_shape || "squircle") !== "none") {
        warnings.push("icon has an alpha channel; the site masks it, so supply opaque, unmasked art");
      }
    }
  }

  for (const old of data.formerly || []) {
    if (fs.existsSync(path.join(path.dirname(file), `${old}.md`))) errors.push(`formerly "${old}" is still a live entry`);
  }

  for (const field of data.unconfirmed || []) warnings.push(`${field} is unconfirmed`);

  if (remote) {
    const urls = [["url", data.url], ...Object.entries(links).map(([k, v]) => [`links.${k}`, v])].filter(([, v]) => v);
    for (const [label, url] of urls) {
      const { status, text } = await fetchStatus(url);
      if (status !== 200) errors.push(`${label} ${url} returns ${status || text}`);
      else if (/testflight\.apple\.com/.test(url) && /beta is full|isn.t accepting|not accepting/i.test(text)) {
        warnings.push(`${label} isn't accepting testers`);
      } else if (/testflight\.apple\.com/.test(url) && !/Join the .* beta/.test(text)) {
        warnings.push(`${label} doesn't look like an open beta`);
      }
    }
  }

  return { slug, errors, warnings };
}

async function main() {
  const results = [];
  for (const file of entryFiles()) results.push(await checkEntry(file));

  if (flag("--report")) {
    console.log("| Entry | Errors | Warnings |\n|---|---|---|");
    for (const r of results) {
      console.log(`| ${r.slug} | ${r.errors.join("; ") || "—"} | ${r.warnings.join("; ") || "—"} |`);
    }
  } else {
    for (const r of results) {
      for (const e of r.errors) console.log(`✗ ${r.slug}: ${e}`);
      for (const w of r.warnings) console.log(`! ${r.slug}: ${w}`);
    }
  }

  const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
  const warningCount = results.reduce((n, r) => n + r.warnings.length, 0);
  console.log(`\n${results.length} entries, ${errorCount} errors, ${warningCount} warnings`);
  process.exit(errorCount ? 1 : 0);
}

main();
