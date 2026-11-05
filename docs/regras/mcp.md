# Conector MCP

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### Curadoria no conector MCP: ver ≠ mandar (16/08/2026)

`assertProjetoPermitido` responde "esta conta enxerga o cliente?" — e era o
único gate de toda tool, inclusive das que fazem CURADORIA. Promover página a
modelo pelo conector bastava enxergar; pela web, exige curador desde sempre
(`/modelos`, `.../tags`) e agora também no editor.

- **`assertCuradorDoProjeto` compõe, não substitui**: chama o gate de acesso
  primeiro e só então checa curadoria. Os dois 403 são distintos de propósito
  (`PROJETO_SEM_ACESSO` × `PROJETO_SEM_CURADORIA`) — a causa e a saída são
  diferentes, e a mensagem diz QUAL conta está conectada, pela mesma razão de
  12/08: a identidade do portador é invisível de dentro da conversa.
- 🔴 **No MCP não existe "organização ativa".** O token OAuth traz só o
  `userId`, então `hasProjectOwnership` (que decide pelo `orgId` da SESSÃO) não
  tem tradução direta. A regra aqui é ser admin de ALGUMA org com que o projeto
  é compartilhado — o mesmo critério que `projetosVisiveis` já usa para
  enxergar. Não tente reusar o helper da web achando que é equivalente.
- **O papel vem do Clerk, não do banco.** `orgsDoUsuario` devolvia só os ids;
  virou `participacoesDoUsuario`, com `role` por organização (mesmo cache de
  60s). `orgsDoUsuario` continua existindo como projeção, para
  `projetosVisiveis` não mudar.
- **Clerk fora do ar degrada para MENOS poder, nunca para mais**: sem
  participações sobra o dono no banco, e o ramo `ownerClerkId` continua no OR
  justamente para isso.
- **O segredo de serviço (Claudinho) passa** — mesma decisão que faz
  `projetosVisiveis` devolver `null` para ele: já opera em nome do dono.
- 🔴 **O caso que prova a mudança é o MEMBRO COMUM**, e só ele: dono, estranho
  e admin já eram decididos pelo gate ANTIGO, então um teste com esses três
  passa sem exercitar nada. Como forjar papel no Clerk não é possível,
  `ehCuradorDoProjeto(projectId, clerkUserId, participacoes)` é exportada e
  recebe as participações por PARÂMETRO — é o que torna a matriz (dono / admin
  / membro / papel custom "co-admin" / admin de outra org / Clerk mudo)
  verificável contra o banco real.
- Só `marcar-como-modelo` escreve `isTemplate` no conector remoto; as demais
  ocorrências são leitura e filtro. Tool nova que faça curadoria (promover,
  taguear modelo) usa `assertCuradorDoProjeto`, não `assertProjetoPermitido`.

### O conector MCP: apelido, filtro por nome e parâmetro recusado (12/08/2026)

Cinco arestas do conector remoto, levantadas na produção real das peças do By
Rock e consertadas juntas.

- 🔴 **`finalPrompt` entrou no hash de dedupe.** Faltava, e o buraco era
  exatamente o formato de uma sessão de direção: mesmo `pedido`, mesmas
  referências, `promptPronto` reescrito, dentro dos 10 minutos → colidia e
  devolvia a peça anterior, que é a que acabou de ser recusada. O hash hoje tem
  `p, c, f, t, r, cg, so, q, fp`.
- **`ver-melhoria` virou `ver-geracao`**, com o nome antigo em `APELIDOS` e
  `melhoriaId` ainda aceito ao lado de `geracaoId`. O nome mentia: `gerar-imagem`
  mandava acompanhar por uma tool cuja descrição dizia servir só para melhorias,
  e quem gerava arte nova ia procurar uma que não existe. **Apelido em
  `APELIDOS` NÃO aparece em `tools/list`** — quem só cria o apelido e mantém o
  nome antigo na lista não resolve nada, porque o modelo escolhe pela lista.
- 🔴 **Parâmetro desconhecido é RECUSADO, não descartado** (`parametrosDesconhecidos`
  em `runMcpTool`). Todo `inputSchema` já declarava `additionalProperties: false`
  e nada enforçava: chamar a listagem do acervo com um filtro inexistente
  devolvia o acervo inteiro misturado, **com cara de resultado válido**. O erro
  cita a chave e lista as aceitas. A guarda respeita a declaração — tool que
  queira aceitar extras é só não fechar a porta.
- **`buscar-fotos` ganhou `fileName`** (exato ou prefixo) e
  **`listar-fotos-da-pasta` ganhou `folder`** — o serviço
  (`listarImagensDoDrive`) já aceitava pasta por nome desde sempre; só a tool
  não expunha. Quem já sabe qual foto quer não tinha como pedi-la.
