# -*- coding: utf-8 -*-
"""Achata um .dc.html do TERO em HTML puro e renderiza o story em 1080x1920.

Copiado do padrao das levas (espeto-avaliacoes): o estilo e o corpo sao
extraidos, os holes resolvidos pelos valores ATUAIS do data-props (onde o
editor grava o slider), e as imagens resolvidas preferindo a foto CHEIA de
fotos/ sobre o preview de img/.
"""
import json, re, subprocess, sys, os

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FUNDO = "130D0A"

def achatar(caminho):
    src = open(caminho, encoding="utf-8").read()
    estilo = re.search(r'<helmet>\s*<style>(.*?)</style>\s*</helmet>', src, re.S)
    corpo = re.search(r'<x-dc>(.*?)</x-dc>', src, re.S)
    # o editor regrava data-props com aspas DUPLAS e &quot; ao salvar — sem
    # aceitar as duas formas, o render cairia nos defaults e jogaria fora o
    # ajuste de véu feito no canvas (pego no primeiro save real do Ciro)
    props = re.search(r'data-props=(?:\'(.*?)\'|"(.*?)")', src, re.S)
    if not (estilo and corpo):
        raise SystemExit(f"{caminho}: não achei <helmet><style> ou <x-dc>")

    bruto = ((props.group(1) or props.group(2) or '') if props else '').strip()
    bruto = (bruto.replace('&quot;', '"').replace('&#39;', "'").replace('&amp;', '&'))
    p = json.loads(bruto) if bruto else {}
    # GENERICO: qualquer prop com `default` vira valor de hole. Antes eram duas
    # chaves cravadas (veuTopo/veuRodape) e o `raise` de hole desconhecido — o
    # que fazia o render QUEBRAR ao trocar o mecanismo, com uma mensagem sobre
    # hole em vez de sobre o prop novo. Prop nova do artboard passa a funcionar
    # sem tocar aqui.
    valores = {k: str(v['default']) for k, v in p.items()
               if isinstance(v, dict) and 'default' in v}
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
        for d in ('fotos', 'img', ''):
            p = os.path.join(base, d, nome) if d else os.path.join(base, nome)
            if os.path.exists(p):
                return f'src="file://{p}"'
        raise SystemExit(f"imagem não encontrada para o render: {nome}")
    return re.sub(r'src="(\./)?([^"/]+\.(?:jpg|jpeg|png|webp))"', caminho, html)

def altura_do_artboard(html, padrao=1920):
    m = re.search(r'position: relative; width: 1080px; height: (\d+)px', html)
    return int(m.group(1)) if m else padrao

def renderizar(dc, saida, extra_css=""):
    tmp = os.path.join(os.path.dirname(os.path.abspath(dc)),
                       os.path.basename(dc).replace('.dc.html', '.__tmp.html'))
    html = achatar(dc)
    if extra_css:
        html = html.replace('</style>', extra_css + '</style>', 1)
    alt = altura_do_artboard(html)
    open(tmp, 'w', encoding='utf-8').write(html)
    r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=1", f"--default-background-color={FUNDO}",
        "--virtual-time-budget=6000", f"--screenshot={saida}",
        f"--window-size=1080,{alt}", f"file://{os.path.abspath(tmp)}"],
        capture_output=True, text=True)
    os.remove(tmp)
    if not os.path.exists(saida):
        raise SystemExit(f"render falhou: {r.stderr[-300:]}")
    return saida

if __name__ == '__main__':
    os.makedirs('render', exist_ok=True)
    for dc in sys.argv[1:]:
        out = os.path.basename(dc).replace('.dc.html', '.png')
        renderizar(dc, f"render/{out}")
        print(f"  {out}  {os.path.getsize(f'render/{out}')//1024}KB")
