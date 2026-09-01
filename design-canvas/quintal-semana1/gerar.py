# -*- coding: utf-8 -*-
"""Gera os artboards da semana do Quintal nos 5 layouts da biblioteca."""
import base64, json, os, sys, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import halo_quintal as hq
from sonda import medir_grupos
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _halo import conferir_divs

# MODO=halo (padrão) ou MODO=veu, que mantém o mecanismo antigo para
# comparação lado a lado. Foi assim que o By Rock foi aprovado.
MODO = os.environ.get('MODO', 'halo')

CREME, VERDE, ESCURO = '#F5F0E8', '#7A9A5C', '#1F1B16'

# Sombra presa ao GLIFO. O Quintal nunca teve nenhuma — e é boa parte da razão
# pela qual o véu precisava ser tão pesado: sem contraste local, TODO o
# contraste tinha de vir de escurecer a fotografia.
#
# 🔴 Ela existe sobretudo pela linha em Amithen VERDE. O #7A9A5C tem luz 143,
# menos que os 150 de fundo que o critério da casa permite; sobre foto clara o
# halo bate no teto de tinta e ainda não alcança o alvo dela (8 grupos nesta
# leva). A sombra é o contraste que o halo não consegue dar sem virar tarja.
#
# É a mesma solução do By Rock ("é ela que faz o véu poder ser leve: o halo
# resolve o contraste no PONTO onde a letra cai"), na cor do Quintal.
# Os alvos do halo NÃO foram afrouxados por causa dela: ela entra como folga,
# não como desconto — quem afrouxa o número por causa de um efeito que a
# medição não enxerga fica sem medição nenhuma.
SOMBRA_TITULO = ('text-shadow: 0 2px 22px rgba(31,27,22,0.78), '
                 '0 0 54px rgba(31,27,22,0.52);')
SOMBRA_TEXTO = 'text-shadow: 0 1px 14px rgba(31,27,22,0.80);'
if os.environ.get('SOMBRA') == '0':      # para comparar lado a lado
    SOMBRA_TITULO = SOMBRA_TEXTO = ''
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
F = {k: b64(f'{k}.woff') for k in ('Amithen', 'DomaniCP', 'AcuminBook', 'AcuminSemibold')}
face = lambda fam, k, w=400: ("@font-face{font-family:'%s';src:url(data:font/woff;base64,%s) "
    "format('woff');font-weight:%d;font-style:normal;font-display:block}" % (fam, F[k], w))
FONTES = (face('Amithen','Amithen') + face('DomaniCP','DomaniCP')
          + face('Acumin Book','AcuminBook') + face('Acumin Semi','AcuminSemibold',600))

# O véu de leitura. Fica DENSO na faixa onde o texto pousa e só então decai —
# o gradiente anterior nascia forte na borda e enfraquecia justamente embaixo
# das letras, e o texto sumia sobre prato branco ou teto claro (medido em
# 25/08: p90 de 178 e 170 nas peças de segunda).
# A fórmula vive só aqui, em CSS: o .dc.html carrega apenas dois números
# (--veu e --base), então o achatador do render não precisa replicar conta
# nenhuma para chegar ao mesmo resultado.
VEU_CSS = '''
    .veu-t { background: linear-gradient(to bottom,
      rgb(31 27 22 / var(--veu-topo)) 0%,
      rgb(31 27 22 / var(--veu-topo)) 40%,
      rgb(31 27 22 / calc(var(--veu-topo) * 0.58)) 66%,
      rgb(31 27 22 / 0) 100%); }
    .veu-b { background: linear-gradient(to top,
      rgb(31 27 22 / var(--veu-rodape)) 0%,
      rgb(31 27 22 / var(--veu-rodape)) 36%,
      rgb(31 27 22 / calc(var(--veu-rodape) * 0.56)) 64%,
      rgb(31 27 22 / 0) 100%); }'''

