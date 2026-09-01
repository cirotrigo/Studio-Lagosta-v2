# -*- coding: utf-8 -*-
"""Mede o CONTRASTE que cada bloco de texto recebe — foto + halo, sem o texto.

🔴 Armadilha 4.5 do manual: medir a peça inteira mede as próprias letras
brancas (~250) e o número não diz nada sobre o fundo. Uma peça legível já foi
reprovada assim. Aqui o texto é apagado (`color: transparent`) e a logo e o
pino ficam `visibility: hidden` — as duas coisas PRESERVAM a geometria, então
os halos continuam exatamente onde estariam. `display: none` colapsaria o
wrapper da logo e mediria um halo que não existe.

E o halo NÃO pode ser escondido junto: com o véu, a camada de contraste era
irmã do texto e sobrava naturalmente; com o halo ela mora DENTRO do bloco, e
esconder o bloco levaria a mancha junto — o número sairia medindo a foto nua e
diria que não há contraste nenhum. É a nota que o `_halo.py` deixou.

Referência do manual: **p98 abaixo de 150** é confortável para texto branco.

Uso:  python3 medir.py            (mede as 3 peças no modo atual)
      MODO=veu python3 gerar.py && python3 medir.py   (o outro lado)
"""
import os
import re
import subprocess
import sys

from PIL import Image

import gerar
import render

# Apaga o CONTEÚDO e preserva a geometria. `img:not(.foto)` é a logo; o `svg`
# é o pino do serviço.
SEM_TEXTO = ('<style>*{color:transparent !important;text-shadow:none !important}'
             'svg{visibility:hidden !important}'
             'img:not(.foto){visibility:hidden !important}</style>')


def render_sem_texto(dc, saida):
    html = render.achatar(dc).replace('</head>', SEM_TEXTO + '</head>')
    tmp = os.path.join(os.path.dirname(os.path.abspath(dc)),
                       os.path.basename(dc).replace('.dc.html', '.__medir.html'))
    open(tmp, 'w', encoding='utf-8').write(html)
    alt = render.altura_do_artboard(html)
    subprocess.run([render.CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1',
                    f'--default-background-color={render.FUNDO}',
                    '--virtual-time-budget=8000', f'--screenshot={saida}',
                    f'--window-size=1080,{alt}', f'file://{os.path.abspath(tmp)}'],
                   capture_output=True, text=True)
    os.remove(tmp)
    if not os.path.exists(saida):
        raise SystemExit(f'render de medição falhou: {dc}')
    return saida


def p98(im, caixa):
    """Percentil 98 da luminância no retângulo — o pior fundo que a letra pega.

    Média esconde o caso que importa: um bloco escuro com um reflexo claro
    atrás de uma palavra tem média boa e uma palavra ilegível.
    """
    r = im.crop(caixa).convert('L')
    hist = r.histogram()
    total = sum(hist)
    alvo, acc = total * 0.98, 0
    for v, n in enumerate(hist):
        acc += n
        if acc >= alvo:
            return v
    return 255


if __name__ == '__main__':
    os.makedirs('render', exist_ok=True)
    print(f'modo do artboard: lido do arquivo · referência: p98 < 150\n')
    print(f'{"peça":14s} {"texto":>14s} {"serviço":>14s} {"logo":>14s}')
    for s in gerar.PECAS:
        dc = f"{s['arq']}.dc.html"
        if not os.path.exists(dc):
            continue
        png = render_sem_texto(dc, f"render/_fundo_{s['arq']}.png")
        im = Image.open(png)
        rt, rs, rl = gerar.geometria(s)
        vals = [p98(im, r) for r in (rt, rs, rl)]
        marca = ['  ' if v < 150 else ' !' for v in vals]
        print(f"{s['arq']:14s}" + ''.join(f'{m}{v:>12d}' for m, v in zip(marca, vals)))
    print('\n! = acima de 150 (fundo claro demais para texto branco)')
