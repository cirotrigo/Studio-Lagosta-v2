# -*- coding: utf-8 -*-
"""Gera os artboards-base do PADRÃO Empório Fonseca (projeto 12).

Assinatura destilada de 6 stories publicados do designer (28-29/08/2026, no
blob) + DNA da marca (24/08) + manual do designer. Ver PADRAO.md ao lado.

O sistema, em uma linha: lockup Trajan em até 3 níveis (contexto versalete
branco · assunto CAIXA ALTA branco · promessa versalete dourada), serviço em
Friz Quadrata no rodapé, logo dourada com moldura (nunca redesenhada), foto
sempre protagonista.

LEITURA DO TEXTO: HALO (01/09/2026)
-----------------------------------
O contraste do texto deixou de vir do VÉU (dois gradientes de borda a borda,
~1/3 da altura em cada ponta) e passa a vir do HALO — mancha escura só atrás
do bloco, desfocada com `filter: blur()`. Motivo em `../_halo.py`; o véu
continua gerável com `MODO=veu` para comparação de uma variável só.

Três decisões desta marca, diferentes do By Rock (onde o halo nasceu):

1. A mancha é AZUL da marca `#2C3445`, não o quase-preto. Toda a camada de
   leitura desta marca é construída nesse azul e a paleta proíbe preto puro.
2. O raio é MENOR (72-96 contra 124-158). O blur espalha ~3x o raio: num
   lockup curto de 3 linhas, o raio do By Rock faz a mancha alcançar o meio do
   quadro e cobrir tanta foto quanto o véu que ela veio substituir.
3. A tinta é MENOR (0.40-0.68 contra 0.62-0.97) porque a peça é elegante e o
   texto já carrega `text-shadow` presa ao glifo. Números medidos abaixo.

Armadilhas já pagas (Quintal/By Rock/TERO): foto por <img src> (nunca url()
no CSS); cada linha item direto do flex; px absoluto em tudo; nome de arquivo
sem acento.
"""
import base64
import json
import os
import sys

from PIL import Image, ImageFont

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _halo import conferir_divs, envolver, halo  # noqa: E402

# ---- paleta estrita do DNA -------------------------------------------------
DOURADO = '#CAB371'   # dourado champagne — acento, nunca área grande
BRANCO = '#FFFFFF'    # texto principal
SECUND = '#A8B0BD'    # cinza-azulado — texto secundário (endereço)
VEU_RGB = '44 52 69'  # #2C3445 azul escuro profundo — base de gradiente (DNA)
HALO_RGB = '44,52,69'  # a MESMA cor, na notação que o halo usa
FUNDO = '#2C3445'

# Calibragem do halo desta marca (ver docstring do módulo e PADRAO.md §5).
# `TINTA` e `RAIOS` são as pontas do interpolador por luz medida: o primeiro
# valor vale para faixa escura (luz 50), o segundo para faixa clara (luz 210).
TINTA = tuple(float(v) for v in os.environ.get('TINTA', '0.46,0.76').split(','))
RAIOS = tuple(float(v) for v in os.environ.get('RAIOS', '72,96').split(','))

# 🔴 A marca pede MAIS halo que o texto, não menos — o oposto da escala 0,72 do
# By Rock. Lá a logo é um bloco vermelho cheio sobre um halo quase preto e
# forte; aqui é um wordmark dourado de traço fino com moldura de 1px, sobre uma
# mancha azul deliberadamente leve, e sem `text-shadow` presa ao glifo (o que o
# texto tem e ela não). Herdar o 0,72 deixou a assinatura em p98=167 na capa de
# feed, sobre a madeira clara — o defeito 2 do roteiro do ../_halo.py, de novo.
ESCALA_LOGO = float(os.environ.get('ESCALA_LOGO', '1.45'))
ESCALA_RODAPE = float(os.environ.get('ESCALA_RODAPE', '1.05'))

MODO = os.environ.get('MODO', 'halo')
USA_HALO = MODO == 'halo'

