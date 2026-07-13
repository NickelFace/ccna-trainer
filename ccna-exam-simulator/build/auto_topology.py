#!/usr/bin/env python3
"""Algorithmic layout for CCNA topology exhibits -> SVG (dark-terminal style kit).

Unlike the hand-placed pilot (gen_topology_svg.py + pilot_scenes.py), this computes
node positions (BFS layering) and link endpoints (trig-based icon-edge offsets) from
the extracted devices/links/zones data itself, so links can never end up disconnected
and canvases are always sized to fit their content — the two bug classes the pilot's
freehand coordinates fell into 30% of the time.
"""
import os, math, collections, html, re

# extraction agents sometimes left their own aside/uncertainty commentary in a
# 'note' field instead of real diagram content (e.g. "no dedicated phone type
# available", "unlabeled switch icon") — filter it out rather than render it.
META_NOTE = re.compile(
    r'no dedicated|not available|unlabeled|closest available|ambiguous|no explicit|'
    r'unnamed|unclear|not shown|not explicitly|no.*type (exists|available)|classified (as|closest)|'
    r'shown as|shown with|represents a|depicted as|rather than|multiple pcs|grouped|group of|'
    r'crossed link|dashed line between|drawn as|not a physical|not a real|is a placeholder|'
    r'referenced as|icon at top|icon used for',
    re.I)

def is_real_note(text):
    return bool(text) and not META_NOTE.search(text)

def trunc(text, limit):
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(' ', 1)[0]
    return (cut or text[:limit]) + '…'
from gen_topology_svg import DEFS, COLOR, esc

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.normpath(os.path.join(HERE, '..', 'images', 'topo'))

# every icon renders at a fixed 64x64 box (half-width 32) regardless of type — the
# radius links stop at must match that uniformly, or a link visibly floats short of
# (or plunges into) icons whose old per-type radius didn't match the real box
ICON_R = {'router': 32, 'sw2': 32, 'sw3': 32, 'pc': 32, 'server': 32, 'firewall': 32, 'ap': 32, 'internet': 32}
# each symbol's drawn glyph is much smaller than its 64x64 box (lots of built-in
# padding in the icon viewBoxes) — labels anchored off ICON_R float ~15-20px away
# from what's actually visible. These are the glyph's real bottom/right edge
# distance from icon center at 64px render scale, so a label can hug it instead.
HUG_BOTTOM = {'router': 18, 'sw2': 15, 'sw3': 15, 'pc': 18, 'server': 19, 'firewall': 14, 'ap': 15, 'internet': 12}
HUG_RIGHT = {'router': 18, 'sw2': 21, 'sw3': 21, 'pc': 18, 'server': 11, 'firewall': 18, 'ap': 16, 'internet': 20}
LAYER_H = 185
NODE_W = 150
MARGIN = 95

def layered_positions(devices, links):
    ids = [d['id'] for d in devices]
    adj = collections.defaultdict(set)
    for l in links:
        if l.get('from') in ids and l.get('to') in ids and l['from'] != l['to']:
            adj[l['from']].add(l['to']); adj[l['to']].add(l['from'])
    # root: highest-degree node, prefer internet/router type if tied
    type_rank = {'internet': 0, 'router': 1, 'firewall': 2, 'sw3': 3, 'sw2': 4, 'server': 5, 'ap': 6, 'pc': 7}
    dtype = {d['id']: d['type'] for d in devices}
    def rank(i):
        return (type_rank.get(dtype.get(i), 9), -len(adj[i]))
    root = sorted(ids, key=rank)[0] if ids else None
    layer = {root: 0} if root else {}
    order = [root] if root else []
    q = collections.deque([root] if root else [])
    while q:
        cur = q.popleft()
        for nb in sorted(adj[cur]):
            if nb not in layer:
                layer[nb] = layer[cur] + 1
                order.append(nb); q.append(nb)
    # any disconnected leftovers get their own trailing layer
    leftover = [i for i in ids if i not in layer]
    if leftover:
        maxl = max(layer.values(), default=-1)
        for i in leftover:
            layer[i] = maxl + 1; order.append(i)
    by_layer = collections.defaultdict(list)
    for i in order:
        by_layer[layer[i]].append(i)
    maxw = max((len(v) for v in by_layer.values()), default=1)
    canvas_w = max(420, maxw * NODE_W + 2 * MARGIN)
    pos = {}
    for ly, members in by_layer.items():
        y = MARGIN + ly * LAYER_H
        n = len(members)
        span = n * NODE_W
        start_x = (canvas_w - span) / 2 + NODE_W / 2
        for i, node in enumerate(members):
            pos[node] = (start_x + i * NODE_W, y)
    canvas_h = MARGIN + max(layer.values(), default=0) * LAYER_H + 100
    return pos, canvas_w, canvas_h

