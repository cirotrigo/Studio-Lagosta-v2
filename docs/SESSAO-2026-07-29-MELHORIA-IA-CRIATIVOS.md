# Sessão 29/07/2026 — melhoria com IA na agenda, feedback de criativos e três bugs do editor

Sete mudanças, em três frentes: a **direção de arte** do aprimoramento com IA,
o **alcance** dele (editor e agenda) e três defeitos do editor — dois no painel
Criativos e um no zoom do workspace contínuo.

Cada item diz **o que mudou**, **por que** e **a armadilha**.

---

## 1. Direção de arte criativa como padrão, editável por projeto

**Arquivos:** `src/lib/ai/art-direction.ts` (novo), `src/lib/ai/openai-image-client.ts`,
`src/components/projects/art-improvement-prompt-config.tsx` (novo),
`Project.artImprovementPrompt`

O prompt do aprimoramento eram ~1.800 palavras de proibição — "textos compactos
em no máximo 25% da área", "PROPORÇÃO INTERNA EXATAMENTE como na IMAGEM 1",
"ênfase por peso, NÃO tamanho". Como as artes são geradas em escala a partir de
um template padronizado, o que se pede à IA é justamente **quebrar** essa
padronização, e regra demais achatava o resultado.

Duas instruções brigavam com o próprio objetivo e saíram:

- **`Preserve exatamente a mesma imagem de fundo da peça original`**, injetada
  sempre que não havia fundo novo. Pedir "desfoque o fundo" pela feature era
  impossível: o pedido do cliente contrariava uma restrição absoluta.
- **Textura no título**, aplicada incondicionalmente, trabalhando contra
  acabamentos chapados e limpos.

O padrão virou repertório em vez de proibição: recursos de diagramação (arco,
ornamento da marca, contraste de escala, filete, badge, profundidade), leitura
da foto **por tipo de assunto** — produto, ambiente, pessoas, macro — e destaque
de 1 a 3 palavras-chave. Sobra de restrição só o intocável: as palavras, a
família tipográfica, a paleta e a logo.

**Peso e caixa passam a ser livres DENTRO da família.** Foi o que fez o subtítulo
funcionar num teste real: sem massa tipográfica, as caixas de marca-texto não se
sustentam. Proibir isso obrigaria a torcer para o modelo desobedecer na hora
certa.

Cada projeto pode substituir o miolo em `Project.artImprovementPrompt` (aba
Configurações). O que o projeto **não** reescreve é o que depende de runtime: o
mapa das IMAGEM 1/2/3, a paleta e o pedido feito na hora seguem montados pelo
sistema.

**Armadilhas:**
- `DEFAULT_ART_DIRECTION` mora em módulo próprio **sem dependências**. O card de
  configuração é `'use client'`; importar `openai-image-client` arrastaria o SDK
  da OpenAI para o bundle do navegador.
- Isso supersede o commit `802d30b` (mesmo dia, de manhã), que tratava a
  compactação como padrão com exceção para pedido explícito. **A compactação
  deixou de existir como regra** — quem quiser de volta, escreve na direção de
  arte daquele projeto.
- A migration foi escrita à mão (`ADD COLUMN IF NOT EXISTS`, nulável) e aplicada
  com `prisma migrate deploy`: o `.env` aponta para produção e `migrate dev`
  pediria reset.

Prompt portátil equivalente: [`docs/prompts/diagramacao-artistica.md`](./prompts/diagramacao-artistica.md).

---

## 2. Instrução para a IA ao gerar e ao agendar no editor

**Arquivos:** `src/lib/ai/instruction-field.ts` (novo),
`src/components/templates/modals/generate-creatives-modal.tsx`,
`src/components/templates/modals/schedule-story-modal.tsx`,
`src/contexts/template-editor-context.tsx`, `src/hooks/use-generate-multiple-creatives.ts`

Campo opcional nos dois modais. Vazio, o fluxo é o de antes, sem custo de IA.
Preenchido:

- **Gerar** enfileira na fila de melhoria que já existia (serial, com o
  indicador flutuante).
