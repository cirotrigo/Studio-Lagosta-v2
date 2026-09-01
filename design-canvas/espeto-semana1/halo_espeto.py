# -*- coding: utf-8 -*-
"""HALO do Espeto Gaucho — o que este cliente acrescenta ao modulo compartilhado.

A mancha em si (`halo`, `op`, `conferir_divs`) vem de `design-canvas/_halo.py`.
Aqui moram as tres coisas que a fotografia e o gerador deste cliente exigem:

1. A TINTA E A COR DA MARCA. O veu do Espeto sempre foi `rgb(23 14 9)`, marrom
   quente, e a paleta inteira e quente. Preto neutro atras de brasa esfria a
   peca. (O modulo compartilhado ja preve isso no parametro `cor`.)

2. A LUZ E LIDA POR PERCENTIL, NAO POR MEDIA. Foto de churrasco tem brilho
   especular forte — lamina de faca, gordura, prato branco, chopp — sobre fundo
   escuro. A media diz "regiao escura, quase nao precisa de halo" e a letra cai
   justamente em cima do reflexo. O percentil responde "quao claro fica o pior
   pedaco onde a letra pousa", que e a pergunta certa.

3. A GEOMETRIA E MEDIDA NO CHROME, NAO ESTIMADA. O bloco do Espeto tem altura
   variavel (a descricao aceita lista, o titulo quebra sozinho, o arranjo muda
   por peca) e nenhuma conta analitica acerta. A sonda le o retangulo real de
   cada grupo e a luz e lida exatamente ali.

E, tendo o retangulo real, da para resolver por conta o aviso do modulo
compartilhado sobre BLOCO CURTO — ver `compensar`.
"""
import json, math, os, re, subprocess, hashlib, sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from _halo import halo as _halo_css, op, conferir_divs      # modulo compartilhado
except ImportError:                                              # copia de trabalho
    sys.path.insert(0, "/Users/cirotrigo/Documents/Studio-Lagosta-v2/design-canvas")
    from _halo import halo as _halo_css, op, conferir_divs

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TINTA = "23,14,9"        # o marrom do veu do Espeto, agora so atras do texto
# Faixas do interpolador, calibradas neste cliente (ver README).
TINTA_FAIXA = (0.42, 0.86)
RAIO_FAIXA = (120, 152)
# 🔴 O inset nao e respiro estetico: e o espaco onde a saia da gaussiana cai
# FORA das letras. Com 54/42 a borda do texto recebia 40% da tinta; com 76/64
# recebe 47%, e o resto do trabalho fica com a sombra presa ao glifo. Crescer
# muito mais devolveria a area coberta ao patamar do veu, que e o que este
# mecanismo veio desfazer.
INSET_TEXTO = (76, 64)
INSET_MARCA = (40, 36)


# ---------------------------------------------------------------- medicao da luz
_CACHE = {}


def medir_regiao(caminho_foto, x0, y0, x1, y1, W, H, percentil=88):
    """Luz da regiao onde um bloco pousa, na foto COMO ELA APARECE na peca.

    Simula o `object-fit: cover` do artboard (escala para cobrir WxH e centra),
    entao o recorte medido e exatamente o que o leitor ve.

    Devolve `media` e `p` (o percentil). Quem decide a tinta usa `p`: numa foto
    de churrasco, uma regiao com faca reluzente sobre madeira escura tem media
    ~60, e a letra que cair no reflexo (~200) some. O percentil e o brilho do
    pedaco ruim, sem se deixar levar por um unico realce estourado.
    """
    chave = (caminho_foto, x0, y0, x1, y1, W, H, percentil)
    if chave in _CACHE:
        return _CACHE[chave]
    from PIL import Image, ImageStat
    im = Image.open(caminho_foto).convert("RGB")
    escala = max(W / im.width, H / im.height)
    im = im.resize((max(1, round(im.width * escala)), max(1, round(im.height * escala))),
                   Image.LANCZOS)
    ex, ey = (im.width - W) // 2, (im.height - H) // 2
    im = im.crop((ex, ey, ex + W, ey + H))
    x0, y0 = max(0, int(x0)), max(0, int(y0))
    x1, y1 = min(W, int(x1)), min(H, int(y1))
    if x1 <= x0 or y1 <= y0:
        out = {"media": 128.0, "p": 128.0}
    else:
        g = im.crop((x0, y0, x1, y1)).convert("L")
        h = g.histogram()
        alvo, acc, pv = sum(h) * percentil / 100.0, 0, 255
        for v, n in enumerate(h):
            acc += n
            if acc >= alvo:
                pv = v
                break
        out = {"media": ImageStat.Stat(g).mean[0], "p": float(pv)}
    _CACHE[chave] = out
    return out


