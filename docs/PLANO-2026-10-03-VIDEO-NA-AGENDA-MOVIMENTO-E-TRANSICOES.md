# Plano — vídeo direto na agenda (com a página ligada), movimento nas fotos e transições (03/10/2026)

Continuação de `docs/PLANO-2026-10-02-LINHA-DO-TEMPO-NO-EDITOR.md` (PR #187, em
produção desde 03/10).

Versão 3: a primeira passada do Codex deu BLOQUEADO com 14 achados; a
segunda resolveu 11 e deixou 3 em aberto mais 1 novo — todos corrigidos aqui
(mapa no fim). Valida o plano, não a implementação — o diff de cada fase passa
pelo Codex de novo.

## O pedido

1. Agendar o vídeo direto do editor: gerar o vídeo na hora e pôr na agenda, com
   a página ligada ao post, para a Roberta voltar ao editor, corrigir e
   **substituir** o vídeo agendado pelo corrigido.
2. Zoom dinâmico nas fotos.
3. Transições entre os clipes — **sem transição no som**.

Tudo de forma bem intuitiva: quem usa é a Roberta, não alguém de vídeo.
Ordem combinada com o Ciro: 1, 2, 3.

## Estado das outras sessões (conferido em 03/10)

Nenhum branch ou worktree mexe em `src/` ou `prisma/` nessas áreas. Os ativos
de hoje (`feat/editar-video-hyperframes`, `fix/proxy-fps-do-resolve`,
`fix/legenda-bt709`, `feat/motions-da-carteira`) são da skill de edição de
vídeo e dos motions — zero arquivos em `src/` contra a main.

## O que o código faz hoje

- **Export**: o navegador grava o stage em tempo de parede (rAF → `toCanvas` →
  MediaRecorder, WebM mudo, `konva-video-export.ts:528-602`), sobre um retrato
  do design (`designGravado`). Depois da gravação ainda **envia a capa, envia o
  WebM e pede a fila** (`video-export-button.tsx:383-431`). A fila
  (`/api/video-processing/queue`) cria a `Generation` PROCESSING e o
  `VideoProcessingJob`; `process-video-job.ts` converte com ffmpeg, mixa o som,
  grava o MP4 no Blob, refaz a capa a partir do MP4, cobra e fecha.
  **O payload não leva `pageId`.**
- **Processamento**: o navegador dispara `fetch('/api/video-processing/process')`
  (o handler não confere sessão, mas a rota passa pelo middleware de
  autenticação, `middleware.ts:68,82`); o cron `*/2` processa **um** job PENDING
  com mais de 2 min. A reserva é `findFirst` + `update`, **sem
  compare-and-set** (`process-video-job.ts:191-197, 285-292`). Job preso em
  PROCESSING vira FAILED depois de 30 min (`failStuckVideoJobs`, `:550`); nada
  o devolve a PENDING.
- **Cobrança**: `deductCreditsForFeature` roda se `!job.creditsDeducted`
  (`:447`), mas o marcador só é gravado no `update` final, junto com COMPLETED
  (`:498`). Queda entre cobrar e concluir cobra de novo numa repetição.
- **Fim**: o editor sabe por polling (5 s × 60). O painel Criativos abre o
  PostComposer com o MP4 e o horário previsto; o composer **não manda
  `pageId`/`templateId`** (`post-composer-form.tsx:452-470`), e a galeria de
  criativos também não (`creatives-gallery.tsx:935`) → o post de vídeo nasce
  sem página e sem "Editar Template".
- **Os dois serviços de criação já aceitam página + MP4**: `agendarPost` grava
  `NOT_NEEDED`, acha a Generation pelo MP4 e aceita `situacao: 'agendado'`
  (SCHEDULED direto, `agendar.ts:81,383-384,488-492`); `PostScheduler.createPost`
  (`later-scheduler.ts:247-291`, o do composer) também, para STORY.
