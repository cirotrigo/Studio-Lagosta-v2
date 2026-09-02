# -*- coding: utf-8 -*-
"""Emite os .dc.html da semana 1 do By Rock a partir de dados.py.

Dois formatos, com regras diferentes de proposito:
  STORY 1080x1920 - reserva 240px (1/8) em cima e embaixo, que e onde o
    Instagram desenha o avatar e a barra de resposta. Nada de texto ali.
  FEED  1080x1350 - SEM faixa reservada: o Instagram nao desenha por cima do
    feed, e reservar 1/8 aqui comeria a peca.

QUEM DECIDE ONDE O TEXTO ENTRA E A FOTO, nao uma rotacao fixa. fotos-analise.json
traz, para cada foto ja recortada como ela aparece na peca, a energia de borda e a
luminancia da faixa de cima e da de baixo; o texto vai para a faixa CALMA. Foi o
que permitiu aliviar o veu: quando o texto nao cai em cima do assunto, ele nao
precisa de muito escurecimento para se ler. O DNA ja mandava nisso para a logo
("a logo alterna ... dependendo da zona escura disponivel na foto"); aqui a mesma
regra passou a valer para o texto.

O que continua rodando para as pecas nao sairem iguais: a VARIANTE (bloco largo
ou coluna estreita, alternada em dados.py) e o CANTO da logo, que sai do terco
mais calmo da faixa oposta a do texto.
"""
import json, os, re, subprocess, sys, tempfile


# --------------------------------------------------------------------------
# Destaque das palavras-chave (01/09/2026)
# --------------------------------------------------------------------------
def realce(texto):
    """`**palavra**` vira BRANCO com peso 500 sobre o apoio cinza.

    O Ciro pediu destaque em 3 das 7 correcoes de 01/09 ("destaque as palavras
    chaves para facilitar a leitura"). O apoio saia inteiro em #CCCCCC, no
    mesmo peso — o que o DNA chama de bloco unico e ele chamou de "dificulta a
    leitura".

    O realce e BRANCO, nao vermelho: o DNA reserva o #C82020 para a manchete
    ("destacando palavras-chave em manchetes") e para filetes. Vermelho no
    apoio criaria um segundo foco competindo com o titulo.
    """
    return re.sub(r"\*\*(.+?)\*\*",
                  f'<span style="color: {BRANCO}; font-weight: 500;">\\1</span>',
                  texto)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dados import STORIES, FEED, HORARIO, ENDERECO
from _entrega import escrever_entrega  # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
VERMELHO, BRANCO, CINZA, PRETO = "#C82020", "#FFFFFF", "#CCCCCC", "#111111"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
REF = 100
DISPONIVEL = 1080 - 2 * 72

# Sombra de leitura, presa ao glifo. E ela que faz o veu poder ser leve: o halo
# resolve o contraste no PONTO onde a letra cai, sem escurecer a fotografia.
SOMBRA_MANCHETE = "0 2px 20px rgba(17,17,17,0.80), 0 0 52px rgba(17,17,17,0.58)"
SOMBRA_TEXTO = "0 1px 14px rgba(17,17,17,0.80)"

HELMET = (
    '<helmet>\n'
    '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
    'family=Anton&family=Barlow:ital,wght@0,400;0,500;1,400&display=swap">\n'
    '  <style>\n    body { margin: 0; }\n'
    '    a { color: #C82020; } a:hover { color: #a51a1a; }\n  </style>\n'
    '</helmet>'
)

ANALISE = json.load(open(os.path.join(BASE, "fotos-analise.json"), encoding="utf-8"))


# --------------------------------------------------------------------------
# Onde o texto entra
# --------------------------------------------------------------------------
def escolher_banda(foto, tem_rodape):
    """'topo' ou 'baixo' — a faixa mais calma da foto."""
    d = ANALISE[foto]
    et, eb = d["topo"]["energia"], d["baixo"]["energia"]
    maior = max(et, eb) or 1
    if abs(et - eb) / maior > 0.12:
        return "topo" if et < eb else "baixo"
    # empate: as duas faixas sao igualmente cheias (ou igualmente calmas).
    # Vence a MAIS ESCURA, que e a que precisa de menos veu.
    return "topo" if d["topo"]["luz"] <= d["baixo"]["luz"] else "baixo"


# --------------------------------------------------------------------------
# Medicao da faixa REAL onde um bloco pousa (01/09/2026)
# --------------------------------------------------------------------------
# 🔴 `fotos-analise.json` mede DUAS faixas fixas ("topo" e "baixo") de uma
# geometria que ja nao existe. Quando a margem do rodape caiu de 240 para 80,
# o bloco de servico desceu ~160px e passou a pousar numa regiao que aquele
# JSON nao representa — a faixa "baixo" dele inclui o prato INTEIRO, entao ela
# respondia sobre a borda branca do prato, nao sobre onde a letra cai.
#
# Medido no s01: o JSON diz que a direita e mais calma (energia 12,5 contra
# 14,2) e mais escura (159 contra 196), e pela foto renderizada e o contrario
# na altura do rodape. Os dois numeros estao certos — sobre regioes
# diferentes. Geometria que muda invalida medicao guardada.
_CACHE_FAIXA = {}