b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
F = {
    'TrajanReg': ('Trajan EF', 400),
    'TrajanBold': ('Trajan EF', 700),
    'FrizReg': ('Friz EF', 400),
    'FrizBold': ('Friz EF', 700),
}
FONTES = ''.join(
    "@font-face{font-family:'%s';src:url(data:font/woff;base64,%s) format('woff');"
    'font-weight:%d;font-style:normal;font-display:block}'
    % (fam, b64(f'fonts/{arq}.woff'), peso)
    for arq, (fam, peso) in F.items()
)

# Véu com PLATÔ (armadilha 4.4): denso e constante até 50% da faixa, meia
# força a 78%, zero no fim. A fórmula vive SÓ aqui (armadilha 4.3).
# Mantido para `MODO=veu` — é o lado "antes" da comparação.
VEU_CSS = f'''
    .veu-t {{ background: linear-gradient(to bottom,
      rgb({VEU_RGB} / var(--veu)) 0%,
      rgb({VEU_RGB} / var(--veu)) 50%,
      rgb({VEU_RGB} / calc(var(--veu) * 0.5)) 78%,
      rgb({VEU_RGB} / 0) 100%); }}
    .veu-b {{ background: linear-gradient(to top,
      rgb({VEU_RGB} / var(--veu)) 0%,
      rgb({VEU_RGB} / var(--veu)) 50%,
      rgb({VEU_RGB} / calc(var(--veu) * 0.5)) 78%,
      rgb({VEU_RGB} / 0) 100%); }}'''

SOMBRA = 'text-shadow: 0 2px 16px rgb(24 29 40 / 0.5)'

# ---- medidas por formato ---------------------------------------------------
# Margem do DNA: 8% da largura (86 → 88, escala de 8) em todos os lados.
# Story soma os 5% de altura (96) no topo e no rodapé: 88 + 96 = 184.
GEO = {
    'story': dict(W=1080, H=1920, pad_topo=184, pad_rodape=184, pad_h=88,
                  contexto=52, assunto=96, promessa=44, servico=38, endereco=32,
                  veu_topo_h=1000, veu_rodape_h=900),
    'feed': dict(W=1080, H=1350, pad_topo=88, pad_rodape=88, pad_h=88,
                 contexto=46, assunto=84, promessa=40, servico=34, endereco=30,
                 veu_topo_h=700, veu_rodape_h=560),
}

LOGO_W, LOGO_H = 200, 65  # logo-ef.png é 600x195 → 200px de largura dá 65 de alto

AVISOS = []
_MEDIDORES = {}


def _fonte(arquivo, tam):
    chave = (arquivo, tam)
    if chave not in _MEDIDORES:
        _MEDIDORES[chave] = ImageFont.truetype(arquivo, tam)
    return _MEDIDORES[chave]


def cabe(txt, tam, geo, arquivo='fonts/TrajanPro-Bold.otf', tracking=0.03):
    util = geo['W'] - 2 * geo['pad_h']
    larg = round(_fonte(arquivo, tam).getlength(txt) + tam * tracking * max(0, len(txt) - 1))
    if larg > util:
        AVISOS.append(f'  "{txt}" mede ~{larg}px em {tam}px — passa de {util}px')
    return larg


# --------------------------------------------------------------------------
# A luz sob o bloco (é ela que calibra o halo)
# --------------------------------------------------------------------------
# 🔴 O halo se calibra pela luz do PEDAÇO onde o texto pousa, não pela média da
# faixa (roteiro 3 do ../_halo.py — no By Rock a diferença foi de 3x). Aqui não
# existe análise pré-cozida das fotos como lá; a luz é medida na hora, e para
# isso a foto precisa ser recortada como o `object-fit: cover` a recorta. As
# duas fotos desta pasta são 1080x1350: no story de 1080x1920 o `cover` amplia
# 1,42x e come 228px de CADA lado. Medir o arquivo original responderia por
# pixels que a peça nunca mostra.
_COVER = {}