def explicit_positions(devices, layout, margin=84):
    # layout: {device_id: [x_frac, y_frac]} extracted by eye from the ORIGINAL exhibit
    # screenshot, 0..1 within the diagram's own bounding box — used verbatim so the
    # rendered arrangement (triangle stays a triangle, left stays left) matches the
    # source exactly instead of being reflowed by the BFS auto-layout below.
    # Canvas scales with device count: dense diagrams (8+ devices packed into the
    # same 0..1 grid) need more absolute pixels between fractions to leave room for
    # each icon's label chip + note text, or neighbors on a tight grid collide.
    ids = [d['id'] for d in devices]
    if not ids or not all(i in layout for i in ids):
        return None
    n = len(ids)
    w = max(620, min(900, 460 + n * 28))
    h = max(440, min(760, 340 + n * 24))
    pos = {}
    for i in ids:
        fx, fy = layout[i]
        pos[i] = (margin + fx * (w - 2 * margin), margin + fy * (h - 2 * margin))
    resolve_device_overlaps(pos, ids)
    # the overlap resolver can push devices past the original canvas edge —
    # re-expand to fit with the same margin, and re-center so it isn't lopsided
    xs = [pos[i][0] for i in ids]; ys = [pos[i][1] for i in ids]
    min_x, max_x = min(xs) - margin, max(xs) + margin
    min_y, max_y = min(ys) - margin, max(ys) + margin
    if min_x < 0 or min_y < 0 or max_x > w or max_y > h:
        shift_x, shift_y = max(0, -min_x), max(0, -min_y)
        for i in ids:
            pos[i] = (pos[i][0] + shift_x, pos[i][1] + shift_y)
        w = max(w, max_x + shift_x)
        h = max(h, max_y + shift_y)
    return pos, w, h

def resolve_device_overlaps(pos, ids, min_gap=100, iterations=60):
    # a hand-estimated fraction grid occasionally puts two devices' icon+label-chip
    # footprints closer than they need — nudge them apart along the vector that
    # already connects them (never a random direction), so a vertical chain stays
    # a vertical chain and a left/right pair stays left/right, just with more room
    for _ in range(iterations):
        moved = False
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                a, b = ids[i], ids[j]
                ax, ay = pos[a]; bx, by = pos[b]
                dx, dy = bx - ax, by - ay
                dist = math.hypot(dx, dy)
                if dist < min_gap:
                    if dist < 1e-6:
                        ux, uy = 1.0, 0.0
                    else:
                        ux, uy = dx / dist, dy / dist
                    push = (min_gap - dist) / 2 + 0.5
                    pos[a] = (ax - ux * push, ay - uy * push)
                    pos[b] = (bx + ux * push, by + uy * push)
                    moved = True
        if not moved:
            break

def edge_point(x1, y1, x2, y2, r):
    dx, dy = x2 - x1, y2 - y1
    dist = math.hypot(dx, dy) or 1
    return x1 + dx / dist * r, y1 + dy / dist * r

def perp(x1, y1, x2, y2, dist):
    dx, dy = x2 - x1, y2 - y1
    d = math.hypot(dx, dy) or 1
    return -dy / d * dist, dx / d * dist

def label_lean(d_id, x, y, links, pos):
    # a device's name chip always sits directly below its icon; if a link also
    # exits ~straight down (the common case in a vertical chain), the chip and
    # the wire draw on top of each other. Detect that and report which way to
    # nudge the chip sideways to clear it (away from the blocking link's side,
    # or a default lean if the link is perfectly vertical).
    blocked, lean = False, 0
    for l in links:
        a, b = l.get('from'), l.get('to')
        if d_id == a:
            other = b
        elif d_id == b:
            other = a
        else:
            continue
        if other not in pos:
            continue
        ox, oy = pos[other]
        dx, dy = ox - x, oy - y
        if dy > 20 and abs(dx) < 40:
            blocked = True
            lean += 1 if dx >= 0 else -1
    return blocked, lean

