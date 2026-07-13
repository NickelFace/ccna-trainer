"""make_topo_crops.py — regenerate build/topo_exhibits PNGs from the source PDF.
Inputs: ../../ccna-project-archive/source/200-301.pdf, topo_page_map.json (n->page+category).
Output: topo_exhibits_png/qN.png (then convert to topo_exhibits/qN.jpg for build_data.py).
"""
#!/usr/bin/env python3
"""Extract & crop the exhibit for each mixed/topology question.
Renders the PDF page (composites all image layers, incl. masked/multi-layer
diagrams), whites-out vector text (question/options/answer; the CLI baked into
the exhibit is raster and survives), then tightly crops to the graphic content.
For blank crops (wrong page), searches neighbouring pages."""
import fitz, json, os, numpy as np
from PIL import Image, ImageDraw

import os
HERE=os.path.dirname(os.path.abspath(__file__))
PDF=os.path.join(HERE,'..','..','ccna-project-archive','source','200-301.pdf')
REC=os.path.join(HERE,'topo_page_map.json')
OUT=os.path.join(HERE,'topo_exhibits_png')
DPI=170; SC=DPI/72.0
doc=fitz.open(PDF)
rec=json.load(open(REC))
DARK=205  # a pixel is content if min(R,G,B) < DARK (drops faint gray ghosts)

_cache={}
def page_graphics(pg):
    if pg in _cache: return _cache[pg]
    page=doc[pg]
    pix=page.get_pixmap(dpi=DPI)
    im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples).copy()
    d=ImageDraw.Draw(im)
    for w in page.get_text("words"):
        x0,y0,x1,y1=[v*SC for v in w[:4]]
        d.rectangle([x0-2,y0-1,x1+2,y1+1],fill=(255,255,255))
    a=np.asarray(im)
    content=a.min(axis=2) < DARK
    _cache[pg]=(im,content)
    return im,content

def row_bands(content, minfrac=0.008, gap=30):
    H,W=content.shape
    active=content.sum(axis=1) > W*minfrac
    bs=[]; s=None; g=0
    for y in range(H):
        if active[y]:
            if s is None: s=y
            g=0
        else:
            if s is not None:
                g+=1
                if g>gap: bs.append((s,y-g+1)); s=None; g=0
    if s is not None: bs.append((s,H))
    out=[]
    for (a,b) in bs:
        if content[a:b].sum()<=1200 or (b-a)<=16: continue
        cols=np.where(content[a:b].any(axis=0))[0]
        if len(cols)==0: continue
        xw=cols[-1]-cols[0]+1
        dens=content[a:b].sum()/((b-a)*xw)
        # drop faint full-width option-box borders (thin ~31px outline, low density);
        # height guard keeps sparse-but-real diagrams (which are taller)
        if (b-a)<46 and xw>0.85*W and dens<0.16: continue
        out.append((a,b))
    return out

def exhibit_box(content, ns_on_page, n):
    """Union bbox of content bands; split for collision pages."""
    bs=row_bands(content)
    if not bs: return None,0
    grp=bs
    if len(ns_on_page)>1 and len(bs)>=2:
        gaps=sorted(range(len(bs)-1), key=lambda i: bs[i+1][0]-bs[i][1], reverse=True)
        cut=sorted(gaps[:len(ns_on_page)-1]); groups=[]; st=0
        for c in cut: groups.append(bs[st:c+1]); st=c+1
        groups.append(bs[st:])
        idx=sorted(ns_on_page).index(n)
        grp=groups[idx] if idx<len(groups) else bs
    y0=min(b[0] for b in grp); y1=max(b[1] for b in grp)
    cols=np.where(content[y0:y1].any(axis=0))[0]
    x0,x1=(int(cols[0]),int(cols[-1])) if len(cols) else (0,content.shape[1])
    area=int(content[y0:y1, x0:x1].sum())
    return (x0,y0,x1,y1),area

def bypage(pg):
    return sorted(int(m) for m in rec if rec[m].get('ok') and rec[m]['page']==pg)

def crop_question(n):
    base=rec[str(n)]['page']
    others={rec[m]['page'] for m in rec if rec[m].get('ok') and int(m)!=n}
    # prefer the body page; only search neighbours when it is near-blank / a thin sliver
    im,content=page_graphics(base)
    box,area=exhibit_box(content, bypage(base), n)
    def thin(bx): return bx is not None and (bx[3]-bx[1])<90
    best=(area,im,box,base) if box is not None else None
    if best is None or area<2000 or thin(box):
        for pg in [base+1, base-1, base+2, base-2]:
            if pg<0 or pg>=len(doc) or pg in others: continue
            im2,c2=page_graphics(pg)
            b2,a2=exhibit_box(c2,[n],n)
            if b2 is None or thin(b2): continue
            if best is None or thin(best[2]) or a2>best[0]+1500: best=(a2,im2,b2,pg)
    if best is None: return None,0
    area,im,box,pg=best
    pad=10
    x0,y0,x1,y1=box
    box=(max(0,x0-pad),max(0,y0-pad),min(im.width,x1+pad),min(im.height,y1+pad))
    return im.crop(box), area

if __name__=='__main__':
    os.makedirs(OUT,exist_ok=True)
    import sys
    allns=sorted(int(x) for x in rec if rec[x].get('ok'))
    if len(sys.argv)>=3:
        allns=allns[int(sys.argv[1]):int(sys.argv[2])]
    blanks=[]
    for n in allns:
        p=f'{OUT}/q{n}.png'
        if os.path.exists(p): continue
        c,area=crop_question(n)
        if c is None or area<2500 or c.width<40 or c.height<28:
            blanks.append(n)
            if c is not None: c.save(p)
            continue
        c.save(p)
    print('blanks/low:',blanks)
    json.dump(blanks,open(os.path.join(HERE,'crop_fails.json'),'w'))
