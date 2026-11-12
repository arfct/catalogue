const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const sharp = require("sharp");
const { summarize, plainText, kickerText } = require("../scripts/lib/link-preview");
const { FontStack } = require("../scripts/lib/font-stack");
const xCard = require("../scripts/lib/x-card");

const repo = path.join(__dirname, "..");

// ─── Descriptions ────────────────────────────────────────────────────────────

test("plainText drops Markdown and frontmatter and makes one line", () => {
  const md = "---\ntitle: x\n---\n# Heading\n\nA [link](https://x.y) and **bold**, *italic*, `code`.\n\n![img](a.png)\n- item <b>tag</b>";
  assert.strictEqual(plainText(md), "Heading A link and bold, italic, code. item tag");
});

test("summarize keeps whole sentences up to the limit", () => {
  const text = "First sentence is short. Second one is also short. " + "Third ".repeat(40) + "ends.";
  assert.strictEqual(summarize(text, 80), "First sentence is short. Second one is also short.");
});

test("summarize does not split on decimals", () => {
  assert.strictEqual(summarize("It rose 6.2 feet. Then it fell. " + "More ".repeat(40), 40), "It rose 6.2 feet. Then it fell.");
});

test("summarize cuts a long first sentence at a word boundary", () => {
  const out = summarize("word ".repeat(100), 50);
  assert.ok(out.length <= 50, out);
  assert.match(out, /^(word )+word…$/);
});

test("summarize never returns a newline", () => {
  assert.ok(!summarize("A line\nand another\n\nparagraph.\n").includes("\n"));
});

// ─── A real build ────────────────────────────────────────────────────────────

function buildSite({ ogImage, tags } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catalogue-lp-"));
  for (const f of [".eleventy.js", "_includes", "index.njk", "pages", "redirects.njk", "styles", "scripts", "_worker.js", "_routes.json"]) {
    fs.cpSync(path.join(repo, f), path.join(dir, f), { recursive: true });
  }
  fs.symlinkSync(path.join(repo, "node_modules"), path.join(dir, "node_modules"));
  fs.mkdirSync(path.join(dir, "projects"));
  fs.copyFileSync(path.join(repo, "projects", "projects.json"), path.join(dir, "projects", "projects.json"));
  fs.mkdirSync(path.join(dir, "media", "gadget"), { recursive: true });
  fs.mkdirSync(path.join(dir, "img"));
  fs.writeFileSync(
    path.join(dir, "catalogue.config.yml"),
    'title: Fixture & Co\ndescription: >\n  A catalogue\n  over two lines.\nauthor: X\naccent_color: "#336699"\nurl: https://example.com\nicon: img/icon.png\nstack: github-pages\n'
  );
  const entry = [
    "---",
    "title: Gadget",
    "date: 2024-01",
    tags ? `tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]` : null,
    "media:",
    "  - src: gadget/hero.png",
    "    alt: A tall \"red\" screenshot",
    ogImage ? `og_image: gadget/${ogImage}` : null,
    "---",
    "",
    "Gadget measures *things* & [counts](https://x.y) them. It has a second sentence that is long enough to go past the limit when combined with the first one, so only the first sentence survives in the description, which stops at two hundred characters.",
    "",
  ].filter((l) => l !== null).join("\n");
  fs.writeFileSync(path.join(dir, "projects", "gadget.md"), entry);
  return { dir, entry };
}

async function images(dir, ogImage) {
  await sharp({ create: { width: 600, height: 1200, channels: 3, background: "#cc2200" } }).png().toFile(path.join(dir, "media", "gadget", "hero.png"));
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(path.join(dir, "img", "icon.png"));
  if (ogImage) await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#0033cc" } }).png().toFile(path.join(dir, "media", "gadget", ogImage));
}

