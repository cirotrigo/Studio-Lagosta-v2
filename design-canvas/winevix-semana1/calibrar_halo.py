# -*- coding: utf-8 -*-
"""Baixa a tinta de cada halo ate o MINIMO que ainda deixa o texto legivel.

Por que baixar
--------------
A queixa que originou o mecanismo foi "o veu ficou muito marcado". Um halo
generoso troca um veu marcado por uma mancha marcada — todo ponto de tinta
acima do necessario e o mesmo defeito com outra forma. A formula de gerar.py
e so a SEMENTE; aqui cada grupo recebe o que a foto DELE pede.

Como, sem gastar uma rodada de Chrome por tentativa
---------------------------------------------------
A composicao e linear no alpha: o `filter: blur()` de uma caixa cheia de
`rgb(t / a)` produz cobertura A(x,y) = a * m(x,y), onde m e a forma borrada e
NAO depende de a. Entao basta UMA renderizacao por peca para recuperar m —
pelo canal VERDE, onde a tinta merlot vale 0 e m = 1 - verde_final/verde_foto
— e dali em diante o p98 de qualquer alpha se calcula, sem renderizar de novo.

🔴 A recuperacao so e estavel onde a foto tem verde; no escuro ela divide por
quase zero. Ali m vai a 1 de proposito (a hipotese mais escura): pixel escuro
nunca entra nos 2% mais claros, entao o erro nao alcanca o p98 — e se
alcancasse, erraria para o lado seguro.
"""
import json
import os
import re
import subprocess
import sys

from PIL import Image, ImageStat

from render import CHROME, achatar, dimensoes
from medir_halo import SO_O_FUNDO
from gerar import TINTA, A_MIN, A_MAX

BASE = os.path.dirname(os.path.abspath(__file__))
TINTA_G = int(TINTA.split()[1])          # o verde do merlot: 0
ALVO = 138                               # um degrau abaixo dos 145 do veu
TOLERANCIA = 8
PISO = 0.30                              # foto ja escura nao precisa de tinta;
                                         # o piso so assenta a serifada fina
VERDE_MINIMO = 40


def fundo(dc):
    """A peca com o texto invisivel e a mancha no lugar."""
    nome = os.path.basename(dc).replace('.dc.html', '')
    html = achatar(dc)
    w, h = dimensoes(html)
    html, quantos = re.subn(
        r'<div (style="position: absolute; left: 0; top: 0; width: \d+px; '
        r'height: \d+px; box-sizing: border-box; padding:)',
        r'<div data-miolo \1', html, count=1)
    if quantos != 1:
        raise SystemExit(f'{nome}: nao achei o miolo')
    tmp = os.path.join(BASE, f'{nome}.__cal.html')
    png = os.path.join(BASE, f'{nome}.__cal.png')
    open(tmp, 'w', encoding='utf-8').write(html.replace('</head>', SO_O_FUNDO + '</head>'))
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1', '--virtual-time-budget=12000',
                    f'--screenshot={png}', f'--window-size={w},{h}',
                    f'file://{tmp}'], capture_output=True, text=True)
    os.remove(tmp)
    im = Image.open(png).convert('RGB')
    os.remove(png)
    return im


def alphas_do_artboard(dc):
    """Na ordem em que os grupos aparecem no HTML — a mesma de data-halo."""
    src = open(dc, encoding='utf-8').read()
    ids = re.findall(r'data-halo="([^"]+)"', src)
    aa = [float(a) for a in re.findall(r'class="halo" style="--a: ([\d.]+)', src)]
    return dict(zip(ids, aa))


def p98_previsto(foto, comp, rect, a0, a):
    """p98 da luminancia do fundo dentro do retangulo, para um alpha novo."""
    # 🔴 O retangulo e o das LETRAS, sem a folga do inset. A folga e a parte
    # da mancha que sobra para FORA do texto, onde a cobertura ja esta caindo
    # e onde nao ha letra para ler: incluir a folga contamina o percentil com
    # foto que nao esta em disputa e faz a calibragem pedir mais tinta do que
    # o texto precisa — que e o defeito que este arquivo veio corrigir.
    x, y, w, h = rect
    f = foto.crop((x, y, x + w, y + h))
    c = comp.crop((x, y, x + w, y + h))
    fr, fg, fb = [list(ch.getdata()) for ch in f.split()]
    cg = list(c.getchannel('G').getdata())
    tinta = [int(v) for v in TINTA.split()]
    vals = []
    for i in range(len(fg)):
        if fg[i] >= VERDE_MINIMO:
            m = 1.0 - (cg[i] / fg[i])
            m = min(1.0, max(0.0, m / a0))
        else:
            m = 1.0
        A = a * m
        r = fr[i] * (1 - A) + tinta[0] * A
        g = fg[i] * (1 - A) + tinta[1] * A
        b = fb[i] * (1 - A) + tinta[2] * A
        vals.append(0.299 * r + 0.587 * g + 0.114 * b)
    vals.sort()
    return vals[int(len(vals) * 0.98)]


def main():
    geo = json.load(open(os.path.join(BASE, 'geometria.json'), encoding='utf-8'))
    alvos = sys.argv[1:] or sorted(f for f in os.listdir(BASE) if f.endswith('.dc.html'))
    fotos = {s['arq']: s['foto'] for s in __import__('gerar').STORIES}
    saida = {}
    if os.path.exists(os.path.join(BASE, 'halos.json')):
        saida = json.load(open(os.path.join(BASE, 'halos.json'), encoding='utf-8'))

    for dc in alvos:
        nome = os.path.basename(dc).replace('.dc.html', '')
        rects, a0s = geo.get(nome) or {}, alphas_do_artboard(os.path.join(BASE, dc))
        if not rects:
            continue
        comp = fundo(os.path.join(BASE, dc))
        foto = Image.open(os.path.join(BASE, 'fotos', fotos[nome])).convert('RGB')
        for hid, rect in rects.items():
            a0 = a0s.get(hid)
            if not a0:
                continue
            lo, hi = PISO, 0.95
            # o p98 CAI quando o alpha sobe: bissecao no sentido inverso
            if p98_previsto(foto, comp, rect, a0, lo) <= ALVO:
                melhor = lo
            elif p98_previsto(foto, comp, rect, a0, hi) > ALVO:
                melhor = hi
            else:
                for _ in range(12):
                    meio = (lo + hi) / 2
                    if p98_previsto(foto, comp, rect, a0, meio) > ALVO:
                        lo = meio
                    else:
                        hi = meio
                melhor = hi
            antes = p98_previsto(foto, comp, rect, a0, a0)
            depois = p98_previsto(foto, comp, rect, a0, melhor)
            saida.setdefault(nome, {})[hid] = round(melhor, 3)
            print(f'  {nome:<18} {hid:<6} alpha {a0:.2f} -> {melhor:.2f}   '
                  f'p98 {antes:.0f} -> {depois:.0f}')
    json.dump(saida, open(os.path.join(BASE, 'halos.json'), 'w', encoding='utf-8'),
              indent=1, ensure_ascii=False, sort_keys=True)
    n = sum(len(v) for v in saida.values())
    print(f'\n  {n} halo(s) calibrado(s) -> halos.json   (alvo p98 {ALVO}±{TOLERANCIA})')


if __name__ == '__main__':
    main()
