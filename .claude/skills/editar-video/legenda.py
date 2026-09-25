# -*- coding: utf-8 -*-
"""Legenda palavra a palavra (estilo Reels) como sobreposição ProRes 4444 com alfa PREMULTIPLICADO.

Um .mov do tamanho da peça inteira, transparente onde não há fala, com título opcional no topo. Vai
na V2 (LEGENDA) do montar_fala.py, do quadro 0 (recordFrame só é respeitado em trilha vazia).

Uso:
  python3 legenda.py                  → autoconferência (fonte do sistema; renderiza uma peça sintética de 1 s)
  python3 legenda.py --peca <RAIZ> <ID> [--montagem <json>] [--saida <mov>] [--quadros 1.0,4.0]
A forma antiga (palavras.json <saida> <total_s>) não existe mais: qualquer outro argumento é recusado.

--peca lê a peça <ID> (a que tem "segmentos") de <RAIZ>/04_DAVINCI/montagem.json — ou de
--montagem, com a RAIZ ainda do projeto para os caminhos relativos —, leva as palavras de
pc.transcricao para a timeline pela conta do montar_fala.py (simular + mapa_da_fala +
palavras_na_timeline, com os trechos contíguos da fala fundidos antes) e renderiza a legenda em
--saida ou pc.legenda.arquivo. Arquivo que já existe NÃO é sobrescrito: sai como -v2, -v3… (o JSON
diz); a troca no Resolve é pelo trocar_midia.py. O render corre em <saida>.parcial (extensão que o
resolve_projeto.py não importa) e só ganha o nome no fim. Com --quadros não há vídeo: só PNGs da
legenda sobre cinza médio em <RAIZ>/07_TEMPORARIOS/, para conferir antes do render (~1 min por minuto).
Palavra mais larga que a coluna, ou tinta fora da zona segura, é recusada com a palavra e o instante.

pc.transcricao = caminho (relativo à RAIZ) de [{"palavra", "ini_s", "fim_s", "publico", ...}] no
tempo da FONTE (o arquivo "fala"), a saída do transcrever.py; "publico": false fica de fora. Palavra
sem o campo (acrescentada à mão na revisão) segue a regra do transcrever.py: "[risos]", "(…)" e o que
não tem letra nem número ficam de fora.
pc.legenda = {                           só estas quatro chaves; outra (ex.: "título") é recusada
  "arquivo": "06_ELEMENTOS/Motion/<peça>-legenda.mov",
  "alfa": "Premultiplied",               lido pelo montar_fala.py; só "Premultiplied" ou null (este script
                                         sempre grava premultiplicado: "Straight" daria borda escura)
  "estilo": {                            caminhos relativos à RAIZ quando não absolutos
    "fonte": "06_ELEMENTOS/Assets/fontes/<família>.ttf",   OBRIGATÓRIA (o fontes.ts baixa as do cliente)
    "tamanho": 84, "caixa_alta": false, "centro_y": 1300,  centro_y = meio da legenda (terço inferior)
    "cor_texto": "#FFFFFF", "cor_contorno": "#111111", "contorno_px": 6,
    "cor_destaque": null,                pílula que anda na palavra falada; null = sem pílula
    "muletas": ["né"],                   saem só da legenda; a fala continua igual
    "topo": 200, "rodape": 250, "margem_esq": 120, "margem_dir": 120   zona segura, conferida na tinta
  },                                     cor_contorno também é a da sombra e do gradiente do título
  "titulo": {                            opcional: duas vozes no topo, com gradiente de leitura
    "contexto": "COSTELA", "acento": "Premiada", "fonte_contexto": …, "fonte_acento": …,
    "ini_s": 0, "ate_s" ou "ate_q": até quando fica (sem os dois: o fim do 1º segmento, o gancho),
    "y": 390, "tam_contexto": 64, "tam_acento": 190, "tracking": 0.28, "traco_contexto": 0,
    "vao": -14, "gradiente_ate": 900,
    "rodape": "SHOPPING VITÓRIA", "vao_rodape": 24   3ª linha opcional, na voz do contexto
  }                                      ou uma LISTA de títulos (gancho, cartão final…): do 2º em diante
                                         ini_s e ate_s/ate_q são obrigatórios
}
"""
import json, math, os, re, subprocess, sys
from fractions import Fraction
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FPS = 30000 / 1001
ESPACO, PAD_X, PAD_Y, RAIO = 0.32, 18, 12, 16   # espaço entre palavras (× tamanho); folga e canto da pílula
SOMBRA = 26                      # quanto a sombra visível (alfa > 8) passa da pílula
MAX_PALAVRAS, PAUSA = 3, 0.25
MINIMO_NA_TELA = 0.5             # grupo que ficaria menos que isso na tela se junta ao vizinho, se couber
MAX_LINHAS = 2
CURTAS = {'a', 'o', 'as', 'os', 'e', 'é', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas',
          'em', 'um', 'uma', 'que', 'pra', 'pro', 'por', 'com', 'se', 'lá', 'né'}

# Estilo da marca: vem de pc.legenda.estilo, por configurar(). Fonte não tem padrão (cada cliente tem a
# sua); o resto tem padrão neutro. A zona segura é a do Reel: ícones à direita, legenda do app embaixo.
PADRAO = {'tamanho': 84, 'caixa_alta': False, 'centro_y': 1300, 'cor_texto': '#FFFFFF',
          'cor_contorno': '#111111', 'contorno_px': 6, 'cor_destaque': None, 'muletas': ['né'],
          'topo': 200, 'rodape': 250, 'margem_esq': 120, 'margem_dir': 120}
SEM_FONTE = ('legenda.estilo.fonte {}: rode o fontes.ts (baixa as fontes do cliente para '
             '<RAIZ>/06_ELEMENTOS/Assets/fontes/) ou passe o caminho do .ttf/.otf')
_cache = {}


