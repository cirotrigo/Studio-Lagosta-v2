# Publicação, agenda e verificação

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### Instagram Story Verification System
The application includes an independent verification system for Instagram Stories using the Instagram Graph API to confirm that posts scheduled via Buffer/Zapier were actually published.

#### Verification Approach (v1 - Simplified)
- **Primary Method (Plano A)**: Uses unique verification tags in captions
- **Fallback Method (Plano B)**: Matches by timestamp + media_type (expected to be primary method in production)
- **TAG Format Decision**: Uses `SL-{postId6chars}-{hash4chars}` format (without `#` prefix)
  - Chosen for better compatibility with Buffer's tag system
  - Original plan suggested `#SLTAG-{8chars}-{4chars}` but simplified for practical use
  - 6 characters of postId provide sufficient uniqueness for our scale

#### System Architecture
**Core Components**:
- `src/lib/posts/verification/tag-generator.ts` - Generates and validates unique tags
- `src/lib/posts/verification/story-verifier.ts` - Main verification logic with fallback
- `src/lib/instagram/graph-api-client.ts` - Instagram Graph API client
- `src/app/api/cron/verify-stories/route.ts` - Cron job endpoint (a cada 5 min;
  só passou a ser agendado no `vercel.json` em julho/2026 — antes o código
  existia mas nunca rodava, e o status VERIFIED vinha do sync do Zernio, isto é,
  do relato do próprio agendador)
- `src/app/api/webhooks/buffer/post-sent/route.ts` - Webhook handler that schedules verification

**Database Fields** (SocialPost model):
- `verificationTag` - Unique tag added to caption
- `verificationStatus` - Enum: PENDING, VERIFIED, VERIFICATION_FAILED, SKIPPED
- `verificationAttempts` - Retry counter (max 3 attempts)
- `nextVerificationAt` - Scheduled time for next verification attempt
- `verifiedStoryId` - Confirmed story ID from Instagram API
- `verifiedByFallback` - Boolean flag indicating if fallback method was used
- `verificationError` - Error code for debugging failed verifications

#### Verification Flow
1. **Post Creation**: TAG generated for STORY posts, added to caption before sending to Zapier
2. **Webhook Trigger**: Buffer webhook receives response, schedules verification (+5 min)
   - **IMPORTANT**: Verification is scheduled for ALL stories, regardless of Buffer's reported status
   - Buffer webhook is not reliable - posts may publish even if Buffer reports failure
   - Posts with `status: FAILED` are also verified to catch false negatives
3. **Cron Verification**: Every 5 minutes, cron job processes pending verifications:
   - Fetches stories from Instagram Graph API
   - Verifies ALL pending posts (both POSTED and FAILED status)
   - **Primary attempt**: Searches for TAG in story captions (Plano A)
   - **Fallback attempt**: If TAG not found, matches by timestamp (±5 min) + media_type (Plano B)
   - Accepts match only if exactly 1 candidate found (avoids false positives)
   - Retries with backoff: 5, 10, 15 minutes (max 3 attempts)
   - Respects 24-hour TTL for stories
4. **Result**: Post marked as VERIFIED (success), VERIFICATION_FAILED (not found/error), or SKIPPED (legacy/non-story)
   - If verified and post was FAILED, it means Buffer reported incorrectly

#### Fallback Method (Plano B) - Primary Expected Method
The fallback verification is robust and production-ready:
- **Time Window**: Matches stories within ±5 minutes of expected timestamp
- **Media Type Detection**: Compares image vs video based on URL patterns
- **Ambiguity Handling**: Rejects matches if multiple candidates found
- **Base Timestamp**: Uses `sentAt || bufferSentAt || scheduledDatetime || createdAt`
- **Expected Usage**: Primary method in production (TAGs serve as backup identifier)

#### Error Handling
- **Token Errors**: Detected and logged, manual token refresh required
- **Rate Limiting**: Automatic 15-minute delay before retry
- **Permission Errors**: Detected and logged with specific error codes
- **TTL Expiration**: Posts older than 24h marked as failed (stories expire)
- **Legacy Posts**: Posts created before launch date automatically skipped
- **API Errors**: Generic errors trigger standard retry logic

#### Environment Variables
- `INSTAGRAM_ACCESS_TOKEN` - Token global (usuário do sistema, via Facebook).
  Usado só para projetos **sem** token próprio.
- `INSTAGRAM_GRAPH_API_VERSION` - API version (default: v25.0)
- `INSTAGRAM_GRAPH_API_BASE_URL` - Override do host; normalmente não é preciso,
  o host é derivado do prefixo do token
- `VERIFICATION_FEATURE_LAUNCH_DATE` - Feature activation date (default: 2024-12-01)
- `CRON_SECRET` - Authentication for cron endpoints