# ---------------------------------------------------------------- quanta tinta
# 🔴 A tinta NAO sai de uma interpolacao arbitraria: sai da fisica do contraste.
#
# A faixa (0,42..0,86) herdada do By Rock, somada a compensacao de borda, pedia
# mais tinta do que a opacidade pode dar em 83% dos blocos desta leva — e um
# numero que satura no teto parou de calibrar coisa nenhuma: o bloco sobre
# madeira escura recebia a mesma tinta do bloco sobre o balcao branco. Isso e o
# veu de volta, com outro nome.
#
# A conta certa e direta: para o texto ler, o FUNDO tem de ficar abaixo de um
# certo brilho; o halo compoe o fundo medido em direcao a tinta; logo
#     alfa = (L_medido - L_alvo) / (L_medido - L_tinta)
# e quando L_medido ja esta abaixo do alvo, alfa = 0 e a peca fica sem mancha
# nenhuma — que e o resultado certo numa foto escura.
LUM_TINTA_8BIT = 16.0        # luminancia de rgb(23,14,9)
RATIO_GRANDE = 3.0           # texto de display (>= 40px)
RATIO_PEQUENO = 4.5          # corpo e servico
# Cor de texto abaixo disto NAO e servida pelo halo: ver `SOMBRA_BAIXA_LUM` no
# gerador. O vermelho da marca (Y=0,214) exigiria fundo <= 51, o que devolveria
# a peca ao veu; quem resolve por ele e a sombra presa ao glifo.
LUM_MINIMA_SERVIDA = 0.50


def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminancia_rel(hexa):
    r, g, b = int(hexa[1:3], 16), int(hexa[3:5], 16), int(hexa[5:7], 16)
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def _para_8bit(y):
    y = max(0.0, min(1.0, y))
    s = y * 12.92 if y <= 0.0031308 else 1.055 * (y ** (1 / 2.4)) - 0.055
    return s * 255.0


def fundo_maximo(hexa, ratio):
    """Brilho maximo do fundo (0-255) para o texto atingir `ratio` de contraste."""
    return _para_8bit((luminancia_rel(hexa) + 0.05) / ratio - 0.05)


_DECL = re.compile(r'font-size:\s*(\d+)px[^"]*?color:\s*(#[0-9A-Fa-f]{6})'
                   r'|color:\s*(#[0-9A-Fa-f]{6})[^"]*?font-size:\s*(\d+)px')


def alvo_do_grupo(html, padrao=125.0):
    """O fundo mais escuro que os textos DESTE grupo exigem.

    Le os pares (font-size, color) do proprio HTML — nao ha lista para manter em
    sincronia com os blocos, e bloco novo entra na conta sozinho.
    """
    alvos = []
    for m in _DECL.finditer(html):
        tam = int(m.group(1) or m.group(4))
        cor = (m.group(2) or m.group(3)).upper()
        if luminancia_rel(cor) < LUM_MINIMA_SERVIDA:
            continue                       # servido pela sombra, nao pelo halo
        alvos.append(fundo_maximo(cor, RATIO_GRANDE if tam >= 40 else RATIO_PEQUENO))
    return min(alvos) if alvos else padrao


def alfa_necessaria(luz_medida, luz_alvo):
    if luz_medida <= luz_alvo:
        return 0.0                          # a foto ja e escura o bastante
    return (luz_medida - luz_alvo) / max(1.0, luz_medida - LUM_TINTA_8BIT)


# ---------------------------------------------------------------- bloco curto
def _fracao(lado, raio):
    """Quanto da opacidade nominal sobra no CENTRO de uma caixa borrada.

    `filter: blur(r)` e uma gaussiana de desvio r. O valor no centro de uma
    caixa de lado L e erf(L / (2r*raiz(2))) por eixo — proximo de 1 quando a
    caixa e muito maior que o raio, e bem menor quando nao e.
    """
    return math.erf(lado / (2.0 * max(1.0, raio) * math.sqrt(2.0)))


