"""Prova del video live in Chromium con fotocamera finta (video_live.y4m, vedi mkvideo.py).
Controlla: tracking, posa tenuta quando la "mano" copre la sagoma, blocco posa, fluidita' (fotogrammi al secondo),
e misura l'errore dei fori rispetto alla posa vera del video SINTETICO (non e' una misura su foto reali).
Uso (dalla cartella test\\, dopo mkvideo.py): python livetest.py
"""
import asyncio, json, math, os, subprocess, sys, time
from playwright.async_api import async_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(AQUI, '..', 'docs')
V = json.load(open(os.path.join(AQUI, 'video_live.json')))
PORTA = 8766


async def stato(pg):
    return await pg.evaluate("""()=>({t:performance.now(),live:!!live,pose:live&&live.pose?1:0,iou:live?live.iou:0,held:live?live.held:0,
        locked:live?live.locked:false,badge:document.getElementById('badge').textContent,f:window.__f,
        w:live&&live.worker?1:0,ms:document.getElementById('info').textContent})""")


async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORTA), '--directory', DOCS],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
                                              '--use-file-for-fake-video-capture=' + os.path.join(AQUI, 'video_live.y4m')])
            ctx = await b.new_context(viewport={'width': 420, 'height': 900}, permissions=['camera'])
            pg = await ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            await pg.add_init_script("window.__f=0;(function t(){window.__f++;requestAnimationFrame(t)})()")
            await pg.goto('http://localhost:%d/index.html' % PORTA)
            lab = [o for o in await pg.eval_on_selector_all('#pc option', 'os=>os.map(o=>o.textContent)') if o.startswith('Foglio 5.1')][0]
            await pg.select_option('#pc', label=lab)
            await pg.click('#live')
            await pg.wait_for_function('live&&live.pose', timeout=30000)
            print('worker attivo:', (await stato(pg))['w'] == 1)

            # osserva 22 s (due giri del video), registra le fasi
            fasi = []
            t0 = time.time()
            f0 = (await stato(pg))
            bloccato = False
            err_blocco = None
            while time.time() - t0 < 22:
                s = await stato(pg)
                fasi.append(s)
                if not bloccato and not os.environ.get('NOLOCK') and s['badge'].startswith('Affidabile'):
                    await pg.click('#lock')
                    try:
                        await pg.wait_for_function('live.locked', timeout=15000)
                        bloccato = True
                        r = await pg.evaluate("""(truth)=>{let h=%s,e=[];
                            for(const q of h){const a=Core.xform(res.pose,q[0],q[1]),b=Core.xform(truth,q[0],q[1]);e.push(Math.hypot(a[0]-b[0],a[1]-b[1]));}
                            return e;}""" % json.dumps(V['holes']), V['pose'])
                        err_blocco = [x / V['sPxCm'] * 10 for x in r]
                    except Exception as ex:
                        print('blocco non riuscito:', ex)
                await pg.wait_for_timeout(250)
            f1 = fasi[-1]
            fps = (f1['f'] - f0['f']) / ((f1['t'] - f0['t']) / 1000)
            badges = {}
            for s in fasi:
                badges[s['badge'].split(' ')[0] + ' ' + (s['badge'].split(' ')[1] if s['badge'].startswith('Posa') else '')] = badges.get(s['badge'].split(' ')[0] + ' ' + (s['badge'].split(' ')[1] if s['badge'].startswith('Posa') else ''), 0) + 1
            print('badge visti (conteggio campioni):', badges)
            print('posa tenuta vista (held>0):', any(s['held'] > 0 for s in fasi))
            print('posa bloccata:', bloccato, '| badge finale:', fasi[-1]['badge'])
            print('errore fori dopo il blocco (mm, VIDEO SINTETICO):', [round(x, 2) for x in err_blocco] if err_blocco else None)
            print('fotogrammi al secondo della pagina durante il live: %.0f' % fps)
            print('ultimo tempo di calcolo:', fasi[-1]['ms'])
            await pg.click('#live')
            print('errori pagina:', errs)
            await b.close()
    finally:
        srv.terminate()


asyncio.run(main())
