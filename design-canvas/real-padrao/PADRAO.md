# Real Gelateria — padrão de design de canvas (projeto 1)

Definido em 29/08/2026 para a produção da cadência nova (começa segunda
31/08). Fontes de verdade, na ordem de prioridade:

1. **Manual do designer** (`manual-designer.png`, `Project.brandManualUrl`) —
   prioridade ABSOLUTA: logomarca, versão selo, paleta com hex, tipografia,
   elementos visuais e o selo promocional.
2. **17 artes aprovadas, lidas uma a uma**: as 6 referências de estilo do
   próprio designer (`Generation.styleRefAt`, Arte Enviada 11/08), 6 artes de
   IA com veredito "gostei" na bancada (16→28/08), e 5 publicadas conferidas
   (funcionamento de segunda e de sábado, story da Quarta do Crepe, capa de
   carrossel, template antigo).
3. **DNA da marca** (`BrandDNA` projeto 1) — regras aprendidas na prática, e o
   crivo. Onde o DNA fixa uma regra que as peças antigas variavam (caixa da
   headline, canto da logo), **o DNA vence**: ele é mais novo que as peças.

---

## 1. Paleta (hex do manual; o BrandColor diverge em 2)

| cor | hex (manual) | uso | nunca |
|---|---|---|---|
| Verde Real | `#283D36` | fundo editorial, TINTA DO VÉU, texto sobre claro | misturar com preto puro; sob texto longo pequeno sem véu |
| Crema | `#F3EADC` | **a cor única de headline sobre foto e sobre verde**; fundo claro padrão | texto sobre Menta (contraste insuficiente) |
| Menta Gelato | `#CFE5D6` | a SEGUNDA VOZ da headline (palavra-chave), rótulos, ícones, texto grande sobre verde | corpo pequeno sobre verde |
| Cioccolato | `#B78566` | linha separadora, micro-acentos | — |
| Spritz | `#EA5328` | valor de oferta ("50% OFF"), sublinhas finas | fundo amplo, texto corrido |
| Dourado Real | gradiente `#8C6A3F → #D9B98A` | SELO R e no máx UMA palavra de headline | parágrafo, fundo, duas palavras da mesma headline |

⚠️ O `BrandColor` do Studio registra Menta `#D7E2D2` e Crema `#F6F0E4`; o
manual diz `#cfe5d6` e `#f3eadc`. O canvas usa **o manual** (prioridade
absoluta). Não "corrigir" um pelo outro sem decisão do Ciro.

A proteção de leitura é SEMPRE tingida de Verde Real — `rgb(40 61 54 / α)` —
nunca preta: "a sombra mais funda tende ao Verde Real" (DNA, color grading).
Vale para o halo (§ 4), que é o mecanismo em uso desde 01/09/2026.

## 2. Assinatura tipográfica

Duas famílias, oito arquivos em `CustomFont` (baixados em `fonts/`):

- **Branley GC** — UM peso só (Regular 400). É a voz display: serifada
  delicada, traço fino, contraste alto, ar de revista italiana.
- **Stage Grotesk** — Thin 100 → Black 900 (7 pesos). É a voz de apoio:
  pré-título, apoio, rótulo, serviço, letra miúda.

| voz | fonte/peso | corpo @1080 | caixa | tracking | cor |
|---|---|---|---|---|---|
| Pré-título | Stage Grotesk Medium (500) | 28px | **CAPS — o ÚNICO caps da peça** | 0.24em (largo) | Menta |
| Headline | Branley 400 | story 84–110px · feed 80–92px | **Title Case ou caixa de frase — NUNCA caixa alta** | 0 (natural da fonte) | Crema; palavra-chave em Menta |
| Apoio | Stage Grotesk Regular/Light | 32–36px, lh 1.32 | frase normal | 0.015em | Crema |
| Rótulo ("Funcionamento") | Stage Grotesk Medium | 36px | Title Case | 0.03em | Menta |
| Serviço | Stage Grotesk Regular | 31px, lh 1.25 | frase normal | 0.02em | Crema; estado em Menta |
| Letra miúda | Stage Grotesk Regular | 26px | frase normal | 0.02em | Crema 92% |
| Valor de oferta | Stage Grotesk **Bold** | mesmo corpo do apoio | como escrito | 0 | **Spritz** |

