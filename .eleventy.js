const yaml = require("js-yaml");
const fs = require("fs");
const path = require("path");
const schema = require("./scripts/lib/schema");
const linkPreview = require("./scripts/lib/link-preview");

module.exports = function (eleventyConfig) {
  // The commit a build came from, stamped into every page so a deploy can be
  // checked against what's on main. CI provides GITHUB_SHA; locally, ask git.
  eleventyConfig.addGlobalData("build", () => {
    let commit = process.env.GITHUB_SHA || "";
    if (!commit) {
      try {
        commit = require("child_process").execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      } catch {}
    }
    return { commit: commit.slice(0, 7) };
  });

  // Load catalogue.config.yml as global data
  eleventyConfig.addGlobalData("site", () => {
    const config = yaml.load(fs.readFileSync("catalogue.config.yml", "utf8"));
    config.media_base_url =
      config.stack === "cloudflare"
        ? (config.cloudflare?.r2_media_base_url || "").replace(/\/$/, "")
        : "/media";

    // Mount points. Defaulted here rather than in templates because permalinks
    // are rendered by Liquid in .md entries and Nunjucks in .njk pages, and the
    // two disagree on filter syntax (`| default: x` vs `| default(x)`).
    // Normalizing once keeps every template engine-agnostic.
    const path = (value, fallback) => {
      const p = (value || fallback).trim();
      return p.endsWith("/") ? p : `${p}/`;
    };
    config.catalog_path = path(config.catalog_path, "/");
    config.entry_path = path(config.entry_path, "/p/");
    config.home_path = path(config.home_path, "/");
    config.nav = Array.isArray(config.nav) ? config.nav : [];
    config.categories = schema.categories(config);
    config.link_kinds = schema.linkKinds(config);

    return config;
  });

  // Resolve a media src to a root-relative or absolute URL
  eleventyConfig.addFilter("mediaUrl", function (src) {
    if (!src) return "";
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    const base = (this.ctx?.site?.media_base_url || "/media").replace(/\/$/, "");
    return `${base}/${src}`;
  });

  // Resolve a media src to a fully absolute URL (required for og:image)
  function absoluteMedia(src, site = {}) {
    if (!src) return "";
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    const siteUrl = (site.url || "").replace(/\/$/, "");
    if (!siteUrl) return "";
    const base = site.stack === "cloudflare"
      ? (site.cloudflare?.r2_media_base_url || "").replace(/\/$/, "")
      : `${siteUrl}/media`;
    return `${base}/${src}`;
  }
  eleventyConfig.addFilter("absoluteMediaUrl", function (src) {
    return absoluteMedia(src, this.ctx?.site);
  });

  // Everything a page tells link-preview crawlers, computed once per page for
  // _head.njk: title, one-line description, canonical URL, the 1200×630 card,
  // the icon. Images are rendered after the build (eleventy.after below).
  eleventyConfig.addFilter("linkPreview", function (page) {
    const ctx = this.ctx || {};
    const site = ctx.site || {};
    const preview = site.preview || {};
    const siteUrl = (site.url || "").replace(/\/$/, "");
    const absolute = (file) => (file ? `${siteUrl}/og/${file}` : "");
    const local = (src) => {
      if (!src || /^https?:\/\//.test(src)) return null;
      const file = path.join("media", src);
      return fs.existsSync(file) ? file : null;
    };
    const isEntry = Boolean(ctx.entry);
    const background = preview.background || "#f2f2f2";

    const description =
      (ctx.summary && linkPreview.summarize(ctx.summary, 300)) ||
      (ctx.description && linkPreview.summarize(ctx.description, 300)) ||
      (isEntry && linkPreview.summarize(linkPreview.readBody(page.inputPath))) ||
      linkPreview.summarize(site.description || "", 300);

    // The card: the entry's first still image, else the site's card.
    const still = (m) => m && /\.(png|jpe?g|webp|gif|avif|tiff?|svg)$/i.test(String(m.src || ""));
    const hero = isEntry && !["video", "audio"].includes(ctx.media_type) ? (ctx.media || []).find(still) || null : null;
    const heroFile = hero ? local(hero.src) : null;
    const siteIcon = site.icon && fs.existsSync(site.icon) ? site.icon : null;
    // og:image, for everyone but X: the entry's first image fitted to
    // 1200×630 with nothing added, else the site's card.
    let card = null;
    if (siteUrl) {
      card = heroFile
        ? { file: linkPreview.cardJob({ name: page.fileSlug, image: heroFile, background }), alt: hero.alt || ctx.title }
        : {
            file: preview.image && fs.existsSync(preview.image)
              ? linkPreview.cardJob({ name: "site", image: preview.image, background })
              : linkPreview.cardJob({
                  name: "site",
                  icon: siteIcon,
                  title: site.title,
                  wordmark: site.wordmark && fs.existsSync(site.wordmark) ? site.wordmark : null,
                  description: linkPreview.summarize(site.description || "", 160),
                  fonts: preview.fonts,
                  colors: preview.colors,
                }),
            alt: preview.image_alt || site.title,
          };
      card = card.file ? { ...card, url: absolute(card.file), ...linkPreview.CARD, type: "image/jpeg" } : null;
    }

    // twitter:image, for X only (_worker.js swaps it in for
    // Twitterbot): the entry's own og_image, else a card composed from its
    // assets. X shows a large card as the image alone, so the card carries the
    // title and description itself.
    let xCard = null;
    if (siteUrl && isEntry && ctx.og_image) {
      const src = String(ctx.og_image);
      const file = local(src);
      const size = (file && schema.imageSize(fs.readFileSync(file))) || linkPreview.CARD;
      xCard = { url: absoluteMedia(src, site), alt: ctx.og_image_alt || ctx.title, width: size.width, height: size.height };
    } else if (siteUrl && isEntry) {
      const macIcon = local(ctx.icon_macos);
      const squareIcon = local(ctx.icon);
      // Tags print as the site does: by label, when a tagLabel filter exists.
      const tagLabel = eleventyConfig.getFilter("tagLabel") || ((t) => t);
      const file = linkPreview.xCardJob({
        name: page.fileSlug,
        title: ctx.title,
        wordmark: local(ctx.wordmark),
        // The longer text fills the extra line; summarize() keeps whole
        // sentences where they fit and cuts at a word otherwise.
        description: linkPreview.summarize(ctx.summary || ctx.description || linkPreview.readBody(page.inputPath), 400),
        descriptionShort: linkPreview.summarize(description, 180),
        icon: macIcon || squareIcon,
        iconKind: macIcon ? "macos" : "square",
        iconShape: ctx.icon_shape,
        hero: heroFile,
        kicker: linkPreview.kickerText({ date: ctx.date, category: ctx.category, tags: ctx.tags, categories: site.categories }, tagLabel),
        siteWordmark: site.wordmark && fs.existsSync(site.wordmark) ? site.wordmark : null,
        siteTitle: site.title,
        fonts: preview.fonts,
        colors: preview.colors,
      });
      if (file) xCard = { url: absolute(file), alt: `${ctx.title}: ${linkPreview.summarize(description, 180)}`, ...linkPreview.CARD };
    }

    // The square art (icon) is preferred: iOS masks apple-touch-icons itself,
    // so a macOS icon's drawn shape would be masked twice. A macOS icon alone
    // is used whole, flattened onto the icon background.
    const entryIcon = isEntry ? local(ctx.icon) : null;
    const macIcon = isEntry && !entryIcon ? local(ctx.icon_macos) : null;
    const iconBackground = preview.icon_background || "#ffffff";
    const iconFile = entryIcon || macIcon
      ? linkPreview.iconJob({ name: page.fileSlug, icon: entryIcon || macIcon, background: iconBackground, inset: entryIcon && ctx.icon_shape === "none" ? 0.12 : 0 })
      : linkPreview.iconJob({ name: "site", icon: siteIcon, background: iconBackground });

    const postLayout = preview.post_layout !== false && Boolean(description);
    return {
      title: ctx.title || site.title,
      documentTitle: ctx.title ? `${ctx.title} — ${site.title}` : site.title,
      description,
      url: siteUrl && ctx.canonical !== false ? siteUrl + page.url : "",
      type: postLayout || isEntry ? "article" : "website",
      postLayout,
      image: card,
      xCard,
      icon: iconFile ? (siteUrl ? absolute(iconFile) : `/og/${iconFile}`) : "",
      themeColor: site.theme_color || site.accent_color || "",
    };
  });

  // Jobs are registered while pages render; start each build (and each
  // rebuild under --serve) with none, so stale ones aren't copied out.
  eleventyConfig.on("eleventy.before", () => linkPreview.jobs.clear());

  // `directories` carries a CLI --output; `dir` only the configured default.
  // A failed render fails a build; under --serve it is logged and the
  // server keeps running.
  eleventyConfig.on("eleventy.after", async ({ dir, directories, runMode }) => {
    const log = (msg) => console.warn(`[catalogue] ${msg}`);
    try {
      await linkPreview.renderAll(directories?.output || dir.output, { log });
    } catch (err) {
      if (runMode === "build" || !runMode) throw err;
    }
  });

  eleventyConfig.addCollection("entries", (api) => {
    return api.getFilteredByGlob("projects/*.md")
      .filter(e => !e.fileSlug.startsWith("_"));
  });

  // Entry dates are YYYY-MM or a bare YYYY. YAML reads a bare year as a
  // number, which Eleventy rejects as a page date, so map it to January 1st.
  eleventyConfig.addDateParsing((value) => {
    if (typeof value === "number" && Number.isInteger(value)) return new Date(Date.UTC(value, 0, 1));
    return undefined;
  });

  // Credits by GitHub login resolve against contributors.yml (see schema.js).
  const people = schema.contributors() || {};
  eleventyConfig.addFilter("resolveCredits", (credits) =>
    (credits || []).map((item) => schema.resolveCredit(item, people))
  );

  // A tag shows as its label from tags.base.yml or tags.yml.
  const tags = schema.tagVocabulary();
  eleventyConfig.addFilter("tagLabel", (tag) => tags.get(String(tag))?.label || tag);

  // How an entry's date reads: as written, YYYY-MM or YYYY.
  eleventyConfig.addFilter("entryDate", (value) =>
    value instanceof Date ? value.toISOString().slice(0, 7) : String(value ?? "")
  );

  // `links` in the order the site lists link kinds, with their labels.
  eleventyConfig.addFilter("entryLinks", function (links) {
    const kinds = this.ctx?.site?.link_kinds || schema.BUILTIN_LINK_KINDS;
    return Object.keys(kinds)
      .filter((kind) => links?.[kind])
      .map((kind) => ({ kind, label: kinds[kind].label, url: links[kind] }));
  });

  // The index, grouped by category in the configured order, newest first
  // within each group. Entries without a category join the first group.
  eleventyConfig.addCollection("entryGroups", (api) => {
    const config = yaml.load(fs.readFileSync("catalogue.config.yml", "utf8"));
    const groups = schema.categories(config).map((c) => ({ ...c, entries: [] }));
    const entries = api.getFilteredByGlob("projects/*.md").filter((e) => !e.fileSlug.startsWith("_"));
    const when = (e) => String(e.data.date instanceof Date ? e.data.date.toISOString() : e.data.date ?? "");
    for (const entry of entries.sort((a, b) => when(b).localeCompare(when(a)))) {
      (groups.find((g) => g.id === entry.data.category) || groups[0]).entries.push(entry);
    }
    return groups.filter((g) => g.entries.length);
  });

  // Old slugs listed in an entry's `formerly`, each redirected to the entry.
  eleventyConfig.addCollection("formerSlugs", (api) =>
    api.getFilteredByGlob("projects/*.md")
      .filter((e) => !e.fileSlug.startsWith("_"))
      .flatMap((e) => (e.data.formerly || []).map((from) => ({ from, to: e.url, title: e.data.title })))
  );

  // Pass through static assets
  eleventyConfig.addPassthroughCopy("media");
  eleventyConfig.addPassthroughCopy("styles");
  // Site chrome images (icons, logos). Unlike `media/`, these ship with the
  // site rather than living in R2 — they aren't catalogue content.
  if (fs.existsSync("img")) {
    eleventyConfig.addPassthroughCopy("img");
  }

  // An underscore prefix means "documentation, not a page". The entries
  // collection already filters these out of the index, but without this they
  // still get written to the output — `projects/_sample.md` has been publishing
  // itself as a real page.
  eleventyConfig.ignores.add("**/_*.md");

  // Cloudflare Pages worker that hands X its composed card (see _worker.js).
  // Other hosts serve these as plain files, which is harmless.
  eleventyConfig.addPassthroughCopy("_worker.js");
  eleventyConfig.addPassthroughCopy("_routes.json");

  // Host redirect rules, if the site has any (Cloudflare Pages / Netlify format)
  if (fs.existsSync("_redirects")) {
    eleventyConfig.addPassthroughCopy("_redirects");
  }

  // Watch for config and media changes
  eleventyConfig.addWatchTarget("catalogue.config.yml");
  eleventyConfig.addWatchTarget("media/");

  return {
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    // Ignore files that aren't pages
    templateFormats: ["md", "njk", "html"],
  };
};
