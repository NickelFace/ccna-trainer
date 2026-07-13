#!/usr/bin/env python3
"""Merge per-batch drag-drop JSON files from build/dd_parts/*.json into
build/dd_data.json, validating structure. Reports skips and problems.

Each part file is {"<n>": {"items":[...],"buckets":[{"label","correct":[...]}]}}
or {"<n>": {"skip": "reason"}}.
"""
import json, os, glob

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = os.path.join(HERE, 'dd_parts')

def validate(n, d):
    problems = []
    if 'skip' in d:
        return 'skip', d['skip']
    items = d.get('items'); buckets = d.get('buckets')
    if not items or not buckets:
        return 'bad', 'missing items/buckets'
    itemset = set(items)
    placed = []
    for b in buckets:
        if 'label' not in b or 'correct' not in b:
            problems.append('bucket missing label/correct')
            continue
        for c in b['correct']:
            if c not in itemset:
                problems.append(f'correct not in items: {c!r}')
            placed.append(c)
    # every item placed exactly once (ideal); warn otherwise
    unplaced = itemset - set(placed)
    if unplaced:
        problems.append(f'unplaced items: {sorted(unplaced)}')
    return ('ok' if not problems else 'warn'), problems

def main():
    merged, skips, bad = {}, {}, {}
    files = sorted(glob.glob(os.path.join(PARTS, '*.json')))
    for f in files:
        part = json.load(open(f, encoding='utf-8'))
        for n, d in part.items():
            status, info = validate(n, d)
            if status == 'skip':
                skips[n] = info
            elif status == 'bad':
                bad[n] = info
            else:
                merged[n] = {k: v for k, v in d.items() if k in ('items', 'buckets', 'note')}
                if status == 'warn':
                    print(f'  WARN q{n}: {info}')
    out = os.path.join(HERE, 'dd_data.json')
    # keep existing manual entries (e.g. pilot #3) not overwritten by parts
    existing = json.load(open(out, encoding='utf-8')) if os.path.exists(out) else {}
    existing.update(merged)
    json.dump(existing, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'files: {len(files)} | ready: {len(existing)} | skipped: {len(skips)} | bad: {len(bad)}')
    if skips: print('skips:', json.dumps(skips, ensure_ascii=False)[:600])
    if bad: print('bad:', json.dumps(bad, ensure_ascii=False)[:600])

if __name__ == '__main__':
    main()
