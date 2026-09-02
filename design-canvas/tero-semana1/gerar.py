# -*- coding: utf-8 -*-
"""Gera as artes da SEMANA 1 do TERO (31/08 a 06/09/2026).

21 stories (1080x1920) + 2 capas de feed (1080x1350), no padrao DEFINIDO
pelo Ciro em 28/08 (design-canvas/tero-sexta-domingo/):

  - lockup Didot B06 Bold, caixa alta, DUAS vozes (ambar #EF7B4F em cima,
    creme #F8F2F0 embaixo), nivel 1 um passo MAIOR (80/76), TRACKING ZERO,
    entrelinha 0.91;
  - margens do story: 200 topo / 150 rodape / 96 laterais (calibragem dele);
  - feed sem faixa do Instagram: 120 topo / 110 rodape / 96 laterais;
  - apoio Montserrat 400 34px lh 1.18, max UMA palavra em ambar (#palavra);
  - servico com icone de LINHA ambar (traco 1.6), filete 76x2, CTA em ambar
    caixa natural, sempre um dos sete aprovados do DNA;
  - posicao VARIA por foto (topo/rodape, left/center/right); logo branca no
    lado OPOSTO ao bloco; veus intensos com plato ate 38%, calibrados por foto;
  - peca de avaliacao: lockup 58 + selo de estrelas + cartao real + CTA.

Armadilhas ja pagas: foto por <img src> (nunca url() no CSS); cada linha item
direto do flex; px absoluto em tudo; nome de arquivo sem acento.
"""
import base64, json, os, sys
from PIL import ImageFont

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _entrega import escrever_entrega, textos_de  # noqa: E402
from _halo import (halo as halo_bruto, conferir_divs, op,
                   ajustar_por_geometria, tinta_para_alvo)

AMBAR, CREME, FUNDO = '#EF7B4F', '#F8F2F0', '#130D0A'

# --------------------------------------------------------------------------
# VEU x HALO (01/09/2026)
# --------------------------------------------------------------------------
# MODO=veu  -> as duas bandas de gradiente do padrao v5 (760px em cima, 720
#              embaixo), com a opacidade calibrada a mao por peca no slots.json.
# MODO=halo -> mancha escura desfocada SO atras de cada bloco. Os dois caminhos
#              convivem para poderem ser comparados lado a lado; e a unica forma
#              de decidir por medicao em vez de por gosto.
MODO = os.environ.get('MODO', 'halo')

# A mancha e do MESMO marrom escuro do veu (#130D0A), nao do quase-preto do By
# Rock: trocar o mecanismo de leitura nao e licenca para trocar a paleta. O
# TERO constroi tudo sobre esse fundo quente, e preto puro esfria a peca.
COR_HALO = '19,13,10'

# 🔴 Raios calibrados PARA ESTE CLIENTE, nao herdados do By Rock (124-158px). A
# razao e geometrica: o blur e uma gaussiana de desvio `raio`, e a mancha so
# chega a opacidade cheia no miolo quando a caixa e maior que ~2x o raio nos
# dois eixos. Os blocos do TERO sao BAIXOS — o lockup de duas vozes mede ~150px
# de altura e o servico ~120px, contra os ~470px do bloco do By Rock (manchete
# + onda + apoio + fecho). Com raio 158 o eixo vertical nunca chega la e o
# centro do halo sai claro justamente onde a letra cai.
RAIOS_HALO = (74, 96)

# 🔴 A tinta NAO sai de uma faixa interpolada (o (0,62 - 0,97) do By Rock): ela
# sai de um ALVO de fundo. A conta e direta — o resultado de sobrepor a mancha
# e `luz*(1-a) + LUZ_DA_COR*a`, entao a tinta que poe o fundo no alvo e
# `(luz - alvo) / (luz - LUZ_DA_COR)`.
#
# A diferenca aparece nos extremos, e o TERO vive neles. Interpolando, uma foto
# noturna medida em 8 ou 17 de luminancia ainda pedia 0,66 de tinta — escurecer
# o que ja e quase preto, que e o defeito que o veu tinha (o SegFuncionamento
# levava veu 0,66 sobre uma faixa de 21,5). Com alvo, `luz <= alvo` devolve
# tinta ZERO: o halo simplesmente NAO EXISTE naquela peca e a foto passa
# intacta. Do outro lado, uma foto de 216 recebe o que precisar.
#
# Os alvos sao por PAPEL, e a ordem sai da fragilidade de cada um:
#   bloco  62 — Didot 76/80px em ambar e creme, com text-shadow preso ao glifo
#   pe     46 — Montserrat 28-32px em caixa alta, corpo pequeno
#   logo   40 — a marca e BRANCA CHAPADA (255 medido) e nao tem segundo tom
LUZ_DA_COR = 14.4  # luminancia do #130D0A
ALVOS = {'bloco': 62.0, 'pe': 46.0, 'logo': 40.0}

