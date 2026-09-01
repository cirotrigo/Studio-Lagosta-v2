# -*- coding: utf-8 -*-
"""Achata um .dc.html em HTML puro e renderiza a arte no tamanho de publicacao.

Esta leva tem DOIS tamanhos (story 1080x1920 e feed 1080x1350), entao a altura
NAO e constante como nas levas anteriores: ela e lida do "$preview" do proprio
data-props — a mesma fonte que o editor usa. Cravar 1350 aqui cortaria todos os
stories pela metade, em silencio.

O .dc.html nao e HTML comum: tem <x-dc>, {{holes}} e o support.js do editor.
Estilo e corpo sao extraidos e os holes resolvidos pelos valores ATUAIS do
data-props — que e onde o editor grava os controles quando alguem mexe no
slider e salva. O que se renderiza e o que a pessoa viu.
"""
import json, re, subprocess, sys, os

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def achatar(caminho):
    src = open(caminho, encoding="utf-8").read()
    estilo = re.search(r'<helmet>\s*<style>(.*?)</style>\s*</helmet>', src, re.S)
    corpo = re.search(r'<x-dc>(.*?)</x-dc>', src, re.S)
    props = re.search(r"data-props='(.*?)'", src, re.S)
    if not (estilo and corpo):
        raise SystemExit(f"{caminho}: não achei <helmet><style> ou <x-dc>")

    # O editor pode salvar data-props VAZIO: sem o guard, json.loads('') derruba
    # o render (aconteceu em 25/08 nas pecas que o Ciro editou).
    bruto = props.group(1).strip() if props else ''
    p = json.loads(bruto.replace('&#39;', "'").replace('&amp;', '&')) if bruto else {}
    # Todo controle do data-props resolve o hole de mesmo nome. Antes eram dois
    # nomes cravados (veuTopo/veuRodape) e o mecanismo novo (haloForca) morria
    # com "hole sem valor". Generico, os dois convivem: peca antiga de veu e
    # peca nova de halo renderizam pelo mesmo caminho.
    valores = {k: str(v['default']) for k, v in p.items()
               if isinstance(v, dict) and 'default' in v}
    valores.setdefault('veuTopo', '0.80')
    valores.setdefault('veuRodape', '0.86')
    valores.setdefault('haloForca', '1')
    prev = p.get('$preview', {})
    tamanho = (int(prev.get('width', 1080)), int(prev.get('height', 1350)))

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
            f'html,body{{margin:0;padding:0;background:#2B1A12}}</style></head>'
            f'<body>{html}</body></html>'), tamanho


def _resolver_imagens(html, base):
    """Troca as referencias relativas por caminhos absolutos, preferindo a foto CHEIA.

    Falha ALTO quando nao acha: foto ausente nao pode virar peca sem foto — a
    assinatura desse defeito e a peca sair so com texto sobre o marrom.
    """
    def caminho(m):
        nome = m.group(2)
        for d in ('fotos', 'img', ''):
            p = os.path.join(base, d, nome) if d else os.path.join(base, nome)
            if os.path.exists(p):
                return f'src="file://{p}"'
        raise SystemExit(f"imagem não encontrada para o render: {nome}")
    return re.sub(r'src="(\./)?([^"/]+\.(?:jpg|jpeg|png|webp))"', caminho, html)


def renderizar(dc, saida):
    # o html temporario fica AO LADO do .dc.html: as referencias sao relativas
    # e so resolvem a partir dessa pasta.
    html, (w, h) = achatar(dc)
    tmp = os.path.join(os.path.dirname(os.path.abspath(dc)),
                       os.path.basename(dc).replace('.dc.html', '.__tmp.html'))
    open(tmp, 'w', encoding='utf-8').write(html)
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", "--default-background-color=2B1A12",
        "--virtual-time-budget=8000", f"--screenshot={saida}",
        f"--window-size={w},{h}", f"file://{os.path.abspath(tmp)}"],
        capture_output=True, text=True)
    os.remove(tmp)
    if not os.path.exists(saida):
        raise SystemExit(f"render falhou: {r.stderr[-300:]}")
    return saida, (w, h)


if __name__ == '__main__':
    os.makedirs('render', exist_ok=True)
    for dc in sys.argv[1:]:
        out = os.path.basename(dc).replace('.dc.html', '.png')
        _, (w, h) = renderizar(dc, f"render/{out}")
        print(f"  {out}  {w}x{h}  {os.path.getsize(f'render/{out}')//1024}KB")
