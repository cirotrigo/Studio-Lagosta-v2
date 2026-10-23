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

## `svg-path`: um traçado só para editor e servidor (CP-V0, 20/10/2026)

A camada `shape` com `shapeType: 'svg-path'` era desenhada por dois códigos com dois parsers: o editor pelo
`Konva.Path.parsePathData` sem aplicar `pathFillRule`, e o servidor pelo `Path2D` do Skia, com o contorno dividido pela
escala MÉDIA da caixa: em 300×100, um contorno de 8 px saía com 4 px em cima e 12 px dos lados (medido no CP-V0 com
fixture sintética no canvas do Node, `src/lib/vetor/__tests__/paridade-pixel.test.ts`).

- **Todo desenho de `svg-path` passa por `src/lib/vetor/`** (`tracar.ts` + `desenhar.ts`): o editor usa
  `shapeKonvaDoSvgPath` (atributos e `sceneFunc` do `Konva.Shape`, pintura pelo `fillStrokeShape`, que também desenha o
  canvas de hit com a mesma regra) e o `RenderEngine` usa `desenharSvgPath`. Nenhum dos dois traça por conta própria.
- **Semântica única:** o path é traçado já escalado para a caixa e o transform é restaurado antes de pintar, então o
  contorno tem `strokeWidth` px da camada nos dois eixos; `pathFillRule` vale nos dois lados; junção redonda; pontas por
  `style.tracoPontas` (`butt` por padrão). No servidor com `scaleFactor` ≠ 1 (a miniatura avulsa) a caixa escala e o
  `strokeWidth` não, como nas outras formas.
- **Área de clique:** com `evenodd`, clicar no furo deixa de selecionar a camada (o Konva aplica a regra também no
  canvas de hit). É o mesmo que se vê.
- **Parser único: o do Konva**, importado de `konva/lib/shapes/Path` (o pacote raiz exige o `canvas` nativo no Node;
  o import profundo deixa `globalThis.Konva` definido no processo do servidor). Ele diverge do SVG em quatro casos, todos
  recusados pelo validador: comando relativo logo depois de `Z` sem `M` (parte do último ponto, não do início do
  subpath); flags de arco coladas (`1010` vira um número); número `10.e5` (vira dois); raio de arco ≤ 0 (ângulos errados
  ou NaN — o traçado PULA esse arco nos dois lados, em vez de o navegador lançar `IndexSizeError`). O bundle da função de
  render na Vercel com esse import **não foi provado** no CP-V0 local.
- **`validarPathData`** (`src/lib/vetor/validar.ts`, puro): texto não vazio, ≤ 16 KB, gramática de path do SVG
  restrita ao que o parser do Konva lê igual (começa com `M`, desenha algo, nada depois de `Z` sem `M`, flags de arco
  0/1 separadas, raio > 0, números finitos, vírgula só entre números). Ainda **não** está ligado nas portas de escrita
  (é o CP-X2, que precisa antes da varredura das camadas existentes para não travar o autosave).
- O `svg-path` não depende mais de `Path2D`: a miniatura avulsa (`generateThumbnail`) passou a desenhá-lo. Path que
  lança no desenho é ignorado com aviso (não derruba a arte), como era com o `Path2D`. Máscara de
  imagem e ícone continuam com `Path2D` no servidor; a máscara do editor já usa o traçado único.
- ⚠️ **Muda pixel de propósito**: o contorno do servidor (px da camada), o furo do `evenodd` no editor e o parser do
  servidor. Antes do merge, o inventário de diferenças (incluindo as `PostRenderProof` já gravadas) e, depois do deploy,
  o re-render dos agendados; `laterPostId` não nulo continua intocável.

## Espelhar e travar a proporção da forma (CP-V1, 21/10/2026)

- **O espelho da forma `svg-path` mora no traçado único** (`src/lib/vetor/tracar.ts`). `style.flipH`/`style.flipV`
  refletem o path em torno do centro da CAIXA, antes da escala do path e dentro do mesmo `save`/`restore`. Por isso:
  - **a caixa e a rotação não mudam:** uma forma girada espelha no próprio referencial;
  - **o contorno continua em px da camada;**
  - **`fillRule` e `tracoPontas` valem iguais.**
  Editor (`shapeKonvaDoSvgPath`) e servidor (`desenharSvgPath`) recebem o espelho pelo mesmo `pinturaDoSvgPath`.
