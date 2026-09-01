# -*- coding: utf-8 -*-
"""HALO — a alternativa ao veu para dar leitura ao texto sobre foto.

Ideia do Ciro em 01/09/2026, depois de reprovar o veu duas vezes ("o veu ficou
muito marcado", "essa estrategia de usar o veu nao vai funcionar"). Extraido do
gerador do By Rock, onde foi desenhado, medido e aprovado.

O QUE MUDA
----------
O veu e um GRADIENTE SOBRE A FAIXA INTEIRA (classes `.veu-t` / `.veu-b`): para
dar contraste no ponto onde a letra cai, escurece centenas de pixels de foto. O
halo escurece APENAS a area do bloco de texto e desmancha nas bordas.

Medido na mesma peca, mesmo texto (By Rock s01, 01/09/2026):

    | mecanismo | luminancia media | saturacao media |
    |-----------|-----------------:|----------------:|
    | veu       |             94,7 |           116,7 |
    | halo      |            109,9 |           125,8 |

O halo devolve +16% de luz e +8% de cor a fotografia, que e a protagonista pelo
DNA de todas as marcas da carteira.

⚠️ A coluna "saturacao" acima e HSV, e HSV MENTE quando a tinta tem cor. O veu
do Espeto e um marrom saturado (`rgb(23 14 9)`): compor um pixel acinzentado em
direcao a ele AUMENTA a saturacao HSV, porque S = (max-min)/max e o marrom tem
matiz forte. Medido em 7 pecas do Espeto (01/09/2026): pelo HSV o veu "ganhava"
2,4% de saturacao, enquanto as bandejas de marmitex e a piscina de bolinhas
estavam visivelmente mortas. A medida que responde a pergunta certa e a
distancia ate a foto ORIGINAL, em CIELAB — no Espeto o croma da foto e 13,8, o
veu entrega 9,6 e o halo 13,1, e o desvio de cor cai de 7,0 para 1,4 (-80%).

🔴 E `filter: blur()` na PROPRIA caixa, nao `backdrop-filter: blur()`.
A distincao e do Ciro e e o coracao da ideia: `backdrop-filter` desfocaria a
FOTOGRAFIA atras (lente fora de foco, que descaracteriza a foto); `filter`
desmancha a mancha escura e deixa a foto intacta e nitida por baixo. Nao troque
um pelo outro achando que e equivalente.

COMO PORTAR PARA OUTRO GERADOR
------------------------------
🔴 NAO e substituir o `VEU_CSS`. A troca muda a GEOMETRIA: o veu e uma camada
de faixa posicionada no topo ou no rodape do quadro; o halo e um filho absoluto
do BLOCO DE TEXTO, com inset negativo. No By Rock foi preciso reestruturar
`bloco_texto`, `bloco_rodape` e `bloco_logo`.

Roteiro, na ordem em que os defeitos apareceram:

1. O bloco de texto vira `position: relative; width: fit-content`, com o halo
   como primeiro filho absoluto e cada linha em `position: relative; z-index: 1`.
   `fit-content` e o que faz a mancha ter a largura do TEXTO, nao da coluna.
2. TODO elemento que dependia do veu precisa do proprio halo — inclusive a
   LOGO. No By Rock a marca quase sumiu sobre prato branco: o radial fraco que
   ela tinha atras fora calibrado para conviver COM o veu.
3. Calibre cada halo pela luz do TERCO onde ele pousa, nao pela media da faixa.
   Medido no s07: a faixa grande dizia 180-239 e o rodape real era 46-70 — o
   halo saia 3x mais escuro que o necessario, que e o "muito marcado" que este
   mecanismo veio corrigir.
4. Confira o HTML gerado com `conferir_divs`. HTML desbalanceado NAO da erro: o
   parser fecha as tags sozinho e aninha o que vem depois. Foi assim que a logo
   foi parar dentro do slot do servico, com o CSS correto e o layout errado.
5. Olhe a peca renderizada. Os quatro defeitos acima passaram por typecheck,
   por lint e pelo conferidor da marca — quem os pegou foi o olho e uma sonda
   de geometria no Chrome.
6. Elemento OPACO vizinho de um bloco com halo precisa de `position: relative;
   z-index: 1`. O halo mora num wrapper posicionado, e elemento posicionado
   pinta acima de irmao NAO-posicionado no mesmo contexto, venha antes ou
   depois no DOM. No TERO o print da avaliacao (um <img> em fluxo) saiu CINZA,
   escurecido pelo halo do titulo que estava acima dele. Com o veu isso nao
   acontecia: a camada era irma da moldura e a ordem do DOM resolvia.
7. Meça a luz no RETANGULO DO TEXTO, nao na area alargada pelo inset. O
   entorno e quase sempre mais escuro que o ponto onde a letra caiu, e puxa a
   media para baixo. Medido no TERO: 62 na area com inset contra 80 no
   retangulo do texto — o bloco passou por "escuro o bastante", nao ganhou
   halo, e a manchete ficou sobre uma faixa de 80. O inset continua valendo
   para a GEOMETRIA (e o tamanho da caixa que limita o raio).
8. A MEDIA e a estatistica errada. O que apaga uma letra e a mancha clara por
   onde parte do traco passa, nao o brilho medio. Use `luz_de_leitura()`.

9. A sonda de geometria precisa esperar as IMAGENS, nao so as fontes.
   `document.fonts.ready` NAO espera `<img>`, e lockup de marca costuma vir com
   `height: auto`: antes de carregar, ele mede 0px de altura e a mancha sai
   calculada para uma caixa que nao existe. E CORRIDA — no Espeto apareceu como
   `Dom15Misto marca 172x0` enquanto a peca ao lado, na MESMA rodada, media
   172x150. Espere `Promise.all([document.fonts.ready, ...imagens])` e derrube a
   geracao quando um retangulo vier degenerado.
10. O alvo da compensacao e a LINHA, nao o centro nem o canto. `atenuacao()`
   mira no centro, e o centro nao e onde o texto sofre: a primeira e a ultima
   linha encostam na borda VERTICAL da mancha, onde a gaussiana ja caiu. Medido
   no Espeto: centro 93% da tinta, borda 40%. Mas mirar no CANTO (borda nos dois
   eixos) e o exagero oposto — o canto de um bloco de texto e quase sempre
   espaco em branco, e pedir tinta cheia la fez 41 dos 43 grupos saturarem no
   teto de 0,95, com o bloco sobre madeira escura recebendo a mesma tinta do
   bloco sobre balcao branco. Isso e o veu de volta com outro nome. O modelo
   certo e CENTRO no eixo X, BORDA no eixo Y: `atenuacao_na_linha()`.
11. Ha cor de texto que o halo NAO consegue servir, e insistir vira veu. O alvo
   de `tinta_para_alvo` e calculavel a partir da cor (`alvo_por_contraste`), e
   as vezes a conta diz que nao da: o vermelho do Espeto (#F4301A) tem
   luminancia relativa 0,214 contra 1,0 do branco, entao exige fundo <= 51 para
   3:1 — no mesmo fundo em que o branco tem 5,5:1, ele tem 1,38:1 e SOME. E ele
   mora sempre na ultima linha do bloco, que e onde a mancha ja e mais fraca.
   Quem resolve por ele e a sombra presa ao GLIFO, que custa zero pixel de foto;
   a marca, pelo mesmo motivo, ganhou `drop-shadow` encadeado (contorno que
   segue a silhueta do PNG) em vez de mais disco atras. Calibre o halo pelas
   cores que ele PODE servir e mande as outras para a sombra.

⚠️ Leva JA PUBLICADA nao se regera so para trocar o mecanismo: a arte esta no
ar ou agendada, e o ganho nao paga o risco de mexer no que ja foi aprovado.
Porte quando a leva for refeita por outro motivo.
"""


