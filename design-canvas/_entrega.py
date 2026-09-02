# -*- coding: utf-8 -*-
"""ENTREGA — o que cada arte da leva contém, para a régua da melhoria.

A copy nasce no gerador e se perdia entre o `dados.py`/`slots.json` e o
`upload-creative`: a arte subia sem `textos`, a melhoria com IA lia o serviço
da própria imagem e completava o que não entendia — endereço de outro estado,
com a conferência verde (01/09/2026). Este módulo fecha o fio: todo gerador
escreve um `entrega.json` ao lado dos artboards, e `upload-creative` (MCP
local) lê esse arquivo e sobe cada arte COM os seus textos numa chamada só.

Formato de `entrega.json`:

    [
      {"arquivo": "render/Ter0800.png", "textos": ["Terça no Quintal", "…"],
       "quando": "2026-09-01 08:00", "tema": "funcionamento"},
      {"arquivo": "render/capa.png", "textos": []}      ← capa: foto pura
    ]

Regras:
  - `textos` é a lista EXATA dos blocos desenhados, na ordem de leitura, sem
    marcação (o `**negrito**` e o `#destaque` saem; `<br>` vira espaço);
  - `textos: []` é AFIRMAÇÃO (foto pura, capa de carrossel) e liga o `semTexto`
    do importador; omitir a chave é "não sei", e aí a melhoria cai na visão;
  - `arquivo` é relativo à pasta do `entrega.json` (o render, nunca o .dc.html).

Uso no gerador (depois de escrever os artboards):

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from _entrega import escrever_entrega, textos_de
    escrever_entrega([{'arquivo': f'render/{m["arq"]}.png',
                       'textos': textos_de(m, ['pre', 'titulo', 'apoio', 'servico', 'cta']),
                       'quando': m.get('quando'), 'tema': m.get('tema')} for m in mapa])
"""
import json
import os
import re


def limpar(texto):
    """Um bloco como ele é DESENHADO: sem marcação, sem quebra, sem espaço duplo."""
    if texto is None:
        return None
    t = str(texto)
    t = re.sub(r'<br\s*/?>', ' ', t, flags=re.I)
    t = re.sub(r'<[^>]+>', '', t)           # spans de destaque
    t = t.replace('**', '')                  # negrito do By Rock
    t = re.sub(r'(?<!\S)#(?=\w)', '', t)     # "#palavra" (destaque do Espeto)
    t = re.sub(r'\s+', ' ', t).strip()
    return t or None


def textos_de(item, chaves):
    """Os blocos de um item, na ordem das `chaves`.

    Cada chave pode apontar para string, lista de strings (cada uma vira um
    bloco), lista de dicts com `txt` (linhas de serviço do TERO) ou dict com
    `txt`. Chave ausente é pulada. Duas linhas do lockup (`titulo: [l1, l2]`)
    viram UM bloco separado por espaço — é assim que a visão as transcreve.
    """
    saida = []
    for chave in chaves:
        v = item.get(chave)
        if v is None:
            continue
        if isinstance(v, dict):
            v = v.get('txt')
        if isinstance(v, (list, tuple)):
            partes = []
            for x in v:
                if isinstance(x, dict):
                    x = x.get('txt')
                x = limpar(x)
                if x:
                    partes.append(x)
            if not partes:
                continue
            # Lockup de duas linhas é um bloco só; lista de itens, vários.
            if chave in ('titulo', 'manchete', 'lockup', 'headline'):
                saida.append(' '.join(partes))
            else:
                saida.extend(partes)
            continue
        t = limpar(v)
        if t:
            saida.append(t)
    return saida


def escrever_entrega(itens, pasta='.', nome='entrega.json'):
    """Grava o `entrega.json`. Recusa item sem `arquivo` e avisa arquivo que não existe."""
    limpos = []
    for it in itens:
        if not it.get('arquivo'):
            raise SystemExit(f'_entrega: item sem arquivo: {it}')
        registro = {'arquivo': it['arquivo']}
        if 'textos' in it and it['textos'] is not None:
            registro['textos'] = [t for t in (limpar(x) for x in it['textos']) if t]
        for extra in ('quando', 'tema', 'itemId'):
            if it.get(extra):
                registro[extra] = it[extra]
        limpos.append(registro)
    caminho = os.path.join(pasta, nome)
    with open(caminho, 'w', encoding='utf-8') as f:
        json.dump(limpos, f, ensure_ascii=False, indent=1)
    faltam = [r['arquivo'] for r in limpos if not os.path.exists(os.path.join(pasta, r['arquivo']))]
    com_textos = sum(1 for r in limpos if r.get('textos'))
    print(f'  {nome}  ({len(limpos)} artes, {com_textos} com textos'
          + (f', {len(faltam)} render(s) ainda não existe(m)' if faltam else '') + ')')
    return caminho