def cor(hexa):
    h = hexa.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def configurar(estilo):
    """Aplica o estilo (caminho da fonte já resolvido) às globais que o desenho usa."""
    global F, F2, TAM, CAP_TOPO, BASE, ACIMA, CONTORNO, CAIXA_ALTA, MULETAS, COR_TEXTO, COR_CONTORNO
    global COR_DESTAQUE, CENTRO_Y, FAIXA_Y, FAIXA_H, TOPO, RODAPE, X0, X1, LARG_MAX, ENTRELINHA
    sobra = set(estilo) - set(PADRAO) - {'fonte'}
    if sobra:
        raise ValueError(f'legenda.estilo: chave desconhecida {sorted(sobra)} (aceitas: fonte, {", ".join(PADRAO)})')
    if not estilo.get('fonte'):
        raise ValueError(SEM_FONTE.format('faltando'))
    if not os.path.isfile(estilo['fonte']):
        raise ValueError(SEM_FONTE.format(f'não existe ({estilo["fonte"]})'))
    e = {**PADRAO, **estilo}
    for k, v in e.items():            # o tipo também: "false" viraria True e "né" viraria {n, é}
        pad = PADRAO.get(k, '')
        if k.startswith('cor_'):
            ok, quer = (v is None and k == 'cor_destaque') or (isinstance(v, str) and re.fullmatch(r'#[0-9A-Fa-f]{6}', v)), '"#RRGGBB"'
        elif isinstance(pad, bool):
            ok, quer = isinstance(v, bool), 'true ou false'
        elif isinstance(pad, list):
            ok, quer = isinstance(v, list) and all(isinstance(m, str) for m in v), 'lista de textos'
        elif isinstance(pad, int):
            ok, quer = isinstance(v, (int, float)) and not isinstance(v, bool), 'número'
        else:
            continue                  # a fonte, já conferida
        if not ok:
            raise ValueError(f'legenda.estilo.{k} = {json.dumps(v, ensure_ascii=False)}: esperado {quer}')
    TAM, CONTORNO, CAIXA_ALTA, CENTRO_Y = e['tamanho'], e['contorno_px'], e['caixa_alta'], e['centro_y']
    COR_TEXTO, COR_CONTORNO = cor(e['cor_texto']), cor(e['cor_contorno'])
    COR_DESTAQUE = cor(e['cor_destaque']) if e['cor_destaque'] else None
    MULETAS = {m.lower() for m in e['muletas']}
    TOPO, RODAPE, X0, X1 = e['topo'], e['rodape'], e['margem_esq'], W - e['margem_dir']
    F = ImageFont.truetype(e['fonte'], TAM)
    F2 = ImageFont.truetype(e['fonte'], TAM * 2)          # supersample do texto para a escala animada
    _, CAP_TOPO, _, BASE = F.getbbox('H')                 # faixa vertical fixa: topo da maiúscula até a linha de base
    ACIMA = int(-min(F2.getbbox(ch)[1] for ch in 'ÃÊÉÁÔÕÇÍÚÀ')) + 4   # acento acima da origem (2x): sem isso o til e o ^ são cortados
    meia = max(200, 2 * math.ceil(1.1 * TAM))             # só esta faixa em volta de centro_y é desenhada
    FAIXA_Y, FAIXA_H = CENTRO_Y - meia, 2 * meia
    LARG_MAX = X1 - X0 - 2 * (PAD_X + SOMBRA + CONTORNO)
    ENTRELINHA = (BASE - CAP_TOPO) + 2 * PAD_Y + 12       # de centro a centro de linha
    _cache.clear()


def ease(x):
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** 3


def na_caixa(txt):
    return txt.upper() if CAIXA_ALTA else txt


def larg(txt):
    return F.getlength(na_caixa(txt))


def limpa(txt):
    return txt.lower().strip('.,?!:;')


def linhas_de(g):
    """Quebra gulosa do grupo em linhas que cabem em LARG_MAX: [[palavra, ...], ...]."""
    linhas, lin, w = [], [], 0.0
    for p in g:
        lp = larg(p['texto'])
        if lin and w + ESPACO * TAM + lp > LARG_MAX:
            linhas.append(lin); lin, w = [], 0.0
        w += (ESPACO * TAM if lin else 0) + lp
        lin.append(p)
    linhas.append(lin)
    if len(linhas) == 2:                     # duas linhas: quebra equilibrada (sem palavra órfã embaixo)
        lw = lambda ps: sum(larg(q['texto']) for q in ps) + ESPACO * TAM * (len(ps) - 1)
        ok = [k for k in range(1, len(g)) if max(lw(g[:k]), lw(g[k:])) <= LARG_MAX]
        curta = lambda k: g[k - 1]['texto'].lower().strip('.,?!') in CURTAS   # linha não termina em "o", "no", "a"…
        k = min(ok, key=lambda k: (curta(k), max(lw(g[:k]), lw(g[k:])))) if ok else None
        if k:
            linhas = [g[:k], g[k:]]
    return linhas


def cabe(g):
    return len(linhas_de(g)) <= MAX_LINHAS and all(larg(p['texto']) <= LARG_MAX for p in g)


def agrupar(palavras, total_s=None):
    """2–3 palavras por vez; quebra em pausa, pontuação, largura; não termina grupo em palavra curta.
    Sem as muletas; com total_s, o grupo que ficaria < MINIMO_NA_TELA s se junta ao vizinho que couber."""
    palavras = [p for p in palavras if limpa(p['texto']) not in MULETAS]
    for p in palavras:                        # nenhuma quebra salva: recusa antes do render, com o instante
        w = larg(p['texto'])
        if w > LARG_MAX:
            raise ValueError(f'"{na_caixa(p["texto"])}" em {p["ini"]:.2f} s tem {w:.0f} px e a coluna tem {LARG_MAX:.0f} '
                             f'(margens {X0}–{X1}): legenda.estilo.tamanho por volta de {math.floor(TAM * LARG_MAX / w)} '
                             'ou menos, ou margens menores')
    grupos = _agrupar(palavras)
    while total_s is not None:
        js = janelas_de(grupos, total_s)
        curtos = [i for i, (a, b) in enumerate(js) if b - a < MINIMO_NA_TELA]
        feito = False
        fim_de_frase = lambda g: re.search(r'[.?!]$', g[-1]['texto'])
        for i in curtos:                      # o próximo (a frase segue), senão o anterior; nunca atravessa fim de frase
            for j in (i + 1, i - 1):
                if 0 <= j < len(grupos):
                    a, b = min(i, j), max(i, j)
                    if fim_de_frase(grupos[a]):
                        continue
                    novo = grupos[a] + grupos[b]
                    if cabe(novo) and grupos[b][0]['ini'] - grupos[a][-1]['fim'] <= 2 * PAUSA:
                        grupos[a:b + 1] = [novo]; feito = True; break
            if feito:
                break
        if not feito:
            break
    return grupos


def _agrupar(palavras):
    grupos, g = [], []
    for i, p in enumerate(palavras):
        if g:
            ant = palavras[i - 1]
            linha = sum(larg(q['texto']) for q in g + [p]) + ESPACO * TAM * len(g)
            if (len(g) >= MAX_PALAVRAS or p['ini'] - ant['fim'] > PAUSA
                    or re.search(r'[.,?!:;]$', ant['texto']) or linha > LARG_MAX):
                # palavra curta no fim do grupo passa para o próximo ("o", "no", "de"…), menos a que fecha
                # frase ("é?", "lá."): levada adiante, o grupo seguinte atravessaria o ponto
                if len(g) > 1 and g[-1]['texto'].lower().strip('.,?!') in CURTAS and not re.search(r'[.?!]$', g[-1]['texto']):
                    grupos.append(g[:-1]); g = [g[-1]]
                else:
                    grupos.append(g); g = []
        g.append(p)
    if g:
        grupos.append(g)
    return grupos


