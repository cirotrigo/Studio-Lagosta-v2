# -*- coding: utf-8 -*-
"""Gera os artboards-base da Real Gelateria (projeto 1) nos dois formatos da
cadência: STORY 1080x1920 e FEED 1080x1350 (capa de carrossel).

O vocabulário visual sai do manual do designer (prioridade absoluta), do DNA
da marca e das artes APROVADAS — 6 referências de estilo do próprio designer
(styleRefAt, 11/08) + 6 artes de IA com "gostei" + 5 publicadas conferidas
uma a uma em 29/08/2026. O sistema que atravessa todas:

  - headline em BRANLEY (peso único), Title Case ou caixa de frase — NUNCA
    caixa alta (queixa mais repetida do cliente, 4x entre 11 e 13/08);
    corpo pequeno: cada linha ~4,5-5,5% da altura, lockup <= 11%;
  - DUAS VOZES por cor, não por fonte: linha/palavra-chave em MENTA dentro
    da headline Crema (marcada com "#" no slot); dourado é do SELO, nunca
    de parágrafo (no máx UMA palavra de headline);
  - pré-título pequeno em CAPS Stage Grotesk com tracking largo — o ÚNICO
    texto em caixa alta da peça;
  - apoio Stage Grotesk Light/Regular; serviço com ícone de linha em
    círculo (relógio/sacola/pin); separador: linha fina Cioccolato, UMA;
  - véu VERDE REAL (nunca preto: "a sombra mais funda tende ao Verde
    Real"), com platô até 38% da faixa; a foto clara continua clara;
  - selo R dourado no canto superior DIREITO, pequeno (regra do Ciro
    11/08/2026: não varia de canto) — absoluto, como o fundo: ninguém
    arrasta selo no editor;
  - safezone do STORY: 250px topo / 350px base (DNA) — o FEED não tem
    faixa reservada do Instagram e usa margens de respiro (88/96px).

Armadilhas já pagas (Quintal/Espeto/By Rock/TERO): foto por <img src>
(nunca url() no CSS); cada linha item direto do flex; px absoluto em tudo;
fórmula do véu SÓ no CSS; nome de arquivo sem acento.
"""
import base64, json, os
from PIL import ImageFont

VERDE, MENTA, CREMA = '#283D36', '#CFE5D6', '#F3EADC'
CIOCCOLATO, SPRITZ = '#B78566', '#EA5328'
DOURADO_A, DOURADO_B = '#8C6A3F', '#D9B98A'

# As DUAS vozes da peca, resolvidas depois que o MODO e lido (fim do arquivo de
# constantes): sobre mancha escura o texto e claro; sobre mancha Crema ele e
# Verde Real, com a segunda voz em Dourado — nunca Menta, que a PADRAO 8.6 ja
# proibe sobre claro por falta de contraste.
VOZ1 = VOZ2 = ROTULO = SOMBRA_COR = None

FORMATOS = {
    'story': {'W': 1080, 'H': 1920, 'padTopo': 250, 'padRodape': 350, 'padH': 96},
    'feed': {'W': 1080, 'H': 1350, 'padTopo': 88, 'padRodape': 96, 'padH': 96},
}

b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
F = {k: b64(f'{k}.woff') for k in ('Branley', 'StageLight', 'StageRegular',
                                   'StageMedium', 'StageBold', 'StageExtraBold')}
face = lambda fam, k, w=400: ("@font-face{font-family:'%s';src:url(data:font/woff;base64,%s) "
    "format('woff');font-weight:%d;font-style:normal;font-display:block}" % (fam, F[k], w))
FONTES = (face('Branley', 'Branley', 400)
          + face('Stage Grotesk', 'StageLight', 300)
          + face('Stage Grotesk', 'StageRegular', 400)
          + face('Stage Grotesk', 'StageMedium', 500)
          + face('Stage Grotesk', 'StageBold', 700)
          + face('Stage Grotesk', 'StageExtraBold', 800))

