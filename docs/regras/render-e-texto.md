# Render server-side, texto e registro de sessões antigas

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### Registro de mudanças recentes

`docs/PLANO-2026-09-02-EDITOR-COMO-USINA.md` (02/09/2026) é o mais recente:
o editor como usina — compositor, assinatura, fila `COMPOR`, via `compor` e o
sinal de geometria; regras na seção homônima acima.

`docs/SESSAO-2026-08-10-FASES-4-A-6.md` é o mais recente: crivo de aprovação,
QA por visão, referências de estilo em rodízio, a logo desenhada pelo modelo,
o menu do projeto com seletor de cliente e a bancada com acervo em modal. O
próximo passo combinado — cadência de postagem e dica de copy, evoluindo o que
o Claudinho fazia — está levantado em
`docs/PROXIMO-PASSO-CADENCIA-E-DICA-DE-COPY.md`.

`docs/SESSAO-2026-08-10-GALERIA-LIGHTBOX-E-RESPONSIVIDADE.md`:
lightbox que não navegava (três causas independentes), a galeria baixando a si
mesma em resolução cheia, e a responsividade no iPad e no celular.

`docs/SESSAO-2026-08-09-GERACAO-IA-BANCADA-CARROSSEL.md`: o
Studio passou a CRIAR arte por IA (não só melhorar), com bancada, carrossel
com visual coerente e referências por papel. O plano que originou o trabalho
está em `docs/PLANO-2026-08-09-GERACAO-IA-E-BANCADA.md`, com o placar das
fases. As regras duráveis estão na seção "Geração de arte por IA, bancada e
carrossel" mais abaixo.

`docs/SESSAO-2026-07-26-EDITOR-INSTAGRAM.md` detalha as 29 mudanças de julho/2026
em gradientes, vazamento entre páginas, fontes no export, integração do
Instagram, métricas, combinações tipográficas e histórico de migrations — com as
armadilhas descobertas em cada área.

`docs/SESSAO-2026-07-28-RENDER-AGENDADOS.md` fecha o arco: sombra que o
render nunca desenhou, invalidação automática da arte agendada ao editar
página/camada, e a troca de fonte com medição de caixa. Regras que ficaram:

- **O cron `render-stories` nunca revisita um post RENDERED.** Quem grava
  `Page.layers` em rota nova PRECISA chamar `invalidateScheduledRenders`
  (`src/lib/posts/invalidate-renders.ts`) — senão o post publica a arte
  antiga em silêncio. O PATCH de página só invalida em mudança visual REAL
  (o mesmo endpoint recebe thumbnail e autosave do PageSync).
- **A invalidação vale para RASCUNHO também** (desde 29/07/2026). A agenda
  mostra a arte do rascunho, então rascunho com arte velha mente igual a
  agendado — e a aprovação só manda renderizar quando o post está sem mídia,
  ou seja, publicaria a arte velha. `render-stories` renderiza DRAFT e
  SCHEDULED; `nextRenderAt: asc` mantém o agendado na frente.
- **`renderStatus: NOT_NEEDED` significa "a arte NÃO vem do render desta
  página"** — mídia trazida de fora (upload, Drive, import do Zernio). Arte que
  saiu de um render nasce RENDERED, mesmo já pronta na criação: era gravar
  NOT_NEEDED nela que congelava o post no PNG do momento em que foi criado,
  fora do alcance da invalidação. Vale para `agendarPost`
  (`src/lib/creatives/agendar.ts`) e para qualquer caminho novo.
- **`Page.thumbnail` nem sempre é publicável**: na criação é o PNG do render no
  Blob, mas o PageSync sobrescreve com um JPEG base64 de 150px assim que a
  página é aberta no editor. Quem for reusar o thumbnail como mídia precisa
  recusar `data:` e cair no render.
- **Mudou o código de render?** `scripts/rerender-agendados.ts` força o
  re-render do que já está RENDERED — só com o deploy no ar.
  `scripts/reparar-arte-congelada.ts` é o irmão para as linhas antigas gravadas
  como NOT_NEEDED (dry-run por padrão).
- **Fonte de projeto exige arquivo enviado** (`CustomFont` + blob): o
  `addGoogleFont` do editor carrega do CDN só no navegador, e o render cai em
  fallback. Arquivo TTF **estático** (napi-rs canvas não aplica eixo variável)
  e o peso pedido tem de existir no arquivo — faux-bold só existe no browser.
- **Trocar fonte muda a métrica**: medir a caixa com a fonte nova, senão o
  texto quebra e a linha extra é cortada pela altura.
