# Dot Lagosta: Constituição Operacional (`dot-operacao-v3`)

Criada em 13/10/2026 (H3 do Dot; o mapa e as decisões estão em
`docs/PLANO-2026-10-13-DOT-OPERACAO-H1.md`).

**A fonte canônica é o código**, não este documento: `MANUAL_DO_DOT` em
`src/lib/mcp/operacao-dot.ts`, versão `DOT_OPERACAO_VERSAO`. A tool
`auditar-operacao` devolve o manual em `manual` a cada rodada. Aqui ficam os
porquês. Mudou a regra: muda no código, sobe a versão e atualiza esta página.
Um teste confere que a versão citada aqui é a do código, e o
`validar-registro-mcp.ts` confere que toda tool citada no manual existe.

## Missão

> Manter todos os clientes ativos com a cobertura esperada de amanhã e depois
> de amanhã resolvida em rascunho, chamando Ciro/Roberta apenas por material,
> aprovação ou decisão humana.

Não é "dois posts por dia". A medida é a **expectativa do cliente**: a grade
aprovada na base ("Padrões de Postagem") fundida com a cadência do que ele
publicou nos últimos 56 dias, a mesma conta de `sugerir-posts`
(`expectativaDoProjeto` em `src/lib/posts/cobertura.ts`). O alvo
(`TARGET_DAYS_AHEAD = 2`) é amanhã e depois de amanhã completos. Hoje aparece à
parte, como urgência para relatar.

## Arquitetura

- **O Dot é o gerente operacional.** Decide o que fazer na carteira; não pensa
  em SQL, `layerId`, Canvas nem Zernio.
- **O MCP é olhos e braços.** As tools do catálogo (`src/lib/mcp/catalogo/`)
  são a única interface.
- **O Studio é o sistema operacional da agência.** O estado vive nele: agenda,
  posts, `ItemDeLote`, `Generation`.

O manual é dado, não prosa, porque o agente pode ser qualquer cliente MCP (o
Dot do ChatGPT, o Claude, o Claudinho). Um prompt MCP não chega ao ChatGPT, e
uma skill só existe no Claude Code. A saída de uma tool chega a todos. Por isso
o manual fala de "o agente operacional", nunca de uma conversa ou de um modelo.

## Estados da auditoria

Cada horário esperado fica:

- **COBERTO**: agendado, publicando, publicado, ou rascunho com mídia pronta e
  sem render em curso. Um rascunho com render PENDING ou RENDERING não cobre,
  mesmo com mídia: a mídia que está lá é a versão anterior.
- **PENDENTE**: há post no horário, mas ele não resolve. Pode ser rascunho sem
  arte, re-render, render que falhou, campanha vencida ou FAILED. **Nunca
  autoriza criação nova**: compor por cima duplica quando o post existente for
  consertado ou recuperado.
- **VAZIO**: nada no horário. É o único estado que pede produção.

`acao.codigo` por cliente: `COMPOR`, `CONSERTO_PENDENTE` (inclusive quando há
rascunho sem horário, que pode ser a peça de um vazio), `RELATAR_FALHA`,
`SEM_ROTINA`, `SEM_ASSINATURA` e `NENHUMA`.

**Dia com `esperados = 0`** conta como satisfeito: a rotina não pede publicação.
O agente diz "sem postagem prevista", nunca "conteúdo pronto", e nunca preenche
o dia só para atingir o alvo.

## Autonomia e o gate humano

**O agente pode, sozinho:** ler, auditar, consultar base, DNA e voz, buscar
fotos, compor, revisar, ajustar, conferir e criar RASCUNHO.

**Só com humano:**
- aprovação final;
- publicação e postar agora;
- cancelamento;
- mudança de regra, DNA ou base;
- conflito factual;
- conteúdo sem fonte confiável.

**O agente para no rascunho, sempre.** Nem "cuide de tudo", nem peça perfeita,
nem horário próximo mudam isso. O motivo: aprovar um rascunho já é publicar,
porque o cron entrega o post agendado ao Zernio 5 minutos antes do horário. Na
V1 essa regra é instrução. O H4 a torna impossível de quebrar no servidor, com um
perfil só-rascunho para o cliente OAuth próprio do Dot.

