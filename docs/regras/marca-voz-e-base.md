# Marca, voz e base de conhecimento

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### DNA da Marca (30/07/2026)

A identidade vive na tabela `BrandDNA` (1:1 com Project; tom de voz, regras,
composição, estilo visual, direção fotográfica) e é editada na aba **Marca** do
projeto (ex-Assets — o value da tab continua `assets` para os links antigos).
Regras que valem para código novo:

- **DNA ≠ base de conhecimento.** DNA entra INCONDICIONALMENTE em todo prompt
  de geração; a base é buscada por relevância (minScore/topK/teto de tokens) e
  por isso NUNCA deve guardar identidade — `TOM_DE_VOZ` na base não chegava ao
  gerador de copy da UI, e é por isso que a aba Marca oferece importação dessas
  entradas para o DNA.
- **Identidade se lê pelo loader único** `loadBrandContext`
  (`src/lib/brand/brand-context.ts`) — nada de `select` próprio de campos de
  marca em consumidor novo. Consomem hoje: improve, chat, generate-ai-text
  (wizard) e o bloco `brand.dna` do MCP `escolher-modelo`.
  `dna.visualStyle` tem prioridade sobre o legado `brandStyleDescription`.
- **`toneOfVoice` NÃO entra em prompt de imagem** (os textos são reproduzidos
  verbatim; instrução de tom só confunde o modelo). Entra em copy e chat.
- **A prévia da aba Marca usa `buildPromptSections`** — a MESMA função do
  improve. Mudou a montagem do prompt, a prévia acompanha sozinha; nunca
  duplicar o texto da prévia à mão.
- **Escrita do DNA é serviço** (`updateBrandDNA`), não código de rota — e o
  MCP já embrulha o mesmo serviço: `consultar-dna` devolve o BrandContext com
  `secoesVazias` (convite para completar) e `atualizar-dna` grava por seção
  (SUBSTITUI, não acrescenta; `null` limpa). A descrição de
  `criar-entrada-base` redireciona identidade para o DNA — a categoria
  TOM_DE_VOZ da base é legado.
- No formatador da base (`search.ts`), entrada que estoura o teto de tokens é
  **pulada** (`continue`) — o `return`/`break` antigo fazia um CARDAPIO longo
  eliminar as categorias seguintes inteiras.

### Cache da base: disjuntor no backend do Upstash (11/08/2026)

O cache de resultados da busca na base (`src/lib/knowledge/cache.ts`) estava
falhando em TODA busca, em silêncio, desde antes da F3. Consumidores atingidos:
chat, `generate-ai-text`, `find-similar-entries` e a dica de copy da F3.

- 🔴 **O Upstash responde HTTP 200 com `{"error": ...}` no corpo** quando o banco
  está suspenso, com rate limit da conta ou credencial inválida. O
  `@upstash/redis` só lança em resposta **não-2xx**, então o envelope de erro
  passa como sucesso e chega ao auto-pipeline — **ligado por padrão**
  (`enableAutoPipelining ?? true`), então TODO comando passa por lá —, que faz
  `res.map(...)` sobre um objeto e estoura `TypeError: res.map is not a function`.
  Status 2xx não é prova de sucesso nesta API.
- 🔴 **Erro engolido por `catch` + `console.error` não é conserto, é anestesia.**
  Dois commits (`5bb8af37`, `2e81caf6`) trataram o sintoma assim, e o defeito
  sobreviveu meses: nada quebrava, o cache nunca acertava, e cada busca pagava
  **~600ms em regime (~1,9s a frio)** em ida ao servidor mais duas linhas de erro
  — medido em 11/08 contra o banco real. Falha que se repete precisa de um
  estado que a registre, não só de um log.
- **O disjuntor guarda só o caminho quente.** Depois de 3 falhas seguidas o
  cache para de ser consultado (custo cai a **0ms**), avisa **uma vez** com
  diagnóstico acionável, e reabre sozinho após 60s (dobrando até 10 min) — quem
  consertar o banco não precisa redeployar. A invalidação (`invalidateProjectCache`)
  fica **fora** do disjuntor de propósito: é rara e sensível a correção, então
  vale mais pagar a ida do que pular um bump de versão em silêncio.
- **Desligar o cache é decisão de ops, não de código**: sem
  `UPSTASH_REDIS_REST_URL`/`_TOKEN` o caminho vira no-op limpo e a busca segue
  normal (só refazendo o embedding). As duas variáveis agora estão no
  `.env.example` — antes só o `UPSTASH_VECTOR_*` estava, e o cache era invisível
  para quem montava o ambiente.
- **Redis e Vector são bancos SEPARADOS.** Em 11/08 o Redis estava rate-limited
  e o Vector saudável (136 vetores) — ou seja, a busca funcionava e só o cache
  estava morto. Ao diagnosticar, teste os dois endpoints antes de concluir.

### A voz compacta e a precedência da identidade de TEXTO (PR 7 de "Marca simples, copy melhor", 12/09/2026)

`BrandVoice` (1:1 com o projeto; migration aditiva `20260912180000_brand_voice`)
guarda a voz compacta da marca — `voz` (JSONB, contrato `voz-v1`), `versao`
(cresce a cada gravação), `migradaEm` (quando a voz passou a valer) e
`dnaArquivado` (o snapshot do DNA de texto na migração). Contrato, precedência
e "virar regra" são PUROS em `src/lib/brand/voz.ts`; a única casa com Prisma é
`voz-service.ts`. **Nenhum conteúdo é migrado por esta fundação**: a voz de
cada cliente é escrita e aprovada no PR 13, por manifesto. Prova de integração
no branch de dev: `scripts/validar-voz-compacta.ts` (não toca no Blob).

- **A voz é SÍNTESE, não arquivo**: descrição, tratamento, termos da casa
  (grafia exata), proibições, exemplos aprovados, reescritas antes→depois e as
  REGRAS com `id`, texto, motivo, data, `escopo` (copy · arte · ambas),
  `substitui` e `ativa`. `lerVoz` devolve TODOS os problemas de uma vez (schema
  + coerência: id repetido, `substitui` inexistente, prompt acima de
  `TETO_DO_PROMPT_DA_VOZ` = 4000 caracteres). Voz que passa do teto é recusada
  na gravação — o DNA de 9 mil caracteres é o que ela veio substituir.
- 🔴 **A precedência mora num lugar só** (`precedenciaDaVoz` →
  `BrandContext.voz`, campo OBRIGATÓRIO do loader): `fonte: 'voz'` quando o
  cliente foi MIGRADO (`migradaEm`), `'legado'` (o `toneOfVoice`/`contentRules`
  do DNA) enquanto não migrou — mesmo com voz já gravada, que é a prévia e
  aparece como `vozPendente` —, `'nenhuma'` sem os dois. Voz migrada que não
  passa mais no contrato NÃO derruba a copy: cai no legado com `vozPendente`.
- 🔴 **Consumidor de identidade de TEXTO lê `brand.voz.texto` e
  `brand.voz.regrasDaMarca`, nunca `dna.toneOfVoice`/`dna.contentRules`
  direto**: chat, `generate-ai-text`, dica de copy, resposta a avaliação,
  revisão ortográfica e crivo já passaram. Os prompts de IMAGEM continuam
  lendo `contentRules` do DNA (proibição não é estilo) e SOMAM
  `brand.voz.regrasDeArte` — as regras de escopo `arte`/`ambas` nascidas na
  voz, que o DNA não tem. `toneOfVoice` segue fora de prompt de imagem.
- **`virar-regra` no cliente MIGRADO**: regra de TEXTO (sem `secao`, ou em
  `toneOfVoice`/`contentRules`) vai para a VOZ, com escopo, motivo e data;
  fala do mesmo assunto de uma regra ativa → a tool RECUSA com
  `CONFLITO_DE_REGRA` e lista as regras; a pessoa decide `substitui` (a antiga
  fica INATIVA, no histórico, fora do prompt) ou `conviver: true`. As seções
  de ARTE do DNA (composition, visualStyle, photoDirection, approvalChecklist)
  continuam no DNA. No cliente NÃO migrado o caminho é o de sempre
  (acrescenta a linha à seção) e a resposta traz `conflitos`, as linhas da
  seção sobre o mesmo assunto — em prosa não há substituição mecânica, e o
  aviso é o que a migração vem resolver. Nada grava sem `confirmado`.
- 🔴 **"Mesmo assunto" se mede com palavras de conteúdo e FRASES CITADAS**
  (`semelhancaDeRegras`, `LIMIAR_DE_CONFLITO` = 0,4): a lista de palavras
  vazias sai, e a frase entre aspas em comum ("Vem pro fogo") vale conflito
  sozinha — só por palavras, a regra que LIBERA a frase que outra PROÍBE dava
  0,2 e passava sem aviso. Escopo `arte` não conflita com `copy`; `ambas`
  cruza com tudo.
- **Escrita com compare-and-set na `versao`**: `gravarVoz` cria na primeira
  vez; depois exige a versão lida (`VOZ_VERSAO_OBRIGATORIA`, 400) e recusa a
  que mudou (`VOZ_DIVERGENTE`, 409); voz inválida nunca é gravada
  (`VOZ_INVALIDA`, 400, com os problemas). `migrarParaVoz` arquiva o DNA de
  texto e liga a precedência; `desfazerMigracao` só a desliga — voz e snapshot
  ficam. A gravação da regra pela tool passa pelo mesmo CAS.
- **A PRÉVIA passa pelo contrato inteiro** (`aplicarRegraNaVoz` valida a voz
  resultante com `lerVoz`): regra comprida, a 61ª regra ou o prompt acima do
  teto são recusados ANTES de a pessoa confirmar (`VOZ_RESULTANTE_INVALIDA`) —
  o que não pode ser gravado não pode ser proposto.
- 🔴 **Confirmar exige a versão da PRÉVIA** (`versaoDaVoz` = a `versaoLida`
  que a proposta devolveu; sem ela `VOZ_VERSAO_OBRIGATORIA`, com a versão de
  uma proposta antiga `VOZ_DIVERGENTE`): entre a prévia e a confirmação outra
  edição pode ter trocado a regra que seria substituída mantendo o id, e o CAS
  da gravação sozinho protegia só a janela da própria requisição.
