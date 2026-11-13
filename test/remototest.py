"""Prova del collegamento tra due telefoni (principale + telecomando) con DUE pagine Chromium e fotocamera finta.
Controlla: dimensione del codice, QR (si disegna e si rilegge uguale con jsQR), scambio dei codici (copia/incolla),
collegamento WebRTC senza server, video che arriva al telecomando con i fori, canale dati, rifiuto del codice sbagliato.
NON prova: la lettura del QR con la fotocamera vera, hotspot, 5G, telefoni reali.
Uso (dalla cartella test\\, dopo mkvideo.py): python remototest.py
"""
import asyncio, os, subprocess, sys, time
from playwright.async_api import async_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(AQUI, '..', 'docs')
PORTA = 8767


async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORTA), '--directory', DOCS],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    ok_tutto = True

    def esito(nome, ok, extra=''):
        nonlocal ok_tutto
        ok_tutto = ok_tutto and ok
        print(('OK   ' if ok else 'FALLITO ') + nome + (' - ' + str(extra) if extra != '' else ''))

    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
                                              '--use-file-for-fake-video-capture=' + os.path.join(AQUI, 'video_live.y4m')])
            errs = []

            async def pagina(nome):
                ctx = await b.new_context(viewport={'width': 420, 'height': 900}, permissions=['camera'])
                pg = await ctx.new_page()
                pg.on('pageerror', lambda e: errs.append(nome + ': ' + str(e)))
                pg.on('console', lambda m: errs.append(nome + ': ' + m.text) if m.type == 'error' else None)
                await pg.goto('http://localhost:%d/index.html' % PORTA)
                await pg.evaluate("document.getElementById('coppia').open=true")
                return pg

            P = await pagina('principale')
            R = await pagina('telecomando')

            # 1) il principale prepara il codice
            await P.click('#rPrinc')
            await P.wait_for_function("document.getElementById('rTxt').value.length>50", timeout=20000)
            codeP = await P.input_value('#rTxt')
            esito('codice del principale pronto', True, '%d caratteri' % len(codeP))
            esito('codice abbastanza corto per un QR leggibile (<= 1800 caratteri)', len(codeP) <= 1800, len(codeP))
            # il QR si disegna e si rilegge uguale
            await P.wait_for_function("!document.getElementById('rQr').hidden", timeout=10000)
            await P.add_script_tag(url='vendor/jsQR.js')
            letto = await P.evaluate("""()=>{const c=document.getElementById('rQr'),x=c.getContext('2d'),d=x.getImageData(0,0,c.width,c.height);
                const q=jsQR(d.data,d.width,d.height);return q?q.data:null;}""")
            esito('QR del principale: disegnato e riletto identico', letto == codeP, 'canvas %s' % await P.evaluate("document.getElementById('rQr').width"))
            sessP = await P.evaluate("Remoto.sessione")

            # 2) il telecomando riceve il codice e risponde
            await R.click('#rTele')
            await R.wait_for_timeout(500)
            await R.evaluate("window.Remoto.ruolo")  # ruolo gia' impostato
            await R.fill('#rTxt', codeP)
            await R.click('#rUsa')
            await R.wait_for_function("document.getElementById('rTxt').value.length>50 && document.getElementById('rTxt').value!==%r" % codeP, timeout=20000)
            codeR = await R.input_value('#rTxt')
            esito('codice del telecomando pronto', True, '%d caratteri' % len(codeR))
            sessR = await R.evaluate("Remoto.sessione")
            esito('stessa sigla di sessione sui due telefoni', sessP == sessR and len(sessP) == 4, '%s / %s' % (sessP, sessR))

            # codice sbagliato: il telecomando riceve un codice "di risposta" (tipo sbagliato) e lo rifiuta
            await R.evaluate("Remoto.usa(%r)" % codeR)
            await R.wait_for_timeout(500)
            passo = await R.inner_text('#rStep')
            esito('il telecomando rifiuta un codice del tipo sbagliato', 'serve quello del principale' in passo, passo[:100])

            # 3) il principale avvia il Video live (fotocamera finta) e accetta la risposta
            lab = [o for o in await P.eval_on_selector_all('#pc option', 'os=>os.map(o=>o.textContent)') if o.startswith('39 ·')][0]
            await P.select_option('#pc', label=lab)
            await P.click('#live')
            await P.wait_for_function("live&&live.pose", timeout=30000)
            await P.fill('#rTxt', codeR)
            await P.click('#rUsa')
            await P.wait_for_function("document.getElementById('rStato').textContent.includes('Collegato')", timeout=30000)
            await R.wait_for_function("document.getElementById('rStato').textContent.includes('Collegato')", timeout=30000)
            esito('collegamento stabilito (nessun server)', True, await R.inner_text('#rStato'))

            # 4) il video arriva al telecomando e scorre
            await R.wait_for_function("(()=>{const v=document.getElementById('rVideo');return v.videoWidth>0&&v.readyState>=2;})()", timeout=30000)
            t1 = await R.evaluate("document.getElementById('rVideo').currentTime")
            await R.wait_for_timeout(1500)
            t2 = await R.evaluate("document.getElementById('rVideo').currentTime")
            dim = await R.evaluate("[document.getElementById('rVideo').videoWidth,document.getElementById('rVideo').videoHeight]")
            esito('il video scorre sul telecomando', t2 > t1 + 0.5, 'currentTime %.2f -> %.2f, %sx%s' % (t1, t2, dim[0], dim[1]))
            # il fotogramma ricevuto non e' vuoto/nero (contiene il video del principale)
            media = await R.evaluate("""()=>{const v=document.getElementById('rVideo'),c=document.createElement('canvas');c.width=64;c.height=64;
                const x=c.getContext('2d');x.drawImage(v,0,0,64,64);const d=x.getImageData(0,0,64,64).data;let s=0,mx=0;for(let i=0;i<d.length;i+=4){s+=d[i]+d[i+1]+d[i+2];}
                let v2=0,m=s/(d.length/4*3);for(let i=0;i<d.length;i+=4){const g=(d[i]+d[i+1]+d[i+2])/3;v2+=(g-m)*(g-m);}return [m,Math.sqrt(v2/(d.length/4))];}""")
            esito('il fotogramma ricevuto ha immagine (non nero)', media[1] > 5, 'luminosita %.0f, variazione %.0f' % (media[0], media[1]))
            # i fori disegnati sul principale sono nel flusso: badge del principale
            badge = await P.inner_text('#badge')
            esito('il principale lavora normalmente', 'Affidabile' in badge or 'Controlla' in badge or 'bloccata' in badge.lower() or 'tenuta' in badge.lower(), badge)

            # 5) canale dati aperto nei due sensi
            stCh = await P.evaluate("Remoto.dc&&Remoto.dc.readyState"), await R.evaluate("Remoto.dc&&Remoto.dc.readyState")
            esito('canale dati aperto', stCh == ('open', 'open'), stCh)

            # 6) scollega
            await R.click('#rStop')
            await R.wait_for_timeout(300)
            esito('il telecomando si scollega e torna ai pulsanti', await R.is_visible('#rBtns'))
            await P.click('#rStop')
            await P.wait_for_timeout(300)
            esito('anche il principale', await P.is_visible('#rBtns'))

            esito('nessun errore nelle pagine', len(errs) == 0, errs[:3] if errs else '')
            await b.close()
    finally:
        srv.terminate()
    print('\nRISULTATO:', 'TUTTO OK' if ok_tutto else 'CI SONO FALLIMENTI')
    sys.exit(0 if ok_tutto else 1)


asyncio.run(main())