def medir_faixa(foto, y0, y1, W, H):
    """Energia e luz dos tercos de uma faixa, na foto COMO ELA APARECE na peca.

    Simula o `object-fit: cover` do artboard: a foto e escalada para cobrir
    WxH e centrada, entao o recorte medido e exatamente o que o leitor ve.
    Le de `fotos/` (a original), que e a que o render publica — a copia da
    raiz e a comprimida do canvas.
    """
    chave = (foto, y0, y1, W, H)
    if chave in _CACHE_FAIXA:
        return _CACHE_FAIXA[chave]

    from PIL import Image, ImageFilter, ImageStat
    caminho = os.path.join(BASE, "fotos", foto)
    if not os.path.exists(caminho):
        caminho = os.path.join(BASE, foto)
    im = Image.open(caminho).convert("RGB")

    escala = max(W / im.width, H / im.height)
    im = im.resize((max(1, round(im.width * escala)), max(1, round(im.height * escala))),
                   Image.LANCZOS)
    ex, ey = (im.width - W) // 2, (im.height - H) // 2
    im = im.crop((ex, ey, ex + W, ey + H)).crop((0, max(0, y0), W, min(H, y1)))

    out = {}
    larg = im.width // 3
    for i, nome in enumerate(("esquerda", "centro", "direita")):
        t = im.crop((i * larg, 0, (i + 1) * larg, im.height)).convert("L")
        out[nome] = {
            "luz": ImageStat.Stat(t).mean[0],
            # FIND_EDGES devolve a variacao local; a media dela e o quanto
            # aquele pedaco e "cheio" — mesma nocao de energia do JSON.
            "energia": ImageStat.Stat(t.filter(ImageFilter.FIND_EDGES)).mean[0],
        }
    _CACHE_FAIXA[chave] = out
    return out


def lados_do_rodape(foto, y0=None, y1=None, W=1080, H=1920):
    """Servico no lado mais CALMO do rodape; logo no lado oposto.

    O texto principal ja escolhia a faixa calma (`escolher_banda`) e a logo ja
    escolhia o terco calmo (`canto_da_logo`) — o SERVICO era o unico elemento
    que pousava onde calhasse. Era por isso que ele caia sobre o prato branco
    mesmo com a peca inteira medida: ninguem nunca perguntou onde ele ia.

    So os EXTREMOS concorrem. O centro do rodape e onde o prato costuma estar
    (a foto e centrada no assunto) e, mesmo quando esta calmo, servico
    centralizado nao e a diagramacao desta marca — o texto e alinhado a
    esquerda em toda a peca.
    """
    t = (medir_faixa(foto, y0, y1, W, H) if y0 is not None
         else ANALISE[foto]["baixo"]["tercos"])
    # A LUZ manda aqui, nao a energia: o texto do servico e claro e pequeno, e
    # o que o mata e fundo CLARO (a borda do prato), nao fundo cheio. Madeira
    # escura com veio e "cheia" e continua sendo o melhor lugar para ele.
    esq = (round(t["esquerda"]["luz"]), round(t["esquerda"]["energia"], 1))
    dir_ = (round(t["direita"]["luz"]), round(t["direita"]["energia"], 1))
    return ("esquerda", "direita") if esq <= dir_ else ("direita", "esquerda")


def canto_da_logo(foto, banda_da_logo):
    """Terco mais calmo da faixa onde a logo vai; escuro desempata."""
    tercos = ANALISE[foto][banda_da_logo]["tercos"]
    return min(tercos, key=lambda k: (round(tercos[k]["energia"], 1), tercos[k]["luz"]))


def _op(luz, minimo, maximo):
    """Opacidade do veu em funcao do BRILHO MEDIDO da faixa que ele cobre.

    Veu constante erra dos dois lados: sobra em faixa escura (tampa a foto sem
    precisar) e falta em faixa clara (o texto some). Aqui ele acompanha a foto.
    """
    t = (max(50.0, min(210.0, luz)) - 50.0) / 160.0
    return round(minimo + t * (maximo - minimo), 3)