# Medicoes gravadas por `medir_halos.py` (a luz da foto no retangulo REAL de
# cada bloco). Sem elas o gerador emite os blocos com a mesma geometria e SEM
# halo — que e exatamente a passada 1 de que a sonda precisa.
MEDIDAS = {}
if os.path.exists('halos.json'):
    MEDIDAS = json.load(open('halos.json', encoding='utf-8'))
ATUAL = {'arq': None}
SEM_MEDIDA = []


def halo_para(chave, escala=1.0, inset_x=54, inset_y=40):
    """CSS do halo do bloco `chave` da peca em producao — '' quando nao ha medida.

    O raio sai da luz E DO TAMANHO do bloco; a tinta e corrigida pela atenuacao
    que sobrar. Sem as duas coisas o mesmo par (raio, tinta) entrega densidades
    muito diferentes num lockup de 234px e numa logo de 89px.
    """
    if MODO != 'halo':
        return ''
    dados = MEDIDAS.get(ATUAL['arq'], {})
    luz = dados.get(chave)
    if luz is None:
        return ''
    a = tinta_para_alvo(luz, ALVOS[chave] / max(0.5, escala), LUZ_DA_COR)
    if a <= 0:
        return ''  # a foto ja e escura o bastante — nao ha o que escurecer
    raio = int(op(luz, *RAIOS_HALO))
    rect = dados.get(f'_{chave}')
    if rect:
        a, raio = ajustar_por_geometria(a, raio, rect[2], rect[3], inset_x, inset_y)
    css = halo_bruto(luz, 1.0, cor=COR_HALO, tinta=(a, a), raios=(raio, raio))
    # A forca vira UMA alavanca no canvas (`opacity` compoe multiplicativamente
    # com o alfa medido). O padrao v5 expunha dois sliders de veu e o Ciro
    # lapida por ali; tirar o controle junto com o veu seria trocar o mecanismo
    # E fechar a porta do ajuste na mesma mexida.
    return css + ' opacity: var(--halo-forca, 1);'


def envolver_flex(itens, chave, alinha, inset_x=54, inset_y=40, escala=1.0):
    """Embrulha uma LISTA de linhas com o halo atras, SEM achatar o flex.

    🔴 Diferente de `_halo.envolver`, que poe todo o conteudo dentro de um unico
    <div>. Aqui cada linha continua sendo item direto de um flex column — e a
    armadilha 4.1 do manual do canvas (o editor faz layout por FLUXO; linha que
    nao e item de flex nao e selecionavel nem movivel). O `gap: 6px` repete o do
    container externo para o espacamento calibrado na v5 nao mudar.

    O wrapper e emitido MESMO SEM halo: e ele que a sonda de geometria mede, e
    as duas passadas precisam ter exatamente o mesmo layout.
    """
    marca = ''
    css = halo_para(chave, escala, inset_x, inset_y)
    if css:
        marca = (f'    <div class="halo" style="position: absolute; left: -{inset_x}px; '
                 f'right: -{inset_x}px; top: -{inset_y}px; bottom: -{inset_y}px; '
                 f'z-index: 0; pointer-events: none; {css}"></div>\n')
    # a classe `conteudo` existe para o MEDIDOR: com o veu bastava esconder todo
    # o texto e sobravam foto + veu, que sao o fundo. Com o halo a camada de
    # fundo mora DENTRO do bloco de texto — esconder o bloco levaria o halo
    # junto e a medida diria que nao ha contraste nenhum. Esconde-se
    # `.conteudo`, preserva-se `.halo`.
    filhos = '\n'.join(f'  <div class="conteudo" style="position: relative; z-index: 1;">'
                        f'\n{x}\n  </div>' for x in itens)
    return (f'    <div data-halo="{chave}" style="position: relative; width: fit-content; '
            f'display: flex; flex-direction: column; align-items: {AI[alinha]}; '
            f'gap: 6px;">\n{marca}{filhos}\n    </div>')

