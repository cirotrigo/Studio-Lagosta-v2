# Lotes duráveis

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### O lote durável: identidade por item e reserva antes da fila (PR 11 de "Marca simples, copy melhor", 12/09/2026)

Repetir uma leva — retentativa do modelo no chat, timeout do conector, retomada
depois de falha parcial — criava Generations e jobs NOVOS: não havia identidade
de lote nem de item. Agora quem chama manda `loteId` + `itemId` estáveis, e a
tabela **`ItemDeLote`** (chave única composta `(projectId, loteId, itemId)`)
responde. Módulos: `src/lib/lotes/identidade.ts` (puro: identidade, hash,
diferenças, decisão) e `src/lib/lotes/reserva.ts` (a ordem das escritas).
Entrada: `enfileirarPeca(spec, { lote: { loteId, itemId } })`; sem `lote`, o
comportamento de sempre. Reaproveita `GenerationJob` — nenhuma fila nova.

- **Mesma chave e mesmo payload = a MESMA Generation e o MESMO job**, sem
  escrever nada (nem a pasta da semana). **Mesma chave com outro payload =
  `LOTE_ITEM_CONFLITO` (409)** com os caminhos que diferem
  (`blocos[headline].linhas`, `nome`), nunca sobrescrita. O retorno por item
  traz `lote: { desfecho: criado | reaproveitado | retomado, situacao: pendente
  | pronta | falhou }` — a situação é LIDA da Generation, nunca guardada na
  linha (`situacao` da linha é só `reservado` | `enfileirado`).
- 🔴 **A reserva é um `create` FORA de transação, de propósito.** Dentro de uma
  transação interativa do Postgres a violação de unicidade (P2002) aborta a
  transação inteira e não dá para ler o vencedor depois. Quem perde a corrida
  toma o P2002 e lê a linha.
- 🔴 **A decisão é tomada DUAS vezes: sem trava (é o caminho de toda repetição)
  e de novo sob `SELECT … FOR UPDATE`**, depois de reler a linha. Sem a
  segunda, duas chamadas concorrentes que viram a linha ainda sem Generation
  criam duas — medido por mutação no teste de concorrência.
- **Generation, job e o vínculo da linha são UM commit.** O único estado
  intermediário possível é `reservado` sem Generation (o processo morreu entre
  reservar e criar, ou a criação lançou e a transação voltou atrás), e ele é
  retomado pela própria repetição, criando só o que falta.
- 🔴 **Dentro da transação da reserva, nunca o `db` global.** Com o pooler do
  Neon o cliente tem `connection_limit=1`: uma consulta por fora espera a
  conexão que a própria transação segura, até estourar o tempo. Por isso
  `enfileirarComposicao(args, tx)` e `enfileirarComposicaoDoPlanoEm(tx, …)`
  aceitam a transação de quem chama.
- **O hash (`lote-v1:<sha256>`) é da spec JÁ validada** — só o contrato e o
  contrato com os blocos derivados são o mesmo pedido. Ficam fora SÓ:
  `projectId` (está na chave) e os carimbos `copyAutoral.origem.em` e
  `copyAutoral.revisoes[].em` (o modelo que remonta a chamada escreve outra
  hora). Atribuição e ficha de concorrência (`decididoPor`, `autor`, `canal`,
  `itemAtualizadoEm`) não moram na spec e nunca entram. `nome` e `quando`
  ENTRAM: persistem com a peça. Mudou a normalização, suba a versão —
  `hashConfere` recalcula o hash do `payload` guardado para linha de versão
  antiga, senão toda repetição de lote antigo viraria conflito.
- **O conflito vence tudo, inclusive a reserva órfã e a peça que falhou.**
  Corrigir a copy de um item que falhou (texto que não coube) sob a MESMA chave
  é 409 — hoje a saída é outro `itemId`. Aceitar revisão depois de falha
  definitiva é decisão de produto em aberto.
- **Peça que falhou (ou sumiu) é retomada com Generation NOVA**; a que falhou
  fica como histórico e `tentativas` conta. Generation COMPLETED sem job é
  reaproveitada (a peça existe); PROCESSING sem job ganha só o job; job
  terminal com a Generation aberta é tratado como falha.
- **Com `itemDePlanoId`, quem cria é o caminho do plano, na MESMA transação**
  (ele pode devolver a Generation que o item já tinha na mesma revisão — aí o
  desfecho é `reaproveitado`). Mas chave VIVA é decidida pela identidade de
  lote antes de chegar ao plano: revisão do item fora da spec (campanha,
  escopo) não gera peça nova sob a mesma chave — revisão nova pede lote ou
  item novo.
- 🔴 **O banco falso do teste precisa distinguir escrita pela transação de
  escrita por fora.** Com um rollback que restaurava TUDO, gravar o vínculo (ou
  a Generation) pelo `db` global dentro da transação passava como atômico —
  a mutação sobreviveu até o falso reaplicar, depois do rollback, o que foi
  escrito fora dela (`src/lib/compositor/__tests__/fila-lote.test.ts`).
- **`gerar-imagem-lote` também tem `loteId`, e é OUTRA coisa**: um UUID gerado
  no servidor para reencontrar as cenas juntas. A identidade daqui vem de quem
  chama e é estável entre chamadas.
