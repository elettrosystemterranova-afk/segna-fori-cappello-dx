# Prompt per Claude Code

Avvia Claude Code dentro la cartella di progetto e incolla tutto quello che segue la linea.

---

Contesto
Ho una web app italiana "Segna fori – Cappello DX" già funzionante come prototipo (cartella `docs/`, sorgenti in `src/`, test in `test/`; leggi prima `README.md`). Serve a segnare a penna i fori dei dowel (Ø 3,3 mm) su sagome di polistirolo già tagliate: si fotografa la sagoma dall'alto con il telefono su cavalletto e l'app sovrappone i fori nella posizione esatta. L'allineamento adatta il contorno noto (poligoni in cm in `src/data.json`, 62 sagome) alla silhouette trovata nella foto, massimizzando l'IoU (`src/core.js`, JS puro). Su immagini sintetiche l'errore sui fori è sotto 0,2 mm, ma su foto reali NON è mai stato misurato: non dichiarare precisioni che non hai misurato.

Perché passiamo a un repository
La versione pubblicata come artifact di Claude non può usare la fotocamera live (il visualizzatore la blocca). Su GitHub Pages (HTTPS) `getUserMedia` funziona.

Cosa voglio, in quest'ordine
1. Repository: esegui `git init`, primo commit, crea il repository GitHub con `gh repo create` (chiedimi se pubblico o privato e il nome; proponi `segna-fori-cappello-dx`), pubblica `docs/` con GitHub Pages dal branch main e dammi l'URL. Commit piccoli e messaggi chiari.
2. Verifica base: avvia un server locale su `docs/`, esegui `node test/test.js` e `python3 test/uitest.py` (serve `pip install playwright pillow` e `playwright install chromium`; esegui dalla cartella test/ dopo `node mkphoto.js`) e dimmi se passano.
3. Video live vero: il pulsante "Video live" è scritto ma mai provato. Fallo funzionare su Android Chrome e iPhone Safari: camera posteriore alla massima risoluzione utile, `getUserMedia`, loop con tracking continuo, posa tenuta se la qualità (IoU) scende (mano che copre la sagoma), pulsante "Blocca posa", Wake Lock per non spegnere lo schermo, torcia se disponibile. Sposta il calcolo in un Web Worker per non bloccare il video.
4. Precisione reale (la parte più importante):
   a. Modalità "Prova di misura": genero un PDF A4 da stampare con croci a coordinate note; l'app fotografa il foglio e mostra l'errore in mm tra croci previste e rilevate, così misuro la precisione vera del mio telefono e cavalletto.
   b. Correzione di prospettiva e distorsione: valuta 4 marcatori ArUco (OpenCV.js da CDN o libreria leggera) sul piano della sagoma, con omografia. Proponimi prima pro e contro e fai misure a confronto prima di tenerla.
   c. Considera la parallasse dovuta allo spessore del polistirolo e dimmi quanto pesa.
5. App installabile: manifest e service worker per l'uso offline sul telefono (PWA), icona semplice.
6. Interfaccia in italiano, semplice da usare con una mano guardando lo schermo, pulsanti grandi. Mantieni lo stile attuale.

Regole
- Non cambiare `src/data.json` né le quote senza dirmelo. Se rigeneri i dati dai PDF (script in `tools/`, servono i PDF originali, che non sono nel repository) confronta con i dati attuali.
- Prima di ogni commit grosso esegui i test. Se un test fallisce, spiega perché invece di allentare le soglie.
- Se una scelta tecnica è dubbia, chiedimi prima di procedere.
- Alla fine dammi: URL della pagina, cosa hai misurato davvero, cosa resta da provare.
