# Padrão de design de canvas — Seu Quinto (projeto 4)

Escrito em 29/08/2026 para a produção da cadência nova (começa seg 31/08).
Fontes da verdade, nesta ordem: **o manual do designer** (`refs/brand-manual.png`,
prioridade absoluta), **10 stories publicados** lidos um a um (`refs/story-*.jpg`,
25–29/08, blob estável), **12 posts de feed** (`refs/feed-*.jpg` — o feed da marca é
foto documental pura; a arte gráfica vive nos stories) e o **BrandDNA** do projeto 4.
Números medidos nas peças reais em 1080px de largura; onde o DNA diverge do
observado, a divergência está anotada.

## 1. Assinatura tipográfica

Duas fontes, e só duas (`CustomFont` do projeto):

| papel | fonte | arquivo |
|---|---|---|
| Manchete, pré-título em caps, serviço | **Bonoco 2023** (brush bold itálica de pontas arredondadas) | `fonts/Bonoco2023.otf` (peso único) |
| Script manuscrito (pré-título, complemento, CTA) | **The Kathy Romm** | `fonts/TheKathy.ttf` |

⚠️ O DNA cita "Bintang" como script decorativo — **o arquivo cadastrado e o script
das peças publicadas é The Kathy**. Seguimos The Kathy. Se a Bintang existir em
algum lugar, não está no Studio.

**Manchete (Bonoco, CAIXA ALTA, sempre com extrude):**
- Corpo **72–76px** por linha (cap medido ~62–66px ≈ **3,3% da altura** do story);
  lockup de 2 linhas ≈ **150px ≈ 8%** da altura. A manchete NUNCA toma o terço
  superior — é compacta, o impacto vem do extrude e da cor, não do tamanho.
- `line-height: 0.97` · `letter-spacing: -1px` (DNA; teto: **nunca além de -1px
  nem acima de 0** — tracking aberto em caps é de OUTRO papel, o pré-título).
- **Sombra extrude 5px baixo-direita, SEM blur** (`text-shadow: 5px 5px 0 <cor>`;
  faixa aceita 4–6px). É A assinatura visual da casa.
