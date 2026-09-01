# -*- coding: utf-8 -*-
"""Mede, para cada halo de cada artboard, a LUZ da foto onde ele pousa.

Duas etapas, e as duas existem por um motivo medido:

1. GEOMETRIA REAL, no Chrome. As alturas dos blocos do TERO variam com o
   conteudo (lockup de 1 ou 2 linhas, apoio de 1 a 3 linhas, servico de 1 a 3
   linhas, cartao de avaliacao) e com quatro layouts diferentes. Estimar essa
   altura por formula foi o defeito 3 do By Rock — o halo saiu 3x mais escuro
   que o necessario porque a faixa medida nao era a faixa onde a letra caiu.
   Aqui a sonda le `getBoundingClientRect` de cada `[data-halo]`.

2. LUZ DA FOTO no recorte que o leitor ve. A foto entra por `object-fit:
   cover`, entao o pedaco visivel nao e o arquivo inteiro: ele e escalado para
   cobrir 1080xH e centrado. A medicao simula exatamente isso.

Uma unica chamada do Chrome cobre os 21 artboards: eles compartilham o mesmo
<style> (as fontes embutidas sao identicas), entao da para empilhar os corpos
numa pagina so e devolver todos os retangulos de uma vez.
"""
import json, os, re, subprocess, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _halo import percentil

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE = os.path.dirname(os.path.abspath(__file__))


def _resolver_imagens(html):
    """Aponta as <img> para o arquivo real. A foto nao afeta o layout (ela e
    absoluta), mas o CARTAO de avaliacao e a logo em fluxo sao `height: auto` —
    sem carregar, a altura deles e zero e o bloco medido sai errado."""
    def caminho(m):
        nome = m.group(2)
        for d in ('fotos', 'img', ''):
            p = os.path.join(BASE, d, nome) if d else os.path.join(BASE, nome)
            if os.path.exists(p):
                return f'src="file://{p}"'
        raise SystemExit(f"imagem nao encontrada na sonda: {nome}")
    return re.sub(r'src="(\./)?([^"/]+\.(?:jpg|jpeg|png|webp))"', caminho, html)


def geometria(arquivos):
    """{arq: {chave_do_halo: (x, y, w, h)}} — coordenadas DENTRO do artboard."""
    estilo, corpos = None, []
    for arq in arquivos:
        src = open(os.path.join(BASE, arq), encoding="utf-8").read()
        if estilo is None:
            m = re.search(r'<helmet>\s*<style>(.*?)</style>\s*</helmet>', src, re.S)
            if not m:
                raise SystemExit(f"{arq}: sem <helmet><style>")
            estilo = m.group(1)
        corpo = re.search(r'<x-dc>(.*?)</x-dc>', src, re.S)
        if not corpo:
            raise SystemExit(f"{arq}: sem <x-dc>")
        html = re.sub(r'<helmet>.*?</helmet>', '', corpo.group(1), flags=re.S)
        # os holes ainda nao importam para a geometria (o veu nao move nada),
        # mas um `{{...}}` cru dentro de um style quebra o parse do valor
        html = re.sub(r'\{\{\s*[\w.$]+\s*\}\}', '0.5', html)
        corpos.append(f'<div data-artboard="{arq}">{_resolver_imagens(html)}</div>')

    sonda = '''
<script>
(async () => {
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 400));
  const out = {};
  document.querySelectorAll('[data-artboard]').forEach(ab => {
    // a raiz do artboard e o primeiro filho posicionado (a moldura 1080xH)
    const raiz = ab.firstElementChild.getBoundingClientRect();
    const m = {};
    ab.querySelectorAll('[data-halo]').forEach(e => {
      const r = e.getBoundingClientRect();
      m[e.dataset.halo] = [Math.round(r.left - raiz.left), Math.round(r.top - raiz.top),
                           Math.round(r.width), Math.round(r.height)];
    });
    out[ab.dataset.artboard] = m;
  });
  const d = document.createElement('div');
  d.id = 'saida';
  d.textContent = 'RE' + 'CTS:' + JSON.stringify(out);
  document.body.appendChild(d);
})();
</script>'''
    pagina = ('<!doctype html><html><head><meta charset="utf-8"><style>' + estilo +
              '\nhtml,body{margin:0;padding:0}</style></head><body>' +
              "".join(corpos) + sonda + '</body></html>')
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False,
                                     encoding="utf-8", dir=BASE) as f:
        f.write(pagina); caminho = f.name
    try:
        r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--dump-dom",
                            "--virtual-time-budget=25000", f"file://{caminho}"],
                           capture_output=True, text=True)
    finally:
        os.remove(caminho)
    m = re.search(r'RECTS:(\{.*?\})</div>', r.stdout, re.S)
    if not m:
        raise SystemExit("a sonda de geometria nao respondeu — sem medida real o "
                         "halo sai calibrado para uma faixa que nao existe\n"
                         + r.stdout[-600:] + r.stderr[-400:])
    return json.loads(m.group(1))


_CACHE = {}


def luz_da_regiao(foto, x, y, w, h, W, H):
    """Luminancia media da foto no retangulo (x,y,w,h) do artboard WxH."""
    from PIL import Image, ImageStat
    chave = (foto, W, H)
    if chave not in _CACHE:
        caminho = None
        for d in ('fotos', 'img', ''):
            p = os.path.join(BASE, d, foto) if d else os.path.join(BASE, foto)
            if os.path.exists(p):
                caminho = p; break
        if not caminho:
            raise SystemExit(f"foto nao encontrada para medir: {foto}")
        im = Image.open(caminho).convert("RGB")
        escala = max(W / im.width, H / im.height)
        im = im.resize((max(1, round(im.width * escala)), max(1, round(im.height * escala))),
                       Image.LANCZOS)
        ex, ey = (im.width - W) // 2, (im.height - H) // 2
        _CACHE[chave] = im.crop((ex, ey, ex + W, ey + H)).convert("L")
    plano = _CACHE[chave]
    x0, y0 = max(0, min(W - 1, x)), max(0, min(H - 1, y))
    x1, y1 = max(x0 + 1, min(W, x + w)), max(y0 + 1, min(H, y + h))
    recorte = plano.crop((x0, y0, x1, y1))
    # media E p75: quem mistura os dois e `_halo.luz_de_leitura` — a media
    # sozinha ignora a mancha clara onde a letra some (ver o docstring de la)
    return ImageStat.Stat(recorte).mean[0], percentil(recorte, 0.75)