Números que seguram a elegância (medidos nas artes do designer, 1152×2048,
normalizados para 1080):

- **Cada linha da headline ocupa ~4,5–5,5% da altura do quadro; o lockup
  inteiro fica em ≤ 11%.** A sofisticação vem do corpo contido e do respiro,
  nunca de tamanho ou peso.
- **Entrelinha da headline 1.04** (a Branley tem hastes longas; mais justo
  que isso as ascendentes tocam a linha de cima).
- **As DUAS VOZES da headline são COR, não fonte**: tudo Branley; uma linha
  em Crema e a palavra-chave (ou a segunda linha) em Menta. É como o designer
  marca "Real!", "Fechado", "sabores". Dourado em texto: no máximo UMA
  palavra, e só em pauta que peça brilho (o normal é o dourado ficar SÓ no
  selo).
- **Caixa alta é EXCLUSIVA do pré-título pequeno** (queixa mais repetida do
  cliente: headline em caps "não é a fonte da marca" — 4x entre 11 e 13/08).
  Title Case escrito NO SLOT, nunca `.upper()` no código.
- Tracking da headline: o natural da Branley (0). Tracking largo é do
  pré-título caps (0.24em) — lição do TERO: espaçamento por instrução em
  display varia a cada peça; só o natural é consistente.

## 3. Formatos e margens (px reais)

| formato | tamanho | topo | rodapé | laterais |
|---|---|---|---|---|
| STORY | 1080×1920 | **250** | **350** | 96 |
| FEED (capa) | 1080×1350 | 88 | 96 | 96 |

- A safezone do story é do DNA (250/350) — é a faixa que o Instagram cobre.
  Informação CRÍTICA nunca ali; o selo R pode subir até y≈120 (é marca,
  não informação — prática de todas as peças aprovadas).
- **Feed e quadrado NÃO têm faixa reservada** — margem ali é só respiro.
- Bloco de texto: rodapé por padrão (a foto respira no topo) ou topo
  (variante); **nunca sobre o centro do produto** — o herói da foto fica
  sempre à vista.

## 4. Halo (proteção de leitura que não mata as cores)

**Desde 01/09/2026 o mecanismo é o HALO, não o véu.** O véu é um gradiente
sobre a faixa inteira: para dar contraste onde a letra cai, escurece centenas
de pixels de fotografia. O halo é uma caixa de cor **atrás do bloco de texto**,
com `filter: blur()` **nela mesma**, que desmancha nas bordas.

🔴 É `filter: blur()` na PRÓPRIA caixa, nunca `backdrop-filter: blur()`.
`backdrop-filter` desfocaria a FOTOGRAFIA atrás (lente fora de foco, que
descaracteriza a foto); `filter` desmancha só a mancha e deixa a foto nítida
por baixo. Mecanismo compartilhado, documentado em `design-canvas/_halo.py`.

- **Tinta: Verde Real, nunca preto** (item 3 do que NUNCA fazer). O halo do By
  Rock nasceu `#111` porque lá a marca é preta e vermelha. Portar a geometria
  sem portar a tinta quebraria o DNA — e a tinta é justamente o que faz o halo
  ser MAIS suave aqui do que lá: Verde Real tem luminância 54 contra 17 do
  preto, então a mesma opacidade produz uma mancha bem menos densa.
- **A fórmula vive só no CSS** (classe `.halo` com `var(--halo)` e
  `var(--halo-raio)`) — armadilha 4.3. O `.dc.html` carrega só números, e o
  slider `halo` do canvas continua ajustando peça a peça.
