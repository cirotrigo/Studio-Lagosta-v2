# -*- coding: utf-8 -*-
"""Gera os artboards-base do PADRÃO Bacana (projeto 5) — story 1080x1920 e
feed 1080x1350.

O vocabulário visual sai do manual do designer (paleta oficial), do DNA da
marca e das artes APROVADAS do próprio cliente (4 referências de estrela +
stories publicados, lidos um a um em 29/08/2026 — medidas em PADRAO.md):

  - lockup de DUAS LINHAS em caixa alta, contraste de PESO: linha 1 em
    Cannon Book 64px (ou United Italic Cond 72px na voz "aquele"), linha 2
    em Cannon Extra Bold 72px — passo de corpo pequeno (1.125), o peso faz
    a ênfase (regra do DNA: "ênfase por peso, não tamanho");
  - manchete BRANCA; o laranja #EF6400 (manual, pixel medido) marca UMA
    palavra no máximo (marcada com "#"), ou o pino do serviço — nunca os
    dois fora o ponto da logo, nunca linha inteira, nunca fundo;
  - serviço no rodapé: pino de LINHA (SVG) + pares UNIDADE (Book 32px) /
    HORA (Bold 32px) — o dado pesa mais que o rótulo; toda peça com horário
    NOMEIA a unidade (Praia da Costa primeiro);
  - logo bacana-principal (com CHURRASCARIA) 170px no canto OPOSTO ao bloco
    de serviço, dentro da safe area;
  - margens story: 200px topo / 150px rodapé / 84px laterais (práticas das
    artes reais: manchete nasce ~187px, serviço morre ~163px);
  - feed 1080x1350 SEM faixa reservada: 96px topo/rodapé, 84px laterais.

CONTRASTE DO TEXTO: HALO, não véu (01/09/2026)
----------------------------------------------
O véu escurecia a faixa INTEIRA (760px de story) para dar leitura a um bloco
de texto de ~270px. O halo (`../_halo.py`, ideia do Ciro) escurece só a área
do bloco e desmancha nas bordas com `filter: blur()`.

🔴 `filter: blur()` na PRÓPRIA caixa, nunca `backdrop-filter: blur()` —
`backdrop-filter` desfocaria a FOTOGRAFIA, que é a protagonista pelo DNA.

São TRÊS halos nesta marca, não um: o bloco de texto, o serviço e a LOGO.
Aqui o serviço e a logo NÃO são irmãos como no By Rock — o serviço está no
fluxo e a logo é absoluta no canto oposto —, então cada um mede o seu próprio
retângulo. `MODO=veu` regera a versão antiga para comparar lado a lado.

Armadilhas já pagas (manual seção 4): foto por <img src> (nunca url() no
CSS); cada linha item direto do flex; px absoluto em cada bloco; nome de
arquivo sem acento. O halo é IRMÃO das linhas, absoluto, e não entra no
fluxo — `width: fit-content` no wrapper é o que dá à mancha a largura do
TEXTO e não a da coluna inteira.

Cada corte da Cannon é uma FAMÍLIA própria (usWeightClass 310-390, fora do
padrão) — o CSS declara cada um pelo nome e nunca seleciona por font-weight.
"""
import json
import os
import sys
from PIL import ImageFont

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _halo import halo, op, envolver, envolver_linhas, conferir_divs  # noqa: E402


def raio_de(luz, altura=None):
    """O raio que `_halo.halo` vai usar nesta luz.

    Lê o interpolador do módulo com a MESMA faixa default (124-158) em vez
    de repetir a conta — a fórmula continua morando num lugar só.
    """
    r = int(op(luz, 124, 158))
    return r if altura is None else min(r, int(RAIO_POR_ALTURA * altura))

BASE = os.path.dirname(os.path.abspath(__file__))
MODO = os.environ.get('MODO', 'halo')

LARANJA, BRANCO, FUNDO = '#EF6400', '#FFFFFF', '#1A1410'
W = 1080
PADS = {
    'story': {'h': 1920, 'topo': 200, 'rodape': 150, 'lados': 84},
    'feed': {'h': 1350, 'topo': 96, 'rodape': 96, 'lados': 84},
}
UTIL = W - 2 * 84