- ~~O RenderEngine ainda ignora `letterSpacing`, fundo de texto, contorno,
  curved/blur e `richTextStyles`~~ — **desatualizado, corrigido em 03/08/2026**:
  todos esses já existem em `src/lib/render-engine.ts` (fundo :111, contorno
  :457, curvo :368, blur :408, rich-text via `flattenRichTextStyles`,
  letterSpacing :601). Sobra só o kerning (~1px). A linha contradizia a própria
  seção seguinte deste arquivo e já produziu diagnóstico falso.

`docs/SESSAO-2026-07-28-LETTERSPACING-AUTOEXPAND.md` (tarde do mesmo dia)
fecha as duas divergências de maior alcance da tabela e o Auto da caixa:

- **`letterSpacing` agora existe no render** — `ctx.letterSpacing` do napi-rs
  tem a mesma contagem do Konva (espaçamento após cada caractere, inclusive o
  último; medição, alinhamento e desenho de uma vez). Resta só o kerning, que
  o Konva descarta e o canvas mantém (~1px por par kernado).
- **Todo texto quebra linha no render**, com ou sem `textboxConfig` — o
  fallback antigo espremia os glifos via maxWidth do `fillText`. Nenhum
  `fillText` de texto usa mais maxWidth: palavra maior que a caixa transborda,
  como no editor.
- **O modo Auto re-mede quando o mundo muda sem mudar a camada**: fonte que
  termina de carregar (`fontsTick` via `document.fonts`, nas DUAS assinaturas
  — a de quebra e a de render/cache), altura alterada por fora (undo, alça do
  transformer) e `textTransform`/`fontStyle`. A trava por assinatura + o guard
  de |diff| < 1 são o que evita o loop de update — não remover nenhum dos dois.
- **A altura medida é arredondada para CIMA (`Math.ceil`), nunca `round`**: o
  nó da tela tem altura fixa e o Konva descarta a próxima linha INTEIRA quando
  ela não cabe por qualquer fração de pixel. Com `round`, toda altura cujo
  total de linhas tem decimal < 0,5 era gravada curta e a última linha sumia —
  em `lineHeight` 1.2 e 3 linhas isso pegava 12 de 29 tamanhos de fonte, daí o
  "some e volta a cada ajuste". O render server-side não trunca quando
  `autoExpand` está ligado, então o defeito era só do editor: a prévia mentia
  para menos.
- **Auto-height nativo do Konva foi avaliado e rejeitado** (§4 do doc): a
  altura fixa do nó na tela é o contrato visível com o render server-side, que
  corta pela altura gravada; height auto esconderia a dessincronia.

`docs/SESSAO-2026-07-29-MELHORIA-IA-CRIATIVOS.md` traz a melhoria com IA para a
agenda e corrige três defeitos do editor. Regras que ficaram:

- **Melhorar com IA vale para RASCUNHO e AGENDADO** (regra invertida em
  01/08/2026 pelo Ciro: a arte criada é o esboço e a melhoria é o acabamento
  da criação — ~100% das artes passam por ela). Publicado/publicando/falhou
  seguem recusados antes de cobrar crédito; a aplicação ao post é guardada por
  `status in [DRAFT, SCHEDULED]` no runner. `pedido` até 1200 chars (instrução
  vem da análise visual do chat via conferir-arte). `colocar-na-agenda` aceita
  só o `generationId` da melhorada (resolve o resultUrl sozinho, NOT_NEEDED).
- **A melhoria NUNCA reduz a quantidade de mídias do post.** O runner gravava
  `mediaUrls: [nova]`, o que em carrossel agendado apagava todos os outros
  slides — em silêncio e sem volta, porque a melhoria também marca
  `NOT_NEEDED` e tira o post do alcance do re-render. Hoje ele lê a lista,
  troca **só** a posição de `applyToPostMediaIndex` (default 0) e escreve com
  compare-and-swap em `mediaUrls`. A agenda manda o slide que está NA TELA;
  quem não informa índice (galeria, MCP) mexe no primeiro e preserva o resto.
- **Slide ≠ arte da Generation pula a conferência de texto**: os textos
  esperados são de UMA arte, e conferir o slide 3 contra os textos do slide 1
  reprovaria arte correta. A trava é estreita de propósito
  (`midias.length > 1 && midias[i] !== original.resultUrl`) — post de imagem
  única, inclusive re-renderizado pelo cron, continua sendo conferido.
- **Post melhorado vira `renderStatus: NOT_NEEDED`**, senão `render-stories` e
  `invalidateScheduledRenders` sobrescrevem a arte em minutos. O preço é que
  editar o template deixa de atualizar a arte daquele post.
