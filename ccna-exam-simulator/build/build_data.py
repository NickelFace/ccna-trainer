#!/usr/bin/env python3
"""
Build the web-app data from the archive.

Inputs  (archive):
  ../../ccna-project-archive/data/app_data.json   - questions (no base64)
  ../../ccna-project-archive/data/app_imgs.json   - {n: dataURI} exhibits

Outputs (web project):
  ../images/exhibits/qN.jpg          - one file per exhibit
  ../data/questions.json             - questions + official CCNA domain, img filename
  ../data/meta.json                  - domain blueprint + counts

The 15 author topics (tp) are mapped to the 6 official Cisco CCNA 200-301
exam domains. The catch-all 'General' bucket is classified per-question by
keyword heuristic (refined later by an LLM pass -> classify_overrides.json).
"""
import json, os, re, base64, collections, shutil
from topo_text import topology_to_text

HERE = os.path.dirname(os.path.abspath(__file__))
ARCH = os.path.normpath(os.path.join(HERE, '..', '..', 'ccna-project-archive'))
OUT  = os.path.normpath(os.path.join(HERE, '..'))

# ---- Official CCNA 200-301 exam domains (v1.1) and their blueprint weights ----
DOMAINS = [
    ("NF",  "1.0 Network Fundamentals",           0.20),
    ("NA",  "2.0 Network Access",                  0.20),
    ("IPC", "3.0 IP Connectivity",                 0.25),
    ("IPS", "4.0 IP Services",                     0.10),
    ("SEC", "5.0 Security Fundamentals",           0.15),
    ("AUT", "6.0 Automation and Programmability",  0.10),
]

# Direct topic -> domain for unambiguous author topics
TOPIC_MAP = {
    "Wireless":       "NA",
    "Switching/VLAN": "NA",
    "NAT":            "IPS",
    "Automation":     "AUT",
    "IPv6":           "NF",
    "OSPF":           "IPC",
    "Ops/Mgmt":       "IPS",
    "Subnetting":     "NF",
    "Routing":        "IPC",
    "Security":       "SEC",
    "DHCP":           "IPS",
    "EIGRP":          "IPC",
    "ACL":            "SEC",
    "BGP":            "IPC",
    # 'General' -> classified below
}

# Keyword heuristic for the 'General' catch-all. Order = priority (first hit wins).
KW = [
    ("AUT", r"\b(automation|ansible|puppet|chef|python|json|xml|yaml|rest\s*api|restful|api|sdn|controller|software-defined|northbound|southbound|dna\s*center|programmab|json-rpc|netconf|yang|cisco dna)\b"),
    ("SEC", r"\b(acl|access[- ]list|aaa|radius|tacacs|password|authentication|dot1x|802\.1x|port security|dhcp snooping|dynamic arp|firewall|\bvpn\b|ipsec|wpa|psk|snooping|brute|phishing|malware|threat|encrypt|credential)\b"),
    ("IPS", r"\b(nat|pat|\bdhcp\b|\bntp\b|\bsnmp\b|syslog|\bqos\b|\bftp\b|\btftp\b|\bdns\b|\bssh\b|telnet|per-hop|marking|shaping|policing|first hop redundancy|hsrp|\bnetwork time\b)\b"),
    ("IPC", r"\b(ospf|eigrp|\bbgp\b|routing|routed|next[- ]hop|default route|static route|gateway of last resort|administrative distance|route table|routing table|prefix|longest match|floating static)\b"),
    ("NA",  r"\b(switch|\bvlan\b|trunk|\bstp\b|spanning[- ]tree|etherchannel|lacp|pagp|\bwlan\b|wireless|access point|\bap\b|\bwlc\b|\bcdp\b|\blldp\b|\bpoe\b|mac address table|inter-?switch|native vlan|dtp|voice vlan|roaming|ssid|802\.11)\b"),
    ("NF",  r"\b(tcp|udp|osi|tcp/ip|cabling|fiber|copper|\bmac address\b|ethernet frame|frame check|collision|duplex|eui-64|subnet|ipv4|ipv6|spine|leaf|virtual machin|hypervisor|\bvm\b|physical address|bandwidth|\bwan\b|\bmtu\b|encapsulation|three-tier|two-tier|throughput|latency|crc)\b"),
]

def classify_general(q):
    text = (q.get('t','') + ' ' + ' '.join(q.get('o',{}).values())).lower()
    for dom, pat in KW:
        if re.search(pat, text):
            return dom
    return "NF"  # default: General leans Network Fundamentals

