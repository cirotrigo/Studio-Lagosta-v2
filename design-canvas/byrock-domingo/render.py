# -*- coding: utf-8 -*-
"""Achata os .dc.html deste carrossel e renderiza em 1080x1350 (feed 4:5).

Difere do render.py do Quintal em três pontos, todos deliberados:
  - o <helmet> daqui tem <link> do Google Fonts ANTES do <style>, então a
    extração é por partes e não por um regex único;
  - estas peças são estáticas (sem {{holes}}), então não há o que resolver;
  - a foto vem de fotos/ (original) e nunca de ./ (a comprimida do canvas).
"""
import os, re, subprocess, sys

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W, H = 1080, 1350

def achatar(caminho):
    src = open(caminho, encoding="utf-8").read()
    base = os.path.dirname(os.path.abspath(caminho))
    corpo = re.search(r'<x-dc>(.*?)</x-dc>', src, re.S)
    if not corpo:
        raise SystemExit(f"{caminho}: não achei <x-dc>")
    estilo = re.search(r'<style>(.*?)</style>', src, re.S)
    link = re.search(r'(<link rel="stylesheet"[^>]*>)', src)
    if '{{' in corpo.group(1):
        raise SystemExit(f"{caminho}: sobrou hole — estas peças deveriam ser estáticas")

    def resolver(m):
        nome = m.group(2)
        for d in ('fotos', ''):
            p = os.path.join(base, d, nome) if d else os.path.join(base, nome)
            if os.path.exists(p):
                return f'src="file://{p}"'
        raise SystemExit(f"imagem não encontrada: {nome}")
    html = re.sub(r'src="(\./)?([^"/]+\.(?:jpg|jpeg|png|webp))"', resolver, corpo.group(1))

    return ('<!doctype html><html><head><meta charset="utf-8">'
            + (link.group(1) if link else '')
            + f'<style>{estilo.group(1) if estilo else ""}\n'
              f'html,body{{margin:0;padding:0;background:#111111}}</style>'
              '</head><body>' + html + '</body></html>')

def renderizar(dc, saida):
    tmp = os.path.join(os.path.dirname(os.path.abspath(dc)),
                       os.path.basename(dc).replace('.dc.html', '.__tmp.html'))
    open(tmp, 'w', encoding='utf-8').write(achatar(dc))
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", "--virtual-time-budget=12000",
        f"--screenshot={saida}", f"--window-size={W},{H}",
        f"file://{os.path.abspath(tmp)}"], capture_output=True, text=True)
    os.remove(tmp)
    if not os.path.exists(saida):
        raise SystemExit(f"render falhou: {r.stderr[-400:]}")
    return saida

if __name__ == '__main__':
    for dc in sys.argv[1:]:
        out = f"render/{os.path.basename(dc).replace('.dc.html', '.png')}"
        renderizar(dc, out)
        print(f"  {out}  {os.path.getsize(out)//1024}KB")