- ⚠️ **O MCP LOCAL (`scripts/mcp-server.ts`) segue descartando em silêncio**:
  ele usa `server.tool(nome, desc, shapeZod, handler)` e o SDK monta
  `z.object(shape)`, que STRIPA chave desconhecida antes do handler — não há
  onde interceptar sem trocar a forma de registro. A guarda acima vale só para
  o conector remoto.

### Fechamento do plano do MCP: prompt, lote, duplicata (12/08/2026)

Os oito itens que faltavam das seções A e B. Regras que valem para código novo:

- **O teto do `promptPronto` é AVISO, não bloqueio — e agora é 4000.** Era 1500
  e nunca bloqueou nada (`validateImagePrompt` só devolve `issues`, o runner só
  loga). Produzia o pior dos dois: quem LIA a descrição se limitava e cortava as
  proibições — que são o que segura o DNA —, quem ignorava passava. Os prompts
  reais da produção tinham ~2.900. **Nunca corte proibição para caber.**
- 🔴 **Exclusão de elemento vai COLADA à referência de que fala**
  (`referencias[].excluir`), nunca num bloco geral de proibições: o modelo
  precisa saber de QUAL imagem tirar o objeto. Dizer "não copie a garrafa"
  dentro do `pedido` não segurou — a garrafa de Tabasco vazou em 2 de 6 peças
  do By Rock, nítida e com rótulo legível.
- 🔴 **No MCP LOCAL, `server.tool(nome, desc, shape, handler)` ESTRIPA chave
  desconhecida** antes do handler — resposta plausível e errada. A saída é
  `registerTool`, que aceita schema completo além de raw shape (SDK ≥ 1.27), e
  aí `.strict()` cabe. `toolEstrita` embrulha as 24 tools sem mudar a forma de
  chamada. O conector remoto usa outro caminho (`parametrosDesconhecidos`).
- 🔴 **Lote de geração é SEQUENCIAL, nunca `Promise.all`.** Cada item valida
  créditos e cria a Generation; doze em paralelo fariam doze validações lerem o
  MESMO saldo antes de qualquer dedução, e o lote inteiro passaria com saldo
  para uma peça só. Em série o item N enxerga o consumo dos anteriores. Item
  inválido não derruba o lote (`itens[].erro`), teto de 12, `loteId` em
  `fieldValues` — sem tabela nova, precedente do `carouselGroupId`.
- **`md5Checksum` vem de GRAÇA no listing do Drive** — é metadado, não exige
  baixar o arquivo. É o que permite detectar duplicata por CONTEÚDO: no By Rock,
  `ambiente-05.jpg` e `ambiente-f3a8697.jpg` são iguais byte a byte, e a
  duplicata fazia o rodízio "variar" entre duas cópias da mesma imagem.
- 🔴 **A reconciliação é um DIFF DE IDS e não toca em entrada existente** — por
  desenho. Campo novo no catálogo só chega às fotos NOVAS; sem um backfill
  explícito, a detecção de duplicata nasceria inócua no acervo atual. Vale para
  qualquer campo que se acrescente ao `_image-catalog.json`.
- **A guarda de nome de cliente alheio é de SAÍDA, não de entrada.** O prompt já
  diz de quem é a foto (`Analise esta foto do restaurante "X"`) e ainda assim
  boa parte das descrições do TERO menciona "By Rock". Nome de outro cliente da
  carteira vira "o restaurante" — SUBSTITUI, não apaga a frase: descrição
  mutilada some da busca por tema, que é o oposto do objetivo.
- **`buscar-fotos` ganhou `offset`, e `limit` nunca teve teto** — o que faltava
  era a descrição dizer isso. O retorno traz `catalogacao` (total, sem
  descrição, sem tags, duplicadas), porque catálogo regerado na taxonomia v2 só
  tem a pasta: a busca por TEMA não alcança essas fotos e quem buscava não tinha
  como saber — a resposta voltava curta e parecia acervo pequeno.

### 🔴 O conector via MCP era mais restrito que o app web (12/08/2026)

`projetosVisiveis` (`src/lib/mcp/tools.ts`) olhava só
`organization.ownerClerkId` — o DONO da organização. Mas
`hasProjectWriteAccess` (`projects/access.ts`) dá acesso a **todos os membros**
de uma organização com que o projeto é compartilhado, e é assim que o site se
comporta.

Efeito medido: um `org:admin` abria o site e via os 11 clientes; abria o
conector e via **ZERO**, com "Sem acesso ao projeto 6" em cada tool. Nada na
conversa explicava por quê — e a hipótese natural (token de outra conta) estava
certa em parte e mandava para o conserto errado.

