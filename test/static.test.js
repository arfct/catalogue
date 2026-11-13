const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const worker = import("../_worker.js");

test("www. redirects to the bare domain with path and query kept", async () => {
  const { default: w } = await worker;
  let assets = 0;
  const env = { ASSETS: { fetch: async () => { assets++; return new Response("ok", { headers: { "content-type": "text/plain" } }); } } };
  const r = await w.fetch(new Request("https://www.example.com/privacy?Chronograph"), env, {});
  assert.strictEqual(r.status, 301);
  assert.strictEqual(r.headers.get("location"), "https://example.com/privacy?Chronograph");
  const plain = await w.fetch(new Request("https://example.com/privacy"), env, {});
  assert.strictEqual(plain.status, 200);
  assert.strictEqual(assets, 1);
});

test("static/ is copied to the site root unprocessed", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "static-"));
  const root = path.join(__dirname, "..");
  for (const f of [".eleventy.js", "catalogue.config.yml", "tags.base.yml", "package.json"]) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  for (const d of ["_includes", "scripts", "pages", "styles"]) fs.cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  fs.copyFileSync(path.join(root, "index.njk"), path.join(dir, "index.njk"));
  fs.mkdirSync(path.join(dir, "projects"));
  fs.mkdirSync(path.join(dir, "static"));
  fs.writeFileSync(path.join(dir, "static", "privacy.html"), "<p>{{ not a template }}</p>\n");
  const { spawnSync } = require("child_process");
  const run = spawnSync(process.execPath, [path.join(root, "node_modules/@11ty/eleventy/cmd.cjs"), "--quiet"], { cwd: dir, encoding: "utf8", env: { ...process.env, NODE_PATH: path.join(root, "node_modules") } });
  assert.strictEqual(run.status, 0, run.stderr);
  assert.strictEqual(fs.readFileSync(path.join(dir, "_site", "privacy.html"), "utf8"), "<p>{{ not a template }}</p>\n");
  assert.ok(!fs.existsSync(path.join(dir, "_site", "static")));
});