- **Só `true` literal espelha** (`style.flipH === true`). Sem os campos, a sequência de chamadas é exatamente a do CP-V0:
  camada antiga não muda um pixel.
- **Só o `svg-path` espelha.** Retângulo, círculo, triângulo, estrela, seta e linha NÃO têm espelho, e o painel não
  oferece o botão para elas. Levar o espelho a outra forma exige o mesmo desenho nos dois renderers. Espelhar
  ARRASTANDO a alça continua bloqueado no `boundBoxFunc` do Transformer.
- **`style.manterProporcao`** é só o gesto do editor, e o render não a lê. **Toda forma** com `true` redimensiona com
  `keepRatio` e **só pelas alças dos cantos**, porque o `keepRatio` do Konva não vale nas alças do meio.
  - **Quem decide:** `src/lib/konva/trava-de-proporcao.ts` (puro), que o Transformer e o painel consultam.
  - **O que não muda:** imagem, logo e elemento seguem proporcionais com as 8 alças; texto e forma sem a trava, livres
    (Shift trava).
  - **Multisseleção:** o Transformer é um só, então uma forma travada na seleção faz o grupo todo redimensionar pelos
    cantos.
- **Gate da revisão:** `style.manterProporcao` está classificada como **inerte** (`gate-v3`, impressão digital
  `gate-gate-v3.json`; os JSONs v1 e v2 continuam imutáveis). O `svg-path` continua não suportado pelo gate.

## Campo de texto da cor grava só ao confirmar (21/10/2026)

O `<Input>` de "Preenchimento" e "Cor da borda" da forma era controlado pelo valor SALVO e gravava a cada
tecla: `#111` (cor completa no meio de `#111827`) virava `rgba(17, 17, 17, 1)`, o campo passava a mostrar
isso e o resto da digitação colava atrás — `rgba(17, 17, 17, 1)827` foi gravado no banco (smoke do CP-V1).

- **`CampoDeCorDigitada`** (`properties-panel.tsx`) guarda o rascunho local e grava no Enter ou ao sair do
  campo; Esc e texto inválido voltam ao salvo. `key={layer.id}`: o rascunho não atravessa a troca de seleção,
  e é DESCARTADO (não só escondido) quando o valor muda por fora (seletor, alpha, paleta, undo).
- **Clicar em outra camada no palco desmonta o campo ANTES do blur** (a seleção muda no mousedown): sem
  cuidado o rascunho se perdia calado. Com rascunho, um `pointerdown` FORA do campo (captura no document,
  antes do palco) confirma na camada atual. **Desmontar sem gesto descarta** (troca de página, camada removida,
  editor fechado): gravar no unmount acertaria a página errada quando páginas repetem o id da camada. O campo
  recebe a camada (`origem`): trocar de objeto também descarta, mesmo com o mesmo id e a mesma cor.
- **`corDigitadaParaGravar`** (`src/lib/shape-style.ts`) confere o formato com números de verdade, converte a
  sintaxe moderna com espaços para vírgulas (o helper só entende espaço com `/`: `rgb(1 2 3)` saía
  `rgba(1 2 3, 1)`) e exige que entrada E saída passem em `CSS.supports('color', …)`. `rgb(10 20% 30)`
  (moderna, mistura número e %) é recusado de propósito: a conversão ficaria inválida.
- Nunca chame `applyOpacityToEditableColor` com texto parcial da digitação.
- **O seletor nativo e a paleta da marca da forma mostram os CANAIS da cor salva** (`corParaSeletor`,
  `src/lib/editor/cor-do-seletor.ts`, pelo `lerCor`): `rgba(15, 118, 110, 1)` aparece `#0f766e`, e `rgba(…, 0)` também
  mostra os canais; o alfa fica no `style` e no slider. Só o literal `transparent`, o ausente, o ilegível e o contextual
  mostram o fallback (`#2563eb` preenchimento, `#1e3a8a` borda). Antes, toda cor não-hex caía no azul do fallback e a
  paleta acendia o swatch errado. Só apresentação: nada grava ao renderizar (22/10/2026).

## O push do desktop não perde o que o desktop não representa (CP-X0, 21/10/2026)

