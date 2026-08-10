# Plano de evolução — 10/08/2026 (rev. 2, pós-revisão adversarial)

> Rev. 2 escrita em 10/08 depois de: (a) decisão do Ciro — **tudo aprendido do
> histórico de USO**, ~3 semanas de bancada como período de aprendizado; (b) os
> três requisitos novos dele — campanhas com validade, conteúdo pontual fora do
> aprendizado, MCP capaz de propor e executar o planejamento semanal pelo chat;
> (c) o lembrete de que a via de **TEMPLATES é a mais usada** (sem custo de API
> de imagem) e precisa entrar no aprendizado; (d) uma revisão multi-agente:
> 4 recons do código real + 4 lentes adversariais + 1 recon dedicado à via de
> templates. Achados com arquivo:linha citados ao longo.
>
> **Nada daqui foi executado.** O plano existe para o Ciro verificar e mandar
> executar por fase.

---

## Placar de execução (10/08/2026)

| Fase | Estado | PR |
|---|---|---|
| F0.1 vigência de campanha | **no ar** | #43 |
| F0.2 escopo de aprendizado | **no ar**, migration aplicada em produção | #44 |
| F0.3 fila durável | **no ar**, migration aplicada em produção | #46 |
| F0.4 inventário de modelos | **no ar**; curadoria aplicada (41 → 19 modelos) | #42 |
| causa-raiz da poluição (`create-page`) | **no ar** | #45 |
| F1 captura — núcleo | **no ar**, migration aplicada em produção | #47 |
| F1 captura — superfícies | em implementação (2 tarefas em paralelo) | — |

**Correções ao que este plano dizia, descobertas na execução:**

- **`decididoPor` é TEXT, não Int** — `User.id` é `cuid` neste schema. O plano
  dizia `Int?`; uma coluna numérica não guardaria o id interno, que é o ponto
  do campo.
- **Data pura de validade = FIM do dia em BRT** (`23:59:59.999-03:00`): "vale
  até 31/08" inclui o 31 inteiro. E `new Date('2026-02-31')` **não** é
  `Invalid Date` — o V8 rola para março em silêncio, o que estenderia a
  campanha por dias; só a conferência componente a componente pega.
- **A causa-raiz da poluição de modelos era o `create-page` do MCP local**,
  que gravava `isTemplate ?? true` — o OPOSTO do default do schema — enquanto
  a skill `create-template-pages` usa essa tool para as peças da SEMANA.
  Corrigido; as 4 skills fora do repo foram atualizadas junto.
- **Modelo não pode ser apagado pela UI** (403 `template_page`): conteúdo
  marcado por engano ficava preso até alguém despromover. Reforça a regra
  "despromover, nunca excluir".
- **Estado medido da base**: 1 entrada com prazo contra 16 CAMPANHAS ativas
  sem prazo — a coluna estava 100% dormente, como o plano supunha.
- **Curadoria**: o Ciro escolheu a opção agressiva (9 + 13 em revisão = 22
  despromovidos). Consequências aceitas: Seu Quinto ficou sem nenhum modelo e
  alguns dias perderam `modeloSugerido`. Rollback versionado em
  `docs/manifests/curadoria-modelos-2026-08-10.json`.

**Armadilhas de worktree** (para toda tarefa futura em sessão isolada):
`.env`, `.env.development.local` e `node_modules` não vêm (untracked);
`prisma/generated` também não, e symlinkar o do repo principal traz client
DESATUALIZADO com ~30 erros de tipo falsos — rodar `npx prisma generate`
dentro do worktree. `npm run db:migrate` pede RESET até no branch de dev
(drift `McpOAuth*` / `Project.subtitleFontFamily`): validar com
`npx tsx scripts/dev-db.ts prisma migrate deploy` + `migrate diff`.

---

## Frente A — Aprendizado por uso

### O que "aprender" significa aqui

Não é treinamento de modelo — é **registro estruturado + destilação por LLM +
injeção em prompt**, o mesmo mecanismo do DNA e do `virar-regra`, alimentado
pelo uso implícito. O aprendizado cobre **as duas vias de criação** (template,
a majoritária e de custo zero; e geração por IA na bancada) e **todas as
superfícies** (bancada web, chat/MCP, editor, agenda).

Descoberta boa do recon: **a via de template já grava quase tudo** em
`Generation.fieldValues` (`sourcePageId`, `sourceTags`, `slotValues`,
`driveImageId`, `ajustes`) — o cold start é bem mais rico do que o plano
original supunha. O que falta é capturar a *escolha* (candidatos rejeitados),
contar uso de modelo e computar o diff de copy.

