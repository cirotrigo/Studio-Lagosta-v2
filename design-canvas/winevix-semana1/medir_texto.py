# -*- coding: utf-8 -*-
"""Mede quanto do quadro o TEXTO ocupa. O DNA poe o teto em um quarto vertical.

Renderiza so o texto (foto e veu escondidos) sobre o fundo da marca e soma as
linhas horizontais que tem tinta. A LOGO e descontada: ela e selo, nao texto.
"""
import os, re, subprocess, sys
from PIL import Image
from render import CHROME, achatar, dimensoes

def medir(dc):
    nome = os.path.basename(dc).replace('.dc.html', '')
    html = achatar(dc)
    w, h = dimensoes(html)
    tmp, png = f'{nome}.__txt.html', f'{nome}.__txt.png'
    open(tmp, 'w', encoding='utf-8').write(html.replace(
        '</head>',
        '<style>img { visibility: hidden !important; }'
        'div[class^="veu"] { display: none !important; }</style></head>'))
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1', '--virtual-time-budget=12000',
                    f'--screenshot={png}', f'--window-size={w},{h}',
                    f'file://{os.path.abspath(tmp)}'], capture_output=True, text=True)
    os.remove(tmp)
    im = Image.open(png).convert('L')
    px = im.load()
    linhas = sum(1 for y in range(h)
                 if any(px[x, y] > 110 for x in range(0, w, 4)))
    os.remove(png)
    frac = linhas / h
    v = 'ok' if frac <= 0.27 else ('limite' if frac <= 0.33 else 'TEXTO DEMAIS')
    return f'  {nome:20s} {linhas:4d}px de {h}  {frac*100:4.1f}%  {v}'

if __name__ == '__main__':
    for dc in sys.argv[1:]:
        print(medir(dc))
