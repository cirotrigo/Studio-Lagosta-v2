# -*- coding: utf-8 -*-
"""Achata os .dc.html da semana 1 da Wine Vix e renderiza no tamanho de cada peca.

Difere do render.py das levas anteriores num ponto: a leva tem DOIS formatos
(story 1080x1920 e feed 1080x1350), entao o tamanho e LIDO do proprio artboard
em vez de vir de constantes. Ler do arquivo evita a divergencia silenciosa
entre o quadro diagramado e a janela do Chrome, que corta ou deixa faixa vazia.

Como nas levas anteriores: <link> do Google Fonts ANTES do <style> (extracao
por partes), pecas estaticas (sem {{holes}}), e a foto vem de fotos/ (original),
nunca da raiz (a comprimida do canvas).
"""
import os, re, subprocess, sys

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def dimensoes(corpo):
    m = re.search(r'width:\s*(\d+)px;\s*height:\s*(\d+)px', corpo)
    if not m:
        raise SystemExit('nao achei o tamanho do artboard')
    return int(m.group(1)), int(m.group(2))


def achatar(caminho):
    src = open(caminho, encoding="utf-8").read()
    base = os.path.dirname(os.path.abspath(caminho))
    corpo = re.search(r'<x-dc>(.*?)</x-dc>', src, re.S)
    if not corpo:
        raise SystemExit(f"{caminho}: nao achei <x-dc>")
    estilo = re.search(r'<style>(.*?)</style>', src, re.S)
    link = re.search(r'(<link rel="stylesheet"[^>]*>)', src)
    if '{{' in corpo.group(1):
        raise SystemExit(f"{caminho}: sobrou hole — estas pecas deveriam ser estaticas")

    def resolver(m):
        nome = m.group(2)
        for d in ('fotos', ''):
            p = os.path.join(base, d, nome) if d else os.path.join(base, nome)
            if os.path.exists(p):
                return f'src="file://{p}"'
        raise SystemExit(f"imagem nao encontrada: {nome}")
    html = re.sub(r'src="(\./)?([^"/]+\.(?:jpg|jpeg|png|webp))"', resolver, corpo.group(1))

    return ('<!doctype html><html><head><meta charset="utf-8">'
            + (link.group(1) if link else '')
            + f'<style>{estilo.group(1) if estilo else ""}\n'
              f'html,body{{margin:0;padding:0;background:#241A16}}</style>'
              '</head><body>' + html + '</body></html>')


def renderizar(dc, saida):
    achatado = achatar(dc)
    w, h = dimensoes(achatado)
    tmp = os.path.join(os.path.dirname(os.path.abspath(dc)),
                       os.path.basename(dc).replace('.dc.html', '.__tmp.html'))
    open(tmp, 'w', encoding='utf-8').write(achatado)
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", "--virtual-time-budget=12000",
        f"--screenshot={saida}", f"--window-size={w},{h}",
        f"file://{os.path.abspath(tmp)}"], capture_output=True, text=True)
    os.remove(tmp)
    if not os.path.exists(saida):
        raise SystemExit(f"render falhou: {r.stderr[-400:]}")
    return saida, w, h


if __name__ == '__main__':
    for dc in sys.argv[1:]:
        out = f"render/{os.path.basename(dc).replace('.dc.html', '.png')}"
        _, w, h = renderizar(dc, out)
        print(f"  {out}  {w}x{h}  {os.path.getsize(out)//1024}KB")