def halo(luz, escala=1.0):
    """Caixa escura ATRAS do texto, desfocada — a alternativa ao veu.

    Ideia do Ciro em 01/09/2026, depois de reprovar o veu duas vezes ("o veu
    ficou muito marcado", "essa estrategia de usar o veu nao vai funcionar").

    O veu e um GRADIENTE SOBRE O QUADRO INTEIRO: para dar contraste no ponto
    onde a letra cai, ele escurece uma faixa de centenas de pixels, e o que a
    peca perde e a fotografia — o oposto do que o DNA pede. O halo escurece
    APENAS a area do bloco de texto e desmancha nas bordas.

    🔴 E `filter: blur()` na PROPRIA caixa, nao `backdrop-filter: blur()`.
    A distincao e do Ciro e e o coracao da ideia: `backdrop-filter` desfocaria
    a FOTOGRAFIA atras (lente fora de foco, que descaracteriza a foto);
    `filter` desmancha a mancha escura e deixa a foto intacta e nitida por
    baixo. Nao troque um pelo outro achando que e equivalente.

    O blur espalha ~3x o raio, entao a caixa nasce MENOR que a area coberta e
    o inset negativo mais o desfoque e que produzem a borda difusa. A
    intensidade acompanha o brilho MEDIDO da faixa, como o veu ja fazia — em
    foto escura o halo quase nao aparece.
    """
    # Raio GRANDE de proposito (01/09/2026, 2a rodada): "ele pode esfumacar
    # mais para a marcacao ficar menos perceptivel". Com 46-62px ainda se
    # enxergava onde a caixa comecava e terminava; acima de ~90 a borda
    # desmancha e o que sobra le como sombra da propria cena.
    #
    # A opacidade SOBE junto porque o blur dilui: espalhar a mesma tinta por
    # uma area maior clareia o centro, que e justamente onde a letra cai.
    # Aumentar o raio sem compensar a tinta troca "marcacao visivel" por
    # "texto sem contraste" — os dois defeitos que este halo existe para
    # resolver ao mesmo tempo.
    # 3a rodada (01/09): "pode aumentar ainda mais o esfumacado". 88-112 ->
    # 124-158. A tinta sobe de novo pelo mesmo motivo: raio maior dilui o
    # centro, que e onde a letra cai.
    a = _op(luz, 0.62, 0.97) * escala
    raio = int(_op(luz, 124, 158))
    return (f'background: rgba(17,17,17,{round(min(a, 0.95),3)}); '
            f'filter: blur({raio}px); border-radius: {raio + 60}px;')


def veu(banda, luz_banda, rodape_solto, luz_baixo, H, padV):
    """Veu LOCAL, ANCORADO NA ZONA DO TEXTO.

    Duas coisas que o veu anterior errava:

    1. Era um degrade sobre o quadro INTEIRO, com 0,96 numa ponta — resolvia a
       leitura tampando a foto, o oposto do que o DNA pede (a fotografia e a
       protagonista). Aqui ele morre antes de 40% e a intensidade sai da medicao.

    2. Estava ancorado na BORDA do quadro. No story a borda e faixa de seguranca
       (240px onde nao pode haver texto), entao a parte forte do degrade caia
       onde nao ha nada e o texto ficava na cauda ja quase transparente — foi por
       isso que a linha de servico sumiu sobre prato claro. Agora o platO cobre
       de padV ate padV+330, que e onde o bloco de texto de fato esta.
    """
    def pc(px):
        return round(100.0 * px / H, 1)

    partes = []
    a = _op(luz_banda, 0.52, 0.88)
    sentido = "to top" if banda == "baixo" else "to bottom"
    partes.append(
        f"linear-gradient({sentido}, rgba(17,17,17,{a}) 0%, "
        f"rgba(17,17,17,{a}) {pc(padV + 330)}%, "
        f"rgba(17,17,17,{round(a*0.42,3)}) {pc(padV + 400)}%, "
        f"rgba(17,17,17,0) {pc(padV + 470)}%)")

    if rodape_solto:
        # o texto ficou em cima e so a linha de servico desceu. Ela cai sobre
        # prato branco com frequencia, entao o brilho medido manda mais aqui.
        b = _op(luz_baixo, 0.60, 0.94)
        partes.append(
            f"linear-gradient(to top, rgba(17,17,17,{b}) 0%, "
            f"rgba(17,17,17,{b}) {pc(padV + 90)}%, "
            f"rgba(17,17,17,{round(b*0.45,3)}) {pc(padV + 190)}%, "
            f"rgba(17,17,17,0) {pc(padV + 300)}%)")
    return ", ".join(partes)