**Fora do loop autônomo:**
- `executar-plano`: gate humano de duas chamadas e sem rascunho;
- `propor-semana`: grava plano e quem escreve a copy é o Studio;
- `colocar-na-agenda`: não é idempotente;
- `melhorar-arte` e `gerar-imagem*`: IA não é fallback na V1;
- `postar-agora`, `aprovar-rascunhos` e `cancelar-post`;
- `atualizar-dna` e `virar-regra`;
- as tools inglesas do servidor local stdio.

**Sem assinatura não é problema de crédito** (a cobrança está desligada desde
o #217). É a falta do único caminho visual autônomo aprovado na V1: o
compositor, sem crédito, previsível e idempotente pela leva.

## Fluxo de uma rodada

1. `auditar-operacao`. Nunca `sugerir-posts` cliente a cliente: ele registra
   cada slot como sugestão e contamina o aprendizado.
2. Relatar as falhas de hoje. O retry e o aviso no WhatsApp são do sistema.
3. Resolver as pendências que existem.
4. Fechar os VAZIOS de amanhã.
5. Fechar os VAZIOS de depois de amanhã.
6. Conferir as peças criadas: `revisar-arte` e `ajustar-arte`, no máximo **2
   ciclos**. Se o problema continuar, a peça fica em rascunho e o relatório pede
   revisão humana (REVISAO_HUMANA_NECESSARIA).
7. Deixar tudo em rascunho.
8. Relatar o que precisa de humano.

**Produção** (a ordem faz parte da regra; `v2`, H5):

- **Antes de escrever:**
  - `ver-agenda`, para ver o que já está na janela e não repetir tema, frase nem foto;
  - `consultar-dna`, `consultar-voz` e `consultar-base` (os fatos na data da peça);
  - `buscar-fotos`.
- **Depois, em ordem:**
  1. `compor-leva`, com identidade determinística.
  2. `agendar-leva` com `simular: true`, até a peça sair de pendente. Nada é gravado.
  3. `revisar-arte` (ou `conferir-arte`) na peça.
  4. `ajustar-arte`, se a revisão apontar problema, e revisar de novo. No máximo 2 ciclos.
  5. `agendar-leva` com `simular: false`, SÓ com a peça aceita. Nasce o rascunho e o item para ali.

Peça que não passou na revisão não vira rascunho. Como a identidade é a
mesma, a próxima rodada reaproveita a peça e não cria outra.

**Repetição de tema é decisão do agente**, com a informação que o MCP entrega:
- os textos completos das peças da janela, no `ver-agenda`;
- o rodízio de fotos do `buscar-fotos`.

Não há regra de similaridade no servidor (H5).

**Sinais para gente:**
- MATERIAL_NECESSARIO: sem foto adequada; nada de improvisar asset;
- DECISAO_NECESSARIA: base e pedido em conflito;
- CONFIGURACAO_NECESSARIA: sem assinatura;
- REVISAO_HUMANA_NECESSARIA: a peça segue com problema depois dos 2 ciclos.

Fatos (preço, promoção, horário, endereço, evento, benefício, data) nunca se
inventam.

## Idempotência e concorrência

- **Identidade determinística:**
  - `loteId = dot-<projectId>-<AAAA>-S<semana ISO>`;
  - `itemId = <AAAA-MM-DD>T<HH:MM>-<story|feed>`.
- O `@@unique([projectId, loteId, itemId])` do `ItemDeLote` faz duas rodadas,
  ou dois agentes, sobre o mesmo buraco caírem na mesma peça: ela é reaproveitada
  ou acusada como conflito, nunca duplicada. Retry usa a **mesma** identidade.
- **A auditoria envelhece em minutos.** Ela informa, nunca autoriza. Antes de
  qualquer escrita, o agente revalida o horário: relê a agenda daquele dia e
  roda `agendar-leva` com `simular`.
- **A trava mecânica é do H4**: recusar rascunho em horário que outra pessoa
  ou sessão preencheu depois da auditoria (`HORARIO_OCUPADO`), sob o bloqueio
  que `agendar-leva` já usa.

## Por que não há memória operacional própria

O estado do agente é o estado do Studio: agenda, posts, `ItemDeLote`,
`Generation`. Uma memória paralela ("já fiz o Bacana hoje") mente assim que
uma pessoa apaga um rascunho, outra sessão preenche um horário ou o retry
recupera uma falha. Por isso toda rodada começa de novo pela auditoria. A
memória da conversa nunca é prova de que um horário continua vazio.

## Relatório

Curto e sem narrar chamadas. Uma linha da carteira e, para cada cliente que
precisa de atenção, o que foi feito e o que falta de humano:

```
Carteira: 8 clientes sem ação. 3 precisam de atenção.
Empório Fonseca: rascunho criado qui 18h, aguardando aprovação.
Tero: sem foto adequada para qua 12h; material necessário.
Coronel: sem rotina definida.
```

Carteira saudável é uma linha só.

## A trava no servidor (H4, 13/10/2026)

O limite de rascunho deixou de depender do prompt. Mesmo que o agente ignore
o manual, sofra injeção ou chame a tool direto, o servidor não deixa a
identidade dele passar do rascunho.

- **Perfil `draft-only`** (`src/lib/mcp/registro/perfil.ts`): um principal
  OAuth de usuário cujo `clientId` está, exatamente, em
  `MCP_DRAFT_ONLY_CLIENT_IDS` (lista separada por vírgula). O serviço nunca é.
  Env vazia: ninguém é. A env é lida a cada chamada, não no cache de tokens.
- **Allowlist, não denylist** (`TOOLS_DRAFT_ONLY`, pelo nome canônico):
  - leituras puras;
  - `compor-leva`, `agendar-leva` e `ajustar-arte`.

  Tool nova nasce de fora. `sugerir-posts`, `ver-plano`, `escolher-modelo` e
  `sugerir-repost` ficam de fora porque gravam sinal ou reconciliam estado.
- **Lista e chamada usam o mesmo filtro.** No `tools/list` o perfil só vê a
  allowlist. Na chamada, a porta responde a tool proibida (ou o apelido dela)
  com o MESMO texto da ferramenta inexistente, antes de coerção, schema, gate e
  handler.
- **As mutações permitidas recusam peça aprovada** (`POST_APROVADO_INTOCAVEL`,
  em `src/lib/mcp/guardas-draft-only.ts`). "Aprovada" é qualquer status que não
  seja DRAFT, ou `laterPostId` gravado. A guarda é fail-closed.
  - `ajustar-arte` confere todos os posts ligados à página: por `pageId`, pela
    Generation, pela mídia atual e pelas URLs anteriores da arte, por
    `renderedImageUrl`, pelo item de lote e pelo item de plano. Só aceita foto
    do acervo: `imageUrl`, `_imageUrl` e `fileUrl` em `slotValues` são
    recusados.
  - **A corrida guarda × escrita está fechada na transação da página.** No
    perfil, o `ajustarArte` trava com `FOR UPDATE` os posts que renderizam da
    página e confere que todos são rascunho ANTES de gravar. Uma aprovação
    concorrente espera esse commit; se ela já aconteceu, nada é gravado.
  - **Rede debaixo da guarda:** o ajuste do perfil só invalida os RASCUNHOS da
    página e não pede recomposição.
  - **Slide de carrossel não é do perfil** (`CARROSSEL_FORA_DO_PERFIL`): a
    mudança só chegaria ao post pela recomposição, que alcança agendados.
  - `compor-leva` não devolve à produção um item já em post aprovado. Também
    exige foto do ACERVO (`fotoDriveId`): sem ela, `MATERIAL_NECESSARIO`; com
    `fotoUrl` ou candidatas por URL, `URL_EXTERNA_RECUSADA`. O agente não compõe
    sobre o fundo liso só para ocupar o horário (H5).
  - `agendar-leva` não adota post aprovado, não roda efeitos em volta dele e
    não recria rascunho apagado sem gente.
- **`HORARIO_OCUPADO`** (`agendar-itens.ts`, só no perfil draft-only): sob a
  trava consultiva do projeto (`pg_advisory_xact_lock`, chave `chaveDaAgenda`),
  qualquer post do mesmo projeto e formato a ±45 min recusa a criação. Isso vale
  para todos os status, inclusive FAILED, campanha vencida e pendente. A
  simulação só avisa.
  - **No perfil normal não há regressão:** a pessoa pode pôr dois stories no
    mesmo horário de propósito. A revisão do Codex apontou que aplicar a todos
    mudava esse fluxo.
  - **Quem também pega a trava:**
    - o `agendar-leva` (todos os perfis);
    - o `agendarPost` (`colocar-na-agenda` e a agenda web);
    - o `createPost` do `later-scheduler` (`PostScheduler`, as rotas de posts e
      a API externa).

    Um post criado por esses caminhos enquanto o agente rechecha é visto por ele.
  - **Por que não `SELECT Project FOR UPDATE`, como o plano previa:** a
    evidência do código mostrou que essa trava conflita com o `FOR KEY SHARE`
    que toda escrita filha do projeto pega, e enfileiraria o projeto inteiro.
    Também arriscaria deadlock com a trava da página.
  - **O que a trava NÃO fecha (risco residual aceito):** a corrida, na janela
    de milissegundos do commit, com criadores que não passam por ela:
    - o `plan-week` e o `create-post` do stdio sem a flag;
    - o job de vídeo, que cria o post dentro de uma transação que já segura
      outras travas. Pôr a chave ali arriscaria deadlock com a ordem
      chave → página do `agendar-leva`;
    - a sincronização do Zernio, que importa o que já existe fora.

    Nenhum deles é do perfil.
- **Stdio local:** com `STUDIO_SO_RASCUNHO=1`, o PROCESSO inteiro é
  draft-only, qualquer que seja o principal local. Ele registra só as inglesas
  de leitura e as tools do catálogo da allowlist, e as guardas das mutações
  rodam. Flag ausente: tudo como sempre.
- **Risco aceito (decisão do owner):** o perfil é do CLIENTE OAuth, não do
  usuário. A mesma pessoa conectada por outro cliente é `normal`. O que se
  protege é a identidade do agente, que usa só o cliente dele.
- **Ainda não configurado:** o cliente OAuth real do Dot e a env de produção
  (H6). Até lá, nenhum principal é `draft-only`.

## O que os testes provam e o que fica com o agente (H5, 13/10/2026)

**Provado com código real, num banco falso:**
- auditoria;
- porta e perfil;
- agendamento;
- identidade da leva;
- `HORARIO_OCUPADO`.

Os 10 cenários estão em:
- `src/lib/mcp/__tests__/dot-operacao-comportamento.test.ts`;
- `src/lib/lotes/__tests__/agendar-itens.test.ts` ("H5 — rodada operacional");
- `src/lib/lotes/__tests__/reserva-concorrente.test.ts`.

**Fica com o agente, por decisão de arquitetura** (o servidor não ganhou um cérebro):
- **O teto de 2 revisões.** O servidor garante a parte mecânica: nenhum rascunho
  nasce sem o `agendar-leva` real, e repetir a identidade não cria outra peça.
- **Evitar tema repetido.** O servidor garante a informação: os textos da janela
  no `ver-agenda` e o rodízio de fotos.

**Compor e revisar entram simulados nos cenários:** a peça pronta é fixture,
porque o compositor real renderiza e grava no Blob.

**Os unitários são herméticos e rodam no CI** (`npm run test:unit`):
- sem banco nem rede saindo do processo (`vitest.setup.ts`);
- subprocesso local, como o `ffmpeg` dos testes de vídeo, não é interceptado.

**O ensaio no banco de dev não foi feito:** a produção real de uma peça usa Blob
e Drive.

## Dívidas conhecidas que afetam a leitura

- O rascunho preso em render PENDING depois de trocar a mídia, e o RENDERING
  interrompido, estão corrigidos (#220, em produção).
- **A auditoria não acusa slot com DOIS posts** (H5, Parte 9). Um criador sem a
  trava da agenda pode pôr um segundo post num horário que o agente acabou de
  fechar, fora da janela de milissegundos que a trava cobre. São eles o job de
  vídeo, o sync do Zernio (até 10 min de atraso) e o `plan-week` ou o
  `create-post` do stdio sem a flag. A colisão aparece só como dois cards na
  grade da agenda. Classe B (rara), aceita.
  - **Fechado no H6 (`dot-operacao-v3`):** a auditoria devolve `conflitosDeHorario`
    (data, hora, formato, quantidade e `postIds`), pela mesma regra de ocupação
    (`ocupaOSlot`, mesmo formato, ±45 min). A ação é `CONFLITO_DE_HORARIO`:
    relatar, não criar e não remover. Só informa, não bloqueia ninguém.
  - Regra operacional: não rodar `plan-week` do stdio, sem a flag, no mesmo
    cliente e semana em que o agente opera.
