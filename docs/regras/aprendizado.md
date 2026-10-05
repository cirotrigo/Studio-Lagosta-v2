# Aprendizado por uso

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### Crivo conferido pelo sistema (11/08/2026)

O crivo de aprovação da bancada deixou de ser uma lista de caixas para marcar.
**O sistema confere o que consegue verificar sozinho, mostrando a evidência, e
o humano responde só o que exige olho** (decisão do Ciro, 10/08). Serviço em
`src/lib/brand/crivo-avaliacao.ts`, contrato puro em `approval-checklist.ts`,
rota `POST /api/projects/[id]/crivo/avaliar`, tela em `bancada-crivo.tsx`.

O que havia antes: o quadradinho significava "eu li", não "conforme"; o único
caminho para frente era marcar TUDO (14 perguntas no Wine Vix, 35 no Quintal);
e o aviso de que a polaridade era mista vivia numa frase que ninguém carrega na
cabeça. Virou pedágio que se paga sem ler — o oposto do que o desenho queria.

Regras que valem para código novo:

- **A avaliação NÃO recebe a imagem.** Ela responde por DADO: dia e hora em
  BRT, a copy, a base de conhecimento, o DNA, as fontes cadastradas. Quem olha
  pixel é o QA de visão (`creative-qa.ts`), que responde outra pergunta.
- **Reprova AVISA, nunca veta** — mesma regra da conferência de arte. A tela
  oferece "Voltar e ajustar" e "Agendar mesmo assim". A base pode estar velha,
  e travar publicação por metadado é pior que publicar com aviso.
- **Falha degrada para o crivo manual, nunca bloqueia.** `crivoManual()` é
  função pura justamente para a UI montar o piso sozinha quando nem a rota
  responde.
- 🔴 **Saída de modelo se valida por RECONCILIAÇÃO, não por parse.** Todo campo
  do schema é `.optional()`: com eles obrigatórios, o zod recusava a resposta
  INTEIRA quando o modelo omitia um só — e ele omite. Medido no By Rock: 15
  vereditos corretos descartados por falta de um campo, três tentativas
  seguidas caindo no crivo manual. O rigor mora em `reconciliarVeredito`, que
  trata cada campo como suspeito e devolve ao olho humano o que vier incompleto.
- 🔴 **O índice que o modelo declara NÃO é confiável.** No By Rock ele devolveu
  a lista inteira DESLOCADA em uma posição — respondia a pergunta N e carimbava
  N-1, pondo um ✅ verde em "Existe mais de uma oferta?" com evidência sobre
  CORES. Por isso cada resposta carrega um ECO (as primeiras palavras da
  pergunta, copiadas) e é amarrada pelo TEXTO; eco que não casa, ou casa com
  várias, é descartado. Vale para qualquer lista longa devolvida por LLM.
- 🔴 **"Você não viu a imagem" não sobrevive como regra de prompt.** Com outras
  tarefas na mesma chamada, o modelo respondeu "a arte contém emoji, o que é
  proibido" sobre uma arte que nunca recebeu, com evidência plausível. A trava
  é do CÓDIGO: o modelo declara `dependeDeVerAImagem` ANTES do veredito, e
  pergunta visual é forçada a `preciso-de-olho` com a justificativa inventada
  descartada junto.
- 🔴 **Inversão de polaridade por NEGAÇÃO é recusada.** Pedida a reescrita para
  "marcar = conforme", o modelo devolveu "A gramática NÃO está impecável?" e "A
  foto não acontece dentro do salão real?" — frases que fazem a pessoa marcar o
  oposto do que quis dizer, e que numa lista de 15 passam batido. Inversão de
  verdade reescreve em positivo ("Tem emoji?" → "A arte está sem emoji?").
  `inversaoAceitavel()` derruba junto algumas negativas válidas, e tudo bem: o
  fallback é a pergunta do DNA, que é segura porque a seção já define que
  marcar significa "está conforme". **Manter o texto do DNA é o default;
  inverter é o caso explícito.**
- **A polaridade oscilou três vezes durante a implementação** (não inverte
  nada → inverte tudo errado → nega tudo). Antes de mexer no prompt dessa
  parte, rode contra Wine Vix (11, quase tudo conforme-no-sim) **e** By Rock
  (7, cheio de reprova-no-sim): um projeto só não mostra a regressão.
- **`fieldValues.crivo` é gravado por MERGE**, nunca substituição — é o
  registro atômico da run, e telemetria não derruba fluxo (erro vira log).
- **Perguntas quebradas na importação se consertam por
  `scripts/corrigir-crivo-importado.ts`** (dry-run por padrão, `updateBrandDNA`,
  troca declarada uma a uma pelo texto exato). Escopo estreito de propósito:
  caminho de pasta vazado do `DNA.md` e frase truncada. Pergunta comprida ou
  estranha NÃO é defeito — é o crivo daquela marca.

### Escopo de aprendizado do post (F0.2, 10/08/2026)

`SocialPost.learningScope` (`ROTINA` default | `CAMPANHA` | `PONTUAL`) decide o
que o sistema pode aprender com cada post. Vocabulário em
`src/lib/posts/learning-scope.ts` (módulo SEM Prisma — o compositor da bancada
é client).

- **Capturar sempre, marcar por item, filtrar na agregação.** Nunca introduza
  um interruptor global de captura: esquecido desligado perde sinal, que é
  IRREVERSÍVEL; esquecido ligado contamina. E uma leva normal mistura os três
  tipos, então a marca é do ITEM. O "modo aprendizado" da bancada é açúcar de
  UI (`escopoPadrao`, que **de propósito fica fora do `partialize`** do store:
  padrão persistido é o interruptor esquecido ligado com outro nome).
- **Quem filtra é o consumidor.** `sugerirPosts` tira PONTUAL do HISTÓRICO e
  mantém no cálculo de slot ocupado — post pontual ocupa o horário do mesmo
  jeito. CAMPANHA ainda conta na cadência; separar o sub-perfil é da fase de
  destilação.
- **`campaignId` não tem foreign key**, mesmo precedente de
  `Generation.sourceGenerationId`: arquivar a campanha não pode arrastar o
  post. Consequência: todo leitor é defensivo — campanha inexistente ou sem
  `expiresAt` produz silêncio, nunca erro (`campanha-vigencia.ts`).
- **Campanha vencida AVISA, nunca veta** (`aprovar-rascunhos`, `ver-agenda`,
  e a rota de aprovação): a campanha pode ter sido prorrogada e o prazo da
  base pode estar velho. Recusar publicação por metadado é pior que publicar.
- **`decididoPor` é o `User.id` INTERNO (cuid), NUNCA o clerkId** — e falhar
  ao resolvê-lo não pode derrubar o agendamento (é auditoria): `quemDecidiu`
  no MCP engole o erro, e a rota HTTP busca o User só para LEITURA, sem criar
  linha (criar é justamente como nascem os Users fantasma).
- ~~`origem`/`sugestaoId` existem na coluna e no serviço, mas ainda não são
  preenchidos pela bancada~~ — **superado em 11/08/2026**: a fase de captura
  chegou, e quem preenche os dois é a rota `/agendar` (e `colocar-na-agenda`),
  com a `origem` saindo da COMPARAÇÃO de horários, nunca do rótulo que a
  superfície mandou. Ver "Captura de sinais: emissão e desfecho nas
  superfícies".

### Captura de sinais de uso (F1 — núcleo, 11/08/2026)

O aprendizado por uso escreve numa tabela só: **`LearningSignal`**. Uma linha é
um fato — "isto foi proposto, aquilo foi escolhido" — e as duas metades
convivem nela. Serviço em `src/lib/aprendizado/` (`captura.ts`,
`diff-copy.ts`, `vocabulario.ts`, `uso-de-modelo.ts`).

- **Uma tabela, não duas.** A **decisão SEM sugestão** (escolha absoluta de
  copy/foto/horário) é o caso COMUM nas primeiras semanas — com tabelas
  separadas ela seria uma linha de desfecho com FK nula, o caso especial torto
  que o desenho tinha de evitar. Aqui é linha inteira com `sugeridoEm: null` e
  `desfecho: 'escolha-propria'`, o que a mantém fora do denominador do KPI sem
  filtro nenhum. O precedente do `GenerationJob` (tabela à parte) NÃO se
  aplica: lá separou-se COMO o trabalho roda de O QUE o usuário vê.
- **A sugestão é gravada quando é EMITIDA, não quando é aceita.** Sem isso a
  proposta ignorada some e a taxa de aceitação vira 100% por construção.
- **Falha de captura nunca derruba o fluxo principal** — toda função de
  `captura.ts` engole o próprio erro e devolve valor neutro (`null`,
  `'erro'`), o mesmo contrato de `sendWhatsAppText`. Registrar aprendizado não
  pode impedir alguém de agendar um post.
- **O desfecho não fecha no agendamento.** `desfechoVenceOAnterior` deixa
  evidência mais forte sobrescrever (`aceita-como-veio` → `editada`/`trocada`/
  `descartada`), nunca o contrário; o mesmo desfecho duas vezes é no-op. É o
  que impede a taxa de aceitação de inflar quando alguém edita depois.
- 🔴 **`Page.layers` só se lê por `src/lib/posts/page-layers.ts`.** O
  `parseLayers` de `arte-rapida.ts` decodifica UM nível e devolve `[]` **em
  silêncio** na string dupla-codificada — num diff de copy isso vira "o usuário
  não editou nada", que é o pior defeito possível aqui. `lerCamadas` distingue
  "página sem texto" de "não consegui ler", `diffDeCopy` carrega `ilegivel` e
  `desfechoPeloDiff` devolve `null` nesse caso. **Ilegível nunca vira
  aceitação.** `normalizeLayersString` e `textosDaPagina` mudaram de casa para
  esse módulo (puro, sem Prisma) e seguem re-exportados de onde estavam.
- **`normalizeForComparison` mudou para `src/lib/ai/text-comparison.ts`**, pelo
  mesmo motivo: o diff usa as MESMAS regras de "o mesmo texto" da conferência
  de arte, e o módulo antigo importa Prisma e o SDK de IA. Módulo que precise
  ser testável sem banco não pode tocar `@/lib/db` — ele **lança no import**
  quando falta `DATABASE_URL`.
