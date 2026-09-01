# -*- coding: utf-8 -*-
"""Gera os artboards da SEMANA 1 do Espeto Gaucho (31/08 a 06/09/2026).

20 stories 1080x1920 (grade de 3/dia) e 2 carrosseis de feed 1080x1350
(rodizio de sexta e familia no sabado).

O vocabulario visual vem do padrao ja aprovado do cliente
(design-canvas/espeto-carrosseis e espeto-avaliacoes) e do DNA da marca:

  - headline Bevan em CAIXA ALTA, empilhada em 2-3 linhas curtas, com UMA
    palavra-chave em vermelho (marcada com "#" no slots.json);
  - apoio manuscrito em Caveat, caixa baixa;
  - servico em Barlow Condensed com icone pequeno a esquerda;
  - preco precedido de BARRA VERTICAL VERMELHA;
  - fechamento humano manuscrito, em vermelho-coral;
  - a marca no canto calmo OPOSTO ao bloco de texto.

O QUE E NOVO AQUI (e por que):
  - LAYOUT DE STORY em tres arranjos (split / rodape / topo). O DNA exige que
    a composicao varie dentro da MESMA leva; com um arranjo so, 20 stories na
    mesma semana viram template repetido.
  - No story a marca NUNCA vai a 74px da borda: essa faixa e a que o Instagram
    ocupa (avatar em cima, barra de resposta embaixo). Os cantos de story
    seguem a MESMA margem do texto (190 em cima, 120 embaixo), senao o selo
    fica desalinhado do badge e da assinatura.
"""
import base64, json, os
from PIL import ImageFont
import halo_espeto as HL

# MODO=halo (padrao): mancha escura desfocada SO atras do texto.
# MODO=veu: o gradiente de faixa, mantido para comparacao lado a lado e para
# reproduzir exatamente o que ja esta no ar.
MODO = os.environ.get('MODO', 'halo')
USA_HALO = MODO == 'halo'

VERMELHO, AMARELO, MARROM, BRANCO = '#F4301A', '#FDC700', '#2B1A12', '#FFFFFF'
W, H = 1080, 1350
H_STORY = 1920
# Margem do story: 90px nas quatro bordas — a mesma da lateral, moldura
# uniforme. O caminho foi 268 -> 190/120 (feedback do Ciro em 30/08/2026,
# repetido em 11 das 13 pecas revisadas) -> 90/90, escolhido por ele num
# comparativo lado a lado das quatro variantes.
# E MENOS do que a faixa que o Instagram ocupa (~1/8 = 240px): a decisao e
# dele e foi tomada vendo a peca renderizada. Consequencia conhecida: no
# rodape a assinatura fica perto do "Enviar mensagem", e no topo-direito o
# selo divide espaco com o "X" de fechar do story.
# Configuraveis por ambiente para comparar valores sem editar o gerador:
#   MARGEM_TOPO=130 MARGEM_RODAPE=90 python3 gerar.py
SAFE_STORY_TOPO = int(os.environ.get('MARGEM_TOPO', 90))
SAFE_STORY_RODAPE = int(os.environ.get('MARGEM_RODAPE', 90))

b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
F = {k: b64(f'{k}.woff') for k in ('Bevan', 'BarlowCondensed', 'BarlowCondensedSemi', 'Caveat')}
face = lambda fam, k, w=400: ("@font-face{font-family:'%s';src:url(data:font/woff;base64,%s) "
    "format('woff');font-weight:%d;font-style:normal;font-display:block}" % (fam, F[k], w))
FONTES = (face('Bevan', 'Bevan') + face('Barlow Condensed', 'BarlowCondensed')
          + face('Barlow Condensed SemiBold', 'BarlowCondensedSemi', 600)
          + face('Caveat SemiBold', 'Caveat', 600))

VEU_CSS = '''
    .veu-t { background: linear-gradient(to bottom,
      rgb(23 14 9 / var(--veu-topo)) 0%,
      rgb(23 14 9 / var(--veu-topo)) 38%,
      rgb(23 14 9 / calc(var(--veu-topo) * 0.56)) 66%,
      rgb(23 14 9 / 0) 100%); }
    .veu-b { background: linear-gradient(to top,
      rgb(23 14 9 / var(--veu-rodape)) 0%,
      rgb(23 14 9 / var(--veu-rodape)) 38%,
      rgb(23 14 9 / calc(var(--veu-rodape) * 0.54)) 66%,
      rgb(23 14 9 / 0) 100%); }'''


