# -*- coding: utf-8 -*-
"""Monta os 21 stories da semana 1 da Wine Vix (31/08 a 06/09/2026), 1080x1920.

O vocabulario visual sai do DNA da marca: headline Playfair Display ITALIC em
Title Case com UMA palavra em dourado, apoio e servico em Lato, caixa alta so
no bloco de servico, coluna estreita, logo em diagonal oposta ao bloco, CTA
copiado literalmente de um dos seis aprovados.

O ESPACAMENTO vem do padrao do TERO (pedido do Ciro em 30/08), nao da primeira
rodada desta leva:
  - margens 200 no topo, 150 no rodape, 96 nas laterais — mais apertadas que a
    faixa de 240 do Instagram, decisao dele em 27/08;
  - entrelinha JUSTA na manchete (0.95) e gap curto entre as linhas, em vez do
    space-between que espalhava o bloco pelo quadro;
  - um ESPACADOR flexivel separa o bloco do pe: o texto fica agrupado e a foto
    respira, em vez de dois blocos empurrados para as bordas.

A POSICAO VARIA POR PECA — topo ou rodape, alinhada a esquerda, ao centro ou a
direita. A primeira rodada saiu quase toda no mesmo arranjo (bloco no topo,
tudo a esquerda) e o Ciro pediu variacao. A escolha cruza duas coisas: onde a
foto esta mais lisa (medido: desvio de borda na faixa do topo contra a do
rodape) e a distribuicao, para nenhum arranjo se repetir dia apos dia.

TEXTO ENXUTO, tambem a pedido dele: a peca NAO descreve o prato. Manchete,
condicao quando existe (horario, preco do executivo), e CTA. Ingrediente,
acompanhamento e ficha de cardapio ficam de fora — quem conta isso e a legenda,
e story nao leva legenda.

O CONTRASTE DO TEXTO vem do HALO, nao mais do veu (01/09/2026). O veu era um
gradiente sobre a faixa inteira — nesta leva chegou a cobrir 1190 dos 1920px
com alpha 0,88 —, e o Ciro o reprovou duas vezes ("o veu ficou muito
marcado"). O halo e uma caixa escura ATRAS do bloco de texto, com
`filter: blur()` nela mesma, que desmancha nas bordas: escurece so onde a
letra cai. Medido nas 21: luminancia +37% e colorido +29% na fotografia, com
os 31 grupos dentro do confortavel de leitura.

O ciclo tem TRES passos, porque o halo se calibra pela regiao que cobre e a
regiao so existe depois do layout:

    python3 gerar.py         # semente
    python3 sondar.py        # onde cada grupo pousou (Chrome)
    python3 gerar.py         # halo pela luz da regiao
    python3 calibrar_halo.py # baixa a tinta ate o minimo que ainda le
    python3 gerar.py         # final

MODO=veu reconstroi a versao anterior para comparacao lado a lado.

Armadilhas da casa que este arquivo respeita (docs/SESSAO-2026-08-25):
  4.1 layout por FLUXO: cada linha e um item direto do flex — o `z-index` que
      poe a linha acima da mancha vai NO ESTILO DELA, nao num wrapper extra
  4.2 nenhum bloco herda do pai: tamanho e familia em px no proprio bloco
  4.3 a formula vive so no CSS (classe .halo com var(--a)/var(--r), como as
      .veu-t/.veu-b faziam); o artboard leva apenas numeros
  4.7 imagem entra por <img src>, NUNCA por url() no CSS
"""
import json
import os
import re

CREME = '#F9F7F2'
DOURADO = '#FCE77B'
FUNDO = '#241A16'

SERIF = "'Playfair Display', 'Iowan Old Style', Georgia, serif"
SANS = "'Lato', 'Helvetica Neue', Helvetica, Arial, sans-serif"

FONTES = ('https://fonts.googleapis.com/css2?'
          'family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,500;1,600;1,700'
          '&family=Lato:ital,wght@0,300;0,400;0,700&display=swap')

W, H = 1080, 1920
PAD_TOPO, PAD_RODAPE, PAD_H = 200, 150, 96

# Merlot profundo #240000 = rgb(36 0 0), como manda o DNA. O plato vai ate 40%
# da faixa: e onde o texto pousa; so depois o veu decai.
# A TINTA do escurecimento e o merlot #240000 do DNA, nao o preto neutro do By
# Rock: e a mesma tinta que o veu ja usava, e escurecer com a cor da marca faz
# a mancha ler como sombra QUENTE de adega em vez de mancha cinza colada.
TINTA = '36 0 0'

CSS = """
    body { margin: 0; }
    a { color: #FCE77B; } a:hover { color: #F9F7F2; }
    .halo {
      position: absolute; z-index: 0; pointer-events: none;
      background: rgb(""" + TINTA + """ / var(--a));
      filter: blur(var(--r));
      border-radius: calc(var(--r) + 60px);
    }
    .veu-b {
      background: linear-gradient(to top,
        rgb(36 0 0 / var(--veu)) 0%,
        rgb(36 0 0 / var(--veu)) 40%,
        rgb(36 0 0 / calc(var(--veu) * 0.52)) 68%,
        rgb(36 0 0 / 0) 100%);
    }
    .veu-t {
      background: linear-gradient(to bottom,
        rgb(36 0 0 / var(--veu)) 0%,
        rgb(36 0 0 / var(--veu)) 40%,
        rgb(36 0 0 / calc(var(--veu) * 0.52)) 68%,
        rgb(36 0 0 / 0) 100%);
    }
"""

