# Segna fori – Cappello DX

Web app che, da una foto (o dal video live) di una sagoma di polistirolo, sovrappone la posizione dei fori dei dowel
(Ø 3,3 mm) per segnarli a penna. Allineamento = fitting del contorno noto (estratto dai PDF di "Slicer for Fusion 360")
sulla silhouette rilevata, massimizzando l'IoU (src/core.js, JS puro, testabile in Node).

- `src/core.js` motore di allineamento · `src/tpl.html` interfaccia · `src/data.json` 62 sagome (contorni e fori in cm)
- `python3 src/build.py` (dalla radice) genera `docs/index.html` (pagina singola, servita da GitHub Pages)
- `tools/` script Python (PyMuPDF) che hanno estratto i dati dai PDF (servono i PDF originali, non inclusi; vanno in `pdf-originali/`, che git ignora). Gruppi Braccio: `analisi_gruppi.py` → `esporta_gruppi.py`, titoli in `numeri_gruppi.json`
- `src/data.json`: 495 sagome in 8 gruppi (Cappello DX, Cappello SX, Braccio DX pt1/pt2, Braccio SX pt1/pt2, Mano DX, Mano SX)
- Per aggiungere un gruppo: PDF `<Nome> - CON DOWEL.pdf` e `<Nome> - SENZA DOWEL.pdf` in `pdf-originali/` → `python -I -W ignore tools/analisi_gruppi.py` → `tools/fogli_numeri.py` per leggere i numeri incisi (da scrivere in `tools/numeri_gruppi.json`) → aggiungere la sigla in `SIGLE` di `tools/esporta_gruppi.py` → `python -I tools/esporta_gruppi.py tools/gruppi.pkl` e controllare che le sagome vecchie restino identiche
- `test/test.js` prova su immagini sintetiche: `node test/test.js [id,id,...]` (OCC=3 per simulare una mano)
- `test/uitest.py` prova la pagina in Chrome headless (Playwright) con una foto sintetica
- `tools/genera_prova_misura.py` crea il foglio `docs/prova-misura-A4.pdf` per la "Prova di misura" (precisione reale); `test/testmisura.js` e `test/uimisura.py` la provano su foto sintetiche
- `test/mkvideo.py` + `test/livetest.py` provano il video live con la fotocamera finta di Chromium (video sintetico; `NOLOCK=1` per non bloccare la posa)

- PWA: `docs/manifest.webmanifest`, `docs/sw.js` (cache offline), `docs/icons/` (create con `python tools/genera_icone.py`)

Risultati noti: su immagini sintetiche errore max sui fori 0,17 mm (62 sagome). NON ancora misurato su foto reali.
