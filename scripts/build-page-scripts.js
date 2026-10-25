#!/usr/bin/env node
// Bundles scripts/pages/<name>.js to _site/js/<name>.js for pages that set
// `script: <name>`. Bundling lets a page import bare specifiers (an npm
// package) that browsers can't resolve. No page scripts means nothing to do,
// so a site that doesn't use them needs no esbuild install.

const fs = require("fs");
const path = require("path");

const dir = "scripts/pages";
const entries = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => path.join(dir, f))
  : [];

if (entries.length === 0) process.exit(0);

require("esbuild")
  .build({ entryPoints: entries, bundle: true, format: "esm", minify: true, outdir: "_site/js" })
  .catch(() => process.exit(1));
