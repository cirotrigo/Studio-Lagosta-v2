# Espeto Gaúcho — Semana 1 (31/08 a 06/09/2026)

22 peças novas produzidas por canvas de design (zero crédito de imagem), na
galeria de Criativos e na agenda como **rascunho**.

## O que tem aqui

| Bloco | Peças | Tamanho |
|---|---|---|
| Stories da grade (3/dia) | 20 | 1080x1920 |
| Feed de sexta — rodízio | 7 slides | 1080x1350 |
| Feed de sábado — família | 7 slides | 1080x1350 |

O 3º post de feed da semana (prova social, ter 01/09 19h) e o story de domingo
20h já estavam agendados antes desta leva.

## Como rodar

```bash
python3 gerar.py                 # slots.json -> 34 artboards .dc.html + canvas.json
python3 render.py *.dc.html      # Chrome headless -> render/*.png
python3 contato.py               # folhas de contato para revisar a leva inteira
```

`gerar.py` avisa quando uma linha de headline não cabe na largura útil — ele
mede na PRÓPRIA Bevan, então o aviso é confiável.

## O que é novo em relação a espeto-carrosseis / espeto-avaliacoes

- **Layout de story em três arranjos** (`split` / `rodape` / `topo`). O DNA
  exige que a composição varie dentro da mesma leva; com um arranjo só, 20
  stories na mesma semana viram template repetido.
- **A marca segue a MESMA margem do texto no story** (cantos `story-*`),
  senão o selo fica desalinhado do badge e da assinatura.
- **`render.py` lê a altura do `$preview` do data-props**, porque esta leva tem
  dois tamanhos. Cravar 1350 cortaria todos os stories pela metade, em silêncio.

## Margem do story: 268 → 190/120 → 90/90 (30/08/2026)

A leva nasceu com 268px em cima e embaixo — 1/8 de 1920, a faixa que o
Instagram ocupa. O Ciro reprovou **13 peças** pedindo `190px` no topo e `120px`
no rodapé; ao ver o resultado, pediu menos ainda, e escolheu **90/90** num
comparativo lado a lado das quatro variantes. É a mesma margem da lateral:
moldura uniforme nas quatro bordas.

As margens são configuráveis por ambiente, justamente para comparar antes de
gerar a leva:

```bash
MARGEM_TOPO=120 MARGEM_RODAPE=90 python3 gerar.py
```

**Consequência conhecida e aceita:** 90px é bem menos que a faixa do Instagram.
No rodapé a assinatura fica perto do "Enviar mensagem"; no topo-direito o selo
divide espaço com o "X" de fechar. A decisão foi tomada vendo a peça renderizada.

**Antes de gerar a leva inteira, aprove uma amostra com o Ciro.** O ciclo caro
não é o render: é subir 20 artes e trocá-las post a post na agenda.

## Ajustes de véu que a revisão pediu (e por quê)

- **Peças de funcionamento**: o véu de topo a 0.84 apagava a metade de cima da
  foto. O DNA quer fotografia em 85-90% e mandar reduzir o gradiente em foto já
  escura — a da fachada noturna foi a 0.52, as demais a ~0.70.
- **Peças de arranjo `topo`**: a marca fica no rodapé direito e sumia sobre
  fundo claro (o amarelo do escorregador, a bandeja do marmitex, o chopp).
  O véu de rodapé subiu de 0.28 para ~0.46-0.50 só para dar chão à marca.

## Revisão de 30/08 (2ª rodada): o que mudou e por quê

- **Foto de rodízio não pode mostrar picanha bovina** — ela NÃO está no rodízio
  (alcatra, picanha suína e costela no bafo). Reprovou a capa do carrossel e o
  story de sexta 11h. Cuidado: boa parte da pasta `Rodizio Sexta` é catalogada
  como "picanha".
- **Marmitex sem preço**, falando das marmitex em geral. A terça passou a ter
  uma peça com preço, não duas.
- **Capa do carrossel de família virou foto PURA** (layout `foto`: sem véu, sem
  texto, sem marca). O texto começa no slide 2.
- **Fotos internas do carrossel alternadas**: cena → close → produto → produto →
  guarnição → bebida → pessoas.