# O HALO — a alternativa ao véu (Ciro, 01/09/2026, depois de reprovar o véu
# duas vezes). Mancha escura só atrás do texto, desmanchada por `filter: blur`.
#
# 🔴 É `filter: blur()` na PRÓPRIA caixa, nunca `backdrop-filter: blur()`:
# `backdrop-filter` desfocaria a FOTOGRAFIA atrás (lente fora de foco, que
# descaracteriza a foto); `filter` desmancha só a mancha e deixa a foto nítida
# por baixo.
#
# Ele é uma camada ABSOLUTA IRMÃ, e não um filho do bloco de texto como no By
# Rock — ver `sonda.py` para o porquê (armadilha 4.1). Vale aqui a mesma
# ressalva da 4.7: quem é absoluto é o FUNDO, que ninguém arrasta no editor.
#
# Como o véu, a fórmula vive só no CSS e o artboard carrega números: `--a` é a
# tinta calculada da foto, `--r` o raio que a caixa comporta e `--f` o botão
# de ajuste (topo e rodapé separados, como o Ciro pediu em 25/08).
HALO_CSS = '''
    .halo { position: absolute; z-index: 0; pointer-events: none;
      background: rgb(31 27 22 / calc(var(--a) * var(--f)));
      filter: blur(var(--r)); border-radius: calc(var(--r) + 60px); }'''

def ico(d):  # ícone de linha verde
    return ('<svg width="0.9em" height="0.9em" viewBox="0 0 24 24" fill="none" stroke="' + VERDE +
            '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="flex:none">'
            + d + '</svg>')
RELOGIO = ico('<circle cx="12" cy="12" r="9"></circle><path d="M12 6.9v5.2l3.3 1.9"></path>')
PIN = ico('<path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z"></path><circle cx="12" cy="10" r="2.6"></circle>')

def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode()
    return ''.join(c for c in s.title() if c.isalnum())

def quebrar(t):
    """Headline em dois níveis: tudo menos a última palavra + a última em script."""
    ps = t.split()
    return (' '.join(ps[:-1]), ps[-1]) if len(ps) > 1 else ('', t)

def duas_linhas(t):
    ps = t.split()
    if len(ps) < 4: return t, ''
    m = (len(ps) + 1) // 2
    return ' '.join(ps[:m]), ' '.join(ps[m:])

def pagina(corpo, props, logica):
    return (f'<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n'
            f'  <script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            f'  <style>{FONTES}{VEU_CSS}{HALO_CSS}\n    body {{ margin: 0; background: {ESCURO}; }}\n'
            f'    a {{ color: {VERDE}; }}\n    a:hover {{ color: #557737; }}\n  </style>\n</helmet>\n'
            f'{corpo}\n</x-dc>\n<script data-dc-script data-props=\'{props}\'>\n{logica}\n</script>\n'
            f'</body>\n</html>\n')

# Dois botões, um por véu — o knob único não deixava escurecer só o rodapé
# (pedido do Ciro em 25/08). Os defaults preservam a densidade que o knob
# único produzia: topo = 0.62+0.10, rodapé = 0.62+0.16.
# Em MODO=halo os dois botões viram MULTIPLICADORES da tinta calculada da foto,
# não a tinta em si: o valor por peça sai da medição, e o botão é a alavanca de
# resgate de quem está olhando a arte. Continuam dois, e não um, pela mesma
# razão de 25/08 — o botão único não deixava escurecer só o rodapé.
PROPS_VEU = ('{"$preview":{"width":1080,"height":1920},'
             '"veuTopo":{"editor":"range","default":0.72,"min":0.1,"max":0.95,"step":0.02,'
             '"unit":"","section":"Ajustes"},'
             '"veuRodape":{"editor":"range","default":0.78,"min":0.1,"max":0.95,"step":0.02,'
             '"unit":"","section":"Ajustes"}}')
