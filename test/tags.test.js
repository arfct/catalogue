const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const schema = require("../scripts/lib/schema");

function siteFile(text) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tags-")), "tags.yml");
  fs.writeFileSync(file, text);
  return file;
}

test("the base tags load with their labels and groups", () => {
  const tags = schema.tagVocabulary({ site: null });
  assert.deepStrictEqual(tags.get("wear-os"), { label: "Wear OS", group: "platform" });
  assert.strictEqual(tags.get("time").group, "subject");
  assert.ok(!tags.has("open-source"));
});

test("a site's tags.yml adds to the base tags", () => {
  const tags = schema.tagVocabulary({ site: siteFile("subject:\n  music: Music\n") });
  assert.deepStrictEqual(tags.get("music"), { label: "Music", group: "subject" });
  assert.ok(tags.has("web"));
});

test("a tags.yml in the old list shapes still loads", () => {
  assert.strictEqual(schema.tagVocabulary({ site: siteFile("- zine\n") }).get("zine").label, "zine");
  assert.strictEqual(schema.tagVocabulary({ site: siteFile("media: [zine]\n") }).get("zine").group, "media");
});
