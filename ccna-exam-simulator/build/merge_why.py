#!/usr/bin/env python3
"""Merge per-batch 'why' (per-option rationale) JSON files from
build/why_parts/*.json into build/why_data.json, validating structure
against the actual question bank (keys must match option letters).
"""
import json, os, glob

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = os.path.join(HERE, 'why_parts')
QPATH = os.path.join(HERE, '..', 'data', 'questions.json')

def main():
    questions = {str(q['n']): q for q in json.load(open(QPATH, encoding='utf-8'))}
    merged = {}
    problems = {}
    files = sorted(glob.glob(os.path.join(PARTS, '*.json')))
    for f in files:
        part = json.load(open(f, encoding='utf-8'))
        for n, why in part.items():
            q = questions.get(n)
            if not q:
                problems[n] = 'unknown question number'; continue
            opt_keys = set(q.get('o', {}).keys())
            why_keys = set(why.keys())
            missing = opt_keys - why_keys
            extra = why_keys - opt_keys
            if missing:
                problems[n] = f'missing options: {sorted(missing)}'
                continue
            if extra:
                why = {k: v for k, v in why.items() if k in opt_keys}
            merged[n] = why
    existing = json.load(open(os.path.join(HERE, 'why_data.json'), encoding='utf-8')) \
        if os.path.exists(os.path.join(HERE, 'why_data.json')) else {}
    existing.update(merged)
    json.dump(existing, open(os.path.join(HERE, 'why_data.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print(f'files: {len(files)} | merged ok: {len(merged)} | problems: {len(problems)} | total ready: {len(existing)}')
    if problems:
        print('problems:', json.dumps(problems, ensure_ascii=False)[:1000])

if __name__ == '__main__':
    main()