- **`tipo`, `desfecho` e `superficie` são TEXT**, não enum do Postgres:
  precedente de `SocialPost.origem` e razão operacional — `migrate deploy` roda
  cada migration numa transação, e `ALTER TYPE … ADD VALUE` não pode ser usado
  no mesmo bloco em que o tipo é criado. A validação mora em `vocabulario.ts`.
- **Nenhum vínculo tem FK** (`postId`, `generationId`, `pageId`, `campaignId`):
  apagar o post, a arte, a página ou a campanha não pode arrastar o registro do
  que aconteceu. Mesmo precedente de `sourceGenerationId`.
- **Espelhos colunares**: `Page.usedCount`/`lastUsedAt` e
  `Generation.sourcePageId` existem porque `fieldValues` é Json SEM índice —
  minerar "qual modelo este cliente mais usa" exigia varredura por path.
  Incremento por `registrarUsoDeModelo`. Ordenar por "menos usado" exige
  `MENOS_USADO_PRIMEIRO`: em Postgres `ASC` é NULLS LAST, e sem `nulls:
  'first'` o já-usado vem antes do nunca-usado.

### Captura na via de TEMPLATES (F1 — superfícies, 11/08/2026)

A via de template é a MAIS usada e não gasta API de imagem. Estes são os sete
pontos onde a decisão passa e onde ela agora fica registrada:

| Ponto | Grava |
|---|---|
| `prepareCreative` | sugestão `modelo` com TODOS os candidatos oferecidos |
| `createArteRapida` | fecha a sugestão; `Page.usedCount`; `Generation.sourcePageId` |
| `ajustarArte` | decisão `copy` com o diff antes→depois (a correção explícita) |
| PATCH da página | decisão `copy`, superfície `editor`, quando o TEXTO muda |
| `agendarPost` | `slot` + `copy` (diff proposta × final) + `SocialPost.slotValues` |
| `processarAprovacao` | fecha a sugestão de slot; garante a linha de slot |
| `gerar-criativo/finalize` | `source`, `sourcePageId` colunar e contador de uso |

Regras que valem para código novo:

- **`prepareCreative` é o ÚNICO ponto que enxerga os modelos REJEITADOS.**
  Daí para a frente só circula `sourcePageId`. Registrar a lista na EMISSÃO é
  o que impede a taxa de aceitação de valer 100% por construção — e a linha só
  nasce com 2+ candidatos, porque com um só não houve preferência nenhuma.
- **O desfecho do modelo é atribuído por RECONCILIAÇÃO, não por id.** Nenhuma
  superfície devolve o `sugestaoId` de `prepareCreative` para
  `createArteRapida` (o MCP local reimplementa o handler; as skills passam só
  `sourcePageId`), então exigir o id deixaria toda proposta pendente. A
  atribuição é conservadora: mesma janela de 6h, mesmo projeto, e a página
  usada tem de estar entre os candidatos. `sinal-de-modelo.ts`.
- 🔴 **A chave de slot é COMPARTILHADA entre `agendarPost` e
  `processarAprovacao`** (`slot:post:<id>`, em `sinal-de-agendamento.ts`). O
  caminho normal é criar rascunho e depois aprovar: com chaves diferentes, o
  mesmo horário do mesmo post viraria duas linhas e a cadência de quem usa a
  agenda direito valeria o dobro. A aprovação continua sendo quem FECHA a
  sugestão de slot — isso é outra coisa, e acontece mesmo quando a linha já
  existe.
- **A captura do editor tem balde de 10 minutos por página.** O autosave bate
  a cada pausa da digitação; sem o balde, escrever uma headline vira uma dezena
  de linhas quase iguais. Fica a PRIMEIRA do balde, que é a mais valiosa —
  o lado "antes" dela ainda é o texto que a IA gerou. Só entra quando o TEXTO
  muda: `layersChanged` dispara também em arrastar caixa.
- 🔴 **`fieldValues.sourcePageId` é AMBÍGUO**: em `source: 'ajuste-arte'` ele
  aponta para a própria cópia ajustada, não para um modelo. A coluna
  `Generation.sourcePageId` nasceu SEM esse vício e é preenchida só quando
  aponta para modelo de verdade (`createArteRapida` e o `finalize`; o ajuste
  não a preenche). Leitor novo usa a coluna primeiro.
- 🔴 **O `finalize` grava nos DOIS livros-caixa na mesma requisição** —
  `Generation` e `AICreativeGeneration` —, então a união ingênua conta cada
  criação da UI duas vezes. `lerUsosDeModelo`
  (`src/lib/aprendizado/historico-de-artes.ts`) unifica a LEITURA e deduplica
  por janela de 60s; a linha da UI vence, sem perder o `generationId` do outro
  lado. **Uma linha fundida não pode fundir de novo**, senão uma leva de três
  artes do mesmo modelo colapsa numa só (defeito real, pego por teste).
  `scripts/inventario-uso-modelos.ts` já consome o helper. Nenhum dado
  histórico foi migrado — o que se padronizou é o `source` daqui para a frente.
- **Registro nasce DEPOIS de a arte existir**: contar uso de uma arte que
  falhou ao renderizar mentiria sobre a preferência do cliente. Mesma razão de
  o rodízio de referência de estilo só marcar uso depois do sucesso.
- **`decididoPor` é o `User.id` INTERNO, e a rota HTTP só LÊ** (`findUnique`
  por `clerkId`, sem criar): criar User a partir de código de auditoria é como
  nascem os Users fantasma.
### Captura de sinais: emissão e desfecho nas superfícies (F1, 11/08/2026)

Quem EMITE proposta agora registra (`sugerirPosts` → `slot`, `buscarNoAcervo` →
`foto`), e o que a bancada decide chega ao servidor por
`POST /api/projects/[id]/aprendizado/desfecho`.

- 🔴 **Toda emissão precisa de `chave` de idempotência.** `sugerirPosts` é
  chamado pela bancada (que refaz a consulta ao voltar para a aba), pela rota
  `/slots` e pela tool do MCP, e devolve **36 slots** com `dias: 14` (medido no
  projeto 3). Sem chave, uma semana de uso normal gravaria milhares de linhas
  para as mesmas dezenas de propostas e o denominador do KPI viraria ficção. A
  unidade é a PROPOSTA, não a chamada: slot é `(projeto, horário)`; busca no
  acervo é `(projeto, critérios, DIA)` — `limit` fica de fora, porque
  "Carregar mais" mostra mais da mesma lista. Helpers em
  `src/lib/aprendizado/chaves.ts`; `sugestoesJaEmitidas` faz a leva reemitida
  custar **um SELECT e zero escritas**.
- **A `versao` entra na chave.** Mudou a heurística (peso por recência, corte
  de campanha — tudo isso é F2), a safra nova não pode herdar o desfecho de uma
  proposta que era outra.
- 🔴 **O desfecho é CALCULADO no servidor, nunca declarado pela superfície.**
  `avaliarSlotSugerido` compara o horário proposto com o agendado
  (tolerância de 1 min) e decide `aceita-como-veio`/`sugerido-aceito` ou
  `editada`/`sugerido-editado` — a mesma comparação dá o desfecho do sinal e a
  `origem` gravada no post. Quem agenda (a bancada, ou o modelo no chat) tem
  todo incentivo a relatar acerto, e o card **deixa mudar data e hora** depois
  de o item ter nascido de um slot: aceitar o rótulo da tela contaria edição
  como aceitação. Sem os dois lados comparáveis, o sinal fica PENDENTE — nunca
  vira aceitação por omissão.
- **Uma foto: o que se mede é se levaram o TOPO.** A busca no acervo registra
  UM sinal por lista ranqueada (não um por foto — vinte linhas por busca
  inflariam o denominador com fotos que ninguém olhou), e o picker fecha o
  desfecho na PRIMEIRA foto escolhida daquela busca. Fechar a cada clique faria
  a segunda foto de um carrossel sobrescrever o "levou o topo" da primeira
  (`trocada` vence `aceita-como-veio`), virando toda seleção múltipla em recusa.
- **A copy da bancada é `escolha-propria`, e é de propósito.** Não há dica de
  copy ainda; registrar o que a pessoa escreveu no momento do GERAR é o corpus
  das primeiras semanas — sem ele o aprendizado só começa a existir quando o
  sistema já estiver sugerindo texto, tarde demais para saber o que ele deveria
  sugerir. Chave por `item.id` (a copy do card não é editável depois de montada,
  e "tentar de novo" não pode virar segundo sinal).
- **A rota de desfecho é fire-and-forget e responde 200 mesmo quando o núcleo
  recusa o sinal** (`{ ok: false, resultado }`). 4xx só para pedido malformado:
  quem chama ignora a resposta, e um erro ali não pode aparecer na bancada.
  `useAprendizado` (`src/hooks/use-aprendizado.ts`) não é hook de dados — sem
  TanStack Query, sem toast, `void` + `catch`.
- **Gesto que vira sinal na bancada**: tirar o item da fila → `descartada`;
  digitar horário com um slot pré-selecionado → `editada` (o seletor já vem
  marcado, então digitar é recusa); agendar → o servidor decide; gerar → a copy.
  **"Limpar finalizados" NÃO registra descarte**: item em `erro` falhou por
  problema do sistema, e culpar a sugestão por isso seria mentira.
- **A expiração pega carona no cron diário `archive-expired-knowledge`**, antes
  do early return de "nada expirado" — mesma natureza de trabalho (o que venceu,
  vence), e cron novo custaria uma entrada no `vercel.json` para um `updateMany`
  que costuma tocar zero linha.
- **`origem`/`sugestaoId` do `SocialPost` passaram a ser preenchidos** pela rota
  `/agendar` e pela tool `colocar-na-agenda` (que ganhou o campo). A nota da
  F0.2 dizendo que ninguém preenche está superada — o que a proibia era não
  existir ainda quem definisse "sugestão".

### Feedback de arte: "Gostei" / "Preciso melhorar" (11/08/2026)