def diagramar(grupo):
    """(x, w, dy) de cada palavra: linhas centradas entre as margens; dy é o deslocamento vertical da
    linha em relação ao centro da faixa (0 com uma linha; ±ENTRELINHA/2 com duas)."""
    linhas = linhas_de(grupo)
    rects = []
    for li, lin in enumerate(linhas):
        ws = [larg(p['texto']) for p in lin]
        x = ((X0 + X1) - sum(ws) - ESPACO * TAM * (len(ws) - 1)) / 2
        dy = (li - (len(linhas) - 1) / 2) * ENTRELINHA
        for w in ws:
            rects.append((x, w, dy))
            x += w + ESPACO * TAM
    return rects


def img_palavra(txt):
    """(imagem 2x da palavra, deslocamento em px 2x do começo do texto para a direita de c): o
    deslocamento é o quanto o glifo passa da origem à esquerda (o rabo do j), para não ser cortado."""
    if txt not in _cache:
        t = na_caixa(txt)
        l, tp, r, b = F2.getbbox(t)
        c, esq = 2 * CONTORNO, -min(0, l)                # supersample 2x: o texto começa em (c + esq, c + ACIMA)
        # abaixo da linha de base: 28 px (2x) bastam para Q e vírgula; Ç e descendentes (g, p, j) pedem
        # mais, e a altura cresce de 2 em 2 para a redução pela metade continuar exata
        abaixo = 28 + 2 * max(0, math.ceil((b - 2 * BASE + 4 - 28) / 2))
        im = Image.new('RGBA', (int(r) + 8 + 2 * c + esq, int(BASE * 2) + abaixo + 2 * c + ACIMA), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((c + esq, c + ACIMA), t, font=F2, fill=COR_TEXTO + (255,), stroke_width=c,
                                stroke_fill=COR_CONTORNO + (255,))
        _cache[txt] = im, esq
    return _cache[txt]


def pill(x, w, y0, alpha, escala=1.0):
    cx, cy = x + w / 2, y0 + (CAP_TOPO + BASE) / 2
    hw, hh = (w / 2 + PAD_X) * escala, ((BASE - CAP_TOPO) / 2 + PAD_Y) * escala
    return (cx - hw, cy - hh, cx + hw, cy + hh), alpha


def quadro(t, grupos, janelas):
    """Faixa RGBA (alfa reto) do quadro no instante t (topo em FAIXA_Y), ou None."""
    gi = next((i for i, (a, b) in enumerate(janelas) if a <= t < b), None)
    if gi is None:
        return None
    g, (a, b) = grupos[gi], janelas[gi]
    rects = diagramar(g)
    y0 = CENTRO_Y - FAIXA_Y - (CAP_TOPO + BASE) / 2
    ent = ease((t - a) / (5 / FPS))                        # entrada do grupo: sobe 24 px e acende em 5 quadros
    sai = 1 - ease((t - (b - 4 / FPS)) / (4 / FPS)) if gi == len(grupos) - 1 else 1.0
    op, dy = ent * sai, (1 - ent) * 24
    y0 += dy

    k = max((i for i, p in enumerate(g) if p['ini'] <= t), default=None)
    cam = Image.new('RGBA', (W, FAIXA_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(cam)
    if k is not None and COR_DESTAQUE:                     # destaque: pílula que desliza de palavra em palavra
        tk = t - g[k]['ini']
        x, w, ly = rects[k]
        if k > 0 and tk < 4 / FPS and rects[k - 1][2] == ly:
            e = ease(tk / (4 / FPS)); xa, wa, _ = rects[k - 1]
            x, w = xa + (x - xa) * e, wa + (w - wa) * e
            caixa, al = pill(x, w, y0 + ly, 1.0)
        else:                                              # primeira palavra, ou troca de linha: a pílula acende
            e = ease(tk / (4 / FPS))
            caixa, al = pill(x, w, y0 + ly, e, 0.7 + 0.3 * e)
        d.rounded_rectangle(caixa, RAIO, fill=COR_DESTAQUE + (int(255 * al * op),))
    for i, (p, (x, w, ly)) in enumerate(zip(g, rects)):
        s = 1.0
        if i == k:                                         # "pop": a palavra falada entra a 108% e assenta em 6 quadros
            s = 1 + 0.08 * (1 - ease((t - p['ini']) / (6 / FPS)))
        im, esq = img_palavra(p['texto'])
        im = im.resize((max(1, int(im.width * s / 2)), max(1, int(im.height * s / 2))), Image.LANCZOS)
        if op < 1:
            im.putalpha(im.getchannel('A').point(lambda v: int(v * op)))
        cx, cy = x + w / 2, y0 + ly + (CAP_TOPO + BASE) / 2
        cam.alpha_composite(im, (int(round(cx - w * s / 2 - (CONTORNO + esq / 2) * s)), int(round(cy - (CAP_TOPO + BASE) / 2 * s - (CONTORNO + ACIMA / 2) * s))))
    # sombra suave (cor do contorno) do conjunto, 60%, 6 px para baixo
    a = cam.getchannel('A').filter(ImageFilter.GaussianBlur(12)).point(lambda v: int(v * 0.6))
    sombra = Image.new('RGBA', (W, FAIXA_H), COR_CONTORNO + (0,)); sombra.putalpha(a)
    out = Image.new('RGBA', (W, FAIXA_H), (0, 0, 0, 0))
    out.alpha_composite(sombra, (0, 6))
    out.alpha_composite(cam)
    return out


def titulo_quadro(t, tit):
    """(texto, gradiente) RGBA do quadro inteiro no instante t, ou None. tit = pc.legenda.titulo com
    "fim_s" resolvido (titulo_da_peca): contexto em caixa alta espaçada, acento maior encostado por
    baixo (duas vozes), gradiente de leitura na cor do contorno descendo do topo."""
    a, b = tit['ini_s'], tit['fim_s']
    if not a <= t < b:
        return None
    op = ease((t - a) / (8 / FPS)) * (1 - ease((t - (b - 6 / FPS)) / (6 / FPS)))
    dy = (1 - ease((t - a) / (8 / FPS))) * 20
    if 'img' not in tit:
        fc = ImageFont.truetype(tit['fonte_contexto'], tit.get('tam_contexto', 64))
        fa = ImageFont.truetype(tit['fonte_acento'], tit.get('tam_acento', 190))
        ctx, trk = tit['contexto'], tit.get('tracking', 0.28) * tit.get('tam_contexto', 64)
        wc = sum(fc.getlength(ch) for ch in ctx) + trk * (len(ctx) - 1)
        l, tp, r, bt = fa.getbbox(tit['acento'])
        _, ctp, _, cb = fc.getbbox('H')
        im = Image.new('RGBA', (W, 700), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        x = ((X0 + X1) - wc) / 2
        for ch in ctx:                                            # o traço engrossa a fonte fina do contexto
            d.text((x, 40 - ctp), ch, font=fc, fill=COR_TEXTO + (255,), stroke_width=tit.get('traco_contexto', 0),
                   stroke_fill=COR_TEXTO + (255,)); x += fc.getlength(ch) + trk
        y_ac = 40 + (cb - ctp) + tit.get('vao', -14) - tp        # a linha do acento encosta na de cima
        d.text((((X0 + X1) - (r - l)) / 2 - l, y_ac), tit['acento'], font=fa, fill=COR_TEXTO + (255,))
        if tit.get('rodape'):                                     # 3ª linha, na voz do contexto (o cartão final)
            rod = tit['rodape']
            wr = sum(fc.getlength(ch) for ch in rod) + trk * (len(rod) - 1)
            x, y_r = ((X0 + X1) - wr) / 2, y_ac + bt + tit.get('vao_rodape', 24) - ctp
            for ch in rod:
                d.text((x, y_r), ch, font=fc, fill=COR_TEXTO + (255,), stroke_width=tit.get('traco_contexto', 0),
                       stroke_fill=COR_TEXTO + (255,)); x += fc.getlength(ch) + trk
        tit['img'] = im
        g = np.zeros((H, W), np.float32)                          # gradiente de leitura, 45% na borda
        alto = tit.get('gradiente_ate', 900)
        g[:alto] = (0.45 * (1 - np.linspace(0, 1, alto)) ** 1.6)[:, None]
        tit['grad'] = g
    txt = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    im = tit['img'] if op >= 1 else tit['img'].copy()
    if op < 1:
        im.putalpha(im.getchannel('A').point(lambda v: int(v * op)))
    txt.alpha_composite(im, (0, int(round(tit.get('y', 390) - 40 + dy))))
    grad = Image.new('RGBA', (W, H), COR_CONTORNO + (0,))
    grad.putalpha(Image.fromarray((tit['grad'] * op * 255).astype(np.uint8)))
    return txt, grad


def janelas_de(grupos, total_s):
    js = []
    for i, g in enumerate(grupos):
        a = g[0]['ini'] - 0.08
        b = grupos[i + 1][0]['ini'] - 0.08 if i + 1 < len(grupos) else min(total_s, g[-1]['fim'] + 0.6)
        js.append((a, b))
    return js


def quadro_inteiro(t, grupos, janelas, titulo=None):
    """(RGBA do quadro inteiro, alfa reto; caixas da tinta visível) no instante t, ou (None, [])."""
    im = quadro(t, grupos, janelas)
    tqs = [x for x in (titulo_quadro(t, tt) for tt in (titulo if isinstance(titulo, list) else [titulo] if titulo else [])) if x]
    if im is None and not tqs:
        return None, []
    cheio = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    bbs = []
    for tq in tqs:
        cheio.alpha_composite(tq[1]); cheio.alpha_composite(tq[0])
        bbs.append(tq[0].getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    if im is not None:
        cheio.alpha_composite(im, (0, FAIXA_Y))
        bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()   # tinta visível
        assert not bb or (bb[1] > 0 and bb[3] < FAIXA_H), f'a tinta encosta na borda da faixa desenhada em {t:.2f} s'
        bbs.append(bb and (bb[0], bb[1] + FAIXA_Y, bb[2], bb[3] + FAIXA_Y))
    return cheio, [bb for bb in bbs if bb]      # a zona segura vale para a tinta, não para o gradiente


def na_zona(caixa, t):
    """Zona segura do Reel, medida na tinta de verdade (sombra incluída), no instante t."""
    if not (caixa[1] >= TOPO and caixa[3] <= H - RODAPE and caixa[0] >= X0 and caixa[2] <= X1):
        raise ValueError(f'tinta fora da zona segura em {t:.2f} s: {list(caixa)} (zona x {X0}–{X1}, '
                         f'y {TOPO}–{H - RODAPE}): mude centro_y/tamanho da legenda ou o y do título')


def juntar(caixa, bbs):
    for bb in bbs:
        caixa = [min(caixa[0], bb[0]), min(caixa[1], bb[1]), max(caixa[2], bb[2]), max(caixa[3], bb[3])]
    return caixa


def renderizar(palavras, saida, total_s, titulo=None):
    """Grava em <saida>.parcial e só dá o nome no fim; a zona segura é conferida quadro a quadro e
    para no primeiro ruim: render que falha não deixa um .mov ruim com o nome da legenda. ".parcial"
    não é extensão de mídia, então o resolve_projeto.py não importa o arquivo pela metade."""
    grupos = agrupar(palavras, total_s)
    janelas = janelas_de(grupos, total_s)
    n = int(round(total_s * FPS))
    tmp = saida + '.parcial'
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}',
                           '-r', '30000/1001', '-i', '-', '-c:v', 'prores_ks', '-profile:v', '4444',
                           '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', '-f', 'mov', tmp], stdin=subprocess.PIPE)
    vazio = bytes(W * H * 4)
    caixa = [W, H, 0, 0]
    try:
        for q in range(n):
            cheio, bbs = quadro_inteiro(q / FPS, grupos, janelas, titulo)
            if cheio is None:
                ff.stdin.write(vazio); continue
            for bb in bbs:
                na_zona(bb, q / FPS)
            caixa = juntar(caixa, bbs)
            px = np.asarray(cheio, dtype=np.uint16)
            px[..., :3] = px[..., :3] * px[..., 3:4] // 255          # premultiplica (como a logo animada)
            ff.stdin.write(px.astype(np.uint8).tobytes())
        ff.stdin.close()
        if ff.wait() != 0:
            raise ValueError('o ffmpeg falhou ao gravar a legenda')
    except BaseException:
        ff.kill(); ff.wait()
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    os.replace(tmp, saida)
    return {'quadros': n, 'grupos': [' '.join(p['texto'] for p in g) for g in grupos],
            'janelas_s': [(round(a, 3), round(b, 3)) for a, b in janelas], 'caixa_tinta': caixa}


# ---------------------------------------------------------------- a peça do montagem.json (--peca)

def fundir_trechos(mapa):
    """Trechos CONTÍGUOS da fala (mesma fonte e mesma timeline encostadas) viram um só antes do
    palavras_na_timeline: ele prende a palavra à borda do trecho, e numa borda contígua isso a atrasa."""
    fund = [dict(mapa[0])]
    for m in mapa[1:]:
        u = fund[-1]
        if m['fonte_s'][0] == u['fonte_s'][1] and m['timeline_q'][0] == u['timeline_q'][1]:
            u['fonte_s'] = [u['fonte_s'][0], m['fonte_s'][1]]
            u['timeline_s'] = [u['timeline_s'][0], m['timeline_s'][1]]
            u['timeline_q'] = [u['timeline_q'][0], m['timeline_q'][1]]
        else:
            fund.append(dict(m))
    return fund


TITULO = {'contexto', 'acento', 'fonte_contexto', 'fonte_acento', 'ini_s', 'ate_s', 'ate_q', 'y', 'tam_contexto',
          'tam_acento', 'tracking', 'traco_contexto', 'vao', 'gradiente_ate', 'rodape', 'vao_rodape'}


def titulo_da_peca(t, fim_do_gancho_q, rel=lambda p: p):
    """pc.legenda.titulo → o dict do titulo_quadro. Até quando: ate_s, ate_q (quadro da timeline), ou,
    sem os dois, o fim do 1º segmento da peça: o título é o gancho e sai quando ele acaba."""
    sobra = set(t) - TITULO
    if sobra:
        raise ValueError(f'legenda.titulo: chave desconhecida {sorted(sobra)} (aceitas: {", ".join(sorted(TITULO))})')
    falta = [k for k in ('contexto', 'acento', 'fonte_contexto', 'fonte_acento') if not t.get(k)]
    if falta:
        raise ValueError(f'legenda.titulo: falta {falta}' + (' (fontes: rode o fontes.ts)' if 'fonte' in str(falta) else ''))
    tit = {k: v for k, v in t.items() if k not in ('ate_s', 'ate_q')}
    for k in ('fonte_contexto', 'fonte_acento'):
        tit[k] = rel(t[k])
        if not os.path.isfile(tit[k]):
            raise ValueError(f'legenda.titulo.{k} não existe ({tit[k]}): rode o fontes.ts ou passe o caminho')
    tit.setdefault('ini_s', 0.0)
    tit['fim_s'] = t['ate_s'] if 'ate_s' in t else (t['ate_q'] if 'ate_q' in t else fim_do_gancho_q) / FPS
    return tit


def saida_livre(caminho):
    """O caminho, ou -v2, -v3… ao lado quando ele já existe: legenda aprovada não é sobrescrita."""
    if not os.path.exists(caminho):
        return caminho
    base, ext = os.path.splitext(caminho)
    base, k = re.sub(r'-v\d+$', '', base), 2
    while os.path.exists(f'{base}-v{k}{ext}'):
        k += 1
    return f'{base}-v{k}{ext}'


def _montar_fala():
    """O montar_fala.py da mesma pasta. Importar roda a autoconferência dele (argv curto), que
    imprime "ok": o stdout daqui é só o JSON."""
    import contextlib, importlib.util, io
    spec = importlib.util.spec_from_file_location('montar_fala', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'montar_fala.py'))
    m = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, [spec.origin]
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            spec.loader.exec_module(m)
    finally:
        sys.argv = argv
    return m


def ffprobe_info(caminho):
    """(fps REAL, quadros) do vídeo, como o Media Pool devolve ao montar_fala.py."""
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                        'stream=r_frame_rate,nb_frames', '-of', 'json', caminho], capture_output=True, text=True)
    s = (json.loads(r.stdout or '{}').get('streams') or [None])[0] if r.returncode == 0 else None
    if not s or '/' not in s.get('r_frame_rate', ''):
        raise ValueError(f'não li o fps de {caminho} (o ffprobe precisa do arquivo no disco)')
    return Fraction(s['r_frame_rate']), int(s.get('nb_frames') or 0)


