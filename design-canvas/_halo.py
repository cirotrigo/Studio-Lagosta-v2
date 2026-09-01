# -*- coding: utf-8 -*-
"""HALO — a alternativa ao veu para dar leitura ao texto sobre foto.

Ideia do Ciro em 01/09/2026, depois de reprovar o veu duas vezes ("o veu ficou
muito marcado", "essa estrategia de usar o veu nao vai funcionar"). Extraido do
gerador do By Rock, onde foi desenhado, medido e aprovado.

O QUE MUDA
----------
O veu e um GRADIENTE SOBRE A FAIXA INTEIRA (classes `.veu-t` / `.veu-b`): para
dar contraste no ponto onde a letra cai, escurece centenas de pixels de foto. O
halo escurece APENAS a area do bloco de texto e desmancha nas bordas.

Medido na mesma peca, mesmo texto (By Rock s01, 01/09/2026):

    | mecanismo | luminancia media | saturacao media |
    |-----------|-----------------:|----------------:|
    | veu       |             94,7 |           116,7 |
    | halo      |            109,9 |           125,8 |

O halo devolve +16% de luz e +8% de cor a fotografia, que e a protagonista pelo
DNA de todas as marcas da carteira.

🔴 E `filter: blur()` na PROPRIA caixa, nao `backdrop-filter: blur()`.
A distincao e do Ciro e e o coracao da ideia: `backdrop-filter` desfocaria a
FOTOGRAFIA atras (lente fora de foco, que descaracteriza a foto); `filter`
desmancha a mancha escura e deixa a foto intacta e nitida por baixo. Nao troque
um pelo outro achando que e equivalente.

COMO PORTAR PARA OUTRO GERADOR
------------------------------
🔴 NAO e substituir o `VEU_CSS`. A troca muda a GEOMETRIA: o veu e uma camada
de faixa posicionada no topo ou no rodape do quadro; o halo e um filho absoluto
do BLOCO DE TEXTO, com inset negativo. No By Rock foi preciso reestruturar
`bloco_texto`, `bloco_rodape` e `bloco_logo`.

Roteiro, na ordem em que os defeitos apareceram:

1. O bloco de texto vira `position: relative; width: fit-content`, com o halo
   como primeiro filho absoluto e cada linha em `position: relative; z-index: 1`.
   `fit-content` e o que faz a mancha ter a largura do TEXTO, nao da coluna.
2. TODO elemento que dependia do veu precisa do proprio halo — inclusive a
   LOGO. No By Rock a marca quase sumiu sobre prato branco: o radial fraco que
   ela tinha atras fora calibrado para conviver COM o veu.
3. Calibre cada halo pela luz do TERCO onde ele pousa, nao pela media da faixa.
   Medido no s07: a faixa grande dizia 180-239 e o rodape real era 46-70 — o
   halo saia 3x mais escuro que o necessario, que e o "muito marcado" que este
   mecanismo veio corrigir.
4. Confira o HTML gerado com `conferir_divs`. HTML desbalanceado NAO da erro: o
   parser fecha as tags sozinho e aninha o que vem depois. Foi assim que a logo
   foi parar dentro do slot do servico, com o CSS correto e o layout errado.
5. Olhe a peca renderizada. Os quatro defeitos acima passaram por typecheck,
   por lint e pelo conferidor da marca — quem os pegou foi o olho e uma sonda
   de geometria no Chrome.

⚠️ Leva JA PUBLICADA nao se regera so para trocar o mecanismo: a arte esta no
ar ou agendada, e o ganho nao paga o risco de mexer no que ja foi aprovado.
Porte quando a leva for refeita por outro motivo.
"""


def op(luz, minimo, maximo):
    """Interpola entre `minimo` e `maximo` conforme o BRILHO MEDIDO da faixa.

    Veu (e halo) constante erra dos dois lados: sobra em faixa escura, tampando
    foto sem precisar, e falta em faixa clara, deixando o texto sumir.
    """
    t = (max(50.0, min(210.0, luz)) - 50.0) / 160.0
    return minimo + t * (maximo - minimo)


def halo(luz, escala=1.0):
    """O CSS da mancha, calibrado pela luz da regiao onde o texto pousa.

    `escala` ajusta por papel: o servico pede um pouco mais (1,05) porque cai
    sobre prato claro com frequencia, e a marca pede menos (0,72) porque so
    precisa de assentamento, nao de disco.

    O raio e GRANDE de proposito (124-158px): com 46-62 ainda se enxergava onde
    a caixa comecava. A opacidade sobe junto porque o blur dilui — espalhar a
    mesma tinta por area maior clareia o centro, que e onde a letra cai.
    Aumentar o raio sem compensar a tinta troca "marcacao visivel" por "texto
    sem contraste", os dois defeitos que este halo existe para resolver ao
    mesmo tempo.
    """
    a = min(op(luz, 0.62, 0.97) * escala, 0.95)
    raio = int(op(luz, 124, 158))
    return (f'background: rgba(17,17,17,{round(a, 3)}); '
            f'filter: blur({raio}px); border-radius: {raio + 60}px;')


def envolver(conteudo_html, halo_css, inset_x=54, inset_y=44):
    """Embrulha um bloco com o halo atras. Devolve o HTML pronto.

    Cada filho vai para `position: relative; z-index: 1` — sem isso o halo,
    que e absoluto, cobre o proprio texto que deveria destacar.
    """
    if not halo_css:
        return conteudo_html
    marca = (f'<div style="position: absolute; left: -{inset_x}px; '
             f'right: -{inset_x}px; top: -{inset_y}px; bottom: -{inset_y}px; '
             f'z-index: 0; pointer-events: none; {halo_css}"></div>')
    return ('<div style="position: relative; width: fit-content;">'
            + marca
            + f'<div style="position: relative; z-index: 1;">{conteudo_html}</div>'
            + '</div>')


def conferir_divs(html, quem):
    """Recusa artboard com <div> desbalanceado.

    🔴 Existe porque HTML malformado NAO da erro: o navegador fecha as tags
    sozinho, aninhando o que vier depois, e a peca sai renderizada e errada sem
    uma linha de aviso. Em 01/09/2026 um `</div>` faltando no bloco de servico
    pos a logo DENTRO do slot dele — o CSS estava correto, o layout nao, e so
    uma sonda de geometria no Chrome achou.
    """
    import re
    abre = len(re.findall(r"<div\b", html))
    fecha = html.count("</div>")
    if abre != fecha:
        raise SystemExit(f"{quem}: <div> desbalanceado — {abre} abrem, {fecha} fecham")