#### Token por projeto (Instagram Login)

As contas dos clientes ficam em portfólios empresariais separados, fora do
alcance do token global. Cada projeto pode ter o seu:

- Campos: `Project.instagramAccessToken`, `instagramTokenExpiresAt`,
  `instagramAppScopedId`
- Cadastro: aba **Configurações** do projeto, ou
  `npm run ig:token -- <projectId> <TOKEN>`
- **Expiram em 60 dias**; `/api/cron/refresh-instagram-tokens` renova
  diariamente. Foi a falta disso que derrubou a integração em março/2026,
  sem ninguém perceber por meses.
- O id do Instagram Login é de outro espaço que o id de conta business
  (`1784...`) — não são intercambiáveis. Com token próprio, a conta é
  endereçada por `me`.
- **O token nunca deve chegar ao cliente**: `GET /api/projects/[id]` e o
  service de client-projects expõem apenas `hasInstagramToken`. Campos
  sensíveis novos no `Project` precisam do mesmo cuidado.

#### Métricas de story (atenção às mudanças da API)

- `impressions` foi **descontinuada** em março/2025; para stories use `views`.
- `exits`, `taps_forward` e `taps_back` **não existem mais** — substituídas por
  `navigation`.
- O Instagram rejeita a requisição **inteira** se uma métrica não existir na
  versão. `getInsights()` remove a recusada e refaz, intersectando com a lista
  que a própria API devolve no erro.
- Insights de story só existem nas 24h em que ele está no ar; `fetch-story-insights`
  roda de hora em hora e **recolhe** enquanto o story vive, porque os números
  crescem. Perdida a janela, o dado é irrecuperável.

#### Important Notes
- **PostStatus.VERIFYING**: Enum value exists but is NOT used; system uses `verificationStatus` field instead
- **Non-STORY Posts**: Automatically receive `verificationStatus: SKIPPED` (no verification needed)
- **Grouping Optimization**: Posts grouped by Instagram account to minimize API calls
- **Security**: All error messages sanitized to remove tokens before logging
- **Monitoring**: Verification results logged with structured data for debugging

### Janela de congelamento — até quando a arte é editável (03/08/2026)

O post só é entregue ao Zernio **5 minutos antes do horário**
(`FREEZE_WINDOW_MS` em `src/lib/posts/freeze-window.ts`). Antes disso a arte no
banco é a única fonte de verdade e pode ser editada à vontade; depois, o que
vai ao ar é a cópia que está no Zernio.

**O que havia antes**: o PRE-SEND do executor entregava TODO post futuro assim
que ficasse renderizado, sem teto de data — mediana de **39 segundos** após o
agendamento, com posts congelados por até 27 dias. Como nada no funil de render
fala com o Zernio, editar a arte depois disso não mudava o que era publicado:
**29 posts em 33 dias publicaram a versão velha, em silêncio**, com a agenda
mostrando a arte certa. O PRE-SEND não nasceu de incidente nenhum — entrou como
bullet do commit de rebrand `b7409a5` (17/04/2026); até ali o Studio era o
relógio, com `publishNow` fixo.

Regras que sobrevivem:

- **`laterPostId` não nulo significa INTOCÁVEL.** `invalidateScheduledRenders`
  não mexe nesses posts e os devolve em `congelados[]` — zerar `mediaUrls` de um
  post armado publicaria a arte velha do mesmo jeito **e** quebraria a capa na
  agenda e o `recover-stuck-post`, que reconstrói a publicação a partir dela.
  Quem chama a invalidação precisa contar isso a quem editou.
- **A invalidação devolve `{ invalidados, congelados }`, não `number`.** São 7
  chamadores; o `tsc` **não** pega quem interpola o retorno em template literal
  (foi assim que `rerender-agendados.ts` passou batido na primeira leva).
- **Encurtar a janela mexe em duas coisas opostas**: mais tempo editável, menos
  folga para o sistema se recuperar. Com 5 min a cadeia de retry (~7 min) já
  não cabe inteira. E a janela mudou **quem responde pelo horário**: com a
  entrega horas antes, queda do nosso cron era irrelevante; agora, se o cron
  estiver fora do ar nos minutos finais, ninguém publica.
- **`checkStuckPosts` ganhou o caso (c)**: SCHEDULED sem `laterPostId` que
  passou 6h do horário vira FAILED + aviso. Os casos (a) e (b) exigem POSTING e
  `laterPostId` — nenhum enxergava esse post, e havia **19 parados em silêncio**
  no banco. O piso de 7 dias existe para os zumbis antigos não virarem enxurrada
  no grupo.