# DUAS sombras, e a segunda foi acrescentada em 01/09/2026 com o halo.
#
# A primeira e a da marca: deslocada 5px, larga e fraca — ela da profundidade,
# nao contraste. Enquanto o veu cobria 62% do quadro isso bastava, porque o
# fundo ja chegava escuro debaixo da letra. Com o halo calibrado ao minimo, o
# ponto mais fraco da peca passou a ser o texto PEQUENO de baixa opacidade
# (o pre-titulo a 74% e a condicao a 78%), medido no bloco de `SexExecutivo`,
# sobre prato claro.
#
# A segunda e CENTRADA e curta: ela mora na borda do glifo, onde a disputa
# acontece. E o mesmo movimento do By Rock — sombra presa a letra e o que
# deixa o escurecimento do FUNDO poder ser leve. Contraste que vem da sombra
# nao custa um pixel de fotografia; contraste que vem de tinta no fundo custa.
SOMBRA = ('text-shadow: 5px 5px 20px rgba(20, 0, 0, 0.30), '
          '0 1px 12px rgba(20, 0, 0, 0.62);')

# MODO=halo (padrao) troca o veu pela mancha atras do texto. MODO=veu mantem
# o gradiente de faixa, byte a byte como estava, para a comparacao lado a lado.
MODO = os.environ.get('MODO', 'halo')

# ACIMA DA LINHA (z-index: 1) vai em CADA linha, no proprio estilo dela — nao
# num wrapper extra em volta. O halo e absoluto e cobriria o texto que veio
# destacar; e por preservar a armadilha 4.1 (cada linha e item DIRETO do flex,
# selecionavel no editor) que ele nao entra como camada de div.
ACIMA = 'position: relative; z-index: 1; '


# ------------------------------------------------------------------- o halo
#
# O veu e um GRADIENTE DE FAIXA: para dar contraste no ponto onde a letra cai,
# escurece centenas de pixels de fotografia. Nesta leva ele chegou a cobrir
# 1190 dos 1920px (62% do quadro) com alpha 0,66 a 0,88 — e a foto e a
# protagonista pelo DNA. O halo escurece SO a area do bloco e desmancha nas
# bordas.
#
# 🔴 E `filter: blur()` na PROPRIA caixa, nunca `backdrop-filter: blur()`:
# backdrop-filter desfocaria a FOTOGRAFIA atras (lente fora de foco, que
# descaracteriza a foto); filter desmancha so a mancha e deixa a foto nitida
# por baixo.

def op(luz, minimo, maximo):
    """Interpola pelo BRILHO MEDIDO da regiao. Halo constante erra dos dois
    lados: sobra em foto escura (tampa sem precisar) e falta em foto clara."""
    t = (max(50.0, min(210.0, luz)) - 50.0) / 160.0
    return minimo + t * (maximo - minimo)


# Playfair Display ITALIC e um serifado FINO e de alto contraste — a haste
# tem 2-3px em 84px de corpo. Onde o Anton do By Rock e uma barra chapada que
# se le com pouco fundo, aqui a letra some primeiro. Por isso a faixa de tinta
# comeca mais alta que a de la (0,62-0,97): medido nas pecas desta leva.
A_MIN, A_MAX = 0.70, 0.97
R_MIN, R_MAX = 124, 158
INSET_X, INSET_Y = 62, 50


def halo(luz, escala=1.0, ix=INSET_X, iy=INSET_Y, alpha=None):
    """So os NUMEROS. A formula mora na classe .halo do CSS (armadilha 4.3):
    se o gerador e o achatador calculassem o mesmo gradiente, divergiriam sem
    ninguem ver — foi a regra que o veu ja seguia, e o halo herda.

    `alpha` vem de halos.json e VENCE a formula: la o valor foi medido contra
    a foto real e baixado ate o minimo que ainda le. A formula e a semente da
    primeira rodada. O RAIO nao e calibrado — ele governa quao difusa e a
    borda, nao quanto escurece, e quem responde pelo "marcado" e a tinta.
    """
    a = round(min(op(luz, A_MIN, A_MAX) * escala, 0.95), 3) if alpha is None \
        else round(min(max(float(alpha), 0.0), 0.95), 3)
    r = int(op(luz, R_MIN, R_MAX))
    return (f'--a: {a}; --r: {r}px; left: -{ix}px; right: -{ix}px; '
            f'top: -{iy}px; bottom: -{iy}px;')


_FOTOS = {}


