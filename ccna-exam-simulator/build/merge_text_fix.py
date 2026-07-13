#!/usr/bin/env python3
"""Merge build/text_fix/output.json (t/cli/o text-formatting fixes) into
build/text_overrides.json, consumed by build_data.py."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))

def main():
    out_path = os.path.join(HERE, 'text_fix', 'output.json')
    fixes = json.load(open(out_path, encoding='utf-8'))
    dest = os.path.join(HERE, 'text_overrides.json')
    existing = json.load(open(dest, encoding='utf-8')) if os.path.exists(dest) else {}
    existing.update(fixes)
    json.dump(existing, open(dest, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'merged {len(fixes)} question fixes -> text_overrides.json ({len(existing)} total)')

if __name__ == '__main__':
    main()