# --------------------------------------------------------------------------
# Medicao da manchete (a manchete e DUAS linhas por contrato do DNA; uma linha
# que nao cabe quebra sozinha e vira manchete de tres)
# --------------------------------------------------------------------------
def medir(linhas):
    itens = "".join(f'<span class="m" data-i="{i}">{t}</span>' for i, t in enumerate(linhas))
    pagina = (
        '<!doctype html><html><head><meta charset="utf-8">'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
        'family=Anton&display=swap">'
        "<style>.m{font-family:'Anton',sans-serif;font-size:" + str(REF) + "px;"
        "letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;"
        "display:inline-block}</style></head><body>"
        + itens +
        '<div id="out"></div><script>'
        'document.fonts.load("' + str(REF) + 'px Anton").then(()=>document.fonts.ready).then(()=>{'
        'const o={};document.querySelectorAll(".m").forEach(e=>{'
        'o[e.dataset.i]=e.getBoundingClientRect().width});'
        'document.getElementById("out").textContent="W"+"IDTHS:"+JSON.stringify(o);});'
        '</script></body></html>')
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write(pagina); caminho = f.name
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--dump-dom",
                        "--virtual-time-budget=15000", f"file://{caminho}"],
                       capture_output=True, text=True)
    os.remove(caminho)
    m = re.search(r'WIDTHS:(\{.*?\})</div>', r.stdout, re.S)
    if not m:
        raise SystemExit("nao consegui medir as manchetes no Chrome — sem medida real, "
                         "a manchete pode quebrar em 3 linhas em silencio")
    bruto = json.loads(m.group(1))
    return {linhas[int(i)]: w for i, w in bruto.items()}


def corpo_da_manchete(m1, m2, base, disponivel, larguras):
    maior = max(larguras.get(m1, 0), larguras.get(m2, 0))
    if maior <= 0:
        return base
    return max(52, min(base, int(disponivel / maior * REF)))


# --------------------------------------------------------------------------
# Desenho
# --------------------------------------------------------------------------
ONDAS = [[4, 10, 16, 8, 4, 12, 6], [6, 14, 8, 16, 5, 9, 12], [10, 4, 14, 7, 16, 6, 10],
         [5, 12, 6, 15, 9, 4, 13], [8, 16, 5, 11, 6, 14, 7]]


def onda(idx, w=190, cor=VERMELHO):
    barras = ONDAS[idx % len(ONDAS)]
    h, passo, larg = 16, 12, 5
    p = [f'<rect x="{i*passo}" y="{(h-a)/2:g}" width="{larg}" height="{a}" fill="{cor}"></rect>'
         for i, a in enumerate(barras)]
    fim = len(barras) * passo
    p.append(f'<rect x="{fim}" y="{h/2-1:g}" width="{w-fim}" height="2" fill="{cor}"></rect>')
    return (f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" fill="none" '
            f'xmlns="http://www.w3.org/2000/svg">{"".join(p)}</svg>')


def alinha(canto):
    return {"esquerda": "flex-start", "direita": "flex-end"}.get(canto, "center")


def bloco_logo(alt, canto, halo_css=""):
    """A marca, com o MESMO halo do texto quando o veu nao existe mais.

    🔴 O radial de 0,44 que ficava aqui foi calibrado para conviver COM o veu:
    ele era o reforco local sobre um quadro que ja estava escurecido. Tirado o
    veu, ele sozinho nao segura — medido em 01/09/2026 na primeira peca com
    halo: a logo (vermelha com letra branca) praticamente sumiu sobre o prato
    branco. Quem troca o mecanismo de contraste precisa trocar em TODOS os
    elementos que dependiam dele, nao so no texto.

    A escala e maior que a do texto porque a marca nao tem `text-shadow` presa
    ao glifo — o halo e o unico contraste que ela tem.
    """
    return (f'<div style="display: flex; justify-content: {alinha(canto)}; width: 100%;">'
            + logo_nua(alt, halo_css) + '</div>')


def logo_nua(alt, halo_css=""):
    """A marca SEM wrapper de largura — para quando ela divide a linha.

    🔴 O wrapper de `width: 100%` dentro de um pai `flex: 0 0 auto` cria um
    conflito circular: o pai se dimensiona pelo conteudo e o conteudo pede a
    largura do pai. Medido em 01/09/2026 no s07: a logo saiu ABAIXO do
    servico e deslocada, em vez de no extremo oposto — "a posicao nao encaixou
    bem". Quem entra num flex row lado a lado nao pode carregar largura total.
    """
    fundo = halo_css or ('background: radial-gradient(ellipse at center, '
                         'rgba(17,17,17,0.44) 0%, rgba(17,17,17,0.24) 46%, '
                         'rgba(17,17,17,0) 72%);')
    if halo_css:
        return (f'<div style="position: relative; padding: 24px 38px;">'
                f'<div style="position: absolute; left: -30px; right: -30px; top: -26px; '
                f'bottom: -26px; z-index: 0; pointer-events: none; {halo_css}"></div>'
                f'<img src="./logo-byrock.png" alt="By Rock" style="position: relative; '
                f'z-index: 1; height: {alt}px; width: auto; display: block;"></div>')
    return (f'<div style="padding: 24px 38px; {fundo}">'
            f'<img src="./logo-byrock.png" alt="By Rock" '
            f'style="height: {alt}px; width: auto; display: block;"></div>')