b64 = __import__('base64').b64encode
def fonte64(arq):
    return b64(open(f'fonts/{arq}', 'rb').read()).decode()

FACES = ''.join(
    "@font-face{font-family:'%s';src:url(data:font/woff;base64,%s) format('woff');"
    "font-weight:400;font-style:%s;font-display:block}" % (fam, fonte64(arq), estilo)
    for fam, arq, estilo in [
        ('Cannon Book', 'CannonBook.woff', 'normal'),
        ('Cannon XBold', 'CannonXBold.woff', 'normal'),
        ('Cannon Bold', 'CannonBold.woff', 'normal'),
        ('Cannon Light', 'CannonLight.woff', 'normal'),
        ('United Italic', 'UnitedItalic.woff', 'italic'),
    ])

VEU_CSS = '''
    .veu-t { background: linear-gradient(to bottom,
      rgb(26 20 16 / var(--veu-topo)) 0%,
      rgb(26 20 16 / var(--veu-topo)) 38%,
      rgb(26 20 16 / calc(var(--veu-topo) * 0.55)) 66%,
      rgb(26 20 16 / 0) 100%); }
    .veu-b { background: linear-gradient(to top,
      rgb(26 20 16 / var(--veu-rodape)) 0%,
      rgb(26 20 16 / var(--veu-rodape)) 38%,
      rgb(26 20 16 / calc(var(--veu-rodape) * 0.55)) 66%,
      rgb(26 20 16 / 0) 100%); }'''

SOMBRA = 'text-shadow: 0 2px 16px rgb(26 20 16 / 0.55)'

MEDIDAS = {
    'book': 'fonts/Cannon-book.ttf',
    'xbold': 'fonts/Cannon-extrabold.ttf',
    'bold': 'fonts/Cannon-bold.ttf',
    'italica': 'fonts/United-Italic-Cond-Medium.otf',
}
AVISOS = []


# ── Medição do texto: a mesma métrica serve para conferir se cabe E para
# saber o RETÂNGULO que o halo tem de cobrir. Sem ela o halo seria calibrado
# por um palpite de largura, e a largura do bloco é justamente o que muda de
# peça para peça (uma manchete curta não pede a mesma mancha que uma longa).
def largura_texto(txt, tam, corte, tracking=0.0, caixa_alta=True):
    fonte = ImageFont.truetype(os.path.join(BASE, MEDIDAS[corte]), tam)
    limpo = txt.replace('#', '')
    if caixa_alta:
        limpo = limpo.upper()
    return round(fonte.getlength(limpo) + tam * tracking * max(0, len(limpo) - 1))


def cabe(txt, tam, corte, tracking=0.0):
    larg = largura_texto(txt, tam, corte, tracking)
    if larg > UTIL:
        AVISOS.append(f'  "{txt.replace("#", "")}" mede ~{larg}px em {tam}px {corte} — passa de {UTIL}px')
    return larg


def quebrar(txt, tam, corte, teto):
    """Quebra gulosa igual à do navegador — devolve as linhas.

    A altura do apoio depende de quantas linhas ele ocupa, e a altura do
    bloco é metade do retângulo do halo. Estimar "duas linhas" erraria em
    toda peça de texto mais longo.
    """
    palavras, linhas, atual = txt.replace('#', '').split(' '), [], ''
    for p in palavras:
        teste = f'{atual} {p}'.strip()
        if atual and largura_texto(teste, tam, corte, caixa_alta=False) > teto:
            linhas.append(atual)
            atual = p
        else:
            atual = teste
    if atual:
        linhas.append(atual)
    return linhas


