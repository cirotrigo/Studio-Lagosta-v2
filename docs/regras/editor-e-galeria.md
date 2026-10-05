# Editor e galeria de criativos

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### Galeria de criativos: grade, lightbox e o `globals.css` (10/08/2026)

Arco completo em `docs/SESSAO-2026-08-10-GALERIA-LIGHTBOX-E-RESPONSIVIDADE.md`
(PRs #26 a #29). Regras que valem para código novo:

- **`[class*="container"]` no `globals.css` pega classe de TERCEIRO.** A regra
  `.container, [class*="container"] { max-width: 100vw; overflow-x: hidden }`
  vive em `@layer base` e casa com qualquer classe que contenha a substring —
  pegou o `.pswp__container` do PhotoSwipe e **recortava o slide ativo**, que é
  transladado para fora da caixa do contêiner. Resultado: lightbox em branco ao
  navegar, com a `<img>` perfeitamente carregada. Biblioteca nova cujo CSS use
  "container" no nome da classe herda isso em silêncio.
- **Elemento com caixa correta que não aparece no `elementsFromPoint` do
  próprio centro é recorte de ancestral**, não falha de carregamento. Medir
  `complete`/`naturalWidth`/`opacity` não enxerga o problema; subir a árvore
  lendo `overflow` e `transform`, sim.
- **A grade da galeria é `grid` (ordem por LINHA), não `columns` (ordem por
  COLUNA).** Com colunas CSS a linha de cima mostrava os itens #1, #13, #25… —
  as artes mais recentes não ficavam em cima e o "próximo" do lightbox ia para
  o card de baixo. `items-start` é obrigatório: sem ele o item estica até a
  altura da linha e a `aspect-ratio` do card é ignorada, deformando a arte.
- **Não medir imagem baixando o original.** Um `new window.Image()` por card
  apontando para a arte original custava **38,22 MB e 54 downloads** numa carga
  da galeria. A proporção sai de graça do `onLoad` da `<Image>`, que já carrega
  a miniatura otimizada.
- **`data-pswp-*` sai do render, nunca de escrita imperativa concorrente.** O
  estado guarda a PROPORÇÃO; as dimensões vêm de `dimensoesParaLightbox()`.
  Gravar no estado o tamanho da MINIATURA fazia o re-render sobrescrever a
  correção e o lightbox abria a arte em 360px.
- **PhotoSwipe esconde as setas em tela de toque** e usa miniatura de
  placeholder só no primeiro slide. As duas coisas são revertidas em
  `src/hooks/use-photoswipe.css` e no filtro `placeholderSrc`. Ver
  `docs/photoswipe-lightbox.md`.

### Imagem: caixa é janela, não elástico (04/08/2026)

- **`keepRatio` do Konva só vale nas alças dos CANTOS.** As do meio mudam um
  eixo só, e por isso arrastar uma lateral esticava a foto. Hoje elas passam por
  `cropForResizedBox` (`src/lib/image-fit.ts`): a escala e o enquadramento são
  congelados no `transformstart` e a caixa passa a revelar/esconder imagem, com
  a borda OPOSTA à alça parada. O resultado é gravado em `style.crop`, que o
  render server-side já lê com precedência — editor e arte não divergem.
- **Sem `objectFit: 'cover'` e sem `style.crop` o KonvaImage ESTICA** (é o
  default de quase toda camada). A primeira lateral arrastada tira a foto da
  deformação, porque a escala escolhida é a menor dos dois eixos.
- **No modo contínuo o stage tem o tamanho EXATO da página**: o que a camada
  tem para fora dela não é desenhado nem clicável. Era isso que sumia com as
  alças do recorte in-canvas — elas agora ficam presas à janela visível
  (medida do stage, não de `design.canvas`, porque no modo clássico o stage é
  do tamanho do container). Overlay novo que desenhe fora da página precisa da
  mesma trava.
- **Enquanto o recorte está aberto o stage embutido ganha 35% de folga** e
  transborda o slot da coluna por `position: absolute` — é o que deixa ver a
  foto inteira. O slot NÃO muda de tamanho de propósito: crescê-lo empurraria
  as páginas vizinhas e a coluna saltaria. Foto maior que a folga continua
  coberta pelas alças presas à borda.
- **Evento de transform nasce no nó que o transformer segura**: com máscara ou
  flip quem é transformado é o Group, e o `onTransform` estava no KonvaImage de
  dentro — eventos do Konva sobem, não descem, então nunca disparava.

### Arte pronta trazida de fora (upload local, 03/08/2026)

`src/lib/creatives/arte-enviada.ts` (`importarArte`) põe na galeria de
Criativos um arquivo que já está pronto — export de skill, Photoshop, Canva,
arte que o cliente mandou. A superfície é a tool **`upload-creative`** do MCP
**local** (`scripts/mcp-server.ts`), que recebe CAMINHOS de arquivo (ou uma
pasta) e lê os bytes do disco.

- **Não renderiza nada**: os bytes enviados viram o `resultUrl` da Generation
  tal e qual. Re-renderizar só reencodaria e arriscaria diferença.
- Mesmo assim a arte nasce como **Page editável** (uma camada de imagem em tela
  cheia, no template coletor `Arte Enviada[ — Feed| — Quadrado]`, criado no
  primeiro uso). É o que dá editor, `ajustar-arte` e `conferir-arte` de graça.
- **Agendar por `pageId` deixa a arte sujeita a re-render** (o post nasce
  RENDERED e `invalidateScheduledRenders` o devolve à fila quando a página
  muda). Quem quer o arquivo intocado agenda por `generationId`.
- **O formato sai da PROPORÇÃO** (`classificarFormato`), não do
  `inferTemplateType` do persist — aquele chama de STORY tudo mais alto que
  largo, e o feed 4:5 caía no coletor de story. Corte em 1,5, entre 1,25 e 1,78.
- Teto de 25MB e 20 arquivos por chamada; PNG/JPG/WebP (o formato real é lido
  pelo sharp, não pela extensão). Arquivo com falha **não derruba a leva** — a
  resposta traz `artes[]` e `falhas[]`.
- **O conector remoto (`/api/mcp`) não tem como fazer isso**: os argumentos de
  tool são texto do modelo e o servidor está na Vercel, sem acesso ao disco de
  quem conversa. Pelo celular/claude.ai o caminho continua sendo `pedir-foto`.

### Canal da arte: quem assina e por onde entrou (03/09/2026)

A Roberta filtrava a galeria por ela e via "artes que não fez". Medido: o
filtro é exato por `createdBy = clerkId`, e as dela eram dela — o que estava
quebrado era o OUTRO lado: **1.289 das 3.013 artes da carteira em 60 dias
estavam assinadas com `Project.userId`** (o id INTERNO do dono, cuid), que
não é membro do Clerk. Elas caíam num avatar "Usuário" sem nome e o card
mostrava "?". Três produtores faziam isso: a API externa do Claudinho
(`/api/external/creatives` → `createArteRapida`), o MCP local
(`upload-creative`, `create-arte-rapida`) e a mídia de post.

- **`Generation.canal`** (TEXT, indexado; precedente de `SocialPost.origem`):
  `claudinho` | `claude-ai` | `claude-code` | `studio`. É ORTOGONAL ao autor —
  `createdBy` continua sendo quem assina — e é decidido na **porta de
  entrada**, nunca no serviço: o mesmo `createArteRapida` serve ao Claudinho
  (rota externa) e ao conector. Módulo puro em `src/lib/creatives/canal.ts`.
- **No catálogo MCP o canal sai do principal** (`canalDoPrincipal`, tools.ts):
  token OAuth → `claude-ai`; principal de serviço com `clientId:
  'claude-code-local'` (o que o servidor stdio se declara) → `claude-code`;
  serviço sem marcador → `claudinho`. O handler não recebe a superfície, só
  o principal — por isso o marcador mora no `clientId`.
- **O filtro "Origem" da galeria** (`?origem=`) aceita os 4 canais mais
  `melhoria` (= `sourceGenerationId IS NOT NULL`, venha de onde vier).
  `studio` inclui canal NULO. Valor desconhecido é ignorado, nunca erro.
- **Id que não é clerkId é AUTOMAÇÃO** na UI (`ehClerkId`): o seletor de
  membros o rotula "Automações (Claudinho / Claude)" com ícone de robô, e o
  card mostra o canal em vez do avatar. Quem separa os canais é o filtro de
  origem, não o de membro.
- 🔴 **O histórico não separa Claudinho de Claude Code**, nem `claude-ai` de
  `studio`: as duas duplas gravavam assinatura idêntica. O backfill
  (`scripts/backfill-canal-das-artes.ts`, dry-run por padrão) marca id
  interno + `arte-enviada|arte-rapida|compositor|ajuste-arte` como
  `claude-code` (65 linhas de `arte-rapida` em toda a base, quase todas de
  ago-set/2026) e clerkId como `studio`. O rótulo só é EXATO daqui para
  frente.
- **Selecionar todas** entrou na barra da galeria: alcança o que está
  CARREGADO (páginas de 60); com mais por vir, o rótulo diz "as N carregadas".
  Baixar e excluir em lote já existiam e agora têm como ser usados de verdade.

### Quem assina a arte pedida pelo Claude: a pessoa do MAC (04/09/2026)

O Ciro e a Roberta usam a MESMA conta do Claude em Macs diferentes, e toda
arte pedida pelo conector ou pelo servidor local saía assinada pelo DONO do
projeto ("Automações"). A identidade não pode vir do Claude — vem da máquina.

- **`.studio-autor` na raiz do repositório** (gitignored, um por Mac) guarda o
  e-mail de login no Studio; `scripts/mcp-wrapper.sh` o exporta como
  `STUDIO_AUTOR`, e `src/lib/mcp/autor-local.ts` resolve o User e monta o
  principal do servidor local como PESSOA (`kind: 'user'`, `clientId`
  `claude-code-local`). Valor que não é usuário do Studio AVISA no stderr e
  cai no comportamento antigo — assinar errado em silêncio não.
- **`createdBy` opcional em `persistAndRenderCreative`, `comporPeca`
  (`autor`), `enfileirarPeca`, `createArteRapida` e `importarArte`**: quem
  pediu assina (no conector, o dono do token OAuth; no local, a pessoa do
  Mac); sem isso, o dono do projeto. `decididoPor` continua sendo a auditoria.
- **`canalDoPrincipal` olha o `clientId` local ANTES do tipo**: o principal do
  Mac agora é `user`, e sem essa ordem a arte do Claude Code viraria
  `claude-ai`.
- Servidor stdio lê o arquivo só ao subir: mudou o `.studio-autor`, reinicie o
  Claude Code. O `.mcp.json` do repositório tem o caminho ABSOLUTO deste Mac —
  em outra máquina o servidor entra pelo `claude mcp add` com o caminho local.

### O halo como efeito do editor: fundo justo à tinta (02/09/2026)

O halo do canvas de design entrou no editor Konva como extensão do efeito
`background` do texto (`fit: 'texto'` cobre só as linhas escritas; `blur`
borra a mancha nos próprios pixels). Plano e placar em
`docs/PLANO-2026-09-02-HALO-NO-EDITOR.md`; contrato puro em
`src/lib/creatives/halo/fundo-de-texto.ts`, editor em
`konva-text-background.tsx`, controles em `fundo-de-texto-controls.tsx`
(painel Efeitos e painel Gradientes, o MESMO componente).

- **A tinta é medida pela MESMA função nos dois motores** (`retanguloDasLinhas`,
  a conta do `_sceneFunc` do Konva.Text): o editor passa o `textArr` do nó, o
  servidor as linhas de `layoutTextLines` — extraído dos três renderers de
  `textMode` para a mancha medir a MESMA quebra do desenho. Paridade medida por
  perfil de luminância: ≤ 15 níveis de diferença dentro da mancha.
- 🔴 **O teto do stack blur é ~180, por OVERFLOW de int32 — não 255 pela
  tabela.** `(sum * mul[r]) >> shg[r]` com shift com sinal estoura 2³¹ entre o
  raio 180 e 190; raio 200 devolve faixas verticais e a mancha SOME, no Konva e
  no port. `escalaDoBlur` borra em buffer reduzido (`k = ceil(raio/160)`,
  `pixelRatio: 1/k` no cache do editor, offscreen a `1/k` no servidor) — a
  mancha é lisa, a redução é invisível e o custo fica limitado. O port satura
  em 180 para quem não passar pela escala. Vale para `ShapeNode` e
  `renderShapeBlurred` também (os halos que o servidor cria por bloco).
- 🔴 **O cache do `ShapeNode` sem `pixelRatio` nascia no devicePixelRatio**: em
  retina o borrão do editor saía com METADE do raio da arte publicada. Sempre
  declarar o pixelRatio de um cache que vai receber filtro.
- **Tinta em `opacity` do NÓ, nunca misturada na cor**: mudar a opacidade não
  refaz o cache do blur; o raio refaz (por isso o desfoque grava ao soltar).
- 🔴 **`Rect` irmão ANTERIOR do `Konva.Text` não vê o ref do texto no primeiro
  commit** (React liga refs e roda layout effects na ordem da árvore). Halo
  salvo abria em 0×0 até a próxima mudança; `pronto` reexecuta um frame
  depois. Todo componente-irmão que dependa do nó de outro precisa disso.
- **O fundo agora acompanha a ROTAÇÃO e SEGUE o arraste** (desenhado dentro do
  transform no servidor; reposicionado no `dragmove`/`transform` no editor). O
  Rect antigo lia `layer.position` do estado e ficava parado até o dragend.
- 🔴 **`api.get` devolve TEXTO quando a resposta não é JSON**: um redirect para
  `/sign-in` na chamada de cores virou `colors.map is not a function` e derrubou
  o editor. `useBrandColors` garante array; consumidor novo de lista faz o mesmo.
- **Textos AGRUPADOS dividem UMA mancha** (`bloco-de-fundo.ts`, F4): os textos
  de um grupo estilo Canva (`metadata.groupId`, Cmd+G) com fundo ligado viram
  um bloco — a união das tintas, desenhada pelo LÍDER (menor `order`) com a
  configuração dele; os membros não desenham. Sem grupo, cada texto tem a sua,
  e manchas vizinhas se sobrepõem (tinta 0,6 vira 0,84). O bloco é pelo GRUPO,
  não por proximidade, de propósito: mancha que se funde sozinha ao aproximar
  textos é surpresa; agrupar é gesto. O servidor enxerga os irmãos por
  `options.camadasDoDesign` (renderDesign preenche; renderLayer avulso cai no
  fundo por texto). Texto girado ou curvo fica fora do bloco.
- 🔴 **Follow por eventos de ATRIBUTO (`xChange`…), nunca por `dragmove`**: o
  arraste em grupo move os irmãos com `position()` por código, sem evento de
  drag neles. `Node._setAttr` dispara `<attr>Change` em qualquer escrita.
- **Reflow em grupos manuais foi MANTIDO** (decisão de 02/09): editor e
  servidor leem o mesmo `groupId`; refluir só de um lado divergiria a arte.
- Rich-text e texto curvo continuam sem fundo, como já eram.

### Gradientes da marca e ícone nas combinações de texto (10/09/2026)

Pedido da Roberta: o verde da arte "Comece a Semana com Sabores Real" (feita
pelo Claudinho) não saía no editor, e a Real precisava do gradiente e de um
bloco de texto com os ícones de local e horário prontos para usar.

- **Gradiente de uma marca só mora em `GRADIENTES_POR_PROJETO`**
  (`src/lib/assets/gradients-library.ts`); o painel Gradientes mostra a seção
  "Gradientes da marca" apenas no projeto da chave. Hoje: Real (1), Verde Real
  e Creme, no rodapé e no topo. Mesmo precedente de mapa por projeto de
  `CAIXA_DA_MANCHETE` e `LOGO_MODE_POR_PROJETO`. Cliente novo = entrada no mapa
  e deploy; se virar rotina, o caminho é uma tabela por projeto, como a
  `FontCombination`.
- 🔴 **Toda parada de um gradiente de marca tem a MESMA cor; só a opacidade
  muda.** O preset "Preto para Transparente" com a cor trocada numa ponta
  deixava a outra em `#000000` com opacidade 0 — o editor (Konva) e o render
  (napi-rs) interpolam cor e opacidade separados, sem pré-multiplicar, e o
  meio acinzenta. `gradients-library.test.ts` trava isso.
- **A curva foi MEDIDA, não chutada**: a foto original do acervo alinhada à
  arte do Claudinho, opacidade estimada linha a linha, ângulo e curva
  ajustados simulando a interpolação do canvas, e conferência final com o
  `CanvasRenderer`. Resultado: 11° (mais alto do lado do texto), 11 paradas,
  sólida no pé e sumindo perto do meio da arte. Duas paradas lineares deixam um
  "degrau" visível onde o verde começa. O topo é o espelho vertical (169°).
- **Combinação de texto aceita ícone** (`FontComboElement.icon`: url, largura,
  altura e deslocamento em px na base 1080, relativos ao canto superior
  esquerdo do texto). `buildComboLayers` emite a camada de imagem logo depois
  do texto, no mesmo `groupId` e `stackOrder` — o reflow da pilha empurra texto
  e ícone juntos. `capturarCombinacao` devolve o ícone ao salvar: pela marca
  `metadata.iconeDe` ou, sem ela, pela geometria (à esquerda do texto, com o
  centro na altura da caixa, a no máximo três larguras de distância).
- **A arte sem modelo (`createArteLivre`) aplica o ícone também**, porque usa o
  mesmo `buildComboLayers`; `listar-combinacoes-de-texto` marca `icone: true`
  no elemento que tem um.
- **Dados criados junto**: template 427 "Real Gelateria — Gradientes e textos
  da marca" (6 páginas de CONTEÚDO, não modelos), elementos 429–432 (alfinete
  e relógio em creme e em Verde Real) e as combinações "Local e horário — creme
  sobre verde" e "— verde sobre creme". ⚠️ Enquanto este código não está no ar,
  o editor antigo ignora o `icon` (mostra só os textos) e **apaga o ícone** se
  alguém salvar a combinação por lá.
