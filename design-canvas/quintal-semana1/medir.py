# -*- coding: utf-8 -*-
"""Mede as DUAS coisas que o halo tem de acertar ao mesmo tempo.

1. LEGIBILIDADE — o fundo debaixo do texto, com o texto escondido.
   Sem esconder, a medida se mede a si mesma: as letras creme (~240) entram no
   percentil e o numero acusa "texto some" numa peca legivel (armadilha 4.5).
   O alvo NAO e mais um numero so: ele sai da COR da tinta daquela linha
   (`halo_quintal.alvo_da_cor` -> `_halo.alvo_por_contraste`, WCAG 3:1). Para
   o creme do Quintal da 139, perto dos 150 que a casa ja usava; para o verde
   da 69, menos da metade.

   🔴 Esconde-se o CONTEUDO, nunca a camada de leitura. Com o veu isso era
   automatico (o veu e camada de fundo); com o halo, um seletor descuidado leva
   a mancha junto e o numero passa a medir a foto NUA — dizendo que nao ha
   contraste nenhum, exatamente ao contrario. Aqui o halo e IRMAO de
   `[data-fluxo]`, entao esconder o fluxo preserva a mancha por construcao.

2. FOTOGRAFIA — luminancia e saturacao medias da peca inteira.
   E o que o mecanismo veio devolver: pelo DNA a foto e a protagonista, e o veu
   pagava a leitura escurecendo centenas de pixels dela.

A faixa medida NAO e fixa por layout como na versao anterior: ela sai do
retangulo que a sonda mediu e que o `mapa.json` guarda. Faixa fixa ja errou
uma vez neste repo — quando a geometria muda, a medicao guardada passa a
responder sobre outra regiao (By Rock, 01/09).
"""
import json, os, statistics, subprocess, sys
from PIL import Image, ImageStat
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render import achatar, CHROME

SO_FUNDO = '<style>[data-fluxo]{display:none!important}</style>'


def _png(dc, so_fundo):
    html, (w, h) = achatar(dc)
    if so_fundo:
        html = html.replace('</head>', SO_FUNDO + '</head>')
    pasta = os.path.dirname(os.path.abspath(dc))
    tmp = os.path.join(pasta, '__medir.html')
    png = os.path.join(pasta, '__medir.png')
    open(tmp, 'w', encoding='utf-8').write(html)
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=1", "--virtual-time-budget=8000",
                    f"--screenshot={png}", f"--window-size={w},{h}",
                    f"file://{tmp}"], capture_output=True)
    os.remove(tmp)
    if not os.path.exists(png):
        raise SystemExit(f"{dc}: render de medicao falhou")
    im = Image.open(png).convert('RGB'); im.load(); os.remove(png)
    return im


def legibilidade(im, rect):
    """p90/p98 do fundo DENTRO do retangulo onde a tinta do texto cai.

    🔴 `rect` e a caixa do TEXTO (`tinta_caixa`), nunca a do halo (`caixa`).
    Sao diferentes: o halo cresce `INSET` para fora do texto justamente para
    que a rampa do blur caia FORA das letras. Medir a caixa do halo cobra dele
    contraste na propria borda, que e onde ele deliberadamente ja desmanchou —
    e o numero sai ate 60 pontos pior do que a peca. Aconteceu na 1a rodada
    desta leva: a mesma peca deu p98 130 pela caixa do texto e 191 pela do
    halo, e o veredito falso foi 'TEXTO SOME' numa peca legivel.

    E a armadilha 4.5 outra vez, com outra roupa: la o erro era medir junto as
    letras que se queria avaliar; aqui e medir uma regiao onde nao ha letra
    nenhuma. A pergunta e sempre 'o que esta atras do que se le'.
    """
    x, y, w, h = rect
    # Retangulo fino (o filete de 1px, a barra de 4px) ainda tem de devolver um
    # numero: `None` aqui derrubava o comparador com um TypeError longe da
    # causa. Engorda-se ate 8px em volta do proprio elemento.
    fx, fy = max(0, (8 - w) // 2), max(0, (8 - h) // 2)
    c = im.crop((max(0, x - fx), max(0, y - fy),
                 min(im.width, x + w + fx), min(im.height, y + h + fy)))
    if c.width < 2 or c.height < 2:
        return (0.0, 0.0)
    c = c.resize((260, 260))
    l = sorted(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in c.getdata())
    return l[int(len(l) * .90)], l[int(len(l) * .98)]


def fotografia(im):
    """Luminancia e saturacao medias da peca inteira."""
    p = im.resize((216, 384))
    lum = statistics.mean(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in p.getdata())
    return lum, ImageStat.Stat(p.convert('HSV')).mean[1]


if __name__ == '__main__':
    mapa = {m['artboard']: m for m in json.load(open('mapa.json'))}
    alvos = sys.argv[1:] or sorted(mapa)
    print(f"{'peça':12} {'grupo':7} {'alvo':>5} {'p98':>5}  {'veredito':12} "
          f"{'luz peça':>8} {'satur.':>7}")
    ruins = []
    for dc in alvos:
        m = mapa[os.path.basename(dc)]
        fundo = _png(dc, True)
        cheia = _png(dc, False)
        lum, sat = fotografia(cheia)
        linhas = m.get('halo') or []
        if not linhas:   # MODO=veu nao guarda retangulo; cai na peça inteira
            linhas = [dict(papel='—', caixa=[92, 200, 896, 1548])]
        for i, h in enumerate(linhas):
            # cada linha e cobrada contra o alvo da PROPRIA cor: o creme
            # aguenta fundo 139, e o verde #7A9A5C so aguenta 69 — o criterio
            # unico de 150 era MAIS CLARO que a propria letra verde, que tem
            # luz 143. Ver `halo_quintal.alvo_da_cor`.
            piores = [(legibilidade(fundo, l['caixa'])[1], l['alvo'])
                      for l in h.get('linhas', [])
                      if min(l['caixa'][2], l['caixa'][3]) >= 8] or \
                     [(legibilidade(fundo, h.get('tinta_caixa') or h['caixa'])[1], 140)]
            p98, alvo = max(piores, key=lambda t: t[0] - t[1])
            r = (legibilidade(fundo, h.get('tinta_caixa') or h['caixa'])[0], p98)
            folga = p98 - alvo
            v = ('ok' if folga <= 10 else
                 'atenção' if folga <= 45 else 'TEXTO SOME')
            if v != 'ok':
                ruins.append(f"{m['artboard'].replace('.dc.html','')}/{h['papel']}")
            cauda = (f" {lum:>8.1f} {sat:>7.1f}" if i == 0 else "")
            print(f"{m['artboard'].replace('.dc.html',''):12} {h['papel']:7} "
                  f"{alvo:>5.0f} {r[1]:>5.0f}  {v:12}{cauda}")
    print(f"\n{len(ruins)} grupo(s) fora do confortável: {', '.join(ruins)}"
          if ruins else "\ntodas as linhas dentro do alvo da própria cor de tinta")
