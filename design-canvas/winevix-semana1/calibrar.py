# -*- coding: utf-8 -*-
"""Ajusta o veu de cada peca ate a faixa do texto ficar legivel, por MEDICAO.

Chutar alpha no olho deixou 38 das 59 faixas fora do confortavel na primeira
passada desta leva — o fundo de cada foto e diferente e nao ha valor unico que
sirva. Aqui cada peca recebe SO o que ela precisa, o que tambem responde ao
outro lado da queixa da Roberta ("a foto ficou muito escura"): a peca que ja
esta legivel nao ganha nem um ponto de veu.

Sobe primeiro a ALTURA (estende o plato ate onde o texto pousa, sem escurecer
mais) e so depois o ALPHA. Teto em 0.88: acima disso a foto vira fundo.
"""
import json
import os
import re
import subprocess

from PIL import Image

from render import CHROME, achatar, dimensoes
from medir import faixas

TETO_ALPHA = 0.88
ALVO = 145  # com folga sob os 150 da referencia da casa


def veus_do_html(html):
    return [(c, float(a), int(h)) for c, a, h in re.findall(
        r'class="(veu-[tb])" style="--veu: ([\d.]+); position: absolute; '
        r'left: 0; \w+: 0; width: \d+px; height: (\d+)px', html)]


def p98_por_faixa(dc):
    nome = os.path.basename(dc).replace('.dc.html', '')
    html = achatar(dc)
    w, h = dimensoes(html)
    tmp, png = f'{nome}.__cal.html', f'{nome}.__cal.png'
    open(tmp, 'w', encoding='utf-8').write(html.replace(
        '</head>',
        '<style>div > div:not([class^="veu"]) { display: none !important; }</style>'
        '</head>'))
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1', '--virtual-time-budget=12000',
                    f'--screenshot={png}', f'--window-size={w},{h}',
                    f'file://{os.path.abspath(tmp)}'], capture_output=True, text=True)
    os.remove(tmp)
    im = Image.open(png).convert('L')
    out = []
    for _, topo, base_y in faixas(html, h):
        vals = sorted(im.crop((60, topo, w - 60, base_y)).getdata())
        out.append(vals[int(len(vals) * 0.98)])
    os.remove(png)
    return out, veus_do_html(html), h


def main():
    ajustes = {}
    if os.path.exists('veus.json'):
        ajustes = json.load(open('veus.json', encoding='utf-8'))

    # Sem argumento calibra a leva inteira; com argumento, so as pecas citadas
    # (trocar UMA foto nao deve custar os 11 minutos das 39).
    import sys
    pecas = sys.argv[1:] or sorted(f for f in os.listdir('.') if f.endswith('.dc.html'))
    for rodada in range(1, 7):
        pendentes = []
        for dc in pecas:
            nome = dc.replace('.dc.html', '')
            p98s, veus, h = p98_por_faixa(dc)
            novo = []
            precisa = False
            for (classe, alpha, altura), p98 in zip(veus, p98s):
                if p98 > ALVO:
                    precisa = True
                    teto = int(h * 0.62)
                    if altura < teto:
                        altura = min(teto, altura + 140)
                    else:
                        alpha = round(min(TETO_ALPHA, alpha + 0.06), 2)
                novo.append([alpha, altura])
            if precisa:
                ajustes[nome] = novo
                pendentes.append(f'{nome} {p98s}')
        if not pendentes:
            print(f'rodada {rodada}: tudo dentro do alvo')
            break
        json.dump(ajustes, open('veus.json', 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
        subprocess.run(['python3', 'gerar.py'], capture_output=True)
        print(f'rodada {rodada}: {len(pendentes)} peca(s) ajustada(s)')
    else:
        print('parou no teto de rodadas — o que sobrou vai no relatorio do medir')


if __name__ == '__main__':
    main()