- 🔴 **Ao abrir as páginas, os ícones do grupo subiam — e o editor SALVAVA
  isso.** Dois defeitos do crescimento automático de texto
  (`konva-editable-text.tsx`), que existiam antes e só apareceram com camada
  que não é texto dentro do grupo:
  1. Quando vários textos do grupo são medidos no mesmo instante, a pilha
     desloca os de baixo, mas cada texto regravava a própria posição com o y
     lido no render — desfazendo o deslocamento. Só as camadas que não são
     texto ficavam deslocadas. Com âncora no topo, a medida agora grava só a
     altura (`ajusteDeAlturaMedida`, `src/lib/texto-altura-automatica.ts`).
  2. As MINIATURAS de página também mediam: o `onChange` delas é no-op, mas o
     reflow da pilha escreve direto no editor, então cada miniatura montada
     empurrava o grupo de novo (os ícones da página 5 subiram em dobro). Texto
     com `disableInteractions` não mede mais.
  ⚠️ Consequência da correção 1: num grupo cuja altura gravada difere da que o
  editor mede, os TEXTOS de baixo passam a acompanhar a pilha ao abrir a
  página, como a regra sempre quis (e como o `reflowComboStack` do servidor
  já fazia). Para não mexer em nada ao abrir, a altura gravada precisa ser a
  medida — nas páginas da Real ela já é (74, 120, 48, 48).
