# Working on this catalogue

This file is for AI agents (Claude Code, or any agent that reads AGENTS.md)
helping someone build their catalogue. If you're a person reading this: open
this repo in Claude Code and ask — it will read this file and walk you through
every step.

## What this is

An Eleventy static site: a browsable index of projects at `/`, a detail page
per project at `/p/<slug>/`. Each project is one Markdown file in `projects/`
with YAML frontmatter. No database, no CMS.

## Ground rules

- `projects/_sample.md` is the canonical entry format. Read it before writing
  an entry. It is deliberately unpublished (the `_` prefix excludes it) —
  never delete it.
- `catalogue.config.yml` holds the site title, description, accent color, and
  the `stack:` choice. Read it before doing anything stack-dependent.
- `styles/main.css` is the theme; put per-site changes in `styles/custom.css`
  so template updates merge cleanly.
- Don't commit, push, or deploy unless asked.

## Common tasks

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
  (`npm run sync` if the fork has it; otherwise the R2 dashboard). Deploy the
  site with `npx wrangler pages deploy _site --project-name <name>` after
  `npm run build`. Push-to-deploy CI for this stack is planned but not yet
  shipped — don't assume a push published anything.

## Diagnosing problems

- Entry not appearing: filename starts with `_`, or it isn't in `projects/`.
- Images 404 in production on Cloudflare: media wasn't synced to R2.
- Build fails: `npm run build` locally shows the real error; frontmatter YAML
  is the usual suspect.
