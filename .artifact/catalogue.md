---
title: Catalogue Raisonné
date: 2026-06
category: tool
tags:
  - web
url: https://arfct.github.io/catalogue/
links:
  source: https://github.com/arfct/catalogue
media:
  - src: entry-page.png
    caption: Subpixel's entry in Artifact's own catalogue, imported from Subpixel's repo
    alt: A catalogue page with the Subpixel icon and title, three paragraphs of text, and two pixel-art screenshots of island and plaza worlds
unconfirmed: [date]
---

One Markdown file per project: a title, a date, its images, a few paragraphs. Eleventy turns the folder of them into an index and a page for each entry, published to GitHub Pages or to Cloudflare with the images in R2. Any page prints to PDF.

An entry can also live in the repo of the thing it describes, in a hidden `.artifact/` folder, and the catalogue imports it from there, so the entry changes in the same pull request as the product. A checker flags placeholder images, guessed dates and dead links before anything is published. `AGENTS.md` walks a coding agent, and the person beside it, through setup.

Artifact's catalogue is a fork. Eleventy and Node. 2026.