- **`renderPostArt` (`src/lib/posts/render-post-art.ts`) reserva apenas por
  `renderStatus: PENDING`** — os portões de `renderAttempts < 3` e
  `nextRenderAt <= agora` vivem nas queries de quem chama, e o orçamento de
  tentativas é **compartilhado** entre o cron `render-stories` e o render de
  última hora do executor. Chamador novo que esqueça os portões queima as 3
  tentativas em 3 minutos e marca `RENDER_FAILED`, que é terminal.
- **Aviso de falha de arte tem trava de 15 min** (`registrarFalhaDeArte`): o
  `dedupeByPost` do batch só protege dentro de UMA execução do cron, e o post
  vencido volta a cada minuto. Log sempre, aviso uma vez.
- **`maxDuration` de rota vai INLINE, não no `vercel.json`**: o glob de lá é
  `app/api/**` e o projeto é `src/app/**` — nenhuma entrada casa. É por isso que
  11 crons declaram inline; `/api/cron/posts` não declarava e rodava no default
  da plataforma.
- **Voltar para rascunho reconstrói a arte** (`agenda-acoes.ts`, ramo REVERT):
  marca `renderStatus: PENDING` quando o post tem página e a arte veio do
  render. Sem isso havia uma ordem que publicava a versão antiga em silêncio —
  editar o template AINDA congelado (a invalidação pula), voltar para rascunho
  (não mexia em renderStatus) e aprovar (só força render com `mediaUrls`
  vazio). Justamente a sequência que a agenda recomenda.
  O guard `renderStatus === RENDERED` protege a arte MELHORADA com IA, que é
  `NOT_NEEDED` porque não vem da página; `mediaUrls` fica intacto de propósito,
  para o rascunho não ficar sem imagem se o render falhar.
- **O backlog anterior ao deploy não é alcançado**: quem já está no Zernio sob a
  regra antiga segue congelado, e a invalidação segue sem efeito nele.

### Retry de publicação e avisos de falha no WhatsApp

Post que falha **continua FAILED** (não existe status novo, não volta para
rascunho), ganha uma nova tentativa 1 minuto depois e, se a tentativa também
falhar, a equipe é avisada num grupo de WhatsApp via Evolution API.

`src/lib/posts/failure-handler.ts` é o ponto único: `handlePublishFailure`
decide entre agendar retry e avisar. `executeRetries` (`executor.ts`) reexecuta
e reagenda até 3 tentativas; `/api/cron/posts` roda a cada minuto e já chama os
dois — não precisa de cron novo.

#### Armadilhas

- **O retry já foi código morto por meses.** `scheduleRetry` só era chamado de
  dentro do próprio `executeRetries`, para agendar a tentativa seguinte. Nenhum
  ponto de falha criava o primeiro `PostRetry`, então post que falhava nunca era
  retentado. Quem liga o primeiro retry hoje é `handlePublishFailure`, chamado
  do `catch` do `sendToLater` (cobre os quatro ramos de erro de uma vez) e da
  varredura de posts travados. **Caminho novo que marque FAILED precisa chamar
  `handlePublishFailure`**, senão o post volta a morrer em silêncio.
- **`sendToLater` ignora qualquer post que já tenha `laterPostId`** e devolve
  `{ success: true, skipped: true }`. Retry nesses posts é um no-op que
  `executeRetries` grava como SUCCESS — pior que não retentar. Por isso
  `handlePublishFailure` só agenda retry quando `laterPostId` é null; post que
  já chegou ao Zernio é **notificado, nunca reenviado**. Limpar o `laterPostId`
  para forçar reenvio arriscaria publicação dupla, porque não dá para saber se
  o Zernio chegou a publicar.
- **Erro determinístico não vira retry**: crédito insuficiente, projeto sem
  conta do Instagram conectada, formato de imagem incompatível, e story cujo
  render falhou nas 3 tentativas. Todos avisam direto (`nonRetryableReason`).
- **Dedupe por janela de 30 minutos**: se já existe `PostRetry` recente para o
  post, `handlePublishFailure` sai sem fazer nada. É o que evita retry duplicado
  quando mais de um caminho marca o mesmo post como FAILED, e aviso duplicado
  quando a falha vem de dentro do próprio `executeRetries` — nesse caso a cadeia
  de retry é dona tanto da próxima tentativa quanto da mensagem.
- **O aviso sai na 2ª falha**, não na 1ª nem na última: `executeRetries` avisa
  quando o retry de `attemptNumber === 1` falha. As tentativas seguintes não
  avisam de novo.
- **Cron que pode falhar precisa ser embrulhado** em
  `withFailureNotificationBatch`, senão 5 posts falhando viram 5 mensagens no
  grupo em vez de uma. Já embrulhados: `posts`, `reminders`, `status-sync`,
  `check-stuck-posts`.

#### Notificação

