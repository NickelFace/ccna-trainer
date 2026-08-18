# ccna-book — the theory the trainer never had

Plain Markdown chapters in `topics/`, one per exam sub-topic, plus a build step that turns
them into the JSON the Android app reads and — this is the point — **binds every chapter to
the questions it answers**.

The bank in `ccna-exam-simulator/data/questions.json` stays the source of truth for
questions. Nothing here duplicates it: `build.mjs` classifies all 1395 questions against the
chapters and fails the build if a single question ends up with no chapter to read for it.

```
topics/*.md            ← written by hand, Russian, Markdown subset (see below)
build.mjs              ← parse + classify + emit
   │
   ├── index.json      ← chapter list, no bodies (loaded when the Теория tab opens)
   ├── t/<id>.json     ← one chapter body, fetched when it is opened
   ├── map.json        ← question number → chapter id (used by "теория по этому вопросу")
   └── coverage.md     ← report: questions per chapter, thin chapters, fallbacks
```

`ccna-mobile/scripts/sync-data.mjs` runs the build and writes the result straight into
`ccna-mobile/dist/data/theory/`, so `npm run build` in the app picks up an edited chapter
with no extra step. Nothing generated is committed.

## Running it

```bash
node ccna-book/build.mjs --out /tmp/book
```

Prints the coverage summary and writes the JSON. `--strict` (used by the tests) turns
warnings — a chapter nobody's questions reached, a question that only matched a fallback —
into a non-zero exit.

## The Markdown subset

Frontmatter:

```yaml
---
id: ipc-04-ospf            # file name without .md, used in URLs and in the store
dom: IPC                   # one of NF NA IPC IPS SEC AUT — must match the bank's domains
title: OSPFv2 в одной зоне
lead: Одно предложение о том, что тема даёт.
blueprint: ["3.4", "3.5"]  # official exam-topic numbers this chapter covers
minutes: 45                # honest reading + practice estimate
match:                     # how questions find this chapter
  tp: [OSPF]               # bank tags that belong here outright
  re: ["ospf", "dr/bdr"]   # case-insensitive patterns searched in question text
  not: ["ospfv3"]          # veto: a hit here disqualifies the chapter
fallback: true             # optional, at most one per domain: catches what nothing matched
---
```

Body blocks — everything else is a paragraph:

| Markdown | Renders as |
|---|---|
| `## Заголовок` / `### Заголовок` | section / subsection (sections drive the contents list and reading progress) |
| `- item` / `1. item` | list |
| GFM table | table, horizontally scrollable |
| ` ```cli ` | terminal block (dark, monospace, scrollable) |
| ` ```cfg ` | configuration to type in |
| ` ```txt ` | ASCII diagram — keep it under 42 columns so a phone shows it whole |
| `> [!key] Заголовок` | callout: `key` (запомнить), `trap` (ловушка экзамена), `note`, `lab` |
| ` ```check ` with `?? question` / `!! answer` lines | self-check, answer hidden behind a tap |

Inline: `**bold**`, `` `code` ``, `*italic*`. No HTML, no images, no links to the network —
the app ships offline and renders these blocks itself.

## Writing rules

- Russian prose, English terms kept in English (`native VLAN`, not «родная VLAN»), commands
  and output verbatim.
- Explain the mechanism before the command. A chapter that lists commands without saying
  what the box does with them does not survive an exam question that rewords them.
- Every chapter ends with «Что спрашивают» — the shapes the bank actually asks in, and
  «Проверь себя» — a `check` block.
- Numbers that get asked (AD values, timers, port ranges, standards) go in a table, not in
  the middle of a sentence.
