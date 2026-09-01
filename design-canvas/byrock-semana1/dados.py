# -*- coding: utf-8 -*-
"""Semana 1 do By Rock (31/08 a 06/09/2026).

Stories pela grade "Padroes de Postagem - By Rock" (3/dia, 09h|11h / 15h / 18h|19h).
Feed pela "Cadencia e rodizio de temas do FEED - By Rock" (3 carrosseis).

Regras do DNA que este arquivo obedece, e que NAO devem ser afrouxadas ao editar:
  - manchete em DUAS linhas, a 1a branca e a 2a vermelha (#C82020);
  - caixa alta SO na manchete (caixa alta em todos os campos e reprovacao);
  - nome tematico do prato NUNCA abre a manchete: descricao primeiro, nome no fim;
  - secao do cardapio se explica antes de nomear ("os cortes grelhados" -> "Rock Steaks");
  - selo HH sempre como "itens marcados com o selo HH no cardapio";
  - NENHUM preco, em nenhuma peca (regra aprendida em 24/08/2026);
  - UMA oferta por peca;
  - rodape com horario e endereco so na PRIMEIRA peca do dia;
  - layout e posicao da logo nunca se repetem em pecas consecutivas;
  - sem emoji dentro da arte; sem "brasa"/"chapa" como modo de preparo.
"""

# O servico da marca, em DOIS campos (01/09/2026). Era uma string so, unida por
# " · " — mas o separador estava fazendo o papel de quebra de linha, e o bloco
# inteiro saia em cinza no mesmo tamanho. O horario e a informacao acionavel e
# sobe de nivel; o endereco fica um degrau abaixo. Ver `bloco_rodape`.
HORARIO = "Todos os dias das 11h à meia-noite"
ENDERECO = "Rua Eugênio Netto, 82, Praia do Canto, Vitória"

# Compatibilidade: ainda ha codigo (conferir.py) que le a linha unida.
RODAPE = f"{HORARIO} · {ENDERECO}"

