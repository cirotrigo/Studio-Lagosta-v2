# -*- coding: utf-8 -*-
"""A régua da peça: os DOIS lados do que a leitura do texto custa à foto.

1. FOTOGRAFIA — luminância e saturação médias da peça pronta. É o KPI do halo:
   ele existe para devolver luz e cor à foto, que é a protagonista pelo DNA.
2. CONTRASTE — p98 do FUNDO sob CADA bloco de texto. É o KPI antigo, do véu, e
   continua valendo: abaixo de 150 é confortável.

Armadilha 4.5 do manual: medir a peça pronta inclui as próprias letras no
percentil e o número não diz nada. Para o item 2 o conteúdo é OCULTADO antes do
render — sobram a foto e a camada de leitura.

🔴 O halo mudou as DUAS metades deste script, e por motivos diferentes.

O seletor: com o véu, a camada de leitura era irmã do bloco de texto, então
esconder o bloco inteiro deixava foto + véu de pé. Com o halo a camada de
leitura mora DENTRO do bloco — o seletor antigo levava o halo junto e o p98
saía medindo a foto nua, dizendo que não há contraste onde há. Esconde-se
`.conteudo`; preserva-se `.halo`.

🔴 A REGIÃO: o véu cobria a faixa inteira de borda a borda, então medir a faixa
inteira respondia à pergunta certa. O halo cobre só o bloco — de propósito. Uma
faixa que ia de 88 a 992 media sobretudo a foto que o halo deliberadamente NÃO
cobre, e acusava p98=231 numa peça cujo texto está legível. Medido em
01/09/2026: a mesma peça dá 231 pela faixa e 96 pelo bloco. Hoje a região vem
da geometria REAL (`getBoundingClientRect` no Chrome), não de uma tabela de
faixas por formato — que além de tudo envelhecia a cada mudança de layout.
"""
import json
import os
import re
import subprocess
import sys

from PIL import Image

from render import achatar, dimensoes

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

OCULTAR_HALO = '<style>.conteudo{ visibility: hidden !important }</style>'
OCULTAR_VEU = ('<style>.conteudo{ visibility: hidden !important }'
               'div[style*="position: relative"] > img:not(:first-child)'
               '{ visibility: hidden !important }</style>')

# Lê onde cada bloco de fato pousou. `visibility` e não `display` no seletor de
# cima: `display: none` tiraria o bloco do fluxo e as caixas mudariam de lugar.
SONDA = """<script>window.addEventListener('load',function(){
 var r=[];document.querySelectorAll('.conteudo').forEach(function(e){
   var b=e.getBoundingClientRect();
   r.push([Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]);});
 document.title='SONDA'+JSON.stringify(r);});</script>"""


def _chrome(html, w, h, args):
    tmp = os.path.join(os.getcwd(), '.__medir.html')
    open(tmp, 'w', encoding='utf-8').write(html)
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", "--virtual-time-budget=8000",
        *args, f"--window-size={w},{h}", f"file://{tmp}"],
        capture_output=True, text=True)
    os.remove(tmp)
    return r.stdout


def blocos(html, w, h):
    saida = _chrome(html.replace('</head>', SONDA + '</head>'), w, h, ['--dump-dom'])
    m = re.search(r'<title>SONDA(.*?)</title>', saida, re.S)
    if not m:
        raise SystemExit('a sonda de geometria nao respondeu')
    return json.loads(m.group(1))


def medir(dc):
    html = achatar(dc)
    w, h = dimensoes(html)
    print(f"{os.path.basename(dc)}  ({w}x{h})")

    # 1. a fotografia, na peça como ela sai
    png = os.path.join(os.getcwd(), '.__peca.png')
    _chrome(html, w, h, [f"--screenshot={png}"])
    im = Image.open(png).convert('RGB')
    lum = sum(im.convert('L').getdata()) / (w * h)
    sat = sum(p[1] for p in im.convert('HSV').getdata()) / (w * h)
    os.remove(png)
    print(f"  foto: luminancia={lum:.1f} saturacao={sat:.1f}")

    # 2. o contraste sob cada bloco, com o conteúdo invisível
    caixas = blocos(html, w, h)
    oculto = OCULTAR_HALO if 'class="halo"' in html else OCULTAR_VEU
    png = os.path.join(os.getcwd(), '.__medir.png')
    _chrome(html.replace('</head>', oculto + '</head>'), w, h, [f"--screenshot={png}"])
    px = Image.open(png).convert('L').load()
    os.remove(png)
    for x, y, bw, bh in caixas:
        vals = sorted(px[i, j] for j in range(max(0, y), min(y + bh, h))
                      for i in range(max(0, x), min(x + bw, w)))
        n = len(vals)
        p50, p90, p98 = vals[n // 2], vals[int(n * .9)], vals[int(n * .98)]
        ok = 'ok' if p98 < 150 else 'ALTO — reforcar a leitura ou mover o texto'
        print(f"  bloco {x:4d},{y:4d} {bw}x{bh}: p50={p50} p90={p90} p98={p98}  [{ok}]")


if __name__ == '__main__':
    for dc in sys.argv[1:]:
        medir(dc)
