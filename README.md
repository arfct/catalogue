# Catalogue Raisonné

A template for building a beautiful, long-lasting online catalog of your work —
design, engineering, art, writing, anything. Fork it, add your projects, and get
a published site with a browsable **index** and a **detail page** for every
project. Works on screen and prints cleanly to PDF.

Your project descriptions live as plain text files in the repo. Your images live
alongside your entries or in cloud storage depending on the stack you choose.

> **New here? You don't have to do this alone.** See **[AGENTS.md](AGENTS.md)**
> for how to use Claude to walk through every step, including writing your
> project files for you.

---

## Choose your stack

Pick one, or run both in parallel.

| | **GitHub Pages** | **Cloudflare** |
|---|---|---|
| **Best for** | Simplest setup, small–medium media | Larger media, custom domain, fast CDN |
| **Accounts needed** | Just GitHub | Cloudflare (free) |
| **Your site's address** | `you.github.io/catalogue` | `your-project.pages.dev` |
| **Custom domain** | Yes | Yes, free |
| **Media stored** | In the repo, served by GitHub | Cloudflare R2 (10 GB free, zero egress) |
| **Media limit** | 100 MB/file, ~1 GB total | 10 GB free |
| **Secrets needed** | None | 5 |

---

## Setup — GitHub Pages stack

### 1. Fork this repo
Click **Fork** at the top right on GitHub.

### 2. Enable GitHub Pages
In your fork: **Settings → Pages → Source: GitHub Actions**. No secrets needed.

### 3. Edit your config
Open `catalogue.config.yml`:
```yaml
title: Your Name
description: A catalog of my work
author: Your Name
accent_color: "#1a1a1a"
stack: github-pages
```

### 4. Add your first project
Create `projects/my-project.md`:
```markdown
---
title: My Project
date: 2024-06
media:
  - src: my-project/hero.jpg
    caption: Optional caption
  - src: my-project/detail.jpg
---

A few sentences about the project. What it was, what you did, why it matters.
```

### 5. Add your images
Put images in `media/<project>/` (e.g. `media/my-project/hero.jpg`) and commit.
GitHub serves them directly alongside your site. Keep images under **100 MB**
and export at **~2000px on the long edge** — there's no automatic resizing.

### 6. Push
Every push to `main` rebuilds and republishes automatically. Your site will be
live at `you.github.io/catalogue`.

---

## Setup — Cloudflare stack

### 1. Fork this repo
Click **Fork** at the top right on GitHub.

### 2. Create a Cloudflare account
Sign up at <https://dash.cloudflare.com/sign-up>.

### 3. Create an R2 bucket for media
1. In the Cloudflare dashboard → **R2** → create a bucket (e.g. `my-catalogue`).
2. Attach a **custom domain** to the bucket (e.g. `media.yourdomain.com`) so
   media is served via Cloudflare's CDN. (The `pub-<hash>.r2.dev` address works
   for testing but is rate-limited — use a custom domain for your live site.)
3. Create an **R2 API token** under Account → R2 → Manage API Tokens. Copy the
   **Access Key ID**, **Secret Access Key**, and your **Account ID**.

### 4. Create a Pages project for your site
**Workers & Pages → Create → Pages** → connect your forked repo. Note the
**project name**. Create a **Cloudflare API token** with Pages edit permissions.

### 5. Edit your config
```yaml
title: Your Name
description: A catalog of my work
author: Your Name
accent_color: "#1a1a1a"
stack: cloudflare

cloudflare:
  pages_project: my-catalogue
  r2_media_base_url: https://media.yourdomain.com
```

### 6. Add secrets to GitHub
**Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Your Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 token access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 token secret |
| `R2_BUCKET` | Your R2 bucket name |

### 7. Add your first project
Same format as GitHub Pages (see above).

### 8. Add your images
Put web-ready images in `media/<project>/` and commit. A GitHub Action uploads
them to R2, writes the URLs into your entry file, and removes the originals from
the repo. Keep each image under **100 MB** and export at **~2000px on the long
edge**.

For large files or video: upload directly via the R2 dashboard and paste the
URLs into your entry's `media:` list.

### 9. Push
Every push to `main` rebuilds and republishes automatically.

---

## Running both stacks in parallel

Set up both sets of secrets/settings. Both deploy workflows are independent —
they'll both run on every push and produce the same site at two URLs. Good for
redundancy or while migrating between stacks.

---

## Entry format

Each project is a Markdown file in `projects/` with YAML frontmatter.
`projects/_sample.md` is the reference, with every field:

