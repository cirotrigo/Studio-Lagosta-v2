# -*- coding: utf-8 -*-
"""Cor: fidelidade a FOTOGRAFIA, nao saturacao HSV.

🔴 A saturacao HSV mente quando o veu tem COR. O veu do Espeto e um marrom
saturado (rgb 23,14,9): compor um pixel cinzento em direcao a ele AUMENTA a
saturacao HSV, porque S = (max-min)/max e o marrom tem matiz forte. Medido na
amostra: pelo HSV o veu "ganha" 2,4% de saturacao — enquanto a olho nu as
bandejas de marmitex e a piscina de bolinhas estao visivelmente mais mortas.

O que responde a pergunta certa e a distancia ate a foto ORIGINAL: croma media
em CIELAB (o quanto de cor existe) e o desvio medio de cor em relacao a foto
sem nenhuma camada. Menor desvio = a fotografia que o fotografo entregou.
"""
import json, os, sys
from PIL import Image, ImageCms, ImageStat

BASE = os.path.dirname(os.path.abspath(__file__))
_srgb = ImageCms.createProfile('sRGB')
_lab = ImageCms.createProfile('LAB')
_t = ImageCms.buildTransformFromOpenProfiles(_srgb, _lab, 'RGB', 'LAB')


def para_lab(im):
    return ImageCms.applyTransform(im, _t)


def croma(im_lab, masc=None):
    a = ImageStat.Stat(im_lab.getchannel(1), masc)
    b = ImageStat.Stat(im_lab.getchannel(2), masc)
    # canais a/b vem deslocados de 128; croma media aproximada
    A, B = a.mean[0] - 128.0, b.mean[0] - 128.0
    a2 = ImageStat.Stat(im_lab.getchannel(1), masc).stddev[0]
    b2 = ImageStat.Stat(im_lab.getchannel(2), masc).stddev[0]
    return (A * A + B * B) ** 0.5, (a2 + b2) / 2


def desvio(lab1, lab2, masc):
    """Distancia media de cor (a,b) entre dois renders, so onde a mascara deixa."""
    d = Image.new('L', lab1.size)
    p1a, p1b = lab1.getchannel(1).load(), lab1.getchannel(2).load()
    p2a, p2b = lab2.getchannel(1).load(), lab2.getchannel(2).load()
    m = masc.load()
    W, H = lab1.size
    tot, n = 0.0, 0
    for y in range(0, H, 3):
        for x in range(0, W, 3):
            if m[x, y]:
                da = p1a[x, y] - p2a[x, y]
                db = p1b[x, y] - p2b[x, y]
                tot += (da * da + db * db) ** 0.5
                n += 1
    return tot / max(1, n)


def cover(foto, W, H):
    im = Image.open(os.path.join(BASE, 'fotos', foto + '.jpg')).convert('RGB')
    e = max(W / im.width, H / im.height)
    im = im.resize((max(1, round(im.width * e)), max(1, round(im.height * e))), Image.LANCZOS)
    ex, ey = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((ex, ey, ex + W, ey + H))


if __name__ == '__main__':
    mapa = {m['nome']: m for m in json.load(open('mapa.json', encoding='utf-8'))}
    geo = json.load(open('halo-geometria.json', encoding='utf-8'))
    rp = {}
    for _h, r in geo.items():
        for gid, v in r.items():
            rp.setdefault(gid.split(':')[0], {})[gid] = v

    print(f"{'peca':20} {'croma foto':>10} {'croma veu':>10} {'croma halo':>11} | "
          f"{'desvio veu':>10} {'desvio halo':>11}")
    ac = [0.0, 0.0, 0.0, 0.0, 0.0]
    for nome in sys.argv[1:]:
        m = mapa[nome]
        W, H = 1080, m['alt']
        foto = cover(m['foto'], W, H)
        masc = Image.new('L', (W, H), 255)
        for (x0, y0, x1, y1) in rp.get(nome, {}).values():
            for p in range(int(max(0, y0)), int(min(H, y1))):
                for q in range(int(max(0, x0)), int(min(W, x1))):
                    masc.putpixel((q, p), 0)
        arq = 'Main' if m['artboard'] == 'Main.dc.html' else nome
        lf = para_lab(foto)
        lv = para_lab(Image.open(f'render-veu/{arq}.png').convert('RGB'))
        lh = para_lab(Image.open(f'render/{arq}.png').convert('RGB'))
        cf = croma(lf, masc)[1]; cv = croma(lv, masc)[1]; ch = croma(lh, masc)[1]
        dv = desvio(lf, lv, masc); dh = desvio(lf, lh, masc)
        print(f"{nome:20} {cf:10.1f} {cv:10.1f} {ch:11.1f} | {dv:10.1f} {dh:11.1f}")
        for i, v in enumerate((cf, cv, ch, dv, dh)):
            ac[i] += v
    n = len(sys.argv) - 1
    cf, cv, ch, dv, dh = [v / n for v in ac]
    print('-' * 78)
    print(f"{'MEDIA':20} {cf:10.1f} {cv:10.1f} {ch:11.1f} | {dv:10.1f} {dh:11.1f}")
    print(f"\ncroma recuperada pelo halo: {100*(ch-cv)/max(cv,1e-6):+.1f}%  "
          f"(foto original = {cf:.1f})")
    print(f"desvio de cor ate a foto original: veu {dv:.1f} -> halo {dh:.1f}  "
          f"({100*(dh-dv)/max(dv,1e-6):+.1f}%)")