- Pares medidos nas peças publicadas: **branco+vermelho**, **branco+verde**,
  **branco+amarelo**; o manual acrescenta **amarelo+vermelho** ("TÍTULO COM
  SOMBRA"). Nunca duas cores de tinta na mesma manchete — a variação é do extrude.
- Quebra de linha: 2 linhas equilibradas, nenhuma palavra sozinha em linha.

**Pré-título/complemento em script (The Kathy, caixa NATURAL):**
- Corpo **60–64px** no story, 60px no feed. Branco, sombra suave difusa
  (`0 2px 12px rgb(14 11 8 / 0.65)` — o extrude duro é só da Bonoco).
- Posições observadas: acima da manchete ("Hoje tem aquela...", "A resenha
  começa") ou logo abaixo, como complemento ("Com Filé do Edd").
- **NUNCA em caixa alta, nunca com dado prático** (horário/endereço/preço).

**Pré-título em caps (forma alternativa, do DNA):** Bonoco menor, amarelo ou
vermelho, tracking **+6px** (este é o único lugar de tracking aberto). Não usada
nas 10 peças lidas — a forma script domina na prática.

**Serviço (Bonoco, caps, branco):**
- Linha de horário **MAIOR** que a de endereço: **52px / 40px** no story
  (medido 50/35 de cap nas peças), **46px / 38px** no feed.
- Extrude discreto escuro **3px 3px 0 rgb(14 11 8 / 0.55)** — nunca extrude
  colorido no serviço.
- Vocabulário FIXO (das peças do designer): `SEGUNDA, DAS 16H ÀS 23H30` ·
  `SÁBADO, DAS 11H ÀS 23H30` · `DOMINGO, DAS 11H ÀS 16H` ·
  `RUA CELSO CALMON, 80 - PRAIA DO CANTO`. Linha de evento pode ir em amarelo
  (`SAMBA DO CANTO, DAS 12H ÀS 16H`) — amarelo é a cor de samba/happy hour.
- Fatos: **seg–sex abre 16h** (nunca almoço em dia útil), sáb 11h, **dom 11–16h**
  (⚠️ uma peça publicada diz "16H30"; o DNA e a base dizem 16h — vale 16h até o
  cliente corrigir a base).

**Apoio (opcional, Bonoco caps amarelo):** 40–44px, para o detalhe da oferta
("COM CHOPP AMSTEL E DRINKS NACIONAIS EM DOBRO!"). Um só por peça.

**CTA:** SEMPRE da lista fechada do DNA, como TEXTO integrado (The Kathy branco
54px no rodapé, ou na legenda). Sem botão, sem pill, sem selo.

## 2. Margens e safe areas (px)

| formato | topo | rodapé | laterais | área útil |
|---|---|---|---|---|
| **STORY 1080×1920** | **200** | **180** | **88** | 904px |
| **FEED 1080×1350** | **96** | **88** | **88** | 904px |

- DNA pede respiro ~10% topo / 12% base / 8% laterais; o designer publica mais
  solto (serviço a ~100px da borda). 200/180 é o meio-termo que protege da UI do
  Instagram (avatar em cima, reply embaixo) sem esmagar a peça — mesma faixa
  calibrada pelo Ciro no TERO (200/150).
- No feed não há UI do Instagram por cima: margens simétricas de ~90px.

## 3. Halo (a mancha atrás do bloco) — substituiu o véu em 01/09/2026

O véu era um gradiente sobre a faixa INTEIRA do topo e do rodapé: para dar
contraste a três blocos que somam ~600px, escurecia 1.660 dos 1.920px do story.
O **halo** é uma caixa escura ATRÁS de cada bloco, com `filter: blur()` **nela
mesma**, que desmancha nas bordas. A função é compartilhada (`../_halo.py`).

🔴 É `filter: blur()` na PRÓPRIA caixa, **nunca `backdrop-filter: blur()`** —
este desfocaria a FOTOGRAFIA atrás (lente fora de foco), aquele desmancha só a
mancha e deixa a foto nítida por baixo.

**Medido nesta marca** (mesma peça, mesmo texto, véu × halo):

| | luz da peça | luz onde o véu era mais denso |
|---|---:|---:|
| **Main** (story, estufa) | 92,9 → **113,8** (+22,4%) | topo 62,5 → **115,3** (+84%) |
| **Capa** (feed, feijoada) | 127,5 → **138,3** (+8,4%) | topo 65,7 → **92,3** (+40%, e +18% de cor) |

**Cor da mancha: `#0E0B08`** (14,11,8), o dark da casa — não o quase-preto
neutro do By Rock. O §7 proíbe "faixa preta chapada" e "véu que apaga a luz
âmbar da casa"; sobre madeira, chopp e estufa quente o neutro esfria justamente
onde a foto é mais quente.

**Calibragem desta marca** (`TINTA_*` / `RAIO_*` em `gerar.py`):

| bloco | tinta | raio | escala |
|---|---|---|---|
| título (script+manchete) | 0,72–0,99 | 86–112 | 1,00 |
| serviço | 0,70–0,97 | 78–100 | 1,05 |

🔴 **Não herde os números do By Rock** (0,62–0,97 / raio 124–158). Duas razões
medidas: (a) a manchete daqui **não tem sombra de leitura presa ao glifo** — só
o extrude duro e colorido, que é assinatura e não dá contraste no lado de cima
da letra —, então o halo carrega sozinho; (b) os blocos daqui são **curtos e
largos** (lockup de 3 linhas, ~240px de altura contra ~600 do By Rock), e como
o blur é uma gaussiana de desvio `raio`, caixa mais baixa que ~2× o raio nunca
atinge a tinta cheia no miolo. Com a calibragem do By Rock o título fica em
p98 **141/148** — dentro do teto de 150 e sem folga; com a daqui, **113/124**.

**A calibragem é MEDIDA, não estimada.** `gerar.py` roda em duas passadas:
escreve os artboards, lê o rect REAL de cada bloco com uma sonda de
`getBoundingClientRect` no Chrome, mede a luz da foto exatamente ali (com o
`object-fit: cover` simulado) e reescreve com cada halo calibrado pelo seu
pedaço de foto. Os rects ficam em `geometria.json`. Isso importa: no rodapé da
Capa o serviço pousa a **171** de luz e o Q, na mesma altura, a **138** — 33
pontos que a média da faixa (163) esconderia.

**Régua de contraste** (`medir.py`, texto oculto e halo preservado): **p98 <
150** confortável. Hoje: título 113 (Main) / 124 (Capa), serviço 107 / 126 —
os quatro com folga, contra o 157 que o véu entregava no topo do Main.

O slider do canvas deixou de ser `veuTopo`/`veuRodape` e passou a ser **`halo`**
(0,4–1,4), um multiplicador da intensidade — cada mancha já nasce calibrada
pela foto, o que sobra para a mão é o volume geral.

`MODO=veu python3 gerar.py` reemite o mecanismo antigo, para comparar.

## 4. Marca na peça (ícone Q e logo)

- **O ícone Q em círculo é a marca padrão da peça**: **120–140px** de diâmetro
  no story (~13% da largura), **130px** no feed. Posições observadas: **topo
  centro** (peça centrada, ex-funcionamento) ou **canto do rodapé na diagonal
  oposta ao bloco de texto** (bloco à esquerda → Q à direita).
- ⚠️ O DNA diz "logo ~2% da largura" — **as 10 peças publicadas medem 12–16%**.
  O 2% do DNA não descreve a prática; vale o medido.
- Variantes (nome de arquivo da marca mente; renomeadas por papel):
  `q-vermelho.png` (círculo vermelho, Q branco) · `q-verde.png` (verde) ·
  `q-amarelo.png` (amarelo, Q vermelho) · `q-branco.png` (branco, Q vermelho).
  Escolha por contraste com a foto E equilíbrio do tricolor na peça (se o
  extrude é vermelho, o Q pode ser amarelo ou verde — não tudo vermelho).
- **Wordmark completo** ("Seu Quinto BOTEQUIM") é para peça de marca/abertura,
  ~240px de largura, num canto do topo: `logo-fundo-escuro.png` (Seu amarelo +
  QUINTO branco, para foto escura — a do template do Studio),
  `logo-colorida.png` (verde+vermelho, para fundo claro), `logo-mista.png`
  (Seu branco + QUINTO vermelho). Nunca wordmark E ícone Q na mesma peça.
- **A marca NÃO leva halo** (01/09/2026) — e isso contraria de propósito a regra
  2 do `_halo.py`, escrita para o wordmark de letra fina do By Rock. O Q é um
  **disco opaco e colorido**: traz a própria figura-fundo, e a mancha atrás dele
  não assenta nada, só suja. Medido no pior caso (Q amarelo da Capa, sobre manga
  rosa e guardanapo): o halo compra +14 de separação de luz **escurecendo a foto
  em 12%**, e não acrescenta nada no canal que de fato separa um disco colorido —
  a cor, que fica em +128 com ou sem ele.
- Sombra: `drop-shadow(0 6px 22px rgb(14 11 8 / 0.62))` + `0 2px 6px … / 0.45`
  — suave, nunca extrude. É ela que assenta o disco na foto no lugar do halo.
- 🔴 **Quem protege a marca é a ESCOLHA DA VARIANTE, não uma nuvem escura.**
  Medido no Main (Q sobre o vidro âmbar da estufa), Δluz e Δcor contra o anel em
  volta: **vermelho +30,7 / −1,0** · **verde +36,6 / +4,0** · amarelo +53,7/+53,7
  (mesma família do âmbar) · branco +107/−102 (lê como adesivo). Vermelho sobre
  âmbar tem separação de cor **zero** — e o §4 já pedia outra coisa ("se o
  extrude é vermelho, o Q pode ser amarelo ou verde"). O Main usa **verde**.

## 5. Paleta (estrita)

| papel | hex |
|---|---|
| Vermelho — cor principal, manchete/extrude, ícone | `#ED1C24` |
| Verde — acento, extrude, selos | `#008C44` |
| Amarelo — calor: pré-título, samba, happy hour, linha de evento | `#FAA61A` |
| Dark — fundo e véus | `#0E0B08` |
| Branco — texto sobre foto | `#FFFFFF` |

Qualquer cor fora disso é proibida (azul, ciano, lilás, neon, gradiente
artificial). O tricolor deve aparecer EQUILIBRADO na peça (tinta + extrude +
ícone somam os três, sem monocromia).

## 6. Biblioteca de layouts (das 10 peças lidas)

| | estrutura | quando usar |
|---|---|---|
| **A** | Q topo centro → script → manchete → [foto respira] → serviço centrado + CTA script | funcionamento, abertura (prova: `Main.dc.html`) |
| **B** | script topo → manchete centrada → [foto] → serviço à esquerda + Q no canto oposto | evento/programa (prova: `Capa.dc.html`) |
| **C** | script + manchete topo → [foto] → apoio amarelo + serviço à esquerda + Q à direita | oferta com detalhe (happy hour) |
| **D** | manchete topo + script complemento abaixo → [foto] → serviço esquerda + Q direita | prato nomeado, programa fixo |
| **E** | wordmark topo-esquerda → [foto] → manchete rodapé-direita + script | peça de clima (o template do Studio faz assim) |

Variar layout entre peças seguidas — nunca duas iguais em sequência.

## 7. O que NUNCA fazer nesta marca

- Manchete sem extrude, extrude com blur, ou fora dos pares de cor.
- Script em caixa alta; script carregando horário/endereço.
- Fonte fora do par Bonoco/The Kathy (nada de Bebas, Impact, Inter, serifada).
- Preço, percentual, combo, delivery, CEP (regras duras do DNA).
- "Quinto" sozinho — é sempre "Seu Quinto".
- Faixa preta chapada; mancha que apaga a luz âmbar da casa.
- `backdrop-filter: blur()` no lugar de `filter: blur()` (desfoca a FOTO).
- Halo atrás do ícone Q (ele é disco opaco — a mancha só suja).
- Q vermelho quando o extrude é vermelho (§4: tricolor equilibrado).
- Botão/pill/selo de CTA; CTA fora da lista fechada.
- Ornamento solto (só em peça de evento, no máximo 1 — o manual tem a cartela).
- Wordmark + ícone Q juntos; marca desenhada por IA.
- Almoço em dia útil; jantar no domingo (fecha 16h).
- Emoji dentro da arte.

## 8. Ferramentas da leva

- `gerar.py` — os 2 artboards-base saem daqui (edite os slots/copy aqui, não no
  HTML final). Confere largura de manchete com a própria Bonoco e avisa.
- `render.py Main.dc.html Capa.dc.html` — achata e renderiza no tamanho real
  (story 1080×1920, feed 1080×1350) com as fotos CHEIAS de `fotos/`.
- `medir.py` — p98 do fundo **no rect real de cada bloco** (lido de
  `geometria.json`), com a tinta oculta e as manchas preservadas. 🔴 Os dois
  detalhes são do halo: esconder `.conteudo` inteiro levaria o halo junto e a
  régua mediria a foto nua; e medir um retângulo generoso (como fazia com o
  véu, quando a banda inteira estava coberta) pega foto FORA da mancha — foi
  assim que ela reprovou as quatro faixas de uma peça correta. O ícone Q fica
  de fora da régua: é disco opaco, julga-se por figura-fundo, não por p98.
- Fotos: `fotos/` originais do acervo (blob `uploads/…drive-*`), `img/` previews
  ~55KB para o canvas. **O render usa sempre a de `fotos/`.**
- Fontes: `fonts/*.woff` subsetadas PT-BR (13KB Bonoco, 20KB Kathy) embutidas
  em cada artboard como data URI.
- Canvas publicado: artifact "Seu Quinto — Padrão" (2 artboards + nota com o
  resumo). Ajustes do Ciro no canvas → ler de volta antes de renderizar
  (`seed-canvas.mjs --extract`).

## 9. Aberto / divergências encontradas

- **Peso único nas duas fontes** (Bonoco 2023 e The Kathy não têm família de
  pesos). Hierarquia se faz por corpo e cor, nunca por bold sintético.
- **DNA × prática**: logo "~2%" (DNA) vs 12–16% medido; Bintang (DNA) vs The
  Kathy (cadastrada e publicada); domingo "16H" (DNA/base) vs "16H30" (peça
  publicada de 28/08) — conferir com o cliente e corrigir base OU peças.
- **The Kathy não tem – nem —** (travessão): usar hífen "-" nos textos.
- `styleRefAt` zerado no projeto 4 — nenhuma referência de estilo marcada na
  galeria; quando a produção começar, marcar as aprovadas para alimentar o
  rodízio da via de IA também.
- ~~O p98 do topo do story de prova ficou em 157~~ — **resolvido em 01/09/2026
  pela troca do véu pelo halo**: 113. Os quatro blocos passaram a ter folga.
- **Fica em aberto**: só duas peças (uma por formato) passaram pelo halo. Foto
  de boteco tem muito brilho especular (vidro, chopp, gordura) e a variação
  DENTRO de uma mesma faixa é grande — a calibragem por bloco cobre isso, mas
  vale conferir a primeira leva de verdade peça a peça antes de confiar nela em
  lote. A `folga=40px` de `luz_em()` (o quanto do entorno entra na média) não
  foi variada; é o parâmetro a mexer se alguma peça sair marcada ou apagada.
