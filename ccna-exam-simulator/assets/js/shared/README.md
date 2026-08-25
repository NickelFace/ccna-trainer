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

**Progress**

- `srs.js` — Leitner boxes: the intervals and the state transition of one graded answer.
- `srs-queue.js` — reading that map: what is due, how many, when the next one is, the boxes.
- `activity.js` — the daily counters: local day key, the per-device bucket, pruning.
- `progress.js` — what is derived from the history: topic statistics, weak topics, the
  mistakes of an attempt, weak domains, the day, the streak, the daily goal, the tones a
  score is shown in.
  Also which attempts count at all: a run with fewer than a third of its questions answered
  was walked away from, not taken, so it gets no 300..1000 score and no place in the
  averages — while the answers it does hold keep counting like any other.
- `score.js` — the 300..1000 scale and the pass mark.
- `readiness.js` — the forecast: the last 200 answers, weighted by the blueprint, put on
  that same scale. A domain the window never saw is assumed weak rather than skipped, so
  drilling one easy domain cannot flatter the number. Both clients open on it.
- `plan.js` — the weekly mock exam (an exam attempt counts, practice and repetition do
  not) and the clock arithmetic the phone schedules its two reminders from.
- `localdate.js` — the exam-date countdown, in calendar days on the reader's own
  calendar. `'YYYY-MM-DD'` is a day, not an instant; parsing it as one reads back a day
  early anywhere east of UTC, and a fixed 24h step drifts across a DST change.
- `retention.js` — how long an attempt is kept (six months) and what pruning may touch.

**Between the two devices**

- `backup.js` — the `v:1` exchange format: which branches a save file carries.
- `merge.js` — one state and another into the state both devices should hold.
- `sync.js` — the protocol against `ccna-sync`, and the policy for when to run it by itself.
- `tset.js` — a set whose membership survives merging: every add and every removal is
  dated, and the later one wins. What read marks and bookmarks are made of.

**The textbook**

- `theory.js` — where the chapter files are, the shape of the reading branch, read marks.
- `book.js` — a chapter's blocks into HTML, identically in both readers.