b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
F = {k: b64(f'{k}.woff') for k in ('Didot', 'Montserrat', 'MontserratSemi')}
F['MontserratLight'] = b64('MontserratLight.woff2')
face = lambda fam, k, w=400, fmt='woff': ("@font-face{font-family:'%s';src:url(data:font/%s;base64,%s) "
    "format('%s');font-weight:%d;font-style:normal;font-display:block}" % (fam, fmt, F[k], fmt, w))
FONTES = (face('Didot TERO', 'Didot', 700) + face('Montserrat', 'Montserrat')
          + face('Montserrat SemiBold', 'MontserratSemi', 600)
          + face('Montserrat Light', 'MontserratLight', 300, 'woff2'))

VEU_CSS = '''
    .veu-t { background: linear-gradient(to bottom,
      rgb(19 13 10 / var(--veu-topo)) 0%,
      rgb(19 13 10 / var(--veu-topo)) 38%,
      rgb(19 13 10 / calc(var(--veu-topo) * 0.55)) 66%,
      rgb(19 13 10 / 0) 100%); }
    .veu-b { background: linear-gradient(to top,
      rgb(19 13 10 / var(--veu-rodape)) 0%,
      rgb(19 13 10 / var(--veu-rodape)) 38%,
      rgb(19 13 10 / calc(var(--veu-rodape) * 0.55)) 66%,
      rgb(19 13 10 / 0) 100%); }'''


def ico(d):
    return ('<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="' + AMBAR +
            '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" '
            'style="flex:none">' + d + '</svg>')


RELOGIO = ico('<circle cx="12" cy="12" r="9"></circle><path d="M12 6.8v5.3l3.4 2"></path>')
PINO = ico('<path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z"></path>'
           '<circle cx="12" cy="10" r="2.6"></circle>')
ICONES = {'relogio': RELOGIO, 'pino': PINO}

ESTRELA = ('<svg width="38" height="38" viewBox="0 0 24 24" fill="' + AMBAR +
           '" style="flex:none"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 '
           '1.1-6.4L2.6 9.4l6.5-.9z"></path></svg>')


def destacar(txt):
    saida = []
    for p in txt.split(' '):
        if p.startswith('#'):
            saida.append(f'<span style="color: {AMBAR}">{p[1:]}</span>')
        else:
            saida.append(p)
    return ' '.join(saida)


AVISOS = []


def cabe(txt, tam, util):
    fonte = ImageFont.truetype('Didot-HTF-B06-Bold.ttf', tam)
    larg = round(fonte.getlength(txt.upper()))
    if larg > util:
        AVISOS.append(f'  "{txt}" mede ~{larg}px em {tam}px — passa de {util}px')
    return larg


TA = {'left': 'left', 'center': 'center', 'right': 'right'}
AI = {'left': 'flex-start', 'center': 'center', 'right': 'flex-end'}


def lockup(l1, l2, tam, alinha, util, misto=False, linha_unica=False):
    tam1 = round(tam * 80 / 76)
    if linha_unica:
        # duas palavras curtas ("Almoço Tero") ficam na MESMA linha,
        # ambar + creme lado a lado — pedido do Ciro em 31/08
        cabe(f'{l1} {l2}', tam1, util)
        return (f'    <div style="font-family: \'Didot TERO\', Georgia, serif; font-weight: 700; '
                f'font-size: {tam1}px; line-height: 0.95; letter-spacing: 0; '
                f'text-transform: uppercase; text-align: {TA[alinha]}; padding-top: 0; '
                f'text-shadow: 0 2px 18px rgb(19 13 10 / 0.55)">'
                f'<span style="color: {AMBAR}">{l1}</span> '
                f'<span style="color: {CREME}">{l2}</span></div>')
    cabe(l1, tam1, util)
    linha = lambda t, cor, tt: (
        f'    <div style="font-family: \'Didot TERO\', Georgia, serif; font-weight: 700; '
        f'font-size: {tt}px; line-height: 0.91; letter-spacing: 0; color: {cor}; '
        f'text-transform: uppercase; text-align: {TA[alinha]}; padding-top: 0; '
        f'text-shadow: 0 2px 18px rgb(19 13 10 / 0.55)">{t}</div>')
    if misto:
        # variacao aprovada em 31/08: voz 2 em Montserrat Light, caps finas e espacadas
        t2 = round(tam1 * 0.56)
        voz2 = (f'    <div style="font-family: \'Montserrat Light\', system-ui, sans-serif; '
                f'font-weight: 300; font-size: {t2}px; line-height: 1.15; letter-spacing: 0.3em; '
                f'color: {CREME}; text-transform: uppercase; text-align: {TA[alinha]}; '
                f'padding-top: 0; text-indent: 0.3em; '
                f'text-shadow: 0 2px 14px rgb(19 13 10 / 0.6)">{l2}</div>')
        return linha(l1, AMBAR, tam1) + '\n' + voz2
    cabe(l2, tam, util)
    return linha(l1, AMBAR, tam1) + '\n' + linha(l2, CREME, tam)