- **`agendarPost` grava `SocialPost.generationId`** (explícito ou derivado por
  `resultUrl === mediaUrls[0]`). É o vínculo que habilita a melhoria; posts
  anteriores a 29/07 não têm e **não dá para recuperar** — as 4 causas estão no
  cabeçalho de `scripts/backfill-post-generation-id.ts`.
- **`PROCESSING` é o status do banco**; `PENDING`/`POSTING` só existem no canal
  SSE do export de vídeo. Componente que renderize criativo precisa tratar
  PROCESSING, senão cai num `<Image>` sem src e vira miniatura quebrada.
- **Nunca localizar o stage por `querySelector`/`Konva.stages`** — com o
  workspace contínuo há N stages montados e o primeiro do DOM não é o da página
  aberta. Use `getStageInstance()`. Foi o que quebrou o export de vídeo fora da
  página 1.
- **Lightbox pré-carrega vizinhos**: vídeo criado em `contentLoad` não pode ter
  `autoplay` — play/pause vão em `contentActivate`/`contentDeactivate`, senão a
  trilha toca ao abrir uma imagem.
- **No workspace contínuo o zoom redimensiona o slot DOM de cada página** (não
  há `transform: scale`). Toda mudança de zoom precisa repor o scroll por
  âncora relativa (página do centro + fração dentro dela) num `useLayoutEffect`
  e marcar `programmaticUntilRef` — senão o conteúdo desliza *e* o
  `handleScroll` troca a página ativa sozinho. Escalar `scrollTop` pela razão
  dos zooms não funciona: gap, cabeçalho e padding são fixos em px de tela.
  `animateZoom` não vale no modo `embedded` (quem escala ali é o React).
- **A direção de arte do aprimoramento é editável por projeto**
  (`Project.artImprovementPrompt`, aba Configurações). O padrão vive em
  `src/lib/ai/art-direction.ts` — módulo sem dependências, porque o card de
  configuração é client.
- **No padrão a FOTOGRAFIA é a protagonista** (~90% da composição) e o bloco de
  texto ocupa 15–20% da altura, nunca mais de 25%. O teto foi reinstaurado em
  30/07 depois de teste real: sem ele o modelo faz título desproporcional e
  sacrifica a foto. O impacto vem de peso, cor, contraste e posição — não de
  tamanho. **Não "libere" esse limite de novo sem repetir o teste.**
- **A identidade do cliente é injetada pelo SISTEMA, fora do bloco editável**
  (`buildBrandIdentitySection`): nome, tipografia por papel, paleta e, quando
  preenchidos, `brandStyleDescription` e `cuisineType`. É o que faz a mesma
  direção render peças diferentes por marca — e um prompt de projeto mal escrito
  não pode apagá-la. As fontes são o sinal confiável (os 11 projetos têm as
  três); `brandStyleDescription` só o Wine Vix tem, e `cuisineType` está vazio
  em todos.

`docs/SESSAO-2026-07-30-QUALIDADE-MELHORIA-E-FASE4.md` fecha a confiabilidade
da melhoria: verificação de texto, resolução nativa, linhagem e a Fase 4 de
limpeza. Regras que ficaram:

- **Todo texto conhecido entra no prompt como `[TEXTO EXATO — VERBATIM]`** —
  última seção do prompt, acima até do pedido do cliente — e a arte gerada é
  **conferida por visão** (gpt-4o-mini transcreve; comparação uppercase, sem
  acento, espaços colapsados, PONTUAÇÃO MANTIDA). Divergiu → regenera (2
  gerações no total); persistiu → Generation FAILED e **o post fica com a arte
  original**. Sem texto esperado (upload externo, export do editor) →
  `textCheck: 'skipped'`; visão fora do ar → skipped também, nunca derruba a
  melhoria. Auditoria em `fieldValues` (`textCheck`, `textCheckAttempts`).
- **O pipeline da melhoria vive em `src/lib/ai/creative-improvement-runner.ts`**,
  não na rota — a rota improve só valida e dispara `after()`. Teste E2E importa
  o runner e roda o caminho real sem sessão Clerk (protocolo: projeto 8,
  `publishType: REMINDER`, +7 dias, cleanup completo).
- **A melhoria gera em resolução NATIVA** (STORY 1088x1936, FEED 1088x1360,
  SQUARE 1088x1088 — múltiplos de 16, sempre ≥ saída final): o resize final é
  downscale, nunca upscale. O `FORMAT_TO_INPUT_SIZE` de `cost-estimates.ts` é
  **legado congelado** para linhas de uso antigas — não sincronizar com o
  `creative-improvement-format.ts`; linhas novas gravam `inputSize` nos details.