- **Os ícones se ajustam DENTRO da edição da combinação** (pedido do Ciro, no
  mesmo dia): o painel lista o ícone de cada texto e deixa trocar, pôr e tirar
  (`panels/combo-icones.tsx`); o nome da linha seleciona o ícone no canvas
  para mover e redimensionar. Antes eles não estavam travados — o modo de foco
  escurecia toda imagem a 12% sobre o fundo #141414, e o ícone sumia de vista.
  Hoje ele só escurece a imagem que NÃO é ícone de texto (`ehIconeDeTexto`).
- 🔴 **O controle de ícone não pode morar na aba Elementos**: trocar de aba
  desmonta o painel de Texto e o estado `editando` (os ids que o salvar
  captura) se perde. Pela mesma razão, ícone POSTO durante a edição entra em
  `editando.layerIds` — o salvar só enxerga esses ids.
- **Trocar a imagem mantém o CENTRO e a ÁREA** (`caixaDoIconeTrocado`,
  `src/lib/font-combinations-icones.ts`): manter a caixa com `contain`
  encolheria o relógio quadrado dentro da caixa alta do alfinete. Ícone novo
  copia tamanho, vão e altura de um ícone que já existe na combinação
  (`iconeNovoParaTexto`); sem nenhum, usa a proporção dos ícones da Real.