```markdown
---
title: Project Title                 # required
date: 2024-06                        # required: when it happened (YYYY-MM or YYYY)
category: project                    # one of `categories:` in the config; optional with only one
tags: [print, identity]              # optional; checked against tags.yml if the site has one
url: https://my-project.example      # optional: the project's own page, shown as Link
links:                               # optional: every public way to get it, shown as "Get it"
  app_store: https://apps.apple.com/app/id000000000
  source: https://github.com/you/project
media_type: image                    # optional: image | video | audio
media:                               # required
  - src: project/hero.jpg            # relative to media/, or an absolute URL
    caption: Optional caption
    alt: Alt text                    # describe the image; the checker warns without it
icon: project/icon.png               # optional: square, unmasked app icon
icon_macos: project/icon-macos.png   # optional: macOS-style icon, shown unmasked
icon_shape: squircle                 # optional: squircle (default) | circle | none
wordmark: project/wordmark.svg       # optional: replaces the title on the X card
summary: One line for link previews  # optional: else the body's first sentence(s)
og_image: project/card.png           # optional: the entry's own 1200×630 X card
client: Client Name                  # optional
role: Design, Art Direction          # optional: your role
credits:                             # optional: everyone else involved
  - janedoe                          # a GitHub login, resolved from contributors.yml
  - github: samlee                   # or a login with a role
    role: Sound design
  - name: Ada Lovelace               # or, for someone without GitHub, a name
    url: https://example.com         # optional: links their name
formerly: [old-slug]                 # optional: earlier slugs, each redirected here
unconfirmed: [date]                  # optional: fields that are still guesses
---

Write your project description here in plain Markdown. As long or short as
you like. This becomes the body of the detail page.
```

The filename stem becomes the URL slug: `projects/sfmoma-poster.md` →
`/p/sfmoma-poster/`. Files starting with `_` (like `projects/_sample.md`, the
reference entry) are excluded from the published site.