- **Dedução de créditos falhando NÃO desfaz melhoria pronta**: loga alto, grava
  `fieldValues.creditDeductionError` e a arte segue aplicada. Descartar arte
  verificada por soluço de cobrança é o pior dos dois erros.
- **Linhagem é coluna**: `Generation.sourceGenerationId` (sem FK de propósito —
  apagar a origem não arrasta a melhoria). A rota improve grava; as 500
  melhorias antigas foram backfilladas. É o que liga badge "✨ melhorada",
  antes/depois e "melhorar de novo" na galeria.
- **`Project.userId` é o id INTERNO do User, não o clerkId** — dedução de
  créditos e qualquer fluxo Clerk recebem `user_…`. Já existe User fantasma no
  banco criado por essa confusão; não criar outro.
- **Rotas legado `brand-style`/`design-system`/`art-templates`: remoção em dois
  tempos.** Hoje só logam `[deprecated]` por handler (o `generate-art` ainda lê
  o que escrevem); apagar de verdade só depois de 2+ semanas sem warn nos logs
  de produção, por decisão do Ciro. `TOM_DE_VOZ` segue no enum, marcado como
  legado na página /knowledge.
- **CI mínimo no ar** (`.github/workflows/ci.yml`): typecheck + lint em
  push/PR. Lint com ERRO agora quebra o CI — a main foi zerada nesta sessão.

`docs/SESSAO-2026-07-31-MCP-AUTONOMIA-ARTES.md` fecha o ciclo de autonomia do
conector MCP: 6 tools novas (melhorar-arte, ver-melhoria, conferir-arte,
ajustar-arte, marcar-como-modelo, listar-modelos), `startImprovement` extraído
da rota improve (casca fina), `renderPageAndRegister` compartilhado. Regras:

- **`extractExpectedTexts` lê 4 formas** (`slotValues`, `texts`, `textos`,
  `textosLivres`) — antes a arte-livre não era lida e a melhoria de arte do MCP
  saía sem verificação de texto. Forma nova de gravar textos em Generation
  precisa entrar lá.
- **`Project.userId` é o id INTERNO do User** (confirmado nos dados). O
  `resolverDono` do tools.ts resolve por `User.id` primeiro e devolve interno +
  clerk; passar esse cuid por `getUserFromClerkId` já criou 2 Users fantasma.
- **`ajustar-arte` recusa página-modelo** e chama `invalidateScheduledRenders`
  ao gravar `Page.layers` — as duas regras da casa valem para qualquer tool nova.
- **Dedupe de melhoria**: `sourceGenerationId` + PROCESSING + janela de 10 min
  no serviço — retry do modelo no chat não pode virar segunda cobrança.
- `/api/mcp` tem `maxDuration = 300` por causa do `after()` da melhoria.
- **Gestão de agenda (01/08, total 28 tools)**: `ver-agenda` devolve situação
  em PT/hora BRT/capa (nunca reintroduzir enum+UTC cru — é o que fazia o chat
  vazar jargão); `sugerir-posts` lê cadência do histórico (não há campo de
  cadência configurada — decisão de 01/08); `postar-agora` = agendado
  now+3min com gate de confirmação; `editar-post` SÓ rascunho (aprovado →
  voltar-para-rascunho primeiro, senão editaria publicação armada sem
  re-aprovação).

`docs/SESSAO-2026-08-01-AUTOCORRECAO-GEOMETRICA.md` fecha o texto que vazava
da caixa no export (By Rock, template 140): validação geométrica + escada de
autocorreção pré-render nos três geradores de arte. Regras:

- **Todo gerador de arte passa por `aplicarAutofixOuFalhar`** (text-autofix)
  DEPOIS do reflow e ANTES de persistir — as camadas corrigidas são as
  persistidas (editor = export). Gerador novo precisa entrar no mesmo funil.
- **Colisão se mede pelos GLIFOS** (padding 6px descontado, tolerância 4px),
  nunca pelas caixas gravadas — templates têm caixas sobrepostas por design
  que funcionam com 1 linha (o próprio Layout 2 do 140 é assim).
- **A escada nunca toca conteúdo/quebra/fonte/cor/posição** e nunca trunca:
  fontSize (piso 80% e 24px@1080) → lineHeight (piso 0.92) → expandir caixa →
  `TEXTO_NAO_CABE` (422) com diagnóstico. Bloqueio devolve camadas ORIGINAIS.