def foto_como_sai(foto, W, H):
    chave = (foto, W, H)
    if chave not in _COVER:
        caminho = os.path.join('fotos', foto) if os.path.exists(os.path.join('fotos', foto)) else foto
        im = Image.open(caminho).convert('RGB')
        iw, ih = im.size
        esc = max(W / iw, H / ih)
        im = im.resize((round(iw * esc), round(ih * esc)), Image.LANCZOS)
        nw, nh = im.size
        cx, cy = (nw - W) // 2, (nh - H) // 2
        _COVER[chave] = im.crop((cx, cy, cx + W, cy + H))
    return _COVER[chave]


def luz_sob(foto, geo, caixa):
    """Luminância média da foto no retângulo onde o bloco vai pousar."""
    W, H = geo['W'], geo['H']
    x0, y0, x1, y1 = caixa
    x0, y0 = max(0, int(x0)), max(0, int(y0))
    x1, y1 = min(W, int(x1)), min(H, int(y1))
    if x1 <= x0 or y1 <= y0:
        return 128.0
    recorte = foto_como_sai(foto, W, H).crop((x0, y0, x1, y1)).convert('L')
    px = list(recorte.getdata())
    return sum(px) / len(px)


def css_do_halo(luz, escala=1.0, var='--halo'):
    """A mancha desta marca: azul #2C3445, raio e tinta calibrados acima.

    O `opacity: var(...)` é o botão do canvas. Ele multiplica a camada inteira
    depois do blur, o que é exatamente equivalente a multiplicar o alfa — e
    não obriga a costurar um `calc()` dentro do `rgba()` que o `_halo.halo()`
    compartilhado devolve pronto.
    """
    if not USA_HALO:
        return ''
    return halo(luz, escala, cor=HALO_RGB, tinta=TINTA, raios=RAIOS) + f' opacity: var({var});'


TA = {'left': 'left', 'right': 'right', 'center': 'center'}
AS = {'left': 'flex-start', 'right': 'flex-end', 'center': 'center'}


class Linha:
    """Uma linha de texto: o HTML e o que ela MEDE.

    A medida existe porque o halo precisa saber onde o bloco cai para ler a luz
    dali. Largura sai da própria fonte (o mesmo `getlength` do `cabe()`);
    altura é `font-size * line-height`, que é o que o navegador reserva.
    """

    def __init__(self, html, larg, alt, mt=0):
        self.html, self.larg, self.alt, self.mt = html, larg, alt, mt


def contexto(txt, geo, alinha='left'):
    """Nível 1 — Trajan versalete (caixa mista vira versalete: a fonte não tem
    minúscula de verdade), branco, menor. NUNCA text-transform aqui."""
    tam = geo['contexto']
    larg = cabe(txt, tam, geo, 'fonts/TrajanPro-Regular.otf', 0.02)
    return Linha(
        f'    <div style="font-family: \'Trajan EF\', Georgia, serif; font-weight: 400; '
        f'font-size: {tam}px; line-height: 1.12; letter-spacing: 0.02em; '
        f'color: {BRANCO}; text-align: {TA[alinha]}; {SOMBRA}">{txt}</div>',
        larg, round(tam * 1.12))


def assunto(linhas, geo, alinha='left'):
    """Nível 2 — Trajan Bold CAIXA ALTA, branco, o maior. Máximo 2 linhas,
    entrelinha justa. As strings já vêm em caixa alta (nada de transform)."""
    tam = geo['assunto']
    saida = []
    for i, l in enumerate(linhas):
        larg = cabe(l, tam, geo, 'fonts/TrajanPro-Bold.otf', 0.03)
        saida.append(Linha(
            f'    <div style="font-family: \'Trajan EF\', Georgia, serif; font-weight: 700; '
            f'font-size: {tam}px; line-height: 1.06; letter-spacing: 0.03em; '
            f'color: {BRANCO}; text-align: {TA[alinha]}; '
            f'{"margin-top: 16px; " if i == 0 else ""}{SOMBRA}">{l}</div>',
            larg, round(tam * 1.06), 16 if i == 0 else 0))
    return saida


