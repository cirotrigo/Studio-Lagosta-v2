# Canvas de design (HTML)

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### Canvas de design: arte em HTML, sem crédito (25-26/08/2026)

Caminho alternativo à geração por IA: a peça é escrita em HTML (`.dc.html`),
editada num canvas publicado (skill `/design`), renderizada com Chrome
headless no tamanho de publicação e ingerida por `upload-creative`. **Zero
crédito de imagem.** Nasceu do placar do O Quintal Parrilla na via de IA —
0 "gostei" contra 14 "preciso melhorar" — e já rodou num segundo cliente
(carrossel de domingo do By Rock, 4 slides de feed).

**O manual é `docs/SESSAO-2026-08-25-CANVAS-DE-DESIGN.md`** — a seção 3 é o
passo a passo para outro cliente e a **seção 4 tem as armadilhas medidas**.
Leia antes de escrever qualquer artboard; as três que mais custaram:

- 🔴 **Imagem entra por `<img src="...">`; `url()` no CSS NÃO resolve** (4.7).
  A substituição só alcança o atributo `src`. Sintoma: na mesma peça, a logo
  aparece e a foto de fundo some — quatro slides publicados com fundo preto,
  sem erro nenhum. As imagens estavam certas no estado e o `--check` passou:
  o defeito é só a forma de citar. A doc da própria ferramenta afirma que
  `url()` funciona em qualquer aspa — **não funciona**, não gaste rodada
  variando aspas ou caminho. Fundo é `<img>` absoluto atrás, véu como camada
  irmã, texto em fluxo por cima.
- 🔴 **O editor faz layout por FLUXO, não posicionamento livre** (4.1): cada
  linha como item direto do flex é o que funciona; não há arrastar para
  coordenada arbitrária — posição exata se ajusta no gerador.
- 🔴 **Nenhum bloco pode herdar do pai** (4.2): tamanho em `em` sobre `--base`
  do raiz faz a fonte encolher e o item pular para o topo ao ser movido.
  px absoluto em cada bloco.

**Arquivos de trabalho por leva** em `design-canvas/<cliente>-<assunto>/`,
com o `render.py` da leva ao lado — o renderizador NÃO é compartilhado: cada
série tem formato, véu e fontes próprios (o do Quintal é 1080x1920 e resolve
holes; o do By Rock é 1080x1350 e é estático). **A foto do render vem de
`fotos/` (original), nunca da versão comprimida que o canvas embute** — no
canvas ela cabe em ~50 KB, que serve para revisar layout e não para publicar.

Medido em 09-10/09/2026 (§7 do doc), ao gerar 3 stories de teste do Espeto:

- 🔴 **O aviso de "título não cabe" só valia para a ÚLTIMA peça da leva.** A
  sonda do halo roda o layout duas vezes, então havia um `del AVISOS[:]` por
  passada — que zerava também os avisos da peça ANTERIOR. Duas das três peças
  do teste estouravam a largura e **zero avisos saíram**. Consertado com um
  acumulador (`TODOS_AVISOS`) em `espeto-semana1` e no teste; os outros 22
  geradores não têm o defeito (não fazem a passada dupla). Gerador novo que
  copie o do Espeto herda a sonda: `del AVISOS[:]` exige o acumulador junto.
- **A colisão da headline com a marca NÃO é falta de conta.**
  `UTIL_STORY_COM_MARCA = UTIL - 210` existe e já é aplicada em `split` e
  `topo`. Faltava o aviso chegar — não mexa na constante.
- **Tempo, nas MESMAS 3 peças**: Pillow 9,5s (~3,2s/peça) × compositor 33-41s
  (~11-14s/peça). Mas o Pillow exclui montar a pasta e baixar as fotos, e só
  foi rápido porque o cliente já tinha gerador; o compositor inclui tudo e não
  exige preparo. Primeira peça de um cliente → compositor; vigésima de uma
  leva montada → Pillow. O cronômetro é o menor pedaço: a copy levou ~20 min
  nos dois.
- 🔴 **O gerador não OLHA as artes com estrela — ele CARREGA o padrão delas.**
  É código determinístico; a referência entra por DESTILAÇÃO, quando alguém lê
  as artes aprovadas e escreve o sistema no `gerar.py` (o da Real declara as
  fontes no docstring: manual do designer, DNA, 6 `styleRefAt` + 6 "gostei" +
  5 publicadas, 29/08/2026). O preço é que a destilação **tem data e
  envelhece**: marcar arte nova com estrela não muda o gerador. Antes de usar
  um, compare o sinal aprovado mais recente do cliente com a data no
  docstring. Na Real, em 10/09: 28/08 contra 29/08 — em dia.

### Halo: a leitura do texto sobre a foto sem véu (01/09/2026)