- **Membro conta, não só dono.** A participação vive no CLERK, não no banco: o
  app web a recebe pronta no `orgId` da sessão, mas o token OAuth do MCP traz só
  o `userId`. `orgsDoUsuario` consulta o Clerk, com cache de 60s por instância —
  sem ele seria uma ida à API por tool, já que quase toda uma chama
  `assertProjetoPermitido`.
- **Clerk fora do ar degrada para MENOS acesso, nunca para mais**: devolve lista
  vazia de organizações e sobra o que o banco sabe sozinho (os projetos que a
  pessoa possui, e o `ownerClerkId`, que por isso foi MANTIDO no OR).
- 🔴 **Erro de permissão precisa dizer QUEM está conectado.** "Sem acesso ao
  projeto 6" e uma lista vazia mandavam procurar permissão no lugar errado. Hoje
  as duas superfícies dizem o e-mail da conta do token e o que fazer. Vale para
  qualquer negativa de acesso no conector: a identidade do portador é invisível
  de dentro da conversa.
- **Diagnóstico de token**: `McpOAuthToken` guarda `userId`, `expiresAt` e
  `revokedAt`. Foi por ali que a troca de conta apareceu — os tokens do dia
  passaram a sair para outro `user_…` a partir de certo horário.

### O registro único de tools MCP (25/08/2026)

As tools do conector (48 na migração; 62 em 13/10/2026) vivem em **`src/lib/mcp/catalogo/`** (um arquivo por
domínio), declaradas UMA vez com `definirTool` — schema zod (`.strict()`
aplicado pelo construtor), `annotations` obrigatórias, `acesso` declarado,
`superficies` — e executadas pela porta única
(`src/lib/mcp/registro/porta.ts`): apelido → superfície → coerção → validação →
gate → handler. O desenho nasceu da análise do framework Invokta (24/08);
7 commits `a20b8b94..626f69ef`. Regras que valem para código novo:

- **Tool nova = uma declaração no catálogo.** `tools/list` (com annotations),
  validação real de `required`/`type`/`enum` na porta, o registro no servidor
  local e a verificação das INSTRUCTIONS derivam dela. `tools.ts` virou só os
  helpers de acesso/identidade (`projetosVisiveis`, asserts, `resolver*`,
  `itemParaChat`) — os handlers os alcançam por `await import()`.
- 🔴 **Arquivo de domínio do catálogo carrega SEM env**: import estático só de
  módulo puro (zod, `registro/`); db e serviços entram por `await import()`
  RELATIVO dentro do handler (o tsx do servidor local resolve `@/`, mas a
  regra é relativo). É o que deixa `scripts/validar-registro-mcp.ts` rodar no
  CI sem `DATABASE_URL` — e o próprio import do catálogo é metade do teste.
- **Comportamentos calibrados por incidente são preservados verbatim**: a
  mensagem de parâmetro desconhecido (12/08) e a coerção de string JSON ANTES
  do parse (23/08 — estritar sem coerção recusaria chamada que funciona).
  Chave desconhecida ANINHADA aponta o caminho (`"itens.0" não aceita…`),
  nunca os parâmetros da raiz.
- **Vocabulário que não pode entrar estático vira espelho + sentinela**:
  `CATEGORIAS_DA_BASE`/`SECOES_DO_DNA` (base-e-dna.ts) e o "Máximo 60" de
  criar-plano são cravados no catálogo e conferidos no load de
  `catalogo/integracao.ts` contra os donos (enum do Prisma,
  `BRAND_DNA_FIELDS`, `MAX_ITENS_POR_PLANO`) — divergiu, o boot quebra.
- 🔴 **As 6 tools inglesas do servidor local (list-posts, list-projects,
  get-knowledge, prepare-creative, create-arte-rapida, list-drive-images) NÃO
  são duplicatas**: os contratos divergem (list-posts usa dateFrom/status EN e
  devolve lista crua) e as skills consomem ESSAS formas. São camada de
  compatibilidade explícita; os nomes PT do catálogo são os canônicos, e o
  stdio serve os dois (em 13/10/2026: 61 do catálogo com superfície local + 24
  inglesas fora da porta, sem gate por principal). Migrar as skills aposenta a camada.
- **Snapshot é a rede da migração e o padrão para MUDAR schema**: os literais
  antigos vivem como fixtures em `validar-registro-mcp.ts` (48 snapshots).
  Mudança deliberada de schema atualiza o fixture no mesmo commit — o teste
  existe para pegar mudança INVOLUNTÁRIA no que o modelo vê.
- **INSTRUCTIONS moram em `src/lib/mcp/instrucoes.ts`** (módulo puro) e a
  seção D do script recusa nome de tool hifenizado que não exista no catálogo
  (allowlist explícita para ênclise: "grave-a"). Foi o que aposentou de vez o
  caso `ver-melhoria` recomendado 13 dias depois de morrer.