- **"Salvar seleção como combinação" leva os ícones selecionados** junto com os
  textos; antes filtrava só texto e a combinação nova nascia sem ícone.

### 🔴 "Essa classe não gera CSS neste repo" era o MÉTODO de medição (05/09/2026)

Este arquivo e a memória do projeto carregavam uma família inteira de "classes
mortas" (`bg-zinc-400`, `grid-rows-2`, `sm:w-28`, `w-[7rem]`, `lg:max-w-sm`,
`sm:ml-auto`, `sm:inline-flex`, margem negativa, `h-[…vh]`, `min-w-[7rem]`,
`bottom-1.5`…), com a receita de fugir delas por estilo INLINE. **Não existe
classe morta. O que havia era uma medição que não podia dar outro resultado.**

O método usado nas três rodadas foi *injetar o elemento na página servida pelo
app e ler `getComputedStyle`*. Tailwind é **JIT**: ele gera regra só para a
classe que ENCONTRA no fonte varrido. Uma classe que ainda não está em lugar
nenhum do `src/` não tem regra — e não teria em projeto Tailwind nenhum. A
medição perguntava "esta classe que eu ainda não escrevi existe na folha de
estilo?", e a resposta é sempre não.

A própria memória tinha registrado o sintoma sem reconhecer a causa: *"vale a
variante que JÁ EXISTE em outro ponto do código-fonte, não a variante em si"* —
`sm:max-w-sm` vive e `lg:max-w-sm` morre, `top-1.5` vive e `bottom-1.5` morre,
`h-[calc(100dvh-12rem)]` vive e `h-[calc(100dvh-10rem)]` morre. Isso é a
descrição exata do JIT, não de uma build quebrada.

