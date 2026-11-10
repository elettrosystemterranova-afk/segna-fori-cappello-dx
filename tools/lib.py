import pymupdf as fitz, math
CM=72/2.54
W,H=1417.32,2834.65
def bez(p0,p1,p2,p3,n=24):
    out=[]
    for i in range(1,n+1):
        t=i/n;a=(1-t)**3;b=3*t*(1-t)**2;c=3*t*t*(1-t);d=t**3
        out.append((a*p0.x+b*p1.x+c*p2.x+d*p3.x,a*p0.y+b*p1.y+c*p2.y+d*p3.y))
    return out
def poly(dr):
    pts=[];cur=None
    for it in dr['items']:
        if it[0]=='l':
            if cur is None: pts.append((it[1].x,it[1].y))
            pts.append((it[2].x,it[2].y));cur=it[2]
        elif it[0]=='c':
            if cur is None: pts.append((it[1].x,it[1].y))
            pts+=bez(it[1],it[2],it[3],it[4]);cur=it[4]
        elif it[0]=='re':
            r=it[1];pts+= [(r.x0,r.y0),(r.x1,r.y0),(r.x1,r.y1),(r.x0,r.y1)];cur=None
        elif it[0]=='qu':
            q=it[1];pts+=[(q.ul.x,q.ul.y),(q.ur.x,q.ur.y),(q.lr.x,q.lr.y),(q.ll.x,q.ll.y)]
    return pts
def inside(pt,poly_):
    x,y=pt;c=False;n=len(poly_)
    for i in range(n):
        x1,y1=poly_[i];x2,y2=poly_[(i+1)%n]
        if (y1>y)!=(y2>y) and x<(x2-x1)*(y-y1)/(y2-y1)+x1: c=not c
    return c
BLUE=(0.0,0.0,1.0);RED=(1.0,0.0,0.0)
def blues(page):
    return [d for d in page.get_drawings() if d.get('color')==BLUE]