- **O batch JSON-RPC do route.ts é SEQUENCIAL** — `Promise.all` deixava 12
  `gerar-imagem` num array lerem o mesmo saldo antes de qualquer dedução.
  Batching saiu da spec MCP em 2025-06-18; recusar arrays fica para quando a
  telemetria mostrar zero chegando.
- **Bug consertado na travessia**: `ver-geracao` exigia `melhoriaId`
  (`requireString`) — quem seguia a instrução do próprio `gerar-imagem` e
  chamava com `geracaoId` tomava erro. Hoje qualquer um dos dois vale.
- **Gate mecânico de `executar-plano` intocado** (1ª chamada devolve a conta;
  só `confirmar: true` literal produz): é gate de COBRANÇA, e converter o
  envelope para erro da taxonomia seria mudança de comportamento — fica como
  decisão futura deliberada, nunca efeito colateral de migração.
- `scripts/gerar-catalogo-tools.ts` emite o catálogo em markdown para as
  skills pararem de descrever tools à mão.

### Arte feita fora do Studio entra pelo conector: `importar-arte` (22/09/2026)

A ponte de volta da conversa do ChatGPT: a imagem gerada ou editada lá vira
ARTE de verdade no Studio (galeria, editor, conferir/melhorar, agenda por
`generationId`), pelo mesmo `importarArte` do `upload-creative` local.

- **O arquivo chega por `openai/fileParams`**: o registro de tools ganhou
  `meta` (publicado como `_meta` no tools/list), e o ChatGPT troca o anexo por
  `{ download_url, file_id, mime_type?, file_name? }`. `definirTool` recusa
  `fileParams` que não seja chave de topo do schema — o campo nunca chegaria.
  ⚠️ Não medido para imagem GERADA na conversa (o documentado é anexo), e há
  defeitos abertos na OpenAI (~10% das chamadas sem o arquivo). Por isso o
  **plano B embutido**: `pedir-foto` → a pessoa envia pelo link → a tool de novo
  com `uploadId`. É também o caminho do Claude e do Codex, que não têm fileParams.
- 🔴 **`download_url` é argumento de modelo: fronteira de confiança.**
  `baixarImagemExterna` só aceita https, recusa host que resolve para rede
  interna (privada, loopback, link-local/metadado de nuvem, IPv6 interno) em
  CADA redirect (máx. 3), e corta em 25MB lendo o stream — o Content-Length
  pode mentir. A checagem de DNS é antes do fetch, não no socket (rebinding
  ainda passaria; marcado com `ponytail:` no módulo).
- **Proporção avisa, nunca corta** (`avisoDeProporcao`, mesmos cortes de
  `classificarFormato`): o ChatGPT entrega 1024x1536 (2:3), que entra como
  story sem ser 9:16.
- Só no **remoto**: no local o caminho é `upload-creative` (lê do disco).

### Auditoria da carteira: `auditar-operacao` (13/10/2026)

Primeira peça do Dot Lagosta como gerente operacional (H2; o mapa e as decisões
estão em `docs/PLANO-2026-10-13-DOT-OPERACAO-H1.md`). Uma chamada mostra, para
cada cliente ativo que o principal enxerga, se hoje, amanhã e depois de amanhã
estão cobertos, os buracos, as falhas e a ação recomendada.

- **A expectativa é uma só**: `expectativaDoProjeto` (`src/lib/posts/cobertura.ts`)
  saiu de dentro de `sugerirPosts`, que passou a chamá-la. Auditoria e sugestão
  nunca divergem sobre que horários existem. O snapshot
  `sugerir-posts-paridade.test.ts` foi gravado ANTES da extração: se ele mudar,
  a extração mudou a sugestão. Investigue, não atualize.
- **Coberto ≠ ocupado.** A sugestão pergunta "há algo no horário?" (para não
  empilhar). A cobertura pergunta "há conteúdo PRONTO?". Rascunho sem mídia
  (mesmo com `pageId`), render que falhou, campanha vencida e FAILED deixam o
  horário PENDENTE: há post a resolver, e criar outro por cima duplicaria. Só
  VAZIO pede produção nova.
- **`TARGET_DAYS_AHEAD = 2` = amanhã e depois de amanhã completos.** Hoje
  aparece à parte e não entra em `diasAdiantados`.
- 🔴 **Só leitura de verdade**: não chama `sugerirPosts` (ele registra cada slot
  como LearningSignal) e não grava nada. Um slot que ninguém viu no
  denominador da taxa de aceitação é o defeito que isso evita.
- **Número fixo de consultas para a carteira inteira** (`src/lib/posts/auditar-operacao.ts`:
  projetos, POSTED de 56 dias, posts da janela, grades, assinaturas, campanhas),
  todas com `projectId in [...]`. Nunca um laço com consulta por cliente.