# ── Onde a luz é medida ────────────────────────────────────────────────────
# 🔴 Cada halo é calibrado pela luz do RETÂNGULO onde ele pousa, não pela
# média da faixa. Item 3 do roteiro de `_halo.py`: no By Rock a faixa grande
# dizia 180-239 e o rodapé real era 46-70, e o halo saía 3x mais escuro que o
# necessário — que é exatamente o "muito marcado" que este mecanismo veio
# corrigir. Aqui a marca tem três blocos em três lugares diferentes da foto
# (texto no topo, serviço no rodapé-esquerdo, logo no rodapé-direito), então
# uma medição por faixa erraria em dois deles por construção.
_CACHE = {}


def luz_da_regiao(foto, x0, y0, x1, y1, H):
    """Luz média do retângulo, na foto COMO ELA APARECE na peça.

    Simula o `object-fit: cover` do artboard — escala para cobrir WxH e
    centra — então o recorte medido é exatamente o que o leitor vê. Lê de
    `fotos/` (a original que o render publica), nunca do preview de `img/`.
    """
    chave = (foto, x0, y0, x1, y1, H)
    if chave in _CACHE:
        return _CACHE[chave]
    from PIL import Image, ImageStat
    caminho = os.path.join(BASE, 'fotos', foto)
    if not os.path.exists(caminho):
        caminho = os.path.join(BASE, foto)
    im = Image.open(caminho).convert('RGB')
    escala = max(W / im.width, H / im.height)
    im = im.resize((max(1, round(im.width * escala)), max(1, round(im.height * escala))),
                   Image.LANCZOS)
    ex, ey = (im.width - W) // 2, (im.height - H) // 2
    im = im.crop((ex, ey, ex + W, ey + H))
    recorte = im.crop((max(0, x0), max(0, y0), min(W, x1), min(H, y1))).convert('L')
    _CACHE[chave] = ImageStat.Stat(recorte).mean[0]
    return _CACHE[chave]


def destacar(txt):
    """Palavra com '#' vira laranja — no máximo UMA por peça (regra do DNA)."""
    saida = []
    for p in txt.split(' '):
        if p.startswith('#'):
            saida.append(f'<span style="color: {LARANJA}">{p[1:]}</span>')
        else:
            saida.append(p)
    return ' '.join(saida)


def pino(cor):
    """Pino de LINHA atravessando o bloco de serviço inteiro (~72px, como nas
    artes aprovadas — em star-3 ele mede ~75px a 1080 e abraça os dois pares)."""
    return ('<svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="' + cor +
            '" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" style="flex: none">'
            '<path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z"></path>'
            '<circle cx="12" cy="10" r="2.6"></circle></svg>')


def linha1(txt, voz='book'):
    """Linha de contexto do lockup: Cannon Book 64px, ou a voz itálica 72px."""
    if voz == 'italica':
        cabe(txt, 72, 'italica')
        return (f'<div style="font-family: \'United Italic\', Georgia, sans-serif; font-style: italic; '
                f'font-size: 72px; line-height: 1.0; letter-spacing: 0.01em; color: {BRANCO}; '
                f'text-transform: uppercase; {SOMBRA}">{txt}</div>')
    cabe(txt, 64, 'book', 0.04)
    return (f'<div style="font-family: \'Cannon Book\', \'Century Gothic\', sans-serif; '
            f'font-size: 64px; line-height: 1.0; letter-spacing: 0.04em; color: {BRANCO}; '
            f'text-transform: uppercase; {SOMBRA}">{txt}</div>')


def linha2(txt):
    """A coisa: Cannon Extra Bold 72px, branca (laranja só em palavra com #)."""
    cabe(txt, 72, 'xbold', 0.01)
    return (f'<div style="font-family: \'Cannon XBold\', \'Century Gothic\', sans-serif; '
            f'font-size: 72px; line-height: 1.04; letter-spacing: 0.01em; color: {BRANCO}; '
            f'text-transform: uppercase; padding-top: 6px; {SOMBRA}">{destacar(txt)}</div>')


def apoio(txt):
    return (f'<div style="font-size: 34px; line-height: 1.35; color: {BRANCO}; '
            f'max-width: 780px; margin-top: 18px; {SOMBRA}">{destacar(txt)}</div>')