O `PUT /api/templates/[id]` com `designData.pages` é o push do app desktop: o Salvar do web não manda `pages`. O
desktop devolve uma forma só com `fill`, `strokeColor`, `strokeWidth` e `shapeType` (`localLayerToWeb` no normalizador
dele) e manda só as páginas que conhece. O PUT gravava isso por cima: o `svg-path` perdia o path, a máscara sumia, e a
página feita no web era apagada, desvinculando os posts agendados dela (`SocialPost.pageId` é SetNull).

- **Camadas**: a mescla é feita por `mesclarCamadasDoDesktop` (`src/lib/templates/guarda-do-push-do-desktop.ts`),
  dentro do `camadas(base)` de `gravarCamadasComRevisao`, ou seja, sobre a base RELIDA a cada volta do
  compare-and-set. O payload vence no que manda, e o que ele não traz (topo, `style`, `metadata`) fica da base.
- **Camada protegida**: `svg-path`, `pathData`/`pathViewBox`/`pathFillRule`, `mask`, `vetor`, `metadata.compositor`
  ou `metadata.slot`. A identidade dela (`type`, `shape`/`style.shapeType` e essas chaves) vem SEMPRE da base, e
  `null` no payload não apaga. Se o payload troca o `type` ou a forma, a resposta é **409 `PUSH_ALTERA_VETOR`**. Se
  ela some do payload, **409 `PUSH_APAGARIA_CAMADA`**.
- **Páginas**: página ausente do push é **preservada** (`paginasPreservadas` na resposta). A página casada por
  ordem/nome com camada protegida dá **409 `PUSH_PAGINA_INCERTA`**. Dois itens do payload no mesmo destino dão **409
  `PUSH_DESTINO_REPETIDO`**, e id repetido dá **409 `PUSH_PAGINAS_DUPLICADAS`**.
- **JSON ilegível** (base ou payload; `id` ausente; `style`/`metadata` não-objeto) dá **409** e nunca vira camada nova.
- **Toda recusa LANÇA de dentro da transação**: o `$transaction` desfaz o template e as páginas já gravadas, e a
  rota responde 409 fora dela.
- 🔴 **Nada com efeito externo antes da guarda.** A miniatura do push (`thumbnailUrl`) só passa pelo
  `guardarMiniatura` DEPOIS do commit das páginas, numa escrita separada: o upload sobrescreve o caminho estável
  `templates/thumbnails/<id>` no Blob, e a transação não desfaz Blob. Limite: essa atualização é pós-commit e não
  atômica com as páginas, e pode ficar PARCIAL (bytes novos no Blob com a coluna ainda antiga, se o update da coluna
  falhar depois do upload); as páginas valem e o erro vai para o log. O Salvar do web (sem `pages`) continua subindo
  a miniatura antes, como sempre.
- **O `designData.pages` do template é reconstruído das páginas FINAIS** na mesma transação: é a cópia que o
  `GET /api/templates/[id]` devolve ao desktop (`fetchRemoteTemplateById`). Gravar o payload cru devolveria ao app a
  forma sem o path e sem as páginas preservadas, e o push seguinte as perderia.
- **Limite**: camada COMUM que só existe no web e não está no push sai, como antes. Distinguir isso exige versionar o
  pull do desktop.

## /gerar-criativo desenha o `svg-path` (CP-X1, 21/10/2026)

O PNG que o assistente exporta (`CanvasPreview.exportToDataUrl`) é o que vai ao ar: o `finalize` o grava como
`Generation.resultUrl` e o agendamento publica esse arquivo, sem re-render no servidor. A prévia desenhava toda
forma como `Rect`, e o export zerava o `stroke` do nó selecionado, o que apagava contorno legítimo.

- **A prévia desenha `svg-path` pelo adaptador do editor** (`shapeKonvaDoSvgPath` + `pinturaDoSvgPath`, por
  `configDoSvgPathNaPrevia` em `src/lib/gerar-criativo/previa-do-vetor.ts`). Ela nunca pinta direto no ctx do Konva.
  A opacidade da camada vai no nó, a do canal na cor, e o nó leva `perfectDrawEnabled: false`: assim a opacidade se
  aplica por operação, como o `globalAlpha` do servidor. Com o padrão do Konva, preenchimento + contorno com
  opacidade < 1 são compostos num buffer e a faixa de sobreposição sai diferente do servidor (o editor ainda usa o
  padrão; divergência anterior, fora do CP-X1).
