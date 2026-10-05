# -*- coding: utf-8 -*-
"""Folha de contato para revisar a leva inteira sem abrir 34 arquivos."""
import json, os
from PIL import Image, ImageDraw

mapa = json.load(open('mapa.json', encoding='utf-8'))
LARG, GAP, ROT = 300, 14, 26

def folha(itens, saida, cols=7):
    thumbs = []
    for m in itens:
        arq = f"render/{m['artboard'].replace('.dc.html', '.png')}"
        im = Image.open(arq)
        h = round(LARG * im.height / im.width)
        thumbs.append((m['nome'], im.resize((LARG, h), Image.LANCZOS)))
    altmax = max(t.height for _, t in thumbs)
    linhas = (len(thumbs) + cols - 1) // cols
    W = cols * LARG + (cols + 1) * GAP
    H = linhas * (altmax + ROT + GAP) + GAP
    folha = Image.new('RGB', (W, H), (24, 24, 26))
    d = ImageDraw.Draw(folha)
    for i, (nome, t) in enumerate(thumbs):
        c, l = i % cols, i // cols
        x = GAP + c * (LARG + GAP)
        y = GAP + l * (altmax + ROT + GAP)
        d.text((x + 2, y + 4), f"{i+1}. {nome}", fill=(240, 240, 240))
        folha.paste(t, (x, y + ROT))
    folha.save(saida)
    print(f"{saida}  {folha.width}x{folha.height}  {len(thumbs)} pecas")

stories = [m for m in mapa if m['alt'] == 1920]
feed = [m for m in mapa if m['alt'] == 1350]
folha(stories[:10], 'saida/contato-stories-1.png', 5)
folha(stories[10:], 'saida/contato-stories-2.png', 5)
folha(feed, 'saida/contato-feed.png', 7)