# Véu VERDE REAL com platô (armadilha 4.4). No RODAPÉ o platô segura até
# 52% da faixa — o bloco da Real pousa alto (safe area de 350px) e com o
# platô de 38% o texto caía na cauda do gradiente (medido na 1ª prova).
# rgb(40 61 54) = #283D36.
VEU_CSS = '''
    .veu-t { background: linear-gradient(to bottom,
      rgb(40 61 54 / var(--veu-topo)) 0%,
      rgb(40 61 54 / var(--veu-topo)) 38%,
      rgb(40 61 54 / calc(var(--veu-topo) * 0.55)) 66%,
      rgb(40 61 54 / 0) 100%); }
    .veu-b { background: linear-gradient(to top,
      rgb(40 61 54 / var(--veu-rodape)) 0%,
      rgb(40 61 54 / var(--veu-rodape)) 52%,
      rgb(40 61 54 / calc(var(--veu-rodape) * 0.62)) 78%,
      rgb(40 61 54 / 0) 100%); }
    .halo { background: rgb(var(--halo-tinta) / var(--halo));
      filter: blur(calc(var(--halo-raio) * 1px));
      border-radius: calc(var(--halo-raio) * 1px + 60px); }'''


# --------------------------------------------------------------------------
# Como o texto ganha leitura sobre a foto (01/09/2026)
# --------------------------------------------------------------------------
# Tres mecanismos, escolhidos por MODO, para poderem ser MEDIDOS lado a lado:
#
#   veu   - o gradiente de faixa que ja existia (`.veu-t`/`.veu-b`).
#   halo  - a caixa escura desfocada atras do bloco (mecanismo do By Rock,
#           `design-canvas/_halo.py`), aqui tingida de VERDE REAL.
#   campo - o campo solido de cor da marca, que e o que o DESIGNER faz nas
#           referencias aprovadas (medido em 01/09/2026, ver PADRAO 4).
#
# 🔴 A tinta e SEMPRE Verde Real, nos tres. "Veu preto" e o item 3 da lista do
# que NUNCA fazer, e o halo do By Rock nasceu preto (#111) porque la a marca e
# preta e vermelha. Portar a geometria sem portar a tinta quebraria o DNA.
# O padrao e o HALO desde 01/09/2026 (medido nesta pasta, ver PADRAO 4). `veu`,
# `campo` e `halocrema` continuam existindo para a comparacao poder ser refeita.
PADRAO_MODO = 'halo'
MODO = os.environ.get('MODO', PADRAO_MODO)

# 🔴 O modo `halocrema` INVERTE a peca: mancha CREMA com texto Verde Real. Nao
# e invencao — e a variante aprovada da marca, medida em
# `refs/ref-designer-dia-dos-pais.jpg` em 01/09/2026: campo Crema entrando em
# degrade, "Feliz" em Verde Real, a segunda voz em Dourado, corpo em Verde.
# Existe para a foto CLARA, onde tinta escura e que vira mancha.
INVERTIDO = MODO == 'halocrema'
TINTA = (40, 61, 54)   # Verde Real #283D36
# 🔴 DUAS formas, e elas NAO se misturam: a moderna (espacos + `/ alpha`) e a
# legada (virgulas, em `rgba()`). `rgb(40, 61, 54 / 1)` e invalido e o Chrome
# descarta a declaracao INTEIRA em silencio — o render sai byte a byte igual ao
# da peca sem protecao nenhuma. Foi o segundo jeito de o campo nao aparecer.
TINTA_BARRA = f'{TINTA[0]} {TINTA[1]} {TINTA[2]}'      # rgb(40 61 54 / a)
TINTA_VIRG = f'{TINTA[0]}, {TINTA[1]}, {TINTA[2]}'     # rgba(40, 61, 54, a)


if INVERTIDO:
    VOZ1, VOZ2, ROTULO, SOMBRA_COR = VERDE, DOURADO_A, VERDE, '243 234 220'
else:
    VOZ1, VOZ2, ROTULO, SOMBRA_COR = CREMA, MENTA, MENTA, '40 61 54'


def _op(luz, minimo, maximo):
    """Interpola pela luz MEDIDA da regiao — igual ao _halo.py compartilhado."""
    t = (max(50.0, min(210.0, luz)) - 50.0) / 160.0
    return minimo + t * (maximo - minimo)


def tinta_da_mancha():
    """Crema no modo invertido; Verde Real no resto. NUNCA preto (PADRAO 8.3).

    Forma de BARRA (espacos), porque a classe `.halo` monta
    `rgb(var(--halo-tinta) / var(--halo))`.
    """
    return '243 234 220' if INVERTIDO else TINTA_BARRA