def _phi(z):
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def _fracao_borda(lado_texto, inset, raio):
    """Fracao da tinta que chega a BORDA do texto, nao ao centro da mancha.

    🔴 E este o numero que importa, e nao o do centro. O texto nao mora no meio
    da mancha: ele a preenche de ponta a ponta, e a PRIMEIRA e a ULTIMA linha
    caem na saia da gaussiana, onde a tinta ja caiu pela metade.

    Medido no Espeto em 01/09/2026 (Dom15Misto, bloco 561x463, inset 54/42,
    raio 138): o centro recebe 93% da tinta e a borda recebe 40%. A ultima
    linha e a assinatura manuscrita em VERMELHO — e o vermelho da marca tem
    luminancia relativa 0,214, entao a 40% de tinta ela fica com 1,38:1 de
    contraste contra o fundo. Some. O branco, no mesmo ponto, tem 5,5:1 e
    parece que esta tudo bem — foi por isso que o defeito passou despercebido
    no By Rock, cuja paleta de texto e branco e cinza claro.
    """
    r = max(1.0, raio)
    return max(0.02, _phi(inset / r) + _phi((lado_texto + inset) / r) - 1.0)


FRACAO_ALVO = 0.80


def fracao_entregue(largura, altura, inset_x, inset_y, raio):
    """Tinta que chega a PRIMEIRA e a ULTIMA LINHA do texto.

    🔴 Nao e o canto. O canto de um bloco de texto e quase sempre espaco em
    branco: a linha de cima e a de baixo encostam na borda VERTICAL, mas
    horizontalmente moram no corpo do bloco. Mirar no canto (borda nos dois
    eixos) pede o dobro de tinta para servir um pedaco onde nao ha letra —
    medido em 01/09/2026: com o alvo no canto, 41 dos 43 grupos da leva
    saturavam no teto de 0,95 e a calibragem pela foto simplesmente parava de
    existir; o bloco sobre madeira escura recebia a mesma tinta que o bloco
    sobre o balcao branco, que e o veu de volta com outro nome.

    Entao: centro no eixo X, borda no eixo Y.
    """
    return _fracao(largura, raio) * _fracao_borda(altura, inset_y, raio)


def raio_para(largura, altura, raio_nominal, alvo=FRACAO_ALVO, piso=46):
    """O maior raio <= `raio_nominal` que ainda ENTREGA `alvo` da tinta no miolo.

    🔴 Medido em 01/09/2026: o lockup da marca (172x120) sob um blur de 140px
    recebe 15% da tinta nominal no centro. Era essa, e nao (so) a falta de
    sombra no glifo, a causa raiz do defeito 2 do roteiro do By Rock ("a logo
    quase sumiu"). E compensar com tinta nao resolve: a opacidade satura em
    0,95 muito antes, e o bloco continua entregando menos do que se pediu.

    Por isso a variavel de ajuste e o RAIO, nao a tinta. O raio grande existe
    para a borda desmanchar; quando a caixa e pequena demais para sustenta-lo,
    encolher o raio devolve contraste ao miolo e a borda continua difusa — uma
    gaussiana de 80px numa caixa de 300px ainda nao tem canto visivel.

    Sem esta regra, TODO grupo medido no Espeto saturava em 0,95 e entregava
    entre 0,64 e 0,69 no centro, escondendo que a peca estava sub-servida.
    """
    lo, hi = piso, max(piso, raio_nominal)
    if _fracao(largura, hi) * _fracao(altura, hi) >= alvo:
        return int(hi)
    for _ in range(28):                      # busca binaria: a fracao e monotona no raio
        meio = (lo + hi) / 2.0
        if _fracao(largura, meio) * _fracao(altura, meio) >= alvo:
            lo = meio
        else:
            hi = meio
    return int(max(piso, lo))


def compensar_borda(alfa, largura, altura, inset_x, inset_y, raio, teto=0.95):
    """Opacidade nominal que ENTREGA `alfa` na borda do texto.

    Satura no teto com frequencia, e isso e informacao, nao defeito: quer dizer
    que a geometria nao sustenta o contraste pedido e quem tem de resolver e a
    sombra presa ao glifo — nunca mais tinta, que a essa altura ja e o veu.
    """
    return min(alfa / max(fracao_entregue(largura, altura, inset_x, inset_y, raio), 0.25), teto)


