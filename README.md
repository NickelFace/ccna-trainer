# CCNA-trainer

Offline-first web app that simulates the Cisco **CCNA 200-301** certification
exam, plus the archive/build pipeline that produced its question bank.

**Live:** https://ccna.maks.top · **Full docs:** [ccna-exam-simulator/README.md](ccna-exam-simulator/README.md) ([Russian](ccna-exam-simulator/README.ru.md))

## Quick start

```bash
./run.sh
# open http://localhost:8099
```

## Layout

- [`ccna-exam-simulator/`](ccna-exam-simulator/) — the app itself (static
  HTML/CSS/JS, no backend) and the `build/` pipeline that regenerates its
  question bank from the source archive.
- `run.sh` / `stop.sh` — start/stop the local dev server (port 8099).

See [ccna-exam-simulator/README.md](ccna-exam-simulator/README.md) for
features, the data model, and how to rebuild the question bank.