PROPS_HALO = ('{"$preview":{"width":1080,"height":1920},'
              '"haloTopo":{"editor":"range","default":1,"min":0,"max":1.6,"step":0.05,'
              '"unit":"","section":"Ajustes"},'
              '"haloRodape":{"editor":"range","default":1,"min":0,"max":1.6,"step":0.05,'
              '"unit":"","section":"Ajustes"}}')

LOGICA_VEU = '''class Component extends DCLogic {
  renderVals() {
    // Tamanho de fonte é px absoluto em cada bloco, de propósito: com em/var
    // herdados do pai, mover um bloco no editor o tirava da hierarquia e a
    // fonte encolhia (relatado em 25/08).
    return {
      veuTopo: Number(this.props.veuTopo ?? 0.72),
      veuRodape: Number(this.props.veuRodape ?? 0.78),
    };
  }
}'''
LOGICA_HALO = '''class Component extends DCLogic {
  renderVals() {
    return {
      haloTopo: Number(this.props.haloTopo ?? 1),
      haloRodape: Number(this.props.haloRodape ?? 1),
    };
  }
}'''

def moldura(foto, dentro, veu_topo=760, veu_rodape=620, distribuir='space-between',
            espaco='40px', halos=''):
    """Foto e mancha de leitura são camadas de fundo; o conteúdo vive num flex column.

    Cada bloco carrega o próprio tamanho em px e cada camada o próprio número:
    nada aqui depende de herdar variável ou em do ancestral, para que mover um
    bloco no editor não mude o que ele é.

    Em MODO=halo o véu não é emitido. Não adianta deixá-lo fraco por segurança:
    ele é uma faixa de centenas de pixels, e é justamente a soma dos dois que
    devolveria o "muito marcado" que o halo veio corrigir.
    """
    veus = '' if MODO == 'halo' else (
        f'  <div class="veu-t" style="position: absolute; left: 0; top: 0; width: 1080px; '
        f'height: {veu_topo}px; --veu-topo: {{{{veuTopo}}}};"></div>\n'
        f'  <div class="veu-b" style="position: absolute; left: 0; bottom: 0; width: 1080px; '
        f'height: {veu_rodape}px; --veu-rodape: {{{{veuRodape}}}};"></div>\n')
    return (f'<div style="position: relative; width: 1080px; height: 1920px; overflow: hidden; '
            f'background: {ESCURO}; font-family: \'Acumin Book\', system-ui, sans-serif;">\n'
            f'  <img src="./{foto}" alt="" style="position: absolute; left: 0; top: 0; width: 1080px; '
            f'height: 1920px; object-fit: cover;">\n'
            + veus + halos
            # `data-fluxo` é o que a sonda procura para achar os itens do flex.
            + f'  <div data-fluxo="1" style="position: absolute; left: 0; top: 0; width: 1080px; '
            f'height: 1920px; box-sizing: border-box; padding: 200px 92px 172px; display: flex; '
            f'flex-direction: column; justify-content: {distribuir}; gap: {espaco};">'
            f'\n{dentro}\n  </div>\n</div>')

def linha_servico(txt, icone=RELOGIO, tam='33px'):
    return (f'<div style="display: flex; align-items: center; gap: 13px; font-family: \'Acumin Semi\', '
            f'system-ui, sans-serif; font-weight: 600; font-size: {tam}; color: {CREME}; {SOMBRA_TEXTO}">{icone}<span>{txt}</span></div>')

