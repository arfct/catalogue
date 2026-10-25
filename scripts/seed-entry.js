#!/usr/bin/env node
// Moves a catalogue entry into the repo it describes: the reverse of an import.
//
//   npm run seed -- <slug> <path-to-repo> [--merge fields.yml]
//
// Writes <repo>/<source_dir>/<slug>.md with bare image names, copies its images
// beside it (from media/, or from the media host when they only live there),
// and adds a README saying what the folder is. Placeholder images are left
// out, so the entry has to get real ones. --merge layers extra frontmatter
// (category, links, unconfirmed…) over what the catalogue had.
// Nothing is committed in the product repo; that's a PR there.

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const schema = require("./lib/schema");

const IMPORT_FIELDS = ["source", "source_commit", "icon"];

async function readMedia(src, mediaBase) {
  const local = path.join("media", src);
  if (fs.existsSync(local)) return fs.readFileSync(local);
  if (!mediaBase) throw new Error(`media/${src} doesn't exist`);
  const response = await fetch(`${mediaBase}/${src}`);
  if (!response.ok) throw new Error(`${mediaBase}/${src} returns ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const [slug, repoPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const mergeIndex = process.argv.indexOf("--merge");
  if (!slug || !repoPath) throw new Error("usage: npm run seed -- <slug> <path-to-repo> [--merge fields.yml]");

  const config = schema.loadConfig();
  const mediaBase = config.stack === "cloudflare" ? (config.cloudflare?.r2_media_base_url || "").replace(/\/$/, "") : null;
  const folder = path.join(repoPath, schema.sourceDir(config));
  const { data, body } = schema.parseEntry(fs.readFileSync(path.join("projects", `${slug}.md`), "utf8"));
  const extra = mergeIndex > 0 ? yaml.load(fs.readFileSync(process.argv[mergeIndex + 1], "utf8")) : {};

  fs.mkdirSync(folder, { recursive: true });
  const copied = [];
  const dropped = [];

  const media = [];
  for (const item of data.media || []) {
    if (/^https?:\/\//.test(item.src)) {
      media.push(item);
    } else if (item.src.includes("_sample/")) {
      dropped.push(item.src);
    } else {
      const name = path.basename(item.src);
      fs.writeFileSync(path.join(folder, name), await readMedia(item.src, mediaBase));
      copied.push(name);
      media.push({ ...item, src: name });
    }
  }
  if (data.icon) {
    const iconName = `icon${path.extname(data.icon)}`;
    fs.writeFileSync(path.join(folder, iconName), await readMedia(data.icon, mediaBase));
    copied.push(iconName);
  }

  for (const field of IMPORT_FIELDS) delete data[field];
  const seeded = { ...data, ...extra, media: extra.media || media };
  fs.writeFileSync(path.join(folder, `${slug}.md`), schema.formatEntry(seeded, body));

  const readme = path.join(folder, "README.md");
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      "This folder is this project's catalogue entry: an artifact, the record of one made thing.\n" +
        "It isn't build output. The format is documented in the Catalogue Raisonné template (github.com/arfct/catalogue).\n"
    );
  }

  console.log(`wrote ${path.join(folder, `${slug}.md`)}`);
  for (const name of copied) console.log(`  copied ${name}`);
  for (const src of dropped) console.log(`  left out placeholder ${src}: the entry needs a real image`);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