def promessa(txt, geo, alinha='left'):
    """Nível 3 — Trajan versalete DOURADO, menor, entrelinha 1.3.
    O dourado marca exatamente UMA voz do lockup — é esta."""
    tam = geo['promessa']
    larg = cabe(txt, tam, geo, 'fonts/TrajanPro-Regular.otf', 0.02)
    return Linha(
        f'    <div style="font-family: \'Trajan EF\', Georgia, serif; font-weight: 400; '
        f'font-size: {tam}px; line-height: 1.3; letter-spacing: 0.02em; '
        f'color: {DOURADO}; text-align: {TA[alinha]}; '
        f'margin-top: 24px; max-width: 860px; {SOMBRA}">{txt}</div>',
        larg, round(tam * 1.3), 24)


def servico(txt, geo, alinha='left', mt=24):
    """Serviço — Friz Quadrata Bold, caixa alta, branco. Formato da casa:
    MECÂNICA | HORÁRIO (o pipe é diagramação)."""
    tam = geo['servico']
    larg = cabe(txt, tam, geo, 'fonts/FRZQUADB.TTF', 0.06)
    return Linha(
        f'    <div style="font-family: \'Friz EF\', Georgia, serif; font-weight: 700; '
        f'font-size: {tam}px; line-height: 1.25; letter-spacing: 0.06em; '
        f'color: {BRANCO}; text-align: {TA[alinha]}; '
        f'margin-top: {mt}px; {SOMBRA}">{txt}</div>',
        larg, round(tam * 1.25), mt)


ENDERECO_CHEIO = 'AV. RAUL OLIVEIRA NEVES, 120 · JARDIM CAMBURI'
ENDERECO_CURTO = 'JARDIM CAMBURI · VITÓRIA/ES'  # forma curta para arte (base)


def endereco(geo, alinha='left', txt=ENDERECO_CHEIO):
    tam = geo['endereco']
    larg = cabe(txt, tam, geo, 'fonts/FRZQUADN.TTF', 0.05)
    return Linha(
        f'    <div style="font-family: \'Friz EF\', Georgia, serif; font-weight: 400; '
        f'font-size: {tam}px; line-height: 1.25; letter-spacing: 0.05em; '
        f'color: {SECUND}; text-align: {TA[alinha]}; '
        f'margin-top: 12px; {SOMBRA}">{txt}</div>',
        larg, round(tam * 1.25), 12)


def logo_fluxo():
    """Assinatura dourada em fluxo (rodapé, acima do serviço) — 200px = 18,5%
    da largura, dentro do 17-22% do DNA. O arquivo oficial, nunca redesenho."""
    return Linha(
        f'    <img src="./logo-ef.png" alt="" style="width: {LOGO_W}px; height: auto; '
        f'display: block; '
        f'filter: drop-shadow(0 2px 10px rgb(24 29 40 / 0.55));">',
        LOGO_W, LOGO_H)


# --------------------------------------------------------------------------
# Blocos: HTML + halo + caixa medida
# --------------------------------------------------------------------------
def so_conteudo(dentro):
    """O mesmo embrulho do `envolver`, sem a mancha — para o modo véu."""
    return ('<div style="position: relative; width: fit-content;">'
            '<div class="conteudo" style="position: relative; z-index: 1;">'
            + dentro + '</div></div>')


def caixa_do_bloco(linhas, geo, alinha, ancora, y):
    """Onde o bloco pousa no quadro. `ancora` é 'topo' (y é o começo) ou
    'rodape' (y é o FIM, contado da borda de baixo)."""
    larg = max(l.larg for l in linhas)
    alt = sum(l.mt + l.alt for l in linhas)
    if ancora == 'topo':
        y0 = y
    else:
        y0 = geo['H'] - y - alt
    if alinha == 'left':
        x0 = geo['pad_h']
    elif alinha == 'right':
        x0 = geo['W'] - geo['pad_h'] - larg
    else:
        x0 = (geo['W'] - larg) / 2
    return (x0, y0, x0 + larg, y0 + alt)