def halo_vars(luz, escala=1.0):
    """Os NUMEROS da mancha; a formula mora na classe `.halo` (armadilha 4.3).

    A mancha e uma caixa de cor com `filter: blur()` NELA MESMA — nunca
    `backdrop-filter`, que desfocaria a FOTOGRAFIA atras (lente fora de foco,
    que descaracteriza a foto). `filter` desmancha so a mancha e deixa a foto
    nitida por baixo. A distincao e o coracao da ideia do Ciro (01/09/2026).

    O raio e grande de proposito (124-158px): com raio pequeno ainda se enxerga
    onde a caixa comeca. A opacidade sobe junto porque o blur dilui — espalhar
    a mesma tinta por area maior clareia o centro, que e onde a letra cai.
    """
    if INVERTIDO:
        # A curva INVERTE de sentido: mancha CLARA precisa de MENOS tinta
        # quanto mais clara a foto. Manter a curva original daria o maximo de
        # Crema justamente sobre a vitrine branca, que e onde ela menos precisa.
        a = min(_op(luz, 0.95, 0.72) * escala, 0.95)
    else:
        a = min(_op(luz, 0.62, 0.97) * escala, 0.95)
    return round(a, 3), int(_op(luz, 124, 158))


def envolver(conteudo, vars_halo, inset_x=54, inset_y=44):
    """Embrulha um grupo de linhas com a mancha atras.

    Cada linha continua item direto de um flex (armadilha 4.1) — o wrapper e
    que passa a ser o item do flex de fora. Sem `z-index: 1` nas linhas o halo,
    que e absoluto, cobriria o proprio texto que deveria destacar.
    """
    global ULTIMO_HALO
    if not vars_halo:
        ULTIMO_HALO = None
        return conteudo
    ULTIMO_HALO = vars_halo[0]
    _, raio = vars_halo
    # 🔴 O inset ESCALA com o raio. A borda da caixa e o ponto de ~50% do
    # desfoque: com inset fixo, a ultima linha do bloco cai justamente na
    # queda e perde contraste — medido na capa de feed, onde a letra miuda
    # obrigatoria ("o desconto vale para o crepe de menor valor") ficava em
    # 3,6:1 contra o piso de 4,5:1 de texto pequeno. Meio raio poe o texto
    # inteiro dentro do miolo denso.
    inset_x += raio // 2
    inset_y += raio // 2
    marca = (f'    <div class="halo" style="position: absolute; left: -{inset_x}px; '
             f'right: -{inset_x}px; top: -{inset_y}px; bottom: -{inset_y}px; z-index: 0; '
             f'pointer-events: none; --halo-tinta: {tinta_da_mancha()}; '
             f'--halo-raio: {raio}; --halo: {{{{halo}}}};"></div>')
    linhas = '\n'.join(f'    <div style="position: relative; z-index: 1;">{l.strip()}</div>'
                       for l in conteudo.split('\n') if l.strip())
    return ('    <div style="position: relative; width: fit-content; display: flex; '
            'flex-direction: column; align-items: flex-start; gap: 8px;">\n'
            + marca + '\n' + linhas + '\n    </div>')


def campo_css(alt, alt_solida):
    """Campo SOLIDO de Verde Real, com uma entrada curta em degrade.

    E o mecanismo das referencias do proprio designer, medido em 01/09/2026:
    em `ref-designer-quarta-experiencia` a faixa de baixo chega a rgb(41,49,40)
    com desvio-padrao 1,3 — ou seja, Verde Real CHAPADO, nao um veu que para em
    0,72. Acima dele ha ~145px de transicao (normalizados para 1920), e a foto
    ACIMA disso fica INTOCADA. `ref-designer-dia-dos-pais` faz o mesmo em Crema.

    🔴 As paradas sao FRACOES DA PROPRIA FAIXA, nao do quadro. A primeira
    versao misturou as duas referencias e saiu com as duas ultimas paradas em
    0% — gradiente degenerado, que o Chrome desenha como NADA. O render ficou
    byte a byte igual ao da peca sem protecao nenhuma, sem erro nenhum.
    """
    pc = round(100.0 * alt_solida / alt, 2)
    return (f'background: linear-gradient(to top, rgb({TINTA_BARRA} / 1) 0%, '
            f'rgb({TINTA_BARRA} / 1) {pc}%, rgb({TINTA_BARRA} / 0) 100%);')