def pill(x, y, text, w=None):
    w = w or max(28, 12 + len(text) * 6.2)
    return (f'<g font-size="9" text-anchor="middle" fill="#94a3b8">'
            f'<rect x="{x-w/2:.1f}" y="{y-7:.1f}" width="{w:.1f}" height="14" rx="4" '
            f'fill="#131a28" stroke="#2a3548" stroke-width="0.6"/>'
            f'<text x="{x:.1f}" y="{y+3:.1f}">{esc(text)}</text></g>')

# --- greedy collision avoidance for link labels/notes -----------------------
# Real topologies converge several links on one hub (a switch with 3+ uplinks);
# fixed offsets/alternating parity still stack two labels on the same spot when
# their link geometries happen to mirror each other. Instead, track every
# placed label's bounding box and, on collision, walk the candidate point
# outward along a search direction until it clears — generalizes correctly
# instead of hand-tuning per-topology constants.

def rect_box(cx, cy, w, h):
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)

def boxes_overlap(a, b):
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])

def any_overlap(box, placed):
    return any(boxes_overlap(box, p) for p in placed)

def pill_box(cx, cy, text):
    w = max(28, 12 + len(text) * 6.2)
    return rect_box(cx, cy, w, 14)

def note_box(cx, cy, text):
    w = max(20, len(text) * 5.4 + 6)
    return rect_box(cx, cy, w, 11)

def find_spot(cx, cy, box_fn, dirx, diry, placed, step=9, max_tries=24):
    x, y = cx, cy
    tries = 0
    while any_overlap(box_fn(x, y), placed) and tries < max_tries:
        tries += 1
        k = (tries + 1) // 2
        sign = 1 if tries % 2 == 1 else -1
        x = cx + dirx * step * k * sign
        y = cy + diry * step * k * sign
    placed.append(box_fn(x, y))
    return x, y

