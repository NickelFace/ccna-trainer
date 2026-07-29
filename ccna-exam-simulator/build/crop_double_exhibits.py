#!/usr/bin/env python3
"""Обрезка 'двойных' экспонатов: в кадр попал экспонат соседнего вопроса.
Для каждого вопроса из KEEP оставляем верхнюю или нижнюю половину картинки,
разрез — по самому большому пустому промежутку между блоками контента.
Оригиналы копируются в build/exhibit_backup_double/.
Список и обоснование: build/double_exhibit_audit.md
"""
import os, shutil
from PIL import Image
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
EX = os.path.normpath(os.path.join(HERE, '..', 'images', 'exhibits'))
BAK = os.path.join(HERE, 'exhibit_backup_double')

KEEP = {
    247:'top', 266:'bottom', 276:'bottom', 280:'top', 343:'bottom', 354:'top',
    399:'bottom', 402:'top', 415:'bottom', 418:'top', 429:'bottom', 443:'top',
    446:'bottom', 451:'bottom', 464:'top', 482:'bottom', 487:'top', 492:'top',
    496:'top', 530:'top', 902:'top', 981:'bottom', 1045:'top', 1056:'bottom',
    1172:'bottom', 1355:'top', 1359:'bottom',
}
# 1356: правильный экспонат — нижняя половина картинки вопроса 1355
FROM_OTHER = {1356: (1355, 'bottom')}


def bands(img):
    a = np.asarray(img.convert('L'))
    H, W = a.shape
    ink = (a < 150).sum(axis=1) / W
    rows = ink > 0.005
    bs, s = [], None
    for i, v in enumerate(rows):
        if v and s is None:
            s = i
        if not v and s is not None:
            bs.append((s, i)); s = None
    if s is not None:
        bs.append((s, H))
    merged = []
    for b in bs:
        if merged and b[0] - merged[-1][1] < 0.03 * H:
            merged[-1] = (merged[-1][0], b[1])
        else:
            merged.append(b)
    return [b for b in merged if (b[1] - b[0]) > 0.04 * H], H


def split_box(img):
    """Границы (конец верхней части, начало нижней части) по самому большому промежутку."""
    bs, H = bands(img)
    if len(bs) < 2:
        return None
    gaps = [(bs[i + 1][0] - bs[i][1], i) for i in range(len(bs) - 1)]
    g, i = max(gaps)
    pad = int(0.015 * H)
    return min(H, bs[i][1] + pad), max(0, bs[i + 1][0] - pad), H


def crop(src_path, side):
    im = Image.open(src_path).convert('RGB')
    r = split_box(im)
    if r is None:
        return None
    top_end, bottom_start, H = r
    box = (0, 0, im.width, top_end) if side == 'top' else (0, bottom_start, im.width, H)
    return im.crop(box)


def main():
    os.makedirs(BAK, exist_ok=True)
    done, failed = [], []
    # сначала достаём чужой экспонат, пока источник ещё не обрезан
    for n, (src_n, side) in FROM_OTHER.items():
        src = os.path.join(EX, f'q{src_n}.jpg')
        dst = os.path.join(EX, f'q{n}.jpg')
        out = crop(src, side)
        if out is None:
            failed.append(n); continue
        shutil.copy2(dst, os.path.join(BAK, f'q{n}.jpg'))
        out.save(dst, quality=92)
        done.append(n)
    for n, side in KEEP.items():
        p = os.path.join(EX, f'q{n}.jpg')
        out = crop(p, side)
        if out is None:
            failed.append(n); continue
        shutil.copy2(p, os.path.join(BAK, f'q{n}.jpg'))
        out.save(p, quality=92)
        done.append(n)
    print(f'обрезано: {len(done)} | не удалось: {failed}')


if __name__ == '__main__':
    main()