function runEleventy(dir, args = []) {
  const out = path.join(dir, "out"); // not the configured _site, so a CLI --output is honoured
  const result = spawnSync(process.execPath, [path.join(repo, "node_modules", "@11ty", "eleventy", "cmd.cjs"), `--output=${out}`, ...args], { cwd: dir, encoding: "utf8" });
  return { out, result };
}

function eleventy(dir, args) {
  const { out, result } = runEleventy(dir, args);
  assert.strictEqual(result.status, 0, result.stderr + result.stdout);
  return out;
}

const meta = (html, key) => {
  const m = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`));
  return m ? m[1] : null;
};
const link = (html, rel) => {
  const m = html.match(new RegExp(`<link rel="${rel}"[^>]* href="([^"]*)"`));
  return m ? m[1] : null;
};

test("an entry gets its own title, description, card, icon and canonical URL", async () => {
  const { dir } = buildSite();
  await images(dir);
  const out = eleventy(dir);
  const html = fs.readFileSync(path.join(out, "p", "gadget", "index.html"), "utf8");

  assert.strictEqual(meta(html, "og:title"), "Gadget");
  assert.strictEqual(meta(html, "og:site_name"), "Fixture &amp; Co");
  assert.strictEqual(meta(html, "og:description"), "Gadget measures things &amp; counts them.");
  assert.strictEqual(meta(html, "og:url"), "https://example.com/p/gadget/");
  assert.strictEqual(link(html, "canonical"), "https://example.com/p/gadget/");
  assert.strictEqual(meta(html, "og:type"), "article");
  assert.ok(html.includes('<link rel="alternate" type="application/activity+json" href="">'));
  assert.strictEqual(meta(html, "theme-color"), "#336699");
  assert.strictEqual(meta(html, "og:image:width"), "1200");
  assert.strictEqual(meta(html, "og:image:height"), "630");
  assert.strictEqual(meta(html, "og:image:type"), "image/jpeg");
  assert.strictEqual(meta(html, "og:image:alt"), "A tall &quot;red&quot; screenshot");
  assert.strictEqual(meta(html, "twitter:card"), "summary_large_image");

  const image = meta(html, "og:image");
  assert.match(image, /^https:\/\/example\.com\/og\/gadget\.[0-9a-f]{10}\.jpg$/);
  const file = path.join(out, new URL(image).pathname);
  const info = await sharp(file).metadata();
  assert.deepStrictEqual([info.width, info.height, info.format], [1200, 630, "jpeg"]);
  assert.ok(fs.statSync(file).size < 600 * 1024);

  const icon = link(html, "apple-touch-icon");
  assert.strictEqual(link(html, "icon"), icon);
  const iconInfo = await sharp(path.join(out, new URL(icon).pathname)).metadata();
  assert.deepStrictEqual([iconInfo.width, iconInfo.height, iconInfo.hasAlpha], [180, 180, false]);
});

test("the index gets the site's description, on one line, and a generated site card", async () => {
  const { dir } = buildSite();
  await images(dir);
  const out = eleventy(dir);
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  assert.strictEqual(meta(html, "og:title"), "Fixture &amp; Co");
  assert.strictEqual(meta(html, "og:description"), "A catalogue over two lines.");
  assert.match(meta(html, "og:image"), /^https:\/\/example\.com\/og\/site\.[0-9a-f]{10}\.jpg$/);
  assert.strictEqual(link(html, "canonical"), "https://example.com/");
  const notFound = fs.readFileSync(path.join(out, "404.html"), "utf8");
  assert.strictEqual(link(notFound, "canonical"), null, "the 404 page names no canonical URL");
});

test("an entry's own og_image replaces the composed X card, not og:image", async () => {
  const { dir } = buildSite({ ogImage: "card.png" });
  await images(dir, "card.png");
  const out = eleventy(dir);
  const html = fs.readFileSync(path.join(out, "p", "gadget", "index.html"), "utf8");
  assert.strictEqual(meta(html, "catalogue:x-image"), "https://example.com/media/gadget/card.png");
  assert.strictEqual(meta(html, "catalogue:x-image:width"), "1200");
  assert.match(meta(html, "og:image"), /\/og\/gadget\.[0-9a-f]{10}\.jpg$/);
  assert.ok(!fs.readdirSync(path.join(out, "og")).some((f) => f.startsWith("gadget-x.")), "no X card composed for it");
});

