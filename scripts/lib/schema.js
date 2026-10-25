// What an entry may contain, shared by the build (.eleventy.js), the checker
// and the importer so the three can't drift apart.

const fs = require("fs");
const yaml = require("js-yaml");

const CONFIG_FILE = "catalogue.config.yml";

// Built-in `links` keys, in the order the entry page lists them. `hosts`
// limits where a link may point; an empty list allows any https URL.
const BUILTIN_LINK_KINDS = {
  app: { label: "Web app", hosts: [] },
  app_store: { label: "App Store", hosts: ["apps.apple.com"] },
  mac_app_store: { label: "Mac App Store", hosts: ["apps.apple.com"] },
  testflight: { label: "TestFlight", hosts: ["testflight.apple.com"] },
  play: { label: "Google Play", hosts: ["play.google.com"] },
  play_testing: { label: "Google Play testing", hosts: ["play.google.com"] },
  chrome_web_store: { label: "Chrome Web Store", hosts: ["chromewebstore.google.com", "chrome.google.com"] },
  source: { label: "Source", hosts: [] },
};

// A tag that says the product runs somewhere with a store, mapped to the links
// that would let a visitor get it there. Used only to warn.
const STORE_TAGS = {
  ios: ["app_store", "testflight"],
  ipados: ["app_store", "testflight"],
  macos: ["mac_app_store", "app_store", "testflight"],
  visionos: ["app_store", "testflight"],
  android: ["play", "play_testing"],
  "wear-os": ["play", "play_testing"],
  "browser-extension": ["chrome_web_store"],
};

const ICON_SHAPES = ["squircle", "circle", "none"];

function loadConfig(file = CONFIG_FILE) {
  return yaml.load(fs.readFileSync(file, "utf8")) || {};
}

function linkKinds(config) {
  return { ...BUILTIN_LINK_KINDS, ...(config.link_kinds || {}) };
}

// `categories` may be a list of ids or of {id, label}. A site that sets none
// has one implicit category, so entries never need the field.
function categories(config) {
  const list = config.categories?.length ? config.categories : [{ id: "project", label: "Projects" }];
  return list.map((c) => (typeof c === "string" ? { id: c, label: c[0].toUpperCase() + c.slice(1) } : c));
}

// `tags.yml` is optional: a list of tags, or a map of groups to lists.
function tagVocabulary(file = "tags.yml") {
  if (!fs.existsSync(file)) return null;
  const data = yaml.load(fs.readFileSync(file, "utf8"));
  const tags = Array.isArray(data) ? data : Object.values(data || {}).flat();
  return new Set(tags.map(String));
}

function sourceDir(config) {
  return (config.source_dir || ".artifact").replace(/\/$/, "");
}

// Split a Markdown file into its frontmatter object and body text. The body is
// returned exactly as written so imports never reflow an author's prose.
function parseEntry(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error("no frontmatter block");
  return { data: yaml.load(match[1]) || {}, body: match[2] };
}

// The order fields are written in, matching projects/_sample.md. Anything else
// follows, in the order the author wrote it.
const FIELD_ORDER = [
  "title", "date", "category", "tags", "url", "links", "media", "media_type", "icon", "icon_shape",
  "client", "role", "credits", "formerly", "unconfirmed", "source", "source_commit",
];

function formatEntry(data, body, header) {
  const ordered = {};
  for (const key of FIELD_ORDER) if (data[key] !== undefined) ordered[key] = data[key];
  for (const key of Object.keys(data)) if (!(key in ordered)) ordered[key] = data[key];
  const front = yaml.dump(ordered, { lineWidth: -1, noRefs: true, quotingType: '"' });
  return `---\n${header ? `# ${header}\n` : ""}${front}---\n${body}`;
}

// Width and height of a PNG or JPEG from its header bytes, without decoding.
function imageSize(buffer) {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), alpha: [4, 6].includes(buffer[25]) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), alpha: false };
      }
      offset += 2 + length;
    }
  }
  return null;
}

const ICON_FILES = (slug) => [`${slug}.icon.png`, `${slug}.icon.svg`, "icon.png", "icon.svg"];

module.exports = {
  BUILTIN_LINK_KINDS,
  STORE_TAGS,
  ICON_SHAPES,
  ICON_FILES,
  loadConfig,
  linkKinds,
  categories,
  tagVocabulary,
  sourceDir,
  parseEntry,
  formatEntry,
  imageSize,
};