- **Candidato** = `shape` + `svg-path`, com ou sem `pathData`. **Desenhado** = fora de `hiddenLayerIds` e
  `visible !== false`. `diagnosticoDoVetor` recusa no candidato desenhado:
  - path ausente ou que não passa no `validarPathData` (só neste fluxo; as outras portas são o CP-X2);
  - `pathViewBox` presente e malformado, **inclusive `null`** (ausente, `undefined`, vale como `0 0 100 100`);
  - efeito que a prévia não desenha: `effects.*` ligado (blur só com raio > 0), `style.shadow`, `vetor.partes`.

  Nada disso vira retângulo nem é omitido em silêncio. A tela bloqueia "Gerar criativo" com o motivo, e o export
  interrompe com o diagnóstico.
- **O export não muta camada nenhuma.** Transformer, realce de seleção (nó próprio `__ui-da-previa`, que substitui o
  `stroke` azul na imagem) e guias saem do PNG só por visibilidade. O estado de snap não é tocado, para o React não
  desmontar as guias no meio. Escala, posição e visibilidade voltam no `finally`, também quando o export falha.
- **Trava de proporção**: forma com `style.manterProporcao` redimensiona na prévia com `keepRatio` e só pelos
  cantos (`travaDaPrevia`). O resto continua livre, com 8 alças.
- **`finalize` — precedência**: 401 → 400 (zod; `previa` só aceita `'vetor-v1'`) → 404 (acesso, como antes) →
  **422 `VETOR_SEM_SUPORTE_NA_PREVIA`** (o diagnóstico acima, com ou sem a marca) → **409 `PREVIA_DESATUALIZADA`**
  (vetor desenhado sem `previa: 'vetor-v1'`, ou seja, a aba anterior ao CP-X1). Em recusa: nada de `put`,
  `Page.create`, `Generation.create`, `AICreativeGeneration.create` nem `registrarUsoDeModelo`. Sem vetor desenhado,
  o comportamento é o de antes.
- 🔴 **A marca `previa` não é prova de pixel.** Ela separa o fluxo atualizado do app da aba antiga. Uma chamada
  forjada por quem tem escrita no projeto, com a marca e um PNG qualquer, continua aceita, como para toda camada.
  Não afirme "nenhum caminho publica retângulo" sem essa ressalva. Prova de pixel no servidor seria renderizar a
  página no `finalize`.
- **Prova**: o harness `tests/harness/cp-x1` (`npx playwright test -c tests/harness/cp-x1/playwright.config.ts`)
  monta o `CanvasPreview` REAL no Chromium, sem rede, login, banco ou Blob, e compara o PNG do export com o
  `CanvasRenderer`. As tolerâncias foram medidas e não têm folga: fora da faixa de borda de 2 px nada difere; na
  borda, delta de canal ≤ 1 e contagem ≤ o teto medido por caso. Um controle negativo mostra que contorno apagado
  ou acinzentado fora das amostras reprova.
- **Fora do CP-X1**: o fundo da prévia é sempre branco (o modelo não é passado), e as formas que não são `svg-path`
  ainda saem como `Rect` na prévia.

## Forma vetorial inválida não é gravada pelas portas P1–P5 (CP-X2b, 21/10/2026)

O `svg-path` com dado inválido era gravado em silêncio: o render do servidor pula o path ruim com um `console.warn`,
o post sai sem o vetor e a `PostRenderProof` é gravada sem erro. O validador (`validarPathData`, `lerCor`) existia,
mas nenhuma porta de escrita o chamava.

- **Quem decide:** `exigirVetoresValidos` (`src/lib/vetor/guarda-de-porta.ts`, puro) sobre `problemasDoVetor`
  (`validar-camada.ts`). Ele lança `VetorInvalido`, o **único** erro que vira **422 `VETOR_INVALIDO`**, no corpo
  `{ error, codigo, camadas: [{ id, motivos, paginaId? }] }`. Qualquer outro erro segue o mapeamento que a porta já
  tinha (500 no PATCH da página, 400 "Dados inválidos" no PUT do template).
