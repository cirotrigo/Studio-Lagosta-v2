# -*- coding: utf-8 -*-
"""Mede, no Chrome, ONDE cada grupo de texto realmente pousa na peca.

Por que existe
--------------
O halo e calibrado pela luz da regiao que ele cobre — e a regiao so e
conhecida depois do layout. Nesta leva o bloco tem altura VARIAVEL: o
pre-titulo e opcional, a condicao e opcional, a manchete quebra em 2 ou 3
linhas conforme o texto, e o pe as vezes tem servico+endereco e as vezes so o
CTA. Estimar a faixa por constantes (como o By Rock faz) erraria peca a peca.

🔴 A licao do By Rock que isto resolve na raiz: calibrar pela media da FAIXA
inteira fazia o halo do rodape sair 3x mais escuro que o necessario, porque a
faixa media dizia 180-239 e o rodape real era 46-70. Aqui nao ha faixa: ha o
retangulo exato do grupo, medido.

Uma unica invocacao do Chrome para as 21 pecas — cada artboard entra na mesma
pagina, e o retangulo sai relativo a raiz do proprio artboard.

As imagens NAO sao resolvidas de proposito: a foto e absoluta e a logo tem
width/height fixos, entao nenhuma delas afeta o fluxo. Imagem quebrada mede
igual e a sonda nao depende de caminho.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE = os.path.dirname(os.path.abspath(__file__))


def corpo(caminho):
    src = open(caminho, encoding="utf-8").read()
    m = re.search(r"<x-dc>(.*?)</x-dc>", src, re.S)
    if not m:
        raise SystemExit(f"{caminho}: nao achei <x-dc>")
    html = m.group(1)
    # o <helmet> nao e HTML de verdade; o <link> e o <style> sao extraidos a parte
    html = re.sub(r"<helmet>.*?</helmet>", "", html, flags=re.S)
    return html


def cabeca(caminho):
    src = open(caminho, encoding="utf-8").read()
    link = re.search(r'(<link rel="stylesheet"[^>]*>)', src)
    estilo = re.search(r"<style>(.*?)</style>", src, re.S)
    return (link.group(1) if link else ""), (estilo.group(1) if estilo else "")


def sondar(pecas):
    link, estilo = cabeca(pecas[0])
    blocos = []
    for p in pecas:
        nome = os.path.basename(p).replace(".dc.html", "")
        blocos.append(f'<div data-peca="{nome}">{corpo(p)}</div>')

    pagina = (
        '<!doctype html><html><head><meta charset="utf-8">' + link
        + f"<style>{estilo}\nhtml,body{{margin:0;padding:0}}</style></head><body>"
        + "".join(blocos)
        + '<div id="out"></div><script>'
        # esperar as fontes: a largura de uma linha em Playfair depende delas, e
        # sem a espera a sonda mede a fonte de fallback — retangulo plausivel e
        # errado, que e a pior especie.
        'document.fonts.ready.then(()=>{'
        "const o={};"
        'document.querySelectorAll("[data-peca]").forEach(p=>{'
        '  const raiz = p.firstElementChild.getBoundingClientRect();'
        "  const m = {};"
        '  p.querySelectorAll("[data-halo]").forEach(e=>{'
        "    const r = e.getBoundingClientRect();"
        "    m[e.dataset.halo] = [Math.round(r.left-raiz.left), Math.round(r.top-raiz.top),"
        "                         Math.round(r.width), Math.round(r.height)];"
        "  });"
        "  o[p.dataset.peca] = m;"
        "});"
        'document.getElementById("out").textContent="R"+"ECTS:"+JSON.stringify(o);'
        "});"
        "</script></body></html>"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False,
                                     encoding="utf-8", dir=BASE) as f:
        f.write(pagina)
        caminho = f.name
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu",
                        "--virtual-time-budget=20000", "--dump-dom",
                        f"file://{caminho}"], capture_output=True, text=True)
    os.remove(caminho)
    m = re.search(r"RECTS:(\{.*?\})</div>", r.stdout, re.S)
    if not m:
        raise SystemExit("a sonda nao respondeu — sem geometria real o halo sairia "
                         "calibrado por chute, que e o defeito que ela existe para evitar")
    return json.loads(m.group(1))


if __name__ == "__main__":
    alvos = sys.argv[1:] or sorted(
        f for f in os.listdir(BASE) if f.endswith(".dc.html"))
    alvos = [os.path.join(BASE, a) for a in alvos]
    dados = sondar(alvos)
    vazias = [k for k, v in dados.items() if not v]
    json.dump(dados, open(os.path.join(BASE, "geometria.json"), "w",
                          encoding="utf-8"), indent=1, ensure_ascii=False)
    n = sum(len(v) for v in dados.values())
    print(f"  {len(dados)} pecas, {n} grupo(s) medido(s) -> geometria.json")
    if vazias:
        print(f"  SEM grupo marcado: {', '.join(sorted(vazias))}")