- **Opacidade e raio saem da luz MEDIDA** sob o bloco: α 0,62→0,97 e raio
  124→158px para luz 50→210. Raio grande de propósito: com raio pequeno ainda
  se enxerga onde a caixa começa. A tinta sobe junto porque o blur dilui.

### 4.1 A premissa de que o halo não serviria aqui foi MEDIDA e não se confirmou

O receio era que a Real fotografa claro (gelato, vitrine, pastel) e o halo
saturasse em 0,95, virando mancha. Medido nas **22 fotos da semana 1**, na
janela onde o texto de fato cai: mediana **111,8**, mínimo 83,8, máximo 172,6 —
α de 0,69 a 0,89, **nunca no teto**. A razão é geométrica: o texto pousa na
faixa de baixo, que nestas fotos é o balcão, a mesa, as mãos e o chão. O claro
da marca é o herói, e o herói fica ACIMA.

Ganho medido nas duas peças-base (mesma foto, mesma copy, só o mecanismo muda):

| peça | luminância | saturação | foto entregue INTACTA |
|---|---|---|---|
| STORY véu | 118,5 | 89,4 | 26,6% |
| STORY halo | **141,4** (+19,4%) | **109,1** (+22,1%) | **61,0%** |
| FEED véu | 115,6 | 86,8 | 31,5% |
| FEED halo | **122,3** (+5,8%) | **96,6** (+11,3%) | **56,7%** |

"Intacta" = fração do quadro cuja luminância não muda (Δ < 5) em relação à peça
sem proteção nenhuma. É a medida que interessa ao DNA: quanto da fotografia
chega ao leitor como o fotógrafo entregou.

### 4.2 A janela de medição tem X, não só Y

🔴 Calibrar pela largura INTEIRA do quadro é o defeito nº 3 do roteiro do By
Rock, e ele se repetiu aqui: na capa de feed os 457px à direita do bloco
carregam o fundo escuro **e** o selo promocional branco, e a média deles não
diz nada sobre onde a letra cai. Medindo a caixa real (sonda de
`getBoundingClientRect` no Chrome), o α da capa subiu de 0,824 para 0,924 e a
letra miúda obrigatória saiu de 3,5:1 para 5,5:1, **sem tocar na foto do lado
de fora**. As caixas medidas estão em `JANELA` no `gerar.py`; copy muito
diferente pede sonda nova.

### 4.3 O inset ESCALA com o raio

A borda da caixa é o ponto de ~50% do desfoque: com inset fixo, a última linha
do bloco cai na queda e perde contraste. Meio raio (`inset += raio // 2`) põe o
bloco inteiro no miolo denso. Contraste final, todas as linhas acima do piso
WCAG (3,0 texto grande · 4,5 texto pequeno):

| linha | antes | depois |
|---|---|---|
| headline da capa | 4,0:1 | 6,0:1 |
| apoio | 5,1:1 | 7,3:1 |
| letra miúda 26px (piso 4,5) | **3,6:1** | **5,5:1** |
| bloco do story | 6,1:1 | 7,0:1 |

### 4.4 Tudo que dependia do véu precisa do próprio halo

Defeito nº 2 do roteiro, e aconteceu nas duas marcas:

- **O selo R quase sumiu.** Ele tinha só um `drop-shadow`, calibrado para
  conviver COM o véu do topo; sem o véu, a marca dourada pousa no teto claro do
  shopping. Ganhou halo próprio na escala de assentamento (0,72) — a marca
  precisa assentar, não de disco —, medido no canto REAL onde ela cai.
- 🔴 **O selo promocional saiu acinzentado**: o halo viaja DENTRO da coluna de
  texto, que vem DEPOIS dos absolutos no DOM, e pintava por cima do disco
  branco. Com o véu isso não acontecia (o véu era irmão anterior). Os dois
  selos agora têm `z-index: 5`. **Absoluto novo na peça precisa do mesmo.**

### 4.5 As duas alternativas testadas e recusadas

Ficam em `MODO=campo` e `MODO=halocrema`, com a medição que as derrubou:

- **Campo sólido de Verde Real** — é o que o designer faz: medido em
  `refs/ref-designer-quarta-experiencia.jpg`, a faixa de baixo chega a
  rgb(41,49,40) com desvio-padrão 1,3 (Verde Real CHAPADO, não véu de 0,72),
  com ~145px de transição e a foto acima 100% intacta. Lindo na capa de feed.
  **Recusado porque a borda é de altura FIXA e não sabe onde está o herói**:
  na foto da torta de pistacchio ela corta a sobremesa ao meio; na do
  expositor, esconde justamente o gelato. O designer escolhe a foto para o
  campo; o pipeline não escolhe.
- **Halo Crema com texto Verde Real** (a variante aprovada da marca,
  `ref-designer-dia-dos-pais.jpg`: campo Crema, "Feliz" em Verde Real, segunda
  voz em Dourado). 🔴 **Recusado porque a inversão precisa de CAMPO, não de
  halo**: claro sobre claro só funciona quando a tinta chega a sólido, e um
  halo desfocado nunca chega — "Começa Aqui!" ficou ilegível sobre a torta
  clara nas duas fotos de teste. A variante continua válida **como campo**,
  e continua não implementada.

## 5. Selo R e logos

- **A assinatura das peças é o SELO R DOURADO** (`selo-r.png`, logo id 1,
  "Ativo 3real.png" 400px) — 12 das 12 artes aprovadas o usam. O wordmark
  "Real / Il Vero Gelato" fica para papelaria/capa editorial, não para o
  canto do story.
- **Canto superior DIREITO, pequeno, não varia** (regra do Ciro 11/08/2026 no
  DNA). Story: 170px em y=120; feed: 150px em y=80. Absoluto no artboard
  (selo não se arrasta no editor — mesmo estatuto do fundo).
- Exceção de prática: com o BLOCO no topo, as peças "gostei" descem o selo
  para o canto inferior direito. Vale como fallback quando a foto tiver
  assunto no canto superior direito.
- Variantes que existem (em `logos/`): wordmark Crema (id 2) e Verde (id 4),
  selo Crema (id 42) e Verde (id 5). Selo verde só sobre fundo Crema sólido
  (peça editorial sem foto).

## 6. Ornamentos e ícones

- **Separador: UMA linha fina Cioccolato** (2px, ~120px) por peça, só quando
  a hierarquia pedir. A variante com losango central é de data comemorativa.
- **Ícones de serviço: traço fino DENTRO de círculo** (46px, stroke ~1.1 no
  viewBox 24, cor Menta): relógio (horário), sacola (Shopping Vitória),
  pino (Praia do Canto). Nunca preenchido, nunca emoji.
- **Selo promocional da Quarta do Crepe** (do manual): círculo BRANCO,
  anel "TODA QUARTA-FEIRA" + "50% OFF" no centro, tudo Spritz, losango
  pequeno na base do anel. ~250px, canto inferior direito da capa de feed.
  SÓ nessa pauta.
- Elementos do manual ainda não usados nos artboards-base: ondulação dourada,
  espiral Spritz, pincelada Menta, ícones de pote/cone/folha/colher. Entram
  peça a peça, nunca todos juntos ("ornamentação mínima").

## 7. Conteúdo que o padrão carrega (fatos da base)

- **Story de funcionamento (1º do dia)**: DUAS lojas, uma por linha:
  `Shopping Vitória - 11h às 22h` (todos os dias) e Praia do Canto conforme
  o dia (ter–qui/dom `13h às 22h`; sex–sáb `13h à meia-noite` — **escreve-se
  "meia-noite", nunca "00h"**). **Segunda: só Shopping; Praia do Canto -
  Fechado** (o "Fechado" em Menta, como o designer marca). Aeroporto NUNCA
  aparece com horário. A copy anuncia o dia — não convida para "vir agora"
  (a peça sai antes de abrir).
