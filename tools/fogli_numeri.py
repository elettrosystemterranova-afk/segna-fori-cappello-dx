"""Crea fogli-contatto (PNG) con i tratti rossi (numeri incisi) di ogni sagoma con fori,
per poter leggere a vista il numero di ciascuna. Legge il pickle di analisi_gruppi.py.
Uso: python -I -W ignore tools\\fogli_numeri.py <pickle> <cartella_uscita> [per_foglio]
"""
import sys, os, pickle
from PIL import Image, ImageDraw

CM = 72 / 2.54
COLS, CW, CH = 4, 300, 260


def sigla(nome):
    # "Braccio DX pt1" -> "DX1"
    p = nome.split()
    return p[1] + p[2][2:]


def disegna(pz, idx, tot_label):
    im = Image.new('RGB', (CW, CH), 'white')
    dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, CW - 1, CH - 1], outline=(180, 180, 180))
    dr.text((6, 4), tot_label, fill=(0, 0, 0))
    tratti = pz['rossi']
    if not tratti:
        dr.text((CW // 2 - 40, CH // 2), 'NESSUN TRATTO', fill=(0, 0, 0))
        return im
    xs = [x for t in tratti for x, y in t]
    ys = [y for t in tratti for x, y in t]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    sc = min((CW - 24) / max(x1 - x0, 1), (CH - 44) / max(y1 - y0, 1))
    ox = (CW - (x1 - x0) * sc) / 2 - x0 * sc
    oy = 28 + ((CH - 44) - (y1 - y0) * sc) / 2 - y0 * sc
    for t in tratti:
        pts = [(x * sc + ox, y * sc + oy) for x, y in t]
        if len(pts) > 1:
            dr.line(pts, fill=(220, 0, 0), width=2)
    dr.text((CW - 120, 4), '%.1fx%.1f cm' % (pz['w'], pz['h']), fill=(90, 90, 90))
    return im


if __name__ == '__main__':
    pk, out = sys.argv[1], sys.argv[2]
    per = int(sys.argv[3]) if len(sys.argv) > 3 else 12
    os.makedirs(out, exist_ok=True)
    celle = []
    for g in pickle.load(open(pk, 'rb')):
        for pz in sorted(g['pezzi'], key=lambda p: (p['pagina'], p['k'])):
            celle.append((sigla(g['nome']), pz))
    for n in range(0, len(celle), per):
        blocco = celle[n:n + per]
        righe = (len(blocco) + COLS - 1) // COLS
        fg = Image.new('RGB', (COLS * CW, righe * CH), 'white')
        for i, (sg, pz) in enumerate(blocco):
            etichetta = '%s p%d.%d' % (sg, pz['pagina'], pz['k'])
            fg.paste(disegna(pz, i, etichetta), ((i % COLS) * CW, (i // COLS) * CH))
        fg.save(os.path.join(out, 'foglio_%02d.png' % (n // per + 1)))
    print(len(celle), 'sagome,', (len(celle) + per - 1) // per, 'fogli in', out)