# --------------------------------------------------------------------------
# Medicao da faixa onde o bloco de fato pousa
# --------------------------------------------------------------------------
# 🔴 Calibrar pela media da FAIXA INTEIRA erra: no By Rock o halo saia 3x mais
# escuro que o necessario porque a faixa media dizia 180-239 e o rodape real
# era 46-70. Aqui a medicao ja nasce sobre a janela do bloco, e sobre a foto
# COMO ELA APARECE na peca (o `object-fit: cover` simulado).
_CACHE = {}


def luz_da_janela(foto, caixa, W, H):
    x0, y0, x1, y1 = caixa
    chave = (foto, caixa, W, H)
    if chave in _CACHE:
        return _CACHE[chave]
    from PIL import Image, ImageStat
    caminho = os.path.join('fotos', foto)
    if not os.path.exists(caminho):
        caminho = foto
    im = Image.open(caminho).convert('RGB')
    e = max(W / im.width, H / im.height)
    im = im.resize((max(1, round(im.width * e)), max(1, round(im.height * e))), Image.LANCZOS)
    ex, ey = (im.width - W) // 2, (im.height - H) // 2
    im = im.crop((ex, ey, ex + W, ey + H)).crop(
        (max(0, x0), max(0, y0), min(W, x1), min(H, y1)))
    _CACHE[chave] = ImageStat.Stat(im.convert('L')).mean[0]
    return _CACHE[chave]


# Caixa MEDIDA no Chrome (sonda de getBoundingClientRect, 01/09/2026) para os
# dois layouts-base, em (x0, y0, x1, y1). Bloco novo mede a sua; nao herde.
#
# 🔴 A caixa tem X, nao so Y. Medir a LARGURA INTEIRA do quadro foi o defeito
# nº 3 do By Rock e ele se repetiu aqui: na capa de feed os 457px a direita do
# bloco carregam o fundo escuro E o selo promocional branco, e a media deles
# nao diz nada sobre onde a letra cai. Corrigido, a capa passou de 3,5:1 para
# um contraste confortavel sem tocar na foto do lado de fora.
#
# ⚠️ A caixa depende da COPY (a linha mais longa manda na largura). Copy muito
# diferente da destes dois artboards pede uma sonda nova.
JANELA = {'funcionamento-story': (96, 1136, 657, 1570),
          'capa-feed': (96, 890, 623, 1254)}

# O alpha que a ultima peca montada calculou — vira o default do slider do
# canvas. Sem isso o editor abriria com um numero fixo que nao e o que o render
# desenhou, e a primeira mexida no slider daria um salto visivel.
ULTIMO_HALO = None


def ico(d, cor=None):
    """Ícone de linha em círculo fino — o desenho das artes do designer."""
    return ('<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="' + (cor or ROTULO) +
            '" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" '
            'style="flex: none"><circle cx="12" cy="12" r="11" stroke-width="0.9"></circle>' + d + '</svg>')


RELOGIO = ico('<circle cx="12" cy="12" r="5.6"></circle><path d="M12 8.9v3.2l2 1.4"></path>')
SACOLA = ico('<path d="M7.6 9.4h8.8l.8 7.6a1.1 1.1 0 0 1-1.1 1.2H7.9a1.1 1.1 0 0 1-1.1-1.2z"></path>'
             '<path d="M9.7 9.2v-1a2.3 2.3 0 1 1 4.6 0v1"></path>')
PINO = ico('<path d="M12 17.6s4.4-3.4 4.4-6.9a4.4 4.4 0 1 0-8.8 0c0 3.5 4.4 6.9 4.4 6.9z"></path>'
           '<circle cx="12" cy="10.6" r="1.6"></circle>')
ICONES = {'relogio': RELOGIO, 'sacola': SACOLA, 'pino': PINO}


def destacar(txt, cor=None):
    """#palavra vira a voz em Menta (o destaque da casa é COR, nunca corpo)."""
    saida = []
    for p in txt.split(' '):
        if p.startswith('#'):
            saida.append(f'<span style="color: {cor or VOZ2}">{p[1:]}</span>')
        else:
            saida.append(p)
    return ' '.join(saida)


AVISOS = []


def cabe(txt, tam, fmt, fonte='fonts/Branley_GC.otf'):
    util = FORMATOS[fmt]['W'] - 2 * FORMATOS[fmt]['padH']
    limpo = txt.replace('#', '')
    f = ImageFont.truetype(fonte, tam)
    larg = round(f.getlength(limpo))
    if larg > util:
        AVISOS.append(f'  "{limpo}" mede ~{larg}px em {tam}px — passa de {util}px')
    return larg


