# shared/

The rules both clients have to agree on, in one place.

The web trainer loads these as native ES modules (`assets/js/store.js`); the Android app
imports the same files at build time by relative path (`ccna-mobile/src/engine/*` re-export
from here, esbuild bundles them into the APK). They live under the web app's `assets/`
rather than at the repository root because that is the only directory both the local dev
server (`python3 -m http.server --directory ccna-exam-simulator`) and the Pages workflow
(`static.yml` copies `assets/`) actually serve.

Nothing here may touch the DOM, `localStorage`, or Capacitor — these files run unchanged in
a browser, in the WebView, and under `node --test`.

- `srs.js` — Leitner boxes: the intervals and the state transition of one graded answer.
- `activity.js` — the daily counters: local day key, the per-day bucket, pruning.
- `score.js` — the 300..1000 scale and the pass mark.
- `backup.js` — the `v:1` exchange format: which branches a save file carries.
