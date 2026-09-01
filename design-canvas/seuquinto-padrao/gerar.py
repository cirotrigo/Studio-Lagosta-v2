# -*- coding: utf-8 -*-
"""Gera os 2 artboards-base do PADRÃO Seu Quinto (projeto 4).

O vocabulário visual sai do manual do designer (brand-manual.png, prioridade
absoluta), das 10 artes publicadas de story lidas uma a uma em 29/08 e do DNA:

  - manchete Bonoco 2023 em CAIXA ALTA com SOMBRA EXTRUDE deslocada 5px
    baixo-direita, SEM blur — a assinatura da casa. Pares medidos nas peças
    publicadas: branco+vermelho, branco+verde, branco+amarelo (e amarelo+
    vermelho no manual). Corpo PEQUENO: cap ~62-66px por linha (~3,3% da
    altura do story), lockup de 2 linhas ~150px (~8%);
  - pré-título/CTA em The Kathy (script manuscrita), caixa natural, branco,
    NUNCA em caixa alta e nunca com dado prático;
  - serviço em Bonoco menor: linha de horário maior que a de endereço,
    formato fixo "DIA, DAS XXH ÀS XXH30" + "RUA CELSO CALMON, 80 - PRAIA
    DO CANTO";
  - ícone Q em círculo ~140px (~13% da largura) — topo centro OU canto do
    rodapé, na diagonal oposta do bloco de texto quando lateral;
  - LEITURA POR HALO (01/09/2026, ver abaixo) — antes era véu de faixa;
  - paleta estrita: #ED1C24 / #008C44 / #FAA61A / #0E0B08 / #FFFFFF.

Armadilhas já pagas (Quintal/By Rock/TERO): foto por <img src> (url() no
CSS NÃO resolve), cada linha item direto do flex, px absoluto em cada bloco
(nada herda do pai), nome de arquivo sem acento.

DO VÉU PARA O HALO (01/09/2026)
-------------------------------
O véu era um gradiente sobre a faixa INTEIRA do topo (900px) e do rodapé
(760px): 1660 dos 1920px do story escurecidos para dar contraste a três
blocos que somam ~600px. O halo (`../_halo.py`) escurece só a área de cada
bloco e desmancha nas bordas, com `filter: blur()` na PRÓPRIA caixa — nunca
`backdrop-filter`, que desfocaria a fotografia.

Três decisões desta marca, diferentes do By Rock (medidas, não herdadas):

1. 🔴 A mancha é #0E0B08 (14,11,8), o dark da casa — não o 17,17,17 neutro.
   O §7 do PADRAO proíbe "faixa preta chapada" e "véu que apaga a luz âmbar
   da casa"; o véu já usava esse escuro e o halo herda a mesma regra. Sobre
   uma foto de boteco (madeira, chopp, estufa quente) o quase-preto neutro
   esfria justamente onde ela é mais quente.

2. 🔴 A manchete desta marca NÃO tem sombra de leitura presa ao glifo — só o
   extrude duro e COLORIDO de 5px, que é a assinatura e não dá contraste no
   lado de cima-esquerda da letra. No By Rock quem divide a carga com o véu é
   `SOMBRA_MANCHETE` (glow escuro difuso). Aqui o halo carrega sozinho, então
   ele precisa de mais tinta que lá — daí `TINTA_TITULO`.

3. 🔴 Os blocos daqui são CURTOS e LARGOS (o lockup tem 3 linhas, ~240px de
   altura contra ~600 do By Rock). Como o blur é uma gaussiana de desvio
   `raio`, uma caixa mais baixa que ~2x o raio nunca atinge a tinta cheia no
   miolo: com o raio do By Rock (124-158) o centro do lockup ficava em ~69%
   da opacidade nominal. O raio daqui é menor (86-112) e a tinta, maior.

A calibragem é MEDIDA, não estimada: o gerador roda em duas passadas —
escreve os artboards, lê o rect REAL de cada bloco com uma sonda de
`getBoundingClientRect` no Chrome, mede a luz da foto exatamente ali (com o
`object-fit: cover` simulado) e reescreve com cada halo calibrado pelo seu
próprio pedaço de foto. É a regra 3 do `_halo.py` levada a sério: no rodapé
da Capa o serviço pousa a 171 de luz e o Q, na mesma altura, a 140 — 31
pontos de diferença que a média da faixa (163) esconderia.
"""
import base64, json, os, re, subprocess, sys

