#!/usr/bin/env python3
"""Merge per-batch explanation files from build/exp_parts/*.json into
build/exp_data.json, validating against the question bank.

Each part file is a flat map {"<n>": "explanation text", ...}.
Rules enforced (so a batch chat stays in its lane):
  - <n> must be a real question number in the bank;
  - the target must be a drag-drop (y == 'dd') — exp for scored MC lives in why_data;
  - the value must be a non-empty string.
Bad entries are reported and skipped, never merged.
"""
import json, os, glob

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = os.path.join(HERE, 'exp_parts')
QPATH = os.path.join(HERE, '..', 'data', 'questions.json')

def main():
    questions = {str(q['n']): q for q in json.load(open(QPATH, encoding='utf-8'))}
    merged, problems = {}, {}
    files = sorted(glob.glob(os.path.join(PARTS, '*.json')))
    for f in files:
        part = json.load(open(f, encoding='utf-8'))
        for n, exp in part.items():
            q = questions.get(n)
            if not q:
                problems[n] = 'unknown question number'; continue
            if q.get('y') != 'dd':
                problems[n] = f"not a drag-drop (y={q.get('y')!r}) — use why_data"; continue
            if not isinstance(exp, str) or not exp.strip():
                problems[n] = 'empty or non-string explanation'; continue
            merged[n] = exp.strip()
    existing = json.load(open(os.path.join(HERE, 'exp_data.json'), encoding='utf-8')) \
        if os.path.exists(os.path.join(HERE, 'exp_data.json')) else {}
    existing.update(merged)
    json.dump(existing, open(os.path.join(HERE, 'exp_data.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print(f'files: {len(files)} | merged ok: {len(merged)} | problems: {len(problems)} | total ready: {len(existing)}')
    if problems:
        print('problems:', json.dumps(problems, ensure_ascii=False)[:1000])

if __name__ == '__main__':
    main()
