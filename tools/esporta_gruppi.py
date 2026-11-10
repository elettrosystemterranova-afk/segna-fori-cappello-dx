"""Aggiunge a src\\data.json i gruppi di sagome letti da analisi_gruppi.py.
Le 62 sagome di Cappello DX restano identiche (contorni e fori non vengono toccati):
si aggiungono solo i campi 'grp' (gruppo) e 't' (titolo da mostrare).
Per i nuovi gruppi il titolo e' il numero inciso (tools\\numeri_gruppi.json).
Uso: python -I tools\\esporta_gruppi.py <pickle> [file_uscita]
"""
import sys, os, json, math, pickle, collections

CM = 72 / 2.54
RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRUPPO_VECCHIO = 'Cappello DX'
SIGLE = {'Braccio DX pt1': 'dx1', 'Braccio DX pt2': 'dx2', 'Braccio SX pt1': 'sx1', 'Braccio SX pt2': 'sx2'}


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    md, mi = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L if L > 0 else math.hypot(p[0] - a[0], p[1] - a[1])
        if d > md:
            md, mi = d, i
    if md > eps:
        return rdp(pts[:mi + 1], eps)[:-1] + rdp(pts[mi:], eps)
    return [a, b]


def semplifica(pl):
    """Chiude l'anello e lo semplifica (tolleranza 0,03 cm), come in export.py."""
    if pl[0] != pl[-1]:
        pl = pl + [pl[0]]
    far = max(range(len(pl)), key=lambda i: math.hypot(pl[i][0] - pl[0][0], pl[i][1] - pl[0][1]))
    s = rdp(pl[:far + 1], 0.03)[:-1] + rdp(pl[far:], 0.03)
    return s[:-1]


def converti(g, pz, titolo):
    pl = semplifica([(x / CM, y / CM) for x, y in pz['poly']])
    A = cx = cy = 0
    for i in range(len(pl)):
        x1, y1 = pl[i]
        x2, y2 = pl[(i + 1) % len(pl)]
        c = x1 * y2 - x2 * y1
        A += c
        cx += (x1 + x2) * c
        cy += (y1 + y2) * c
    A /= 2
    cx /= 6 * A
    cy /= 6 * A
    poly = [[round(x - cx, 2), round(y - cy, 2)] for x, y in pl]
    # w e h dal contorno campionato (il rect dei disegni include i punti di controllo delle curve)
    w = max(p[0] for p in pl) - min(p[0] for p in pl)
    h = max(p[1] for p in pl) - min(p[1] for p in pl)
    fori = sorted(pz['fori'], key=lambda c: (c[0], c[1]))
    holes = [[round(x / CM - cx, 2), round(y / CM - cy, 2), 'H%d' % (i + 1)] for i, (x, y) in enumerate(fori)]
    return dict(id='%s-%d.%d' % (SIGLE[g['nome']], pz['pagina'], pz['k']), grp=g['nome'], t=titolo,
                w=round(w, 1), h=round(h, 1), g='B', area=round(abs(A), 1), poly=poly, holes=holes)


if __name__ == '__main__':
    pk = sys.argv[1]
    uscita = sys.argv[2] if len(sys.argv) > 2 else os.path.join(RADICE, 'src', 'data.json')
    numeri = json.load(open(os.path.join(RADICE, 'tools', 'numeri_gruppi.json'), encoding='utf-8'))
    vecchi = [d for d in json.load(open(os.path.join(RADICE, 'src', 'data.json'), encoding='utf-8'))
              if d.get('grp', GRUPPO_VECCHIO) == GRUPPO_VECCHIO]
    for d in vecchi:
        d['grp'] = GRUPPO_VECCHIO
        d['t'] = 'Foglio ' + d['id']
    nuovi = []
    for g in pickle.load(open(pk, 'rb')):
        tit = numeri[g['nome']]
        usati = collections.Counter()
        for pz in sorted(g['pezzi'], key=lambda p: (p['pagina'], p['k'])):
            chiave = '%d.%d' % (pz['pagina'], pz['k'])
            t = tit.get(chiave)
            if t is None:
                print('ATTENZIONE: nessun numero per', g['nome'], chiave, '-> uso il codice foglio')
                t = 'Foglio ' + chiave
            usati[t] += 1
            nuovi.append(converti(g, pz, t))
        doppi = [t for t, n in usati.items() if n > 1]
        extra = [k for k in tit if k not in ['%d.%d' % (p['pagina'], p['k']) for p in g['pezzi']]]
        print('%s: %d sagome, titoli doppi: %s, numeri senza sagoma: %s' % (g['nome'], sum(usati.values()), doppi or 'nessuno', extra or 'nessuno'))
    out = vecchi + nuovi
    json.dump(out, open(uscita, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    print('totale', len(out), 'sagome ->', uscita, os.path.getsize(uscita), 'byte')
