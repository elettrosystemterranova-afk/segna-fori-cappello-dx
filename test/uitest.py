import asyncio,json,math,base64
from playwright.async_api import async_playwright
# crea PNG con PIL
from PIL import Image,ImageDraw,ImageFilter
import random
d=json.load(open('photo.json'));W,H=d['W'],d['H']
im=Image.new('L',(W,H),45);dr=ImageDraw.Draw(im);dr.polygon([tuple(p) for p in d['poly']],fill=215)
im=im.filter(ImageFilter.GaussianBlur(1.2)).convert('RGB');im.save('photo.png')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox'])
        pg=await b.new_page(viewport={'width':420,'height':900},device_scale_factor=2)
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
        import pathlib;await pg.goto(pathlib.Path(__file__).resolve().parent.parent.joinpath('docs/index.html').as_uri())
        await pg.select_option('#pc',label=[o for o in await pg.eval_on_selector_all('#pc option','os=>os.map(o=>o.textContent)') if o.startswith('Foglio 5.1')][0])
        await pg.set_input_files('#gal','photo.png')
        await pg.wait_for_function("document.getElementById('badge').textContent.length>3 && document.getElementById('badge').textContent!='…'",timeout=60000)
        await pg.wait_for_timeout(500)
        print('badge:',await pg.inner_text('#badge'));print('info:',await pg.inner_text('#info'));print('msg:',await pg.inner_text('#msg'))
        await pg.screenshot(path='ui1.png',full_page=True)
        await pg.click('.chip >> nth=0');await pg.wait_for_timeout(300)
        await pg.locator('#stage').screenshot(path='ui2.png')
        print('errori:',errs)
        # verifica posizione fori: confronto con verita'
        await b.close()
asyncio.run(main())
