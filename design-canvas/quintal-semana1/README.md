# O Quintal Parrilla — Semana 1 (31/08 a 06/09/2026)

18 stories novos por canvas de design (zero crédito de imagem), mais a revisão
dos 3 carrosséis de feed que já existiam. Tudo **rascunho** na agenda.

## A semana fechada

| Dia | 08h | 2º slot | 3º slot | Feed |
|---|---|---|---|---|
| seg 31/08 | funcionamento* | 09h executivo* | 13h avaliação (agendado)* | — |
| ter 01/09 | funcionamento | 09h30 executivo | 14h happy hour | — |
| qua 02/09 | funcionamento | 10h executivo | 14h happy hour | 11h polvo |
| qui 03/09 | funcionamento | 09h30 executivo | 14h30 happy hour | — |
| sex 04/09 | funcionamento | 09h executivo | 14h happy hour | 12h happy hour |
| sáb 05/09 | funcionamento | 11h picanha | 12h tábua | — |
| dom 06/09 | funcionamento | 11h resenha | 12h pão na brasa | 10h domingo |

`*` já existia antes desta leva. Total: 21 stories + 3 carrosséis.

A grade sai de "Padrões de Postagem — O Quintal Parrilla": 08h todo dia,
executivo seg–sex entre 9h e 10h, happy hour ter–sex entre 14h e 14h30, e o
restante em slots livres (1 na segunda, 2 no sábado e 2 no domingo) — 3 por dia.

## Como rodar

```bash
python3 gerar.py                 # slots.json -> 18 artboards .dc.html
python3 render.py *.dc.html      # Chrome headless -> render/*.png (1080x1920)
```

O gerador veio de `semana-quintal` (mesma grade, mesmos 5 layouts aprovados).
Duas mudanças: o **layout é declarado slot a slot** em vez de derivado do tema
(o DNA exige arranjo diferente da peça anterior, e a tabela por tema era cega ao
que vinha antes), e o `PROPS` ganhou **`$preview` 1080x1920** — o `render.py`
lê a altura dali e sem isso cortaria todo story em 1350, em silêncio.

L5 ficou de fora: ele empilha as linhas de serviço logo abaixo da manchete, e a
regra da casa manda endereço e horário no **rodapé**.

## Armadilhas encontradas nesta leva

- 🔴 **Foto do acervo com PREÇO legível.** Duas fotos de almoço executivo
  (`2026-cmt07071` e `2025-cmt09690`) foram fotografadas sobre a carta de vinhos
  manuscrita da casa: "Grand Reserva R$239" e "R$234" saem nítidos no rodapé da
  peça. O DNA proíbe preço em qualquer peça, e a descrição do catálogo não
  menciona nada disso. **Toda foto de prato precisa de olho no que está embaixo
  do prato.** Um terceiro caso (`2025-cmt09042`) tem o cardápio inteiro com
  preços como jogo americano.
- 🔴 **Marca de terceiro no acervo.** Quatro fotos reprovadas por isso:
  copo Patagonia em primeiro plano, placa Patagonia ao fundo, guarda-sóis
  Patagonia, tonéis Patagonia na fachada do Puxadinho. Mais a fachada "RIVIERA"
  (vizinho) dominando o topo e uma garrafa rotulada erguida pelo bartender.
- **Sequências quase idênticas.** `img_3746`/`img_3747` e `00_004`/`00_005` são
  pares da mesma sessão: escolher as duas põe a mesma cena em dois dias da
  semana. Conferir o número do arquivo antes de fechar a seleção.
- **Rosto de criança em primeiro plano** (`Dia dos Pais-cmt07141`): o DNA pede
  autorização para cliente identificável em primeiro plano, e não há como
  conferir isso daqui. Ficou de fora.

## Revisão dos 3 carrosséis de feed

- **qua 02/09 — polvo**: os slides 4 e 5 trocaram de lugar. A legenda promete
  "terminando no quintal aceso", e o quintal aceso era o slide 4; agora fecha
  mesmo. Legenda intocada.
- **sex 04/09 — happy hour**: o slide 4 (segundo bartender, redundante com o 2)
  virou **torresmo com limão**. A cadência do feed diz que happy hour sozinho
  roda 0,87 e que com um prato nomeado junto chegou a 2,11 — a peça não tinha
  prato nenhum. Legenda atualizada para nomear o torresmo, na ordem dos slides.
