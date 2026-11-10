// Prova del riconoscimento della "Prova di misura" su foto SINTETICHE del foglio, con errori noti
// (inclinazione, distorsione dell'obiettivo, stampa non in scala, luce non uniforme).
// Uso: node test/testmisura.js
const Core = require('../src/core.js');
const L = require('../src/prova_misura.json');

function render(sc, W, H) {
  // sc: {s px/mm, rot, gx, gy (prospettiva), k1 (distorsione), fxp, fyp (stampa)}
  const g = new Float32Array(W * H), cx = W / 2, cy = H / 2, f = 1500, SS = 3;
  const c = Math.cos(sc.rot), sn = Math.sin(sc.rot);
  function inverse(x, y) { // pixel -> millimetri effettivi sul foglio
    let u = x, v = y;
    for (let i = 0; i < 4; i++) { // inverte la distorsione radiale (punto fisso)
      const rx = (u - cx) / f, ry = (v - cy) / f, k = 1 + sc.k1 * (rx * rx + ry * ry);
      u = cx + (x - cx) / k; v = cy + (y - cy) / k;
    }
    const a = (u - cx) / sc.s, b = (v - cy) / sc.s;
    const xr = c * a + sn * b, yr = -sn * a + c * b;
    const d = 1 / (1 - sc.gx * xr - sc.gy * yr);
    return [xr * d + 105 * sc.fxp, yr * d + 148.5 * sc.fyp];
  }
  function forward(X, Y) { // millimetri effettivi -> pixel
    const Xc = X - 105 * sc.fxp, Yc = Y - 148.5 * sc.fyp, d = 1 + sc.gx * Xc + sc.gy * Yc, xr = Xc / d, yr = Yc / d;
    let u = cx + sc.s * (c * xr - sn * yr), v = cy + sc.s * (sn * xr + c * yr);
    const rx = (u - cx) / f, ry = (v - cy) / f, k = 1 + sc.k1 * (rx * rx + ry * ry);
    return [cx + (u - cx) * k, cy + (v - cy) * k];
  }
  function ink(X, Y) { // X, Y in mm effettivi; i punti nominali sono scalati dalla stampa
    const nx = X / sc.fxp, ny = Y / sc.fyp;
    const col = Math.round((nx - 35) / 35), row = Math.round((ny - 45) / 35);
    if (col >= 0 && col < L.cols && row >= 0 && row < L.righe) {
      const p = L.punti[row * L.cols + col], dx = (nx - p.x) * sc.fxp, dy = (ny - p.y) * sc.fyp;
      if (p.tipo === 'disco') { if (dx * dx + dy * dy <= (p.d / 2) ** 2) return true; }
      else { const lw = L.spessore / 2; if ((Math.abs(dx) <= L.braccio && Math.abs(dy) <= lw) || (Math.abs(dy) <= L.braccio && Math.abs(dx) <= lw)) return true; }
    }
    if (Math.abs(nx - 14) < 0.175 && ny > 30 && ny < 280) return true; // barre di controllo
    if (Math.abs(ny - 278) < 0.175 && nx > 30 && nx < 180) return true;
    return false;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let a = 0; a < SS; a++) for (let b = 0; b < SS; b++) {
      const [X, Y] = inverse(x + (a + 0.5) / SS, y + (b + 0.5) / SS), nx = X / sc.fxp, ny = Y / sc.fyp;
      const carta = nx >= 0 && nx <= 210 && ny >= 0 && ny <= 297;
      acc += carta ? (ink(X, Y) ? 30 : 205) : 45;
    }
    g[y * W + x] = acc / (SS * SS) * (0.85 + 0.3 * x / W) + (Math.random() - 0.5) * 10; // luce non uniforme + rumore
  }
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g[i]; rgba[i * 4 + 3] = 255; }
  return { rgba, forward };
}

const W = 2000, H = 1500;
const casi = [
  { nome: 'A) piatto, dritto, nessun errore', sc: { s: 4.2, rot: 0.1, gx: 0, gy: 0, k1: 0, fxp: 1, fyp: 1 } },
  { nome: 'B) inclinato ~10 gradi (prospettiva)', sc: { s: 4.2, rot: 0.1, gx: 5.7e-4, gy: 2.5e-4, k1: 0, fxp: 1, fyp: 1 } },
  { nome: 'C) prospettiva + distorsione obiettivo (k1=-0,02)', sc: { s: 4.2, rot: 0.1, gx: 5.7e-4, gy: 2.5e-4, k1: -0.02, fxp: 1, fyp: 1 } },
  { nome: 'D) piatto, stampa 0,6% piu\' lunga in verticale, SENZA correzione', sc: { s: 4.2, rot: 0.1, gx: 0, gy: 0, k1: 0, fxp: 1, fyp: 1.006 }, corr: false },
  { nome: 'E) come D ma CON la misura delle barre (correzione)', sc: { s: 4.2, rot: 0.1, gx: 0, gy: 0, k1: 0, fxp: 1, fyp: 1.006 }, corr: true },
  { nome: 'F) foglio ruotato di 90 gradi, inclinato', sc: { s: 4.2, rot: 1.5708 + 0.05, gx: 4e-4, gy: 3e-4, k1: 0, fxp: 1, fyp: 1 } },
];
let ok = true;
for (const t of casi) {
  const { rgba, forward } = render(t.sc, W, H);
  const t0 = Date.now();
  const r = Core.misuraProva(rgba, W, H, L, t.corr ? { fx: t.sc.fxp, fy: t.sc.fyp } : {});
  const ms = Date.now() - t0;
  if (r.error) { console.log(t.nome, '-> ERRORE:', r.error); ok = false; continue; }
  // errore di posizione dei centri trovati rispetto alla verita' (in mm sul foglio)
  let worst = 0;
  for (const p of r.pts) {
    const real = forward(L.punti.find(q => q.id === p.id).x * t.sc.fxp, L.punti.find(q => q.id === p.id).y * t.sc.fyp);
    worst = Math.max(worst, Math.hypot(p.img[0] - real[0], p.img[1] - real[1]) / t.sc.s);
  }
  console.log(t.nome);
  console.log('   punti %d/%d | centri trovati vs verita\': peggiore %s mm | similitudine: media %s max %s mm | prospettiva: media %s max %s mm | %d ms',
    r.found, r.expected, worst.toFixed(3), r.sim.mean.toFixed(3), r.sim.max.toFixed(3), r.hom.mean.toFixed(3), r.hom.max.toFixed(3), ms);
  if (r.found < r.expected) ok = false;
}
console.log(ok ? 'OK' : 'CI SONO PROBLEMI');
