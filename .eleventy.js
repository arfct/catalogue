const yaml = require("js-yaml");
const fs = require("fs");
const schema = require("./scripts/lib/schema");

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
  eleventyConfig.addFilter("absoluteMediaUrl", function (src) {
    if (!src) return "";
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    const siteUrl = (this.ctx?.site?.url || "").replace(/\/$/, "");
    if (!siteUrl) return "";
    const base = this.ctx?.site?.stack === "cloudflare"
      ? (this.ctx?.site?.cloudflare?.r2_media_base_url || "").replace(/\/$/, "")
      : `${siteUrl}/media`;
    return `${base}/${src}`;
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