- **Candidato:** `type === 'shape'` e `style.shapeType === 'svg-path'`, visível ou não. O estado final **inteiro** é
  conferido, e não só a camada editada: uma página com `svg-path` inválido legado recusa a próxima escrita de
  camadas. Por isso a ativação depende da varredura G zerada.
- **Precedência preservada:** auth, acesso, corpo e zod continuam antes e com os mesmos códigos (P1 sem acesso 404; P2,
  P3, P4 e P5 403; o P5 segue lendo o corpo antes do acesso). A guarda entra depois deles.
- **Por porta:**
  - **P1 (PATCH da página):** (a) payload CRU antes da canonização, que chama `trim` na cor e daria 500 com
    `fill: 123`; (b) estado canonizado e reconciliado, antes da transação e em CADA volta do compare-and-set.
  - **P2 (PATCH da camada):** a cada volta, a camada fundida crua → canonização → a lista final da página. A recusa
    lança de dentro da transação.
  - **P3 (POST de página):** depois do zod, antes do `create`.
  - **P4 (PUT do template):** `designData.layers` da RAIZ, sempre que vier, com ou sem `pages` (vai cru para
    `Template.designData`, que o render de generations lê), antes de Blob e escrita. As páginas do push do desktop
    **não** são pré-conferidas: o X0 restaura da base o que o push omite (o normalizador real manda `svg-path` sem
    `pathData` e nunca manda camadas na raiz). Por isso só o estado **mesclado** é conferido, em cada volta, depois
    das recusas 409 do X0, que continuam iguais. Página nova é conferida antes do `create`. A recusa desfaz o
    template e as páginas.
  - **P5 (POST de template):** raiz e cada página antes da transação.
- **Autosave:** o 422 do PATCH da página não é mais silencioso (`src/lib/editor/recusa-do-vetor.ts` + o aviso do
  `PageSyncWrapper`).
  - **A recusa fica por página, com o pendente inteiro.** Ela sobrevive à troca de página, e o aviso continua
    visível com **Restaurar** (devolve a edição recusada à tela) e **Descartar**.
  - **Sem laço:** o mesmo conteúdo recusado não é reenviado; qualquer edição nova é.
  - **Linhagem:** só a correção gravada da própria edição recusada (mesma linhagem, captura mais nova) ou o descarte
    explícito resolve a recusa. Gravar só fundo ou áudio sobre a versão do banco, depois de voltar à página, não a
    apaga. Confirmação antiga também não.
  - **Saída do editor:** o `descarregar` lança enquanto houver recusa, para o "Salvar e Voltar" não sair como se
    tivesse gravado.
- **Campo de cor do `svg-path`:** além do `CSS.supports`, o campo exige `lerCor(texto) !== null`. Assim
  `currentcolor` e as CSS-wide são recusados na própria UI, que volta ao salvo. As outras formas não mudam.
- **Fora do X2b:** `font-combinations` (P6), MCP stdio (P7) e `reverter` (são o X2c). Aceite global do X2 = P1–P7 +
  reverter ativados juntos, depois da varredura G.
- ⚠️ **Limite anterior ao X2b:** a carga de página termina no `requestAnimationFrame` seguinte (`isSyncingRef`).
  Troca de página ou edição feita durante esse quadro faz os efeitos do `PageSyncWrapper` saírem cedo, e eles não
  reagem quando o ref zera: a troca pode não carregar a página nova, e a edição pode não disparar o timer até a
  próxima mudança. Isso vem da leitura do código e de timeouts do harness; não foi medido de forma determinística.
  O harness do CP-X2b aguarda dois quadros depois de cada carga, e o caso ficou fora da suíte.

## A forma inserida pelo painel sai na cor da marca, nunca na vitrine (CP-V2c, 23/10/2026)

- **Ponto único de inserção.** O painel de formas só insere pelo construtor puro `camadaDoElemento`
  (`src/lib/editor/camada-do-elemento.ts`), num `addLayer` só: uma camada, uma entrada de desfazer, selecionada. Ele
  **nunca lê** `fill`/`strokeColor` da definição (a vitrine do catálogo; um teste com cor-sentinela prova). A cor de
  cada canal é o papel do slot resolvido por `resolverCorDaMarca` (CP-V2a) e sai já pela
  `canonicalizeShapeStyleForPersistence`, a mesma do PATCH. Canal sem slot: `fill: 'transparent'`, sem `strokeColor`.