def op(luz, minimo, maximo):
    """Interpola entre `minimo` e `maximo` conforme o BRILHO MEDIDO da faixa.

    Veu (e halo) constante erra dos dois lados: sobra em faixa escura, tampando
    foto sem precisar, e falta em faixa clara, deixando o texto sumir.
    """
    t = (max(50.0, min(210.0, luz)) - 50.0) / 160.0
    return minimo + t * (maximo - minimo)


def halo(luz, escala=1.0, cor="17,17,17", tinta=(0.62, 0.97), raios=(124, 158)):
    """O CSS da mancha, calibrado pela luz da regiao onde o texto pousa.

    `escala` ajusta por papel: o servico pede um pouco mais (1,05) porque cai
    sobre prato claro com frequencia, e a marca pede menos (0,72) porque so
    precisa de assentamento, nao de disco.

    `cor` e o R,G,B da mancha. O default e o quase-preto do By Rock, mas a cor
    da leitura e da MARCA: o Emporio Fonseca constroi todo o contraste no azul
    profundo #2C3445 e proibe preto puro. Trocar o mecanismo (veu -> halo) nao
    e licenca para trocar a paleta junto — quem porta escolhe a cor do veu que
    o cliente ja usava.

    `tinta` e `raios` sao as faixas do interpolador. Os defaults sao os do By
    Rock, medidos num bloco ALTO (manchete de 2 linhas + onda + apoio + fecho).
    🔴 Bloco CURTO precisa de outra calibragem, e a razao e geometrica: o blur
    e uma gaussiana de desvio `raio`, entao a mancha so atinge a opacidade
    cheia no miolo se a caixa for MAIOR que ~2x o raio nos dois eixos. Num
    lockup de 3 linhas o eixo vertical nao chega la, e o mesmo par
    (raio, tinta) que assenta o By Rock entrega menos contraste aqui. Meça a
    peca; nao herde o numero.

    O raio e GRANDE de proposito: com 46-62 ainda se enxergava onde a caixa
    comecava. A opacidade sobe junto porque o blur dilui — espalhar a mesma
    tinta por area maior clareia o centro, que e onde a letra cai. Aumentar o
    raio sem compensar a tinta troca "marcacao visivel" por "texto sem
    contraste", os dois defeitos que este halo existe para resolver ao mesmo
    tempo.
    """
    a = min(op(luz, *tinta) * escala, 0.95)
    raio = int(op(luz, *raios))
    return (f'background: rgba({cor},{round(a, 3)}); '
            f'filter: blur({raio}px); border-radius: {raio + 60}px;')