**A prova, medida em 05/09/2026** compilando `src/app/globals.css` com o
`@tailwindcss/postcss` **do projeto** (4.1.17), com os 9.001 `.tsx` de
`.claude/worktrees/` no caminho: `.grid-rows-2`, `.bg-zinc-400` (com
`--color-zinc-400: oklch(70.5% 0.015 286.067)` definido), `.sm\:w-28`,
`.lg\:max-w-sm`, `.sm\:ml-auto`, `.sm\:inline-flex` e `.border-emerald-500`
estão **todas** no CSS gerado — porque hoje elas aparecem no fonte, ainda que
só dentro dos comentários que as declaram mortas. E uma classe INÉDITA
acrescentada na hora a um arquivo do `src/` (`grid-rows-3`) sai na compilação
seguinte. Não há teto de arquivos, não há classe fora do alcance da varredura,
e **escopar `@source` não resolveria nada** — não há o que resolver.

O que fica:

- 🔴 **Nunca meça uma classe injetando o elemento no navegador.** Escreva a
  classe no fonte, deixe o dev server reconstruir (ou compile o CSS) e SÓ
  ENTÃO meça. Sem isso a medição responde outra pergunta.
- 🔴 **`grep` no fonte também não prova**: o scanner é textual e não distingue
  código de comentário — ele gera a classe a partir do próprio comentário que
  a declara morta. Hoje a ÚNICA ocorrência de `grid-rows-2` no repositório é
  esse comentário. Prova é o seletor no CSS COMPILADO.
