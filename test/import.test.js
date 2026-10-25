const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const fixtures = path.join(__dirname, "fixtures");
const scripts = path.join(__dirname, "..", "scripts");

function siteCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catalogue-"));
  fs.cpSync(path.join(fixtures, "site"), dir, { recursive: true });
  return dir;
}

function run(script, cwd, ...args) {
  return spawnSync("node", [path.join(scripts, script), ...args], { cwd, encoding: "utf8" });
}

const importGadget = (site, ...extra) =>
  run("import-entries.js", site, "--from", path.join(fixtures, "source", ".artifact"), "--repo", "you/gadget", "--commit", "abc1234", ...extra);

test("import writes the expected entry and media", () => {
  const site = siteCopy();
  const result = importGadget(site);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(
    fs.readFileSync(path.join(site, "projects", "gadget.md"), "utf8"),
    fs.readFileSync(path.join(fixtures, "expected-gadget.md"), "utf8")
  );
  assert.deepStrictEqual(fs.readdirSync(path.join(site, "media", "gadget")).sort(), ["hero.png", "icon.png"]);
  assert.ok(!fs.existsSync(path.join(site, "projects", "_draft.md")), "underscore files are skipped");
});

test("a second import changes nothing", () => {
  const site = siteCopy();
  importGadget(site);
  const again = importGadget(site);
  assert.match(again.stdout, /unchanged/);
});

test("import removes media the entry no longer uses", () => {
  const site = siteCopy();
  importGadget(site);
  fs.writeFileSync(path.join(site, "media", "gadget", "old.png"), "x");
  const result = importGadget(site);
  assert.match(result.stdout, /removed media\/gadget\/old.png/);
});

test("import won't replace a hand-written entry without --adopt", () => {
  const site = siteCopy();
  fs.writeFileSync(path.join(site, "projects", "gadget.md"), "---\ntitle: Mine\n---\n");
  assert.strictEqual(importGadget(site).status, 1);
  assert.strictEqual(importGadget(site, "--adopt").status, 0);
});

test("the checker passes a good source folder and warns on guesses", () => {
  const site = siteCopy();
  const result = run("check-entries.js", site, "--dir", path.join(fixtures, "source", ".artifact"));
  assert.strictEqual(result.status, 0, result.stdout);
  assert.match(result.stdout, /date is unconfirmed/);
});

test("the checker fails bad entries", () => {
  const site = siteCopy();
  fs.writeFileSync(
    path.join(site, "projects", "bad.md"),
    [
      "---",
      "title: Bad",
      "date: June 2024",
      "category: nope",
      "url: http://bad.example",
      "links:",
      "  app_store: https://example.com/app",
      "  myspace: https://myspace.com",
      "media:",
      "  - src: missing.png",
      "---",
      "",
    ].join("\n")
  );
  const result = run("check-entries.js", site);
  assert.strictEqual(result.status, 1);
  for (const message of [
    /date "June 2024" isn't YYYY or YYYY-MM/,
    /category "nope" isn't one of product, tool/,
    /url "http:\/\/bad.example" isn't https/,
    /links.app_store points at example.com/,
    /unknown links key "myspace"/,
    /missing.png doesn't exist/,
  ]) {
    assert.match(result.stdout, message);
  }
});

test("seeding writes an entry the importer reads back unchanged", () => {
  const site = siteCopy();
  importGadget(site);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
  const seeded = run("seed-entry.js", site, "gadget", repo);
  assert.strictEqual(seeded.status, 0, seeded.stderr);
  const folder = path.join(repo, ".artifact");
  assert.deepStrictEqual(fs.readdirSync(folder).sort(), ["README.md", "gadget.md", "hero.png", "icon.png"]);
  const roundTrip = run("import-entries.js", site, "--from", folder, "--repo", "you/gadget", "--commit", "abc1234");
  assert.match(roundTrip.stdout, /unchanged/);
});