from PIL import Image, ImageFont, ImageStat

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(BASE))
from _halo import halo, envolver_linhas, conferir_divs  # noqa: E402

VERMELHO, VERDE, AMARELO = '#ED1C24', '#008C44', '#FAA61A'
DARK, BRANCO = '#0E0B08', '#FFFFFF'

# MODO=veu reemite o mecanismo antigo, para comparar lado a lado.
MODO = os.environ.get('MODO', 'halo')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# A mancha é o dark da MARCA (§7 do PADRAO), não o quase-preto neutro.
HALO_COR = '14,11,8'
# Faixas do interpolador desta marca. Raio menor que o do By Rock (124-158)
# porque os blocos são baixos — ver nota 3 do cabeçalho. A tinta sobe junto,
# como manda o `_halo.py`: raio e tinta andam em par.
# 🔴 Medido em 01/09/2026, com a régua de `medir.py` no rect REAL do lockup:
# a calibragem do By Rock (0.62-0.97, raio 124-158) entrega p98 141 no Main e
# 148 na Capa — dentro do teto de 150 e sem folga nenhuma, numa marca cuja
# manchete não tem sombra presa ao glifo. Com a daqui: 113 e 124.
TINTA_TITULO, RAIO_TITULO = (0.72, 0.99), (86, 112)
TINTA_SERVICO, RAIO_SERVICO = (0.70, 0.97), (78, 100)
TINTA_MARCA, RAIO_MARCA = (0.44, 0.72), (60, 82)

# 🔴 A MARCA DESTA CASA NÃO LEVA HALO — e isso contradiz a regra 2 do
# `_halo.py` de propósito. Lá a marca é um wordmark PNG de letra fina sobre
# fundo transparente: sem véu ele some, e a mancha é o único contraste que
# tem. Aqui a marca na peça é o ícone Q, um DISCO OPACO E COLORIDO, que traz a
# própria figura-fundo — atrás dele a mancha não assenta nada, só suja.
#
# Medido em 01/09/2026 nos dois piores casos, com o disco contra o anel de
# 60px em volta (o Q amarelo da Capa sobre manga rosa e guardanapo; o Q do
# Main sobre o vidro âmbar da estufa):
#
#     | tratamento | Δluz Capa | luz da foto no anel | Δcor Capa |
#     |------------|----------:|--------------------:|----------:|
#     | halo       |     +32,7 |               116,8 |      +128 |
#     | sombra     |     +18,8 |               130,8 |      +128 |
#
# O halo compra separação ESCURECENDO a foto (12% de luz no anel) e não
# acrescenta nada no canal que de fato separa um disco colorido: a cor, que
# fica em +128 nos dois. Quem protege a marca aqui é a ESCOLHA DA VARIANTE
# (§4 do PADRAO, "escolha por contraste com a foto"), não uma nuvem escura.
#
# MARCA=halo reemite a mancha, para comparar lado a lado.
MARCA = os.environ.get('MARCA', 'sombra')

b64 = lambda p: base64.b64encode(open(os.path.join(BASE, p), 'rb').read()).decode()
FONTES = (
    "@font-face{font-family:'Bonoco';src:url(data:font/woff;base64,%s) format('woff');"
    "font-weight:400;font-style:normal;font-display:block}"
    "@font-face{font-family:'The Kathy';src:url(data:font/woff;base64,%s) format('woff');"
    "font-weight:400;font-style:normal;font-display:block}"
) % (b64('fonts/Bonoco.woff'), b64('fonts/TheKathy.woff'))

# platô denso até 38% da faixa, decai até 0 — fórmula vive SÓ aqui (4.3).
# Mantido para MODO=veu; em MODO=halo nenhum artboard usa estas classes.
VEU_CSS = '''
    .veu-t { background: linear-gradient(to bottom,
      rgb(14 11 8 / var(--veu-topo)) 0%,
      rgb(14 11 8 / var(--veu-topo)) 38%,
      rgb(14 11 8 / calc(var(--veu-topo) * 0.55)) 66%,
      rgb(14 11 8 / 0) 100%); }
    .veu-b { background: linear-gradient(to top,
      rgb(14 11 8 / var(--veu-rodape)) 0%,
      rgb(14 11 8 / var(--veu-rodape)) 38%,
      rgb(14 11 8 / calc(var(--veu-rodape) * 0.55)) 66%,
      rgb(14 11 8 / 0) 100%); }'''

