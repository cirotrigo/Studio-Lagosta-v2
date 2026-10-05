# Vídeo e áudio

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### A voz isolada: o stem que a separação sempre produziu e ninguém guardava (22/08/2026)

A biblioteca de músicas passou a guardar **três** arquivos por faixa — original,
instrumental e **voz isolada**. Não há separação nova: o MVSEP (`sep_type: 48`,
MelBand Roformer) **sempre** devolveu os dois stems, o cliente baixava os dois,
salvava o instrumental e jogava a voz fora. Colunas `hasVocalsStem` /
`vocalsUrl` / `vocalsSize` em `MusicLibrary`, espelhando o instrumental.

- 🔴 **`getFileName` nunca casou com a resposta REAL da API.** Ele procurava
  `name`/`filename`/`file_name`/`title`, e o MVSEP não manda nenhum desses — o
  nome vem em **`download`** e o tipo em **`type`**. Medido em 22/08 contra o
  job real: os dois arquivos liam `'unknown.mp3'`, então TODA a classificação
  por nome era morta e o código caía sempre no palpite final ("pega o último
  arquivo"). Acertava por sorte, porque a ordem do MVSEP é `[Vocals, Other]`.
  Log que imprime `unknown` para tudo é sinal de leitor quebrado, não de API
  pobre.
- 🔴 **O instrumental se chama "Other", não "instrumental".** É `type: "Other"`
  no modelo de DOIS stems — e só ali: num modelo de quatro (bateria, baixo,
  outros, voz) "other" é uma faixa própria. Por isso a inferência
  `other → instrumental` é aplicada **apenas com exatamente 2 arquivos**.
- 🔴 **A ordem da classificação importa: "no_vocals" CONTÉM "vocal".** O
  instrumental é decidido PRIMEIRO e a voz é procurada só no que sobrou.
  Invertido, os dois arquivos trocam de lugar — e esse defeito sai CALADO: o
  vídeo publica a faixa cantada achando que é o playback.
- **"music" ficou de fora das marcas de instrumental**, de propósito: o título
  da faixa vem embutido no nome do arquivo e "Music Box" cairia lá. O
  complemento (com 2 arquivos, o que não é voz é instrumental) resolve o mesmo
  caso sem depender do título.
- **A classificação mora em módulo PURO** (`src/lib/mvsep/classificar-stems.ts`),
  sem Prisma — `@/lib/db` lança no import sem `DATABASE_URL`, e esta é a decisão
  que mais precisa ser conferida sozinha. `scripts/validar-classificacao-de-stems.ts`
  roda 12 casos (inclusive a forma real da API) sem banco, sem rede e sem custo.
- **A voz é ADITIVA e nunca derruba o instrumental.** Se o download dela falhar,
  o job termina `completed` com o instrumental — regredir a separação que já
  funcionava por causa do arquivo novo seria trocar um problema por outro pior.
  Mesma razão pela qual o ZIP segue sem o stem que não baixou, e o export de
  vídeo cai no original quando o stem pedido ainda não existe (nunca vídeo mudo).
- 🔴 **O resultado do MVSEP EXPIRA em poucos dias.** Medido em 22/08: jobs de 2
  dias antes ainda respondiam `done`; o de 3 dias já era `not_found`. Por isso
  `scripts/recuperar-voz-das-musicas.ts` tenta primeiro o `mvsepJobHash` guardado
  (de graça) e só depois oferece `--reprocessar`, que custa uma separação nova
  por faixa — e o cron processa **UMA a cada 2 minutos**. Dry-run por padrão.
- **`audioVersion` virou `original | instrumental | vocals`** nas 8 casas onde
  o enum vive (tipo da página, dois zods de rota, modal, painel do editor, botão
  de export, `process-video-job`). Enum de áudio novo precisa passar por todas —
  o `tsc` pega as de tipo, mas não os textos de rótulo.

### 🔴 O download do YouTube trava quando a aba fecha (22/08/2026)

A última etapa de um download — baixar o MP3 do CDN e subir para o Blob — roda
**no NAVEGADOR**, não no servidor: o CDN do RapidAPI (123tokyo.xyz) responde 404
para IPs de datacenter e só serve IPs residenciais (com CORS aberto). Isso está
documentado em `video-download-client.ts` e foi confirmado em 22/08 — daqui, de
IP residencial, o mesmo link responde 206.

A consequência não estava documentada e derrubou **3 downloads num dia**:

- 🔴 **Nenhum ramo do cron cobre `downloading` COM link.** Os três ramos de
  `process-youtube-downloads` pegam `downloading + startedAt < 2h` (limpeza),
  `pending + videoApiStatus=processing` (refresh) e `downloading + SEM link`
  (check). Um job com link e sem música não é visto por nenhum — medido: 0, 0 e
  0 contra dois jobs parados. Só o navegador o resolve, e só com a página
  aberta. Fechada a aba, ele fica parado até o expurgo de 2h marcá-lo como
  falho — e o link assinado (`s=` na URL) expira mais ou menos junto.
- 🔴 **A tela mostrava progresso falso.** Nesse estado a copy era
  "Preparando download... 50%" com spinner e barra, sem botão nenhum —
  indistinguível de trabalho em andamento. Hoje há um ramo próprio ("Falta
  baixar o arquivo") com **Baixar agora**, e ele exige o orçamento automático
  esgotado para não piscar ao abrir a página.
- 🔴 **O retry automático era um laço.** No erro o guard por link era zerado, e
  como `job` é repolado a cada 5s o efeito reentrava para sempre, martelando o
  CDN e piscando o erro. Agora são no máximo `MAX_TENTATIVAS_AUTO = 2` por
  link; esgotado, só no botão.
- **`scripts/destravar-downloads-do-youtube.ts`** faz o papel do navegador e
  completa o que ficou para trás (dry-run por padrão). **Só funciona de máquina
  com IP residencial** — de dentro da Vercel o CDN recusa. Ele confere a
  expiração do link antes de tentar.
- ⚠️ **`startYoutubeDownloadJob` é código morto** (nenhum chamador) e cria o job
  com `videoApiStatus` NULO — estado que o ramo de refresh não enxerga. Se
  alguém voltar a usá-la, precisa gravar `videoApiStatus`, senão nasce um job
  invisível para o cron e para o expurgo.

### Vídeo no editor para a equipe: motion por cima de foto e de vídeo (02/10/2026)

Plano e revisão do Codex em `docs/PLANO-2026-10-02-VIDEO-NO-EDITOR.md`. Medido
em produção antes: o "Exportar Vídeo" do editor é a ferramenta de STORY da
equipe (41 em 90 dias, mediana de 12,6 s, nenhum reel); os vídeos do Ciro
entram prontos de fora. A equipe não usa o Resolve — o que ela ganha aqui é pôr
**motion com fundo transparente** (texto animado, logo animada) por cima de um
vídeo ou de uma foto e exportar o MP4.

- **Motion = camada `type: 'video'` com `videoMetadata.overlay: true`**, em
  WebM VP9 com alfa. O Chrome desenha o alfa no `<video>` e no `drawImage` do
  canvas (medido). ProRes 4444 não toca no navegador:
  `scripts/converter-motion.sh` converte e confere `alpha_mode=1` (46 MB → 0,3
  MB em 3 s). A biblioteca é a subpasta "Motions" da pasta de Vídeos do cliente
  no Drive — a aba Vídeos já navega e copia para o Blob.
- **As regras moram em `src/lib/video/camadas-de-video.ts` (puro)**, usadas por
  navegador E servidor: `videosDaPagina` (camada oculta não participa),
  `videoDeBase` (o primeiro vídeo que não é motion), `videoPrincipal` (a base
  ou, sobre foto, o primeiro motion), `trechoDoVideo` e `duracaoDoExport` (o
  menor entre o trecho do vídeo e a fatia da música — UMA conta para a
  gravação, a fila, o chip do painel e a aba Músicas).
- 🔴 **O motion não tem relógio próprio: a cada quadro ele se RECONCILIA com o
  vídeo principal** (`passoDoMotion`, no tique da `Konva.Animation` do
  `VideoNode`). A primeira versão avisava "a base recomeçou" por evento, e o
  Codex a bloqueou: evento sem identidade nem estado não resolve ordem de
  carregamento, play/pause, autoplay desligado nem desfazer/refazer. Função sem
  estado resolve todos de uma vez. O seek só acontece com desvio > 0,25 s
  (seek engasga a decodificação); parado, o quadro é o do instante do relógio.
- **O motion toca UMA vez e segura o último quadro** — é o que o export grava.
  Sobre FOTO ele é o principal: o MP4 tem a duração dele, sem som original.
- 🔴 **O export recusa gravar se algum vídeo visível não carregou** ou não
  responde ao seek: o stage inteiro é copiado, e antes o MP4 sairia sem o
  motion, sem aviso. Todos os vídeos param no início do próprio trecho e largam
  no mesmo ponto, e o gravador começa junto com a reprodução. Medido contra o
  código antigo num vídeo só: a imagem ficava congelada 0,2 s no começo (o som,
  que o servidor corta no início do trecho, saía adiantado esse tanto, e os
  últimos 0,3 s do clipe eram cortados); hoje o atraso é de ~0,07 s.
- **Som original só do vídeo de BASE** (`findVideoLayer` da fila usa
  `videoDeBase`): página só com motion não tem som original, em vez de falhar
  no ffmpeg e reconverter.
- **Um mecanismo de loop**: o manual (handlers de `ended` e do fim do trecho),
  que volta ao INÍCIO DO TRECHO. O comando `loop` do painel não liga mais
  `video.loop` nativo — ele voltava a 0 e sobrevivia a desfazer/refazer com o
  metadata dizendo o contrário.
- **`.webm` inserido pela aba Vídeos entra como motion** (extensão é o único
  sinal sem decodificar; câmera e celular entregam .mp4/.mov). É sugestão: a
  tela avisa ao inserir e o painel do vídeo tem o interruptor "Motion".
- 🔴 **Página com vídeo visível não vira imagem parada sem aviso**
  (`src/lib/video/pagina-com-video.ts`, `PAGINA_COM_VIDEO`, 422). O render de
  servidor desenha a miniatura do vídeo, não o vídeo: agendar a página (em vez
  do MP4 exportado) publicava uma foto. Recusam: `agendarPost` por `pageId` sem
  mídia, `agendar-leva` (na simulação também), `renderPageAndRegister` e o
  `later-scheduler` quando a mídia do story não é vídeo. No editor, o chip
  "vídeo" entra no lugar do Agendar e o export de imagem avisa. Vídeo OCULTO
  não conta, nem no render (`pageContainsVideoLayer` usa `videosDaPagina`).
- 🔴 **A limpeza de 90 dias PULA vídeo, nas três passagens** (`semVideos` em
  `blob-cleanup.ts`; `videosPulados` na resposta do cron). O export guarda o
  backup em `fieldValues.driveBackupUrl`, não na coluna
  `googleDriveBackupUrl`: a limpeza tratava o MP4 como "arte sem backup", o
  reenviava ao Drive pelo uploader de IMAGEM e trocava `resultUrl` — e as mídias
  dos posts — por um link lh3 que responde 404. Medido em 02/10/2026: 12 de 58
  vídeos tocados, os 12 MP4 ainda vivos. `limpeza-pula-video.test.ts` é teste
  de FONTE: cada `db.generation.findMany` de lá tem o seu `semVideos`.
  `scripts/reparar-videos-limpos.ts` desfaz (dry-run por padrão) e **só grava
  com `--confirmar --limpeza-no-ar`**: rodado antes do deploy, o cron diário
  antigo desfaz o reparo e manda apagar o MP4.
- **Trilha que não pôde ser usada não some calada** (`audio-do-export.ts`):
  som do vídeo + música → só a música → só o som do vídeo → sem som, com
  `fieldValues.audioAviso` e o motivo. Antes o MP4 saía mudo, concluído e
  cobrado, sem registro. O card do criativo e a galeria mostram o aviso.
- **Duplicar página leva `Page.audio`**, e a aba Músicas grava o trecho numa
  escrita só (`onRangeChange`): início e fim gravados em duas chamadas se
  atropelavam e o trecho voltava ao valor antigo.
- **Como testar sem login** (o Clerk local não deixa automatizar):
  `node scripts/validar-video-no-editor/rodar.mjs` — esbuild + Playwright sobre
  o Chrome instalado, bundlando o `KonvaLayerFactory` e o export REAIS com o
  contexto do editor trocado por um stub. Vídeos sintéticos com marcador de
  tempo (barra que anda no vídeo, caixa que desce no motion) deixam medir a
  sincronia lendo os quadros do WebM com ffmpeg. Precisa de ffmpeg e do Chrome;
  não toca em banco nem em rede. ⚠️ Ele não cobre o que fica FORA do canvas
  (aba Músicas, modal de áudio, fila real de conversão): isso é teste logado.
- ⚠️ **Limites conhecidos**: motion 9:16 em página de feed é cortado (`cover`);
  foto + motion dura só o tempo do motion; `playbackRate` ≠ 1 não é honrado no
  export (o painel só mostra o controle para quem já tem valor antigo).
- **Motions da marca saem de `scripts/motions/gerar-motion.mjs`** (02/10/2026):
  um spec por cliente (`wine-vix.json`: kit com fontes, cores, ícones e logo
  animada + as peças) vira WebM VP9 com alfa pelo `@napi-rs/canvas` — o
  gerador do motion do TERO, sem Remotion. Só animação de ENTRADA (o editor
  segura o último quadro, e o gerador confere que ele tem tinta); texto entre
  [colchetes] sai em destaque. `enviar-ao-drive.ts` põe os arquivos na
  subpasta "Motions" da pasta de Vídeos (dry-run por padrão; nome limpo, sem
  o carimbo de `uploadFileToFolder`) e `conferir-no-chrome.mjs` prova a
  transparência no Chrome. O "Truncating packet" do ffmpeg no fim do pipe é
  inofensivo.
- **Motion fora da proporção da página entra SOLTO** (`caixaDoMotion`): a
  logo animada 1:1 entra na própria proporção, com um terço da largura, no
  centro, para a pessoa posicionar. Na proporção da página, cobre a página.
- **Motion novo de um cliente = um spec** (`scripts/motions/<slug>.json`; os
  oito da carteira estão lá, feitos em 02/10/2026 por um agente por cliente:
  voz + base + assinatura + capas publicadas → spec → `previa.sh` OLHANDO a
  folha de contato). O gerador cobre o que as marcas pediram: estilo por
  linha do título (a segunda voz), `alinhamento`, logo parada ou animada,
  `sombraDura` (Seu Quinto), `gradiente` da marca atrás do texto (Real,
  Empório, By Rock, TERO: sem ele a manchete não lia sobre a foto típica da
  casa) e a coluna que encolhe quando a logo divide a linha de cima. Fato só
  da base, sem preço nem data; os de happy hour e executivo não valem em
  feriado. Coronel Picanha ficou sem motion: sem fontes, cores, base, voz,
  assinatura nem pasta de Vídeos cadastradas — cadastrar antes de gerar.

**Da 2ª revisão do Codex sobre a implementação (BLOQUEADO, 7 achados, 02/10/2026):**

- 🔴 **Mídia de VÍDEO nunca é "coberta pelo render da página"**
  (`renderDaPaginaCobreAMidia` devolve `false` para MP4/MOV, e o
  `later-scheduler` deixa o post `NOT_NEEDED` quando a mídia é vídeo).
  Preexistente: story com `pageId` + MP4 nascia `RENDERED`, e editar a página
  o devolvia à fila — `renderPostArt` grava `mediaUrls: [png]` e o vídeo virava
  foto. Medido em produção antes do conserto: 641 posts com página e mídia,
  **zero** com vídeo.
  🔴 **A guarda mora em `renderPostArt`, por onde TODO render de post passa**
  (motivo `midia-propria`: o post vai a `NOT_NEEDED` e a mídia fica; vale para
  carrossel também). A primeira correção cuidou só da criação e da invalidação,
  e a conferência do Codex achou o caminho que sobrava: o PUT do post troca
  `mediaUrls` sem mexer em `renderStatus`, e voltar para rascunho põe em
  `PENDING` todo post `RENDERED` com página. Fechar caminho a caminho deixa o
  próximo aberto; o ponto único não. A gravação do sucesso leva a mídia LIDA no
  predicado (`mediaUrls: { equals }`): trocada durante o render, o PNG não entra
  por cima e o post volta a `PENDING` para a guarda decidir. O `render-story` do
  MCP local (`scripts/mcp-server.ts`) renderiza por fora de `renderPostArt` e
  ganhou a mesma guarda e o mesmo predicado.
- 🔴 **`PAGINA_COM_VIDEO` é recusada ANTES de gravar.** A guarda só existia em
  `renderPageAndRegister`, DEPOIS de `ajustarArte` gravar as camadas e de
  `persistAndRenderCreative` criar a página: o erro saía com a página já
  alterada (ou órfã). As duas conferem `videoNaPagina` antes da escrita; a de
  dentro do render fica como defesa.
- **O reparo dos vídeos limpos pula post em envio** (`POSTING`, ou não publicado
  com `laterPostId`) e reaponta por compare-and-set em `mediaUrls`, `status` e
  `laterPostId`.
- **O export limpa o que abriu, no `finally`**: para o gravador e as tracks do
  stream, cancela o quadro agendado, e devolve o vídeo de base ao estado em que
  estava (tocando ou parado). `play()` tem prazo de 5 s — vídeo que não toca
  falha o export em vez de prendê-lo com o gravador ligado. E o gravador que
  FALHA no meio rejeita a espera da gravação (`onerror` → `aoFalhar`): ele fica
  `inactive` sozinho, o `stop()` do fim lançava dentro do timer e a promessa
  nunca terminava. O `onstop` é armado antes de gravar.
- **`autoplay` desfeito volta a tocar, e os controles seguem o elemento
  ATUAL**: o efeito de autoplay aplica ao `<video>` (antes só guardava o
  valor), e o handler de play/pause lê `videoRef.current` na hora — trocar a
  URL do vídeo deixava os controles presos no elemento antigo.
- ⚠️ **Vídeo exportado fica no Blob por tempo INDEFINIDO** (consequência de a
  limpeza pular vídeo). É de propósito: o MP4 é a mídia do post e o uploader de
  backup é de imagem. Se o armazenamento pesar, o caminho é um backup de vídeo
  de verdade para o Drive, nunca tirar o `semVideos`.

### Vídeo direto na agenda, movimento nas fotos e transições (03/10/2026)

Plano em `docs/PLANO-2026-10-03-VIDEO-NA-AGENDA-MOVIMENTO-E-TRANSICOES.md`
(Codex APTO na v3; duas revisões do Codex por frente). PR #191; migration
`20261003120000_video_na_agenda` aplicada em produção antes do merge.

- **O destino do vídeo é escolhido ANTES de gravar** ("Depois de gerar":
  agenda, substituir o vídeo de um post, ou só galeria) e quem cria o post é o
  SERVIDOR, quando o MP4 fica pronto (`destino-do-video.ts`,
  `enfileirar-video.ts`). O PostComposer não abre mais sozinho no fim.
- 🔴 **O processamento de vídeo é durável**: reserva por compare-and-set com
  arrendamento (`startedAt` é o token, `VideoProcessingJob.attempts`, até 2),
  job preso volta a PENDING, cada etapa tem marcador (MP4 enviado não é
  reconvertido, cobrança marcada DENTRO da transação do débito, post não
  duplica) e toda escrita final confere o arrendamento. Etapa que escreve em
  dois lugares escreve no mesmo commit. A rota da fila processa o próprio job
  em `after()`; o cron é a rede.
- 🔴 **`SocialPost.videoDaPagina` é a origem de vídeo, gravada na criação e
  nunca limpa por edição**; `postDeVideo` = essa marca OU mídia de vídeo. Post de
  vídeo nunca é redesenhado como imagem (aprovação, invalidação,
  `renderPostArt`, executor, MCP local), mesmo com a mídia limpa pela agenda.
- **O vínculo vídeo → página mora em `Generation.fieldValues.videoDaPagina`,
  NUNCA em `fieldValues.pageId`**: a "arte da página" (`arteDaPagina`, usada por
  levantamento, trava e agenda-das-paginas) ignora Generation de vídeo, senão a
  recomposição pegaria o MP4 como a arte.
- **Substituir = gravar de novo e trocar o MP4 no MESMO post**, por
  compare-and-set na revisão do post (`updatedAt`) lida ao enfileirar; a única
  revisão intermediária aceita é a da substituição anterior da mesma cadeia.
  Recusa (post editado, congelado, publicado) deixa o vídeo novo na galeria e o
  motivo no histórico do post. Só DRAFT/SCHEDULED com `laterPostId` nulo.
- **`versaoDoVideo` = `versaoDaPagina` + `Page.audio`**, calculada do retrato
  GRAVADO: é o que acende "vídeo desatualizado · Substituir" na faixa da página
  e o aviso no detalhe do post.
- **Editor aberto pela agenda com `postId`**: "Substituir vídeo na agenda" e
  "Salvar sem gerar" (que pergunta antes de voltar se o vídeo ficou velho).
  `useAgendaDasPaginas(templateId, postId)` devolve ESTE post, não o mais novo da
  página.
- **Movimento** (`layer.movimento`: aproximar/afastar/deslizar, só foto, só em
  página-vídeo) e **transição** (`clipe.transicao`: dissolver/deslizar, no clipe
  que entra; o som continua cortando seco) moram num `Group` de EFEITO, nunca no
  nó editável: `aplicarQuadro` (um só para prévia e export) escreve ali, e o
  arraste/transformação continuam gravando o nó de dentro. A mesma geometria
  roda no `render-engine` a partir do quadro anotado por `camadasNoInstante`.
- **Teste de interface logado (03/10, banco de dev, projeto 8)**: gerar →
  rascunho na hora pedida; "Editar vídeo" → editor com o post; edição →
  `videoDesatualizado: true`; substituir → MP4 trocado no mesmo post. ⚠️ Em
  sessão longa no localhost a sessão do Clerk expira e TODA chamada vira
  `/sign-in?redirect_url=…` (200) — recarregar a página renova; não é defeito
  do código.