TA = {'left': 'left', 'center': 'center', 'right': 'right'}
AI = {'left': 'flex-start', 'center': 'center', 'right': 'flex-end'}


def pretitulo(txt, tam=28, alinha='left', cor=None):
    """O ÚNICO texto em caixa alta da peça: pequeno, caps, tracking largo."""
    return (f'    <div style="font-family: \'Stage Grotesk\', system-ui, sans-serif; '
            f'font-weight: 500; font-size: {tam}px; line-height: 1.2; letter-spacing: 0.24em; '
            f'color: {cor or ROTULO}; text-transform: uppercase; text-align: {TA[alinha]}; '
            f'text-shadow: 0 1px 10px rgb({SOMBRA_COR} / 0.35)">{txt}</div>')


def headline(linhas, tam=96, alinha='left'):
    """Branley, Title Case JA ESCRITO no slot (nunca .upper()), entrelinha
    1.04, tracking natural da fonte. Cada linha é item direto do flex."""
    out = []
    for l in linhas:
        cabe(l, tam, headline.fmt)
        out.append(f'    <div style="font-family: \'Branley\', Georgia, serif; font-weight: 400; '
                   f'font-size: {tam}px; line-height: 1.04; letter-spacing: 0; color: {VOZ1}; '
                   f'text-align: {TA[alinha]}; text-shadow: 0 2px 20px rgb({SOMBRA_COR} / 0.45)">'
                   f'{destacar(l)}</div>')
    return '\n'.join(out)


headline.fmt = 'story'


def apoio(txt, tam=34, alinha='left', destaque_spritz=False):
    """Stage Grotesk leve. Com destaque_spritz, a #palavra vira o valor da
    oferta: Bold em Spritz (o maior destaque do bloco, regra da composição)."""
    corpo = destacar(txt, SPRITZ) if destaque_spritz else destacar(txt)
    if destaque_spritz:
        corpo = corpo.replace(f'color: {SPRITZ}', f'color: {SPRITZ}; font-weight: 700')
    return (f'    <div style="font-family: \'Stage Grotesk\', system-ui, sans-serif; '
            f'font-weight: 400; font-size: {tam}px; line-height: 1.32; letter-spacing: 0.015em; '
            f'color: {VOZ1}; text-align: {TA[alinha]}; max-width: 800px; '
            f'text-shadow: 0 1px 12px rgb({SOMBRA_COR} / 0.4)">{corpo}</div>')


def filete(larg=120):
    """UMA linha fina Cioccolato por peça — só quando a hierarquia pedir."""
    return (f'    <div style="width: {larg}px; height: 2px; background: {CIOCCOLATO}; '
            f'flex: none; margin: 10px 0 4px;"></div>')


def rotulo(txt, tam=36, cor=None):
    """Rótulo de bloco (Funcionamento) — Stage Grotesk Medium, Title Case."""
    return (f'    <div style="font-family: \'Stage Grotesk\', system-ui, sans-serif; '
            f'font-weight: 500; font-size: {tam}px; line-height: 1.25; letter-spacing: 0.03em; '
            f'color: {cor or ROTULO}; text-shadow: 0 1px 10px rgb({SOMBRA_COR} / 0.4)">{txt}</div>')


def linha_servico(icone, txt, tam=31):
    """Unidade - horário, com ícone de linha em círculo. #palavra em Menta
    (é como o designer marca "Fechado")."""
    return ('    <div style="display: flex; align-items: center; gap: 18px; '
            f'font-family: \'Stage Grotesk\', system-ui, sans-serif; font-weight: 400; '
            f'font-size: {tam}px; line-height: 1.25; letter-spacing: 0.02em; color: {VOZ1}; '
            f'text-shadow: 0 1px 10px rgb({SOMBRA_COR} / 0.45)">{ICONES[icone]}'
            f'<span>{destacar(txt)}</span></div>')


def miudo(txt, tam=26, alinha='left'):
    """Letra pequena (a regra do menor valor da Quarta do Crepe mora aqui)."""
    return (f'    <div style="font-family: \'Stage Grotesk\', system-ui, sans-serif; '
            f'font-weight: 400; font-size: {tam}px; line-height: 1.35; letter-spacing: 0.02em; '
            f'color: {VOZ1}; opacity: 0.92; text-align: {TA[alinha]}; '
            f'text-shadow: 0 1px 10px rgb({SOMBRA_COR} / 0.45)">{txt}</div>')