def bloco_texto(s, halo_css):
    """Lockup + apoio sob UM halo.

    `envolver_linhas` (e não `envolver`) porque cada linha precisa continuar
    sendo ITEM DIRETO de um flex — armadilha 4.1 do manual: é o que deixa
    selecionar, reordenar e espaçar a manchete separada do pré-título no
    editor. O `gap: 6px` repõe aqui o gap que antes vinha do container da
    página; `flex-start` é o alinhamento desta marca (o DNA proíbe
    centralizar tudo — "cara de convite").
    """
    linhas = [linha1(s['titulo'][0], s.get('voz', 'book')), linha2(s['titulo'][1])]
    if s.get('apoio'):
        linhas.append(apoio(s['apoio']))
    return '    ' + envolver_linhas(linhas, halo_css, INSET_TEXTO[0], INSET_TEXTO[1],
                                    alinha='flex-start', gap=6)


def servico(pares, cor_pino, halo_css='', inset=None):
    """Pino de linha + pares UNIDADE (Book) / HORA (Bold). Um bloco só."""
    linhas = []
    for i, (unidade, hora) in enumerate(pares):
        topo = '' if i == 0 else 'margin-top: 26px; '
        linhas.append(
            f'<div style="{topo}font-family: \'Cannon Book\', sans-serif; font-size: 32px; '
            f'line-height: 1.15; letter-spacing: 0.06em; color: {BRANCO}; '
            f'text-transform: uppercase; {SOMBRA}">{unidade}</div>')
        linhas.append(
            f'<div style="font-family: \'Cannon Bold\', sans-serif; font-size: 32px; '
            f'line-height: 1.15; letter-spacing: 0.06em; color: {BRANCO}; '
            f'text-transform: uppercase; {SOMBRA}">{hora}</div>')
    corpo = ('<div style="display: flex; align-items: center; gap: 22px;">'
             + pino(cor_pino)
             + '<div style="display: flex; flex-direction: column;">'
             + ''.join(linhas) + '</div></div>')
    if not halo_css:
        return '    ' + corpo
    ix, iy = inset or (INSET_SERVICO_X, INSET_SERVICO_Y_MIN)
    return '    ' + envolver(corpo, halo_css, ix, iy)


def marca(canto, formato, halo_css=''):
    """A assinatura, com halo PRÓPRIO.

    🔴 Item 2 do roteiro: todo elemento que dependia do véu precisa do seu
    halo. Aqui o `drop-shadow` sozinho não segura — a logo é BRANCA e o
    rodapé desta marca cai sobre borda de prato e arroz com frequência.
    A escala é menor (0.72) porque a marca só pede assentamento, não disco.
    """
    p = PADS[formato]
    pos = {
        'base-dir': f'bottom: {p["rodape"]}px; right: {p["lados"]}px;',
        'base-esq': f'bottom: {p["rodape"]}px; left: {p["lados"]}px;',
        'topo-dir': f'top: {p["topo"]}px; right: {p["lados"]}px;',
        'topo-esq': f'top: {p["topo"]}px; left: {p["lados"]}px;',
    }[canto]
    img = ('<img src="./logo-bacana.png" alt="" style="width: 170px; height: auto; '
           'display: block; opacity: 0.97; '
           'filter: drop-shadow(0 2px 12px rgb(26 20 16 / 0.6));">')
    if not halo_css:
        return (f'<img src="./logo-bacana.png" alt="" style="position: absolute; {pos} '
                f'width: 170px; height: auto; opacity: 0.97; '
                f'filter: drop-shadow(0 2px 12px rgb(26 20 16 / 0.6));">')
    return (f'<div style="position: absolute; {pos} width: 170px;">'
            f'<div class="halo" style="position: absolute; left: -{INSET_LOGO[0]}px; '
            f'right: -{INSET_LOGO[0]}px; top: -{INSET_LOGO[1]}px; '
            f'bottom: -{INSET_LOGO[1]}px; z-index: 0; pointer-events: none; '
            f'{halo_css}"></div>'
            f'<div style="position: relative; z-index: 1;">{img}</div></div>')


