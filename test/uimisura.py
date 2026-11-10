"""Prova la sezione "Prova di misura" della pagina: usa il PDF vero (docs\\prova-misura-A4.pdf) trasformato in una
"foto" sintetica (foglio ruotato e inclinato su tavolo scuro, sfocatura, rumore). Uso (dalla cartella test\\): python uimisura.py
"""
import asyncio, os, pathlib, random
import pymupdf as fitz
from PIL import Image, ImageFilter
from playwright.async_api import async_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
pdf = fitz.open(os.path.join(AQUI, '..', 'docs', 'prova-misura-A4.pdf'))
pix = pdf[0].get_pixmap(dpi=220)
foglio = Image.frombytes('RGB', (pix.width, pix.height), pix.samples).rotate(90, expand=True)
W, H = 2400, 1800
foto = Image.new('RGB', (W, H), (38, 36, 34))
foglio = foglio.resize((int(foglio.width * 0.8), int(foglio.height * 0.8)), Image.LANCZOS)
foto.paste(foglio, ((W - foglio.width) // 2, (H - foglio.height) // 2))
# lieve inclinazione (prospettiva), poi sfocatura e rumore
foto = foto.transform((W, H), Image.PERSPECTIVE, (1, 0.02, 0, 0.01, 1, 0, 0.00004, 0.00002), Image.BICUBIC, fillcolor=(38, 36, 34))
foto = foto.filter(ImageFilter.GaussianBlur(1.1)).convert('L')
px = foto.load()
random.seed(2)
for _ in range(W * H // 6):
    x, y = random.randrange(W), random.randrange(H)
    px[x, y] = max(0, min(255, px[x, y] + random.randint(-12, 12)))
foto.convert('RGB').save(os.path.join(AQUI, 'foto_misura.png'))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 420, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(pathlib.Path(AQUI).parent.joinpath('docs/index.html').as_uri())
        await pg.click('#misura summary')
        await pg.set_input_files('#mgal', os.path.join(AQUI, 'foto_misura.png'))
        await pg.wait_for_function("document.getElementById('mres').textContent.indexOf('Croci')===0||document.getElementById('mres').textContent.indexOf('Non ')===0", timeout=60000)
        print(await pg.inner_text('#mres'))
        await pg.locator('#misura').screenshot(path=os.path.join(AQUI, 'ui_misura.png'))
        print('errori pagina:', errs)
        await b.close()

asyncio.run(main())
