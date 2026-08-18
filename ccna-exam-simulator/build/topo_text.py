#!/usr/bin/env python3
"""Renders an extracted topology exhibit as plain text for the 'разобрать с ИИ' prompt.

The diagram itself ships as a raster crop (images/exhibits/qN.jpg), which only travels
through Android's share sheet, and only for one question at a time. A batch of wrong
answers therefore reaches the model with its diagrams missing. The devices/links/zones
already extracted into exhibit_data.json describe the same diagram well enough to write
out in words, so this turns that structure into a block the prompt can carry for any
number of questions at once — offline, no attachment.

Deliberately plain: no ASCII art. A model reads "R1 (.2) — (.1) MLS1 [10.10.10.0/30]"
more reliably than a drawn box diagram, and the exam questions ask about addressing and
adjacency, not about shape.
"""
import collections, re

# Extraction agents sometimes left their own asides in a 'note' field instead of real
# diagram content ("no dedicated phone type available", "unlabeled switch icon").
# Same filter auto_topology.py applies before drawing them — kept in sync by hand.
META_NOTE = re.compile(
    r'no dedicated|not available|unlabeled|closest available|ambiguous|no explicit|'
    r'unnamed|unclear|not shown|not explicitly|no.*type (exists|available)|classified (as|closest)|'
    r'shown as|shown with|represents a|depicted as|rather than|multiple pcs|grouped|group of|'
    r'crossed link|dashed line between|drawn as|not a physical|not a real|is a placeholder|'
    r'referenced as|icon at top|icon used for',
    re.I)

TYPE_RU = {
    'router': 'роутер',
    'sw2': 'коммутатор L2',
    'sw3': 'коммутатор L3',
    'pc': 'ПК',
    'server': 'сервер',
    'internet': 'интернет/облако',
    'firewall': 'межсетевой экран',
    'ap': 'точка доступа',
}


def _note(value):
    text = (value or '').strip()
    return text if text and not META_NOTE.search(text) else ''


def _names(devices):
    """id -> display name, with the extractor's asides stripped out of the labels.

    Some labels are a real name plus a parenthetical aside ("R1 (top, unlabeled but
    referenced as R1 in question)"); some are nothing but the aside ("(unlabeled
    switch)"). Strip the aside, and fall back to the id whenever that leaves nothing —
    or leaves a name another device already answers to, since the link list addresses
    devices by name and two identical names make it unreadable.
    """
    cleaned = {}
    for d in devices:
        label = (d.get('label') or '').strip()
        if label and META_NOTE.search(label):
            label = re.sub(r'\s*\([^)]*\)\s*$', '', label).strip()
            if label and META_NOTE.search(label):
                label = ''
        cleaned[d['id']] = label

    taken = collections.Counter(v for v in cleaned.values() if v)
    return {i: (label if label and taken[label] == 1 else i) for i, label in cleaned.items()}


def topology_to_text(topo):
    """topology dict from exhibit_data.json -> str, or None when there is nothing to say."""
    devices = (topo or {}).get('devices') or []
    if not devices:
        return None

    by_id = {d['id']: d for d in devices}
    names = _names(devices)
    name = lambda d: names.get(d['id'], d['id'])

    parts = []
    for d in devices:
        kind = TYPE_RU.get(d.get('type'), d.get('type') or 'устройство')
        note = _note(d.get('note'))
        parts.append(f'{name(d)} — {kind}' + (f' ({note})' if note else ''))
    lines = ['Схема (текстом): ' + '; '.join(parts)]

    link_lines = []
    for l in (topo.get('links') or []):
        a, b = by_id.get(l.get('from')), by_id.get(l.get('to'))
        if not a or not b:
            continue
        # label belongs to the 'from' end, label2 to the 'to' end — the same split the
        # SVG renderer used, so "10.1.1.1 / 10.1.1.2" never collapses into one blob whose
        # address belongs to nobody.
        la, lb = _note(l.get('label')), _note(l.get('label2'))
        left = f'{name(a)} ({la})' if la else name(a)
        right = f'({lb}) {name(b)}' if lb else name(b)
        note = _note(l.get('note'))
        link_lines.append(f'  {left} — {right}' + (f'  [{note}]' if note else ''))
    if link_lines:
        lines.append('Связи:')
        lines.extend(link_lines)

    zones = [z for z in (topo.get('zones') or []) if z.get('label') and z.get('members')]
    if zones:
        lines.append('Зоны: ' + '; '.join(
            f"{z['label']}: {', '.join(z['members'])}" for z in zones))

    return '\n'.join(lines)


def exhibit_to_text(meta, with_cli=True):
    """Whole exhibit as text: the diagram, plus the CLI baked into a 'mixed' crop.

    A mixed exhibit is one picture holding both — the question's own `cli` field is left
    empty on purpose so the web app does not print the same listing twice under the image.
    That leaves the listing reachable only through the picture, which is exactly what the
    prompt cannot send, so it belongs here. Pass with_cli=False when the question already
    carries the listing as text.
    """
    meta = meta or {}
    parts = [topology_to_text(meta.get('topology'))]
    if with_cli and (meta.get('cli') or '').strip():
        parts.append(meta['cli'].strip())
    parts = [p for p in parts if p]
    return '\n\n'.join(parts) or None