AVISOS = []


# --------------------------------------------------------------------------
# Medição: a luz da foto COMO ELA APARECE na peça
# --------------------------------------------------------------------------
_CACHE_FOTO = {}


def _recorte(foto, W, H):
    """Simula o `object-fit: cover` do artboard — o que o leitor de fato vê."""
    chave = (foto, W, H)
    if chave in _CACHE_FOTO:
        return _CACHE_FOTO[chave]
    caminho = os.path.join(BASE, 'fotos', foto)
    if not os.path.exists(caminho):
        caminho = os.path.join(BASE, foto)
    im = Image.open(caminho).convert('RGB')
    e = max(W / im.width, H / im.height)
    im = im.resize((max(1, round(im.width * e)), max(1, round(im.height * e))), Image.LANCZOS)
    ex, ey = (im.width - W) // 2, (im.height - H) // 2
    _CACHE_FOTO[chave] = im.crop((ex, ey, ex + W, ey + H))
    return _CACHE_FOTO[chave]


def luz_em(foto, W, H, rect, folga=40):
    """Luz média do pedaço de foto onde ESTE bloco pousa.

    🔴 Regra 3 do `_halo.py`: calibrar pela média da faixa erra dos dois lados.
    Medido aqui: no rodapé da Capa o serviço cai sobre prato e cardápio brancos
    (luz 171) e o ícone Q, na MESMA altura, sobre a madeira da mesa (140). A
    faixa inteira responde 163 — escura demais para um, clara demais para o
    outro. A `folga` estende o retângulo até onde a mancha desfocada vai pesar.
    """
    x0, y0 = max(0, rect['x'] - folga), max(0, rect['y'] - folga)
    x1, y1 = min(W, rect['x'] + rect['w'] + folga), min(H, rect['y'] + rect['h'] + folga)
    if x1 <= x0 or y1 <= y0:
        return 130.0
    g = _recorte(foto, W, H).crop((x0, y0, x1, y1)).convert('L')
    return ImageStat.Stat(g).mean[0]


SONDA = """
<script>window.addEventListener('load', function () {
  var out = {};
  document.querySelectorAll('[data-halo]').forEach(function (el) {
    var r = el.getBoundingClientRect();
    out[el.getAttribute('data-halo')] = {x: Math.round(r.x), y: Math.round(r.y),
                                         w: Math.round(r.width), h: Math.round(r.height)};
  });
  document.title = 'SONDA' + JSON.stringify(out);
});</script>
"""


def sondar(dc):
    """Rect REAL de cada bloco, lido do Chrome.

    O halo é `position: absolute` e não entra no fluxo, então a geometria da
    passada 1 (sem halo) é IDÊNTICA à da passada 2 — medir antes é legítimo.
    """
    import render as R
    html = R.achatar(dc).replace('</body>', SONDA + '</body>')
    w, h = R.tamanho_do_artboard(html)
    tmp = dc.replace('.dc.html', '.__sonda.html')          # ao LADO do .dc.html (4.9)
    open(tmp, 'w', encoding='utf-8').write(html)
    try:
        r = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--dump-dom',
                            '--virtual-time-budget=6000', f'--window-size={w},{h}',
                            f'file://{os.path.abspath(tmp)}'], capture_output=True, text=True)
    finally:
        os.remove(tmp)
    m = re.search(r'SONDA(\{.*?\})</title>', r.stdout, re.S)
    if not m:
        raise SystemExit(f'{dc}: a sonda de geometria não devolveu nada — '
                         'sem os rects reais o halo sairia calibrado no chute')
    return json.loads(m.group(1))


# --------------------------------------------------------------------------
# Tipografia
# --------------------------------------------------------------------------
def cabe(txt, tam, util):
    """Largura da manchete Bonoco (ls -1px) contra a área útil."""
    fonte = ImageFont.truetype(os.path.join(BASE, 'fonts/Bonoco2023.otf'), tam)
    larg = round(fonte.getlength(txt.upper()) - max(0, len(txt) - 1))
    if larg > util:
        AVISOS.append(f'  "{txt}" mede ~{larg}px em {tam}px — passa de {util}px')
    return larg