O par que faltava do registro atômico. Toda geração já grava
`{prompt, refs, params}` em `Generation.fieldValues` — COMO a arte nasceu —, e
este sinal diz se ela prestou, amarrado ao prompt exato que a produziu. Desde
que os vereditos automáticos foram desligados (crivo por atraso, QA por falso
negativo), é a única medida de qualidade que não é palpite. Serviço em
`src/lib/aprendizado/feedback-de-arte.ts`, rota
`POST|GET /api/generations/[id]/feedback`, UI em
`src/components/creatives/feedback-de-arte.tsx`, relatório pela tool
`ver-feedback-das-artes`.

- **Um clique resolve, nada bloqueia, nada atrasa, o texto é opcional.** São as
  quatro regras do desenho, e todas vieram do crivo: porta no fim do fluxo vira
  pedágio, e pedágio se paga sem ler. "Gostei" grava e não abre nada; "preciso
  melhorar" JÁ grava o veredito no clique e só então abre a caixa de texto —
  quem fechar sem escrever deixou o sinal mais importante.
- **A revisão mora no SERVIÇO, não no núcleo da captura.**
  `registrarDecisaoSemSugestao` faz `upsert` com `update: {}` (proposta que
  existe não é reescrita), o que ignoraria a segunda opinião. Aqui a última
  ação explícita vence, por compare-and-set no `updatedAt` — uma linha por
  arte, `chave = arte-feedback:gen:<generationId>`, `revisoes` contando as
  reescritas.
- **É decisão SEM sugestão** (`tipo: 'arte'`, `desfecho: 'escolha-propria'`): o
  sistema não propôs "esta arte está boa". Fica fora do denominador da taxa de
  aceitação sem precisar de filtro.
- **O espelho em `Generation.fieldValues.feedback` é MERGE verificado** (padrão
  do `fieldValues.crivo`) e é conveniência de leitura — a verdade é o
  `LearningSignal`. Falhar ali é log.
- **Só existe com `generationId`**: arte sem Generation não tem prompt atrás, e
  feedback sem prompt não ensina nada.
- 🔴 **O PhotoSwipe escuta `keydown` no DOCUMENT e não olha quem tem foco.**
  Seta ← → trocaria de arte no meio da frase digitada (e a troca zera o campo,
  porque o estado é por arte); Esc fecharia o lightbox junto. A barra flutuante
  para a propagação do teclado. Vale para qualquer campo de texto sobre o
  lightbox.
- **A barra do lightbox é IRMÃ, não filha do `.pswp`**: portal para o
  `document.body` com `zIndex: 100001` em estilo INLINE (o
  `--pswp-root-z-index` do pacote é 100000, e classe arbitrária de Tailwind já
  se provou não gerar CSS aqui). Entrar por `uiRegister` custaria os providers
  do app e ainda esbarraria na regra `[class*="container"]` do `globals.css`.
- **`usePhotoSwipe` ganhou `onSlideAtivo(elemento)`**, lido por REF e fora das
  dependências do efeito: função nova a cada render do chamador destruiria e
  recriaria o lightbox na cara de quem está olhando. Qual arte está aberta sai
  do `data-generation-id` do próprio card, nunca de um índice na lista — a
  lista se refiltra por baixo do lightbox aberto.
- **A prévia da bancada resolve o `generationId` pela FILA** (a store guarda
  `generationId` e `projectId` por item e por slide), porque ela recebe URLs e
  não ids. URL que não é da fila simplesmente não mostra o rodapé.

### Destilação: pilares, campanhas retroativas e cadência v2 (F2, 11/08/2026)

A F2 transforma o registro bruto da F1 em coisas que a GERAÇÃO pode usar. O
que orienta o desenho é a lição de 10-11/08, quando o Ciro desligou o retry de
qualidade, a revisão visual e o crivo: **verificação que atrasa, erra ou
bloqueia treina o usuário a ignorá-la — qualidade entra na geração, não em
portões.** Por isso a saída da destilação é um bloco de prompt
(`perfilParaPrompt`), não mais uma tela para aprovar.

- **Taxonomia FECHADA por projeto** (`ContentPillar`, aba Marca): 5–8 pilares
  propostos por LLM a partir do histórico do PRÓPRIO cliente e aprovados por
  gente. Tema em texto livre não deduplica — "happy hour" e "drinks" viravam
  baldes diferentes. Tabela e não Json no BrandDNA porque o `slug` é chave de
  junção (`SocialPost.pilar`), a lista é editada item a item e a aprovação é
  por linha.
- 🔴 **`salvarPilares` SUBSTITUI a lista inteira**: pilar que não vier no payload
  é APAGADO, não preservado. Chamar com uma lista parcial perde os outros em
  silêncio — e, se algum post já estiver classificado no que sumiu,
  `SocialPost.pilar` fica apontando para slug inexistente (sem FK, então o banco
  não reclama). Antes de fundir ou remover pilar, conte os posts classificados
  nele. Medido em 11/08/2026 ao consolidar o By Rock de 8 para 6.
- **`proporPilares` ESCREVE** — grava as novidades como `aprovado: false`,
  `origem: 'llm'`, de propósito, para a proposta sobreviver a um refresh sem
  nunca virar taxonomia em uso. `taxonomiaAprovada` ignora não-aprovado, então
  propor não muda comportamento nenhum. Ela lê no máximo
  `MAX_TEXTOS_NA_PROPOSTA = 140` textos: é amostra, não censo.
- **Aprovar a taxonomia já basta para a proposta da semana sair COM tema**, sem
  classificar o histórico: `distribuirPilares` cai em peso uniforme e usa a
  ordem que o humano aprovou. A classificação é o que enche o
  `perfilParaPrompt` — e `classificarHistorico` retorna cedo enquanto a
  taxonomia aprovada estiver vazia.
- 🔴 **`outro` e `sem-texto` são baldes DIFERENTES, e a distinção não é
  preciosismo.** Medido em produção: só **10% a 26%** das publicações de cada
  cliente têm texto legível no banco (Wine Vix: 26 de 176 em 8 semanas) — o
  resto é story cuja copy existe apenas dentro do PNG, montado fora do Studio.
  Se "não deu para ler" caísse em `outro`, `outro` seria o maior pilar de todo
  cliente e a linha de base da detecção de campanha viraria ficção.
- 🔴 **`SocialPost.slotValues` está preenchido com o JSON `null` em ~3.800
  linhas.** `where "slotValues" is not null` conta todas elas (444 no Wine Vix)
  e o Prisma devolve `null` mesmo assim. Para contar de verdade:
  `"slotValues"::text <> 'null'`. Foi por isso que uma primeira medição de
  cobertura de texto quase saiu 10× otimista.
- **A classificação é constrangida no CÓDIGO, não no prompt**: `casarPilar`
  (rótulo que não existe na taxonomia vira `outro`, sem aproximação por
  semelhança) e `comPisoDeConfianca` (abaixo de 0,6 vira `outro`). Pedir isso
  ao modelo não é trava — ele responde com confiança alta para agradar.
- 🔴 **Empate de ECO entre textos IDÊNTICOS não é ambiguidade.** A reconciliação
  por eco (herdada do crivo) descartava os DOIS candidatos quando a mesma copy
  aparecia duas vezes no histórico — e isso custou **8 de 25** classificações
  num lote real do Wine Vix. Hoje, se os textos completos são iguais, o primeiro
  livre leva; o descarte continua valendo para textos diferentes que só
  compartilham o começo. Post não classificado volta a ser tentado na próxima
  passada (a idempotência olha `pilarVersao`), então rodar duas vezes aumenta a
  cobertura.
- 🔴 **Na detecção de campanha, `GAP_MAXIMO_DIAS` precisa ser MENOR que 7.** Com
  8, a rotina semanal do cliente virava UM aglomerado de 8 peças em 56 dias, sem
  nada "fora" para servir de linha de base — passava por campanha e teria tirado
  a rotina verdadeira da cadência. Campanha publica mais junto que uma vez por
  semana; é isso que a separa do hábito. O piso de densidade (0,4 peça/dia)
  cobre o caso de linha de base zero.
- **A campanha retroativa vira entrada CAMPANHAS `ARCHIVED` e SEM indexação** —
  e por isso NÃO passa por `criarEntradaBase`, que grava ACTIVE e indexa. Uma
  campanha encerrada indexada voltaria a alimentar copy, que é o defeito que a
  F0.1 veio corrigir. Confirmar marca `learningScope: CAMPANHA` junto com o
  `campaignId`: só o vínculo deixaria o post ensinando rotina.
- **A distribuição de PILARES também decai por recência** (11/08/2026,
  `src/lib/aprendizado/distribuicao-de-pilares.ts`, módulo PURO que reusa
  `pesoPorRecencia` de `cadencia.ts`). Até então o mesmo perfil tinha o *quando*
  pesado por recência e o *sobre o quê* contado com um `groupBy` chapado de 180
  dias. Medido no By Rock: **"Datas e Eventos" caía de 30% para 11%** (era o
  pilar nº 1, sustentado por Restaurant Week, Dia dos Pais e Carnaval — datas
  que já passaram) e **"Shows e Música ao Vivo" subia de 7% para 22%**, que é o
  que o cliente faz agora. Sem isso o sistema propõe Carnaval em agosto.
  ⚠️ O preço do peso é que amostra recente e pequena é amplificada (aqueles 22%
  vêm de 8 posts): `DistribuicaoDePilar.total` continua sendo a contagem CRUA
  justamente para quem lê saber quando não confiar.
- 🔴 **Pesar por recência, NUNCA cortar por idade.** Medido em 11/08: um corte
  em 40 dias deixaria cada cliente com 15 a 56 posts de texto — o Bacana com 15
  espalhados por 6 pilares, ele e o Wine Vix de volta ao cold start. Cortar
  troca dado velho por dado nenhum. E o receio de "treinar com cardápio e preço
  velhos" não se resolve por idade: preço, horário, data e promoção **já** não
  têm caminho até um prompt (três portas em `perfil.ts` + o lastro na base da
  dica de copy). O que a idade contamina é a MISTURA DE ASSUNTOS, e é isso que
  o decaimento corrige.
- **A cobertura do corpus é o KPI da migração para a bancada**
  (`scripts/cobertura-de-aprendizado.ts`, somente leitura). Medido em 11/08:
  **15% em 180 dias, mas 30% nos últimos 40** — e a fatia de arte feita no
  Studio sobe de 49% para 70% na mesma janela. A rota `/api/external/posts`
  aceita só `mediaUrls` e `caption`, então peça montada fora entra sem copy e
  vira `sem-texto`. O aprendizado vale exatamente o quanto do trabalho acontece
  aqui dentro.