- **Motivo de falha é lista de permissão** (`motivoSaneado`): `errorMessage` e
  `renderError` brutos nunca saem; o que não casa com causa conhecida vira
  "falha sem diagnóstico disponível".
- `horariosTipicosDoProjeto` ainda funde sem `formatoDe` (é a cópia sem formato
  da expectativa). Não foi trocada no H2 porque mudaria o resultado dela.

### `slotValues` de `ajustar-arte` e `criar-arte-de-modelo` tem formato validado (CP4.2b, 15/10/2026)

Valor de tipo errado (número, array, `null`, objeto vazio, `{ hidden: "true" }`, `{ visible: false }`, `{ content: 123 }`)
era ignorado pelo bake e a chamada respondia sucesso re-renderizando a página igual. Agora: FASE 1 (formato) no
handler e no serviço → `VALOR_INVALIDO` 400; FASE 2 (endereço) contra as camadas do modelo efetivo →
`CHAVE_DESCONHECIDA` 422; pedido misto recusado inteiro; `details.erros[]` com a chave. Detalhe e provas em
`docs/regras/revisor-da-arte.md` § "CP4.2".

### `ver-geracao` traz o bloco `gate` — auditoria, nunca autoridade (CP5b, 16/10/2026)

Quando a arte tem registro do gate de autonomia (`Generation.fieldValues.gateDaArte`, gravado só pelo CP5c), a
resposta de `ver-geracao` ganha `gate: { validade, resultado, rulesVersion, versaoDoGate, medidoEm, origem, politica,
politicaComparada, naoConferido | divergencias, motivos, aviso }`; sem registro, `gate: null` (não "APTO", não
"pendente"); registro ilegível → `validade: 'ilegivel'` com o motivo e as versões gravadas, SEM resultado. O
`select` da página ganhou `tags`, `width`, `height`, `background`, `layers`, `copyAutoral` (o que `identidadeDaPagina`
lê), mantendo o filtro por projeto. Nenhuma tool ganhou parâmetro. Detalhe em `docs/regras/revisor-da-arte.md` § CP5b.

### `agendar-leva` no perfil draft-only passa pelo gate de autonomia (CP5c, 16/10/2026)

Só no perfil draft-only (`apenasRascunho`): o rascunho nasce ou é adotado depois de a página ser medida DENTRO da
transação que grava, sob as travas, e aceita pelo gate (`decidirEMontarRegistro`, CP5b); o registro do veredito é
gravado na mesma transação (APTO antes do post; reprovado, só ele). O item ganha `revisao` (`medida` / `sem-vinculo`
/ `nao-medida`), `achados` e `motivos`; a recusa é sempre `REVISAO_HUMANA_NECESSARIA` com `generationId`, `pageId` e
`editUrl`. Efeitos pós-commit não rodam nesse perfil (aviso fixo no item). O fluxo humano (perfil normal) não mudou
em nada: nenhuma medição, trava nova ou campo novo. A descrição da tool ganhou o parágrafo "GATE DE AUTONOMIA"; nenhum
parâmetro novo. `ver-geracao` compara a política gravada com `POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA` (proposta nomeada,
decisão 8.1 do contrato). Detalhe em `docs/regras/revisor-da-arte.md` § CP5c.

### `ajustar-arte` no perfil draft-only passa pelo gate de autonomia (CP5d, 17/10/2026)

Só no perfil draft-only: a versão final que seria gravada é medida DENTRO da transação de escrita, sob as travas, e
só é gravada se o gate disser APTO; o registro vai para a Generation PROCESSING criada na mesma transação e fechada
pelo render (render que falha → `FAILED` por uma `UPDATE` atômica com `fieldValues.error`, o registro fica como
auditoria). Recusa → `REVISAO_HUMANA_NECESSARIA` com `revisao`/`achados`/`motivos` e `ajusteGravado: false`, página
intacta. A recusa TOTAL do CP4 no draft-only também sai como `REVISAO_HUMANA_NECESSARIA`, com a causa em
`details.causa`. O sucesso traz `revisao` (APTO) com o `generationId`. Fluxo humano igual (código do CP4 mantido).
Nenhum parâmetro novo; a descrição ganhou o parágrafo "GATE DE AUTONOMIA". Detalhe em `docs/regras/revisor-da-arte.md`
§ CP5d.

## CP5e — o gate como informação no `revisar-arte` e o bloco `gate` em `auditar-operacao` (17/10/2026)

