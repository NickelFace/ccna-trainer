# CCNA 200-301 Exam Simulator

A self-contained, offline-first web app that simulates the Cisco **CCNA 200-301**
certification exam using a verified 1395-question bank (1401 in the source dump,
minus duplicates). No backend — static files
only. [Russian version](README.ru.md).

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
  per-domain score breakdown.
- **Custom Exam** — filter by domain and question type (text / exhibit / drag-and-drop),
  pick question count and timer.
- **Practice** — one question at a time, instant feedback.
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
- **Topology diagrams** — all 211 topologies are redrawn as clean SVG
  (dark-terminal style, one icon per device type, see
  `../diagrams/diagram-style-prompt.md`). Only 21 GUI screenshots remain
  raster (Cisco WLC interface and Windows dialogs) — redrawing those makes
  no sense, they look the same on the real exam.
- Answer key verified online (418/418 exhibit questions); key corrections applied
  where the source dump's answer was wrong.

## Structure

```
ccna-exam-simulator/
├── index.html
├── assets/
│   ├── css/styles.css
│   └── js/app.js               # engine: modes, rendering, drag-drop, rationale, scoring
├── data/
│   ├── questions.json          # question bank (exhibit images referenced by filename)
│   └── meta.json                # domain blueprint + counts
├── images/
│   ├── topo/                    # qN.svg — 211 hand-redrawn topology diagrams
│   └── exhibits/                # qN.jpg — 21 remaining raster GUI screenshots
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
    ├── svg_data.json            # question -> redrawn topology SVG filename
    ├── exhibit_data.json        # classification + structured data for all 382 exhibits
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
  "svg": "q1.svg",            // redrawn topology diagram (images/topo/)
  "img": "q173.jpg",          // raster exhibit filename (only 21 GUI screenshots left)
  "cli": "R1#show ip route\n...", // extracted CLI/config/table text, rendered as a code block
  "exp": "...",               // detailed explanation from the online verification pass
  "disp": 1,                  // disputed key (source answer kept, but contested online)
  "dd": { "items": [...], "buckets": [{"label","correct":[...]}] } // drag-drop
}
```

## Known follow-up work

- 37 of the 194 drag-and-drop questions have no reconstructed `dd` data and are
  excluded from scoring — reconstruct if desired.
- The 194 drag-and-drop questions have no per-option rationale (`why`) — optional.