- **Re-render**: `invalidateScheduledRenders` deixa em paz post `NOT_NEEDED` e
  mídia de vídeo (`renderDaPaginaCobreAMidia`). Mas **post sem mídia passa por
  todas as guardas**: a aprovação força render quando `pageId` existe e a
  lista está vazia (`agenda-acoes.ts:182`), e o `render-story` do MCP local
  (`mcp-server.ts:1290`) só barra vídeo visível ou sequência — foto + música
  renderiza como imagem (é a exceção dos posts de imagem anteriores à música).
- **Recomposição**: `levantarPagina` (`recompor.ts:151-204`) e
  `travarRecomposicaoDaArte` (`recompor.ts:752`, chamada também em
  `arte-rapida.ts:1238`) escolhem, cada um por conta própria, a Generation mais
  recente com `fieldValues.pageId` como "arte" da página; `levantarPagina` põe
  entre os slides todo post DRAFT/SCHEDULED com aquela URL. A Generation do
  export escapa só porque não tem `pageId`; mas `ensurePostGeneration`
  (`ensure-post-generation.ts:116-155`) cria uma `post-schedule` **com**
  `pageId` e `resultUrl` = MP4 quando um post de vídeo com página chega sem
  `generationId`: editar a página trocaria o MP4 do post por um PNG.
  **Defeito latente que este plano tornaria comum.**
- **Agenda → editor**: "Editar Template" só aparece com `pageId` e
  `postType === 'STORY'` (`post-detail-view.tsx:167`), desabilitado em post
  congelado; abre `/templates/{id}/editor?pageId=…&from=agenda`, **sem
  `postId`**. No modo agenda o cabeçalho desktop só tem "Salvar e Voltar" e
  "Cancelar"; o botão de vídeo existe no menu do celular, inclusive no modo
  agenda (`template-editor-shell.tsx:741-769, 1063, 1245`). O "Agendar" do modo
  clássico fica escondido em página-vídeo (`:279`).
- `agenda-das-paginas` **já** acha o post de cada página por `SocialPost.pageId`
  e devolve horário e `comVideo` (`agenda-das-paginas/route.ts:140-166`); a
  "arte" que decide `quando` ainda vem da Generation com `fieldValues.pageId`
  (`:54-73`).
- `versaoDaPagina` (`revisao/versao.ts:37-49`) é hash de largura, altura, fundo
  e camadas — **a música (`Page.audio`) não entra**. `page-to-design-data.ts:31`
  descarta `Page.audio`, e `persist.ts:302-317` reduz a sequência ao primeiro
  clipe com `camadasNoInstante` antes do render.
- **Imagem**: editor e servidor recortam pela mesma `resolveImageSourceRect`
  (`image-fit.ts:25-55`). Nenhum nó de imagem é atualizado por quadro — só o
  vídeo (`Konva.Animation`) e o laço do export. Cache só com filtro (`:936`);
  máscara e flip ficam num `Group` (`:1180`). Os handlers de arraste e de
  transformação **gravam a posição lida do próprio nó** (`:344, 433`).
- **Clipes**: `clipe?: { duracao? }`. O canvas re-renderiza só na troca de
  clipe (`clipe-ativo.ts`); o export troca `node.visible()` por quadro e só
  restaura a visibilidade no fim (`konva-video-export.ts:302`). A faixa não
  seleciona a camada pelo bloco e não tem elemento de junção.
- Limites: a fila recusa mais de 180 s; aviso acima de 60 s (story) e 90 s (reel).

## Decisões

1. **O destino do vídeo é escolhido antes de gravar**, no diálogo de gerar:
   "Colocar na agenda" (padrão) ou "Só guardar na galeria". Quem cria o post é o
   **servidor**, quando o MP4 fica pronto. A tela mostra três estados —
   *gravando*, *enviando*, *na fila* — e só no terceiro (a fila respondeu com o
   `jobId`) diz que dá para fechar. O PostComposer deixa de abrir sozinho no fim.
2. **O processamento é durável e retomável.** Reserva por compare-and-set, com
   arrendamento (`startedAt` é o token) e até 2 tentativas; job interrompido
   volta a PENDING em vez de morrer. Cada etapa tem marcador próprio e a
   repetição pula o que já foi feito: o MP4 enviado não é reconvertido, a
   cobrança não se repete, o post não se duplica. Escritas finais só valem para
   quem ainda detém o arrendamento. **Toda etapa que escreve em mais de um lugar
   escreve no mesmo commit** (o marcador junto do efeito), e a repetição devolve
   o resultado já registrado em vez de decidir de novo.