# Cada linha de texto é um ITEM DIRETO do container flex — não um pedaço de um
# bloco. É isso que dá controle individual no editor: selecionar, reordenar,
# alinhar (align-self) e espaçar cada uma por si. Agrupar título+apoio+serviço
# num div só fazia o editor mover o conjunto e nada dentro dele (25/08).
#
# Quem empurra os grupos para topo e rodapé é o ESPAÇADOR — um item flexível
# próprio, selecionável no editor. A versão anterior fazia isso com
# `margin-bottom: auto` escondido na ÚLTIMA linha da manchete: mexer na margem
# daquela linha desmontava a distribuição inteira sem a pessoa saber por quê
# (pedido de independência do Ciro, 25/08). Editar o min-height do espaçador
# desloca o bloco de baixo; as margens de cada linha ficam livres.
ESPACADOR = ('    <div data-espacador="1" style="flex: 1 1 auto; '
             'min-height: 40px;"></div>')

# ---------------------------------------------------------------- L1
def L1(foto, copy, halos=''):
    a, b = quebrar(copy[0]); servico = copy[1:]
    itens = []
    if a: itens.append(f'    <div style="font-family: \'DomaniCP\', Georgia, serif; font-size: 91px; line-height: 1.04; color: {CREME}; {SOMBRA_TITULO}">{a}</div>')
    itens.append(f'    <div style="font-family: \'Amithen\', cursive; font-size: 114px; line-height: 0.84; color: {VERDE}; {SOMBRA_TITULO} margin: -3px 0 0 2px;">{b}</div>')
    itens.append(ESPACADOR)
    linhas = ''.join('\n        ' + linha_servico(x, PIN if k else RELOGIO, '30px') for k, x in enumerate(servico))
    itens.append('    <div style="display: flex; align-items: center; gap: 32px;">\n'
                 '      <img src="./marca-branca.png" alt="O Quintal Parrilla Bar" style="width: 262px; height: auto; flex: none;">\n'
                 '      <div style="width: 1px; height: 84px; background: rgba(245,240,232,0.32); flex: none;"></div>\n'
                 f'      <div style="display: flex; flex-direction: column; gap: 12px;">{linhas}\n      </div>\n    </div>')
    return moldura(foto, '\n'.join(itens), veu_topo=880, veu_rodape=660, distribuir='flex-start', espaco='0', halos=halos)

# ---------------------------------------------------------------- L2
def L2(foto, copy, halos=''):
    a, b = quebrar(copy[0]); apoio = copy[1] if len(copy) > 1 else ''; servico = copy[2] if len(copy) > 2 else ''
    itens = ['    <img src="./marca-branca.png" alt="O Quintal Parrilla Bar" style="width: 236px; height: auto; align-self: flex-end;">',
             ESPACADOR]
    if a: itens.append(f'    <div style="font-family: \'DomaniCP\', Georgia, serif; font-size: 87px; line-height: 1.02; color: {CREME}; {SOMBRA_TITULO}">{a}</div>')
    itens.append(f'    <div style="font-family: \'Amithen\', cursive; font-size: 127px; line-height: 0.82; color: {VERDE}; {SOMBRA_TITULO} margin: -4px 0 0 3px;">{b}</div>')
    if apoio: itens.append(f'    <div style="font-size: 40px; line-height: 1.3; color: {CREME}; {SOMBRA_TEXTO} opacity: 0.95; margin-top: 36px;">{apoio}</div>')
    if servico:
        itens.append('    <div style="height: 1px; background: repeating-linear-gradient(to right, rgba(245,240,232,0.4) 0 9px, transparent 9px 18px); margin: 29px 0 26px;"></div>')
        itens.append('    ' + linha_servico(servico, RELOGIO, '32px'))
    return moldura(foto, '\n'.join(itens), veu_topo=470, veu_rodape=1120, distribuir='flex-start', espaco='0', halos=halos)

