# -*- coding: utf-8 -*-
"""Confere a leva contra o DNA e a base do By Rock, antes de ela virar rascunho.

Nao substitui o olho: pega o que e verificavel por texto e por data. O que
depende de olhar a peca (foto no salao real, rosto identificavel, vermelho
como acento) continua sendo do humano.
"""
import json, os, re, sys, unicodedata
from datetime import date
from dados import STORIES, FEED
_AQUI = os.path.dirname(os.path.abspath(__file__))
ANALISE = json.load(open(os.path.join(_AQUI, "fotos-analise.json"), encoding="utf-8"))

def sem_acento(t):
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn").lower()

VETADO = ["imperdivel", "delicia", "top", "sensacional", "gourmet", "requintado", "corre",
          "ultimas unidades", "aproveita agora", "incrivel", "perfeito", "simplesmente",
          "demais", "que tal", "sofisticado", "refinado", "heavy metal", "underground",
          "vamos estar", "chave de ouro"]
# tecnica de preparo proibida. "chapa" so vale como travessa (Chapas do Rock).
PREPARO = ["brasa", "defumad", "no forno", "na chapa", "grelhado na chapa"]
CTAS = ["Reserve já", "Peça no delivery", "Vem pro By Rock", "Bora!", "Garanta sua mesa",
        "Chama a galera", "No volume máximo", "Liga o som e abre o apetite", "Vem almoçar",
        "Chama a família e vem"]
HH_OK = ["rock fries", "torresmo", "fries & ribs", "sausage mix", "pastel backstage",
         "buffalo crispy", "oldfashion", "chicken caesar", "smash sample", "chopp",
         "mojito", "caipirinha", "gin tonica", "by gin", "cosmopolitan"]
# Pratos que NAO tem selo HH. "costela" ficou de fora de proposito: e ingrediente
# do Fries & Ribs, que TEM selo — a palavra sozinha nao denuncia nada.
NAO_HH = ["main stage", "rock steaks", "rock family", "rock mix", "picanha",
          "bife ancho", "chorizo", "ribs barbecue", "brownie", "hermanos", "pork's plate"]

erros, avisos = [], []

# ---- 1. Nenhum preco em nenhuma peca (regra aprendida em 24/08/2026) ----
def tem_preco(t):
    return bool(re.search(r"R\$|\breais\b|\d+,\d{2}\b", t, re.I))

# ---- 2..N por peca ----
todas = []
for pid, d, h, layout, logo, foto, m1, m2, apoio, fecho, rod in STORIES:
    todas.append((pid, d, h, layout, logo, foto, m1, m2, apoio, fecho, rod, "story"))
for fid, c in FEED.items():
    for sid, layout, logo, foto, m1, m2, apoio in c["slides"]:
        todas.append((sid, c["data"], c["hora"], layout, logo, foto, m1, m2, apoio, "", False, "feed"))

for (pid, d, h, layout, logo, foto, m1, m2, apoio, fecho, rod, tipo) in todas:
    txt = " ".join([m1, m2, apoio, fecho])
    n = sem_acento(txt)
    if tem_preco(txt):
        erros.append(f"{pid}: PRECO na peca")
    for v in VETADO:
        if v in n:
            erros.append(f"{pid}: vocabulario vetado {v!r}")
    for v in PREPARO:
        if v in n:
            erros.append(f"{pid}: tecnica de preparo proibida {v!r}")
    if any(ord(ch) > 0x2100 for ch in txt):
        erros.append(f"{pid}: emoji dentro da arte")
    # caixa alta so na manchete
    for campo, val in (("apoio", apoio), ("fecho", fecho)):
        if val and val == val.upper() and any(c.isalpha() for c in val):
            erros.append(f"{pid}: {campo} inteiro em CAIXA ALTA")
    if fecho and fecho not in CTAS:
        erros.append(f"{pid}: CTA fora da lista aprovada: {fecho!r}")
    # manchete nunca abre pelo nome tematico
    if re.match(r"^(kiss|aerosmith|presley|beatles|pink floyd|pearl jam|satisfaction|"
                r"roberto carlos|capital inicial|rita lee|rock family|rock mix|"
                r"main stage|rock steaks|palco nacional)", sem_acento(m1)):
        erros.append(f"{pid}: manchete abre pelo nome tematico")

# ---- 3. Happy hour so com item de selo HH ----
for (pid, d, h, layout, logo, foto, m1, m2, apoio, fecho, rod, tipo) in todas:
    n = sem_acento(" ".join([m1, m2, apoio]))
    if "happy hour" in n or "selo hh" in n:
        for item in NAO_HH:
            if item in n:
                erros.append(f"{pid}: peca de happy hour cita item SEM selo HH ({item!r})")

# ---- 4. Oferta de almoco so em dia util ----
for (pid, d, h, layout, logo, foto, m1, m2, apoio, fecho, rod, tipo) in todas:
    n = sem_acento(" ".join([m1, m2, apoio]))
    oferta = ("25% off" in n) or ("entrada inclusa" in n) or ("entrada vem junto" in n)
    if oferta and date.fromisoformat(d).weekday() >= 5:
        erros.append(f"{pid}: oferta de almoco em {d} (fim de semana)")