- **dom 06/09 — domingo**: movido de **sáb 05/09 10h para dom 06/09 10h**
  (o conserto pedido). A sobremesa genérica virou **brownie com sorvete**, que é
  o que está na foto e é da carta geral. Confirmado que não é o pastel doce do
  executivo, que não poderia aparecer em peça de domingo.

## Regras da casa respeitadas

- Sem preço, sem travessão, sem emoji, no máximo duas exclamações (as peças têm zero).
- Horário sempre em numerais, e o do próprio dia: seg 11h–16h, ter–sáb 11h–00h,
  dom 11h–17h.
- Happy hour só ter–sex; nenhuma peça noturna em domingo.
- Executivo só seg–sex, e só ele usa prato redondo montado. Sábado e domingo
  aparecem em tábua, porção ou mesa posta.
- Endereço e horário no rodapé, com o título na parte de cima.
- Domani e Amithen em Title Case, nunca caixa alta contínua.
- CTAs, quando entram, saem da lista fechada de oito.
- 18 fotos, nenhuma repetida na semana e nenhuma repetindo os carrosséis de
  feed. Todas registradas com `marcar-foto-como-usada` na data da peça.

## O véu virou HALO (01/09/2026)

Pedido do Ciro depois de reprovar o véu duas vezes no By Rock ("o véu ficou
muito marcado"). O véu escurecia uma faixa inteira — 880 a 1120px de altura por
1080 de largura — para dar contraste onde a letra cai. O halo escurece só a
área do bloco de texto e desmancha nas bordas, com `filter: blur()` na própria
caixa (**nunca** `backdrop-filter`, que desfocaria a fotografia atrás).

Medido nas 12 peças em rascunho, contra o estado anterior:

| | véu | halo |
|---|---|---|
| luminância da peça | — | **+13,2%** |
| saturação da peça | — | **+10,8%** |
| pior erro no alvo de leitura | +20 | **+6** |

O halo ganha nos dois eixos ao mesmo tempo. Nas zonas de tinta CREME ele para
no alvo (139) enquanto o véu ia até 55–106, ou seja escurecia muito além do
necessário; nas zonas de tinta VERDE ele chega a 51–69 onde o véu ficava em
80–89, acima do que a própria letra aguenta.

```bash
python3 gerar.py                 # sonda a geometria, resolve a tinta, afere e reescreve
python3 render.py *.dc.html      # -> render/
python3 medir.py                 # confere cada linha contra o alvo da própria cor
MODO=veu SOMBRA=0 python3 gerar.py   # reproduz o estado anterior (o "antes" de render-antes/)
```

Arquivos novos: `halo_quintal.py` (calibragem), `sonda.py` (geometria no Chrome),
`medir.py` (conferência). O compartilhado é `../_halo.py`.

### O que este cliente exigiu de diferente do By Rock

- 🔴 **O alvo de leitura é POR COR DE TINTA.** O Quintal escreve em creme
  #F5F0E8 (luz 240) e verde #7A9A5C (luz **143**) — e o critério único da casa
  ("p98 do fundo abaixo de 150") permite fundo *mais claro que a própria letra
  verde*. Um halo calibrado pelo creme deixava "Parrilla" (sobre farofa) e
  "Pede Chope" (sobre tijolo) legíveis no papel e invisíveis na peça. O alvo
  sai de `_halo.alvo_por_contraste` (WCAG 3:1): creme 139, verde 69.
- 🔴 **A margem é 1,4 × raio, não os 62/46 do By Rock.** Com a margem curta o
  texto fica na rampa do blur, não no platô: 8 grupos batiam no teto de tinta
  *e* a mancha aparecia. Ver a tabela medida em `halo_quintal.py`.
- 🔴 **O halo é camada IRMÃ, não filho do bloco de texto.** A armadilha 4.1
  exige cada linha como item direto do flex; embrulhar desfaria isso. A caixa
  vem medida no Chrome (`sonda.py`) em vez de dada por `fit-content`.
- **O texto ganhou sombra presa ao glifo**, que o Quintal nunca teve — e é
  parte da razão pela qual o véu precisava ser tão pesado. Ela entra como
  folga, não como desconto: os alvos do halo não foram afrouxados por causa
  dela. `SOMBRA=0` compara.
- ⚠️ **`Sab1100`/rodapé fica no teto de tinta**: o verde sobre farofa amarela
  é o limite do que o mecanismo alcança. É sinal de curadoria (essa foto não
  carrega essa linha nessa posição), não defeito silencioso.