O véu — gradiente que escurecia a faixa INTEIRA do topo ou do rodapé — foi
reprovado duas vezes pelo Ciro ("muito marcado", "essa estratégia não vai
funcionar"). No lugar entrou o **halo**: uma caixa escura atrás do bloco de
texto, com `filter: blur()` nela mesma, que desmancha nas bordas e escurece só
onde a letra cai. Nasceu no By Rock e foi portado em 8 sessões paralelas (uma
por cliente, prompts em `design-canvas/_halo-sessoes/`). O módulo compartilhado
é **`design-canvas/_halo.py`** — o docstring dele É o manual, com o roteiro de
11 defeitos na ordem em que apareceram. Leia antes de portar para cliente novo.

- 🔴 **`filter: blur()` na PRÓPRIA caixa, nunca `backdrop-filter: blur()`.**
  `backdrop-filter` desfoca a FOTOGRAFIA (lente fora de foco); `filter`
  desmancha só a mancha e deixa a foto nítida por baixo. É o coração da ideia.
- 🔴 **Não herde os números do By Rock** (tinta 0,62–0,97, raio 124–158). O
  blur é uma gaussiana de desvio `raio`: caixa mais baixa que ~2× o raio nunca
  chega à tinta cheia no miolo, que é onde a letra cai. Cada cliente calibrou o
  seu (TERO 74–96, Empório 72–96, Seu Quinto 78–112) e a `escala` da marca foi
  de 0,34 (Espeto) a 1,55 (Empório) — o oposto um do outro, os dois medidos.
- **A tinta sai de um ALVO por cor de texto** (`alvo_por_contraste` +
  `tinta_para_alvo`, WCAG 3:1), não de um número arbitrado: creme pede fundo
  ≤139, verde do Quintal ≤69, e **foto já escura recebe tinta ZERO** (16 de 63
  blocos no TERO, 6 de 43 no Espeto). Há cor que o halo NÃO serve — o vermelho
  `#F4301A` do Espeto exigiria fundo ≤51, que é o véu de volta; quem resolve é
  sombra presa ao GLIFO. Ornamento fino (<8px) não vota no alvo.
- 🔴 **Mede-se o RETÂNGULO DO TEXTO, por percentil, nunca a faixa nem a média.**
  A média deixa o texto sumir sobre a mancha clara pequena (cadeira branca no
  TERO: média 54, 15% da área acima de 200). O retângulo vem de uma sonda de
  `getBoundingClientRect` no Chrome — e ela precisa esperar as IMAGENS, não só
  `document.fonts.ready`: lockup de marca sem altura declarada mede 0px antes
  de carregar (corrida real no Espeto). Retângulo degenerado derruba a geração.
- 🔴 **Saturação HSV MENTE quando a tinta tem cor**: o marrom do Espeto
  "ganhava" 2,4% pelo HSV com a foto visivelmente morta. Compare em CIELAB
  contra a foto ORIGINAL (`medir_cor.py` do Espeto).
- **Duas arquiteturas, e a armadilha 4.1 do canvas decide qual**: halo como
  FILHO do bloco (`envolver_linhas`, `width: fit-content`) quando o artboard é
  estático; camada IRMÃ absoluta com a caixa MEDIDA (Quintal) quando cada linha
  precisa seguir item direto do flex para o editor mover. Filho de bloco exige
  `position: relative; z-index: 1` em todo irmão opaco (o print de avaliação
  do TERO saiu cinza) e nos selos absolutos (Real).
- **Tudo que dependia do véu precisa do próprio halo** — a logo principalmente
  (quase sumiu no By Rock, no Real e no Empório). EXCETO disco opaco e colorido
  (o Q do Seu Quinto): ali a mancha só suja, e quem protege é a escolha da
  VARIANTE por contraste de cor.
- **Fundo claro, liso e uniforme é o pior caso** (tijolo do Quintal: desvio
  22). Ali a mancha só some com raio e margem grandes (`margem = 1,4 × raio`
  põe o texto no platô). Tinta no teto de 0,95 é sinal de CURADORIA — aquela
  foto não carrega aquela linha ali — e o gerador imprime a lista.
- 🔴 **Leva publicada ou agendada NÃO se regera só para trocar o mecanismo.**
  O Espeto (semana no ar) recusa sobrescrever os artboards sem `CONFIRMAR=1`,
  e todo gerador mantém `MODO=veu` reproduzindo o antigo — no Espeto, byte a
  byte contra os 34 publicados, e foi essa prova que pegou dois defeitos.
- **Situação por cliente em 01/09/2026**: By Rock semana 1 já está na agenda
  com halo (17 posts, 01/09 18h); Wine Vix (24 rascunhos) e Quintal (14
  rascunhos) têm artboards e renders com halo na pasta, mas a agenda ainda
  carrega a arte de véu de 31/08 — trocar é decisão do Ciro; TERO está com o
  halo pronto **aguardando o aval dele** (a semana foi cancelada, não há post);
  Espeto segue no véu até a próxima leva; Bacana, Empório, Seu Quinto e Real
  têm só o PADRÃO (2–3 artboards) portado. O canvas publicado do Bacana ainda
  é o do véu (resemear pelo `/design`), e o DNA do Empório descreve o véu como
  mecanismo da marca — prosa desatualizada, não regra.
- **No git só entra código, artboard, json e relatório** (`.gitignore`):
  fotos, previews, renders, amostras e o bundle do canvas (`<leva>.html`, até
  10 MB de base64) ficam fora — eram 3,5 GB. Render e bundle se refazem.
