# Geração de arte por IA

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### Geração de arte por IA, bancada e carrossel (09/08/2026)

O Studio passou a **criar** arte por IA, não só melhorar. Motor em
`src/lib/ai/creative-generation-{service,runner}.ts`, tela em
`/projects/[id]/bancada`, e no chat pelas tools `gerar-imagem`,
`criar-carrossel`, `confirmar-estilo-carrossel`, `ver-carrossel`. O arco
inteiro está em `docs/SESSAO-2026-08-09-GERACAO-IA-BANCADA-CARROSSEL.md`.

Regras que valem para código novo:

- **A logo NUNCA é INVENTADA — mas desde 10/08/2026 ela é DESENHADA pelo
  modelo** (`logoMode: 'modelo'`, o default). A regra anterior era "nunca
  desenhada pela IA", e nasceu do caso certo pelo motivo errado: em 09/08 o
  gpt-image inventou a logomarca do By Rock porque **nunca recebeu o arquivo**.
  Recebendo, ele reproduz — teste real de 10/08 no mesmo By Rock: palheta,
  "By Rock" manuscrito e STEAKHOUSE conferem, e a marca integra melhor à
  composição do que a colagem.
  O que sustenta a troca é a rede: `conferirLogo` (`creative-qa.ts`) compara
  por visão o que o modelo desenhou com o arquivo oficial e **regera** quando
  diverge ou quando aparece mais de uma. Marca ausente NÃO reprova — o prompt
  autoriza deixar o canto vazio, e arte sem marca é editável.
  **Nunca desligue essa conferência sem voltar o default para `compor`.**
- **`logoMode: 'compor'` (colar o PNG com sharp) continua existindo** e é o
  caminho de fidelidade garantida — use em marca de wordmark fino, onde o
  modelo tende a errar letra. Mas saiba do efeito colateral medido: **o modelo
  desenha a logo mesmo com o "DO NOT DRAW"**, então a peça sai com DUAS (a
  dele, no canto reservado, e a colada). Enquanto isso não for resolvido no
  prompt, `compor` exige olhar a peça.
- **`Project.logoUrl` está NULL nos 10 projetos** — a logo mora na tabela
  `Logo` (aba Assets). `loadBrandContext` já cai nela; consumidor novo de
  identidade usa o loader, nunca um `select` próprio.
- **Referências têm PAPEL** (`subject`, `anchor-ambient`, `anchor-dish`,
  `style`, `series-guide`, `brand-card`, `logo`) e o preâmbulo que declara cada
  papel é escrito pelo BACKEND — nunca deixado a cargo do LLM. Tetos: 1
  subject, 3 âncoras, 2 style; refs demais causam deriva visual.
- **A ÂNCORA MANDA, o prompt só descreve a ação.** Descrever arquitetura por
  texto faz o modelo inventar um lugar genérico. Ambiente se ancora em foto
  real (anchor sheet em `ProjectAnchorImage`, injetada sozinha na trilha
  `imagem`).
- **Duas trilhas que nunca se misturam**: `imagem` (cena SEM texto, prompt de
  12 parágrafos físicos em inglês, validado contra 17 buzzwords e contra os
  termos de carne crua que disparam o filtro) e `arte` (peça com a copy
  verbatim, conferida por visão).
- **Capa de carrossel é foto PURA** — o serviço recusa copy no slide 1. O
  primeiro slide com texto é o GUIA, e os demais só são gerados depois que
  alguém CONFIRMA o look dele. A coerência vem da arte do guia como referência
  + LOOK SPINE + o guia decodificado por visão
  (`carousel-guide-decoder.ts`); sem o último, a cor de destaque varia entre
  slides.
- **Retentativa por divergência de texto usa o tempo MEDIDO** da geração
  anterior (×1,2), não um teto fixo. O teto de 45s fazia a retentativa abortar
  no meio quando a geração levava 131s. Vale nos dois runners.
- **Toda geração grava `{prompt, refs, params, veredito}`** em
  `Generation.fieldValues`, no sucesso e na falha — é o registro que permite
  aprender com cada run.
- **Migration continua sendo escrita à mão + `db:deploy`** (as duas desta
  sessão foram assim).

### Crivo, QA e coerência de carrossel (10/08/2026)

Fecha as Fases 4 a 6 do plano. Detalhe em
`docs/SESSAO-2026-08-10-FASES-4-A-6.md`; o desligamento do Claudinho está
documentado (e NÃO executado) em `docs/DESLIGAMENTO-CLAUDINHO.md`.

- 🔴 **`DATABASE_URL=… npx prisma …` NÃO aponta para o banco que você escreveu:
  o Prisma CLI ignora a variável inline e usa o `.env`, que é PRODUÇÃO.**
  Provado com uma URL inválida de propósito — o CLI reportou o endpoint de
  produção mesmo assim. É pior que a armadilha do `dotenv-cli` já registrada,
  porque a incantação parece explícita. **Sempre `npx tsx scripts/dev-db.ts …`**,
  que compara o compute e recusa produção.
- **O manual do designer vence o card auto-gerado.** `Project.brandManualUrl`
  (upload) tem prioridade absoluta em `getBrandReferenceCard` — é a prática que
  o insta-automatico já tinha, e a diferença de qualidade é grande. Sem manual,
  cai no card desenhado pelo Studio.
- **`BrandDNA.approvalChecklist` NUNCA entra em prompt de geração.** É a única
  seção do DNA que não é instrução para o modelo: são perguntas binárias que
  gente lê antes de agendar. Mora em coluna própria, e não dentro de
  `contentRules`, justamente porque `contentRules` vai verbatim para o prompt.
  ~~A polaridade é MISTA: não construa veredito automático em cima dela.~~ —
  **superado em 11/08/2026**, ver "Crivo conferido pelo sistema" abaixo. O
  crivo agora É avaliado automaticamente (como PERGUNTA sobre uma peça pronta,
  nunca como instrução de geração — esta parte da regra continua valendo).
- **Proporção se confere com assert, nunca com resize.** A finalização usa
  `resize(fit: 'cover')`, que CORTA em silêncio quando a proporção diverge — e
  o corte come a faixa do texto. `checarProporcao` (`creative-qa.ts`) roda antes,
  com tolerância de 2%; fora dela, regera em vez de cortar.
- **QA por visão reprova execução, nunca gosto**: só legibilidade e texto
  cortado na borda. Reprovou na última tentativa, a peça é ENTREGUE com a
  ressalva no `fieldValues` — o texto está certo, e descartar arte
  legível-com-ressalva é pior do que entregar anotada. Visão fora do ar nunca
  derruba a peça.
- 🔴 **QA que reprova PRECISA guardar o candidato.** O `continue` para retentar
  aposta num orçamento que pode ser recusado logo depois — e aí não sobra nada:
  crédito gasto, arte pronta, FAILED. Quatro artes do Espeto morreram assim em
  10/08. Sempre `melhorCandidato`, entregue com a ressalva quando a retentativa
  não acontece.
- **A retentativa quase nunca acontece no formato story**: geração ~110-128s
  contra `maxDuration = 300` da rota, e duas não cabem numa invocação. A margem
  é ADITIVA (o que a checagem consome, ~20s), não proporcional — mas isso só
  recupera casos de borda. `MAX_GENERATION_ATTEMPTS = 2` é 1 na prática até
  alguém retentar em OUTRA invocação.
- **O teto de texto da GERAÇÃO é de ÁREA (~1/5 do quadro), o da MELHORIA é de
  ALTURA (15–20%, nunca >25%)** — e a divergência é de propósito. Um teto de
  altura proíbe a coluna alta e estreita, que é o layout que o modelo escolhe
  quando o espaço livre da foto é vertical (as artes aprovadas do Espeto fazem
  isso). `art-direction.ts` é protegido: não alinhe os dois sem repetir o teste
  de 29-30/07.
- **O prompt precisa DAR AUTONOMIA, não só limites.** Regra 10 de
  `buildArtePrompt`: o modelo lê a foto e põe o texto onde ela é calma, variando
  a diagramação entre peças. Sem essa licença, dez regras viram receita e todas
  as peças saem iguais. Pela mesma razão a logo não tem canto cravado na peça
  avulsa (só no slide irmão de carrossel, onde o LOOK SPINE manda repetir).
- **Separador de lista (`·`, `|`) é DIAGRAMAÇÃO, não conteúdo**: na comparação
  de texto ele vira ESPAÇO. Virando ponto, a arte que desenhava o mesmo
  conteúdo quebrando a linha nunca casava com o esperado.
- **No slide IRMÃO do carrossel, o guia vence o DNA e vem ANTES dele.**
  `visualStyle` e `composition` saem do prompt (o guia já é a marca aplicada e
  aprovada; descrevê-la em prosa é concorrência), e o LOOK SPINE sobe. Medido:
  o arranjo anterior punha o LOOK SPINE aos 85% de um prompt de 13 mil chars,
  atrás de 8,5 mil de DNA. O elemento gráfico do guia entra como ordem curta no
  TOPO do LOOK SPINE — citar não bastava, ele já era citado 3 vezes.
- **Descrição de fotografia do DNA não autoriza relumiar a foto.** O prompt
  injeta `visualStyle` inteiro, e DNA que fala em "luz dramática" convivia com
  "não reluza". A ressalva explícita existe no bloco de fidelidade — não a
  remova achando que é redundante.
- 🔴 **`sharp(x).extract(r).stats()` IGNORA o `extract`** e devolve a
  estatística da imagem INTEIRA. Materialize o recorte com `.toBuffer()` antes
  de medir. Foi isso que fez a escolha de canto do `logo-compositor` medir os
  quatro cantos IGUAIS desde que existe — a logo ia sempre para o canto
  reservado, e o mecanismo de fugir do bloco de copy nunca funcionou. Vale para
  qualquer medição por região.
- ⚠️ ~~`bg-zinc-400` não gera CSS neste repo~~ — **diagnóstico ERRADO, desfeito
  em 05/09/2026.** A classe está no CSS gerado; o que estava quebrado era o
  método de medição. Leia a última seção deste arquivo antes de escrever
  `style={{…}}` para fugir de uma classe do Tailwind.
- **Selo de marca precisa de fundo CINZA MÉDIO**: as logos dos clientes ocupam
  os dois extremos de luminância (Quintal e TERO em 255, Bacana 252, contra
  Wine Vix 54 e By Rock 89). Fundo claro engole as brancas, escuro engole as
  pretas — e as intermediárias são coloridas, então quem as separa é a matiz.
- **A logo do projeto é a ASSINATURA, não o ícone** (alinhado com o `LOGO_MAP`
  do insta-automatico em 10/08). Como metade delas é branca (Quintal, TERO e
  Bacana com luminância 255/255/252), o compositor passou a exigir **contraste**
  entre a logo e o canto, além de calma: canto claro e liso é o mais calmo do
  quadro e o pior lugar para logo branca. `isProjectLogo` é singular na prática
  (`orderBy isProjectLogo desc, take 1`) — marcar duas vira sorteio por
  `createdAt`.
- **Artes aprovadas viram referência de estilo, em RODÍZIO** (`styleRefAt` /
  `styleRefUsedAt` na Generation + `style-references.ts`). Uma por geração,
  sempre a menos usada, e nunca em carrossel (lá quem manda é o slide-guia).
  Referência fixa faz toda peça sair igual — o rodízio é o mecanismo, não um
  detalhe. O uso só é registrado DEPOIS de a arte existir.
- 🔴 **Em Postgres, `ORDER BY … ASC` é NULLS LAST.** No rodízio isso punha a
  referência JÁ USADA (timestamp) antes das nunca usadas (NULL), e a mesma arte
  saía cinco vezes seguidas. Sempre `{ sort: 'asc', nulls: 'first' }` explícito
  quando "nunca aconteceu" tem de vir primeiro — vale para qualquer fila por
  "menos usado/mais antigo" no repo.
- **Módulo consumido pela bancada não pode importar o Prisma.**
  `parseApprovalChecklist` vive em `src/lib/brand/approval-checklist.ts`, sem
  dependências, porque `brand-context.ts` puxa `@/lib/db` e a bancada é client
  (mesma razão de `art-direction.ts`).
