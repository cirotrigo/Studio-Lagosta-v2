# -*- coding: utf-8 -*-
"""Desenha os cartoes de avaliacao da semana 1 com os DADOS REAIS lidos dos
paineis em 30/08/2026 (inicial em circulo no lugar da foto do cliente, como o
Google faz — evita republicar rosto).

Google  — Gustavo assumcao, 5 estrelas, selo Novo, itens 5/5, 29/08/2026.
TripAdvisor — Paula J, 5 circulos, "Almoço em casal", feita em 28/08/2026.
"""
import subprocess, os
from PIL import Image

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W = 1357

ESTRELA_G = ('<svg width="34" height="34" viewBox="0 0 24 24" fill="#FABB05" style="flex:none">'
             '<path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z">'
             '</path></svg>')
BOLHA_T = ('<svg width="30" height="30" viewBox="0 0 24 24" style="flex:none">'
           '<circle cx="12" cy="12" r="10" fill="#00AA6C"></circle></svg>')

BASE = '''<!doctype html><html><head><meta charset="utf-8"><style>
body {{ margin: 0; background: #ffffff; font-family: Roboto, Arial, "Helvetica Neue", sans-serif; }}
.card {{ width: {w}px; box-sizing: border-box; padding: 46px 50px 42px; background: #fff; }}
.topo {{ display: flex; align-items: center; gap: 26px; }}
.avatar {{ width: 88px; height: 88px; border-radius: 50%; color: #fff; font-size: 44px;
  display: flex; align-items: center; justify-content: center; font-weight: 500; flex: none; }}
.nome {{ font-size: 38px; font-weight: 700; color: #202124; }}
.sub {{ font-size: 27px; color: #70757a; margin-top: 4px; }}
.linha2 {{ display: flex; align-items: center; gap: 8px; margin-top: 26px; }}
.quando {{ font-size: 30px; color: #4d5156; margin-left: 14px; }}
.novo {{ font-size: 27px; color: #202124; border: 2px solid #dadce0; border-radius: 10px;
  padding: 6px 18px; margin-left: 16px; }}
.texto {{ font-size: 34px; line-height: 1.42; color: #202124; margin-top: 26px; }}
.itens {{ margin-top: 24px; background: #f1f3f4; border-radius: 12px; padding: 18px 24px;
  font-size: 28px; color: #4d5156; }}
.itens b {{ color: #202124; font-weight: 700; }}
.titulo {{ font-size: 36px; font-weight: 700; color: #202124; margin-top: 24px; }}
.rodape {{ font-size: 26px; color: #70757a; margin-top: 24px; }}
</style></head><body><div class="card">{corpo}</div></body></html>'''

GUSTAVO = {
    'arq': 'cartao-gustavo',
    'corpo': (
        '<div class="topo">'
        '<div class="avatar" style="background:#00695C">G</div>'
        '<div><div class="nome">Gustavo assumcao</div>'
        '<div class="sub">1 avaliação · 1 foto</div></div></div>'
        '<div class="linha2">' + ESTRELA_G * 5 +
        '<span class="quando">um dia atrás</span><span class="novo">Novo</span></div>'
        '<div class="texto">A comida é maravilhosa e o atendimento é melhor ainda! deixo '
        'principalmente meus agradecimentos ao Júlio por ser extremamente educado, solícito e '
        'atencioso, ele fez total diferença na experiência!! A comida estava extremamente '
        'deliciosa, em especial a sobremesa de limão siciliano que estava incrível.</div>'
        '<div class="itens"><b>Comida:</b> 5/5&nbsp;&nbsp;|&nbsp;&nbsp;<b>Serviço:</b> 5/5'
        '&nbsp;&nbsp;|&nbsp;&nbsp;<b>Ambiente:</b> 5/5</div>'
    ),
}

PAULA = {
    'arq': 'cartao-paula',
    'corpo': (
        '<div class="topo">'
        '<div class="avatar" style="background:#004F32">P</div>'
        '<div><div class="nome">Paula J</div>'
        '<div class="sub">8 contribuições</div></div></div>'
        '<div class="linha2">' + BOLHA_T * 5 + '</div>'
        '<div class="titulo">Almoço em casal</div>'
        '<div class="sub" style="margin-top: 8px">ago. de 2026 · Casal</div>'
        '<div class="texto">Excelente comida e ótimo atendimento do Júlio César.</div>'
        '<div class="rodape">Feita em 28 de agosto de 2026</div>'
    ),
}


def render(card):
    html = BASE.format(w=W, corpo=card['corpo'])
    tmp = f"cartoes/{card['arq']}.html"
    png = f"cartoes/{card['arq']}-full.png"
    open(tmp, 'w', encoding='utf-8').write(html)
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=1", "--default-background-color=FFFFFF",
                    "--virtual-time-budget=4000", f"--screenshot={png}",
                    f"--window-size={W},1400", f"file://{os.path.abspath(tmp)}"],
                   capture_output=True, text=True)
    im = Image.open(png).convert('RGB')
    px = im.load()
    baixo = im.height - 1
    while baixo > 0:
        linha = [px[x, baixo] for x in range(0, im.width, 12)]
        if any(c != (255, 255, 255) for c in linha):
            break
        baixo -= 1
    recorte = im.crop((0, 0, im.width, min(im.height, baixo + 34)))
    final = f"{card['arq']}.png"
    recorte.save(final)
    os.remove(png)
    print(final, recorte.size)


if __name__ == '__main__':
    os.makedirs('cartoes', exist_ok=True)
    render(GUSTAVO)
    render(PAULA)
