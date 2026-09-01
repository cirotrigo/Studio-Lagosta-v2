# -*- coding: utf-8 -*-
"""Duas medidas, uma por pergunta.

1. A FOTO ficou mais viva?  luminancia e saturacao medias do quadro inteiro.
2. O TEXTO continua legivel? p98 do FUNDO sob o retangulo de cada grupo.

🔴 A segunda mede a peca com o texto INVISIVEL. Medir a peca pronta inclui as
proprias letras creme (~245) no percentil e o numero deixa de dizer qualquer
coisa sobre o fundo — armadilha 4.5 do manual. E o esconde por `visibility`,
nao por `display: none`: a mancha precisa continuar EXATAMENTE onde esta, e
`display: none` no container levaria o halo junto (ele e descendente do
container, nao irmao). Referencia da casa: p98 abaixo de 150 e confortavel.
"""
import json
import os
import re
import subprocess
import sys

from PIL import Image, ImageStat

from render import CHROME, achatar, dimensoes

ALVO = 150
BASE = os.path.dirname(os.path.abspath(__file__))

# O texto some, a mancha fica, a logo some (ela e opaca e distorceria o p98
# de qualquer grupo que a inclua).
SO_O_FUNDO = (
    '<style>[data-miolo]{visibility:hidden}[data-miolo] .halo{visibility:visible}'
    # a logo e ABSOLUTA e mora FORA do miolo — escondida por seletor global,
    # senao ela entra no p98 de qualquer grupo que ela encoste (o disco e
    # opaco e o anel e dourado, os dois extremos da escala)
    'img[alt="Wine Vix"]{visibility:hidden}</style>')


def foto_viva(png):
    """Luminancia e COLORIDO medios do quadro. As letras entram nos DOIS lados
    da comparacao e por isso nao viciam a diferenca.

    🔴 A saturacao media do HSV NAO serve para medir isto aqui, e o By Rock
    nao descobriu porque a tinta dele e cinza. A tinta desta marca e o merlot
    #240000, que tem S = 1: cobrir a foto com ela SOBE a saturacao media
    enquanto destroi a cor da fotografia. Medido nesta leva: o veu dava
    saturacao 186,9 contra 171,6 do halo — o mecanismo pior "ganhava".

    O que se quer medir e VARIEDADE de cor, e para isso serve a colorfulness
    de Hasler-Susstrunk: ela soma o DESVIO dos eixos oponentes, e um banho de
    tinta unica colapsa o desvio qualquer que seja a cor da tinta.
    """
    im = Image.open(png).convert('RGB')
    luz = ImageStat.Stat(im.convert('L')).mean[0]
    # 1/5 linear e amostra de sobra para media e desvio, e cabe sem numpy
    p = list(im.resize((im.width // 5, im.height // 5), Image.BILINEAR).getdata())
    n = len(p)
    srg = srg2 = syb = syb2 = 0.0
    for r, g, b in p:
        rg = r - g
        yb = 0.5 * (r + g) - b
        srg += rg; srg2 += rg * rg
        syb += yb; syb2 += yb * yb
    mrg, myb = srg / n, syb / n
    drg = max(0.0, srg2 / n - mrg * mrg) ** 0.5
    dyb = max(0.0, syb2 / n - myb * myb) ** 0.5
    return luz, (drg * drg + dyb * dyb) ** 0.5 + 0.3 * (mrg * mrg + myb * myb) ** 0.5


def fundo_sob_o_texto(dc, rects):
    html = achatar(dc)
    w, h = dimensoes(html)
    # O miolo e marcado AQUI, na copia achatada, e nao no artboard: o atributo
    # so serve para medir, e artboard que carrega andaime de medicao acaba
    # publicado com ele.
    html, quantos = re.subn(
        r'<div (style="position: absolute; left: 0; top: 0; width: \d+px; '
        r'height: \d+px; box-sizing: border-box; padding:)',
        r'<div data-miolo \1', html, count=1)
    if quantos != 1:
        raise SystemExit(f'{dc}: nao achei o miolo para esconder o texto — sem isso '
                         'a medicao mediria as proprias letras (armadilha 4.5)')
    html = html.replace('</head>', SO_O_FUNDO + '</head>')

    nome = os.path.basename(dc).replace('.dc.html', '')
    tmp = os.path.join(BASE, f'{nome}.__fundo.html')
    png = os.path.join(BASE, f'{nome}.__fundo.png')
    open(tmp, 'w', encoding='utf-8').write(html)
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1', '--virtual-time-budget=12000',
                    f'--screenshot={png}', f'--window-size={w},{h}',
                    f'file://{tmp}'], capture_output=True, text=True)
    os.remove(tmp)
    if not os.path.exists(png):
        return {}
    im = Image.open(png).convert('L')
    out = {}
    for hid, (x, y, cw, ch) in (rects or {}).items():
        vals = sorted(im.crop((x, y, x + cw, y + ch)).getdata())
        out[hid] = vals[int(len(vals) * 0.98)]
    os.remove(png)
    return out


if __name__ == '__main__':
    geo = json.load(open(os.path.join(BASE, 'geometria.json'), encoding='utf-8'))
    alvos = sys.argv[1:] or sorted(f for f in os.listdir(BASE) if f.endswith('.dc.html'))
    somaV = somaH = somaSv = somaSh = 0.0
    n = 0
    ruins = []
    print(f'{"peça":<18} {"luz véu":>8} {"luz halo":>9} {"cor véu":>8} {"cor halo":>9}   p98 do fundo')
    for dc in alvos:
        nome = os.path.basename(dc).replace('.dc.html', '')
        pv, ph = f'render-veu/{nome}.png', f'render-halo/{nome}.png'
        if not (os.path.exists(pv) and os.path.exists(ph)):
            continue
        lv, sv = foto_viva(pv)
        lh, sh = foto_viva(ph)
        p98 = fundo_sob_o_texto(dc, geo.get(nome))
        marca = ' '.join(f'{k} {v}{"" if v < ALVO else " CLARO"}' for k, v in p98.items())
        for k, v in p98.items():
            if v >= ALVO:
                ruins.append(f'{nome}.{k}={v}')
        print(f'{nome:<18} {lv:8.1f} {lh:9.1f} {sv:8.1f} {sh:9.1f}   {marca}')
        somaV += lv; somaH += lh; somaSv += sv; somaSh += sh; n += 1
    if n:
        print(f'\n{"MÉDIA":<18} {somaV/n:8.1f} {somaH/n:9.1f} {somaSv/n:8.1f} {somaSh/n:9.1f}')
        print(f'  luminância {100*(somaH-somaV)/somaV:+.1f}%   '
              f'colorido {100*(somaSh-somaSv)/somaSv:+.1f}%')
    print(f'  {len(ruins)} grupo(s) com fundo claro demais'
          + (': ' + ', '.join(ruins) if ruins else ''))
