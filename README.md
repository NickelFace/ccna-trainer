# CCNA-trainer

Two applications over one question bank, both offline-first, both simulating the Cisco
**CCNA 200-301** exam:

- a **web app** — wide layout, keyboard navigation, runs from any static host;
- an **Android app** — its own UX built for a phone: tab navigation, saved sessions,
  spaced repetition, tap-to-match instead of drag-and-drop, and an AI prompt generator.

**Live (web):** https://ccna.maks.top

## Quick start

```bash
./run.sh
# open http://localhost:8099
```

For the Android app:

```bash
cd ccna-mobile && npm install && npm run dev
# open http://localhost:8100
```

## Layout

- [`ccna-exam-simulator/`](ccna-exam-simulator/) — the web app (static HTML/CSS/JS, no
  backend), the **question bank** in `data/`, the exhibits in `images/exhibits/`, and the
  `build/` pipeline that regenerates the bank from the source archive.
  Docs: [README.md](ccna-exam-simulator/README.md) · [по-русски](ccna-exam-simulator/README.ru.md)
- [`ccna-mobile/`](ccna-mobile/) — the Android app (vanilla JS + esbuild + Capacitor).
  Docs: [README.md](ccna-mobile/README.md)
- `run.sh` / `stop.sh` — start/stop the local web server (port 8099).

The bank lives in exactly one place. `ccna-mobile` copies it at build time with
`npm run sync-data`; nothing is duplicated in git, so a fix made in `build/` reaches both
applications from one edit.

```
ccna-exam-simulator/data/questions.json   ← source of truth
ccna-exam-simulator/images/exhibits/      ← source of truth
        │
        └── npm run sync-data ──► ccna-mobile/dist/ ──► APK
```

## Automation

- [`data-check.yml`](.github/workflows/data-check.yml) — runs the mobile engine's test
  suite against the bank on every change to it: answer keys pointing at options that do
  not exist, matching questions no bucket can satisfy, exhibits referenced but missing
  from disk, domain counts that no longer match `meta.json`.
- [`android-release.yml`](.github/workflows/android-release.yml) — tag `v*` to build a
  signed AAB and APK and attach them to the GitHub release.
- [`static.yml`](.github/workflows/static.yml) — publishes the web app to GitHub Pages.
