# -*- coding: utf-8 -*-
"""Lê a geometria REAL dos halos no Chrome e confere contra `gerar.geometria`.

🔴 Existe porque `geometria()` ESTIMA os retângulos por métrica de fonte
(corpo, entrelinha, tracking) e é dessa estimativa que sai a calibragem de
cada halo — luz medida na região errada produz mancha 3x mais escura ou 3x
mais clara que o necessário, e foi assim que o By Rock errou o rodapé.
Estimar sem nunca conferir é o defeito; conferir uma vez custa segundos.

Layout estranho se investiga MEDINDO no navegador, não raciocinando sobre o
CSS — item 5 do roteiro de `_halo.py`.

Uso: python3 sonda.py [Main.dc.html ...]   (sem argumento, confere as três)
"""
import json
import os
import re
import subprocess
import sys

import gerar
import render

# `getBoundingClientRect` de cada .halo e do bloco de conteúdo que ele cobre
# (o pai), despejado no title porque `--dump-dom` devolve o DOM já montado.
SONDA = '''<script>
addEventListener('load', function () {
  var r = [].map.call(document.querySelectorAll('.halo'), function (h) {
    var a = h.getBoundingClientRect(), p = h.parentElement.getBoundingClientRect();
    return {halo: [a.left, a.top, a.right, a.bottom].map(Math.round),
            bloco: [p.left, p.top, p.right, p.bottom].map(Math.round)};
  });
  document.title = 'SONDA' + JSON.stringify(r);
});
</script>'''


def rects(dc):
    html = render.achatar(dc).replace('</head>', SONDA + '</head>')
    tmp = os.path.join(os.path.dirname(os.path.abspath(dc)),
                       os.path.basename(dc).replace('.dc.html', '.__sonda.html'))
    open(tmp, 'w', encoding='utf-8').write(html)
    r = subprocess.run([render.CHROME, '--headless=new', '--disable-gpu',
                        '--virtual-time-budget=8000', '--dump-dom',
                        f'file://{os.path.abspath(tmp)}'],
                       capture_output=True, text=True)
    os.remove(tmp)
    m = re.search(r'SONDA(\[.*?\])</title>', r.stdout, re.S)
    if not m:
        raise SystemExit(f'{dc}: a sonda não devolveu geometria')
    return json.loads(m.group(1))


if __name__ == '__main__':
    alvos = sys.argv[1:] or [f"{p['arq']}.dc.html" for p in gerar.PECAS]
    pior = 0
    for dc in alvos:
        peca = next(p for p in gerar.PECAS if p['arq'] == os.path.basename(dc).split('.')[0])
        medidos = rects(dc)
        estimados = gerar.geometria(peca)
        print(f"\n{peca['arq']}  ({len(medidos)} halos)")
        # a ordem do querySelectorAll é a do DOM: logo, texto, serviço
        ordem = ['logo', 'texto', 'serviço']
        por_nome = dict(zip(ordem, medidos))
        for nome, est in zip(('texto', 'serviço', 'logo'), estimados):
            real = por_nome[nome]['bloco']
            dif = [r - e for r, e in zip(real, est)]
            pior = max(pior, max(abs(d) for d in dif))
            print(f"  {nome:8s} estimado {tuple(est)}")
            print(f"  {'':8s} real     {tuple(real)}   Δ {tuple(dif)}")
    print(f"\nmaior divergência: {pior}px")
    if pior > 24:
        print('⚠️  acima de 24px a luz é medida numa região que não é a do bloco —'
              ' corrija `gerar.geometria` antes de confiar na calibragem.')