# (id, data, hora, layout, logo, foto, manchete1, manchete2, apoio, fecho, rodape)
STORIES = [
    ("s01", "2026-08-31", "09:00", "bloco", "auto", "s01-seg-almoco.jpg",
     "OS CORTES GRELHADOS", "SAEM COM 25% OFF",
     "De **segunda a sexta**, das **11h às 16h**. Os **Rock Steaks** vêm com molho e dois acompanhamentos.",
     "Vem almoçar", True),

    ("s02", "2026-08-31", "15:00", "coluna", "auto", "s02-seg-hh.jpg",
     "HAPPY HOUR TODO DIA", "ATÉ 50% OFF",
     "Todo dia, das **16h às 20h**, nos itens com o **selo HH**.",
     "Chama a galera", False),

    ("s03", "2026-08-31", "19:00", "bloco", "auto", "s03-seg-delivery.jpg",
     "COSTELA AO BARBECUE", "VAI ATÉ VOCÊ",
     "**Delivery próprio**, todo dia, no almoço e no jantar. É a **Ribs Barbecue**.",
     "Peça no delivery", False),

    ("s04", "2026-09-01", "09:00", "coluna", "auto", "s04-ter-executivo.jpg",
     "ALMOÇO RESOLVIDO", "SEM PRESSA",
     "**Baby beef** grelhado com arroz, feijão, batata e farofa. É o **Roberto Carlos**.",
     "Vem almoçar", True),

    ("s05", "2026-09-01", "15:00", "bloco", "auto", "s05-ter-hh.jpg",
     "O TORRESMO CROCANTE", "COM LIMÃO SICILIANO",
     "O **Torresmo Rock** está no **selo HH**. Happy hour todo dia, das **16h às 20h**.",
     "Bora!", False),

    ("s06", "2026-09-01", "18:00", "coluna", "auto", "s06-ter-vinho.jpg",
     "QUINTA É DIA", "DE VINHO",
     "Cardápio especial e **rolha free** no primeiro vinho.",
     "Garanta sua mesa", False),

    ("s07", "2026-09-02", "09:00", "bloco", "auto", "s07-qua-mainstage.jpg",
     "PEDIU O PRINCIPAL", "A ENTRADA VEM JUNTO",
     "De **segunda a sexta**, das **11h às 16h**: todo **Main Stage** vem com entrada.",
     "Vem almoçar", True),

    ("s08", "2026-09-02", "15:00", "coluna", "direita", "s08-qua-hh.jpg",
     "O CHOPP GELADO", "ENTRA NO HAPPY HOUR",
     "Todo dia, das **16h às 20h**, com até **50% OFF** nos itens do **selo HH**.",
     "Vem pro By Rock", False),

    ("s09", "2026-09-02", "18:00", "bloco", "auto", "s09-qua-vinho-b.jpg",
     "NA QUINTA,", "A ROLHA É FREE",
     "No **primeiro vinho**. E a noite tem cardápio especial.",
     "Reserve já", False),

    ("s10", "2026-09-03", "09:00", "coluna", "auto", "s10-qui-executivo-b.jpg",
     "FILÉ À PARMEGIANA", "COM MOLHO ARTESANAL",
     "De **frango ou carne**, com arroz e purê. É o **Capital Inicial**.",
     "Vem almoçar", True),

    ("s11", "2026-09-03", "15:00", "bloco", "auto", "s11-qui-hh.jpg",
     "QUATRO PASTÉIS", "VOCÊ ESCOLHE O SABOR",
     "O **Pastel Backstage** está no **selo HH**. Todo dia, das **16h às 20h**.",
     "Chama a galera", False),

    ("s12", "2026-09-03", "18:00", "coluna", "auto", "s12-qui-vinho.jpg",
     "HOJE A CASA", "É DO VINHO",
     "A **Quinta do Vinho** tem cardápio próprio e **rolha free** no primeiro.",
     "Vem pro By Rock", False),

    ("s13", "2026-09-04", "09:00", "bloco", "auto", "s13-sex-almoco.jpg",
     "SEXTA É O ÚLTIMO DIA", "COM 25% OFF",
     "Os **Rock Steaks** com **25% OFF** até as **16h**. Volta só na segunda.",
     "Vem almoçar", True),

    ("s14", "2026-09-04", "15:00", "coluna", "auto", "s14-sex-hh.jpg",
     "BATATA COM COSTELA", "DESFIADA E BARBECUE",
     "A **Fries & Ribs** está no **selo HH**. Todo dia, das **16h às 20h**.",
     "Bora!", False),

    ("s15", "2026-09-04", "18:00", "bloco", "auto", "s15-sex-chapa.jpg",
     "SEXTA PEDE", "MESA GRANDE",
     "Seis cortes numa travessa só, a partir de **1,5kg**. É o **Rock Mix**.",
     "Chama a galera", False),

    ("s16", "2026-09-05", "11:00", "coluna", "auto", "s16-sab-familia.jpg",
     "SÁBADO EM FAMÍLIA", "COM ÁREA KIDS",
     "**Área kids** para as crianças e mesa à vontade. A casa abre às **11h**.",
     "Chama a família e vem", True),

    ("s17", "2026-09-05", "15:00", "bloco", "auto", "s17-sab-hh.jpg",
     "O FIM DE SEMANA", "COMEÇA ÀS 16H",
     "Happy hour todo dia, das **16h às 20h**, com até **50% OFF** no **selo HH**.",
     "Vem pro By Rock", False),

    ("s18", "2026-09-05", "18:00", "coluna", "auto", "s18-sab-corte.jpg",
     "BIFE ANCHO", "NO PONTO QUE PEDIR",
     "Grelhado, com um molho e dois acompanhamentos. É um dos **Rock Steaks**.",
     "Reserve já", False),

    ("s19", "2026-09-06", "09:00", "bloco", "auto", "s19-dom-familia.jpg",
     "O ALMOÇO DE DOMINGO", "COMEÇA ÀS 11H",
     "**Área kids** para as crianças e o salão inteiro pra ninguém ter pressa.",
     "Chama a família e vem", True),

    ("s20", "2026-09-06", "15:00", "coluna", "auto", "s20-dom-hh.jpg",
     "DOMINGO TAMBÉM", "TEM HAPPY HOUR",
     "Todo dia, das **16h às 20h**, com até **50% OFF** nos itens do **selo HH**.",
     "Bora!", False),

    ("s21", "2026-09-06", "18:00", "bloco", "auto", "s21-dom-sobremesa.jpg",
     "BROWNIE QUENTE", "COM SORVETE E CALDA",
     "**Chocolate belga** derretido na hora de servir. É o **Rock'n Brownie**.",
     "Vem pro By Rock", False),
]