ESPACADOR = '    <div style="flex: 1 1 auto; min-height: 40px;"></div>'

# ── Cor, inset e escala do halo ────────────────────────────────────────────
# 🔴 A COR do halo é da MARCA, não do módulo. O default de `_halo.py` é o
# quase-preto do By Rock (17,17,17); aqui a leitura se constrói no
# `dark-bacana` #1A1410 = (26,20,16), que o DNA descreve como "preto quente
# com uma gota de marrom" e que o véu já usava. Trocar o mecanismo não é
# licença para trocar a paleta junto.
COR_HALO = '26,20,16'

INSET_TEXTO = (54, 44)
INSET_SERVICO_X, INSET_SERVICO_Y_MIN = 46, 36
INSET_LOGO = (30, 26)
ESCALA_SERVICO = 1.05
ESCALA_LOGO = 0.72

# Quanto o raio do blur pode medir em relação à ALTURA do bloco que ele cobre.
# 0,42 reproduz a razão do By Rock (bloco de ~400px com raio 124-158) e é o
# MAIOR valor que ainda entrega contraste nas três peças — raio maior desmancha
# melhor a borda, então escolhe-se o teto da faixa segura, não o piso:
#
#     razão     | 0,28  0,35  0,42  0,55  módulo
#     pior p98  |   98   108   121   139     172      (referência: < 150)
#     lum peça  | 99,8 100,5 101,2 102,4   102,8      (Main)
#
# A fotografia quase não sente a escolha (1,5% entre os extremos): o que muda
# é contraste sob a letra. Medido em 01/09/2026.
RAIO_POR_ALTURA = 0.42

# ⚠️ Tentativa DESCARTADA, registrada para ninguém repetir: crescer a CAIXA do
# halo (inset vertical) em vez de encolher o raio. Funciona — o serviço do
# feriado ia de p98 170 para 133 com inset_y 150 —, mas custa uma mancha muito
# maior pelo mesmo contraste, e encolher o raio ganha nos dois eixos de uma vez.


def geometria(s):
    """Os três retângulos que os halos cobrem, em px do artboard.

    Sai da MESMA métrica de fonte que confere se o título cabe: corpo,
    entrelinha e tracking do padrão. Conferida contra a geometria REAL do
    Chrome por `sonda.py` — estimar aqui e nunca conferir é como o By Rock
    calibrou o rodapé pela faixa errada. A conferência já pagou uma vez (a
    largura do apoio que quebra, abaixo).
    """
    p = PADS[s['formato']]
    H, lado, topo, rod = p['h'], p['lados'], p['topo'], p['rodape']

    # ── bloco de texto: do topo da margem até o fim do apoio
    voz = s.get('voz', 'book')
    w1 = (largura_texto(s['titulo'][0], 72, 'italica', 0.01) if voz == 'italica'
          else largura_texto(s['titulo'][0], 64, 'book', 0.04))
    h1 = 72 if voz == 'italica' else 64
    w2 = largura_texto(s['titulo'][1], 72, 'xbold', 0.01)
    alt = h1 + 6 + round(72 * 1.04) + 6           # linha1 + gap + linha2 + padding-top
    larg = max(w1, w2)
    if s.get('apoio'):
        linhas = quebrar(s['apoio'], 34, 'book', 780)
        # 🔴 Apoio que QUEBRA ocupa o `max-width` inteiro (780), não a largura
        # da linha mais longa: o bloco encosta na trava e o resto sobra para a
        # linha seguinte. Medir a linha mais longa subestimava o bloco do
        # Story1200 em 44px — pego pela `sonda.py`, invisível no código.
        larg_apoio = (780 if len(linhas) > 1
                      else largura_texto(linhas[0], 34, 'book', caixa_alta=False))
        larg = max(larg, larg_apoio)
        alt += 6 + 18 + round(len(linhas) * 34 * 1.35)   # gap + margin-top + linhas
    r_texto = (lado, topo, lado + larg, topo + alt)

    # ── serviço: ancorado na margem de baixo, à esquerda
    n = len(s['servico'])
    alt_col = round(n * 2 * 32 * 1.15) + (n - 1) * 26
    alt_serv = max(72, alt_col)                  # o pino tem 72px e é o piso
    larg_serv = 72 + 22 + max(
        max(largura_texto(u, 32, 'book', 0.06), largura_texto(h, 32, 'bold', 0.06))
        for u, h in s['servico'])
    r_serv = (lado, H - rod - alt_serv, lado + larg_serv, H - rod)

    # ── logo: 170x66 (proporção medida do PNG), no canto declarado
    alt_logo = round(170 * 358 / 922)
    canto = s.get('marca', 'base-dir')
    x0 = lado if canto in ('base-esq', 'topo-esq') else W - lado - 170
    y1 = topo + alt_logo if canto.startswith('topo') else H - rod
    r_logo = (x0, y1 - alt_logo, x0 + 170, y1)

    # ⚠️ A logo é ABSOLUTA e não conversa com o fluxo: nada impedia que ela
    # pousasse em cima da manchete. Não é defeito do halo (o véu tinha o mesmo
    # buraco), mas com os retângulos já calculados a conferência sai de graça —
    # e "duas presenças no mesmo lugar" é reprova certa pelo DNA. Medido em
    # 01/09/2026: no Main a linha 2 chega a x=945 e a logo em `topo-dir`
    # começa em 826.
    for nome, outro in (('texto', r_texto), ('serviço', r_serv)):
        if (r_logo[0] < outro[2] and outro[0] < r_logo[2]
                and r_logo[1] < outro[3] and outro[1] < r_logo[3]):
            AVISOS.append(f'  logo em "{canto}" cobre o bloco de {nome} '
                          f'(logo {r_logo}, {nome} {outro})')
    return r_texto, r_serv, r_logo


