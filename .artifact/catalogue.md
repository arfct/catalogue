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
    caption: Subpixel's page in Artifact's catalogue, with the icon beside the title and the images to the right of the text
    alt: A catalogue page with the Subpixel icon and title, three paragraphs of text, and two pixel-art screenshots of island and plaza worlds
unconfirmed: [date]
---

An entry in a Catalogue Raisonné site can be kept in the repo of the project it describes, in a hidden `.artifact/` folder, so that the description changes in the same commit as the work. An import script copies each folder into the catalogue through the GitHub CLI, which lets private repos take part, and it leaves a hand-written entry alone unless told to adopt it.

Catalogue Raisonné is the template such sites are forked from. Each project is one Markdown file with a title, a date, images and a few paragraphs; Eleventy builds the files into an index and a page for every entry, and a GitHub Action publishes the result to GitHub Pages. The README documents a second setup on Cloudflare, with the images in R2. Tags come from a base list that a site can extend, and the checker rejects any other tag and warns about a subject tag that only one entry uses. A print stylesheet covers export to PDF.

The image shows Subpixel's page in Artifact's catalogue, one such fork.

Eleventy, Node. 2026.