def apoio(txt, alinha):
    return (f'    <div style="font-family: \'Montserrat\', system-ui, sans-serif; '
            f'font-size: 30px; line-height: 1.3; color: {CREME}; text-align: {TA[alinha]}; '
            f'letter-spacing: 0.07em; max-width: 840px; margin-top: 8px; '
            f'text-shadow: 0 2px 14px rgb(19 13 10 / 0.6)">{destacar(txt)}</div>')


def filete():
    return f'    <div style="width: 76px; height: 2px; background: {AMBAR}; flex: none; margin-top: 6px;"></div>'


def linha_servico(icone, txt, peso=400, tam=31):
    if icone == 'pino' and tam == 31:
        tam = 28
    fam = 'Montserrat SemiBold' if peso == 600 else 'Montserrat'
    return ('    <div style="display: flex; align-items: center; gap: 16px; '
            f'font-family: \'{fam}\', system-ui, sans-serif; font-weight: {peso}; '
            f'font-size: {tam}px; line-height: 1.2; letter-spacing: 0.06em; color: {CREME}; '
            f'text-shadow: 0 2px 12px rgb(19 13 10 / 0.7)">{ICONES[icone]}'
            f'<span>{txt}</span></div>')


def cta(txt):
    return (f'    <div style="font-family: \'Montserrat\', system-ui, sans-serif; '
            f'font-size: 30px; line-height: 1.2; letter-spacing: 0.1em; color: {AMBAR}; '
            f'text-shadow: 0 2px 12px rgb(19 13 10 / 0.7)">{txt}</div>')


def selo_estrelas(txt):
    return ('    <div style="display: flex; align-items: center; gap: 12px;">'
            + ESTRELA * 5
            + f'<span style="font-family: \'Montserrat SemiBold\', system-ui, sans-serif; '
            f'font-weight: 600; font-size: 28px; letter-spacing: 0.16em; color: {CREME}; '
            f'text-transform: uppercase; margin-left: 10px; '
            f'text-shadow: 0 2px 12px rgb(19 13 10 / 0.7)">{txt}</span></div>')


def cartao(arq):
    """🔴 `position: relative; z-index: 1` NAO e enfeite — sem isso o halo do
    bloco de cima ESCURECE o cartao.

    O halo mora num wrapper `position: relative`, e elemento posicionado pinta
    ACIMA de irmao nao-posicionado no mesmo contexto de empilhamento, venha
    antes ou depois no DOM. O cartao e um <img> em fluxo: ficava por baixo da
    mancha, e o print da avaliacao — que e uma imagem opaca de interface —
    aparecia cinza. Com o veu isso nao existia: a camada era irma da moldura e
    a ordem do DOM resolvia. Vale para QUALQUER elemento opaco vizinho de um
    bloco com halo.
    """
    return (f'    <img src="./{arq}.png" alt="" style="position: relative; z-index: 1; '
            f'width: 888px; height: auto; align-self: center; border-radius: 22px; '
            f'margin-top: 10px; box-shadow: 0 24px 56px rgb(19 13 10 / 0.55);">')


ESPACADOR = '    <div style="flex: 1 1 auto; min-height: 40px;"></div>'


class Fmt:
    def __init__(self, w, h, pad_topo, pad_rodape, pad_h, veu_t, veu_b, logo_top, logo_bottom):
        self.w, self.h = w, h
        self.pad_topo, self.pad_rodape, self.pad_h = pad_topo, pad_rodape, pad_h
        self.util = w - 2 * pad_h
        self.veu_t, self.veu_b = veu_t, veu_b
        self.logo_top, self.logo_bottom = logo_top, logo_bottom


STORY = Fmt(1080, 1920, 100, 90, 96, 760, 720, 108, 98)
FEED = Fmt(1080, 1350, 120, 110, 96, 540, 500, 118, 116)