def envolver(conteudo_html, halo_css, inset_x=54, inset_y=44,
             classe_halo="halo", classe_conteudo="conteudo"):
    """Embrulha um bloco com o halo atras. Devolve o HTML pronto.

    Cada filho vai para `position: relative; z-index: 1` — sem isso o halo,
    que e absoluto, cobre o proprio texto que deveria destacar.

    As classes existem para o medidor: com o veu, o script de contraste
    escondia TODO o conteudo e sobravam foto + veu, que sao a camada de fundo.
    Com o halo a camada de fundo passou a morar DENTRO do bloco de texto, e um
    seletor que esconda o bloco leva o halo junto — o numero sai medindo a foto
    nua e diz que nao ha contraste nenhum. Esconde-se `.conteudo`, preserva-se
    `.halo`.
    """
    if not halo_css:
        return conteudo_html
    marca = (f'<div class="{classe_halo}" style="position: absolute; '
             f'left: -{inset_x}px; right: -{inset_x}px; top: -{inset_y}px; '
             f'bottom: -{inset_y}px; z-index: 0; pointer-events: none; {halo_css}"></div>')
    return ('<div style="position: relative; width: fit-content;">'
            + marca
            + f'<div class="{classe_conteudo}" style="position: relative; z-index: 1;">'
            + conteudo_html + '</div>'
            + '</div>')


def envolver_linhas(linhas, halo_css, inset_x=54, inset_y=44, alinha="center",
                    gap=14, classe_halo="halo", extra="", attrs=""):
    """A forma MULTILINHA do `envolver`: cada linha continua item direto do flex.

    🔴 `envolver` poe todo o conteudo dentro de UM filho. Num bloco de varias
    linhas isso quebra a armadilha 4.1 do manual do canvas: o editor so
    seleciona, reordena, alinha e espaca o que e ITEM DIRETO de um flex, entao
    o lockup inteiro passa a se mover como uma peca so e a manchete deixa de
    ser ajustavel separada do pre-titulo. O By Rock ja fazia certo em
    `bloco_texto` (cada linha vira um filho com `z-index: 1`); esta funcao e
    aquilo, generico.

    O wrapper e `width: fit-content` para a mancha ter a largura do TEXTO e nao
    da coluna, e um flex column proprio para reproduzir o `gap` que as linhas
    tinham quando eram filhas diretas do `.conteudo` — agrupar sem devolver o
    gap encosta as linhas umas nas outras.
    """
    caixa = ('position: relative; width: fit-content; display: flex; '
             f'flex-direction: column; align-items: {alinha}; gap: {gap}px;{extra}')
    # `attrs` carrega o `data-halo="nome"` que a sonda de geometria le para
    # saber ONDE cada bloco pousou — a medicao da luz depende do rect REAL,
    # nao de aritmetica sobre o layout.
    attrs = (" " + attrs.strip()) if attrs.strip() else ""
    filhos = "".join(f'<div style="position: relative; z-index: 1;">{l.strip()}</div>'
                     for l in linhas)
    if not halo_css:
        return f'<div{attrs} style="{caixa}">{filhos}</div>'
    marca = (f'<div class="{classe_halo}" style="position: absolute; '
             f'left: -{inset_x}px; right: -{inset_x}px; top: -{inset_y}px; '
             f'bottom: -{inset_y}px; z-index: 0; pointer-events: none; {halo_css}"></div>')
    return f'<div{attrs} style="{caixa}">{marca}{filhos}</div>'