- **Cadência v2** (`src/lib/posts/cadencia.ts`, módulo PURO): peso por recência
  (meia-vida 21 dias), histórico só com **POSTED**, campanha encerrada fora, e a
  regra única **"confirma, nunca cria"** para as duas evidências fracas — post
  de campanha em curso e post nascido de sugestão aceita sem edição (0,3 cada).
  Nenhuma das duas CRIA horário típico; as duas CONFIRMAM um que a rotina já
  sustenta. `postsPorSemana` passou a ser sobre semanas COM atividade.
- 🔴 **O decaimento é ancorado na ÚLTIMA ATIVIDADE do cliente, não no relógio.**
  Com a referência no relógio, o Espeto Gaúcho caía de 16 horários típicos para
  3 e a Bacana de 20 para 3 — não porque a rotina mudou, mas porque pararam de
  publicar por algumas semanas. O sistema emudeceria justamente com o cliente
  que precisa voltar a postar. Recência é comparação DENTRO do histórico, não
  relógio de validade.
- 🔴 **"Novidade" se mede por OCORRÊNCIA, não por fração de peso.** Com
  meia-vida de 21 dias os últimos 14 concentram a maior parte do peso até numa
  rotina de cinco semanas — pela fração, uma rotina consolidada era anunciada
  ao usuário como "novidade". Hoje `picoRecente` é "não existe nenhuma
  ocorrência anterior à janela".
- **`LIMIAR_DE_PESO = 1,75` foi calibrado contra os 9 clientes reais**,
  comparando horários típicos com o volume semanal de cada um (tabela no
  módulo). A v1 propunha à Bacana 20 horários para quem publica 11 vezes por
  semana. Não mexa no número sem repetir a medição — `calcularCadencia` aceita
  `limiarDePeso` justamente para isso, e `scripts/validar-cadencia-f2.ts` roda a
  comparação antes/depois contra produção **sem escrever nada** (ele não chama
  `sugerirPosts`, que REGISTRA cada slot emitido como `LearningSignal`).
- **Blindagem do perfil, em três portas**: na escrita `sanitizarParaPerfil`
  recusa qualquer texto com preço/horário/data/promoção (recusa, não mascara);
  na leitura `perfilParaPrompt` só olha alterações de causa `estilo`; e ainda
  passa uma conferência final linha a linha. Alteração de causa `fato` vira o
  alerta "a base pode estar desatualizada" e **não tem caminho até um prompt** —
  senão o perfil vira fonte clandestina do preço que só pode vir da base.
- **`api.delete` do cliente da casa não manda corpo** — por isso o "desfazer" da
  campanha entrou como `acao: 'desfazer'` no POST, em vez de virar uma segunda
  rota para a mesma decisão.

### O desfecho da copy fecha em TRÊS superfícies (11/08/2026)

Desde que `propor-semana` passou a **emitir** a copy como sugestão, editar essa
copy depois tem de FECHAR aquela proposta — nunca abrir uma decisão nova.

- 🔴 **São três os pontos, e o de maior volume é o agendamento**:
  `ajustarArte` (chat), o PATCH da página (autosave do editor) e
  `registrarCopyDoPost` (dentro de `agendarPost` — todo post que entra na
  agenda passa por ele). Os três chamam `fecharDicaDeCopyDaPagina`
  (`src/lib/aprendizado/fechar-copy-por-pagina.ts`) e só caem em
  `registrarDecisaoSemSugestao` quando o resultado é `sem-plano`.
  Abrir a linha paralela faria o mesmo texto virar dois sinais com sentidos
  opostos **e** deixaria a proposta expirar — inflando o denominador do KPI
  duas vezes. É o defeito que a F1 já corrigiu uma vez no slot (`e3236624`).
- **O vínculo é `pageId`/`generationId`, nunca `postId`**: o `ItemDePlano` só
  recebe `postId` quando transiciona para `agendado`, o que acontece DEPOIS de
  o post existir — no instante da captura aquele campo ainda está vazio.
- **A PÁGINA vence a arte na busca do item**, porque `ajustar-arte` cria uma
  Generation nova a cada ajuste; casar por arte só vale para a via `ia`. E a
  busca **não olha `sourcePageId`** — editar a página-MODELO não é editar a
  copy proposta para uma peça.
- **`erro` NÃO cai na escolha absoluta.** Sem saber se havia dica, abrir a
  linha paralela pode ser justamente o defeito; perder um sinal é o preço
  barato.
- 🔴 **Teste desta captura precisa de copy em `fieldValues.slotValues`.** Sem
  ela `agendarPost` resolve `copyFinal` como nulo e `registrarCopyDoPost` sai
  na primeira linha — o teste passa sem exercitar nada. Aconteceu de verdade em
  11/08; a prova está em `scripts/validar-desfecho-no-agendamento.ts`.
- 🔴 **O risco desta mudança é gravar de MENOS, e só o CONTROLE pega isso.** Se
  o resolvedor deixasse de devolver `sem-plano`, todo post comum perderia a sua
  linha de copy em silêncio — e é quase só disso que o corpus das primeiras
  semanas é feito. Por isso a prova tem três posts: copy usada como veio
  (`aceita-como-veio`), copy mexida (`editada` — sem ela, um fio trocado que
  passasse a proposta como se fosse o texto final deixaria tudo em aceitação
  para sempre) e post sem leva (`escolha-propria`).
- **`slotEmBrasilia` e as chaves moram em `sinal-de-agendamento-contrato.ts`.**
  O serviço arrasta o Prisma por dois caminhos (`captura` e
  `fechar-copy-por-pagina`), e `@/lib/db` lança no import sem `DATABASE_URL`:
  apontado para o serviço, o teste dessas três funções não carregava e as 9
  asserções nunca rodaram. O mesmo split desfaz o CICLO que o fechamento criou
  (`sinal-de-agendamento` → `fechar-copy-por-pagina` → `sinal-de-copy-do-plano`
  → `sinal-de-agendamento`).
- 🔴 **O guard por compute dos scripts de validação falha ABERTO sem `.env`** —
  e worktree não herda o `.env`, que é gitignored. Em
  `validar-desfecho-no-agendamento.ts` ele agora recusa rodar nesse caso; os
  outros scripts com o mesmo molde ainda voltam em silêncio, achando que
  conferiram.
- **Fechado ANTES de o corpus acumular, de propósito**: o volume era zero
  porque `propor-semana` tinha nascido no dia anterior. Captura errada não se
  conserta retroativamente — a mesma razão de registrar a sugestão na EMISSÃO.

### A qualidade da copy medida (PR 15 de "Marca simples, copy melhor", 12/09/2026)

O relatório de domingo passou a medir a copy: **fidelidade até a agenda**,
**causa de cada correção**, **correções indevidas**, **tempo até o rascunho** e a
**voz na escrita**. Contrato PURO em `src/lib/relatorios/qualidade-da-copy-contrato.ts`
(com teste, e com as provas de mutação dos guardas), serviço só de leitura em
`qualidade-da-copy.ts`, bloco da carteira + linha por cliente + `metricsJson.copy`
em `semanal.ts`, carimbo da voz em `src/lib/brand/voz-na-escrita.ts`. Sem migration.
A medida de partida é `scripts/medir-qualidade-da-copy.ts`.

- 🔴 **A causa NUNCA sai só do autor.** `autor: 'equipe'` tanto é a pessoa
  reescrevendo quanto o ajuste do REVISOR aplicado pelo app. O que separa é o
  motivo que `ajustarArte` grava em TODA chamada só de ajustes
  (`MOTIVO_DO_AJUSTE_DO_REVISOR`, a MESMA constante — não reescreva a string em
  outro lugar); proximidade no tempo não classifica nada (C15-01, abaixo).
  `sistema` em `compositor`/`recomposicao` é compositor; em `reverter-arte`,
  design; mexer só em `estilo` é design, nunca redação.
- 🔴 **O revisor é classe PRÓPRIA e nunca vira preferência da equipe** — nem
  redação, nem design. Ajuste do revisor que não deixou revisão de copy (corpo,
  gradiente) conta como revisor pela arte do ajuste.
- **Indevidas de TEXTO** saem da LINHA DO TEMPO dos estados da copy (o original,
  as efetivas das artes da página em ordem — menos a do ajuste só do revisor — e
  o contrato da página hoje), bloco a bloco: o sistema mudou linhas; equipe ou
  Claude devolveram ao original o texto que o compositor mudou; um refino foi
  desfeito. A equipe indo e voltando no próprio texto NÃO é indevida. **O ajuste
  do revisor desfeito sai das CAMADAS** (C15-02, abaixo), por id de camada.
- 🔴 **Amostra abaixo do limiar declarado não vira percentual** (`LIMIAR_DE_AMOSTRA`
  = 5 por cliente, 15 na carteira): a proporção sai `amostraInsuficiente` com
  `n`/`de`, e o texto do relatório não imprime "%".
- 🔴 **Legado fica FORA do denominador, e a exclusão é contada**: peça sem
  contrato, com autoria `desconhecida` (o adaptador do legado) ou sem copy final
  não é fiel nem infiel. Nenhuma autoria é reconstruída do histórico.
- **Uma peça por PÁGINA**: todas as artes da página (compositor, cada ajuste) e
  todos os posts que apontam para ela viram uma peça só; sem página, a arte.
- **Evidências fora da copy**: `troca-de-arte` e foto `trocada` contam como foto
  (desenho do plano), `geometria` como design, recusa `TEXTO_NAO_CABE*` da
  recomposição como compositor. **Avisos do compositor saem À PARTE e nunca como
  correção** — aviso não é mudança.
- **Tempo até o rascunho é PROXY declarado** (do item de plano, ou da primeira
  arte da peça, até o primeiro post; post anterior à arte fica fora) e é medido
  sobre TODAS as peças, legado incluído — ele não depende do contrato. Mediana e
  p90 só com amostra acima do limiar.
