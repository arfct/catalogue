const test = require("node:test");
const assert = require("node:assert");
const schema = require("../scripts/lib/schema");

const people = { dps: { name: "David Singleton", url: "https://example.com/dps" } };

test("a login resolves to its contributors.yml name and link", () => {
  assert.deepStrictEqual(schema.resolveCredit("dps", people), {
    github: "dps",
    name: "David Singleton",
    url: "https://example.com/dps",
  });
});

test("an unlisted login shows as itself, linked to GitHub", () => {
  assert.deepStrictEqual(schema.resolveCredit("liquidx", people), {
    github: "liquidx",
    name: "liquidx",
    url: "https://github.com/liquidx",
  });
});

test("a login object keeps its role", () => {
  const credit = schema.resolveCredit({ github: "dps", role: "Engineering" }, people);
  assert.strictEqual(credit.name, "David Singleton");
  assert.strictEqual(credit.role, "Engineering");
});

test("a name-only credit passes through unchanged", () => {
  const item = { name: "Ada Lovelace", role: "Photography" };
  assert.deepStrictEqual(schema.resolveCredit(item, people), item);
});

test("GitHub logins are validated", () => {
  assert.ok(schema.GITHUB_LOGIN.test("dps"));
  assert.ok(schema.GITHUB_LOGIN.test("a-b1"));
  assert.ok(!schema.GITHUB_LOGIN.test("David Singleton"));
  assert.ok(!schema.GITHUB_LOGIN.test("-dps"));
});