3. **O post de vídeo guarda a página** (`pageId` + `templateId`) e nunca é
   redesenhado como imagem. A origem de vídeo é **persistida no próprio post**
   (`SocialPost.videoDaPagina`, gravado na criação e nunca limpo por edição), e
   o predicado único `postDeVideo` = essa marca **ou** mídia de vídeo. Limpar a
   mídia e a Generation pela agenda não apaga a origem. Post de imagem anterior
   à música continua imagem (nunca recebe a marca).
4. **Substituir = gravar de novo e trocar o MP4 no post**, por compare-and-set
   sobre a **revisão do post** (`SocialPost.updatedAt`, que o Prisma atualiza em
   toda escrita, de qualquer porta, inclusive as que ainda não existem) lida
   quando o pedido entrou na fila. A única revisão intermediária aceita é a
   produzida pela substituição anterior **da mesma cadeia** (o pedido registra a
   substituição deste post que ainda estava em andamento quando ele entrou na
   fila, e cada troca registra a revisão que produziu, no mesmo commit). Qualquer
   outra escrita no meio — inclusive alguém restaurar à mão um vídeo antigo —
   recusa. Só em rascunho ou agendado ainda não entregue ao Zernio
   (`laterPostId` nulo). Recusado, o vídeo novo fica na galeria e a recusa fica
   registrada — visível no post e na galeria, não só num aviso passageiro.
5. **A versão é a do vídeo GRAVADO**: `versaoDoVideo` (`versaoDaPagina` +
   `Page.audio`) é calculada do retrato que foi gravado e conferida contra o
   banco quando o pedido entra na fila. Se a página já mudou (outra aba), o
   vídeo nasce marcado como desatualizado. A cópia de texto do post também sai
   desse retrato.
6. **Uma seleção só da "arte da página"** para levantamento, trava e
   agenda-das-paginas, que ignora Generation de vídeo.
7. **Movimento é zoom e deslize do conteúdo da camada dentro da própria caixa**
   (`layer.movimento`, em foto). Vale para foto em sequência e para a foto de
   fundo de uma arte com música, só em página-vídeo. A mesma geometria no
   editor, no export e no servidor; nada gravado na camada muda (caixa, recorte,
   posição). Foto com filtro, máscara ou flip se mexe igual.
8. **Transição é da junção**, gravada no clipe que entra (`clipe.transicao`),
   com duração fixa e centrada no corte. A duração total não muda e o som segue
   cortando seco.
9. **Efeito de tempo mora num grupo de efeito, nunca no nó editável.** Camada
   com clipe ou movimento é desenhada dentro de um `Group` só de efeito; o
   aplicador (`aplicarQuadro(stage, design, t)`, um só para prévia e export)
   escreve deslocamento, opacidade e zoom nesse grupo. Os handlers de arraste e
   de transformação continuam lendo e gravando o nó de dentro. Durante um
   arraste ou transformação, o efeito daquele nó fica suspenso (identidade).
   Ao trocar de página, cancelar o export ou sair, tudo volta à identidade.
10. **Interface de escolhas com nome comum e prévia animada.** Sem keyframe, sem
    intensidade, sem duração de transição ajustável. Um contexto de destino só
    para todos os botões de gerar vídeo (desktop, tela cheia, celular, modo
    clássico, faixa da página).

## Fase 1 — vídeo direto na agenda e substituição (pedido 1)