- **Esquema ausente degrada, nunca derruba**: conferido ANTES por
  `information_schema` (`lerEsquemaDaCopy`) — sem `Page.copyAutoral` (PR 3) o
  cliente sai `indisponivel` DIZENDO a coluna, sem emitir a consulta; sem a
  tabela `BrandVoice` (PR 7) a consulta da voz nem é feita e só a versão fica de
  fora. A carteira tem PRAZO (até 180 s e nunca além de 240 s do início do
  relatório) e teto de 25 s por cliente, cumprido NO SERVIDOR; quem não coube
  sai em "fora do tempo do relatório".
- **O carimbo da voz** (`fieldValues.vozNaEscrita = { fonte, versao, lidoEm,
  escritaEm?, incerto? }`) fica FORA do contrato estrito da copy (uma chave a
  mais recusaria a copy na leitura) e é gravado por `comporPeca` e
  `startArtGeneration`, best-effort. 🔴 **O `criar-plano` não tem onde guardá-lo**
  (`ItemDePlano` não tem `fieldValues`, e o PR 15 é sem migration): quem produz
  passa `escritaEm` (o `createdAt` do item — `executar-plano` e, no compositor,
  pelo `itemDePlanoId`) e o carimbo NÃO chuta: voz migrada ou regravada depois da
  escrita sai com `fonte`/`versao` nulas e o motivo em `incerto`. Copy
  REPRODUZIDA ("Gerar de novo", slides irmãos do carrossel) HERDA o carimbo da
  origem (C15-05). Sem o carimbo o relatório só conta.
- 🔴 **`voz-service` puxa o `Prisma` do client em RUNTIME**: importado
  estaticamente em `compor.ts`, derrubou o `compor-avaliacao.test.ts` (que só
  dubla `@/lib/db`) com `Cannot find module '.prisma/client/default'`. O carimbo
  entra por `await import()` nos dois produtores.
- **A pilha contém o PR 0** desde o rebase sobre o PR 14 integrado (`003717db`):
  a marca `ocultaPeloRevisor` é GRAVADA pelo executor dos ajustes e lida pelos
  helpers do próprio PR 0 (`marcaDoRevisor`/`ocultaPeloRevisor`), nunca por
  leitura própria. O `refino` é aceito no contrato mas não tem produtor nesta
  pilha (a melhoria ainda não grava contrato). Nenhum código de `copy-autoral`
  foi mexido aqui.
- **A medida de partida** (`scripts/medir-qualidade-da-copy.ts`) é SEMPRE só
  leitura, com uma transação `READ ONLY` POR CLIENTE; recusa a produção sem
  `--producao-somente-leitura` (produção reconhecida pelo COMPUTE contra o
  `.env`; com a flag e sem `DATABASE_URL` no ambiente, ela lê a URL do `.env`,
  porque o `tsx` não carrega arquivo nenhum) e falha FECHADA sem `.env` legível. Rodada no branch de dev em
  12/09/2026 (15/08 a 12/09, dev em dia com a produção): **761 peças em 10
  clientes, todas sem contrato** — o esperado com o PR 3 fora de produção; a
  primeira medida comparável vem depois do deploy dos PRs 3 e 7.

**Da pré-revisão do HEAD 560292a1 (BLOQUEADO, C15-01…06, 12/09/2026):**

- 🔴 **Proximidade no tempo não classifica revisão** (C15-01). A regra "arte do
  ajuste do revisor a até 2 min" rotulava como `revisor` a correção de texto que
  a pessoa ou o Claude fazia numa OUTRA chamada de `ajustar-arte` logo depois
  (ou antes): redação subcontada, revisor inflado, e a reversão da mudança do
  revisor ficava invisível. Toda revisão de uma chamada só de ajustes já carrega
  `MOTIVO_DO_AJUSTE_DO_REVISOR`; o que só a janela alcança é, por construção, de
  outra chamada. A janela sobrevive só como `JANELA_DO_MESMO_AJUSTE_MS`, para não
  contar o mesmo ajuste duas vezes. O teste antigo que esperava `revisor` para
  uma remoção pelo `claude` com "outro motivo" codificava o defeito e saiu.
- 🔴 **O esconder do revisor não passa pelo contrato — o desfecho se mede nas
  CAMADAS** (C15-02). Pelo PR 0, a camada escondida com a marca é lida como
  PRESENTE pela autoria (`camadasParaDecisao`): nem o esconder nem a reexibição
  pela equipe geram revisão, e a leitura por revisão nunca via o ajuste desfeito
  (os testes fabricavam uma revisão `{ cta: [] }` que o caminho real não grava).
  Hoje `ajustesDeVisibilidade` lê `revisao.aplicados` das artes do ajuste e
  `desfechosDaVisibilidade` compara a ÚLTIMA decisão do revisor por camada com
  `Page.layers` de hoje: escondida com a marca (`ocultaPeloRevisor`) = aceito;
  VISÍVEL = desfeito (vira a indevida `ajuste-do-revisor-revertido` com
  `camada`); escondida sem a marca = a pessoa reescondeu, aceito; camada apagada
  = nem um nem outro; camadas ilegíveis = sem desfecho. A arte do ajuste só do
  revisor saiu da linha do tempo de texto — a efetiva dela, lida das camadas
  cruas, mostrava o bloco escondido como texto apagado. O ramo que casava a
  marca por FUNÇÃO saiu: zerar o texto de uma camada marcada é redação.
- 🔴 **Teto que abandona a promessa não é teto** (C15-03). A consulta abandonada
  seguia no servidor segurando a ÚNICA conexão do pooler (`connection_limit=1`),
  e o cliente seguinte e a gravação do relatório esperavam por ela até o
  `pool_timeout`. Hoje, antes de CADA consulta, o que resta do prazo do cliente
  vira `SET LOCAL statement_timeout` numa transação própria: o Postgres cancela
  (57014, `cancelamentoPorTempo`) e a conexão volta. E a gravação do
  `InstagramWeeklyReport` vem ANTES da medida da copy; a medida entra depois,
  num `update` best-effort do `metricsJson`. O teste usa um banco falso de UMA
  conexão que honra o `statement_timeout`.
- 🔴 **Uma transação READ ONLY para a carteira inteira fica ENVENENADA** (C15-04):
  no Postgres, depois do primeiro erro tolerado (P2021 da `BrandVoice`, P2022 da
  `Page.copyAutoral`) a transação só aceita rollback, e todo cliente seguinte
  saía "erro na leitura" — exatamente a medida de partida planejada em produção
  antes de a pilha chegar. Hoje o esquema é conferido antes (`information_schema`)
  e cada cliente tem a SUA transação `READ ONLY` (`executarEmLeitura`, o mesmo
  executor no cron e no script). O teste simula a transação abortada.
- **Copy reproduzida herda o carimbo** (C15-05): "Gerar de novo" e os slides
  irmãos do carrossel carimbavam a voz do momento da REPRODUÇÃO, inflando "voz
  refletida" com copy antiga. `origemDoCarimbo` (o carimbo da origem, senão o
  instante da escrita — o `escritaEm` que ela registrou ou o `createdAt`) e
  `carimboDaGeracao` (o herdado vence o cálculo) moram em `voz-na-escrita.ts`,
  com teste.
- **O comentário e este arquivo diziam que a marca do PR 0 não estava na pilha**
  (C15-06): estava, desde o rebase. Comentário e bullet atualizados.

**Da pré-revisão de 560292a1..f813f787 (APTO COM NOTAS, C15-11…13, 12/09/2026):**

- 🔴 **Post agendado por `generationId` nasce SEM `pageId`, e a página só existe
  no `fieldValues.pageId` da arte** (C15-11). A consulta das artes pedia os ids
  dos posts e as páginas DOS POSTS; a página resolvida pela arte entrava na
  peça, mas as OUTRAS artes dela (o ajuste do revisor é uma Generation nova, e
  `trocarNosPosts` não muda `SocialPost.generationId`) nunca eram lidas — o
  desfecho da visibilidade e a correção do revisor saíam zerados, em silêncio.
  Hoje `lerSemanaDoCliente` faz uma segunda leitura, com a MESMA consulta
  (ids, páginas, ids a excluir, limite), para as páginas vindas pela arte.
- **Peça sem página lida é CONTADA, nunca um zero calado** (`semPagina` em
  `PecaParaMedir`/`MedidaDaPeca` e `visibilidadeDoRevisor.semPagina` na
  carteira): a arte não aponta página (arte-ia), ou a página não veio do banco.
  O relatório diz "N peça(s) sem página, não medida(s)" na linha do revisor, ao
  lado das camadas ilegíveis.
- **Escondida sem marca VÁLIDA é aceito, e o código diz isso** (C15-12): o
  ternário em `desfechosDaVisibilidade` era morto (`ocultaPeloRevisor` exige a
  marca, então ali `marcaDoRevisor` é sempre nulo). Reescondida pela pessoa ou
  marca malformada, o estado é o do ajuste — o que se mede é se a decisão
  sobreviveu.
- **P2028 (transação interativa expirada) e P2024 (espera de conexão) são o
  teto por cliente** (C15-13), como o 57014: `cancelamentoPorTempo` os
  reconhece, e o relatório diz "passou do teto de tempo por cliente" em vez de
  "erro na leitura: Transaction API error…".
- **A fiação do carimbo herdado tem teste de rota** (lacuna da revisão): "Gerar
  de novo" (`refazer/__tests__/route.test.ts`) e os slides irmãos do carrossel
  (`carousel-carimbo.test.ts`) passam `origemDoCarimbo` a `startArtGeneration`
  — com carimbo, o mesmo; sem, `vozNaEscrita: null` e a escrita na criação da
  origem. Os helpers sozinhos não provavam que os dois pontos os usam.

**Da revisão FINAL do Codex sobre ff2baaf0 (BLOQUEADO, PR15-01…04, 18/09/2026):**

- 🔴 **Cada MÍDIA do post acha a sua peça** (PR15-01). O serviço lia só
  `pageId` e `generationId` do post, e `SocialPost.generationId` é UM ponteiro
  que responde pelo slide 1 (a regra de `artes-do-post.ts`): o carrossel de três
  páginas do compositor virava uma peça só, e o que acontecia nos slides 2 e 3
  sumia sem exclusão nem aviso. Hoje o serviço seleciona `mediaUrls` e pede
  também as artes cuja `resultUrl` é uma das mídias (a MESMA consulta, no mesmo
  prazo e na mesma transação); `montarPecas` casa cada mídia com a sua arte pela
  URL EXATA (a mais recente vence), a coluna e o `pageId` do post respondem só
  pelo slide 1, e a deduplicação por página continua. Slide sem arte nem página
  (a foto do acervo) não é peça de copy. Sinal e item de plano vão a UMA peça —
  a da página, a da arte, ou a primeira peça do post —, senão o sinal que só diz
  o post contaria uma vez por slide.