def ico(d, cor=VERMELHO):
    return ('<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="' + cor +
            '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
            'style="flex:none">' + d + '</svg>')
RELOGIO = ico('<circle cx="12" cy="12" r="9"></circle><path d="M12 6.8v5.3l3.4 2"></path>')
PINO = ico('<path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z"></path>'
           '<circle cx="12" cy="10" r="2.6"></circle>')
ICONES = {'relogio': RELOGIO, 'pino': PINO}


# Sombra presa ao GLIFO. E ela que deixa o halo poder ser leve: resolve o
# contraste no ponto exato da letra, sem escurecer um pixel de fotografia.
#
# 🔴 Descricao, servico, preco e item de lista NAO tinham sombra nenhuma — o
# veu era todo o contraste deles. Trocar o mecanismo sem isto deixaria os
# niveis pequenos nus, que e o defeito 2 do roteiro (todo elemento que dependia
# do veu precisa da propria leitura) na sua forma tipografica.
SOMBRA_TITULO = '0 3px 22px rgb(23 14 9 / 0.5)'
SOMBRA_TEXTO = '0 1px 12px rgb(23 14 9 / 0.85), 0 0 26px rgb(23 14 9 / 0.5)'
# 🔴 O VERMELHO DA MARCA E O CASO CRITICO DESTE CLIENTE, e nao da para resolver
# com mais tinta no halo. `#F4301A` tem luminancia relativa 0,214 contra 1,0 do
# branco: no mesmo fundo onde o branco tem 5,5:1 de contraste, ele tem 1,38:1 —
# some. E ele mora sempre na ULTIMA linha do bloco (a assinatura manuscrita),
# que e justamente onde a gaussiana do halo ja caiu para ~47% da tinta.
#
# Aumentar o halo ate cobrir isso seria reconstruir o veu. A saida e a sombra
# presa ao GLIFO, que custa zero pixel de fotografia: ela desenha o contraste
# no contorno da letra, onde a letra esta.
SOMBRA_BAIXA_LUM = ('0 1px 3px rgb(23 14 9 / 0.95), 0 2px 12px rgb(23 14 9 / 0.9), '
                    '0 0 30px rgb(23 14 9 / 0.7)')
if not USA_HALO:
    SOMBRA_TEXTO = ''
    SOMBRA_BAIXA_LUM = '0 2px 16px rgb(23 14 9 / 0.8)' 


def sb():
    """A sombra dos niveis pequenos, com o separador embutido.

    O separador vem JUNTO de proposito: no modo veu a funcao devolve string
    vazia e o CSS tem de ficar identico ao que ja esta no ar — um "; " orfao
    e inofensivo para o navegador e destroi a comparacao byte a byte, que e a
    unica prova barata de que o caminho antigo nao mudou.
    """
    return f'; text-shadow: {SOMBRA_TEXTO}' if SOMBRA_TEXTO else ''


def destacar(txt):
    """A palavra marcada com '#' sai em vermelho — uma so por titulo (regra do DNA)."""
    return ' '.join(f'<span style="color: {VERMELHO}">{p[1:]}</span>' if p.startswith('#') else p
                    for p in txt.split(' '))


# ---------------------------------------------------------------- pecas
MARCA_LARG = 172


