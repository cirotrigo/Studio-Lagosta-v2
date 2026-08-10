#!/usr/bin/env python3
"""
Monta folhas de contato por pasta de destino do acervo do Seu Quinto.

Cada folha traz o nome da pasta, a contagem e a grade de miniaturas, com
marcação discreta nas fotos de cliente identificável (borda vermelha) — as
que não devem entrar em arte.

Uso:
  python3 contact_sheets_seu_quinto.py <dir-thumbs> <dir-saida>
"""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

COLS = 8
CELL = 190
PAD = 8
HEADER = 64
BG = (18, 15, 12)
FG = (245, 240, 232)
DIM = (150, 140, 130)
ALERTA = (237, 28, 36)


def fonte(tam, bold=False):
    caminhos = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for c in caminhos:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, tam)
            except Exception:
                pass
    return ImageFont.load_default()


def montar(pasta_nome, itens, saida):
    n = len(itens)
    linhas = (n + COLS - 1) // COLS
    W = COLS * (CELL + PAD) + PAD
    H = HEADER + linhas * (CELL + PAD) + PAD
    folha = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(folha)

    d.text((PAD + 2, 14), pasta_nome, font=fonte(26, bold=True), fill=FG)
    marcados = sum(1 for i in itens if i.get("cliente"))
    resumo = f"{n} imagens"
    if marcados:
        resumo += f"   ·   {marcados} com cliente identificável (borda vermelha)"
    d.text((PAD + 2, 44), resumo, font=fonte(15), fill=DIM)

    for idx, item in enumerate(itens):
        r, c = divmod(idx, COLS)
        x = PAD + c * (CELL + PAD)
        y = HEADER + r * (CELL + PAD)
        try:
            im = Image.open(item["thumb"]).convert("RGB")
        except Exception:
            continue
        im.thumbnail((CELL, CELL), Image.LANCZOS)
        cx = x + (CELL - im.width) // 2
        cy = y + (CELL - im.height) // 2
        folha.paste(im, (cx, cy))
        if item.get("cliente"):
            d.rectangle([x, y, x + CELL, y + CELL], outline=ALERTA, width=3)

    folha.save(saida, "JPEG", quality=82, optimize=True)
    return saida


def main():
    thumbs_dir, out_dir = sys.argv[1], sys.argv[2]
    with open(os.path.join(thumbs_dir, "_indice.json")) as f:
        indice = json.load(f)

    os.makedirs(out_dir, exist_ok=True)
    por_pasta = {}
    for it in indice:
        por_pasta.setdefault(it["folder"], []).append(it)

    gerados = []
    for pasta in sorted(por_pasta):
        itens = sorted(por_pasta[pasta], key=lambda i: i["file"])
        slug = pasta.replace("/", "__").replace(" ", "-")
        # quebra pastas grandes em páginas de 96 para a folha não virar um pôster
        paginas = [itens[i:i + 96] for i in range(0, len(itens), 96)]
        for p, chunk in enumerate(paginas, 1):
            sufixo = f"-p{p}" if len(paginas) > 1 else ""
            titulo = pasta + (f"   (parte {p}/{len(paginas)})" if len(paginas) > 1 else "")
            destino = os.path.join(out_dir, f"{slug}{sufixo}.jpg")
            montar(titulo, chunk, destino)
            gerados.append((pasta, len(chunk), destino))
            print(f"  {len(chunk):4d}  {destino}")

    print(f"\n{len(gerados)} folhas geradas em {out_dir}")


if __name__ == "__main__":
    main()
