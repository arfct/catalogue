# Working on this catalogue

This file is for AI agents (Claude Code, or any agent that reads AGENTS.md)
helping someone build their catalogue. If you're a person reading this: open
this repo in Claude Code and ask — it will read this file and walk you through
every step.

## What this is

An Eleventy static site: a browsable index of projects, a detail page per
project, and any number of standalone pages around them. Each project is one
Markdown file in `projects/` with YAML frontmatter. No database, no CMS.

Where things live is set in `catalogue.config.yml`. The defaults put the index
at `/` and entries at `/p/<slug>/`; a fork can mount the catalogue elsewhere
(`catalog_path`, `entry_path`) so that a homepage page owns `/`.

## Standalone pages

`pages/` holds prose pages that sit alongside the catalogue — an about page, a
contact page, a privacy policy. `pages/_sample.md` documents the format.
Frontmatter beyond `title` and `description`:

- `permalink` — defaults to `/<filename>/`.
- `fonts` — list of Google Fonts css2 family specs to load on that page only.
- `script` — bundles `scripts/pages/<name>.js` to `/js/<name>.js` via esbuild
  and loads it as a module. Needed for anything importing an npm package,
  since Eleventy does not bundle.
- `bare: true` — skip the header, footer, and `<main>` wrapper entirely, for a
  page that owns its whole viewport (a custom homepage).
- `body_class` — a class on `<body>`, so page-specific CSS can be scoped.

Pages never appear in navigation automatically. Add them to `nav:` in
`catalogue.config.yml` to link them; leaving one out is how it stays unlisted.

`pages/404.njk` builds to `/404.html`, which hosts serve for unmatched paths.
Don't delete it: without it Cloudflare Pages falls back to `/index.html` and
returns HTTP 200, turning every mistyped URL into a soft 404.

## Ground rules

- `projects/_sample.md` is the canonical entry format. Read it before writing
  an entry. It is deliberately unpublished (the `_` prefix excludes it) —
  never delete it.
- `catalogue.config.yml` holds the site title, description, accent color, and
  the `stack:` choice. Read it before doing anything stack-dependent.
- `styles/main.css` is the theme; put per-site changes in `styles/custom.css`
  so template updates merge cleanly.
- Every entry needs a `status`: `released`, `beta`, `wip` or `retired`
  (definitions in `projects/_sample.md`). If you don't know it, write `wip`
  and list `status` in `unconfirmed` until the owner confirms. Every card but
  a released one shows its status, so a wrong status shows on the index.
- Tags come from `tags.base.yml` (template-owned; don't edit it in a site)
  and the site's `tags.yml`. Before adding a tag, read README "Tags": it must
  group two or more entries and describe the work, not the stack or license.
- Don't commit, push, or deploy unless asked.

## Entries from other repos

An entry can live in the repo of the project it describes, in a hidden
`.artifact/` folder at that repo's root (`source_dir` in the config).
Repos listed under `sources:` are imported with `npm run import`. Imported
files in `projects/` carry `source:`; never edit them here, because the next
import overwrites them. Change them in their repo instead. The README's
"Entries from other repos" section has the commands. Dot folders are skipped
by most search tools (ripgrep included), so look in `.artifact/` directly.

## Link previews

Every page carries Open Graph and Twitter tags (README "Link previews"). The
build renders the preview images with sharp into `/og/` (cached in `.cache/og/`,
which is gitignored): each entry's first image fitted to 1200×630 for
`og:image`, and a composed card for X, which `_worker.js` (a Cloudflare Pages
worker) serves as `twitter:image` to Twitterbot only. The entry fields that
feed them are `summary` (the one-line description), `icon` / `icon_macos`,
`wordmark` and `og_image` (an entry's own X card, 1200×630; optional, since the
composed card is the default). They need `url:` in the config. A preview image
that can't be rendered fails `npm run build`, naming the file and the reason;
fix or replace that file. Text on the cards is drawn from fonts, with
fallbacks for other scripts and emoji; a character no font has is dropped.

## Common tasks

**Check entries** — `npm run check` after any change to `projects/`, and
`npm run check -- --remote` before publishing (it fetches every link).

**Add a project** — use the `new-project` skill (`.claude/skills/new-project/`).
It covers gathering facts from a repo, folder, or interview; writing the entry
in the site's voice; and sourcing media.

**First-time setup** — walk the user through the README's setup for their
chosen stack, one step at a time. Steps that happen on github.com or
dash.cloudflare.com (forking, enabling Pages, creating buckets and tokens)
are theirs to do in the browser; be specific about where to click and verify
each step landed before moving on.

**Change the look** — edit `catalogue.config.yml` for title/description/accent
color; `styles/custom.css` for CSS. Templates live in `_includes/` (layout,
entry page, head) and `index.njk` (the index grid).

**Preview** — `npm install` once, then `npm run dev` and open
`http://localhost:8080`. Verify both the index card and the entry page after
any content change.

## Publishing (by stack, from `catalogue.config.yml`)

- `github-pages` — push to `main`; the workflow in `.github/workflows/`
  rebuilds and republishes automatically. Media in `media/` is served straight
  from the repo.
- `cloudflare` — media must be uploaded to R2 or it will 404 in production
  (`npm run sync`, which reads `cloudflare.r2_bucket`; or the R2 dashboard). Deploy the
  site with `npx wrangler pages deploy _site --project-name <name>` after
  `npm run build`. Push-to-deploy CI for this stack is planned but not yet
  shipped — don't assume a push published anything.

## Diagnosing problems

- Entry not appearing: filename starts with `_`, or it isn't in `projects/`.
- Import refuses an entry: `projects/<slug>.md` is hand-written (no `source:`);
  rerun with `--adopt` if the repo's copy should replace it.
- Images 404 in production on Cloudflare: media wasn't synced to R2.
- Build fails: `npm run build` locally shows the real error; frontmatter YAML
  is the usual suspect. `link preview: could not render <file> from <source>`
  means an entry's image (or icon, or wordmark) can't be read.