- **Agendar** precisa **esperar** o resultado, senão o post sairia com a arte
  velha: exporta criando Generation, melhora, faz polling e só então cria o
  post. Se a melhoria falhar, agenda a original em vez de perder o agendamento.

**Armadilhas:**
- `exportDesign` **descartava** o `generation.id` que a API devolve. Sem ele não
  há o que melhorar — passou a ir no `ExportRecord`.
- O modal de gerar **abre sempre** agora, inclusive com uma página só (antes
  exportava direto). Ele existe pelo campo de instrução, não só pela escolha de
  páginas; com uma página, esconde a lista.
- `pollGenerationStatus` saiu de `use-improve-queue-processor` para
  `src/lib/ai/poll-generation.ts`, porque o modal de agendar usa o mesmo polling.

---

## 3. Melhorar com IA na agenda — só post APROVADO

**Arquivos:** `src/lib/creatives/agendar.ts`, `src/lib/mcp/tools.ts`,
`src/app/api/generations/[id]/improve/route.ts`,
`src/components/agenda/post-actions/post-preview-modal.tsx`

Regra de negócio: **rascunho se edita, não se melhora.** O gate vale nas duas
pontas — o botão só aparece com `status === 'SCHEDULED' && generationId &&
mediaUrls`, e a rota devolve 400 para qualquer outro status **antes de cobrar
crédito**.

Faltavam duas peças. A primeira era o vínculo: `agendarPost` nunca gravava
`SocialPost.generationId`, mesmo com a Generation recém-criada pelo
`criar-arte`. Agora grava, e quando o chamador não informa (o Claudinho ainda
não passa) **deriva** por `Generation.resultUrl === mediaUrls[0]` — o sufixo
aleatório do Blob torna o match inequívoco.

A segunda era devolver o resultado ao post: `applyToPostId` na rota faz isso no
fim do background.

**Armadilhas:**
- O `updateMany` é guardado por `status: SCHEDULED`. A melhoria leva 1-2 min; se
  o post for publicado nesse meio-tempo, a arte fica só na galeria em vez de
  adulterar o que já saiu.
- **O post melhorado vira `renderStatus: NOT_NEEDED`.** Sem isso a melhoria
  duraria minutos: `render-stories` pega DRAFT e SCHEDULED e sobrescreve
  `mediaUrls` com o render da página, e `invalidateScheduledRenders` zera
  `mediaUrls` a cada edição de página. Em troca, **editar o template deixa de
  atualizar a arte desse post** — é uma escolha, não um ganho puro.
- `sourceImageUrl` existe porque o que se melhora é a arte que está **no post**:
  o cron pode ter re-renderizado a página depois que a Generation foi criada.
- A aplicação é do **servidor**, não do navegador. Fechar a aba depois de pagar
  os créditos deixaria o post com a arte velha.
- **Posts anteriores a 29/07 não têm o vínculo e não dá para recuperar.** Medido
  em 7.616 posts: dos 39 DRAFT/SCHEDULED sem `generationId`, zero casaram por
  URL. Ver `scripts/backfill-post-generation-id.ts` (cabeçalho explica as 4
  causas). O caminho para destravá-los seria uma Generation sintética criada a
  partir da arte atual do post — não foi feito.

**Truque de teste em produção:** post com `publishType: REMINDER` nunca vai ao
Zernio (todas as queries do executor filtram `!= REMINDER`). Foi assim que o
fluxo MCP → rascunho → aprovação → melhoria foi validado ponta a ponta sem risco
de publicar.

---

## 4. Criativo em geração parecia erro

**Arquivos:** `src/components/templates/panels/creatives-panel.tsx`,
`src/components/projects/gallery-item.tsx`, `src/hooks/use-template-creatives.ts`,
`src/hooks/use-generations.ts`

A melhoria cria a Generation como `PROCESSING` e só grava `resultUrl` no fim. O
painel testava `PENDING`/`POSTING` — que existem **só no canal SSE do export de
vídeo**, não no enum do banco (`PROCESSING | COMPLETED | FAILED`) — então o card
não caía em nenhum ramo e ia direto para o `<Image src="">`, virando miniatura
quebrada. Parecia erro; era progresso.