- **Slide do chopp com o texto no topo**, para a caneca aparecer inteira.
- **Pré-título comunica com o título, não repete palavra.**
- **`desc` aceita lista** — uma linha por item — para não sobrar palavra órfã.
- **Texto longe do rosto da criança**: a peça da área kids foi para o rodapé.

## Do véu para o HALO (01/09/2026)

A leitura do texto sobre a foto deixou de ser um **véu** (gradiente cobrindo a
faixa inteira do topo ou do rodapé) e passou a ser um **halo**: uma caixa escura
atrás do bloco de texto, com `filter: blur()` nela mesma, que desmancha nas
bordas e escurece só onde a letra cai.

🔴 É `filter: blur()` na PRÓPRIA caixa, nunca `backdrop-filter: blur()`.
`backdrop-filter` desfocaria a FOTOGRAFIA atrás (lente fora de foco, que
descaracteriza a foto); `filter` desmancha só a mancha e deixa a foto nítida
por baixo.

Isto responde a quatro reprovações do Ciro em 30/08, todas sobre o mesmo ponto:
*"o véu está muito forte, está escondendo a foto, ele precisa ser sutil apenas
para dar um leve contraste no texto"* e *"a foto de fundo precisa ser destaque e
aparecer mais"*.

### O que foi medido (7 peças, véu × halo, mesma foto e mesmo texto)

| | véu | halo |
|---|---:|---:|
| luminância média do quadro | 63,3 | **90,1** (+42%) |
| croma CIELAB (a foto original tem 13,8) | 9,6 | **13,1** |
| desvio de cor até a foto original | 7,0 | **1,4** (−80%) |
| tinta que chega onde a letra cai | 0,69 | 0,32 |

O véu perdia **30% da cor** da fotografia; o halo entrega a foto a 5% do
original. E entrega isso gastando menos da metade da tinta sobre o texto,
porque a tinta passou a ser calculada em vez de arbitrada.

⚠️ **Não use saturação HSV para avaliar isto.** O véu do Espeto é um marrom
saturado (`rgb(23 14 9)`): compor um pixel acinzentado em direção a ele AUMENTA
a saturação HSV. Pelo HSV o véu "ganha" 2,4% — enquanto as bandejas de marmitex
e a piscina de bolinhas estão visivelmente mortas. Quem responde a pergunta
certa é a distância até a foto original, em CIELAB (`medir_cor.py`).

### Como a tinta é decidida

Não por um número herdado, e sim pela física do contraste, em três passos:

1. **A sonda do Chrome mede o retângulo real de cada bloco** (`medir_geometria`).
   O bloco do Espeto tem altura variável — a descrição aceita lista, o título
   quebra sozinho, o arranjo muda por peça — e nenhuma conta analítica acerta.
2. **A luz é lida por PERCENTIL (p88), não por média.** Foto de churrasco tem
   brilho especular forte — lâmina de faca, gordura, prato branco — sobre fundo
   escuro. A média diz "região escura" e a letra cai justamente no reflexo.
3. **A tinta sai da conta de contraste**: o fundo precisa ficar abaixo de um
   certo brilho para o texto ler, então
   `alfa = (L_medido − L_alvo) / (L_medido − L_tinta)`. Quando a foto já é
   escura o bastante, **alfa = 0 e a peça não recebe mancha nenhuma** — na leva
   inteira isso acontece em 6 dos 43 blocos.

O `L_alvo` sai das cores e dos tamanhos de texto do próprio bloco, lidos do
HTML: branco 88px pede fundo ≤ 149, branco 38px ≤ 119, amarelo 36px ≤ 88.

### 🔴 O vermelho da marca não é servido pelo halo

`#F4301A` tem luminância relativa **0,214** contra 1,0 do branco. No mesmo fundo
onde o branco tem 5,5:1 de contraste, o vermelho tem **1,38:1** — some. Ele
exigiria fundo ≤ 51, o que devolveria a peça ao véu.

E ele mora sempre na ÚLTIMA linha do bloco (a assinatura manuscrita), que é
justamente onde a gaussiana do halo já caiu para ~47% da tinta. Quem resolve por
ele é `SOMBRA_BAIXA_LUM`: sombra presa ao GLIFO, que custa zero pixel de
fotografia. **Não tente resolver o vermelho com mais halo.**