`src/lib/notifications/evolution.ts` (cliente) e `post-failure-notifier.ts`
(mensagem e agrupamento). Envio: `POST {host}/message/sendText/{instancia}`,
header `apikey`, body `{ number, text }`; para grupo o `number` é o JID que
termina em `@g.us`.

- **Falha de notificação nunca propaga.** `sendWhatsAppText` devolve boolean e
  engole tudo — publicação não pode quebrar porque o WhatsApp caiu.
- Mensagem **em português, sem jargão de banco** (nada de FAILED/DRAFT/
  SCHEDULED): cliente, tipo de post, horário que era para sair no fuso de
  Brasília, motivo e link para `{APP_URL}/projects/{projectId}?tab=agenda`.
  Motivos longos do Zernio são colapsados e cortados em 220 caracteres.
#### Lembretes de publicação manual

Post com `publishType: REMINDER` não é publicado pelo sistema — alguém publica
na mão. `/api/cron/reminders` (a cada 5 min) manda pelo WhatsApp, 5 a 10 minutos
antes do horário, tudo que essa pessoa precisa: a arte, a legenda, o primeiro
comentário e a observação. Ver `src/lib/notifications/reminder-notifier.ts`.

- **Até julho/2026 isso era um webhook por projeto** (`Project.webhookReminderUrl`),
  e os 11 projetos apontavam para o mesmo n8n. A coluna, a rota
  `/api/projects/[projectId]/test-webhook` e o componente
  `reminder-webhook-config.tsx` foram **removidos** — não reintroduza o campo
  achando que sumiu por engano.
- **Uma mídia vai como imagem legendada** (uma mensagem só); com várias, o texto
  vai primeiro e as artes em seguida, numeradas, para a ordem do carrossel ficar
  clara.
- `reminderSentAt` só é gravado quando a mensagem principal sai. Arte extra que
  falha é apenas logada — reenviar tudo na rodada seguinte duplicaria o lembrete.
- **A janela vai de 2 horas atrás até 10 minutos à frente.** Era só
  `[+5min, +10min]`, e por isso lembrete criado com menos de 5 minutos de
  antecedência nunca disparava — ficava SCHEDULED para sempre. Cinco posts
  morreram assim entre janeiro e maio de 2026, todos apagados em 28/07.
  O que estiver vencido além das 2 horas **não** é avisado (lembrete de ontem
  só polui o grupo), mas sai no log em vez de sumir calado.
- Lembrete fora da janela normal recebe `late: true` e a mensagem muda de
  "Hora de publicar" para "Publicar agora".
- **Falha de envio grava PostLog sempre, mas avisa o grupo uma vez só.** Como o
  post continua elegível por 2 horas, sem essa trava a mesma falha viraria um
  aviso a cada 5 minutos.

#### Environment Variables

`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`,
`EVOLUTION_NOTIFY_GROUP_ID`. **Sem as quatro preenchidas o aviso vira log e
nada quebra** — o resto do fluxo segue normal. Valores só em ambiente, nunca no
código; o `.env.example` tem apenas os nomes.

### App de bolso (PWA): bancada, agenda e criativos no celular (13/08/2026)

O site virou PWA instalável ("Lagosta de Bolso") — plano e decisões em
`docs/PLANO-2026-08-12-APP-MOBILE-BANCADA-AGENDA.md`. Regras que valem para
código novo:

- **A arte aparece INTEIRA, na proporção em que foi gerada — nunca cortada.**
  Requisito do Ciro (13/08): `object-contain` sobre `bg-muted`, contêiner na
  proporção do formato (`aspectClassForPostType`). Os quatro `object-cover`
  da agenda foram trocados; componente novo que exiba arte segue o mesmo.
- **Ícones do PWA**: `scripts/gerar-icones-pwa.ts` (sharp sobre SVG inline)
  gera `public/icons/*`. Maskable é arquivo SEPARADO com quadro cheio — o
  launcher recorta com a própria máscara; reusar o ícone de cantos
  transparentes vazaria os cantos. O "L" é path, não `<text>` (fonte no
  librsvg depende da máquina). O manifest é estático; o ícone dinâmico do
  admin não o afeta — trocar o ícone do app instalado exige regerar os PNGs.
- **A tabbar mobile só monta no ramo normal do layout protegido** — o ramo
  full-bleed é o editor de canvas, e a barra cobriria a área de trabalho.
- 🔴 **Post de LEMBRETE nunca passa pelo publicar-agora do PUT.** O executor
  ignora `publishType: REMINDER` de propósito; armar o PUT nesses posts podia
  até mandar lembrete ao Zernio. O caminho é a tela de publicação manual
  (`/projects/[id]/agenda/[postId]/publicar`: salvar no rolo, copiar legenda
  e 1º comentário, abrir Instagram). Ela NÃO marca o post como publicado —
  quem confirma publicação de story é a verificação de sempre.