### F0 — Fundações (pré-requisitos que a revisão elevou; antes de tudo)

**F0.1 Vigência de campanha.** A infra já existe e está dormindo:
`KnowledgeBaseEntry.expiresAt` com índices (`prisma/schema.prisma:719,729-730`)
e cron diário `archive-expired-knowledge` agendado. O trabalho é ligar as duas
pontas:

- **Escrita**: expor `validade` em `criar-entrada-base`/`atualizar-entrada-base`
  (`src/lib/mcp/tools.ts:1856/1931`), `POST/PATCH /api/knowledge` e admin.
  Categoria CAMPANHAS sem validade gera aviso na resposta da tool.
- **Leitura**: filtro `expiresAt` nas 4 queries que hoje só olham ACTIVE —
  `consultar-base` (tools.ts:484-492), `sugerir-posts.ts:165-168` (sugeriria o
  festival encerrado como tema), `arte-rapida.ts:345-350`, MCP local
  `get-knowledge`. Padrão já existe em `search.ts:182` (~4 linhas por ponto).
- **Contra a DATA DO SLOT, não contra "agora"**: o planejamento mira data
  futura — campanha vigente hoje que vence antes do slot não entra na copy
  daquele slot.
- **Vínculo**: rascunho nascido de campanha grava `campaignId` (id da entrada
  da base). `aprovar-rascunhos`/`ver-agenda` avisam quando
  `scheduledDatetime > expiresAt` da campanha — aviso, nunca veto.
- **`virar-regra` ganha triagem**: regra com prazo NÃO vai para o DNA (que é
  eterno e incondicional) — vira entrada CAMPANHAS com validade. Identidade
  permanente segue indo para o DNA.
- Fotos e referências de estilo de campanha: a entrada CAMPANHAS lista as
  pastas/tags do Drive associadas (em `metadata`, sem migration); o rodízio de
  sugestão automática pula material de campanha vencida (o `nulls: first` hoje
  FAVORECE a foto nova da campanha morta). Busca manual continua achando tudo.

**F0.2 Escopo de aprendizado (o "modo aprendizado" do Ciro, corrigido).**
Toggle global falha nos dois sentidos (esquecido desligado perde sinal —
irreversível; esquecido ligado contamina) e uma leva normal mistura os três
tipos. Semântica correta: **capturar sempre, marcar por item, filtrar na
agregação**:

- Migration única em `SocialPost`: `learningScope` (`ROTINA` default |
  `CAMPANHA` | `PONTUAL`) + `campaignId?` + `origem` (sugerido-aceito |
  sugerido-editado | escolha-própria) + `sugestaoId?` + `decididoPor?`
  (User.id INTERNO — atenção à armadilha Project.userId ≠ clerkId), com
  índices. Escrita à mão + branch dev + `db:deploy`.
- UI: chip discreto rotina/campanha/pontual no compositor (default ROTINA;
  pré-marca CAMPANHA quando o item nasce de campanha ativa). O toggle que o
  Ciro imaginou vira **default de sessão/leva** que pré-marca o chip — nunca
  kill-switch da captura.
- MCP: parâmetros opcionais `escopo` e `campanhaId` em `colocar-na-agenda` e
  nos itens do plano semanal, mesma coluna via mesmo serviço.
- Consumidores: `sugerirPosts` exclui PONTUAL do histórico; classificador e
  agregação idem; CAMPANHA alimenta sub-perfil da campanha (vale para o
  próximo festival, não para a rotina).

**F0.3 Fila durável de geração (B1 promovido a pré-requisito).** Executar uma
leva de 5–7 artes colide com o `maxDuration = 300` da rota MCP (uma arte chega
a ~290s no pior caso; os `after()` da mesma invocação dividem o teto). Desenho
único aceito: **registro pendente no banco + varredura por cron** (padrão
`render-stories`), com portões de tentativa nas queries do chamador (regra da
casa do `renderPostArt`) e recovery de Generation PROCESSING órfã (>10 min sem
update → reencaminha ou falha com motivo). O retry por divergência de texto
vira item da mesma fila. A opção "after() encadeado" foi RISCADA — after()
morre com a invocação, que é exatamente o cenário de falha.