Pela mesma razão a marca ganhou `drop-shadow` encadeado (contorno que segue a
silhueta do PNG) e um halo fraco (`ESCALA_MARCA = 0.34`): com o halo fazendo o
trabalho sozinho ela virava um disco escuro VISÍVEL sobre fundo claro e liso —
o escorregador amarelo da área kids e o balcão branco do rodízio.

### Os dois modos, e a guarda

```bash
python3 gerar.py                 # halo — o padrão, para a próxima leva
MODO=veu python3 gerar.py        # reproduz o que está no ar, byte a byte
SO=Ter18Marmitex python3 gerar.py   # regera só algumas peças
DIAG=1 python3 gerar.py          # imprime a tinta e o alvo de cada bloco
```

**`MODO=veu` reproduz os 34 artboards publicados byte a byte** — é a prova
barata de que o caminho antigo não mudou, e foi ela que pegou dois defeitos
durante esta troca (o wrapper do halo vazando para o modo véu, e um `; ` órfão
no CSS).

⚠️ **A semana 1 está NO AR** (em 01/09: 4 stories publicados, 12 agendados,
7 rascunhos). Por isso `gerar.py` em modo halo **se recusa a sobrescrever** os
artboards de véu sem `CONFIRMAR=1`. Os `.dc.html` desta pasta são o registro do
que foi ao Instagram; a troca tem de ser uma decisão, não um efeito colateral de
rodar o gerador.

### Armadilhas medidas nesta troca

- 🔴 **A sonda de geometria precisa esperar as IMAGENS, não só as fontes.**
  `document.fonts.ready` não espera `<img>`, e o lockup da marca não tem altura
  declarada: antes de carregar ele mede **0px de altura**. É uma corrida —
  apareceu como `Dom15Misto marca 172x0` enquanto a peça ao lado, na mesma
  rodada, media 172x150. Hoje a sonda espera as duas coisas e um retângulo
  degenerado derruba a geração.
- 🔴 **O alvo da compensação é a LINHA, não o canto.** O canto de um bloco de
  texto é quase sempre espaço em branco. Mirando no canto, 41 dos 43 grupos
  saturavam no teto de opacidade e a calibragem pela foto simplesmente parava
  de existir — o bloco sobre madeira escura recebia a mesma tinta do bloco
  sobre o balcão branco, que é o véu de volta com outro nome. Centro no eixo X,
  borda no eixo Y.
- **Descrição, serviço, preço e item de lista não tinham sombra nenhuma** — o
  véu era todo o contraste deles. Trocar o mecanismo sem repor isso deixaria os
  níveis pequenos nus.
- **O halo se parte onde o ESPAÇADOR já partia a peça.** Uma mancha única
  cobrindo de cabeça a rodapé seria o véu outra vez.

## Regras da casa respeitadas nesta leva

- **Endereço e horário completo só na PRIMEIRA arte do dia**, no rodapé, com o
  título em cima (regra de 16/08). Nas outras peças o rodapé leva só a
  informação da própria oferta.
- **Teto de 2 peças com preço por dia.** Sexta bate o teto com o carrossel
  (R$ 89) mais o story das 11h (R$ 89) — por isso o story das 7h e o das 20h
  não levam valor, e o chopp do slide 6 do carrossel sai sem preço.
- **Preço sempre da entrada dona dele**: promoção com "a partir das 17h",
  rodízio como exclusivo de sexta no almoço, marmitex sem a marcação de 17h.
- **Nunca anunciar almoço de segunda a quinta** (a casa abre às 16h).
- **CTA de "deslizar" vetado** no feed (regra da cadência de 29/08): a interação
  aponta para o Direct.
- Corte em destaque não repete na semana: costela, maminha, coração, alcatra,
  picanha e espeto misto.
- 34 fotos do acervo, nenhuma repetida e nenhuma usada antes — todas
  registradas com `marcar-foto-como-usada` na data prevista de cada peça.
- **Marmitex (ter 18h)**: valor e CTA no rodapé, a pedido do Ciro — por isso
  ela é a única peça de oferta em arranjo `split`.