def marca(canto, halo_css='', hid=''):
    """Lockup no canto CALMO, oposto ao texto. Branco, discreto.

    Os cantos 'story-*' partem da safe area de 268px: no story, 74px cai
    debaixo do avatar (topo) e da barra de resposta (rodape) do Instagram.

    🔴 A marca PRECISA do proprio halo. Ela e branca com miolo vermelho e o
    unico contraste que tinha era o veu do rodape — o slots.json chega a subir
    `veuRodape` para 0.46-0.50 em pecas de arranjo `topo` SO para dar chao a
    ela (esta na README). Tirado o veu sem repor nada, ela sumiria sobre o
    amarelo do escorregador, a bandeja do marmitex e o chopp.
    """
    pos = {'topo-dir': 'top: 74px; right: 78px;', 'topo-esq': 'top: 74px; left: 90px;',
           'base-dir': 'bottom: 74px; right: 78px;',
           'story-topo-dir': f'top: {SAFE_STORY_TOPO}px; right: 78px;',
           'story-base-dir': f'bottom: {SAFE_STORY_RODAPE}px; right: 78px;'}[canto]
    # 🔴 O contraste da marca vem do CONTORNO, nao de um disco atras dela.
    # `drop-shadow` encadeado segue a silhueta do PNG (o lockup e branco sobre
    # transparencia), entao ele desenha a leitura na borda de cada letra e do
    # simbolo, sem escurecer um pixel de foto. O halo da marca fica so com o
    # papel de assentar — por isso `ESCALA_MARCA` e baixa.
    #
    # Medido em 01/09/2026: com o halo fazendo o trabalho sozinho (escala 0,80)
    # a marca virava uma mancha circular VISIVEL sobre fundo claro e liso — o
    # escorregador amarelo da area kids e o balcao branco do rodizio. Fundo liso
    # e onde qualquer mancha aparece; e tambem onde o contorno resolve melhor.
    contorno = ('drop-shadow(0 0 2px rgb(23 14 9 / 0.95)) '
                'drop-shadow(0 1px 6px rgb(23 14 9 / 0.85)) '
                'drop-shadow(0 2px 16px rgb(23 14 9 / 0.6))') if USA_HALO else \
               'drop-shadow(0 2px 10px rgb(23 14 9 / 0.55))'
    img = (f'<img src="./lockup-marca.png" alt="" style="width: {MARCA_LARG}px; '
           f'height: auto; display: block; opacity: 0.96; '
           f'filter: {contorno};">')
    if not USA_HALO:
        return (f'<img src="./lockup-marca.png" alt="" style="position: absolute; {pos} '
                f'width: {MARCA_LARG}px; height: auto; opacity: 0.96; '
                f'filter: drop-shadow(0 2px 10px rgb(23 14 9 / 0.55));">')
    ix, iy = HL.INSET_MARCA
    mancha = (f'<div class="halo" style="position: absolute; left: -{ix}px; right: -{ix}px; '
              f'top: -{iy}px; bottom: -{iy}px; z-index: 0; pointer-events: none; '
              f'{halo_css}"></div>' if halo_css else '')
    # O wrapper e emitido TAMBEM na passada sem halo: a sonda precisa medir o
    # mesmo retangulo que a peca final tera. Halo e absoluto, nao muda layout.
    return (f'<div data-halo="{hid}" style="position: absolute; {pos} '
            f'width: {MARCA_LARG}px;">{mancha}'
            f'<div class="conteudo" style="position: relative; z-index: 1;">{img}</div></div>')


def badge(txt):
    return ('    <div style="display: flex; align-items: center; gap: 16px;">'
            f'<span style="width: 46px; height: 5px; background: {VERMELHO}; flex: none"></span>'
            f'<span style="font-family: \'Barlow Condensed SemiBold\', system-ui, sans-serif; '
            f'font-weight: 600; font-size: 30px; letter-spacing: 0.15em; color: {BRANCO}{sb()}; '
            f'text-transform: uppercase">{txt}</span></div>')


UTIL = W - 180  # 900px entre os paddings laterais de 90px
AVISOS = []


def cabe(txt, tam, util=UTIL, ctx=''):
    larg = round(ImageFont.truetype('Bevan.ttf', tam).getlength(txt.replace('#', '')))
    if larg > util:
        AVISOS.append(f'  {ctx}"{txt}" mede {larg}px em {tam}px — passa de {util} e vai quebrar')
    return larg


def titulo(linhas, tam=86, util=UTIL, ctx=''):
    for l in linhas:
        cabe(l, tam, util, ctx)
    return '\n'.join(
        f'    <div style="font-family: \'Bevan\', Georgia, serif; font-size: {tam}px; '
        f'line-height: 0.95; color: {BRANCO}; text-transform: uppercase; '
        f'text-shadow: 0 3px 22px rgb(23 14 9 / 0.5)">{destacar(l)}</div>'
        for l in linhas)


def apoio(txt, tam=52, cor=BRANCO):
    """Manuscrito em Caveat. Em VERMELHO ganha a sombra reforcada — ver
    SOMBRA_BAIXA_LUM: e o unico nivel da peca cuja cor nao carrega contraste
    sozinha, e ainda por cima e traco fino de script."""
    sombra = SOMBRA_BAIXA_LUM if cor != BRANCO else '0 2px 16px rgb(23 14 9 / 0.8)'
    return (f'    <div style="font-family: \'Caveat SemiBold\', cursive; font-weight: 600; '
            f'font-size: {tam}px; line-height: 1.02; color: {cor}; '
            f'text-shadow: {sombra}">{txt}</div>')