def selo_r(fmt, tam=None, foto=None):
    """Selo R dourado, canto superior DIREITO, pequeno — regra fixa do DNA
    (Ciro, 11/08/2026). Absoluto como o fundo: não se arrasta no editor.

    🔴 O selo tinha só um `drop-shadow`, e ele fora calibrado para conviver COM
    o véu do topo. Sem o véu, a marca dourada passou a pousar no teto claro do
    shopping e quase sumiu — é o defeito nº 2 do roteiro do halo, que no By
    Rock apareceu com a logo sobre prato branco. Aqui ele ganha o PRÓPRIO halo,
    na escala de assentamento (0,72): a marca precisa assentar, não de disco.
    """
    t = tam or (170 if fmt == 'story' else 150)
    top = 120 if fmt == 'story' else 80
    f = FORMATOS[fmt]
    right = f['padH']
    img = (f'<img src="./selo-r.png" alt="" style="position: relative; z-index: 1; '
           f'display: block; width: {t}px; height: auto; opacity: 0.97; '
           f'filter: drop-shadow(0 2px 14px rgb({SOMBRA_COR} / 0.5));">')
    marca = ''
    if MODO in ('halo', 'halocrema') and foto:
        # medido sobre o canto REAL onde o selo pousa, nunca sobre a faixa
        luz = luz_da_janela(foto, (f['W'] - right - t, top, f['W'] - right, top + t),
                            f['W'], f['H'])
        a, raio = halo_vars(luz, 0.72)
        marca = (f'<div class="halo" style="position: absolute; left: -{raio//2}px; '
                 f'right: -{raio//2}px; top: -{raio//2}px; bottom: -{raio//2}px; z-index: 0; '
                 f'pointer-events: none; --halo-tinta: {tinta_da_mancha()}; '
                 f'--halo-raio: {raio}; --halo: {round(a, 3)};"></div>')
    return (f'<div style="position: absolute; top: {top}px; right: {right}px; '
            f'width: {t}px; z-index: 5;">{marca}{img}</div>')


def selo_quarta(tam=250):
    """Selo promocional do manual: círculo branco, anel TODA QUARTA-FEIRA,
    50% OFF no centro — só na pauta da Quarta do Crepe."""
    r_anel = 88
    # 🔴 `z-index: 5` porque o halo viaja DENTRO da coluna de texto, que vem
    # DEPOIS dos absolutos no DOM — sem isso a mancha pinta POR CIMA do selo e
    # o disco branco sai acinzentado. Com o véu isso nao acontecia: o véu era
    # irmao anterior, e o selo ja pintava em cima dele.
    return (f'<div style="position: absolute; right: 88px; bottom: 96px; width: {tam}px; '
            f'height: {tam}px; z-index: 5; '
            f'filter: drop-shadow(0 10px 28px rgb({SOMBRA_COR} / 0.45));">'
            f'<svg width="{tam}" height="{tam}" viewBox="0 0 220 220">'
            f'<circle cx="110" cy="110" r="108" fill="#FFFFFF"></circle>'
            f'<defs><path id="anelQ" d="M 110 110 m -{r_anel} 0 a {r_anel} {r_anel} 0 1 1 {2*r_anel} 0 '
            f'a {r_anel} {r_anel} 0 1 1 -{2*r_anel} 0"></path></defs>'
            f'<text fill="{SPRITZ}" font-family="Stage Grotesk, system-ui, sans-serif" '
            f'font-size="24" font-weight="700" letter-spacing="4.5">'
            f'<textPath href="#anelQ" startOffset="0">TODA QUARTA-FEIRA</textPath></text>'
            f'<g transform="rotate(180 110 110)"><rect x="106" y="18" width="8" height="8" '
            f'transform="rotate(45 110 22)" fill="{SPRITZ}"></rect></g>'
            f'<text x="110" y="103" text-anchor="middle" fill="{SPRITZ}" '
            f'font-family="Stage Grotesk, system-ui, sans-serif" font-size="52" '
            f'font-weight="800" letter-spacing="0">50%</text>'
            f'<text x="110" y="152" text-anchor="middle" fill="{SPRITZ}" '
            f'font-family="Stage Grotesk, system-ui, sans-serif" font-size="44" '
            f'font-weight="800" letter-spacing="6">OFF</text>'
            f'</svg></div>')