def luz_do_retangulo(foto, x, y, w, h, ix=INSET_X, iy=INSET_Y):
    """Luminancia media da FOTO sob o retangulo do grupo, com a folga do halo.

    As fotos de fotos/ ja saem de preparar.py recortadas em 1080x1920, exatas
    ao quadro — nao ha `object-fit: cover` para simular, como no By Rock.
    """
    from PIL import Image, ImageStat
    if foto not in _FOTOS:
        caminho = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fotos', foto)
        _FOTOS[foto] = Image.open(caminho).convert('L')
    im = _FOTOS[foto]
    cx0, cy0 = max(0, x - ix), max(0, y - iy)
    cx1, cy1 = min(im.width, x + w + ix), min(im.height, y + h + iy)
    if cx1 <= cx0 or cy1 <= cy0:
        return 130.0
    return ImageStat.Stat(im.crop((cx0, cy0, cx1, cy1))).mean[0]


def halo_do_grupo(foto, rect, escala=1.0, alpha=None):
    """Sem geometria medida ainda (1a passada), usa um valor do meio: a peca
    sai legivel para a sonda medir, e a 2a passada substitui pelo real."""
    if not rect:
        return halo(130.0, escala, alpha=alpha)
    return halo(luz_do_retangulo(foto, *rect), escala, alpha=alpha)


def conferir_divs(html, quem):
    """Recusa artboard com <div> desbalanceado.

    🔴 HTML malformado NAO da erro: o parser fecha as tags sozinho e ANINHA o
    que vem depois. No By Rock foi assim que a logo foi parar dentro do slot
    do servico, com o CSS correto e o layout errado.
    """
    abre = len(re.findall(r'<div\b', html))
    fecha = html.count('</div>')
    if abre != fecha:
        raise SystemExit(f'{quem}: <div> desbalanceado — {abre} abrem, {fecha} fecham')

# Ponto de partida do veu; o valor final de cada peca sai da
# medicao (calibrar.py escreve veus.json).
VEU_PADRAO_T = (0.66, 820)
VEU_PADRAO_B = (0.70, 780)
TA = {'left': 'left', 'center': 'center', 'right': 'right'}
AI = {'left': 'flex-start', 'center': 'center', 'right': 'flex-end'}


def fio(texto, alinha='left'):
    return (f'    <div style="{ACIMA}font-family: {SANS}; font-size: 30px; font-weight: 700; '
            f'letter-spacing: 4.2px; text-transform: uppercase; color: {CREME}; '
            f'opacity: 0.74; text-align: {TA[alinha]}; {SOMBRA}">{texto}</div>')


def headline(manchete, ouro, tamanho=84, alinha='left'):
    """Playfair italico, Title Case, UMA palavra em dourado. Entrelinha 0.95:
    o bloco fica compacto, como o lockup do TERO."""
    return (f'    <div style="{ACIMA}margin-top: 22px; font-family: {SERIF}; '
            f'font-size: {tamanho}px; font-style: italic; font-weight: 600; '
            f'line-height: 0.95; letter-spacing: -0.5px; color: {CREME}; '
            f'max-width: 700px; text-align: {TA[alinha]}; text-wrap: pretty; {SOMBRA}">'
            f'<span style="color: {CREME};">{manchete}</span>'
            f'<span style="color: {DOURADO};">{ouro}</span></div>')


def condicao(texto, alinha='left'):
    """A CONDICAO da peca (horario, o preco do executivo). Nao e descricao de
    prato — essa nao entra mais."""
    return (f'    <div style="{ACIMA}margin-top: 16px; font-family: {SANS}; font-size: 30px; '
            f'font-weight: 400; line-height: 1.18; letter-spacing: 1.6px; '
            f'text-transform: uppercase; color: {CREME}; opacity: 0.78; '
            f'text-align: {TA[alinha]}; {SOMBRA}">{texto}</div>')


def servico(texto, alinha='left'):
    return (f'    <div style="{ACIMA}font-family: {SANS}; font-size: 32px; font-weight: 700; '
            f'letter-spacing: 3.2px; text-transform: uppercase; color: {CREME}; '
            f'text-align: {TA[alinha]}; {SOMBRA}">{texto}</div>')


def endereco(texto, alinha='left'):
    return (f'    <div style="{ACIMA}margin-top: 10px; font-family: {SANS}; font-size: 29px; '
            f'font-weight: 400; letter-spacing: 2px; text-transform: uppercase; '
            f'color: {CREME}; opacity: 0.72; text-align: {TA[alinha]}; {SOMBRA}">'
            f'{texto}</div>')


def filete(alinha='left'):
    margem = {'left': '', 'center': 'margin-left: auto; margin-right: auto;',
              'right': 'margin-left: auto;'}[alinha]
    return (f'    <div style="{ACIMA}width: 132px; height: 1px; background-color: {DOURADO}; '
            f'opacity: 0.85; flex: none; {margem}"></div>')


def cta(texto, alinha='left'):
    """CTA e texto integrado sobre filete fino. Nunca botao solido."""
    return (f'    <div style="{ACIMA}margin-top: 16px; font-family: {SERIF}; font-size: 36px; '
            f'font-style: italic; font-weight: 500; color: {CREME}; '
            f'text-align: {TA[alinha]}; {SOMBRA}">{texto}</div>')


