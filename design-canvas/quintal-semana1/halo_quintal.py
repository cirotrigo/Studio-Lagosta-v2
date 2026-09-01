# -*- coding: utf-8 -*-
"""Calibragem do halo do Quintal: onde ele pousa e quanta tinta ele leva.

Duas coisas mudam em relacao ao By Rock, e as duas foram medidas nas fotos
deste cliente.

1. A TINTA E RESOLVIDA CONTRA UM ALVO, E O ALVO E POR COR DE TINTA
-------------------------------------------------------------------
A fotografia do Quintal e parrilla, brasa e salao a noite: muita area escura,
com pontos de brasa e lampada estourados no meio. Medido nas 12 fotos das
pecas em rascunho, na faixa onde o texto pousa:

    peca      media   p50   p90   p98    p90-media
    qui0800      23    18    46    66         +23
    sab1200     117    95   234   249        +117
    dom1100      65    54   123   215         +59

Em `sab1200` a media diz "meio-termo" e a metade de cima da faixa esta
estourada: o halo calibrado pela media sai fraco justamente onde a letra
morre. E o contrario de `qui0800`, uniforme e escura, onde a media ja seria o
valor certo. Media so descreve a faixa quando a faixa e homogenea, e a deste
cliente nao e — o vao entre media e p90 vai de +23 a +117 na mesma leva.

A saida NAO foi trocar a media por outro percentil no mesmo interpolador do By
Rock. Escolher percentil e escolher um numero para alimentar uma escala que
tambem foi escolhida a mao: dois palpites em serie. Aqui a conta e invertida —
parte-se do fundo maximo que a LETRA aguenta e resolve-se a tinta que poe o
fundo la (`_halo.tinta_para_alvo`). A luz da regiao deixa de ser parametro de
estilo e passa a ser o dado de entrada de uma equacao com uma incognita.

🔴 E o alvo e POR COR. O Quintal escreve em dois tons — creme #F5F0E8 (luz
240) e verde #7A9A5C (luz 143) — e o criterio unico da casa ("p98 do fundo
abaixo de 150") permite fundo MAIS CLARO que a propria letra verde. Ver
`alvo_da_cor`.

Cai fora, de graca, o pior caso do veu: quando a foto ja e escura o bastante
para o texto se ler sozinho, a conta devolve tinta ZERO e a peca nao leva
mancha nenhuma. O veu nao tinha como fazer isso — ele era uma faixa que sempre
existia. Nesta leva sao 5 grupos sem halo nenhum.

2. A MARGEM SAI DO RAIO, E ERA CURTA DEMAIS
--------------------------------------------
🔴 `blur(Npx)` no CSS e uma gaussiana de desvio N. A tinta so chega perto do
valor nominal onde a caixa e funda o bastante: a `d` de dentro da borda o que
passa e `erf(d/(N*raiz2))`. Com d = 1,4*N isso da 0,84 por eixo — o texto fica
no PLATO da mancha em vez de na rampa dela. Dai `MARGEM = 1,4 * RAIO`.

A margem 62/46 herdada do By Rock deixava o texto DENTRO da rampa, e o preco
era pago duas vezes. Medido no `Qui1430` (parede de tijolo clara e uniforme, o
pior fundo possivel para este mecanismo):

    margem     raio  tinta          p98 do verde (alvo 69)
    62/46        92  0,95 (teto)      107   ← nao alcanca, e a mancha APARECE
    120/100     123  0,95 (teto)       85
    190/165     130  0,82              74   ← alcanca, e com MENOS tinta
    260/230     130  0,73              77

Margem maior ganha nos DOIS eixos ao mesmo tempo: o texto le melhor e a mancha
fica mais clara. Nao e um meio-termo entre leitura e fotografia — a margem
curta era simplesmente pior. Na leva inteira ela tirou os 8 grupos que batiam
no teto de tinta e baixou TODOS os outros.

Some-se o que se ve na peca: com 62/46 a mancha tem contorno reconhecivel
sobre a parede lisa (o "muito marcado" que este mecanismo veio corrigir,
voltando por outra porta); com 1,4*raio ela le como sombra do ambiente.

🔴 Fundo BRILHANTE e UNIFORME e o pior caso do HALO — e o unico em que o veu
tem vantagem de forma. Medido nesta leva: o tijolo do `Qui1430` tem desvio 22
com media 176, contra desvio 60 na tabua e 47 no jardim. Foto cheia esconde a
mancha na propria textura; parede lisa nao tem onde esconde-la, e ali a mancha
so desaparece as custas de raio e margem grandes. Quem portar isto para uma
marca de fundo liso (parede, ceu, toalha, fundo infinito de estudio) precisa
refazer esta medicao antes de encurtar margem.
"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _halo import alvo_por_contraste, tinta_para_alvo

# O quase-preto DA MARCA (#1F1B16), nao o do By Rock. E a cor que o veu do
# Quintal ja usava — trocar o mecanismo nao e licenca para trocar a paleta.
COR = "31,27,22"
LUM_COR = 0.2126 * 31 + 0.7152 * 27 + 0.0722 * 22

# 3:1 e a referencia WCAG para texto de display, que e o tamanho de tudo que o
# Quintal poe sobre foto (o menor e o servico, em Acumin Semi 30-33px).
RATIO_LEITURA = 3.0
# So para elemento sem cor apurada (raro). O valor coincide com o que
# `alvo_por_contraste` devolve para o creme, entao nao introduz um segundo
# criterio por baixo do pano.
ALVO = 139.0

RAIO = int(os.environ.get('RAIO', '130'))
MARGEM = round(1.4 * RAIO)
TETO_TINTA = 0.95
# Abaixo disto a mancha nao faz diferenca visivel e so tira luz da foto: vira
# zero. E o que permite a peca sem halo nenhum.
PISO_UTIL = 0.06
# Abaixo desta espessura o elemento e ornamento, nao leitura.
FIO_DECORATIVO = 8


def luz_da_regiao(im, rect, percentil=0.98):
    """Percentil da luminancia da foto DEBAIXO do retangulo medido.

    p98 porque e a grandeza do criterio: a conta resolve para o mesmo numero
    que `medir.py` vai cobrar depois. Ler p90 aqui e cobrar p98 la seria
    resolver uma equacao e conferir outra.

    `im` ja vem recortada como a peca exibe (cover + centro), entao o que se le
    e exatamente o que fica atras do texto. E o passo que o embrulho com
    `fit-content` do By Rock nao da: com o retangulo em maos, da para ler a luz
    do LUGAR, em vez do terco mais proximo.
    """
    x, y, w, h = rect['x'], rect['y'], rect['w'], rect['h']
    caixa = im.crop((max(0, x), max(0, y),
                     min(im.width, x + w), min(im.height, y + h)))
    if caixa.width < 2 or caixa.height < 2:
        return 128.0
    caixa = caixa.resize((240, 240))
    luzes = sorted(0.2126 * r + 0.7152 * g + 0.0722 * b
                   for r, g, b in caixa.convert('RGB').getdata())
    return luzes[int(len(luzes) * percentil)]


def geometria(rect, margem=None, raio=None):
    """Retangulo do halo, derivado do raio: o texto mais 1,4 raio em volta."""
    raio = raio or RAIO
    m = MARGEM if margem is None else margem
    return (rect['x'] - m, rect['y'] - m,
            rect['w'] + 2 * m, rect['h'] + 2 * m, raio)


def cobertura(halo, linha, raio):
    """Fracao da tinta que chega ao ponto mais fraco de UMA linha.

    🔴 O ponto que decide nao e o miolo do halo, e a borda da LINHA mais perto
    da borda do halo. O p98 de um retangulo mora justamente ali, onde a rampa
    do blur ja comeu parte da tinta; um modelo que calcule o centro erra para
    MENOS e a peca sai sem contraste com o numero dizendo que esta tudo bem.

    Numa caixa borrada, o valor a `d` de dentro da borda vale
    `(erf(d/(r*raiz2)) + erf((lado-d)/(r*raiz2))) / 2` em cada eixo; no canto
    os dois eixos multiplicam. Linha curta no meio de um halo largo recebe mais
    do que linha que vai de ponta a ponta — e por isso a conta e por linha.

    Parente proximo do `_halo.atenuacao_na_linha`, que resolve o mesmo problema
    assumindo "centro em X, borda em Y". Aqui as distancias reais sao medidas
    nos dois eixos porque o grupo pode ter linha curta e linha larga junto.
    """
    hx, hy, hw, hh = halo
    lx, ly, lw, lh = linha
    dx = max(0.0, min(lx - hx, (hx + hw) - (lx + lw)))
    dy = max(0.0, min(ly - hy, (hy + hh) - (ly + lh)))
    f = lambda lado, d: 0.5 * (math.erf(d / (raio * math.sqrt(2)))
                               + math.erf(max(0.0, lado - d) / (raio * math.sqrt(2))))
    return f(hw, dx) * f(hh, dy)


def alvo_da_cor(cor):
    """Quanto de fundo a tinta DAQUELA cor aguenta. Delega ao `_halo` da casa.

    🔴 O Quintal escreve em dois tons, e a diferenca e grande demais para um
    alvo so: creme #F5F0E8 tem luz 240 e o verde #7A9A5C, 143. O criterio
    escrito da casa permite fundo ate 150 — ou seja, MAIS CLARO que a propria
    letra verde. Um halo calibrado pelo creme deixa a linha em Amithen legivel
    no papel e invisivel na peca; medido nesta leva em `Sab1100` ("Parrilla"
    sobre farofa amarela) e `Qui1430` ("Pede Chope" sobre tijolo claro).

    Nao e detalhe deste cliente. Qualquer marca que escreva em duas cores sobre
    foto tem o mesmo problema, e ele fica INVISIVEL num criterio unico — a peca
    passa na medicao e reprova no olho.

    O numero sai de `_halo.alvo_por_contraste` (WCAG, 3:1 para display) e nao
    de uma razao arbitrada aqui. Vale registrar a convergencia: para o creme
    ele devolve 139, contra os 140 a que uma razao 140/240 chegava e os 150 que
    `medir.py` ja usava desde 25/08 — tres derivacoes independentes no mesmo
    ponto. Para o verde ele devolve 69, mais rigoroso que os 83 da razao, e e o
    numero que vale.
    """
    if not cor:
        return ALVO
    return alvo_por_contraste('#%02X%02X%02X' % tuple(int(c) for c in cor[:3]),
                              RATIO_LEITURA)


def tinta(luz, alvo, cob, escala=1.0):
    """A tinta nominal que poe o fundo em `alvo` no ponto mais fraco da caixa.

    A equacao base e a `_halo.tinta_para_alvo` da casa; o que se acrescenta
    aqui e dividir pela COBERTURA daquele ponto, porque ela resolve para a
    tinta EFETIVA e o que o CSS recebe e a NOMINAL.

    `escala` e o unico ajuste de gosto que sobra, e existe por papel: o rodape
    pede um degrau a mais porque leva a menor letra da peca e a marca.
    """
    a = tinta_para_alvo(luz, alvo, LUM_COR) / max(cob, 1e-3) * escala
    return 0.0 if a < PISO_UTIL else min(TETO_TINTA, a)


def resolver_grupo(im, halo, raio, linhas, escala=1.0):
    """A tinta do grupo: a que a linha MAIS exigente pede.

    Um halo serve todas as linhas do grupo, entao ele e dimensionado pela pior
    delas. O preco — escurecer um pouco mais o fundo das linhas faceis — e o
    que se paga por ter uma mancha so; o oposto (uma mancha por linha) foi
    descartado porque manchas borradas vizinhas se somam e o miolo do lockup
    fica quase opaco, que e o "muito marcado" de volta.
    """
    pior, uteis = None, []
    for l in linhas:
        c = (l['caixa']['x'], l['caixa']['y'], l['caixa']['w'], l['caixa']['h'])
        if min(c[2], c[3]) < FIO_DECORATIVO:
            # 🔴 Filete e barrinha NAO mandam na tinta. O filete do L2 tem 1px
            # de altura e a barra do L3 tem 4px de largura, e a barra e VERDE:
            # pelo alvo da cor ela pedia fundo 83 e sozinha empurrava o rodape
            # inteiro para o teto de tinta. Ornamento de 4px com menos
            # contraste nao e defeito de leitura; rodape opaco e — e era
            # exatamente o "muito marcado" voltando por uma porta lateral.
            # Continuam DENTRO do retangulo do halo (a uniao ja os cobriu):
            # o que se ignora e o voto deles no alvo.
            continue
        luz = luz_da_regiao(im, l['caixa'])
        alvo = alvo_da_cor(l.get('cor'))
        a = tinta(luz, alvo, cobertura(halo, c, raio), escala)
        d = dict(luz=round(luz), alvo=round(alvo), alpha=a,
                 cor=l.get('cor'), caixa=[c[0], c[1], c[2], c[3]])
        uteis.append(d)
        # 🔴 O desempate NAO pode ser so `a`: no teto de tinta varias linhas
        # empatam em 0,95 e a escolhida passa a ser a primeira da lista, que
        # pode ser a mais FACIL. Foi assim que `Sab1100` gravou o alvo do creme
        # (140) num grupo cuja linha critica era o verde (83) — e a afericao,
        # que resolve para o alvo gravado, DESCEU a tinta de 0,95 para 0,67,
        # deixando o verde em 144. O quanto falta para o alvo desempata o teto.
        if pior is None or (a, luz - alvo) > (pior['alpha'], pior['luz'] - pior['alvo']):
            pior = d
    if pior is not None:
        pior = dict(pior, uteis=uteis)
    else:   # grupo so de ornamento: cai no alvo do creme, sobre a uniao
        luz = luz_da_regiao(im, dict(zip('xywh', halo)))
        pior = dict(luz=round(luz), alvo=round(ALVO), cor=None,
                    alpha=tinta(luz, ALVO, cobertura(halo, halo, raio), escala),
                    caixa=list(halo))
        pior['uteis'] = [pior]
    return pior


def foto_como_exibida(caminho, W, H):
    """A foto no recorte que a peca mostra: `object-fit: cover`, centrada.

    Medir o arquivo cru responderia sobre pixels que a peca nao mostra. E a
    mesma correcao que o By Rock precisou fazer quando a margem do rodape
    mudou: geometria que muda invalida medicao guardada.
    """
    from PIL import Image
    im = Image.open(caminho).convert('RGB')
    e = max(W / im.width, H / im.height)
    im = im.resize((max(1, round(im.width * e)), max(1, round(im.height * e))),
                   Image.LANCZOS)
    ex, ey = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((ex, ey, ex + W, ey + H))


def corrigir(luz, alvo, tinta_usada, medido, escala=1.0):
    """Refaz a tinta a partir do que o RENDER de fato entregou.

    O modelo gaussiano da a primeira estimativa; a peca renderizada da a
    verdade. De `medido` (o p98 do fundo com o halo aplicado) sai a cobertura
    REAL daquela caixa:

        medido = luz*(1 - a*k) + LUM_COR*(a*k)   =>   k = (luz-medido) / (a*(luz-LUM_COR))

    e com `k` real a tinta e recalculada pela mesma equacao. Converge num passo
    so porque o modelo e linear em `a*k` — o que o blur, o border-radius e o
    antialias mudam esta todo dentro do `k`, e e justamente ele que sai medido.

    Sem tinta anterior nao ha o que inverter (nao da para dividir por zero):
    se o fundo nu ja passa, continua sem halo; se nao passa, devolve a
    estimativa analitica de quem chamou.
    """
    if tinta_usada < PISO_UTIL:
        return None if medido <= alvo else 0.0
    k = (luz - medido) / (tinta_usada * max(luz - LUM_COR, 1e-3))
    if k <= 0.02:
        return None
    return tinta(luz, alvo, k, escala)
