# -*- coding: utf-8 -*-
"""Achata os .dc.html desta leva e renderiza no tamanho de publicacao.

Difere do render.py do byrock-domingo em dois pontos:
  - a leva tem DOIS formatos (story 1080x1920 e feed 1080x1350), entao o
    tamanho e lido do proprio artboard em vez de ser constante;
  - a foto vem sempre de fotos/ (original). A copia na raiz, quando existe,
    e a comprimida do canvas: serve pra revisar layout, nao pra publicar.
"""
import os, re, subprocess, sys

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

def achatar(caminho):
    src = open(caminho, encoding="utf-8").read()
    base = os.path.dirname(os.path.abspath(caminho))
    corpo = re.search(r'<x-dc>(.*?)</x-dc>', src, re.S)
    if not corpo:
        raise SystemExit(f"{caminho}: nao achei <x-dc>")
    estilo = re.search(r'<style>(.*?)</style>', src, re.S)
    link = re.search(r'(<link rel="stylesheet"[^>]*>)', src)
    if '{{' in corpo.group(1):
        raise SystemExit(f"{caminho}: sobrou hole - estas pecas deveriam ser estaticas")

    dim = re.search(r'width:\s*(\d+)px;\s*height:\s*(\d+)px;\s*position:\s*relative', corpo.group(1))
    if not dim:
        raise SystemExit(f"{caminho}: nao consegui ler o tamanho do artboard")
    W, H = int(dim.group(1)), int(dim.group(2))

    def resolver(m):
        nome = m.group(2)
        for d in ('fotos', ''):
            p = os.path.join(base, d, nome) if d else os.path.join(base, nome)
            if os.path.exists(p):
                return f'src="file://{p}"'
        raise SystemExit(f"imagem nao encontrada: {nome}")
    html = re.sub(r'src="(\./)?([^"/]+\.(?:jpg|jpeg|png|webp))"', resolver, corpo.group(1))

    doc = ('<!doctype html><html><head><meta charset="utf-8">'
           + (link.group(1) if link else '')
           + f'<style>{estilo.group(1) if estilo else ""}\n'
             f'html,body{{margin:0;padding:0;background:#111111}}</style>'
             '</head><body>' + html + '</body></html>')
    return doc, W, H

def renderizar(dc, saida):
    doc, W, H = achatar(dc)
    tmp = os.path.join(os.path.dirname(os.path.abspath(dc)),
                       os.path.basename(dc).replace('.dc.html', '.__tmp.html'))
    open(tmp, 'w', encoding='utf-8').write(doc)
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", "--virtual-time-budget=12000",
        f"--screenshot={saida}", f"--window-size={W},{H}",
        f"file://{os.path.abspath(tmp)}"], capture_output=True, text=True)
    os.remove(tmp)
    if not os.path.exists(saida):
        raise SystemExit(f"render falhou: {r.stderr[-400:]}")
    return saida, W, H

if __name__ == '__main__':
    base = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(base, 'render'), exist_ok=True)
    for dc in sys.argv[1:]:
        out = os.path.join(base, 'render', os.path.basename(dc).replace('.dc.html', '.png'))
        _, W, H = renderizar(dc, out)
        print(f"  {os.path.basename(out)}  {W}x{H}  {os.path.getsize(out)//1024}KB")
