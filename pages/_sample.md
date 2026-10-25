---
title: Sample page
description: How to write a standalone page. Never published — the underscore excludes it.
---

This is the canonical format for a standalone page. Like `projects/_sample.md`,
the leading underscore keeps it out of the build. Don't delete it.

A page is prose that sits alongside the catalogue rather than inside it: an
about page, a contact page, a privacy policy. Entries in `projects/` are
catalogue records with media, dates, and credits. Pages are not.

## Frontmatter

- `title` — required. Used as the `<h1>` and in `<title>`.
- `description` — optional. Feeds the meta description and social previews.
- `permalink` — optional. Defaults to `/<filename>/`.

## Navigation

Pages do **not** appear in navigation automatically. To link one, add it to
`nav:` in `catalogue.config.yml`:

```yaml
nav:
  - label: About
    path: /about/
```

Leaving a page out of `nav` is how you keep it unlisted — reachable by URL,
absent from the site's own navigation. Nothing else is required.

## Styling

Put page-specific CSS in `styles/custom.css`, never `styles/main.css`, so
template updates keep merging cleanly.