def descricao(txt, tam=38):
    """Uma string vira um paragrafo; uma LISTA vira uma linha por item.

    A lista existe para controlar a quebra: com texto corrido o navegador
    decide onde quebrar e sobra palavra orfa na ultima linha (foi o defeito
    apontado no story do espeto misto em 30/08/2026).
    """
    linhas = [txt] if isinstance(txt, str) else list(txt)
    return '\n'.join(
        f'    <div style="font-family: \'Barlow Condensed\', system-ui, sans-serif; '
        f'font-size: {tam}px; line-height: 1.12; color: {BRANCO}{sb()}; opacity: 0.94; '
        f'max-width: 820px">{l}</div>' for l in linhas)


def preco(valor, nota=None):
    dentro = (f'<span style="font-family: \'Bevan\', Georgia, serif; font-size: 62px; '
              f'line-height: 1; color: {BRANCO}{sb()}">{valor}</span>')
    if nota:
        dentro += (f'<span style="font-family: \'Barlow Condensed SemiBold\', system-ui, sans-serif; '
                   f'font-weight: 600; font-size: 36px; color: {AMARELO}; padding-bottom: 6px">{nota}</span>')
    return ('    <div style="display: flex; align-items: flex-end; gap: 18px;">'
            f'<span style="width: 9px; align-self: stretch; background: {VERMELHO}; flex: none"></span>'
            f'{dentro}</div>')


def linha_servico(icone, txt, tam=34):
    return ('    <div style="display: flex; align-items: center; gap: 16px; '
            'font-family: \'Barlow Condensed SemiBold\', system-ui, sans-serif; font-weight: 600; '
            f'font-size: {tam}px; line-height: 1.05; color: {BRANCO}{sb()}">{ICONES[icone]}'
            f'<span>{txt}</span></div>')


def item_lista(txt, tam=44):
    return ('    <div style="display: flex; align-items: center; gap: 18px; '
            'font-family: \'Barlow Condensed SemiBold\', system-ui, sans-serif; font-weight: 600; '
            f'font-size: {tam}px; line-height: 1.05; color: {BRANCO}{sb()}">'
            f'<span style="width: 14px; height: 14px; background: {VERMELHO}; flex: none; '
            'transform: rotate(45deg)"></span>' + f'<span>{txt}</span></div>')


ESPACADOR = '    <div style="flex: 1 1 auto; min-height: 30px;"></div>'


GAP = 13
# HTML de cada grupo, guardado na passada da sonda: e dele que sai QUAIS cores e
# tamanhos de texto o grupo carrega, e portanto quanta tinta ele pede.
GRUPOS_HTML = {}


def _grupos(partes):
    """Quebra a lista de blocos em GRUPOS contiguos, separados pelo ESPACADOR.

    Um grupo e o que recebe UMA mancha. O ESPACADOR ja marcava, no gerador do
    veu, onde a peca se parte em cabeca e pe — e e exatamente onde o halo tem
    de se partir tambem: uma mancha unica cobrindo de um ao outro seria o veu
    de novo, com outro nome.
    """
    grupos, atual = [], []
    for x in partes:
        if x == ESPACADOR:
            grupos.append(atual)
            grupos.append(None)          # marcador do espacador
            atual = []
        else:
            atual.append(x)
    grupos.append(atual)
    return grupos


