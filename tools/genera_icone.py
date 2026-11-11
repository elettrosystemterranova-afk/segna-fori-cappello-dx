# Genera le icone della PWA in docs\icons\ (viola scuro + mirino con foro).
# Uso (dalla cartella del progetto): python tools\genera_icone.py
import os
from PIL import Image, ImageDraw

SFONDO = (43, 35, 66)      # #2b2342, come l'intestazione dell'app
VIOLA = (106, 47, 181)     # #6a2fb5, come i pulsanti
BIANCO = (255, 255, 255)


def disegna(n, maskable):
    # Si disegna a 4x e poi si riduce, per avere bordi lisci
    s = n * 4
    im = Image.new("RGB", (s, s), SFONDO)
    d = ImageDraw.Draw(im)
    c = s / 2
    # Nelle icone "maskable" il disegno deve stare nel 60% centrale (Android taglia i bordi)
    k = 0.30 if maskable else 0.40
    r = s * k
    sp = s * 0.035
    d.ellipse([c - r, c - r, c + r, c + r], outline=BIANCO, width=int(sp))
    # Croce che esce dal cerchio
    ext = r * 1.25
    d.rectangle([c - ext, c - sp / 2, c + ext, c + sp / 2], fill=BIANCO)
    d.rectangle([c - sp / 2, c - ext, c + sp / 2, c + ext], fill=BIANCO)
    # Il foro al centro
    rf = r * 0.32
    d.ellipse([c - rf, c - rf, c + rf, c + rf], fill=VIOLA, outline=BIANCO, width=int(sp * 0.6))
    return im.resize((n, n), Image.LANCZOS)


os.makedirs("docs/icons", exist_ok=True)
for n, nome, mask in ((192, "icon-192.png", False), (512, "icon-512.png", False),
                      (512, "icon-maskable-512.png", True), (180, "apple-touch-icon.png", False)):
    disegna(n, mask).save("docs/icons/" + nome)
    print("creato", nome)
