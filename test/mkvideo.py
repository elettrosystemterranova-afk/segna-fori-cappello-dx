"""Crea un video sintetico (formato y4m) per provare il video live con la fotocamera finta di Chromium.
Sagoma Cappello DX 5.1 su fondo scuro: 3 s pulita, 4 s con una "mano" scura che la copre in parte, 3 s pulita (poi ricomincia).
Scrive video_live.y4m e video_live.json (posa vera, per misurare l'errore). Uso: python mkvideo.py
"""
import json, math, os, random
from PIL import Image, ImageDraw, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
W, H, FPS = 1280, 720, 5
data = json.load(open(os.path.join(AQUI, '..', 'src', 'data.json'), encoding='utf-8'))
tpl = next(d for d in data if d['id'] == '5.1')
s = 0.72 * H / max(tpl['w'], tpl['h'])
pose = dict(tx=W / 2 + 25, ty=H / 2 - 10, th=0.9, s=s, flip=False)


def xf(x, y):
    c, sn = math.cos(pose['th']), math.sin(pose['th'])
    return (pose['tx'] + s * (c * x - sn * y), pose['ty'] + s * (sn * x + c * y))


poly = [xf(x, y) for x, y in tpl['poly']]
SS = 3
big = Image.new('L', (W * SS, H * SS), 45)
ImageDraw.Draw(big).polygon([(x * SS, y * SS) for x, y in poly], fill=215)
base = big.resize((W, H), Image.BOX).filter(ImageFilter.GaussianBlur(1.0))
# mano: rettangolo scuro che copre circa un terzo della sagoma
xs = [p[0] for p in poly]
ys = [p[1] for p in poly]
cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
mano = base.copy()
ImageDraw.Draw(mano).rectangle([cx - 10, cy - 260, cx + 400, cy + 40], fill=60)
random.seed(1)


def frame(img):
    im = img.copy()
    px = im.load()
    for _ in range(W * H // 12):  # rumore leggero
        x, y = random.randrange(W), random.randrange(H)
        px[x, y] = max(0, min(255, px[x, y] + random.randint(-9, 9)))
    return im.tobytes() + b'\x80' * (W * H // 2)  # Y + U,V neutri (grigio)


fasi = [base] * (3 * FPS) + [mano] * (4 * FPS) + [base] * (3 * FPS)
with open(os.path.join(AQUI, 'video_live.y4m'), 'wb') as f:
    f.write(('YUV4MPEG2 W%d H%d F%d:1 Ip A1:1 C420jpeg\n' % (W, H, FPS)).encode())
    for img in fasi:
        f.write(b'FRAME\n' + frame(img))
json.dump(dict(W=W, H=H, FPS=FPS, pose=pose, holes=tpl['holes'], sPxCm=s), open(os.path.join(AQUI, 'video_live.json'), 'w'))
print('video_live.y4m:', len(fasi), 'fotogrammi a', FPS, 'fps,', round(s, 2), 'px/cm')