test("an entry gets a composed X card, and no twitter:image in the static HTML", async () => {
  const { dir } = buildSite();
  await images(dir);
  const out = eleventy(dir);
  const html = fs.readFileSync(path.join(out, "p", "gadget", "index.html"), "utf8");
  assert.strictEqual(meta(html, "twitter:image"), null);
  const card = meta(html, "catalogue:x-image");
  assert.match(card, /^https:\/\/example\.com\/og\/gadget-x\.[0-9a-f]{10}\.jpg$/);
  const file = path.join(out, new URL(card).pathname);
  const info = await sharp(file).metadata();
  assert.deepStrictEqual([info.width, info.height], [1200, 630]);
  assert.ok(fs.statSync(file).size < 600 * 1024);
  assert.ok(fs.existsSync(path.join(out, "_worker.js")) && fs.existsSync(path.join(out, "_routes.json")));
});

test("the worker hands the X card to Twitterbot only", async () => {
  const { default: worker } = await import(path.join(repo, "_worker.js"));
  const page = '<html><head><meta property="og:image" content="hero.jpg"><meta name="catalogue:x-image" content="card.jpg"></head></html>';
  // A regex stand-in for Cloudflare's HTMLRewriter: it covers the user-agent
  // rule and the renaming, not the CSS selector, which is checked live.
  globalThis.HTMLRewriter ??= class {
    on(selector, handler) { this.handler = handler; return this; }
    async transform(response) {
      const text = (await response.text()).replace(/<meta name="(catalogue:x-[^"]*)"/g, (m, name) => {
        let renamed = name;
        this.handler.element({ getAttribute: () => name, setAttribute: (_, v) => { renamed = v; } });
        return `<meta name="${renamed}"`;
      });
      return new Response(text, response);
    }
  };
  const env = { ASSETS: { fetch: async () => new Response(page, { headers: { "content-type": "text/html" } }) } };
  const fetchAs = async (ua) => (await worker.fetch(new Request("https://example.com/p/x/", { headers: { "user-agent": ua } }), env)).text();
  assert.match(await fetchAs("Twitterbot/1.0"), /name="twitter:image" content="card.jpg"/);
  assert.match(await fetchAs("Mozilla/5.0 (compatible; Twitterbot/1.0)"), /name="twitter:image"/);
  const imessage = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0";
  for (const ua of [imessage, "facebookexternalhit/1.1 Facebot Twitterbot/1.0", "Mozilla/5.0 AppleWebKit/605.1.15 Twitterbot/1.0", "TelegramBot (like TwitterBot)", "Slackbot-LinkExpanding 1.0", "Mozilla/5.0 (compatible; Discordbot/2.0)", "facebookexternalhit/1.1"]) {
    assert.doesNotMatch(await fetchAs(ua), /twitter:image/, ua);
  }
});

// ─── The checker ─────────────────────────────────────────────────────────────

function check(dir) {
  return spawnSync(process.execPath, [path.join(dir, "scripts", "check-entries.js")], { cwd: dir, encoding: "utf8" });
}