# 🔴 A logo do TERO e BRANCA CHAPADA (luminancia medida: 255 em todo pixel
# visivel) e o unico contraste que ela tem e o `drop-shadow`. Ela e o elemento
# mais fragil da peca — mais que o texto, que ao menos alterna ambar e creme.
# No By Rock a marca (vermelha com letra branca) ja sumiu sobre prato claro com
# escala 0,72; aqui a escala e 1,0, igual a do texto. Trocar o veu sem dar halo
# a marca a apagaria sobre parede clara e ceu — e o TERO tem foto de salao
# aberto e de calcada em quase toda semana.
LOGO_SOMBRA = 'filter: drop-shadow(0 2px 12px rgb(19 13 10 / 0.6));'
# Calibrado no DomFuncionamento, que e o pior caso da carteira do TERO: marca
# branca chapada sobre folhagem em contraluz com ceu no meio. Inset MAIOR que o
# do By Rock (34/30) porque com um inset curto a borda difusa da mancha comeca
# a comer a propria marca; escala acima de 1 porque a marca nao tem, como o
# texto, um segundo tom para alternar.
LOGO_INSET = (int(os.environ.get('LOGO_IX', '62')), int(os.environ.get('LOGO_IY', '56')))
LOGO_ESCALA = float(os.environ.get('LOGO_ESC', '1.0'))


def marca_solta(fmt, canto, larg=198):
    pos = {
        'base-dir': f'bottom: {fmt.logo_bottom}px; right: 88px;',
        'base-esq': f'bottom: {fmt.logo_bottom}px; left: 88px;',
        'topo-dir': f'top: {fmt.logo_top}px; right: 88px;',
        'topo-esq': f'top: {fmt.logo_top}px; left: 88px;',
        'topo-centro': f'top: {fmt.logo_top}px; left: 50%; transform: translateX(-50%);',
    }[canto]
    img = (f'<img class="conteudo" src="./logo-tero.png" alt="" style="position: relative; '
           f'z-index: 1; width: {larg}px; height: auto; display: block; opacity: 0.96; '
           f'{LOGO_SOMBRA}">')
    css = halo_para('logo', LOGO_ESCALA, *LOGO_INSET)
    if not css:
        return f'<div data-halo="logo" style="position: absolute; {pos}">{img}</div>'
    # inset menor que o do texto: a marca e um bloco pequeno e um inset largo
    # espalharia a mancha por muito mais foto do que ela precisa escurecer
    marca = (f'<div class="halo" style="position: absolute; left: -{LOGO_INSET[0]}px; '
             f'right: -{LOGO_INSET[0]}px; top: -{LOGO_INSET[1]}px; bottom: -{LOGO_INSET[1]}px; '
             f'z-index: 0; pointer-events: none; {css}"></div>')
    return (f'<div data-halo="logo" style="position: absolute; {pos} '
            f'width: {larg}px;"><div style="position: relative;">{marca}{img}</div></div>')


def marca_fluxo(alinha='center', antes_do_pe=False):
    margem = 'margin: 0 0 18px' if antes_do_pe else 'margin-top: 26px'
    img = ('<img class="conteudo" src="./logo-tero.png" alt="" style="position: relative; '
           f'z-index: 1; width: 190px; height: auto; display: block; opacity: 0.96; '
           f'{LOGO_SOMBRA}">')
    css = halo_para('logo', LOGO_ESCALA, *LOGO_INSET)
    marca = ((f'<div class="halo" style="position: absolute; left: -{LOGO_INSET[0]}px; '
              f'right: -{LOGO_INSET[0]}px; top: -{LOGO_INSET[1]}px; bottom: -{LOGO_INSET[1]}px; '
              f'z-index: 0; pointer-events: none; {css}"></div>') if css else '')
    return (f'    <div data-halo="logo" style="position: relative; width: fit-content; '
            f'align-self: {AI[alinha]}; {margem};">{marca}{img}</div>')


