import json, os, sys
sys.path.insert(0, os.getcwd())
import medir_halos
from _halo import luz_de_leitura

# 🔴 slots.json, nao mapa.json: as pecas com `fora: true` (as capas-arte de
# carrossel) NAO entram no mapa, mas o gerador escreve o arquivo delas. Medindo
# so o mapa, essas duas sairiam sem halo nenhum — sem veu e sem halo — e o
# defeito seria invisivel, porque elas tambem nao entram no canvas.
dados = json.load(open('slots.json', encoding='utf-8'))['pecas']
arqs = [f"{p['arq']}.dc.html" for p in dados]
fotos = {f"{p['arq']}.dc.html": p['foto'] for p in dados}
alturas = {f"{p['arq']}.dc.html": (1350 if p['layout'] == 'capa' else 1920) for p in dados}

rects = medir_halos.geometria(arqs)
# 🔴 A luz e medida no RETANGULO DO BLOCO, sem o inset. Medindo a area
# alargada, o entorno (mais escuro que o texto, quase sempre) puxa a media para
# baixo e a tinta sai fraca justamente onde a letra cai. Medido no
# TerFuncionamento: a area com inset dizia 62,1 e o retangulo do texto, 80,5 —
# o bloco caiu abaixo do alvo, nao ganhou halo nenhum, e a manchete ficou sobre
# uma faixa de 80. O inset continua valendo para a GEOMETRIA (e o tamanho da
# caixa que define o teto do raio); so a LUZ vem do retangulo do texto.
saida = {}
for a in arqs:
    H = alturas[a]
    m = {}
    for chave, (x, y, w, h) in rects.get(a, {}).items():
        media, p75 = medir_halos.luz_da_regiao(fotos[a], x, y, w, h, 1080, H)
        m[chave] = round(luz_de_leitura(media, p75), 1)
        m[f'{chave}Media'] = round(media, 1)
        m[f'_{chave}'] = [x, y, w, h]
    saida[a] = m
json.dump(saida, open('halos.json','w',encoding='utf-8'), indent=1, ensure_ascii=False)
for a in arqs:
    m = saida[a]
    r = ' '.join(f"{k}={m[k]:>5.1f}({m['_'+k][3]:>3}px alto)" for k in ('bloco','pe','logo') if k in m)
    print(f"{a[:-8]:20} {r}")
