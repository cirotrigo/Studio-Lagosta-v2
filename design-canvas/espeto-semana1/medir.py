# -*- coding: utf-8 -*-
"""Compara veu x halo com numero, nao com impressao.

Tres medidas, cada uma respondendo a uma pergunta diferente:

  FOTOGRAFIA  luminancia e saturacao medias do quadro inteiro. E a medida que
              o Ciro pediu ("a foto de fundo precisa ser destaque e aparecer
              mais") e a que o By Rock reportou.
  FORA DO TEXTO  as mesmas medias so onde NAO ha bloco de texto. Isola o ganho
              real da fotografia do efeito de a propria mancha estar no quadro.
  TINTA NO TEXTO  quanto de escurecimento chegou de fato a regiao onde a letra
              cai. Medida por composicao inversa contra a foto ORIGINAL:
              se render = foto*(1-a) + tinta*a, entao a = (foto-render)/(foto-tinta).
              A mediana descarta os pixels de glifo, que sao minoria e mais
              claros que o fundo. E a prova de que aliviar a foto nao custou
              legibilidade.
"""
import json, os, sys
from PIL import Image, ImageStat

BASE = os.path.dirname(os.path.abspath(__file__))
TINTA_L = 0.299 * 23 + 0.587 * 14 + 0.114 * 9          # luminancia da tinta do halo


def cover(foto, W, H):
    im = Image.open(os.path.join(BASE, 'fotos', foto + '.jpg')).convert('RGB')
    e = max(W / im.width, H / im.height)
    im = im.resize((max(1, round(im.width * e)), max(1, round(im.height * e))), Image.LANCZOS)
    ex, ey = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((ex, ey, ex + W, ey + H))


def medias(im, mascara=None):
    st = ImageStat.Stat(im.convert('L'), mascara)
    hsv = ImageStat.Stat(im.convert('HSV').getchannel('S'), mascara)
    return st.mean[0], hsv.mean[0]


def tinta_media(foto_im, render_im, rect):
    x0, y0, x1, y1 = [int(v) for v in rect]
    f = foto_im.crop((x0, y0, x1, y1)).convert('L')
    r = render_im.crop((x0, y0, x1, y1)).convert('L')
    vals = []
    for pf, pr in zip(f.getdata(), r.getdata()):
        den = pf - TINTA_L
        if den > 12:                       # foto escura demais nao informa nada
            a = (pf - pr) / den
            if -0.1 <= a <= 1.2:
                vals.append(a)
    if not vals:
        return None
    vals.sort()
    return vals[len(vals) // 2]


if __name__ == '__main__':
    mapa = {m['nome']: m for m in json.load(open('mapa.json', encoding='utf-8'))}
    geo = json.load(open('halo-geometria.json', encoding='utf-8'))
    rects_por_peca = {}
    for _h, r in geo.items():
        for gid, v in r.items():
            rects_por_peca.setdefault(gid.split(':')[0], {})[gid] = v

    print(f"{'peca':20} {'':>7} {'lum':>6} {'sat':>6} | {'lum fora':>9} {'sat fora':>9} | tinta no texto")
    tot = {'veu': [0, 0, 0, 0], 'halo': [0, 0, 0, 0]}
    for nome in sys.argv[1:]:
        m = mapa[nome]
        W, H = 1080, m['alt']
        foto = cover(m['foto'], W, H)
        rects = rects_por_peca.get(nome, {})
        # mascara: branco onde NAO ha bloco de texto
        masc = Image.new('L', (W, H), 255)
        for (x0, y0, x1, y1) in rects.values():
            for p in range(int(max(0, y0)), int(min(H, y1))):
                for q in range(int(max(0, x0)), int(min(W, x1))):
                    masc.putpixel((q, p), 0)
        arq = 'Main' if m['artboard'] == 'Main.dc.html' else nome
        for modo, pasta in (('veu', 'render-veu'), ('halo', 'render')):
            im = Image.open(f'{pasta}/{arq}.png').convert('RGB')
            L, S = medias(im)
            Lf, Sf = medias(im, masc)
            tintas = [tinta_media(foto, im, r) for r in rects.values()]
            tintas = [t for t in tintas if t is not None]
            t = f"{sum(tintas)/len(tintas):.2f}" if tintas else '  -'
            print(f"{nome if modo=='veu' else '':20} {modo:>7} {L:6.1f} {S:6.1f} | "
                  f"{Lf:9.1f} {Sf:9.1f} | {t:>6}")
            for i, v in enumerate((L, S, Lf, Sf)):
                tot[modo][i] += v
    n = len(sys.argv) - 1
    print('-' * 78)
    for modo in ('veu', 'halo'):
        L, S, Lf, Sf = [v / n for v in tot[modo]]
        print(f"{'MEDIA da amostra':20} {modo:>7} {L:6.1f} {S:6.1f} | {Lf:9.1f} {Sf:9.1f}")
    v, h = tot['veu'], tot['halo']
    print(f"{'ganho do halo':20} {'':>7} {100*(h[0]/v[0]-1):+5.1f}% {100*(h[1]/v[1]-1):+5.1f}% | "
          f"{100*(h[2]/v[2]-1):+8.1f}% {100*(h[3]/v[3]-1):+8.1f}%")