def marca(canto):
    """Logo ABSOLUTA no canto oposto ao bloco, sempre dentro da safe area."""
    pos = {
        'base-dir': 'bottom: 158px; right: 96px;',
        'base-esq': 'bottom: 158px; left: 96px;',
        'base-centro': 'bottom: 158px; left: 50%; transform: translateX(-50%);',
        'topo-dir': 'top: 200px; right: 96px;',
        'topo-esq': 'top: 200px; left: 96px;',
        'topo-centro': 'top: 200px; left: 50%; transform: translateX(-50%);',
    }[canto]
    return (f'  <img src="logo-winevix.png" alt="Wine Vix" style="position: absolute; '
            f'{pos} width: 148px; height: 148px; opacity: 0.96; '
            f'filter: drop-shadow(0 2px 12px rgba(20, 0, 0, 0.5));">')


def marca_no_fluxo():
    """Assinatura no fim do fluxo, para a peca centrada com bloco no topo."""
    return (f'    <img src="logo-winevix.png" alt="Wine Vix" style="{ACIMA}width: 132px; '
            'height: 132px; margin-top: 26px; opacity: 0.96; '
            'filter: drop-shadow(0 2px 12px rgba(20, 0, 0, 0.5));">')


ESPACADOR = '    <div style="flex: 1 1 auto; min-height: 40px;"></div>'


def grupo(hid, linhas, al, halo_css):
    """Um grupo de texto contiguo, com a mancha atras.

    `width: fit-content` e o que faz o halo ter a largura do TEXTO e nao da
    coluna inteira — sem isso a mancha atravessa a peca de borda a borda e
    volta a ser um veu, so que com canto arredondado.

    O `data-halo` fica no WRAPPER, nao na mancha: e o retangulo das LETRAS que
    a sonda precisa medir, e a mancha e maior que ele pelo inset negativo.
    """
    mancha = f'      <div class="halo" style="{halo_css}"></div>\n' if halo_css else ''
    return (f'    <div data-halo="{hid}" style="position: relative; width: fit-content; '
            f'max-width: 100%; display: flex; flex-direction: column; '
            f'align-items: {AI[al]};">\n' + mancha + '\n'.join(linhas) + '\n    </div>')



def moldura(foto, veu_topo, veu_rodape, dentro, marca_html, alinha):
    veus = ''
    if veu_topo:
        veus += (f'  <div class="veu-t" style="--veu: {veu_topo[0]}; position: absolute; '
                 f'left: 0; top: 0; width: {W}px; height: {veu_topo[1]}px;"></div>\n')
    if veu_rodape:
        veus += (f'  <div class="veu-b" style="--veu: {veu_rodape[0]}; position: absolute; '
                 f'left: 0; bottom: 0; width: {W}px; height: {veu_rodape[1]}px;"></div>\n')
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="{FONTES}">
  <style>{CSS}  </style>
</helmet>
<div style="width: {W}px; height: {H}px; position: relative; overflow: hidden; \
background-color: {FUNDO};">
  <img src="{foto}" alt="" style="position: absolute; top: 0; left: 0; width: {W}px; \
height: {H}px; object-fit: cover; display: block;">
{veus}{marca_html}
  <div style="position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; \
box-sizing: border-box; padding: {PAD_TOPO}px {PAD_H}px {PAD_RODAPE}px; display: flex; \
flex-direction: column; align-items: {AI[alinha]};">
{dentro}
  </div>