def luz_de_leitura(media, p75):
    """A luz que calibra o halo: metade media, metade percentil 75.

    🔴 Calibrar pela MEDIA deixa o texto sumir sobre mancha clara pequena.
    Medido no TERO (QuaFuncionamento, 01/09/2026): a faixa do servico tem
    media 54 — parece escura e quase nao pediu halo — mas o texto cai sobre uma
    cadeira branca, com 15% da area acima de 200. No celular a linha de
    servico sumiu, com o numero dizendo que estava tudo bem.

    Calibrar so pelo p75 erra do outro lado: escurece peca que ja estava boa e
    devolve o "muito marcado". A mistura meio a meio foi o ponto que consertou
    os casos ruins sem estragar os bons — 21 pecas conferidas uma a uma.
    """
    return 0.5 * media + 0.5 * p75


def percentil(imagem_L, q=0.75):
    """Percentil `q` de uma imagem PIL ja em modo 'L'. Insumo de `luz_de_leitura`."""
    hist = imagem_L.histogram()
    total = sum(hist)
    alvo, soma = q * total, 0
    for valor, n in enumerate(hist):
        soma += n
        if soma >= alvo:
            return float(valor)
    return 255.0


def atenuacao(meia_larg, meia_alt, raio):
    """Quanto da tinta nominal sobra no CENTRO da mancha depois do blur.

    O `blur(r)` do CSS e uma gaussiana de desvio r; em uma dimensao o valor no
    centro de uma caixa e `erf(meia_medida / (r * raiz(2)))`. Numa caixa
    pequena o desfoque nao esfuma so a borda — ele DILUI O CENTRO, que e onde a
    letra cai.
    """
    from math import erf, sqrt
    return erf(meia_larg / (raio * sqrt(2))) * erf(meia_alt / (raio * sqrt(2)))


def ajustar_por_geometria(tinta, raio, larg, alt, inset_x=54, inset_y=44,
                          raio_minimo=34):
    """(tinta, raio) corrigidos para o TAMANHO REAL do bloco. Devolve o par.

    🔴 E a resposta pratica ao "meça a peça; nao herde o numero" do `halo()`.
    Sem isso o mesmo par entrega densidades muito diferentes num lockup de
    234px e numa logo de 89px — e o erro aparece justamente no elemento menor,
    que costuma ser a marca.

    Duas correcoes:
      - o raio e limitado a `min(meia_larg, meia_alt) / 1,44`, o ponto em que a
        `atenuacao` ainda devolve ~0,85 da tinta;
      - a tinta e dividida pela atenuacao que sobrar, para o CENTRO chegar no
        valor pretendido.

    Medido no TERO (DomFuncionamento, 01/09/2026): a marca BRANCA sobre
    folhagem em contraluz recebia raio 83 e 0,80 de tinta — 0,45 efetivos — e
    quase sumia. Com raio 51 e tinta 0,94 (0,80 efetivos) voltou a ler, sem
    borda visivel.
    """
    mw = (larg + 2 * inset_x) / 2.0
    mh = (alt + 2 * inset_y) / 2.0
    raio = max(raio_minimo, min(raio, int(min(mw, mh) / 1.44)))
    return min(0.95, tinta / max(0.35, atenuacao(mw, mh, raio))), raio


def atenuacao_na_linha(larg, alt, inset_y, raio):
    """Tinta que chega a PRIMEIRA e a ULTIMA LINHA — centro em X, borda em Y.

    Complementa `atenuacao()`, que mira no centro da mancha. Ver o item 10 do
    roteiro: o centro superestima (93% contra 40% na borda) e o canto
    subestima a ponto de saturar tudo. O texto encosta na borda vertical e
    mora no corpo do bloco na horizontal — e assim que ele deve ser medido.
    """
    from math import erf, sqrt
    def phi(z):
        return 0.5 * (1.0 + erf(z / sqrt(2)))
    r = max(1.0, raio)
    x = erf((larg / 2.0) / (r * sqrt(2)))                     # centro no eixo X
    y = max(0.02, phi(inset_y / r) + phi((alt + inset_y) / r) - 1.0)   # borda em Y
    return x * y