- ⚠️ **Exposto no conector só por `compor-leva`** (`loteId`/`itemId`, ver "A
  exposição em `compor-leva`" abaixo). A migration
  `20260912210000_lote_de_composicao` não foi aplicada em lugar nenhum, e
  `db.itemDeLote` só é tocado quando `lote` vem — aplicar o schema antes de
  expor. A prova no branch de dev é `scripts/validar-lote-duravel.ts` (ainda
  não rodada). O agendamento idempotente por item (PR 12) usa esta identidade.

**Da revisão dos commits 1ba1e67f + 9517ac1d (BLOQUEADO, R01–R02, 12/09/2026)**

- 🔴 **A decisão de retomada do lote é PASSADA ao caminho do plano e honrada
  lá.** `reservarItemDeLote` entrega a `criar(tx, { recuperacao })` o que
  `recuperacaoDaDecisao` (puro, `identidade.ts`) extrai da decisão — qual
  Generation morreu e o que falta —, e `enfileirarComposicaoDoPlanoEm` a recebe.
  Sem isso o caminho do plano decidia sozinho e errava nos dois sentidos.
- 🔴 **R01 — job terminal com a Generation aberta vira Generation + job NOVOS**,
  com o item do plano (`na-fila`, `generationId`) e a linha do lote religados
  no MESMO commit. Antes o caminho do plano reaproveitava qualquer job anterior
  sem olhar o status: devolvia o job FAILED como `reaproveitado`/`pendente`, a
  fila nunca o rodava e repetir não mudava nada. Vale também para Generation
  FAILED com o item ainda `na-fila` (a fila não conseguiu reapontá-lo).
- 🔴 **R02 — item em voo (`na-fila`/`gerando`) que só perdeu o job ganha só o
  job**, na MESMA Generation, com `planoRevisao`. Antes caía no caminho normal,
  que recusava com `ITEM_EXECUCAO_CONCORRENTE` porque `na-fila` não é
  executável. **Generation desaparecida é tratada à parte**: o job é procurado
  pelo `item.generationId` (não pela Generation que sumiu) e a peça é refeita.
  `gerando` volta a `na-fila` só porque `caminhoAte` acha o caminho.
- 🔴 **A guarda de revisão ficou intacta.** Com o job, vale `mesmaRevisao` do
  payload; sem o job, a spec e a `planoRevisao` gravadas NA Generation (a
  criação passou a gravá-la em `fieldValues` justamente para isso — Generation
  antiga sem o campo só confere a spec); sem os dois, sobra o vínculo do item,
  que em voo não é editável. Item revisado, `reprovado`, `pronto`, `agendado`
  ou com ficha `itemAtualizadoEm` velha continua recusado sem escrever nada.
- **Sem identidade de lote, nada muda**: `recuperacao` ausente mantém o
  reaproveitamento e as recusas de sempre. Sete mutações conferidas em
  `fila-lote.test.ts` ("correção da revisão (R01, R02)").

**A exposição em `compor-leva` (12/09/2026)**

- **`loteId` na raiz e `itemId` em cada item** (`catalogo/compositor.ts`),
  estáveis em qualquer retentativa. Com eles a porta passa
  `lote: { loteId, itemId }` para `enfileirarPeca`; o `itemId` **nunca entra
  na spec** (`specDe` só copia os campos dela), senão viraria diferença de hash.
- 🔴 **A identidade da leva é conferida INTEIRA antes de enfileirar qualquer
  peça** (`identidadeDaLevaComProblemas`): com `loteId`, todo item precisa de
  `itemId`, válido pelo contrato do lote e único na chamada DEPOIS de aparar
  espaços ("a" e "a " são a mesma chave). **`itemId` sem `loteId` também é
  recusado**, nunca ignorado: quem mandou acha que a leva está protegida
  contra duplicar. Tudo isso é `LOTE_IDENTIDADE_INVALIDA` (400) com a lista de
  problemas, e nada vai para a fila — metade da leva enfileirada e a outra
  recusada é justamente a retomada que a identidade existe para tornar segura.
- **O retorno**: `{ enfileiradas, reaproveitadas, retomadas, falhas, conflitos,
  pecas, nota }`. ⚠️ `enfileiradas` passou a contar só as peças CRIADAS agora;
  a soma das três é o total de `pecas`. Cada peça traz `itemId` (null sem
  lote), `desfecho` e `situacao` (sem lote: `criado`/`pendente`, como antes).
  `LOTE_ITEM_CONFLITO` vai para `conflitos` (`{ indice, itemId, diferencas,
  generationId }`) e **não derruba os outros itens**; qualquer outro erro
  continua em `falhas`. Sem identidade, a chamada é a de sempre.
- **`idempotentHint` continua `false`**: sem `loteId` a chamada cria peças
  novas a cada vez.
- As instruções pedem `loteId`/`itemId` na leva e na etapa 3 da programação
  semanal — **sem exemplo hifenizado ali**: a seção D de
  `validar-registro-mcp.ts` trata toda palavra hifenizada das INSTRUCTIONS
  como nome de tool (os exemplos `semana-2026-09-14` e `seg-19h-happy` ficam
  só nas descrições do schema). Snapshot de `compor-leva` atualizado de
  propósito; testes em `src/lib/mcp/__tests__/compositor-leva-lote.test.ts`.
- ⚠️ **Continua valendo o aviso do PR 11**: a migration
  `20260912210000_lote_de_composicao` precisa estar aplicada antes de alguém
  mandar `loteId` em produção — sem ela, `db.itemDeLote` falha e cada item
  cai em `falhas`.

**Da revisão do commit 8d663918 (BLOQUEADO, R03…R04, 12/09/2026):**

A retomada tinha duas quebras do mesmo desenho: uma comparação que não usava a
normalização do lote e uma decisão tomada antes de uma trava que nunca era
refeita depois dela. A auditoria procurou as duas formas em
`enfileirar-composicao.ts`, `reserva.ts` e `fila.ts`; cada instância achada tem
teste em `fila-lote.test.ts` ("correção da revisão (R03, R04)").

- 🔴 **R03 — no caminho do lote, spec se compara pela normalização do HASH,
  nunca crua** (`mesmaSpecDaPeca`, que usa `mesmoPedidoDoLote` de
  `identidade.ts`). O hash ignora `copyAutoral.origem.em` e `revisoes[].em` e
  aceita a retentativa; o caminho do plano comparava a spec gravada com
  `stableStringify` e recusava com `ITEM_EXECUCAO_CONCORRENTE` um item que
  ninguém revisou — a peça ficava sem job executável. Eram TRÊS pontos: o payload
  do job (retomada com job FAILED), a spec gravada na Generation (job removido)
  e o reaproveitamento de uma SEGUNDA identidade de lote que só muda os
  carimbos. O projeto é conferido À PARTE (o hash o deixa fora), e
  `planoRevisao` continua sendo conferida. **Sem lote nada muda**: a bancada
  segue na comparação crua, com teste.
- 🔴 **R04 — decidir → travar → decidir de novo.** A retomada é decidida sob a
  trava da LINHA do lote, e o caminho do plano toma OUTRA trava (a do item).
  Duas linhas de lote DIFERENTES ligadas à mesma Generation (o
  reaproveitamento permite) seguram travas diferentes, decidem as duas "falta
  job" e disputam a trava do item: a primeira refazia o job, e a segunda caía
  em `criarPecaDoItem` e criava uma Generation duplicada. Hoje o estado é
  re-decidido sob a trava do item com `estadoDaPeca` — a MESMA regra de
  `decidirReserva` depois das checagens da linha, extraída para os dois lugares
  não divergirem. Peça viva de novo (job vivo, ou COMPLETED) vai para o
  reaproveitamento, com a guarda de revisão de sempre; ainda morta, a retomada
  usa o `falta` re-derivado.
- **Variante achada na auditoria**: a peça ficou PRONTA entre as duas travas (o
  job refeito rodou antes de a segunda chamada chegar). Com o item `pronto`, a
  segunda chamada era recusada; com o item ainda `na-fila`, duplicava. As duas
  agora reaproveitam a peça pronta. A variante do job FAILED (as duas linhas
  decidem refazer tudo) já saía certa — o item muda de Generation e a segunda
  chamada cai no reaproveitamento — e ficou coberta como guarda.
- **O que a auditoria NÃO achou**: `reserva.ts` só decide por `hashConfere`
  (normalizado) e já relê a linha sob a trava dela; o caminho sem plano cria
  sempre Generation nova, então duas linhas nunca dividem uma Generation ali, e
  o job é criado por `upsert` na `generationId` única.
- 🔴 **O banco falso tem um modo de travas POR LINHA** (`banco.travasPorLinha`):
  a trava global serializa a transação inteira e por isso não consegue
  reproduzir duas decisões sob travas de linhas diferentes. No modo por linha,
  cada `SELECT … FOR UPDATE` trava a própria linha até o fim da transação, o
  rollback desfaz só o que AQUELA transação escreveu (diário de imagens
  anteriores), e `antesDaTravaDoPlano` é a barreira que segura as duas chamadas
  até ambas terem decidido. Teste de corrida entre linhas diferentes precisa
  desse modo; na trava global ele passa sem exercitar nada.
- **A assinatura mudou**: o 7º argumento de `enfileirarComposicaoDoPlanoEm` é
  `lote?: { recuperacao }`, e a presença do objeto é o que liga as comparações
  do lote. `enfileirarComposicaoDoPlano` (bancada, sem lote) não o passa.
- ⚠️ **Resíduo conhecido**: Generation COMPLETED sem `resultUrl`, ou sem job,
  re-decidida sob a trava do item cai na guarda de sempre (recusa com o item
  fora do executável) em vez de ser reaproveitada; a repetição seguinte
  reaproveita pela decisão da linha. É o mesmo comportamento do caminho sem
  lote.

**Da revisão FINAL do Codex sobre 2d1b5278 (BLOQUEADO, R05…R06, 12/09/2026):**

Terceira rodada na retomada do item de plano, e as três nasceram do mesmo
desenho: ramos por caso, cada um conferindo parte das guardas, e a decisão do
LOTE (tomada antes da trava do item) decidindo se a guarda rodava. A saída foi
trocar os ramos por UMA tabela, avaliada sob a trava do item sobre o estado
RELIDO, para toda entrada no caminho do plano — com ou sem lote, com ou sem a
linha do lote ligada à peça. Módulo PURO `src/lib/planos/decisao-do-item.ts`
(`classificarPecaDoItem`, `confrontarComOGravado`, `decidirNoItemDoPlano`);
`enfileirarComposicaoDoPlanoEm` só lê, chama a tabela e executa a saída.

- 🔴 **R05 — linha de lote NOVA diante de peça que já perdeu o job.** O item
  enfileirado pela bancada ficava `na-fila` com a Generation `PROCESSING` sem
  job; a primeira chamada com lote chegava com `recuperacao: null` (a linha
  ainda não apontava peça nenhuma), o caminho do plano só retomava COM
  recuperação e recusava — e toda repetição recusava igual, com a linha presa
  em `reservado`. Hoje o vínculo da linha **não é entrada**: o que decide é o
  item e a peça dele, e a mesma linha da tabela refaz só o job. O desfecho sai
  `retomado` (`criar` devolve `retomado`, que a reserva respeita).
- 🔴 **R06 — retomada que ignorava a revisão num item EXECUTÁVEL.** A peça do
  lote falha, o item fica `erro`, alguém edita a copy (`atualizarItem` mantém o
  vínculo e leva a `editado`) e a chamada original da leva é repetida: o hash
  aceita o payload antigo, e como `editado` é executável o caminho criava peça
  NOVA com a copy ANTIGA, gravando nela a revisão atual. A conferência de
  revisão só existia no ramo `na-fila`/`gerando`. Hoje, com lote, item
  executável cuja peça não serve e cujo pedido é o mesmo da peça (ou não dá
  para saber) só produz quando a revisão gravada é IGUAL à atual; diferente ou
  desconhecida recusa com 409, sem escrever nada. Sem lote a spec é montada do
  item atual por quem chama, então lá a peça nova continua sendo a resposta.
- **Entradas da tabela** (todas lidas sob a trava): status do item; ficha
  (`itemAtualizadoEm` ausente/confere/diverge); estado da peça (`nenhuma`,
  `sumiu`, `falhou`, `job-terminal`, `sem-job`, `viva`, `pronta`,
  `pronta-sem-arquivo`); `pedido` (a spec de agora contra a GRAVADA — no payload
  do job e, sem job, nos `fieldValues` da Generation; com lote pela normalização
  do hash); `projeto` (à parte, porque o hash o deixa fora); `revisao` (a
  `planoRevisao` gravada contra a do item); `comLote`. **Nada gravado vale
  `desconhecido`, nunca "igual".** O job vem antes da Generation porque a
  Generation COMPLETED pode guardar a spec RESOLVIDA.
- **A tabela** (superada pela do bloco C11-1 abaixo, que acrescenta as linhas
  7b e 9b; em ordem; a primeira linha que casa vence; coluna ausente vale
  qualquer valor; EXECUTÁVEL = proposto/editado/aprovado/erro, EM VOO =
  na-fila/gerando, FINAL = pronto/agendado):

  | # | condição | saída |
  |---|---|---|
  | 1 | status reprovado | recusar |
  | 2 | EXECUTÁVEL e ficha diverge | recusar |
  | 3 | peça viva ou pronta, pedido igual, projeto não diverge, revisão igual | reaproveitar |
  | 4 | FINAL | recusar |
  | 5 | EM VOO e peça nenhuma, viva ou pronta | recusar |
  | 6 | EM VOO e (pedido diferente ou projeto diverge) | recusar |
  | 7 | EM VOO e revisão diferente | recusar |
  | 8 | EM VOO e peça sem job | refazer só o job |
  | 9 | EM VOO (peça sumiu, falhou, job terminal, pronta sem arquivo) | peça nova |
  | 10 | EXECUTÁVEL e peça nenhuma | peça nova |
  | 11 | EXECUTÁVEL sem lote | peça nova |
  | 12 | EXECUTÁVEL e (pedido diferente ou projeto diverge) | peça nova |
  | 13 | EXECUTÁVEL e revisão igual | peça nova |
  | 14 | EXECUTÁVEL (com lote, pedido igual ou desconhecido, revisão diferente ou desconhecida) | recusar |

- **O teste enumerava as 11.664 combinações** (23.328 desde C11-1; `__tests__/decisao-do-item.test.ts`):
  a tabela escrita (colunas cruas, `pedido` e `projeto` separados — derivar "o
  mesmo pedido" no teste repetiria o código) contra a função em código corrido,
  com nenhuma combinação sem linha e nenhuma linha morta; e as invariantes
  (peça nova só onde o item tem caminho até `na-fila`, refazer o job só sem
  job, reaproveitar só peça viva ou pronta). Os dois cenários da revisão
  rodam também pelo caminho REAL, no banco falso com travas por linha: R05 com
  a peça enfileirada sem lote e o job apagado, e R06 com a copy editada pelo
  `atualizarItem` de verdade (o teste troca só `@prisma/client` e
  `agendar.ts`, que o serviço arrasta).
- **O que mudou de comportamento** (oráculo da decisão de 2d1b5278 contra a
  tabela, 39.015 combinações cruas, 3.080 com saída diferente):
  - linha 9 **para toda entrada sem linha ligada** (sem lote e lote novo): peça
    em voo que falhou, sumiu ou ficou pronta sem arquivo era RECUSADA e passa a
    ser refeita; a de linha 8 (sem job) passa a ganhar só o job — é o R05, e
    vale para a bancada também;
  - **job terminal com a Generation aberta deixou de ser reaproveitado em
    qualquer entrada**: antes, sem lote ou com lote novo, o caminho devolvia o
    job FAILED/DONE como peça viva (o R01 só tinha sido fechado para a linha
    ligada); agora vira peça nova (executável ou em voo) ou recusa (final);
  - linha 14: com lote, item executável cuja peça não serve e cuja revisão
    diverge ou não pode ser conferida era produzido e passa a ser recusado —
    é o R06, generalizado para peça sumida, sem job, viva e pronta;
  - linha 3: peça pronta cujo pedido e revisão só estão gravados na Generation
    (sem job) era produzida de novo (executável) ou recusada (em voo, final) e
    passa a ser reaproveitada. Sem job, o `jobId` devolvido é vazio e a linha
    do lote grava `null`, nunca `''`.
- **O vínculo `lote.recuperacao` continua viajando e não entra na decisão.** A
  reserva ainda decide `reaproveitar` pela LINHA antes de chegar ao plano
  (peça COMPLETED ou viva) — sem escrita, sem produzir nada.
- ⚠️ **Resíduo conhecido**: a peça que o "Gerar" da bancada compõe na hora
  (`comporItemAgora`) não tem job nem `planoRevisao`, só a spec nos
  `fieldValues`. Se o item volta a ser executável e alguém repete sob uma chave
  de lote o MESMO pedido daquela peça, a revisão é desconhecida e a linha 14
  recusa; com pedido diferente (a copy editada), sai peça nova normalmente.
- ~~⚠️ **Resíduo conhecido**: reserva ÓRFÃ (linha sem Generation) de um item
  editado depois dela não é detectável — a linha do lote não grava
  `planoRevisao`, e sem peça não há revisão gravada para conferir. Fechar isso
  pede a revisão na linha, que é migration.~~ — **fechado na pré-revisão
  C11-1** (bloco abaixo): a linha grava a revisão do item ao nascer.

**Da pré-revisão do HEAD 50cb40b4 (BLOQUEADO, C11-1, 12/09/2026):**

> ⚠️ **Superado em parte pelo bloco C11-1a…1b logo abaixo**: a revisão gravada
> na linha deixou de ser lida do servidor e vem da CHAMADA (`itemRevisao`), a
> entrada `linha` virou `chamada`, as linhas 10 a 14 viraram uma só, a reserva
> não lê mais a coluna e a linha sem revisão não é mais recusada. O diagnóstico
> do C11-1 e a ordem job → Generation continuam valendo.

- 🔴 **C11-1 — a leva VENCIDA repetida saía como peça nova com a copy antiga,
  pela linha 12.** Cenário real, sem corrida: `compor-leva` com o lote L produz
  G1 para um item de plano (copy v1); G1 falha; a pessoa edita a copy (v2); sai
  G2 pela bancada ou por outra chave (L2), e G2 também não serve (falha, ou fica
  pronta e é reprovada por `regenerar-item`, que mantém o vínculo); o chat
  repete a leva L original (a própria tool manda repetir a chamada inteira). A
  reserva retoma a partir de G1 e, sob a trava do item, a tabela confrontava o
  pedido do lote com a peça ATUAL do item (G2): pedido diferente → linha 12 →
  peça nova com a copy v1, gravada com a revisão ATUAL. Comparar com a peça
  atual não distingue o lote mais NOVO que ela (chave pedida depois da edição:
  legítimo) do lote mais VELHO (a leva vencida). Não era o resíduo declarado:
  a linha estava ligada.
- ~~**A revisão do item mora na LINHA do lote**~~ (a origem do valor foi
  superada em C11-1a — vem da chamada, não do servidor): `ItemDeLote.planoRevisao`,
  migration aditiva `20260913120000_lote_revisao_do_item`
  (`ADD COLUMN IF NOT EXISTS`; a migration do PR 11 não foi editada, por causa do
  checksum no dev). Gravada quando a linha NASCE — `reservarItemDeLote` recebe
  `planoRevisao`, lido do item sem trava por `revisaoDoItemParaAReserva`: é a
  revisão sob a qual o pedido chegou, e a linha que já existia não é reescrita —
  e junto de CADA vínculo: o caminho do plano devolve a revisão sob a qual a
  peça vale, e o `updateMany` do vínculo a grava no mesmo commit.
- 🔴 **Com lote, PRODUZIR exige a linha pedida sob a revisão do item AGORA.** A
  tabela ganhou a entrada `linha` (`confrontarRevisaoDaLinha`: `sem-lote` |
  `igual` | `diferente` | `desconhecido`), que substitui `comLote`. A revisão
  gravada é lida sob a trava da LINHA e usada sob a trava do ITEM; só a própria
  transação regrava a linha. Peça nova e job novo saem só com `sem-lote` ou
  `igual`; o resto é 409 (`revisado`) sem escrever nada. **Linha sem revisão
  gravada vale `desconhecido`, nunca igual**: só existe no branch de dev
  (linhas anteriores à coluna) e é recusada.
- **Reaproveitar NÃO depende da linha**: não produz nada, e a peça devolvida já
  confere com o pedido e com a revisão de agora (linha 3). O vínculo que
  reaproveita regrava a revisão da linha com a da peça — é o que deixa a linha
  antiga retomar DEPOIS a peça da revisão nova que ela adotou.
- **A tabela agora** (em ordem; a primeira linha que casa vence; coluna ausente
  vale qualquer valor; EXECUTÁVEL = proposto/editado/aprovado/erro, EM VOO =
  na-fila/gerando, FINAL = pronto/agendado). Acrescentadas 7b e 9b; a 11 passou
  a ler `linha: sem-lote`; o resto como estava, e as linhas 10 a 14 agora só
  alcançam `linha` igual ou `sem-lote`:

  | # | condição | saída |
  |---|---|---|
  | 1 | status reprovado | recusar |
  | 2 | EXECUTÁVEL e ficha diverge | recusar |
  | 3 | peça viva ou pronta, pedido igual, projeto não diverge, revisão igual | reaproveitar |
  | 4 | FINAL | recusar |
  | 5 | EM VOO e peça nenhuma, viva ou pronta | recusar |
  | 6 | EM VOO e (pedido diferente ou projeto diverge) | recusar |
  | 7 | EM VOO e revisão diferente | recusar |
  | **7b** | EM VOO e linha diferente ou desconhecida | recusar |
  | 8 | EM VOO e peça sem job | refazer só o job |
  | 9 | EM VOO (peça sumiu, falhou, job terminal, pronta sem arquivo) | peça nova |
  | **9b** | EXECUTÁVEL e linha diferente ou desconhecida | recusar |
  | 10 | EXECUTÁVEL e peça nenhuma | peça nova |
  | 11 | EXECUTÁVEL sem lote | peça nova |
  | 12 | EXECUTÁVEL e (pedido diferente ou projeto diverge) | peça nova |
  | 13 | EXECUTÁVEL e revisão igual | peça nova |
  | 14 | EXECUTÁVEL (com lote, pedido igual ou desconhecido, revisão diferente ou desconhecida) | recusar |

- **O teste enumera as 23.328 combinações** (9 × 3 × 8 × 3 × 3 × 3 × 4) contra a
  tabela escrita, sem combinação sem linha nem linha morta, com a invariante
  nova "com lote, produzir só com a linha igual". Oráculo da tabela de 50cb40b4
  contra esta, nas mesmas combinações: **2.976 mudam de saída, todas de
  produzir para recusar, todas com a linha diferente ou desconhecida** (2.496
  executáveis de peça nova, 384 em voo de peça nova, 96 em voo de job novo);
  nenhuma com `sem-lote` ou `igual`. Delas, 840 são a linha 12 com a ficha
  ausente — a forma exata do C11-1.
- **O job é lido ANTES da Generation** onde a tabela junta as entradas
  (`enfileirarComposicaoDoPlanoEm`) e na decisão da reserva (`lerVinculo`). O
  runner fecha a Generation e só depois o job: nesta ordem a peça que fica pronta
  entre as duas leituras não aparece como "job terminado com a Generation
  aberta", que virava peça nova duplicada. No caminho do plano a trava do item
  já bloqueava na prática; na reserva sem plano, nada bloqueava.
- **Resíduo FECHADO**: a reserva órfã (linha sem Generation) de um item editado
  depois dela é recusada — a linha lembra a revisão sob a qual nasceu.
- **O banco falso ganhou `aposLer`** (roda depois de cada leitura de Generation ou
  de job — é o runner terminando entre as duas leituras), e `itemDePlano.update`
  devolve a linha, porque `transicionarItem` (e por ele `regenerarItem`) usa o
  retorno.
- **Provas** em `fila-lote.test.ts`, pelo caminho real com travas por linha: os
  5 passos com a peça nova saindo SEM lote e por OUTRA chave (com o controle:
  repetir L2 com a copy nova produz), a variante 5b com `regenerarItem` de
  verdade, a órfã editada (e o controle sem edição), a linha sem revisão, o
  vínculo que regrava a revisão, e a ordem job → Generation nos dois lugares.
  Mutações sob `scratchpad/pr11-c11/`: tirar a 9b, tirar a 7b, `desconhecido`
  valendo igual, o vínculo sem gravar, a reserva sem gravar, a fila sem repassar
  a revisão e as duas ordens de leitura invertidas — cada uma derruba teste.
- ⚠️ **Pré-existente, NÃO mudado**: o "Gerar" da bancada (`comporItemAgora`,
  `executar-plano.ts`) lê o item fora de trava, compõe sem job nem
  `planoRevisao` e move o item por `transicionarItem` sem compare-and-set;
  concorrendo com uma repetição de `compor-leva` do mesmo item, saem duas peças.
  Fechar exige pôr esse caminho sob a trava do item e pela tabela — não é
  ajuste pequeno. O resíduo do bloco anterior (peça da bancada sem revisão
  gravada) continua como estava.
- ⚠️ **A migration nova vai junto do código**: o `SELECAO` da reserva lê
  `planoRevisao` em toda chamada com lote. No dev, aplicar depois da do PR 11;
  em produção, as duas juntas.

**Da pré-revisão do commit 2c1dfba8 (BLOQUEADO, C11-1a…1b, 12/09/2026):**

- 🔴 **C11-1a — a revisão gravada na linha era a do SERVIDOR na hora da
  reserva, não a de quem montou a spec.** `fila.ts` lia o item ao reservar, e a
  janela entre o chat ler o plano e a `compor-leva` chegar é de MINUTOS (a leva
  inteira é montada no chat enquanto a equipe mexe na bancada).
  - **Cenário A**: o chat lê o item v1, a equipe edita para v2, a chamada chega
    com a spec v1 — a linha nascia com v2, a tabela via `igual` e a linha 10
    produzia a peça v1 carimbada v2.
  - **Cenário B**: essa peça falha, a bancada faz a v2 que também falha ou é
    reprovada, e o chat repete a chamada original — `igual` e pedido diferente
    da peça atual → linha 12 → outra peça v1: o C11-1 de volta.
  - **Variante sem concorrência nenhuma**: a primeira `compor-leva` acaba antes
    de reservar o item, a equipe edita, e a repetição cria a linha já com a
    revisão nova.
  - Os testes do bloco anterior criavam a linha sempre ANTES da edição — por
    isso não viam.
- **A revisão vem de quem montou a spec.** `revisaoDoItem` foi para o módulo
  PURO `src/lib/planos/revisao-do-item.ts` e virou token curto (`rev1:<32 hex>`,
  sha256 do conteúdo canônico). `ver-plano` — e toda tool que devolve item por
  `itemParaChat` (`criar-plano`, `propor-semana`, `editar-item-do-plano`) — traz
  `itemRevisao` por item. `compor-leva` aceita `itemRevisao` por item e a EXIGE
  quando o item tem `itemDePlanoId` e a leva tem `loteId`: a falta é erro DESTE
  item (`falhas`, `codigo: ITEM_REVISAO_OBRIGATORIA`), e os outros seguem;
  `itemRevisao` sem `loteId` é recusada com a identidade (400, como `itemId`).
  `enfileirarPeca` recebe `opcoes.itemRevisao` e, com lote e item de plano,
  recusa sem ela ANTES de reservar (400, nada escrito).
- 🔴 **A linha grava o token DA CHAMADA** — ao nascer e a cada vínculo —, nunca
  uma leitura do servidor. A tabela compara o token da chamada com a revisão do
  item sob a trava; o valor gravado na linha é registro e não entra na decisão
  (a linha antiga sem revisão não trava mais nada). A leitura extra por item
  (`revisaoDoItemParaAReserva`) saiu.
- 🔴 **O token só cobre o que vira spec** (C11-1b): a copy (a lista e o contrato
  sem `origem` e `revisoes`), a foto e as candidatas, o formato, o horário e o
  tema. Legenda, via, direção, ajuste da foto, referências, cliente citado,
  escopo, campanha, status, vínculos e `updatedAt` ficam de fora — mudar só a
  legenda não recusa mais a retomada, e `updatedAt` nunca serviria (muda nas
  transições). É o MESMO valor que o caminho do plano grava no job e na
  Generation (`planoRevisao`): peças do dev gravadas no formato velho contam como
  revisão diferente. Mudou o conjunto de campos, suba a versão do token.
  🔴 **Isto estreita, de propósito, a revisão de 09/09**
  (`docs/RETOMADA-PLANO-SEMANAL-2026-09-09.md`, commit 6892e362), que cobria
  também legenda, via, modelo, direção, referências, ajuste, cliente, escopo e
  campanha, e tinha o teste "mudança de campanha exige outra revisão mesmo com a
  mesma spec". **Decisão CONFIRMADA pelo Ciro em 13/09/2026**: campanha e escopo
  continuam fora do token (mudar só a campanha reaproveita a arte). Campanha e escopo são lidos do ITEM na hora de agendar, não da
  peça: a peça reaproveitada é agendada com a campanha de agora. O teste de
  `fila.test.ts` passou a provar a regra nova — só a campanha reaproveita a peça
  pronta; o tema (que vira spec) pede peça nova. O caminho de composição só roda
  para item de via `compor`, por isso via, modelo, direção, referências, ajuste
  e cliente (que mandam nas vias de IA e de modelo) também não entram.
- **A tabela** (entrada `chamada` no lugar de `linha`, com os mesmos quatro
  valores). 7b e 9b recusam com o motivo NOVO `chamada-vencida`, e as antigas
  10 a 14 viraram UMA linha. A linha 14 recusava o pedido IGUAL ao da peça de
  outra revisão mesmo quando quem chamava tinha relido o item — era o travamento
  do C11-1b —, e com a declaração da chamada ela não protegia mais nada.

  | # | condição | saída |
  |---|---|---|
  | 1 | status reprovado | recusar |
  | 2 | EXECUTÁVEL e ficha diverge | recusar |
  | 3 | peça viva ou pronta, pedido igual, projeto não diverge, revisão igual | reaproveitar |
  | **4a** | (FINAL ou EM VOO) e peça viva ou pronta | recusar (`superada`) — decisão do Ciro, 13/09/2026 |
  | 4 | FINAL | recusar (`avancou`) |
  | 5 | EM VOO e peça nenhuma | recusar (`avancou`) |
  | 6 | EM VOO e (pedido diferente ou projeto diverge) | recusar (`revisado`) |
  | 7 | EM VOO e revisão da peça diferente | recusar (`revisado`) |
  | **7b** | EM VOO e chamada diferente ou desconhecida | recusar (`chamada-vencida`) |
  | 8 | EM VOO e peça sem job | refazer só o job |
  | 9 | EM VOO (peça sumiu, falhou, job terminal, pronta sem arquivo) | peça nova |
  | **9b** | EXECUTÁVEL e chamada diferente ou desconhecida | recusar (`chamada-vencida`) |
  | **10** | EXECUTÁVEL (sem lote, ou com a chamada na revisão de agora) | peça nova |

  Continuam 23.328 combinações (9 × 3 × 8 × 3 × 3 × 3 × 4), sem linha morta.
  Oráculo da tabela de 2c1dfba8 contra esta: **4.320 saídas mudam — 448 de
  recusa para peça nova** (a antiga linha 14, com a chamada igual) **e 3.872 só
  no motivo** (`revisado` → `chamada-vencida`, com a chamada diferente ou
  desconhecida). Nenhuma recusa nova.
- **A recusa diz como sair** (C11-1b). `chamada-vencida` manda reler o item com
  ver-plano, remontar a peça com o conteúdo atual e mandar com um itemId NOVO e
  a itemRevisao nova, e avisa que repetir a mesma chamada é recusado de novo;
  `revisado` (item em voo com peça de outro pedido) manda acompanhar e produzir
  de novo quando ele sair da fila. Em `compor-leva` a falha traz `codigo` e
  `motivo`, e a nota repete o caminho. O caminho indicado PRODUZ — inclusive com
  o pedido igual ao da peça antiga —, e a mesma chave relida com o token novo e o
  MESMO pedido também segue.
- **Reaproveitar continua sem depender da chamada**: a chamada vencida adota a
  peça viva que já é o pedido e a revisão de agora (o vínculo grava o token
  dela); quando essa peça falha, a mesma chamada vencida é recusada.
- **Instruções e registro**: `instrucoes.ts` (leva inteira e etapa 3) manda ler o
  ver-plano ANTES de montar a copy e mandar a itemRevisao; as descrições de
  `ver-plano` e `compor-leva` dizem o mesmo; o fixture de `compor-leva` em
  `validar-registro-mcp.ts` ganhou `itemRevisao` (mudança deliberada). A prova
  do dev (`validar-lote-duravel.ts`) passa a mandar o token (não rodada).
- **Provas**: em `fila-lote.test.ts`, pelo caminho real com travas por linha —
  cenário A (a linha nasce com o token da chamada e nenhuma peça sai; relida, a
  peça v2 com outro itemId sai), cenário B com o estado que a revisão do servidor
  deixava (falha, e reprovação por `regenerarItem`), a variante sem concorrência
  (leva que acaba antes do item), token ausente e só com espaços, a órfã, o
  C11-1b (mensagem, a mesma chamada de novo, itemId novo com o pedido igual), só
  a legenda editada, a linha sem revisão e o vínculo com o token declarado.
  `revisao-do-item.test.ts` (campos dentro e fora), `ver-plano-revisao.test.ts`
  (o token do `itemParaChat` é o da trava) e o handler em
  `compositor-leva-lote.test.ts`.
- ⚠️ **Deploy** (nota da revisão, nada mudado): o `vercel-build` roda
  `prisma migrate deploy || echo ATENCAO…` e SEGUE o build quando a migration
  falha. Sem as migrations, toda `compor-leva` com `loteId` quebra (sem a tabela
  do PR 11 não há reserva; sem a coluna, a reserva não grava `planoRevisao`) —
  as sem lote seguem normais. Aplicar `20260912210000_lote_de_composicao` e
  `20260913120000_lote_revisao_do_item` e CONFERIR o log do build antes de expor
  lotes.
- ⚠️ **O que a declaração não segura**: a chamada que manda o token NOVO com a
  spec montada da leitura VELHA (relê o plano só para pegar o token) produz a
  copy antiga — o contrato é que o token é o da leitura de onde a copy saiu.
  `compor-leva` SEM `loteId` com `itemDePlanoId` não confere nada (é o cenário A
  sem lote, pré-existente: sem identidade, a chamada vale como pedido novo); a
  bancada e o `executar-plano` montam a spec do item na hora. `comporItemAgora`
  segue pré-existente.

**Da prova-dev-4 (18/09/2026): a saída recomendada saía como "retomada", e o Blob derrubou a fila**

- 🔴 **`retomado` é só para a peça que MORREU** (sumiu, falhou, job terminal,
  pronta sem arquivo, sem job). A saída recomendada da peça superada e da
  chamada vencida — item reaberto (`reprovado` → `editado`) ainda apontando a
  arte PRONTA, com itemId novo e a itemRevisao atual — cria peça nova pela
  linha 10, e `enfileirarComposicaoDoPlanoEm` devolvia
  `retomado: peca !== 'nenhuma'`: `compor-leva` respondia `enfileiradas: 0,
  retomadas: 1`, com a nota dizendo que as retomadas "tinham falhado ou se
  perdido" — falso para essa saída. Hoje a peça viva ou pronta SUBSTITUÍDA por
  outro pedido sai `criado`. O caminho sempre produziu (Generation nova, job,
  linha nova com a revisão atual, item `na-fila`); o que mentia era o relato.
  Prova em `fila-lote.test.ts` pelo caminho real (`transicionarItem` e
  `atualizarItem` de verdade), com o controle: a linha NOVA sobre a peça que
  FALHOU continua `retomado`.
- **O resto da prova-dev-4 era o Blob, não o código**: a composição do passo 8
  parou em "Failed to load image" da logo com 403 (o desafio anti-bot), o job
  voltou à fila (tentativa 1/3) e o item ficou `na-fila`; o passo 9 herdou a
  arte "em produção". `validar-lote-duravel.ts` lê cada imagem do Blob uma vez
  por URL, com nova tentativa espaçada (`scripts/lib/leitura-do-blob.ts`, o
  desenho da prova do revisor), e o passo 8 confere também `enfileiradas: 1`,
  `retomadas: 0`.

**Decisões do Ciro (13/09/2026) sobre a repetição de uma leva:**

- **Pedido desatualizado (`chamada-vencida`): MANTIDO.** Item editado depois da
  leitura que montou a peça continua recusado, com o caminho de saída (reler com
  ver-plano, outro itemId, a itemRevisao nova).
- **Campanha e escopo fora do token de revisão do item: MANTIDO** (reaproveita a
  arte) — ver o bloco C11-1a…1b acima.
- 🔴 **Peça superada no plano: continua sem criar nada, mas a resposta INFORMA e
  o chat PERGUNTA.** "Superada" é o item do plano já ter OUTRA arte, mais recente
  que o pedido que chegou. Duas portas, as duas só de leitura:
  - **pela tabela** — linha nova **4a**: item pronto, agendado ou em voo cuja
    peça viva ou pronta não é este pedido (a linha 3 não casou) recusa com o
    motivo `superada` em vez do genérico `avancou`. Os detalhes da recusa trazem
    `arteAtualDoItem` (`descreverArteAtualDoItem`, puro: `generationId`, a página
    — do item, senão da peça —, `feitaEm` e `feitaEmBrasilia`, e a situação em
    palavras: pronta, em produção, falhou, sem arquivo, apagada). Com lote a
    mensagem é a do chat (contar e perguntar); sem lote, a curta.
  - **pela reserva** — a repetição que a RESERVA reaproveita decide pela linha
    do lote e nunca olhava o item: o pedido antigo repetido depois de o item ser
    refeito (pela bancada, por outra leva) devolvia a peça antiga como se fosse a
    do plano. `enfileirarPeca` agora confere o item quando o desfecho é
    `reaproveitado` e devolve `lote.superada` com a arte atual (`fila.ts`,
    `arteQueSuperaAPeca`, leitura sem trava; falha dela vira `null` e a repetição
    segue).
  - `compor-leva` põe as duas em **`superadas`** (`{ indice, itemId,
    arteDestePedido, arteAtualDoItem }`) — nunca em `pecas`, que o chat leria
    como a arte do plano, nem em `falhas`. A nota, a descrição e as INSTRUCTIONS
    mandam contar à pessoa qual é a arte atual e quando foi feita e perguntar:
    manter essa arte, ou refazer com o conteúdo atual do item (ver-plano, outro
    itemId e a itemRevisao atual). Nunca refazer sem ela pedir.
  - **O código continua `ITEM_EXECUCAO_CONCORRENTE`** de propósito:
    `executar-plano.ts` trata esse código, e o motivo novo não muda o que a
    bancada faz.
  - **O que mudou na tabela**: oráculo do HEAD `ca59c39b` contra esta, nas 23.328
    combinações — **2.400 saídas mudam, todas `avancou` → `superada`**, zero
    produção nova. O teste enumera a linha 4a e ganhou a invariante "superada só
    em item final ou em voo com peça viva ou pronta".
  - Provas pelo caminho real (`fila-lote.test.ts`, travas por linha): a recusa
    pela tabela (peça do lote falhou, item refeito com a copy editada e pronto,
    leva antiga repetida → `superada` com a arte atual, nada escrito) e o aviso da
    reserva (peça pronta reaproveitada, item refeito pela bancada →
    `lote.superada`, nada escrito; o controle sem refação não avisa).
- A repetição que mantém a edição da equipe e o rascunho apagado pela equipe são
  do agendamento (PR 12).

**Da revisão FINAL do Codex sobre ebcebab8 (BLOQUEADO, PR11-F01…F02, 21/09/2026):**

- 🔴 **Teste de compatibilidade começa do estado que a versão ANTERIOR grava —
  nunca de uma peça criada pelo código novo** (PR11-F01). A main grava
  `GenerationJob.payload.planoRevisao` como a string do `json-stable-stringify`
  de 15 campos do item (`enfileirar-composicao.ts`, linhas 32–38 e 49 em
  6405bfd5 — único escritor, e só no payload do job COMPOR; nunca em
  `fieldValues`). O HEAD comparava essa string LITERALMENTE com `rev1:<hash>`:
  sempre "diferente", e o mesmo pedido de um item intocado virava `superada`
  (peça viva ou pronta) ou `revisado` (job terminal com o item em voo) depois
  do deploy. O teste de adoção existente criava a peça inicial com o próprio
  HEAD — o método de medição que não podia dar outro resultado.
- **`confrontarRevisaoGravada`** (`revisao-do-item.ts`, puro) reconhece o legado
  SÓ pelos dois conjuntos EXATOS de chaves — o de 15 e o de 14 sem `candidatas`
  (a do 6892e362; os dois entraram na main no mesmo merge, o #115 de 09/09,
  então a produção só rodou a de 15) — e compara os campos que o `rev1` trata
  como conteúdo E o legado capturou (copy, foto, candidatas, formato, quando,
  tema), cada um pelo `stableStringify` da MESMA expressão da main. Os nove que
  o `rev1` exclui de propósito (legenda, via, modelo, direção, ajuste,
  referências, cliente, escopo, campanha) não contam (C11-1b). Qualquer outra
  forma vale como a ausência ("desconhecido"), nunca "igual" por palpite.
- 🔴 **Substitui SÓ a comparação de REVISÃO**: a da spec gravada (`pedido`)
  continua a de sempre, com e sem lote — spec diferente com revisão legada
  igual continua sem ser reaproveitada. O F01 é deixar de recusar o mesmo
  pedido, nunca aceitar pedido diferente.
- 🔴 **Não "resolver" legado transformando toda revisão antiga em
  "desconhecido"**: o job morto de um item cuja copy mudou seria RECUPERADO em
  vez de recusado — trocar um defeito por outro (mutação medida: 10 testes
  caem, inclusive a recusa depois de edição real).
- ⚠️ **Limites declarados** — o legado não tem testemunha para: (1) o contrato
  da copy (`copyAutoral`): a main nunca o pôs na revisão; o TEXTO dele segue
  coberto pelo `copy` (o espelho posicional), e só mudança de ESTRUTURA (voz 2
  declarada, grupo de leitura, função, fatos) depois de um enfileiramento
  legado passa. **Medido em 21/09/2026, só leitura: ZERO contratos gravados em
  produção** (página, arte ou item de plano) — o limite é real, mas vazio.
  Comparar o contrato atual com o `payload.spec.copyAutoral` foi rejeitado: no
  caminho do chat a spec traz o contrato DE QUEM CHAMOU, e daria "diferente"
  falso. (2) as `candidatas`, na versão de 14 chaves: troca só delas passa como
  "igual".
- **As fixtures são a string EXATA que a main grava, escrita à mão** — conferida
  byte a byte contra a expressão da própria main avaliada sobre o mesmo item
  (6405bfd5 para a de 15; 6892e362 para a de 14). No passo 10 da prova o estado
  da main é gravado à mão no branch de dev, com uma régua da fixture contra a
  expressão literal da main.
- 🔴 **Status sem o arquivo não é "pronta"** (PR11-F02). A reserva lia só o
  `status` da Generation e devolvia `reaproveitado/pronta` para peça COMPLETED
  com `resultUrl` nulo: nunca chegava à tabela do plano (que já separa
  `pronta-sem-arquivo`), e cada repetição devolvia de novo a peça sem imagem.
  Hoje `lerVinculo` pede `status` E `resultUrl`, `estadoDaPeca` manda a peça sem
  arquivo à recuperação — onde valem as guardas do plano: item em voo ganha
  peça nova; `pronto`/`agendado` recusa `avancou` — e `GeracaoDaPeca` torna o
  `resultUrl` OBRIGATÓRIO no tipo: leitor que volte a pedir só o status não
  compila. `situacaoDaPeca` diz "pronta" só com arquivo.
- 🔴 **A reconciliação do plano leva a arte COMPLETED SEM ARQUIVO a `erro`, não
  a `pronto`** (varredura do F02, decidido pelo coordenador em 21/09/2026).
  `situacaoPelaArte` (`execucao.ts`, rodada pelo `ver-plano` e pelo GET do
  plano) recebe o `resultUrl` como argumento OBRIGATÓRIO. Sem isso o conserto do
  F02 só valia se ninguém abrisse o plano antes de repetir a leva: abriu, o item
  virava `pronto`, e o lote recusava com `avancou` — justamente o caso comum.
  Vale só nos estados que a reconciliação já move (`na-fila`/`gerando`;
  `agendado` é terminal e nem entra na busca), e o caminho até `erro` é o da
  `caminhoAte`. Em `erro` o item é executável: a leva repetida com o token atual
  (a transição não muda o conteúdo) produz a peça nova. O motivo gravado é "A
  arte terminou sem o arquivo da imagem. Dá para produzir de novo.".
- ⚠️ **Classificação pelo status sem o arquivo, FORA deste PR** (código da main,
  cada um com consequência própria e revisão própria — não mexidos):
  - `fecharJob` (`generation-queue.ts`) espelha COMPLETED em `DONE` sem olhar o
    arquivo: o job da peça sem imagem fecha como sucesso.
  - O "usa esta arte" do `editar-item-do-plano` aceita arte COMPLETED sem
    arquivo e põe o item `pronto` com ela.
  - O carrossel (`carousel-service.ts`) confere o guia e os slides só pelo
    status: o guia COMPLETED sem arquivo libera a confirmação do look, e o
    `ver-carrossel` diz "pronto".
  - **De onde vem a Generation COMPLETED sem `resultUrl`: nenhum produtor no
    código de hoje** — todo caminho que fecha uma Generation como COMPLETED grava
    o `resultUrl` na mesma escrita (compositor/`persist`, runners de IA e da
    melhoria, exports, `finalize`, vídeo, arte enviada, posts), não há
    `updateMany` nem SQL cru pondo COMPLETED, e a limpeza do Blob só troca o
    arquivo pelo backup do Drive quando ele existe. O estado nasce de linha
    antiga, de script ou edição manual, ou de regressão futura: os consertos
    são guarda, não a remoção de um produtor vivo (varredura de 21/09/2026, não
    exaustiva).
- A porta `superadas` da reserva (`arteQueSuperaAPeca`) decide pelo vínculo, não
  pela vida da outra arte (a linha 4a da tabela exige viva ou pronta) — decisão
  aprovada e mantida pelo Codex.
- Varredura das comparações contra dado já gravado, o que foi descartado: o
  hash e a revisão de `ItemDeLote` (tabela nova, sem linha legada; `hashConfere`
  já versionado); a spec gravada (mesma régua da main — cru sem lote, e com
  lote só descarta carimbos, nunca mais estrita); `fieldValues.planoRevisao` (a
  main nunca o gravou: vale como ausência); `fieldValues.pageId` (lido, não
  comparado); o token da chamada (os dois lados são do código novo, e antes do
  deploy o `ver-plano` não o devolvia: `ITEM_REVISAO_OBRIGATORIA`).

### PR 12 — do lote até os rascunhos: agendamento idempotente por item (12/09/2026)

Nada impedia a mesma peça composta de virar dois rascunhos: `agendarPost` não
tem guarda, `agenda-das-paginas` faz check-then-act sem trava e
`colocar-na-agenda` é `idempotentHint: false`. Agora a leva de `compor-leva`
vai à agenda por **`agendar-leva`** (catálogo `compositor.ts`) →
`agendarItensDoLote` (`src/lib/lotes/agendar-itens.ts`), com a decisão no
módulo puro `src/lib/lotes/agendamento.ts`. `ItemDeLote` ganhou `postId`
(+índice), `hashDoAgendamento`, `agendadoEm` e `efeitosDoAgendamentoEm` —
migration `20260913130000_lote_ate_rascunhos` (era `20260913090000`), escrita à mão e **NÃO
aplicada**.

- 🔴 **`agendarPost` virou TRÊS funções compostas sobre o `db`**, com o
  comportamento público igual: `resolverAgendamento(input, { leitor,
  aceitarThumbnail, ingerir })` (leituras e validações, sem escrever),
  `criarPostDoAgendamento(client, r)` e `efeitosDoAgendamento(post,
  contexto)`. Quem agenda DENTRO de uma transação passa a transação como
  `leitor`/`client` — nunca o `db` global (pooler com uma conexão). `parseBRT`
  mudou para o módulo puro `creatives/data-brt.ts` e segue re-exportado.
- **Decisões de produto (revisadas pelo Ciro em 13/09/2026 — ver o bloco no fim desta seção):**
  - **O hash é do PEDIDO efetivo, como feito na primeira vez**
    (`agendamento-v1`): o instante (Brasília e ISO do mesmo minuto são o mesmo
    pedido), o tipo, a legenda, o lembrete, o escopo normalizado e a campanha.
  - **O mesmo pedido devolve o rascunho que existe MESMO que a equipe o tenha
    remarcado ou editado depois** — a edição da equipe vence e nunca é
    revertida. **Confirmado pelo Ciro em 13/09/2026.** Outro pedido sob o mesmo item é `LOTE_AGENDAMENTO_CONFLITO`,
    item a item; os outros itens seguem.
  - **Post apagado da agenda não volta SOZINHO** (`POST_REMOVIDO`), e isso é
    decidido ANTES do conflito — mas desde 13/09/2026 o item AVISA e o
    rascunho volta com a confirmação da pessoa (bloco no fim desta seção).
  - Composição que falhou sob o `itemId` continua na regra do PR 11 (conteúdo
    novo sob a mesma chave é conflito).
- 🔴 **Só se ADOTA rascunho ou agendado.** Post DRAFT/SCHEDULED que já tenha a
  página (criado à mão, pelo editor, por `colocar-na-agenda`) é ligado ao item
  sem criar outro, sem mudar o horário dele (volta aviso). Página que já foi a
  post publicando, publicado ou que falhou é `PAGINA_JA_EM_POST` — criar outro
  seria publicar duas vezes; rascunho que já pertence a outro item é
  `POST_DE_OUTRO_ITEM`. A arte da peça já em `mediaUrls` de outro post: com
  várias mídias é `SLIDE_DE_CARROSSEL`, com uma é `PECA_JA_NA_AGENDA` (a peça
  agendada por `generationId`, sem página).
- 🔴 **A decisão é tomada duas vezes**: sem trava (é o caminho de toda
  repetição, que reaproveita sem escrever) e de novo sob `SELECT … FOR UPDATE`
  na linha do item **E na página**, depois de reler as duas. O vínculo é
  compare-and-set em `postId: null`; post e vínculo são um commit. Medido por
  mutação: sem a releitura sob a trava o par concorrente cria dois posts; sem
  o `postId: null` o vínculo por fora é sobrescrito e o post fica órfão.
- **Os efeitos rodam DEPOIS do commit** e são idempotentes pelo id do post:
  sinais por chave única, artes por URL, pasta por categoria,
  `refilarPaginasDoPost` quando o horário pedido não é o da composição, e o
  item de plano → `agendado` pelas transições válidas (`caminhoAte`,
  best-effort — falha vira aviso). `efeitosDoAgendamentoEm` só é carimbado
  quando tudo rodou: nulo com `postId` preenchido é a chamada que caiu entre
  o commit e os efeitos, e a repetição os refaz sem duplicar nada.
- 🔴 **Imagem atual: no lote, o `Page.thumbnail` só vira a arte RENDERED
  quando É o `resultUrl` da peça E as camadas da página são as do
  `layersSnapshot`** (`thumbnailEhAtual`, `canonico` sobre `lerCamadas`).
  Qualquer dúvida — PNG de outro render, camada editada pelo PATCH avulso que
  não refaz o thumbnail, snapshot ausente, página ilegível — e o post nasce
  PENDING com `nextRenderAt`, para o cron desenhar a página como está.
  ⚠️ **Fora do lote `agendarPost` continua aceitando qualquer thumbnail do
  Blob** (comportamento público mantido de propósito), e o risco do rascunho
  RENDERED com PNG velho segue lá. ⚠️ Página que o autosave apenas
  re-serializou pode sair PENDING à toa: custa um render, nunca publica arte
  velha — a prova mede isso.
- **O tipo sai sempre do formato da peça** (story → STORY, feed e quadrado →
  POST); `postType` explícito que contraria o formato é aceito com aviso. A
  situação é sempre rascunho — publicar é `aprovar-rascunhos`.
- **`simular: true` toma as MESMAS decisões e não escreve nada** (mutação
  conferida). É o que roda em produção antes da chamada de verdade, e as
  instruções mandam mostrar a conta à pessoa primeiro.
- **`agendar-leva` é `idempotentHint: true`** (loteId e itemId obrigatórios —
  a mesma chamada devolve os mesmos rascunhos) e `destructiveHint: false`. A
  leva inteira é validada antes de ler qualquer item
  (`LOTE_IDENTIDADE_INVALIDA`: itemId repetido, data ilegível, chave
  desconhecida). Fluxo da semana nas INSTRUCTIONS: `compor-leva` (loteId +
  itemId) → `ver-geracao` → `agendar-leva` com `simular: true` → de verdade;
  peça avulsa segue por `colocar-na-agenda` com o `pageId`.
- Prova no dev: `scripts/validar-lote-ate-rascunhos.ts` (**ainda não
  rodada**) — semana de 5 com a do meio falhando por texto que não cabe,
  simular sem escrita, repetição, par concorrente, queda entre commit e
  efeitos, adoção, post apagado, conflito, camada editada → PENDING e feed →
  POST. `--producao-somente-leitura` conta em produção dentro de
  `SET TRANSACTION READ ONLY` com as mesmas decisões puras, sem chamar o
  serviço — a garantia de só-leitura é do banco, não da disciplina.
- ⚠️ **Em aberto**: `colocar-na-agenda`, `/agendar` e `agenda-das-paginas`
  continuam sem idempotência nem trava da página; carrossel montado a partir
  do lote não é agrupado (o slide é recusado); e sem a migration aplicada
  cada item de `agendar-leva` cai em falha — aplicar antes de expor.

**Da pré-revisão do HEAD 137616ac (BLOQUEADO, C12-1, 12/09/2026):**

- 🔴 **C12-1 — a peça de lote só vai à agenda quando o ITEM DO PLANO ainda a
  quer.** `agendar-leva` não olhava o item do plano da peça: agendava a arte que
  a pessoa tinha reprovado (ou já mandado refazer) e levava o item a `agendado`
  atravessando `na-fila → gerando → pronto` por `caminhoAte`, sem
  compare-and-set. Como `agendado` é terminal, a reprovação sumia do plano e a
  refação em voo ficava órfã (`reapontarItemDoPlano` recusa item que não está
  mais em voo). Hoje `decidirItemDoPlano` (puro) só deixa passar item que aponta
  ESTA peça (`generationId`) e está `pronto` — ou `agendado` com o MESMO post
  que a chamada liga. Reprovado, reaberto (`editado`/`aprovado` mantêm o
  `generationId` antigo), refeito ou em voo com outra peça é
  `PECA_SUPERADA_NO_PLANO`; item apagado é `ITEM_DO_PLANO_AUSENTE`; já agendado
  por outro post é `ITEM_DO_PLANO_JA_AGENDADO`. Tudo por item, antes de criar o
  post, e os outros itens seguem.
- 🔴 **O item do plano vai de `pronto` para `agendado` por compare-and-set no
  estado LIDO** (`status`, `generationId` e `updatedAt`), nunca por
  `caminhoAte`/`transicionarItem`: para um item reaberto, o caminho encontrado é
  justamente a fabricação de `gerando`/`pronto`. `pronto` é a única origem que a
  tabela aceita para `agendado`. O CAS que não pega vira aviso e o rascunho
  fica; o teste deixa `transicionarItem` lançando de propósito.
- 🔴 **A decisão sob a trava é a MESMA função da decisão sem trava**
  (`decidirEscrita`, recebe o cliente): peça, página (virou modelo?), mídia já
  em outro post, posts da página e item do plano são relidos pela transação.
  Antes só a linha e os posts da página eram relidos, e a mídia que entrasse
  noutro post (por `colocar-na-agenda` com `generationId`) durante a espera
  virava dois posts com a mesma arte. Travas na ordem do PR 11: `ItemDeLote` →
  `ItemDePlano` (quando há) → `Page`.
- **Os sinais dos efeitos descrevem o POST que existe**: legenda, campanha,
  sugestão e origem saem do post, não do pedido do lote. No post criado pela
  chamada dá no mesmo; no ADOTADO, o corpus recebe o que a equipe gravou, e não
  a legenda do lote. ⚠️ Na repetição com efeitos pendentes, se a equipe editou a
  legenda nesse meio-tempo, é a editada que entra — é o post como ele está.
- **Identidade da leva recusa a chamada; campo do pedido falha só o item.**
  `quando` vazio ou ilegível é `DATA_INVALIDA` daquele item; campanha vazia e
  legenda acima de 2200 caracteres são `PEDIDO_INVALIDO`. O schema público de
  `agendar-leva` perdeu o `maxLength` da legenda para isso chegar ao serviço
  (fixture atualizado de propósito). Continuam recusando a leva: `loteId`,
  `itemId` inválido ou repetido, chave desconhecida, 0 ou mais de 60 itens, e
  enum fora do contrato (`postType`, `escopo`) na porta.
- **`idempotentHint: true` fica**, com a razão da pré-revisão: a mesma chamada
  nunca duplica, e a peça que estava pendente e ficou pronta vira rascunho na
  repetição — é o que faltava, não um segundo post. A descrição agora diz isso.
- ⚠️ **Ficaram como estavam, registrados**: a linha já ligada cuja Generation
  foi apagada pela galeria volta `SEM_HORARIO`/`SEM_FORMATO` em vez de
  reaproveitado (nada é escrito, só a mensagem engana); `VERSAO_DO_AGENDAMENTO`
  não tem como recalcular hash antigo (a linha guarda só o hash) — subir a
  versão transforma repetição antiga em conflito; e `registrarArtesDoPost` na
  repetição dos efeitos sobre um post já renderizado não foi conferido.

**Da pré-revisão do commit b63edfb3 (APTO COM NOTAS, C12-1x1…x4, 12/09/2026):**

- 🔴 **C12-1x2 — o item do plano vai a `agendado` NO MESMO commit que cria o
  post, sob a trava do `ItemDePlano`.** Com o compare-and-set nos efeitos,
  depois do commit e fora da trava que decidiu `pronto`: uma reprovação durante
  os efeitos deixava a arte reprovada na agenda só com um aviso, e a invocação
  que morresse antes do CAS deixava o item `pronto` — com o "Agendar" da bancada
  (`/agendar`, sem guarda) criando um segundo rascunho da mesma página. Hoje o
  CAS (status, `generationId`, `updatedAt` lidos sob a trava) roda logo depois
  do vínculo da linha; se não pegar, a transação LANÇA (`RecusaSobTrava`), o
  post e o vínculo voltam atrás e o item recusa com `PECA_SUPERADA_NO_PLANO`.
  "Post, vínculo e item do plano são um commit só." O fechamento da dica de copy
  não quebra com a ordem nova: `fecharDicaDeCopyDoItem` acha o item por id e
  projeto, sem filtro de status. `levarItemDoPlanoParaAgendado` ficou só como
  reconciliação da linha ligada antes disto, com efeitos pendentes.
- 🔴 **Sob a trava vale a peça RELIDA, inteira.** O hash e a entrada do post
  vinham da peça lida antes da trava, e a guarda não comparava o id da peça. A
  guarda agora compara `peca.id`, página e item do plano, e o pedido, o hash e a
  entrada do post são refeitos da peça relida.
- **C12-1x1 — item `na-fila`/`gerando` que já aponta esta peça pronta é
  `pendente`** (`ITEM_DO_PLANO_EM_VOO`, "repita em alguns minutos"), nunca
  falha dizendo que foi reaberto: a fila fecha a Generation dentro da composição
  e só DEPOIS reaponta o item. Em voo com OUTRA peça continua
  `PECA_SUPERADA_NO_PLANO`.
- **C12-1x3 — falha de campo do pedido nunca afirma que nada está na agenda.**
  A mensagem passou a "Nada foi alterado para este item", e a linha do lote é
  lida: com rascunho vivo de uma chamada anterior, a resposta traz o `postId` e
  diz que ele continua na agenda, intacto. O mesmo vale para a linha ligada cujo
  pedido não pôde ser montado (Generation apagada: `SEM_HORARIO`/`SEM_FORMATO`).
- **C12-1x4 — a repetição não recataloga a mídia do post que já tem Generation.**
  Chamada que cai antes dos efeitos + cron `render-stories` desenhando o post
  antes da repetição = `mediaUrls` com o PNG do render, sem Generation, e
  `registrarArtesDoPost` criava uma segunda arte `post-midia` da mesma peça.
  `efeitosDoAgendamento` ganhou `{ registrarArtes }` (padrão `true`: `agendarPost`
  segue igual), e o lote passa `!post.generationId`. O post do lote sempre nasce
  com a Generation da peça; só o post ADOTADO sem Generation ainda é catalogado.
- **A migration foi renomeada para `20260913130000_lote_ate_rascunhos`**: o PR 11
  entra antes e trouxe `20260913120000_lote_revisao_do_item`, e o nome antigo
  (`20260913090000`) ordenava antes dela — a produção aplicaria fora da ordem do
  merge. Mesmo SQL, idempotente: onde o nome antigo já rodou (o branch de dev), a
  nova vira no-op, mas o `_prisma_migrations` fica com as duas linhas — quem
  cuida do dev decide se apaga a antiga.

**Decisões do Ciro (13/09/2026) sobre repetir uma leva no agendamento:**

- **Repetição mantém a edição da equipe: MANTIDO.** Hora, texto e tipo mexidos
  no rascunho não são desfeitos pelo mesmo pedido.
- 🔴 **Rascunho apagado pela equipe: não é recriado em silêncio — o item AVISA e
  só volta com a confirmação da PESSOA.**
  - Sem confirmação, o item volta `falhou` com `POST_REMOVIDO` e
    **`rascunhoApagado: { quando, tema, manchete }`** — o horário do pedido
    original em Brasília ("dd/mm/aaaa, hh:mm"), o tema da spec e a manchete
    (`mancheteDaSpec`, blocos ou contrato, sem os colchetes de destaque). O
    motivo, a nota da tool, a descrição e as INSTRUCTIONS mandam contar à pessoa
    qual era e perguntar. Nada é criado.
  - **O caminho de confirmação é `recriarRascunhoApagado: true` POR ITEM.** Por
    item, e não por chamada, porque a pessoa confirma rascunhos específicos, e
    uma leva repetida pode ter vários apagados que ela não quer de volta. Só o
    booleano `true` literal vale (`recriarApagado !== true` → aviso), mesmo
    molde do `confirmar === true` de `executar-plano`: na porta, `"true"` em texto
    é recusado pelo zod e, no serviço, vira `PEDIDO_INVALIDO` só daquele item. A
    confirmação **não entra no hash** (é autorização, não pedido).
  - **Recriar exige o pedido ORIGINAL** (o mesmo hash): outro horário, tipo,
    legenda, lembrete, escopo ou campanha continua `LOTE_AGENDAMENTO_CONFLITO`,
    agora com o motivo "só volta com o pedido original". Depois de voltar, a
    equipe muda o que quiser na agenda.
  - **Recriar é o MESMO caminho de criar, sob as mesmas travas**, com três
    diferenças: sob a trava a linha tem de apontar ainda o post APAGADO (outra
    chamada que já recriou → `ja-ligado` → `reaproveitado`), o hash é conferido de
    novo contra a linha, e o vínculo é **compare-and-set em `postId: <o
    apagado>`** em vez de `postId: null`. É isso que faz a segunda confirmação
    (em série ou concorrente) não criar outro rascunho. Post rascunho que a
    equipe tenha recriado à mão com a página é ADOTADO, como sempre.
  - **Item do plano `agendado` apontando o post apagado não é "outro
    agendamento"**: `decidirItemDoPlano` recebe `postApagado` e deixa passar, e a
    transação reaponta o `postId` do item para o recriado por compare-and-set
    (status, `postId` apagado, `generationId`, `updatedAt`), no MESMO commit —
    `agendado` continua terminal, só o post muda.
  - Desfecho novo: **`recriado`** (com aviso "voltou para a agenda… porque a
    pessoa confirmou"); `simular` com a confirmação devolve `recriado` sem
    escrever nada.
  - O schema público de `agendar-leva` ganhou o campo, e o fixture de
    `validar-registro-mcp.ts` foi atualizado no mesmo commit, de propósito.
  - ⚠️ `scripts/validar-lote-ate-rascunhos.ts` continua conferindo só o
    `POST_REMOVIDO` (código inalterado) e **não exercita a confirmação** — a prova
    no dev fica para a próxima rodada.
- 🔴 **Peça superada no plano: continua sem criar nada, INFORMA a arte atual e o
  chat PERGUNTA.** Quando o item já aponta OUTRA arte (`item.generationId` ≠ a
  peça), `decidirItemDoPlano` devolve `superadaPor` e o serviço lê a arte
  (`descreverArteAtualDoItem`, do PR 11): **`arteAtualDoItem: { generationId,
  pageId, feitaEm, feitaEmBrasilia, situacao }`**. O motivo manda contar à
  pessoa qual é e quando foi feita e perguntar: manter essa arte (agendá-la pela
  página dela quando estiver pronta) ou refazer com o conteúdo atual do item
  (ver-plano, `compor-leva` com outro itemId e a itemRevisao atual). Item
  reaberto SEM arte nenhuma não inventa uma: motivo próprio, sem
  `arteAtualDoItem`. Reprovado e reaberto com a MESMA peça seguem com os motivos
  de antes.
- **Pedido desatualizado (`chamada-vencida`) e campanha/escopo fora do token**:
  mantidos, no PR 11.

**Da revisão FINAL do Codex sobre 7755e7e9 (BLOQUEADO, R12-01…R12-06, 18/09/2026):**

- 🔴 **R12-01 — a miniatura só é a arte da página na VERSÃO VISUAL que o PNG
  desenhou.** `thumbnailEhAtual` comparava só as camadas com o
  `layersSnapshot`; o PATCH que muda só a largura, a altura ou o fundo (camadas
  e miniatura iguais) passava, e o rascunho nascia RENDERED com o PNG velho.
  Hoje quem renderiza a página (`renderPageAndRegister` e a recomposição) grava
  `fieldValues.versaoRenderizada` (o `versaoDaPagina`: dimensões, fundo e
  camadas) no MESMO patch da URL, e o lote compara com a versão da página agora.
  Arte sem o registro (renderizada antes disto) sai PENDING e o cron redesenha —
  refazer é barato. **Escritor novo de PNG de página grava a versão junto.**
- 🔴 **R12-02 — efeito que "nunca lança" precisa DIZER que não terminou.** A
  captura engole o erro do banco e devolve `null`; a pasta da semana, a
  refilagem e o catálogo das artes engolem e devolvem vazio — e o lote
  carimbava `efeitosDoAgendamentoEm` por cima, então a repetição nunca mais
  refazia o sinal, a pasta ou a arte que faltou. Hoje os sinais devolvem
  `true`/`false` (só o `true` afirmado conta), `Movimentacao`, `Refilagem` e
  `RegistroDeArtes` trazem `falhou`, `efeitosDoAgendamento` devolve `falhas`
  (`agendarPost` ignora — lá não há repetição a orientar), e o lote só carimba
  com a lista vazia, avisando o que faltou. A reconciliação do item do plano
  deixa o erro do banco subir (engolido, virava aviso e carimbo, e o item ficava
  `pronto` para sempre). E `fecharDicaDeCopyDoItem` devolve `erro` quando o
  desfecho da dica não foi gravado — antes voltava `fechada`, e a rota de
  desfecho respondia `ok: true`. **Quem carimba "terminou" sobre funções que
  engolem erro lê o retorno delas.**
  ⚠️ Fica sem cobertura, por degradar sem perder: `slideDaPagina` e
  `temaDaPagina` (a ordem e o nome caem no fallback) e o `ensurePostGeneration`
  dentro do catálogo (cai no registro `post-midia`).
- **R12-03 — objeto aninhado no catálogo MCP é `.strict()` onde a chave errada
  muda o resultado.** `definirTool` fecha só a raiz, e o zod aninhado DESCARTA a
  chave desconhecida: `horario` num item de `agendar-leva` sumia e o rascunho
  nascia no horário da composição. Varredura: no diff deste PR só os itens de
  `agendar-leva`. ⚠️ Fora dele continuam descartando em silêncio: `bloco`,
  `camadaExtra`, `preferencias` e o arranjo fixado de `compor-arte`, e os itens
  de `compor-leva`.
- **R12-04 — a conta de produção da prova É a decisão do serviço.** Ela
  reimplementava a decisão pela metade (sem item do plano, sem mídia em outro
  post, sem post de outro item). `agendarItensDoLote` aceita `leitor` — só com
  `simular: true` (`LEITOR_SO_EM_SIMULACAO`, 400) — e a prova passa a transação
  `READ ONLY`: a garantia de só-leitura continua sendo do banco. Sem a migration
  do PR 12 aplicada, a conta por item não é feita.
- **R12-05 — o horário do rascunho apagado é o do pedido ORIGINAL, ou nenhum.**
  A linha guarda só o hash do pedido; o pedido desta chamada só prova o horário
  quando tem o MESMO hash. Com outro horário (19h apagado, 21h pedido) saía o
  21h como identificação do rascunho removido; hoje sai `quando: null`, e o
  `quando` da spec também não serve.
- **R12-06 — o post que o lote devolve nem sempre é rascunho.** O lote adota
  post agendado, e a repetição devolve o post como a equipe o deixou
  (aprovado, publicado). Cada item concluído traz `estadoDoPost` (`rascunho`,
  `agendado`, `publicando`, `publicado`, `falha-na-publicacao`) e
  `entregueParaPublicar` quando o post já tem `laterPostId`; a nota de
  `agendar-leva` só promete "nada publica até aprovar-rascunhos" para o que é
  rascunho. O aviso de adoção e o `POST_DE_OUTRO_ITEM` deixaram de chamar post
  agendado de rascunho.
- Provas: `agendar-itens.test.ts` (as capturas, a refilagem e a pasta REAIS com
  o banco falso caindo; o catálogo; o item do plano; o leitor somente leitura
  que lança em escrita e no `db` global; o rascunho apagado com outro horário;
  o post agendado adotado e aprovado), `efeitos-do-agendamento-falha.test.ts`
  (a dica de copy até o `registrarDesfecho`), `artes-do-post-falha.test.ts`,
  `versao-renderizada.test.ts`, `agendamento.test.ts` e `agendar-leva.test.ts`
  (a porta real e a nota). Cada correção desfeita por mutação faz a sua prova
  falhar.

**Do restack sobre o PR 11 (21/09/2026): o laço `superada` → `PECA_AUSENTE`, e a observação que a leva não leva:**

- 🔴 **A linha cuja peça não serve (não existe, sumiu ou falhou) e cujo pedido
  nasceu de item de plano pergunta ao ITEM antes de mandar compor.** A
  compor-leva repetida recusa como `superada` (linha 4a da tabela do PR 11)
  quando o item já está pronto, agendado ou em voo com OUTRA arte viva ou
  pronta — e o agendar-leva respondia `PECA_AUSENTE` ("componha com compor-leva
  antes de agendar") ou `PECA_FALHOU` ("repita compor-leva"): instrução que
  levava de volta à mesma recusa. Hoje `superadaNoPlanoSemPeca` (puro,
  `agendamento.ts`) espelha a 4a, e o item volta `PECA_SUPERADA_NO_PLANO` com
  `arteAtualDoItem` e o motivo que manda contar à pessoa e perguntar (decisão do
  Ciro, 13/09/2026) — nada é criado. A nota de `agendar-leva` já dispara por esse
  par; a descrição da tool já prometia "refeito volta como
  PECA_SUPERADA_NO_PLANO", então o schema e o fixture não mudaram.
- **O item vem do PAYLOAD da linha, não da Generation**: a linha que a
  compor-leva recusou não tem peça nenhuma, mas o pedido (com `itemDePlanoId` e
  `planoId`) está gravado nela. E o job é lido ANTES da Generation, como na
  tabela do plano — o runner fecha a Generation e só depois o job; na ordem
  inversa, a arte que fica pronta entre as duas leituras parece "job terminado
  com a Generation aberta" e a resposta volta a mandar compor.
- `PECA_AUSENTE`/`PECA_FALHOU` continuam valendo para a peça que de fato não
  existe ou falhou num item que a compor-leva ainda PRODUZ (executável, ou sem
  item de plano) — aí "componha de novo" leva a algum lugar. A paridade com a
  tabela é enumerada no teste: o espaço inteiro de `decidirNoItemDoPlano`, menos
  a linha 3.
- ⚠️ **Simplificação declarada**: o agendamento não compara o pedido da linha
  com o da arte do item. Quando é o MESMO pedido (a linha 3, em que a compor-leva
  reaproveitaria), a resposta diz "superada" e aponta a arte atual — que tem a
  mesma copy; "manter a arte atual" é o desfecho certo do mesmo jeito.
- ⚠️ **Residuais, com a saída na própria recusa da compor-leva**: item
  reprovado (`reprovado`), item pronto, agendado ou em voo cuja arte já não está
  viva nem pronta (`avancou`, `revisado`), chamada vencida (`chamada-vencida`) e
  item de plano apagado seguem com `PECA_AUSENTE`/`PECA_FALHOU` — a compor-leva
  repetida recusa com o motivo e o caminho de saída dela.
- 🔴 **Lacuna conhecida: lembrete criado pela leva sai sem observação.**
  `agendar-leva` não aceita `observacao` (decisão de 21/09/2026: não entra
  agora), e é ela que o lembrete de publicação manual manda no WhatsApp. Para
  lembrete com observação, `colocar-na-agenda` ou editar o post depois.
- Provas: `agendar-leva-peca-superada.test.ts` (o caminho real — `enfileirarPeca`
  do PR 11 com a reserva e a tabela, depois `agendarItensDoLote` na MESMA linha:
  linha sem peça, peça que falhou com o item refeito, arte em produção lida pelo
  job, a ordem job → Generation, e os três controles de peça ausente ou falha de
  verdade), a paridade em `agendamento.test.ts` e o passo 18 da prova de
  integração (escrito, ainda não rodado). Mutações: sem o gancho derruba 4
  testes; só pelo vínculo, 5; o item lido da Generation, 1; sem o job, 1; a
  Generation antes do job, 1; reprovado tratado como superado, 1; só
  `PECA_AUSENTE`, 3.

**Do segundo restack sobre o PR 11 (d723110b, 21/09/2026): arte sem arquivo não é peça pronta:**

- 🔴 **Peça COMPLETED sem `resultUrl` não vai à agenda** (`PECA_SEM_ARQUIVO`,
  alinhado ao PR11-F02). `decidirAgendamento` decidia a peça só pelo status e
  agendava a página dela como rascunho PENDING — mas a reserva do lote RETOMA
  essa peça como retoma a que falhou (Generation nova), então o post ficava numa
  peça que a compor-leva seguinte substitui: a linha com `postId` na página
  velha e `generationId` na nova. E, com a reconciliação do 9e908105, o item em
  voo com essa arte vai a `erro` no `ver-plano`, e o agendar-leva caía no "foi
  reaberto… agende quando a arte nova estiver pronta" sem nada em produção.
  Hoje o `resultUrl` é OBRIGATÓRIO no tipo da peça (quem esquecer de lê-lo não
  compila), a recusa vem logo depois de `PECA_FALHOU` — antes do pedido e da
  página — e o motivo manda repetir a compor-leva com o mesmo item, que a retoma
  (peça solta: `retomado`; item em voo ou em `erro`: peça nova).
- **A checagem de superada já não lia "pronta" sem arquivo**
  (`classificarPecaDoItem` devolve `pronta-sem-arquivo`, e
  `superadaNoPlanoSemPeca` só aceita viva ou pronta — item pronto com a arte sem
  arquivo fica em `PECA_AUSENTE`, como a compor-leva, que recusa `avancou`, não
  `superada`). Agora ela também cobre a peça da LINHA sem arquivo
  (`PECA_QUE_NAO_SERVE`).
- ⚠️ **Mudança de comportamento**: antes, a peça sem arquivo virava rascunho
  PENDING pela página. ⚠️ **Residual**: item `pronto`/`agendado` apontando a
  própria peça sem arquivo (o que a reconciliação antiga e o "usa esta arte"
  produziam) — a compor-leva repetida recusa `avancou`. Estado sem produtor no
  código de hoje (varredura do PR 11).
- Provas: `agendar-leva-peca-superada.test.ts` (peça solta sem arquivo e a
  retomada; peça de item de plano sem arquivo em voo e depois da reconciliação
  REAL por `situacaoPelaArte`; item pronto com a arte sem arquivo; linha sem
  arquivo com o item refeito → superada) e os fixtures de `agendamento.test.ts`,
  que davam peça pronta sem arquivo. Mutações: sem a recusa, 4 testes; o gancho
  sem `PECA_SEM_ARQUIVO`, 1.

**Da revisão FINAL do Codex sobre a4f678d4 (BLOQUEADO, R12-07…R12-08, 21/09/2026):**

- 🔴 **R12-07 — o link de edição sai do template ATUAL da página, relido na hora
  de responder.** `moverPaginaParaSemana` e `refilarPaginasDoPost` mudam
  `Page.templateId` e NÃO tocam no post, e `concluido` preferia
  `post.templateId` (e, sem ele, a página lida ANTES dos efeitos): o `editUrl`
  abria a pasta anterior, o editor não achava o `pageId` ali e caía na
  primeira página daquele template (`multi-page-context.tsx`) — outra arte. A
  repetição mantinha o link errado. Hoje `concluido` lê a página pelo
  `ctx.leitor` (a transação READ ONLY na conta de produção) em TODO caminho que
  responde concluído: a criação e a adoção depois dos efeitos, o
  reaproveitamento (com ou sem efeitos pendentes) e a adoção simulada. Página
  que não existe mais (ou é de outro projeto) sai SEM link — nunca um template
  que abriria outra página. O post não é reescrito.
- ⚠️ **O mesmo defeito vive FORA do PR, na main**: o "Editar Template" da
  agenda (`post-detail-view.tsx:1066` e `:1122`) monta o link com
  `post.templateId` + `post.pageId`, e os dois efeitos acima deixam o
  `SocialPost.templateId` para trás — inclusive o do `agendarPost`, que cria o
  post com a pasta lida antes de mover a página. A arte que o catálogo registra
  (`post-midia`, e a `post-schedule` de `ensurePostGeneration`) também nasce no
  balde `post.templateId`. Não consertado aqui: é frente própria.
- 🔴 **R12-08 — o vínculo da capa não prova que o catálogo terminou.** O lote
  passava `registrarArtes: !post.generationId`: a execução que caía no meio do
  catálogo (a capa vinculada por `ensurePostGeneration`, a 2ª mídia sem
  registro) deixava o post COM `generationId`, e a repetição pulava o catálogo
  INTEIRO e carimbava `efeitosDoAgendamentoEm` com o slide 2 sem Generation.
  Hoje a opção é `pularCapaVinculada` (`registrarArtesDoPost` e
  `efeitosDoAgendamento`): só a mídia do índice 0 de post que JÁ tem
  Generation fica de fora — é a proteção do C12-1x4 contra recatalogar o PNG
  que o cron desenhou —, e as demais mídias sem registro seguem sendo
  catalogadas. Quem decide é o post RELIDO pelo catálogo, nunca a leitura de
  quem chama: o marcador é exatamente o que ele atesta (a capa). `agendarPost`
  não passa a opção e segue como sempre.
- 🔴 **Retomada decidida por um marcador que a execução PARCIAL já deixou**
  (varredura por classe): o único ponto era este. Nos demais o marcador É o
  efeito inteiro, gravado numa escrita só — a Generation por mídia (`resultUrl`),
  o vínculo da capa (`updateMany` com `generationId: null`), a página na pasta
  (um `update` por página, comparando pasta, nome e ordem), o item do plano
  (`agendado` com o post e a peça, no commit do post), os sinais (upsert por
  chave) e o próprio carimbo (escrito por último, só sem falhas).
- ⚠️ **O inverso da classe, registrado e NÃO mexido (código da main)**: refazer
  a refilagem não é idempotente. `ordemNaPasta` conta a própria página entre as
  vizinhas do minuto, então rodar `refilarPaginasDoPost` de novo com o mesmo
  horário alterna a `order` da página entre `base` e `base + 1` (lido no
  código, não medido: o banco falso do teste não filtra por faixa de `order`).
  O lote a refaz quando OUTRO efeito ficou pendente; o efeito é cosmético (a
  ordem dentro do mesmo minuto) e o nome não muda.
- 🔴 **Teste que afirma "a função não foi chamada" pode estar consagrando o
  defeito.** O C12-1x4 e o teste da semana afirmavam `chamadasDeArtes === 0`, e
  pular o catálogo INTEIRO era justamente o R12-08. Os dois passaram ao
  catálogo REAL sobre o banco falso e afirmam o que importa: nenhuma arte nova
  do PNG do cron, nenhuma arte duplicada. A troca de expectativa é declarada.
- Provas: `agendar-itens.test.ts` — R12-07 com as pastas REAIS (avulsas →
  semana na primeira resposta e na repetição; remarcação com a primeira chamada
  caindo antes dos efeitos, que aponta onde a página ainda está e, na
  repetição, a pasta de destino; post adotado com o `templateId` velho em
  simular e de verdade; página apagada sem link) e R12-08 pelo catálogo REAL
  (a capa vincula, a 2ª mídia cai no banco, a repetição registra a que faltou
  sem duplicar a capa e só então carimba). Passos 19 e 20 da prova de
  integração: a remarcação para a semana do item-8 (as duas pastas já existem)
  e a retomada do carrossel adotado — a queda no MEIO do catálogo não é
  injetável no banco real, então o passo monta o estado que ela deixa. Mutações:
  as quatro formas de voltar a ler a pasta velha (post antes da página relida,
  post vencendo a página, página lida antes dos efeitos, post como fallback da
  página apagada) derrubam 4, 4, 2 e 1 testes; o lote sem a opção, 1; o
  catálogo ignorando a opção, 1; o catálogo pulando tudo, 1.

**Da revisão FINAL do Codex sobre 31c4035d (BLOQUEADO, R12-09, 21/09/2026):**

- 🔴 **Efeito pós-commit que a repetição RETOMA precisa de exclusão entre
  retomadas — idempotência sequencial não basta.** No estado parcial do R12-08
  (capa vinculada, 2ª mídia sem Generation, efeitos sem carimbo) duas
  repetições simultâneas do agendar-leva liam as duas a 2ª mídia sem arte e
  criavam as duas: duas Generations da mesma mídia na galeria, e as duas
  chamadas carimbavam. O `Set` deduplica dentro de UMA chamada e o schema não
  tem unicidade em `resultUrl`. O teste do R12-08 era sequencial e o
  concorrente usava catálogo simulado — nenhum dos dois via a corrida.
- **`comTravaPorChave(chave, fazer)`** (`src/lib/trava-por-chave.ts`):
  transação curta que PRIMEIRO pega `pg_advisory_xact_lock(hashtext(chave))` e
  só então lê o que falta e cria. Trava de TRANSAÇÃO (passa pelo pooler; some no
  commit e no rollback, então processo morto não prende a chave); READ
  COMMITTED explícito; dentro dela só `tx` e só banco (com o pooler o pool é de
  uma conexão, e o `db` raiz esperaria a que ela segura — P2028); a espera pela
  trava conta no `timeout` de 20s, e o estouro vira "não terminou" para quem
  chama (o catálogo devolve `falhou`, a repetição completa).
- 🔴 **Medido no banco de dev: em REPEATABLE READ a transação acorda com a
  trava na mão e o snapshot de ANTES da espera.** Duas conexões reais, o
  bloqueio confirmado por `pg_blocking_pids`, uma linha inserida pelo dono
  antes de soltar: READ COMMITTED leu `n: 1`, REPEATABLE READ leu `n: 0`. É o
  PR13-51 de novo, agora nesta trava — nunca "suba o isolamento por
  segurança". **O banco falso não enxerga isso** (a mutação passa nele); é por
  isso que a prova tem o passo 21.
- 🔴 **A MESMA chave para quem cria a capa e para o catálogo das outras
  mídias** (`chaveDasArtesDoPost`, usada por `ensurePostGeneration` e por
  `registrarArtesDoPost`): chaves diferentes não se excluem, e o catálogo que
  visse a capa ainda sem arte a registraria de novo.
- **Leitura sem trava na frente, releitura sob a trava sempre**: o post com o
  catálogo completo (e o post já vinculado, no `ensurePostGeneration`) não
  espera ninguém nem abre transação; quem entra decide de novo com o que relê.
  O coletor "Arte Enviada" é garantido pela transação
  (`ensureArteTemplate(…, cliente)`).
- 🔴 **`garantirPasta` era a mesma classe** (varredura pedida): achar-ou-criar
  sem unicidade em `tags`. Duas retomadas (refilagem, avulsas) ou duas peças da
  mesma semana nova compostas juntas criavam DUAS pastas, e o `findFirst` sem
  ordem passava a mandar cada peça nova para uma delas — a semana partida em
  duas pastas de mesmo nome. Agora sob `chaveDaPasta(projeto, tag-chave)`, com
  a releitura depois da trava; a pasta que já existe não passa pela trava.
- **O resto da classe, conferido e descartado**:
  - sinais do agendamento: idempotentes por construção (upsert pela `chave`
    única; a corrida vira P2002 → `false` → aviso, nunca linha dupla);
  - dica de copy, `fecharSugestaoDeSlot`, `registrarDesfecho`: exclusivos por
    compare-and-set no desfecho (quem perde lê `ja-registrado`);
  - item do plano → `agendado`: no commit do post, sob a trava do item
    (C12-1x2); a reconciliação da linha anterior a isso é CAS, e quem perde
    recebe só um aviso enganoso (linha que só existe no dev);
  - refilagem e mudança de pasta: a concorrência não piora nada — os dois
    escritores gravam pasta, nome e ordem da MESMA data (vence o último, com a
    ordem em `base` ou `base + 1`, a não-idempotência cosmética já registrada
    no R12-08); o que podia duplicar era a pasta, e ela agora tem trava;
  - o carimbo (`updateMany` com `efeitosDoAgendamentoEm: null`) e a escrita do
    post e do vínculo (sob as travas de linha `ItemDeLote` → `ItemDePlano` →
    `Page`) já eram exclusivos.
  - ⚠️ Fica como estava: dois posts DIFERENTES sem template registrando artes
    ao mesmo tempo podem criar dois coletores "Arte Enviada" (chaves de trava
    diferentes). Anterior ao PR e cosmético — o `findFirst` pega um deles.
- Provas: `agendar-itens.test.ts` (o estado parcial do R12-08 com duas
  repetições e uma barreira em que as duas leem a ausência antes de qualquer
  criação; o mesmo do zero, capa e slide 2) e `garantir-pasta-concorrente.test.ts`
  (banco falso em que só a trava por chave serializa). Vistos falhar antes do
  conserto: duas Generations do slide 2, duas da capa, duas pastas. Passo 21
  da prova de integração: duas conexões reais e a barreira dada pelo BANCO
  (`pg_blocking_pids` confirma que a chamada real está bloqueada ANTES de a
  primeira criar) para o catálogo, a pasta e o vínculo da capa — o que se lê
  durante o bloqueio vai por uma conexão própria, porque a do `db` da prova é
  a que a transação bloqueada segura. Mutações: sem a trava, 3 testes caem;
  sem a releitura sob a trava no catálogo, 2; a capa sem trava ou com outra
  chave, 1 cada; a pasta sem a releitura, 1; o catálogo fora da transação, 1;
  REPEATABLE READ, 0 no banco falso e `n: 0` no banco de dev.

**Da revisão FINAL do Codex sobre 7b7e90e1 (BLOQUEADO, R12-10…R12-11, 21/09/2026):**

Os dois achados são no SCRIPT DA PROVA (`validar-lote-ate-rascunhos.ts`,
passo 21); o código da aplicação (R12-09) foi aprovado.

- 🔴 **Conexão auxiliar de prova passa pela MESMA guarda de destino que o
  `db`** (R12-10, P1). A guarda conferia só o `DATABASE_URL`, e o dono e o
  vigia do passo 21 abriam `PrismaClient` com `DIRECT_URL ?? DATABASE_URL` — e
  o `DIRECT_URL` vinha HERDADO: do `.env` (produção), copiado inteiro para o
  processo quando o arquivo de dev não o definia, ou do ambiente de quem rodou.
  Sem `DIRECT_URL` no dev, `criarComoDono` gravaria em PRODUÇÃO, e o cleanup
  (pelo `db` de dev) não alcançaria. Não aconteceu nas rodadas (o arquivo de
  dev define as duas no `ep-winter-lake-admt6duq`), mas nada impedia. Hoje
  `destinoDaProvaDeDev` (`scripts/lib/destino-da-prova.ts`, puro) resolve o
  destino de TODA conexão antes de qualquer cliente existir: as duas URLs saem
  SÓ do `.env.development.local` e têm de ser o MESMO banco (compute E nome do
  banco — PR13-16), fora de qualquer compute de produção; o ambiente aplicado
  sobrescreve as duas no processo; o dono e o vigia recebem
  `DESTINO.directUrl`; e depois do import o script confere que o `db` nasceu
  do `DATABASE_URL` validado.
- **Sem `DIRECT_URL` no arquivo de dev a prova ABORTA com a instrução, nunca
  deriva**: é o contrato do runner da casa (`scripts/dev-db.ts` recusa rodar
  sem as duas; `db:dev:setup` escreve as duas), e derivar seria adivinhar o
  formato de URL do provedor. Falha fechada.
- 🔴 **O compute se compara em minúsculas.** `postgresql:` é esquema NÃO
  especial, o `new URL` preserva a caixa do host, e o DNS não a distingue:
  `EP-PROD-…` conecta na produção e, comparado como string, passava pela guarda
  antiga — inclusive no `DATABASE_URL`. É a lição do PR13-49 (identidade do
  endpoint, nunca a string). Os outros 22 parsers (entre eles o de
  `scripts/dev-db.ts`, que deixava `db:migrate`/`db:reset` rodarem contra a
  produção escrita em outra caixa) viraram UM só em 21/09/2026: ver a regra da
  guarda em "Banco de desenvolvimento".
- 🔴 **O passo 21 nunca autoriza a criação sem o bloqueio confirmado pelo
  banco** (R12-10): `bloqueou === false` é FALHA do passo
  (`BloqueioNaoObservado`) e o dono desiste com rollback. Antes, `soltar()`
  liberava a criação mesmo sem bloqueio, e a prova "provava" uma exclusão que
  não observou.
- 🔴 **Barreira de prova precisa terminar também no caminho da falha**
  (R12-11, P2). `travado` só resolvia por `avisarTravado()`, e
  `primeira.catch(() => undefined)` engolia a rejeição da transação do dono
  (conexão, trava, primeira consulta, timeout): `await travado` esperava para
  sempre, sem erro e sem o cleanup das peças dos passos anteriores. A varredura
  achou a SEGUNDA barreira da mesma forma: `podeCriar` só era solto no caminho
  feliz — com a consulta do vigia (ou `duranteOBloqueio`) falhando, o dono
  ficava esperando até o timeout de 60s da transação, com a chamada real presa
  na trava. `corridaNaTrava` (`scripts/lib/corrida-na-trava.ts`, puro): a
  transação do dono que termina (ou rejeita) sem sinalizar faz a barreira
  REJEITAR; no encerramento o dono é sempre liberado (desiste, se nada
  autorizou a criação), a chamada real é aguardada — ela termina quando a trava
  é solta — antes de desconectar, e os dois clientes desconectam. O erro chega
  ao `catch` da prova e o `finally` do cleanup roda.
- **Regra**: toda espera por sinal numa prova tem um caminho de rejeição ligado
  ao lado que sinalizaria, e todo `finally` que espera outra coisa libera antes
  o que ele próprio segura.
- **O modo `--producao-somente-leitura` não mudou, e foi conferido**: abre UM
  cliente (o `db`, no `DATABASE_URL` do `.env`) e toda consulta roda na
  transação `SET TRANSACTION READ ONLY` — inclusive a simulação do serviço,
  que lê só pelo `leitor` (as escritas dele existem só fora de `simular`, e
  `leitor` sem `simular` é recusado). O passo 21 não é alcançável nesse modo.
- Provas: `destino-da-prova.test.ts` (direta de produção explícita, herdada do
  `.env` e do processo, ausente nos dois, outro compute, outro banco, caixa
  trocada e a matriz; controle com a direta e a pooled do mesmo dev; e a fiação:
  a prova só abre cliente com `DESTINO.directUrl` e aplica o ambiente validado)
  e `corrida-na-trava-da-prova.test.ts` (rejeição antes da sinalização → falha,
  desconecta, cleanup alcançado; bloqueio não observado → falha sem criar; vigia
  falhando e dono falhando ao criar → a chamada real termina antes de
  desconectar; controle). Vistos falhar contra transcrições FIÉIS do código de
  7b7e90e1. Mutações (12): herdar a direta, 2 testes caem; direta fora da recusa
  de produção, 1; sem o mesmo banco, 3; ambiente sem a direta, 2; sem
  minúsculas, 1; auxiliar com `process.env.DIRECT_URL`, 1; ambiente não
  aplicado, 1; rejeição engolida, 1 (timeout); criar sem bloqueio, 1; dono não
  liberado, 2; chamada real não aguardada, 3; clientes não desconectados, 5.
  🔴 **Herdar a direta, sozinho, não derruba nada** se o teste só afirma "recusou":
  as outras duas camadas (compute de produção, mesmo banco) recusam do mesmo
  jeito, com outra mensagem. Os testes da herança afirmam a INSTRUÇÃO — sem
  isso o mutante sobrevive.