def peca(raiz, pid, montagem=None, saida=None, quadros=None):
    mf = _montar_fala()
    rel = lambda p: p if os.path.isabs(p) else os.path.join(raiz, p)
    arq_m = montagem or os.path.join(raiz, '04_DAVINCI', 'montagem.json')
    pc = next((x for x in json.load(open(arq_m))['pecas'] if x.get('id') == pid and 'segmentos' in x), None)
    if pc is None:
        raise ValueError(f'{arq_m}: não há peça "{pid}" com "segmentos"')
    lg = pc.get('legenda') or {}
    erros = mf.validar(pc)
    sobra = set(lg) - {'arquivo', 'alfa', 'estilo', 'titulo'}
    if sobra:
        erros.append(f'legenda: chave desconhecida {sorted(sobra)} (aceitas: arquivo, alfa, estilo, titulo)')
    if lg.get('alfa') not in (None, 'Premultiplied'):
        erros.append(f'legenda.alfa = {lg["alfa"]!r}: este script grava premultiplicado; use "Premultiplied" '
                     '(outro modo dá borda escura no Resolve) ou null')
    if not pc.get('transcricao'):
        erros.append('falta "transcricao" na peça (a saída do transcrever.py, com o tempo da fonte)')
    if not (saida or lg.get('arquivo')):
        erros.append('falta legenda.arquivo (ou --saida)')
    if erros:
        raise ValueError('\n'.join(erros))
    estilo = dict(lg.get('estilo') or {})
    if estilo.get('fonte'):
        estilo['fonte'] = rel(estilo['fonte'])
    configurar(estilo)

    # a conta do montar_fala.py fora do Resolve: fps e quadros de cada arquivo pelo ffprobe
    FR = Fraction(30000, 1001)
    infos = {}
    info = lambda a: infos[a] if a in infos else infos.setdefault(a, ffprobe_info(rel(a)))
    linhas, avisos, total, _, _ = mf.simular(pc['segmentos'], FR, info, pc['fala'])
    mapa = fundir_trechos(mf.mapa_da_fala(linhas, FR, info(pc['fala'])[0]))
    T = json.load(open(rel(pc['transcricao'])))
    # sem "publico" (palavra posta à mão na revisão): a regra do transcrever.py, "[risos]" fica de fora
    publico = lambda w: w['publico'] if w.get('publico') is not None else \
        w['palavra'][:1] not in '[(' and bool(re.search(r'\w', w['palavra']))
    pal = [{'ini': w['ini_s'], 'fim': w['fim_s'], 'texto': w['palavra']} for w in T if publico(w)]
    pt = mf.palavras_na_timeline(mapa, pal)
    dur = total / FPS
    lt = lg.get('titulo')
    if isinstance(lt, list):                      # vários títulos (gancho, cartão final…): só o 1º pode ficar sem ate_*
        if any('ate_s' not in x and 'ate_q' not in x for x in lt[1:]):
            raise ValueError('legenda.titulo: numa lista, do 2º título em diante ate_s ou ate_q é obrigatório')
        tit = [titulo_da_peca(x, linhas[0]['v1_q'][1], rel) for x in lt]
    else:
        tit = titulo_da_peca(lt, linhas[0]['v1_q'][1], rel) if lt else None
    r = {'peca': pid, 'total_q': total, 'total_s': round(dur, 3), 'palavras': len(pt), 'trechos_de_fala': len(mapa),
         'avisos': avisos}
    if tit:
        r['titulo_s'] = [[round(x['ini_s'], 3), round(x['fim_s'], 3)] for x in tit] if isinstance(tit, list) \
            else [round(tit['ini_s'], 3), round(tit['fim_s'], 3)]

    if quadros:                                   # conferência: PNGs sobre cinza médio, sem vídeo
        grupos = agrupar(pt, dur); janelas = janelas_de(grupos, dur)
        pasta = os.path.join(raiz, '07_TEMPORARIOS')
        os.makedirs(pasta, exist_ok=True)
        nome = os.path.splitext(os.path.basename(saida or lg['arquivo']))[0]
        caixa, pngs = [W, H, 0, 0], []
        for t in quadros:
            q = int(round(t * FPS))               # o quadro inteiro mais perto: é o que o .mov mostra ali
            cheio, bbs = quadro_inteiro(q / FPS, grupos, janelas, tit)
            for bb in bbs:
                na_zona(bb, q / FPS)
            caixa = juntar(caixa, bbs)
            fundo = Image.new('RGBA', (W, H), (128, 128, 128, 255))
            if cheio is not None:
                fundo.alpha_composite(cheio)
            pngs.append(os.path.join(pasta, f'{nome}-q{q:05d}-{q / FPS:.2f}s.png'))
            fundo.convert('RGB').save(pngs[-1])
        return {**r, 'pngs': pngs, 'caixa_tinta': caixa,
                'grupos': [' '.join(p['texto'] for p in g) for g in grupos]}

    pedida = saida or rel(lg['arquivo'])
    final = saida_livre(pedida)
    os.makedirs(os.path.dirname(final) or '.', exist_ok=True)
    res = renderizar(pt, final, dur, titulo=tit)
    r.update(saida=final, **res)
    r['curtos'] = [(g, round(b - a, 2)) for g, (a, b) in zip(res['grupos'], res['janelas_s']) if b - a < MINIMO_NA_TELA]
    if final != pedida:
        r['aviso_saida'] = (f'{pedida} já existia: gravei em {final}. No Resolve, troque a mídia da V2 pelo '
                            'trocar_midia.py; o montagem.json segue apontando para o nome antigo.')
    return r


