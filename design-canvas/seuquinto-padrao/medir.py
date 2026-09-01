# -*- coding: utf-8 -*-
"""Mede o contraste do FUNDO na faixa onde o texto pousa (padrão da casa).

Renderiza o artboard com texto e ícones OCULTOS (só foto + véus) e mede o
p98 de luminância nas faixas de texto. Referência: p98 < 150 é confortável
(regra 4.5 do manual do canvas — medir a peça com as letras incluiria o
próprio texto claro no percentil e o número não diria nada sobre o fundo).
"""
import json, sys, os, subprocess
from PIL import Image
import render as R

# 🔴 Com o VÉU a camada de leitura era irmã da foto, então esconder `.conteudo`
# inteiro deixava exatamente foto + véu — o que a régua quer medir. Com o HALO
# a camada de leitura mora DENTRO do bloco de texto: o mesmo seletor a levava
# junto e a régua passou a medir a foto NUA, respondendo que não há contraste
# nenhum e reprovando peça legível. Agora some só a tinta (texto e ícones); as
# manchas ficam.
OCULTAR = ('.conteudo *:not(.halo){color:transparent !important;'
           'text-shadow:none !important}'
           '.conteudo img,.solto img{visibility:hidden !important}')

# 🔴 As faixas eram RETÂNGULOS CRAVADOS À MÃO, generosos de propósito: com o
# véu qualquer recorte dentro da banda estava coberto, então sobrar 100px para
# os lados não mudava o número. Com o halo a mancha tem a largura do TEXTO, e
# a mesma folga passou a medir foto NUA fora dela — o p98 (os 2% mais claros)
# vinha justamente dessas bordas e a régua reprovou as quatro faixas de uma
# peça legível. Agora ela lê o rect REAL de cada bloco, o mesmo que a sonda de
# `gerar.py` mediu, e mede onde a letra de fato está.
GEOMETRIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'geometria.json')
ROTULO = {'titulo': 'titulo (script+manchete)', 'servico': 'servico'}

# 🔴 O ícone Q fica DE FORA da régua. Ela mede o fundo sob TEXTO: letra clara
# some sobre fundo claro, e o p98 diz se isso vai acontecer. O Q é um disco
# OPACO — nada por trás dele chega ao leitor, e ele não leva mancha nenhuma
# nesta marca (ver `MARCA` em gerar.py). Medido: com o Q na régua, a Capa
# respondia `p98=204 CLARO DEMAIS` sobre uma peça correta. Alarme falso é pior
# que aviso nenhum — ensina a ignorar a régua. Quem julga o disco é a separação
# de figura-fundo (Δluz e Δcor contra o anel em volta), não este percentil.


def faixas(nome):
    if not os.path.exists(GEOMETRIA):
        raise SystemExit('rode `python3 gerar.py` antes — a régua lê geometria.json')
    geo = json.load(open(GEOMETRIA, encoding='utf-8')).get(nome, {})
    return [(ROTULO[k], r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])
            for k, r in sorted(geo.items()) if k in ROTULO]

def medir(dc):
    nome = os.path.basename(dc).replace('.dc.html', '')
    html = R.achatar(dc)
    html = html.replace('</style>', OCULTAR + '</style>')
    w, h = R.tamanho_do_artboard(html)
    tmp = dc.replace('.dc.html', '.__medir.html')
    png = f'render/_medir-{nome}.png'
    open(tmp, 'w', encoding='utf-8').write(html)
    subprocess.run([R.CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", f"--default-background-color={R.FUNDO}",
        "--virtual-time-budget=6000", f"--screenshot={png}",
        f"--window-size={w},{h}", f"file://{os.path.abspath(tmp)}"], capture_output=True)
    os.remove(tmp)
    im = Image.open(png).convert('L')
    print(nome)
    for rotulo, x0, y0, x1, y1 in faixas(nome):
        px = sorted(im.crop((x0, y0, x1, y1)).getdata())
        p98 = px[int(len(px) * 0.98)]
        ok = 'ok' if p98 < 150 else 'CLARO DEMAIS'
        print(f'  {rotulo}: p98={p98}  {ok}')

if __name__ == '__main__':
    os.makedirs('render', exist_ok=True)
    for dc in sys.argv[1:]:
        medir(dc)
