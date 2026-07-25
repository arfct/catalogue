# Credits — design

2026-07-25 · Linear A-115 (catalogue project)

Per-entry credits so an entry appreciates everyone involved, not just the
site author.

## Frontmatter

New optional `credits:` list, conventionally after `role:`:

```yaml
credits:
  - name: Jane Doe          # required
    role: Photography       # optional — what they contributed
    url: https://janedoe.com # optional — renders the name as a link
```

`role:` (existing) remains the author's own role; `credits:` is everyone else.
No change to existing entries — the field is absent everywhere today and
nothing renders when absent.

## Rendering

`_includes/entry.njk`: a "With" row in the entry meta `<dl>`, after Role,
before Link. One line per person:

- name, linked when `url` is present
- ` — <role>` appended when `role` is present

Markup mirrors the existing tag list (a `<ul>` inside `<dd>`). Styling
inherits `.entry__meta`; add a `.credit-list` rule in `main.css` only if the
default list styling needs resetting.

## Documentation

- `projects/_sample.md`: add the field with a one-line comment.
- `README.md` entry-format block: add the three-line example.

## new-project skill

- Interview mode: standard question — "Who else was involved — collaborators,
  photographers, a client's team?"
- Repo mode: check co-committers and README acknowledgements as candidates.
- Guardrail: inferred collaborators are always confirmed with the user before
  being written; never auto-credit, never credit bots.
- Credits are frontmatter, not prose — the Voice section is unaffected.

## Out of scope

Site-wide colophon; index-card rendering; any change to `role:` semantics.

## Verification

`npm run dev`: an entry with credits shows the With row (linked names,
contributions); an entry without credits renders identically to before.