- **`reflowLayersAfterFill` cresce caixa sem olhar vizinho** — é esperado; a
  colisão resultante é problema do autofix, não do reflow.
- Flags `textAutofixEnabled` em Project e Template (default true): desligada
  cria como antes + `avisos[]`. Relatório `autocorrecao` sempre na resposta e
  no fieldValues; log `[text-autofix]` é a telemetria de template apertado.
- `fieldValues.pageId` em toda Generation nova — é como conferir-arte acha as
  camadas para diagnosticar `sobreposicao` (vs "texto faltando").
- **`fontWeight` que não é múltiplo de 100 quebra o parser do napi-rs** (250,
  310…, vindos do usWeightClass real gravado pela normalização): texto sai
  GIGANTE no macOS e INVISÍVEL na Vercel. `buildFontString` saneia via
  `cssFontWeight()` — os dados ficam com o peso real do arquivo; camada nova
  de código que monte font string por fora precisa do mesmo saneamento.
- Colisão usa TINTA com baseline `middle` (igual ao renderLines) e tolerância
  `max(4px, 0.18×fontSize)`; overflow vertical é PARIDADE COM O TRUNCAMENTO
  (linhas cortadas), não diferença de fórmula — caixa menor que a fórmula com
  a mesma contagem de linhas é design válido, não defeito.
- **Camada de imagem NUNCA guarda thumbnailLink do Drive** (lh3 é assinado e
  expira em horas) — sempre a cópia permanente `drive-cache/{fileId}-s1920.jpg`
  via `resolveImageUrl`. O legado (77 páginas) foi reapontado em 01/08 por
  `scripts/reparar-lh3-legado.ts`; em 39 delas a foto original foi recuperada
  (fileId reconstruído de Generation/slotValues/doc da semana, bytes vindos do
  Drive, de `uploads/` do Blob ou do arquivo do fotógrafo). Nas outras 38 a
  foto tinha sido excluída do Drive na curadoria de julho **sem cópia em lugar
  nenhum** — as 15 visivelmente quebradas ganharam fotos novas do acervo em
  02/08 e as 23 cobertas por outra imagem seguem com a camada morta por baixo.
  **Apagar foto do acervo mata páginas que apontavam para ela**: antes de
  expurgar, varra `Page.layers` e `Generation.fieldValues`.

`docs/SESSAO-2026-07-27-TEXTO-ALINHAMENTO.md` cobre o dia seguinte: padrão do
texto novo, setas do teclado, alinhamento pela margem de segurança, âncora
vertical com crescimento da caixa e a remoção do negrito. Três armadilhas de lá
valem para qualquer mexida no editor:

- **Camada de texto é cacheada como bitmap** quando `fontSize > 24`. Campo novo
  que afete o desenho precisa entrar na assinatura de invalidação em
  `konva-editable-text.tsx`, senão o controle simplesmente não funciona.
- **Alinhamento vive em duas telas** (painel de propriedades e
  `alignment-toolbar`); mudou a regra, mude nas duas.
- **UI do app NUNCA é montada em `createRoot` avulso.** Componente dentro da
  árvore do Konva não pode renderizar DOM; a saída é publicar um pedido num
  store (`rich-text-edit-store.ts`) e deixar um host na árvore DOM abrir o
  modal (`RichTextEditorHost`, montado no `EditorCanvas`). O modal de Rich Text
  era criado com `createRoot(document.body…)` e ficava SEM providers: abrir o
  seletor de cor chamava `useBrandColors` → `useQuery` sem QueryClient →
  exceção sem error boundary → o React derrubava aquela raiz inteira. O modal
  sumia e não reabria, porque o `open` continuava `true` na camada.
- **Modal aberto sobre o canvas precisa desarmar os atalhos globais**: o
  `keydown` do `EditorCanvas` só ignorava input/textarea/contenteditable, então
  Backspace com uma palavra selecionada no editor de Rich Text apagava a
  CAMADA. Hoje ele sai cedo quando `getRichTextEditRequest()` existe.
- **O crescimento automático da caixa é do editor**, não do `render-engine`: um
  `slotValues` mais longo que o texto do template é cortado na altura gravada.
- **A entrelinha mora em dois campos** e o render server-side prefere
  `textboxConfig.autoWrap.lineHeight` sobre `style.lineHeight`. Escreva sempre
  nos dois — escrever em um só faz o editor e a arte agendada divergirem, e o
  download do editor (`stage.toDataURL()`, que lê o `style`) **não** revela isso.
