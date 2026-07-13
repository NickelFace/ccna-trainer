#!/usr/bin/env python3
"""Merge per-batch domain-classification JSON files from build/classify_parts/*.json
into build/classify_overrides.json (n -> domain code string), which build_data.py
applies as the authoritative override for every question's domain.

Validates: known domain codes only, reports confidence/OTHER distribution, and
flags any question number missing from the full input set.
"""
import json, os, glob, collections

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = os.path.join(HERE, 'classify_parts')
VALID_DOMS = {'NF', 'NA', 'IPC', 'IPS', 'SEC', 'AUT'}

def main():
    all_input = json.load(open(os.path.join(HERE, 'classify_input', 'all.json'), encoding='utf-8'))
    expected_ns = {str(it['n']) for it in all_input}

    overrides = {}
    conf_counts = collections.Counter()
    other = {}
    bad = {}
    files = sorted(glob.glob(os.path.join(PARTS, '*.json')))
    for f in files:
        part = json.load(open(f, encoding='utf-8'))
        for n, v in part.items():
            dom = v.get('dom')
            conf_counts[v.get('confidence', '?')] += 1
            if dom == 'OTHER':
                other[n] = v.get('note', '')
                continue
            if dom not in VALID_DOMS:
                bad[n] = dom
                continue
            overrides[n] = dom

    missing = expected_ns - set(overrides) - set(other)
    extra = set(overrides) - expected_ns

    json.dump(overrides, open(os.path.join(HERE, 'classify_overrides.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    print(f'files: {len(files)} | classified: {len(overrides)} | OTHER: {len(other)} | bad dom: {len(bad)}')
    print('confidence distribution:', dict(conf_counts))
    print(f'missing from expected set: {len(missing)}', sorted(missing)[:20] if missing else '')
    print(f'unexpected extra ns: {len(extra)}', sorted(extra)[:20] if extra else '')
    if other:
        print('OTHER questions:', json.dumps(other, ensure_ascii=False)[:1500])
    if bad:
        print('bad domain codes:', bad)

if __name__ == '__main__':
    main()
