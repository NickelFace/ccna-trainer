# CCNA Trainer — Android app

A separate product from the web simulator, not a wrapper around it. Same question bank,
phone-shaped UX: tab navigation, a session that survives the system killing the app,
spaced repetition, tap-to-match instead of drag-and-drop, and a prompt generator that
hands a mistake to an AI chat with enough context to be useful.

Vanilla JS + esbuild + Capacitor. No framework, no CDN, no network at runtime: the bank,
the exhibits and the fonts are all bundled, and the app does not declare
`android.permission.INTERNET`.

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
`dist/`. The bank is never duplicated in git — `dist/` is ignored.

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
│  ├─ cli.js        show-output blocks
│  └─ ai-prompt.js  the AI request, assembled from toggles
├─ app/             screens, router, persistence — everything that touches the DOM
└─ styles/          tokens.css is the design system; nothing invents a value
```

The engine was lifted out of the web app's `assets/js/app.js` without changing behaviour;
that was verified by running both implementations over the same inputs and comparing
9732 results.

## Release

Every push to `main` that touches `ccna-mobile/` or the question bank runs
[android-release.yml](../.github/workflows/android-release.yml): it tests, builds,
**deletes the previous release** and publishes a new one. There is always exactly one
build to download.

### Versioning

`BASE_VERSION` in the workflow is the release line. The first build on a line publishes it
verbatim, every build after that adds a patch number:

```
2.0  →  2.0.1  →  2.0.2  →  …
```

`versionCode` is the workflow run number — monotonic, which is all Android asks of it.
Nothing is stored in `package.json` or a VERSION file; the run counter is the source.

To open a new line: bump `BASE_VERSION` and set `RUN_OFFSET` to the run number of that
first build (the counter is per workflow file and never resets).

### Signing

Signing material is never in the repo. The workflow writes `android/keystore.properties`
from secrets and deletes it afterwards.

| Secret | |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | |
| `ANDROID_KEY_ALIAS` | |
| `ANDROID_KEY_PASSWORD` | |

**Without these secrets the workflow publishes a debug APK instead.** An unsigned release
APK cannot be installed at all, so falling back to the debug variant is the only way the
release stays useful — at the cost of no minification and a throwaway signing key, which
means a build cannot be installed over a previous one without uninstalling first. Add the
secrets and every build becomes a signed, minified release AAB + APK that upgrades in
place.

## Known gaps

- **Interface language is Russian only.** The profile carries a `lang` field and the
  onboarding has a slot for the choice, but there is no string table yet, so neither the
  language step nor `android:localeConfig` is wired up. That needs an i18n layer first.
- **Lab simulations** (35 questions of type `sim` in the bank) have no screen here. They
  are not scorable and not runnable offline; the web app lists them for reference.
- The app icon and splash are drawn from one vector glyph in the app palette. They are
  deliberately plain — replace `res/drawable/ic_launcher_foreground.xml` and
  `res/drawable/ic_splash.xml` if a real mark ever gets designed.