# ---------------------------------------------------------------- autoconferência

def _checar():
    import tempfile
    fonte = next((f for f in ('/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf',
                              '/System/Library/Fonts/Helvetica.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
                  if os.path.isfile(f)), None)
    assert fonte, 'nenhuma fonte do sistema para a autoconferência'
    # sem fonte não há padrão: o erro manda para o fontes.ts; chave errada não passa calada
    for ruim in ({}, {'fonte': '/nao/existe.ttf'}):
        try:
            configurar(ruim); raise AssertionError('devia recusar')
        except ValueError as e:
            assert 'fontes.ts' in str(e), e
    try:
        configurar({'fonte': fonte, 'cor_destaq': '#557737'}); raise AssertionError('devia recusar')
    except ValueError as e:
        assert 'cor_destaq' in str(e), e
    for k, v in (('muletas', 'né'), ('caixa_alta', 'false'), ('cor_texto', '#FFF'), ('tamanho', '84')):
        try:
            configurar({'fonte': fonte, k: v}); raise AssertionError(f'devia recusar {k}')
        except ValueError as e:
            assert f'legenda.estilo.{k}' in str(e), e

    configurar({'fonte': fonte, 'caixa_alta': True, 'cor_destaque': '#557737'})
    P = lambda *ws: [{'ini': a, 'fim': b, 'texto': t} for t, a, b in ws]
    txt = lambda gs: [' '.join(p['texto'] for p in g) for g in gs]
    # até 3 palavras; quebra em pausa > 0,25 s e depois de pontuação; muleta sai
    A = P(('um', 0, .2), ('dois', .25, .45), ('três', .5, .7), ('quatro', .75, .95), ('né,', 1.0, 1.1),
          ('cinco', 1.5, 1.7), ('seis.', 1.75, 1.9), ('sete', 1.95, 2.1))
    assert txt(agrupar(A)) == ['um dois três', 'quatro', 'cinco seis.', 'sete'], txt(agrupar(A))
    # palavra curta não fecha grupo: passa para o seguinte
    assert txt(agrupar(P(('vamos', 0, .2), ('comer', .22, .4), ('no', .42, .5), ('quintal', .52, .8)))) == \
        ['vamos comer', 'no quintal']
    # janelas: 0,08 s antes da 1ª palavra; o último grupo fica até 0,6 s depois da fala (ou o fim)
    gs = agrupar(A)
    assert janelas_de(gs, 10.0)[0] == (-0.08, 0.75 - 0.08) and janelas_de(gs, 10.0)[-1] == (1.95 - 0.08, 2.1 + 0.6)
    assert janelas_de(gs, 2.3)[-1][1] == 2.3
    # grupo curto (< 0,5 s) se junta ao próximo; nunca atravessa fim de frase
    assert txt(agrupar(P(('certo,', 0, .3), ('vamos', .35, .5), ('embora.', .52, .9), ('Agora', 1.5, 1.8)), 3.0)) == \
        ['certo, vamos embora.', 'Agora']
    assert txt(agrupar(P(('Oi.', 0, .2), ('tudo', .3, .5), ('bem?', .52, .8)), 3.0)) == ['Oi.', 'tudo bem?']
    # a curta que FECHA frase fica no grupo dela: levada adiante, o grupo atravessaria o "?"
    assert txt(agrupar(P(('Sabe', 0, .2), ('o', .22, .3), ('que', .32, .45), ('é?', .47, .6), ('Então', 1.2, 1.5),
                         ('vem.', 1.52, 1.8)), 3.0)) == ['Sabe o que é?', 'Então vem.']
    # palavra sozinha mais larga que a coluna: recusa com a palavra e o instante, antes de qualquer render
    try:
        agrupar(P(('prato', 0, .3), ('acompanhamentoooooooooos', 1.25, 1.9))); raise AssertionError('devia recusar')
    except ValueError as e:
        assert 'ACOMPANHAMENTOOOOOOOOOOS' in str(e) and '1.25 s' in str(e), e
    # duas linhas: cada uma cabe, e a 1ª não termina em palavra curta mesmo que a outra quebra equilibre mais
    g = P(('carne', 0, .2), ('de', .2, .3), ('primeira', .3, .6))
    lw = lambda ps: sum(larg(q['texto']) for q in ps) + ESPACO * TAM * (len(ps) - 1)
    assert lw(g) > LARG_MAX and max(lw(g[:2]), lw(g[2:])) < max(lw(g[:1]), lw(g[1:])) <= LARG_MAX  # premissa
    assert [[p['texto'] for p in ln] for ln in linhas_de(g)] == [['carne'], ['de', 'primeira']]
    # caixa: a largura é a do texto como aparece
    configurar({'fonte': fonte})
    assert larg('costela') < larg('COSTELA') and na_caixa('Costela') == 'Costela'
    # margens diferentes: a linha centra na zona segura, não no quadro
    configurar({'fonte': fonte, 'caixa_alta': True, 'margem_dir': 200})
    r = diagramar(P(('boas', 0, .2), ('vindas', .2, .4)))
    assert abs((r[0][0] + r[-1][0] + r[-1][1]) / 2 - (120 + 880) / 2) < 1e-6, r
    # Ç, acentos, descendentes e o rabo do j (lado esquerdo negativo) não são cortados: a imagem da
    # palavra tem toda a tinta da mesma palavra desenhada com 100 px de folga em volta
    tinta = lambda im: int(np.asarray(im.getchannel('A'), np.int64).sum())
    for cx in (True, False):
        configurar({'fonte': fonte, 'caixa_alta': cx})
        for w in ('ação', 'jogo', 'já', 'QUINTAL,', 'prato', 'ÃO'):
            im, esq = img_palavra(w)
            ref = Image.new('RGBA', (im.width + 200, im.height + 200), (0, 0, 0, 0))
            ImageDraw.Draw(ref).text((100 + 2 * CONTORNO + esq, 100 + 2 * CONTORNO + ACIMA), na_caixa(w), font=F2,
                                     fill=COR_TEXTO + (255,), stroke_width=2 * CONTORNO, stroke_fill=COR_CONTORNO + (255,))
            assert tinta(im) == tinta(ref), (cx, w, tinta(im), tinta(ref))
    configurar({'fonte': fonte})
    assert F2.getbbox('já')[0] < 0 and img_palavra('já')[1] > 0      # premissa: a fonte do teste tem o caso
    im, esq = img_palavra('tomate')  # sem descendente nem lado negativo, a imagem é a de sempre
    assert esq == 0 and im.height == int(BASE * 2) + 28 + 4 * CONTORNO + ACIMA
    # um quadro de verdade: pílula só com cor de destaque; tinta dentro da zona segura
    frase = P(('Fomos', 1.0, 1.3), ('campeões,', 1.35, 1.9))
    for dest in ('#557737', None):
        configurar({'fonte': fonte, 'caixa_alta': True, 'cor_destaque': dest})
        gs = agrupar(frase, 3.0)
        cheio, bbs = quadro_inteiro(1.5, gs, janelas_de(gs, 3.0))
        for bb in bbs:
            na_zona(bb, 1.5)
        px = np.asarray(cheio)
        verde = int(((px[..., 0] == 85) & (px[..., 1] == 119) & (px[..., 2] == 55) & (px[..., 3] > 200)).sum())
        assert (verde > 1000) if dest else (verde == 0), (dest, verde)
    # trechos contíguos se fundem; o salto (outra fonte ou outra posição) fica separado
    mp = [{'fonte_s': [1.0, 2.0], 'timeline_s': [0.0, 1.0], 'timeline_q': [0, 30]},
          {'fonte_s': [2.0, 3.0], 'timeline_s': [1.0, 2.0], 'timeline_q': [30, 60]},
          {'fonte_s': [5.0, 6.0], 'timeline_s': [2.0, 3.0], 'timeline_q': [60, 90]}]
    assert fundir_trechos(mp) == [{'fonte_s': [1.0, 3.0], 'timeline_s': [0.0, 2.0], 'timeline_q': [0, 60]}, mp[2]]
    # título: ate_s, ate_q ou o fim do gancho
    tb = {'contexto': 'X', 'acento': 'y', 'fonte_contexto': fonte, 'fonte_acento': fonte}
    assert titulo_da_peca({**tb, 'ate_s': 2.5}, 88)['fim_s'] == 2.5
    assert titulo_da_peca({**tb, 'ate_q': 60}, 88)['fim_s'] == 60 / FPS
    assert titulo_da_peca(tb, 88)['fim_s'] == 88 / FPS and titulo_da_peca(tb, 88)['ini_s'] == 0.0
    try:
        titulo_da_peca({**tb, 'fonte_acento': '/nao/existe.otf'}, 88); raise AssertionError('devia recusar')
    except ValueError as e:
        assert 'fontes.ts' in str(e), e
    # nunca sobrescreve: -v2, -v3…
    with tempfile.TemporaryDirectory() as d:
        a = os.path.join(d, 'x-legenda.mov')
        assert saida_livre(a) == a
        open(a, 'w').close()
        assert saida_livre(a) == os.path.join(d, 'x-legenda-v2.mov')
        open(os.path.join(d, 'x-legenda-v2.mov'), 'w').close()
        assert saida_livre(a) == saida_livre(os.path.join(d, 'x-legenda-v2.mov')) == os.path.join(d, 'x-legenda-v3.mov')
    try:
        na_zona((X0, TOPO, X1, H - RODAPE + 1), 12.345); raise AssertionError('devia recusar')
    except ValueError as e:
        assert '12.35 s' in str(e), e
    _checar_peca(fonte)
    print('ok')


def _checar_peca(fonte):
    """O caminho da skill de ponta a ponta (peca + renderizar) numa peça sintética de 1 s: RAIZ com
    espaço e acento, clipe de 2 s do ffmpeg, título sem ate_s/ate_q, palavra fora do público."""
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        raiz = os.path.join(d, 'Projeto Ç')
        os.makedirs(os.path.join(raiz, '01_BRUTO')); os.makedirs(os.path.join(raiz, '04_DAVINCI'))
        motion = os.path.join(raiz, '06_ELEMENTOS', 'Motion')
        os.makedirs(motion)
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=64x64:r=30000/1001:d=2',
                        '-c:v', 'prores_ks', os.path.join(raiz, '01_BRUTO', 'fala.mov')], check=True)
        # tempo da FONTE: a fala usada é 0–0,5 s e 1,0–1,5 s; "[risos]" sem o campo segue a regra do transcrever
        T = [{'palavra': 'Olá,', 'ini_s': .05, 'fim_s': .3, 'publico': True},
             {'palavra': '[risos]', 'ini_s': .32, 'fim_s': .45},
             {'palavra': 'ahn', 'ini_s': 1.02, 'fim_s': 1.1, 'publico': False},
             {'palavra': 'Grelhado', 'ini_s': 1.15, 'fim_s': 1.45}]
        json.dump(T, open(os.path.join(raiz, '04_DAVINCI', 'transcricao.json'), 'w'))
        # contorno BRANCO: com alfa reto a borda semitransparente seria RGB 255 sobre alfa baixo
        estilo = {'fonte': fonte, 'cor_texto': '#FFFFFF', 'cor_contorno': '#FFFFFF'}
        base = {'segmentos': [{'de_s': 0.0, 'ate_s': 0.5}, {'de_s': 1.0, 'ate_s': 1.5}], 'fala': '01_BRUTO/fala.mov',
                'transcricao': '04_DAVINCI/transcricao.json'}
        leg = lambda nome, **e: {'arquivo': f'06_ELEMENTOS/Motion/{nome}-legenda.mov', 'alfa': 'Premultiplied',
                                 'estilo': {**estilo, **e}}
        tit = {'contexto': 'X', 'acento': 'y', 'fonte_contexto': fonte, 'fonte_acento': fonte}
        pecas = {'T': {**leg('T'), 'titulo': tit},
                 # o título entra em 0,6 s acima da zona segura: o render falha no meio, com o .parcial já no disco
                 'F': {**leg('F'), 'titulo': {**tit, 'y': 60, 'ini_s': 0.6, 'ate_s': 1.0}},
                 'L': leg('L', tamanho=300),                                 # "Grelhado" não cabe na coluna
                 'K': {**leg('K'), 'título': {}}, 'S': {**leg('S'), 'alfa': 'Straight'},
                 # lista: gancho + cartão final com 3ª linha; do 2º em diante sem ate_* é recusado
                 'M': {**leg('M'), 'titulo': [tit, {**tit, 'rodape': 'Z', 'ini_s': 0.7, 'ate_s': 1.0}]},
                 'N': {**leg('N'), 'titulo': [tit, {**tit, 'ini_s': 0.7}]}}
        json.dump({'pecas': [{**base, 'id': k, 'legenda': v} for k, v in pecas.items()]},
                  open(os.path.join(raiz, '04_DAVINCI', 'montagem.json'), 'w'))

        def recusa(pid, trecho, **kw):
            try:
                peca(raiz, pid, **kw); raise AssertionError(f'devia recusar {pid}')
            except ValueError as e:
                assert trecho in str(e), e
        recusa('K', 'título'); recusa('S', 'Straight'); recusa('N', 'ate_s ou ate_q é obrigatório')
        m = peca(raiz, 'M', quadros=[0.2, 0.8])
        assert m['titulo_s'] == [[0.0, round(15 / FPS, 3)], [0.7, 1.0]], m
        # tinta do título (acima de y 1000, longe da legenda): o cartão de 0,8 s desce mais, pela 3ª linha
        fundo = lambda f: np.nonzero((np.abs(np.asarray(Image.open(f)).astype(int)[:1000] - 128).max(axis=2) > 40).any(axis=1))[0]
        g, c = fundo(m['pngs'][0]), fundo(m['pngs'][1])
        assert len(g) and len(c) and c.max() > g.max() + 20, ('3ª linha do cartão', g.max() if len(g) else None, c.max() if len(c) else None)
        for f in m['pngs']:
            os.remove(f)
        recusa('L', '"Grelhado" em 0.65 s')          # antes do render: nenhum arquivo nasce
        recusa('F', 'zona segura em 0.70 s', quadros=[0.3, 0.7])
        recusa('F', 'zona segura em 0.6')            # para no 1º quadro ruim e apaga o .parcial
        assert sorted(os.listdir(motion)) == [], os.listdir(motion)

        pedida = os.path.join(motion, 'T-legenda.mov')
        open(pedida, 'w').close()                    # já existe: a legenda nova vai para -v2
        r = peca(raiz, 'T', quadros=[0.4])
        assert os.path.isfile(r['pngs'][0]) and r['grupos'] == ['Olá, Grelhado'], r
        r = peca(raiz, 'T')
        assert r['saida'] == os.path.join(motion, 'T-legenda-v2.mov') and 'aviso_saida' in r, r
        assert os.path.getsize(pedida) == 0 and sorted(os.listdir(motion)) == ['T-legenda-v2.mov', 'T-legenda.mov']
        # "[risos]" e "ahn" ficam de fora; "Grelhado" ficaria < 0,5 s sozinho e se junta ao anterior
        assert r['palavras'] == 2 and r['grupos'] == ['Olá, Grelhado'] and r['trechos_de_fala'] == 2, r
        assert r['titulo_s'] == [0.0, round(15 / FPS, 3)], r          # o 1º segmento acaba no quadro 15
        assert r['quadros'] == 30, r
        # alfa premultiplicado no arquivo: onde é semitransparente, o RGB não passa do alfa
        px = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-ss', '0.4', '-i', r['saida'], '-frames:v', '1',
                                           '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], capture_output=True,
                                          check=True).stdout, np.uint8).reshape(H, W, 4).astype(int)
        semi = (px[..., 3] > 0) & (px[..., 3] < 255)
        acima = (px[..., :3].max(axis=2) > px[..., 3] + 10) & semi
        assert semi.sum() > 1000 and acima.sum() < 0.01 * semi.sum(), (int(semi.sum()), int(acima.sum()))


if __name__ == '__main__':
    USO = ('legenda.py: uso: python3 legenda.py --peca <RAIZ> <ID> [--montagem <json>] [--saida <mov>] '
           '[--quadros 1.0,4.0]  (sem argumentos: autoconferência)')
    if len(sys.argv) == 1:
        _checar(); sys.exit(0)
    if '--peca' not in sys.argv:                  # a forma antiga (palavras.json saida total_s) não pode passar por "ok"
        sys.exit(USO)
    arg = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None
    i = sys.argv.index('--peca')
    try:
        raiz, pid = sys.argv[i + 1], sys.argv[i + 2]
        opcoes = arg('--montagem'), arg('--saida'), arg('--quadros')
    except IndexError:
        sys.exit(USO)
    try:
        qs = [float(x) for x in opcoes[2].split(',')] if opcoes[2] else None
        print(json.dumps(peca(raiz, pid, opcoes[0], opcoes[1], qs), ensure_ascii=False, indent=1))
    except (ValueError, OSError) as e:           # OSError: montagem/transcrição fora do disco
        sys.exit(f'legenda.py: {e}')
