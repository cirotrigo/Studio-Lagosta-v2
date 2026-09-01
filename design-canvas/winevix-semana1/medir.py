# -*- coding: utf-8 -*-
"""Mede o contraste do FUNDO na faixa onde o texto pousa, peca a peca.

Renderiza cada peca com o texto e a logo OCULTOS (so foto + veu) — medir a
peca pronta incluiria as proprias letras creme (~240) no percentil e diria
qualquer coisa. Referencia da casa: p98 abaixo de 150 e confortavel.

Diferente das levas anteriores, a faixa NAO vem de tabela escrita a mao: ela e
derivada dos veus declarados no proprio artboard (veu-t mede o topo, veu-b mede
o rodape, os dois medem as duas). Tabela a mao envelhece a cada mudanca de
layout, e esta leva tem 39 pecas em dois formatos.

Tambem e o que pega foto quebrada: luminancia constante = a cor de fundo pura.
"""
import os
import re
import subprocess
import sys

from PIL import Image

from render import CHROME, achatar, dimensoes


def faixas(html, h):
    """Onde o texto realmente pousa, a partir dos veus declarados."""
    out = []
    for classe, altura in re.findall(r'class="(veu-[tb])" style="--veu: [\d.]+; '
                                     r'position: absolute; left: 0; \w+: 0; '
                                     r'width: \d+px; height: (\d+)px', html):
        # as margens da leva mudaram para o padrao do TERO (200/150/96)
        margem_topo, margem_pe = (200, 150) if h == 1920 else (68, 68)
        if classe == 'veu-t':
            out.append(('topo', margem_topo, min(int(altura), h // 2)))
        else:
            out.append(('rodapé', max(h - int(altura), h // 2), h - margem_pe))
    return out


def medir(dc):
    nome = os.path.basename(dc).replace('.dc.html', '')
    html = achatar(dc)
    w, h = dimensoes(html)
    base = os.path.dirname(os.path.abspath(dc))
    tmp = os.path.join(base, f'{nome}.__medir.html')
    png = os.path.join(base, f'{nome}.__medir.png')
    sem_texto = html.replace(
        '</head>',
        '<style>div > div:not([class^="veu"]) { display: none !important; }</style>'
        '</head>')
    open(tmp, 'w', encoding='utf-8').write(sem_texto)
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1', '--virtual-time-budget=12000',
                    f'--screenshot={png}', f'--window-size={w},{h}',
                    f'file://{tmp}'], capture_output=True, text=True)
    os.remove(tmp)
    if not os.path.exists(png):
        return [f'  {nome:20s} FALHOU']

    im = Image.open(png).convert('L')
    linhas = []
    for onde, topo, base_y in faixas(html, h):
        faixa = im.crop((60, topo, w - 60, base_y))
        vals = sorted(faixa.getdata())
        p50 = vals[len(vals) // 2]
        p98 = vals[int(len(vals) * 0.98)]
        quebrada = ' FOTO QUEBRADA?' if vals[0] == vals[-1] else ''
        veredito = 'ok' if p98 < 150 else ('limite' if p98 < 175 else 'CLARO DEMAIS')
        linhas.append(f'  {nome:20s} {onde:7s} p50 {p50:3d}  p98 {p98:3d}  '
                      f'{veredito}{quebrada}')
    os.remove(png)
    return linhas


if __name__ == '__main__':
    ruins = 0
    for dc in sys.argv[1:]:
        for linha in medir(dc):
            print(linha)
            if 'CLARO DEMAIS' in linha or 'limite' in linha or 'FALHOU' in linha:
                ruins += 1
    print(f'\n  {ruins} faixa(s) fora do confortavel')