- **`virar-regra` ACRESCENTA, `atualizar-dna` SUBSTITUI.** Correção aprovada na
  conversa vira linha do DNA com data e motivo, sob o cabeçalho `Regras
  aprendidas na prática:`. Só grava com `confirmado` — devolve `antes`/`depois`
  primeiro.
- **O dev server do painel Browser roda no diretório do projeto original,
  mesmo em sessão de worktree** (confirmado por `lsof -d cwd`). Mudança feita
  em worktree não é verificável por ele.

### Foto de cena é INSUMO; a galeria mostra PEÇA (11/08/2026)

A trilha `imagem` produz fotografia para virar arte depois; a trilha `arte`
produz a peça pronta. As duas gravam `Generation`, e por isso as fotos de cena
poluíam a galeria de Criativos e caíam na mesma pasta das artes no Drive.

- **O destino no Drive é escolhido pela TRILHA**: `imagem` vai para
  `Fotos/IA_LAGOSTA` (a pasta de acervo do cliente, criada na primeira vez por
  `ensureAIImagesFolder`); `arte` continua em `ARTES LAGOSTA`. O método
  `uploadAIGeneratedImage` já existia desde sempre e **nunca havia sido
  chamado** — nasceu para isso e ficou morto.
- **A Generation continua existindo para a trilha `imagem`** — é ela que faz
  acompanhar, conferir e melhorar funcionarem. O que muda é que a galeria não
  a LISTA. Não tente resolver isso deixando de criar a linha.
- 🔴 **Filtro Json do Prisma DESCARTA a linha que não tem o campo.**
  `NOT { fieldValues: { path: ['track'], equals: 'imagem' } }` devolveu **18 de
  491** no projeto 7 — escondia 473 artes legítimas, porque 473 linhas
  (template, arte antiga) simplesmente não têm `track`. O filtro correto é SQL
  com `COALESCE("fieldValues"->>'track', '') <> 'imagem'`, que trata ausente
  como visível. Vale para qualquer filtro por chave de `fieldValues`: a
  ausência é o caso COMUM, não a exceção.
- O `notIn` por id no caminho sem weekday é a solução de hoje porque as fotos
  de cena são poucas. Quando o acervo crescer, o caminho é **coluna espelho**
  de `track`, precedente de `Generation.sourcePageId`.

### A âncora de ambiente é referência de LUGAR, nunca de ENQUADRAMENTO (11/08/2026)

O preâmbulo de `anchor-ambient` mandava *"reproduce the architecture, furniture,
materials and light fixtures EXACTLY as they appear"*. O modelo leu isso como
ordem de recriar a FOTOGRAFIA: saíam cenas em grande-angular com o teto no
quadro, a comida da própria referência incorporada à composição, e o prato novo
encaixado por cima — montagem, não fotografia.

- **Separe as duas coisas explicitamente no preâmbulo.** Preservar o LUGAR
  (arquitetura, mobília, material do tampo, luz, cores) não é copiar a CÂMERA
  (altura, ângulo, focal, composição). Sem os dois limites escritos, o modelo
  funde os conceitos.
- 🔴 **Diga que a comida da foto de ambiente NÃO é conteúdo.** Ela aparece na
  referência e o modelo a trata como parte da cena a reproduzir. Todo prato da
  composição final tem de vir da referência de prato.
- **Material estrutural não se reinterpreta**: tampo de pedra ou laminado
  virava madeira. A regra é explícita no preâmbulo porque o modelo tende à
  madeira em cena de restaurante.
- **Física de apoio é o que denuncia montagem**: base do prato inteira em
  contato com o tampo, elipse coerente com a perspectiva, sombra de contato, e
  a mesa na MESMA altura e plano das outras do salão. Sem isso o prato flutua
  ou a mesa sobe acima da linha do ambiente.
- **Humanizar é permitido e ajuda** (outros pratos do menu, mãos com talheres,
  clientes desfocados ao fundo em ocupação moderada) — nunca casa lotada, nunca
  rosto em foco.

### Fila durável de geração de arte (F0.3, 10/08/2026)

A geração e a melhoria de arte por IA **não rodam mais no `after()` da
invocação que as pediu**. Cada pedido vira uma linha em `GenerationJob`
(`src/lib/ai/generation-queue.ts`) e é executado por
`/api/cron/generation-jobs`, de minuto em minuto, 3 por varredura.

- **O motivo**: uma arte chega a ~290s contra o `maxDuration = 300` da rota, e
  o MCP dividia esse teto entre vários `after()` — `confirmar-estilo-carrossel`
  dispara até 6, e o batch JSON-RPC resolve tools com `Promise.all`. Estourado
  o teto, a Generation ficava **PROCESSING para sempre**, sem recuperação.
  "after() encadeado" foi avaliado e **riscado**: `after()` morre com a
  invocação, que é exatamente o cenário de falha.
- **Tabela separada da Generation de propósito**: ali mora COMO o trabalho é
  executado (payload do runner, tentativas, arrendamento); na Generation, O QUE
  o usuário vê. `fieldValues` é Json sem índice — varrer por path seria scan, e
  ele já é o registro de auditoria que galeria, MCP e QA leem. Sem FK, mesmo
  precedente de `sourceGenerationId`.
- **Os portões de tentativa vivem na QUERY de quem varre** (`proximosJobs`:
  `attempts < maxAttempts` e `nextAttemptAt <= agora`); a reserva olha só o
  status, como em `renderPostArt`. Chamador novo que esqueça os portões queima
  as tentativas em minutos.
- **`maxAttempts` é 2 porque uma tentativa é uma chamada PAGA do modelo**
  (~US$0,10-0,19) — é o mesmo teto que `MAX_GENERATION_ATTEMPTS` já prometia.
  Durabilidade não pode virar cobrança extra.
- **A segunda geração NUNCA roda na mesma invocação.** Proporção divergente
  (geração) e texto divergente (melhoria) chamam `pedirNovaTentativa`, que
  devolve o job à fila; a Generation continua PROCESSING e quem acompanha nem
  percebe a troca de invocação. Sem `queueJobId` (teste E2E, script) vale o
  laço antigo.
- **As ROTAS HTTP enfileiram E disparam na hora** (`dispararJobAgora` dentro de
  `after()`): cada POST da bancada é UM job na SUA invocação, e a tela desiste
  de acompanhar em 8 minutos — esperar a varredura só adicionaria espera. **O
  MCP só enfileira**, porque lá uma invocação carrega várias tools.
- 🔴 **A varredura de órfãs IGNORA Generation ligada a `VideoProcessingJob`.**
  O export de vídeo cria a Generation PROCESSING e a entrega a OUTRA fila, cujo
  cron processa **um** job a cada 2 minutos — passar de 10 minutos em
  PROCESSING ali é normal, e marcá-la FAILED mataria um vídeo saudável.
  Produtor novo de Generation PROCESSING de vida longa precisa da mesma
  exceção (ou de um job na fila).
- Generation PROCESSING **sem job** e com mais de 10 minutos vira FAILED com
  motivo legível: são as órfãs anteriores à fila (havia 1 em produção em
  10/08). O `fieldValues` anterior é **preservado** — ele é o registro atômico
  da run.

### Resolução: a trilha `imagem` entrega o NATIVO (12/08/2026)

O resize de finalização (`creative-generation-runner.ts`) passou a valer **só na
trilha `arte`**. A trilha `imagem` grava a cena no tamanho que o modelo devolveu.

O que havia antes: toda geração era reduzida ao tamanho exato de publicação. Esse
resize é da trilha `arte` e lá está certo — nasceu para normalizar os múltiplos de
16 do gpt-image (1088 → 1080, downscale de 0,7%) e seu propósito documentado era
**parar de fazer upscale**. A trilha `imagem` caiu nele por herança, no mesmo
commit que expôs `resolution` (`6a15cb62`, 09/08), sem que a interação fosse
discutida — a mensagem daquele commit é minuciosa sobre prompt, papéis e
verificação, e não diz uma palavra sobre finalização.

- 🔴 **Medido em 12/08: o 4K É honrado e era jogado fora.** `nano-banana-pro` em
  9:16 devolve **3072x5504 (16,9 MP)** e era gravado em 1080x1920 (2,07 MP) —
  **87,7% dos pixels no lixo**, na única peça do fluxo que precisa de margem
  para recorte. Era isso, e não nitidez, que obrigava a casa a sair para o
  Higgsfield (que devolve exatamente o mesmo 3072x5504).
- 🔴 **1K era UPSCALE e foi RECUSADO.** O pro devolve **768x1376** em 1K —
  menor que 1080x1920 nos dois eixos —, então ele reintroduzia justamente o
  defeito que a trilha `arte` corrigiu em maio. A recusa (`RESOLUCAO_DOMINADA`,
  em `startArtGeneration`, espelhada no enum do MCP e no zod da rota) tem
  motivo que sobrevive ao resize condicional: 1K custa o **mesmo** que 2K nos
  dois modelos e entrega **1/4** dos pixels. Estritamente dominado.
- **O teto da cena nativa é de BYTES, nunca de pixels.** Item de plano sem copy
  nasce na trilha `imagem` (`execucao.ts:293`) e pode virar post; o limite de
  imagem do Instagram é 8 MB e o 4K saiu com 7,69 MB. Reencodar preserva os
  16,9 MP; reduzir dimensão desfaria o conserto para resolver o problema errado.
- **A escada de qualidade começa ALTA (95) porque o degrau caro é reencodar**,
  não a qualidade: medido no mesmo 4K, a variância do laplaciano cai para 80,6%
  já no q=95 e só chega a 74,8% no q=80. Quem está abaixo do teto passa
  **intocado** (é o caso do 2K) — e é essa passagem livre que vale mais que o
  número escolhido.
- **`fieldValues.finalSize` agora grava o que o arquivo É**, não o alvo. Na
  falha continua sendo o alvo, que é o registro honesto do que se pediu.
- **A logo não é afetada**: o bloco inteiro vive dentro de `if (track ===
  'arte')`, então `logoParaCompor` é sempre null na trilha `imagem`. E
  `conferir-arte` já reduz para 640px antes da visão, então arquivo grande não
  encarece a conferência.
- **A capa de carrossel NÃO entra nisto**: `carousel-service.ts` usa
  `track: 'arte'` nos dois pontos, inclusive na capa sem copy. Ela continua
  saindo no tamanho de publicação, como peça que é.
- `scripts/medir-resolucao-trilha-imagem.ts` refaz a medição (1K/2K/4K
  comparados no MESMO 1080 final). Dry-run por padrão, imprime a conta e só
  `--confirmar` gasta; não toca no banco nem em crédito, só na fatura do Google.
  ⚠️ O cliente Gemini **não expõe seed**, então as imagens são cenas diferentes
  — a nitidez do laplaciano mede a CENA quando n=1. A comparação que NÃO serve
  é "2K reduzida × 2K nativa": arquivos de tamanhos diferentes, o maior sempre
  ganha.

### A terceira casa do 1K: `quick-generate` e a dimensão fictícia (12/08/2026)

Procurando o mesmo defeito fora do arte-ia, ele apareceu em
`generateStoredAiImage` (`src/lib/ai/generate-image-service.ts`), cujo único
chamador é `POST /api/gerar-criativo/quick-generate` — a Arte Rápida.

- **`resolution: '1K'` era estritamente dominado, igual ao caso do arte-ia**:
  no `nano-banana-pro` 1K e 2K custam os MESMOS 15 créditos. A rota pedia 1K
  fixo e o serviço tinha `?? '1K'` como padrão; ambos foram para 2K. Agrava:
  a imagem vira CAMADA de uma página 1080x1920, então o 1K (768x1376) ainda
  seria **esticado no render**.
- 🔴 **`calculateDimensions` gravava dimensão FICTÍCIA** — tabela fixa por
  proporção que não olhava nem a resolução pedida nem o buffer. **788 linhas
  de `AIGeneratedImage`** (out/2025 a ago/2026) dizem 576x1024 em 9:16, quando
  o 1K real é 768x1376 e o 2K é 1536x2752. Hoje a dimensão é MEDIDA no buffer
  (`medirDimensoes`), com a tabela como fallback quando o sharp não lê.