</div>
</x-dc>
</body>
</html>
"""


def peca(s, rects=None, tinta=None):
    """Um story. O bloco vai ao TOPO ou ao RODAPE, alinhado a esquerda, ao
    centro ou a direita; a logo fica no canto oposto.

    No MODO=halo o corpo deixa de ser uma lista solta de linhas e passa a ser
    um ou DOIS grupos, cada um com a propria mancha calibrada pela luz da
    regiao onde ele pousa.
    """
    al = s.get('alinha', 'left')
    pos = s.get('pos', 'topo')
    rects = rects or {}
    tinta = tinta or {}
    bloco = []
    if s.get('fio'):
        bloco.append(fio(s['fio'], al))
    bloco.append(headline(s['manchete'], s['ouro'], s.get('tam', 84), al))
    if s.get('condicao'):
        bloco.append(condicao(s['condicao'], al))

    pe = [filete(al)]
    if s.get('servico'):
        pe.append('    <div style="height: 20px;"></div>')
        pe.append(servico(s['servico'], al))
    if s.get('endereco'):
        pe.append(endereco(s['endereco'], al))
    pe.append(cta(s['cta'], al))

    canto = {'left': 'dir', 'right': 'esq', 'center': 'centro'}[al]
    respiro = '    <div style="height: 30px;"></div>'

    if MODO != 'halo':
        pe = [respiro] + pe
        if pos == 'rodape':
            # tudo agrupado embaixo, a foto respira no topo; logo no alto, oposta
            corpo = [ESPACADOR] + bloco + pe
            m = marca(f'topo-{canto}')
            veu_t, veu_b = None, s.get('veuB', VEU_PADRAO_B)
        elif al == 'center':
            # bloco no topo E centrado: a logo absoluta no rodape cairia em cima
            # do servico, que tambem esta centrado. Aqui ela entra no FLUXO.
            corpo = bloco + [ESPACADOR] + pe + [marca_no_fluxo()]
            m = ''
            veu_t, veu_b = s.get('veuT', VEU_PADRAO_T), s.get('veuB', VEU_PADRAO_B)
        else:
            # manchete no topo e o SERVICO no rodape: e a regra aprendida de
            # 11/08 — o endereco vive no rodape e nao arrasta o titulo com ele
            corpo = bloco + [ESPACADOR] + pe
            m = marca(f'base-{canto}')
            veu_t, veu_b = s.get('veuT', VEU_PADRAO_T), s.get('veuB', VEU_PADRAO_B)
        return moldura(s['foto'], veu_t, veu_b, '\n'.join(corpo), m, al)

    foto = s['foto']
    if pos == 'rodape':
        # 🔴 UM grupo so, nao dois encostados: o bloco e o pe sao texto
        # CONTIGUO aqui, e duas manchas vizinhas somam tinta na emenda
        # (1-(1-0,8)^2 = 0,96), que e exatamente a marcacao visivel que este
        # mecanismo veio remover.
        corpo = [ESPACADOR,
                 grupo('bloco', bloco + [respiro] + pe, al,
                       halo_do_grupo(foto, rects.get('bloco'), alpha=tinta.get('bloco')))]
        m = marca(f'topo-{canto}')
    elif al == 'center':
        # a logo entra no fluxo e vai DENTRO da mancha do pe: e o mesmo grupo
        # visual, e mancha propria para ela criaria uma segunda emenda.
        corpo = [grupo('bloco', bloco, al, halo_do_grupo(foto, rects.get('bloco'), alpha=tinta.get('bloco'))),
                 ESPACADOR,
                 grupo('pe', pe + [marca_no_fluxo()], al,
                       halo_do_grupo(foto, rects.get('pe'), alpha=tinta.get('pe')))]
        m = ''
    else:
        # dois grupos distantes um do outro: cada um calibrado pela SUA regiao.
        # Era aqui que o veu mais custava — para segurar o servico la embaixo
        # ele escurecia tambem os 700px de foto entre os dois blocos.
        corpo = [grupo('bloco', bloco, al, halo_do_grupo(foto, rects.get('bloco'), alpha=tinta.get('bloco'))),
                 ESPACADOR,
                 grupo('pe', pe, al, halo_do_grupo(foto, rects.get('pe'), alpha=tinta.get('pe')))]
        m = marca(f'base-{canto}')
    # A LOGO NAO GANHA HALO nesta marca, e a diferenca para o By Rock e medida:
    # la a marca e um wordmark de fundo transparente, que sumiu sobre prato
    # branco; aqui ela e um DISCO OPACO (centro RGBA 24,24,24 alpha 255, 67% do
    # quadrado cheio), com anel dourado. Ela leva o proprio fundo — sobre foto
    # clara ela aparece MAIS, nao menos. Mancha atras dela so faria um segundo
    # disco em volta do disco.
    return moldura(foto, None, None, '\n'.join(corpo), m, al)


# ============================================================== os 21 stories
#
# Grade da entrada "Cadencia e grade de publicacao — Wine Vix":
#   9h  funcionamento (seg-sab)   10h  executivo (seg-sex) / cortesia (sab)
#   3o story ~12h, terca as 13h; quinta o 3o e happy hour (regra 3)
#   domingo: 9h fechamento · 12h desejo · 17h reabertura — casa FECHADA
#
# As duas linhas do story de funcionamento sao verbatim da base:
#   "Segunda a sabado - 10h as 22h" e "Rua Elesbao Linhares, 52, Praia do Canto"
# Sobem em caixa alta porque o bloco de servico do DNA e Lato 700 caixa alta;
# o que a base fixa e o CONTEUDO, nao a caixa tipografica.
#
# pos/alinha: nenhum arranjo se repete dia apos dia, e a posicao respeita onde
# a foto esta mais lisa (medido antes de escolher).

HORARIO = 'Segunda a sábado - 10h às 22h'
ENDERECO = 'Rua Elesbão Linhares, 52, Praia do Canto'
EXECUTIVO = 'Segunda a sexta · 11h às 15h'
CONDICAO_EXEC = 'Entrada, principal e sobremesa · R$ 79,90'

STORIES = [
    # --- SEGUNDA 31/08 -------------------------------------------------------
    dict(arq='Main', foto='seg-09.jpg', pos='topo', alinha='left',
         fio='Segunda na Wine Vix', manchete='A Adega Abre a ', ouro='Semana',
         servico=HORARIO, endereco=ENDERECO, cta='Venha nos visitar'),
    dict(arq='SegExecutivo', foto='seg-10.jpg', pos='topo', alinha='right',
         fio='Almoço executivo', manchete='O ', ouro='Brasileirinho',
         condicao=CONDICAO_EXEC, servico=EXECUTIVO, cta='Reserve no direct'),
    # Ultimo dia do Festival Italiano: a entrada da base vence em 31/08.
    # "Se despede hoje" e prazo de campanha, nao urgencia de relogio — o que o
    # DNA proibe e "comeca em", "ja comecou", "daqui a pouco".
    dict(arq='SegFestival', foto='seg-12.jpg', pos='rodape', alinha='center',
         fio='Hoje no bistrô', manchete='O Festival Italiano Se Despede ',
         ouro='Hoje', tam=76, servico='Hoje · 10h às 22h',
         cta='Reserve no direct'),

    # --- TERCA 01/09 ---------------------------------------------------------
    dict(arq='TerFuncionamento', foto='ter-09.jpg', pos='rodape', alinha='left',
         fio='Terça com boas histórias', manchete='A Casa Está ', ouro='Aberta',
         servico=HORARIO, endereco=ENDERECO, cta='Venha nos visitar'),
    dict(arq='TerExecutivo', foto='ter-10.jpg', pos='topo', alinha='center',
         fio='Hora do almoço', manchete='Arroz de ', ouro='Polvo',
         condicao=CONDICAO_EXEC, servico=EXECUTIVO, cta='Reserve no direct'),
    dict(arq='TerAdega', foto='ter-13.jpg', pos='rodape', alinha='right',
         fio='Da adega para você', manchete='Mais de 15 Países na Mesma ',
         ouro='Parede', tam=74, cta='A adega tem o rótulo certo para você'),

    # --- QUARTA 02/09 --------------------------------------------------------
    dict(arq='QuaFuncionamento', foto='qua-09.jpg', pos='topo', alinha='center',
         fio='Quarta na adega', manchete='Abertos Para o Seu ', ouro='Dia',
         servico=HORARIO, endereco=ENDERECO, cta='Venha nos visitar'),
    dict(arq='QuaExecutivo', foto='qua-10.jpg', pos='rodape', alinha='left',
         fio='Pausa para almoçar bem', manchete='Ancho com ', ouro='Legumes',
         condicao=CONDICAO_EXEC, servico=EXECUTIVO, cta='Reserve no direct'),
    dict(arq='QuaEntradas', foto='qua-12.jpg', pos='topo', alinha='right',
         fio='Cozinha autoral', manchete='Uma Tábua Para ', ouro='Dividir',
         cta='Reserve no direct'),

    # --- QUINTA 03/09 --------------------------------------------------------
    dict(arq='QuiFuncionamento', foto='qui-09.jpg', pos='rodape', alinha='center',
         fio='Quinta é quase sexta', manchete='A Porta Está ', ouro='Aberta',
         servico=HORARIO, endereco=ENDERECO, cta='Venha nos visitar'),
    dict(arq='QuiExecutivo', foto='qui-10.jpg', pos='topo', alinha='left',
         fio='Almoço executivo', manchete='Penne ao ', ouro='Pomodoro',
         condicao=CONDICAO_EXEC, servico=EXECUTIVO, cta='Reserve no direct'),
    # Regra 3 da base: quinta leva funcionamento, executivo e HAPPY HOUR.
    # O recorte 16h-19h e explicito — sem ele a peca promete condicao fora dele.
    dict(arq='QuiHappyHour', foto='qui-12.jpg', pos='rodape', alinha='right',
         fio='Happy hour', manchete='O Tempo Passa Mais Devagar ', ouro='Aqui',
         tam=76, servico='Segunda a sábado · 16h às 19h',
         cta='Venha nos visitar'),

    # --- SEXTA 04/09 ---------------------------------------------------------
    dict(arq='SexFuncionamento', foto='sex-09.jpg', pos='topo', alinha='center',
         fio='Sexta na Wine Vix', manchete='A Sexta Começa na ', ouro='Taça',
         servico=HORARIO, endereco=ENDERECO, cta='Venha nos visitar'),
    dict(arq='SexExecutivo', foto='sex-10.jpg', pos='topo', alinha='left',
         fio='Almoço executivo', manchete='Três Tempos no ', ouro='Almoço',
         condicao=CONDICAO_EXEC, servico=EXECUTIVO, cta='Reserve no direct'),
    dict(arq='SexPolvo', foto='sex-12.jpg', pos='rodape', alinha='center',
         fio='Hoje no bistrô', manchete='Polvo ao ', ouro='Mediterrâneo',
         cta='Reserve no direct'),

    # --- SABADO 05/09 --------------------------------------------------------
    dict(arq='SabFuncionamento', foto='sab-09.jpg', pos='rodape', alinha='right',
         fio='Sábado especial', manchete='Sábado de Portas ', ouro='Abertas',
         servico=HORARIO, endereco=ENDERECO, cta='Venha nos visitar'),
    # Nao ha executivo no sabado (a base e explicita: seg-sex). O slot das 10h
    # fica com a taca de cortesia, que e do dia. SEM PRECO: a graca e a cortesia.
    dict(arq='SabCortesia', foto='sab-10.jpg', pos='rodape', alinha='left',
         fio='Sábado para celebrar', manchete='Uma Taça de ', ouro='Cortesia',
         servico='Todo sábado · 10h às 22h', cta='Venha nos visitar'),
    dict(arq='SabLevaPraCasa', foto='sab-12.jpg', pos='topo', alinha='center',
         fio='Leva pra casa', manchete='A Adega Vai Com ', ouro='Você',
         cta='winevix.com.br'),

    # --- DOMINGO 06/09 — CASA FECHADA ---------------------------------------
    #
    # Estreia dos 3 stories de domingo (decisao do Ciro em 29/08). NENHUMA das
    # tres convida a visitar hoje: a casa nao abre. As listas de pre-titulo do
    # DNA vao so de segunda a sabado, justamente por isso — entao o fio das 9h
    # e INFORMATIVO ("Hoje fechado"), o das 12h usa "Descoberta da semana"
    # (aprovado por tipo) e o das 17h usa "Segunda na Wine Vix", que e o dia de
    # que a peca fala. Nenhum pre-titulo foi inventado.
    dict(arq='DomFechamento', foto='dom-09.jpg', pos='topo', alinha='right',
         fio='Hoje fechado', manchete='Hoje a Adega ', ouro='Descansa',
         servico=HORARIO, endereco=ENDERECO, cta='Sua mesa já sente sua falta'),
    # Pode citar o site (CTA aprovado), mas NUNCA prometer entrega no domingo:
    # a base nao registra dias de entrega.
    dict(arq='DomDesejo', foto='dom-12.jpg', pos='rodape', alinha='left',
         fio='Descoberta da semana', manchete='Escolha o Rótulo da Sua ',
         ouro='Semana', tam=76, cta='winevix.com.br'),
    dict(arq='DomReabertura', foto='dom-17.jpg', pos='rodape', alinha='right',
         fio='Segunda na Wine Vix', manchete='Amanhã a Casa Abre às ',
         ouro='10h', tam=76, servico='Executivo 11h–15h · Happy hour 16h–19h',
         cta='Sua mesa já sente sua falta'),
]

# A geometria de cada grupo vem de sondar.py (Chrome). Na PRIMEIRA passada ela
# nao existe e o halo sai do valor do meio; a 2a passada substitui pelo medido.
# Ciclo completo:  python3 gerar.py && python3 sondar.py && python3 gerar.py
GEOMETRIA = {}
_geo = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'geometria.json')
if MODO == 'halo' and os.path.exists(_geo):
    GEOMETRIA = json.load(open(_geo, encoding='utf-8'))

# halos.json: o alpha MEDIDO de cada grupo (calibrar_halo.py). Sem ele vale a
# formula, que e generosa de proposito — errar para o escuro na 1a rodada e
# recuperavel, errar para o claro entrega peca ilegivel.
TINTAS = {}
_tin = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'halos.json')
if MODO == 'halo' and os.path.exists(_tin):
    TINTAS = json.load(open(_tin, encoding='utf-8'))

PECAS = {}
for s in STORIES:
    PECAS[f"{s['arq']}.dc.html"] = peca(s, GEOMETRIA.get(s['arq']), TINTAS.get(s['arq']))


# =========================================================== veu por medicao
#
# O veu nasce com um valor de projeto e quem decide o FINAL e a medicao
# (medir.py): o fundo de cada foto e diferente, e chutar alpha no olho deixou
# 38 das 59 faixas fora do confortavel na primeira rodada desta leva.
# veus.json guarda o override por peca; calibrar.py o escreve.

def aplicar_ajustes(nome, html, ajustes):
    """Sobrepoe alpha e altura dos veus de UMA peca, se houver override.

    Trabalha sobre o HTML pronto de proposito: o alternativo seria passar o
    nome da peca por todas as chamadas de layout, o que polui 21 chamadas para
    resolver o que uma substituicao resolve.
    """
    a = ajustes.get(nome)
    if not a:
        return html
    i = [0]

    def troca(m):
        k = i[0]
        i[0] += 1
        if k >= len(a):
            return m.group(0)
        alpha, altura = a[k]
        return (f'class="{m.group(1)}" style="--veu: {alpha}; position: absolute; '
                f'left: 0; {m.group(2)}: 0; width: {m.group(3)}px; '
                f'height: {altura}px;"')
    return re.sub(r'class="(veu-[tb])" style="--veu: [\d.]+; position: absolute; '
                  r'left: 0; (\w+): 0; width: (\d+)px; height: \d+px;"',
                  troca, html)


# ================================================================ o canvas
#
# Uma LINHA por dia, os tres stories lado a lado na ordem do relogio: a leitura
# do canvas fica igual a leitura da agenda.

DIAS = [
    ('Segunda 31/08', ['Main', 'SegExecutivo', 'SegFestival'],
     ['9h · funcionamento', '10h · executivo', '12h · Festival Italiano (último dia)']),
    ('Terça 01/09', ['TerFuncionamento', 'TerExecutivo', 'TerAdega'],
     ['9h · funcionamento', '10h · executivo', '13h · da adega para você']),
    ('Quarta 02/09', ['QuaFuncionamento', 'QuaExecutivo', 'QuaEntradas'],
     ['9h · funcionamento', '10h · executivo', '12h · tábua']),
    ('Quinta 03/09', ['QuiFuncionamento', 'QuiExecutivo', 'QuiHappyHour'],
     ['9h · funcionamento', '10h · executivo', '12h · happy hour']),
    ('Sexta 04/09', ['SexFuncionamento', 'SexExecutivo', 'SexPolvo'],
     ['9h · funcionamento', '10h · executivo', '12h · polvo']),
    ('Sábado 05/09', ['SabFuncionamento', 'SabCortesia', 'SabLevaPraCasa'],
     ['9h · funcionamento', '10h · taça de cortesia', '12h · leva pra casa']),
    ('Domingo 06/09', ['DomFechamento', 'DomDesejo', 'DomReabertura'],
     ['9h · fechamento', '12h · desejo', '17h · reabertura']),
]

artboards = []
for i, (dia, arquivos, rotulos) in enumerate(DIAS):
    for j, (arq, rot) in enumerate(zip(arquivos, rotulos)):
        artboards.append({"file": f"{arq}.dc.html", "x": j * 1240, "y": i * 2160,
                          "w": 1080, "h": 1920, "title": f"{dia} · {rot}"})

CANVAS = {
    "artboards": artboards,
    "annotations": [
        {"id": "brief", "x": -1500, "y": 0, "w": 1300,
         "text": "WINE VIX · SEMANA 1 (31/08 a 06/09/2026)\n\nOs 21 stories, "
                 "1080x1920. O FEED da semana não está aqui: são três "
                 "carrosséis de CURADORIA DE FOTOS, sem arte e sem texto — a "
                 "mecânica vai na legenda.\n\nGrade pela entrada \"Cadência e "
                 "grade de publicação\": 9h funcionamento (seg–sáb), 10h "
                 "executivo (seg–sex) ou taça de cortesia (sáb), 3º story ~12h "
                 "— terça às 13h, quinta é happy hour.\n\nDOMINGO ESTREIA com 3 "
                 "stories (decisão do Ciro em 29/08). A casa FECHA: nenhuma das "
                 "três convida a visitar hoje, e nenhuma promete entrega.\n\n"
                 "AVISAR O CLIENTE antes de domingo: a grade anterior (1 story "
                 "no domingo) foi confirmada por ele em 23/08."},
        {"id": "espacamento", "x": -1500, "y": 2160, "w": 1300,
         "text": "O ESPAÇAMENTO É O DO TERO\n\nMargens 200 no topo, 150 no "
                 "rodapé, 96 nas laterais — as que o Ciro calibrou em 27/08, "
                 "mais apertadas que a faixa de 240 do Instagram.\n\nEntrelinha "
                 "justa na manchete (0.95) e um espaçador flexível entre o "
                 "bloco e o pé: o texto fica agrupado e a foto respira, em vez "
                 "dos dois blocos empurrados contra as bordas da primeira "
                 "rodada."},
        {"id": "variacao", "x": -1500, "y": 4320, "w": 1300,
         "text": "A POSIÇÃO VARIA PEÇA A PEÇA\n\nBloco no topo ou no rodapé, "
                 "alinhado à esquerda, ao centro ou à direita — 10 peças com o "
                 "bloco no topo e 11 no rodapé; 6 à esquerda, 7 centradas, 8 à "
                 "direita.\n\nA escolha cruza duas coisas: onde a foto está "
                 "mais lisa (medido: desvio de borda na faixa do topo contra a "
                 "do rodapé) e a distribuição, para nenhum arranjo se repetir "
                 "dia após dia.\n\nO endereço e o horário ficam SEMPRE no "
                 "rodapé, mesmo com a manchete no topo: é a regra de 11/08, e "
                 "é o que impede toda peça de convergir para o mesmo layout."},
        {"id": "texto", "x": -1500, "y": 6480, "w": 1300,
         "text": "TEXTO ENXUTO\n\nA peça NÃO descreve o prato. Manchete, a "
                 "condição quando existe (horário, o preço do executivo) e o "
                 "CTA. Ingrediente, acompanhamento e ficha de cardápio ficaram "
                 "de fora.\n\nPreço: só o R$ 79,90 do executivo, e uma peça com "
                 "valor por dia. As condições do happy hour são referência "
                 "interna e não vão em número.\n\nCTA é cópia literal de um dos "
                 "seis aprovados no DNA."},
    ],
    "launch": {"view": "canvas"},
}


if __name__ == '__main__':
    # veus.json so vale no MODO=veu: no halo nao ha faixa para ajustar, e
    # aplicar os overrides antigos reintroduziria o gradiente pela porta dos
    # fundos.
    ajustes = {}
    if MODO != 'halo' and os.path.exists('veus.json'):
        ajustes = json.load(open('veus.json', encoding='utf-8'))
    for nome, fonte in PECAS.items():
        html = aplicar_ajustes(nome.replace('.dc.html', ''), fonte, ajustes)
        conferir_divs(html, nome)
        with open(nome, 'w', encoding='utf-8') as f:
            f.write(html)
    print(f'  {len(PECAS)} artboards  (modo {MODO}'
          + (f', {len(GEOMETRIA)} com geometria medida)' if MODO == 'halo' else ')'))
    with open('canvas.json', 'w', encoding='utf-8') as f:
        json.dump(CANVAS, f, ensure_ascii=False, indent=2)
    print(f'  canvas.json  ({len(artboards)} no canvas)')