def bloco_rodape(esc, halo_css=''):
    """Servico em DUAS linhas, com o horario destacado (01/09/2026).

    Duas correcoes do Ciro no mesmo dia: "as fontes do horario do endereco
    ficaram muito pequena, nao da pra ler bem" e "aumente o tamanho da fonte,
    estilize melhor destacando o horario".

    O 23px anterior e ~1,2% da altura de um story de 1920 — visto no celular a
    ~450px de altura, vira menos de 6px reais. A regra da casa que saiu dessas
    correcoes: o servico e o MENOR nivel de texto da peca, mas confortavelmente
    legivel; havendo conflito entre "ser o menor" e "ser legivel", a
    legibilidade vence.

    O horario sobe para branco e peso 500 porque e a informacao acionavel; o
    endereco fica em cinza, um degrau menor. O separador " · " some: ele era
    diagramacao fazendo o papel de quebra de linha.
    """
    marca = (f'<div style="position: absolute; left: -46px; right: -46px; top: -36px; '
             f'bottom: -36px; z-index: 0; pointer-events: none; {halo_css}"></div>'
             if halo_css else '')
    return (
        '<div style="position: relative; width: fit-content; display: flex; '
        'flex-direction: column; gap: 6px;">' + marca + '<div style="position: relative; z-index: 1;">'
        f'<div style="font-size: {esc["rodape"]}px; line-height: 1.30; color: {BRANCO}; '
        f'font-weight: 500; letter-spacing: 0.3px; text-shadow: {SOMBRA_TEXTO};">'
        f'{HORARIO}</div>'
        f'<div style="font-size: {esc["endereco"]}px; line-height: 1.30; color: {CINZA}; '
        f'letter-spacing: 0.3px; text-shadow: {SOMBRA_TEXTO};">{ENDERECO}</div>'
        # DOIS fechamentos: o interno (z-index) e o externo (fit-content).
        # Faltava o segundo — e HTML desbalanceado nao da erro nenhum: o
        # parser apenas ANINHA o que vem depois. Foi assim que a logo foi
        # parar dentro do slot do servico e a peca saiu com os dois
        # empilhados, com o `justify-content: space-between` intacto no CSS.
        '</div></div>')


def bloco_texto(m1, m2, apoio, fecho, esc, largura, idx, corpo, halo_css=''):
    p = []
    for txt, cor in ((m1, BRANCO), (m2, VERMELHO)):
        p.append(f'<div style="font-family: \'Anton\', \'Barlow\', sans-serif; '
                 f'font-size: {corpo}px; line-height: 0.94; letter-spacing: 0.5px; '
                 f'color: {cor}; text-transform: uppercase; white-space: nowrap; '
                 f'text-shadow: {SOMBRA_MANCHETE};">{txt}</div>')
    p.append(f'<div style="margin-top: {esc["gap"]}px;">{onda(idx, esc["onda"])}</div>')
    # A DESCRIÇÃO em caixa alta (pedido do Ciro, 01/09/2026), o SERVIÇO não.
    #
    # O DNA da marca proíbe "caixa alta em todos os campos" — e continua
    # valendo: com manchete e apoio em caixa e o serviço em caixa natural, são
    # dois de três, não todos. É o serviço que segura a regra, então ele NÃO
    # pode ganhar uppercase junto sem revisitar o DNA.
    #
    # A entrelinha cai de 1.40 para 1.34: maiúscula não tem descendente (g, p,
    # q), então o mesmo 1.40 abre um vão visual maior entre as linhas.
    p.append(f'<div style="margin-top: {esc["gap"]}px; font-size: {esc["apoio"]}px; '
             f'line-height: 1.34; color: {CINZA}; max-width: {largura}px; '
             f'text-transform: uppercase; letter-spacing: 0.2px; '
             f'text-shadow: {SOMBRA_TEXTO};">{realce(apoio)}</div>')
    if fecho:
        p.append(f'<div style="margin-top: {esc["gapFecho"]}px; font-size: {esc["fecho"]}px; '
                 f'line-height: 1.30; font-style: italic; color: {BRANCO}; '
                 f'text-shadow: {SOMBRA_TEXTO};">{fecho}</div>')
    # Cada linha vira item de flex DENTRO do wrapper (armadilha 4.1 preservada);
    # o halo e irmao delas, absoluto, e nao entra no fluxo. `width: fit-content`
    # e o que faz a mancha ter a largura do TEXTO e nao da coluna inteira.
    filhos = "".join(f'<div style="position: relative; z-index: 1;">{x}</div>' for x in p)
    marca = (f'<div style="position: absolute; left: -54px; right: -54px; top: -44px; '
             f'bottom: -44px; z-index: 0; pointer-events: none; {halo_css}"></div>'
             if halo_css else '')
    return ('<div style="position: relative; width: fit-content; max-width: '
            f'{largura + 108}px; display: flex; flex-direction: column; '
            'align-items: flex-start;">' + marca + filhos + '</div>')


