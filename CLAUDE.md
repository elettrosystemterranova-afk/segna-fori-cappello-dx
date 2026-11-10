# Segna fori – Cappello DX

Web app italiana per segnare a penna i fori dei dowel (Ø 3,3 mm) su sagome di polistirolo già tagliate.
Si fotografa la sagoma dall'alto (telefono su cavalletto) e l'app sovrappone i fori nella posizione esatta.
Leggi `README.md` per la struttura dei file.

## Come funziona
- `src/core.js`: allineamento = adatta il contorno noto (poligoni in cm, `src/data.json`, 62 sagome) alla silhouette della foto massimizzando l'IoU. JS puro.
- `src/tpl.html` + `python src/build.py` generano `docs/index.html` (pubblicata con GitHub Pages).
- `tools/`: script Python che hanno estratto i dati dai PDF originali (i PDF NON sono nel repository).
- Test: `node test/test.js` (immagini sintetiche) e `python test/uitest.py` (Playwright, da eseguire dalla cartella `test/` dopo `node mkphoto.js`).

## Regole del progetto
- NON cambiare `src/data.json` né le quote senza avvisare l'utente. Se si rigenerano i dati dai PDF, confrontare con quelli attuali.
- Non dichiarare precisioni non misurate: su foto reali la precisione NON è mai stata misurata (sintetico: errore max 0,17 mm).
- Prima di ogni commit grosso eseguire i test; se falliscono, spiegare perché invece di allentare le soglie.
- Se una scelta tecnica è dubbia, chiedere prima.

## Repository
- GitHub: `elettrosystemterranova-afk/segna-fori-cappello-dx`, PUBBLICO (scelto dall'utente il 2026-11-10: serve per GitHub Pages gratuito, HTTPS per la fotocamera).

## Stato attuale
- Prototipo funzionante su immagini sintetiche. Repository in fase di creazione.

## Prossimi passi
1. Repo + GitHub Pages
2. Verifica test (serve Node.js, installato con winget)
3. Video live (getUserMedia, Web Worker, Wake Lock, torcia)
4. Precisione reale: prova di misura con PDF A4, ArUco/omografia (prima pro e contro), parallasse
5. PWA (manifest, service worker, icona)
6. Interfaccia a una mano, pulsanti grandi

## Decisioni
- Repo pubblico perché GitHub Pages gratuito non serve repo privati.