| Ponto | Mudança |
|---|---|
| Migration (aditiva, escrita à mão) | `VideoProcessingJob.attempts Int @default(0)` (contador de tentativas do arrendamento) e `SocialPost.videoDaPagina Boolean @default(false)` (origem de vídeo, Decisão 3). Backfill no mesmo SQL: posts com `pageId` e alguma mídia de vídeo recebem `true` — são os criados hoje pelo `later-scheduler` (STORY + página + vídeo). Contagem conferida em produção, só leitura, antes de aplicar. |
| Reserva e arrendamento (`process-video-job.ts`) | Reserva = `updateMany where { id, status: PENDING }` → PROCESSING, `startedAt = agora`, `attempts + 1`; `count !== 1` → outro pegou, sai. `failStuckVideoJobs` vira recuperação: PROCESSING com `startedAt` acima de 7 min (300 s + folga) volta a PENDING se `attempts < 2`, senão FAILED com motivo — por compare-and-set no `startedAt` lido. Toda escrita a partir daí confere `status = PROCESSING` e o `startedAt` da reserva; quem perdeu o arrendamento para sem escrever. |
| Etapas com marcador (mesmo arquivo) | (1) conversão + upload do MP4 → grava `job.mp4ResultUrl` na hora; na repetição, MP4 já gravado pula a conversão. (2) cobrança → `deductCreditsForFeature` ganha um gancho opcional que roda **dentro da transação do débito**, nos dois ramos (organização e usuário, `deduct.ts:96, 271`); o export o usa para `updateMany job where { creditsDeducted: false } → true` e, se `count === 0`, lança para desfazer o débito (já cobrado). Marcador, saldo e histórico de uso caem ou ficam juntos: uma exceção ambígua na confirmação não abre segunda cobrança, porque a repetição encontra o marcador gravado. (3) Generation COMPLETED. (4) destino (abaixo). (5) job COMPLETED. Uma falha transitória no destino deixa o job PROCESSING para a recuperação tentar de novo; esgotadas as tentativas, o vídeo fica pronto na galeria e o destino registra o motivo. |
| Processamento imediato | A rota da fila processa o próprio job em `after()` (`maxDuration = 300` inline, precedente F0.3). Sai o `fetch('/process')` do navegador. O cron segue como rede (pega PENDING, inclusive o devolvido pela recuperação). |
| Fila (`queue/route.ts`) | Payload ganha `pageId` e `destino`: `{ tipo: 'galeria' }`, `{ tipo: 'agenda', quando, postType: 'STORY' \| 'REEL', legenda?, situacao: 'agendado' \| 'rascunho' }` ou `{ tipo: 'substituir', postId }`. Validação antes de cobrar: página do template e do projeto; `quando` ao menos 10 min no futuro; post do projeto, ligado a essa página, `postDeVideo`, DRAFT/SCHEDULED e `laterPostId` nulo. Calcula `versaoDoVideo` do `designData` gravado e a compara com a página no banco (`divergiuNaGravacao`). Para `substituir`, grava o estado esperado do post: `{ revisao: updatedAt, mediaUrls, pageId }` e, se houver uma substituição deste post ainda em produção, `predecessora` (o `generationId` dela). Tudo em `Generation.fieldValues.videoDaPagina = { pageId, versao, divergiuNaGravacao, destino, esperado?, resultado? }` — **nunca** em `fieldValues.pageId`. |
| Destino `agenda` | Numa transação que trava o job (`SELECT … FOR UPDATE` com o `startedAt` da reserva) e confere que `videoDaPagina.postId` ainda não existe: cria o post (`resolverAgendamento` + `criarPostDoAgendamento(tx, …)`: pageId, templateId, `mediaUrls: [mp4]`, generationId, postType, quando, legenda, `situacao`, e a cópia de texto do retrato gravado) e grava `videoDaPagina.postId` por merge no banco (`mesclarFieldValuesDaArte`). Os efeitos rodam depois do commit (já são idempotentes pelo id do post). Horário que passou durante o processamento → rascunho, com o motivo. Assina quem exportou (User lido pelo clerkId, sem criar). |
| Destino `substituir` → `substituirVideoDoPost` (novo, `src/lib/posts/`) | Uma transação só, que trava o job (arrendamento) e o post: se `videoDaPagina.resultado` já existe, devolve-o sem decidir de novo (a repetição depois de uma queda acha a troca feita). Senão, aceita quando o post está DRAFT/SCHEDULED, `laterPostId` nulo, mesma página, e a revisão (`updatedAt`) é a `esperado.revisao` **ou** a revisão que a `predecessora` registrou ao trocar. Troca `mediaUrls`, `generationId`, `renderedImageUrl` quando era o MP4 anterior, e a cópia de texto do retrato gravado; no **mesmo commit** grava `resultado = { ok: true, revisaoDepois: <updatedAt novo> }` e o PostLog. Recusa (revisão diferente: post editado, mídia trocada ou restaurada à mão, página religada, congelado, publicado, ou um vídeo mais novo da cadeia já entrou) também grava `resultado = { ok: false, motivo }` e o PostLog no mesmo commit. |
| `postDeVideo` (puro, `src/lib/posts/`) | `post.videoDaPagina` **ou** mídia de vídeo. A marca é gravada pelos dois serviços de criação quando a mídia é vídeo ou a Generation de origem é um export de vídeo, e nenhuma rota de edição a limpa. Usado por: aprovação (não força render, `agenda-acoes.ts:182`), `invalidateScheduledRenders`, `renderPostArt` (recusa: "o vídeo deste post foi removido — gere de novo no editor"), executor (post de vídeo sem mídia → falha sem nova tentativa, com aviso), e no MCP local `render-story`, `create-post` e `update-post` (que hoje força PENDING, `mcp-server.ts:830-834`). |
| `arteDaPagina` (seleção única, `src/lib/compositor/`) | A Generation mais recente com `fieldValues.pageId` e `resultUrl` que **não** é vídeo. Usada por `levantarPagina`, `travarRecomposicaoDaArte` (e por isso também por `arte-rapida.ts:1238`) e pela arte que decide `quando` em `agenda-das-paginas`. `levantarPagina` também nunca põe post `postDeVideo` entre os slides. Teste: página com Generations de imagem e de vídeo, inclusive a `post-schedule` de vídeo que `ensurePostGeneration` cria. |
| Vínculo pela Generation (os dois serviços de criação) | `vinculoDoVideo(generation)` → `{ pageId, templateId }` a partir de `videoDaPagina.pageId`, conferindo página e projeto. `resolverAgendamento` e `PostScheduler.createPost` o aplicam quando o pedido não traz página: o post agendado pelo composer, pelas duas galerias ou pelo conector (`colocar-na-agenda` só com `generationId`) também fica ligado. `ver-geracao` mostra a página de origem do vídeo sem expor `fieldValues.pageId`. |
| Status do job e onde o resultado aparece | `status/[jobId]` devolve `videoDaPagina.resultado`. O detalhe do post mostra, lendo as Generations de vídeo com `videoDaPagina.destino.postId` deste post (projeto e últimos 14 dias): "vídeo novo em produção", "substituído em …" ou "não substituído: motivo", com o link do vídeo novo na galeria. O card do criativo na galeria mostra o destino ("vai para a agenda: sex 10/10, 19:00") e a recusa, quando houver. |
| Diálogo de gerar vídeo (contexto de destino compartilhado) | Seção "Depois de gerar": "Só guardar na galeria" ou "Colocar na agenda" (padrão), com data e hora (padrão: horário previsto em `agenda-das-paginas`; senão `horarioPadrao` dos horários típicos, o mesmo do Novo Post — nunca `sugerirPosts`), Story ou Reel (página 9:16 → Story; feed → só Reel), legenda só no reel, e situação "Agendado" (padrão, como o composer) ou "Rascunho". Vindo da agenda com `postId`, o destino já é "Substituir o vídeo de sex 10/10, 19:00". O mesmo contexto alimenta os botões do cabeçalho, da tela cheia, do menu do celular, do modo clássico e da faixa da página. Descarrega o autosave antes de gravar. |
| Criativos | Deixa de abrir o PostComposer sozinho no fim (o destino já foi escolhido). |
| Agenda → editor | "Editar Template" vale para STORY e REEL de vídeo, com o rótulo "Editar vídeo"; `editarTemplateHref` acrescenta `postId`. O detalhe do post mostra "A página mudou depois deste vídeo — abra no editor para substituir" quando a versão do vídeo diverge da página atual (calculada no GET do post). |
| Editor com `postId` e página-vídeo (desktop e celular) | Ação principal "Substituir vídeo na agenda": grava com destino `substituir` e só volta para a agenda quando a fila responde com o `jobId`. Ao lado, "Salvar sem gerar". "Salvar e Voltar" com a página mudada desde o vídeo pergunta: "O vídeo da agenda ainda é o anterior. Gerar o novo agora?" |
| Faixa da página e modo clássico | A extensão de `agenda-das-paginas` devolve, por post de vídeo, `{ postId, quando, videoDesatualizado, substituicao? }`. A etiqueta "Agendado" ganha "vídeo desatualizado · Substituir" e o estado da substituição em andamento. O "Agendar" de página-vídeo (faixa e modo clássico) abre o diálogo de gerar com destino agenda, em vez da recusa de hoje. |
| `versaoDoVideo` (puro, `src/lib/video/`) | `versaoDaPagina` + `Page.audio` canônico, com o mesmo resultado para o `designData` gravado e para a linha `Page`. Teste: mudar só a música muda a versão; reordenar chaves não muda; o design salvo e o mesmo design como retrato dão a mesma versão. |