def halo_de_bloco(foto, rect, H, escala=1.0):
    """O halo de um bloco de TEXTO: tinta medida na região, raio limitado pelo
    bloco.

    🔴 O raio grande do módulo (124-158px) foi calibrado num bloco ALTO. Num
    bloco baixo ele é contraproducente, e a razão é geométrica: `blur(r)` é
    uma gaussiana de desvio r, então quase toda a tinta cai FORA da caixa —
    escurece fotografia onde não há letra nenhuma e deixa de escurecer onde
    há. Medido em 01/09/2026 no serviço do feriado (173px de altura, sobre
    brasa acesa), variando SÓ o raio:

        raio      | 100%  70%   55%   40%
        p98       |  143  140   120    97      (referência: < 150)
        lum peça  | 64,4 66,2  66,1  65,9

    Encolher o raio ganha nos DOIS eixos ao mesmo tempo — mais contraste sob
    a letra E fotografia mais clara. É o oposto do que a intuição diz, e é
    por isso que está medido aqui.

    O que se preserva é a RAZÃO entre raio e bloco, não o raio em px: no By
    Rock o bloco tem ~400px com raio 124-158 (razão ~0,35), e é essa razão
    que faz a borda desmanchar. `RAIO_POR_ALTURA` a reproduz para qualquer
    tamanho de bloco.
    """
    altura = rect[3] - rect[1]
    luz = luz_da_regiao(foto, *rect, H)
    r = raio_de(luz, altura)
    return halo(luz, escala, cor=COR_HALO, raios=(r, r))