- **Post congelado (`congelado` da API) não mostra Publicar Agora** — antes
  o botão aparecia; esconder é deliberado, junto com editar/melhorar.
- **Card da grade da agenda não é mais um `<button>` único**: virou `<div>`
  com botão interno, porque ação rápida dentro dele criaria botão dentro de
  botão (HTML inválido). Overlay novo entra como irmão do botão interno.
- 🔴 **Arquivar entrada da base é `PUT { status: 'ARCHIVED' }`, NUNCA o
  DELETE** — o DELETE da rota apaga a entrada E os vetores de vez. E o
  `expiresAt` fica FORA do payload de edição: na rota, ausente = não mexe,
  `null` = LIMPA o prazo da campanha em silêncio.
- **`POST /api/projects/[id]/executar-plano`** replica o gate do MCP: sem
  `confirmar === true` literal nada é escrito e volta a conta. O disparo
  imediato (F0.3) é da ROTA, em `after()`, limitado a 3 jobs e só quando o
  handler consumiu < 60s — o resto sai pelo cron em ≤ 1 min. O diálogo da
  conta fala em PEÇAS, nunca em créditos; saldo curto avisa, não veta.
- **Upload de foto do celular → acervo** (`acervo-upload.ts`): a pasta
  "Fotos do Celular" nasce FILHA DIRETA da raiz de imagens do projeto — a
  mesma que `reconciliarCatalogo` varre, então a foto é catalogada na rodada
  das 02:00. Bytes ORIGINAIS para o Drive (insumo não se reencoda; sem EXIF
  rotate). HEIC do iPhone é farejado no cabeçalho e recusado com orientação
  (sharp 0.33.5 não decodifica HEVC; o Safari costuma transcodificar ao
  escolher do rolo). 🔴 Garantir pasta exige paginação completa da listagem
  — `listFiles` tem pageSize 50 fixo e raiz cheia criaria pasta duplicada.
  Projeto SEM catálogo continua fora da busca por tema (o cron o pula) —
  a foto aparece só por pasta até a análise manual.
- 🔴 **Nunca chamar `/slots` para uma LISTA de clientes** — cada chamada
  emite sugestões como `LearningSignal`; em lista, geraria sinal para
  cliente que ninguém abriu. O resumo do seletor da bancada agrega UMA
  chamada ao calendário global. Na bancada do projeto, a cobertura reusa a
  MESMA queryKey de slots do compositor (uma ida por página).
- **O calendário global não traz `slotValues`** (o por projeto também não) e
  "expande" posts recorrentes com `isRecurringPlaceholder: true` no 1º dia
  da janela — quem agrega descarta os placeholders, senão conta post que
  não existe.
- **"A semana está coberta ✓" exige ritmo aprendido**: `sugestoes` vazio com
  `cadencia` vazia é cold start, não cobertura.
- 🔴 **`/api/drive/thumbnail` devolvia o ORIGINAL** — `getThumbnailStream`
  ignorava o `size` e mandava os bytes inteiros (`alt: 'media'`), contando
  com o `<Image>` do Next para reduzir; o seletor de fotos renderiza
  `unoptimized`, então 40 células decodificavam ~48MB de bitmap cada e o
  Safari do iPhone matava a aba ("Um problema ocorreu repetidamente" na
  bancada, 13/08). Hoje o serviço honra o tamanho: `thumbnailLink` do
  Google (lh3, consumido no servidor — o link é assinado e expira, nunca
  repassar ao cliente) com fallback sharp (`.rotate()` para o EXIF).
  Consumidor de miniatura passa `?size=` explícito — também é o
  cache-buster contra os originais que ficaram no cache do navegador.
  O pipeline de IA não passa por essa rota (extrai o `fileId` e baixa o
  original direto), então miniatura pequena não afeta geração.

### Remarcar um post leva as páginas da arte junto (04/09/2026)

Post remarcado deixava a `Page` para trás: na pasta da semana antiga e com o
nome carregando a data velha — "Sex 18/09 · 09:00 · Coronel Picanha" num post
que passou a sair em 25/09. Como a pasta da semana é o que a equipe abre para
revisar e aprovar a programação, pasta e nome mentindo a data desfaziam
justamente o que a separação por formato veio resolver.

- **`refilarPaginasDoPost(postId, quando, userId)`** (`compositor/pastas.ts`) é
  a irmã de `moverPaginaParaSemana`, não uma extensão dela: aquela só aceita
  peça que ainda está em coletor ou nas avulsas (`ehComposta && emAvulsas`) e
  **não renomeia** — existe para a peça que ACABOU de ganhar data. Página já
  arquivada numa pasta de semana cai fora do gate dela e fica parada.
