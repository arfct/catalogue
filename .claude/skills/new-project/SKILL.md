---
name: new-project
description: Use when the user wants to add a project or entry to this catalogue site — whether they name a GitHub repo, point at a local folder or files, or just say "add a project" with nothing prepared.
---

# New Project Entry

Write an entry plus its media, matching the site's existing conventions exactly.

**Where it goes:**

- **A project with its own repo the user controls**: write the entry into that repo's `.artifact/` folder (`source_dir` in `catalogue.config.yml`) as `<slug>.md` with bare image names, its images and the optional named files beside it (`icon.png`, `icon-macos.png`, `wordmark.svg`; README "Entries from other repos"), plus a two-line `README.md` saying the folder is a catalogue entry, not build output. Check it with `npm run check -- --dir <repo>/.artifact`. Then add the repo to `sources:` and run `npm run import`. The entry is committed in that repo; the import is committed here.
- **Anything else** (no repo, or a repo the user doesn't control): `projects/<slug>.md` plus `media/<slug>/`, as below.

## Ground truth

- `projects/_sample.md` is the canonical entry format — read it before writing anything. It is a permanent reference, deliberately excluded from the published site by its `_` prefix. Never delete it or suggest deleting it.
- Read `catalogue.config.yml` and note `stack:` before touching media (see Media below).

## 1. Gather facts

Pick the mode by what the user gave you:

- **GitHub repo** — `gh repo view <org>/<name>`, then README and source for what it is, when, and what it's built with. Note collaborator candidates: co-committers, README acknowledgements or credits sections.
- **Local folder** — read its README and code directly.
- **Nothing** — interview the user: one question at a time, plain language, no jargon. Cover: what is it called? what is it / what did you make? when (year + month)? what was your role? who else was involved — collaborators, photographers, a client's team? client, if any? a few tags?

Facts you infer (especially the date, role, and tags) are guesses — confirm them with the user instead of presenting them as fact. Collaborators especially: never write a `credits:` entry the user hasn't confirmed, and never credit bots or automated committers.

## 2. Write the entry

Create `projects/<slug>.md` — kebab-case slug; it becomes the URL `/p/<slug>/`.

- Frontmatter: same fields, order, and formats as `_sample.md`. `date: YYYY-MM` is when the project happened, not when its repo was created.
- `url` is the project's own page. Every other public way to get it (store pages, a public beta, a public repo) goes in `links`, with the keys listed in the README.
- `category`, if the site has more than one in `catalogue.config.yml`.
- Anything you inferred and couldn't confirm goes in `unconfirmed` (e.g. `[date]`), so the checker keeps flagging it.
- Tags: short, lowercase, kebab-case (`open-source`, not `open source`). Reuse tags from existing entries where they fit.
- Credits: everyone else involved goes in `credits:` (name, optional role and url) — the entry should appreciate collaborators, not just the author. `role:` stays the author's own role. Credits live in frontmatter, not the body.
- Body: 1–3 short paragraphs in the voice below.

### Voice

Each body is a short monograph, not a product description. Treat the subject — object, tool, idea — as a curated artifact with provenance and intent.

- Open abruptly: a conceptual atmosphere, aesthetic problem, or pivot point inside the first five words. Short, punchy sentences. Fragments are fine.
- Persona: an uncompromising curator with deep domain authority — sophisticated, slightly aloof. Never salesy, never academic.
- Tell the story of intent, not features: the radical simplification of a chaotic system, the breakthrough in form, the quiet defiance of an object that resists compromise. Set the project inside that narrative.
- Grounded, not oracular: every sentence names something concrete from the project itself — the object, a part of it, its material, its user. A sentence made only of abstractions ("The constraint is the point.") cannot appear; rewrite it around the concrete thing it gestures at. At most one figurative image per entry, and it must describe how the thing behaves.
- Only facts the source material supports. Never invent numbers, dates, names, or provenance for atmosphere — including real-sounding domain trivia ("Slack water lasts eleven minutes"): if it isn't in the source material, it doesn't open the entry or appear anywhere in it.
- No feature lists. No corporate buzzwords.
- Technical facts — stack, materials, dimensions — land only in the final line or two, dropped with absolute brevity.

## 3. Media

In order of preference:

1. **User's images** — copy into `media/<slug>/`, give them descriptive names, write a caption and alt text for each.
2. **Capture** — if the project is a live site or runnable app, offer to screenshot it. Frame near 4:3 (index cards crop to 4:3), ~1600px wide.
3. **Placeholders** — point `media:` at `_sample/<ratio>.png` files and tell the user which real images to supply.

Stack determines where media must go (`catalogue.config.yml`):

- `github-pages` — files in `media/` are served directly; adding them is enough.
- `cloudflare` — media is served from R2, not the repo. After adding files to `media/`, run `npm run sync` or the images will 404 in production.

An app icon, if the project has one, is never a `media` item. Two kinds, either alone is enough (README "Entry format", Icons):

- `icon` — the square, opaque, unmasked art (1024px); the site applies the shape. `icon:` in `projects/`, or `icon.png` by name in `.artifact/`.
- `icon_macos` — a macOS-style icon: transparent 1024 canvas with the shape, margin and shadow drawn in. Shown as is, never masked. `icon_macos:` in `projects/`, or `icon-macos.png` by name in `.artifact/`. Use it for a Mac app's own icon rather than cropping one out of it.

### Link previews

Pasted links get a card (README "Link previews"). Three optional fields shape it:

- `summary` — one sentence for the preview description (at most 300 characters). Without it the body's first sentence(s) are used, so only add one when the opening sentence reads badly out of context.
- `wordmark` — the project's wordmark (SVG or PNG), set in place of the title on the card X shows. `wordmark.svg` by name in `.artifact/`.
- `og_image` — the entry's own 1200×630 card for X. Leave it out: the build composes the card from the title, description, icon and first image, and that is the default. Only add one the user supplies.

The first image matters most: it becomes `og:image` (fitted to 1200×630) and the right half of the X card, so lead with the clearest picture of the thing.

## 4. Verify

Run `npm run check`, then the dev server and check both pages render correctly: the new card on `/` and the detail page at `/p/<slug>/`. Show the user what it looks like.

## 5. Hand off

Don't commit, push, or deploy unless asked. Tell the user what will publish it:

- `github-pages` — commit and push to main; the site rebuilds automatically.
- `cloudflare` — `npm run sync` for media, `npm run deploy` for the site (or push, if CI deploys are set up).