def moldura(fmt, foto, dentro, marca_html, alinha):
    solta = f'  {marca_html}\n' if marca_html else ''
    veus = ('' if MODO == 'halo' else
            (f'  <div class="veu-t" style="position: absolute; left: 0; top: 0; width: {fmt.w}px; '
             f'height: {fmt.veu_t}px; --veu-topo: {{{{veuTopo}}}};"></div>\n'
             f'  <div class="veu-b" style="position: absolute; left: 0; bottom: 0; width: {fmt.w}px; '
             f'height: {fmt.veu_b}px; --veu-rodape: {{{{veuRodape}}}};"></div>\n'))
    forca = ' --halo-forca: {{haloForca}};' if MODO == 'halo' else ''
    return (f'<div style="position: relative; width: {fmt.w}px; height: {fmt.h}px; overflow: hidden; '
            f'background: {FUNDO}; font-family: \'Montserrat\', system-ui, sans-serif;{forca}">\n'
            f'  <img src="./{foto}" alt="" style="position: absolute; left: 0; top: 0; '
            f'width: {fmt.w}px; height: {fmt.h}px; object-fit: cover;">\n'
            f'{veus}'
            f'{solta}'
            f'  <div style="position: absolute; left: 0; top: 0; width: {fmt.w}px; height: {fmt.h}px; '
            f'box-sizing: border-box; padding: {fmt.pad_topo}px {fmt.pad_h}px {fmt.pad_rodape}px; display: flex; '
            f'flex-direction: column; align-items: {AI[alinha]}; gap: 6px;">\n{dentro}\n  </div>\n</div>')


def bloco_e_pe(s, fmt):
    """Devolve as LISTAS de linhas — o embrulho com halo e de quem monta.

    Bloco e pe sao halos SEPARADOS de proposito: entre eles ha o ESPACADOR, que
    e o respiro grande da peca. Um halo unico cobrindo os dois seria a faixa
    inteira de novo, com borda difusa — o veu por outro nome.
    """
    al = s.get('alinha', 'left')
    bloco = [lockup(s['titulo'][0], s['titulo'][1], s.get('tamTitulo', 76), al, fmt.util,
                    misto=bool(s.get('misto')), linha_unica=bool(s.get('linhaUnica')))]
    if s.get('apoio'):
        bloco.append(apoio(s['apoio'], al))
    pe = [filete()]
    for l in s.get('servico', []):
        pe.append(linha_servico(l['icone'], l['txt'], l.get('peso', 400)))
    pe.append(cta(s['cta']))
    return al, bloco, pe


def L_peca(s, fmt=STORY):
    al, bloco, pe = bloco_e_pe(s, fmt)
    # O pe leva um pouco mais de tinta que o bloco: e o menor corpo de texto da
    # peca (servico ~31px contra o lockup de 76/80) e cai no rodape, onde a foto
    # do TERO costuma trazer o prato claro ou a toalha.
    b = lambda: envolver_flex(bloco, 'bloco', al)
    p = lambda: envolver_flex(pe, 'pe', al)
    if s.get('pos', 'topo') == 'rodape':
        corpo = [ESPACADOR, b(), p()]
        marca = marca_solta(fmt, s.get('marca') or {'left': 'topo-dir', 'right': 'topo-esq',
                                                    'center': 'topo-centro'}[al])
        return moldura(fmt, s['foto'], '\n'.join(corpo), marca, al)
    if s.get('marca') == 'rodape-fluxo':
        corpo = [b(), ESPACADOR, marca_fluxo(al, antes_do_pe=True), p()]
        return moldura(fmt, s['foto'], '\n'.join(corpo), '', al)
    corpo = [b(), ESPACADOR, p()]
    if al == 'center':
        corpo.append(marca_fluxo())
        return moldura(fmt, s['foto'], '\n'.join(corpo), '', al)
    marca = marca_solta(fmt, s.get('marca') or ('base-dir' if al == 'left' else 'base-esq'))
    return moldura(fmt, s['foto'], '\n'.join(corpo), marca, al)


def L_capa(s):
    """Capa de carrossel de feed, 1080x1350 — mesmo vocabulario, margens de feed."""
    return L_peca(s, FEED)


def L_avaliacao(s):
    """O CARTAO fica FORA do halo: ele e uma imagem opaca com sombra propria.

    Halo atras dele nao daria leitura nenhuma (nada transparece) e ainda
    esticaria a mancha para os 888px de largura dele, cobrindo quase o quadro
    inteiro — o veu de volta, com borda difusa.
    """
    topo = envolver_flex([lockup(s['titulo'][0], s['titulo'][1], 58, 'left', STORY.util),
                          '    <div style="height: 4px"></div>',
                          selo_estrelas(s['selo'])], 'bloco', 'left')
    pe = envolver_flex([filete(), cta(s['cta'])], 'pe', 'left')
    p = [topo, cartao(s['cartao']), ESPACADOR, pe]
    return moldura(STORY, s['foto'], '\n'.join(p), marca_solta(STORY, 'base-dir'), 'left')