- **Está ligada nos QUATRO pontos que escrevem a data de um post existente**,
  mapeados por varredura: o PUT de `posts/[postId]` (arrastar no calendário,
  "Re-agendar" e o formulário de edição chegam TODOS ali — é o de maior
  volume), o PATCH de `external/posts/[postId]`, `reagendarPost`
  (`agenda-acoes.ts`, a tool do conector) e o `update-post` do MCP local.
  Caminho novo que mude `scheduledDatetime` precisa chamá-la, senão a página
  volta a ficar para trás em silêncio.
- 🔴 **O id no nome do arquivo do render NEM SEMPRE é o da página**: o
  compositor nomeia por PÁGINA (`<pageId>-<epoch>.png`) e o render de post
  avulso nomeia pelo POST. Sem descartar o id do próprio post, o carrossel
  adota uma página que não existe.
- 🔴 **Mídia única NÃO é slide.** Story e post de imagem única também têm a arte
  nomeada pelo id da página; sem o corte por `mediaUrls.length > 1` a peça
  avulsa vira "slide 1" e a ordem sai deslocada dentro do minuto.
- **Best-effort, sempre**: refilar não pode derrubar um reagendamento — mesmo
  contrato de `moverPaginaParaSemana` e de `sendWhatsAppText`. Modelo
  (`isTemplate`) e página que não é do compositor são pulados com aviso.
- ⚠️ **Trocar `mediaUrls` também envelhece o nome** (o "slide 2/5" muda), e
  isso NÃO dispara refile hoje — a função trataria, o gatilho é que não existe.
- `scripts/validar-refile-ao-remarcar.ts` prova o caminho real indo e voltando
  num rascunho e confere que o estado final é idêntico ao inicial. Ele CRIA a
  pasta da semana de destino (efeito inerente do `garantirPasta`) e não a
  remove.
- 🔴 **Link de editor para a página de um post sai do template ATUAL da
  página, nunca de `SocialPost.templateId`** (21/09/2026). As duas mudanças de
  pasta movem só a página (e `agendarPost` cria o post ANTES de mover), então a
  coluna fica na pasta antiga; o editor não acha o `pageId` lá e o fallback do
  `multi-page-context` abre a primeira página daquele template — outra peça.
  As rotas que servem o post à agenda (`GET posts/[postId]` e
  `GET posts/calendar`) devolvem `templateId` por `comTemplateDaPagina`
  (`src/lib/posts/template-do-post.ts`), e o botão usa `editarTemplateHref`.
  É leitura: conserta todo post antigo sem backfill e nunca toca post
  congelado. A coluna NÃO é reapontada na mudança de pasta, de propósito —
  página se move por mais caminhos (scripts de migração inclusive), e uma cópia
  a manter em dia é a segunda fonte de verdade. A `Generation` que o catálogo
  registra no agendamento segue indo para a pasta de antes, como a do próprio
  compositor (quem a procura usa `fieldValues.pageId`).

### Novo Post: data primeiro, agendamento rápido e Repostar (05-06/09/2026)

Plano e medições em `docs/PLANO-2026-09-05-REPOSTAR-NA-ABA-CRIATIVOS.md`.
Regras que valem para código novo:

- 🔴 **`cleanupGenerations` reaponta os POSTS antes de apagar o blob**
  (`reapontarMidiasDosPosts`, `src/lib/cleanup/reapontar-midias.ts`, nas três
  passagens: Pass A, Pass B-recovery e o `cleanupGenerationBlobs` diário). Até
  05/09 só `Generation.resultUrl` era reapontado para o Drive e
  `SocialPost.mediaUrls` ficava com a URL recém-apagada: **40% das artes de
  posts com mais de 90 dias respondiam 404** — a arte existia, o endereço do
  post é que tinha morrido. Vale para QUALQUER status: com repost, um post
  SCHEDULED pode apontar para arte de 85 dias, e o cron de domingo entregaria
  URL morta ao Zernio. `scripts/reapontar-midias-mortas.ts` (dry-run por
  padrão) reparou o histórico em 06/09/2026: **1.311 posts** reapontados pela
  Generation; **459** sem Generation não têm conserto (criativo apagado à mão
  pela galeria apaga blob E linha).
- **A mídia de um post antigo se resolve pela Generation, nunca pela
  `mediaUrls`** — é a URL que o cleanup mantém viva. O card de repost ainda se
  esconde no `onError` da imagem.
- **A fonte do repost é o `SocialPost` POSTED, nunca a galeria**: só 36% dos
  posts publicados têm Generation alcançável pela aba (76% nos últimos 90
  dias). A chave de "mesma arte" é a **URL da imagem** sem query
  (`chaveDaImagem`): 1.374 posts têm `generationId` cuja mídia publicada é
  OUTRA (a melhoria cria arte nova) — contar por Generation zeraria o contador
  de quem mais reposta.
