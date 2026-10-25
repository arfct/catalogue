#!/usr/bin/env node
// Copies entries that live in other repos into this catalogue.
//
// Each repo listed under `sources:` in catalogue.config.yml keeps its entry in
// a hidden folder at its root (`source_dir`, default `.artifact/`): <slug>.md,
// its images beside it, and optionally icon.png. This reads that folder from
// the repo's default branch, writes projects/<slug>.md and media/<slug>/, and
// prints what changed. Committing (and `npm run sync` on Cloudflare) stays a
// separate, reviewable step, so the build itself never needs the network.
//
//   npm run import                         every source, through the GitHub CLI
//   npm run import -- --repo you/app       one source
//   npm run import -- --from ../app/.artifact --repo you/app   a local folder
//   npm run import -- --adopt              let an import replace a hand-written entry

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const schema = require("./lib/schema");

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const adopt = args.includes("--adopt");
const root = option("--root") || ".";

const config = schema.loadConfig(path.join(root, "catalogue.config.yml"));
const folder = schema.sourceDir(config);

function gh(...ghArgs) {
  return execFileSync("gh", ["api", ...ghArgs], { maxBuffer: 64 * 1024 * 1024 });
}

// A source as a list of {name, read()} plus the commit it came from.
function remoteSource(repo) {
  const branch = JSON.parse(gh(`repos/${repo}`)).default_branch;
  const commit = JSON.parse(gh(`repos/${repo}/commits/${branch}`)).sha;
  let listing;
  try {
    listing = JSON.parse(gh(`repos/${repo}/contents/${folder}?ref=${commit}`));
  } catch {
    throw new Error(`${repo} has no ${folder}/ folder on ${branch}`);
  }
  const files = listing
    .filter((item) => item.type === "file")
    .map((item) => ({
      name: item.name,
      read: () => gh("-H", "Accept: application/vnd.github.raw", `repos/${repo}/contents/${item.path}?ref=${commit}`),
    }));
  return { commit, files };
}

function localSource(dir) {
  let commit = option("--commit") || "";
  if (commit) return { commit, files: listLocal(dir) };
  commit = "local";
  try {
    commit = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {}
  return { commit, files: listLocal(dir) };
}

function listLocal(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .map((name) => ({ name, read: () => fs.readFileSync(path.join(dir, name)) }));
}

const isRemote = (src) => /^https?:\/\//.test(src);

function importSource(repo, source) {
  const usable = source.files.filter((f) => !f.name.startsWith("_") && !f.name.startsWith("."));
  const entries = usable.filter((f) => f.name.endsWith(".md") && f.name !== "README.md");
  if (!entries.length) throw new Error(`${repo}: no entries in ${folder}/`);
  const assets = usable.filter((f) => !f.name.endsWith(".md"));
  const changes = [];

  for (const entryFile of entries) {
    const slug = path.basename(entryFile.name, ".md");
    const { data, body } = schema.parseEntry(entryFile.read().toString("utf8"));
    const target = path.join(root, "projects", `${slug}.md`);

    if (fs.existsSync(target)) {
      const existing = schema.parseEntry(fs.readFileSync(target, "utf8")).data;
      if (existing.source && existing.source !== repo) {
        throw new Error(`${repo}: projects/${slug}.md is already imported from ${existing.source}`);
      }
      if (!existing.source && !adopt) {
        throw new Error(`${repo}: projects/${slug}.md is hand-written; rerun with --adopt to replace it`);
      }
    }

    // A repo with several entries names each icon <slug>.icon.png; a lone
    // entry may use plain icon.png.
    const iconName = schema
      .ICON_FILES(slug)
      .filter((name) => entries.length === 1 || name.startsWith(`${slug}.`))
      .find((name) => assets.some((a) => a.name === name));
    const referenced = new Set((data.media || []).map((m) => m.src).filter((src) => src && !isRemote(src)));
    for (const src of referenced) {
      if (!assets.some((a) => a.name === src)) throw new Error(`${repo}: ${slug}.md uses ${src}, which isn't in ${folder}/`);
    }

    data.media = (data.media || []).map((m) => (m.src && !isRemote(m.src) ? { ...m, src: `${slug}/${m.src}` } : m));
    if (iconName) data.icon = `${slug}/${iconName.replace(`${slug}.`, "")}`;
    data.source = repo;
    data.source_commit = source.commit;

    const output = schema.formatEntry(data, body, `Imported from ${repo}. Edit ${folder}/${slug}.md there, not this file.`);
    const before = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
    if (before !== output) {
      fs.writeFileSync(target, output);
      changes.push(`${before === null ? "added" : "updated"} projects/${slug}.md`);
    }

    // media/<slug>/ belongs to the import: copy what the entry uses, drop the rest.
    const mediaDir = path.join(root, "media", slug);
    fs.mkdirSync(mediaDir, { recursive: true });
    const wanted = new Map();
    for (const src of referenced) wanted.set(src, src);
    if (iconName) wanted.set(iconName, iconName.replace(`${slug}.`, ""));
    for (const [from, to] of wanted) {
      const bytes = assets.find((a) => a.name === from).read();
      const dest = path.join(mediaDir, to);
      if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(bytes)) {
        fs.writeFileSync(dest, bytes);
        changes.push(`wrote media/${slug}/${to}`);
      }
    }
    for (const stale of fs.readdirSync(mediaDir)) {
      if (![...wanted.values()].includes(stale)) {
        fs.rmSync(path.join(mediaDir, stale));
        changes.push(`removed media/${slug}/${stale}`);
      }
    }
  }
  return changes;
}

function main() {
  const only = option("--repo");
  const from = option("--from");
  if (from && !only) throw new Error("--from needs --repo, to record where the entry lives");

  const sources = from ? [{ repo: only }] : (config.sources || []).filter((s) => !only || s.repo === only);
  if (!sources.length) {
    console.log(only ? `${only} isn't in sources:` : "No sources: in catalogue.config.yml");
    return;
  }

  let failed = 0;
  for (const { repo } of sources) {
    try {
      const changes = importSource(repo, from ? localSource(from) : remoteSource(repo));
      console.log(`${repo}: ${changes.length ? "" : "unchanged"}`);
      for (const change of changes) console.log(`  ${change}`);
    } catch (error) {
      failed++;
      console.error(`✗ ${error.message}`);
    }
  }
  if (failed) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
