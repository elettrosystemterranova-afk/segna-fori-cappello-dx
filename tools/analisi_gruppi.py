"""Analisi dei PDF dei gruppi di sagome (cartella pdf-originali\).
Per ogni gruppo confronta il PDF SENZA dowel con quello CON dowel, trova le
sagome che hanno fori e salva i risultati in un file pickle (solo analisi, non
tocca src\\data.json).
Uso: python -I -W ignore tools\\analisi_gruppi.py
"""
import os, sys, glob, pickle, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARTELLA = os.path.join(RADICE, 'pdf-originali')
USCITA = os.environ.get('USCITA_PICKLE', os.path.join(RADICE, 'tools', 'gruppi.pkl'))
TOLL = 0.05 * CM  # 0,5 mm in punti


def forme_pagina(p):
    """Ritorna (sagome, fori) blu della pagina, senza il riquadro 50x100."""
    sag, fori = [], []
    for x in blues(p):
        r = x['rect']
        if abs(r.width - W) < 5 and abs(r.height - H) < 5:
            continue
        if len(x['items']) == 16 and r.width / CM < 0.5:
            fori.append(x)
        elif r.width / CM < 0.1 and r.height / CM < 0.2:
            continue  # tacche di allineamento
        else:
            sag.append(x)
    return sag, fori


def analizza(file_nome):
    f_con = os.path.join(CARTELLA, file_nome + ' - CON DOWEL.pdf')
    f_sen = os.path.join(CARTELLA, file_nome + ' - SENZA DOWEL.pdf')
    dc, ds = fitz.open(f_con), fitz.open(f_sen)
    nome = file_nome.replace(' Dx', ' DX')  # il file "Mano Dx" diventa il gruppo "Mano DX"
    out = dict(nome=nome, pagine=len(dc), pezzi=[], avvisi=[])
    if len(dc) != len(ds):
        out['avvisi'].append('numero pagine diverso: %d vs %d' % (len(dc), len(ds)))
    n_sag = 0
    for pn in range(min(len(dc), len(ds))):
        sag, fori = forme_pagina(dc[pn])
        sag_s, fori_s = forme_pagina(ds[pn])
        n_sag += len(sag)
        if fori_s:
            out['avvisi'].append('pagina %d: %d fori nel file SENZA dowel' % (pn + 1, len(fori_s)))
        # contorni uguali nei due file (bbox entro 0,5 mm)
        for s in sag:
            r = s['rect']
            ok = any(abs(r.x0 - t['rect'].x0) < TOLL and abs(r.y0 - t['rect'].y0) < TOLL and
                     abs(r.x1 - t['rect'].x1) < TOLL and abs(r.y1 - t['rect'].y1) < TOLL for t in sag_s)
            if not ok:
                out['avvisi'].append('pagina %d: contorno %.1fx%.1f cm senza corrispondente nel file SENZA' % (pn + 1, r.width / CM, r.height / CM))
        P = [poly(s) for s in sag]
        aree = [s['rect'].width * s['rect'].height for s in sag]

        def proprietario(c):
            cand = sorted((aree[i], i) for i in range(len(sag)) if inside(c, P[i]))
            return cand[0][1] if cand else None

        hol = collections.defaultdict(list)
        for h in fori:
            c = ((h['rect'].x0 + h['rect'].x1) / 2, (h['rect'].y0 + h['rect'].y1) / 2)
            o = proprietario(c)
            if o is None:
                out['avvisi'].append('pagina %d: foro non assegnato a nessuna sagoma' % (pn + 1))
            else:
                hol[o].append((c, h['rect'].width / CM))
        reds = collections.defaultdict(list)
        for x in dc[pn].get_drawings():
            if x.get('color') == RED:
                r = x['rect']
                o = proprietario(((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))
                if o is not None:
                    reds[o].append(poly(x))
        ordine = sorted(range(len(sag)), key=lambda i: -aree[i])
        for si in sorted(hol):
            r = sag[si]['rect']
            out['pezzi'].append(dict(pagina=pn + 1, k=ordine.index(si) + 1, bbox=(r.x0, r.y0, r.x1, r.y1),
                                     w=r.width / CM, h=r.height / CM, poly=P[si],
                                     fori=[c for c, d in hol[si]], diam=[d for c, d in hol[si]],
                                     rossi=reds.get(si, [])))
    out['n_sagome'] = n_sag
    return out


if __name__ == '__main__':
    nomi = sorted(set(os.path.basename(f).split(' - ')[0] for f in glob.glob(os.path.join(CARTELLA, '*.pdf'))))
    ris = [analizza(n) for n in nomi]
    for r in ris:
        pz = r['pezzi']
        nf = sum(len(p['fori']) for p in pz)
        dd = [d for p in pz for d in p['diam']]
        print('%s: %d pagine, %d sagome, %d con fori, %d fori, diametro %.3f-%.3f cm' % (
            r['nome'], r['pagine'], r['n_sagome'], len(pz), nf, min(dd) if dd else 0, max(dd) if dd else 0))
        for a in r['avvisi']:
            print('   AVVISO:', a)
    pickle.dump(ris, open(USCITA, 'wb'))
    print('salvato', USCITA)