**`links` keys:** `app` (a web app separate from the project's page),
`app_store`, `mac_app_store`, `testflight`, `play`, `play_testing`,
`chrome_web_store`, `source`. Each is checked against the site it should point
at (`app_store` must be `apps.apple.com`, and so on). Add your own under
`link_kinds:` in `catalogue.config.yml`.

**Icons** are shown beside the title on the entry and on its index card, never
as one of the images. There are two kinds, and either alone is enough:

- `icon` (`icon.png` or `icon.svg` in `.artifact/`): the plain square art
  (1024×1024 is ideal), opaque, with no rounded corners. The site applies the
  shape (`icon_shape`), so baked-in corners would be rounded twice.
- `icon_macos` (`icon-macos.png`): an Apple-style macOS icon, 1024×1024 on a
  transparent background with the shape, margin and shadow already drawn (the
  macOS icon grid). It is shown as is and never masked.

With both, the site shows `icon_macos` wherever the icon is displayed and keeps
`icon` for whatever needs to mask or crop it (the apple-touch-icon, which iOS
masks itself). The checker holds `icon_macos` to a square of 1024 (512 at
least) with transparent corners.

**Credits** name people by GitHub login (`credits: [janedoe]`). An optional
`contributors.yml` at the repo root maps each login to a display name, a link
and anything else you keep about them; the build fills those in, and a login
it doesn't list shows as itself, linked to its GitHub profile. The checker
warns about logins missing from `contributors.yml` when the file exists.
Someone without a GitHub account is an object with a `name`.

**Categories** group the index. Set `categories:` in the config (for example
work, writing, tools) and give each entry a `category`. With one category, the
default, the index is a single grid with no headings.

**Checking entries:** `npm run check` reports missing fields, bad dates, links
pointing at the wrong site, missing images, oversized files and non-square
icons. `npm run check -- --remote` also fetches every link and image, and
`--report` prints a table. Guesses listed in `unconfirmed` show up as warnings
until you remove them.

---

## Link previews

Every page carries the tags a pasted link turns into a card with (iMessage,
Slack, X, Discord, WhatsApp, Telegram, LinkedIn, Facebook), following
[arfct/link-previews](https://github.com/arfct/link-previews). They need `url:`
in `catalogue.config.yml`, since crawlers want absolute URLs.

| Tag | Entry | Index and pages |
|---|---|---|
| `og:title` | the entry's title | the page title, else the site title |
| `og:description`, `description` | `summary`, else the body's first sentence(s), at most 200 characters, one line | the page's `description`, else the site's |
| `og:image` (+ `:width`, `:height`, `:type`, `:alt`) | the first image fitted to 1200×630 on `preview.background`, nothing added | the site card: `preview.image`, else the icon and title |
| `twitter:image` | X only: the composed card, or `og_image` | none (X falls back to `og:image`) |
| `og:url`, `rel=canonical` | the page's URL (none on the 404 page) | same |
| `icon`, `apple-touch-icon` | 180 px from `icon`, else `icon_macos`, else the site's | the site's `icon` |
| `theme-color` | `theme_color`, else `accent_color` | same |
| `og:type` + an ActivityPub `alternate` | `article` and the alternate link, so iMessage shows the description and puts the icon beside the image (its post layout); `preview.post_layout: false` turns it off | same |

Images are rendered at build time with sharp into `/og/`, named by a hash of
their inputs, so a changed image gets a new URL and platforms that cache by
image URL fetch it again. Renders are cached in `.cache/og/`. Every image is a
JPEG under 600 KB (WhatsApp skips larger ones).

**X gets its own card.** X shows a large card as the image alone, with no title
or description beneath, so the build composes one for it from the entry: the
category and tags line, the icon (`icon_macos` as is, else `icon` masked) beside
the title or the entry's `wordmark`, the description, the first image, and the
site's `wordmark` (else its title). Text is set from font files
(`preview.fonts`, default Inter), so it renders the same everywhere. An entry's
own `og_image` (exactly 1200×630) replaces the composed card.

Only X may see it. Slack and iMessage take whichever of `og:image` and
`twitter:image` comes first in the page, and Discord counts `twitter:image`
among its images, so static tags can't keep the card from them. The pages carry
it as `<meta name="catalogue:x-image">`, which no crawler reads, and
`_worker.js` (a Cloudflare Pages worker, routed by `_routes.json` to pages
only) renames it to `twitter:image` when the user agent is Twitterbot and not
iMessage, whose fetcher claims Twitterbot too. On GitHub Pages there is no
worker, and X shows `og:image`.

The checker warns when an entry has no `og_image` (the composed card is in use)
and errors when the named file is missing or isn't 1200×630; over 600 KB is a
warning.

Test a preview without a phone with link-previews' `tools/lp-render.swift`
(iMessage), and with `curl -A <crawler user agent>` for the rest.

---

## Entries from other repos

A project can keep its entry in its own repo, so the description changes in
the same commit as the work it describes. The repo holds a hidden folder at
its root, `.artifact/` (an artifact: the record of one made thing):

```
.artifact/
  README.md          says what the folder is (it isn't build output)
  <slug>.md          the entry, in the format above, with bare image names
  icon.png           optional: the app icon, found by name (or icon.svg)
  icon-macos.png     optional: the macOS-style icon, found by name
  wordmark.svg       optional: the wordmark for the X card, found by name (or .png)
  card.png           optional: the entry's own X card, named by og_image
  hero.png, …        its images
```

A folder holding several entries prefixes the named files with the slug:
`<slug>.icon.png`, `<slug>.icon-macos.png`, `<slug>.wordmark.svg`. The import
copies every one into `media/<slug>/`, and `npm run sync` uploads them to R2
with the rest of `media/`.

List the repo under `sources:` in `catalogue.config.yml` and run `npm run
import`. It reads each folder from the repo's default branch through the
GitHub CLI (`gh`), so private repos work too. It writes `projects/<slug>.md`
and `media/<slug>/`, and prints what changed. Commit the result. Imported
entries carry `source:` and `source_commit:`. Edit them in their repo, not
here: the next import overwrites them. A hand-written entry is never replaced
unless you pass `--adopt`.

- `npm run import -- --repo you/project` imports one source.
- `npm run import -- --from ../project/.artifact --repo you/project` imports a
  local folder before it's pushed.
- `npm run check -- --dir ../project/.artifact` checks a folder in place.
- `npm run seed -- <slug> ../project` goes the other way: it moves an existing
  entry and its images into the repo's `.artifact/` folder, ready for a commit
  there.

Set `source_dir:` to use a different folder name.

---

## Standalone pages

Put prose pages — about, contact, a privacy policy — in `pages/` as Markdown.
`pages/about.md` is published at `/about/`. `pages/_sample.md` documents the
frontmatter: per-page fonts, a bundled page script, a full-viewport `bare`
layout for a custom homepage. Pages stay out of navigation unless listed under
`nav:` in `catalogue.config.yml`. `pages/404.njk` is the not-found page.

To give the site a homepage and move the catalogue off `/`, set `catalog_path`
(e.g. `/work/`) and `entry_path` in `catalogue.config.yml`, and add a page with
`permalink: /`.

---

## Updating your work

- **Edit a project:** change its `projects/` file and commit.
- **Replace an image:** commit a new file with the same name. GitHub rebuilds
  automatically. On Cloudflare, the R2 sync runs and updates the URL.
- **Add a project:** add a new `projects/` file and images.

---

## Working locally

```bash
git clone https://github.com/YOU/catalogue.git
cd catalogue
npm install
npm run dev             # preview at localhost:8080
```

---

## Printing / PDF export

Open your site and use your browser's **Print** command. The layout switches to
a clean print style.

---

## Internet Archive

IA is an excellent long-term home for media (permanent, free, hotlinkable) and
is planned as an alternate media backend in a future version. It cannot host
HTML. If you want to archive your media on IA today, upload files at
<https://archive.org/upload> and paste the URLs into your entries as absolute
URLs.

---

## Project layout

```
catalogue.config.yml   ← your name, settings, stack choice
projects/              ← one .md file per project (_sample.md is the reference)
tags.yml               ← optional: the tags entries may use
_worker.js             ← Cloudflare Pages worker: X's card for Twitterbot (see Link previews)
contributors.yml       ← optional: names and links for credited GitHub logins
pages/                 ← standalone pages (_sample.md is the reference; 404.njk)
media/                 ← images (committed, synced to R2 or served directly)
styles/                ← main.css (theme) and custom.css (your overrides)
_includes/             ← page templates (don't need to touch)
scripts/               ← check, import, seed, media sync, page-script bundling
test/                  ← tests for the scripts (npm test)
.github/workflows/     ← build and deploy automation
```

---

## Getting help

Open **[AGENTS.md](AGENTS.md)** and ask Claude — it can choose a stack with you,
write entry files, configure secrets, and diagnose errors.