def alvo_por_contraste(cor_hex, ratio=3.0):
    """Luminancia MAXIMA (0-255) do fundo para `cor_hex` atingir `ratio`.

    🔴 Torna o `alvo` de `tinta_para_alvo` calculavel em vez de arbitrado por
    papel. E, principalmente, revela quando a conta NAO fecha: cor de texto de
    luminancia baixa devolve um alvo tao escuro que persegui-lo reconstroi o
    veu (item 11 do roteiro).

    Referencia: 3:1 para display, 4,5:1 para corpo pequeno. No Espeto isso da
    branco 88px -> 149, branco 38px -> 119, amarelo 36px -> 88 e vermelho
    88px -> 55, que e o inatingivel.
    """
    def lin(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(cor_hex[i:i + 2], 16) for i in (1, 3, 5))
    y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    alvo = max(0.0, min(1.0, (y + 0.05) / ratio - 0.05))
    s = alvo * 12.92 if alvo <= 0.0031308 else 1.055 * (alvo ** (1 / 2.4)) - 0.055
    return s * 255.0


def tinta_para_alvo(luz, alvo, luz_da_cor):
    """Tinta que poe o fundo do bloco na luminancia `alvo`. 0 quando ja esta la.

    🔴 Alternativa ao interpolador do `halo()`, e melhor nos EXTREMOS. Sobrepor
    a mancha da `luz*(1-a) + luz_da_cor*a`, entao a tinta que atinge o alvo e
    `(luz - alvo) / (luz - luz_da_cor)`.

    O ganho e o ZERO: com `luz <= alvo` nao existe halo nenhum e a foto passa
    intacta. Interpolando, uma foto noturna medida em 8 ou 17 ainda pedia 0,62
    de tinta — escurecer o que ja e quase preto, que e o defeito do veu por
    outro caminho. No TERO isso dispensou halo em 16 dos 63 blocos da leva.

    O alvo e por PAPEL, e a ordem sai da fragilidade de cada um. No TERO:
    titulo 62 (Didot grande com sombra presa ao glifo), servico 46 (corpo
    pequeno), marca 40 (a logo e branca chapada e nao tem segundo tom).
    """
    if luz <= alvo:
        return 0.0
    return (luz - alvo) / max(1.0, luz - luz_da_cor)


def conferir_divs(html, quem):
    """Recusa artboard com <div> desbalanceado.

    🔴 Existe porque HTML malformado NAO da erro: o navegador fecha as tags
    sozinho, aninhando o que vier depois, e a peca sai renderizada e errada sem
    uma linha de aviso. Em 01/09/2026 um `</div>` faltando no bloco de servico
    pos a logo DENTRO do slot dele — o CSS estava correto, o layout nao, e so
    uma sonda de geometria no Chrome achou.
    """
    import re
    abre = len(re.findall(r"<div\b", html))
    fecha = html.count("</div>")
    if abre != fecha:
        raise SystemExit(f"{quem}: <div> desbalanceado — {abre} abrem, {fecha} fecham")