def compensar(alfa, largura, altura, raio, teto=0.95):
    """Devolve a opacidade que ENTREGA `alfa` no centro de uma caixa LxA.

    🔴 Resolve o aviso do modulo compartilhado sobre bloco curto. Com raio de
    ~140px, um lockup de 3 linhas (≈280px de altura) so recebe ~70% da tinta
    nominal no miolo, enquanto um bloco de 700px recebe ~98%: o MESMO par
    (raio, tinta) entrega contrastes diferentes conforme o tamanho do texto.
    Era isso que obrigava a recalibrar o numero a cada cliente.

    Tendo o retangulo real (a sonda do Chrome), a correcao e calculavel em vez
    de adivinhada. O teto existe porque a conta explode em bloco minusculo —
    ali a saida certa e menos raio, nao mais tinta.
    """
    f = _fracao(largura, raio) * _fracao(altura, raio)
    return min(alfa / max(f, 0.35), teto)


def halo_medido(luz, luz_alvo, largura, altura, inset_x, inset_y,
                escala=1.0, cor=TINTA):
    """A mancha derivada da fisica: quanto de tinta o texto DESTE grupo pede.

    Devolve string vazia quando a foto ja e escura o bastante — o melhor halo e
    o que nao existe.
    """
    a = alfa_necessaria(luz, luz_alvo) * escala
    if a <= 0.02:
        return ''
    raio = raio_para(largura + 2 * inset_x, altura + 2 * inset_y, RAIO_FAIXA[1])
    a = compensar_borda(a, largura, altura, inset_x, inset_y, raio)
    return (f'background: rgba({cor},{round(a, 3)}); '
            f'filter: blur({raio}px); border-radius: {raio + 60}px;')


def halo(luz, largura=None, altura=None, escala=1.0, cor=TINTA,
         inset_x=None, inset_y=None):
    """A mancha do Espeto: cor da marca, faixas do cliente, tinta compensada.

    `largura`/`altura` sao do TEXTO (o rect que a sonda mediu); os insets dizem
    o quanto a mancha sobra para fora dele. Sem eles cai no comportamento do
    modulo compartilhado, sem compensacao nenhuma.
    """
    css = _halo_css(luz, escala, cor=cor, tinta=TINTA_FAIXA, raios=RAIO_FAIXA)
    if largura is None or altura is None:
        return css
    ix = INSET_TEXTO[0] if inset_x is None else inset_x
    iy = INSET_TEXTO[1] if inset_y is None else inset_y
    a = float(re.search(r"rgba\([^)]*,([\d.]+)\)", css).group(1))
    nominal = int(re.search(r"blur\((\d+)px\)", css).group(1))
    raio = raio_para(largura + 2 * ix, altura + 2 * iy, nominal)
    a = compensar_borda(a, largura, altura, ix, iy, raio)
    return (f'background: rgba({cor},{round(a, 3)}); '
            f'filter: blur({raio}px); border-radius: {raio + 60}px;')


# ---------------------------------------------------------------- o wrapper
def envolver(filhos_html, halo_css, hid, gap=13, inset_x=54, inset_y=42):
    """Grupo de blocos com a mancha atras. Nao usa o `envolver` compartilhado
    porque aqui o grupo e uma COLUNA FLEX com gap — no By Rock cada linha ja
    vinha empilhada por margem.

    `width: fit-content` e o que faz a mancha ter a largura do TEXTO e nao da
    coluna inteira: e o ganho principal sobre o veu, que era sempre 1080px.
    `max-width: 100%` preserva a quebra de linha que o container ja dava — sem
    ele um titulo comprido vaza o padding lateral.

    As classes `.halo` e `.conteudo` existem para o MEDIDOR (regra do modulo
    compartilhado): esconder o conteudo sem levar o halo junto.
    """
    marca = (f'<div class="halo" style="position: absolute; left: -{inset_x}px; '
             f'right: -{inset_x}px; top: -{inset_y}px; bottom: -{inset_y}px; '
             f'z-index: 0; pointer-events: none; {halo_css}"></div>' if halo_css else '')
    dentro = "".join(f'<div class="conteudo" style="position: relative; z-index: 1;">'
                     f'{f}</div>' for f in filhos_html)
    return (f'    <div data-halo="{hid}" style="position: relative; width: fit-content; '
            f'max-width: 100%; display: flex; flex-direction: column; '
            f'align-items: flex-start; gap: {gap}px;">{marca}{dentro}</div>')


