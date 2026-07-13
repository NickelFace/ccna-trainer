#!/usr/bin/env python3
"""Tightly crop the 'gui_screenshot' exhibits to just the UI panel, using the
percentage bounding boxes from exhibit_data.json (dropping the duplicated
question text / options / answer line that surrounds it in the original
full-page scan). Crops in place under images/exhibits/.
"""
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..'))
EXDIR = os.path.join(OUT, 'images', 'exhibits')

def main():
    exhibit = json.load(open(os.path.join(HERE, 'exhibit_data.json'), encoding='utf-8'))
    cropped, skipped = 0, []
    for n, v in exhibit.items():
        if v['category'] != 'gui_screenshot':
            continue
        box = v.get('crop_box')
        path = os.path.join(EXDIR, f'q{n}.jpg')
        if not box or not os.path.exists(path):
            skipped.append(n)
            continue
        im = Image.open(path)
        W, H = im.size
        x = max(0, box['x'] / 100 * W)
        y = max(0, box['y'] / 100 * H)
        w = box['w'] / 100 * W
        h = box['h'] / 100 * H
        right = min(W, x + w)
        bottom = min(H, y + h)
        if right - x < 20 or bottom - y < 20:
            skipped.append(n)
            continue
        im.crop((int(x), int(y), int(right), int(bottom))).save(path, quality=92)
        cropped += 1
    print(f'cropped: {cropped} | skipped (bad/missing box): {skipped}')

if __name__ == '__main__':
    main()