- **Classe que não aplica com a regra presente é outra coisa**: precedência
  (`dark:bg-zinc-100` do Button vencendo `bg-…` sem prefixo — ver "Modificador
  vence classe sem prefixo") ou recorte de ancestral (`[class*="container"]` do
  `globals.css`, ver a seção da galeria). As duas continuam valendo e são
  reais; o que era falso é "o Tailwind não gerou".
- **O estilo inline que já está no ar NÃO foi revertido**, e não precisa ser:
  funciona, e trocá-lo em massa mexeria em tela publicada por estética de
  código. O que muda é a REGRA — não escreva inline novo por causa desta
  crença.
- ⚠️ **Limite**: esta medição é de COMPILAÇÃO de CSS. Não voltei ao navegador
  para confirmar que `grid-rows-2` desenha a grade no card; quem reabilitar uma
  dessas classes confere na tela depois de reconstruir.

### O autosave da página grava por UMA fila (03/10/2026)

O efeito de autosave do `PageSyncWrapper` não tinha trava de gravação em voo:
enquanto o PATCH não voltava, `lastSavedLayersRef` seguia velho, e todo
re-render que mexesse nas dependências do efeito agendava OUTRO PATCH com o
mesmo conteúdo. A identidade de `savePageState`/`updatePageThumbnail` muda com o
estado da mutação (`useMutation` devolve objeto novo ao sair e ao voltar), então
o próprio voo reagendava o save. Medido no dev (PATCH de ~5 s): 15 gravações da
mesma página em 100 s, com a miniatura alternando entre null e o JPEG.