# ---------------------------------------------------------------- L3
def L3(foto, copy, halos=''):
    l1, l2 = duas_linhas(copy[0]); resto = copy[1:]
    itens = [f'    <div style="text-align: center; font-family: \'Amithen\', cursive; font-size: 104px; line-height: 0.96; color: {CREME}; {SOMBRA_TITULO} align-self: stretch;">{l1}</div>']
    if l2: itens.append(f'    <div style="text-align: center; font-family: \'Amithen\', cursive; font-size: 104px; line-height: 0.96; color: {VERDE}; {SOMBRA_TITULO} align-self: stretch; margin: -4px 0 0;">{l2}</div>')
    itens.append(ESPACADOR)
    blocos = ''.join(f'\n          <div style="font-size: 32px; line-height: 1.34; color: {CREME}; {SOMBRA_TEXTO}">{x}</div>' for x in resto)
    itens.append('    <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; align-self: stretch;">\n'
                 '      <div style="display: flex; gap: 26px;">\n'
                 f'        <div style="width: 4px; background: {VERDE}; border-radius: 2px; flex: none;"></div>\n'
                 f'        <div style="display: flex; flex-direction: column; gap: 18px; font-family: \'Acumin Semi\', system-ui, sans-serif; font-weight: 600;">{blocos}\n        </div>\n      </div>\n'
                 '      <img src="./marca-branca.png" alt="O Quintal Parrilla Bar" style="width: 232px; height: auto; flex: none;">\n    </div>')
    return moldura(foto, '\n'.join(itens), veu_topo=840, veu_rodape=760, distribuir='flex-start', espaco='0', halos=halos)

# ---------------------------------------------------------------- L4
def L4(foto, copy, halos=''):
    l1, l2 = duas_linhas(copy[0]); servico = copy[1:]
    itens = [f'    <div style="text-align: center; font-family: \'Amithen\', cursive; font-size: 102px; line-height: 0.96; color: {CREME}; {SOMBRA_TITULO} align-self: stretch;">{l1}</div>']
    if l2: itens.append(f'    <div style="text-align: center; font-family: \'Amithen\', cursive; font-size: 102px; line-height: 0.96; color: {CREME}; {SOMBRA_TITULO} align-self: stretch; margin: -3px 0 0;">{l2}</div>')
    itens.append(ESPACADOR)
    linhas = ''.join(f'\n        <div>{x}</div>' for x in servico)
    itens.append('    <div style="display: flex; align-items: center; justify-content: space-between; gap: 40px; align-self: stretch;">\n'
                 f'      <div style="display: flex; flex-direction: column; gap: 10px; font-family: \'Acumin Semi\', system-ui, sans-serif; '
                 f'font-weight: 600; font-size: 31px; line-height: 1.28; color: {CREME}; {SOMBRA_TEXTO}">{linhas}\n      </div>\n'
                 '      <img src="./marca-branca.png" alt="O Quintal Parrilla Bar" style="width: 244px; height: auto; flex: none;">\n    </div>')
    return moldura(foto, '\n'.join(itens), veu_topo=880, veu_rodape=800, distribuir='flex-start', espaco='0', halos=halos)

# ---------------------------------------------------------------- L5
def L5(foto, copy, halos=''):
    l1, l2 = duas_linhas(copy[0]); resto = copy[1:]
    itens = ['    <img src="./marca-verde.png" alt="O Quintal Parrilla Bar" style="width: 250px; height: auto; align-self: center;">',
             ESPACADOR,
             f'    <div style="text-align: center; font-family: \'Amithen\', cursive; font-size: 99px; line-height: 0.96; color: {CREME}; {SOMBRA_TITULO} align-self: stretch;">{l1}</div>']
    if l2: itens.append(f'    <div style="text-align: center; font-family: \'Amithen\', cursive; font-size: 99px; line-height: 0.96; color: {CREME}; {SOMBRA_TITULO} align-self: stretch; margin-top: -3px;">{l2}</div>')
    for x in resto:
        itens.append(f'    <div style="text-align: center; font-family: \'Acumin Semi\', system-ui, sans-serif; font-weight: 600; font-size: 31px; color: {CREME}; {SOMBRA_TEXTO} align-self: stretch; margin-top: 19px;">{x}</div>')
    return moldura(foto, '\n'.join(itens), veu_topo=560, veu_rodape=880, distribuir='flex-start', espaco='0', halos=halos)

