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
return {downscaleGray:downscaleGray,blur3:blur3,otsu:otsu,makeMask:makeMask,largest:largest,prefix:prefix,xform:xform,iou:iou,refine:refine,makeCtx:makeCtx,initFit:initFit,fitImage:fitImage,scalePose:scalePose};
})();
if(typeof module!=='undefined')module.exports=Core;
