# -*- coding: utf-8 -*-
"""Mede, no Chrome, a caixa de TINTA de cada grupo de texto do artboard.

Por que medir em vez de embrulhar
---------------------------------
No By Rock o halo e filho do bloco de texto, com `width: fit-content` — e o
`fit-content` que faz a mancha ter a largura do texto e nao da coluna. Aqui
isso nao pode ser feito: a armadilha 4.1 do manual exige que **cada linha seja
um item DIRETO do container flex**, senao o editor do canvas move o grupo
inteiro e nada dentro dele. Embrulhar as linhas num bloco para pendurar o halo
desfaz exatamente a estrutura que custou tres tentativas para acertar.

A saida e a mesma que a armadilha 4.7 ja usa para a foto: o halo e uma **camada
absoluta IRMA**, atras do conteudo — "quem e absoluto e o FUNDO, que ninguem
arrasta no editor". O que o `fit-content` daria de graca, a sonda mede: a caixa
de tinta real de cada grupo, no Chrome, com as fontes carregadas.

Sai de graca uma coisa que o embrulho nao da: com o retangulo em maos, a luz do
halo pode ser lida da foto EXATAMENTE debaixo dele, em vez do terco mais
proximo.

🔴 A marca entra em FLUXO (`<img width: 262px; height: auto>`). Se o arquivo
nao resolver, a altura colapsa para zero e a geometria medida fica errada sem
erro nenhum — por isso a pagina de medicao leva `<base href>` para a pasta.
"""
import json, os, re, subprocess, tempfile

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE = os.path.dirname(os.path.abspath(__file__))

# A caixa de tinta, nao a caixa do bloco. Em L3/L4/L5 a manchete e
# `align-self: stretch` + `text-align: center`: a caixa do DIV e a coluna
# inteira (896px) mesmo quando o titulo e curto. Medir a caixa do bloco faria
# o halo ter a largura da coluna em toda peca centralizada, que e justamente a
# mancha larga que este mecanismo veio evitar. Range sobre o no de TEXTO
# devolve a tinta.
# A caixa de tinta, nao a caixa do bloco. Em L3/L4/L5 a manchete e
# `align-self: stretch` + `text-align: center`: a caixa do DIV e a coluna
# inteira (896px) mesmo quando o titulo e curto. Medir a caixa do bloco faria
# o halo ter a largura da coluna em toda peca centralizada, que e justamente a
# mancha larga que este mecanismo veio evitar. Range sobre o no de TEXTO
# devolve a tinta.
#
# 🔴 Cada linha volta com a PROPRIA COR. O Quintal escreve em dois tons — o
# creme #F5F0E8 (luz 240) e o verde #7A9A5C (luz 143) — e o quanto de fundo
# cada um aguenta nao e o mesmo numero. Um halo calibrado para o creme deixa a
# linha em Amithen verde sumir; ver `halo_quintal.alvo_da_cor`.
SONDA = r"""
const out = [];
const caixaDe = r => ({x: r.left, y: r.top, w: r.width, h: r.height});
const rgb = s => { const m = (s||'').match(/-?[\d.]+/g); return m ? m.slice(0,3).map(Number) : null; };
const andar = (n, linhas) => {
  if (n.nodeType === 3) {
    if (!n.textContent.trim()) return;
    const r = document.createRange(); r.selectNodeContents(n);
    const cor = rgb(getComputedStyle(n.parentElement).color);
    for (const rr of r.getClientRects())
      if (rr.width > 1 && rr.height > 1) linhas.push({caixa: caixaDe(rr), cor});
    return;
  }
  if (n.nodeType !== 1) return;
  const tag = n.tagName.toLowerCase();
  if (tag === 'img') {
    // a marca e branca: cobra o mesmo fundo que o creme
    linhas.push({caixa: caixaDe(n.getBoundingClientRect()), cor: [245, 240, 232]}); return;
  }
  if (tag === 'svg') {
    linhas.push({caixa: caixaDe(n.getBoundingClientRect()),
                 cor: rgb(getComputedStyle(n).stroke) || null}); return;
  }
  if (!n.children.length && !n.textContent.trim()) {
    // filete e barra verde: desenho puro, a cor e a do proprio fundo dele
    const e = getComputedStyle(n);
    linhas.push({caixa: caixaDe(n.getBoundingClientRect()),
                 cor: rgb(e.backgroundColor) || rgb(e.backgroundImage) || null});
    return;
  }
  n.childNodes.forEach(f => andar(f, linhas));
};
document.querySelectorAll('[data-art]').forEach(art => {
  const caixa = art.getBoundingClientRect();
  const fluxo = art.querySelector('[data-fluxo]');
  const grupos = [[]];
  for (const item of fluxo.children) {
    if (item.dataset.espacador) { grupos.push([]); continue; }
    grupos[grupos.length - 1].push(item);
  }
  out.push({ id: art.dataset.art, grupos: grupos.map(g => {
    const linhas = [];
    g.forEach(item => andar(item, linhas));
    if (!linhas.length) return null;
    const desloca = l => ({...l, caixa: {
      x: Math.round(l.caixa.x - caixa.left), y: Math.round(l.caixa.y - caixa.top),
      w: Math.round(l.caixa.w),              h: Math.round(l.caixa.h)}});
    const ls = linhas.map(desloca);
    return {linhas: ls, caixa: {
      x: Math.min(...ls.map(l => l.caixa.x)), y: Math.min(...ls.map(l => l.caixa.y)),
      w: Math.max(...ls.map(l => l.caixa.x + l.caixa.w)) - Math.min(...ls.map(l => l.caixa.x)),
      h: Math.max(...ls.map(l => l.caixa.y + l.caixa.h)) - Math.min(...ls.map(l => l.caixa.y))}};
  })});
});
document.getElementById('saida').textContent = 'GEO' + 'METRIA:' + JSON.stringify(out);
"""


def medir_grupos(corpos, estilo):
    """`corpos` e {id: html do artboard}. Devolve {id: [rect|None, ...]}.

    Tudo numa pagina so: sao 18 artboards e uma ida ao Chrome por peca custaria
    18 partidas de navegador para uma conta que cabe numa. Mesmo caminho que o
    `medir()` das manchetes do By Rock ja usa.
    """
    pagina = ('<!doctype html><html><head><meta charset="utf-8">'
              f'<base href="file://{BASE}/">'
              f'<style>{estilo}\nbody{{margin:0}}</style></head><body>'
              + ''.join(f'<div data-art="{k}">{v}</div>' for k, v in corpos.items())
              + '<div id="saida"></div><script>'
              'document.fonts.ready.then(()=>{' + SONDA + '});'
              '</script></body></html>')
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False,
                                     encoding='utf-8', dir=BASE) as f:
        f.write(pagina); caminho = f.name
    try:
        r = subprocess.run([CHROME, "--headless=new", "--disable-gpu",
                            "--virtual-time-budget=20000", "--dump-dom",
                            f"file://{caminho}"], capture_output=True, text=True)
    finally:
        os.remove(caminho)
    m = re.search(r'GEOMETRIA:(\[.*?\])</div>', r.stdout, re.S)
    if not m:
        # Sem medida real o halo sairia num lugar arbitrario e a peca sairia
        # errada sem aviso — o defeito que este arquivo inteiro existe para
        # nao repetir.
        raise SystemExit("nao consegui medir a geometria no Chrome:\n"
                         + r.stderr[-400:])
    return {d['id']: d['grupos'] for d in json.loads(m.group(1))}