def main():
    data = json.load(open(os.path.join(ARCH,'data','app_data.json'), encoding='utf-8'))
    imgs = json.load(open(os.path.join(ARCH,'data','app_imgs.json'), encoding='utf-8'))

    exdir = os.path.join(OUT,'images','exhibits')
    os.makedirs(exdir, exist_ok=True)

    # optional refined classification from a later LLM pass
    ov_path = os.path.join(HERE,'classify_overrides.json')
    overrides = json.load(open(ov_path, encoding='utf-8')) if os.path.exists(ov_path) else {}

    # optional reconstructed drag-drop data
    dd_path = os.path.join(HERE,'dd_data.json')
    dd_data = json.load(open(dd_path, encoding='utf-8')) if os.path.exists(dd_path) else {}

    # optional per-option rationale ("why is A right / B wrong ...")
    why_path = os.path.join(HERE,'why_data.json')
    why_data = json.load(open(why_path, encoding='utf-8')) if os.path.exists(why_path) else {}

    # optional verified worked-solutions for lab simulations (y == 'sim'); see build_data.py
    # note at point of use for why this isn't just copied from the archive dump
    simans_path = os.path.join(HERE,'sim_answers.json')
    sim_answers = json.load(open(simans_path, encoding='utf-8')) if os.path.exists(simans_path) else {}

    # optional per-question explanation override — fills 'exp' for questions the archive
    # left blank (drag-drops carry their rationale here; the app renders q.exp for y=='dd')
    exp_path = os.path.join(HERE,'exp_data.json')
    exp_over = json.load(open(exp_path, encoding='utf-8')) if os.path.exists(exp_path) else {}

    # optional fix for options that were never parsed as text (embedded in the exhibit image)
    optfix_path = os.path.join(HERE,'option_fix.json')
    option_fix = json.load(open(optfix_path, encoding='utf-8')) if os.path.exists(optfix_path) else {}

    # optional text-formatting fixes: run-on CLI commands split into readable lines,
    # and embedded config commands extracted out of question prose into a separate 'cli' block
    textfix_path = os.path.join(HERE,'text_overrides.json')
    text_fix = json.load(open(textfix_path, encoding='utf-8')) if os.path.exists(textfix_path) else {}

    # topology/mixed exhibits cropped straight from the source PDF (build/topo_exhibits/qN.jpg).
    # These replace the earlier hand-redrawn SVGs entirely: the CLI part of a "mixed" exhibit
    # stays as text in 'cli', the diagram is the cropped raster.
    topo_dir = os.path.join(HERE,'topo_exhibits')
    topo_set = {f[1:-4] for f in os.listdir(topo_dir) if f.startswith('q') and f.endswith('.jpg')} \
               if os.path.isdir(topo_dir) else set()

    # legacy hand-redrawn topology SVGs — kept for reference only, no longer applied
    # (dropped in favour of the PDF crops above).
    svg_data = {}

    # questions where the exhibit was pure CLI/table text now fully captured in 'cli' —
    # the screenshot is redundant, so skip writing/referencing the image for these.
    dropimg_path = os.path.join(HERE,'drop_img.json')
    drop_img = set(json.load(open(dropimg_path, encoding='utf-8'))) if os.path.exists(dropimg_path) else set()

    # question-type fixes: source marked these 'ex' but no exhibit exists (the "exhibit"
    # was the options themselves, or was already broken in the source dump) -> 'txt'
    typefix_path = os.path.join(HERE,'type_overrides.json')
    type_fix = json.load(open(typefix_path, encoding='utf-8')) if os.path.exists(typefix_path) else {}

    # questions whose exhibit was hand-cropped in place (e.g. gui_screenshot tight crop) —
    # never re-write these from the original base64, or the crop gets clobbered.
    exhibit_meta_path = os.path.join(HERE,'exhibit_data.json')
    exhibit_meta = json.load(open(exhibit_meta_path, encoding='utf-8')) if os.path.exists(exhibit_meta_path) else {}
    cropped = {n for n, v in exhibit_meta.items()
               if v.get('category') == 'gui_screenshot' or v.get('cropped')}

    # 'mixed' exhibits (topology + CLI) are cropped from the PDF with the CLI baked into
    # the image, so the separate 'cli' text would duplicate it — drop the text for these.
    mixed_topo = {n for n in topo_set if exhibit_meta.get(n, {}).get('category') == 'mixed'}

    out = []
    dom_counts = collections.Counter()
    img_written = 0
    for q in data:
        n = q['n']
        # a verified per-question override (from the LLM classification pass, grounded in the
        # official blueprint) always wins; otherwise fall back to the topic map / keyword heuristic.
        dom = overrides.get(str(n))
        if dom is None:
            dom = TOPIC_MAP.get(q.get('tp'))
        if dom is None:
            dom = classify_general(q)
        dom = str(dom)
        tfix = text_fix.get(str(n), {})
        opts = tfix.get('o') or option_fix.get(str(n)) or q.get('o', {})
        item = {
            "n": n,
            "t": tfix.get('t', q.get('t','')),
            "o": opts,
            "a": q.get('a',''),
            "y": type_fix.get(str(n), q.get('y')),
            "tp": q.get('tp'),
            "dom": dom,
        }
        if tfix.get('cli') and str(n) not in mixed_topo: item['cli'] = tfix['cli']
        if q.get('exp'): item['exp'] = q['exp']
        if exp_over.get(str(n)): item['exp'] = exp_over[str(n)]
        if q.get('disp'): item['disp'] = 1
        # topology/mixed diagram cropped from the PDF -> use it as the exhibit image
        if str(n) in topo_set:
            fn = f"q{n}.jpg"
            shutil.copyfile(os.path.join(topo_dir, fn), os.path.join(exdir, fn))
            item['img'] = fn
            img_written += 1
        # otherwise write the raster exhibit from the archive (skip if CLI text fully
        # replaces it, and skip re-writing ones already hand-cropped)
        elif str(n) in imgs and str(n) not in drop_img:
            fn = f"q{n}.jpg"
            if str(n) not in cropped or not os.path.exists(os.path.join(exdir,fn)):
                uri = imgs[str(n)]
                b64 = uri.split(',',1)[1]
                with open(os.path.join(exdir,fn),'wb') as f:
                    f.write(base64.b64decode(b64))
            item['img'] = fn
            img_written += 1

        # a written-out version of the diagram, for the mobile app's "разобрать с ИИ": a
        # batch prompt cannot carry attachments, so the words go where the picture cannot.
        if item.get('img'):
            topo = topology_to_text((exhibit_meta.get(str(n)) or {}).get('topology'))
            if topo: item['topo'] = topo

        # attach reconstructed drag-drop data if present
        if q.get('y') == 'dd' and str(n) in dd_data:
            item['dd'] = dd_data[str(n)]

        # attach a verified worked-solution for lab simulations, where we've checked the
        # archive's dumped "Answer" is actually correct (most are missing or wrong — see
        # sim_answers.json comments in git history; never copy one in without checking it)
        if item['y'] == 'sim' and str(n) in sim_answers:
            item['answer'] = sim_answers[str(n)]

        # attach per-option rationale if present
        if str(n) in why_data:
            item['why'] = why_data[str(n)]

        dom_counts[dom] += 1
        out.append(item)

    json.dump(out, open(os.path.join(OUT,'data','questions.json'),'w',encoding='utf-8'),
              ensure_ascii=False, separators=(',',':'))

    # sweep stale exhibit files no longer referenced by any question (e.g. after
    # converting a cli_output exhibit to text)
    used_imgs = {item['img'] for item in out if item.get('img')}
    removed = 0
    for fn in os.listdir(exdir):
        if fn not in used_imgs:
            os.remove(os.path.join(exdir, fn)); removed += 1

    meta = {
        "domains": [{"id":d,"name":name,"weight":w,"count":dom_counts[d]} for d,name,w in DOMAINS],
        "total": len(out),
        "scored_mc": sum(1 for q in out if q['y'] in ('txt','ex')),
        "dd_total": sum(1 for q in out if q['y']=='dd'),
        "dd_ready": sum(1 for q in out if q.get('dd')),
        "sim_total": sum(1 for q in out if q['y']=='sim'),
        "with_exp": sum(1 for q in out if q.get('exp')),
        "with_why": sum(1 for q in out if q.get('why')),
        "exhibits": img_written,
    }
    json.dump(meta, open(os.path.join(OUT,'data','meta.json'),'w',encoding='utf-8'),
              ensure_ascii=False, indent=2)

    print("questions:", len(out), "| exhibits written:", img_written, "| stale removed:", removed)
    print("domain distribution:")
    for d,name,w in DOMAINS:
        print(f"  {d:4} {name:38} target {int(w*100):>2}%   have {dom_counts[d]:>4}")
    print("dd ready:", meta['dd_ready'], "/", meta['dd_total'])

if __name__ == "__main__":
    main()