# --------------------------------------------------------------------------
# Acabamento: contraste leve + grao, por cima de TUDO (01/09/2026)
# --------------------------------------------------------------------------
# Pedido do Ciro: "depois de diagramar tudo, aplicar uma camada leve de
# contraste e um leve ruido/grao, bem sutil por cima de tudo, na foto e nas
# fontes". E o que da unidade a peca — sem isso a letra vetorial e a fotografia
# parecem dois materiais colados; o grao comum e o que faz as duas parecerem a
# mesma imagem.
#
# 🔴 O grao e um <svg> INLINE, nao `background-image: url("data:...")`. A
# armadilha 4.7 do manual custou quatro slides publicados com fundo preto: a
# substituicao do runtime do canvas so alcanca o atributo `src` de <img>, e
# `url()` no CSS nao resolve. SVG inline nao depende de resolucao nenhuma.
#
# O `filter="url(#grao-xx)"` DENTRO do svg e outra coisa: e referencia a um
# fragmento do proprio documento, que sempre resolve. Mas o id PRECISA ser
# unico por peca — varios artboards convivem na mesma pagina do canvas, e ids
# repetidos fazem um filtro sobrescrever o outro.
CONTRASTE = float(os.environ.get("CONTRASTE", "1.06"))
SATURACAO = float(os.environ.get("SATURACAO", "1.03"))
GRAO_OPACIDADE = float(os.environ.get("GRAO", "0.13"))


def camada_de_grao(pid, W, H):
    fid = f"grao-{pid}"
    return (
        f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
        f'xmlns="http://www.w3.org/2000/svg" style="position: absolute; top: 0; '
        f'left: 0; width: {W}px; height: {H}px; z-index: 9; pointer-events: none; '
        f'mix-blend-mode: overlay; opacity: {GRAO_OPACIDADE};">'
        f'<filter id="{fid}" x="0" y="0" width="100%" height="100%">'
        # fractalNoise com baseFrequency alta = gra fino, de filme. Valor baixo
        # produz manchas grandes, que leem como sujeira e nao como grao.
        f'<feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" '
        f'stitchTiles="stitch" result="n"/>'
        f'<feColorMatrix in="n" type="saturate" values="0"/>'
        f'</filter>'
        f'<rect width="{W}" height="{H}" filter="url(#{fid})"/>'
        f'</svg>')


def conferir_divs(html, quem):
    """Recusa artboard com <div> desbalanceado.

    🔴 Existe porque HTML malformado NAO da erro: o navegador fecha as tags
    sozinho, aninhando o que vier depois, e a peca sai renderizada e errada
    sem uma linha de aviso. Em 01/09/2026 um `</div>` faltando no bloco de
    servico pos a logo DENTRO do slot dele — o CSS estava correto, o layout
    nao, e so uma sonda de geometria no Chrome achou. Custa milissegundos e
    pega a classe inteira de defeito.
    """
    abre = len(re.findall(r"<div\b", html))
    fecha = html.count("</div>")
    if abre != fecha:
        raise SystemExit(f"{quem}: <div> desbalanceado — {abre} abrem, {fecha} fecham")


def moldura(W, H, foto, veu_css, miolo, pid=""):
    return (
        '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n'
        '  <script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n'
        + HELMET + '\n'
        + f'<div style="width: {W}px; height: {H}px; position: relative; overflow: hidden; '
          f'background-color: {PRETO}; font-family: \'Barlow\', system-ui, sans-serif; '
          f'filter: contrast({CONTRASTE}) saturate({SATURACAO});">\n'
        + f'  <img src="./{foto}" alt="" style="position: absolute; top: 0; left: 0; '
          f'width: {W}px; height: {H}px; object-fit: cover; display: block;">\n'
        + (f'  <div style="position: absolute; top: 0; left: 0; width: {W}px; height: {H}px; '
           f'background: {veu_css};"></div>\n' if veu_css else '')
        + ('  ' + miolo + '\n' if miolo else '')
        + ('  ' + camada_de_grao(pid, W, H) + '\n' if pid else '')
        + '</div>\n</x-dc>\n</body>\n</html>\n')