- 🔴 **A página de hoje só é a copy do post que ainda a SEGUE** (PR15-02).
  `invalidateScheduledRenders` e a recomposição só alcançam `DRAFT`/`SCHEDULED`
  com `laterPostId` nulo (`postVivo`); o post congelado (publicado, entregue ao
  publicador) mantém a mídia antiga, e a medida usava `Page.copyAutoral` de
  hoje — atribuía ao post uma edição que não chegou à imagem dele. `finalDaPeca`
  decide: (1) todos congelados mostrando a MESMA arte pela URL → o SNAPSHOT: a
  `efetiva` dela (quem troca o PNG regrava o registro, PR3-F02), com as
  evidências cortadas no instante do PNG (`recomposicao.em` quando `feita` ou
  `re-renderizada`) — arte, geometria e sinal de depois não chegaram à mídia;
  não vale com ajuste de visibilidade do revisor até ali (a efetiva lida das
  camadas cruas contaria o bloco escondido como apagado); (2) senão, a página
  com PROVA, para cada mídia congelada, de que ela mostra a mesma mensagem de
  hoje — a efetiva da arte casada pela URL contra a que as camadas de hoje
  dariam (`registroDaCopyDaArte` sobre as camadas CRUAS, o que o revisor
  escondeu sai dos dois lados), ou o story de uma mídia com `_copiaDaPagina`
  igual ao texto da página; (3) sem snapshot nem prova, `congelada-sem-prova`:
  fora do denominador e contada no relatório. Limite declarado: peça com post
  vivo e post congelado PROVADO segue contando as evidências posteriores ao
  congelamento (a peça é uma só).
- 🔴 **A mensagem é linhas E ordem de leitura** (PR15-03). `preservada`
  comparava um mapa `id → linhas` e descartava a ordem; inverter a `ordem` de
  dois blocos (revisão válida do contrato) seguia "mensagem preservada".
  `mesmaMensagem` compara também a sequência dos ids com texto pela `ordem`
  (`blocosEmOrdem`); reordenar só o ARRAY continua fiel. `revisaoMudaLinhas`
  passou a contar o campo `ordem` — sem isso a peça que o compositor reordenou
  saía "não preservada" sem a mudança do sistema que a explicasse.
- 🔴 **A recusa do compositor é lida onde `registrarRecusa` a grava** (PR15-04).
  Desde C6-01 a recusa mora em `fieldValues.recusaDaRecomposicao` e
  `recomposicao` fica com o último render; a medida procurava
  `recomposicao.estado === 'recusada'`, e a recusa atual nunca entrava em
  `correcoes.compositor`. `recusouPorTextoQueNaoCabe` lê as duas formas, uma vez
  por arte, e o serviço projeta a chave nova no SQL. O teste chama a função
  REAL (`qualidade-da-copy-recusa.test.ts`, com o dublê do harness de
  `copy-visual-regravada-marcador.test.ts`) em vez de fabricar a estrutura antiga.
- **O banco falso do teste do serviço honra o `select` e projeta o
  `fieldValues` pelo SELECT do SQL**: o dublê que devolvia a linha inteira
  deixava passar campo novo esquecido na consulta. 15 mutações conferidas
  (mídias ignoradas, URL fora do SQL, sinal em todo slide, URL mais antiga
  vencendo, congelado lido como vivo, status fora do select, sinal sem
  `createdAt`, sem corte das evidências, snapshot sem a guarda de visibilidade,
  prova contra o contrato em vez das camadas, sem a prova pela cópia desenhada,
  mensagem sem ordem, revisão sem ordem, recusa só no formato antigo, SQL sem a
  chave nova): cada uma derruba ao menos um teste. A medida de partida de
  produção (13/09, 917 peças sem contrato) NÃO foi refeita.

**Do restack sobre a main 0df88981 (21/09/2026): o compute da guarda em minúsculas.**

- 🔴 **A guarda de produção da medida de partida compara o compute EM
  MINÚSCULAS, dos dois lados** (`bancoDaLeitura`, `scripts/lib/guarda-de-producao.ts`,
  com o `computeDe` normalizado de `destino-da-prova.ts`). `postgresql:` é esquema
  NÃO especial, o `new URL` preserva a caixa do host, e o DNS não a distingue: um
  `DATABASE_URL` com `EP-PROD-…` (ou `…-POOLER`) conectava na produção e passava
  por "não-produção" sem a flag — a lição da revisão do PR 12 (R12-10). O script
  abre UM destino só (o `db`, pelo `DATABASE_URL`; o `DIRECT_URL` não é usado em
  runtime), por isso não há "mesmo banco" a conferir. Teste com as quatro caixas
  de produção, o `.env` em outra caixa, o dev nas duas caixas, a falha fechada e
  a fiação do script ao guard (fonte sem `new URL`/`hostname`); mutações: sem as
  minúsculas, 3 testes caem; o script lendo o host por conta própria, 1.

**Da revisão FINAL do Codex sobre e3486221 (BLOQUEADO, PR15-05…08, 21/09/2026).**
Os quatro são a família do PR 5 e do PR 13 — **a prova afirmando mais do que
sabe**: comparação frouxa servindo de prova, identidade achada só pela URL de
hoje, evento de depois contado no antes, teto cortando referência direta.

- 🔴 **Comparação frouxa não serve de PROVA** (PR15-05). A prova pela cópia do
  texto desenhado (`_copiaDaPagina`) usava `copyIgual`, que colapsa espaços e
  compara um mapa: a quebra de linha trocada e a `ordem` dos blocos invertida
  passavam como "a mídia mostra a mensagem de hoje". `copiaProvaAMensagem`
  (própria da métrica) compara o texto LITERAL e só prova com UM texto visível
  e a copy medida de UM bloco com texto: o registro é um mapa por camada (o
  JSONB não guarda a ordem das chaves) e não tem como provar ordem de leitura —
  com dois blocos, a exclusão conservadora (`congelada-sem-prova`). O helper
  compartilhado não mudou (serve à agenda, onde o critério é outro).
- 🔴 **Identidade de peça não se acha só pela URL de HOJE** (PR15-06). A
  recomposição troca o `resultUrl` e guarda as anteriores em
  `recomposicao.urlsAnteriores`; o slide 2 de um carrossel publicado, cuja arte
  foi recomposta para outro post, sumia da contagem — nem peça, nem
  `congeladaSemProva`. O serviço pede também as artes cujo rastro contém uma das
  mídias (`jsonb_array_elements_text` com guarda de tipo: rastro ausente, objeto
  ou escalar não quebra a consulta), e `montarPecas` resolve pelo rastro DEPOIS
  da URL atual. 🔴 **O vínculo histórico só CONTA a exclusão**: a ocorrência
  pelo rastro nunca é `porUrl`, então nunca vira snapshot — a efetiva atual é de
  OUTRA imagem.
- 🔴 **Evento depois do corte não entra no snapshot, e se mede pelo instante
  DELE** (PR15-07). O corte filtrava a criação da Generation, e a recusa gravada
  depois do PNG entrava em `correcoes.compositor` do congelado.
  `recusouPorTextoQueNaoCabe(arte, ate)` lê o `em` da recusa nos dois formatos
  (`recusaDaRecomposicao` e o legado `recomposicao.estado: 'recusada'`), uma por
  arte; `em` ilegível não prova que veio antes. Pela varredura, o sinal sem
  `createdAt` também fica fora do congelado.
- 🔴 **Teto de janela não se aplica a referência DIRETA** (PR15-08). O limite de
  60 dias do histórico filtrava também `generationId` e URLs do post: post desta
  semana com arte antiga virava "sem contrato", e slides antigos sumiam. Hoje são
  duas consultas — as referências diretas (ids, URLs e rastro) SEM data,
  primeiro, e o histórico das páginas (as dos posts e as trazidas pela arte
  direta) COM data, no teto de artes que sobrar —, e arte direta anterior ao
  limite gera aviso de histórico incompleto. A varredura achou o mesmo corte
  calado nos sinais (`take: 2000`, sem aviso nem ordem): hoje ordenados e
  declarados no teto.
- 🔴 **Dublê de banco que IGNORA o filtro não testa o filtro.** O dublê antigo
  ignorava a data (por isso o PR15-08 passou), e a 1ª versão do novo, que
  conferia o SQL por formato de regex, deixou sobreviver a mutação que devolvia a
  data à consulta inteira. O atual avalia o WHERE de verdade (`avaliarOnde`: AND,
  OR, NOT e parênteses, cada parâmetro pelo texto que o antecede) e LANÇA em
  condição que não conhece — foi isso que pegou até a mutação "FALSE AND
  EXISTS". O `learningSignal.findMany` honra o `take`.
- **A consulta foi validada num PostgreSQL 15 descartável** (socket local, sem
  rede) com o texto EXATO do fonte: rastro em objeto, escalar, ausente,
  `fieldValues` nulo e outro projeto não casam nem dão erro; `[null, 7, "u7"]`
  casa `u7`.
- **Varredura por classe — o conferido e o descartado**: (a) comparação frouxa
  como prova: só `copyIgual`; o resto é igualdade literal ou pertinência
  (`mesmasLinhas`, `mesmaMensagem`, `revisaoMudaLinhas`), `startsWith` de
  `TEXTO_NAO_CABE` classifica erro e a janela de 2 min é dedupe (C15-01). (b)
  identidade só pela URL atual: o SQL e `artePorUrl` (corrigidos); snapshot e
  prova pela arte ficam na URL atual de propósito; sinal e item de plano ligam
  por página, arte ou post. (c) evento depois do corte: recusa e sinal sem
  instante (corrigidos); ajuste do revisor (a Generation nova tem o instante do
  evento), estados (efetiva só muda com PNG novo, que quebra o casamento pela
  URL) e avisos do sistema conferidos. (d) teto em referência direta: datas das
  artes (corrigida), sinais (declarados), teto de artes (diretas primeiro, com
  aviso) e posts (já avisado); itens, páginas e voz não têm teto.

