# -*- coding: utf-8 -*-
"""Monta o antes/depois para o Ciro olhar no celular.

VEU a esquerda, HALO a direita, mesma peca e mesmo texto — uma variavel so.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONTE = '/System/Library/Fonts/Avenir Next.ttc'


def rotulo(largura, texto, alt=46):
    f = ImageFont.truetype(FONTE, 26, index=1)
    im = Image.new('RGB', (largura, alt), (18, 14, 12))
    d = ImageDraw.Draw(im)
    l, t, r, b = d.textbbox((0, 0), texto, font=f)
    d.text(((largura - (r - l)) // 2, (alt - (b - t)) // 2 - t), texto,
           font=f, fill=(249, 247, 242))
    return im


def par(nome, escala=3):
    a = Image.open(f'render-veu/{nome}.png').convert('RGB')
    b = Image.open(f'render-halo/{nome}.png').convert('RGB')
    w, h = a.width // escala, a.height // escala
    a = a.resize((w, h), Image.LANCZOS)
    b = b.resize((w, h), Image.LANCZOS)
    im = Image.new('RGB', (w * 2 + 12, h + 46), (18, 14, 12))
    im.paste(rotulo(w * 2 + 12, nome), (0, 0))
    im.paste(a, (0, 46))
    im.paste(b, (w + 12, 46))
    return im


if __name__ == '__main__':
    nomes = sys.argv[1:] or ['SegExecutivo']
    partes = [par(n) for n in nomes]
    larg = max(p.width for p in partes)
    topo = rotulo(larg, 'VÉU  (como está)          ·          HALO  (proposta)', 60)
    alt = 60 + sum(p.height + 14 for p in partes)
    fora = Image.new('RGB', (larg, alt), (18, 14, 12))
    fora.paste(topo, (0, 0))
    y = 60
    for p in partes:
        fora.paste(p, (0, y))
        y += p.height + 14
    saida = 'comparacao.png'
    fora.save(saida)
    print(f'  {saida}  {fora.width}x{fora.height}')