def moldura(foto, partes, veu_topo_px, veu_rodape_px, canto_marca,
            pad='104px 90px 104px', alt=H, hid='ab', halos=None):
    """A peca. `partes` e a LISTA de blocos (era uma string ja unida).

    A lista importa: e ela que deixa agrupar os blocos contiguos sob UMA
    mancha. Unida em string, o gerador perdia a fronteira entre cabeca e pe —
    a mesma fronteira que o ESPACADOR ja marcava para o veu.
    """
    halos = halos or {}
    if USA_HALO:
        corpo = []
        for i, g in enumerate(_grupos(partes)):
            if g is None:
                corpo.append(ESPACADOR)
            elif g:
                gid = f'{hid}:{i}'
                GRUPOS_HTML[gid] = ''.join(g)
                corpo.append(HL.envolver(g, halos.get(gid, ''), gid, gap=GAP,
                                         inset_x=HL.INSET_TEXTO[0],
                                         inset_y=HL.INSET_TEXTO[1]))
        dentro = '\n'.join(corpo)
    else:
        # 🔴 O modo veu nao agrupa NADA. Ele existe para reproduzir, byte a
        # byte, o que ja esta publicado — e o wrapper do halo, mesmo sem
        # mancha, muda a arvore. A prova de que o caminho antigo continua
        # intacto e o diff contra os artboards no ar; ela so vale se for exata.
        dentro = '\n'.join(partes)

    veus = ''
    if not USA_HALO:
        veus = (f'  <div class="veu-t" style="position: absolute; left: 0; top: 0; width: {W}px; '
                f'height: {veu_topo_px}px; --veu-topo: {{{{veuTopo}}}};"></div>\n'
                f'  <div class="veu-b" style="position: absolute; left: 0; bottom: 0; width: {W}px; '
                f'height: {veu_rodape_px}px; --veu-rodape: {{{{veuRodape}}}};"></div>\n')
    # Um unico hole multiplica TODAS as manchas da peca: e o que preserva no
    # canvas o controle que os sliders de veu davam ao Ciro. Cada mancha guarda
    # a propria opacidade medida e a variavel so escala o conjunto.
    forca = f' --halo-forca: {{{{haloForca}}}};' if USA_HALO else ''
    return (f'<div style="position: relative; width: {W}px; height: {alt}px; overflow: hidden; '
            f'background: {MARROM}; font-family: \'Barlow Condensed\', system-ui, sans-serif;'
            f'{forca}">\n'
            f'  <img src="./{foto}.jpg" alt="" style="position: absolute; left: 0; top: 0; '
            f'width: {W}px; height: {alt}px; object-fit: cover;">\n'
            + veus
            + f'  {marca(canto_marca, halos.get(hid + ":marca", ""), hid + ":marca")}\n'
            f'  <div style="position: absolute; left: 0; top: 0; width: {W}px; height: {alt}px; '
            f'box-sizing: border-box; padding: {pad}; display: flex; flex-direction: column; '
            f'align-items: flex-start; gap: {GAP}px;">\n{dentro}\n  </div>\n</div>')


# ---------------------------------------------------------------- layouts de FEED
def L_capa(s, hid='ab', halos=None):
    p = [badge(s['badge']), titulo(s['titulo'], s.get('tamTitulo', 88))]
    if s.get('apoio'):
        p.append(apoio(s['apoio'], 54))
    if s.get('preco'):
        p.append(preco(s['preco'], s.get('precoNota')))
    if s.get('servico'):
        p.append(descricao(s['servico'], 38))
    p.append(ESPACADOR)
    return moldura(s['foto'], p, 900, 560, 'base-dir', hid=hid, halos=halos)


def L_item(s, hid='ab', halos=None):
    p = [titulo(s['titulo'], s.get('tamTitulo', 84))]
    if s.get('desc'):
        p.append(descricao(s['desc']))
    if s.get('preco'):
        p.append(preco(s['preco'], s.get('precoNota')))
    if s.get('pos') == 'topo':
        return moldura(s['foto'], p + [ESPACADOR], 860, 340, 'base-dir', hid=hid, halos=halos)
    return moldura(s['foto'], [ESPACADOR] + p, 380, 780, 'topo-dir', hid=hid, halos=halos)


def L_lista(s, hid='ab', halos=None):
    p = [titulo(s['titulo'], s.get('tamTitulo', 78))]
    for it in s.get('itens', []):
        p.append(item_lista(it))
    if s.get('apoio'):
        p.append(apoio(s['apoio'], 50))
    p.append(ESPACADOR)
    return moldura(s['foto'], p, 940, 380, 'base-dir', hid=hid, halos=halos)


def L_fecho(s, hid='ab', halos=None):
    cabeca = [titulo(s['titulo'], s.get('tamTitulo', 80))]
    pe = []
    if s.get('preco'):
        pe.append(preco(s['preco'], s.get('precoNota')))
    for l in s.get('linhas', []):
        pe.append(linha_servico(l['icone'], l['txt']))
    if s.get('assinatura'):
        pe.append(apoio(s['assinatura'], 58, VERMELHO))
    return moldura(s['foto'], cabeca + [ESPACADOR] + pe, 620, 900, 'topo-dir',
                   hid=hid, halos=halos)


# ---------------------------------------------------------------- layout de STORY
# A largura util encolhe quando a marca divide a faixa com o texto: 172px de
# lockup + respiro. Sem isso a headline passa por baixo do selo.
UTIL_STORY_COM_MARCA = UTIL - 210


