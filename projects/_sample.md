---
title: Sample Project
date: 2024-06                 # when it happened: first release, or first working version (YYYY-MM or YYYY)
category: project             # one of `categories:` in catalogue.config.yml; optional with a single category
tags: [design, identity]      # lowercase; from tags.yml if the site has one
url: https://example.com      # the project's own page
links:                        # every public way to get it; keys listed in the README
  app_store: https://apps.apple.com/app/id000000000
  source: https://github.com/you/sample
media:
  - src: _sample/4-3.png      # the first image is the index card, cropped to 4:3
    caption: Primary visual for the campaign
    alt: A bold graphic composition in black and white
  - src: _sample/2-3.png
    caption: Detail of the typographic system
    alt: Close-up of a letterform grid
icon: _sample/icon.png        # optional: an unmasked square app icon; the site rounds it
icon_shape: squircle          # optional: squircle (default) | circle | none
client: Example Client
role: Art Direction, Design
credits:                      # everyone else involved — name required, rest optional
  - name: Jane Doe
    role: Photography
    url: https://example.com
  - name: Sam Lee
    role: Sound design
formerly: [old-sample]        # earlier slugs; each gets a redirect to this page
unconfirmed: [date]           # fields that are still guesses; nothing renders, the checker warns
---

A short description of the project. What was the brief, what did you make,
and what made it interesting? Write as much or as little as you like —
this text appears on the detail page below the images.

This is the second paragraph. Markdown formatting works here: **bold**,
*italic*, [links](https://example.com), and so on.