LAYOUTS = {'peca': L_peca, 'capa': L_capa, 'avaliacao': L_avaliacao}

def _linha_didot(txt, tam):
    return (f'    <div style="font-family: \'Didot TERO\', Georgia, serif; font-weight: 700; '
            f'font-size: {tam}px; line-height: 1.0; letter-spacing: 0.01em; color: {AMBAR}; '
            f'text-transform: uppercase; text-align: center; '
            f'text-shadow: 0 2px 18px rgb(19 13 10 / 0.55)">{txt}</div>')


def _linha_mont(txt, tam, cor, peso=300, track=0.16):
    fam = ('Montserrat Light' if peso == 300 else
           ('Montserrat SemiBold' if peso == 600 else 'Montserrat'))
    return (f'    <div style="font-family: \'{fam}\', system-ui, sans-serif; font-weight: {peso}; '
            f'font-size: {tam}px; line-height: 1.25; letter-spacing: {track}em; color: {cor}; '
            f'text-transform: uppercase; text-align: center; text-indent: {track}em; '
            f'text-shadow: 0 2px 14px rgb(19 13 10 / 0.6)">{txt}</div>')


def _servico_editorial(l):
    cor = AMBAR if l.get('cor') == 'ambar' else CREME
    peso = l.get('peso', 600)
    tam = l.get('tam', 32)
    if l.get('icone'):
        return ('    <div style="display: flex; align-items: center; justify-content: center; gap: 14px; '
                f'font-family: \'Montserrat SemiBold\', system-ui, sans-serif; font-weight: 600; '
                f'font-size: {tam}px; line-height: 1.3; letter-spacing: 0.06em; color: {cor}; '
                f'text-shadow: 0 2px 12px rgb(19 13 10 / 0.7)">{ICONES[l["icone"]]}'
                f'<span>{l["txt"]}</span></div>')
    return _linha_mont(l['txt'], tam, cor, peso, l.get('track', 0.08))


def L_editorial(s):
    """Padrao das referencias do designer (31/08): logo topo-centro, bloco central."""
    fmt = STORY
    bloco = []
    if s.get('kicker'):
        bloco.append(_linha_mont(s['kicker'], s.get('tamKicker', 38), CREME, 300, 0.18))

    bloco.append(_linha_didot(s['tituloDidot'], s.get('tamDidot', 84)))
    if s.get('sub'):
        bloco.append(_linha_mont(s['sub'], s.get('tamSub', 46), CREME, 300, 0.18))
    if s.get('filete'):
        bloco.append('    <div style="width: 96px; height: 2px; background: ' + AMBAR +
                     '; flex: none; align-self: center; margin-top: 22px;"></div>')
    pe = []
    for l in s.get('servico', []):
        pe.append('    <div style="height: 12px"></div>')
        pe.append(_servico_editorial(l))
    b = envolver_flex(bloco, 'bloco', 'center')
    # `pe` vazio nao vira wrapper: um bloco sem conteudo tem altura zero e o
    # halo dele viraria um disco solto no rodape, escurecendo foto para nada.
    p = [envolver_flex(pe, 'pe', 'center')] if pe else []
    if s.get('pos', 'rodape') == 'rodape':
        corpo = [ESPACADOR, b] + p
    else:
        # bloco no topo abre ABAIXO da logo-cabecalho; servico desce ao rodape
        respiro_logo = '    <div style="height: 210px; flex: none;"></div>'
        corpo = [respiro_logo, b, ESPACADOR] + p
    marca = marca_solta(fmt, 'topo-centro', larg=s.get('tamLogo', 208))
    return moldura(fmt, s['foto'], '\n'.join(corpo), marca, 'center')


LAYOUTS['editorial'] = L_editorial


PROPS_VEU = ('"veuTopo":{"editor":"range","default":%s,"min":0.05,"max":0.97,"step":0.02,'
            '"unit":"","section":"Ajustes"},'
            '"veuRodape":{"editor":"range","default":%s,"min":0.05,"max":0.97,"step":0.02,'
            '"unit":"","section":"Ajustes"},')
# UMA alavanca no lugar das duas: com o halo a densidade sai da MEDICAO da foto
# sob cada bloco, entao o que sobra para a mao e o "mais/menos" geral.
PROPS_HALO = ('"haloForca":{"editor":"range","default":1,"min":0,"max":1.6,"step":0.05,'
              '"unit":"","section":"Ajustes"},')