Prova da fase (branch de dev): `scripts/validar-video-na-agenda.ts`. Página foto
+ música; job com destino agenda processado pelo caminho real (ffmpeg e Blob,
com limpeza) → post ligado, `NOT_NEEDED`; processar de novo (job devolvido a
PENDING depois da etapa de destino) → nenhum post, MP4 ou cobrança a mais;
exportar logo depois de salvar → não sai "desatualizado"; editar a página →
`levantarPagina` e a trava não tocam no post nem na Generation de vídeo;
substituir → mídia trocada; repetir a substituição depois da troca (queda
simulada antes do fim do job) → devolve "substituído", sem nova troca nem
recusa; substituir com `laterPostId` → recusado sem trocar e com o motivo no
histórico; mídia trocada ou vídeo antigo restaurado pela agenda no meio →
recusado; duas substituições em cadeia, nas duas ordens de chegada → fica a
mais nova; post de vídeo com mídia e Generation limpas e aprovado (pela agenda
e pelo `update-post`) → não vira imagem; cobrança com falha simulada depois do
commit → um débito só.

## Fase 2 — movimento nas fotos (pedido 2)

| Ponto | Mudança |
|---|---|
| `src/lib/video/movimento.ts` (novo, puro) | `MOVIMENTOS = ['aproximar', 'afastar', 'deslizar']`. `quadroDoMovimento(movimento, progresso)` → `{ escala, deslocamentoX }` em fração da caixa: escala 1 → 1,15 (aproximar), 1,15 → 1 (afastar), 1,15 fixa com o conteúdo andando da esquerda para a direita (deslizar, ±6,5% da largura, que é a sobra da escala). Suavização leve (ease-in-out). `progressoDoMovimento(camada, linha, t)`: clipe → (t − início) / duração; foto fora da sequência → t / duração da página; preso em [0, 1]. |
| Contexto temporal antes dos filtros | `camadasNoInstante(layers, t, { audio })` passa a saber se a página é vídeo (`paginaEVideo`) e anota em cada foto em movimento o quadro daquele `t` (campo transitório, nunca gravado). `page-to-design-data.ts`, `persist.ts`, `story-renderer.ts` e `page-preview.tsx` passam o áudio da página, para a decisão vir antes de a sequência virar o primeiro clipe. |
| Dado | `layer.movimento?: 'aproximar' \| 'afastar' \| 'deslizar'` em camada `image`; ausente = parado. `layer-contract.ts` recusa valor fora da lista (PATCH 400, conector). |
| Editor e export | O grupo de efeito (Decisão 9) recorta pela caixa da camada (`clipFunc`, girada junto se a camada girar) e, por dentro, aplica escala em torno do centro e o deslize. O aplicador escreve o quadro a cada passo; parado, mostra o quadro do `t` atual (em 0, o primeiro quadro do vídeo). Foto com filtro: cache com `pixelRatio` × 1,15, para o zoom não amaciar. |
| Servidor (`render-engine.ts`) | A mesma geometria a partir do quadro anotado: recorta pela caixa, escala e desloca, desenha a camada como hoje. Em t = 0, a miniatura e a capa são o primeiro quadro do vídeo. |
| Painel da foto (página-vídeo, desktop e celular) | "Movimento" com 4 opções (Parado, Aproximar, Afastar, Deslizar), cada uma com a miniatura da própria foto animada em CSS, e "Usar em todas as fotos desta página". |
| Faixa | Clicar no bloco do clipe seleciona a camada (abre o painel com o Movimento). Bloco com movimento mostra um ícone pequeno. |