- **Não era cosmético.** `AIGeneratedImage.width/height` alimentam o
  `data-pswp-*` do lightbox — a mesma armadilha já registrada na galeria, com o
  lightbox abrindo a arte menor do que ela é — e o `calculateCanvasPlacement`
  (`ai-images-panel.tsx:166,650`), que POSICIONA e ESCALA a imagem ao cair no
  canvas do editor. A área subestimada ia de 1,8× (1K) a 7,2× (2K).
- ⚠️ **As 788 linhas antigas continuam com a dimensão errada** — só linha nova
  nasce medida. Backfill é possível relendo o `fileUrl`; não foi feito.
- **`generateStoredAiImage` NUNCA redimensiona** — o buffer vai direto para o
  Blob. O upscale desse caminho, quando acontece, é no render da página, não na
  finalização. São defeitos parecidos em casas diferentes: no arte-ia o resize
  era explícito; aqui é consequência de pedir pouco pixel para um slot grande.

### O tier do gpt-image virou escolha, e o padrão é `low` (12/08/2026)

`runImageEdit` cravava `quality: 'high'` desde que existe — o caminho mais caro
do sistema, sem ninguém ter escolhido. Hoje o tier é parâmetro
(`src/lib/ai/qualidade-arte.ts`, módulo PURO porque a galeria é client), o
padrão é `low` para compor e `high` quando há ajuste na foto, e trocar é um
botão na mão de quem aprova.

Medido com `scripts/medir-qualidade-trilha-arte.ts` (mesma peça do Espeto
Gaúcho, 3 repetições por tier, o juiz sendo o `verifyImageTexts` da produção):

| tier | texto | tempo | fatura |
|---|---|---:|---:|
| low | 3/3 | 38s | US$ 0,008 |
| medium | 3/3 | 60s | US$ 0,045 |
| high | 3/3 | 125s | US$ 0,165 |

Os três desenharam o lettering íntegro — til do "Ã" no lugar, traço fechado,
sem artefato, conferido em 1:1. O `low` sai por 1/20 do `high`.

- 🔴 **Os tiers baratos INVENTAM número, e nenhum verificador pega.** No selo do
  Google apareceu contagem de avaliação fabricada em **2 de 3** peças no `low` e
  **1 de 3** no `medium`, contra **0 de 3** no `high` — dado factual e
  verificável sobre o negócio do cliente, a mesma classe de "nunca invente preço,
  horário, endereço ou promoção". `verifyImageTexts` confere se o texto esperado
  ESTÁ presente e **não tem regra contra texto A MAIS**, então as três passaram
  com veredito verde. **Não leia o ✅ da conferência como "não inventou nada".**
  Fechar isso é trabalho em aberto: a transcrição já volta do verificador, então
  a regra caberia ali.
- **A conferência NUNCA regera sozinha** — regra de 10/08/2026, reafirmada em
  12/08 ao introduzir a escolha. Uma escada automática (low → medium ao reprovar
  o texto) chegou a ser escrita e foi DESFEITA pelo Ciro: o comparador produz
  falso negativo ("R$ 9,90" vs "R$9,90"), e regerar por conta própria gasta
  chamada paga para corrigir o que muitas vezes não está errado. O verificador
  avisa; quem decide é o olho.
- **O tier entra no HASH DE DEDUPE** (`q` em `startArtGeneration`). Sem isso,
  pedir "o mais caro" logo depois de uma geração em andamento cairia no dedupe e
  devolveria a peça barata — exatamente o que a pessoa acabou de recusar. Mesma
  lição do `finalPrompt`, que também não estava no hash.
- 🔴 **`fieldValues.prompt` NÃO serve como `finalPrompt` ao refazer.** O que está
  gravado é o prompt FINAL (preâmbulo de referências + corpo); devolvê-lo como
  `finalPrompt` faz o runner prefixar o preâmbulo DE NOVO e a peça nasce com a
  descrição das imagens duplicada. `POST …/arte-ia/[generationId]/refazer`
  reconstrói pelo caminho normal — pedido + copy (de `slotValues`) + referências.
- **Só `source === 'arte-ia'` pode ser refeita**: arte de template ou de upload
  não tem prompt nem referências para reconstituir, e o botão nem aparece.
- 🔴 **Compor é barato, EDITAR A FOTO é caro** (`qualidadePadraoPara`, decisão do
  Ciro em 12/08). Os dois testes dizem coisas OPOSTAS: desenhar letra sobre a
  foto empatou nos três tiers, mas pedir para cortar a picanha ao meio e revelar
  o ponto separou — o `low` devolveu mancha rosa lisa, sem fibra legível e com
  transição abrupta da crosta (parecia pintado, não cortado), enquanto `medium`
  e `high` renderam fibra com direção e gradiente de cocção. A nitidez foi
  monotônica: 700 / 754 / 870. Faz sentido físico: microtextura é o que o tier
  barato sacrifica, e ela é irrelevante para uma letra. Por isso
  `instrucaoImagem` presente ⇒ padrão `high`. **Em créditos não muda nada** (a
  trilha arte cobra 25 flat); sobe a fatura e o tempo (~43s → ~125s).
- **Os rótulos falam de TEMPO e CUSTO, nunca de "qualidade baixa"** — os três
  tiers desenharam texto íntegro, então "qualidade baixa" mentiria sobre o que se
  escolhe. E "low/medium" não é vocabulário de quem cuida do Instagram de
  restaurante (mesma regra que proíbe DRAFT/SCHEDULED na conversa).
- **O menu vive FORA do `<a>` do card** (`gallery-item.tsx`, barra de ações é
  irmã do anchor) — dentro dele, o clique navegaria. E é menu, não dois botões,
  porque a barra já chega a cinco e no celular o card tem ~120px.

### Escolher um modelo passou a mandar na diagramação (16/08/2026)

Relatado pelo Ciro na Real Gelateria: escolheu um modelo na bancada, a arte saiu
com outra diagramação e a headline em CAIXA ALTA — contra o Title Case do modelo
e contra o próprio DNA da marca. Eram **três causas somadas**, e nenhuma delas
era o modelo de imagem desobedecendo.

- 🔴 **`buildTypographyLock` mandava "caixa alta" para TODA marca.** Linha curta
  e imperativa aos 36% do prompt, contra a regra da marca aos 62%, enterrada em
  9.180 caracteres de DNA (54% do prompt inteiro). Medido nos 11 clientes: **10
  declaram a própria caixa no DNA**, e em 4 o hardcode contradizia o que estava
  escrito (Real Gelateria e Wine Vix pedem Title Case; O Quintal proíbe caixa
  alta contínua fora de uma fonte; Empório Fonseca pede caixa mista). Era
  redundante onde acertava e mandava onde errava. **Tirar não basta**: o
  gpt-image cai sozinho em caixa alta na manchete, então o lock agora DIZ de
  onde a caixa vem (identidade, ou o modelo quando houver).
- 🔴 **O papel `style` nunca prometeu layout** — o preâmbulo dele fala em
  "tonal register, luminosity and graphic mood", de propósito. Escolher um
  modelo na bancada usava esse papel, então mudava só qual imagem entrava como
  referência de clima. O papel novo é **`style-guide`**: molde do `series-guide`
  do carrossel, com os limites duros do `style` (o texto e a foto dele não são
  conteúdo). O que o distingue no runner é o **`generationId`** da referência —
  que existia na bancada e **morria no schema da rota**.
- **Com modelo escolhido, `visualStyle` e `composition` do DNA SAEM do prompt**,
  mesmo precedente do slide irmão: o modelo JÁ É a marca aplicada e aprovada, e
  descrevê-la em prosa é concorrência que vence por volume. Era a regra
  aprendida "título na parte superior, serviço no rodapé" que jogava a manchete
  para o topo contra um modelo que a põe embaixo. `contentRules` FICA —
  proibição não é estilo.
- **Procedência é conferida, e id que não confere é DESCARTADO, nunca recusado**:
  o pior desfecho seria derrubar uma geração paga por causa de um vínculo. Sem o
  marcador, a referência segue valendo como clima.
- Medido com `scripts/medir-modelo-a-seguir.ts` (não toca no banco, não gasta
  crédito; só a fatura da OpenAI, e só com `--confirmar`): mesma foto, mesma
  copy, mesmas 5 imagens, só o papel mudando. **Antes**: "TERÇA MERECE" em caixa
  alta, bloco no topo, 6 de 10 textos em caixa alta, conferência de texto
  REPROVADA. **Depois**: "Terça / merece" em duas caixas como o modelo, bloco no
  terço inferior esquerdo, filete com ponto central, 1 de 6 em caixa alta,
  conferência aprovada.
- ⚠️ **O canto da logo NÃO segue o modelo** — na peça avulsa ele continua sendo
  escolha do gerador (`instrucaoLogoPeloModelo(null)`), e no teste o selo foi
  para o canto superior direito enquanto o modelo o tem no inferior direito.
  Está de acordo com o DNA da Real, então ficou como está; se um dia o modelo
  tiver de mandar nisso também, o lugar é esse argumento.

### 🔴 A caixa da arte é a caixa da STRING, não do prompt (16/08/2026)

Segundo round do mesmo relato: com o conserto acima no ar, a headline voltou em
caixa alta. Causa DIFERENTE — a copy chegou gritada (`"DESACELERE E DESFRUTE"`),
e o prompt reproduz verbatim.

- 🔴 **Instrução no prompt NÃO vence a string literal. Não tente de novo.**
  Medido com 2 repetições: a linha "se um bloco vier todo em maiúsculas, isso
  NÃO é ordem de desenhá-lo em caixa alta — trate a caixa como decisão sua"
  produziu 2 de 2 peças em CAIXA ALTA. O `- "DESACELERE E DESFRUTE"` três linhas
  acima vence qualquer regra sobre ele. A mesma copy apresentada como
  "Desacelere e desfrute" saiu em caixa natural, 2 de 2. Há um comentário
  guardando esse lugar no `buildArtePrompt`.
- **Mudar a caixa NUNCA reprova arte**: `normalizeForComparison` termina em
  `.toUpperCase()`. Trocar palavra continua reprovando.
- 🔴 **Quem grita é o CHAT, não o gerador da casa**: 85% das copies de planos
  com `origem: 'chat'` têm o 1º bloco todo em maiúsculas (55 de 65), contra
  **0 de 31** em `propor-semana` e 0 de 3 na bancada. É como se escreve manchete
  num briefing. As descrições de `criar-plano`, `editar-item-do-plano` e
  `gerar-imagem` agora pedem caixa natural — mas isso só alcança copy NOVA.
