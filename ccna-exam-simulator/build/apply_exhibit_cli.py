#!/usr/bin/env python3
"""Apply the exhibit-classification fleet's results, cheapest wins first:

1. cli_output questions: inject extracted text as 'cli', drop the 'img' reference
   entirely (the screenshot is now redundant with clean, selectable text).
2. mixed questions: inject 'cli' too, but KEEP 'img' for now — the topology half
   still needs the SVG redraw phase before the image can be dropped.
3. topology-only questions: no text/image change yet; their structured device/link
   data lives in exhibit_data.json for the later redraw pilot.
4. gui_screenshot / other: untouched here.

Writes build/text_overrides.json entries (t/cli, reusing the existing override
mechanism build_data.py already merges) rather than editing questions.json directly.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))

def main():
    exhibit = json.load(open(os.path.join(HERE, 'exhibit_data.json'), encoding='utf-8'))
    text_over_path = os.path.join(HERE, 'text_overrides.json')
    text_over = json.load(open(text_over_path, encoding='utf-8')) if os.path.exists(text_over_path) else {}

    drop_img_path = os.path.join(HERE, 'drop_img.json')
    drop_img = json.load(open(drop_img_path, encoding='utf-8')) if os.path.exists(drop_img_path) else []
    drop_img = set(drop_img)

    n_cli_pure = n_cli_mixed = 0
    for n, v in exhibit.items():
        cat = v['category']
        if cat == 'cli_output' and v.get('cli'):
            entry = text_over.setdefault(n, {})
            entry['cli'] = v['cli']
            drop_img.add(n)
            n_cli_pure += 1
        elif cat == 'mixed' and v.get('cli'):
            entry = text_over.setdefault(n, {})
            entry['cli'] = v['cli']
            n_cli_mixed += 1

    json.dump(text_over, open(text_over_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(sorted(drop_img, key=int), open(drop_img_path, 'w', encoding='utf-8'), indent=1)
    print(f'cli_output applied (img dropped): {n_cli_pure}')
    print(f'mixed cli applied (img kept): {n_cli_mixed}')
    print(f'total drop_img list: {len(drop_img)}')

if __name__ == '__main__':
    main()