**Da 2ª revisão FINAL do Codex sobre ede56191 (BLOQUEADO, PR15-05-R2, 09, 10 e
11, 21/09/2026).** Cada rodada achava um caso novo num CAMINHO DE PROVA
diferente da peça congelada — a cópia do post, as camadas visíveis, o snapshot
—, e a correção foi UMA regra, não mais um remendo por caminho.

- 🔴 **A mídia congelada só entra na medida com prova do TEXTO e prova
  TEMPORAL, e as duas saem do MESMO registro**: a arte casada pela URL exata
  (`provaDaMidiaCongelada`). A efetiva dela é o texto daquela imagem, literal
  (`linhasDaCamada` não apara nada), e `instanteDoPng` é quando ela ficou
  pronta. Sem essa arte, sem efetiva, sem instante legível ou com ajuste de
  visibilidade do revisor até o PNG, a peça fica `congelada-sem-prova` —
  contada e declarada, nunca medida pela página de hoje. Isto supera o item (2)
  do PR15-02 e o PR15-05 acima.
- 🔴 **O caminho pela cópia do texto desenhado (`_copiaDaPagina`) SAIU**
  (PR15-05-R2 e PR15-10). A cópia é ESCRITA por `textosDaPagina`
  (`story-renderer`), que apara as pontas e pula camada oculta: o registro já
  nasce sem as linhas literais e sem o que está oculto, e não tem instante.
  Nenhum leitor da métrica recupera isso — comparar cru, a correção mínima
  sugerida, fecha as pontas e deixa o PR15-10 aberto (medido por mutação: 2
  testes caem). `PostLido.slotValues` e a leitura dele no serviço saíram junto.
- 🔴 **Só congeladas: a medida é a imagem MAIS NOVA, cortada no PNG dela**
  (PR15-10), e as outras imagens congeladas têm de mostrar a MESMA mensagem.
  Antes, a peça congelada com imagens diferentes (um repost refeito entre os
  dois) era medida pela página de hoje, sem corte nenhum.
- 🔴 **Congelado e vivo na mesma peça: sem corte, e cada imagem congelada tem de
  mostrar a mensagem INTEIRA que se mede** — o contrato de hoje, com o bloco
  escondido pelo revisor contando como texto (PR15-09). A comparação antiga com
  o desenho CRU (o oculto saía dos dois lados) decidia pela parte visível e
  media o contrato inteiro. A prova temporal da peça mista é o post vivo: o que
  veio depois do PNG congelado chegou a ele.
- 🔴 **Bloco escondido pelo revisor até o PNG não tem prova do texto**: a
  efetiva o lê como apagado e nada registra o texto autoral dele naquele
  instante. A peça só congelada com esse esconder fica fora, mesmo com a página
  intacta.
- **PNG refeito com o instante ilegível não é instante**: `instanteDoPng`
  devolve `NaN` em vez de cair na criação, que é cedo demais e cortaria o que
  chegou à mídia.
- **Os avisos da leitura chegam à mensagem de domingo** (PR15-11): `l.copy.avisos`
  sai na seção do cliente ("⚠️ copy: …"). E a falha geral da medida DIZ que
  falhou — sem o bloco, o silêncio leria como "nenhuma peça".
- **O que mudou na cobertura, contado nos testes**: três casos que eram medidos
  passam a excluídos, todos por falta de prova do texto — story de um bloco
  provado só pela cópia; peça só congelada com o CTA escondido pelo revisor
  antes do PNG, página intacta; e a mesma peça com um post vivo. Um caso passa
  de excluído a MEDIDO: peça mista cujo esconder veio DEPOIS do congelamento (o
  contrato confere com a imagem; o desenho cru não conferia). E a peça de duas
  imagens congeladas da mesma mensagem passa a ser medida com corte.
- ⚠️ **Limite conhecido**: o esconder do revisor só é visto quando a arte do
  ajuste está na leitura; ajuste fora da janela de 60 dias do histórico escapa.
  Impossível antes de ~10/11/2026 (o revisor nasceu em 11/09).

**Da revisão FINAL do Codex sobre 9648f441 (BLOQUEADO, PR15-10-R2, 12 e 13,
21/09/2026).** A regra do PR15-05-R2/09/10 ficou (prova do texto e do tempo
pela arte casada pela URL); os três achados são as fronteiras dela.

- 🔴 **Registro de render que não diz quando o PNG ficou pronto NUNCA vira a
  criação** (PR15-10-R2, `instanteDoPng`). A recusa LEGADA (`recomposicao.estado:
  'recusada'`, até C6-01) SUBSTITUÍA o registro inteiro e apagava o `em` do
  render anterior: com o PNG refeito aos 20 min e uma correção de geometria aos
  10, o corte caía na criação e a correção ficava fora. A criação só vale SEM
  registro nenhum; `feita`/`re-renderizada` valem pelo `em`; qualquer outra
  forma — a recusa legada, estado que nenhum escritor grava, não-objeto — é
  `NaN`, e a peça fica `congelada-sem-prova`. A recusa na chave nova
  (`recusaDaRecomposicao`) preserva o registro do render e o instante dele. O
  teste do formato antigo aceitava o retorno à criação — a expectativa virou
  `congelada-sem-prova`, e o corte da recusa legada pelo `em` dela segue provado
  numa arte IRMÃ da página.
- 🔴 **A página só se lê no projeto medido** (PR15-12, `lerSemanaDoCliente`):
  `Template: { projectId }` na consulta, a régua do R29 do PR 6. O `pageId` do
  post e o `fieldValues.pageId` da arte não provam dono (o konva-export grava
  `body.pageId` sem conferir), e a página de outro cliente virava a copy final e
  as camadas (o desfecho do revisor) da peça daqui. A de fora fica NÃO resolvida,
  como a apagada (`semPagina`, contada). O banco falso do teste avalia o WHERE
  das páginas de verdade e lança em condição que não conhece.
- 🔴 **O `--json` do script declara quem NÃO foi medido** (PR15-13). A montagem
  mora em `scripts/lib/saida-da-medida-da-copy.ts` (puro, precedente da guarda de
  produção): `indisponiveis` (nome e motivo, o mesmo do bloco — inclui quem também
  está em `clientes`) e `foraDoOrcamento` (nome e o motivo do prazo). Antes a
  falha geral do esquema saía `carteira: null, clientes: []`, igual à seleção
  vazia. O teste usa a saída REAL do serviço e confere que o script chama a
  função (sem ela, voltar ao JSON inline passava).
- 🔴 **Um snapshot só por cliente, e o isolamento vai pela OPÇÃO do Prisma,
  nunca por SQL cru** (nota da mesma revisão). `executarEmLeitura` passou a
  `isolationLevel: 'RepeatableRead'` + `SET TRANSACTION READ ONLY` como 1ª
  instrução: as leituras de um cliente (posts → artes → páginas → sinais) veem o
  banco do mesmo instante. **Medido num PostgreSQL 15 com o cliente gerado**: no
  modo pgbouncer (o do pooler do Neon) o Prisma manda `DEALLOCATE ALL` logo
  depois do BEGIN, e `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`
  escrito à mão foi RECUSADO ("must be called before any query") — a medida de
  TODO cliente cairia. Com a opção o Prisma manda o isolamento logo depois do
  BEGIN — no pgbouncer, antes do DEALLOCATE; no direto não há DEALLOCATE — e o
  snapshot único valeu nos dois modos: uma linha inserida por outra conexão
  entre duas leituras não aparece na segunda (em READ COMMITTED, aparecia).
  Conferido: nada aqui espera trava de linha (só SELECT), e leitura em RR não
  recebe erro de serialização. ⚠️ Caveat do Postgres: DDL que REESCREVE tabela
  no meio da leitura a faz parecer vazia para o snapshot antigo — as migrations
  da casa são aditivas.
- **Varredura por classe** — (a) formato legado lido como se tivesse a
  informação do novo: só `instanteDoPng` (corrigido); recusa legada cortada pelo
  `em` dela, contrato adaptado (autoria desconhecida → fora), arte sem registro
  (sem contrato → fora), carimbo ausente (contado "sem"), `canal` nulo (a
  distinção `equipe`/`claude` não entra em conta nenhuma: as duas são HUMANAS). ⚠️
  Limite: a recusa legada também apagou `urlsAnteriores`, e a mídia antiga de um
  slide recomposto nessa janela não se liga a arte nenhuma — fica igual a uma foto
  do acervo (não é peça); o slide 1 ainda se liga pela coluna do post e sai
  `congelada-sem-prova`. Casar pelo nome do arquivo é proibido pela casa. (b)
  vínculo JSON como prova de dono: só a consulta de páginas; artes, itens,
  sinais, voz e as leituras do carimbo (`refazer`, carrossel, item do compositor)
  já filtram pelo projeto. (c) saída que omite o não medido: só o `--json`;
  mensagem de domingo e bloco declaram. ⚠️ `metricsJson.copy: null` por cliente
  (fora do orçamento, ou a falha geral) diz "não medida" sem o porquê — ele sai na
  mensagem da semana; o indisponível POR cliente já guarda o motivo em
  `metricsJson.copy.indisponivel`. Gravar o porquê do `null` seria escrita a mais
  justamente no caminho em que o banco falhou ou o prazo não comportava o
  cliente, e atrasaria o envio do relatório.

**Da revisão FINAL do Codex sobre 9fba3c68 (BLOQUEADO, PR15-14, 21/09/2026).**

- 🔴 **Quem mudou o texto de um bloco sai da REVISÃO desse bloco, nunca da
  origem da arte** (PR15-14, `origemPorBloco`). A recomposição grava na arte
  EXISTENTE do compositor (`recompor.ts`, `registroDaCopyDaArte`) a efetiva lida
  sobre o contrato da página — com a revisão da EQUIPE dentro.
  `origemDoEstadoDaArte` chamava de compositor todo estado de arte com
  `source: 'compositor'`, e a sequência "A do autor → B da equipe (relida pelo
  render) → A da equipe (por `ajustar-arte`)" virava `equipe-voltou-ao-original`:
  correção indevida do SISTEMA quando a equipe só desfez a própria redação — até
  com `sistemaMudouLinhas: false`. Hoje cada estado da linha do tempo (as
  efetivas das artes e o contrato da página, pela MESMA função) tem a origem POR
  BLOCO: a da ÚLTIMA revisão que mudou as LINHAS dele (ou o acrescentou ou
  removeu). Revisão só de estilo ou de ordem não produz as linhas — com "a
  última que tocou o bloco", o estilo retocado pela recomposição depois da
  edição da equipe voltava a jogar a mudança dela na conta do sistema. Bloco sem
  revisão fica sem origem (lido como do autor): nem acusa, nem reverte.