Contrato: `docs/PLANO-2026-10-17-CP5E-CONTRATO.md`. `revisar-arte` (consultiva, `readOnlyHint`) devolve `gate` (informação,
sem gravar; segunda medida fiel com `corrigir: false`; seleção ÚNICA da Generation da peça: a pedida → a do compositor → a
última arte → `sem-vinculo`). Com `pageId` E `generationId`, a arte precisa ser desta página (`GERACAO_DE_OUTRA_PAGINA`, 422 —
antes o `generationId` era ignorado). `auditar-operacao` lê o registro dos posts da janela (duas consultas, teto 200) e
rotula por `validadeDoGate`. Barreira de lint por NOME: leitores (`lerGateDaArte`/`validadeDoGate`: gate-persistido,
gate-resumo, ver-geracao-retorno, arte-ia) × produtores (`decidirEMontarRegistro`: agendar-itens, arte-rapida, revisar-arte).

### `aprovar-referencia` e `listar-referencias`: a página do Ciro vira o layout do cliente (F1, 01/11/2026)

`aprovar-referencia` (gate `curador`, como `marcar-como-modelo`) compila uma página do editor em arquétipo do cliente
(`ref-<pageId>`) e grava a revisão imutável; `versaoEsperada` (a `versao` do `revisar-arte`) aprova exatamente o que
foi conferido; `revogar: true` tira a referência dos pedidos novos. `listar-referencias` (gate `projeto`) diz as que
valem. A spec de `compor-arte`, `compor-leva` e `medir-copy` pede `"arquetipo": { "id": "ref-<pageId>" }`; referência
de outro cliente ou revogada não resolve (`ARQUETIPO_DESCONHECIDO`), e **o cliente com referência aprovada no formato
perde o catálogo** (`ARQUETIPO_NAO_APROVADO`, com as que valem). O
detalhe (precedência, recusas, o que fica em `leitura.ignoradas`) está em `docs/regras/compositor.md`, seção "F1 da
direção por referência".

### `fotoJanela`: o corte explícito da foto em `compor-arte`, `compor-leva` e `medir-copy` (F2a, 01/11/2026)

`fotoJanela = { x, y, width, height }` em frações 0..1 da foto original — o mesmo crop que o editor grava. Só com UMA
foto (`fotoDriveId`/`fotoUrl`); com `fotosCandidatas` ou `selecaoExperimental` é `SPEC_INVALIDA`. O compositor confere
a proporção contra a caixa (ajuste mínimo dito nos avisos; fora da foto, `JANELA_NAO_CABE`) e grava a janela na camada
da foto (`style.crop`). Detalhe em `docs/regras/compositor.md`, seção F2a.


### F2c (02/11/2026): `listar-referencias` devolve `corpos`

Cada referência traz `corpos` (o corpo desenhado por papel, px) lido da REVISÃO PERSISTIDA — `null` nas revisões de
antes da F2c (a escada delas parte da assinatura). `ver-assinatura` também devolve `referencias` (as vigentes no formato,
com `corpos`) e `avisoDasReferencias`: com referência aprovada, o catálogo listado não vale para o cliente. `aprovar-referencia` mostra o corpo em `leitura.papeis[].corpo`; a
mesma página reaprovada depois da F2c ganha a revisão seguinte com os corpos (a anterior é imutável). Detalhe em
`docs/regras/compositor.md`, "F2c".


### F2d (02/11/2026): `listar-referencias` e `ver-assinatura` devolvem `estilos`

Por papel: família, peso (`null` = normal), entrelinha, espaçamento (px no corpo desenhado), caixa (`none` explícito),
cor e sombra — da REVISÃO PERSISTIDA; `null` nas revisões de antes da F2d (a peça veste a assinatura). A segunda voz da
peça toma só a cor; destaque e prefixo continuam da assinatura. Detalhe em `docs/regras/compositor.md`, "F2d".

### F2b (02/11/2026): `marcar-assunto`, e `assunto` em `listar-referencias` e `ver-assinatura`

`marcar-assunto` (curador) corrige a caixa do assunto de uma foto: `caixa`, `sem-assunto` ou `automatico` (revoga e a
visão volta). Grava em `PhotoAssunto`, nunca no JSON do catálogo, e devolve o efetivo e o anterior. É a resposta certa ao
aviso que diz a origem da caixa: a correção não é a copy.

`listar-referencias` e `ver-assinatura` devolvem `assunto` (`{ caixa, visivel }`, da REVISÃO PERSISTIDA; `null` nas
revisões antigas); `aprovar-referencia` devolve `leitura.assunto`, com o motivo quando faltou. A mesma página reaprovada
com a caixa nova ganha a revisão seguinte. `buscar-fotos` traz o `assuntoEfetivo` de cada foto. O diagnóstico de
`compor-arte` traz `posicao.assistencia`. O gancho `leitorDeReferencias` é só de prova e o adaptador não o conhece. Detalhe
em `docs/regras/compositor.md`, "F2b", e `docs/regras/acervo-de-fotos.md`, "A caixa do assunto".