- 🔴 **Title Case, nunca caixa de frase.** Os blocos reais em caixa alta estão
  cheios de nome próprio ("PRAIA DO CANTO", "RUA ELESBÃO LINHARES, 52", "ESPETO
  GAÚCHO"); caixa de frase produz "Praia do canto", que é erro visível. Title
  Case acerta nome próprio por construção, e o preço — capitalizar substantivo
  comum — lê como estilo editorial. Validado contra os 63 blocos distintos do
  banco.
- 🔴 **Proteção de sigla por TAMANHO não funciona**: proteger todo token de até
  3 letras (para salvar "OFF" e "DJ") salvou "EM", "NO", "DO", "OS" e "RUA", e
  saía "Adega E Bistrô NA Praia DO Canto". Palavra curta comum é a MAIORIA das
  palavras curtas — sigla é exceção, e exceção se enumera (`SIGLAS`).
- 🔴 **A correção NÃO é neutra, e por isso é opt-in por cliente**
  (`PROJETOS_COM_CAIXA_NATURAL`, hoje 1, 2, 11 e 12). Medido no By Rock, cujo
  DNA pede "caixa alta para manchetes que precisam de impacto visual": com a
  correção ligada a manchete saiu em Title Case nas 2 rodadas — a regra da marca
  vive a ~68% de um DNA longo e não segurou sozinha. Lista explícita, não
  derivada da prosa do DNA. Mudou o DNA de alguém? Meça antes de mexer na lista.
- `scripts/medir-modelo-a-seguir.ts` serve aos dois casos (referência escolhida
  à mão ou vinda do rodízio): compara o prompt GRAVADO na geração com o do
  builder atual, sem tocar no banco nem em crédito.

### 🔴 O decodificador de guia descartava resposta boa, em silêncio (16/08/2026)

`carousel-guide-decoder.ts` é o que transforma "copie o estilo" em lista de
decisões. Ele vinha falhando muito mais do que ninguém sabia — e falha em
silêncio (`catch` → null → segue só com o SPINE textual), então o CARROSSEL
também rodava degradado sem sinal nenhum.

- 🔴 **Schema rígido recusava a resposta INTEIRA por um campo omitido** — a
  mesma lição que o crivo aprendeu em 11/08 e que não tinha sido aplicada aqui.
  Medido: o modelo devolveu os três níveis de texto, alinhamento e posição do
  bloco, e omitiu `veuDeLeitura` e `tratamentoDaFoto`; tudo foi descartado. Hoje
  todo campo é `.optional()` e campo ausente simplesmente NÃO VIRA LINHA.
- 🔴 **`elementosGraficos: []` é uma AFIRMAÇÃO; ausente não afirma nada.** A
  lista vazia vira "não acrescente nenhum" no prompt. Colapsar os dois faz a
  peça nova perder a assinatura da marca, ou ganhar a ordem de não ter o que
  ninguém verificou. `GuiaLido.elementosGraficos` é `string[] | null`, e os dois
  spines só fazem a afirmação quando `Array.isArray`.
- 🔴 **Elemento gráfico volta como STRING ou como OBJETO** (`{tipo, posicao}`) —
  as duas formas são aceitas e normalizadas. Pedir "descreva cada um com a
  posição" fez o modelo passar a responder em objeto, e `z.array(z.string())`
  perdeu duas rodadas seguidas logo depois de a enumeração fazer ele enfim
  ENXERGAR o filete que vinha ignorando.
- 🔴 **A CAIXA é calculada no CÓDIGO a partir do texto transcrito, nunca
  perguntada** (`caixaDoTexto`). Em 3 rodadas a temperatura 0, o gpt-4o-mini
  classificou "Feliz" como ALTA em 2 e Title Case em 1 — enquanto a
  TRANSCRIÇÃO saiu idêntica nas três. Ele lê as letras com fidelidade e erra o
  rótulo; e como a caixa vira instrução na peça nova, o rótulo errado
  reintroduzia a caixa alta que o conserto acabara de remover. Mesma trava do
  crivo: o modelo declara o fato, o código tira a conclusão.
- **Ornamento fino perto do texto exige enumeração no prompt.** Sem listar
  "filete, linha fina, losango, ponto entre linhas, selo, moldura, barra, faixa,
  ícone", ele devolvia lista vazia para uma arte que tem filete com losango
  central logo abaixo da manchete.

### 🔴 O modelo a seguir estava DITANDO o texto da peça nova (17/08/2026)

Cinco artes seguidas do O Quintal Parrilla reprovadas — o placar do cliente no
dia foi **0 "gostei" contra 5 "preciso melhorar"** —, com cinco queixas que são
quatro defeitos somados, todos nascidos do papel `style-guide` (a "arte de
referência" escolhida na bancada):

- *"Você está incluindo endereço e funcionamento sem que seja solicitado"* e
  *"misturou a cópia da arte de referência com a copy solicitada"*;
- *"o título foi deslocado para o meio e na cópia estava alinhado no canto
  superior esquerdo"*;
- *"a foto está ficando muito escura"*;
- *"é preciso respeitar as margens do Instagram de topo e rodapé"*.

🔴 **A causa nº 1 é a mesma lei já registrada para a caixa das letras: a STRING
literal no prompt vence QUALQUER regra escrita sobre ela.** `descricaoDoGuia`
transcrevia os níveis do modelo *com as palavras* — `3. apoio — "Funcionamento -
11h às 00h"`, `4. apoio — "R. Aleixo Netto, 1158…"` — logo abaixo do cabeçalho
"repita a MESMA estrutura, trocando só as palavras". Contra isso, o preâmbulo do
papel `style-guide` mandava, em inglês e duas vezes, *nunca* copiar texto da
referência. Perdeu. Reproduzido em 17/08 com o prompt de produção: a peça de
controle saiu com o horário e o endereço do post antigo, verbatim.

Regras que ficam:

- **As palavras do modelo NÃO entram no prompt. Não as reintroduza.** A
  transcrição continua sendo pedida à visão, mas só como INSUMO INTERNO: dela
  saem a caixa medida (`caixaDoTexto`) e a régua da conferência
  (`GuiaLido.textos`). O que vai ao prompt é a FORMA — onde, em que cor, em que
  caixa, em que tamanho.
- 🔴 **A última porta do vazamento é o ELEMENTO GRÁFICO**: a visão situa o
  ornamento citando a vizinhança entre aspas ("ícone de relógio antes de
  'Funcionamento - 11h às 00h'"), e essa linha entra DUAS vezes no prompt, uma
  delas como ordem imperativa no topo do MODELO SPINE. A instrução pede posição
  pelo PAPEL do texto; `semPalavrasDoModelo` é a trava mecânica.
- 🔴 **`gpt-4o-mini` NÃO enxerga ONDE o texto está — ele numera as zonas pela
  ORDEM em que as lê.** Medido nas duas artes de referência do Quintal, 2
  rodadas cada, temperatura 0: na peça cuja manchete está na banda 6 de 8 (66%
  da altura), o mini respondeu 3 e 4, e disse "centro" para um bloco alinhado à
  esquerda nas duas artes; o `gpt-4o` acertou banda e lado em 4 de 4. O
  decodificador é `gpt-4o` desde então — "barato" não se sustenta quando é UMA
  chamada por geração contra os US$ 0,165 da geração que ela dirige.
- 🔴 **A posição é lida como BANDA numerada (1 a 8) e o rótulo é conclusão do
  CÓDIGO** (`faixaDaBanda`), mesma trava de `caixaDoTexto` e do crivo. Pedindo
  o rótulo direto, saía `"canto inferior esquerdo, começando a ~30% da altura"`
  — a média contraditória entre a manchete do alto e o serviço do rodapé, que o
  gpt-image resolveu empilhando tudo no meio do quadro. O que faz a leitura
  funcionar é mandar medir a DISTÂNCIA ATÉ A BORDA DE CIMA com dois exemplos de
  calibração, e proibir explicitamente decidir pela ordem de leitura.
- **Uma arte tem ZONAS de texto, não um bloco só.** Manchete no alto e serviço
  no rodapé são duas, e juntá-las é erro — tanto na leitura (`zonas[]`) quanto
  no SPINE, que agora manda replicar a posição *de cada zona*.
- **Safe area em PIXEL DA PEÇA REAL** (`regraDeSafeArea`), com a fração como
  fallback. O caminho foi: "~250px" escrito para 1080x1920 numa peça que sai
  1088x1936 → fração (~1/8 e ~7/8) → e a fração ainda deixou logo e CTA
  terminando entre 93% e 95% da altura nas cinco peças. Contra a IMAGEM do
  modelo — que tem a marca quase colada na borda — só um número confere: "nada
  abaixo de 1694px" é verificável, "o último oitavo" é interpretável. Mesmo
  princípio de física-não-adjetivo do prompt da trilha `imagem`.
  A regra vive em TRÊS lugares de propósito: nas regras de composição, colada ao
  bloco da logo (onde "canto calmo" era lido como "o canto do quadro") e no
  bloco de serviço (onde "rodapé" puxa para a borda). E ela **vence a margem do
  modelo**: a arte de referência foi feita sem esta regra.
  🔴 **Feed e quadrado NÃO têm faixa reservada** — o Instagram não desenha por
  cima deles, e reservar 1/8 ali é margem inventada que come a peça. Por isso a
  regra recebe o `formato`, e o chamador que não informa tamanho continua com a
  versão em fração.
  ⚠️ Este último passo (o número em pixel) foi escrito mas **não medido em arte
  gerada** — a rodada de 17/08 terminou antes.
- **O véu de leitura é LOCAL** (a faixa onde o texto pousa, no máximo ~1/3 do
  quadro): "sutil" não bastava porque não dizia ONDE, e o modelo escurecia a
  cena inteira. Não cabendo o texto sem apagar a foto, o texto é que muda de
  lugar.
- 🔴 **SERVIÇO (horário e endereço) tem lugar fixo no RODAPÉ, e esse lugar NÃO
  vem do modelo** (`blocos-de-servico.ts`, pedido do Ciro em 17/08/2026). O
  parágrafo do modelo manda copiar as zonas dele — mas ele é uma peça ANTIGA e
  pode não ter linha de serviço nenhuma; quando a copy tem e ele não, o
  gpt-image pendura o horário junto da manchete. É a ÚNICA zona que o prompt
  manda CRIAR contra o modelo, e a exceção está escrita nos dois lugares (colada
  à copy e no item 1 do MODELO SPINE).
  ⚠️ **O classificador é conservador de propósito**: frase que só MENCIONA uma
  hora ("Almoço com a família e amigos, a partir das 11h") é APOIO, não serviço
  — mandá-la ao rodapé rebaixaria a promessa da peça a letra miúda. O corte é o
  que SOBRA da frase depois de tirar o dado (≤ 20 caracteres), calibrado contra
  as cinco copies reais da leva.
- 🔴 **Zona do modelo sem conteúdo na copy fica VAZIA — e isso precisa ser dito
  de duas formas.** Copiar a diagramação de uma peça mais completa que a atual
  cria pressão para preencher, e o gpt-image preenche do jeito dele. As duas
  formas foram medidas na mesma leva de 17/08:
  - **ícone ÓRFÃO**: o modelo tem relógio e pin ao lado do horário e do
    endereço, o MODELO SPINE manda desenhar os elementos "obrigatoriamente", e a
    peça de sobremesas saiu com os dois ícones sozinhos no canto, apontando para
    nada. `elementosQueFazemSentido` tira o ícone de serviço da ordem quando a
    copy não tem serviço — e ainda o proíbe POR NOME, porque a descrição do
    modelo continua dizendo que ele existe.
  - **texto DUPLICADO**: sem nada para pôr na zona de rodapé, a peça de almoço
    repetiu a linha de apoio — o mesmo texto duas vezes na mesma arte. A regra
    ("cada bloco aparece UMA ÚNICA VEZ") mora colada à lista de copy.
- 🔴 **A MARCA não é ornamento nem nível de texto — ela tem bloco próprio, e as
  outras duas portas precisam ser FECHADAS.** Medido em 17/08/2026 no almoço
  executivo: o decodificador devolveu `"selo à direita do serviço"` como
  elemento gráfico e uma `Zona 3 (assinatura)` como zona de texto; o MODELO
  SPINE promoveu o selo a "DESENHE ESTES ELEMENTOS GRÁFICOS, obrigatoriamente";
  e o bloco da logo, em paralelo, mandou reproduzir o arquivo oficial. A peça
  saiu com o lockup completo no topo **mais o símbolo sozinho no rodapé** —
  "está colocando o ícone da logo mais a logo, não precisa disso". Hoje
  `DA_MARCA` (selo|logo|logotipo|logomarca|marca|emblema|símbolo|brasão|
  monograma|assinatura) tira a marca da lista de ornamentos, a zona de
  assinatura vira UMA linha dizendo onde ela mora (nunca níveis para letrar) e
  não conta como zona de texto, e o bloco da logo passou a dizer "UMA MARCA POR
  PEÇA, e ela é o ARQUIVO INTEIRO".
  ⚠️ `\bmarca\b` não casa com "marcador": o marcador entre linhas continua
  sendo ornamento legítimo. E selo DECORATIVO de verdade (um "10 anos") seria
  descartado junto — risco aceito, porque desenhar a marca duas vezes é defeito
  que o cliente reprova e perder um ornamento não é.
- 🔴 **Quem identifica a marca é o NOME DELA, não o rótulo que a visão deu.** O
  filtro por papel foi só o primeiro passo e não bastou: medido nas TRÊS
  referências do O Quintal, a mesma marca voltou como `"selo"`, como
  `"assinatura"` e como `"título"` — e o emblema, como `"ícone circular"`. Pelo
  rótulo, a marca do modelo do "Puxadinho" passou como nível de texto e a logo
  foi para o topo ("a logomarca ficou posicionada no topo e não posicionou como
  na referência"). `ehAMarca` casa o TEXTO transcrito contra
  `brand.projectName` nos dois sentidos (a arte traz o lockup completo ou só o
  nome), a separação é NÍVEL A NÍVEL (a zona real é mista: assinatura + duas
  linhas de serviço) e ainda há uma linha no SPINE cobrindo o que escapar do
  apelido.
- **O canto da logo passou a seguir o modelo** (`cantoDaAssinatura`): a posição
  lida da assinatura vira o canto reservado no bloco da logo. Isto REVOGA a
  decisão de 16/08 de deixar o canto livre na peça avulsa — ela valia enquanto
  ninguém sabia onde a referência põe a marca. Marca CENTRALIZADA não vira
  canto (chutar lado seria inventar), e aí o canto volta a ser livre.
- 🔴 **Horário por EXTENSO conta como horário.** "das 11h à meia-noite" não
  casava com o padrão (que exigia dígito dos dois lados), então o bloco não
  virou serviço, ficou na sequência de cima E foi parar no rodapé pela zona do
  modelo — o mesmo horário duas vezes na arte. `HORA` aceita "meia-noite" e
  "meio-dia", e o padrão aceita "à", "até" e "a partir do". É como a casa
  escreve horário de bar.
- 🔴 **Mandar o serviço para o rodapé exige dizer de onde ele SAI.** A regra
  genérica de não repetir NÃO segurou o caso mais óbvio, e isso foi medido duas
  vezes na peça de funcionamento: a copy lista o horário como 2º bloco (logo
  abaixo da manchete) e o modelo escolhido tem zona de manchete com DOIS níveis,
  então o gpt-image punha o horário no subtítulo **e** no rodapé, atendendo às
  duas forças — e ainda perdia o CTA por falta de lugar. Com a linha "eles saem
  da sequência de cima… se sobrar um nível lá sem conteúdo, ele não existe nesta
  peça", a mesma peça saiu com a copy completa e sem repetição. Regra de POSIÇÃO
  precisa fechar a porta de saída, não só abrir a de entrada.
- **Vazamento agora AVISA, nunca reprova** (`vazamentoAlerta`, irmão de
  `numerosAlerta`): a transcrição da arte pronta é comparada com os textos do
  modelo. Frase abaixo de 12 caracteres normalizados não conta, e **o NOME DA
  MARCA é descontado antes da medida** — toda peça leva a assinatura, a visão
  transcreve o wordmark da logo como texto e o decodificador lê o nome como um
  nível do modelo, então sem o desconto o alarme tocaria em quase toda geração.
  Os números já vinham acusando o defeito em 3 das 5 peças ("11, 00, 1158") sem
  que ninguém lesse aquilo como "copiou o post antigo".

**Medido** com `scripts/medir-modelo-a-seguir.ts --da-geracao <id> --confirmar`
(mesma foto, mesma copy, mesmas 5 referências; só o prompt muda). Antes: **10
blocos de texto** na peça — manchete inventada a partir do tema, a copy pedida
rebaixada a texto de apoio, mais `Funcionamento - 11h às 00h` e
`R. Aleixo Netto, 1158 - Praia do Canto, Vitória` copiados do post antigo, com o
salão inteiro escurecido e a marca colada nas duas bordas. Depois: **4 blocos**
— exatamente a copy pedida, manchete no alto como no modelo, serviço no rodapé,
foto clara. ⚠️ Sobrou uma linha com o nome da marca no bloco de serviço (o
modelo preenche o slot que a copy não usou) e o rodapé ainda encosta na faixa
reservada: as duas coisas são visíveis na peça e valem uma segunda medição.

### 🔴 A caixa da manchete e o tratamento da foto (TERO, 17/08/2026)

A semana do TERO foi refeita por IA depois de 30 reprovações na via de modelo, e
as duas primeiras peças voltaram reprovadas por três coisas: *"a headline deve
ser em caixa alta"* (nas duas), *"a foto ficou muito contrastada você não
precisa alterar a imagem"* e *"o horário e o CTA podem ficar no rodapé"*.

- 🔴 **A lei da caixa perdeu pela TERCEIRA vez, agora contra o MODELO SPINE.**
  O prompt do almoço trazia `1. título · caixa ALTA` mais a regra "esta regra
  vence qualquer outro palpite sobre caixa", e o DNA pedia caixa alta em dois
  pontos. Contra a linha `- "Almoço executivo"` no bloco de copy, os três
  perderam. **Nenhuma instrução sobre a caixa funciona — nem a identidade, nem o
  lock de tipografia, nem o modelo escolhido à mão.** Só mudar a string funciona.
- **Por isso `PROJETOS_COM_CAIXA_NATURAL` virou `CAIXA_DA_MANCHETE`**, um mapa
  com as duas direções (`natural` | `alta`). `natural` vale para a copy inteira;
  `alta` vale **só para o primeiro bloco** — o apoio é Montserrat 300/400 e o
  CTA sai em caixa natural nas artes aprovadas da marca, então gritar tudo
  trocaria um defeito por outro. Cliente fora do mapa recebe a copy como ela foi
  escrita, que continua sendo o default.
- 🔴 **O que quebrou o TERO foi o conserto da Real Gelateria.** Até 16/08 a copy
  chegava GRITANDO por acidente (85% das copies do chat), e era esse acidente
  que protegia quem pede caixa alta. As descrições das tools passaram a pedir
  caixa natural a TODOS — acertando quem pede Title Case e desprotegendo o
  resto. Mexeu na caixa de um lado, confira o outro.
- 🔴 **O `tratamentoDaFoto` do modelo virava ordem de RELUMIAR a foto nova** —
  mesma forma do vazamento de palavras consertado no mesmo dia. O spine dizia
  "Tratamento da foto: temperatura neutra, **contraste alto**", que é a descrição
  da foto ANTIGA, e a regra 8 mandava igualar a luminosidade. Contra isso, o
  "NÃO RELUMIE" ficava seis parágrafos acima e perdeu: instrução colada à
  referência vence instrução geral. Hoje a linha é **opt-in** e só o carrossel a
  recebe (`decodificarGuia(buffer, { paraSerie: true })`) — lá o guia estabelece
  o look de uma série que precisa parecer a mesma sessão de fotos.
- **A licença de "ajuste global MUITO sutil de contraste, exposição e nitidez"
  foi RETIRADA do bloco de fidelidade.** Ela nunca foi necessária para peça
  nenhuma e era a brecha que o modelo esticava; quem quer mexer na foto pede, e
  o pedido já vira a EXCEÇÃO logo abaixo (`instrucaoImagem`). O preâmbulo do
  papel `style` também deixou de mandar casar a *luminosity* — o que se casa com
  a referência é a camada gráfica.
- **Medido** com `scripts/medir-modelo-a-seguir.ts --da-geracao <id> --confirmar
  --so-depois` (US$ 0,165, zero créditos): a manchete saiu "ALMOÇO / EXECUTIVO"
  no lockup de dois níveis, a foto voltou à luz original e o typo que o modelo
  tinha desenhado ("acompahamentos") saiu correto.
- 🔴 **A conferência de texto aprovou a arte com o typo.** `verifyImageTexts`
  compara por `includes` depois de normalizar, então "acompahamentos" jamais
  conteria "acompanhamentos": o `passed` só é possível se a TRANSCRIÇÃO por
  visão tiver lido a palavra certa — o modelo corrigiu o erro em silêncio ao ler.
  **O ✅ da conferência não é prova de grafia correta**, e some-se isto ao que já
  estava registrado (ela também não pega texto A MAIS).
- **No DNA ficaram duas escritas** (aprovadas pelo Ciro): a regra aprendida que
  manda horário **e CTA** para o rodapé mesmo sem endereço na peça — a anterior
  condicionava tudo à presença do endereço, e era por isso que a peça de happy
  hour saiu com tudo empilhado no topo —, e a remoção do parágrafo que
  autorizava "a foto melhorada em luz, cor, textura e nitidez", herdado do
  pipeline do Higgsfield. ⚠️ A mesma autorização **continua** em
  `photoDirection` ("a foto se melhora, nunca se modifica"), que hoje não entra
  na trilha `arte` — se um dia entrar, ela volta a conflitar.

**Na via de MODELO, o defeito é outro e continua aberto.** As 30 reprovações das
12h vieram dos templates gerados na madrugada de 17/08 (317 Happy Hour, 318
Rolha free, 319 Sobremesas) e de um modelo de dez/2025 sem camada de imagem
("Pag.08", template 86). O autofix RODOU e gravou `aplicada: true` nas quatro
peças conferidas — mas só encolhendo o `titulo-n1`, porque as duas caixas do
lockup **já nascem colidindo em 19 a 38px** no template. As colisões que o Ciro
reprovou (pré-título sobre a manchete no layout Rodapé; apoio de duas linhas
sobre a linha de serviço) não foram sequer detectadas. Refazer por IA é
contorno, não conserto.

### TERO: a logo voltou ao `compor`, e "11h30" é hora (17/08/2026, noite)

Três reprovações da Roberta no TERO, já com todos os consertos do dia no ar.
As causas e o que ficou:

- 🔴 **A logo do TERO não é desenhável pelo gpt-image.** A ligadura E+R saiu
  "TERRO" (14/08), "TLRO" e "BRASA X E VINHO" (17/08, duas artes seguidas) —
  soletração e ligadura explícitas no preâmbulo perderam quatro vezes.
  `LOGO_MODE_POR_PROJETO` em `logo-compositor.ts` devolve o TERO ao `compor`
  (o arquivo oficial colado por sharp) como DEFAULT do projeto. O efeito
  colateral documentado do compor (duas marcas, 10/08) ganhou a linha que
  faltava no `instrucaoAreaReservada`: a marca vista nas referências pertence
  ao post antigo — "this image contains NO brand mark at all". Se a segunda
  marca voltar, reforça-se ali; não se volta o TERO para `modelo`.
- 🔴 **"11h30" quebrava o classificador de serviço**: a HORA só aceitava "11h"
  e o "30" virava número solto — a janela casava "30 às 16h", a sobra estourava
  o teto e o funcionamento ficava pendurado na manchete. Minutos após o "h"
  fazem parte da hora, e o INTERVALO DE DIAS ("de terça a sexta") é descontado
  da sobra como o horário — mas dia SOZINHO segue sendo assunto ("Sexta é dia
  de churrasco" não é serviço).
- **O véu ganhou a palavra que faltava: SUAVE** ("um sussurro de sombra… a foto
  continua nítida POR BAIXO do véu"). "Local" resolveu o escurecimento global;
  a densidade dentro da faixa ainda saía tarja.
- ⚠️ **Tensão em aberto do modelo-livre**: a Roberta reprovou "a arte não é
  semelhante ao template escolhido" — expectativa de layout igual, que o modo
  livre (decisão do Ciro no mesmo dia) deliberadamente não entrega. Se a
  equipe preferir semelhança no TERO, o caminho é
  `PROJETOS_COM_MODELO_ESTRITO.add(3)` — decisão de produto, não de código.

### A logo composta respeita o STORY, e o duplicar carrega o horário (17/08/2026, noite)

- 🔴 **`comporLogo` agora recebe o `formato`**: em story, só os cantos
  INFERIORES concorrem e a margem VERTICAL sobe para a mesma safe area do
  texto (1/8 da altura). A colisão foi real — a logo composta do TERO saiu
  duas vezes no topo esquerdo, sob o avatar que o Instagram desenha: a margem
  era 5,5% da LARGURA nos dois eixos (~3% da altura no 9:16), e o prompt nunca
  teve chance de impedir, porque a composição é pós-geração, por código. Quem
  chamar `comporLogo` sem formato mantém o comportamento antigo (feed/legado).
- **O duplicar da bancada passou a CARREGAR `quando`** (data e horário do card
  original) — pedido do Ciro, revertendo a decisão do mesmo dia: quem duplica
  está refazendo a arte daquele slot, e o card antigo costuma ser removido em
  seguida. Dois cards no mesmo horário continuam possíveis; agendar é ação
  explícita e a tela mostra o horário.

### Assinatura tipográfica por projeto: TERO (17/08/2026, noite)

Depois de conversar com a Roberta, o Ciro manteve o modelo-livre no TERO mas
pediu "um pouco mais de semelhança ao template escolhido… as artes precisam ser
mais delicadas e sofisticadas; a queixa é o título muito grande". A resposta
não foi voltar ao layout travado: foi dar ao gerador a ASSINATURA da marca —
`assinatura-tipografica.ts` (puro, mapa por projeto, TERO = 3), um bloco que
entra COLADO ao typography lock em toda peça avulsa e no guia de carrossel
(nunca no slide irmão, onde o LOOK SPINE manda).

- **A fonte da verdade são as 24 artes PUBLICADAS do TERO na galeria do
  Claudinho** (`insta.lagostacriativa.com.br/galeria`, filtro Publicada),
  analisadas uma a uma em 17/08: manchete serifada PEQUENA (~4-6% da altura por
  linha, lockup ≤ ~12%) em caixa alta com tracking largo; lockup de DUAS VOZES
  (uma linha cobre, outra branca); palavra-chave do apoio em cobre; losango
  pequeno como separador da casa; serviço miúdo e espaçado. 23 das 24 seguem o
  sistema à risca. A sofisticação vem do ESPAÇO, nunca do tamanho — que é
  exatamente o inverso do que o gerador fazia.
- **O bloco fala do TEXTO, nunca de POSIÇÃO** — posição é do modo livre, e um
  bloco que dissesse "rodapé" ou "terço inferior" competiria com ele. E não tem
  NENHUMA palavra de exemplo entre aspas: string literal vira texto desenhado
  (lei medida três vezes nesta semana). Há teste para as duas restrições.
- **A logomarca ficou de fora DE PROPÓSITO** — o Ciro não gosta do
  posicionamento dela nas artes do Claudinho ("é melhor pegar a análise do
  texto"). A logo do TERO segue o `compor` decidido mais cedo.
- Projeto novo ganha assinatura repetindo o método: filtrar as PUBLICADAS do
  cliente na galeria do Claudinho, ler o padrão (caixa, tamanho relativo,
  destaque, separadores) e escrever o bloco — nunca copiar o do TERO.
- **Calibragem da 1ª rodada real (22:17-22:21)**: "tracking largo/generoso" sem
  número foi lido ao EXTREMO (as letras da manchete quase desmontaram a
  palavra) — virou "~1/5 do corpo da letra, NUNCA mais". E o losango, que
  existe nas artes publicadas, saiu da assinatura por decisão do Ciro: o
  gpt-image o soltava ÓRFÃO no quadro — o separador é LINHA FINA, só. Adjetivo
  de intensidade em assinatura precisa de número e teto; ornamento pequeno e
  solto é o que o gpt-image mais perde.

### Modelo-livre: o pêndulo voltou — estilo sim, layout não (17/08/2026)

Depois de uma noite inteira consertando o `style-guide` para obedecer MAIS, o
Ciro avaliou o resultado e inverteu a direção: **"o Claudinho estava fazendo
artes melhores quando não travava muito o modelo — o modelo já manda bem e é
bem criativo, agora está engessando muito"**. O spine estrito ("same placement,
same alignment, in the same minute", zonas com percentuais, "variação é
DEFEITO") produzia peças tecnicamente obedientes e esteticamente piores. A
lição de arquitetura: **prescrição de POSIÇÃO compete com a leitura da foto, e
o gpt-image compõe melhor lendo a foto do que seguindo coordenadas.**

- **O papel do modelo escolhido foi REDEFINIDO**: ele passa as FONTES em uso, a
  caixa/cor/proporção de cada nível e os ornamentos — e a POSIÇÃO volta a ser
  do gerador (a regra 10, autonomia, volta a valer com modelo presente).
  `buildModeloSpineLivre` + preâmbulo `STYLE MODEL` + leitura por visão
  `semPosicoes` (descrição de posição vira instrução de lugar por osmose; no
  modo livre ela não pode nem constar).
- **É o PADRÃO de todos os clientes desde 17/08/2026** — nasceu como
  experimento só no Quintal, o Ciro aprovou no mesmo dia ("funcionou melhor") e
  a promoção foi imediata: quem opera todos os clientes é a mesma equipe, e
  dois comportamentos para o mesmo gesto da bancada seria pior que qualquer uma
  das duas semânticas. O caminho de volta de uma marca que regredir é
  `PROJETOS_COM_MODELO_ESTRITO` (opt-out, vazio hoje) em `modelo-livre.ts` —
  nunca reescrever o prompt. O spine estrito continua no código, coberto por
  teste, exatamente para esse retorno.
- **O CARROSSEL não passa pelo modo livre, de propósito**: o LOOK SPINE do
  slide irmão segue estrito, porque a série é uma peça só e slides com layouts
  diferentes é o defeito que ele existe para evitar.
- **O que NÃO afrouxou**, porque veio de feedback do MESMO cliente no MESMO
  dia: palavras do modelo fora do prompt, UMA marca por peça no canto da
  referência, serviço no rodapé (é conteúdo, não layout), safe area, véu
  local, texto contido/foto protagonista (regras 1, 2 e 4 — "o assunto da foto
  nunca deve ser coberto" é a regra 4, integral nos dois modos).
- **Liberdade ≠ menos regra: é regra sobre a coisa CERTA.** O modo livre
  continua cheio de ordens — sobre tipografia, caixa, cor, quantidade. O que
  saiu foi só a coordenada. Se o experimento aprovar, a migração dos outros
  clientes é adicionar o id ao Set.
- O dry-run de `medir-modelo-a-seguir.ts` passou a GRAVAR os prompts
  (`prompt-antes/depois.txt`) — inspecionar o que seria mandado é o objetivo
  dele, e sem os arquivos a única saída era gastar para ler.
- **O card da galeria tem o PAR de botões de iteração**: "Gerar de novo"
  (refazer — mesmos insumos, outra rodada; útil no modo livre porque sem seed
  cada rodada é uma diagramação nova) e "Duplicar na bancada" (`CopyPlus` ao
  lado da lixeira — mesmo briefing, referência NOVA). O duplicar
  (`duplicar-para-bancada.ts`, puro) carrega copy/foto/pedido/formato e **deixa
  a referência de estilo para trás de propósito**: carregá-la pré-selecionada
  faria o clique mais fácil ser regenerar o que a pessoa acabou de rejeitar. O
  card nasce local na fila da bancada (sem `itemDePlanoId`, protegido da
  hidratação). Mesmo gate do refazer: só `source: 'arte-ia'`.
- **A regra 5 (quebras de linha) cobre TODAS as linhas, não só a última**: a
  manchete do Espeto saiu com o artigo sozinho na primeira linha ("As" /
  "promoções!") e a regra só proibia palavra sozinha na última. Sem exemplo
  entre aspas na regra, de propósito — string literal no prompt vira texto
  desenhado.

### O diretor de arte: quem escreve o prompt do gpt-image OLHA a peça (05/09/2026)

Plano e medições em `docs/PLANO-2026-09-05-ARTES-COMO-O-CHATGPT.md`. O Ciro
levou ao ChatGPT uma tabela de horários exportada do editor (Real Gelateria)
com oito palavras de pedido e voltou uma peça editorial na marca; a mesma
peça pelo Studio saía igual à origem. **Não é o modelo: o ChatGPT usa o mesmo
`gpt-image-2` da API.** A diferença é o processo — um LLM com visão planeja e
escreve um prompt curto; o gerador recebe liberdade; a pessoa itera uma
mudança por vez. Executado no mesmo dia (F0–F6). Regras que valem para código
novo:

- 🔴 **O paredão NÃO protege — medido, n = 4 × 4 peças.** O prompt de produção
  da melhoria tinha 22 mil caracteres com "não crie nada" e "a fotografia é
  intocável" escritos; acrescentou um selo em 4 de 4 rodadas, inventou uma foto
  numa, errou a grafia da tagline em outra. Um prompt de 1,4 mil com o MANUAL DA
  MARCA como imagem saiu limpo em 4 de 4. **Não acrescente regra ao prompt do
  gpt-image.** Regra nova vai para o system prompt do planejador
  (`src/lib/ai/diretor-de-arte.ts`), onde texto longo é lido; o planejador
  decide quais três ou quatro ESTA peça precisa. O prompt gerado tem teto
  (`TETO_DO_PROMPT_PLANEJADO` = 2.600) e é conferido por código: toda copy
  verbatim entre aspas, nenhum nome de fonte solto. Falhou o planejador →
  cai no prompt de código (`buildPrompt`/`buildArtePrompt`), nunca derruba a
  peça. `fieldValues.planejador|planejadorMs|leitura|prompt` registram a run.
- 🔴 **NOME DE FONTE VIRA TEXTO DESENHADO.** Primeira geração com o planejador
  no Quintal: o prompt dizia "line 2 in Amithen" e a peça saiu com "Amithen"
  letrado no lugar da copy — a régua de texto PASSOU (ela confere o que falta).
  `fontesForaDaReferencia` recusa prompt com família da marca fora da linha
  "Image N is the type specimen…"; a fonte se cita pelo PAPEL. É a lei da
  string literal (16-17/08) com outra roupa.
- **A melhoria tem TRÊS MODOS** (`modo-da-melhoria.ts`, puro): `rediagramar`
  (a peça já foi diagramada por quem cuida da marca — só posição do conjunto,
  respiro, quebra), `redesenhar` (matéria-prima — refaz no estilo da marca com
  manual + prancha como referência; copy e foto intocadas) e `refinar` (UMA
  mudança pedida; **o único em que a copy pode mudar** — o planejador devolve
  `copyFinal`, que vira a régua; "troque a frase X por Y" era impossível por
  construção). O padrão sai da ORIGEM (`modoPadraoDaMelhoria`): melhoria
  anterior → refinar; compositor/canvas/post → rediagramar; export do editor,
  arte-rapida, ajuste-arte, arte-ia → redesenhar. **Redesenhar peça com
  diagramação aprovada pinta por cima da foto em 1 de 4 rodadas** (Quintal,
  Wine Vix) e em 4 de 4 quando a foto é escura (TERO) — daí o padrão
  preservador para essas origens. Modal, rota (`modo` no zod), serviço, runner
  e tool `melhorar-arte` passam o modo; `refinar` sem pedido é recusado antes
  de cobrar.
- **A melhoria agora manda o manual do designer e a prancha tipográfica**
  (`brand-card`/`type-specimen` em `ReferenceImage`), como a geração já fazia;
  em `refinar` só a prancha (o manual inteiro convida a redesenhar o que se
  pediu para manter). Tier: `redesenhar` → `medium` (`QUALIDADE_ARTE_REDESENHO`;
  lettering novo e ornamento fino), os outros seguem no `low`; ajuste na foto
  continua `high`.
- **Planejador é `gpt-5.2`** (`OPENAI_PLANNER_MODEL`), sem `temperature`
  (gpt-5* recusa). O `gpt-4o` misturou a preserve list do refinar num
  redesenho e descreveu a tarefa em adjetivos. Custa 10-30s e centavos por
  peça; anexa ao planejador só as imagens que ele precisa VER (origem, fundo,
  manual, foto, modelo) — logo, prancha e âncoras vão pelo papel.
- **Na geração (`arte`, peça avulsa) o planejador substitui `buildArtePrompt`**;
  o que é mecânico vai colado ao fim do prompt planejado: o bloco da logo e
  `regraDeSafeArea` em pixel. Carrossel e peça com cartão de documento NÃO
  passam por ele (LOOK SPINE e faixa em pixel são mecânicos e medidos).
  `ARTE_PLANNER=off` desliga sem deploy. Com o planejador o preâmbulo por papel
  não é prefixado — o prompt já descreve cada imagem pelo índice.
- ⚠️ **`images.edit` regenera o quadro**: mesmo com "foto intocada" no prompt e
  no planejador, a foto da Wine Vix voltou desfocada num redesenho. Não é
  prompt — é a máscara (`spike-melhoria-com-mascara.ts`), como já registrado.
- ⚠️ **Dedução de crédito em paralelo estoura a transação** (`P2028`, três
  melhorias simultâneas na validação da carteira). A melhoria continua valendo
  (`creditDeductionError`), mas o ramo de falha reescreve o `fieldValues` —
  ele PRECISA carregar as mesmas chaves do ramo feliz (foi assim que o TERO
  saiu sem `planejador` no registro).
- **Scripts**: `medir-melhoria-estilo-chatgpt.ts` (o A/B da F0, 4 peças,
  dry-run), `testar-melhoria-com-diretor.ts` e `testar-geracao-com-diretor.ts`
  (caminho REAL, cobram crédito, deixam a arte na galeria — é como o Ciro quer
  avaliar), `validar-melhoria-na-carteira.ts` (uma peça por cliente).
- **Comparação lado a lado com o ChatGPT em produção (05/09/2026, noite)**, o
  MESMO pedido e a MESMA arte do Espeto Gaúcho pela agenda e pelo ChatGPT:
  - `refinar` ("troque a frase X por Y, aumente um pouco o serviço"): os dois
    acertaram a troca; **os dois perderam o acento de "família"** e a régua
    aprovou os dois, porque `normalizeForComparison` tira acento de propósito.
    Daí `acento.ts` (`divergenciasDeAcento` → `acentoAlerta`, AVISO, nunca
    reprova) e o tier subindo para `medium` quando o refino TROCA texto
    (`tierSubiuPorTextoNovo`). "Um pouco maior" no Studio fez o endereço quase
    encostar na logo; o planejador agora traduz adjetivo em número (~10-15%,
    ~25%, ~40%) e manda manter a folga da marca.
  - `redesenhar` (arte + manual + prancha nos dois): o ChatGPT centralizou e
    pôs a marca no topo; o Studio manteve a estrutura e **acrescentou uma faixa
    marrom no rodapé** porque o manual do Espeto a menciona — a regra "nenhum
    contraste acrescentado" agora se declara vencedora sobre manual e DNA, em
    todos os modos. O ChatGPT entrega 941x1672 (precisa de upscale); o Studio
    sai em 1080x1920 no post.
  - ~~O "manual" do Espeto (`brandManualUrl`) diz Roadhawk/Coolvetica/
    Montserrat; `brand.fonts` diz Bevan/Caveat/Barlow Condensed.~~ —
    **resolvido em 05/09/2026 pelo manual GERADO**, ver a seção seguinte.

### O manual de marca GERADO e o estilo lido das peças aprovadas (05/09/2026)

Pedido do Ciro: "corrige o manual do Espeto com as fontes certas… incluindo
alguns assets para serem usados como separadores de texto, ícones, para ser
capaz de fazer artes mais criativas… Analise as artes de referência de todos
os clientes para personalizar o estilo da marca de cada um." Três peças novas:

- **`BrandDNA.estiloDasReferencias` (Json)** — o estilo OBSERVADO nas peças
  aprovadas, lido por visão (`gpt-5.2`) em `src/lib/ai/analise-de-referencias.ts`
  a partir de URLs à mão + `styleRefAt` + "gostei" (até 8). Contrato PURO em
  `src/lib/brand/estilo-das-referencias.ts`: tipografia por papel, caixa da
  manchete, cores de destaque, **separadores e ícones de vocabulário FECHADO**
  (`SEPARADORES`, `ICONES`), ornamentos, diagramação, foto, logo, evitar,
  resumo. Fica FORA de `BRAND_DNA_FIELDS` (não é editado à mão, é medido) e
  entra em `BrandContext.estiloDasReferencias` pelo loader único.
  🔴 **O schema que o modelo recebe é de TEXTO LIVRE (`estiloBrutoSchema`) e o
  vocabulário é reconciliado no CÓDIGO (`normalizarEstilo`)** — com enum no
  schema a Lagosta Criativa perdeu a resposta INTEIRA por um item fora da
  lista. Item que não casa vira ornamento descrito, nunca é jogado fora.
  Rodado em 05/09: 8 dos 11 clientes gravados; em 06/09 o Ciro marcou
  referências no Seu Quinto e no Empório Fonseca e os dois entraram (10 de 11
  — só Ciro Trigo, que não é restaurante, fica sem estilo). `scripts/analisar-referencias-de-estilo.ts`
  (`--projeto`/`--todos --exceto 6`, `--urls`, `--confirmar`; dry-run por
  padrão). ⚠️ `--todos` não recebe URLs: quem foi analisado com URLs à mão
  entra em `--exceto`, senão a rodada sobrescreve.
- **O planejador recebe o estilo como "ESTILO OBSERVADO NAS PEÇAS APROVADAS"**
  (`contextoDaMarca`), declarado vencedor sobre a prosa do DNA quando divergem
  — o DNA descreve intenção, isto mede. Em `redesenhar` o SYSTEM agora manda
  USAR os separadores e ícones do manual como a marca os usa (relógio antes do
  horário, filete entre manchete e apoio, tag atrás do CTA) e proibir só o que
  NÃO está no manual: na primeira rodada real ele escreveu "no icons" em bloco
  para uma marca cujas peças aprovadas têm ícone em toda linha de serviço.
- **`src/lib/ai/manual-de-marca.ts` desenha o manual (1080x1920)** com as
  fontes REAIS (`registerProjectFonts` + napi-rs canvas, a mesma via do
  `brand-reference-card.ts`), logo (com caixa na cor escura da marca quando
  ≥ 8% dos pixels opacos são claros e a logo não é predominantemente escura —
  a MÉDIA de luminância não denuncia o arco branco do selo do Espeto),
  paleta, tipografia por papel na caixa medida, separadores a traço (do
  estilo), **ícones e gráficos OFICIAIS da aba Assets** (uma variante por
  família, `-vermelho` antes de `-amarelo` antes de `-branco`; sombras e
  arquivos sem categoria ficam de fora quando há categorizados; PNG aparado
  com `sharp().trim()` — filete de 2px numa prancha de 1080 virava nada) e o
  "Como a marca usa" lido das peças. `scripts/gerar-manual-de-marca.ts`
  (`--projeto`/`--todos`, dry-run em `.tmp-medicao-estilo-chatgpt/manuais/`;
  `--aplicar` sobe ao Blob e troca `Project.brandManualUrl`, registrando a URL
  anterior em `manuais/ANTERIORES.txt`).
  **Aplicado só no Espeto** (era o manual com as fontes erradas; anterior
  `brand-manual/6-espeto-gaucho.png`). Os outros 10 manuais foram gerados em
  dry-run para avaliação — o manual do designer continua valendo neles até o
  Ciro decidir.
- 🔴 **EXEMPLO NO PROMPT VIRA RESPOSTA.** O SYSTEM da análise dizia que
  "evitar" era "o que nunca aparece (véu escuro inteiro, selo redondo,
  gradiente de borda a borda, emoji, moldura, sombra dura)" — e os 10
  clientes voltaram com ESSA lista, quase verbatim. No Seu Quinto a visão
  descreveu a manchete com "sombra curta deslocada" e ainda assim pôs "sombra
  dura" em evitar; o Ciro corrigiu ("sempre tem uma sombra nítida na
  headline, sempre com duas cores da paleta"). O prompt não dá mais exemplos
  ali (só "ausência VERIFICADA nestas peças"), o schema ganhou
  `efeitoDaManchete` (nenhum | sombra-dura | sombra-suave | contorno; o manual
  desenha a amostra com ele, em duas cores da paleta) e a análise foi refeita
  nos 10 clientes. A regra do Seu Quinto está no DNA (`visualStyle`, regras
  aprendidas) e o planejador foi avisado: o estilo observado vence a prosa do
  DNA, mas as "Regras aprendidas na prática" — decisões do dono — vencem tudo.
- 🔴 **A cor de destaque do manual nunca é a primeira do estilo às cegas**: a
  primeira cor lida é quase sempre o BRANCO do texto principal, e a segunda
  voz da manchete saiu branca sobre fundo claro. Vale a primeira cor VIVA
  (luminância entre 40 e 200), senão a da paleta.
- **Medido no Espeto** (`testar-melhoria-com-diretor.ts --modo=redesenhar`
  sobre peça do compositor, `cmtp69b3o0001swcx9lkppw83`): manchete em Bevan
  condensada branco + "500G" em vermelho, serviço em Barlow Condensed, CTA em
  Caveat, preço em amarelo, logo uma vez, sem véu — as fontes certas pela
  primeira vez numa melhoria do Espeto. Régua OK; `textoAMaisAviso` acusou
  "CHURRASCARIA" (é o arco da logo, transcrito como texto).

### O manual como design system e as DUAS PORTAS da peça avulsa (08/09/2026)

Arco em `docs/SESSAO-2026-09-08-MANUAL-E-DUAS-PORTAS.md`. Medido direto na API
nos nove clientes (07-08/09, tier `low`): **a peça sai melhor com MENOS imagens
e MENOS regra**. Foto + arte de referência + prompt de cinco linhas venceu; cada
imagem do sistema a mais (prancha, âncora, card, arquivo da logo) afastou a
peça do que a referência pedia. Receita do Ciro, confirmada: "enviar a arte
escolhida de referência e a copy que o usuário escreveu", sem lista de "não".

- **Duas portas no runner** (`creative-generation-runner.ts`, antes de
  `ordered`): com `style-guide` → porta `referencia` (foto + referência +
  `prompt-da-referencia.ts`); sem referência e com `brandManualUrl` → porta
  `manual` (foto + manual + `prompt-do-manual.ts`). Carrossel, peça com
  cartão, `finalPrompt` do MCP, sem foto ou sem manual seguem no planejador.
  `ARTE_PORTAS=off` desliga. `fieldValues.porta` é a telemetria; `refsUsadas`
  tem 2 itens. ⚠️ **Ainda não medido em produção** — só na API direta.
- **Texto de porta mora em módulo PURO com teste**, nunca no runner. O runner
  só cola ao fim o que é MECÂNICO: o bloco da logo (canto reservado) e a safe
  area em pixel. A copy passa por `copyComCaixaDaMarca` antes — a caixa é da
  STRING (lei de 16-17/08).
- 🔴 **Prompt e compositor leem a MESMA variável de canto** (`cantoParaCompor`):
  com referência, o canto da assinatura dela; na porta do manual,
  `cantoDaLogoDoEstilo`; senão `LOGO_CORNER`. Ler variáveis diferentes é o
  defeito de 07/09 (canto superior reservado, marca colada no rodapé).
- **A referência do rodízio (`style`) só conta como usada se ENTROU nas
  imagens** — na porta do manual ela fica de fora e marcá-la queimaria a vez.
- **O manual é um design system 16:9 (3000x1688)**, `manual-de-marca.ts`: logo
  num PAINEL cinza médio inteiro (caixa escura atrás da logo era COPIADA pelo
  modelo em 4 de 8 peças), cada elemento no próprio ladrilho claro/escuro pelo
  contraste DELE (ícone vermelho sobre faixa vermelha não lê), alfabetos
  desenhados na largura do painel sem peso forçado (`700` sintetizava negrito
  falso na Amithen), SEM prosa de uso (vai no prompt). Vertical "para o
  gpt-image receber no formato do story" não era razão técnica: o único limite
  da referência é o lado maior ≤ 3000px.
- **O prompt do manual é o molde do prompt do Ciro**, genérico para qualquer
  foto e por cliente: cor de destaque ENCAIXADA na paleta (a leitura vê a cor
  sob a luz da foto), caixa do mapa da casa (`CAIXA_DA_MANCHETE`) vencendo a
  leitura, direção estética SEM as orações sobre tarja/véu/degradê (elas
  contradizem a regra do fundo), nome de fonte nunca (vira texto desenhado),
  serviço no rodapé por `blocosDeServico`, textos exatos por último.
- `scripts/prompts-do-manual.ts` escreve os prompts por cliente e, com
  `--gerar`, testa direto na API (só fatura OpenAI, ~US$ 0,01/peça);
  `scripts/gerar-manual-de-marca.ts --todos --aplicar` regenera e aplica os
  manuais (URLs anteriores em `.tmp-medicao-estilo-chatgpt/manuais/ANTERIORES.txt`).

### O diretor de arte religado dentro das portas, com o briefing do Ciro como molde (08/09/2026)

O PR #107 (08/09, madrugada) pôs as duas portas ANTES do diretor de arte
(`elegivelParaPlanejador = !porta`), e como os 11 projetos ganharam
`brandManualUrl` no mesmo dia, toda peça avulsa com foto passou a sair de um
MOLDE FIXO (`prompt-do-manual` / `prompt-da-referencia`). Era o "sempre o
mesmo prompt" que o Ciro pediu para acabar. A medição de 07-08/09 comparou
"poucas imagens + prompt curto" contra "todas as imagens do sistema" — a
lição válida é a das IMAGENS, não a do molde; porta contra diretor nunca foi
medido.

- **A porta decide as IMAGENS; o diretor escreve o BRIEFING.** O gpt-image
  recebe foto (Imagem 1) + manual (Imagem 2). O diretor (`gpt-5.2`,
  `diretor-de-arte.ts`, `SYSTEM_GERACAO`) escreve o prompt; o molde da porta
  é o caminho de volta quando ele não responde (`planejador: 'fallback'` +
  `porta` no `fieldValues`). `ARTE_PLANNER=off` desliga o diretor;
  `ARTE_PORTAS=off`, as portas.
- 🔴 **A referência escolhida à mão é ANALISADA, não enviada** (decisão do
  Ciro, 08/09): o diretor a vê (`visivelAoGerador: false`) e traduz em
  instruções — zona do bloco, fontes por papel, cores, ornamentos, canto da
  marca; o gpt-image não a recebe, então o texto e a cena do post antigo não
  têm por onde vazar. Sem manual ela ainda vai como imagem (seria a única
  fonte de fontes e logo). `ARTE_REFERENCIA_COMO_TEXTO=off` volta a mandá-la.
  A referência vista pelo diretor CONTA no rodízio (`registrarUsoDaReferencia`).
- **O briefing sai em PORTUGUÊS, por seções, no molde do briefing que o Ciro
  escreveu para o happy hour da Wine Vix**: abertura + direção estética, FOTO
  DE FUNDO, IDENTIDADE VISUAL, LOGOTIPO (versão do painel do manual, posição,
  tamanho relativo), BLOCO PRINCIPAL, uma seção por bloco da copy, ÁREA
  LIVRE, RODAPÉ (só com serviço), HIERARQUIA VISUAL, EVITE (3 a 6 itens
  desta peça), TEXTOS FINAIS. Teto 4.500 caracteres (o molde tem ~4.300).
  O que o sistema anexa DEPOIS continua mecânico: bloco da marca e safe area
  em pixel.
- 🔴 **Halo, véu, degradê e os tetos numéricos de tamanho SAÍRAM do diretor
  da geração** (Ciro: "deixe isso para o gpt-image; ele pode confiar mais").
  Legibilidade se resolve por POSIÇÃO e cor do texto. `tratamentoDeFotoNoPrompt`
  RECUSA briefing que prescreva qualquer um deles. Na MELHORIA a regra "nenhum
  contraste acrescentado" continua como estava (05/09) — são system prompts
  diferentes.
- **A foto chega com MEDIDA**: `leitura-da-foto.ts` (puro) resume o mapa de
  calma do compositor (`mapa-de-calma.ts`, ~100ms, sobre a foto como aparece
  na peça) em nove regiões calma/agitada × escura/clara, o assunto estimado em
  % e as três regiões mais calmas em ordem; e o catálogo v3 da foto (assunto,
  elementos, enquadramento, pessoas, lotação) entra como texto — até aqui
  NENHUM prompt de geração lia o catálogo. Regra da casa: o modelo declara, o
  código mede. Medido na Wine Vix: o diretor pousou o bloco na região que a
  medição apontou (inferior-esquerda) e reservou o canto oposto para a marca.
- 🔴 **As travas mecânicas do briefing** (`problemasDoBriefing`, cada uma com
  teste em `__tests__/diretor-de-arte-geracao.test.ts`): copy verbatim entre
  aspas; nome de fonte só em linha "Imagem N"/"Image N"; sem tratamento de
  foto; serviço na copy ⇒ seção RODAPÉ (`blocosDeServico`); frase da
  referência (`GuiaLido.textos`, ≥ 12 chars, fora da copy) fora do briefing;
  **caixa da copy intocada** (`caixaAlterada` — o By Rock saiu com "RENDE PRA"
  / "GALERA" na quebra sugerida a partir de "Rende pra galera": a caixa é do
  mapa `CAIXA_DA_MANCHETE`, nunca do diretor; `copyEstaNoPrompt` não pega
  porque normaliza para maiúsculas); **marca nunca no superior-esquerdo em
  story** (`logoNoCantoDoAvatar` — a regra estava no prompt desde 07/09 e o
  diretor a ignorou). Recusa vira feedback e o diretor reescreve (3 rodadas).
- **`scripts/ver-prompt-do-diretor.ts`** mostra o briefing de um caso real
  (`--projeto`, `--foto`, `--copy`, `--referencia`, `--rodadas`) sem gerar
  imagem, sem tocar no banco: uma chamada do planejador por rodada (~20-45s).
  Saída em `.tmp-diretor/`. É o dry-run antes de gastar crédito.
- ⚠️ **Não medido em produção com feedback real** — como as portas de ontem.
  O que se sabe: 3 briefings reais (Wine Vix com e sem referência, By Rock)
  no molde, copy inteira, sem vazamento, posição pela medição. Quando o bloco
  já vai ao terço inferior, o diretor põe o serviço como última linha do
  bloco em vez de rodapé separado — aceito, é a mesma zona.
- ⚠️ O prompt do manual e o da referência (moldes) continuam no código como
  fallback e cobertos por teste; não os apague.

### 🔴 A foto intocada: máscara medida e recusada, tom casado por código adotado (08/09/2026)

Quatro clientes, doze gerações reais no dia (~US$ 0,10 e 25 créditos cada),
todas medidas em CIELAB contra a foto original cortada. O que se sabe:

- **Nenhum prompt segura a foto.** Sem tratamento nenhum, o `images.edit`
  escurece o quadro INTEIRO: L* -26% (porta antiga), -33% e -41% (diretor
  novo, com "sem alterar luz, cor, contraste" escrito), -20% (Real, molde). O
  croma real até CAI; o que lê como "saturada" é a foto escura com sombras
  fechadas. O ChatGPT, na mesma tarefa, admitiu ter recriado ponte e skyline.
- 🔴 **A máscara do gpt-image-2 é ORIENTAÇÃO, não garantia.** Controle (foto
  reencodada) = 0,6 de diferença fora das zonas; peça gerada COM máscara =
  29,8, sinal negativo nas nove regiões. Reduz o estrago pela metade (63 →
  30) e não zera. O humanizar de 07/09 já tinha visto ("objeto protegido
  movido").
- **O que zera é código** (`mascara-da-geracao.ts`, `restaurarFotoForaDasZonas`):
  LUT por canal calculado nos pixels fora das zonas + recomposição da foto
  original fora delas, com feather DENTRO da zona. Diferença fora: 0,0.
  🔴 O sharp devolve o raw borrado em 3 canais mesmo para entrada de 1 — ler
  com o stride errado espalhava alpha por onde não havia zona (8,8 de
  resíduo que parecia feather). 🔴 O texto TRANSBORDA a zona ("sabore" com o
  "s" cortado): o que o modelo pintou numa faixa em volta da zona
  (diferença > 60 depois do LUT) é mantido.
- 🔴 **E mesmo assim a máscara PERDEU em 2 de 4 clientes**, por três defeitos
  que a recomposição não conserta: o modelo pinta fundo CHAPADO dentro da
  zona (TERO: -82 de luz na faixa do título; By Rock: retângulo preto atrás
  da manchete — o véu de volta, com borda); ignora a zona (CTA do By Rock
  caiu fora e foi apagado; a faixa de transbordo manteve um pedaço do bolo
  REDESENHADO, com emenda); e perde o ENQUADRAMENTO que o modelo faria
  sozinho — o By Rock de 24/08, com o modelo reenquadrando o bolo para baixo,
  é a melhor peça do conjunto. Corte nosso no centro = assunto no meio =
  texto colidindo. Wine Vix e TERO saíram bem; By Rock, mal.
- 🔴 **Decisão do Ciro (08/09, fim do dia): "não vamos usar" a máscara.** O
  caminho de máscara foi REMOVIDO do runner e do diretor (nada de `zonas`,
  nada de corte nosso); o módulo `mascara-da-geracao.ts` fica pelo
  `casarTomGlobal` e pela passada cirúrgica. Detalhe e tabelas em
  `docs/SESSAO-2026-09-08-DIRETOR-MASCARA-E-TOM.md`.
- **Adotado: SEM máscara + `casarTomGlobal`** (LUT por canal levando o
  histograma da peça inteira ao da foto, depois da geração, antes do QA e da
  logo). Offline nas peças existentes: L* 26,4 → 44,5 (Vix), 46,0 → 57,7
  (Real), igual à foto; enquadramento do modelo preservado; sem retângulo,
  sem emenda. O texto claro só clareia um pouco. Não corrige mudança LOCAL
  (fundo chapado, objeto movido). `ARTE_TOM_CASADO=off` desliga. Telemetria:
  `fieldValues.tomCasado`.
- **O diretor devolve um `diagnostico`** (intacto, problema principal,
  hierarquia — a lição estruturada da conversa do ChatGPT), gravado no
  `fieldValues` como auditoria.
- 🔴 **Serviço: o diretor insistia em tratar "Funcionamento - 10h às 22h" como
  APOIO da manchete** (2-3 recusas seguidas, ~1 min cada, e na terceira caía
  no molde). A trava por posição de seção não bastava; o que resolveu foi o
  CONTEXTO apontar os blocos de serviço, classificados por `blocosDeServico`
  ("← SERVIÇO: vai SÓ na seção RODAPÉ"). Depois disso, 1ª tentativa. A trava
  `servicoSemRodape` olha SEÇÕES (BLOCO/TEXTO/TÍTULO…), não "qualquer lugar
  antes": citar o horário na FOTO DE FUNDO não é pendurar.
- **Rodapé miúdo** (Ciro, 08/09): pedir "50 px" rendeu ~30. O diretor agora
  pede proporção ("metade da altura de uma linha da manchete") além de ~2,8%
  da altura. Não medido ainda.
- ⚠️ **Real Gelateria: o diretor foi recusado 3× por escrever "gradiente"** —
  o DNA dela descreve "gradiente de leitura" e ele ecoa. A trava
  `tratamentoDeFotoNoPrompt` está certa; o que falta é o DNA parar de
  descrever véu (decisão do Ciro, como no Quintal em 05/09). Caiu no molde,
  sem máscara e sem tom casado naquela rodada (o tom casado entrou depois).

### A passada cirúrgica: onde a máscara serve, e o que ela não garante (08/09/2026)

`src/lib/ai/passada-cirurgica.ts` + `scripts/passada-cirurgica.ts`: uma
correção LOCAL numa peça pronta ("aumente o rodapé"), com máscara só na zona
e a peça original recomposta fora dela pelo mesmo `restaurarFotoForaDasZonas`
(a própria peça é a referência de tom). Disparada por gente, nunca por revisor
automático. Medido no rodapé da Wine Vix, 5 tentativas de ~30s e ~US$ 0,008:

| tentativa | fora da zona | dentro da zona |
|---|---|---|
| 1 ("dobro") | 0,2 | trocou fonte e cor, endereço estourou a zona e foi cortado |
| 2 ("50%", fonte e cor nomeadas) | 0,1 | certa — mas fantasma da linha antiga |
| 3 | 0,0 | fantasma de novo |
| 4 (feather curto) | 0,2 | faixa chapada (tarja) no rodapé inteiro |
| 5 (zona até 99,5%) | 0,0 | limpa, texto maior — fonte virou SERIFA |

- 🔴 **O fantasma era MEU, não do modelo**: a borda suave da recomposição
  mistura a peça antiga, e a zona terminava (97%) em cima da linha antiga
  (94%). A zona tem de conter o conteúdo antigo COM FOLGA; encurtar o feather
  (tentativa 4) deixa a emenda visível. O feather fica o padrão.
- **Fora da zona é garantido; dentro é cara ou coroa.** Em 5 rodadas o
  modelo obedeceu fonte, cor, tamanho e "sem tarja" ao mesmo tempo UMA vez
  (a 2). Pedir "mesma fonte" não segura mais que pedir "não escureça". Vale
  como botão de ajuste fino com o olho de quem aprova; não vale como etapa
  automática.
- **Tamanho de texto é NÚMERO no compositor e SORTE no gpt-image.** Para
  "aumente o rodapé" o caminho determinístico é a peça ser página do editor
  (a via `compor`, onde `fontSize` é um campo). O gpt-image é pintor, não
  tipógrafo.
