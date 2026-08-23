#!/usr/bin/env python3
"""NetPath brand mark — single source of geometry.

The mark is three rounded bars of growing height; the third one carries the accent.
Every other brand asset in the repo is derived from the table below, so a change to
the geometry is a change in one place:

    brand/*.svg                     the mark on light, on dark, and monochrome
    ccna-mobile/.../drawable/       adaptive-icon foreground + monochrome layers
    ccna-mobile/.../mipmap-*dpi/    legacy raster launcher icons, square and round
    brand/play-store-512.png        store listing icon

Run `python3 brand/generate.py` from the repo root after editing anything here.
Needs cairosvg (rasterising) — everything else is stdlib.
"""

from pathlib import Path

import cairosvg

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
RES = ROOT / "ccna-mobile" / "android" / "app" / "src" / "main" / "res"

# ---------------------------------------------------------------- geometry --
# Design-spec coordinates, viewBox 0 0 86 86 (design_handoff_netpath/README.md).
VIEWBOX = 86
STEPS = [  # x, y, w, h, rx
    (8, 58, 20, 20, 7),
    (33, 38, 20, 40, 7),
    (58, 12, 20, 66, 7),
]

INK = "#16181D"       # near-black, steps 1-2 on light and the icon background
BONE = "#F7F4EE"      # steps 1-2 inverted on dark
GOLD = "#C9A24A"      # accent, step 3 in every colourway
MONO = "#8A8578"      # single-colour lockup

# Android adaptive icon: 108dp canvas. The spec asks for a 20% inset on every side,
# which is tighter than the 72dp (66.7%) safe zone, so no mask can reach the glyph.
CANVAS = 108
INSET = 0.20


def rounded_rect_path(x, y, w, h, r):
    """Vector drawables have no <rect>, so corners are spelled out as arcs."""
    r = min(r, w / 2, h / 2)
    return (
        f"M{x + r:.3f},{y:.3f} "
        f"H{x + w - r:.3f} "
        f"A{r:.3f},{r:.3f} 0 0 1 {x + w:.3f},{y + r:.3f} "
        f"V{y + h - r:.3f} "
        f"A{r:.3f},{r:.3f} 0 0 1 {x + w - r:.3f},{y + h:.3f} "
        f"H{x + r:.3f} "
        f"A{r:.3f},{r:.3f} 0 0 1 {x:.3f},{y + h - r:.3f} "
        f"V{y + r:.3f} "
        f"A{r:.3f},{r:.3f} 0 0 1 {x + r:.3f},{y:.3f} Z"
    )


def fitted_steps(canvas=CANVAS, inset=INSET):
    """Steps remapped from the 86-unit design grid onto `canvas`, inset on all sides.

    The glyph's own bounding box is 70x66 and sits off-centre in the 86 viewBox, so
    fitting the viewBox instead of the box would leave the silhouette visually high.
    """
    x0 = min(s[0] for s in STEPS)
    y0 = min(s[1] for s in STEPS)
    x1 = max(s[0] + s[2] for s in STEPS)
    y1 = max(s[1] + s[3] for s in STEPS)
    box_w, box_h = x1 - x0, y1 - y0

    avail = canvas * (1 - 2 * inset)
    scale = min(avail / box_w, avail / box_h)
    off_x = (canvas - box_w * scale) / 2
    off_y = (canvas - box_h * scale) / 2

    return [
        (
            (x - x0) * scale + off_x,
            (y - y0) * scale + off_y,
            w * scale,
            h * scale,
            r * scale,
        )
        for x, y, w, h, r in STEPS
    ]


# -------------------------------------------------------------------- SVG ---
def mark_svg(colors, size=VIEWBOX):
    rects = "\n".join(
        f'  <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{c}"/>'
        for (x, y, w, h, r), c in zip(STEPS, colors)
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEWBOX} {VIEWBOX}" '
        f'width="{size}" height="{size}" role="img" aria-label="NetPath">\n'
        f"{rects}\n</svg>\n"
    )


