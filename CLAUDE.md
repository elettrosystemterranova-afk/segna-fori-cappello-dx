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
- Repo pubblico creato, GitHub Pages attiva da `docs/` (https://elettrosystemterranova-afk.github.io/segna-fori-cappello-dx/).
- Test su immagini sintetiche passano (`test.js` su 292 sagome: errore max 0,18 mm; `uitest.py` ok). Node.js installato con winget.
- Il pulsante "Video live" l'utente dice che funziona (si vede la sagoma da centrare); non è ancora stato misurato né rifinito (Worker, Wake Lock, ecc.).
- Nuovi gruppi aggiunti il 2026-11-10 (da `pdf-originali/`, NON su GitHub): Braccio DX pt1 (52 sagome), Braccio DX pt2 (58), Braccio SX pt1 (82), Braccio SX pt2 (38). Totale 292 con le 62 di Cappello DX, che sono rimaste identiche.
- `src/data.json`: ogni sagoma ha `grp` (gruppo) e `t` (titolo). Per i Braccio il titolo è il numero inciso, letto a vista dai tratti rossi (`tools/numeri_gruppi.json`). Per Cappello DX resta "Foglio N.k" perché i PDF originali non ci sono.
- I fori dei nuovi gruppi si chiamano H1, H2... (ordinati da sinistra a destra), non A/B/C.
- Interfaccia: selettore a due livelli Gruppo → Sagoma.
- Pipeline dati: `tools/analisi_gruppi.py` → pickle → `tools/esporta_gruppi.py` (legge anche `numeri_gruppi.json`). `tools/fogli_numeri.py` crea i fogli-contatto per rileggere i numeri.
- Due fori di Braccio SX pt1 (pagine 17 e 33) sono fuori dal foglio (x negativa) e sono stati ignorati.

## Prossimi passi
1. Repo + GitHub Pages
2. Verifica test (serve Node.js, installato con winget)
3. Video live (getUserMedia, Web Worker, Wake Lock, torcia)
4. Precisione reale: prova di misura con PDF A4, ArUco/omografia (prima pro e contro), parallasse
5. PWA (manifest, service worker, icona)
6. Interfaccia a una mano, pulsanti grandi

## Decisioni
- Repo pubblico perché GitHub Pages gratuito non serve repo privati.
- Ogni PDF (coppia CON/SENZA dowel) è un gruppo: pt1 e pt2 restano gruppi separati. Si possono unire in seguito.
- `pdf-originali/` e `*.pdf` sono nel `.gitignore` (file originali dell'utente, repo pubblico).
- Titolo = numero inciso letto a vista (non OCR). Letture meno sicure da ricontrollare col pezzo in mano: DX pt1 "30" (tratti accanto), DX pt2 "53" e "54" (linea che attraversa), DX pt2 "44", SX pt1 "47".