- **Proveniência em `style.vetor`** (`LayerStyle.vetor`, tipo `VetorDaCamada`): `{ asset: { id, versao }, papeis:
  { <canal>: <papel> } }`, com o canal FÍSICO (`preenchimento` → `fill`, `contorno` → `strokeColor`; a `line` pinta
  com `fill`). `manterProporcao: true` só no item `travado` (nunca grava `false`). A pílula leva
  `border: { width: 0, color: 'transparent', radius: 9999 }`: o raio não liga contorno nenhum nos dois renderers.
- **Escolher a cor à mão apaga o papel daquele canal** (`escolhaExplicitaDaCor`): campo de texto, seletor nativo e
  swatch, nos dois canais. Os sliders de transparência não são escolha de cor e não tocam o papel.
- **Bloqueio até os dados confirmarem** (`src/lib/editor/estado-da-insercao.ts`): `carregando` e `erro` não criam
  camada nem desfazer. Erro é consulta falhada, paleta que não é lista (HTML 200), cor sem `hexCode` em texto ou
  projeto sem a chave `assinatura`; **nunca** vira "marca sem cores". "Tentar de novo" refaz só o que falhou. O padrão
  do resolvedor só vale com ausência CONFIRMADA (lista vazia válida, `assinatura: null` ou campo ausente no JSON).
  Dado de outro `projectId` nunca entra: a paleta estrita volta marcada com o projeto, e o projeto tem o `id`.
- **Paleta estrita é opt-in:** `useBrandColorsEstrita` (key `['brand-colors', id, 'estrita']`) lança no que não é
  lista. O `useBrandColors` e os 4 consumidores dele seguem devolvendo `[]`. A aba Marca invalida
  `['brand-colors', id]` ao criar e apagar cor, o que renova as duas keys.
- **Catálogo vivo = 37 legados + 10 ativados**, num ponto só (`SHAPES_LIBRARY` no fim de `shapes-library.ts`). Os 37
  ganham `versao: 1` e um slot de preenchimento (D3: básicas e decorativas → destaque; setas e linhas → texto); os
  campos literais deles não mudam (o teste confere o sha256 da base). `SHAPE_CATEGORIES` cobre toda categoria usada.
  O remapeamento para as 8 categorias e a troca do `sparkle` pelo `spark-4` são do V2d.
- **Máscaras de imagem continuam as 26** (`MASCARAS_DE_IMAGEM`, por id); a ativação não as muda.
- **Gate da revisão:** `style.vetor.*` é **inerte** (`gate-v4`, impressão `gate-gate-v4.json`; v1–v3 imutáveis).
  Retângulo e pílula seguem medidos; `svg-path` e linha seguem fora (pelo desenho, nunca pela proveniência). O
  pseudonimizador das fixtures preserva `vetor` inteiro.
- **Um canto arredondado só, no editor e no servidor** (correção da pílula, 23/10/2026). O
  `RenderEngine.traceRoundedRectPath` faz a MESMA sequência do `Konva.Util.drawRoundedRectPath` (Konva 9.3.22: `arc`
  de círculo, mais o `closePath` do `Konva.Rect`), com o raio limitado a `max(0, min(r, w/2, h/2))` e retângulo
  quando o raio é ≤ 0. O `strokeRoundedRect` (borda da imagem) abre o path e reutiliza o helper. Antes era
  `quadraticCurveTo` com o controle no vértice: o canto saía 0,06 × raio mais "quadrado" (a pílula media 1.346 px).
  - Vale para forma `rounded-rectangle`, `rectangle` com `border.radius` (inclusive o **halo**) e o recorte e a borda
    de imagem/logo/elemento. O `rounded-rectangle` sem raio continua 24 pelo chamador.
  - Paridade medida no Node, 0 px: `paridade-presets.test.ts` e `paridade-cantos.test.ts` (sequência contra o
    `Konva.Util` real, raios 8/24/50/9999, caixa quadrada, alfa, rotação, recorte de imagem contra o `Konva.Image`).
    Não prova o navegador.
  - **Sem paridade, de propósito:** imagem com raio E borda (o editor traça antes da foto, o servidor depois) e raio
    negativo (o servidor desenha retângulo; o editor não desenha). O gradiente com raio segue quadrado no servidor e o
    fundo de texto usa outro helper (`arcTo`): nenhum dos dois mudou.
  - Helper novo de canto no servidor tem de seguir a sequência do Konva, ou o teste de sequência reprova.