- **Os três palpites pela arte saíram juntos**: `source: 'compositor'` (o
  achado), o CANAL do ajuste (`canal: 'studio'` fazia a equipe autora de TODO
  bloco da arte do ajuste, inclusive o que só a leitura das camadas mudou — que
  o contrato registra como SISTEMA) e o `modo: 'refinar'` (o refino passa a ser
  lido pela revisão dele: `superficie: 'melhoria'`, o único produtor, é a origem
  `refino`). `canal` e `modo` continuam na leitura da arte e não entram mais em
  conta nenhuma. O que ficou da arte é o que ela REGISTRA sobre a própria
  chamada: o ajuste só do revisor (`revisao` + `ajustes` vazio) segue fora da
  linha do tempo — e a exclusão continua necessária: re-renderizada depois, a
  arte dele relê o bloco escondido como revisão do sistema na superfície da
  recomposição, que é origem acusável.
- ⚠️ **O refino, como origem, não conta como a equipe desfazendo** (não está em
  `HUMANAS`): refino que devolva ao original o texto do compositor não vira
  `equipe-voltou-ao-original`. Conservador — perde-se uma acusação, nunca se
  inventa uma. Sem efeito em produção hoje: a arte de IA não grava `efetiva` e a
  melhoria não escreve no contrato da página.
- ⚠️ **Observado na varredura, FORA da classe e não corrigido**: o original da
  peça é o `copyAutoral.original` da PRIMEIRA arte lida, e o `original` da arte
  de `ajustarArte` é o contrato da página JÁ revisado por aquele ajuste. Se ela
  for a primeira da peça (a arte de criação fora da janela de 60 dias do
  histórico e não referenciada pelo post), a base da fidelidade já inclui a
  edição da equipe e a peça sai "preservada". Não é inferência pela origem: é o
  campo que muda de sentido conforme o produtor.
- Provas (`qualidade-da-copy-contrato.test.ts`): o cenário do achado com o meio
  na efetiva da arte recomposta e a volta por `ajustar-arte` (duas redações,
  nenhuma indevida, a linha do tempo passando pelo meio); o controle na MESMA
  arte (a manchete que a recomposição mudou segue indevida; o CTA da equipe, com
  o estilo retocado depois, não); o ajuste pedido pela equipe com um bloco que
  só o desenho mudou; o estilo retocado no contrato da página; e a arte do
  ajuste só do revisor re-renderizada. Antes do conserto, três caem pelo motivo
  do achado (a falsa `equipe-voltou-ao-original` no CTA) e um pela regra da
  última revisão que TOCOU (a volta da equipe sumia); o do revisor
  re-renderizado é guarda da regra nova. Mutações: a arte do compositor volta a
  ser a origem (2 testes caem), sem o filtro de linhas (2), sem `melhoria` →
  refino (1), sem a exclusão do ajuste só do revisor (1), o canal do ajuste
  volta (1), a página volta à última revisão que tocou (1).

**Base fora da janela (proativo, antes da FINAL, 21/09/2026).** O caso ficou
registrado sem conserto no PR15-14 (o bullet "⚠️ Observado na varredura, FORA
da classe e não corrigido", acima) e foi corrigido antes da revisão FINAL —
este bloco o SUPERA; o bullet fica como registro.

- 🔴 **A base da fidelidade é o `original` da arte de CRIAÇÃO, e quem diz se o
  campo é base é o PRODUTOR** (`ORIGENS_DA_COMPOSICAO`: `compositor`,
  `arte-rapida`, `arte-ia`). O mesmo `copyAutoral.original` muda de sentido
  conforme `fieldValues.source`: no ajuste (`ajuste-arte`) é o contrato da
  página JÁ revisado por ele; na melhoria (`ai_improvement`), o da origem levado
  pela cadeia, com o refino por cima. A base era o original da PRIMEIRA arte
  lida: com a de criação fora da janela de 60 dias do histórico e não apontada
  pelo post, a primeira era o ajuste, a edição da equipe virava o texto do autor
  e a peça saía "preservada". Lista FECHADA: produtor novo, ou `source` ausente,
  não vira base até ser conferido e acrescentado.
- **Sem a arte de criação na leitura, a base é DESCONHECIDA**:
  `sem-original-da-composicao`, fora do denominador e CONTADA
  (`foraDoDenominador.semOriginalDaComposicao`, dita no bloco e na linha do
  cliente) — nunca medida contra uma base revisada, nunca uma base inventada.
  Cai nela a página duplicada (a arte de criação é da OUTRA página) e a peça sem
  página cuja única arte é a melhoria.
  ⚠️ **Mudança só de motivo**: a peça da melhoria sem página era
  `sem-copy-final` (arte de IA não grava `efetiva`) e agora é
  `sem-original-da-composicao` — nunca foi medida, antes nem depois. Ler a
  linhagem (`sourceGenerationId`) até a raiz não a mediria: a peça continuaria
  sem copy final.
- **A arte de criação é lida SEM o limite do histórico**, o mesmo caminho que o
  PR15-08 abriu para a referência direta: um ramo a mais na consulta do
  histórico — `pageId` da peça + projeto + produtor da lista +
  `copyAutoral.original` objeto. O ajuste antigo continua fora (o histórico
  segue limitado a `desde`), e a criação de antes do limite gera aviso ("lidas
  para dar a base; as outras artes dessas páginas, dessa época, não"). Consulta
  validada num PostgreSQL 15 descartável com o texto EXATO do fonte:
  `copyAutoral` ausente, `original` nulo ou escalar e `fieldValues` nulo não
  casam nem dão erro; ajuste e melhoria com contrato não casam.
- 🔴 **Ler a criação antiga fazia o TEMPO até o rascunho mentir — a regra é a
  janela, e a exclusão é contada.** Com a arte de meses atrás na leitura, o
  repost desta semana saía com meses de "tempo até o rascunho"; e toda peça
  começada antes da janela pode ter tido o primeiro post fora dela (os posts só
  são lidos a partir do início). Só a peça que começou DENTRO da janela tem
  tempo; a outra sai sem tempo e CONTADA (`tempoAteRascunho.antesDaJanela`,
  dita no bloco: "N peça(s) começaram antes da janela, sem tempo").
  ⚠️ O preço: peça planejada numa semana e agendada na seguinte nunca tem tempo.
  A saída é ler o primeiro post de antes da janela (uma consulta a mais), não
  feita.
- **Varredura da classe** ("linha de base tomada de um registro que já foi
  revisado"), ponto a ponto:
  - o laço da base em `montarPecas`: corrigido (a lista de produtores);
  - o 1º estado da linha do tempo e o `doOriginal` de `reversoesIndevidas`:
    derivam da base corrigida;
  - o estado ANTERIOR (`estados[j-1]`): entre a criação antiga e o histórico
    lido faltam as artes daquela época — a lacuna do PR15-08, declarada pelo
    aviso. O que ela esconde está no contrato da PÁGINA: a origem por bloco sai
    das revisões dele (PR15-14), que acumulam o histórico inteiro, e a volta da
    equipe continua vista;
  - o início do tempo (primeira arte ou item): virou a regra da janela;
  - `arteDaVoz` (`arteDoOriginal`, senão a primeira com carimbo): só produtor
    de criação grava o carimbo (e a copy reproduzida, que o HERDA, C15-05) —
    o fallback nunca pega o ajuste;
  - `final.revisoes` como correções: conta toda revisão registrada, inclusive a
    do item de plano antes da composição (a equipe corrigindo o Claude na
    bancada) — é correção do texto do autor, não base; a fidelidade compara as
    duas pontas, e a revisão anterior à composição está nas duas;
  - `finalDaPeca`, `artePorUrl`, `instanteDoPng`, `primeiraPecaDoPost`: o
    final, a prova da mídia e a rota dos sinais — nenhum escolhe base;
  - quem ESCREVE o `original` (todos varridos): compositor (`persistencia.ts`),
    `createArteRapida` e `startArtGeneration` gravam o contrato RECEBIDO;
    `ajustarArte` grava o da página (fora); a melhoria, o da origem + refino
    (fora); a recomposição mantém o que a arte tinha.
  ⚠️ **Limite registrado, não guardado**: a recomposição de arte do compositor
  SEM registro numa página COM contrato grava `original: contratoAtual` (o da
  página, talvez revisado) com `source: 'compositor'`, e a medida o tomaria por
  base. Praticamente inalcançável: página só ganha contrato na mesma escrita da
  arte que o compositor ou a via de modelo gravam, e a duplicação o copia para
  uma página SEM arte (sem arte, sem recomposição).
- Provas: `qualidade-da-copy-contrato.test.ts` (a única arte lida é o ajuste →
  `sem-original-da-composicao`, contada no bloco e na linha; melhoria, registro
  sem produtor e produtor desconhecido também não dão base; controle com a
  criação na leitura; as três vias de criação; o tempo pela janela e a
  contagem) e `qualidade-da-copy.test.ts` (o serviço lê a criação de antes do
  limite pelo WHERE avaliado de verdade no banco falso, e a peça é medida contra
  ela — a troca da equipe é redação, não "preservada"; o aviso; a página
  duplicada). Vistos falhar antes do conserto pelo motivo do caso (o ajuste
  medido como "preservada"; `['g-ajuste']` lido sem a criação; tempos de 29, 25
  e 142.680 minutos). Mutações contra o código FINAL: a base de volta à primeira
  arte (3 testes caem), sem a busca da criação (1), `ajuste-arte` como produtor
  de criação (4), sem o aviso (1), sem a regra da janela (4), o agregado sem a
  contagem do tempo (1), o bloco sem dizê-la (1), a medida sem marcá-la (1).