def render(n, topo, title=None, desc=None):
    devices = topo.get('devices', [])
    links = topo.get('links', [])
    zones = topo.get('zones', [])
    if not devices:
        return None
    # drop devices the extracted link list never actually connects (a data gap,
    # not a real isolated node) — a floating unconnected icon is more confusing than omitting it
    if links:
        linked_ids = {l['from'] for l in links} | {l['to'] for l in links}
        devices = [d for d in devices if d['id'] in linked_ids] or devices
    layout = topo.get('layout')
    result = explicit_positions(devices, layout) if layout else None
    pos, w, h = result if result else layered_positions(devices, links)
    title = title or f'Question {n} topology'
    desc = desc or (', '.join(d.get('label', d['id']) for d in devices))

    out = [f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" '
           f'role="img" font-family="\'JetBrains Mono\',\'Fira Code\',ui-monospace,monospace">',
           f'<title>{esc(title)}</title><desc>{esc(desc)}</desc>', DEFS,
           f'<rect x="0" y="0" width="{w}" height="{h}" fill="#0a0e17"/>',
           f'<rect x="0" y="0" width="{w}" height="{h}" fill="url(#grid)"/>',
           f'<text x="18" y="26" fill="#00d4ff" font-size="13" letter-spacing="1">// {esc(title)}</text>']

    # zones: bounding box of member positions + padding, drawn first (background)
    for zi, z in enumerate(zones):
        members = [m for m in z.get('members', []) if m in pos]
        if not members:
            continue
        xs = [pos[m][0] for m in members]; ys = [pos[m][1] for m in members]
        pad = 55
        zx, zy = min(xs) - pad, max(52, min(ys) - pad - 10)
        zw, zh = max(xs) - min(xs) + 2 * pad, max(ys) - min(ys) + 2 * pad + 20 - (zy - (min(ys) - pad - 10))
        out.append(f'<rect x="{zx}" y="{zy}" width="{zw}" height="{zh}" rx="10" fill="#94a3b8" '
                    f'fill-opacity="0.06" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="6 4"/>')
        out.append(f'<text x="{zx+12}" y="{zy+16}" fill="#94a3b8" font-size="11">{esc(z.get("label",""))}</text>')

    dtype = {d['id']: d for d in devices}

    # seed collision boxes with every device's icon + label chip + note BEFORE
    # placing any link text, so link labels always route around devices first
    placed = []
    dev_label = {}
    for d in devices:
        if d['id'] not in pos:
            continue
        x, y = pos[d['id']]
        t = d['type'] if d['type'] in COLOR else 'router'
        label = d.get('label') or d['id']
        if '(' in label or len(label) > 18:
            label = d['id']
        dev_label[d['id']] = label
        chip_w = 16 + 7 + 4 + len(label) * 6.5
        note = d.get('note')
        if t == 'pc':
            # end-host convention: hostname sits beside the icon (not below, where
            # its IP note goes) — matches the source exhibits' PC/host labeling
            cx = x + HUG_RIGHT.get(t, 18) + 4
            placed.append(rect_box(x, y, 70, 70))
            placed.append(rect_box(cx + chip_w / 2, y, chip_w, 16))
            if is_real_note(note):
                placed.append(note_box(x, y + HUG_BOTTOM.get(t, 18) + 12, trunc(note, 44)))
        else:
            cy = y + HUG_BOTTOM.get(t, 18) - 2
            placed.append(rect_box(x, y, 70, 70))
            blocked, lean = label_lean(d['id'], x, y, links, pos)
            lx = x - (chip_w / 2 + 3) * (1 if lean >= 0 else -1) if blocked else x
            placed.append(rect_box(lx, cy + 8, chip_w, 16))
            if is_real_note(note):
                placed.append(note_box(lx, cy + 27, trunc(note, 44)))

    seen_pairs = set()
    note_i = 0
    for l in links:
        a, b = l.get('from'), l.get('to')
        if a not in pos or b not in pos or a == b:
            continue
        key = tuple(sorted([a, b])) + (l.get('label', ''),)
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        x1, y1 = pos[a]; x2, y2 = pos[b]
        ra = ICON_R.get(dtype[a]['type'], 32); rb = ICON_R.get(dtype[b]['type'], 32)
        ex1, ey1 = edge_point(x1, y1, x2, y2, ra)
        ex2, ey2 = edge_point(x2, y2, x1, y1, rb)
        out.append(f'<line x1="{ex1:.1f}" y1="{ey1:.1f}" x2="{ex2:.1f}" y2="{ey2:.1f}" '
                    f'stroke="#64748b" stroke-width="2" stroke-linecap="round"/>')
        mx, my = (ex1 + ex2) / 2, (ey1 + ey2) / 2
        lbl_a, lbl_b = l.get('label'), l.get('label2')
        # unit vector perpendicular to the link — the search axis candidate
        # placements walk along when their default spot is already taken
        ux, uy = perp(ex1, ey1, ex2, ey2, 1)
        if note_i % 2:
            ux, uy = -ux, -uy
        link_len = math.hypot(ex2 - ex1, ey2 - ey1) or 1
        d_end = min(19, link_len * 0.25)
        t_end = d_end / link_len
        if lbl_a and lbl_b and lbl_a != lbl_b:
            # each endpoint gets its OWN pill sitting right next to ITS device —
            # matches the source exhibits (e.g. "10.1.1.1" by router A, "10.1.1.2"
            # by router B) instead of one combined "10.1.1.1 / 10.1.1.2" blob that
            # reads as belonging to neither device
            ax0, ay0 = ex1 + (ex2 - ex1) * t_end + ux * 13, ey1 + (ey2 - ey1) * t_end + uy * 13
            bx0, by0 = ex2 + (ex1 - ex2) * t_end + ux * 13, ey2 + (ey1 - ey2) * t_end + uy * 13
            ax, ay = find_spot(ax0, ay0, lambda x, y: pill_box(x, y, lbl_a), ux, uy, placed)
            bx, by = find_spot(bx0, by0, lambda x, y: pill_box(x, y, lbl_b), ux, uy, placed)
            out.append(pill(ax, ay, lbl_a))
            out.append(pill(bx, by, lbl_b))
        elif lbl_a or lbl_b:
            # only one endpoint carries a label (the other side wasn't captured in the
            # source) — still anchor it next to ITS device rather than centering it,
            # so a lone ".1" doesn't read as ambiguously belonging to either end
            txt = lbl_a or lbl_b
            if lbl_a:
                px0, py0 = ex1 + (ex2 - ex1) * t_end + ux * 13, ey1 + (ey2 - ey1) * t_end + uy * 13
            else:
                px0, py0 = ex2 + (ex1 - ex2) * t_end + ux * 13, ey2 + (ey1 - ey2) * t_end + uy * 13
            px, py = find_spot(px0, py0, lambda x, y: pill_box(x, y, txt), ux, uy, placed)
            out.append(pill(px, py, txt))
        if is_real_note(l.get('note')):
            # subnet/aggregate note starts at the link midpoint, nudged to the
            # OPPOSITE side from the endpoint pills so it doesn't compete for
            # the same lane, then walked further out if that's still occupied
            ntxt = trunc(l['note'], 34)
            nx0, ny0 = mx - ux * 22, my - uy * 22
            nx, ny = find_spot(nx0, ny0, lambda x, y: note_box(x, y, ntxt), -ux, -uy, placed)
            out.append(f'<text x="{nx:.1f}" y="{ny+3:.1f}" fill="#5b6b85" font-size="9" text-anchor="middle">{esc(ntxt)}</text>')
        note_i += 1

    for d in devices:
        if d['id'] not in pos:
            continue
        x, y = pos[d['id']]
        t = d['type'] if d['type'] in COLOR else 'router'
        size = 64
        out.append(f'<use href="#{t}" x="{x-size/2:.1f}" y="{y-size/2:.1f}" width="{size}" height="{size}"/>')
        label = dev_label.get(d['id'], d['id'])
        color = COLOR[t][0]
        chip_w = 16 + 7 + 4 + len(label) * 6.5
        note = d.get('note')
        if t == 'pc':
            chip_x = x + HUG_RIGHT.get(t, 18) + 4
            chip_y = y - 8
            out.append(f'<g font-size="11" fill="#cbd5e1">'
                        f'<rect x="{chip_x:.1f}" y="{chip_y:.1f}" width="{chip_w:.1f}" height="16" rx="4" '
                        f'fill="#0d1320" stroke="#1f2937" stroke-width="0.6"/>'
                        f'<rect x="{chip_x+7:.1f}" y="{chip_y+4:.1f}" width="7" height="7" rx="1" fill="{color}"/>'
                        f'<text x="{chip_x+18:.1f}" y="{chip_y+12:.1f}">{esc(label)}</text></g>')
            if is_real_note(note):
                ny = y + HUG_BOTTOM.get(t, 18) + 12
                out.append(f'<text x="{x:.1f}" y="{ny:.1f}" fill="#475569" font-size="9" text-anchor="middle">{esc(trunc(note, 44))}</text>')
        else:
            cy = y + HUG_BOTTOM.get(t, 18) - 2
            blocked, lean = label_lean(d['id'], x, y, links, pos)
            lx = x - (chip_w / 2 + 3) * (1 if lean >= 0 else -1) if blocked else x
            out.append(f'<g font-size="11" fill="#cbd5e1">'
                        f'<rect x="{lx-chip_w/2:.1f}" y="{cy:.1f}" width="{chip_w:.1f}" height="16" rx="4" '
                        f'fill="#0d1320" stroke="#1f2937" stroke-width="0.6"/>'
                        f'<rect x="{lx-chip_w/2+7:.1f}" y="{cy+4:.1f}" width="7" height="7" rx="1" fill="{color}"/>'
                        f'<text x="{lx-chip_w/2+18:.1f}" y="{cy+12:.1f}">{esc(label)}</text></g>')
            if is_real_note(note):
                out.append(f'<text x="{lx:.1f}" y="{cy+27:.1f}" fill="#475569" font-size="9" text-anchor="middle">{esc(trunc(note, 44))}</text>')

    out.append('</svg>')
    svg = '\n'.join(out)
    with open(os.path.join(OUTDIR, f'q{n}.svg'), 'w', encoding='utf-8') as f:
        f.write(svg)
    return svg