- **Push do desktop (X0):** toda forma com `vetor` passa a ser protegida (inclusive `rectangle`/`line`); um `fill`
  vindo do desktop deixa o papel antigo em `vetor.papeis`. Comportamento aceito até aposentar o push (d02).

## Um rail só: o painel "Elementos" (CP-V2d, 23/10/2026)

- **"Formas" saiu do rail.** No computador e no celular, "Elementos" monta o `ElementosPanel`
  (`panels/elementos-panel.tsx`, ex-`shapes-panel.tsx`): busca, as 7 categorias do catálogo, "Outros" e a "Marca".
  Painel novo de formas não volta a ser um item separado no rail.
- **Categoria do painel é apresentação** (`src/lib/assets/painel-de-elementos.ts`, puro). Linhas, Formas, Orgânicos,
  Setas, Destaques, Editorial e Ornamentos; os 37 legados vão por `category` (`basicas` → Formas) e as decorativas
  **por id** (D3). O `category` literal dos 37 NÃO muda (o teste trava o sha256 deles). Item com categoria fora da
  lista, ou decorativa nova sem id mapeado, cai em **"Outros"** (que só aparece com item): nunca some.
- **`sparkle` só sai da exibição** (`OCULTOS_NO_PAINEL`), em favor do `spark-4` (D4a). Ele continua no
  `SHAPES_LIBRARY` e nas 26 máscaras (`MASCARAS_DE_IMAGEM`, mesmos ids e paths); camada antiga com `sparkle` não muda.
- **Busca sem acento e sem caixa, PT e EN** (`normalizarBusca`: NFD, sem diacríticos). Os termos em inglês dos 37
  moram em `TERMOS_DO_PAINEL`, não nas `keywords` deles. Substring, sem ranking: "onda" também acha "Retângulo
  Arredondado" e "selo" também acha a "Explosão".
- **Aviso de marca sem cores (D5)** só com `estado === 'pronto' && ausenciaConfirmada` do adaptador do V2c, que é
  `every(fonte === 'padrao')`: inclui paleta só com hex inválidos e assinatura `{}`. Nunca em carregamento ou erro;
  projeto **sem a chave** `assinatura` é erro. O painel não refaz a conta.
- **"Marca" só lista e insere** (`panels/marca-do-projeto.tsx`): pelo `useProjectElements` (mesma key das
  combinações), camada `image` até 200 px, centrada, um `addLayer`. Sem `fetch` direto, sem envio e sem exclusão no
  editor até o V2e; eles continuam na Identidade visual do projeto. Limite herdado do hook: HTML 200 vira "vazia".
  *(Superado pelo CP-V2e, seção abaixo: a Marca envia e apaga pelos hooks, e HTML 200 é erro.)*
- **Busca não inventa vazio** (revisão do Codex, 23/10/2026): a busca só esconde a Marca, e o painel só diz "Nenhum
  elemento encontrado.", com a consulta da Marca em **sucesso** e sem resultado. Carregando e erro (com o "Tentar de
  novo") continuam visíveis durante a busca.
- **Tabelas por chave usam `Map` ou `Object.hasOwn`**, nunca `objeto[chave]` cru: `category` ou `id` como
  `constructor`/`toString`/`__proto__` achava membro herdado e o item sumia (ou o `gruposDoPainel` lançava).
- **Prova:** `tests/harness/cp-v2d` (`npx playwright test -c tests/harness/cp-v2d/playwright.config.ts`), o
  `TemplateEditorShell` REAL com 7 módulos falsos listados em `bundle.ts` (canvas, propriedades, Clerk, roteador,
  imagem do Next, créditos, metadado de página). Rede falsa numa origem própria; desfazer pelo `undo()` do contexto.
  **Não prova** o atalho Ctrl/⌘+Z nem o canvas Konva real. O `index.html` do harness precisa da
  `<meta name="viewport">`: sem ela o Chromium com `isMobile` usa 980 px de layout e o editor abre no modo computador.

