// ===== Motore di allineamento (JS puro, nessun DOM) =====
var Core=(function(){
function downscaleGray(rgba,w,h,tw){
  var k=w/tw,th=Math.max(1,Math.round(h/k)),out=new Uint8Array(tw*th);
  for(var y=0;y<th;y++){
    var y0=Math.floor(y*k),y1=Math.min(h,Math.max(y0+1,Math.floor((y+1)*k)));
    for(var x=0;x<tw;x++){
      var x0=Math.floor(x*k),x1=Math.min(w,Math.max(x0+1,Math.floor((x+1)*k)));
      var s=0,n=0;
      for(var yy=y0;yy<y1;yy++){var o=(yy*w+x0)*4;for(var xx=x0;xx<x1;xx++){s+=0.299*rgba[o]+0.587*rgba[o+1]+0.114*rgba[o+2];o+=4;n++;}}
      out[y*tw+x]=s/n;
    }
  }
  return {g:out,w:tw,h:th};
}
function blur3(g,w,h){
  var t=new Uint8Array(g.length),o=new Uint8Array(g.length);
  for(var y=0;y<h;y++)for(var x=0;x<w;x++){var i=y*w+x,a=g[i],b=x>0?g[i-1]:a,c=x<w-1?g[i+1]:a;t[i]=(a+b+c)/3;}
  for(var y=0;y<h;y++)for(var x=0;x<w;x++){var i=y*w+x,a=t[i],b=y>0?t[i-w]:a,c=y<h-1?t[i+w]:a;o[i]=(a+b+c)/3;}
  return o;
}
function otsu(g){
  var hist=new Float64Array(256),n=g.length,i;
  for(i=0;i<n;i++)hist[g[i]]++;
  var sum=0;for(i=0;i<256;i++)sum+=i*hist[i];
  var wB=0,sB=0,best=0,thr=128;
  for(i=0;i<256;i++){wB+=hist[i];if(!wB)continue;var wF=n-wB;if(!wF)break;sB+=i*hist[i];
    var mB=sB/wB,mF=(sum-sB)/wF,v=wB*wF*(mB-mF)*(mB-mF);if(v>best){best=v;thr=i;}}
  return thr;
}
function makeMask(g,w,h,thr,light){
  var m=new Uint8Array(w*h);
  for(var i=0;i<m.length;i++)m[i]=(light?g[i]>thr:g[i]<=thr)?1:0;
  return m;
}
// componente connessa piu' grande (4-connessa), riempie i buchi interni piccoli (numeri incisi, penna)
function largest(m,w,h){
  var lab=new Int32Array(w*h),best=0,bestId=0,id=0,stack=new Int32Array(w*h);
  for(var s=0;s<m.length;s++){
    if(!m[s]||lab[s])continue;
    id++;var sp=0,cnt=0;stack[sp++]=s;lab[s]=id;
    while(sp){var p=stack[--sp];cnt++;var x=p%w,y=(p-x)/w;
      if(x>0&&m[p-1]&&!lab[p-1]){lab[p-1]=id;stack[sp++]=p-1;}
      if(x<w-1&&m[p+1]&&!lab[p+1]){lab[p+1]=id;stack[sp++]=p+1;}
      if(y>0&&m[p-w]&&!lab[p-w]){lab[p-w]=id;stack[sp++]=p-w;}
      if(y<h-1&&m[p+w]&&!lab[p+w]){lab[p+w]=id;stack[sp++]=p+w;}}
    if(cnt>best){best=cnt;bestId=id;}
  }
  var o=new Uint8Array(w*h),cx=0,cy=0,a=0;
  for(var i=0;i<o.length;i++)if(lab[i]===bestId){o[i]=1;a++;cx+=i%w;cy+=(i/w)|0;}
  // riempimento buchi: sfondo non connesso al bordo -> interno
  var bg=new Uint8Array(w*h),sp2=0;
  function push(p){if(!o[p]&&!bg[p]){bg[p]=1;stack[sp2++]=p;}}
  for(var x=0;x<w;x++){push(x);push((h-1)*w+x);}
  for(var y=0;y<h;y++){push(y*w);push(y*w+w-1);}
  while(sp2){var p=stack[--sp2],x=p%w,y=(p-x)/w;
    if(x>0)push(p-1);if(x<w-1)push(p+1);if(y>0)push(p-w);if(y<h-1)push(p+w);}
  a=0;cx=0;cy=0;
  for(var i=0;i<o.length;i++){if(!bg[i]){o[i]=1;a++;cx+=i%w;cy+=(i/w)|0;}}
  return {m:o,area:a,cx:cx/a+0.5,cy:cy/a+0.5};
}
function prefix(m,w,h){
  var P=new Int32Array(h*(w+1));
  for(var y=0;y<h;y++){var r=y*(w+1),s=0;for(var x=0;x<w;x++){s+=m[y*w+x];P[r+x+1]=s;}}
  return P;
}
function xform(pose,x,y){
  var xx=pose.flip?-x:x,c=Math.cos(pose.th),s=Math.sin(pose.th);
  return [pose.tx+pose.s*(c*xx-s*y),pose.ty+pose.s*(s*xx+c*y)];
}
var xsBuf=new Float64Array(64);
function iou(poly,pose,ctx){
  var w=ctx.w,h=ctx.h,P=ctx.P,n=poly.length,vx=new Float64Array(n),vy=new Float64Array(n),i,ymin=1e9,ymax=-1e9;
  for(i=0;i<n;i++){var q=xform(pose,poly[i][0],poly[i][1]);vx[i]=q[0];vy[i]=q[1];if(q[1]<ymin)ymin=q[1];if(q[1]>ymax)ymax=q[1];}
  var y0=Math.max(0,Math.floor(ymin-0.5)),y1=Math.min(h-1,Math.ceil(ymax-0.5)),tA=0,inter=0;
  // area fuori immagine in verticale: conta comunque
  tA+=Math.max(0,(Math.max(ymin,0)-ymin))*0;
  for(var y=y0;y<=y1;y++){
    var yc=y+0.5,k=0;
    for(i=0;i<n;i++){var j=(i+1)%n,ya=vy[i],yb=vy[j];
      if((ya<=yc)!==(yb<=yc)){xsBuf[k++]=vx[i]+(yc-ya)*(vx[j]-vx[i])/(yb-ya);}}
    for(var a=1;a<k;a++){var v=xsBuf[a],b=a-1;while(b>=0&&xsBuf[b]>v){xsBuf[b+1]=xsBuf[b];b--;}xsBuf[b+1]=v;}
    for(var s=0;s+1<k;s+=2){
      var xa=xsBuf[s],xb=xsBuf[s+1];
      var ia=Math.max(0,Math.min(w,Math.round(xa))),ib=Math.max(0,Math.min(w,Math.round(xb)));
      tA+=Math.round(xb)-Math.round(xa);
      if(ib>ia)inter+=P[y*(w+1)+ib]-P[y*(w+1)+ia];
    }
  }
  // parte del modello sopra/sotto l'immagine
  var outV=0;
  if(ymin<0||ymax>h){ /* stima: penalizza proporzionalmente */ outV=1; }
  var uni=tA+ctx.area-inter;
  return uni>0?inter/uni:0;
}
function refine(poly,pose,ctx,steps,minSteps,maxEval){
  var p={tx:pose.tx,ty:pose.ty,th:pose.th,s:pose.s,flip:pose.flip},best=iou(poly,p,ctx),ev=1;
  var st={pos:steps.pos,th:steps.th,s:steps.s};
  while(ev<maxEval&&(st.pos>minSteps.pos||st.th>minSteps.th||st.s>minSteps.s)){
    var improved=false;
    var tries=[['tx',st.pos],['ty',st.pos],['th',st.th],['s',st.s]];
    for(var t=0;t<tries.length;t++){
      var key=tries[t][0],d=tries[t][1];
      for(var sg=-1;sg<=1;sg+=2){
        var q={tx:p.tx,ty:p.ty,th:p.th,s:p.s,flip:p.flip};
        if(key==='s')q.s=p.s*(1+sg*d);else q[key]=p[key]+sg*d;
        var v=iou(poly,q,ctx);ev++;
        if(v>best+1e-7){best=v;p=q;improved=true;}
      }
    }
    // mosse combinate lungo la diagonale
    var dd=[[1,1],[1,-1],[-1,1],[-1,-1]];
    for(var m=0;m<4;m++){var q={tx:p.tx+dd[m][0]*st.pos,ty:p.ty+dd[m][1]*st.pos,th:p.th,s:p.s,flip:p.flip};
      var v=iou(poly,q,ctx);ev++;if(v>best+1e-7){best=v;p=q;improved=true;}}
    if(!improved){st.pos/=2;st.th/=2;st.s/=2;}
  }
  p.iou=best;return p;
}
function makeCtx(mask,w,h){var c=largest(mask,w,h);return {w:w,h:h,P:prefix(c.m,w,h),area:c.area,cx:c.cx,cy:c.cy,m:c.m};}
// ricerca iniziale: 24 rotazioni, scala dall'area, poi affina le 3 migliori
function initFit(tpl,ctx,flip){
  var s0=Math.sqrt(ctx.area/tpl.area),cands=[];
  for(var k=0;k<24;k++){var th=k*Math.PI/12,pose={tx:ctx.cx,ty:ctx.cy,th:th,s:s0,flip:!!flip};cands.push({pose:pose,v:iou(tpl.poly,pose,ctx)});}
  cands.sort(function(a,b){return b.v-a.v;});
  var res=[],pos0=Math.max(1.5,0.01*Math.sqrt(ctx.area));
  for(var i=0;i<3;i++)res.push(refine(tpl.poly,cands[i].pose,ctx,{pos:pos0*2,th:0.12,s:0.05},{pos:0.05,th:0.0003,s:0.0003},900));
  res.sort(function(a,b){return b.iou-a.iou;});
  return res[0];
}
function scalePose(p,k){return {tx:p.tx*k,ty:p.ty*k,th:p.th,s:p.s*k,flip:p.flip};}
// pipeline completa su RGBA: scala grossa poi fine
function fitImage(rgba,w,h,tpl,opt){
  opt=opt||{};var light=opt.light!==false,flip=!!opt.flip,tw1=Math.min(w,opt.coarse||480),tw2=Math.min(w,opt.fine||1600);
  var d1=downscaleGray(rgba,w,h,tw1),g1=blur3(d1.g,d1.w,d1.h),thr=otsu(g1)+(opt.thrOff||0);
  var ctx1=makeCtx(makeMask(g1,d1.w,d1.h,thr,light),d1.w,d1.h);
  if(ctx1.area<50)return null;
  var p1=initFit(tpl,ctx1,flip);
  var out={coarse:p1,k1:w/d1.w,mask1:ctx1,thr:thr};
  if(tw2>tw1){
    var d2=downscaleGray(rgba,w,h,tw2),g2=blur3(d2.g,d2.w,d2.h),thr2=otsu(g2)+(opt.thrOff||0);
    var ctx2=makeCtx(makeMask(g2,d2.w,d2.h,thr2,light),d2.w,d2.h);
    var k=d2.w/d1.w,p2=refine(tpl.poly,scalePose(p1,k),ctx2,{pos:3,th:0.004,s:0.006},{pos:0.05,th:0.0001,s:0.0001},600);
    out.fine=p2;out.k2=w/d2.w;out.pose=scalePose(p2,out.k2/1);// px della foto originale (k2=w/d2.w)
    out.pose=scalePose(p2,w/d2.w);out.iou=p2.iou;
  }else{out.pose=scalePose(p1,w/d1.w);out.iou=p1.iou;}
  return out;
}
// inseguimento (video live): parte dalla posa precedente (px del fotogramma), senza la ricerca iniziale.
// opt.scoreOnly = calcola solo l'IoU della posa data (serve a controllare una posa bloccata)
function trackImage(rgba,w,h,tpl,opt,prev){
  opt=opt||{};var light=opt.light!==false,tw=Math.min(w,opt.fine||640);
  var d=downscaleGray(rgba,w,h,tw),g=blur3(d.g,d.w,d.h),thr=otsu(g)+(opt.thrOff||0);
  var ctx=makeCtx(makeMask(g,d.w,d.h,thr,light),d.w,d.h);
  if(ctx.area<50)return null;
  var p0=scalePose(prev,d.w/w);
  if(opt.scoreOnly)return {pose:prev,iou:iou(tpl.poly,p0,ctx)};
  var p=refine(tpl.poly,p0,ctx,{pos:3,th:0.01,s:0.01},{pos:0.05,th:0.0001,s:0.0001},400);
  return {pose:scalePose(p,w/d.w),iou:p.iou};
}
// ===== prova di misura: croci stampate a coordinate note (foglio generato da tools/genera_prova_misura.py) =====
// Trova le croci nella foto e confronta le posizioni previste con quelle rilevate, in mm sul piano del foglio.
function gray8(rgba,w,h){var g=new Uint8Array(w*h);for(var i=0,j=0;i<g.length;i++,j+=4)g[i]=0.299*rgba[j]+0.587*rgba[j+1]+0.114*rgba[j+2];return g;}
// macchie di inchiostro: pixel molto piu' scuri della media locale (regge luce non uniforme), 8-connesse
function inkBlobs(g,w,h){
  var gb=blur3(g,w,h),win=Math.max(15,Math.round(w/20))|1,r=(win-1)>>1,W1=w+1,I=new Float64Array(W1*(h+1)),x,y;
  for(y=0;y<h;y++){var s=0;for(x=0;x<w;x++){s+=gb[y*w+x];I[(y+1)*W1+x+1]=I[y*W1+x+1]+s;}}
  var m=new Uint8Array(w*h);
  for(y=0;y<h;y++){var y0=Math.max(0,y-r),y1=Math.min(h,y+r+1);
    for(x=0;x<w;x++){var x0=Math.max(0,x-r),x1=Math.min(w,x+r+1);
      var mean=(I[y1*W1+x1]-I[y0*W1+x1]-I[y1*W1+x0]+I[y0*W1+x0])/((x1-x0)*(y1-y0));
      if(gb[y*w+x]<0.7*mean)m[y*w+x]=1;}}
  var lab=new Uint8Array(w*h),stack=new Int32Array(w*h),out=[];
  for(var st=0;st<m.length;st++){
    if(!m[st]||lab[st])continue;
    var sp=0,b={n:0,x0:w,y0:h,x1:0,y1:0};stack[sp++]=st;lab[st]=1;
    while(sp){var p=stack[--sp],px=p%w,py=(p-px)/w;b.n++;
      if(px<b.x0)b.x0=px;if(px>b.x1)b.x1=px;if(py<b.y0)b.y0=py;if(py>b.y1)b.y1=py;
      for(var dy=-1;dy<=1;dy++){var qy=py+dy;if(qy<0||qy>=h)continue;
        for(var dx=-1;dx<=1;dx++){var qx=px+dx;if(qx<0||qx>=w)continue;var q=qy*w+qx;
          if(m[q]&&!lab[q]){lab[q]=1;stack[sp++]=q;}}}}
    if(b.n>=4)out.push(b);
  }
  return out;
}
// centro con precisione sub-pixel: baricentro dello "scuro" (sfondo - grigio) nella finestra della macchia
function blobCenter(g,w,h,b){
  var mg=Math.max(2,Math.ceil(0.25*Math.max(b.x1-b.x0,b.y1-b.y0))),x0=Math.max(0,b.x0-mg),x1=Math.min(w-1,b.x1+mg),y0=Math.max(0,b.y0-mg),y1=Math.min(h-1,b.y1+mg),v=[],x,y;
  for(y=y0;y<=y1;y++)for(x=x0;x<=x1;x++)v.push(g[y*w+x]);
  v.sort(function(a,c){return a-c;});
  var half=v.length>>1,bg=0,k;for(k=half;k<v.length;k++)bg+=v[k];bg/=(v.length-half);
  var nd=Math.max(1,Math.floor(v.length*0.03)),dk=0;for(k=0;k<nd;k++)dk+=v[k];dk/=nd;
  var t0=0.3*(bg-dk),sw=0,sx=0,sy=0;
  for(y=y0;y<=y1;y++)for(x=x0;x<=x1;x++){var wt=bg-g[y*w+x]-t0;if(wt>0){sw+=wt;sx+=wt*(x+0.5);sy+=wt*(y+0.5);}}
  return sw>0?[sx/sw,sy/sw]:[(b.x0+b.x1+1)/2,(b.y0+b.y1+1)/2];
}
function solveLin(A,b){ // eliminazione di Gauss con pivot parziale, A n x n
  var n=b.length,i,j,k;A=A.map(function(r){return r.slice();});b=b.slice();
  for(i=0;i<n;i++){var pv=i;for(j=i+1;j<n;j++)if(Math.abs(A[j][i])>Math.abs(A[pv][i]))pv=j;
    var t=A[i];A[i]=A[pv];A[pv]=t;var tb=b[i];b[i]=b[pv];b[pv]=tb;
    if(Math.abs(A[i][i])<1e-12)return null;
    for(j=i+1;j<n;j++){var f=A[j][i]/A[i][i];for(k=i;k<n;k++)A[j][k]-=f*A[i][k];b[j]-=f*b[i];}}
  var x=new Array(n);
  for(i=n-1;i>=0;i--){var s=b[i];for(j=i+1;j<n;j++)s-=A[i][j]*x[j];x[i]=s/A[i][i];}
  return x;
}
function inv3(H){
  var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7],i=H[8],A=e*i-f*h,B=-(d*i-f*g),C=d*h-e*g,det=a*A+b*B+c*C;
  if(Math.abs(det)<1e-18)return null;
  return [A/det,-(b*i-c*h)/det,(b*f-c*e)/det,B/det,(a*i-c*g)/det,-(a*f-c*d)/det,C/det,-(a*h-b*g)/det,(a*e-b*d)/det];
}
function app3(H,x,y){var w=H[6]*x+H[7]*y+H[8];return [(H[0]*x+H[1]*y+H[2])/w,(H[3]*x+H[4]*y+H[5])/w];}
function mul3(A,B){var o=[],i,j;for(i=0;i<3;i++)for(j=0;j<3;j++)o.push(A[i*3]*B[j]+A[i*3+1]*B[3+j]+A[i*3+2]*B[6+j]);return o;}
function normT(pts){var cx=0,cy=0,i;for(i=0;i<pts.length;i++){cx+=pts[i][0];cy+=pts[i][1];}cx/=pts.length;cy/=pts.length;
  var d=0;for(i=0;i<pts.length;i++)d+=Math.hypot(pts[i][0]-cx,pts[i][1]-cy);d/=pts.length;var s=Math.SQRT2/d;return [s,0,-s*cx,0,s,-s*cy,0,0,1];}
// omografia (prospettiva) foglio -> immagine, minimi quadrati con normalizzazione
function fitHom(P,Q){
  var Tp=normT(P),Tq=normT(Q),n=P.length,AtA=[],Atb=[],i,j,k;
  for(i=0;i<8;i++){AtA.push(new Array(8).fill(0));Atb.push(0);}
  for(k=0;k<n;k++){
    var p=app3(Tp,P[k][0],P[k][1]),q=app3(Tq,Q[k][0],Q[k][1]),x=p[0],y=p[1],u=q[0],v=q[1];
    var rows=[[[x,y,1,0,0,0,-u*x,-u*y],u],[[0,0,0,x,y,1,-v*x,-v*y],v]];
    for(var r=0;r<2;r++){var row=rows[r][0],bb=rows[r][1];for(i=0;i<8;i++){Atb[i]+=row[i]*bb;for(j=0;j<8;j++)AtA[i][j]+=row[i]*row[j];}}
  }
  var h=solveLin(AtA,Atb);if(!h)return null;
  var Hn=[h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1],Tqi=inv3(Tq);if(!Tqi)return null;
  return mul3(Tqi,mul3(Hn,Tp));
}
// similitudine (rotazione + scala + traslazione), come il modello usato dall'app per le sagome: Q = a*P + b (numeri complessi)
function fitSim(P,Q){
  var n=P.length,pcx=0,pcy=0,qcx=0,qcy=0,i;
  for(i=0;i<n;i++){pcx+=P[i][0];pcy+=P[i][1];qcx+=Q[i][0];qcy+=Q[i][1];}
  pcx/=n;pcy/=n;qcx/=n;qcy/=n;
  var nr=0,ni=0,den=0;
  for(i=0;i<n;i++){var px=P[i][0]-pcx,py=P[i][1]-pcy,qx=Q[i][0]-qcx,qy=Q[i][1]-qcy;nr+=px*qx+py*qy;ni+=px*qy-py*qx;den+=px*px+py*py;}
  var ar=nr/den,ai=ni/den;
  return {ar:ar,ai:ai,bx:qcx-(ar*pcx-ai*pcy),by:qcy-(ai*pcx+ar*pcy),scale:Math.hypot(ar,ai),rot:Math.atan2(ai,ar)};
}
function statErr(vs){var n=vs.length,s=0,s2=0,mx=0;for(var i=0;i<n;i++){var e=Math.hypot(vs[i][0],vs[i][1]);s+=e;s2+=e*e;if(e>mx)mx=e;}return {mean:s/n,rms:Math.sqrt(s2/n),max:mx};}
// layout = contenuto di src/prova_misura.json; opt.fx / opt.fy = misura reale delle barre / nominale (correzione di stampa)
function misuraProva(rgba,w,h,layout,opt){
  opt=opt||{};var fx=opt.fx||1,fy=opt.fy||1;
  var g=gray8(rgba,w,h),blobs=inkBlobs(g,w,h),cand=[],i,j;
  blobs.forEach(function(b){var bw=b.x1-b.x0+1,bh=b.y1-b.y0+1;
    if(bw<3||bh<3||bw>0.3*w||bh>0.3*h||Math.max(bw,bh)/Math.min(bw,bh)>1.6)return;
    b.fill=b.n/(bw*bh);cand.push(b);});
  var discs=cand.filter(function(b){return b.fill>=0.55;}).sort(function(a,b){return b.n-a.n;}).slice(0,3);
  if(discs.length<3)return {error:'Non trovo i tre dischi neri agli angoli del foglio: inquadra tutto il foglio, con luce uniforme.'};
  var anc=['TL','TR','BL'].map(function(id){return layout.punti.filter(function(p){return p.id===id;})[0];});
  var dc=discs.map(function(b){return blobCenter(g,w,h,b);});
  var P0=anc[0],P1=anc[1],P2=anc[2],Q0=dc[0],Q1=dc[1],Q2=dc[2];
  // affine di partenza dai tre dischi (il piu' grande = TL, poi TR, poi BL)
  var ux=P1.x-P0.x,uy=P1.y-P0.y,vx=P2.x-P0.x,vy=P2.y-P0.y,det=ux*vy-uy*vx;
  var e1x=Q1[0]-Q0[0],e1y=Q1[1]-Q0[1],e2x=Q2[0]-Q0[0],e2y=Q2[1]-Q0[1];
  var A=[(e1x*vy-e2x*uy)/det,(-e1x*vx+e2x*ux)/det,(e1y*vy-e2y*uy)/det,(-e1y*vx+e2y*ux)/det];
  var dA=A[0]*A[3]-A[1]*A[2];
  if(!(dA>0))return {error:'Non riconosco come è girato il foglio (dischi). Riprova con il foglio intero e ben visibile.'};
  var sc=Math.sqrt(dA),tol=0.3*layout.passo*sc,used={},pairs=[],ids=[],missing=[];
  var pool=cand.filter(function(b){return discs.indexOf(b)<0;});
  layout.punti.forEach(function(p){
    var pr,k=-1,best=tol;
    if(p.id==='TL'||p.id==='TR'||p.id==='BL'){var ia=['TL','TR','BL'].indexOf(p.id);pairs.push({p:p,q:dc[ia]});return;}
    pr=[Q0[0]+A[0]*(p.x-P0.x)+A[1]*(p.y-P0.y),Q0[1]+A[2]*(p.x-P0.x)+A[3]*(p.y-P0.y)];
    for(j=0;j<pool.length;j++){if(used[j])continue;var b=pool[j],cx=(b.x0+b.x1+1)/2,cy=(b.y0+b.y1+1)/2,d=Math.hypot(cx-pr[0],cy-pr[1]);if(d<best){best=d;k=j;}}
    if(k<0){missing.push(p.id);return;}
    used[k]=1;pairs.push({p:p,q:blobCenter(g,w,h,pool[k])});
  });
  // seconda passata: con la prospettiva stimata dai punti gia' trovati si recuperano quelli mancanti (foto molto inclinate)
  if(missing.length&&pairs.length>=6){
    var H0=fitHom(pairs.map(function(r){return [r.p.x,r.p.y];}),pairs.map(function(r){return r.q;}));
    if(H0){var still=[];
      missing.forEach(function(id){
        var p=layout.punti.filter(function(z){return z.id===id;})[0],pr=app3(H0,p.x,p.y),k=-1,best=0.3*layout.passo*sc;
        for(j=0;j<pool.length;j++){if(used[j])continue;var b=pool[j],d=Math.hypot((b.x0+b.x1+1)/2-pr[0],(b.y0+b.y1+1)/2-pr[1]);if(d<best){best=d;k=j;}}
        if(k<0){still.push(id);return;}
        used[k]=1;pairs.push({p:p,q:blobCenter(g,w,h,pool[k])});});
      missing=still;}
  }
  if(pairs.length<8)return {error:'Ho trovato solo '+pairs.length+' punti su '+layout.punti.length+': avvicinati o migliora la luce.',found:pairs.length};
  var P=pairs.map(function(r){return [r.p.x*fx,r.p.y*fy];}),Q=pairs.map(function(r){return r.q;});
  var sim=fitSim(P,Q),hom=fitHom(P,Q),Hi=hom?inv3(hom):null;
  if(!hom||!Hi)return {error:'Calcolo della prospettiva non riuscito.'};
  var m2=sim.ar*sim.ar+sim.ai*sim.ai,eS=[],eH=[],pts=[];
  for(i=0;i<pairs.length;i++){
    var dx=Q[i][0]-sim.bx,dy=Q[i][1]-sim.by,zx=(dx*sim.ar+dy*sim.ai)/m2,zy=(dy*sim.ar-dx*sim.ai)/m2,hp=app3(Hi,Q[i][0],Q[i][1]);
    var vs=[zx-P[i][0],zy-P[i][1]],vh=[hp[0]-P[i][0],hp[1]-P[i][1]];
    eS.push(vs);eH.push(vh);pts.push({id:pairs[i].p.id,paper:P[i],img:Q[i],eSim:vs,eHom:vh});
  }
  return {found:pairs.length,expected:layout.punti.length,missing:missing,scale:sim.scale,rot:sim.rot,sim:statErr(eS),hom:statErr(eH),pts:pts,H:hom};
}
return {downscaleGray:downscaleGray,blur3:blur3,otsu:otsu,makeMask:makeMask,largest:largest,prefix:prefix,xform:xform,iou:iou,refine:refine,makeCtx:makeCtx,initFit:initFit,fitImage:fitImage,trackImage:trackImage,scalePose:scalePose,misuraProva:misuraProva,app3:app3,inv3:inv3};
})();
if(typeof module!=='undefined')module.exports=Core;