- **Semáforo, não portão; ordena, nunca esconde; só STORY.** Medido nos 2.605
  reposts reais: 47% têm menos de 14 dias (verde ≥14 · âmbar 7-13 · vermelho
  <7, tudo visível); 51% caem fora de dia+faixa (o ranking de
  `src/lib/posts/repostar.ts` ordena, `jaAgendadas` é o único filtro); 2.595
  são story (feed repostado fica duplicado no perfil). Aviso de prazo é
  ESTREITO (data, mês, urgência, data comemorativa — 5% das legendas);
  🔴 `pareceDado` dispara em 97% e não serve aqui.
- **`horariosTipicosDoProjeto` é a leitura da cadência SEM emissão** (a mesma
  conta de `sugerirPosts`: cadência v2 + grade da base). 🔴 **Nunca chame
  `sugerirPosts` do formulário** — ela registra um `LearningSignal` por slot.
- **O "+" da agenda manda só o DIA** (`novoPostHref(id, dia, { soDia: true })`
  → `?dia=AAAA-MM-DD`); a hora vem dos horários típicos daquele dia da semana
  (`horarioPadrao`, `src/lib/posts/quando.ts`, puro). Antes cravava 10:00 nos
  dois chamadores, e o picker inventava "amanhã 12:00".
- **O formulário é QUANDO → MÍDIA → LEGENDA (só feed) → "Mais opções"**, com
  STORY e SCHEDULED como padrão (92% e 73% dos 2.684 posts de 90 dias).
  Recorrente (0), lembrete (1%), 1º comentário (0 de 216) moram em "Mais
  opções" com a mesma regra de negócio. 🔴 **Story não tem campo de legenda**:
  o envio grava `caption: ''` para story desde sempre, e o campo antigo
  descartava o que a pessoa digitava. Mídia que já chega escolhida (galeria,
  editor) abre com as fontes recolhidas e "Trocar mídia".
- **"Agendar e próximo"** (`proximoHorario`): agenda e reabre no horário típico
  seguinte do mesmo dia, sem sair da tela. Os dois botões são `type="submit"`
  do mesmo form; o secundário arma um ref no `onClick`.
- **`LearningSignal tipo: 'repost'`** — UMA proposta por `(projeto, 'repost',
  diaBRT, HH, safra)` (`chaveDoRepost`); o formulário reconsulta a cada toque
  e a chave é o que impede o denominador de virar ficção. O desfecho é
  CALCULADO na rota `POST /posts` (`fecharPropostaDeRepost`): mídia ou
  Generation entre os candidatos → `aceita-como-veio`; faixa existia e usou
  outra → `trocada`; sem proposta para o slot → nada.
- **`sugerir-repost` no conector** (catálogo `agenda.ts`, fixture em
  `validar-registro-mcp.ts`): mesma função de serviço, `superficie: 'chat'`.
- ⚠️ **"Usar a legenda anterior" ficou de fora, de propósito**: a faixa só
  existe em story e o formulário não tem legenda de story. Os 53% de reposts
  com a mesma legenda vêm do conector e do compositor, que gravam a caption
  do story — reaproveitá-la é trabalho do chat, não deste formulário.

### 🔴 A arte agendada por página desenha a PÁGINA (10/09/2026)

Relatado pelo Ciro na Real Gelateria: abriu pela agenda os stories do Dia do
Milk-shake (compostos e agendados pelo chat), editou texto e espaçamento,
converteu uma linha para rich text e clicou em "Salvar e Voltar". A arte
re-renderizou e voltou para a agenda sem nenhuma das edições. O contorno foi
gerar o criativo, apagar o post e agendar o criativo.

- 🔴 **O render aplicava `SocialPost.slotValues` por cima da página, e na via
  de conteúdo esse campo é só uma CÓPIA do texto do dia do agendamento.** O
  remendo de 03/09 (`seguirCopyDaPagina`) fazia a cópia seguir a página no
  PATCH do editor, mas só enquanto ela ainda era IGUAL ao texto anterior.
  Linha do tempo real, lida dos sinais `copy`/`geometria` das páginas: às
  15:35 um `ajuste-arte` pelo chat reescreveu a página por outro caminho, as
  duas divergiram, e dali em diante nenhuma edição chegou mais à arte.
  Renderizado localmente com o pipeline de produção: só a página sai idêntica
  ao criativo de contorno; com a cópia por cima, o rich text pinta os
  caracteres errados, e no story de sexta o apoio velho, em duas linhas, cai
  em cima da linha de serviço (estava agendado para publicar assim).