## Elementos da Marca: lista estrita, envio e exclusão só por hook, apagar não toca o arquivo (CP-V2e, 23/10/2026)

- **Leitura estrita** (`src/lib/brand/lista-de-elementos.ts`, puro): `lerListaDeElementos(dado, projectId)` LANÇA
  para não-lista (HTML 200 do login, `{}`, texto) e para qualquer item sem `id` inteiro seguro > 0, `name` texto,
  `fileUrl` `http(s)://`, `category` `null`/texto ou com `projectId` diferente do pedido. Um item ruim recusa a lista
  inteira (fail-closed, como a paleta do V2c): a Marca mostra erro com "Tentar de novo", **nunca "vazia"**. O `POST`
  só é sucesso com o elemento do mesmo projeto (`lerElementoCriado`); o `DELETE`, só com `{ success: true }`
  (`lerExclusaoConfirmada`). Texto e HTML 200 nunca viram sucesso.
- **As 3 keys do endpoint** (`chavesDosElementos`): `['project-elements', id]`, `['project-assets', id, 'elements']` e
  `['project', id, 'elements']`. Toda escrita invalida as 3 pelo `invalidarElementosDoProjeto(queryClient, id)` do
  **projeto da mutação**, nunca o da tela — no `onSettled` (sucesso OU erro), sem nova tentativa automática: a nova
  leitura é a autoridade, inclusive quando o servidor apagou e a resposta se perdeu. Isso vale para o envio e o Drive
  da Identidade visual também. O `staleTime` de 5 min não é prazo máximo: query montada sem evento fica velha além.
- **Envio no editor é multipart** pelo `importarElemento` (o mesmo serviço do MCP), com `fetch` dentro do hook
  (`useUploadProjectElement`): o `api.post` faz `JSON.stringify` e o `FormData` vira `{}`. PNG, JPEG, WebP e SVG, teto
  de **4.194.304 bytes** no cliente (corpo da função da Vercel é 4.5 MB); maior vai pela Identidade visual (upload
  direto ao Blob). Vários arquivos vão em série; erro no meio não para a fila, resumo no fim. Nada é inserido sozinho.
- **Apagar elemento (D6 b) remove só a linha da biblioteca**: a rota `DELETE …/elements/[elementId]` não chama mais o
  `del` do Blob. As artes COPIAM a `fileUrl` para as camadas (sem referência por id), e apagar o arquivo quebrava o
  editor e o render no servidor de toda arte que o usa. Arquivos órfãos no Blob ficam para uma limpeza futura com
  conferência de uso (D6 c). Não volte a apagar o arquivo nesta rota sem essa conferência.
- **Confirmação D6 comum** (`components/projects/confirmar-exclusao-de-elemento.tsx`), na Marca e na Identidade
  visual: alvo (`projectId`, `elementId`, nome) capturado ao abrir; "Apagar" é `Button` comum num diálogo controlado
  (o `AlertDialogAction` fecharia no clique, antes do resultado); clique fora não fecha; Esc cancela, mas é ignorado
  com o DELETE em voo. **O "em voo" é uma ref marcada no clique**, não só o `isPending`: o TanStack notifica a tela
  numa tarefa adiada, e nessa janela um 2º clique faria outro DELETE e um Esc fecharia o diálogo (medido no harness).
- **Lixeira é irmã do botão de inserir**, nunca aninhada: clicar nela não chama `addLayer`. Desfazer do editor não
  traz o elemento de volta (não é camada); a confirmação é a única barreira.
- **Troca de projeto A → B**: a confirmação não iniciada fecha sem DELETE; a fila de envio cancela o que não saiu; o
  pedido em voo termina e reconcilia só A. Callback tardio não anuncia nem fecha nada no projeto novo.
- **Prova:** `tests/harness/cp-v2d/marca.spec.ts` (asserções `V2E-…`, espião exato em `invalidateQueries` pelo
  `QueryClient` real da sonda) e os controles negativos do `bundle.ts`. Limites: o harness não prova o upload real ao
  Blob (corpo real, `sharp`), a exclusão real nem o efeito em arte existente; isso é smoke de produção (D-E6).