def L_story(s, hid='ab', halos=None):
    """Story 9:16 em tres arranjos. Regra do DNA que manda aqui:
    o TITULO fica em cima e o rodape guarda so o servico da propria oferta —
    endereco e horario completo so na PRIMEIRA arte do dia.
    """
    arranjo = s.get('arranjo', 'split')
    tam = s.get('tamTitulo', 76)

    cabeca = []
    if s.get('badge'):
        cabeca.append(badge(s['badge']))
    util = UTIL_STORY_COM_MARCA if arranjo in ('split', 'topo') else UTIL
    cabeca.append(titulo(s['titulo'], tam, util, ctx=f"[{s['arq']}] "))
    if s.get('apoio'):
        cabeca.append(apoio(s['apoio'], 54))

    pe = []
    if s.get('desc'):
        pe.append(descricao(s['desc'], 38))
    if s.get('preco'):
        pe.append(preco(s['preco'], s.get('precoNota')))
    for l in s.get('linhas', []):
        pe.append(linha_servico(l['icone'], l['txt']))
    if s.get('assinatura'):
        pe.append(apoio(s['assinatura'], 60, VERMELHO))

    pad = f'{SAFE_STORY_TOPO}px 90px {SAFE_STORY_RODAPE}px'
    if arranjo == 'split':
        # titulo em cima, servico embaixo — a marca acompanha o TOPO, ao lado
        # da headline, porque o rodape de servico usa a largura toda.
        corpo = cabeca + [ESPACADOR] + pe
        return moldura(s['foto'], corpo, 1000, 860, 'story-topo-dir', pad, H_STORY,
                       hid=hid, halos=halos)
    if arranjo == 'topo':
        corpo = cabeca + pe + [ESPACADOR]
        return moldura(s['foto'], corpo, 1180, 420, 'story-base-dir', pad, H_STORY,
                       hid=hid, halos=halos)
    # 'rodape': bloco unico embaixo, foto livre em cima
    corpo = [ESPACADOR] + cabeca + pe
    return moldura(s['foto'], corpo, 420, 1240, 'story-topo-dir', pad, H_STORY,
                   hid=hid, halos=halos)


def L_foto(s, hid='ab', halos=None):
    """Foto PURA: sem veu, sem texto, sem marca. Capa de carrossel."""
    alt = H_STORY if s.get('story') else H
    return (f'<div style="position: relative; width: {W}px; height: {alt}px; '
            f'overflow: hidden; background: {MARROM};">\n'
            f'  <img src="./{s["foto"]}.jpg" alt="" style="position: absolute; left: 0; '
            f'top: 0; width: {W}px; height: {alt}px; object-fit: cover;">\n</div>')


LAYOUTS = {'capa': L_capa, 'item': L_item, 'lista': L_lista, 'fecho': L_fecho,
           'story': L_story, 'foto': L_foto}

PROPS = ('{"veuTopo":{"editor":"range","default":0.80,"min":0.1,"max":0.97,"step":0.02,'
         '"unit":"","section":"Ajustes"},'
         '"veuRodape":{"editor":"range","default":0.86,"min":0.1,"max":0.97,"step":0.02,'
         '"unit":"","section":"Ajustes"},'
         '"$preview":{"width":1080,"height":%d}}')

# No halo cada mancha ja carrega a propria opacidade, medida na foto. O slider
# vira um MULTIPLICADOR do conjunto — e o que preserva no canvas o controle que
# os dois sliders de veu davam ao Ciro, sem pedir um hole por bloco.
PROPS_HALO = ('{"haloForca":{"editor":"range","default":1,"min":0,"max":1.6,"step":0.05,'
              '"unit":"","section":"Ajustes"},'
              '"$preview":{"width":1080,"height":%d}}')

LOGICA = '''class Component extends DCLogic {
  renderVals() {
    return {
      veuTopo: Number(this.props.veuTopo ?? 0.80),
      veuRodape: Number(this.props.veuRodape ?? 0.86),
    };
  }
}'''

LOGICA_HALO = '''class Component extends DCLogic {
  renderVals() {
    return { haloForca: Number(this.props.haloForca ?? 1) };
  }
}'''


