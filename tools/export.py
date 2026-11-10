import pickle,json,math
CM=72/2.54
pieces=pickle.load(open('pieces.pkl','rb'))
def rdp(pts,eps):
    if len(pts)<3: return pts
    a=pts[0];b=pts[-1];dx=b[0]-a[0];dy=b[1]-a[1];L=math.hypot(dx,dy)
    md=0;mi=0
    for i in range(1,len(pts)-1):
        p=pts[i]
        d=abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/L if L>0 else math.hypot(p[0]-a[0],p[1]-a[1])
        if d>md: md=d;mi=i
    if md>eps: return rdp(pts[:mi+1],eps)[:-1]+rdp(pts[mi:],eps)
    return [a,b]
out=[]
for pc in sorted(pieces,key=lambda p:(p['page'],p['k'])):
    pl=[(x/CM,y/CM) for x,y in pc['poly']]
    # chiudi e semplifica (tolleranza 0.03 cm)
    if pl[0]!=pl[-1]: pl.append(pl[0])
    # RDP su anello: spezza a punto piu' lontano
    i0=0;far=max(range(len(pl)),key=lambda i:math.hypot(pl[i][0]-pl[0][0],pl[i][1]-pl[0][1]))
    s=rdp(pl[:far+1],0.03)[:-1]+rdp(pl[far:],0.03)
    s=s[:-1]
    # centroide (area)
    A=0;cx=0;cy=0
    for i in range(len(s)):
        x1,y1=s[i];x2,y2=s[(i+1)%len(s)];c=x1*y2-x2*y1;A+=c;cx+=(x1+x2)*c;cy+=(y1+y2)*c
    A/=2;cx/=6*A;cy/=6*A
    poly=[[round(x-cx,2),round(y-cy,2)] for x,y in s]
    if pc['group'] in('G1','G2'):
        ex=iter(['E1','E2','E3']);names=[n if n else next(ex) for n in pc['names']]
    else: names=['H%d'%(i+1) for i in range(len(pc['holes']))]
    holes=[[round(x/CM-cx,2),round(y/CM-cy,2),n] for (x,y),n in zip(pc['holes'],names)]
    out.append(dict(id='%d.%d'%(pc['page'],pc['k']),w=round(pc['w'],1),h=round(pc['h'],1),g=pc['group'],area=round(abs(A),1),poly=poly,holes=holes))
json.dump(out,open('src/data.json','w'),separators=(',',':'))
import os;print(len(out),os.path.getsize('src/data.json'),sum(len(p['poly']) for p in out),max(len(p['poly']) for p in out))
