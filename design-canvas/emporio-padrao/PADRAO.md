# Padrão de design de canvas — Empório Fonseca (projeto 12)

Escrito em 29/08/2026 para a cadência que começa em 31/08 (3 stories/dia:
9h café · 11h30 almoço · 17h fim de tarde; feed qua 10h30 Quarta da Pizza e
sáb 11h30). Destilado de **17 peças publicadas da própria marca** — 6 stories
do designer (27-29/08, no blob), 11 capas/peças do feed real — mais o DNA
(24/08), o manual do designer (`brand-manual.png`) e a base de fatos.
Nenhum layout inventado: o repertório é o que a marca já aprova e publica.

A prova rendeu dois artboards-base (`Main.dc.html`,
`FeedQuartaPizza.dc.html`), renderizados em `render/` com foto real publicada.

---

## 1. Insumos oficiais (baixados do banco, nesta pasta)

| o quê | arquivo | fato |
|---|---|---|
| Logo assinatura | `logo-ef.png` (= `logos/ativo2-icones.png`) | Wordmark DOURADO com moldura de linha fina. **O nome "Ativo 2icones.png" engana — É a logomarca**, e a marcação `isProjectLogo` está certa |
| Variantes | `logos/ativo3-icones.png` (azul #4D5D75), `logos/ativo4-icones.png` (branca), `logos/ef-icone.png` (monograma FO redondo) | A branca some em fundo claro; o monograma NÃO substitui a assinatura na peça |
| Fontes | `fonts/TrajanPro-{Regular,Bold}.otf`, `fonts/FRZQUAD{N,B}.TTF` (+ `.woff` subsetadas, ~20 KB cada) | Trajan Pro **não tem minúscula**: caixa mista vira versalete sozinha — é esse o "efeito versalete" do DNA |
| Manual | `brand-manual.png` | Um card só. ⚠️ Os rótulos de cor estão TROCADOS entre si (o hex dourado rotula o swatch azul e vice-versa) e o "Título - Palatino" não aparece nas peças publicadas — o designer titula em Trajan. As peças vencem |
| DNA completo | `refs/_dna-completo.txt` | A lei da forma; este padrão só o traduz em número |

## 2. Paleta (estrita — nenhuma cor fora dela)

| hex | nome | uso | nunca |
|---|---|---|---|
| `#2C3445` | Azul escuro profundo | fundo dominante e **cor do halo** (§5) | retângulo sólido atrás de texto |
| `#4D5D75` | Azul-acinzentado | acento alternativo | junto do dourado na mesma função |
| `#CAB371` | Dourado champagne | **uma voz do lockup**, logo, filete | fundo de bloco, área grande |
| `#F2ECE3` | Mármore creme | fundo de peça institucional | peça noturna |
| `#FFFFFF` | Branco | texto principal | — |
| `#A8B0BD` | Cinza-azulado | texto secundário (endereço) | — |

A única cor viva permitida é a que vem de dentro da fotografia.

## 3. Assinatura tipográfica (números medidos nas peças do designer)

Lockup Trajan em até **3 níveis** — contexto, assunto, promessa — sobre a
foto, sem cartão e sem borda. Corpos de referência (story 1080x1920; entre
parênteses, feed 1080x1350):

| nível | fonte | caixa | corpo | entrelinha | cor |
|---|---|---|---|---|---|
| 1 · contexto | Trajan Pro Regular | **mista** (vira versalete) | 52px (46) | 1.12 | branco |
| 2 · assunto | Trajan Pro Bold | **ALTA**, máx. 2 linhas | 96px (84) | 1.06 | branco |
| 3 · promessa | Trajan Pro Regular | **mista** (versalete) | 44px (40) | 1.30 | dourado |
| serviço | Friz Quadrata Bold | ALTA | 38px (34) | 1.25 | branco |
| endereço | Friz Quadrata Regular | ALTA | 32px (30) | 1.25 | #A8B0BD |

- **Caixa mista é a regra da marca** (projeto 12 está em
  `PROJETOS_COM_CAIXA_NATURAL`): só o nível 2 sobe para caixa alta. Nunca
  gritar a peça inteira. Em Trajan, digite caixa mista — a fonte resolve o
  versalete; **nunca** `text-transform: uppercase` nos níveis 1 e 3.
- **Proporção entre níveis ~1 : 1,85 : 0,85** (52/96/44). O contexto nunca
  passa de 60% do assunto; manchete não cresce além de 96px — a elegância
  vem do espaço, não do corpo.
- **Tracking com teto**: 0.02em nos versaletes, 0.03em no assunto, 0.06em no
  serviço, 0.05em no endereço. **Teto absoluto 0.08em** — espaçamento acima
  disso desmonta a palavra e não existe em nenhuma peça publicada.
- **O dourado marca exatamente UMA voz do lockup.** Com 3 níveis, é a
  promessa (padrão do DNA); com 2, alterna para o contexto ou para a linha
  irmã do assunto (o designer faz os dois). Nunca duas vozes douradas, nunca
  lockup todo branco quando há mais de um nível.
- **Serviço no formato da casa**: `MECÂNICA | HORÁRIO` (pipe é diagramação),
  endereço embaixo — cheio `AV. RAUL OLIVEIRA NEVES, 120 · JARDIM CAMBURI`
  ou curto `JARDIM CAMBURI · VITÓRIA/ES` (a forma curta existe na base
  justamente para rodapé apertado, p.ex. quando a logo divide o rodapé).
- Espaços verticais na escala de 8: contexto→assunto 16px, assunto→promessa
  24px, logo→serviço 24px, serviço→endereço 12px, blocos independentes 96px.
- Texto recebe `text-shadow: 0 2px 16px rgb(24 29 40 / 0.5)` — apoio, não
  substituto do halo. É por ela existir que a tinta do halo pode ser leve; a
  logo, que não a tem, precisa de mais mancha (§5).

## 4. Margens e safe areas (px)

| formato | laterais | topo | rodapé | racional |
|---|---|---|---|---|
| STORY 1080x1920 | 88 | **184** | **184** | margem 8% da largura (86→88, escala de 8) + os 5% de altura (96) que o Instagram ocupa em cima e embaixo |
| FEED 1080x1350 | 88 | 88 | 88 | margem 8%; feed não tem faixa reservada do Instagram |

A margem é **intocável** ("como a margem de uma página de livro") — nada de
texto, logo ou filete dentro dela. ⚠️ Os stories do designer descem o
endereço até ~85-114px da borda; o padrão segue o DNA (184px), porque ali o
Instagram desenha a própria interface.

## 5. Halo (a camada de leitura) — substituiu o véu em 01/09/2026

O texto ganha contraste com um **halo**: uma mancha escura só ATRÁS do bloco,
desfocada com `filter: blur()`, que desmancha nas bordas. Antes disso eram dois
**véus** de borda a borda (1000px no topo + 900px no rodapé de um story de
1920 — ou seja, **99% da altura do quadro**), e era essa fatura que o halo veio
cancelar. O mecanismo é do Ciro; o manual dele é `../_halo.py`.

🔴 É `filter: blur()` na PRÓPRIA caixa, nunca `backdrop-filter: blur()`.
`backdrop-filter` desfocaria a FOTOGRAFIA atrás; `filter` desmancha só a mancha
e deixa a foto nítida por baixo.

Medido nesta pasta, mesma peça e mesma copy, trocando só o mecanismo:

| peça | mecanismo | luminância | saturação |
|---|---|---:|---:|
| Story café | véu | 102,2 | 62,2 |
| Story café | **halo** | **129,8** (+27%) | **91,2** (+47%) |
| Feed pizza | véu | 95,4 | 109,0 |
| Feed pizza | **halo** | **116,6** (+22%) | **155,4** (+43%) |

O ganho é bem maior que o do By Rock (+16% / +8%) porque o véu **desta** marca
era o mais pesado da carteira: ele cobria o quadro inteiro, não uma faixa.

### Números desta marca (não são os do By Rock)

| | Empório | By Rock | por quê |
|---|---|---|---|
| cor | **azul `#2C3445`** | quase-preto | toda a leitura desta marca é nesse azul, e a paleta proíbe preto puro |
| raio | **72-96px** | 124-158px | o blur espalha ~3x o raio; num lockup curto de 3 linhas o raio do By Rock faz a mancha alcançar o meio do quadro e cobrir tanta foto quanto o véu |
| tinta | **0,40-0,68** | 0,62-0,97 | peça elegante, e o texto já tem `text-shadow` presa ao glifo |
| inset | **44 / 36** | 54 / 44 | mesmo motivo do raio |
| escala da logo | **1,45** | 0,72 | ver abaixo |

A tinta final é **0,46-0,76**: subir de 0,40 custou ~1% de luz e de cor e
comprou 7 pontos de folga no bloco mais apertado (p98 149 → 142). Medido.

🔴 **A marca pede MAIS halo que o texto, não menos** — o oposto do 0,72 do By
Rock, onde a logo é um bloco vermelho cheio sobre um halo quase preto. Aqui é
um wordmark dourado de traço fino, sobre mancha azul leve, e **sem
`text-shadow`** (o texto tem, ela não). Herdado o 0,72, a assinatura saiu em
p98=167 sobre a madeira clara da capa de feed — o defeito 2 do roteiro do
`../_halo.py`, de novo. Custa quase nada em foto (a mancha é pequena): subir de
1,15 para 1,55 mexeu na luminância da peça na terceira casa decimal.

### Calibragem automática

O halo **não tem densidade de partida por peça**: ele é calibrado pela
luminância da foto no retângulo exato onde o bloco vai pousar (`luz_sob`), e a
foto é medida já recortada como o `object-fit: cover` a recorta — as duas fotos
desta pasta são 1080x1350, e no story o `cover` amplia 1,42x e come 228px de
cada lado. Medir o arquivo original responderia por pixels que a peça nunca
mostra. As caixas calculadas batem com a geometria real do Chrome em ±1px.

O slider `haloTopo`/`haloRodape` do canvas é **retoque** (1,0 = usa a medição),
não o ajuste obrigatório que o véu exigia.

### Régua

`medir.py` mede os DOIS lados: luminância/saturação da peça (o KPI do halo) e
p98 do fundo **sob cada bloco** (o KPI antigo, do véu, que continua valendo:
abaixo de 150 é confortável). Estado atual — story 138 / 120; feed 142 / 138 /
141 (logo).

🔴 A régua do véu **não se transfere**: ela media a FAIXA inteira, o que era
certo para um véu de borda a borda e é errado para um halo, que de propósito
não cobre a faixa. A mesma peça dá **p98=231 pela faixa e 138 pelo bloco**. Hoje
a região vem da geometria real (`getBoundingClientRect`), não de uma tabela de
faixas por formato — que além de tudo envelhecia a cada mudança de layout.

### O que o DNA diz, e por que o halo não o viola

O DNA proíbe `#2C3445` "como retângulo sólido atrás de texto sobre foto" e
manda que "o gradiente seja uma transição, não uma caixa: se a borda do
escurecimento for visível como uma linha, está errado". O halo passa **só
enquanto o blur for generoso** — é ele que impede a mancha de ler como cartão.
Raio pequeno em nome de "não cobrir foto" reintroduz exatamente a caixa que a
marca proíbe.

⚠️ O DNA (24/08) descreve o VÉU como o mecanismo da marca, em prosa ("dois
gradientes escuros, um no topo e outro no rodapé, ocupando cerca de um terço da
altura em cada ponta"). Essa linha está desatualizada desde 01/09 e descreve o
que o designer fazia, não o que esta pasta faz.

### Não cabendo

Não cabendo o texto sem apagar a foto, quem muda é o LUGAR do texto — nunca a
foto inteira que escurece.

## 6. Logo (assinatura)

- Arquivo oficial `logo-ef.png` (wordmark dourado com moldura). A moldura é
  parte da logo — não remover, não redesenhar, **nunca** deixar IA letrar o
  wordmark.
- **Largura 200px** nos dois formatos (18,5% — dentro do 17-22% do DNA).
  UMA marca por peça.
- Cinco posições legítimas (DNA): rodapé dir · rodapé esq · rodapé centro ·
  topo dir · topo centro. Nas 6 peças do designer: rodapé esq (3x, acima do
  bloco de serviço), rodapé dir (2x), rodapé esq pequena (1x). A logo nunca
  disputa o primeiro olhar com a headline — headline no topo pede logo no
  rodapé, e vice-versa.
- Sobre foto escura, a dourada. Sobre mármore/creme (peça institucional
  clara), a azul `ativo3`. A branca `ativo4` só sobre fundo comprovadamente
  escuro E sem a dourada na mesma peça.

## 7. Arranjo (o repertório é rotativo)

- A foto é SEMPRE protagonista: peça parece anúncio de marca de luxo — foto
  grande, texto pequeno, muito espaço vazio.
- Ponto de partida: lockup compacto no alto, foto respirando no meio,
  serviço discreto no rodapé. Alternar o lado do lockup (direita ↔ esquerda ↔
  centro) entre peças seguidas — "a conta parece uma revista, não um gabarito
  preenchido".
- Endereço e horário SEMPRE no rodapé (regra aprendida do DNA, 11/08), e o
  título NÃO desce junto: separação topo/rodapé é o que mantém a variedade.
- Exceção documentada (1 peça em 7): cartela de rodapé — retângulo de cantos
  arredondados, azul translúcido, borda dourada 1px, relógio antes do horário
  e alfinete antes do endereço — só para MUITA informação prática junta.
- A luz da foto bate com o horário do convite: janela (café/almoço), dourada
  quase horizontal (16-19h), pendente quente e fundo escuro (19h+). Story de
  café da manhã não existe depois das 11h.

## 8. O que NUNCA fazer

1. Caixa alta na peça inteira (a marca pede caixa mista; ALTA é só o assunto
   e as linhas de serviço).
2. Segunda-feira: nenhuma peça convida para segunda — a casa fecha. Peça de
   segunda fala de desejo/próxima visita.
3. Preço em arte: só o Happy Wine (R$ 89). O do executivo NÃO entra enquanto
   não estiver cadastrado. Telefone não existe cadastrado — nunca inventar.
4. Emoji dentro da arte; pergunta retórica de abertura; urgência de varejo
   ("imperdível", "corre", "aproveita"); "gourmet", "top", "delícia".
5. Bloco escuro chapado atrás de texto, botão-pílula, selo de desconto,
   carimbo, confete, marca d'água, simulação de interface do Instagram. (O
   halo do §5 não é isso — o que o separa de um cartão é o blur generoso.)
6. Logo duplicada, logo redesenhada, wordmark gerado por IA, logo na margem.
7. Fundo pastel ou vibrante, verde/vermelho/rosa/laranja, dourado em área
   grande, sem-serifa moderna, caligráfica rebuscada.
8. Prato, taça ou tábua cortados pela borda; foto de banco de imagem; luz
   chapada ou fria; flash frontal; produto recortado em fundo branco.
9. CTA de deslizar ("arrasta pra cima") — interação aponta para o Direct.
   CTAs só da lista fechada do DNA ("Reserve sua mesa", "Faça sua reserva",
   "Venha viver a experiência", "Venha conhecer", "Desfrute essa
   experiência", "Aguardamos você", "Da nossa curadoria para a sua mesa").
10. `url()` no CSS para imagem (foto some em silêncio — é `<img src>`),
    bloco herdando tamanho do pai, acento em nome de arquivo, e `blur` de
    fundo trocado por `backdrop-filter` (§5).

## 9. Como rodar esta pasta

```bash
python3 gerar.py                                    # regenera os artboards + canvas.json
python3 render.py Main.dc.html FeedQuartaPizza.dc.html   # PNG no tamanho de publicação
python3 medir.py  Main.dc.html FeedQuartaPizza.dc.html   # foto (lum/sat) + p98 sob cada bloco
```

`MODO=veu python3 gerar.py` regera com o véu antigo — é o lado "antes" da
comparação, e a geometria do texto é **idêntica** nos dois modos justamente
para que a comparação tenha uma variável só. `TINTA=`, `RAIOS=`, `ESCALA_LOGO=`
e `ESCALA_RODAPE=` no ambiente permitem varrer a calibragem sem editar código.

Foto nova: original em `fotos/<slug>.jpg` (sem acento) + preview ~520px
q60 na raiz com o MESMO nome (o canvas embute o preview; o render resolve
`fotos/` primeiro). **O halo se recalibra sozinho para a foto nova** — não há
densidade para ajustar à mão. Copy nova: editar as fábricas no `gerar.py` — o
`cabe()` avisa quando um texto estoura a largura útil (904px).

Peça pronta → `upload-creative` (MCP local) → `colocar-na-agenda`, sempre
como rascunho.