def montar(variante, foto, m1, m2, apoio, fecho, rodape, W, H, esc, idx, corpo, canto_fixo="auto", pid=""):
    if variante == "foto-pura":
        # Capa de carrossel: SO a fotografia. Sem texto, sem logo e sem veu.
        return moldura(W, H, foto, None, None, pid), {"banda": "-", "logo": "-"}

    d = ANALISE[foto]
    banda = escolher_banda(foto, rodape)
    banda_logo = "baixo" if banda == "topo" else "topo"
    # o canto sai da medicao, MENOS quando dados.py crava um: a medicao ve
    # borda, nao significado, e nao tem como saber que o letreiro da propria
    # casa dentro da foto ja e uma marca (duas marcas na mesma peca).
    canto = canto_fixo if canto_fixo != "auto" else canto_da_logo(foto, banda_logo)
    rodape_solto = rodape and banda == "topo"

    largura = esc["colunaLarga"] if variante == "bloco" else esc["colunaEstreita"]
    # MODO=halo (padrao): mancha escura desfocada so atras do texto.
    # MODO=veu: o gradiente sobre o quadro inteiro, mantido para comparacao.
    usa_halo = MODO == "halo"
    halo_texto = halo(d[banda]["luz"]) if usa_halo else ""
    texto = bloco_texto(m1, m2, apoio, fecho, esc, largura, idx, corpo, halo_texto)
    # Sutil por pedido do Ciro (01/09): a marca nao precisa de disco atras
    # dela, so de um assentamento. Era 1,25 quando o halo tinha raio pequeno;
    # com o raio novo, 0,72 ja e mais tinta que antes.
    halo_logo = halo(d[banda_logo]["luz"], 0.72) if usa_halo else ""
    logo = bloco_logo(esc["logo"], canto, halo_logo)
    halo_rod = ""
    lado_logo_real = None

    if banda == "topo":
        # o endereco fica SEMPRE no rodape da peca (regra aprendida do DNA), e
        # com o titulo em cima ele desce sozinho, sem arrastar o resto.
        if rodape:
            # Lado a lado, alinhados pela BASE: alem de pousar cada um no seu
            # lado calmo, isso devolve ~140px de altura para a fotografia, que
            # e a protagonista. Empilhados, servico e logo ocupavam duas
            # alturas para dizer duas coisas curtas.
            # a faixa do rodape: do topo do bloco ate a borda de baixo
            alt_rod = esc["rodape"] + esc["endereco"] + 6 + 60
            y0r, y1r = H - esc["padBase"] - alt_rod, H - esc["padBase"]
            lado_serv, lado_logo = lados_do_rodape(foto, y0r, y1r, W, H)
            lado_logo_real = lado_logo
            # 🔴 Cada halo e calibrado pela luz do TERCO onde ele pousa, nao
            # pela media da faixa inteira. Medido no s07: a faixa grande do
            # JSON dizia 180-239 e o rodape real e 46-70 — o halo saia 3x mais
            # escuro que o necessario, justamente o "muito marcado" que este
            # mecanismo veio corrigir.
            faixa_r = medir_faixa(foto, y0r, y1r, W, H)
            halo_rod = halo(faixa_r[lado_serv]["luz"], 1.05) if usa_halo else ""
            halo_marca = halo(faixa_r[lado_logo]["luz"], 0.72) if usa_halo else ""
            serv = bloco_rodape(esc, halo_rod)
            logo_r = logo_nua(esc["logo"], halo_marca)
            esquerda, direita = ((serv, logo_r) if lado_serv == "esquerda"
                                 else (logo_r, serv))
            pe = ('<div style="display: flex; flex-direction: row; '
                  'justify-content: space-between; align-items: flex-end; '
                  f'gap: 40px; width: 100%;">'
                  f'<div style="flex: 0 1 auto;">{esquerda}</div>'
                  f'<div style="flex: 0 0 auto;">{direita}</div></div>')
        else:
            pe = logo
        topo_slot, base_slot = texto, (
            '<div style="display: flex; flex-direction: column; align-items: flex-start; '
            f'gap: 20px; width: 100%;">{pe}</div>')
    else:
        corpo_baixo = texto + (f'<div style="margin-top: {esc["gap"]+8}px;">'
                               f'{bloco_rodape(esc, halo_texto)}</div>' if rodape else '')
        topo_slot, base_slot = logo, (
            '<div style="display: flex; flex-direction: column; align-items: flex-start;">'
            f'{corpo_baixo}</div>')

    miolo = (f'<div style="position: relative; width: {W}px; height: {H}px; box-sizing: border-box; '
             f'padding: {esc["padTopo"]}px 72px {esc["padBase"]}px; '
             f'display: flex; flex-direction: column; '
             f'justify-content: space-between;">{topo_slot}{base_slot}</div>')
    css = ("" if usa_halo
           else veu(banda, d[banda]["luz"], rodape_solto, d["baixo"]["luz"], H, esc["padTopo"]))
    return moldura(W, H, foto, css, miolo, pid), {
        # o lado REALMENTE usado — no rodape lado a lado quem manda e
        # `lados_do_rodape`, nao o `canto_da_logo` da faixa inteira
        "banda": banda, "logo": lado_logo_real or canto,
        "luzTexto": round(d[banda]["luz"]), "luzRodape": round(d["baixo"]["luz"]) if rodape_solto else None}