LOGICA_VEU = """class Component extends DCLogic {
  renderVals() {
    return {
      veuTopo: Number(this.props.veuTopo ?? 0.50),
      veuRodape: Number(this.props.veuRodape ?? 0.74),
    };
  }
}"""
LOGICA_HALO = """class Component extends DCLogic {
  renderVals() {
    return { haloForca: Number(this.props.haloForca ?? 1) };
  }
}"""


def montar_props(veu_topo, veu_rodape, w, h):
    dentro = (PROPS_HALO if MODO == 'halo' else PROPS_VEU % (veu_topo, veu_rodape))
    return '{%s"$preview":{"width":%d,"height":%d}}' % (dentro, w, h)


def pagina(corpo, props):
    return ('<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n'
            '  <script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            f'  <style>{FONTES}{"" if MODO == "halo" else VEU_CSS}\n'
            f'    body {{ margin: 0; background: {FUNDO}; }}\n'
            f'    a {{ color: {AMBAR}; }}\n    a:hover {{ color: #d96a41; }}\n  </style>\n</helmet>\n'
            f'{corpo}\n</x-dc>\n<script data-dc-script data-props=\'{props}\'>\n'
            f'{LOGICA_HALO if MODO == "halo" else LOGICA_VEU}\n</script>\n'
            '</body>\n</html>\n')


if __name__ == '__main__':
    dados = json.load(open('slots.json', encoding='utf-8'))
    canvas = {'artboards': [], 'launch': {'view': 'canvas'}}
    mapa = []
    entrega = []
    i = -1
    for s in dados['pecas']:
        arq = f"{s['arq']}.dc.html"
        fmt = FEED if s['layout'] == 'capa' else STORY
        ATUAL['arq'] = arq
        if MODO == 'halo' and arq not in MEDIDAS:
            # sem medida o halo simplesmente nao e emitido, e a peca sai SEM
            # mecanismo de leitura nenhum — foto crua com texto por cima. Isso
            # nao pode acontecer em silencio: rode `medir.py` depois de mexer
            # em slots.json.
            SEM_MEDIDA.append(arq)
        props = montar_props(s['veuTopo'], s['veuRodape'], fmt.w, fmt.h)
        html = pagina(LAYOUTS[s['layout']](s), props)
        # 🔴 HTML desbalanceado NAO da erro: o parser fecha as tags sozinho e
        # aninha o que vem depois. O halo multiplicou os <div> da peca (wrapper
        # + camada + um por linha), que e exatamente a classe de defeito que
        # essa conferencia pega.
        conferir_divs(html, arq)
        open(arq, 'w', encoding='utf-8').write(html)
        if s.get('fora'):
            # peca fora da leva (ex.: capa-arte de carrossel, que desde 30/08
            # so entra com pedido explicito do Ciro) — o arquivo existe, mas
            # nao vai para o canvas nem para o mapa
            continue
        i += 1
        canvas['artboards'].append({
            'file': arq, 'x': (i % 5) * (1080 + 140), 'y': (i // 5) * (1920 + 220),
            'w': fmt.w, 'h': fmt.h, 'title': f"{s['dia']} · {s['hora']} · {s['tema']}",
        })
        mapa.append({'artboard': arq, 'dia': s['dia'], 'hora': s['hora'],
                     'tema': s['tema'], 'foto': s['foto'],
                     'pos': s.get('pos', 'topo'), 'alinha': s.get('alinha', 'left')})
        # Capa de carrossel é foto pura: `textos: []` e afirmacao, nao omissao.
        entrega.append({'arquivo': f"render/{s['arq']}.png",
                        'textos': [] if s['layout'] == 'capa' else textos_de(s, ['selo', 'titulo', 'apoio', 'servico', 'cta']),
                        'tema': s['tema']})
    json.dump(canvas, open('canvas.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(mapa, open('mapa.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    escrever_entrega(entrega)
    print(f"{len(mapa)} artboards  ({MODO})")
    if SEM_MEDIDA:
        print('\n🔴 SEM MEDICAO DE HALO (sairam sem mecanismo de leitura): '
              + ', '.join(SEM_MEDIDA) + '\n   rode: python3 medir.py')
    if AVISOS:
        print('\nTITULO QUE NAO CABE:')
        print('\n'.join(AVISOS))