test("check is quiet when og_image is absent and errors when it's the wrong size", async () => {
  const absent = buildSite();
  await images(absent.dir);
  assert.doesNotMatch(check(absent.dir).stdout, /og_image/);

  const wrong = buildSite({ ogImage: "card.png" });
  await images(wrong.dir);
  await sharp({ create: { width: 1000, height: 630, channels: 3, background: "#000" } }).png().toFile(path.join(wrong.dir, "media", "gadget", "card.png"));
  const result = check(wrong.dir);
  assert.strictEqual(result.status, 1);
  assert.match(result.stdout, /og_image gadget\/card\.png is 1000×630; it must be 1200×630/);

  const missing = buildSite({ ogImage: "nope.png" });
  await images(missing.dir);
  assert.match(check(missing.dir).stdout, /og_image gadget\/nope\.png doesn't exist/);

  const right = buildSite({ ogImage: "card.png" });
  await images(right.dir, "card.png");
  assert.doesNotMatch(check(right.dir).stdout, /og_image/);
});

// ─── macOS icons ─────────────────────────────────────────────────────────────

// A macOS-style icon: a rounded shape on a transparent 1024 canvas.
function macIcon(file, { opaque = false, size = 1024 } = {}) {
  const shape = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    ${opaque ? `<rect width="${size}" height="${size}" fill="#fff"/>` : ""}
    <rect x="${size * 0.1}" y="${size * 0.1}" width="${size * 0.8}" height="${size * 0.8}" rx="${size * 0.18}" fill="#2a6"/></svg>`;
  return sharp(Buffer.from(shape)).png().toFile(file);
}

test("import carries icon-macos.png into icon_macos", async () => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), "catalogue-mac-"));
  fs.cpSync(path.join(__dirname, "fixtures", "site"), site, { recursive: true });
  const from = fs.mkdtempSync(path.join(os.tmpdir(), "catalogue-mac-src-"));
  fs.cpSync(path.join(__dirname, "fixtures", "source", ".artifact"), from, { recursive: true });
  await macIcon(path.join(from, "icon-macos.png"));
  const result = spawnSync(process.execPath, [path.join(repo, "scripts", "import-entries.js"), "--from", from, "--repo", "you/gadget", "--commit", "abc1234"], { cwd: site, encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  const entry = fs.readFileSync(path.join(site, "projects", "gadget.md"), "utf8");
  assert.match(entry, /\nicon: gadget\/icon\.png\nicon_macos: gadget\/icon-macos\.png\n/);
  assert.ok(fs.existsSync(path.join(site, "media", "gadget", "icon-macos.png")));
});

test("an entry with icon_macos shows it unmasked; the preview icon uses the square art", async () => {
  const { dir } = buildSite();
  await images(dir);
  await macIcon(path.join(dir, "media", "gadget", "icon-macos.png"));
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#2a6" } }).png().toFile(path.join(dir, "media", "gadget", "icon.png"));
  const file = path.join(dir, "projects", "gadget.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("media:", "icon: gadget/icon.png\nicon_macos: gadget/icon-macos.png\nmedia:"));
  const out = eleventy(dir);
  const html = fs.readFileSync(path.join(out, "p", "gadget", "index.html"), "utf8");
  assert.match(html, /class="entry__icon app-icon app-icon--macos" src="\/media\/gadget\/icon-macos\.png"/);
  assert.doesNotMatch(html, /app-icon--squircle/);
  const index = fs.readFileSync(path.join(out, "index.html"), "utf8");
  assert.match(index, /app-icon--macos" src="\/media\/gadget\/icon-macos\.png"/);
  assert.match(link(html, "apple-touch-icon"), /\/og\/gadget-icon\.[0-9a-f]{10}\.png$/);
});

test("check holds icon-macos to a transparent 1024 square", async () => {
  const setup = async (opts) => {
    const { dir } = buildSite({ ogImage: "card.png" });
    await images(dir, "card.png");
    await macIcon(path.join(dir, "media", "gadget", "icon-macos.png"), opts);
    const file = path.join(dir, "projects", "gadget.md");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("media:", "icon_macos: gadget/icon-macos.png\nmedia:"));
    return check(dir);
  };
  const good = await setup();
  assert.doesNotMatch(good.stdout, /icon-macos|alpha channel/, good.stdout);
  const opaque = await setup({ opaque: true });
  assert.strictEqual(opaque.status, 1);
  assert.match(opaque.stdout, /icon-macos has opaque corners/);
  const small = await setup({ size: 256 });
  assert.match(small.stdout, /icon-macos is 256px; use 1024 \(512 minimum\)/);
});

// ─── Failed renders ──────────────────────────────────────────────────────────

test("a preview image that can't be rendered fails the build, naming the file and why", async () => {
  const { dir } = buildSite();
  await images(dir);
  fs.writeFileSync(path.join(dir, "media", "gadget", "hero.png"), "not a png");
  const { result } = runEleventy(dir);
  assert.notStrictEqual(result.status, 0, "the build must fail");
  const output = result.stderr + result.stdout;
  assert.match(output, /could not render gadget\.[0-9a-f]{10}\.jpg from media\/gadget\/hero\.png: .*unsupported image format/i);
});

test("a video as the first media item is skipped for the card, not rendered", async () => {
  const { dir } = buildSite();
  await images(dir);
  fs.writeFileSync(path.join(dir, "media", "gadget", "clip.mp4"), "not an image");
  const file = path.join(dir, "projects", "gadget.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("media:\n", "media:\n  - src: gadget/clip.mp4\n    alt: A clip\n"));
  const out = eleventy(dir);
  const html = fs.readFileSync(path.join(out, "p", "gadget", "index.html"), "utf8");
  assert.strictEqual(meta(html, "og:image:alt"), "A tall &quot;red&quot; screenshot");
});

// ─── Text the main font can't draw ───────────────────────────────────────────

const inter = (weight) => require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`);
const MIXED = "Bubbles of random 🍌🍓🍊🍇 on a gradient of · Erdős Łódź → 日本語 ﬁ H₂O 👨\u200D👩\u200D👧 \u{10FFFD}end";

test("characters outside Inter's latin subset come from fallback fonts, glyph by glyph", async () => {
  const stack = await new FontStack(inter(400)).prepare(MIXED);
  const clean = stack.clean(MIXED);
  for (const ch of clean) {
    if (ch === " ") continue;
    assert.ok(stack.fontFor(ch), `no font draws ${ch} (U+${ch.codePointAt(0).toString(16)})`);
  }
  for (const ch of ["🍌", "🍓", "🍊", "🍇", "ő", "Ł", "→", "日", "本", "語", "👨", "👧"]) assert.ok(clean.includes(ch), `${ch} kept`);
  const from = (ch) => stack.fontFor(ch).names.fontFamily.en;
  assert.match(from("ő"), /Inter/);
  assert.match(from("→"), /Noto Sans Math/);
  assert.match(from("日"), /Noto Sans SC/);
  assert.match(from("🍌"), /Noto Emoji/);
  // Compatibility forms stand in where they draw; anything else goes, with
  // its space, and joiners leave nothing behind.
  assert.ok(clean.includes(" H2O "), clean); // no font has ₂: its compatibility form
  assert.ok(/ (ﬁ|fi) /.test(clean), clean);
  assert.ok(!clean.includes("\u{10FFFD}") && !clean.includes("\u200D"), clean);
  assert.ok(clean.endsWith(" end") && !clean.includes("  "), clean);
});

test("the X card draws those characters without .notdef boxes", async () => {
  const fonts = { title: inter(600), text: inter(400), label: inter(500) };
  const job = { title: "Erdős → 日本", kicker: "2024 · Łódź", description: MIXED, fonts };
  // Every glyph path the card draws comes from a real glyph, never index 0.
  const stack = await new FontStack(inter(400)).prepare(MIXED);
  for (const run of stack.runs(stack.clean(MIXED))) {
    for (const ch of run.text) if (ch !== " ") assert.ok(run.font.charToGlyphIndex(ch) > 0, ch);
  }
  const png = await xCard.renderXCard(sharp, job);
  const info = await sharp(png).metadata();
  assert.deepStrictEqual([info.width, info.height], [1200, 630]);
});

// ─── The kicker ──────────────────────────────────────────────────────────────

test("the X card's kicker shows tags by label, after the year and any category", () => {
  const labels = new Map([["wear-os", "Wear OS"], ["watch-face", "Watch face"]]);
  const label = (t) => labels.get(t) || t;
  assert.strictEqual(kickerText({ date: "2026-03", tags: ["wear-os", "watch-face", "time"] }, label), "2026 · Wear OS · Watch face · time");
  assert.strictEqual(kickerText({ date: new Date(Date.UTC(2020, 6, 1)), category: "tool", categories: [{ id: "product" }, { id: "tool" }], tags: ["wear-os"] }, label), "2020 · tool · Wear OS");
  assert.strictEqual(kickerText({ date: 2019, category: "product", categories: [{ id: "product" }, { id: "tool" }], tags: [] }), "2019");
});

test("the build passes tags through the site's tagLabel filter for the X card", async () => {
  const xImage = async ({ tags, label }) => {
    const { dir } = buildSite({ tags });
    await images(dir);
    // A config that adds a tagLabel filter around the real one.
    fs.writeFileSync(
      path.join(dir, "labelled.eleventy.js"),
      `const base = require("./.eleventy.js");\nmodule.exports = (c) => { const r = base(c); c.addFilter("tagLabel", (t) => (${JSON.stringify(label || {})})[t] || t); return r; };\n`
    );
    const out = eleventy(dir, ["--config=labelled.eleventy.js"]);
    return meta(fs.readFileSync(path.join(out, "p", "gadget", "index.html"), "utf8"), "catalogue:x-image");
  };
  // The card's file name hashes its inputs, the kicker among them: a tag
  // shown by label renders the same card as that label written out.
  const labelled = await xImage({ tags: ["wear-os"], label: { "wear-os": "Wear OS" } });
  const written = await xImage({ tags: ["Wear OS"] });
  const raw = await xImage({ tags: ["wear-os"] });
  assert.strictEqual(labelled, written);
  assert.notStrictEqual(labelled, raw);
});

// ─── EXIF orientation ────────────────────────────────────────────────────────

test("a photo stored sideways with an EXIF orientation is turned upright", async () => {
  const { dir } = buildSite();
  await images(dir);
  // Stored 1200×600 (a 1.91:1-ish card shape), tagged "rotate 90°": it
  // displays 600×1200, so the card letterboxes it instead of filling.
  const hero = path.join(dir, "media", "gadget", "hero.jpg");
  await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#cc2200" } }).jpeg().withMetadata({ orientation: 6 }).toFile(hero);
  assert.deepStrictEqual(await xCard.displaySize(sharp, hero), { width: 600, height: 1200 });
  const file = path.join(dir, "projects", "gadget.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("gadget/hero.png", "gadget/hero.jpg"));
  const out = eleventy(dir);
  const html = fs.readFileSync(path.join(out, "p", "gadget", "index.html"), "utf8");
  const card = path.join(out, new URL(meta(html, "og:image")).pathname);
  const { data, info } = await sharp(card).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
  // Left edge is the letterbox background (#f2f2f2), the middle is the photo.
  assert.ok(px(20, 315).every((v) => v > 230), `edge ${px(20, 315)}`);
  assert.ok(px(600, 315)[0] > 180 && px(600, 315)[1] < 80, `centre ${px(600, 315)}`);
  // The X card fits it upright too: a tall image in the 630 square.
  const x = path.join(out, new URL(meta(html, "catalogue:x-image")).pathname);
  const xd = await sharp(x).raw().toBuffer({ resolveWithObject: true });
  const xpx = (px2, py) => [...xd.data.subarray((py * 1200 + px2) * 3, (py * 1200 + px2) * 3 + 3)];
  assert.ok(xpx(700, 315).every((v) => v > 230), `x card beside a tall photo ${xpx(700, 315)}`);
});
