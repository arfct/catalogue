const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const schema = require("../scripts/lib/schema");

const root = path.join(__dirname, "..");

function check(frontmatter) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "status-"));
  fs.writeFileSync(path.join(dir, "thing.md"), `---\ntitle: Thing\ndate: 2024-06\n${frontmatter}---\n\nA thing.\n`);
  const run = spawnSync(process.execPath, ["scripts/check-entries.js", "--dir", dir], { cwd: root, encoding: "utf8" });
  return run.stdout + run.stderr;
}

test("statuses are listed released first, retired last", () => {
  assert.deepStrictEqual(schema.STATUS_ORDER, ["released", "beta", "wip", "retired"]);
});

test("the checker warns on a missing status and errors on an unknown one", () => {
  assert.match(check(""), /missing status/);
  assert.match(check("status: shipped\n"), /status "shipped" isn't one of/);
  assert.doesNotMatch(check("status: beta\n"), /status/);
});

test("status is written after date", () => {
  const text = schema.formatEntry({ tags: [], status: "beta", date: "2024-06", title: "Thing" }, "Body.\n");
  assert.ok(text.indexOf("date:") < text.indexOf("status:") && text.indexOf("status:") < text.indexOf("tags:"));
});