def pagina(corpo, props):
    return ('<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n'
            '  <script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
            f'  <style>{FONTES}{"" if USA_HALO else VEU_CSS}\n'
            f'    body {{ margin: 0; background: {MARROM}; }}\n'
            f'    a {{ color: {VERMELHO}; }}\n    a:hover {{ color: #c72611; }}\n  </style>\n</helmet>\n'
            f'{corpo}\n</x-dc>\n<script data-dc-script data-props=\'{props}\'>\n'
            f'{LOGICA_HALO if USA_HALO else LOGICA}\n</script>\n</body>\n</html>\n')


# ---------------------------------------------------------------- calibragem
BASE = os.path.dirname(os.path.abspath(__file__))
INSET_TEXTO, INSET_MARCA = HL.INSET_TEXTO, HL.INSET_MARCA
# A marca so precisa de ASSENTAMENTO, nao de disco atras dela. O numero e
# menor que 1 de proposito; a compensacao por tamanho (halo_espeto.compensar)
# ja cuida de ela nao sumir por ser uma caixa pequena sob blur grande.
ESCALA_MARCA = float(os.environ.get('ESCALA_MARCA', 0.34))
PERCENTIL = int(os.environ.get('PERCENTIL', 88))


def _multiplicavel(css):
    """Deixa a mancha obedecer ao slider `haloForca` do canvas."""
    import re as _re
    return _re.sub(r'rgba\(([\d,]+),([\d.]+)\)',
                   lambda m: f'rgb({m.group(1).replace(",", " ")} / '
                             f'calc(var(--halo-forca, 1) * {m.group(2)}))', css)


def calibrar(foto, rects, W, alt):
    """Uma mancha por grupo, com a luz lida EXATAMENTE onde o grupo pousa."""
    caminho = os.path.join(BASE, 'fotos', f'{foto}.jpg')
    if not os.path.exists(caminho):
        caminho = os.path.join(BASE, f'{foto}.jpg')
    out, diag = {}, []
    for gid, (x0, y0, x1, y1) in rects.items():
        marca_ = gid.endswith(':marca')
        ix, iy = INSET_MARCA if marca_ else INSET_TEXTO
        # A marca e um lockup BRANCO: o alvo dela e o do texto de display.
        alvo = (HL.fundo_maximo('#FFFFFF', HL.RATIO_GRANDE) if marca_
                else HL.alvo_do_grupo(GRUPOS_HTML.get(gid, '')))
        luz = HL.medir_regiao(caminho, x0, y0, x1, y1, W, alt, PERCENTIL)
        css = HL.halo_medido(luz['p'], alvo, x1 - x0, y1 - y0, ix, iy,
                             escala=ESCALA_MARCA if marca_ else 1.0)
        out[gid] = _multiplicavel(css) if css else ''
        diag.append((gid, round(x1 - x0), round(y1 - y0), round(luz['media']),
                     round(luz['p']), round(alvo), css))
    return out, diag


def _guardar_leva_no_ar():
    """Recusa sobrescrever, em silencio, artboards de uma leva que ja publicou.

    🔴 A semana 1 (31/08 a 06/09/2026) foi ao ar com VEU: em 01/09 havia 4
    stories publicados e 12 agendados. Os .dc.html desta pasta sao o registro
    do que foi para o Instagram — rodar `python3 gerar.py` sem pensar troca esse
    registro pelo mecanismo novo, e ninguem percebe, porque o gerador nao
    reclama de nada.

    Nao e para travar a proxima leva: e para a troca ser uma decisao.
      MODO=veu python3 gerar.py     reproduz o que esta no ar (byte a byte)
      CONFIRMAR=1 python3 gerar.py  assume a troca para halo
    """
    if not USA_HALO or os.environ.get('CONFIRMAR'):
        return
    # 🔴 `SO=` NAO isenta. A primeira versao desta guarda isentava, e o autor
    # dela trocou em silencio a arte de um rascunho que estava na agenda
    # (Ter18Marmitex, 01/09/2026) na primeira vez que rodou `SO=` na pasta do
    # repositorio. Regerar um subconjunto grava artboard igual a regerar tudo —
    # o que muda e so o tamanho do estrago.
    so = [x for x in os.environ.get('SO', '').split(',') if x]
    alvos = [a for a in os.listdir('.') if a.endswith('.dc.html')]
    if so:
        alvos = [a for a in alvos if a.replace('.dc.html', '') in so]
    antigos = [a for a in alvos if 'class="veu-t"' in open(a, encoding='utf-8').read()]
    if antigos:
        raise SystemExit(
            f"Esta pasta tem {len(antigos)} artboards gerados com VEU, e eles sao o\n"
            "registro da leva que ja esta publicada/agendada.\n\n"
            "  MODO=veu python3 gerar.py      reproduz o que esta no ar\n"
            "  SO=Nome1,Nome2 CONFIRMAR=1 python3 gerar.py  troca so algumas\n"
            "  CONFIRMAR=1 python3 gerar.py   troca a leva inteira para halo")


