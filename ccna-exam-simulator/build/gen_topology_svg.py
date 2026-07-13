#!/usr/bin/env python3
"""Render CCNA topology exhibits as SVG per the dark-terminal style kit
(/home/maks/Documents/Maks/diagrams/diagram-style-prompt.md). Each diagram's
scene is hand-placed (devices/coords chosen deliberately, not auto-layout) —
only the shared <defs> (icons/filters/markers) and small helpers are reused.

Usage: edit/extend SCENES below, then `python3 gen_topology_svg.py`.
Writes to ../images/topo/qN.svg.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.normpath(os.path.join(HERE, '..', 'images', 'topo'))

COLOR = {
    'router': ('#7c3aed', '#150f2e', 'gp'),
    'sw2':    ('#10b981', '#0c1f1a', 'gg'),
    'sw3':    ('#14b8a6', '#07201d', 'gt'),
    'pc':     ('#00d4ff', '#08161d', 'gc'),
    'server': ('#3b82f6', '#0b1530', 'gb'),
    'firewall': ('#ef4444', '#1f0c0c', 'gr'),
    'ap':     ('#f59e0b', '#1f1404', 'ga'),
    'internet': ('#94a3b8', '#11161f', 'gs'),
}

DEFS = '''<defs>
  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#1a2030" stroke-width="1"/></pattern>
  <filter id="gp" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#7c3aed" flood-opacity="0.85"/></filter>
  <filter id="gg" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#10b981" flood-opacity="0.85"/></filter>
  <filter id="gt" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#14b8a6" flood-opacity="0.85"/></filter>
  <filter id="gc" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#00d4ff" flood-opacity="0.8"/></filter>
  <filter id="gb" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#3b82f6" flood-opacity="0.8"/></filter>
  <filter id="gr" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ef4444" flood-opacity="0.8"/></filter>
  <filter id="ga" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f59e0b" flood-opacity="0.8"/></filter>
  <filter id="gs" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#94a3b8" flood-opacity="0.75"/></filter>
  <marker id="mp" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill="#a78bfa"/></marker>
  <marker id="mg" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill="#34d399"/></marker>
  <marker id="mt" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill="#2dd4bf"/></marker>
  <symbol id="router" viewBox="0 0 120 120"><g filter="url(#gp)"><circle cx="60" cy="60" r="34" fill="#150f2e" stroke="#7c3aed" stroke-width="2.5"/></g><g stroke="#a78bfa" stroke-width="2.2" stroke-linecap="round"><line x1="60" y1="49" x2="60" y2="33" marker-end="url(#mp)"/><line x1="60" y1="71" x2="60" y2="87" marker-end="url(#mp)"/><line x1="71" y1="60" x2="87" y2="60" marker-end="url(#mp)"/><line x1="49" y1="60" x2="33" y2="60" marker-end="url(#mp)"/></g></symbol>
  <symbol id="sw2" viewBox="0 0 120 120"><g filter="url(#gg)"><rect x="20" y="32" width="80" height="56" rx="6" fill="#0c1f1a" stroke="#10b981" stroke-width="2.5"/></g><g stroke="#34d399" stroke-width="2.2" stroke-linecap="round"><line x1="34" y1="45" x2="86" y2="45" marker-end="url(#mg)"/><line x1="86" y1="55" x2="34" y2="55" marker-end="url(#mg)"/><line x1="34" y1="65" x2="86" y2="65" marker-end="url(#mg)"/><line x1="86" y1="75" x2="34" y2="75" marker-end="url(#mg)"/></g></symbol>
  <symbol id="sw3" viewBox="0 0 120 120"><g filter="url(#gt)"><rect x="20" y="32" width="80" height="56" rx="6" fill="#07201d" stroke="#14b8a6" stroke-width="2.5"/></g><g stroke="#2dd4bf" stroke-width="2" stroke-linecap="round" fill="none"><line x1="34" y1="50" x2="80" y2="50" marker-end="url(#mt)"/><line x1="80" y1="62" x2="34" y2="62" marker-end="url(#mt)"/><line x1="34" y1="74" x2="80" y2="74" marker-end="url(#mt)"/></g><rect x="74" y="26" width="28" height="16" rx="8" fill="#14b8a6"/><text x="88" y="38" fill="#04241f" font-size="11" font-weight="bold" text-anchor="middle">L3</text></symbol>
  <symbol id="pc" viewBox="0 0 120 120"><g filter="url(#gc)"><rect x="26" y="32" width="68" height="46" rx="5" fill="#08161d" stroke="#00d4ff" stroke-width="2.5"/></g><text x="38" y="62" fill="#00d4ff" font-size="20" font-weight="bold">&gt;_</text><line x1="60" y1="78" x2="60" y2="88" stroke="#00d4ff" stroke-width="3" stroke-linecap="round"/><rect x="44" y="88" width="32" height="5" rx="2.5" fill="#00d4ff"/></symbol>
  <symbol id="server" viewBox="0 0 120 120"><g filter="url(#gb)"><rect x="40" y="24" width="40" height="72" rx="6" fill="#0b1530" stroke="#3b82f6" stroke-width="2.5"/></g><g stroke="#60a5fa" stroke-width="2" stroke-linecap="round"><line x1="50" y1="38" x2="70" y2="38"/><line x1="50" y1="50" x2="70" y2="50"/><line x1="50" y1="62" x2="70" y2="62"/></g><circle cx="50" cy="82" r="2.6" fill="#60a5fa"/><circle cx="60" cy="82" r="2.6" fill="#60a5fa"/></symbol>
  <symbol id="firewall" viewBox="0 0 120 120"><g filter="url(#gr)"><rect x="26" y="34" width="68" height="52" rx="5" fill="#1f0c0c" stroke="#ef4444" stroke-width="2.5"/></g><g stroke="#f87171" stroke-width="1.8" stroke-linecap="round"><line x1="26" y1="51" x2="94" y2="51"/><line x1="26" y1="68" x2="94" y2="68"/><line x1="49" y1="34" x2="49" y2="51"/><line x1="71" y1="34" x2="71" y2="51"/><line x1="38" y1="51" x2="38" y2="68"/><line x1="60" y1="51" x2="60" y2="68"/><line x1="82" y1="51" x2="82" y2="68"/><line x1="49" y1="68" x2="49" y2="86"/><line x1="71" y1="68" x2="71" y2="86"/></g></symbol>
  <symbol id="ap" viewBox="0 0 120 120"><g filter="url(#ga)"><rect x="30" y="66" width="60" height="22" rx="6" fill="#1f1404" stroke="#f59e0b" stroke-width="2.5"/></g><line x1="40" y1="78" x2="50" y2="78" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round"/><circle cx="60" cy="60" r="3" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M48 56 Q60 44 72 56"/><path d="M40 54 Q60 33 80 54"/></g></symbol>
  <symbol id="internet" viewBox="0 0 120 120"><g filter="url(#gs)"><path d="M38 80 a16 16 0 0 1 -2 -31 a20 20 0 0 1 38 -6 a15 15 0 0 1 14 12 a13 13 0 0 1 -2 25 Z" fill="#11161f" stroke="#94a3b8" stroke-width="2.5" stroke-linejoin="round"/></g><text x="60" y="69" fill="#cbd5e1" font-size="13" font-weight="bold" text-anchor="middle">WWW</text></symbol>
</defs>'''

def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

def header(w, h, title, desc):
    return (f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" '
            f'role="img" font-family="\'JetBrains Mono\',\'Fira Code\',ui-monospace,monospace">\n'
            f'<title>{esc(title)}</title><desc>{esc(desc)}</desc>\n{DEFS}\n'
            f'<rect x="0" y="0" width="{w}" height="{h}" fill="#0a0e17"/>\n'
            f'<rect x="0" y="0" width="{w}" height="{h}" fill="url(#grid)"/>\n'
            f'<text x="18" y="26" fill="#00d4ff" font-size="13" letter-spacing="1">// {esc(title)}</text>\n')

def zone(x, y, w, h, label, backbone=False):
    dash = '2 4' if backbone else '6 4'
    op = '0.10' if backbone else '0.05'
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#94a3b8" fill-opacity="{op}" '
            f'stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="{dash}"/>\n'
            f'<text x="{x+12}" y="{y+18}" fill="#94a3b8" font-size="11">{esc(label)}</text>\n')

def link(x1, y1, x2, y2, speed='unspec'):
    style = {'1G': ('#cbd5e1', 2.5), '100M': ('#64748b', 2), '10M': ('#475569', 1.5), 'unspec': ('#64748b', 2)}[speed]
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{style[0]}" stroke-width="{style[1]}" stroke-linecap="round"/>\n'

def iface_pill(x, y, text, w=None):
    w = w or max(30, 12 + len(text) * 6.5)
    return (f'<g font-size="9" text-anchor="middle" fill="#94a3b8">'
            f'<rect x="{x-w/2}" y="{y-7}" width="{w}" height="14" rx="4" fill="#131a28" stroke="#2a3548" stroke-width="0.6"/>'
            f'<text x="{x}" y="{y+3}">{esc(text)}</text></g>\n')

def note_text(x, y, text, anchor='start'):
    return f'<text x="{x}" y="{y}" fill="#5b6b85" font-size="10" text-anchor="{anchor}">{esc(text)}</text>\n'

def icon(type_, x, y, size=64):
    return f'<use href="#{type_}" x="{x-size/2}" y="{y-size/2}" width="{size}" height="{size}"/>\n'

def device_label(x, y, label, type_, sub=None):
    color = COLOR[type_][0]
    w = 16 + 7 + 4 + len(label) * 6.5
    h = 34 if sub else 34
    out = (f'<g font-size="11" fill="#cbd5e1">'
           f'<rect x="{x-w/2}" y="{y}" width="{w}" height="16" rx="4" fill="#0d1320" stroke="#1f2937" stroke-width="0.6"/>'
           f'<rect x="{x-w/2+7}" y="{y+4}" width="7" height="7" rx="1" fill="{color}"/>'
           f'<text x="{x-w/2+18}" y="{y+12}">{esc(label)}</text></g>\n')
    if sub:
        out += f'<text x="{x}" y="{y+29}" fill="#475569" font-size="9" text-anchor="middle">{esc(sub)}</text>\n'
    return out

def footer():
    return '</svg>\n'

def write(name, svg):
    path = os.path.join(OUTDIR, f'{name}.svg')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(svg)
    print('wrote', path, len(svg), 'bytes')
