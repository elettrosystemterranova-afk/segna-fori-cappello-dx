"""Prova del secondo telefono (principale + telecomando) con DUE pagine Chromium e fotocamera finta.
Controlla: codice corto, QR (si disegna e si rilegge uguale con jsQR), scambio dei codici (copia/incolla),
collegamento WebRTC senza server, VIDEO vero che arriva al telecomando (non le immagini di ripiego),
schermata del telecomando (un solo video, il resto della pagina nascosto), stato e COMANDI dal telecomando
(scelta sagoma, fori, blocca posa, ferma/avvia video live), scollega.
NON prova: la lettura del QR con la fotocamera vera, hotspot, 5G, telefoni reali, ritardo.
Uso (dalla cartella test\\, dopo mkvideo.py): python remototest.py
"""
import asyncio, os, subprocess, sys, time
from playwright.async_api import async_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(AQUI, '..', 'docs')
PORTA = 8767
FALL = os.environ.get('FALLBACK') == '1'  # FALLBACK=1: il video vero viene bloccato sul principale -> deve scattare il ripiego a immagini JPEG


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
                if FALL and nome == 'principale':
                    await pg.add_init_script("RTCPeerConnection.prototype.addTrack=function(){throw new Error('video bloccato per la prova');}")
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
            esito('codice corto per un QR facile da leggere (<= 700 caratteri)', len(codeP) <= 700, len(codeP))
            await P.wait_for_function("!document.getElementById('rQr').hidden", timeout=10000)
            await P.add_script_tag(url='vendor/jsQR.js')
            letto = await P.evaluate("""()=>{const c=document.getElementById('rQr'),x=c.getContext('2d'),d=x.getImageData(0,0,c.width,c.height);
                const q=jsQR(d.data,d.width,d.height);return q?q.data:null;}""")
            esito('QR del principale: disegnato e riletto identico', letto == codeP)
            sessP = await P.evaluate("Remoto.sessione")

            # 2) il telecomando riceve il codice e risponde
            await R.click('#rTele')
            await R.wait_for_timeout(500)
            esito('il telecomando passa alla modalità telecomando', await R.evaluate("document.body.classList.contains('tele')"))
            esito('durante il collegamento il resto della pagina è nascosto',
                  not await R.is_visible('#misura') and not await R.is_visible('#live') and await R.is_visible('#rBox'))
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
            await R.wait_for_function("document.body.classList.contains('conn')", timeout=30000)
            esito('collegamento stabilito (nessun server)', True, await P.inner_text('#rStato'))

            if FALL:
                await R.wait_for_function("Remoto.fallback&&Remoto.frames>5", timeout=40000)
                esito('RIPIEGO: arrivano immagini JPEG sul telecomando', True, '%d immagini' % await R.evaluate("Remoto.frames"))
                esito('RIPIEGO: si vede immagine, non video', await R.is_visible('#rFrame') and not await R.is_visible('#rVideo'))
                m2 = await R.evaluate("""()=>{const c=document.getElementById('rFrame'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
                    let s=0,n=d.length/4;for(let i=0;i<d.length;i+=4)s+=(d[i]+d[i+1]+d[i+2])/3;const m=s/n;let v=0;
                    for(let i=0;i<d.length;i+=4){const g=(d[i]+d[i+1]+d[i+2])/3;v+=(g-m)*(g-m);}return Math.sqrt(v/n);}""")
                esito('RIPIEGO: immagine non nera', m2 > 5, 'variazione %.0f' % m2)
                esito('nessun errore nelle pagine', len(errs) == 0, errs[:3] if errs else '')
                await b.close()
                srv.terminate()
                print('RISULTATO (ripiego):', 'TUTTO OK' if ok_tutto else 'CI SONO FALLIMENTI')
                sys.exit(0 if ok_tutto else 1)

            # 4) schermata del telecomando: un solo video, il resto nascosto
            esito('il telecomando mostra la propria schermata', await R.is_visible('#teleScreen'))
            esito('il resto della pagina principale è nascosto sul telecomando',
                  not await R.is_visible('#stage') and not await R.is_visible('#misura') and not await R.is_visible('#live')
                  and not await R.is_visible('#coppia') and not await R.is_visible('#gr'))
            nvideo = await R.evaluate("[...document.querySelectorAll('video,canvas')].filter(e=>e.offsetParent!==null&&e.getBoundingClientRect().height>40).length")
            esito('un solo box video visibile sul telecomando', nvideo == 1, nvideo)

            # 5) VIDEO vero (non le immagini di ripiego)
            await R.wait_for_function("(()=>{const v=document.getElementById('rVideo');return v.videoWidth>0&&v.currentTime>0;})()", timeout=40000)
            q1 = await R.evaluate("document.getElementById('rVideo').getVideoPlaybackQuality().totalVideoFrames")
            await R.wait_for_timeout(2000)
            q2 = await R.evaluate("document.getElementById('rVideo').getVideoPlaybackQuality().totalVideoFrames")
            dim = await R.evaluate("[document.getElementById('rVideo').videoWidth,document.getElementById('rVideo').videoHeight]")
            esito('il flusso VIDEO scorre sul telecomando', (q2 - q1) / 2.0 >= 10, '~%.0f fotogrammi/s, %sx%s' % ((q2 - q1) / 2.0, dim[0], dim[1]))
            esito('non è in uso il ripiego a immagini', not await R.evaluate("Remoto.fallback") and await R.evaluate("Remoto.frames") == 0)
            media = await R.evaluate("""()=>{const v=document.getElementById('rVideo'),c=document.createElement('canvas');c.width=96;c.height=64;
                const x=c.getContext('2d');x.drawImage(v,0,0,96,64);const d=x.getImageData(0,0,96,64).data;let s=0,n=d.length/4;
                for(let i=0;i<d.length;i+=4)s+=(d[i]+d[i+1]+d[i+2])/3;const m=s/n;let v2=0;
                for(let i=0;i<d.length;i+=4){const g=(d[i]+d[i+1]+d[i+2])/3;v2+=(g-m)*(g-m);}return [m,Math.sqrt(v2/n)];}""")
            esito('il video ricevuto ha immagine (non nero)', media[1] > 5, 'luminosita %.0f, variazione %.0f' % (media[0], media[1]))

            # 6) stato dal principale al telecomando
            await R.wait_for_function("document.querySelectorAll('#tChips .chip').length>0", timeout=15000)
            nfori_p = await P.evaluate("cur().holes.length")
            nchip_r = await R.evaluate("document.querySelectorAll('#tChips .chip').length")
            esito('i tasti dei fori sul telecomando = fori della sagoma del principale', nfori_p == nchip_r, '%d / %d' % (nfori_p, nchip_r))
            esito('gruppo e sagoma uguali sui due telefoni',
                  await R.evaluate("document.getElementById('tGr').value") == await P.evaluate("grSel.value")
                  and await R.evaluate("document.getElementById('tPc').value") == await P.evaluate("pcSel.value"))
            await R.wait_for_function("document.getElementById('rBadge').textContent.length>1", timeout=10000)
            esito('il badge del principale si vede sul telecomando', True, await R.inner_text('#rBadge'))
            esito('sul telecomando il pulsante dice "Ferma video live"', 'Ferma' in await R.inner_text('#tLive'))

            # 7) comandi dal telecomando
            await R.click('#tChips .chip >> nth=0')
            await P.wait_for_function("sel===0", timeout=10000)
            esito('tocco su un foro dal telecomando: il principale lo seleziona', True)
            await R.click('#tChips .chip >> nth=0')
            await P.wait_for_function("(done[cur().id]||{})[0]===true", timeout=10000)
            await R.wait_for_function("document.querySelector('#tChips .chip').textContent.includes('✓')", timeout=10000)
            esito('secondo tocco: foro segnato come fatto (anche sul telecomando)', True)
            await R.wait_for_function("!document.getElementById('tLock').hidden", timeout=10000)
            await P.wait_for_function("live&&live.iou>0.9", timeout=30000)
            # il video finto ha una "mano" che passa: se il blocco cade in quel momento il principale dice "riprova"
            tentativi = 0
            while tentativi < 8:
                tentativi += 1
                await R.click('#tLock')
                try:
                    await P.wait_for_function("live&&live.locked", timeout=7000)
                    break
                except Exception:
                    await P.wait_for_function("live&&!live.locking", timeout=10000)
            bloccato = await P.evaluate("!!(live&&live.locked)")
            esito('Blocca posa dal telecomando: il principale blocca', bloccato, 'tentativi: %d' % tentativi)
            await R.wait_for_function("document.getElementById('tLock').textContent.includes('Sblocca')", timeout=10000)
            esito('il telecomando mostra "Sblocca posa"', True)
            await R.click('#tLock')
            await P.wait_for_function("live&&!live.locked", timeout=15000)
            esito('Sblocca posa dal telecomando', True)
            await R.click('#tLive')
            await P.wait_for_function("!live", timeout=15000)
            await R.wait_for_function("document.getElementById('tLive').textContent==='Video live'", timeout=10000)
            esito('Ferma video live dal telecomando', True)
            await R.click('#tLive')
            await P.wait_for_function("live", timeout=30000)
            esito('Video live riavviato dal telecomando', True)
            idprima = await P.evaluate("cur().id")
            await R.select_option('#tPc', index=1)
            await P.wait_for_function("cur().id!==%r" % idprima, timeout=15000)
            esito('cambio sagoma dal telecomando: il principale cambia', True, await P.evaluate("cur().t"))
            await R.select_option('#tGr', index=1)
            await P.wait_for_function("grSel.selectedIndex===1", timeout=15000)
            esito('cambio gruppo dal telecomando: il principale cambia', True, await P.evaluate("grSel.value"))

            # 8) scollega
            await R.click('#tStop')
            await R.wait_for_timeout(400)
            esito('il telecomando si scollega e torna alla pagina normale',
                  not await R.evaluate("document.body.classList.contains('tele')") and await R.is_visible('#misura') and await R.is_visible('#rBtns'))
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