- 🔴 **O vocabulário da revisão ortográfica vem de `brand.voz.vocabulario`**,
  nunca de `voz.texto`: o texto do prompt carrega o "antes" das reescritas
  ("churasco → churrasco") para o modelo NÃO repetir o erro, e posto no
  vocabulário ele PROTEGIA a grafia errada e engolia a sugestão certa. Só os
  campos positivos (descrição, tratamento, termos, exemplos, "depois") são
  grafia aprovada; no legado, o `toneOfVoice`.
- **`prepareCreative` (escolher-modelo, `create-arte-rapida`, a API externa)
  entrega a identidade de texto EFETIVA**: `brand.dna.toneOfVoice` é o texto
  da voz no cliente migrado (e `contentRules` fica null — as regras já estão
  nele), o DNA no legado; `brand.voz` traz a precedência inteira. Consumidor
  que monte identidade de texto por `select` próprio de `brandDNA` repete o
  defeito — passe pela precedência.
- **No conector**: `consultar-voz` (só leitura) diz QUEM manda na copy hoje,
  a voz, a versão, os problemas e os caracteres no prompt contra os do DNA;
  `virar-regra` ganhou `escopo`, `substitui` e `conviver`; as instruções
  mandam ler a voz antes da primeira copy no cliente migrado. Fixtures do
  registro atualizados no mesmo commit.
- ⚠️ **A migration está aplicada só no branch de dev** — em produção é
  escrita à mão + `db:deploy` com o OK do Ciro. O loader seleciona
  `brandVoice` em todo projeto: código sem a tabela FALHA em toda leitura de
  identidade — não subir o código antes do schema.
- 🔴 **A confirmação do "virar regra" não troca de destino no meio do
  caminho** (PR7-FINAL-01 da revisão final do Codex, 18/09/2026). `versaoDaVoz`,
  `substitui` e `conviver` só existem numa proposta da VOZ: chegando ao ramo do
  DNA (migração desfeita entre a prévia e a confirmação), a confirmação é
  RECUSADA com `REGRA_DESTINO_MUDOU` (409) — acrescentar ao DNA seria outra
  operação que a aprovada, e a proibição antiga continuaria. A mudança DURANTE a
  requisição também é travada nos dois sentidos: a gravação na voz exige
  `migradaEm` no MESMO `updateMany` do CAS (`gravarVoz({ exigirMigrada })`), e a
  gravação no DNA de texto trava e relê `migradaEm` na mesma transação da
  escrita (`updateBrandDNA(…, tx)`).
- 🔴 **A trava é a linha do `Project`, nunca a de `BrandVoice`** (PR7-R9-01/02
  da revisão final, 20/09/2026). `SELECT … FOR UPDATE` numa linha que pode NÃO
  EXISTIR não trava nada: no cliente sem voz a consulta voltava vazia, outra
  execução criava a voz e concluía `migrarParaVoz`, e a confirmação seguia e
  gravava no DNA que já tinha deixado de governar a copy. `travarProjeto`
  (`voz-service.ts`) trava o `Project` — que existe sempre, é o alvo da FK dos
  dois lados — e a confirmação do DNA e `migrarParaVoz` tomam a MESMA trava,
  relendo o estado dentro dela. Trava que não travou nada (projeto inexistente)
  RECUSA com `PROJECT_NOT_FOUND` em vez de seguir. Pelo mesmo motivo
  `migrarParaVoz` virou transação e lê o snapshot do DNA DEPOIS da trava: lido
  antes, o `dnaArquivado` guardava um DNA que uma confirmação em curso ainda ia
  alterar. **Serializou escrita por uma linha? Confira se ela existe sempre.**
  O teste que prova isto começa SEM voz (`voz-trava-do-projeto.test.ts`, com
  trava de verdade no banco em memória): os testes de destino sempre
  inicializam uma voz, inclusive o controle legado, e foi por isso que o
  defeito passou.
- 🔴 **Voz compacta VALIDADA entra INTEIRA em prompt de orçamento curto**
  (PR7-FINAL-02): `textoDaVozParaPrompt(voz, teto)` corta só o LEGADO. O
  contrato já limita a voz a 4.000 caracteres e as regras recentes moram no FIM
  — `tom.slice(0, 1200)` nos rascunhos de avaliação/comentário (e na revisão
  ortográfica) apagava justamente elas. Consumidor novo com teto próprio usa o
  helper, nunca `slice` direto em `voz.texto`.
- 🔴 **O molde da porta leva `voz.regrasDeArte`** (PR7-FINAL-03): o fallback do
  diretor de arte (`prompt-do-manual` / `prompt-da-referencia`) não lia as
  regras de arte da voz — só `buildArtePrompt` lia —, e a regra sumia
  justamente quando o diretor estava fora. O corpo do molde mora em
  `corpoDoMoldeDaPorta` (`contexto-visual-da-geracao.ts`, puro, testado); a
  copy exata continua sendo a última seção. Prompt de imagem novo que leia
  `dna.contentRules` precisa ler `voz.regrasDeArte` junto.
- **O cleanup da prova da voz restaura o BrandDNA pelo SNAPSHOT inteiro**
  (`scripts/lib/restaurar-dna.ts`, nota PR7-F-01): linha ausente é recriada
  (mesmo id), a presente volta campo a campo, e a conferência cobre todos os
  campos menos `updatedAt`.

### A aba Marca em três áreas (PR 14 de "Marca simples, copy melhor", 12/09/2026)

A aba Marca (`?tab=assets`) deixou de ser a pilha DNA → pilares → prompt de
melhoria → assets e virou TRÊS áreas (plano §8): **Como a marca fala** (a voz
compacta do PR 7, editável), **Identidade visual** (as assinaturas com atalho ao
editor + logo, cores, fontes e elementos) e **Fatos da casa** (o RESUMO da base,
com atalhos — nunca uma cópia). Serviço em `src/lib/brand/aba-marca.ts` (a
única casa com Prisma), rotas finas `GET|PUT /api/projects/[id]/voz`,
`GET …/fatos`, `GET …/assinatura`, hooks em `src/hooks/use-aba-marca.ts`,
formulário PURO em `src/lib/brand/voz-formulario.ts` (com teste de ida e volta
exata). Prova no branch de dev: `scripts/validar-aba-marca.ts`.

- **O que SAIU da aba e para onde foi**: pilares de conteúdo → bancada
  (planejamento, recolhidos em "Planejamento · pilares"); composição, estilo
  visual, direção fotográfica e o prompt de melhoria → Configurações,
  recolhidos em "Avançado · direção de arte"; crivo de aprovação →
  Configurações, "Arquivo · crivo". `BrandDnaSection` virou parametrizável
  (`secoes`, `titulo`, `descricao`, `mostrarPrevia`, `somenteLeitura`) e é a
  MESMA nas quatro casas — não duplique o editor de DNA.
- 🔴 **A tela grava a voz com a versão que LEU** (`PUT` com `versaoEsperada`;
  `gravarVoz` faz o CAS): a versão velha volta `VOZ_DIVERGENTE` 409 e a tela
  recarrega e pede para refazer por cima; sem versão com voz existente é
  `VOZ_VERSAO_OBRIGATORIA`. Voz que não passa no contrato é recusada ANTES de
  escrever (`VOZ_INVALIDA`, com TODOS os problemas) — e o formulário mostra os
  problemas em tempo real (`lerVoz` sobre o formulário) antes de deixar salvar.
- 🔴 **Gravar a voz NÃO muda quem manda na copy.** A precedência é a de sempre
  (`precedenciaDaVoz`): o topo da área diz "manda na copy" (migrado), "prévia —
  o DNA legado ainda manda" (voz gravada, cliente não migrado) ou "sem voz
  ainda". Migrar é o manifesto do PR 13, decisão do Ciro por cliente. O DNA de
  texto continua editável na própria área, recolhido, enquanto o cliente não
  migrou (é o que a copy lê hoje); migrado, aparece só para leitura
  ("arquivado").
- **A consulta seguinte do CONECTOR traz a alteração da tela**: `consultar-voz`
  e o loader único leem `BrandVoice` sem cache — a prova grava pela camada da
  tela e confere versão e conteúdo em `consultar-voz` e `vozPendente` no
  `loadBrandContext`. Editar a voz e mandar o DNA inteiro para o modelo era o
  defeito que o plano queria evitar.