def moldura(s):
    p = PADS[s['formato']]
    H = p['h']
    usa_halo = MODO == 'halo'
    r_texto, r_serv, r_logo = geometria(s)

    inset_serv = INSET_SERVICO_X, INSET_SERVICO_Y_MIN
    if usa_halo:
        # A escala por papel: o serviço pede um pouco mais (1,05) porque é o
        # menor corpo da peça e cai sobre prato claro; a marca pede menos
        # (0,72) porque só precisa de assentamento, nunca de disco — o DNA é
        # explícito em que o logotipo confirma a peça, não abre.
        halo_texto = halo_de_bloco(s['foto'], r_texto, H)
        halo_serv = halo_de_bloco(s['foto'], r_serv, H, ESCALA_SERVICO)
        # 🔴 A MARCA é a exceção: ela fica com o raio largo do módulo, sem
        # teto. O teto existe para entregar CONTRASTE, e a logo não tem meta
        # de contraste — ela pede assentamento. Um raio proporcional a 66px
        # de altura viraria uma pastilha escura de borda visível atrás do
        # logotipo, que o DNA manda nunca deixar virar protagonista.
        halo_logo = halo(luz_da_regiao(s['foto'], *r_logo, H), ESCALA_LOGO, cor=COR_HALO)
    else:
        halo_texto = halo_serv = halo_logo = ''

    corpo = [bloco_texto(s, halo_texto), ESPACADOR,
             servico(s['servico'], s.get('pino', LARANJA), halo_serv, inset_serv)]
    dentro = '\n'.join(corpo)

    veus = ''
    if not usa_halo:
        alt_veu_t = 760 if s['formato'] == 'story' else 560
        alt_veu_b = 720 if s['formato'] == 'story' else 540
        veus = (f'  <div class="veu-t" style="position: absolute; left: 0; top: 0; width: {W}px; '
                f'height: {alt_veu_t}px; --veu-topo: {{{{veuTopo}}}};"></div>\n'
                f'  <div class="veu-b" style="position: absolute; left: 0; bottom: 0; width: {W}px; '
                f'height: {alt_veu_b}px; --veu-rodape: {{{{veuRodape}}}};"></div>\n')

    return (f'<div style="position: relative; width: {W}px; height: {H}px; overflow: hidden; '
            f'background: {FUNDO}; font-family: \'Cannon Book\', system-ui, sans-serif;">\n'
            f'  <img class="foto" src="./{s["foto"]}" alt="" style="position: absolute; left: 0; top: 0; '
            f'width: {W}px; height: {H}px; object-fit: cover;">\n'
            f'{veus}'
            f'  {marca(s.get("marca", "base-dir"), s["formato"], halo_logo)}\n'
            f'  <div style="position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; '
            f'box-sizing: border-box; padding: {p["topo"]}px {p["lados"]}px {p["rodape"]}px; '
            f'display: flex; flex-direction: column; align-items: flex-start; gap: 6px;">\n'
            f'{dentro}\n  </div>\n</div>')


PROPS_VEU = ('{"veuTopo":{"editor":"range","default":%s,"min":0.05,"max":0.97,"step":0.02,'
             '"unit":"","section":"Ajustes"},'
             '"veuRodape":{"editor":"range","default":%s,"min":0.05,"max":0.97,"step":0.02,'
             '"unit":"","section":"Ajustes"},'
             '"$preview":{"width":1080,"height":%d}}')

LOGICA_VEU = '''class Component extends DCLogic {
  renderVals() {
    return {
      veuTopo: Number(this.props.veuTopo ?? 0.45),
      veuRodape: Number(this.props.veuRodape ?? 0.60),
    };
  }
}'''

# No modo halo o artboard não carrega hole nenhum: a intensidade sai da
# MEDIÇÃO da foto no gerador e vira número literal no CSS. É a forma mais
# forte da regra 4.3 do manual — a fórmula não vive em dois lugares porque só
# existe UM lugar (`_halo.py`), e o render copia números.
PROPS_HALO = '{"$preview":{"width":1080,"height":%d}}'


def pagina(corpo, props, logica):
    css_extra = '' if MODO == 'halo' else VEU_CSS
    script = (f'<script data-dc-script data-props=\'{props}\'>\n{logica}\n</script>\n'
              if logica else f'<script data-dc-script data-props=\'{props}\'></script>\n')
    return ('<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n'
            '  <script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            f'  <style>{FACES}{css_extra}\n    body {{ margin: 0; background: {FUNDO}; }}\n'
            f'    a {{ color: {LARANJA}; }}\n    a:hover {{ color: #c85400; }}\n  </style>\n</helmet>\n'
            f'{corpo}\n</x-dc>\n{script}'
            '</body>\n</html>\n')