### `ver-pagina` e as `camadas`/`pagina` de `ajustar-arte`: editar a arte pelos dados (T1, 05/11/2026)

Pedido do Ciro (05/11/2026): criar e ajustar artes no editor de ponta a ponta só pelos dados, via MCP, com o PNG
renderizado para conferir e o link do editor para o ajuste à mão. A lacuna central (`LACUNAS.md` do plano
`mcp-ajustes-2026-11-05`, L1–L3): nenhuma tool remota devolvia as camadas de uma página, e `ajustar-arte` só
aceitava texto/foto/nome e os cinco `ajustes` do revisor. Tudo o que a pessoa faz na tela ficava de fora.

**Por que estender `ajustar-arte` em vez de criar `editar-camadas`**: o serviço `ajustarArte` já tem a transação, o
compare-and-set por `versaoEsperada`, o gate CP5d no draft-only, a trava da recomposição, o render
(`renderPageAndRegister`), a invalidação (`invalidateScheduledRenders` E `pedirRecomposicaoDaArteCongelada`) e a
resposta com `url`/`editUrl`/`versao`. Uma tool nova pelo mesmo caminho seria duplicata; por caminho próprio, a
segunda implementação da regra das duas chamadas.

**`ver-pagina`** (leitura; gate `projeto`; remoto+local; na allowlist draft-only; `src/lib/mcp/catalogo/pagina.ts`).
Entrada: `projectId` e `pageId` OU `generationId` (a página é `fieldValues.pageId` da arte, como em `ver-geracao`).
Saída: `pageId`, `nome`, `templateId`, `templateName`, `formato` (`formatoDaPaginaGravada`), `largura`, `altura`,
`fundo`, `isTemplate`, `tags`, `versao` (= `versaoDaPagina`, o MESMO valor que `revisar-arte` devolve e
`ajustar-arte` exige em `versaoEsperada`), `editUrl` (montado como `montarRetornoDaPagina`), `thumbnail`,
`atualizadaEm`, `camadas[]` e `comoAjustar`. As camadas saem por `lerCamadas` (a única leitura segura das três
codificações) e NORMALIZADAS por `camadaParaLeitura`: só id, type, name, visible, locked, order, position, size,
rotation, content, fileUrl, isDynamic, style (sem `vetor`), effects, textboxConfig, richTextStyles — nunca
`metadata`. Duas marcas de leitura: `grupo` (a camada tem `metadata.groupId`/`parentId`: `remover`/`reordenar`
recusam, `definir` vale) e `grade: true` (célula de grade: nada se edita por aqui). Recusas: `SEM_PAGINA` (400),
`GERACAO_NAO_ENCONTRADA` (404), `GERACAO_SEM_PAGINA` (422, arte de IA/melhoria), `PAGE_NOT_FOUND` (404),
`PAGINA_DE_OUTRO_PROJETO` (403, sem dizer de qual), `CAMADAS_ILEGIVEIS` (422 — ilegível nunca vira `[]`).
Página-modelo e página com vídeo saem com `avisos` e `comoAjustar: null`.

**`camadas` em `ajustar-arte`** (lista de até 40 operações, `src/lib/creatives/editar-camadas.ts`, módulo PURO):

| `op` | campos da operação | o que faz |
|---|---|---|
| `definir` | `camada` (id ou nome), `campos` | muda só os campos enviados; `position`/`size` parciais fundem; `style` funde; `effects.<x>` substitui o efeito; `lineHeight` grava nos DOIS campos (`patchLineHeight`); `campos.order` move na pilha |
| `adicionar` | `tipo` (texto, imagem, logo, forma, icone, gradiente), `id?`, `ordem?`, `campos?` | camada nova com os defaults do SERVIDOR (os de `createArteLivre`: fonte do corpo da marca, branco, centrado; logo = a principal do cliente; imagem por `driveImageId`; forma retângulo preta; gradiente de leitura inferior) e `campos` por cima |
| `remover` | `camada` | tira e renumera |
| `reordenar` | `camada`, `ordem` (0 = fundo) | move na pilha e renumera |