LAYOUTS = {'L1': L1, 'L2': L2, 'L3': L3, 'L4': L4, 'L5': L5}
GRUPO = ('topo', 'rodape')   # a ordem em que a sonda devolve, separados pelo espaçador

# O único ajuste de gosto que sobrou. O rodapé pede um degrau a mais: leva a
# menor letra da peça e a marca, e o texto do Quintal — ao contrário do By
# Rock — não tem sombra presa ao glifo para ajudar.
ESCALA = {'topo': 1.0, 'rodape': 1.12}
# A aferição renderiza cada peça sem o conteúdo para ver a tinta que de fato
# chegou. AFERIR=0 pula (é o dobro do tempo), ao custo de ficar só na
# estimativa analítica.
AFERIR = os.environ.get('AFERIR', '1') != '0'


def medir_luz(foto, grupos):
    """A parte que não depende da tinta: onde cada halo fica e que luz enfrenta."""
    im = hq.foto_como_exibida(os.path.join('fotos', foto), 1080, 1920)
    out = []
    for i, g in enumerate(grupos):
        if not g or g['caixa']['w'] < 8 or g['caixa']['h'] < 8:
            continue
        papel = GRUPO[i] if i < len(GRUPO) else 'rodape'
        x, y, w, h, raio = hq.geometria(g['caixa'])
        pior = hq.resolver_grupo(im, (x, y, w, h), raio, g['linhas'], ESCALA[papel])
        out.append(dict(papel=papel, caixa=[x, y, w, h], raio=raio,
                        luz=pior['luz'], alvo=pior['alvo'], alpha=pior['alpha'],
                        cor=pior['cor'],
                        # a linha que MANDOU na conta — é ela que a aferição
                        # remede e que o `medir.py` cobra
                        tinta_caixa=pior['caixa'],
                        # TODAS as linhas que contam, com a luz e o alvo de
                        # cada uma: é sobre esta lista que a aferição refaz a
                        # conta, e não só sobre a que venceu a estimativa.
                        linhas=[dict(caixa=l['caixa'], alvo=l['alvo'], luz=l['luz'])
                                for l in pior['uteis']],
                        ornamentos=[dict(caixa=[l['caixa']['x'], l['caixa']['y'],
                                                l['caixa']['w'], l['caixa']['h']])
                                    for l in g['linhas']
                                    if min(l['caixa']['w'], l['caixa']['h']) < hq.FIO_DECORATIVO]))
    return out


def camadas(grupos):
    """As camadas de halo de um artboard. Grupo com tinta zero não vira camada."""
    fora = []
    for g in grupos:
        if g['alpha'] <= 0:
            continue
        x, y, w, h = g['caixa']
        hole = 'haloTopo' if g['papel'] == 'topo' else 'haloRodape'
        fora.append(f'  <div class="halo" data-papel="{g["papel"]}" style="left: {x}px; '
                    f'top: {y}px; width: {w}px; height: {h}px; --a: {g["alpha"]:.3f}; '
                    f'--r: {g["raio"]}px; --f: {{{{{hole}}}}};"></div>\n')
    return ''.join(fora)


def escrever(slots, medidas, props, logica):
    mapa = []
    for s in slots:
        nome = slug(s['nome'])
        # o arquivo da foto vai SEM acento: 'sáb0800.jpg' quebra a referência
        # (e o helper do canvas recusa o nome), então é o slug que manda.
        foto = f'{slug(s["nome"]).lower()}.jpg'
        html = pagina(LAYOUTS[s['layout']](foto, s['copy'], camadas(medidas.get(nome, []))),
                      props, logica)
        conferir_divs(html, nome)
        open(f'{nome}.dc.html', 'w').write(html)
        mapa.append({**s, 'artboard': f'{nome}.dc.html', 'layout': s['layout'],
                     'arquivoFoto': foto, 'modo': MODO, 'halo': medidas.get(nome, [])})
    json.dump(mapa, open('mapa.json', 'w'), ensure_ascii=False, indent=2)
    return mapa


