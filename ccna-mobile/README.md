# CCNA Trainer — Android app

A separate product from the web simulator, not a wrapper around it. Same question bank,
phone-shaped UX: tab navigation, a session that survives the system killing the app,
spaced repetition, tap-to-match instead of drag-and-drop, a prompt generator that hands a
mistake to an AI chat with enough context to be useful, and a **Теория** tab: 47 chapters
covering the whole blueprint, each one bound to the bank questions it answers, so a
mistake leads straight to the paragraph that explains it and a chapter leads straight to
practice on its own questions.

Vanilla JS + esbuild + Capacitor. No framework, no CDN, and nothing fetched to study: the
bank, the exhibits, the chapters and the fonts are all bundled, so every screen works with
the device in flight mode. The single use of the network is progress sync, and it stays
idle until a key is entered — see below.

## Commands

```bash
npm install
npm run dev              # esbuild watch + dev server on http://localhost:8100
npm test                 # engine unit tests + bank integrity checks
npm run build            # sync the bank, bundle into dist/
npm run android          # build + npx cap sync android
npm run android:open     # the same, then open Android Studio
```

`npm run sync-data` copies `../ccna-exam-simulator/data` and `images/exhibits` into
`dist/`, and compiles `../ccna-book/topics/*.md` into `dist/data/theory/` (chapter index,
one file per chapter, and the question → chapter map). Neither the bank nor the compiled
book is duplicated in git — `dist/` is ignored.

## Layout

```
src/
├─ engine/          pure logic, no DOM, covered by tests
│  ├─ select.js     weightedPick — blueprint weights 20/20/25/10/15/10
│  ├─ score.js      scaled = 300 + pct*700, pass at 825
│  ├─ grade.js      isCorrect, ddCorrect/ddExpected/ddNeeded
│  ├─ srs.js        Leitner boxes, intervals 1/3/7/16/35 days
│  ├─ readiness.js  weighted forecast over the last 200 answers
│  ├─ stats.js      attempt history, weak topics, streaks
│  ├─ rationale.js  which per-option explanations to show
│  ├─ cli.js        show-output blocks — when the output needs a scrolling window
│  └─ ai-prompt.js  re-export: the AI request lives in the web app's shared/
├─ app/             screens, router, persistence — everything that touches the DOM
│  ├─ store.js      the seven branches of progress, their storage and the sync loop
│  ├─ cliview.js    command output: the double tap and the full-screen viewer
│  ├─ theory.js     loads the book: index on tab open, a chapter when opened
│  └─ book.js       renders chapter blocks (tables, CLI, callouts, self-checks)
└─ styles/          tokens.css is the design system; nothing invents a value
```

The engine was lifted out of the web app's `assets/js/app.js` without changing behaviour;
that was verified by running both implementations over the same inputs and comparing
9732 results.

## Palette

The app is dark, and only dark — there is no light theme and no switch. What changed is
the hue: it used to run on a neutral-blue scheme of its own, and it now shares the web
trainer's, so that one product does not read as two. Slate neutrals, gold accent.

Everything lives in `src/styles/tokens.css`; `base.css` and `book.css` hold no colour at
all and `screens.css` holds none either since the last few hardcoded borders became
tokens. So a palette change is that one file.

Two things are worth knowing before editing it:

- **The surfaces are solved, not picked.** Each of `--surface`, `--elev`, `--border` and
  the text steps was chosen to reproduce the contrast ratio the previous palette had
  against `--bg`. The depth ordering a phone screen leans on is unchanged; only the hue
  moved. If you retune one, keep its ratio to `--bg` rather than its hex.
- **`--ok` and `--err` are the pale variants, not the saturated ones.** A verdict is read
  as text here as often as it is painted as a bar, so they are the web's teal and red
  walked up for a dark ground. The tints (`--ok-bg`, `--err-bg`) are mixed from the
  *saturated* versions — mixing the pale ones into slate just yields grey.

`--warn` and its tint are aliases of the gold rather than values of their own. The web has
no separate warning hue: a flagged question and a middling domain score are both simply
gold there. Aliasing says that is a decision, and keeps a later change to the gold from
leaving the warning colour behind.

The icon and splash were already drawn in the brand's gold by `brand/generate.py` — this
change brings the UI into line with them rather than the other way round. `capacitor.config.json`
and `res/values/colors.xml` carry `--bg` for the launch window, so the splash hands over to
the WebView without a flash; they have to move whenever `--bg` does.

## Motion

Everything that moves does so on `transform` and `opacity` only, so the compositor can run
it without a layout pass. Three rules the code holds itself to:

- **The swipe tracks the finger.** `bindSwipe` in `screens/question.js` moves `.q-pane`
  1:1 while dragging; releasing past 22% of the width — or on a flick still travelling that
  way — hands off to the next question, and anything short of that springs back. The axis
  is decided once, after 10px, and vertical intent gives the gesture up to the scroller
  (`touch-action: pan-y` means the listeners never call `preventDefault`).