# Feed: (id, layout, logo, foto, manchete1, manchete2, apoio)
#
# A CAPA E FOTO PURA: sem texto, sem logo, so a fotografia (decisao do Ciro em
# 30/08/2026, alinhada a regra da casa para carrossel gerado por IA — "capa de
# carrossel e foto PURA"). Por isso a mensagem que abria a peca desceu para o
# slide 2, e os slides seguintes absorveram o que sobrou: a leva continua com
# CINCO slides e NENHUMA informacao foi perdida no caminho.
FEED = {
    "f1": {
        "data": "2026-08-31", "hora": "11:30", "titulo": "Almoço com 25% OFF",
        "caption": (
            "O almoço de segunda a sexta tem os cortes grelhados com 25% OFF, das 11h às 16h. "
            "Cada um sai com um molho e dois acompanhamentos — ou um acompanhamento especial, se você preferir. "
            "Bife ancho, bife chorizo e os outros cortes estão todos lá. No cardápio, eles são os Rock Steaks.\n\n"
            "Rua Eugênio Netto, 82 — Praia do Canto, Vitória. Aberto todos os dias, das 11h à meia-noite.\n\n"
            "Vem almoçar. 🤘"
        ),
        "slides": [
            ("f1-01", "foto-pura", "", "f1-01.jpg", "", "", ""),
            ("f1-02", "bloco", "auto", "f1-02.jpg", "ALMOÇO COM", "25% OFF",
             "Nos cortes grelhados, de segunda a sexta, das 11h às 16h."),
            ("f1-03", "coluna", "auto", "f1-03.jpg", "UM MOLHO", "DOIS ACOMPANHAMENTOS",
             "Ou um acompanhamento especial, se preferir. A escolha é sua."),
            ("f1-04", "bloco", "auto", "f1-04.jpg", "BIFE ANCHO", "OU BIFE CHORIZO",
             "Dois dos cortes que entram na seção — e não são os únicos. No cardápio, eles são os Rock Steaks."),
            ("f1-05", "coluna", "auto", "f1-05.jpg", "VEM ALMOÇAR", "NA PRAIA DO CANTO",
             "Rua Eugênio Netto, 82. Todos os dias, das 11h à meia-noite."),
        ],
    },
    "f2": {
        "data": "2026-09-03", "hora": "17:00", "titulo": "Quinta do Vinho",
        "caption": (
            "Quinta do Vinho: o primeiro vinho vai sem rolha. A noite tem cardápio próprio, "
            "com entradas, pratos do dia e sobremesas temáticas — e a casa fica aberta até meia-noite.\n\n"
            "Rua Eugênio Netto, 82 — Praia do Canto, Vitória.\n\n"
            "Garanta sua mesa. 🍷"
        ),
        "slides": [
            ("f2-01", "foto-pura", "", "f2-01.jpg", "", "", ""),
            ("f2-02", "bloco", "auto", "f2-02.jpg", "QUINTA É DIA", "DE VINHO",
             "Toda quinta, com cardápio próprio na casa."),
            # a foto do slide 3 tem comida E vinho; a do 4 e o salao. Com a mensagem
            # do cardapio no 4, a foto contradizia o texto — trocaram de lugar.
            ("f2-03", "coluna", "auto", "f2-03.jpg", "O PRIMEIRO VINHO", "VAI SEM ROLHA",
             "Rolha free na primeira garrafa. E a noite tem cardápio próprio, com entradas, pratos do dia e sobremesas temáticas."),
            ("f2-04", "bloco", "auto", "f2-04.jpg", "A CASA FICA ABERTA", "ATÉ MEIA-NOITE",
             "Dá tempo de jantar sem pressa."),
            ("f2-05", "coluna", "auto", "f2-05.jpg", "GARANTA", "SUA MESA",
             "Rua Eugênio Netto, 82 — Praia do Canto, Vitória."),
        ],
    },
    "f3": {
        "data": "2026-09-06", "hora": "12:00", "titulo": "Domingo em família",
        "caption": (
            "Domingo de mesa grande: picanha, fraldinha, ancho, chorizo, linguiça e legumes "
            "numa travessa só, a partir de 1,2kg. Dá pra dividir com todo mundo — e enquanto isso "
            "as crianças ficam na área kids. No cardápio, ela atende por Rock Family.\n\n"
            "Rua Eugênio Netto, 82 — Praia do Canto, Vitória. Domingo a casa abre às 11h.\n\n"
            "Chama a família e vem. 🤘"
        ),
        "slides": [
            ("f3-01", "foto-pura", "", "f3-01.jpg", "", "", ""),
            ("f3-02", "bloco", "auto", "f3-02.jpg", "DOMINGO PEDE", "TRAVESSA GRANDE",
             "Picanha, fraldinha, ancho, chorizo, linguiça e legumes, a partir de 1,2kg."),
            ("f3-03", "coluna", "auto", "f3-03.jpg", "DÁ PRA DIVIDIR", "COM TODO MUNDO",
             "Uma travessa no meio da mesa e ninguém fica esperando a vez. No cardápio, ela atende por Rock Family."),
            # a manchete falava da area kids sobre uma foto de carne — imagem e texto
            # diziam coisas diferentes. A area kids virou o apoio, que a foto sustenta.
            ("f3-04", "bloco", "auto", "f3-04.jpg", "DOMINGO SEM PRESSA", "A MESA É SUA",
             "E as crianças se divertem na área kids enquanto os adultos ficam à mesa."),
            ("f3-05", "coluna", "auto", "f3-05.jpg", "CHAMA A FAMÍLIA", "E VEM",
             "Domingo a casa abre às 11h. Rua Eugênio Netto, 82 — Praia do Canto."),
        ],
    },
}