def bloco(linhas, geo, foto, alinha, ancora, y, var, escala=1.0,
          inset_x=44, inset_y=36):
    """Um bloco de texto com o halo calibrado pela luz que ele cobre.

    🔴 O inset é MENOR que o do By Rock (54/44 → 44/36) pelo mesmo motivo que o
    raio: o blur já espalha ~3x o raio para fora da caixa, e num bloco curto o
    inset grande só empurra a mancha para cima de mais fotografia sem
    acrescentar contraste onde a letra está.
    """
    dentro = '\n'.join(l.html for l in linhas)
    css = ''
    if USA_HALO:
        caixa = caixa_do_bloco(linhas, geo, alinha, ancora, y)
        css = css_do_halo(luz_sob(foto, geo, caixa), escala, var)
    # `width: fit-content` é o que faz a mancha ter a largura do TEXTO e não da
    # coluna; o alinhamento sai para um flex row externo, precedente do
    # `bloco_logo` do By Rock.
    #
    # 🔴 O wrapper existe nos DOIS modos, e não só onde há halo. `MODO=veu` é o
    # lado "antes" da comparação: se ele mantivesse o layout antigo (cada linha
    # se alinhando sozinha na coluna), a comparação teria duas variáveis — o
    # mecanismo de leitura E a geometria do texto — e nenhum número diria de
    # qual das duas veio a diferença. É também o que dá ao medidor a MESMA
    # caixa `.conteudo` para medir nos dois lados.
    return (f'  <div style="display: flex; width: 100%; justify-content: {AS[alinha]};">'
            + (envolver(dentro, css, inset_x, inset_y) if css else so_conteudo(dentro))
            + '</div>')


def logo_solta(geo, canto, foto, var):
    """Assinatura dourada ABSOLUTA num canto (o fundo ninguém arrasta — o
    texto continua em fluxo, como a armadilha 4.1 exige).

    🔴 Ela precisa do PRÓPRIO halo. O véu cobria o quadro de borda a borda e
    dava contraste à marca de graça; sem véu, a logo dourada sobre madeira
    clara fica sem nada atrás. É o defeito 2 do roteiro do ../_halo.py, onde a
    marca do By Rock quase sumiu sobre prato branco.

    A escala é menor (0,72) porque a marca só precisa de assentamento, não de
    disco: ela é um desenho com moldura, não uma linha de texto fina.
    """
    x = geo['pad_h']
    y = geo['pad_rodape']
    pos = {
        'rodape-dir': (geo['W'] - x - LOGO_W, geo['H'] - y - LOGO_H,
                       f'bottom: {y}px; right: {x}px;'),
        'rodape-esq': (x, geo['H'] - y - LOGO_H, f'bottom: {y}px; left: {x}px;'),
        'topo-dir': (geo['W'] - x - LOGO_W, geo['pad_topo'],
                     f'top: {geo["pad_topo"]}px; right: {x}px;'),
        'topo-centro': ((geo['W'] - LOGO_W) / 2, geo['pad_topo'],
                        f'top: {geo["pad_topo"]}px; left: 50%; transform: translateX(-50%);'),
        'rodape-centro': ((geo['W'] - LOGO_W) / 2, geo['H'] - y - LOGO_H,
                          f'bottom: {y}px; left: 50%; transform: translateX(-50%);'),
    }[canto]
    x0, y0, css_pos = pos
    img = (f'<img src="./logo-ef.png" alt="" style="width: {LOGO_W}px; height: auto; '
           f'display: block; filter: drop-shadow(0 2px 10px rgb(24 29 40 / 0.55));">')
    if USA_HALO:
        luz = luz_sob(foto, geo, (x0, y0, x0 + LOGO_W, y0 + LOGO_H))
        corpo = envolver(img, css_do_halo(luz, ESCALA_LOGO, var), 40, 34)
    else:
        corpo = so_conteudo(img)
    return f'  <div style="position: absolute; {css_pos}">{corpo}</div>'


