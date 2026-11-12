---
title: Sample Project
date: 2024-06                 # when it happened: first release, or first working version (YYYY-MM or YYYY)
status: released              # released (live: a store, the web) | beta (TestFlight, early access) |
                              #   wip (in progress, not yet shareable) | retired (no longer maintained or available)
category: project             # one of `categories:` in catalogue.config.yml; optional with a single category
tags: [print, identity]       # from tags.base.yml or tags.yml; see README "Tags"
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
icon_macos: _sample/icon-macos.png  # optional: a macOS-style icon (transparent 1024, shape and shadow drawn);
                              #   shown as is wherever the icon appears, never masked
icon_shape: squircle          # optional: squircle (default) | circle | none
wordmark: _sample/wordmark.svg  # optional: set in place of the title on the card X shows
summary: A one-line description for link previews.  # optional: else the body's first sentence(s)
og_image: _sample/card.png    # optional: the entry's own 1200×630 card for X (PNG or JPEG, under 600 KB);
                              #   without it the build composes one from the fields above
client: Example Client
role: Art Direction, Design
credits:                      # everyone else involved, by GitHub login (contributors.yml has names and links)
  - janedoe
  - github: samlee
    role: Sound design
  - name: Ada Lovelace          # someone without GitHub: a name, optional role and url
    role: Photography
formerly: [old-sample]        # earlier slugs; each gets a redirect to this page
unconfirmed: [date]           # fields that are still guesses; nothing renders, the checker warns
---

A short description of the project. What was the brief, what did you make,
and what made it interesting? Write as much or as little as you like —
this text appears on the detail page below the images.

This is the second paragraph. Markdown formatting works here: **bold**,
*italic*, [links](https://example.com), and so on.