**F0.4 Curadoria do acervo de modelos (pedido do Ciro, 10/08).** Muitos
templates não são mais usados e não devem entrar na sugestão. Regra:
**despromover, nunca excluir** — página é referenciada por posts e gerações
antigas (mesma classe de risco da foto excluída que matou 38 páginas em
julho). Fluxo: script de inventário de uso por página-modelo
(`Generation.fieldValues->>'sourcePageId'` + `AICreativeGeneration.layoutType`
+ join com `SocialPost`; contagem e último uso, por projeto) → relatório para
o Ciro aprovar → `isTemplate: false` nos aprovados. O histórico dos
despromovidos CONTINUA alimentando a destilação (uso passado é fato); eles só
saem do pool de candidatos de `prepareCreative`/`sugerirPosts`/
`listar-modelos`. Roda em paralelo com F0.1–F0.3, não bloqueia.

### F1 — Captura no serviço (as duas vias, todas as superfícies)

A captura vive **no servidor, onde a sugestão nasce e onde a decisão passa** —
nunca só na UI. Motivos verificados: a fila da bancada é localStorage (descarte
é delete local, invisível), o chat escreve copy na conversa (só o resultado
chega ao servidor), e o MCP local (`scripts/mcp-server.ts`) reimplementa
handlers fora de `src/lib` — instrumentar só o dispatcher remoto perderia a
skill `create-template-pages`, que é via das mais usadas.

- **Tabela de sugestões/sinais**: toda sugestão emitida (slot do
  `sugerirPosts`, dica de copy/foto futura, modelo proposto) persiste com id
  próprio no momento da emissão; o commit (`agendarPost`, `colocar-na-agenda`,
  POST arte-ia) aceita `sugestaoId` e o desfecho é computado server-side. O
  esquema aceita **decisão sem sugestão** (escolha absoluta) — senão as
  semanas 1–2, antes da dica existir, não geram corpus.
- **Via TEMPLATE — pontos de captura mapeados** (recon com arquivo:linha):
  1. `prepareCreative` (`arte-rapida.ts:361`) — gravar
     `{theme, day, candidateIds[], chosenId}`: hoje a escolha é
     `candidates[0]` cega e as alternativas rejeitadas morrem na resposta. É o
     impression log da preferência de modelo.
  2. `Page.usedCount` + `lastUsedAt` (migration junto com F0.2), incrementados
     em `createArteRapida` e `create-from-template` — precedente idêntico:
     `styleRefAt/styleRefUsedAt`. Hoje NÃO existe contador de uso de modelo em
     lugar nenhum.
  3. Espelho colunar `Generation.sourcePageId` (fieldValues é Json sem índice
     — minerar hoje exige varredura).
  4. `ajustar-arte` já grava `fieldValues.ajustes` — "onde a IA erra por
     cliente" está pronto, só falta consultar.
  5. PageSync PATCH (`pages/[pageId]/route.ts:144-151`): o detector
     `layersChanged` já existe (hoje só invalida render) — vira também evento
     de edição manual com diff textual.
  6. `agendarPost` (`agendar.ts:201`): passa a gravar `slotValues` (hoje
     omite), `sourcePageId`, dia/hora/situação e o **diff copy sugerida ×
     final** — os dois extratores já existem (`textosDaPagina`,
     `extractExpectedTexts`).
  7. `processarAprovacao` (`agenda-acoes.ts:57`): o rótulo positivo mais
     limpo do sistema.
- **⚠️ Armadilha do diff**: `Page.layers` tem codificação inconsistente (array
  nativo, string, às vezes dupla-codificada). `parseLayers` de arte-rapida
  decodifica UM nível e devolve `[]` **em silêncio** na dupla — diff falsamente
  vazio = "usuário não editou nada". Todo leitor usa `normalizeLayersString`
  (`invalidate-renders.ts:113-126`), a única implementação correta.
- **Consertos de registro no caminho**: `finalize` grava Generation sem
  `source`; existem TRÊS implementações do bake de template (arte-rapida,
  create-from-template, page-to-design-data) — consolidar ou instrumentar as
  três, decidir na implementação; UI grava em `AICreativeGeneration` e
  chat/MCP em `Generation` (dois livros-caixa — unificar a consulta).
- **Bancada IA**: descarte/edição de item viram eventos server-side
  (fire-and-forget do store) até a entidade de plano da F3 chegar — e viram
  transições dela depois.

### F2 — Destilação

- **Taxonomia FECHADA por projeto**: um passe de LLM propõe 5–8 pilares a
  partir do histórico do próprio cliente; o Ciro aprova a lista (aba Marca);
  o classificador é constrangido ao enum + "outro" (baixa confiança → "outro",
  nunca o rótulo mais provável). Validação por cliente (5+ posts em cada um
  dos 10), não 30 globais. Sem isso o dedup de tema da semana não funciona
  ("happy hour" ≠ "drinks").