# `padV` do story e a SAFE AREA do Instagram (240 = 1/8 de 1920), nao respiro
# estetico: e onde o app desenha o avatar em cima e a barra de resposta
# embaixo. O Ciro pediu 90px em 01/09 — a troca esta em MARGEM_STORY para as
# duas versoes poderem ser comparadas lado a lado antes de valer para a leva.
# As duas margens do story sao DIFERENTES de proposito (01/09/2026).
#
# O que o Instagram desenha em cima e embaixo nao tem a mesma altura: no topo
# ficam o avatar, o nome do perfil e a barra de progresso; embaixo, so a caixa
# "Enviar mensagem". Uma reserva simetrica de 240px tratava os dois como iguais
# e empurrava o bloco de servico para o meio da peca — foi assim que o rodape
# passou a cair EM CIMA DO PRATO ("o rodape esta muito alto", Ciro, 01/09).
# Rodape mais baixo devolve area para a fotografia, que e a protagonista.
MARGEM_TOPO = int(os.environ.get("MARGEM_TOPO", "140"))
MARGEM_BASE = int(os.environ.get("MARGEM_BASE", "80"))
MODO = os.environ.get("MODO", "halo")

ESC_STORY = dict(manchete=92, apoio=36, fecho=30, rodape=35, endereco=30, logo=120,
                 gap=24, gapFecho=26, onda=190,
                 padTopo=MARGEM_TOPO, padBase=MARGEM_BASE,
                 colunaLarga=760, colunaEstreita=620)
ESC_FEED = dict(manchete=86, apoio=33, fecho=27, rodape=32, endereco=27, logo=94,
                gap=22, gapFecho=24, onda=180, padTopo=72, padBase=72,
                colunaLarga=780, colunaEstreita=640)


def main():
    linhas = []
    for st in STORIES:
        linhas += [st[6], st[7]]
    for c in FEED.values():
        for sl in c["slides"]:
            linhas += [sl[4], sl[5]]
    larguras = medir([l for l in dict.fromkeys(linhas) if l.strip()])

    plano, n, encolhidas, entrega = {}, 0, [], []
    for i, (pid, _d, _h, variante, _logo, foto, m1, m2, apoio, fecho, rodape) in enumerate(STORIES):
        corpo = corpo_da_manchete(m1, m2, ESC_STORY["manchete"], DISPONIVEL, larguras)
        if corpo < ESC_STORY["manchete"]:
            encolhidas.append(f"{pid} {ESC_STORY['manchete']}->{corpo}px")
        html, esc = montar(variante, foto, m1, m2, apoio, fecho, rodape, 1080, 1920, ESC_STORY, i, corpo, _logo, pid)
        conferir_divs(html, pid)
        open(os.path.join(BASE, f"{pid}.dc.html"), "w", encoding="utf-8").write(html)
        plano[pid] = dict(variante=variante, foto=foto, rodape=rodape, **esc)
        entrega.append({'arquivo': f"render/{pid}.png",
                        'textos': [m1, m2, apoio, fecho] + ([HORARIO, ENDERECO] if rodape else []),
                        'quando': f"{_d} {_h}"})
        n += 1
    for c in FEED.values():
        for i, (sid, variante, _logo, foto, m1, m2, apoio) in enumerate(c["slides"]):
            corpo = corpo_da_manchete(m1, m2, ESC_FEED["manchete"], DISPONIVEL, larguras)
            if corpo < ESC_FEED["manchete"]:
                encolhidas.append(f"{sid} {ESC_FEED['manchete']}->{corpo}px")
            html, esc = montar(variante, foto, m1, m2, apoio, "", False, 1080, 1350, ESC_FEED, i, corpo, _logo, sid)
            conferir_divs(html, sid)
            open(os.path.join(BASE, f"{sid}.dc.html"), "w", encoding="utf-8").write(html)
            plano[sid] = dict(variante=variante, foto=foto, rodape=False, **esc)
            # capa foto-pura tem manchete vazia: a lista limpa vira [] (afirmacao).
            entrega.append({'arquivo': f"render/{sid}.png", 'textos': [m1, m2, apoio]})
            n += 1

    json.dump(plano, open(os.path.join(BASE, "plano.json"), "w", encoding="utf-8"),
              indent=1, ensure_ascii=False)
    escrever_entrega(entrega, BASE)
    print(f"{n} artboards escritos em {BASE}")
    print("manchetes reduzidas: " + (", ".join(encolhidas) if encolhidas else "nenhuma"))
    topo = sum(1 for v in plano.values() if v["banda"] == "topo")
    baixo = sum(1 for v in plano.values() if v["banda"] == "baixo")
    print(f"texto na faixa de cima: {topo} · na de baixo: {baixo} · capa foto-pura: "
          f"{sum(1 for v in plano.values() if v['banda'] == '-')}")


if __name__ == "__main__":
    main()