def icon_svg(size, corner_ratio=None, circle=False, background=INK):
    """Full launcher icon: background plate plus the inset glyph."""
    steps = fitted_steps(canvas=size)
    if circle:
        plate = f'<circle cx="{size / 2}" cy="{size / 2}" r="{size / 2}" fill="{background}"/>'
    elif corner_ratio:
        r = size * corner_ratio
        plate = f'<rect width="{size}" height="{size}" rx="{r:.3f}" fill="{background}"/>'
    else:
        plate = f'<rect width="{size}" height="{size}" fill="{background}"/>'
    rects = "\n".join(
        f'  <rect x="{x:.3f}" y="{y:.3f}" width="{w:.3f}" height="{h:.3f}" '
        f'rx="{r:.3f}" fill="{c}"/>'
        for (x, y, w, h, r), c in zip(steps, [BONE, BONE, GOLD])
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'width="{size}" height="{size}">\n  {plate}\n{rects}\n</svg>\n'
    )


# ------------------------------------------------------- Android drawables --
def vector_drawable(colors, comment):
    paths = "\n".join(
        f'    <path\n        android:fillColor="{c}"\n'
        f'        android:pathData="{rounded_rect_path(x, y, w, h, r)}" />'
        for (x, y, w, h, r), c in zip(fitted_steps(), colors)
    )
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f"<!--\n  {comment}\n-->\n"
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        f'    android:width="{CANVAS}dp"\n'
        f'    android:height="{CANVAS}dp"\n'
        f'    android:viewportWidth="{CANVAS}"\n'
        f'    android:viewportHeight="{CANVAS}">\n'
        f"{paths}\n</vector>\n"
    )


def png(svg, path, size):
    path.parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(
        bytestring=svg.encode(), write_to=str(path),
        output_width=size, output_height=size,
    )


DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def main():
    BRAND.mkdir(exist_ok=True)

    # Vector sources for the site, docs and any future export.
    (BRAND / "netpath-mark.svg").write_text(mark_svg([INK, INK, GOLD]))
    (BRAND / "netpath-mark-inverse.svg").write_text(mark_svg([BONE, BONE, GOLD]))
    (BRAND / "netpath-mark-mono.svg").write_text(mark_svg([MONO, MONO, MONO]))
    (BRAND / "netpath-icon.svg").write_text(icon_svg(176, corner_ratio=46 / 176))

    # Adaptive icon layers. The background stays a separate flat colour layer
    # (values/ic_launcher_background.xml) so no mask can slice into the glyph.
    (RES / "drawable" / "ic_launcher_foreground.xml").write_text(
        vector_drawable(
            [BONE, BONE, GOLD],
            "Launcher foreground: the NetPath mark, inset 20% on every side of the\n"
            "  108dp adaptive canvas — inside the 72dp safe zone, so no launcher mask\n"
            "  clips it. Generated by brand/generate.py; edit the geometry there.",
        )
    )
    (RES / "drawable" / "ic_launcher_monochrome.xml").write_text(
        vector_drawable(
            ["#FFFFFF", "#FFFFFF", "#FFFFFF"],
            "Themed-icon layer (Android 13+): the silhouette in one colour on a\n"
            "  transparent background — the launcher recolours it to the wallpaper\n"
            "  palette, so the gold accent must not survive into this layer.\n"
            "  Generated by brand/generate.py.",
        )
    )

    # Legacy raster launcher icons for pre-Oreo launchers.
    square = icon_svg(432, corner_ratio=46 / 176)
    round_ = icon_svg(432, circle=True)
    for density, size in DENSITIES.items():
        png(square, RES / f"mipmap-{density}" / "ic_launcher.png", size)
        png(round_, RES / f"mipmap-{density}" / "ic_launcher_round.png", size)

    # Store listing: full-bleed square, no transparency, no baked rounding.
    png(icon_svg(512), BRAND / "play-store-512.png", 512)

    # Legibility check at the documented 20px floor.
    png(mark_svg([INK, INK, GOLD]), BRAND / "checks" / "mark-20px.png", 20)
    png(icon_svg(176, corner_ratio=46 / 176), BRAND / "checks" / "icon-176.png", 176)
    png(icon_svg(176, circle=True), BRAND / "checks" / "icon-round-176.png", 176)

    print("brand assets regenerated")


if __name__ == "__main__":
    main()