- **Capa da Quarta do Crepe (feed, qua 17h)**: headline "Quarta do Crepe",
  mecânica no apoio com "50% OFF" em Spritz Bold, e **a regra do menor valor
  SEMPRE na peça** ("O desconto vale para o crepe de menor valor" — sem ela a
  promessa fica maior que a oferta). Selo promocional + selo R.
- Capa de carrossel comum é FOTO PURA (sem texto) — arte com texto na capa é
  só para data comemorativa ou aviso/campanha (regra da cadência do feed).
- A palavra "promoção" não existe; comunica-se a mecânica. Vocabulário:
  gelato/panna/fior di latte; produto em italiano.

## 8. O que NUNCA fazer

1. Headline em CAIXA ALTA (nem "só desta vez") — é a queixa nº 1 do cliente.
2. Branley em texto pequeno; Stage Grotesk genérica trocada por sans de
   sistema na peça final.
3. Halo/véu PRETO (a tinta é Verde Real), dark artificial sobre foto
   clara, HDR, neon.
4. Rosa-pink de fundo, bandeira italiana gráfica, estética de franquia.
5. Dourado em parágrafo/fundo, ou em duas palavras da mesma headline.
6. Crema sobre Menta; Verde Real sob texto longo pequeno sem véu.
7. Texto sobre o herói da foto; endereço completo na arte (só NOME da
   unidade + horário, sempre no rodapé).
8. Horário sem unidade; unidade sem dizer qual; horário do Aeroporto.
9. "00h"/"24h" (é "meia-noite"); "promoção"; "sorvete"; "clique/click".
10. Segunda-feira convidando para a Praia do Canto.
11. Exclusividades (Semifreddo de Pistache, Suco de Frutas Vermelhas) em
    peça do Shopping.
12. Mais de um separador; ornamento órfão solto no quadro.

## 9. Arquivos desta leva

```
design-canvas/real-padrao/
  PADRAO.md              este documento
  gerar.py               assinatura em código; lê slots.json, escreve os
                         .dc.html + canvas.json (story E feed)
  render.py              achata e renderiza no tamanho do artboard (1080×1920
                         ou 1080×1350 — lê do próprio HTML)
  slots.json             as peças da leva (copy Title Case JÁ ESCRITA)
  Branley.woff, Stage*.woff   subsets PT-BR (~73KB os seis)
  fonts/*.otf            os 8 arquivos originais do CustomFont
  logos/                 5 variantes + contact sheet; selo-r.png na raiz
  fotos/                 originais e RECORTES cheios (segunda.jpg 9:16,
                         quarta-crepe.jpg 4:5) — o render usa estes
  segunda.jpg, quarta-crepe.jpg   previews ~50KB para o canvas
  Main.dc.html                    prova STORY (funcionamento de segunda,
                                  só Shopping — o artboard de entrada)
  CapaQuartaDoCrepe.dc.html       prova FEED (capa Quarta do Crepe)
  render/                as provas renderizadas
  refs/                  as 17 artes aprovadas baixadas para a análise
  manual-designer.png    o manual do designer (prioridade absoluta)
```

Rodar: `python3 gerar.py && python3 render.py *.dc.html`. O padrão é
`MODO=halo`; `MODO=veu|campo|halocrema` refaz a comparação do § 4 com sufixo no
nome do arquivo e **sem** tocar no `canvas.json`. Peça nova = entrada
no `slots.json` (layouts: `funcionamento-story`, `capa-feed`; os demais
módulos — `pretitulo`, `headline`, `apoio`, `filete`, `rotulo`,
`linha_servico`, `miudo`, `selo_r`, `selo_quarta` — compõem layouts novos).

Armadilhas herdadas do manual da ferramenta (todas pagas em outras levas):
foto por `<img src>` (NUNCA `url()` no CSS); cada linha item direto do flex;
px absoluto em cada bloco (nada herdado do pai); fórmula do halo só no CSS;
nome de arquivo sem acento; o HTML temporário do render nasce na pasta do
artboard.