Allowlist por tipo de camada (campo fora dela é `CAMPO_NAO_PERMITIDO`, com o caminho): para TODAS, `name`,
`visible`, `locked`, `order`, `rotation`, `position`, `size`; `text`: `content`, `style.{fontFamily, fontWeight,
fontSize 8–600, color, textAlign, textTransform, letterSpacing −100..100, lineHeight 0,5..3, fontStyle, opacity}`,
`textboxConfig.{anchor, autoWrap.{breakMode, autoExpand}}`, `effects.{stroke, shadow, blur, background}`;
`image`/`logo`/`element`: `fileUrl`, `driveImageId`, `style.{crop 0..1, objectFit, cropPosition, flipH, flipV,
opacity, blur, exposure, contrast, highlights, shadows, whites, blacks, saturation, vignette}`; `shape`/`icon`:
`style.{fill, strokeColor, strokeWidth 0..200, opacity, shapeType (sem svg-path)}` (+ `iconId`, `color` no ícone);
`gradient`/`gradient2`: `style.{gradientType, gradientAngle 0..360, gradientStops (1..8), gradientStart/End X/Y,
gradientCenter X/Y, gradientRadiusScale 0,1..5, opacity}`; `rich-text`: só os comuns (quarentena #209);
`video`: nada. Cor é lida por `lerCor` (hex, rgba(), hsl(), nome CSS). `fileUrl` precisa ser http(s).

**`pagina`**: `background` (cor por `lerCor`), `width`/`height` (200..8000, inteiros). Com ela, tudo abaixo
(autofix, gate, versão gravada, render) mede e desenha na página como VAI FICAR.

**Recusas** (padrão do CP4: pedido misto recusado INTEIRO, nada gravado, código da primeira em `error`, a lista em
`details.erros[]` com `indice`, `op`, `camada`, `codigo`, `motivo`, `campos`; `indice: -1` é o bloco `pagina`):
`OPERACAO_INCOMPLETA`, `CAMADA_INEXISTENTE`, `CAMADA_AMBIGUA` (nome repetido: use o id), `ID_JA_EXISTE`,
`CAMPO_NAO_PERMITIDO`, `VALOR_FORA_DA_FAIXA` (faixa, cor ilegível, URL que não é http(s)), `TIPO_NAO_EDITAVEL`
(vídeo; célula de grade; `remover`/`reordenar` em camada de grupo), `URL_EXTERNA_RECUSADA` (draft-only: qualquer
`fileUrl`, como no `slotValues`; foto só por `driveImageId`), `CONTEUDO_NAO_PODE_SER_REMOVIDO` (draft-only: esconder,
esvaziar ou remover texto com conteúdo — `temTextoSubstantivo`; no perfil humano é permitido), `VERSAO_OBRIGATORIA`
(camadas/pagina sem `versaoEsperada`), e os de sempre: `VERSAO_DIVERGENTE`, `PAGINA_E_MODELO`, `PAGINA_COM_VIDEO`,
`CLIPES_INVALIDOS` (`problemasDosClipes`), `VETOR_INVALIDO` (`problemasDosVetores`), `TEXTO_NAO_CABE` (o texto
criado ou mexido passa pela escada do autofix), `REVISAO_HUMANA_NECESSARIA` (gate CP5d no draft-only).

**Onde entra na cadeia** (`ajustarArte`): FASE 1 (forma, faixa, cor, URL) no handler E no serviço, antes do banco →
leitura da página e `aplicarPagina` → `slotValues`/foto (bake) → **camadas** (`driveImageId` resolvido pelo
`resolveImageUrl`, logo e fontes do projeto lidas só quando um `adicionar` precisa) → `problemasDosClipes` →
`problemasDosVetores` → `canonicalizeLayersForPersistence` → reflow (NÃO roda quando só há camadas/ajustes:
desfaria a posição definida) → autofix (os textos tocados entram em `changedLayerIds`) → `ajustes` do revisor →
revisão do contrato da copy → transação (gate CP5d no draft-only, compare-and-set por `versaoEsperada`, trava da
recomposição — camadas editadas e página mudada TRAVAM a recomposição como os ajustes) → `renderPageAndRegister` →
`invalidateScheduledRenders` + `pedirRecomposicaoDaArteCongelada`. Resposta: a de sempre (`url`, `editUrl`,
`versao` nova, `revisao`) + `camadasAplicadas[]` (`indice`, `op`, `camada` = id, `detalhe`) e `camadasRecusadas: []`
(sempre vazia num sucesso; fica pelo contrato). A Generation guarda `fieldValues.camadas` (operações e aplicadas) e
`fieldValues.pagina`.

Continuam fora, de propósito: página-modelo, página com vídeo, trecho de rich-text (#209), grade (`metadata.grade`),
desfazer grupo. O editor (`PageSync`) grava a página inteira; ler a página depois da edição é `ver-pagina` de novo —
a `versao` nova vem na resposta do ajuste e também lá.

Testes: `src/lib/creatives/__tests__/editar-camadas.test.ts` (cada operação e cada recusa, sem banco),
`src/lib/mcp/__tests__/ajustar-arte-camadas.test.ts` (schema, FASE 1 no handler, URL externa no draft-only),
`src/lib/mcp/__tests__/ver-pagina.test.ts`, e o portão `VERSAO_OBRIGATORIA` em `ajustar-arte-portoes.test.ts`.
Snapshots em `scripts/validar-registro-mcp.ts` (`ver-pagina` novo; `ajustar-arte` com `camadas`/`pagina`).
