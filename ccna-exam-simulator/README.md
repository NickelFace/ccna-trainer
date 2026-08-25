# CCNA 200-301 Exam Simulator

A self-contained, offline-first web app that simulates the Cisco **CCNA 200-301**
certification exam using a verified 1395-question bank (1401 in the source dump,
minus duplicates). No backend — static files only; progress is kept in the browser and
moves between devices as a file. [Russian version](README.ru.md).

## Features

- **Full Exam** — 100 questions, 120-minute timer, selected with the **official
  Cisco blueprint weighting** across the six exam domains:

  | Domain | Weight |
  |---|---|
  | 1.0 Network Fundamentals | 20% |
  | 2.0 Network Access | 20% |
  | 3.0 IP Connectivity | 25% |
  | 4.0 IP Services | 10% |
  | 5.0 Security Fundamentals | 15% |
  | 6.0 Automation & Programmability | 10% |

  Every question is independently classified against the official domain blueprint
  (not the source dump's own topic tags, which turned out to be frequently wrong).
  Scored on the Cisco 300–1000 scale with the **825 pass threshold** and a
  per-domain score breakdown. A run with fewer than a third of its questions answered is
  not counted: the questions never reached are graded as wrong, and the score that comes
  out of that describes walking away rather than knowledge. The answers that were given
  still count everywhere, as usual.
- **Custom Exam** — filter by domain and question type (text / exhibit / drag-and-drop),
  pick question count and timer.
- **Practice** — one question at a time, instant feedback.
- **Dashboard** — the screen the site opens on. A readiness forecast on the same
  300–1000 scale the exam reports, computed over the last 200 answers in the history and
  weighted by the blueprint (a domain nobody has answered anything in is assumed weak
  rather than ignored), how far it is from 825 and how far it moved this week; the six
  domains as they actually went; the day's count against its goal with a fortnight
  behind it; the repetition and mistake queues; and the scaled score of the last seven
  weighted attempts.
- **Weak spots** — one button that builds a 20-question run out of whatever is currently
  costing the most: each domain below 75% takes a share of the mix equal to its blueprint
  weight times how much of it went wrong, weak topics first inside each. Beside it, every
  domain under the threshold with what it is costing the forecast in points, the weak
  topics, a link into the chapter that covers each, and the two queues — the questions
  due for repetition (Leitner boxes 1/3/7/16/35 days) and the ones whose last answer was
  wrong. Every rule here is the one the Android app schedules from, out of
  `assets/js/shared/`; a run started from this screen is practice and never claims a
  300–1000 score.
- **Textbook** — all 47 chapters of [`ccna-book`](../ccna-book), the ones the Android app
  ships: contents by domain with a search, a read mark that syncs, a remembered scroll
  position, and the bank's questions on the chapter as a practice run. Written in Russian.
- **Where to read it up** — every graded answer, right or wrong, carries a link into the
  chapter that explains it, and for about a third of the bank into one **section** of that
  chapter; following it opens the chapter at that section rather than at the top. The
  section is derived at build time from the chapter's own keyword patterns and the text of
  the correct answer (see [`ccna-book`](../ccna-book)) — a signpost, not a promise, and
  when the build could not name one with confidence the link is the chapter alone.
- **Progress** — every finished run is kept in `localStorage`: the attempt history folds
  into exams and practice, and each attempt opens onto its per-domain breakdown, its
  mistakes, and a run over exactly those mistakes. Any attempt can be re-opened with its
  full review. Attempts are kept for six months and then drop by themselves; the
  repetition map is not touched by that — a question learned last year stays learned.
  The same screen holds the study plan: an exam date and a daily goal, both carried in
  the synced profile, and the weekly mock the sidebar counts down to.
- **Transfer** — export/import of the whole progress as one `v:1` JSON file, the same
  format the [Android app](../ccna-mobile) reads and writes: export in the browser, open
  it on the phone (Progress → Backup) — or the other way round. No account, no server.
- **Per-option rationale** — every question with answer choices (1201/1201) explains
  why each option is right or wrong, not just the correct one. For multi-select
  ("choose N") questions, only the options where you actually erred (a wrong pick,
  or a correct one you missed) show their explanation — the ones you already got
  right stay compact so the review isn't a wall of text.
- **Question types** — single/multiple choice, exhibit (topology/CLI) questions,
  and interactive **drag-and-drop** (drag or tap-to-place; works on mobile,
  supports distractor items that don't belong in any bucket).
- **CLI/config blocks** — command output and config listings render as real,
  selectable monospace text (not a screenshot); long ones collapse behind a
  toggle, short ones show inline.
- **Topology exhibits** — cropped straight from the original PDF dump
  (`images/exhibits/qN.jpg`), laid out exactly as in the source exam, plus a
  matching `cli` text block wherever the exhibit is a config/`show` output
  rather than a diagram.
- Answer key verified online (418/418 exhibit questions); key corrections applied
  where the source dump's answer was wrong.

## Language

The UI defaults to Russian, matching the app's primary audience (exam prep in
Russian). A **RU/EN** toggle pinned to the top-right corner switches the app
chrome — buttons, headers, verdicts, navigation — to English and remembers the
choice in `localStorage` across visits; the default stays Russian for
first-time visitors.

English mode intentionally **hides the per-option rationale** (`why`/`exp`):
that content exists only in Russian (~1200 hand-written explanations,
impractical to translate wholesale), and mixing languages read worse than
simply showing the question, options, exhibit, and the plain correct-answer
key without prose. Everything else — question stems, options, CLI blocks,
exhibit images — is already in English, straight from the original Cisco exam
dump.

## Structure

```
ccna-exam-simulator/
├── index.html
├── assets/
│   ├── css/styles.css
│   ├── js/app.js               # engine: modes, rendering, drag-drop, rationale, scoring
│   ├── js/store.js             # progress in localStorage + the export/import file
│   └── js/shared/              # the rules both clients share — the Android app imports
│                               # these files directly (srs, activity, score, backup)
├── data/
│   ├── questions.json          # question bank (exhibit images referenced by filename)
│   └── meta.json                # domain blueprint + counts
├── images/
│   └── exhibits/                # qN.jpg — exhibit crops (topology/CLI/GUI, straight from the PDF)
└── build/
    ├── build_data.py            # archive + all overrides -> data/ + images/
    ├── blueprint_domains.md     # condensed paraphrase of the official Cisco exam topics
    ├── classify_overrides.json # per-question domain classification (authoritative)
    ├── dd_data.json             # reconstructed drag-drop items/buckets/answers
    ├── why_data.json            # per-option rationale for every scored question
    ├── text_overrides.json      # question-text cleanup + extracted CLI/table text
    ├── option_fix.json          # options that were embedded in an image, not parsed as text
    ├── type_overrides.json      # questions marked 'ex' in the source but with no real exhibit
    ├── drop_img.json            # questions whose exhibit is now pure text (image dropped)
    ├── topo_exhibits/           # qN.jpg — exhibit crops as pulled straight from the PDF pages
    ├── exhibit_data.json        # classification + structured data for every exhibit
    └── *.py                     # merge/apply scripts for each override file above
```

## Build

Regenerate `data/` and `images/` from the source archive and all override files:

```bash
cd build
python3 build_data.py
```

Source data lives in `../ccna-project-archive/` (question bank, exhibits, audit log).

## Run locally

```bash
python3 -m http.server 8099
# open http://localhost:8099
```

## Data model

Each question in `questions.json`:

```jsonc
{
  "n": 1,                     // number in the bank
  "t": "Refer to the exhibit…", // prompt (cleaned up where the source dump had it garbled)
  "o": {"A": "...", "B": "..."}, // options (empty for drag-drop)
  "a": "B",                   // answer key ("BD" for multi-answer)
  "y": "ex",                  // txt | ex (exhibit) | dd (drag-drop)
  "tp": "Routing",            // original informal topic tag (unreliable, kept for reference only)
  "dom": "IPC",               // verified official CCNA domain (NF/NA/IPC/IPS/SEC/AUT)
  "why": {"A": "...", "B": "..."}, // per-option rationale — why each is right/wrong
  "img": "q173.jpg",          // exhibit filename (images/exhibits/), topology/CLI/GUI crop
  "cli": "R1#show ip route\n...", // extracted CLI/config/table text, rendered as a code block
  "exp": "...",               // detailed explanation from the online verification pass
  "disp": 1,                  // disputed key (source answer kept, but contested online)
  "dd": { "items": [...], "buckets": [{"label","correct":[...]}] } // drag-drop
}
```

## Where the bank comes from

The questions were reconstructed from a 774-page PDF dump, which is a source that is wrong
often enough to have to be checked rather than trusted. Two audits were run over it and
both are why the numbers on the home screen mean anything:

- every one of the 418 questions carrying an exhibit was checked against public sources,
  and five answer keys turned out to be wrong — #151, #986, #787, #1045, #1320 — and were
  corrected. Fourteen more are genuinely arguable; those keep the dump's key and are marked
  `disp` in the data, so the app can say so on the review screen instead of insisting.
- the dump's own topic tags were discarded entirely and all 1395 questions were classified
  against the Cisco 200-301 v1.1 blueprint, because the tags disagreed with the questions
  often enough to make the per-domain report meaningless.

Corrections never touch `data/questions.json` by hand — they live in the override files
under `build/` and are re-applied by `build_data.py` on every rebuild.

## Progress and the shared rules

`assets/js/shared/` holds what the browser and the phone must agree on: the Leitner
intervals and the queues read off them, the day counters, the topic statistics, the
300..1000 scale, the branch list of the save file, and the textbook — both how a chapter
is rendered and where its files are.
The web trainer loads them as ES modules; `ccna-mobile/src/engine/*` re-exports them and
esbuild bundles them into the APK, so there is one implementation, not two copies that
drift. `ccna-mobile/tests/interop.test.js` drives both stores and asserts each can restore
what the other exported.

Storage keys (`ccna.profile`, `ccna.attempts`, `ccna.srs`, `ccna.activity`, …) and the
shape of an attempt are the Android app's, key for key. Branches this app has no screen
for — bookmarks — are still carried through an import/export round trip untouched.

`data/theory/` is the built textbook, committed rather than generated on deploy: GitHub
Pages has no build step. `data-check.yml` rebuilds it into a temp directory on every push
and fails if the committed copy differs, so a chapter cannot be current in the APK and
stale on the site.

`shared/merge.js` is what makes two devices one history: attempts union by id, a day keeps
each device's own count, an SRS entry goes to whichever grading happened later. It is a
pure function, tested for the properties the sync loop needs — merging with yourself is a
no-op, and both devices reach the same answer from either side.

## Sync

Progress → make a key → type the same key into the Android app, and one button reconciles
both devices through `sync.maks.top` (the Worker in `ccna-sync/`). The server stores an
opaque blob and a revision number and never parses either: everything about what progress
means stays in `shared/`.

It syncs on its own at two moments: when the trainer opens, and when the tab goes away
with work the server has not seen. Not on a timer and not per answer — the shared policy
in `shared/sync.js` is what both clients follow; the phone adds a third moment to it,
coming back from the background, because an app can sit open for days without ever being
"opened" again. The button stays for when you want it now.

The key is the only secret — there are no accounts and no passwords, and the server keeps
only its SHA-256. It lives in its own storage entry, outside the seven branches, so it is
neither in the exported file nor in the blob that goes to the server. An exam in progress
is never uploaded: a running clock and a half-written answer sheet belong to the device
they were started on.

## Known follow-up work

- 37 of the 194 drag-and-drop questions have no reconstructed `dd` data and are
  excluded from scoring — reconstruct if desired.
- The 194 drag-and-drop questions have no per-option rationale (`why`) — optional.
