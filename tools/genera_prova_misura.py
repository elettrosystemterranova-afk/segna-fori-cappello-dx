"""Genera il foglio A4 della "Prova di misura" (docs\\prova-misura-A4.pdf) e il file con le
coordinate delle croci (src\\prova_misura.json), che l'app usa per confrontare previsto e rilevato.
Coordinate in mm dall'angolo in alto a sinistra del foglio, y verso il basso.
Uso: python -I tools\\genera_prova_misura.py
"""
import os, json
import pymupdf as fitz

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MM = 72 / 25.4
COLS, RIGHE = 5, 7
X0, Y0, PASSO = 35.0, 45.0, 35.0     # prima croce e distanza tra le croci (mm)
BRACCIO, SPESSORE = 8.0, 0.6         # mezza lunghezza del braccio e spessore del tratto (mm)
# dischi pieni agli angoli: servono a riconoscere come e' girato il foglio (diametri diversi)
ANCORE = {(0, 0): ('TL', 10.0), (COLS - 1, 0): ('TR', 7.0), (0, RIGHE - 1): ('BL', 5.0)}
BARRA_H = dict(x0=30.0, x1=180.0, y=278.0)   # 150 mm, da misurare col righello
BARRA_V = dict(x=14.0, y0=30.0, y1=280.0)    # 250 mm

punti = []
for r in range(RIGHE):
    for c in range(COLS):
        x, y = X0 + c * PASSO, Y0 + r * PASSO
        if (c, r) in ANCORE:
            nome, d = ANCORE[(c, r)]
            punti.append(dict(id=nome, x=x, y=y, tipo='disco', d=d))
        else:
            punti.append(dict(id='R%dC%d' % (r + 1, c + 1), x=x, y=y, tipo='croce'))

doc = fitz.open()
pg = doc.new_page(width=210 * MM, height=297 * MM)
P = lambda x, y: fitz.Point(x * MM, y * MM)
sh = pg.new_shape()
for p in punti:
    if p['tipo'] == 'croce':
        sh.draw_line(P(p['x'] - BRACCIO, p['y']), P(p['x'] + BRACCIO, p['y']))
        sh.draw_line(P(p['x'], p['y'] - BRACCIO), P(p['x'], p['y'] + BRACCIO))
sh.finish(width=SPESSORE * MM, color=(0, 0, 0))
sh.commit()
sh = pg.new_shape()
for p in punti:
    if p['tipo'] == 'disco':
        sh.draw_circle(P(p['x'], p['y']), p['d'] / 2 * MM)
sh.finish(fill=(0, 0, 0), color=(0, 0, 0), width=0)
sh.commit()
# barre di controllo con tacche alle estremita'
sh = pg.new_shape()
sh.draw_line(P(BARRA_H['x0'], BARRA_H['y']), P(BARRA_H['x1'], BARRA_H['y']))
for x in (BARRA_H['x0'], BARRA_H['x1']):
    sh.draw_line(P(x, BARRA_H['y'] - 3), P(x, BARRA_H['y'] + 3))
sh.draw_line(P(BARRA_V['x'], BARRA_V['y0']), P(BARRA_V['x'], BARRA_V['y1']))
for y in (BARRA_V['y0'], BARRA_V['y1']):
    sh.draw_line(P(BARRA_V['x'] - 3, y), P(BARRA_V['x'] + 3, y))
sh.finish(width=0.35 * MM, color=(0, 0, 0))
sh.commit()
T = lambda x, y, s, fs=9: pg.insert_text(P(x, y), s, fontsize=fs, fontname='helv', color=(0, 0, 0))
T(35, 16, 'PROVA DI MISURA - Segna fori', 12)
T(35, 24, 'Stampa al 100% (dimensione reale), NON "adatta alla pagina". Poi misura le due barre col righello.', 7.5)
T(35, 29, 'Barra orizzontale nominale 150 mm, verticale 250 mm (da tacca a tacca). Non scrivere sul foglio.', 7.5)
T(BARRA_H['x0'], BARRA_H['y'] + 8, 'barra orizzontale: 150 mm', 7.5)
pg.insert_text(P(BARRA_V['x'] + 5, 165), 'barra verticale: 250 mm', fontsize=7.5, fontname='helv', rotate=90, color=(0, 0, 0))
doc.save(os.path.join(RADICE, 'docs', 'prova-misura-A4.pdf'))
json.dump(dict(A4=[210, 297], braccio=BRACCIO, spessore=SPESSORE, passo=PASSO, cols=COLS, righe=RIGHE,
               barra_h=BARRA_H['x1'] - BARRA_H['x0'], barra_v=BARRA_V['y1'] - BARRA_V['y0'], punti=punti),
          open(os.path.join(RADICE, 'src', 'prova_misura.json'), 'w'), separators=(',', ':'))
print('PDF e layout creati:', len(punti), 'punti (', sum(1 for p in punti if p['tipo'] == 'croce'), 'croci,', len(ANCORE), 'dischi )')
