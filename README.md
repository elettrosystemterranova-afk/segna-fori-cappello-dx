# Segna fori – Cappello DX

Web app che, da una foto (o dal video live) di una sagoma di polistirolo, sovrappone la posizione dei fori dei dowel
(Ø 3,3 mm) per segnarli a penna. Allineamento = fitting del contorno noto (estratto dai PDF di "Slicer for Fusion 360")
sulla silhouette rilevata, massimizzando l'IoU (src/core.js, JS puro, testabile in Node).

- `src/core.js` motore di allineamento · `src/tpl.html` interfaccia · `src/data.json` 62 sagome (contorni e fori in cm)
- `python3 src/build.py` (dalla radice) genera `docs/index.html` (pagina singola, servita da GitHub Pages)
- `tools/` script Python (PyMuPDF) che hanno estratto i dati dai PDF (servono i PDF originali, non inclusi)
- `test/test.js` prova su immagini sintetiche: `node test/test.js [id,id,...]` (OCC=3 per simulare una mano)
- `test/uitest.py` prova la pagina in Chrome headless (Playwright) con una foto sintetica

Risultati noti: su immagini sintetiche errore max sui fori 0,17 mm (62 sagome). NON ancora misurato su foto reali.