# ---------------------------------------------------------------- sonda
SONDA_V = "v2-imagens"   # entra no hash do cache: sonda nova invalida medida velha

# 🔴 `document.fonts.ready` NAO espera imagem. O lockup da marca nao tem altura
# declarada (`height: auto`), entao antes de a imagem carregar ele mede 0px de
# altura — e a mancha da marca sai calculada para uma caixa inexistente. Medido
# em 01/09/2026: `Dom15Misto marca 172x0`, enquanto a peca ao lado, na mesma
# rodada, media 172x150. E uma CORRIDA, entao aparece e some.
_SONDA = """<script>
Promise.all([document.fonts.ready].concat(
  Array.prototype.map.call(document.images, function (i) {
    return i.complete ? null : new Promise(function (ok) {
      i.addEventListener('load', ok); i.addEventListener('error', ok);
    });
  }))).then(function () {
  var o = {};
  document.querySelectorAll('[data-halo]').forEach(function (e) {
    var r = e.getBoundingClientRect();
    o[e.getAttribute('data-halo')] = [r.left, r.top, r.right, r.bottom];
  });
  document.body.setAttribute('data-rects', JSON.stringify(o));
});
</script>"""


def medir_geometria(corpo_html, estilo_css, base, W, H, cache_path):
    """Retangulo REAL de cada `[data-halo]`, medido no Chrome.

    🔴 Espera `document.fonts.ready`. Sem isso o rect sai medido na fonte de
    fallback e erra a altura do bloco — que e justamente o numero que decide
    onde a luz e lida e quanta tinta o bloco precisa.
    """
    corpo_html = _absolutizar(corpo_html, base)
    chave = hashlib.sha1((corpo_html + str((W, H)) + SONDA_V).encode()).hexdigest()[:16]
    cache = {}
    if os.path.exists(cache_path):
        try:
            cache = json.load(open(cache_path, encoding="utf-8"))
        except Exception:
            cache = {}
    if chave in cache:
        return {k: tuple(v) for k, v in cache[chave].items()}

    html = (f'<!doctype html><html><head><meta charset="utf-8"><style>{estilo_css}\n'
            f'html,body{{margin:0;padding:0}}</style></head><body>{corpo_html}'
            f'{_SONDA}</body></html>')
    tmp = os.path.join(base, f".__sonda-{chave}.html")
    open(tmp, "w", encoding="utf-8").write(html)
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--force-device-scale-factor=1", "--virtual-time-budget=8000",
                        "--dump-dom", f"--window-size={W},{H}",
                        f"file://{os.path.abspath(tmp)}"],
                       capture_output=True, text=True)
    os.remove(tmp)
    m = re.search(r'data-rects="(.*?)"', r.stdout, re.S)
    if not m:
        raise SystemExit("sonda de geometria nao devolveu rects — Chrome falhou?\n"
                         + r.stderr[-400:])
    bruto = m.group(1).replace("&quot;", '"').replace("&amp;", "&")
    rects = {k: tuple(v) for k, v in json.loads(bruto).items()}
    # Rect degenerado e quase sempre corrida de carregamento, nao design: um
    # bloco de texto ou um lockup nunca tem 3px. Falhar alto aqui e o que
    # impede a peca de sair com a mancha calculada para uma caixa que nao
    # existe — defeito que passa por qualquer conferidor e so o olho pega.
    for k, (x0, y0, x1, y1) in rects.items():
        if (x1 - x0) < 8 or (y1 - y0) < 8:
            raise SystemExit(f"sonda: retangulo degenerado em {k} -> "
                             f"{round(x1 - x0)}x{round(y1 - y0)}px (imagem ou fonte "
                             f"nao carregou a tempo?)")
    cache[chave] = {k: list(v) for k, v in rects.items()}
    json.dump(cache, open(cache_path, "w", encoding="utf-8"), indent=0)
    return rects


def _absolutizar(html, base):
    def caminho(m):
        nome = m.group(2)
        for d in ("fotos", "img", ""):
            p = os.path.join(base, d, nome) if d else os.path.join(base, nome)
            if os.path.exists(p):
                return f'src="file://{p}"'
        raise SystemExit(f"imagem nao encontrada para a sonda: {nome}")
    return re.sub(r'src="(\./)?([^"/]+\.(?:jpg|jpeg|png|webp))"', caminho, html)
