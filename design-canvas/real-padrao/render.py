# -*- coding: utf-8 -*-
"""Achata um .dc.html da Real Gelateria e renderiza no tamanho de publicação.

A leva tem DOIS formatos — story 1080x1920 e feed 1080x1350 — e o tamanho é
lido do próprio artboard (width/height do contêiner raiz), então o mesmo
script serve os dois. Padrão das levas (TERO/Espeto): estilo e corpo
extraídos, holes resolvidos pelos valores ATUAIS do data-props (onde o
editor grava o slider), e as imagens resolvidas preferindo a foto CHEIA de
fotos/ sobre o preview da raiz. O HTML temporário nasce NA PASTA do
artboard (armadilha 4.9).
"""
import json, re, subprocess, sys, os

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FUNDO = "283D36"

def achatar(caminho):
    src = open(caminho, encoding="utf-8").read()
    estilo = re.search(r'<helmet>\s*<style>(.*?)</style>\s*</helmet>', src, re.S)
    corpo = re.search(r'<x-dc>(.*?)</x-dc>', src, re.S)
    # o editor regrava data-props com aspas DUPLAS e &quot; ao salvar
    props = re.search(r'data-props=(?:\'(.*?)\'|"(.*?)")', src, re.S)
    if not (estilo and corpo):
        raise SystemExit(f"{caminho}: não achei <helmet><style> ou <x-dc>")

    bruto = ((props.group(1) or props.group(2) or '') if props else '').strip()
    bruto = bruto.replace('&quot;', '"').replace('&#39;', "'").replace('&amp;', '&')
    p = json.loads(bruto) if bruto else {}
    # 🔴 A lista de holes NAO e fixa aqui: ela sai do proprio data-props. Com
    # os nomes cravados, mecanismo novo no gerador (o `halo` de 01/09/2026)
    # derrubava o render com "hole sem valor" — e a lista tinha de ser editada
    # em dois arquivos que ninguem lembra de manter juntos.
    valores = {k: str(float(v['default'])) for k, v in p.items()
               if isinstance(v, dict) and isinstance(v.get('default'), (int, float))}
    html = corpo.group(1)
    def resolver(m):
        chave = m.group(1).strip()
        if chave not in valores:
            raise SystemExit(f"{caminho}: hole {{{{{chave}}}}} sem valor")
        return valores[chave]
    html = re.sub(r'\{\{\s*([\w.$]+)\s*\}\}', resolver, html)
    if '{{' in html:
        raise SystemExit(f"{caminho}: sobrou hole não resolvido")
    html = _resolver_imagens(html, os.path.dirname(os.path.abspath(caminho)))
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{estilo.group(1)}\n'
            f'html,body{{margin:0;padding:0;background:#{FUNDO}}}</style></head><body>{html}</body></html>')

def _resolver_imagens(html, base):
    """Prefere a foto CHEIA de fotos/; falha ALTO quando não acha."""
    def caminho(m):
        nome = m.group(2)
        for d in ('fotos', 'logos', ''):
            p = os.path.join(base, d, nome) if d else os.path.join(base, nome)
            if os.path.exists(p):
                return f'src="file://{p}"'
        raise SystemExit(f"imagem não encontrada para o render: {nome}")
    return re.sub(r'src="(\./)?([^"/]+\.(?:jpg|jpeg|png|webp))"', caminho, html)

def tamanho_do_artboard(html):
    m = re.search(r'position: relative; width: (\d+)px; height: (\d+)px', html)
    if not m:
        raise SystemExit("não achei o tamanho do artboard no HTML")
    return int(m.group(1)), int(m.group(2))

def renderizar(dc, saida):
    tmp = os.path.join(os.path.dirname(os.path.abspath(dc)),
                       os.path.basename(dc).replace('.dc.html', '.__tmp.html'))
    html = achatar(dc)
    w, h = tamanho_do_artboard(html)
    open(tmp, 'w', encoding='utf-8').write(html)
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", f"--default-background-color={FUNDO}",
        "--virtual-time-budget=8000", f"--screenshot={saida}",
        f"--window-size={w},{h}", f"file://{os.path.abspath(tmp)}"],
        capture_output=True, text=True)
    os.remove(tmp)
    if not os.path.exists(saida):
        raise SystemExit(f"render falhou: {r.stderr[-400:]}")
    return saida

if __name__ == '__main__':
    os.makedirs('render', exist_ok=True)
    for dc in sys.argv[1:]:
        out = os.path.basename(dc).replace('.dc.html', '.png')
        renderizar(dc, f"render/{out}")
        print(f"  {out}  {os.path.getsize(f'render/{out}')//1024}KB")
