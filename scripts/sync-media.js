#!/usr/bin/env node
// Uploads media/ to the configured R2 bucket via wrangler.
// Skips files that start with _ (placeholders).
// Usage: node scripts/sync-media.js

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const config = yaml.load(fs.readFileSync("catalogue.config.yml", "utf8"));
const bucket = config.cloudflare?.r2_bucket;

if (!bucket) {
  console.error("No cloudflare.r2_bucket set in catalogue.config.yml");
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return fs.statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk("media");

console.log(`Syncing ${files.length} files to r2://${bucket}`);

for (const file of files) {
  const key = file.replace(/^media\//, "");
  console.log(`  ${key}`);
  execSync(
    `npx wrangler r2 object put "${bucket}/${key}" --file "${file}" --remote`,
    { stdio: "inherit" }
  );
}

console.log("Done.");