- **A semântica é gravada na ESCRITA** (`src/lib/posts/copy-segue-a-pagina.ts`):
  quem copia o texto da página — `agendarPost` e `trocar-arte-do-post` por
  página — grava `slotValues` com `_copiaDaPagina: true`. `slotValuesParaRender`
  devolve nada para post marcado, e `renderStoryImage` desenha a página como
  está: sem aplicar slot e sem refluir, então o espaçamento acertado à mão
  sobrevive. O remendo do PATCH saiu.
- 🔴 **A MARCA NÃO BASTA — quem decide é o que a página É (20/09/2026).** Até
  aqui, "sem a marca vale a regra antiga" significava que um `true` esquecido
  em QUALQUER um dos seis escritores de `slotValues` reintroduzia o defeito
  inteiro, em silêncio. E aconteceu: a Real Gelateria editou o feed do Dia
  Nacional do Sorvete (template 466), salvou, a invalidação funcionou, o cron
  re-renderizou — e a arte saiu com a manchete anterior ("Amanhã, Seu Gelato /
  Vem em Dobro"), porque aquele post estava sem a marca. **Qual escritor a
  perdeu continua sem explicação**: a leva inteira da semana da Real (12 posts
  de 15/09) saiu sem marca, com o código de marcação em produção desde 10/09 e
  marcando em 15/09 de manhã e em 16/09. Varredura da carteira: 35 posts com
  página PRÓPRIA e sem marca, 7 deles já com a copy divergindo da página.
  Hoje `slotValuesParaRender(slotValues, paginaEhModelo)` decide pelo que a
  página é: **modelo (`isTemplate`) → os slots vencem** (layout compartilhado,
  N posts, cada um com a sua copy); **página de conteúdo → a página manda**,
  marca ou não. Confere com os dados: dos 90 posts com página e `slotValues`,
  os 9 da via de template são todos `isTemplate` (abril/2026, `plan-week`) e
  os 81 da via de conteúdo, nenhum. `applySlotValues` só troca o conteúdo de
  camada que já existe, então página sem camada de texto renderiza igual dos
  dois lados. A marca continua valendo e é o sinal mais forte (recusa os slots
  até em página modelo); o que ela deixou de ser é obrigatória.
- **A cópia acompanha o que foi DESENHADO**: `renderPostArt` regrava o
  `slotValues` com `RenderStoryResult.copyDaPagina` — e quem decide é o
  RENDER (`aplicouSlots`), não a marca, pelo mesmo motivo; sai já MARCADA, de
  modo que o re-render cura a marca que faltou, sem backfill. É o que o corpus
  e a conferência de texto da melhoria leem.
- 🔴 **Rich text é copy.** `textosDaPagina` e `copyDosPapeis` liam só
  `type: 'text'`: converter uma linha fazia o bloco sumir da copy — do corpus,
  da conferência e da recomposição, que refaria o slide sem ele e reescreveria
  `Page.layers` em texto simples. Camada que muda de tipo passa a contar como
  ajuste manual em `medirDefasagem` (re-render como está, nunca recompor).
- 🔴 **Post com várias mídias nunca volta para a fila de render**
  (`renderDaPaginaCobreAMidia`, na invalidação E em
  `alcancadoPelaInvalidacao`). `renderPostArt` grava `mediaUrls: [url]`; o
  carrossel de sexta da Real (4 fotos, `RENDERED`, com `pageId`) estava a uma
  edição da página de virar uma imagem só. A regra é de CONTAGEM, não de URL:
  o agendador do editor grava `renderedImageUrl` cru e `mediaUrls` normalizado.
- **"Salvar e Voltar" descarrega o autosave antes de sair**
  (`usePageSync().descarregar()`, também no botão de voltar). O
  `router.back()` desmontava o editor e cancelava o timer de 800ms do
  PageSync: a edição feita logo antes do clique nunca chegava ao banco.
- **Backfill `scripts/marcar-copia-da-pagina.ts`** (dry-run por padrão): marca
  o post vivo que comprovadamente carrega cópia da página (sinal
  `copy:post:<id>`, troca de arte por página, ou página do compositor — nunca
  página-modelo), sincroniza a cópia e devolve à fila a arte que já estava com
  texto divergente. Rodado em 10/09/2026: 56 marcados, 1 arte refeita (o story
  de sexta da Real), 2 pulados (rascunhos de abril do By Rock em
  página-modelo). Seguro antes do deploy; **rode de novo depois dele**, porque
  o código antigo agenda sem a marca.
- ⚠️ **Escritor NOVO de `slotValues` a partir da página precisa de
  `comoCopiaDaPagina`.** Sem a marca, a cópia volta a ser aplicada por cima e o
  defeito reaparece em silêncio na primeira escrita de camadas por outro
  caminho.