- **Toda escrita da página passa por `criarFila`** (`src/lib/editor/fila-de-gravacao.ts`,
  puro, com teste): autosave, `descarregar`, o flush de aba escondida/saída, o
  save da página que sai na troca e a miniatura. Nunca dois PATCHes em voo.
- **O pendente é lido quando a vez CHEGA** (`criarAutosave`), nunca quando foi
  pedido: pedidos durante o voo viram UM PATCH seguinte com o estado mais novo,
  e pedidos antes de a vez começar se fundem nela.
- **Miniatura velha não é gravada**: ela leva a versão da gravação de estado em
  que foi capturada (`versaoGravadaRef`) e é pulada se outra gravação veio
  depois — sem isso a miniatura do estado anterior chegava depois do PATCH que
  a apagou (`thumbnail: null` da página-vídeo).
- **Funções do contexto entram nos efeitos por ref** (`atuaisRef`), nunca como
  dependência: dependência delas é o que reagendava o save a cada voo. A trava
  da miniatura pendente (efeito 1b) também é ref — local ao efeito, ela zerava
  quando o efeito re-executava e empilhava gerações.
- ⚠️ No `beforeunload` com um PATCH em voo, a edição feita depois dele espera a
  vez e pode não sair antes de a aba fechar (antes saía em paralelo, com risco
  de o estado velho chegar por último). O "Salvar e Voltar" usa `descarregar`,
  que espera.