if __name__ == '__main__':
    _guardar_leva_no_ar()
    dados = json.load(open('slots.json', encoding='utf-8'))
    mapa, canvas = [], {'artboards': [], 'pages': [], 'launch': {'view': 'canvas', 'page': 'page-1'}}
    PAG = [(b['chave'], f"page-{i+1}", b['nome']) for i, b in enumerate(dados['blocos'])]
    SO = [x for x in os.environ.get('SO', '').split(',') if x]
    primeiro, DIAG = True, []
    for (chave, pid, nome), bloco in zip(PAG, dados['blocos']):
        canvas['pages'].append({'id': pid, 'name': nome})
        for i, s in enumerate(bloco['slides']):
            # O primeiro artboard PRECISA se chamar Main: e o arquivo de entrada
            # do editor, e sem ele o helper avisa e o canvas abre por nome.
            arq = 'Main.dc.html' if primeiro else f"{s['arq']}.dc.html"
            primeiro = False
            alt = H_STORY if s['layout'] == 'story' else H
            if SO and s['arq'] not in SO:
                continue
            hid = s['arq']

            halos = {}
            if USA_HALO and s['layout'] != 'foto':
                # PASSADA 1: a mesma peca sem mancha nenhuma, so para a sonda
                # ler o retangulo de cada grupo. O halo e absoluto e nao entra
                # no fluxo, entao a geometria das duas passadas e identica.
                del AVISOS[:]
                sonda = LAYOUTS[s['layout']](s, hid, {}).replace('{{haloForca}}', '1')
                rects = HL.medir_geometria(sonda, FONTES, BASE, W, alt,
                                           os.path.join(BASE, 'halo-geometria.json'))
                halos, d = calibrar(s['foto'], rects, W, alt)
                DIAG += [(s['arq'],) + x for x in d]

            del AVISOS[:]
            corpo = LAYOUTS[s['layout']](s, hid, halos)
            HL.conferir_divs(corpo, s['arq'])
            base_props = PROPS_HALO if USA_HALO else PROPS
            props = (base_props % alt)
            if not USA_HALO:
                props = (props.replace('"default":0.80', f'"default":{s["veuTopo"]}', 1)
                              .replace('"default":0.86', f'"default":{s["veuRodape"]}', 1))
            open(arq, 'w', encoding='utf-8').write(pagina(corpo, props))
            canvas['artboards'].append({
                'file': arq, 'x': i * (W + 130), 'y': 0, 'w': W, 'h': alt,
                'title': f"{i + 1}/{len(bloco['slides'])} · {s['arq']}", 'page': pid,
            })
            mapa.append({'artboard': arq, 'pagina': nome, 'slide': i + 1, 'nome': s['arq'],
                         'layout': s['layout'], 'foto': s['foto'], 'alt': alt})
    if not SO:
        json.dump(canvas, open('canvas.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        json.dump(mapa, open('mapa.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"{len(mapa)} artboards ({MODO})")
    if DIAG and os.environ.get('DIAG'):
        print(f"\n{'peca':22} {'grupo':8} {'LxA':>11} {'media':>6} {'p88':>5} "
              f"{'alvo':>5}  mancha")
        for arq, gid, w_, h_, med, p_, alvo, css in DIAG:
            if not css:
                print(f"{arq:22} {gid.split(':')[-1]:8} {w_:5}x{h_:<5} {med:6} {p_:5} "
                      f"{alvo:5}  — foto ja escura, sem mancha")
                continue
            a = css.split('rgba(23,14,9,')[1].split(')')[0]
            r = css.split('blur(')[1].split('px')[0]
            print(f"{arq:22} {gid.split(':')[-1]:8} {w_:5}x{h_:<5} {med:6} {p_:5} "
                  f"{alvo:5}  op {a:>5} raio {r:>3}")
    if AVISOS:
        print('\nTITULO QUE NAO CABE (vai quebrar linha sozinho):')
        print('\n'.join(AVISOS))
