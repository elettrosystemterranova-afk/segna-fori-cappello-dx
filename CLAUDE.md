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

## Salvataggio automatico (solo per questo progetto, deciso dall'utente il 2026-11-11)
- Serve per provare sul telefono: la fotocamera funziona solo in https, cioè sulla pagina pubblicata da GitHub Pages.
- Dopo ogni modifica alla pagina (o ai dati) che passa i test, fai commit e push SENZA chiedere conferma, con messaggio chiaro in italiano.
- Prima di ogni push: `git status`, controllo che non ci siano segreti o file indesiderati (`.env`, token, password, PDF, `pdf-originali/`), `gh auth status` (l'account deve essere `elettrosystemterranova-afk`).
- Se i test falliscono, se compaiono file strani o segreti, o se cambiano `src/data.json` / le quote delle sagome già presenti: FERMATI e chiedi.
- Dopo il push dimmi in una riga cosa è stato salvato e ricordami di ricaricare la PWA sul telefono.
- Questa regola vale solo qui: negli altri progetti resta "mai push di tua iniziativa". Il repository resta pubblico: non rendere pubblico nient'altro e non cambiare la visibilità.

## Repository
- GitHub: `elettrosystemterranova-afk/segna-fori-cappello-dx`, PUBBLICO (scelto dall'utente il 2026-11-10: serve per GitHub Pages gratuito, HTTPS per la fotocamera).

## Stato attuale
- Repo pubblico creato, GitHub Pages attiva da `docs/` (https://elettrosystemterranova-afk.github.io/segna-fori-cappello-dx/).
- Test su immagini sintetiche (`test.js` su 292 sagome): errore medio 0,05 mm, ma il caso peggiore NON e' stabile tra le esecuzioni (il test usa rumore casuale): visti 0,55 / 0,87 / 1,39 / 2,34 mm (una volta 1 sagoma >2 mm), sempre su sagome piccole (es. sx2-1.3, 0,98 di IoU). Da indagare, non e' stato allentato nessun limite. `uitest.py` ok. Node.js installato con winget.
- Video live riscritto (2026-11-10, NON ancora salvato su GitHub né provato su telefono reale): calcolo in Web Worker (blob con `core.js`), tracking dalla posa precedente (`Core.trackImage`), posa tenuta se IoU < 0,90, "Blocca posa" (rifinitura su fotogramma fino a 2000 px, poi fori fissi sul video con controllo ogni 1,5 s), Wake Lock, torcia se il telefono la espone, camera posteriore ideal 2560×1440 con fallback.
- Prova del live: `test/mkvideo.py` + `test/livetest.py` (Chromium con fotocamera finta, video SINTETICO): worker attivo, pagina a 60 fps, posa tenuta con la "mano", errore fori dopo il blocco max 0,23 mm (sintetico). Su telefono reale (Android Chrome, iPhone Safari) NON provato.
- Nuovi gruppi aggiunti il 2026-11-10 (da `pdf-originali/`, NON su GitHub): Braccio DX pt1 (52 sagome), Braccio DX pt2 (58), Braccio SX pt1 (82), Braccio SX pt2 (38). Totale 292 con le 62 di Cappello DX, che sono rimaste identiche.
- `src/data.json`: ogni sagoma ha `grp` (gruppo) e `t` (titolo). Per i Braccio il titolo è il numero inciso, letto a vista dai tratti rossi (`tools/numeri_gruppi.json`). Per Cappello DX resta "Foglio N.k" perché i PDF originali non ci sono.
- Altri 3 gruppi aggiunti il 2026-11-11 (da `pdf-originali/`, NON ancora su GitHub, NON provati con foto reali): Cappello SX (59 sagome, 204 fori), Mano DX (88 sagome, 369 fori; il file si chiama "Mano Dx", lo script lo normalizza in "Mano DX"), Mano SX (56 sagome, 155 fori). Totale ora 495 sagome in 8 gruppi; le 292 precedenti verificate identiche (0 differenze). `node test/test.js` su 495: errore max 0,22 mm, medio 0,04 mm, nessuna >2 mm (sintetico, rumore casuale). Attenzione: ci sono sagome molto piccole (la più piccola, Mano DX "27-2", misura 1,8×2,0 cm; ~10 sotto i 5 cm): su foto reale a circa 10 px/cm saranno poche decine di pixel, la precisione lì è da verificare.
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
0c. FATTO (2026-11-11, NON ancora su GitHub, NON provato su telefono): PWA. `docs/manifest.webmanifest`, `docs/sw.js` (rete prima, copia salvata se offline; per forzare l'aggiornamento cambiare `VERSIONE`), icone in `docs/icons/` generate da `tools/genera_icone.py`, registrazione del service worker in fondo a `src/tpl.html`. Provato in Chromium su localhost: SW attivo, 7 file in cache, la pagina si riapre offline. Da fare a mano sul telefono: aprire il sito, menu → "Installa app" / "Aggiungi a Home". Nota: la fotocamera offline funziona, ma i test sul telefono vero non sono fatti.
0e. Nuovi gruppi (Cappello SX, Mano DX, Mano SX): titoli = numeri incisi letti a vista (2026-11-11, `tools/numeri_gruppi.json`). DA RICONTROLLARE col pezzo in mano: Cappello SX 14.1 (illeggibile, titolo "Foglio 14.1"), 2.1 "5", 28.1 "2" e 44.3 "1" (si vede una sola cifra, forse ne manca una), 2.3 "4:1" (sul pezzo ci sono anche "4:3", forse di un vicino), 26.1 "4:3", 44.1 "4:2". Mano DX: 1.4 "4", 1.5 "3", 1.14 "1", 3.1 "9", 4.3 "8", 5.5 "7", 5.6 "5", 6.1 "6", 6.9 "2" (cifre singole grandi), 1.13 "36-1". Fori non assegnati a nessuna sagoma (NON esportati): quasi tutti fuori dal foglio come in Braccio SX pt1; 4 sono dentro il foglio ma fuori da ogni contorno: Mano DX pag. 6 (31,9; 0,3) e (13,8; 18,7; sul bordo di una sagoma) e Mano SX pag. 1 (31,2; 55,6) e (43,2; 61,9). Da capire col pezzo/PDF se mancano fori su qualche sagoma.
0f. FATTO (2026-11-11, NON ancora su GitHub): pagina riordinata per lavorare col Video live. In alto c'è solo il pulsante grande "Video live" (diventa "Ferma video live" quando è acceso); "Scatta foto" e "Dalla galleria" sono nella scheda "Foto singola" in fondo alla pagina (id `cam` e `gal` invariati). Provati `uitest.py` e `livetest.py` (anche con `NOLOCK=1`): ok. Non provato sul telefono vero.
0g. FATTO (2026-11-11, già su GitHub): ordine attuale della pagina = scelta gruppo/sagoma → pulsante grande "Video live" con tendina chiusa "Consigli per l'inquadratura" (12 px) → scheda video con i tasti dei fori SOPRA il video → scheda "Opzioni sagoma" (spunte "capovolta" e "scura", usate di rado) → Prova di misura → Come si usa → scheda "Foto singola" in fondo (Scatta foto, Dalla galleria). L'utente ha installato la PWA sul telefono ed è ok. Il "Blocca posa" resta SOLO manuale (scelta dell'utente: niente blocco automatico, perché potrebbe bloccare con mano o sagoma ancora in movimento). Le modifiche alla pagina vengono pubblicate subito (vedi "Salvataggio automatico") per provarle sul telefono.
0h. Per la prossima sessione (2026-11-12): (a) l'utente prova sul telefono la nuova disposizione e i nuovi gruppi (Cappello SX, Mano DX, Mano SX, 495 sagome in tutto) e riporta problemi; (b) ricontrollare col pezzo in mano i titoli dubbi (elenco in 0e); (c) restano la prova di misura con foto reali (punto 0) e poi 4b/4c; (d) restano i 4 fori dentro il foglio non assegnati (0e) e le sagome molto piccole (<5 cm) da verificare su foto reali.
0d. FATTO: `test/uitest.py` e `test/livetest.py` cercavano "Foglio 5.1", ora cercano "39 ·" (nuovo titolo della sagoma 5.1 dopo il cambio titoli).
1. Repo + GitHub Pages
2. Verifica test (serve Node.js, installato con winget)
3. Video live (getUserMedia, Web Worker, Wake Lock, torcia)
4. Precisione reale: prova di misura con PDF A4, ArUco/omografia (prima pro e contro), parallasse
5. PWA (manifest, service worker, icona)
6. Interfaccia a una mano, pulsanti grandi

## Decisioni
- PWA (2026-11-11): service worker "rete prima, cache se offline" (non "cache prima") così gli aggiornamenti di GitHub Pages arrivano subito; icone generate da codice (`tools/genera_icone.py`) invece di file disegnati a mano.
- Repo pubblico perché GitHub Pages gratuito non serve repo privati.
- Ogni PDF (coppia CON/SENZA dowel) è un gruppo: pt1 e pt2 restano gruppi separati. Si possono unire in seguito.
- `pdf-originali/` e `*.pdf` sono nel `.gitignore` (file originali dell'utente, repo pubblico).
- Titolo = numero inciso letto a vista (non OCR). Letture meno sicure da ricontrollare col pezzo in mano: DX pt1 "30" (tratti accanto), DX pt2 "53" e "54" (linea che attraversa), DX pt2 "44", SX pt1 "47".
