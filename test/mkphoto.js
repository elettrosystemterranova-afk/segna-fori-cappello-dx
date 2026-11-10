// genera una foto sintetica PNG (sagoma 5.1 ruotata su fondo scuro) per testare la UI
const fs=require('fs');const Core=require('../src/core.js');const data=require('../src/data.json');
const tpl=data.find(d=>d.id==='5.1');const W=1600,H=1200;
const pose={tx:820,ty:590,th:0.9,s:0.7*H/Math.max(tpl.w,tpl.h),flip:false};
const poly=tpl.poly.map(p=>Core.xform(pose,p[0],p[1]));
const {createCanvas}=(()=>{try{return require('canvas')}catch(e){return {}}})();
fs.writeFileSync('photo.json',JSON.stringify({W,H,pose,poly}));