ESPACADOR = '    <div style="flex: 1 1 auto; min-height: 48px;"></div>'


def moldura(foto, geo, dentro, extra=''):
    W, H = geo['W'], geo['H']
    veus = '' if USA_HALO else (
        f'  <div class="veu-t" style="position: absolute; left: 0; top: 0; width: {W}px; '
        f'height: {geo["veu_topo_h"]}px; --veu: {{{{veuTopo}}}};"></div>\n'
        f'  <div class="veu-b" style="position: absolute; left: 0; bottom: 0; width: {W}px; '
        f'height: {geo["veu_rodape_h"]}px; --veu: {{{{veuRodape}}}};"></div>\n')
    return (f'<div style="position: relative; width: {W}px; height: {H}px; overflow: hidden; '
            f'background: {FUNDO}; font-family: \'Friz EF\', Georgia, serif;'
            # os holes do halo só existem no modo halo: declarados sempre, o
            # render de `MODO=veu` morre em "hole sem valor" (o data-props do
            # modo véu não os traz).
            + (' --halo-t: {{haloTopo}}; --halo-r: {{haloRodape}};' if USA_HALO else '')
            + '">\n'
            f'  <img src="./{foto}" alt="" style="position: absolute; left: 0; top: 0; '
            f'width: {W}px; height: {H}px; object-fit: cover;">\n'
            f'{veus}'
            f'{extra}'
            f'  <div style="position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; '
            f'box-sizing: border-box; padding: {geo["pad_topo"]}px {geo["pad_h"]}px '
            f'{geo["pad_rodape"]}px; display: flex; flex-direction: column; gap: 0px;">\n'
            f'{dentro}\n  </div>\n</div>')


# ---- os dois artboards-base ------------------------------------------------

def story_cafe():
    """STORY 1080x1920 — slot de 9h (café da manhã). Arranjo do designer no
    story de café: lockup no topo à DIREITA, rodapé (logo + serviço +
    endereço) à ESQUERDA.

    O rodapé inteiro (logo + serviço + endereço) vai sob UM halo só: as três
    coisas são contíguas, e duas manchas encostadas leriam como duas sujeiras
    em vez de uma sombra. No By Rock a logo tem halo próprio porque lá ela fica
    no canto OPOSTO ao serviço.
    """
    geo = GEO['story']
    foto = 'cafe-croque.jpg'
    topo = [contexto('A semana começa com', geo, 'right'),
            *assunto(['CAFÉ DE', 'MÉTODO'], geo, 'right'),
            promessa('e pão de fermentação natural', geo, 'right')]
    rodape = [logo_fluxo(),
              servico('CAFÉ DA MANHÃ | 9H ÀS 11H', geo, 'left'),
              endereco(geo, 'left')]
    corpo = '\n'.join([
        bloco(topo, geo, foto, 'right', 'topo', geo['pad_topo'], '--halo-t'),
        ESPACADOR,
        bloco(rodape, geo, foto, 'left', 'rodape', geo['pad_rodape'], '--halo-r', ESCALA_RODAPE),
    ])
    return moldura(foto, geo, corpo)


def feed_capa_pizza():
    """FEED 1080x1350 — capa de carrossel da Quarta da Pizza (qua 10h30).
    Lockup no topo à ESQUERDA, serviço no rodapé à esquerda, logo no
    rodapé à DIREITA (rodízio de posição)."""
    geo = GEO['feed']
    foto = 'pizza-quarta.jpg'
    topo = [contexto('Hoje, a partir das 19h', geo, 'left'),
            *assunto(['QUARTA', 'DA PIZZA'], geo, 'left'),
            promessa('Curadoria de massa fresca', geo, 'left')]
    rodape = [servico('TODA QUARTA | A PARTIR DAS 19H', geo, 'left', mt=0),
              endereco(geo, 'left', ENDERECO_CURTO)]
    corpo = '\n'.join([
        bloco(topo, geo, foto, 'left', 'topo', geo['pad_topo'], '--halo-t'),
        ESPACADOR,
        bloco(rodape, geo, foto, 'left', 'rodape', geo['pad_rodape'], '--halo-r', ESCALA_RODAPE),
    ])
    return moldura(foto, geo, corpo,
                   extra=logo_solta(geo, 'rodape-dir', foto, '--halo-r') + '\n')


