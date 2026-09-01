# -*- coding: utf-8 -*-
"""Recorta as fotos da semana 1 da Wine Vix e gera as duas copias do ciclo.

  fotos/<nome>.jpg   tamanho de publicacao, q90 — o que o render.py consome
  ./<nome>.jpg       metade linear, q62      — a leve, embutida no canvas

Os NOMES tem de ser identicos nos dois lugares: o resolver do render.py
procura primeiro em fotos/ e so cai na raiz se nao achar.

STORY sai 1080x1920 e FEED 1080x1350. As duas familias sao arte COM TEXTO
diagramado no quadro — por isso saem fechadas, e nao originais (a regra da
foto original vale para carrossel de fotos puras, onde quem enquadra e o Ciro).

FOCO e a fracao vertical do centro do recorte (0 = topo, 1 = base). As fotos
do acervo sao 3:2 deitadas ou 2:3 em pe; no 9:16 sobra muita largura, entao o
foco HORIZONTAL tambem importa e vai em FOCO_X quando o assunto nao esta no
meio.
"""
import os
from PIL import Image

STORY = (1080, 1920)
FEED = (1080, 1350)

# nome, formato, foco_y, foco_x, assunto
MAPA = [
    ('seg-09', STORY, 0.50, 0.50, 'salao com adegas'),
    ('seg-10', STORY, 0.50, 0.50, 'brasileirinho do executivo'),
    ('seg-12', STORY, 0.50, 0.50, 'ravioli do festival italiano'),
    ('ter-09', STORY, 0.50, 0.50, 'interior com clientes'),
    ('ter-10', STORY, 0.50, 0.50, 'arroz de polvo'),
    ('ter-13', STORY, 0.50, 0.50, 'prateleiras de rotulos'),
    ('qua-09', STORY, 0.50, 0.50, 'vista interna, atendimento'),
    ('qua-10', STORY, 0.50, 0.50, 'ancho com legumes'),
    ('qua-12', STORY, 0.50, 0.50, 'tabua de frios e queijos'),
    ('qui-09', STORY, 0.50, 0.50, 'adega com equipe apresentando rotulo'),
    ('qui-10', STORY, 0.50, 0.50, 'penne ao pomodoro'),
    ('qui-12', STORY, 0.50, 0.50, 'brinde com petisco'),
    ('sex-09', STORY, 0.50, 0.50, 'fachada noturna'),
    ('sex-10', STORY, 0.50, 0.50, 'salada e carpaccio'),
    ('sex-12', STORY, 0.50, 0.50, 'polvo ao mediterraneo'),
    ('sab-09', STORY, 0.50, 0.50, 'grupo em mesa longa'),
    ('sab-10', STORY, 0.50, 0.50, 'taca sendo servida'),
    ('sab-12', STORY, 0.50, 0.50, 'garrafas em caixa de madeira'),
    ('dom-09', STORY, 0.50, 0.50, 'prateleiras de tinto, sem gente'),
    ('dom-12', STORY, 0.50, 0.50, 'garrafa na mao, adega ao fundo'),
    ('dom-17', STORY, 0.50, 0.50, 'casal com tacas'),
    ('c1s1', FEED, 0.50, 0.50, 'garrafas em prateleira escura'),
    ('c1s2', FEED, 0.50, 0.50, 'cliente observa garrafa'),
    ('c1s3', FEED, 0.50, 0.50, 'prato e vinho branco'),
    ('c1s4', FEED, 0.50, 0.50, 'cliente diante da adega'),
    ('c1s5', FEED, 0.50, 0.50, 'garrafa e taca na mesa, luz quente'),
    ('c1s6', FEED, 0.50, 0.50, 'nicho de tintos'),
    ('c2s1', FEED, 0.50, 0.50, 'dois pratos e tacas'),
    ('c2s2', FEED, 0.50, 0.50, 'polvo ao mediterraneo'),
    ('c2s3', FEED, 0.50, 0.50, 'risoto de camarao'),
    ('c2s4', FEED, 0.50, 0.50, 'escalope com risoto de cogumelos'),
    ('c2s5', FEED, 0.50, 0.50, 'spaghetti com camaroes'),
    ('c2s6', FEED, 0.50, 0.50, 'salmao com risoto'),
    ('c3s1', FEED, 0.50, 0.50, 'brinde na adega'),
    ('c3s2', FEED, 0.50, 0.50, 'file mignon de entrada'),
    ('c3s3', FEED, 0.50, 0.50, 'steak tartare com vinho'),
    ('c3s4', FEED, 0.50, 0.50, 'tabua de frios'),
    ('c3s5', FEED, 0.50, 0.50, 'burrata caprese quente'),
    ('c3s6', FEED, 0.50, 0.50, 'caixa de madeira com garrafas'),
]


def recortar(origem, tam, foco_y, foco_x):
    W, H = tam
    im = Image.open(os.path.join('originais', origem)).convert('RGB')
    w, h = im.size
    alvo_h = int(w / (W / H))
    if alvo_h <= h:
        top = int((h - alvo_h) * foco_y)
        box = (0, top, w, top + alvo_h)
    else:
        alvo_w = int(h * (W / H))
        left = int((w - alvo_w) * foco_x)
        box = (left, 0, left + alvo_w, h)
    return im.crop(box).resize((W, H), Image.LANCZOS)


if __name__ == '__main__':
    os.makedirs('fotos', exist_ok=True)
    for nome, tam, fy, fx, _ in MAPA:
        rec = recortar(f'{nome}.jpg', tam, fy, fx)
        rec.save(f'fotos/{nome}.jpg', quality=90)
        # A copia do canvas desce em qualidade E em tamanho ate caber no teto:
        # sao 40 imagens e o documento inteiro sobe a cada save de quem lapida.
        # So a qualidade nao basta — foto de folhagem fica em 64KB ate no q30,
        # e ai o que sobra e diminuir o quadro (a copia leve serve para julgar
        # layout; quem publica e a de fotos/, intacta).
        for escala, q in ((0.50, 62), (0.50, 46), (0.40, 46), (0.34, 44),
                          (0.28, 42)):
            leve = rec.resize((int(tam[0] * escala), int(tam[1] * escala)),
                              Image.LANCZOS)
            leve.save(f'{nome}.jpg', quality=q)
            if os.path.getsize(f'{nome}.jpg') <= 50_000:
                break
        print(f'  {nome}.jpg  {tam[0]}x{tam[1]}  render '
              f'{os.path.getsize(f"fotos/{nome}.jpg")//1024}KB  '
              f'canvas {os.path.getsize(f"{nome}.jpg")//1024}KB')
