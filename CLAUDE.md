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
- Test su immagini sintetiche (`test.js` su 292 sagome): errore medio 0,05 mm, ma il caso peggiore NON e' stabile tra le esecuzioni (il test usa rumore casuale): visti 0,55 / 0,87 / 1,39 / 2,34 mm (una volta 1 sagoma >2 mm), sempre su sagome piccole (es. sx2-1.3, 0,98 di IoU). Da indagare, non e' stato allentato nessun limite. `uitest.py` ok. Node.js installato con winget.
- Video live riscritto (2026-11-10, NON ancora salvato su GitHub né provato su telefono reale): calcolo in Web Worker (blob con `core.js`), tracking dalla posa precedente (`Core.trackImage`), posa tenuta se IoU < 0,90, "Blocca posa" (rifinitura su fotogramma fino a 2000 px, poi fori fissi sul video con controllo ogni 1,5 s), Wake Lock, torcia se il telefono la espone, camera posteriore ideal 2560×1440 con fallback.
- Prova del live: `test/mkvideo.py` + `test/livetest.py` (Chromium con fotocamera finta, video SINTETICO): worker attivo, pagina a 60 fps, posa tenuta con la "mano", errore fori dopo il blocco max 0,23 mm (sintetico). Su telefono reale (Android Chrome, iPhone Safari) NON provato.
- Nuovi gruppi aggiunti il 2026-11-10 (da `pdf-originali/`, NON su GitHub): Braccio DX pt1 (52 sagome), Braccio DX pt2 (58), Braccio SX pt1 (82), Braccio SX pt2 (38). Totale 292 con le 62 di Cappello DX, che sono rimaste identiche.
- `src/data.json`: ogni sagoma ha `grp` (gruppo) e `t` (titolo). Per i Braccio il titolo è il numero inciso, letto a vista dai tratti rossi (`tools/numeri_gruppi.json`). Per Cappello DX resta "Foglio N.k" perché i PDF originali non ci sono.
- I fori dei nuovi gruppi si chiamano H1, H2... (ordinati da sinistra a destra), non A/B/C.
- Interfaccia: selettore a due livelli Gruppo → Sagoma.
- Pipeline dati: `tools/analisi_gruppi.py` → pickle → `tools/esporta_gruppi.py` (legge anche `numeri_gruppi.json`). `tools/fogli_numeri.py` crea i fogli-contatto per rileggere i numeri.
- Due fori di Braccio SX pt1 (pagine 17 e 33) sono fuori dal foglio (x negativa) e sono stati ignorati.

- Passo 4a "Prova di misura" fatto (2026-11-10, non ancora su GitHub, NON provato con foto reali): `tools/genera_prova_misura.py` crea `docs/prova-misura-A4.pdf` (5×7 punti a passo 35 mm: 32 croci + 3 dischi agli angoli di diametro 10/7/5 mm per riconoscere l'orientamento, barre di controllo 150 mm e 250 mm) e `src/prova_misura.json`. `Core.misuraProva` trova le croci (soglia adattiva, centro sub-pixel) e calcola l'errore in mm sul piano del foglio con due modelli: similitudine (quello dell'app) e omografia (prospettiva). La pagina ha una sezione "Prova di misura" con caselle per le barre misurate col righello (correggono la stampa non in scala/anisotropa).
- Test misura su foto SINTETICHE (`test/testmisura.js`): centri trovati entro 0,08 mm dalla verità; una stampa più lunga dello 0,6% in verticale genera da sola 0,35 mm di errore finto, azzerato dalla correzione con le barre. `test/uimisura.py` prova l'interfaccia col PDF vero trasformato in foto.
- Limite noto della misura: comprende anche difetti di stampa e lettura del righello (circa ±0,3 mm). L'area misurata è un A4: per sagome grandi serve ripetere la prova con il foglio in punti diversi dell'inquadratura.

## Prossimi passi
0. L'utente (2026-11-11) NON ha ancora fatto la prova di misura: ha usato il Video live sul telefono vero e ha segnato Braccio DX pt1 (funziona, nessun numero di precisione). Rifarà la prova col foglio con le croci nei prossimi giorni: poi riporta i numeri (medio/massimo, modello app vs prospettiva) e solo allora decidere 4b (ArUco/omografia: prima pro e contro e misure a confronto) e 4c (parallasse dello spessore).
0b. FATTO (2026-11-11): Cappello DX ora ha come titolo il numero inciso (62 titoli distinti, letti a vista da `tools/numeri_gruppi.json`). Geometria e id invariati (verificato: 0 differenze oltre al campo `t`). Letture meno sicure da ricontrollare col pezzo in mano: "6" (1.1, tratti sparsi), "5-1:1" (21.1) e "4-2:1" (43.1) (etichette piccole vicino alla coda di rondine), "42" (3.1), "3" (19.1), "9-1" (26.2).
0c. Dopo: PWA (5) può partire anche senza i numeri della prova di misura.
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