- **Detecção de burst → campanha candidata**: aglomerado de tema igual em
  janela limitada acima da linha de base vira candidata que o Ciro confirma
  com um clique — a confirmação grava `campaignId` retroativo. Inventário de
  campanhas passadas de graça e descontamina a cadência inicial.
- **Consertos no `sugerirPosts`** (F2 mexe no arquivo de todo jeito):
  peso por recência (meia-vida ~21 dias) na contagem de slots; histórico conta
  **só POSTED** (SCHEDULED fica apenas na checagem de slot ocupado, que já é
  separada); excluir `learningScope: PONTUAL` e campanha encerrada;
  `postsPorSemana` sobre semanas com atividade, não 8 fixas; o motivo textual
  distingue rotina de pico recente. Validação barata: rodar contra o banco
  real do Wine Vix antes/depois e conferir que os slots do festival caem.
- **Mineração do histórico de templates** (sem instrumentação — dá o cold
  start): modelo mais usado por tema e por dia
  (`fieldValues->>'sourcePageId'` + join com SocialPost;
  `AICreativeGeneration.layoutType LIKE 'template:%'` para a via UI), foto por
  tema, slots que a IA mais erra (`ajustes`), taxa de aprovação por modelo.
  Furo conhecido: 193 posts com pageId sem generationId
  (`backfill-post-generation-id.ts` existe).
- **Diff de copy com CAUSA** antes de agregar: fato (preço/horário errado →
  alerta "base desatualizada", NÃO entra no perfil), estilo (entra), pontual
  (descarta). **Blindagem dura**: o perfil aprendido é proibido por construção
  de guardar preço/horário/promoção (strip na escrita + injetor nunca lê esses
  tipos) — senão vira fonte clandestina do que só pode vir da base.
- **Auto-reforço com desconto**: post nascido de sugestão aceita sem edição
  vale menos (ex. 0,3) na agregação de cadência — confirma slot existente,
  nunca cria slot típico novo. Escolha própria e sugestão editada valem cheio.
  Sem isso o perfil converge para si mesmo.

### F3 — Plano semanal: chat e bancada na MESMA fila

A fila que o Ciro pediu não existe para o MCP: a da bancada é localStorage
(`bancada-store.ts:104`), nenhuma rota escreve nela. Entra a entidade
server-side:

- **Models `PlanoDeConteudo` + `ItemDePlano`** (quando, tema, copy proposta,
  foto, formato, VIA, motivo do slot, escopo/campanha, status: proposto |
  editado | aprovado | reprovado | na-fila | gerando | pronto | agendado,
  generationId?, postId?). Serviço em `src/lib/planos/`; rotas
  `/api/projects/[id]/planos`; a bancada web hidrata do servidor e o
  localStorage vira cache — chat e bancada enxergam a mesma leva.
- **Cada item carrega a VIA**: `template` (padrão — custo de API zero; usa o
  modelo preferido aprendido + copy nos slots + foto do acervo) ou `ia`
  (quando o Ciro pedir ou nenhum modelo servir). A escolha de via que o
  usuário faz também é sinal aprendido.
- **Tools MCP** (embrulhando o mesmo serviço): `propor-semana` (monta e
  PERSISTE o plano — custo zero por contrato, nunca dispara geração),
  `ver-plano` (itens + status + capas + progresso agregado: "3 prontas, 2
  gerando, 1 falhou: motivo"), `editar-item-do-plano` (item ainda não
  gerado), `executar-plano`, `trocar-arte-do-post` (SÓ rascunho; aceita
  generationId/pageId; regras do agendarPost: NOT_NEEDED/RENDERED certos,
  nunca reduzir mediaUrls), `regenerar-item` (reprovação com motivo — vira
  transição registrada E sinal, não beco).
- **Gate de crédito mecânico** (padrão `postar-agora`): `executar-plano`
  responde primeiro com o custo ("7 artes ≈ N créditos, saldo M") e exige
  `confirmar: true` numa SEGUNDA chamada, com a descrição proibindo
  auto-confirmação; aceita subconjunto (`itemIds`). Itens de via template não
  gastam crédito de imagem — o resumo mostra a conta separada.