def script(txt, tam, alinha='center'):
    """Pré-título ou CTA em The Kathy: caixa natural, branco, sombra suave."""
    return (f'<div style="font-family: \'The Kathy\', cursive; font-size: {tam}px; '
            f'line-height: 1.1; color: {BRANCO}; text-align: {alinha}; '
            f'text-shadow: 0 2px 12px rgb(14 11 8 / 0.65);">{txt}</div>')


def manchete(linhas, tam, extrude, util, alinha='center'):
    """Bonoco caps com extrude 5px baixo-direita SEM blur — cada linha um item."""
    out = []
    for l in linhas:
        cabe(l, tam, util)
        out.append(
            f'<div style="font-family: \'Bonoco\', \'Arial Black\', sans-serif; '
            f'font-size: {tam}px; line-height: 0.97; letter-spacing: -1px; '
            f'color: {BRANCO}; text-transform: uppercase; text-align: {alinha}; '
            f'text-shadow: 5px 5px 0 {extrude};">{l}</div>')
    return out


def servico(txt, tam, cor=BRANCO, alinha='center'):
    """Linha de serviço em Bonoco menor, extrude discreto escuro de 3px."""
    return (f'<div style="font-family: \'Bonoco\', \'Arial Black\', sans-serif; '
            f'font-size: {tam}px; line-height: 1.16; letter-spacing: 0; '
            f'color: {cor}; text-transform: uppercase; text-align: {alinha}; '
            f'text-shadow: 3px 3px 0 rgb(14 11 8 / 0.55);">{txt}</div>')


SOMBRA_MARCA = {
    # o PADRAO §4 prescreve esta: suave, nunca extrude
    'halo':    'drop-shadow(0 4px 14px rgb(14 11 8 / 0.45))',
    # sem mancha atrás, a sombra do próprio disco assenta a marca na foto:
    # mesma direção e mesma cor, um pouco mais de alcance e de tinta
    'sombra':  'drop-shadow(0 6px 22px rgb(14 11 8 / 0.62)) '
               'drop-shadow(0 2px 6px rgb(14 11 8 / 0.45))',
}


def icone(arq, tam):
    return (f'<img src="./{arq}" alt="" style="width: {tam}px; height: {tam}px; '
            f'display: block; filter: {SOMBRA_MARCA[MARCA]};">')


ESPACADOR = '    <div style="flex: 1 1 auto; min-height: 40px;"></div>'


# --------------------------------------------------------------------------
# Blocos com halo
# --------------------------------------------------------------------------
def bloco(nome, linhas, luzes, papel, alinha='center', gap=14, extra='',
          inset=(54, 40), escala=1.0):
    """Um grupo de linhas com o seu halo atrás, calibrado pela luz medida ali.

    Na 1a passada `luzes` vem vazio e sai o mesmo HTML sem a mancha — é o que
    a sonda mede. Na 2a passada a mancha entra com o número da foto real.
    """
    tinta, raios = {'titulo': (TINTA_TITULO, RAIO_TITULO),
                    'servico': (TINTA_SERVICO, RAIO_SERVICO),
                    'marca': (TINTA_MARCA, RAIO_MARCA)}[papel]
    css = ''
    if papel == 'marca' and MARCA == 'sombra':
        return '    ' + envolver_linhas(linhas, '', gap=gap, alinha=alinha,
                                        extra=extra, attrs=f'data-halo="{nome}"')
    if MODO == 'halo' and nome in luzes:
        css = halo(luzes[nome], escala, cor=HALO_COR, tinta=tinta, raios=raios)
        # o slider do canvas multiplica a mancha inteira; a FÓRMULA continua
        # num lugar só (armadilha 4.3) — o hole carrega um número, não regra.
        css += ' opacity: {{halo}};'
    return '    ' + envolver_linhas(linhas, css, inset_x=inset[0], inset_y=inset[1],
                                    alinha=alinha, gap=gap, extra=extra,
                                    attrs=f'data-halo="{nome}"')


