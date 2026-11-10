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
    caption: An entry page in Artifact's catalogue, a fork of the template, showing Subpixel
    alt: A catalogue page with the Subpixel icon and title, three paragraphs of text, and two pixel-art screenshots of island and plaza worlds
unconfirmed: [date]
---

Catalogue Raisonné is a template for publishing a catalogue of work as a website. Each project is one Markdown file with a title, a date, images and a few paragraphs. Eleventy builds the files into an index and a page for each entry, and a GitHub Action publishes the site to GitHub Pages. The README also documents a Cloudflare setup, with the site on Cloudflare Pages and the images in R2. The pages have a print stylesheet for export to PDF.

An entry can also be kept in the repo of the project it describes, in a hidden `.artifact/` folder. An import script copies it into the catalogue, so the entry can change in the same pull request as the product. A checker reports missing fields, placeholder images and fields marked as guesses, and with `--remote` it fetches every link. `AGENTS.md` gives a coding agent the steps for setup.

The image shows a page from Artifact's catalogue, which is a fork of the template.

Eleventy, Node. 2026.
