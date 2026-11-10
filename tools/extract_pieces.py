from lib import *
import pickle,collections,statistics,json
d=fitz.open('/mnt/user-data/uploads/05a1e55d-Cappello_DX_-_CON_DOWEL.pdf')
def straight(pl):
    segs=[]
    for i in range(len(pl)-1):
        (x1,y1),(x2,y2)=pl[i],pl[i+1]
        dy=abs(y2-y1);dx=abs(x2-x1)
        if dy>0.5 and dx/dy<0.012: segs.append(((x1+x2)/2,min(y1,y2),max(y1,y2)))
    return segs
pieces=[]
for pn,p in enumerate(d):
    sh=[];ho=[]
    for x in blues(p):
        r=x['rect'];n=len(x['items'])
        if abs(r.width-W)<5 and abs(r.height-H)<5: continue
        if n==16 and r.width/CM<0.5: ho.append(x)
        elif r.width/CM<0.1 and r.height/CM<0.2: continue
        else: sh.append(x)
    P=[poly(s) for s in sh]
    areas=[s['rect'].width*s['rect'].height for s in sh]
    def owner(c):
        cand=sorted((areas[i],i) for i in range(len(sh)) if inside(c,P[i]))
        return cand[0][1] if cand else None
    hol=collections.defaultdict(list)
    for h in ho:
        c=((h['rect'].x0+h['rect'].x1)/2,(h['rect'].y0+h['rect'].y1)/2)
        o=owner(c)
        if o is not None: hol[o].append(c)
    reds=collections.defaultdict(list)
    for x in p.get_drawings():
        if x.get('color')==RED:
            r=x['rect'];o=owner(((r.x0+r.x1)/2,(r.y0+r.y1)/2))
            if o is not None: reds[o].append(poly(x))
    order=sorted(range(len(sh)),key=lambda i:-areas[i])
    for si in sorted(hol):
        s=sh[si];r=s['rect'];pl=P[si]
        sg=straight(pl);cl=[]
        for x,a,b in sorted(sg):
            for c in cl:
                if abs(c[0]-x)<0.2*CM: c[1].append((a,b));break
            else: cl.append([x,[(a,b)]])
        best=None
        for x,l in cl:
            ext=max(b for a,b in l)-min(a for a,b in l)
            if best is None or ext>best[2]: best=(x,0,ext,min(a for a,b in l),max(b for a,b in l))
        edge=None
        if best and best[2]/CM>=3.0:
            edge=dict(x=best[0],top=best[3],bot=best[4],len=best[2]/CM,side='L' if best[0]-r.x0<1 else 'R')
        pieces.append(dict(page=pn+1,si=si,k=order.index(si)+1,bbox=(r.x0,r.y0,r.x1,r.y1),w=r.width/CM,h=r.height/CM,
            poly=pl,reds=reds.get(si,[]),holes=sorted(hol[si]),edge=edge,
            tang=(min(q[0] for q in pl),min(q[1] for q in pl))))
# classify
for pc in pieces:
    e=pc['edge'];g=None
    if e and e['side']=='L':
        ds=[round((c[0]-e['x'])/CM,2) for c in pc['holes']]
        names=[]
        for dd in ds: names.append({3.49:'A',3.96:'B',21.05:'C'}.get(dd))
        pc['names']=names
        s=set(n for n in names if n)
        if s=={'A','B','C'}: g='G1'
        elif s=={'B','C'}: g='G2'
    pc['group']=g or 'G3'
cnt=collections.Counter(p['group'] for p in pieces);print(cnt,len(pieces))
# triangle constants
tri=[]
for pc in pieces:
    if pc['group']=='G1':
        e=pc['edge'];h={n:c for n,c in zip(pc['names'],pc['holes']) if n}
        tri.append(((h['B'][0]-h['A'][0])/CM,(h['B'][1]-h['A'][1])/CM,(h['C'][0]-h['A'][0])/CM,(h['C'][1]-h['A'][1])/CM,(h['A'][0]-e['x'])/CM))
for i,nm in enumerate(['Bdx','Bdy','Cdx','Cdy','dA']):
    v=[t[i] for t in tri];print(nm,round(statistics.mean(v),3),round(min(v),3),round(max(v),3))
pickle.dump(pieces,open('pieces.pkl','wb'))