Prova: no harness, foto de grade. No MP4, a distância entre marcadores no
primeiro e no último quadro difere por 1,15 ± 2% (aproximar e afastar);
deslizar desloca a grade ~13% da largura; foto com filtro e foto com máscara
se mexem igual; arrastar a foto com a prévia parada no meio do movimento grava
a posição sem o efeito; o render do servidor (pelos caminhos reais: `persist` e
`page-to-design-data`) em t = 0 bate com o primeiro quadro do editor.

## Fase 3 — transições entre clipes (pedido 3)

| Ponto | Mudança |
|---|---|
| Dado | `clipe.transicao?: 'dissolver' \| 'deslizar'` no clipe que ENTRA; ausente = corte; ignorado no primeiro clipe. Contrato recusa valor fora da lista. |
| `linha-do-tempo.ts` | `quadroDosClipes(linha, t)` → por clipe `{ visivel, opacidade, deslocamentoX }`. Janela de `min(0,5 s, metade do clipe mais curto da junção)` centrada no corte. Dissolver: o clipe de cima na junção varia a opacidade e o de baixo fica opaco (sem escurecer no meio). Deslizar: o que sai anda para a esquerda e o que entra chega pela direita, empurrando (em fração da largura da página). Fora das janelas, igual a hoje (`clipeAtivoEm`). A duração total e o quadro de t = 0 não mudam. |
| Vídeo na janela | O que sai segura o ÚLTIMO quadro do trecho (`seguraNoFim`); o que entra segura o primeiro até o seu início (já é o comportamento fora do intervalo). Teste do `passoDoVideo` nos dois lados da janela. |
| Som | Nada muda (pedido): `planoDeSom` corta na junção, como hoje. |
| Aplicador | Visibilidade, opacidade e deslocamento escritos no grupo de efeito de cada clipe, a cada quadro, na prévia e no export; o export deixa de trocar `visible` por conta própria e devolve tudo à identidade no fim. |
| Faixa (desktop) | Botão pequeno em cada junção (ícone da transição atual). O clique abre 3 opções (Corte, Dissolver, Deslizar) com prévia animada (dois blocos de cor) e "Usar em todas as junções". O celular não edita transições, mas as mostra na prévia e as preserva. |