Agora `PROCESSING` mostra spinner com "Gerando com IA… leva 1 a 2 minutos", e
agendar/editar/baixar ficam desabilitados enquanto não há arte — antes dava para
agendar um post com mídia vazia.

**Armadilhas:**
- **Não reusar a barra de progresso do export de vídeo.** Ela vem de SSE; a
  melhoria não tem canal de progresso e mostraria 0% parado, pior que não
  mostrar nada. O ramo com barra só vale quando existe `progressOverride`.
- O mesmo ponto cego existia em `gallery-item.tsx:99` (card sem imagem e sem
  aviso). `creative-card.tsx` (/criativos) já tratava certo.
- A atualização quando fica pronto vem por **dois** caminhos: a fila invalida
  `['template-creatives']` ao concluir (event-driven) e as queries repetem a
  busca a cada 5s enquanto houver `PROCESSING`. O polling sozinho não bastaria —
  o navegador o pausa quando a aba está em segundo plano.

---

## 5. Trilha do vídeo tocava ao abrir uma imagem

**Arquivo:** `src/components/templates/creatives-lightbox.tsx`

Abrir **uma imagem** no painel Criativos fazia a música começar a tocar. A causa
não estava no criativo aberto: o PhotoSwipe **pré-carrega os vizinhos**
(`preload: [1, 2]` por padrão, verificado no `node_modules`), e o `contentLoad`
criava `<video autoplay loop>` sem mudo **também para esses slides**. O áudio de
um vídeo que nem estava na tela tocava, e seguia tocando porque
`stopActiveVideos` só rodava no `close`.

O vídeo passa a nascer com `autoplay = false` e `preload = 'metadata'`; quem dá
play é `contentActivate` e quem pausa é `contentDeactivate` — ambos disparados só
para o slide **realmente ativo** (PhotoSwipe 5.4.4, payload `{ content }`).

**Armadilha:** autoplay bloqueado pelo navegador é engolido de propósito. Os
controles ficam visíveis para a pessoa dar play na mão; tratar como erro só
geraria ruído.

---

## 6. Exportar vídeo fora da página 1 procurava no stage errado

**Arquivo:** `src/components/templates/video-export-button.tsx`

Exportar vídeo de qualquer página que não a primeira falhava com **"VideoNode
não encontrado no stage"**. O botão localizava o canvas assim:

```js
document.querySelector('.konvajs-content')
Konva.stages.find((s) => s.container() === el.parentElement)
```

Com o workspace contínuo existem **N stages montados** — um por página visível —
e o `querySelector` devolve sempre o **primeiro do DOM**, que não é o da página
aberta. A camada de vídeo vinha do `design` da página ativa, então o `findOne`
caía num stage que não a tinha.

Medido no template 164 com a página 8 aberta (3 stages montados):

| stage | Transformer | tem o vídeo | o querySelector escolhia |
|---|---|---|---|
| 0 | 1 | **sim** | não |
| 1 | 0 | não | **SIM** |
| 2 | 0 | não | não |

O stage editável é o único com Transformer, é o que tem o nó do vídeo, e é o que
`getStageInstance()` devolve.

**Armadilhas:**
- É exatamente a regra que o CLAUDE.md já registrava — *"nunca localizar o stage
  por querySelector/Konva.stages; esta é a fonte da verdade"* — e que este
  caminho não seguia. **Caminho novo que precise do canvas usa
  `getStageInstance()`.**
- `generateVideoThumbnail` logo abaixo usa a mesma variável, então também passou
  a receber o stage certo.
- O efeito de **detecção de duração** continua varrendo `Konva.stages` de
  propósito: ali qualquer cópia do elemento serve, porque só se lê
  `video.duration`. Era por isso que o modal mostrava o trecho correto
  (`0.0s → 6.6s`) mesmo com o export quebrado — o sintoma enganava.

---

## 7. Zoom rolava a página em vez de ancorar no centro

**Arquivos:** `src/components/templates/continuous/continuous-workspace.tsx`,
`src/components/templates/konva-editor-stage.tsx`,
`src/components/templates/editor-canvas.tsx`

