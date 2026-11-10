const Core=require('../src/core.js');const data=require('../src/data.json');
function rnd(a,b){return a+Math.random()*(b-a);}
// renderer sintetico indipendente: supersampling 3x, pezzo chiaro su fondo scuro, rumore, sfocatura, occlusione
function render(tpl,pose,W,H,opt){
  const rgba=new Uint8ClampedArray(W*H*4);
  const SS=3,w=W*SS,h=H*SS,m=new Uint8Array(w*h);
  const poly=tpl.poly.map(p=>Core.xform({tx:pose.tx*SS,ty:pose.ty*SS,th:pose.th,s:pose.s*SS,flip:pose.flip},p[0],p[1]));
  let ymin=1e9,ymax=-1e9;poly.forEach(p=>{ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]);});
  for(let y=Math.max(0,Math.floor(ymin));y<Math.min(h,Math.ceil(ymax));y++){
    const yc=y+0.5,xs=[];for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;
      if((poly[i][1]<=yc)!==(poly[j][1]<=yc))xs.push(poly[i][0]+(yc-poly[i][1])*(poly[j][0]-poly[i][0])/(poly[j][1]-poly[i][1]));}
    xs.sort((a,b)=>a-b);for(let k=0;k+1<xs.length;k+=2)for(let x=Math.max(0,Math.round(xs[k]));x<Math.min(w,Math.round(xs[k+1]));x++)m[y*w+x]=1;}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    let c=0;for(let a=0;a<SS;a++)for(let b=0;b<SS;b++)c+=m[(y*SS+a)*w+x*SS+b];c/=SS*SS;
    let v=40+c*(opt.piece-40)+ (x/W)*opt.grad*20; v+=(Math.random()-0.5)*opt.noise;
    const i=(y*W+x)*4;rgba[i]=rgba[i+1]=rgba[i+2]=Math.max(0,Math.min(255,v));rgba[i+3]=255;}
  if(opt.occ){ // "mano": rettangolo scuro che copre una parte del pezzo + oggetto chiaro lontano
    const cx=pose.tx+rnd(-0.2,0.2)*pose.s*Math.min(tpl.w,tpl.h), cy=pose.ty+rnd(-0.2,0.2)*pose.s*Math.min(tpl.w,tpl.h), r=opt.occ;
    for(let y=Math.max(0,cy-r*pose.s|0);y<Math.min(H,cy+r*pose.s|0);y++)for(let x=Math.max(0,cx-r*pose.s*0.4|0);x<Math.min(W,cx+r*pose.s*0.4|0);x++){const i=(y*W+x)*4;rgba[i]=rgba[i+1]=rgba[i+2]=60;}
  }
  return rgba;
}
const W=1600,H=1200;
let all=[];
const only=process.argv[2]?process.argv[2].split(','):null;
for(const tpl of data){
  if(only&&!only.includes(tpl.id))continue;
  const diag=Math.max(tpl.w,tpl.h);
  const s=rnd(0.55,0.8)*Math.min(W,H)/diag; // px/cm
  const th=rnd(0,2*Math.PI);
  const pose={tx:W/2+rnd(-60,60),ty:H/2+rnd(-60,60),th,s,flip:false};
  const rgba=render(tpl,pose,W,H,{piece:215,noise:18,grad:1,occ:process.env.OCC?+process.env.OCC:0});
  const t0=Date.now();
  const r=Core.fitImage(rgba,W,H,tpl,{});
  const dt=Date.now()-t0;
  if(!r){console.log(tpl.id,'FAIL');continue;}
  let worst=0;
  const errs=tpl.holes.map(h=>{const a=Core.xform(r.pose,h[0],h[1]),b=Core.xform(pose,h[0],h[1]);return Math.hypot(a[0]-b[0],a[1]-b[1])/s*10;});
  worst=Math.max(...errs,0);
  all.push({id:tpl.id,worst,iou:r.iou,dt,serr:Math.abs(r.pose.s/s-1)*100,pxcm:s});
  console.log(tpl.id.padEnd(6),'iou',r.iou.toFixed(4),'err max fori (mm)',worst.toFixed(2),'err scala %',(Math.abs(r.pose.s/s-1)*100).toFixed(2),'ms',dt);
}
const w=all.map(a=>a.worst);console.log('N',all.length,'peggior errore mm',Math.max(...w).toFixed(2),'medio',(w.reduce((a,b)=>a+b,0)/w.length).toFixed(2),'fallite >2mm:',w.filter(x=>x>2).length);
