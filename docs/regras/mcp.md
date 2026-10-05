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

As 48 tools do conector vivem em **`src/lib/mcp/catalogo/`** (um arquivo por
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
  stdio serve os dois (72 tools). Migrar as skills aposenta a camada.
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