Prova: no harness, dois clipes de cor sólida. No MP4, a cor é pura em
corte − D/2 e em corte + D/2; no corte, dissolver dá a média (± 8 níveis) e
deslizar põe a fronteira em W/2 (± 2%); arrastar um clipe com a prévia parada
no meio de "deslizar" grava a posição sem o deslocamento; o som continua igual
(mesma checagem da Fase 4 anterior).

## Fora deste plano

- Transição no som (pedido do Ciro).
- Movimento em vídeo; intensidade, direção ou duração ajustáveis; keyframes;
  outras transições.
- Escolher a capa do vídeo.
- Aviso de vídeo desatualizado no calendário (só no detalhe do post e na faixa
  da página).
- Substituir vídeo de post já entregue ao Zernio; editar a legenda pelo editor.

## Riscos

- **Aba fechada antes de a fila responder**: nada é criado e a tela avisou que
  ainda não dava para fechar. Depois do `jobId`, o servidor termina sozinho.
- **ffmpeg num vídeo de 180 s passando de 300 s**: a recuperação devolve o job a
  PENDING uma vez; na segunda, FAILED com motivo. O MP4 já enviado não é
  reconvertido.
- **Créditos**: cada substituição é um export novo (10 créditos).
- **Substituição conservadora**: qualquer escrita no post enquanto o vídeo novo
  é produzido (mudar a legenda, remarcar) recusa a troca. A janela é de um ou
  dois minutos, o motivo aparece no post e o vídeo novo fica na galeria; basta
  substituir de novo.