def q_solto(arq, tam, right, bottom, luzes, escala=0.9):
    """O ícone Q no canto, com o próprio halo.

    🔴 Regra 2 do `_halo.py`: TODO elemento que dependia do véu precisa do seu
    halo. O Q vivia dentro do `.veu-b`; sem véu ele fica sozinho com um
    drop-shadow de 14px de raio, que não segura um disco vermelho sobre a
    madeira clara da mesa. Menos tinta que o texto (é disco cheio, não letra),
    mas não zero.
    """
    css = ''
    if MODO == 'halo' and MARCA == 'halo' and 'marca' in luzes:
        css = halo(luzes['marca'], escala, cor=HALO_COR,
                   tinta=TINTA_MARCA, raios=RAIO_MARCA) + ' opacity: {{halo}};'
    corpo = envolver_linhas([icone(arq, tam)], css, inset_x=26, inset_y=26,
                            gap=0, attrs='data-halo="marca"')
    return (f'  <div class="solto" style="position: absolute; right: {right}px; '
            f'bottom: {bottom}px;">{corpo}</div>\n')


def moldura(w, h, foto, veu_topo_h, veu_rodape_h, pad, dentro, solto=''):
    pt, pr, pb, pl = pad
    veus = ''
    if MODO == 'veu':
        veus = (f'  <div class="veu-t" style="position: absolute; left: 0; top: 0; width: {w}px; '
                f'height: {veu_topo_h}px; --veu-topo: {{{{veuTopo}}}};"></div>\n'
                f'  <div class="veu-b" style="position: absolute; left: 0; bottom: 0; width: {w}px; '
                f'height: {veu_rodape_h}px; --veu-rodape: {{{{veuRodape}}}};"></div>\n')
    return (f'<div style="position: relative; width: {w}px; height: {h}px; overflow: hidden; '
            f'background: {DARK}; font-family: \'Bonoco\', sans-serif;">\n'
            f'  <img src="./{foto}" alt="" style="position: absolute; left: 0; top: 0; '
            f'width: {w}px; height: {h}px; object-fit: cover;">\n'
            f'{veus}{solto}'
            f'  <div class="conteudo" style="position: absolute; left: 0; top: 0; width: {w}px; height: {h}px; '
            f'box-sizing: border-box; padding: {pt}px {pr}px {pb}px {pl}px; display: flex; '
            f'flex-direction: column; align-items: center; gap: 14px;">\n{dentro}\n  </div>\n</div>')


# --------------------------------------------------------------------------
# Os dois artboards
# --------------------------------------------------------------------------
def story_funcionamento(luzes):
    """STORY 1080x1920 — funcionamento 9h (segunda). Layout A do padrão:
    Q no topo centro, script + manchete, serviço e CTA no rodapé."""
    util = 1080 - 2 * 88
    corpo = [
        bloco('marca', [icone('q-verde.png', 120)], luzes, 'marca',
              gap=0, inset=(24, 24), extra=' flex: none;', escala=0.9),
        bloco('titulo',
              [script('Hoje tem resenha!', 60)]
              + manchete(['SEG COMEÇA', 'COM GOSTO'], 76, VERMELHO, util),
              luzes, 'titulo', gap=14, inset=(58, 40)),
        ESPACADOR,
        bloco('servico',
              [servico('SEGUNDA, DAS 16H ÀS 23H30', 52),
               servico('RUA CELSO CALMON, 80 - PRAIA DO CANTO', 40),
               script('Venha pro boteco', 54)],
              luzes, 'servico', gap=14, inset=(56, 38), escala=1.05),
    ]
    return moldura(1080, 1920, 'estufa.jpg', 900, 760, (200, 88, 180, 88), '\n'.join(corpo))


def capa_feijoada(luzes):
    """FEED 1080x1350 — capa de carrossel de sábado (feijoada + samba).
    Copy da manchete é a peça PUBLICADA de 29/08 (verbatim, extrude verde).
    Serviço à esquerda, Q amarelo na diagonal oposta."""
    util = 1080 - 2 * 88
    corpo = [
        bloco('titulo',
              [script('Hoje tem aquela...', 60)]
              + manchete(['FEIJOADA COM SAMBA', 'NO SEU QUINTO'], 72, VERDE, util),
              luzes, 'titulo', gap=14, inset=(58, 40)),
        ESPACADOR,
        bloco('servico',
              [servico('SÁBADO, DAS 11H ÀS 23H30', 46, BRANCO, 'left'),
               servico('SAMBA DO CANTO, DAS 12H ÀS 16H', 38, AMARELO, 'left')],
              luzes, 'servico', alinha='flex-start', gap=10,
              inset=(50, 36), extra=' align-self: flex-start;', escala=1.05),
    ]
    solto = q_solto('q-amarelo.png', 130, 88, 88, luzes)
    return moldura(1080, 1350, 'feijoada.jpg', 620, 440, (96, 88, 88, 88),
                   '\n'.join(corpo), solto)