def conferir_divs(html, quem):
    """Recusa artboard com <div> desbalanceado.

    🔴 HTML malformado NAO da erro: o parser fecha as tags sozinho e aninha o
    que vem depois — a peca sai renderizada e errada, sem uma linha de aviso.
    """
    import re as _re
    abre, fecha = len(_re.findall(r'<div\b', html)), html.count('</div>')
    if abre != fecha:
        raise SystemExit(f'{quem}: <div> desbalanceado — {abre} abrem, {fecha} fecham')


ESPACADOR = '    <div style="flex: 1 1 auto; min-height: 40px;"></div>'


def moldura(fmt, foto, dentro, absolutos, alinha='left', veu_topo_h=None, veu_rodape_h=None,
            campo=None):
    """`campo` = (y_onde_a_transicao_comeca, y_onde_fica_solido), so no MODO campo."""
    f = FORMATOS[fmt]
    W, H = f['W'], f['H']
    vt = veu_topo_h or (620 if fmt == 'story' else 420)
    vb = veu_rodape_h or (980 if fmt == 'story' else 740)
    solto = ''.join(f'  {a}\n' for a in absolutos if a)
    if MODO == 'veu':
        protecao = (
            f'  <div class="veu-t" style="position: absolute; left: 0; top: 0; width: {W}px; '
            f'height: {vt}px; --veu-topo: {{{{veuTopo}}}};"></div>\n'
            f'  <div class="veu-b" style="position: absolute; left: 0; bottom: 0; width: {W}px; '
            f'height: {vb}px; --veu-rodape: {{{{veuRodape}}}};"></div>\n')
    elif MODO == 'campo' and campo:
        y0, y1 = campo
        protecao = (f'  <div style="position: absolute; left: 0; bottom: 0; width: {W}px; '
                    f'height: {H - y0}px; {campo_css(H - y0, H - y1)}"></div>\n')
    else:
        protecao = ''   # halo: a protecao viaja DENTRO do bloco de texto
    return (f'<div style="position: relative; width: {W}px; height: {H}px; overflow: hidden; '
            f'background: {VERDE}; font-family: \'Stage Grotesk\', system-ui, sans-serif;">\n'
            f'  <img src="./{foto}" alt="" style="position: absolute; left: 0; top: 0; '
            f'width: {W}px; height: {H}px; object-fit: cover;">\n'
            f'{protecao}'
            f'{solto}'
            f'  <div style="position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; '
            f'box-sizing: border-box; padding: {f["padTopo"]}px {f["padH"]}px {f["padRodape"]}px; '
            f'display: flex; flex-direction: column; align-items: {AI[alinha]}; gap: 8px;">\n'
            f'{dentro}\n  </div>\n</div>')


def L_funcionamento_story(s):
    """1º story do dia: bloco no RODAPÉ (a foto respira), selo topo direito.
    A copy anuncia o dia — nunca convida para vir agora."""
    headline.fmt = 'story'
    corpo = []
    if s.get('pretitulo'):
        corpo.append(pretitulo(s['pretitulo']))
    corpo.append(headline(s['titulo'], s.get('tamTitulo', 96)))
    corpo.append(filete())
    corpo.append(rotulo('Funcionamento'))
    for l in s['servico']:
        corpo.append(linha_servico(l['icone'], l['txt']))
    caixa = JANELA['funcionamento-story']
    luz = luz_da_janela(s['foto'], caixa, 1080, 1920)
    y0 = caixa[1]
    dentro = ESPACADOR + '\n' + envolver('\n'.join(corpo),
                                         halo_vars(luz) if MODO in ('halo', 'halocrema') else None)
    # O campo entra 126px acima do topo do bloco e fica chapado 40px antes
    # dele — a mesma proporcao medida na referencia do designer.
    return moldura('story', s['foto'], dentro, [selo_r('story', foto=s['foto'])],
                   campo=(y0 - 190, y0 - 40))