# ==========================================================================
# O QUE O QUINTAL ACRESCENTOU (01/09/2026)
# ==========================================================================
# Portado para `quintal-semana1/` (18 artboards, 5 layouts). O gerador de la
# tem `halo_quintal.py` (calibragem), `sonda.py` (geometria) e `medir.py`
# (conferencia). Cinco coisas valem para qualquer cliente:
#
# 1. 🔴 O HALO NEM SEMPRE PODE SER FILHO DO BLOCO DE TEXTO.
#    O roteiro acima manda embrulhar as linhas em `position: relative;
#    width: fit-content`. No Quintal isso NAO pode ser feito: a armadilha 4.1
#    do manual exige que cada linha seja item DIRETO do container flex, senao
#    o editor do canvas move o grupo inteiro e nada dentro dele. Embrulhar
#    desfaz a estrutura que custou tres tentativas para acertar.
#    A saida e a forma da armadilha 4.7 — camada absoluta IRMA, atras do
#    conteudo ("quem e absoluto e o FUNDO, que ninguem arrasta no editor") —
#    com a caixa de tinta MEDIDA no Chrome em vez de dada pelo `fit-content`.
#    Sai de graca uma coisa que o embrulho nao da: com o retangulo em maos, a
#    luz e lida da foto exatamente debaixo do texto, e nao do terco mais
#    proximo. Use `envolver` quando o artboard e estatico; meca quando ele e
#    editavel no canvas.
#
# 2. 🔴 A MARGEM PODE SAIR DO RAIO, E ISSO E MELHOR QUE LIMITAR O RAIO.
#    `ajustar_por_geometria` resolve o bloco curto ENCOLHENDO o raio ate a
#    caixa comportar; a alternativa e CRESCER a caixa ate comportar o raio,
#    com `margem = 1,4 * raio` (o ponto em que `erf(d/(r*raiz2))` da 0,84 e o
#    texto fica no PLATO em vez da rampa). Medido no pior fundo da leva do
#    Quintal (parede de tijolo clara e uniforme):
#
#        margem     raio  tinta          p98 do verde (alvo 69)
#        62/46        92  0,95 (teto)      107   ← nao alcanca, e a mancha APARECE
#        190/165     130  0,82              74   ← alcanca, com MENOS tinta
#
#    Margem maior ganha nos DOIS eixos: o texto le melhor e a mancha fica mais
#    clara. Na leva inteira tirou os 8 grupos que batiam no teto de tinta e
#    baixou todos os outros. O preco e area: a mancha cobre mais foto, entao a
#    escolha entre encolher o raio e crescer a caixa e por peca — bloco solto
#    num canto pede o primeiro, bloco que ja ocupa a coluna aceita o segundo.
#
# 3. 🔴 FUNDO BRILHANTE E UNIFORME E O PIOR CASO DO HALO — e o unico em que o
#    veu tem vantagem de FORMA. Medido: o tijolo tem desvio 22 com media 176,
#    contra desvio 60 na tabua e 47 no jardim. Foto cheia esconde a mancha na
#    propria textura; parede lisa, ceu ou fundo de estudio nao tem onde
#    esconde-la, e ali ela so some as custas de raio e margem grandes.
#    Meca o desvio antes de portar para marca de fundo liso.
#
# 4. 🔴 O RETANGULO QUE SE MEDE E O DO TEXTO, NUNCA O DO HALO.
#    Sao diferentes de proposito: o halo cresce a margem para fora para que a
#    rampa caia FORA das letras. Medir a caixa do halo cobra dele contraste na
#    propria borda, onde ele ja desmanchou — a MESMA peca deu p98 130 pela
#    caixa do texto e 191 pela do halo, e o veredito falso foi "TEXTO SOME"
#    numa peca legivel. E a armadilha 4.5 com outra roupa: la o erro era medir
#    junto as letras que se queria avaliar, aqui e medir onde nao ha letra.
#
# 5. 🔴 FILETE E BARRINHA NAO MANDAM NA TINTA.
#    Com o alvo POR COR (`alvo_por_contraste`), um ornamento colorido vira o
#    elemento mais exigente do grupo: a barra VERDE de 4px do Quintal pedia
#    fundo 69 e sozinha empurrava rodapes inteiros para o teto de tinta.
#    Ornamento de 4px com menos contraste nao e defeito de leitura; rodape
#    opaco e — e era o "muito marcado" voltando por uma porta lateral.
#    Descarte do ALVO tudo com menos de ~8px de espessura; a uniao continua
#    cobrindo esses elementos, o que se ignora e o voto deles.
#
# E duas notas de metodo:
#
# - TINTA NO TETO E SINAL DE CURADORIA, nao defeito silencioso: quer dizer que
#   aquela foto nao carrega aquela linha naquela posicao. O gerador do Quintal
#   imprime a lista. E o "quando a conta NAO fecha" que `alvo_por_contraste`
#   ja anuncia, com nome e endereco.
# - A ESTIMATIVA ANALITICA ERRA; a peca renderizada nao. Vale uma passada de
#   AFERICAO: renderiza sem o conteudo, mede o p98 real de cada linha e refaz
#   a tinta a partir da cobertura que de fato houve. Converge num passo porque
#   o modelo e linear em (tinta x cobertura). 🔴 A afericao tem de refazer a
#   conta de TODAS as linhas do grupo, nao so da que venceu a estimativa: no
#   teto varias empatam, a escolhida pode ser a mais facil, e ai a afericao
#   BAIXA a tinta resolvendo para o alvo errado (aconteceu — verde ficou em
#   144 contra alvo 83).