# --------------------------------------------------------------------------
# Página
# --------------------------------------------------------------------------
def props(veu_topo, veu_rodape, w, h):
    if MODO == 'halo':
        # o véu tinha dois sliders (topo e rodapé) porque era duas camadas de
        # faixa; o halo tem um por bloco e cada um já nasce calibrado pela foto
        # — o que sobra para a mão é a INTENSIDADE geral.
        return ('{"halo":{"editor":"range","default":1,"min":0.4,"max":1.4,"step":0.05,'
                '"unit":"","section":"Ajustes"},'
                '"$preview":{"width":%d,"height":%d}}' % (w, h))
    return ('{"veuTopo":{"editor":"range","default":%s,"min":0.05,"max":0.97,"step":0.02,'
            '"unit":"","section":"Ajustes"},'
            '"veuRodape":{"editor":"range","default":%s,"min":0.05,"max":0.97,"step":0.02,'
            '"unit":"","section":"Ajustes"},'
            '"$preview":{"width":%d,"height":%d}}' % (veu_topo, veu_rodape, w, h))


def logica(veu_topo, veu_rodape):
    if MODO == 'halo':
        return ('class Component extends DCLogic {\n  renderVals() {\n'
                '    return { halo: Number(this.props.halo ?? 1) };\n  }\n}')
    return ('class Component extends DCLogic {\n  renderVals() {\n    return {\n'
            f'      veuTopo: Number(this.props.veuTopo ?? {veu_topo}),\n'
            f'      veuRodape: Number(this.props.veuRodape ?? {veu_rodape}),\n'
            '    };\n  }\n}')


def pagina(corpo, veu_topo, veu_rodape, w, h):
    return ('<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n'
            '  <script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            f'  <style>{FONTES}{VEU_CSS}\n    body {{ margin: 0; background: {DARK}; }}\n'
            f'    a {{ color: {AMARELO}; }}\n    a:hover {{ color: #d88f12; }}\n  </style>\n</helmet>\n'
            f'{corpo}\n</x-dc>\n'
            f"<script data-dc-script data-props='{props(veu_topo, veu_rodape, w, h)}'>\n"
            f'{logica(veu_topo, veu_rodape)}\n</script>\n'
            '</body>\n</html>\n')


ARTBOARDS = [
    ('Main', story_funcionamento, 'estufa.jpg', 1080, 1920, 0.52, 0.56),
    ('Capa', capa_feijoada, 'feijoada.jpg', 1080, 1350, 0.52, 0.50),
]


def escrever(nome, fn, luzes, vt, vr, w, h):
    html = pagina(fn(luzes), vt, vr, w, h)
    conferir_divs(html, nome)          # regra 4: HTML desbalanceado não dá erro
    open(os.path.join(BASE, f'{nome}.dc.html'), 'w', encoding='utf-8').write(html)
    return html


def main():
    os.chdir(BASE)
    geo = {}
    for nome, fn, foto, w, h, vt, vr in ARTBOARDS:
        escrever(nome, fn, {}, vt, vr, w, h)                       # passada 1: sem mancha
        rects = sondar(f'{nome}.dc.html') if MODO == 'halo' else {}
        luzes = {k: luz_em(foto, w, h, r) for k, r in rects.items()}
        escrever(nome, fn, luzes, vt, vr, w, h)                    # passada 2: calibrada
        geo[nome] = {k: dict(rects[k], luz=round(luzes[k], 1)) for k in rects}
        if luzes:
            print(f'{nome}: ' + '  '.join(
                f'{k} luz={luzes[k]:.0f} rect={rects[k]["w"]}x{rects[k]["h"]}@{rects[k]["y"]}'
                for k in sorted(luzes)))
    json.dump(geo, open(os.path.join(BASE, 'geometria.json'), 'w', encoding='utf-8'),
              indent=1, ensure_ascii=False)
    print(f'2 artboards (MODO={MODO}): Main.dc.html (story 1080x1920), '
          'Capa.dc.html (feed 1080x1350)')
    if AVISOS:
        print('\nTITULO QUE NAO CABE:')
        print('\n'.join(AVISOS))


if __name__ == '__main__':
    main()