PECAS = [
    ('Main', story_cafe, 'story', 0.62, 0.80, 'Story 9h · café da manhã'),
    ('FeedQuartaPizza', feed_capa_pizza, 'feed', 0.52, 0.78, 'Feed qua 10h30 · capa Quarta da Pizza'),
]


def props(formato, veu_topo, veu_rodape):
    geo = GEO[formato]
    if USA_HALO:
        # O halo já nasce calibrado pela luz medida sob cada bloco; o slider é
        # o retoque por foto (1,0 = usa a medição), não o ajuste obrigatório
        # que o véu exigia.
        p = {
            'haloTopo': {'editor': 'range', 'default': 1.0, 'min': 0.0, 'max': 1.6,
                         'step': 0.05, 'unit': '', 'section': 'Ajustes'},
            'haloRodape': {'editor': 'range', 'default': 1.0, 'min': 0.0, 'max': 1.6,
                           'step': 0.05, 'unit': '', 'section': 'Ajustes'},
        }
    else:
        p = {
            'veuTopo': {'editor': 'range', 'default': veu_topo, 'min': 0.05, 'max': 0.97,
                        'step': 0.02, 'unit': '', 'section': 'Ajustes'},
            'veuRodape': {'editor': 'range', 'default': veu_rodape, 'min': 0.05, 'max': 0.97,
                          'step': 0.02, 'unit': '', 'section': 'Ajustes'},
        }
    p['$preview'] = {'width': geo['W'], 'height': geo['H']}
    return json.dumps(p)


LOGICA_HALO = '''class Component extends DCLogic {
  renderVals() {
    return {
      haloTopo: Number(this.props.haloTopo ?? 1),
      haloRodape: Number(this.props.haloRodape ?? 1),
    };
  }
}'''

LOGICA_VEU = '''class Component extends DCLogic {
  renderVals() {
    return {
      veuTopo: Number(this.props.veuTopo ?? 0.55),
      veuRodape: Number(this.props.veuRodape ?? 0.80),
    };
  }
}'''


def pagina(corpo, p):
    estilo = FONTES + ('' if USA_HALO else VEU_CSS)
    return ('<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n'
            '  <script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            f'  <style>{estilo}\n    body {{ margin: 0; background: {FUNDO}; }}\n'
            f'    a {{ color: {DOURADO}; }}\n    a:hover {{ color: #b09c5e; }}\n  </style>\n</helmet>\n'
            f'{corpo}\n</x-dc>\n<script data-dc-script data-props=\'{p}\'>\n'
            f'{LOGICA_HALO if USA_HALO else LOGICA_VEU}\n</script>\n'
            '</body>\n</html>\n')


if __name__ == '__main__':
    canvas = {'artboards': [], 'launch': {'view': 'canvas'}}
    x = 0
    for arq, fabrica, formato, vt, vr, titulo in PECAS:
        geo = GEO[formato]
        nome = f'{arq}.dc.html'
        corpo = fabrica()
        conferir_divs(corpo, nome)
        open(nome, 'w', encoding='utf-8').write(pagina(corpo, props(formato, vt, vr)))
        canvas['artboards'].append({'file': nome, 'x': x, 'y': 0,
                                    'w': geo['W'], 'h': geo['H'], 'title': titulo})
        x += geo['W'] + 160
        print(f'{nome}  {geo["W"]}x{geo["H"]}  modo={MODO}')
    json.dump(canvas, open('canvas.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    if AVISOS:
        print('\nTEXTO QUE NAO CABE:')
        print('\n'.join(AVISOS))