def L_capa_feed(s):
    """Capa de aviso/campanha do carrossel (a capa comum é foto pura).
    Selo promocional só na pauta da Quarta do Crepe."""
    headline.fmt = 'feed'
    corpo = [ESPACADOR]
    if s.get('pretitulo'):
        corpo.append(pretitulo(s['pretitulo']))
    corpo.append(headline(s['titulo'], s.get('tamTitulo', 88)))
    for l in ([s['apoio']] if isinstance(s.get('apoio'), str) else s.get('apoio', [])):
        corpo.append(apoio(l, 34, destaque_spritz=s.get('apoioSpritz', False)))
    if s.get('miudo'):
        corpo.append(filete())
        corpo.append(miudo(s['miudo']))
    absolutos = [selo_r('feed', foto=s['foto'])]
    if s.get('seloQuarta'):
        absolutos.append(selo_quarta())
    caixa = JANELA['capa-feed']
    luz = luz_da_janela(s['foto'], caixa, 1080, 1350)
    y0 = caixa[1]
    dentro = ESPACADOR + '\n' + envolver('\n'.join(corpo[1:]),
                                         halo_vars(luz) if MODO in ('halo', 'halocrema') else None)
    return moldura('feed', s['foto'], dentro, absolutos, campo=(y0 - 150, y0 - 34))


LAYOUTS = {'funcionamento-story': L_funcionamento_story, 'capa-feed': L_capa_feed}


def props(fmt, veu_topo, veu_rodape):
    f = FORMATOS[fmt]
    ajustes = {}
    if MODO == 'veu':
        ajustes['veuTopo'] = {'editor': 'range', 'default': veu_topo, 'min': 0.05,
                              'max': 0.97, 'step': 0.02, 'unit': '', 'section': 'Ajustes'}
        ajustes['veuRodape'] = {'editor': 'range', 'default': veu_rodape, 'min': 0.05,
                                'max': 0.97, 'step': 0.02, 'unit': '', 'section': 'Ajustes'}
    elif ULTIMO_HALO is not None:
        ajustes['halo'] = {'editor': 'range', 'default': ULTIMO_HALO, 'min': 0.2,
                           'max': 0.97, 'step': 0.02, 'unit': '', 'section': 'Ajustes'}
    ajustes['$preview'] = {'width': f['W'], 'height': f['H']}
    return json.dumps(ajustes)


LOGICA = '''class Component extends DCLogic {
  renderVals() {
    return {
      veuTopo: Number(this.props.veuTopo ?? 0.28),
      veuRodape: Number(this.props.veuRodape ?? 0.62),
      halo: Number(this.props.halo ?? 0.8),
    };
  }
}'''


def pagina(corpo, p):
    return ('<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n'
            '  <script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            f'  <style>{FONTES}{VEU_CSS}\n    body {{ margin: 0; background: {VERDE}; }}\n'
            f'    a {{ color: {CIOCCOLATO}; }}\n    a:hover {{ color: #9c6f52; }}\n  </style>\n</helmet>\n'
            f'{corpo}\n</x-dc>\n<script data-dc-script data-props=\'{p}\'>\n{LOGICA}\n</script>\n'
            '</body>\n</html>\n')


if __name__ == '__main__':
    dados = json.load(open('slots.json', encoding='utf-8'))
    canvas = {'artboards': [], 'launch': {'view': 'canvas'}}
    x = 0
    sufixo = '' if MODO == PADRAO_MODO else f'-{MODO}'
    for s in dados['pecas']:
        arq = f"{s['arq']}{sufixo}.dc.html"
        fmt = 'story' if s['layout'].endswith('story') else 'feed'
        html = pagina(LAYOUTS[s['layout']](s), props(fmt, s['veuTopo'], s['veuRodape']))
        conferir_divs(html, arq)
        open(arq, 'w', encoding='utf-8').write(html)
        f = FORMATOS[fmt]
        canvas['artboards'].append({'file': arq, 'x': x, 'y': 0, 'w': f['W'], 'h': f['H'],
                                    'title': s['titulo_canvas']})
        x += f['W'] + 140
        print(f"{arq}  ({fmt} {f['W']}x{f['H']})")
    # 🔴 So o modo padrao escreve o canvas.json. Rodar uma comparacao
    # (MODO=veu/campo/halocrema) NAO pode reapontar o canvas que o Ciro abre
    # para os artboards do experimento — foi o que aconteceu na 1a rodada.
    if MODO == PADRAO_MODO:
        json.dump(canvas, open('canvas.json', 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
    else:
        print(f'  (MODO={MODO}: canvas.json preservado)')
    if AVISOS:
        print('\nTITULO QUE NAO CABE:')
        print('\n'.join(AVISOS))