# ---- 5. Uma oferta por peca ----
for (pid, d, h, layout, logo, foto, m1, m2, apoio, fecho, rod, tipo) in todas:
    n = sem_acento(" ".join([m1, m2, apoio]))
    TIPOS = {
        "almoco-desconto": ["25% off"],
        "almoco-entrada": ["entrada inclusa", "entrada vem junto"],
        "happy-hour": ["50% off"],
        "quinta-do-vinho": ["rolha"],
    }
    presentes = [t for t, frases in TIPOS.items() if any(f in n for f in frases)]
    if len(presentes) > 1:
        erros.append(f"{pid}: ofertas empilhadas na mesma peca: {presentes}")

# ---- 6. Duas pecas seguidas nao saem iguais ----
#
# A BANDA (texto em cima ou embaixo) NAO entra nesta regra de proposito: quem a
# escolhe e a foto, e cobrir o assunto e defeito pior do que duas pecas seguidas
# dividirem a mesma faixa. O que tem de variar e o que NAO depende da foto — a
# variante do bloco — e o canto da logo, que o proprio DNA ja manda tirar da
# "zona escura disponivel na foto".
PLANO = json.load(open(os.path.join(_AQUI, "plano.json"), encoding="utf-8"))
seq = sorted([(s[1], s[2], s[0]) for s in STORIES])
for i in range(1, len(seq)):
    pid, ant = seq[i][2], seq[i-1][2]
    if PLANO[pid]["variante"] == PLANO[ant]["variante"] and PLANO[pid]["logo"] == PLANO[ant]["logo"]:
        erros.append(f"{pid}: variante E canto de logo iguais aos da peca anterior "
                     f"({PLANO[pid]['variante']}/{PLANO[pid]['logo']})")

# ---- 6b. O texto sempre na faixa mais calma que a analise apontou ----
for pid, v in PLANO.items():
    if v["banda"] == "-":
        continue
    d = ANALISE[v["foto"]]
    outra = "baixo" if v["banda"] == "topo" else "topo"
    folga = abs(d["topo"]["energia"] - d["baixo"]["energia"]) / max(d["topo"]["energia"], d["baixo"]["energia"])
    if folga > 0.12 and d[v["banda"]]["energia"] > d[outra]["energia"]:
        erros.append(f"{pid}: texto na faixa MAIS cheia da foto "
                     f"({v['banda']}={d[v['banda']]['energia']:.1f} vs {outra}={d[outra]['energia']:.1f})")

# ---- 7. Rodape so na PRIMEIRA peca do dia ----
por_dia = {}
for s in STORIES:
    por_dia.setdefault(s[1], []).append(s)
for d, itens in por_dia.items():
    itens = sorted(itens, key=lambda s: s[2])
    for i, s in enumerate(itens):
        if s[10] and i != 0:
            erros.append(f"{s[0]}: rodape de servico fora da 1a peca do dia")
        if i == 0 and not s[10]:
            avisos.append(f"{s[0]}: 1a peca de {d} sem rodape de servico")

# ---- 7b. A CAPA de todo carrossel e foto pura: sem texto e sem logo ----
for fid, c in FEED.items():
    sid, layout, logo, foto, m1, m2, apoio = c["slides"][0]
    if layout != "foto-pura":
        erros.append(f"{sid}: capa de carrossel precisa ser foto pura (esta como {layout!r})")
    if any([m1, m2, apoio, logo]):
        erros.append(f"{sid}: capa de carrossel com texto ou logo")
    for sl in c["slides"][1:]:
        if sl[1] == "foto-pura":
            erros.append(f"{sl[0]}: slide interno sem arte — so a capa e foto pura")

# ---- 8. Foto nunca repete na semana ----
fotos = [t[5] for t in todas]
rep = {f for f in fotos if fotos.count(f) > 1}
if rep:
    erros.append(f"foto repetida na semana: {sorted(rep)}")

# ---- 9. Grade: 3 stories por dia, nos slots certos ----
SLOTS = {0: ["09:00", "15:00", "19:00"], 1: ["09:00", "15:00", "18:00"],
         2: ["09:00", "15:00", "18:00"], 3: ["09:00", "15:00", "18:00"],
         4: ["09:00", "15:00", "18:00"], 5: ["11:00", "15:00", "18:00"],
         6: ["09:00", "15:00", "18:00"]}
for d, itens in sorted(por_dia.items()):
    horas = sorted(s[2] for s in itens)
    esperado = SLOTS[date.fromisoformat(d).weekday()]
    if horas != esperado:
        erros.append(f"{d}: horarios {horas} != grade {esperado}")

print(f"{len(todas)} pecas conferidas ({len(STORIES)} stories + {len(todas)-len(STORIES)} slides de feed)")
if avisos:
    print("\nAVISOS:")
    for a in avisos: print(f"  ~ {a}")
if erros:
    print("\nERROS:")
    for e in erros: print(f"  X {e}")
    sys.exit(1)
print("\nnenhum erro: a leva passa nas regras verificaveis por texto e por data.")