- **Execução pela fila durável de F0.3** — nunca N `after()` numa invocação.
- **Dica de copy**: tema do slot + base (com vigência vs data do slot) + DNA +
  crivo + referência de estilo + perfil aprendido; sugere foto junto (rodízio,
  pulando material de campanha vencida). Fallback de cold start: cliente sem
  slot típico recebe grade-semente rotulada honestamente ("ponto de partida —
  ainda não conheço a rotina deste cliente"), nunca silêncio nem motivo que
  soa estatístico.

### F4 — Autonomia crescente (depois das 3 semanas)

- **KPI corrigido**: denominador = todas as sugestões emitidas; o desfecho só
  fecha após janela que vai até a publicação (edições via `editar-post`/
  `ajustar-arte`/agenda contam — hoje seriam invisíveis e inflariam o número);
  calculado sobre itens ROTINA. Contrapeso de qualidade que já é coletado de
  graça: insights de story por origem (sugerido × próprio). Autonomia sobe
  quando aceitação E desempenho seguram — nunca aceitação sozinha, que premia
  sugestão insossa.
- Contrato intacto em TODA fase: sugestão nunca agenda nem gasta crédito
  sozinha; a autonomia cresce na qualidade da proposta.

### Validação da Frente A

Protocolo padrão: e2e com projeto real (By Rock, `publishType: REMINDER`,
+7 dias, cleanup), navegador na bancada, typecheck + lint. Classificador:
amostra rotulada à mão POR CLIENTE. Migrations: à mão + branch dev +
`db:deploy`.

---

## Frente B — Confiabilidade da geração

1. ~~Retry em outra invocação~~ — **promovido a F0.3** (fila durável).
2. **`logoMode: 'compor'` no Espeto** — o modelo acerta a forma da marca e
   erra a cor (6 peças). Trocar e validar com 1 geração real.
3. **Validar o carrossel com o olho** — nenhum slide irmão foi gerado desde a
   consistência estrita (`963bcef`); gerar série real de 4 e conferir o
   elemento gráfico; se variar, o LOOK SPINE ganha o item que falta.

---

## Frente C — Casa arrumada

1. **Cabeçalho duplicado** na home do projeto + seta de voltar redundante.
2. **Galeria global `/criativos`** duplicada e defasada — unificar sobre o
   componente da aba do projeto.
3. **Higiene do repositório** — com uma ordem obrigatória: ANTES do apagão,
   lista nominal — manifests de operação em produção
   (`.tmp-troca-fotos-manifest-*` é o ROLLBACK da troca de fotos de 02/08,
   `.tmp-lh3-fix-manifest-*`, `.bacana-manifest-*`) vão para pasta versionada
   (ex. `docs/manifests/`); SÓ ENTÃO o glob `.tmp-*` entra no `.gitignore` e o
   resto é apagado. Critério: arquivo que descreve mudança aplicada em dados
   de produção é registro, não temporário. Limpar também os ~8 worktrees
   velhos de `.claude/worktrees/`.
4. **Rotas legado** `brand-style`/`design-system`/`art-templates`: prazo de 2+
   semanas sem warn venceu — conferir logs de produção e, se limpos, remover.

---

## Frente D — Desligamento do Claudinho (preparação; decisão do Ciro)

Medir o critério de pronto de
[DESLIGAMENTO-CLAUDINHO.md](DESLIGAMENTO-CLAUDINHO.md) e reportar:
`brandManualUrl` nos 10 + crivo na bancada (verificar, não re-rodar);
varredura de `SocialPost.mediaUrls` com host Supabase; fontes `.ttf` ×
`CustomFont` por cliente; destino da referência de escala do TERO; contas
Zernio placeholder (4 projetos); fila do Postiz (vazia ⇒ cancelar assinatura).
As 3 semanas de bancada da Frente A são o critério "produção só no Studio" —
as frentes convergem.

---

## Backlog assumido (fora desta rodada)

Âncora bottom das pilhas de combinação; camada de vídeo no render + kerning
~1px; cardápio web e agente de WhatsApp do insta-automatico (decisão à parte).

---

## Ordem proposta

1. **F0 inteira** (vigência + escopo/colunas + fila durável) — é pequena em
   código e destrava tudo; sem F0, a F1 grava sinal contaminado e sem escopo,
   que não se separa depois.
2. **F1** na sequência imediata — a captura precisa estar no ar antes de a
   bancada virar rotina; cada semana sem captura é aprendizado perdido.
3. **F2** enquanto os sinais acumulam (a mineração do histórico de templates
   já dá cadência, temas e preferência de modelo na primeira semana).
4. **C** em paralelo, como aquecimento.
5. **F3** nas semanas 2–3; **B2/B3** entre as fases.
6. **D** quando o Ciro quiser o retrato; **F4** depois das 3 semanas, guiada
   pelo KPI corrigido.