slots = json.load(open('slots.json'))
props, logica = (PROPS_HALO, LOGICA_HALO) if MODO == 'halo' else (PROPS_VEU, LOGICA_VEU)
medidas = {}

if MODO == 'halo':
    # ---- 1: o artboard SEM halo, só para a sonda medir onde o texto pousa
    corpos = {slug(s['nome']): LAYOUTS[s['layout']](f'{slug(s["nome"]).lower()}.jpg', s['copy'])
              for s in slots}
    geo = medir_grupos(corpos, FONTES)
    # ---- 2: a tinta que a conta pede, pela estimativa analítica da cobertura
    for s in slots:
        nome = slug(s['nome'])
        medidas[nome] = medir_luz(f'{nome.lower()}.jpg', geo[nome])
    escrever(slots, medidas, props, logica)

    # ---- 3: a aferição. O modelo dá a estimativa; a peça renderizada dá a
    # verdade, e daí sai a cobertura REAL de cada caixa (ver hq.corrigir).
    if AFERIR:
        import medir
        for s in slots:
            nome = slug(s['nome'])
            fundo = medir._png(f'{nome}.dc.html', True)
            for g in medidas[nome]:
                # cada linha refaz a própria conta a partir do que o render
                # entregou nela; o grupo fica com a mais exigente das novas.
                novas, aferidos = [], []
                for l in g['linhas']:
                    p98 = medir.legibilidade(fundo, l['caixa'])[1]
                    aferidos.append(round(p98, 1))
                    n = hq.corrigir(l['luz'], l['alvo'], g['alpha'], p98,
                                    ESCALA[g['papel']])
                    if n is not None:
                        novas.append(n)
                g['aferido'] = max(aferidos) if aferidos else None
                if novas:
                    g['estimado'] = g['alpha']
                    g['alpha'] = max(novas)
                    # tinta no teto quer dizer que a conta pediu mais do que o
                    # mecanismo dá: esta foto não carrega esta linha nesta
                    # posição. É sinal de CURADORIA, não defeito silencioso.
                    g['no_teto'] = g['alpha'] >= hq.TETO_TINTA

mapa = escrever(slots, medidas, props, logica)

print(f"{'peça':12} {'lay':4} {'grupo':7} {'luz p98':>7} {'alvo':>5} {'estim.':>6} "
      f"{'aferido':>7} {'tinta':>6} {'raio':>5}  quem manda")
for m in mapa:
    for h in m['halo'] or [{}]:
        cor = h.get('cor')
        quem = ('—' if not cor else
                'verde' if cor[1] > cor[0] else 'creme')
        print(f"{m['artboard'].replace('.dc.html',''):12} {m['layout']:4} "
              f"{h.get('papel','—'):7} {h.get('luz',0):>7.0f} {h.get('alvo',0):>5.0f} "
              f"{h.get('estimado', h.get('alpha',0)):>6.2f} {h.get('aferido','—'):>7} "
              f"{h.get('alpha',0):>6.2f} {h.get('raio','—'):>5}  {quem}")
sem = sum(1 for m in mapa for h in (m['halo'] or []) if h.get('alpha', 0) <= 0)
teto = [f"{m['artboard'].replace('.dc.html','')}/{h['papel']}"
        for m in mapa for h in (m['halo'] or []) if h.get('no_teto')]
print(f"\n{len(mapa)} artboards em MODO={MODO} · {sem} grupo(s) sem halo nenhum "
      f"(a foto já se lê sozinha)")
if teto:
    print(f"⚠️  {len(teto)} grupo(s) no teto de tinta — a foto não carrega essa "
          f"linha nessa posição: {', '.join(teto)}")