- **Regra recente com SUBSTITUIÇÃO no formulário** (`substituirRegraNoFormulario`):
  a antiga fica inativa (histórico, recolhido), a nova nasce com `substitui` e
  id novo — a mesma semântica de `aplicarRegraNaVoz`, sem o detector de
  conflito, porque a pessoa está decidindo à vista. `vozParaPrompt` só carrega
  as ativas. 🔴 **Regra SUBSTITUÍDA não se reativa** (`podeReativar`, PR14-03):
  com a substituta apontando para ela, o contrato recusa a voz ("a substituída
  continua ativa") e a tela oferecia uma operação que não podia ser salva;
  voltar ao texto antigo é uma NOVA substituição da regra atual (o histórico
  fica) — da regra que vale HOJE (`sucessoraAtiva`: a cadeia A → B → C pode
  ter mais de um elo, PR14-06). Só regra apenas desativada volta com
  "reativar". Regra ainda NÃO gravada (não está na base lida) e sem referência
  pode ser REMOVIDA da lista (`podeRemoverRegra`, PR14-05): sem isso a regra
  em branco que a pessoa abandonou travava o Salvar do resto da edição — o
  contrato exige texto e motivo também nas inativas. Regra gravada é
  histórico: desativa, nunca some.
- 🔴 **Listas e reescritas são campos ESTRUTURADOS, um item por campo — nunca
  texto serializado por delimitador** (PR14-01): "uma reescrita por linha,
  `antes → depois — motivo`" partia um `depois` com travessão, juntava exemplos
  com quebra interna e tirava um marcador literal "- ", e campos que a pessoa
  NÃO editou saíam mudados ao salvar. O valor de cada item viaja literal; só o
  espaço das pontas sai. A prova grava travessão, seta, marcador e quebra pela
  camada da tela e confere que o conector devolve byte a byte, e que editar só
  a descrição deixa o resto idêntico.
- 🔴 **O que chega do servidor NUNCA apaga edição local não salva** (PR14-02):
  a resposta só substitui o formulário quando ele não tem mudança pendente;
  quando o nosso salvamento chegou e a pessoa já digitou mais, a base avança e
  o rascunho fica; quando outra pessoa salvou por baixo, a tela avisa e a pessoa
  decide recarregar (o CAS recusa a gravação até lá). A releitura é AGUARDADA
  dentro da mutação e os campos ficam desabilitados durante o ciclo inteiro.
- 🔴 **Campo cujo contrato aceita quebra de linha é multilinha na tela**
  (PR14-08): `<input>` de texto DESCARTA a quebra preexistente ao editar —
  tratamento, motivo da regra e motivo da reescrita são `Textarea` de uma
  linha; a conversão pura preservava e o controle não.
- **A leitura que confirmou AUSÊNCIA de voz grava com `versaoEsperada: 0`**
  (PR14-09; o serviço aceita 0 como "esperava nenhuma"): se outra pessoa
  criou a v1 no meio, o conflito volta como `VOZ_DIVERGENTE` e cai no caminho
  tratado (aviso + carregar a versão atual); com `null` vinha
  `VOZ_VERSAO_OBRIGATORIA` sem saída, e a tela repetia a falha a cada clique.
  `VOZ_VERSAO_OBRIGATORIA` também é tratado como divergência.
- **A substituição de regra em andamento é RASCUNHO fora do formulário e conta
  como edição local** (PR14-12): a releitura não a apaga; se a regra deixou de
  estar ativa por baixo, o texto reaparece num painel próprio (virar regra nova
  ou descartar). **`id`, `substitui` e `em` viajam literais** (PR14-13): o
  contrato aceita id com espaço nas pontas, e aparar o id sem aparar a
  referência quebrava o vínculo — a voz não salvava mais nem uma edição só na
  descrição.
- **Seção recolhível NÃO desmonta o que já abriu** (PR14-10, `Secao` de
  "Avançado · direção de arte"; PR14-11, o DNA legado recolhido em "Como a
  marca fala"): os editores movidos guardam rascunho em
  estado local, e `{aberto && children}` descartava a edição ao recolher;
  `forceMount` + `hidden`, montando na primeira abertura.
  **E a releitura que FALHA com dados já carregados não troca a árvore pelo
  cartão de erro** (PR14-14): salvar a voz invalida a consulta, e um GET que
  falha depois disso punha `isError` verdadeiro — o retorno exclusivo de erro
  desmontava o `BrandDnaSection` e o rascunho de Tom de voz e Regras que a
  pessoa estava escrevendo no DNA legado sumia; "Tentar de novo" voltava com
  os valores do servidor. O cartão exclusivo é só da carga inicial sem dado;
  com dado, a falha vira aviso acima do conteúdo, e tudo continua montado.
- 🔴 **A resposta CONFIRMADA de uma gravação vira o dado da consulta ANTES da
  releitura** (PR14-15 da revisão final do Codex, 18/09/2026). O PUT da voz
  devolve a leitura depois da escrita (versão nova incluída), e o hook a
  descartava: a tela só reconciliava pelo GET da invalidação. Com esse GET
  falhando, `base` e `versaoLida` ficavam na versão anterior, a edição
  seguinte ia com a versão velha e tomava `VOZ_DIVERGENTE` de um salvamento que
  era dela — e, quando a releitura enfim chegava, o próprio salvamento era lido
  como mudança de terceiros e a saída oferecida era descartar o rascunho. Hoje
  `gravacaoDaVozDaMarca` põe a resposta no cache (`setQueryData`) e só então
  relê; a reconciliação mora em `reconciliarComServidor` (puro, em
  `voz-formulario.ts`), a mesma para a releitura e para a resposta.
  🔴 **O mesmo defeito, pior, estava no `BrandDnaSection`** (varredura por
  classe): o `onSuccess` do PATCH invalidava SEM aguardar e reiniciava os campos
  (`setCarregado(false)`) na mesma hora — do cache ANTERIOR à gravação, mesmo
  com a releitura dando certo. O texto salvo voltava ao antigo na tela, com o
  Salvar aceso para regravá-lo por cima; o componente está nas três casas do DNA
  que o PR 14 criou (DNA legado, DNA visual, crivo). Hoje
  `confirmarGravacaoDoDna` põe no cache as seções do patch com o valor que o
  servidor confirmou (só elas: a resposta traz a linha crua, e o `visualStyle`
  da consulta pode vir do `brandStyleDescription` legado), AGUARDA a releitura,
  e só então os campos reiniciam. Regra para tela nova: gravação confirmada
  nunca pode depender da releitura para a tela saber o que foi gravado.
  Provas em `src/hooks/__tests__/use-aba-marca.test.ts` (QueryClient de
  verdade, as opções do próprio hook, servidor em memória no `fetch` fazendo o
  CAS) e em `voz-formulario.test.ts`. A amarração do efeito `[data]` e o
  `setCarregado(false)` depois do `await` ficam por inspeção.
- 🔴 **A releitura de CONVENIÊNCIA nunca decide se a escrita aconteceu**
  (PR14-16 da revisão FINAL do Codex, 21/09/2026). É o INVERSO do PR14-15 e da
  família de "o registro afirma mais do que sabe": aqui o sistema NEGA o que já
  fez. `salvarVozDaMarca` gravava com `gravarVoz` — escrita CONFIRMADA, versão
  já avançada — e só então chamava `lerVozDaMarca` para montar a resposta;
  falhando essa leitura, o serviço lançava DEPOIS da escrita e a rota devolvia
  500. A cascata: a tela dizia "erro ao salvar", não aplicava a versão nova ao
  cache, limpava o `enviadoRef`, e a tentativa seguinte ia com a versão velha e
  tomava `VOZ_DIVERGENTE` **do próprio salvamento** — com a recuperação
  oferecendo descartar o rascunho. Em cliente migrado, a voz já mandava na copy
  enquanto a tela dizia que falhou. Hoje a resposta é
  `{ gravada: RECIBO, leitura: VozDaMarca | null, leituraFalhou? }`: o recibo
  (versão, `criada` e a VOZ gravada) sai sempre; a releitura é separada e pode
  faltar.
  🔴 **A forma nested é o conserto, não estilo.** Devolver `registro: null` na
  falha seria pior que o 500: `registroParaFormulario(null)` é versão 0 com
  formulário VAZIO, e sem edição local a tela adotaria isso — apagando na tela
  a voz que o servidor acabou de aceitar. **"Não consegui reler" nunca pode ser
  lido como "não há voz".**
  O hook aplica o recibo ao que a consulta JÁ tinha (`registroComRecibo`, puro
  em `voz-formulario.ts`): versão e conteúdo do recibo, `migradaEm` e
  `dnaArquivado` do cache (a gravação não os toca — `gravarVoz` escreve `voz` e
  `versao`, e só), `problemas: []` (só se grava voz que passou no contrato).
  `contexto` e `legado` ficam como estavam: quem manda na copy não muda ao
  gravar, e a invalidação os atualiza quando a leitura voltar. A tela diz que
  salvou E que não conseguiu reler o resto.
  **Varredura da mesma forma nos outros caminhos desta tela e da rota da voz**:
  `PATCH /brand-dna` → `updateBrandDNA` devolve a linha do próprio `upsert`, sem
  leitura posterior; `virarRegraNaVoz` monta `antes`/`depois` do que já tem em
  memória (`registro.voz`, `resultado.voz`) e o `gravarVoz` é a última coisa que
  faz; `virarRegra` (DNA) idem, dentro da transação; `fatos` e `assinatura` são
  só leitura. Nenhum outro ponto lê depois de escrever.
  ⚠️ **Onde a leitura posterior é GARANTIA, não conveniência**: dentro de
  `migrarParaVoz`, as leituras do DNA e dos fatos rodam DEPOIS da trava e ANTES
  de ligar a precedência — elas decidem se a escrita acontece, então falhar ali
  tem de abortar mesmo (`VOZ_DNA_DIVERGENTE`, `VOZ_FATOS_DIVERGENTES`). A
  distinção é a posição: leitura que ANTECEDE a escrita pode derrubá-la; leitura
  que a SUCEDE, nunca.
  Provas: `src/lib/brand/__tests__/aba-marca-recibo.test.ts` (o serviço com os
  dois braços da releitura falhando, mais os controles de `VOZ_INVALIDA` e do
  CAS, que continuam lançando porque a escrita NÃO aconteceu),
  `use-aba-marca.test.ts` (a releitura interna do PUT e o GET falhando juntos:
  a v2 é reconhecida, o rascunho digitado em seguida fica e a edição seguinte
  vai com `versaoEsperada: 2`; e a PRIMEIRA gravação, que sem o recibo deixaria
  a tela na versão 0) e `voz-formulario.test.ts` (`registroComRecibo`). 5
  mutações pegas: tirar o try/catch (2), ignorar o recibo no hook (2), registro
  sem a voz gravada (4), perder `migradaEm`/`dnaArquivado` (1), versão que não
  avança (3).
- **Erro de leitura é erro, não carregamento eterno nem "base vazia"** (PR14-04):
  as três áreas distinguem erro (mensagem + tentar de novo), carregando e
  resultado vazio — "este cliente não tem página de assinatura" só é dito com a
  consulta respondida.
- **Os atalhos de categoria de "Fatos da casa" FILTRAM a base** (`/knowledge?projectId=&category=`, PR14-07): a página lia só `projectId` e todo atalho abria a listagem geral; valor fora do vocabulário é ignorado, e o filtro aparece como chip que se tira.
- **"Fatos da casa" é contagem e prazo, nunca conteúdo** (`resumoDosFatos`:
  `groupBy` por categoria das ACTIVE, o que vence em 14 dias e o que já venceu e
  o cron ainda não arquivou, atalhos para `/projects/[id]/base` e `/knowledge`).
  A prova confere que a resposta não carrega nenhum `content`.
- **As assinaturas listadas são as páginas do template "Assinatura"**
  (`paginasDeAssinatura`, a mesma leitura de `ver-assinatura`), com a miniatura
  só quando ela é publicável — `Page.thumbnail` vira `data:` assim que a página
  é aberta no editor e fica de fora — e o `editorUrl` com o `pageId`.
- ⚠️ **A aba nova não tem teste de UI** (o vitest é só node; os Playwright de
  `tests/e2e/` não a cobrem): a prova cobre a camada que a tela chama e o
  conector; a tela em si é o critério do Ciro (uma edição feita por ele, plano
  §11). O `prisma/generated` deste worktree é
  GERADO LOCALMENTE (não o symlink para o repo principal): o schema daqui tem
  `BrandVoice` e `copyAutoral` (PRs 7 e 3), e o client do repo principal não.

### A migração da voz, por manifesto (PR 13 de "Marca simples, copy melhor", 12/09/2026)

A troca do DNA de texto (5–12 mil caracteres por cliente) pela voz compacta
do PR 7 é decisão do Ciro, cliente a cliente, sobre uma PRÉVIA que ele viu.
Contrato PURO em `src/lib/brand/migracao-da-voz.ts` (com teste); as dez vozes
propostas em `scripts/lib/vozes-propostas.ts`; o script em
`scripts/migrar-voz-da-marca.ts` (dry-run por padrão; `--aplicar --manifesto`
escreve; `--dev` para o branch; em produção exige `--producao`). Prova de
integração no branch de dev: `scripts/validar-migracao-da-voz.ts` (projeto 6;
o registrador de fatos é um stub — `criarEntradaBase` indexa no vetor de
produção). **Nenhum cliente foi migrado**: as prévias reais estão em
`~/Documents/Studio-Lagosta-execucao/marca-e-copy/PR-13/previa-producao/`
com o manifesto em branco, à espera das decisões.

- **A prévia tem VERSÃO de conteúdo** (`versaoDaPrevia`: hash estável do DNA
  de texto + da voz proposta). O manifesto cita a versão aprovada e a
  aplicação BLOQUEIA quando ela mudou por baixo (DNA editado, voz retocada) —
  prévia refeita pede aprovação nova. Nada é adaptado por quem aplica.
- 🔴 **O manifesto é FECHADO e silêncio não é aprovação**: todo cliente é
  `migrar`, `manter-legado` ou `pendente`; `migrar` e `manter-legado` exigem
  `aprovadoPor` + `aprovadoEm`; `lerManifesto` devolve TODOS os problemas.
  `pendente` e `manter-legado` não escrevem nada; cliente já migrado é
  `ja-migrado`.
- 🔴 **Fato vai para a BASE, nunca para a voz.** `fatosNoDna` lista as frases
  do DNA com preço, horário, data ou promoção; só entra na base o que o
  manifesto listar POR EXTENSO (trecho exato da prévia + categoria + título +
  validade), e trecho que a prévia não lista bloqueia. `fatosNaVoz` tem de dar
  VAZIO na voz proposta (é problema, não aviso). Em PROIBIÇÃO e REGRA a palavra
  nua "promoção"/"desconto"/"grátis" é vocabulário proibido, não dado;
  percentual e "leve X pague Y" são dado em qualquer campo; o motivo da regra
  só é lido para preço e horário (ele carrega a data em que a regra nasceu).
  🔴 O rodapé "(AAAA-MM-DD — motivo)" de uma regra aprendida é METADADO e sai
  antes da leitura — lido como frase, toda regra legada virava "fato de data".
- **Cobertura das "Regras aprendidas na prática" é APROXIMAÇÃO declarada**
  (`semelhancaDeRegras` ≥ `LIMIAR_DE_CONFLITO`, o mesmo detector de conflito
  da voz): a prévia diz qual regra/proibição/reescrita da voz fala do mesmo
  assunto e marca o que ficou "sem correspondente" — para a pessoa ver, nunca
  para decidir sozinha.
- **Aplicar**: fatos ANTES da voz (um fato perdido depois de a voz assumir é
  pior que um fato duplicado do DNA), `gravarVoz` com a versão lida (CAS),
  `migrarParaVoz` amarrada a essa versão; erro por cliente volta no resultado,
  sem derrubar os outros. `CATEGORIAS_DE_FATO` é subconjunto de
  `CATEGORIAS_DA_BASE` sem `TOM_DE_VOZ` (identidade nunca volta para a base).
- **A prévia sai de produção ANTES da migration do PR 7 chegar lá**: o script
  tolera a tabela `BrandVoice` ausente (P2021 → sem registro, com aviso); a
  aplicação nesse banco falha em `gravarVoz`, por cliente. A migration entra
  por `db:deploy` com o OK do Ciro — nunca antes do código do PR 7 e nunca o
  código antes do schema.

Da revisão FINAL do Codex sobre o rebase na main de 21/09 (BLOQUEADO, PR13-51,
PR13-52) — as duas com a mesma forma de fundo: **um sinal de exclusão que não
cobre a janela inteira**:

- 🔴 **ESPERAR POR UMA TRAVA NÃO RENOVA O SNAPSHOT.** Em REPEATABLE READ e em
  SERIALIZABLE o snapshot é congelado no PRIMEIRO comando da transação — que num
  protocolo "trava primeiro, lê depois" é o próprio `SELECT … FOR UPDATE`. A
  transação dorme na trava e acorda com ela na mão e o mundo de ANTES nos olhos.
  Foi o que reabriu o PR7-R9-02 quando `migrarParaVoz` ganhou
  `isolationLevel: Serializable` no rebase: `virarRegra` commitava a regra no
  DNA, a migração pegava a trava logo depois e arquivava o DNA VELHO, ativando a
  voz sem enxergar a regra — e como `virarRegra` só BLOQUEIA a linha de
  `Project` (não a atualiza) e não pede serializável, não há erro de atualização
  concorrente para avisar. **O protocolo do PR 7 exige READ COMMITTED**, onde
  cada comando depois da trava tira snapshot novo. Medido no Postgres de dev, a
  mesma intercalação: READ COMMITTED enxerga a regra, SERIALIZABLE não.
  🔴 **E o serializável não substitui a conferência explícita**: ele estava ali
  para pegar quem NÃO toma a trava (`updateBrandDNA` direto, da aba Marca) e
  **não pega** — medido no mesmo banco, a edição solta commita no meio e a
  transação serializável segue e commita, porque um upsert que não LÊ nada não
  fecha ciclo para o SSI. Quem protege é o `dnaEsperado`. Nível de isolamento
  não é trava, e trava não é conferência: se o valor importa, releia-o e
  compare-o sob a trava. A prova é o passo 6v de `validar-migracao-da-voz.ts`,
  com duas conexões reais e a barreira dada pelo BANCO (`pg_blocking_pids`
  confirmando o bloqueio antes de a regra ser commitada) — dublê de teste
  serializa chamadas e **não reproduz snapshot MVCC**.
- 🔴 **`Promise.all` rejeita no PRIMEIRO erro e deixa os outros EM VOO.** Quando
  o que vem depois é soltar uma exclusão, a rejeição não significa que o
  trabalho acabou: em `reindexEntry` um `create` de chunk falhando com erro
  COMUM não marcava `emVoo` (nada foi abortado), o `finally` LIBERAVA o
  arrendamento, e outra execução podia reconstruir a entrada enquanto um insert
  antigo — que não confere o token do ciclo — ainda chegava, deixando chunk
  velho ou estourando a unicidade de `vectorId`. `Promise.allSettled` espera
  TODOS encerrarem e só então propaga a falha. O teto por TEMPO continua sendo
  quem cobre o que trava de vez (`passoArrendado` marca `emVoo` e não libera).
  Vale para qualquer lote de escritas sob arrendamento, trava ou transação.

Da revisão do Codex sobre o primeiro commit (BLOQUEADO, PR13-01…08, 12/09/2026):

- 🔴 **`--dev` trocava só o SQL; o índice de vetores continuava o de PRODUÇÃO**
  (`criarEntradaBase` indexa em `UPSTASH_VECTOR_*`, que vem do `.env`). Hoje
  `resolverBanco` devolve o `destino` (banco + `indexador`: `isolado` só quando
  o `.env.development.local` declara URL e token PRÓPRIOS e a URL é outra;
  `producao`; `ausente`), e `aplicarManifesto` sem registrador injetado BLOQUEIA
  o cliente antes de qualquer escrita quando o indexador não é o do banco
  (`podeIndexar`). Em dev o processo fica SEM `UPSTASH_VECTOR_*` a menos que
  seja isolado. A prova chama o caminho real e confere o bloqueio (PR13-01).
- 🔴 **A ativação confere o DNA na MESMA transação em que liga a precedência**
  (`migrarParaVoz({ dnaEsperado })`, serializável): DNA que mudou entre a
  leitura da prévia e a ativação recusa com `VOZ_DNA_DIVERGENTE` (409), a voz
  fica gravada e NÃO migrada, o legado segue mandando. O `dnaArquivado` é
  exatamente o DNA comparado. Uma edição do DNA que commite depois é, na ordem
  serial, posterior à migração — o mesmo que editar a aba Marca com a voz já
  valendo. Costura `seams.antesDeAtivar` só para a prova (PR13-02).
- 🔴 **Todo fato criado pela migração carrega `metadata.chaveDoFato`**
  (`sha1(projectId|versaoDaPrevia|trecho)`), e `aplicarManifesto` pula o que já
  existe (`fatoJaExiste`, padrão por consulta ao `metadata`): retomar depois de
  uma falha parcial (registrador quebrou no 2º fato, CAS perdido) cria só o que
  falta. O resultado traz `fatosCriados`/`fatosJaExistentes` também no `erro`
  (PR13-03). Reaplicar a mesma prévia depois de `desfazerMigracao` NÃO recria
  fato — é a base datada por prévia, não pelo manifesto.
- **A prévia carrega o `toneOfVoice` e o `contentRules` INTEGRAIS** (`antes`),
  e o markdown os reproduz verbatim em blocos de código: vocabulário, exemplos
  e instruções fora das seções reconhecidas só são revisáveis com o texto
  inteiro ao lado (PR13-05).
- 🔴 **O marcador de lista sai; o número que é conteúdo FICA.** A expressão
  antiga (`^\s*[-*•\d.)]+`) comia "20" de "20% de desconto" e "10" de "10h às
  22h" — o trecho mutilado ia para a prévia como "exato". Hoje só `-`, `*`, `•`
  e `1.`/`1)` com espaço depois (PR13-06). E o rodapé `(data — motivo)` sai POR
  LINHA, antes da divisão em frases, com captura gulosa até o último parêntese
  (motivo com duas frases, aspas e parênteses internos — os três formatos reais
  do Espeto viravam "fato de data" mesmo depois do primeiro conserto, PR13-08).
- 🔴 **Condição operacional é fato, e voz com fato NÃO migra.** `fatosNaVoz`
  passou a pegar a mecânica ("em dobro", "leve X pague Y"), a janela de dias
  ("de segunda a quinta") e o período ("no jantar") em copy e regras — não no
  motivo (história) nem nos TERMOS ("happy em dobro" é o NOME da mecânica, não a
  promessa). `problemasParaMigrar` = problemas do contrato + fatos na voz, e é
  isso que `vozValida` do plano lê: a proposta do TERO perdeu as duas condições
  que carregava (PR13-07). Nunca reintroduza dado numa regra "para explicar".
- **PR13-04 (a regra de 04/09 do Espeto), respondido sem mudar a proposta**: a
  regra que o plano substituiu em 11/09 é "não adicione campos; a copy é feita
  em cima dos campos do template" (compositor); a `regra-2026-09-04-1` da voz é
  a LEITURA CONTÍNUA entre pré-título, manchete e apoio (feedback do Ciro em
  03/09), que o próprio plano formaliza como "grupo de leitura" no PR 1. Ela
  fica ativa; o motivo diz a diferença, e há teste que recusa uma regra ativa
  de "campos do template" na proposta do Espeto.

Da segunda revisão (BLOQUEADO, PR13-09…12, complementos dos anteriores):

- 🔴 **O indexador é ATRIBUÍDO, nunca herdado do ambiente.** `resolverBanco`
  escreve `UPSTASH_VECTOR_*` no `process.env` nos dois modos (produção: o do
  `.env`, por cima do que o processo trouxe; dev: só o isolado, senão apaga),
  guarda a URL validada em `destino.indexadorUrl`, e `podeIndexar` confere na
  hora de aplicar que a URL em uso pelo processo é a validada — um
  `UPSTASH_VECTOR_*` exportado antes mandaria os vetores para outro índice
  com o SQL em produção (PR13-09).
- 🔴 **Uma aplicação por projeto de cada vez**: `aplicarManifesto` toma
  `pg_try_advisory_xact_lock(hashtext('migracao-da-voz:<projectId>'))` numa
  transação que dura até a ativação; quem não consegue é `bloqueado` na hora
  ("trava por projeto"), sem esperar. A chave do fato vive em JSON, sem
  unicidade — duas aplicações simultâneas liam "ausente" as duas e criavam o
  fato e os vetores duas vezes (PR13-10). Os serviços de voz e da base
  escrevem por outras conexões; a transação só segura a exclusão.
- 🔴 **A linha existir não prova o vetor.** `criarEntradaBase` grava a linha e
  indexa depois; interrompido no meio, sobra linha sem vetor. Por isso o fato
  só é `completo` com `metadata.indexadoEm`, gravado DEPOIS de indexar
  (`marcarFatoIndexado`); `estadoDoFato` distingue `ausente` / `incompleto` /
  `completo`, e o incompleto é REINDEXADO pelo mesmo id (`reindexEntry`, que
  apaga chunks e vetores antigos antes de refazer) antes de a voz ser ativada
  (PR13-11). `fatosReindexados` sai no resultado.
- **Condição operacional é fato do DNA também**: `fatosNoDna` usa os MESMOS
  detectores da voz (`dadosProibidos` + `condicoesOperacionais`), então "chopp
  e drinks selecionados em dobro" e "de segunda a quinta, no jantar" aparecem
  na prévia com tipo `condicao` e podem ser citados no manifesto — o que sai
  da voz por ser condição precisa ter porta de entrada na base (PR13-12).

Da terceira revisão (BLOQUEADO, PR13-13…15):

- 🔴 **A trava só vale no MESMO banco das escritas.** `resolverBanco` nunca
  preserva `DIRECT_URL` de outro ambiente (em dev, sem ela no arquivo vale a
  própria `DATABASE_URL` do dev) e aborta se `DIRECT_URL` e `DATABASE_URL`
  forem computes diferentes; `travaPorProjeto` confere `mesmoBanco` antes de
  conectar — trava em outro compute não exclui ninguém (PR13-13).
- 🔴 **A linha com a chave só é reutilizada se ainda for o fato APROVADO**
  (`divergenciasDoFato`: conteúdo, categoria, `ACTIVE`, validade em Brasília).
  Editada ou arquivada, a aplicação BLOQUEIA para decisão antes de qualquer
  escrita — nem reutiliza, nem reindexa por cima (PR13-14). A conferência é
  uma 1ª passada sem escritas; a 2ª passada escreve.
- 🔴 **Toda escrita do corpo confere que a trava continua viva**
  (`trava.conferir()` = `SELECT 1` na transação da trava, antes de cada fato,
  do `gravarVoz` e da ativação): transação expirada lança e a aplicação para
  ali, em vez de continuar por outras conexões sem exclusão (PR13-15). O
  timeout padrão é 60 min; a prova o encurta para 2 s.

Da quarta revisão (BLOQUEADO, PR13-16…18):

- 🔴 **"Mesmo banco" é mesmo compute E mesmo nome de banco** (`nomeDoBancoDe`):
  advisory lock é por banco, e `/neondb` e `/outro_banco` no mesmo compute
  travam coisas diferentes (PR13-16).
- 🔴 **Trecho repetido em `fatosParaABase` é recusado** por `lerManifesto`
  (com as posições) e, como última porta, por `aplicarManifesto` antes de
  escrever: a mesma identidade de fato duas vezes criava duas linhas numa só
  aplicação, com a trava funcionando (PR13-17).
- 🔴 **A trava virou de SESSÃO, sem timeout** (`pg_try_advisory_lock` numa
  conexão própria com `connection_limit=1`, liberada no fim): transação
  expirando liberava a exclusão com o corpo ainda escrevendo. E toda escrita
  LONGA (criar/reindexar fato, que espera embeddings) roda em `trava.vigiar()`,
  uma corrida com a vigilância da conexão: perdida a trava no meio, a escrita
  é abandonada com erro e nada novo começa (PR13-18). Limite declarado: o
  indexador não recebe sinal de aborto — o que já está em voo termina; o que
  se garante é que a aplicação PARA (nenhum fato seguinte, nenhuma voz).

Da quinta revisão (BLOQUEADO, PR13-19…21):

- 🔴 **A trava de sessão exige conexão DIRETA** (`ehPooler`: `-pooler` no host é
  o PgBouncer em modo transação, que não fixa um backend — duas aplicações
  podiam "reentrar" na mesma trava e o unlock rodar em outro backend). URL do
  pooler para a trava é `bloqueado` antes de escrever (PR13-19). A `DIRECT_URL`
  dos dois arquivos de ambiente é direta.
- 🔴 **Conferir a POSSE, nunca "tentar pegar de novo"**: depois de uma reconexão
  a chave pode estar livre, `pg_try_advisory_lock` devolveria `true` por
  ADQUIRIR uma trava nova e a leitura como reentrância seguiria sem exclusão
  (PR13-21). `conferir` compara o `pg_backend_pid()` com o da sessão que tomou
  a trava e confere em `pg_locks` que ela ainda a detém; sessão trocada ou
  conexão caída invalidam a execução.
- 🔴 **A perda da posse ABORTA as escritas internas, e sem compensar**
  (PR13-20): `trava.vigiar(escrita)` entrega um `AbortSignal`; `criarEntradaBase`
  e `reindexEntry` (`src/lib/knowledge/aborto.ts`, puro) o conferem antes de
  cada etapa — apagar chunks/vetores, gravar chunks depois dos embeddings,
  subir vetores — e, abortada, a criação NÃO apaga a entrada (outra aplicação
  pode ter retomado a mesma linha pela chave do fato; ela fica sem a marca de
  indexado, para ser reindexada pelo mesmo id). A marca de indexado nunca é
  gravada por uma execução que perdeu a posse.
- **A prova derruba a sessão da trava DE VERDADE**: o papel do Neon não tem
  `pg_terminate_backend`, então a costura `aoTravar` entrega um `executar` na
  sessão da trava e a prova manda `SET idle_session_timeout = '200ms'` no meio
  da escrita lenta; o servidor encerra a conexão ociosa antes da conferência
  seguinte (o Prisma NÃO reconecta sozinho — a consulta falha), a escrita
  recebe o aborto e nada é anotado. Trava pelo pooler é coberta na 4b'.

Da sexta revisão (BLOQUEADO, PR13-22…23):

- 🔴 **O sinal é conferido ANTES de cada escrita, inclusive as que vêm depois
  de uma espera**: `reindexEntry` confere de novo depois do `deleteMany` (o
  sinal pode ter disparado enquanto ele esperava) e `deleteVectorsByEntry`
  confere entre a consulta e o `index.delete` — uma execução que perdeu a posse
  não pode apagar vetores que outra aplicação já recuperou (PR13-22). Teste com
  o `Index` do Upstash mockado: aborto durante a consulta, zero deletes.
- 🔴 **A marca de indexado confere o sinal DEPOIS da leitura, antes do
  `update`** (`marcarFatoIndexado(db, id, em, signal)`, PR13-23): a marca
  gravada por quem perdeu a trava faria a retomada ler `completo` uma linha que
  outra aplicação ainda reindexa.

Da sétima revisão (APTO COM NOTAS, PR13-24):

- **Data do manifesto é dia que EXISTE** (`diaExiste`, ida e volta pelo ISO
  em UTC — o mesmo cuidado do PR 6 com `dataValida`): `validaAte` e
  `aprovadoEm` aceitavam "2026-13-01" e "2026-02-29" pela expressão regular, e
  a conversão para `Date` só falhava no script, depois de fatos anteriores já
  gravados. `lerManifesto` recusa antes de qualquer escrita.

Da revisão FINAL do PR (BLOQUEADO, PR13-25…26):

- 🔴 **Disponibilidade, programa fixo do dia e dia fechado são CONDIÇÃO da
  casa, não voz** (PR13-25): "HAPPY HOUR TODO DIA" e "QUINTA É DIA DE VINHO"
  (By Rock), "convidar para segunda-feira (a casa está fechada)" (Empório)
  passavam pelos detectores e entravam no prompt — uma mudança de
  funcionamento na base deixava a identidade contradizendo a base.
  `condicoesOperacionais` pega "todo dia"/"diariamente", "<dia> é dia de X" e
  "a casa está fechada"/"não abre"/"fechado aos domingos" ("lista fechada" e
  "menu fechado" não são dia fechado); as propostas trocaram essas frases por
  editorial que só CITA o dia ("Vem de happy hour", "SEXTA NO QUINTAL",
  "QUARTA NO BOTECO", "CHURRASCO DE VERDADE") ou pela regra sem o dado ("dia
  sem funcionamento: os dias em que a casa recebe vêm da base"); as prévias de
  produção foram regeradas e o fato correspondente do DNA aparece nelas com
  tipo `condicao`. O teste das dez propostas roda o detector novo: proposta
  com condição não passa.
- **A retomada por reindexação invalida o cache de busca do projeto**
  (PR13-26), como a criação normal já fazia: sem isso uma busca cacheada no
  intervalo da falha devolvia o resultado sem o fato até o TTL. Best-effort
  (erro vira log), e só quando a posse da trava continua.

Da segunda revisão FINAL (BLOQUEADO, PR13-27…28):

- 🔴 **Refeição ou período AMARRADOS a um dia também são condição da casa**
  (PR13-27): "sugerir jantar de domingo (a casa fecha cedo); prova social de
  domingo sai com a casa fechada" (Seu Quinto), "domingo nada noturno; segunda
  nada de almoço" (TERO), "programação noturna em domingo e segunda" (Quintal)
  e "programação em domingo" (Empório) passavam pelos detectores de PR13-25 e
  iam para o prompt — uma mudança de funcionamento na base deixava a voz
  contradizendo a base. `condicoesOperacionais` pega `<refeição> de <dia>`,
  `<período> em/aos <dia>`, `<dia> nada/sem <período>`, `programação em <dia>`,
  "fecha cedo" e "casa fechada"; as quatro propostas trocaram a frase pela
  regra sem o dado ("período sem funcionamento — dia e horário vêm da base");
  o dia SOZINHO ("SEXTA NO QUINTAL", "Domingou no boteco") continua editorial.
  O teste roda as quatro frases reais (detectadas no DNA como `condicao`,
  recusadas na voz) e a lista de editoriais que têm de passar. As prévias de
  produção foram regeradas.
- 🔴 **O script de prova só encerra o processo DEPOIS do cleanup** (PR13-28):
  `abortar` era `process.exit(1)`, e chamado depois de apagar a `BrandVoice`
  anterior do projeto 6 (pré-requisito de três fatos, trava da concorrência)
  pulava o `finally` que a restaurava. Hoje todo pré-requisito de banco é
  conferido ANTES da primeira mutação (`sairAntesDeComecar`, que ainda pode
  encerrar porque nada foi tocado), e `abortar` LANÇA `ProvaAbortada` — o
  `finally` restaura voz e DNA, e o `main().catch` encerra com o motivo.

Da terceira revisão FINAL (BLOQUEADO, PR13-29…30):

- 🔴 **DISPONIBILIDADE de item, canal e preparo também é condição da casa**
  (PR13-29): "Assunto exclusivo da Praia do Canto (Semifreddo de Pistache…)"
  (Real), "cervejas além da IPA, bebida sem álcool além do café expresso"
  (Wine Vix), "WhatsApp, link de pedido ou botão de compra: não existem"
  (Real), "encomenda só com garçom ou gerente, sem site ou app; sem delivery"
  (Bacana), "(retirada sim)" (Espeto) e "a casa não tem brasa, os cortes são
  grelhados" (By Rock) passavam pelos detectores — cadastrar o item em outra
  unidade, ampliar o cardápio ou abrir um canal na base deixava a voz impondo
  a restrição velha. `condicoesOperacionais` pega exclusividade de unidade
  (`exclusivo da <Nome>`), cardápio restrito a item (`<bebida> além da`),
  canal/serviço afirmado (`<canal>… não existem`, `sem site/app/delivery`,
  `só com garçom`, `retirada sim`) e preparo afirmado (`a casa não tem
  brasa`, `são grelhados`). As seis propostas trocaram a frase pela
  orientação editorial com a condição devolvida à base ("item fora do
  cardápio da base", "canal que a base não registra", "quais itens são
  exclusivos, e de qual unidade, vem da base na data da peça"); o teste roda
  as seis frases reais e as seis redações corrigidas; prévias regeradas.
  A régua que fica: **a voz diz COMO falar; TUDO o que pode mudar com a
  operação (dia, período, item, unidade, canal, preparo, preço) é fato da
  base, e a proposta só pode apontar para a base.**
- 🔴 **O CACHE de busca (Redis) segue a régua do indexador** (PR13-30,
  `isolamentoDoCache`): `--dev` trocava SQL e Vector e herdava o
  `UPSTASH_REDIS_*` do `.env` — criar ou reindexar um fato no dev chamava
  `invalidateProjectCache` e incrementava a versão do cache de PRODUÇÃO. Em
  dev só o Redis PRÓPRIO do `.env.development.local` (URL e token, URL
  diferente da de produção); sem ele as variáveis saem do processo e o cache
  vira no-op limpo. A prova (`apontarParaODev`) faz o mesmo com Redis e Vector.

Da quarta revisão FINAL (BLOQUEADO, PR13-31…32):

- 🔴 **Os detectores são AJUDA de leitura, não o limite do que pode ir para a
  base** (PR13-32): "Aniversário só com bolo próprio… e brinde à escolha" e
  "Todo o cardápio disponível para retirada no balcão" estão no DNA do Espeto,
  nenhum detector os pegava, e o plano recusava o manifesto que os citasse —
  fato literalmente no DNA aprovado sem porta de entrada na base. Hoje
  `EstadoDoCliente.frasesDoDna` traz TODAS as frases do DNA integral da prévia
  (`frasesDoDna`, a mesma leitura de `frasesDe`), e `planoDeAplicacao` aceita
  o trecho que é fato detectado OU frase inteira do DNA; o que não está no
  DNA continua bloqueando. A prévia diz isso no rodapé da lista de fatos.
- 🔴 **Programação em lista fechada, cadastro afirmado e serviço/cortesia
  afirmados também são condição** (PR13-31): "inventar programação além de
  Samba do Canto e Almoço ao vivo" (Seu Quinto) e "telefone (não está
  cadastrado); inventar número" (Empório) foram trocados pela orientação
  ("a programação da casa vem da base", "telefone ou número que a base não
  registra"); `condicoesOperacionais` pega `programação além de`, `além de
  <Nome> e <Nome>`, `não está cadastrado`/`inventar número`, `retirada no
  balcão`/`disponível para retirada`/`brinde`/`cortesia de`. Prévias
  regeradas (Espeto 13 → 16 fatos).

Da quinta revisão FINAL (BLOQUEADO, PR13-33):

- 🔴 **O ESTADO de confirmação de um dado e o CONJUNTO FIXO de unidades também
  são condição da casa** (PR13-33): "os números do site não estão confirmados"
  (Lagosta) e "as DUAS lojas (Praia do Canto e Shopping Vitória)… ambas as
  unidades" (Real) passavam pelos detectores e iam para o prompt — confirmar o
  número na entrada "Provas e números reais" ou abrir/fechar uma loja deixava a
  voz afirmando o estado anterior. `condicoesOperacionais` pega `(não) está/
  estão/foi/foram confirmado(s)` e `já confirmado`, `<número> lojas/unidades/
  casas/endereços/filiais`, `ambas as unidades` e `unidades (Nome e Nome)`. A
  Lagosta ficou só com a EXIGÊNCIA de confirmação na base (número tirado do
  site incluído); a Real, com "todas as unidades vigentes, uma em cada linha;
  quais são as unidades vem da base, na data da peça". "últimas unidades",
  "uma unidade", "essa unidade" e "não confirmado na entrada X da base"
  (exigência, não estado) passam. Teste com as duas frases reais (detectadas
  no DNA — a leitura divide a regra da Real em DUAS frases, e as duas são
  condição — e recusadas na voz) e as redações corrigidas; prévias de produção
  regeradas (Real 11 → 17 fatos, Lagosta 15).

Da sexta revisão FINAL (BLOQUEADO, PR13-34…35):

- 🔴 **SERVIÇO e PREPARO afirmados como identidade também são condição da
  casa** (PR13-34): a reescrita da Bacana ("rodízio" → "no kilo", motivo "a
  Bacana é no kilo, não rodízio") e as do By Rock ("Grelhado na hora, com a
  combinação do dia", "os cortes grelhados") iam para o prompt afirmando o
  serviço e a técnica — mudar isso na base deixava a voz contradizendo a base.
  `condicoesOperacionais` pega `é/somos no kilo|quilo`, `não (é|tem) rodízio`,
  `grelhado na hora` e `cortes grelhados`; as três reescritas viraram
  orientação de linguagem sem o dado ("Monte seu prato do jeito Bacana", "O
  prato com a combinação do dia. É o Roberto Carlos.", "a seção do cardápio
  (os Rock Steaks)"), com "rodízio" mantido nas PROIBIÇÕES (palavra nua é
  vocabulário proibido) e "no kilo" nos TERMOS (nome do serviço). 🔴 **O motivo
  da REESCRITA vai ao prompt e passou a ser lido** — para preço, horário e
  CONDIÇÃO, como o motivo da regra (ele carrega a data em que a reescrita
  nasceu; lido inteiro, TERO e Lagosta viravam "fato de data"). ⚠️ `\b` do JS
  não enxerga acento: detector que começa em "é" ou "não" entra por
  `(?:^|\s)`, nunca por `\b` — com `\b` a frase real da Bacana passava.
- 🔴 **A ativação confere os FATOS aprovados dentro da transação que liga a
  precedência** (PR13-35, `migrarParaVoz({ fatosEsperados })` +
  `conferirFatosEsperados`, puro): a 2ª passada conferia e escrevia as linhas,
  mas entre ela e a ativação a linha podia ser arquivada, editada ou perder a
  indexação — e a voz assumia com a base que a sustenta fora do lugar. Hoje o
  script relê os ids POR CHAVE depois das escritas (o registrador padrão não
  devolve id) e a ativação confere existência, conteúdo, categoria, `ACTIVE`,
  validade e `indexadoEm` na MESMA transação serializável do DNA; divergência
  é `VOZ_FATOS_DIVERGENTES` (409): a voz fica gravada e NÃO migrada, o legado
  segue mandando, e a edição concorrente da linha é PRESERVADA (nada é
  compensado). A prova arquiva um fato já conferido em `antesDeAtivar` e
  confere erro explícito citando a linha, `migradaEm` nulo, precedência legada
  e a linha ainda arquivada. 🔴 **O registrador da prova passou a gravar a
  LINHA REAL** (com a chave e a marca de indexado, sem indexar, com a tag da
  prova que o cleanup apaga): com o stub que só anotava, a ativação não teria
  linha para conferir — e o antigo `entryId: 'stub'` derrubaria a migração.

Da sétima revisão FINAL (BLOQUEADO, PR13-36…37):

- 🔴 **A marca de indexado vale só enquanto os chunks e os vetores que ela
  atesta existem — e a REINDEXAÇÃO os apaga antes de refazê-los** (PR13-36).
  `reindexEntry` (a API administrativa, a edição pela `atualizar-entrada-base`,
  os scripts de reindex) apagava chunks e vetores, e uma falha depois das
  exclusões (embeddings fora do ar) deixava a linha SEM vetor e COM
  `indexadoEm`: a retomada da migração lia `completo`, pulava a recuperação, e
  `conferirFatosEsperados` deixava a voz ativar sem os chunks da busca. Hoje o
  reindexador INVALIDA a marca antes de apagar (preservando `chaveDoFato` e o
  resto do metadata) e só a REPÕE depois de subir os vetores, sobre o metadata
  como está naquele momento e conferindo o sinal de aborto (PR13-23) — quem
  perdeu a posse não a repõe. Entrada SEM a marca não ganha marca ali: quem a
  grava é quem sabe que a indexação inteira fechou (`marcarFatoIndexado`). A
  marca mora em módulo puro da base (`src/lib/knowledge/marca-de-indexado.ts`:
  `temMarcaDeIndexado`, `semMarcaDeIndexado`, `comMarcaDeIndexado`), reexportada
  por `migracao-da-voz.ts`. Teste com o `db` e o indexador mockados (falha de
  embeddings depois das exclusões deixa a linha incompleta; reindexação
  completa repõe a marca com instante novo; aborto durante os vetores não
  repõe) e prova 6w (a marca cai entre a 2ª passada e a ativação → a ativação
  recusa citando "indexação não concluída"; a retomada reindexa pelo MESMO id e
  então ativa).
- 🔴 **A posse é conferida IMEDIATAMENTE antes de `gravarVoz`** (PR13-37): o
  commit O pôs a releitura dos fatos (consultas por OUTRA conexão) entre a
  conferência da 2ª passada e a gravação da voz, e a sessão da trava podia cair
  enquanto elas esperavam — a execução que perdeu a posse ainda criava ou
  incrementava a voz pendente, e outra aplicação que tomou a trava e leu a
  versão anterior falharia no CAS por causa dessa escrita. Prova 6z: a sessão
  da trava é derrubada pelo servidor na 4ª leitura (a 1ª da releitura), a
  conferência antes de gravar falha, a voz não é criada nem incrementada,
  nada é ativado. Regra que fica: **toda escrita do corpo confere a posse
  DEPOIS da última espera e ANTES de escrever** — conferir cedo e escrever
  tarde é o mesmo que não conferir.

Da oitava revisão FINAL (BLOQUEADO, PR13-38…39):

- 🔴 **A posse da trava é conferida DENTRO dos serviços de voz, depois das
  leituras deles e imediatamente antes de escrever** (PR13-38):
  `gravarVoz({ antesDeEscrever })` roda a conferência depois do
  `brandVoice.findUnique` e antes de `create`/`updateMany`;
  `migrarParaVoz({ antesDeEscrever })` a roda DENTRO da transação
  serializável, depois das leituras do DNA e dos fatos e antes de ligar
  `migradaEm`. O script passa `() => trava.conferir()` nas duas chamadas. A
  conferência que ficava só do lado de fora não cobria a janela em que a
  leitura interna espera — a sessão da trava caía ali e o serviço seguia
  escrevendo. Teste em `voz-service-posse.test.ts` (o `Prisma` mockado: o
  client gerado do worktree não resolve em teste).
- 🔴 **A marca de indexado só é publicada por compare-and-set no CICLO**
  (PR13-39, `metadata.cicloDeIndexacao`): quem começa a indexar — a criação
  do fato pela migração (o token vai no `metadata` de `criarEntradaBase`) e
  `reindexEntry` (SEMPRE carimba, com ou sem marca anterior) — grava um token
  próprio; `marcarFatoIndexado(…, ciclo)` e a reposição da marca em
  `reindexEntry` são `updateMany` onde `cicloDeIndexacao = <meu token>`, e
  `count 0` LANÇA ("outra indexação assumiu a entrada"). A API administrativa
  de reindex não participa da trava por projeto: sem o token, ela apagava
  chunks e vetores no meio, a migração atrasada gravava a marca por cima, e
  `classificarFato` lia `completo` uma linha vazia — a voz ativava sem a
  busca. Limite declarado: os vetores da execução perdedora podem subir
  depois (mesmo `vectorId` por chunk — o upsert sobrescreve, não duplica); o
  que a marca atesta continua sendo o ciclo que fechou por último.

Da nona revisão FINAL (BLOQUEADO, PR13-40…41):

- 🔴 **O ciclo que a indexação carimba é o MESMO que quem chama publica**
  (PR13-40): o registrador padrão da migração punha o token A no `metadata`,
  `criarEntradaBase` chamava `reindexEntry` só com o sinal, o indexador gerava
  B, sobrescrevia e devolvia B — descartado — e a marca com A caía no CAS:
  falso "outra indexação assumiu" em TODO fato novo, sem concorrência nenhuma.
  Hoje `criarEntradaBase(…, { ciclo })` entrega o token a `reindexEntry` e
  devolve o ciclo EFETIVO; `criarFatoPeloIndexador` (o registrador padrão,
  exportado e testado com banco e Upstash falsos) publica com ele. Token
  gerado fora e não repassado é o mesmo defeito com outra roupa.
- 🔴 **O token protegia a PUBLICAÇÃO; o ciclo inteiro precisa de EXCLUSÃO**
  (PR13-41): a execução que perdia o ciclo ainda apagava chunks e vetores que a
  seguinte tinha recuperado, e sobrava marca válida sem vetor. A entrada é
  ARRENDADA no próprio `metadata` (`cicloDeIndexacao` + `cicloExpiraEm`,
  `src/lib/knowledge/arrendamento.ts`, sem migration): adquirir é
  compare-and-set no `updatedAt` lido; arrendamento vigente de outro token →
  `IndexacaoEmAndamento` sem tocar em nada (API admin 409, migração
  `bloqueado`); cada passo destrutivo ou de publicação (apagar chunks, o
  `index.delete` DEPOIS da consulta dos ids, gravar chunks, subir vetores, repor
  a marca) RENOVA com o próprio token antes e roda com prazo de 60 s contra 5 min
  de arrendamento — renovação que falha é `ArrendamentoPerdido` e nada mais é
  escrito; o `deleteMany` dos chunks ainda confere o token no próprio DELETE.
  Liberar tira só o prazo (o token fica: é contra ele que `marcarFatoIndexado`
  publica depois do retorno), e passo abortado com a chamada em voo NÃO libera —
  o arrendamento vence sozinho. Limite declarado: a exclusão vale para relógios
  com desvio menor que a folga (~4 min) e para chamadas que respeitam o aborto;
  uma execução morta segura a entrada por até 5 min.

Da décima revisão FINAL (BLOQUEADO, PR13-42…43):

- 🔴 **A edição de campo INDEXADO é coordenada com o arrendamento e recusada
  ANTES de salvar** (PR13-42): `PUT /api/knowledge/[id]` gravava o texto novo e
  só depois chamava `reindexEntry`; com outra indexação em curso, a
  reindexação tomava `INDEXACAO_EM_ANDAMENTO`, a rota engolia e respondia
  sucesso, e o ciclo em curso publicava chunks, vetores e marca do texto
  ANTIGO. Hoje toda porta de edição (a rota, a tool `atualizar-entrada-base`,
  `updateEntry` — rota admin e `confirm`) passa por `editarEntradaCoordenada`
  (`arrendamento.ts`): troca de `content`, `category` ou `status` com
  arrendamento vigente → `IndexacaoEmAndamento` sem escrita (409 legível; na
  tool, `CreativeError` 409). A escrita é compare-and-set no `updatedAt` lido:
  arrendamento adquirido entre a leitura e a escrita faz a edição reler e ser
  recusada. Edição só de etiquetas, validade ou metadata da pessoa continua
  valendo durante o arrendamento.
- **Campo indexado é o que ENTRA no índice**: `content` (chunks), `category` e
  `status` (metadata do vetor). O título não entra em nenhum dos dois — trocar
  só o título durante a indexação passa.
- 🔴 **O metadata da pessoa nunca apaga nem forja o arrendamento**
  (`metadataDaEdicao`): a rota substitui o metadata inteiro, e um PUT com
  metadata no meio de um ciclo apagava `cicloDeIndexacao`/`cicloExpiraEm` —
  outra execução adquiria e PR13-41 voltava. As chaves do sistema vêm sempre da
  linha lida; quando a edição muda o índice, marca, token e prazo SAEM (a marca
  atestava os chunks do texto anterior, e sem o token a `marcarFatoIndexado`
  atrasada de um ciclo anterior é recusada).
- 🔴 **O ciclo indexa o conteúdo lido NA AQUISIÇÃO e confere a versão antes de
  publicar**: `ArrendamentoDaEntrada.indexada` sai da mesma leitura cujo
  `updatedAt` a aquisição carimbou, nunca do `findUnique` anterior; `renovar` e
  `publicarMarca` comparam `versaoIndexadaDe` com a linha e, se uma escrita que
  não passou pelo serviço (SQL direto, script) a mudou, lançam
  `IndexacaoSuperada` (`INDEXACAO_SUPERADA`) antes de gravar chunks, subir
  vetores ou repor a marca. `perdeuOArrendamento` reconhece os dois códigos
  (API admin 409, migração bloqueia, criação não compensa). `liberar` NÃO
  confere a versão: o ciclo superado ainda solta a entrada, senão a
  reindexação da edição esperaria o prazo. Limite: para chunks e vetores a
  conferência é antes do passo, não no próprio write — a proteção primária é a
  recusa da edição; só a marca é atômica (CAS no `updatedAt` da leitura que
  conferiu).
- ⚠️ **Fora da coordenação**: as escritas que apagam vetores e arquivam direto
  (cron `archive-expired-knowledge`, `arquivar-entrada-base`, o DELETE do
  `confirm`) e os scripts com `db.knowledgeBaseEntry.update`. No meio de um
  ciclo, a indexação em curso para por `IndexacaoSuperada` e não ressuscita
  vetores; fora de um ciclo, nada mudou.
- 🔴 **O token da criação é RETIDO desde a própria criação, e a compensação é
  condicionada a ele** (PR13-43): `criarEntradaBase` deixava o ciclo nascer no
  indexador e desfazia por `id`. Com os embeddings de A demorando até o
  arrendamento vencer, B (a reindexação administrativa) assumia e recuperava a
  linha; depois os embeddings de A rejeitavam com erro COMUM — que não passa
  pela renovação e não vira `ArrendamentoPerdido` —, o `finally` ignorava o
  `false` de `liberar()` e a compensação apagava a linha e, em cascata, os
  chunks de B (vetores órfãos). Hoje o ciclo nasce em `criarEntradaBase`, vai
  carimbado no `metadata` da própria criação, e a compensação é `deleteMany`
  onde `cicloDeIndexacao = <meu token>`: `count 0` preserva a linha e lança
  `ArrendamentoPerdido` ("antes de desfazer a entrada…"), com o erro original
  no log. **Erro comum não prova posse; só o DELETE condicionado prova.**
- Testes com banco e Upstash falsos: `edicao-durante-indexacao.test.ts` (chama
  a rota REAL com Clerk mockado) e `indexacao-arrendada.test.ts`. A prova de
  integração (`validar-migracao-da-voz.ts`) não mudou: as edições diretas
  dela rodam fora de ciclo.

**Da revisão do commit b5647079 (BLOQUEADO, PR13-44…45, 12/09/2026):**

- 🔴 **A versão indexada é conferida DEPOIS dos vetores também na entrada sem
  marca prévia** (PR13-44): a conferência posterior ao `upsert` só existia
  dentro de `publicarMarca`, que roda apenas quando `tinhaMarcaDeIndexado`. Na
  entrada nova (`criarEntradaBase`) ou incompleta (retomada da migração), uma
  escrita direta que trocasse o conteúdo ENQUANTO os vetores subiam passava:
  `reindexEntry` devolvia sucesso, `liberar()` não olha a versão, e
  `marcarFatoIndexado` — que confere só o token — publicava a marca sobre um
  cadastro com texto novo e chunks/vetores do antigo. Hoje o ramo sem marca faz
  `arrendamento.renovar('confirmar a versão indexada')`, que confere token e
  versão por compare-and-set, e lança `IndexacaoSuperada` antes de retornar; a
  liberação continua possível com a versão superada. Limite: entre `liberar()`
  e a `marcarFatoIndexado` do chamador não há conferência de versão — a edição
  coordenada tira o token (e a marca é recusada), a escrita por fora não.
- 🔴 **Conflito DEPOIS de salvar não é "Nada foi salvo"** (PR13-45):
  `updateEntry` salvava por `editarEntradaCoordenada` e só então chamava
  `reindexEntry`; outra execução que adquirisse a entrada no intervalo fazia a
  reindexação lançar `INDEXACAO_EM_ANDAMENTO`, e as rotas `confirm` e admin
  respondiam 409 "Nada foi salvo" com a edição GRAVADA — e pulavam a
  invalidação do cache. Hoje `updateEntry` devolve `{ entry, indexacaoPendente }`:
  o único `IndexacaoEmAndamento` lançado é a recusa ANTERIOR à escrita; o
  conflito posterior (`INDEXACAO_EM_ANDAMENTO`/`PERDIDA` — a outra execução leu o
  texto novo —, ou `SUPERADA`) volta em `indexacaoPendente`
  (`indexacaoPendenteDe`, `marca-de-indexado.ts`), e as rotas invalidam o cache
  e respondem **202** com `indexacao: 'pendente'`, `code` e `aviso` ("A edição
  foi salva…"). Os clientes (`ai-chat`, `template-ai-chat`, `useUpdateKnowledgeEntry`)
  tratam 2xx como sucesso. `PUT /api/knowledge/[id]` e a tool
  `atualizar-entrada-base` já separavam as duas etapas (a reindexação pós-edição
  não derruba a resposta) e não mudaram. Erro comum da reindexação segue lançado.
- Testes em `edicao-durante-indexacao.test.ts`: o `aoSubir` sem `indexadoEm`
  pelos registradores reais (`reindexarFatoPeloIndexador` e
  `criarFatoPeloIndexador`) exige `INDEXACAO_SUPERADA` e nenhuma marca; a rota
  real de `confirm` suspensa depois da edição, com outro arrendamento adquirido
  no meio, exige 202, conteúdo novo persistido, o arrendamento alheio intacto e
  o cache invalidado (e o mesmo pela rota admin); a recusa antes da edição
  continua 409 "Nada foi salvo" sem invalidar. Mutação conferida: sem a
  conferência, os dois testes do PR13-44 resolvem; com `updateEntry` e as rotas
  do commit anterior, os dois do PR13-45 recebem 409.

**Da revisão FINAL do Codex sobre 82b763a8 (BLOQUEADO, PR13-46…48, 12/09/2026):**

- 🔴 **O `metadata` de uma entrada da base tem TRÊS donos, e todo escritor mexe
  só no seu** (PR13-47). A confirmação do chat manda `metadata: null` quando a
  prévia não traz metadata, e `metadataDaEdicao` preservava só marca, token e
  prazo — apagava `chaveDoFato`. Como a retomada da migração acha o fato SÓ por
  essa chave (`estadoDoFatoNaBase`), uma edição comum entre a falha parcial e a
  reaplicação fazia o fato ser lido como ausente: outra entrada criada, ou o
  texto anterior à correção da pessoa recriado em vez de bloqueio por
  divergência. Hoje a partição mora em `marca-de-indexado.ts`:
  `CHAVES_DE_IDENTIDADE` (`chaveDoFato`, `origem`, `versaoDaPrevia` — nasce
  com a entrada, vem sempre da linha, SOBREVIVE a toda edição inclusive a que
  troca o conteúdo, e não se forja pelo pedido), `CHAVES_TRANSITORIAS` (marca,
  token, prazo — só o ciclo escreve, e a edição que muda o índice as tira) e o
  resto, que é da pessoa (`metadataDaPessoa`). Os escritores, varridos um a um:
  `editarEntradaCoordenada` (PUT `/api/knowledge/[id]`, `updateEntry` da rota
  admin e do `confirm`, tool `atualizar-entrada-base`) por `metadataDaEdicao`,
  com CAS no `updatedAt`; `indexEntry` (criação pela PESSOA: `confirm` CREATE,
  POST da base e do admin) grava só `metadataDaPessoa`; `criarEntradaBase`
  aceita a identidade de quem cria mas descarta marca e prazo prontos (um
  `cicloExpiraEm` futuro no metadata fazia a própria indexação da criação ser
  recusada); `adquirir`/`renovar`/`publicarMarca`/`liberar` já eram
  leitura-derivação-CAS tocando só as chaves transitórias; `marcarFatoIndexado`
  ver abaixo. Não escrevem metadata: arquivamento (cron, tool, DELETE do
  `confirm`), `migrate-workspace` e os scripts de uma vez só.
- 🔴 **A marca de indexado toca SÓ a própria chave, por compare-and-set no
  `updatedAt` lido** (PR13-48): `marcarFatoIndexado` lia o metadata, conferia
  só o token na escrita e gravava o objeto capturado. Uma edição coordenada de
  metadata no meio não troca o token (não muda o índice), então a marca passava
  e a nota que a pessoa acabara de salvar sumia. Hoje é um laço de até 5
  tentativas: relê, confere aborto e token na leitura, e grava com `updatedAt`
  lido + token no `where`, reconstruindo o metadata a cada conflito.
- **`INDEXACAO_PERDIDA` não promete recuperação** (PR13-46): `ArrendamentoPerdido`
  também sai de cinco conflitos seguidos de CAS com o token AINDA desta
  execução (edições de etiqueta no meio), sem outra execução nenhuma. O aviso
  diz que a edição foi salva e a indexação não concluiu; só
  `INDEXACAO_EM_ANDAMENTO`, que prova arrendamento vigente alheio, fala em
  outra execução indexando o texto novo.
- Testes em `metadata-do-sistema.test.ts`: a migração REAL (`aplicarManifesto`
  com `lerEstadoDoCliente`, `estadoDoFatoNaBase` e o registrador padrão sobre o
  banco falso) falha no 2º fato, a confirmação real edita o 1º com metadata
  omitido, nulo e substituído, e a reaplicação cria só o que faltava; com o
  conteúdo corrigido, bloqueia por "conteúdo editado". Cada escritor contra a
  partição (PUT da base, PUT admin, tool, `confirm` CREATE, `criarEntradaBase`,
  o ciclo no meio e no fim); a marca suspensa depois da leitura com edição de
  metadata no meio preserva a nota, e com troca de ciclo continua recusada; e
  cinco conflitos pela confirmação real respondem 202, invalidam o cache e não
  prometem outra execução. Mutações conferidas: `metadataDaEdicao` do commit
  anterior derruba 9 testes, `marcarFatoIndexado` antigo 1, o aviso antigo 1,
  `criarEntradaBase` sem o filtro 1, `indexEntry` sem o filtro 1.

Da revisão FINAL do Codex sobre 852cf9e9 (BLOQUEADO, PR13-49…50 + C13-01, 18/09/2026):

- 🔴 **Isolamento do Upstash se decide pela IDENTIDADE do endpoint, nunca pela
  string** (PR13-49, P1). `https://PROD.upstash.io` no dev contra
  `https://prod.upstash.io` na produção dava "isolado" por comparação textual, e
  `--dev` escreveria vetores de dev no índice de produção (ou invalidaria o cache
  dela). `podeSerOMesmoServico` compara o hostname normalizado
  (`identidadeDoEndpoint`: minúsculas, IDN, sem ponto final, esquema ausente vira
  https); porta, esquema e raiz ficam fora de propósito — mesmo host é o mesmo
  serviço. URL ilegível de qualquer lado conta como PRODUÇÃO: isolamento só se
  afirma provado. A prova (`validar-migracao-da-voz.ts`) passou a usar a MESMA
  régua (`isolamentoDoCache`/`isolamentoDoIndexador`), em vez de repetir a
  comparação textual.
- **O 202 com `indexacao: 'pendente'` chega à TELA** (PR13-50): os dois chats
  (`/ai-chat` e o chat do template) e a edição do admin liam o JSON só no erro e
  engoliam o aviso. Todos leem a resposta de SUCESSO por
  `avisoDaIndexacaoPendente` (`marca-de-indexado.ts`, puro) e mostram sem
  bloquear — mensagem do assistente no chat, descrição do toast no admin.
- **A identidade de fato só existe em FATO** (C13-01): `origem` e
  `versaoDaPrevia` são do sistema só com `chaveDoFato` na mesma metadata. Entrada
  comum preserva `origem` na criação pela pessoa e a edita como qualquer campo;
  pedido que traz `chaveDoFato` (identidade FORJADA) perde as três chaves; no fato
  de verdade a identidade da linha continua vencendo.
