# CCNA-trainer

Two applications over one question bank, both offline-first, both simulating the Cisco
**CCNA 200-301** exam:

- a **web app** — wide layout, keyboard navigation, runs from any static host;
- an **Android app** — its own UX built for a phone: tab navigation, saved sessions,
  spaced repetition, tap-to-match instead of drag-and-drop, and a **textbook** whose 47
  chapters are bound to the questions they answer.

Both hold the same progress. One key typed on both devices and the browser and the phone
keep converging on their own — no accounts, no passwords, and no server that understands
what it is storing.

**Live (web):** https://ccna.maks.top · **sync:** https://sync.maks.top

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
- [`ccna-book/`](ccna-book/) — the textbook: Markdown chapters plus the build step that
  compiles them and classifies every question in the bank against them. The build fails
  if a question ends up with no chapter to read for it.
  Docs: [README.md](ccna-book/README.md) · coverage report: [coverage.md](ccna-book/coverage.md)
- [`ccna-sync/`](ccna-sync/) — the sync server: a Cloudflare Worker over D1, one blob per
  key, optimistic concurrency and six months of revisions to restore from. It never merges
  anything itself — that is the clients' job, below.
  Docs: [README.md](ccna-sync/README.md)
- [`ccna-exam-simulator/assets/js/shared/`](ccna-exam-simulator/assets/js/shared/) — the
  rules both applications run: repetition intervals, the 300–1000 scale, the readiness
  forecast and the weekly mock, what counts as a day's work, the save format, and the
  merge the two devices meet in. The Android build imports these files directly; there is
  no second copy to drift.
  Docs: [README.md](ccna-exam-simulator/assets/js/shared/README.md)
- [`brand/`](brand/) — the NetPath mark and the script that renders every icon size from it.
- `run.sh` / `stop.sh` — start/stop the local web server (port 8099).

The bank lives in exactly one place. `ccna-mobile` copies it at build time with
`npm run sync-data`; nothing is duplicated in git, so a fix made in `build/` reaches both
applications from one edit.

```
ccna-exam-simulator/data/questions.json   ← source of truth
ccna-exam-simulator/images/exhibits/      ← source of truth
ccna-book/topics/*.md                     ← source of truth (theory)
        │
        └── npm run sync-data ──► ccna-mobile/dist/ ──► APK
```

## Automation

- [`data-check.yml`](.github/workflows/data-check.yml) — runs the mobile engine's test
  suite against the bank on every change to it: answer keys pointing at options that do
  not exist, matching questions no bucket can satisfy, exhibits referenced but missing
  from disk, domain counts that no longer match `meta.json`. It also rebuilds the textbook
  into a temp directory and insists the committed copy is identical, so a chapter cannot
  be current in the APK (which compiles the book on every release) and stale on the site
  (which serves it exactly as committed).
- [`android-release.yml`](.github/workflows/android-release.yml) — every push touching
  `ccna-mobile/` or the bank builds the app, deletes the previous release and publishes a
  new one, so there is always exactly one build to download. Versions run `2.0`, `2.0.1`,
  … `2.0.99`, then `2.1` — the minor rolls over instead of the patch passing 99 — see
  [ccna-mobile/README.md](ccna-mobile/README.md#versioning).
- [`sync-deploy.yml`](.github/workflows/sync-deploy.yml) — tests the sync worker on every
  change to it, and deploys it to Cloudflare once the account secrets are set.
- [`static.yml`](.github/workflows/static.yml) — publishes the web app to GitHub Pages.
  Only what the browser loads goes up: `index.html`, `assets/`, `data/`, `images/`. The
  33 MB `build/` pipeline stays in the repo and off the site.