- **Command output owns its own gesture.** `show ip route` is wider than a phone and must
  not wrap — the columns are the answer — so the block scrolls sideways, and `bindSwipe`
  refuses any touch that starts inside `.cli-wrap`. The refusal has to happen at
  `touchstart`: the swipe is the distance between start and end, so a `touchmove` that
  arrives after the start was recorded is already too late. Output longer than
  `WINDOW_AFTER` lines (engine/cli.js) becomes a 45vh window rather than pushing the
  options off the screen, and a double tap — or the button under the block — opens it
  full screen, where landscape fits nearly twice the characters per line.
- **Entrances are CSS animations, not rAF flips.** A backgrounded WebView stops serving
  frames, and a pane waiting for a callback that never comes would be an invisible screen.
  `.q-pane.in-next` / `.in-prev` use `animation-fill-mode: backwards`, so the resting state
  is the plain visible element the drag can move.
- **A tap repaints what it changed.** Selecting an option updates the option row and the
  action bar (`router.renderFooter()`), never the whole body — a full rebuild re-inserts
  the exhibit `<img>` and the screen blinks on every tap. Same for the bookmark label and
  the font-size step.

`prefers-reduced-motion: reduce` collapses every duration in `base.css`, and the hand-off
skips its animation entirely.

## Sync

Optional, off until a key is entered: Прогресс → «Синхронизация» → the same key as in the
browser, and both devices converge through `sync.maks.top` (the Worker in
[`../ccna-sync/`](../ccna-sync/)). The server keeps an opaque blob and a revision number
and understands neither; what progress *means* lives in
[`shared/`](../ccna-exam-simulator/assets/js/shared/), and the merge runs on the devices.

It syncs when the app starts, when it goes to the background with work the server has not
seen, and when it comes back from the background — an app can sit open for days without
ever being "started" again, so the return is its own moment. Never on a timer, never per
answer. An exam in progress is not uploaded at all: a running clock and a half-written
answer sheet belong to the phone they were started on.

## Backup

Progress lives only in the phone's SharedPreferences (`store.js`, via `@capacitor/preferences`)
— there is no server, so nothing else has a copy. `store.toBackup()`/`restore()` and
`app/backup.js` turn the whole store into one JSON file, exposed as Экспорт/Импорт at the
bottom of the Прогресс tab: export hands the file to Android's share sheet (Web Share API —
Drive, Files, email, whatever is installed) and falls back to the clipboard on older
WebViews; import reads a file, confirms before it overwrites anything, then reloads so
every screen rebuilds from the restored state rather than being hand-patched live.

This is what makes a signing-key change survivable (see Signing above) and doubles as the
only way to move progress to a new phone.

## Release

Every push to `main` that touches `ccna-mobile/` or the question bank runs
[android-release.yml](../.github/workflows/android-release.yml): it tests, builds,
**deletes the previous release** and publishes a new one. There is always exactly one
build to download.

### Versioning

`BASE_VERSION` in the workflow is where the count starts. The first build publishes it
verbatim, every build after that adds a patch number, and the hundredth rolls the minor
over rather than growing a third digit past 99:

```
2.0  →  2.0.1  →  …  →  2.0.99  →  2.1  →  2.1.1  →  …  →  2.1.99  →  2.2  →  …
```

All of it is arithmetic on one counter — the workflow run number — so the sequence can
neither skip nor repeat. `versionCode` is that same run number, monotonic, which is all
Android asks of it. Nothing is stored in `package.json` or a VERSION file.

To start a line somewhere other than where the arithmetic lands: bump `BASE_VERSION` and
set `RUN_OFFSET` to the run number of that first build (the counter is per workflow file
and never resets).

### Signing

Signing material is never in the repo. The workflow writes `android/keystore.properties`
from secrets and deletes it afterwards.

| Secret | |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | |
| `ANDROID_KEY_ALIAS` | |
| `ANDROID_KEY_PASSWORD` | |

Switching a phone from a debug build to this signed release (or rotating the keystore
later) is a signature change — Android refuses to install over a mismatched one, so it
uninstalls the old app first, and `allowBackup="false"` in the manifest means that takes
its data with it. Export a backup (below) before that install, import it after.

**Without these secrets the workflow stops.** An unsigned release APK cannot be installed
at all, and a debug-signed one carries a throwaway key that no later build can upgrade
over — publishing either as if it were the release is worse than publishing nothing, so
the run fails with a message naming the missing secrets instead.

## Known gaps

- **`android:localeConfig` is not wired up.** The app has a full RU/EN interface (see
  `src/app/i18n.js`) and switches instantly from the Profile screen or onboarding step
  3 — persisted in `profile.lang`, independent of the OS locale. What's still missing
  is having a fresh install *default* to English on an English-language phone before
  the user ever opens Профиль/Profile; today every install starts in Russian
  regardless of device locale, same as before this landed.
- **Lab simulations** (35 questions of type `sim` in the bank) have no screen here. They
  are not scorable and not runnable offline; the web app lists them for reference.
- The app icon and splash are drawn from one vector glyph in the app palette. They are
  deliberately plain — replace `res/drawable/ic_launcher_foreground.xml` and
  `res/drawable/ic_splash.xml` if a real mark ever gets designed.