- **React × grupo de efeito**: o React segue dono das props do nó; o grupo de
  efeito não tem props do React além da identidade, então um re-render não
  desfaz o quadro.
- Página com post de imagem anterior à música continua imagem; não ganha
  substituição.
- **Migration**: aditiva (`ADD COLUMN IF NOT EXISTS`), aplicada pelo build
  (#179) ou por `db:deploy`, com o OK do Ciro.

## Como será testado (por fase)

`npx tsc --noEmit -p .`, `npm run lint`, `npx vitest run` e o harness
(`node scripts/validar-video-no-editor/rodar.mjs`) a cada fase. Fase 1 também
no branch de dev (`scripts/validar-video-na-agenda.ts`). No fim, teste logado
pelo Ciro e pela Roberta: gerar com destino agenda, editar e substituir,
movimento numa foto com música, transições numa sequência.

## Revisão do Codex sobre o plano (03/10) — o que mudou

| # | Achado | Onde foi corrigido |
|---|---|---|
| 1 | "Pode fechar" antes do upload e da fila | Decisão 1 (três estados; liberar só com `jobId`); editor só volta à agenda com o `jobId` |
| 2 | Timeout não volta a PENDING | Decisão 2; arrendamento por `startedAt`, recuperação com `attempts` (migration) e escritas condicionadas |
| 3 | Conclusão do destino sem retomada | Etapas com marcador; post e vínculo na mesma transação que confere o arrendamento; cobrança marcada antes de cobrar |
| 4 | Versão do banco ≠ vídeo gravado | Decisão 5; versão e cópia de texto do retrato gravado, conferido contra o banco (`divergiuNaGravacao`) |
| 5 | Compare-and-set incompleto | Decisão 4; estado esperado inteiro; "mais novo vence" só na sequência do mesmo post |
| 6 | `NOT_NEEDED` não é para sempre | Decisão 3; `postDeVideo` por mídia ou Generation, nas 6 portas |
| 7 | Trava escolhe a arte por conta própria | Decisão 6; `arteDaPagina` compartilhada |
| 8 | Vínculo depende da porta | `vinculoDoVideo` nos dois serviços de criação; `ver-geracao` |
| 9 | Servidor sem contexto temporal | `camadasNoInstante(…, { audio })` antes dos filtros, nos 4 caminhos |
| 10 | Transição contamina a posição | Decisão 9; grupo de efeito, suspensão durante edição, volta à identidade |
| 11 | Exceção do filtro quebra a paridade | Movimento no grupo de efeito vale para filtro, máscara e flip; cache com `pixelRatio` maior |
| 12 | Clássico e celular sem contrato | Decisão 10; contexto de destino único; celular preserva transições |
| 13 | Recusa some | Resultado persistente no post (PostLog), no detalhe e na galeria |
| 14 | Duas afirmações erradas | Middleware e `agenda-das-paginas` descritos como são |

Segunda passada (03/10): 11 resolvidos; corrigidos nesta versão:

| # | Achado | Onde foi corrigido |
|---|---|---|
| 3 | Substituição não idempotente na retomada | Decisão 2; troca, resultado e PostLog no mesmo commit; repetição devolve o resultado registrado |
| 5 | Procedência da Generation não prova ausência de edição manual | Decisão 4; revisão do post (`updatedAt`), com exceção só para a revisão produzida pela predecessora da mesma cadeia |
| 6 | `postDeVideo` dependia de vínculo removível; faltava `update-post` | Decisão 3; `SocialPost.videoDaPagina` (migration + backfill); `update-post` na lista de portas |
| 15 | Desmarcar a cobrança na exceção reabria cobrança dupla | Gancho dentro da transação do débito: marcador, saldo e histórico no mesmo commit |