# ── As peças-base do padrão (fatos da base de conhecimento, tom do DNA) ──────
PECAS = [
    {
        # Main = artboard de entrada do canvas — a prova do slot 9h30
        'arq': 'Main', 'formato': 'story', 'dia': 'ter', 'hora': '09h30',
        'tema': 'o dia na Bacana (slot 1 da grade)',
        'foto': 'amb-salao.jpg', 'veuTopo': 0.42, 'veuRodape': 0.58,
        'titulo': ['TERÇA PEDE AQUELE', 'CHURRASCO BACANA'],
        'apoio': 'Churrasco no kilo e pratos completos, do jeito Bacana.',
        'servico': [('PRAIA DA COSTA', '11H30 ÀS 23H'),
                    ('BAIRRO DE FÁTIMA', '17H ÀS 23H')],
        'pino': LARANJA, 'marca': 'base-dir',
    },
    {
        'arq': 'Story1200', 'formato': 'story', 'dia': 'sáb', 'hora': '12h',
        'tema': 'almoço em grupo (slot 2 no sábado)',
        'foto': 'tabua-kilo.jpg', 'veuTopo': 0.62, 'veuRodape': 0.66,
        'voz': 'italica',
        'titulo': ['ALMOÇO DE SÁBADO', 'DO JEITO #BACANA'],
        'apoio': 'Carnes no kilo e pratos completos, com farofa e vinagrete.',
        'servico': [('PRAIA DA COSTA', '11H ÀS 23H'),
                    ('BAIRRO DE FÁTIMA', '11H ÀS 23H')],
        'pino': BRANCO, 'marca': 'base-dir',
    },
    {
        'arq': 'FeedFeriado', 'formato': 'feed', 'dia': 'seg 07/09', 'hora': '10h30',
        'tema': 'aviso de feriado (exceção com texto no feed)',
        'foto': 'brasa-cortes.jpg', 'veuTopo': 0.38, 'veuRodape': 0.62,
        'titulo': ['7 DE SETEMBRO', 'TEM QUE SER BACANA'],
        'apoio': 'Sem Almoço Bacana no feriado — te esperamos na brasa.',
        'servico': [('PRAIA DA COSTA', '11H ÀS 23H'),
                    ('BAIRRO DE FÁTIMA', '11H ÀS 23H')],
        'pino': LARANJA, 'marca': 'base-dir',
    },
]

if __name__ == '__main__':
    canvas = {'artboards': [], 'launch': {'view': 'canvas'}}
    mapa = []
    x = 0
    for s in PECAS:
        arq = f"{s['arq']}.dc.html"
        H = PADS[s['formato']]['h']
        if MODO == 'halo':
            props, logica = PROPS_HALO % H, ''
        else:
            props, logica = PROPS_VEU % (s['veuTopo'], s['veuRodape'], H), LOGICA_VEU
        html = pagina(moldura(s), props, logica)
        conferir_divs(html, arq)
        open(arq, 'w', encoding='utf-8').write(html)
        canvas['artboards'].append({
            'file': arq, 'x': x, 'y': 0, 'w': W, 'h': H,
            'title': f"{s['dia']} · {s['hora']} · {s['tema']}",
        })
        x += W + 140
        mapa.append({'artboard': arq, 'formato': s['formato'], 'dia': s['dia'],
                     'hora': s['hora'], 'tema': s['tema'], 'foto': s['foto']})
    json.dump(canvas, open('canvas.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(mapa, open('mapa.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(mapa)} artboards (modo {MODO})')
    if MODO == 'halo':
        for s in PECAS:
            H = PADS[s['formato']]['h']
            rt, rs, rl = geometria(s)
            print(f"  {s['arq']:12s} luz  texto {luz_da_regiao(s['foto'], *rt, H):5.1f}"
                  f"   servico {luz_da_regiao(s['foto'], *rs, H):5.1f}"
                  f"   logo {luz_da_regiao(s['foto'], *rl, H):5.1f}")
    if AVISOS:
        print('\nAVISOS:')
        print('\n'.join(AVISOS))