Dar zoom deslizava o conteúdo e — o sintoma que o usuário chamou de "piorou" —
**trocava a página ativa**.

A causa é o modelo de layout, não o zoom. No workspace contínuo **não existe
`transform: scale`**: o zoom redimensiona o **slot DOM de cada página**
(`slotWidth = pageWidth * zoom`, `continuous-workspace.tsx`). Ampliar aumenta a
altura de todos os slots, o `scrollTop` fica parado e o que estava no centro sai
de vista. Aí o `handleScroll` vê outra página como "mais visível", chama
`activatePage`, e dispara flush + load do PageSync sem ninguém ter pedido.

A compensação guarda uma **âncora** — a página mais próxima do centro do
viewport e a fração (0..1) do centro dentro dela — e a repõe depois do
re-layout.

Medido no template 164, âncora no slot 5 a 28,5% da altura, de 60% a 149% e de
volta (9 operações): a página ativa ficou em 6 o tempo todo, a fração variou no
máximo 0,012, e o ciclo completo retorna a `0.285` — sem erro acumulado.

**Armadilhas:**
- **Coordenadas relativas, não absolutas.** Escalar `scrollTop` por
  `novoZoom/velhoZoom` erra: o gap entre páginas (`gap-6`), o cabeçalho de cada
  slot (`h-8`) e o padding da coluna (`px-8 py-6`) são fixos em px de tela e
  **não acompanham o zoom**. Só a âncora por slot sobrevive ao re-layout.
- **`useLayoutEffect`, não `useEffect`** — a correção precisa acontecer antes do
  paint; com `useEffect` o salto aparece por um frame.
- **A reposição marca `programmaticUntilRef`**, senão o próprio scroll corretivo
  aciona o `handleScroll` e troca a página ativa — exatamente o que se quer
  evitar.
- **A âncora é capturada no `handleScroll` do usuário** (e uma vez após o
  scroll inicial), nunca durante scroll programático: capturar durante a
  correção sobrescreveria a âncora boa com a posição que ainda está sendo
  ajustada.
- **Pular a compensação antes do `initialScrollDoneRef`**: o auto-fit inicial
  faz `setZoom` seguido de `scrollToPage`, e compensar ali jogaria a página de
  entrada (link da agenda) para fora da tela.

**Dois defeitos vizinhos, do mesmo caminho:**

- `animateZoom` (atalhos Cmd `+`/`-`/`0`) não tinha guarda de `embedded`. No
  modo contínuo quem escala é o React (props `scaleX`/`scaleY` do `<Stage>`) e
  quem posiciona é o slot; animar `stage.position()` deslocava o desenho dentro
  do slot **sem nada repor** — o `<Stage>` não declara props `x`/`y` — e o
  `onUpdate` re-renderizava a coluna inteira a cada frame.
- Os `ZoomControls` anunciavam `0.1–5` enquanto o `setZoom` do contexto clampa
  `0.25–2`: o botão de ampliar seguia habilitado acima de 200% sem fazer nada.
  **Limite de UI e clamp do contexto têm que ser o mesmo número.**

**Fora do alcance desta correção:** o **modo clássico** (página única / mobile)
usa outro modelo — o elemento DOM não cresce com o zoom, então ampliar **corta**
em vez de gerar scroll. Comportamento diferente do relatado; mudar exigiria
adotar o modelo embutido também ali.

**Código morto encontrado e não removido:** `floating-zoom-controls.tsx` (117
linhas, nunca importado), `_containerRef` em `konva-editor-stage.tsx` e o
`handleWheel` no-op ainda registrado no `<Stage>` (scroll do mouse não dá zoom
de propósito).

---

## O que ficou de fora

- **Verificação de texto na saída da IA.** Neste preset a IA redesenha cada
  letra; erro de grafia é o modo de falha nº 1 e em geração automatizada ninguém
  confere arte por arte. A decisão foi confiar no modelo primeiro e só então
  injetar os textos exatos de `fieldValues` + checagem de visão com retry.
- **Rodízio de recursos de diagramação** entre as artes da semana, para a grade
  não re-padronizar com arco + marca-texto em todas.
- **Generation sintética** para destravar os posts históricos sem `generationId`.
