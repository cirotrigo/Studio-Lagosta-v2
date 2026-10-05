# Plano de conteúdo e a semana

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### Plano de conteúdo: a fila que chat e bancada dividem (F3, 11/08/2026)

`PlanoDeConteudo` + `ItemDePlano` são a leva vista pelas duas superfícies. Antes
disso a fila da bancada era `localStorage` puro (`lagosta.bancada`) e **nenhuma
rota escrevia nela** — o chat não conseguia montar uma semana que a bancada
enxergasse. Serviço em `src/lib/planos/`, rotas
`/api/projects/[projectId]/planos*`, tools `criar-plano`, `ver-plano`,
`editar-item-do-plano`, `regenerar-item`, `executar-plano`.

- 🔴 **`criar-plano` cria leva NOVA, e a bancada mostra só a ativa mais
  recente** (`planoAtivo`, `createdAt desc`): criar outra para acrescentar peças
  a uma semana em andamento TIRA a anterior da tela. Para acrescentar,
  `anexarAoAtivo: true` (o mesmo `anexarItensAoPlanoAtivo` da rota web; `inicio`
  e `fim` deixam de ser obrigatórios). Até 15/09/2026 o conector não tinha essa
  porta, e anexar 4 flyers do By Rock exigiu script tsx.
- **O plano registra INTENÇÃO; só `executar-plano` gasta.** Montar, editar e
  reprovar são de graça por contrato. É a mesma regra que já valia para
  sugestão: proposta nunca agenda nem cobra sozinha.
- 🔴 **O gate de crédito é MECÂNICO, não só prosa.** A 1ª chamada de
  `executar-plano` não escreve nada (tudo antes do `return` é leitura) e devolve
  a conta; só a 2ª, com `confirmar: true`, produz. O handler usa
  `args.confirmar === true` — qualquer outro valor NÃO confirma. A descrição
  proíbe auto-confirmação em palavras, inclusive quando "ela já disse pode fazer
  tudo" (ela ainda não tinha visto a conta) e quando a conta dá zero.
- 🔴 **Ler saldo é LEITURA**: `db.creditBalance.findUnique` pelo `User.id`
  interno. `getUserCredits`/`getUserFromClerkId` **CRIAM User** quando não
  existe — é assim que nascem os "Users fantasma" que já estão neste banco.
- **`ia` vai para a fila durável (F0.3); `template` renderiza na invocação.** O
  MCP **só enfileira, nunca chama `dispararJobAgora`** (lá uma invocação carrega
  várias tools, e o batch JSON-RPC resolve com `Promise.all`). Não existe
  `GenerationJobKind` para render de modelo e **não se cria um** — enum do
  Postgres é migration. O render em sequência tem orçamento de 210s dos 300s, a
  via template roda DEPOIS da IA (para um corte por tempo atingir só o trabalho
  barato de retomar), e a resposta **sempre diz quantos ficaram**: teto de
  cobertura que não aparece no relato é teto que mente.
- 🔴 **`createArteRapida` JÁ chama `registrarUsoDeModelo`** (`arte-rapida.ts:646`)
  e já fecha as sugestões de modelo e de foto. Chamar de novo dobra o contador.
- **Ninguém avisa o plano quando uma geração termina** — a fila durável não
  conhece plano. Quem reconcilia é `ver-plano` e o GET de `[planoId]`, lendo a
  `Generation` (`reconciliar.ts`), mesmo padrão de `sinal-de-modelo.ts`.
  `executar-plano` **não** reconcilia, para manter literal a promessa de que a
  1ª chamada não escreve.
- 🔴 **`na-fila → pronto` não é transição válida** (passa por `gerando`) — e é o
  caso comum quando o cron termina antes de alguém abrir o plano. O caminho é
  descoberto por **busca em largura sobre a própria `transicaoPermitida`**,
  nunca por uma cópia da tabela num segundo lugar.
- **`agendado` é terminal; `reprovado` não.** Depois que o item virou post, a
  verdade é o post — deixá-lo voltar criaria duas fontes de verdade. Reprovar
  precisa de saída, porque recusa com motivo é sinal, não beco: vira
  `registrarFeedbackDeArte` quando há arte, e o tipo `item-de-plano` quando a
  recusa é da proposta inteira. **Item reprovado é PULADO por `executar-plano`**
  — reproduzir o que alguém acabou de recusar gasta crédito para repetir o erro.
- 🔴 **Na hidratação da bancada, o servidor manda no CONTEÚDO e o estado mais
  AVANÇADO vence na SITUAÇÃO** (`para-bancada.ts`, mesma forma de
  `desfechoVenceOAnterior`). Sem isso a resposta que chega segundos depois do
  clique devolve à fila um card cuja geração já está paga, e clicar em Gerar de
  novo cobra duas vezes. `plano: null` significa "não há leva ativa", **nunca**
  "a consulta ainda não voltou" — por isso ele só orfaniza, não apaga.
- **O guard de reidratação do store continua valendo nas duas direções**;
  `temTrabalhoNoServidor` só mudou de casa para `para-bancada.ts` (puro,
  testável) porque a hidratação precisa da MESMA resposta, inclusive no
  carrossel, onde os ids vivem em `slides[]` e não no item.
- **`ItemDePlano.planoId` TEM FK com `onDelete: Cascade`** — é parentesco
  estrito. A regra "sem FK" da casa vale para vínculo FROUXO com entidade
  apagável (`postId`, `generationId`, `pageId`, `campaignId`, `sugestaoId`,
  `sourcePageId`), não para o dono da linha. `projectId` fica `Int` solto, sem
  relação com `Project` — precedente de `LearningSignal` e `GenerationJob`.
- **`trocar-arte-do-post` é o caminho para "usa aquela outra arte"** e só vale em
  RASCUNHO. Post nascido da bancada é `NOT_NEEDED` e está **fora** do alcance de
  `invalidateScheduledRenders`, ou seja, `ajustar-arte` não trocava nada nele.
  Nunca reduz a contagem de `mediaUrls` (troca só o índice pedido, com
  compare-and-swap); `Page.thumbnail` **nunca** é reusado (pode ser válido e
  mesmo assim velho); **página em CARROSSEL vira `NOT_NEEDED`**, porque
  `renderPostArt` grava `mediaUrls: [url]` e um post `RENDERED` de 3 slides
  perderia 2 no primeiro re-render; e `SocialPost.generationId` só muda quando o
  índice é 0, senão "melhorar com IA" pega o slide 3 e escreve sobre o slide 1.
- 🔴 **Com `strict: false`, `z.infer` marca TODA chave como opcional** (sem
  `strictNullChecks`, `undefined extends T` vale para tudo). Campo obrigatório no
  zod chega ao serviço tipado como opcional — o tipo de entrada precisa admitir
  isso, e a garantia fica na validação de runtime.
- **Mapeamento posicional da copy nos slots do modelo é simplificação
  conhecida**: `ItemDePlano.copyProposta` é `String[]` e `createArteRapida` quer
  slots chaveados. Sobra/falta preenche o que couber e **avisa** — nunca derruba
  a leva.

### A proposta da semana: `propor-semana` e a dica de copy (F3 trilho B, 11/08/2026)

`proporSemana` (`src/lib/planos/propor-semana.ts`) encadeia `sugerirPosts` →
assunto por slot → `buscarNoAcervo` → `montarDicasDeCopy` → `criarPlano`. Ela
**monta e persiste; nunca gera, nunca cobra, nunca agenda** — quem produz é
`executar-plano`, com o gate de confirmação.

- 🔴 **Desde 12/09/2026 `propor-semana` é automação SÓ QUANDO PEDIDA** (decisão
  do Ciro em 11/09, plano "Marca simples, copy melhor"): quem escreve a copy da
  semana é o Claude, no chat, pelas 4 etapas da programação semanal, e a
  descrição da tool deixou de dizer "é por onde começar". Ela só entra quando a
  pessoa pede com todas as letras a proposta automática do Studio. O código e
  as regras abaixo continuam valendo para quando ela roda.

- 🔴 **A F2 NÃO dá tema por slot.** `SugestaoSlot` não tem campo de pilar, e
  `modeloSugerido.temas` são as TAGS da página, não assunto. Quem escolhe o
  assunto é `propor-semana`, cruzando `taxonomiaAprovada` com a distribuição
  real de `montarPerfil`. **Não mova essa escolha para `sugerir-posts.ts`.**
- ~~Em produção há ZERO pilares e ZERO posts classificados (11/08/2026)~~ —
  **SUPERADO em 16/08/2026: a taxonomia foi aprovada e o histórico
  classificado.** Medido: **9 dos 11 projetos** têm 5 a 7 pilares aprovados
  (todos com `origem: 'humano'`) e entre **533 e 720 posts classificados** cada.
  Ficam de fora só Lagosta Criativa e Ciro Trigo, que não são cliente de
  restaurante. O caminho SEM tema deixou de ser o normal — mas
  `taxonomiaAprovada` devolvendo `[]` continua significando "este cliente ainda
  não tem taxonomia", nunca erro, e é o que vale para projeto novo.
- **Uma chamada de LLM para a leva INTEIRA**, não uma por slot: além de mais
  barata, é o que deixa o modelo ver a semana toda e não repetir o mesmo gancho.
  Molde: o classificador da F2.
- 🔴 **A vigência da base é conferida contra a DATA DO SLOT** (`vigenteEm(quando)`),
  nunca contra `new Date()`: campanha que vence antes do slot não pode entrar na
  copy daquele slot.
- 🔴 **Preço, horário, data e promoção só passam com LASTRO na base, e a trava é
  mecânica** (`aplicarGuardaDeDados` + `dadosProibidos`): o termo citado tem de
  aparecer numa entrada válida para aquela data, senão o **bloco inteiro** cai e
  vira aviso. Cai o bloco, não o valor — bloco mutilado ("HAPPY HOUR DAS ÀS")
  parece copy e não é. As entradas que sustentaram o que sobrou saem em `fontes`.
- **As perguntas do crivo entram como INSUMO do prompt**, não como portão — a
  copy nasce respeitando as regras. Não religue `crivo-avaliacao.ts` como modal.
  ⚠️ A polaridade da lista é MISTA: apresente-as como perguntas que alguém fará
  sobre a peça, nunca como afirmações.
- **`toneOfVoice` entra na copy** (a proibição vale só para prompt de IMAGEM), e
  **não se chama `escolherReferenciaDeEstilo`** aqui: aquilo é referência de
  imagem e marcar uso fora de uma geração quebraria o rodízio. O análogo para
  texto ("como esta marca reescreve") já vem dentro de `perfilParaPrompt`.
- 🔴 **A âncora do eco tem de ser LEGÍVEL.** Com `ref` opaca (`slot-1`) o
  gpt-4o-mini ignorou a instrução e copiou a própria headline no eco — **4 de 4
  dicas perdidas no By Rock**. Hoje a âncora é "story de quinta-feira, 19:00".
  E `ref` só desempata quando o eco não casa com NADA; nunca quando casa com
  várias.
- 🔴 **O dia da semana precisa de linha PRÓPRIA no prompt.** Enterrado na linha
  de data, o modelo anunciou no domingo o executivo de segunda a sexta e
  convidou para uma casa fechada aos domingos.
- **A dica de copy não cobra créditos** — precedente da revisão ortográfica
  (mesmo `gpt-4o-mini`, sem cobrança) e contrato da F3: proposta com pedágio é
  proposta que ninguém itera.
- **Cold start só quando NÃO há nenhum horário real.** Semear em volta de uma
  rotina magra inventaria ritmo que o cliente não tem. A grade-semente é
  registrada como sugestão (`semente-v1`, determinística) — sem isso o KPI
  mediria só quem já tem rotina — e vem rotulada item a item.
- 🔴 **A copy agora É sugerida, então a bancada FECHA o desfecho em vez de abrir
  decisão nova.** Card vindo de item de plano com dica registra `registrarDesfecho`;
  card montado à mão continua `escolha-propria`. Sem isso o mesmo texto viraria
  dois sinais com sentidos opostos — o defeito que a F1 já teve de corrigir
  (`e3236624`). O desfecho é CALCULADO pelo diff, nunca declarado pela tela.

### O contexto da semana: janela, formato, grade completa e fatos por data (PR 6 de "Marca simples, copy melhor", 12/09/2026)

Quem monta a semana é o Claude, no chat (decisão de 11/09); o Studio entrega o
CONTEXTO. Até aqui `sugerir-posts` só olhava "os próximos N dias", contava um
feed como ocupante do slot de story, e a grade só aparecia nos buracos;
`ver-agenda` mostrava 140 caracteres de legenda; `consultar-base` conferia a
validade contra HOJE; e `buscar-fotos` não tinha como tirar da lista a foto já
escolhida na peça anterior. Módulos PUROS com teste:
`src/lib/posts/contexto-da-semana.ts` e `src/lib/creatives/excluir-fotos.ts`.
Sem migration. Prova no branch de dev: `scripts/validar-contexto-da-semana.ts`.

- **A janela tem INÍCIO e FIM** (`janelaDaSugestao`; "AAAA-MM-DD" em
  Brasília; início no passado vira hoje com aviso; fim antes do início é
  `JANELA_INVALIDA`; teto de 21 dias, cortada com aviso). Sem os dois é o
  comportamento de sempre (hoje + `dias`). A tool `sugerir-posts` recebe
  `inicio`/`fim`; `dias` continua e é ignorado quando `fim` vem.
- 🔴 **A OCUPAÇÃO é por FORMATO** (`slotOcupado`): story só é ocupado por
  story; post, carrossel e reel disputam o feed entre si. A grade aprovada da
  base é de STORY por construção (o parser deixa feed e carrossel de fora);
  horário do histórico leva o formato da MAIORIA do bloco (`formatoDoBloco`;
  empate e bloco vazio caem em story — 92% do que a carteira publica). Cada
  `sugestao` e cada item de `ocupacao` dizem o `formato`.
  🔴 **O formato olha o MESMO bloco e a MESMA população da cadência**
  (revisão de 619e7877): o bloco de meia hora é `blocoDeMinutos` (arredonda
  ao mais próximo — publicações às 19h20 formam o horário das 19h30 e são
  contadas nele; com `floor` de um lado e `round` do outro, o horário nascia
  num bloco e era classificado noutro, vazio, virando story), e o histórico
  passa por `historicoParaFormato`, que tira a campanha encerrada como a
  cadência já tira — senão uma campanha de feed já encerrada transformava o
  story de rotina daquele bloco em feed, e a ocupação junto.
  🔴 **Quem CONSOME os slots escolhe por horário E formato** (`slotsParaAPeca`,
  `formatoDoSlotDaPeca`, `chaveDoSlot`): com a ocupação por formato, um
  horário com story agendado passou a aparecer como slot livre de FEED — e a
  bancada, que filtrava e pré-selecionava por horário, oferecia esse slot para
  OUTRO story em cima do existente; `propor-semana` descartava o formato na
  conversão. A peça só vê os slots do formato dela (feed, quadrado e carrossel
  = feed), a fila reserva por horário E formato, e a leva do plano filtra
  pelo formato do plano (R22 da revisão de 386118cc).
  🔴 **A seleção da bancada é RECONCILIADA com a lista, nunca mantida**
  (`reconciliarSlot`, `quandoDaPeca`, puros; R25 da revisão de fde1fb73): o
  slot pré-selecionado que SAI da lista — a peça mudou de formato ou virou
  carrossel, outro item da fila reservou o horário — é substituído pelo
  primeiro disponível ou limpo; e o horário automático da inclusão só existe
  enquanto o slot é uma proposta VÁLIDA (o manual vence). Antes o efeito só
  preenchia `!slot`: o story das 19h pré-selecionado sobrevivia à troca para
  feed e a peça entrava nas mesmas 19h, em cima do feed que ocupava o horário.
  🔴 **A consulta de ocupação vai além da janela pela tolerância do slot**
  (`janelaDeConsultaDeOcupacao`, 45 min dos dois lados; R27 da revisão de
  2848096f): a consulta que começava exatamente no início da janela não trazia
  o story de domingo 23h45, e o slot de segunda 0h saía livre a 15 minutos
  dele. Só a DETECÇÃO de conflito enxerga a borda; sugestões, `ocupacao` e
  `jaNaAgenda` continuam limitados à janela pedida (`dentroDaJanela`).
- 🔴 **A grade aprovada tem precedência por dia E FORMATO**
  (`fundirGradeComCadencia(…, { formatoDe })`): ela é de story, então
  substitui os horários de STORY do dia que cobre e mantém o FEED que o
  histórico sustenta no mesmo dia — o story combinado das 10h não apaga o
  feed das 18h de segunda. Sem `formatoDe` vale o comportamento antigo (a
  grade substitui o dia inteiro), que é o que os chamadores antigos esperam.
- **A GRADE COMPLETA sai sempre** (`montarGradeDaSemana`): os 7 dias, cada
  horário com `origem` (`combinado` = grade aprovada na base; `historico` =
  rotina medida; `nova` = só nas últimas duas semanas), `formato`, `tema` e
  `evidenciaFraca` (campanha/sugestão aceita sem edição, ou novidade —
  `fundirGradeComCadencia` passou a carregar `picoRecente`/`apoioFraco`);
  `excecoes` são os dias sem horário. É o que se apresenta UMA vez: as
  instruções do conector mandam não pedir aprovação da mesma grade em cada
  leva — só a DIVERGÊNCIA volta à conversa.
- 🔴 **`registrarSugestoes: false` desliga a emissão de sinais** em
  `sugerirPosts` (a resposta diz `sinaisRegistrados`). É para prova e medição:
  cada slot emitido é uma proposta no KPI, e prova que emite contamina o
  denominador — a regra de 11/08 ("script NUNCA chama o que registra sinal")
  ganhou a alavanca em vez de um caminho paralelo.
- **`ver-agenda` traz `textos`** como a ARTE os mostra (`textos-da-peca.ts`,
  puro), `textosOrigem`, `formato` e `legendaCompleta` quando a legenda passa
  de 140 caracteres. É por eles que se revisa repetição de tema e frase entre
  os dias.
  🔴 **A precedência é a do render, não "a página"** (revisão de 619e7877): a
  página é o MODELO — dois posts sobre a mesma página com copy própria em
  `slotValues` voltavam com o texto de exemplo do modelo. A copy PRÓPRIA do
  post sobrepõe a página camada a camada (por id ou nome, como
  `applySlotValues`); a cópia que o agendamento grava (`_copiaDaPagina`) não
  sobrepõe (`slotValuesParaRender`); camada oculta fica de fora.
  🔴 **Carrossel e peça sem página se leem SLIDE A SLIDE, pela arte que cada
  mídia é** (`mediaUrls` → `Generation` casada pela URL, a mais recente por
  URL — a regra de `artes-do-post.ts`; `generationId` do post é só o PRIMEIRO
  slide, e os outros sumiam da revisão). Na peça viva o slide é lido da
  PÁGINA daquela arte (`fieldValues.pageId`, é ela que o re-render desenha);
  na entregue, do `layersSnapshot`. `textosPorSlide` sai no carrossel; mídia
  sem arte registrada é declarada no slide e a leitura vira `textosParciais`.
  🔴 **Só a URL casa a arte — NUNCA o `generationId` do post como fallback**: o
  re-render grava URL nova sem trocar o vínculo (`ensurePostGeneration`
  devolve cedo), e o snapshot daquela Generation é de OUTRA versão da mídia.
  🔴 **Snapshot de arte RE-RENDERIZADA não afirma texto**
  (`recomposicao.estado === 're-renderizada'`): esse caminho grava a URL nova
  e PRESERVA o snapshot da composição anterior. Até a re-renderização gravar
  as camadas que desenhou, a mídia é declarada sem registro e vale o fallback
  (cópia registrada, parcial, indisponível). Leitura LEGÍVEL E VAZIA é
  definitiva (`textos: []` com `textosOrigem`): a única camada apagada pelo
  slot ou todas ocultas não são motivo para buscar em outra fonte um texto
  que o render removeu.
  🔴 **Carrossel sem NENHUM slide legível não cai em fallback nenhum — vivo ou
  entregue**: a cópia da página gravada no post (`_copiaDaPagina`) e a copy
  própria só provam o que foi ao ar em MÍDIA ÚNICA (o render de post as
  mantém em dia); o re-render de slide troca só `mediaUrls` e o `slotValues`
  do carrossel fica como estava — a cópia A sobrevive à mídia B. Declara-se,
  slide a slide (`textosPorSlide`), inclusive no rascunho.
  🔴 **Peça VIVA sem página legível também é dita PARCIAL** (R28 da revisão de
  f3ac8b92): a copy do post é só o que ele sobrescreveu, e a cópia registrada
  (`_copiaDaPagina`, origem `copy-registrada`) é parcial por natureza — as duas
  voltam com `parcial` e a nota dizendo que as camadas não puderam ser lidas, e
  a cópia registrada passa pela leitura que preserva URL de camada (a de R19),
  não pelo filtro genérico. Sem página nenhuma, a copy do post continua sendo
  a leitura inteira do que existe.
  🔴 **`ver-agenda` só lê páginas DESTE projeto** (R29 da revisão de 061195d3,
  P1): o `pageId` de um post e o `fieldValues.pageId` de uma Generation podem
  apontar para página de OUTRO projeto (o `konva-export` grava `body.pageId`
  sem conferir o dono), e a consulta pelo id nu entregava os textos de B pela
  agenda de A. A busca das páginas leva `Template: { projectId }`; página de
  fora fica sem camadas e a peça segue como fonte indisponível.
  🔴 **`pageId` preenchido e página NÃO carregada não é "peça sem página"**
  (R30): a fonte principal está indisponível — a copy do post volta parcial
  com a nota, a cópia registrada parcial, e sem copy é `textosIndisponiveis`.
  E a prova escolhe a página de outro projeto lendo as camadas de verdade
  (`textosDaPagina`), não com `LIKE` no JSONB (R31), e exercita os dois
  caminhos: `SocialPost.pageId` e `Generation.fieldValues.pageId`.
  🔴 **O FORMATO faz parte da identidade da proposta de slot** (R33 da
  revisão de 4bf1d0a3): a chave era `(versão, projeto, horário)`, e o mesmo
  bloco classificado como story numa semana e feed na seguinte (a população
  do histórico muda) reutilizava o `sugestaoId` — o feed herdava o
  `descartada` do story, e a precedência de desfechos impedia o aceite de
  sobrescrever. `chaveDaPropostaDeSlot` (puro) põe o formato no fim da chave
  e `sugerido.formato` é gravado; a emissão legada (sem formato) fica com a
  chave antiga, nunca reescrita. A prova registra de verdade no dev (2c) e
  apaga no cleanup.
  🔴 **Mídia ÚNICA cuja arte não afirma texto também é fonte INDISPONÍVEL**
  (R32 da revisão de d871673c): post vivo sem `pageId` e uma mídia cuja
  Generation aponta para página de outro projeto (ou apagada), sem snapshot
  confiável — `textosPorSlide` já dizia o motivo, mas só o carrossel
  preservava a declaração; a mídia única caía no retorno vazio e, com copy
  própria, voltava sem `parcial`. Hoje o motivo do slide vira
  `fonteIndisponivel` ("a arte desta peça não afirma texto (…)"), e vale o
  mesmo tratamento da página ilegível: copy própria e cópia registrada
  PARCIAIS com a nota; sem copy, `textosIndisponiveis`. A prova exige a
  declaração no caminho pela arte (antes só conferia "não vazou").
  **A cópia registrada é PARCIAL por natureza**: `textosDaPagina` guarda o
  texto das camadas ANTES da caixa do render e sem a ordem em que são
  desenhadas — quem a devolve (`copy-registrada-na-entrega`) declara
  `textosParciais` com a nota; e uma URL nela é texto de camada e FICA (o
  filtro de URL vale só para `slotValues` sem tipo de camada).
  **A CAIXA é a do render** (`aplicarCaixa` em `posts/caixa-do-texto.ts`, a
  MESMA função que `render-engine.ts` usa, aplicada depois do slot): a camada
  guarda "Almoço executivo" e a arte mostra "ALMOÇO EXECUTIVO".
  **A SEQUÊNCIA é a do render**: as camadas saem pelo `order` (`(order ?? 0)`,
  sort estável — a mesma conta de `render-engine.ts`); a persistência aceita o
  array fora de ordem, e a agenda devolvia a ordem do array (R23).
  🔴 **Arte já ENTREGUE não segue a página** (`arteEntregue`: `laterPostId`,
  publicado, publicando ou falhou): a página pode ter sido editada DEPOIS da
  entrega, e a invalidação não alcança o post — atribuir-lhe o texto atual da
  página seria mentir sobre o que foi ao ar. Sem snapshot, a copy PRÓPRIA do
  post é PARCIAL e dita assim (`textosParciais` + `textosNota`: só os campos
  sobrescritos; o resto veio da página no render e não tem registro — nunca
  se completa pela página atual); a cópia registrada no último render antes
  da entrega é inteira; sem nenhuma, `textosIndisponiveis` DECLARA e `textos`
  não sai. Camadas ilegíveis também declaram, nunca erro.
  🔴 **O texto de camada volta INTEIRO e na multiplicidade em que existe**: URL
  numa camada de texto é texto da peça, duas camadas com a mesma frase são
  duas ocorrências (é a repetição que a revisão procura), acento e quebra de
  linha ficam. Só o fallback por `slotValues` (sem tipo de camada) descarta
  valor com cara de URL. E o slot é aplicado pela MESMA função do render
  (`aplicarSlotNaCamada`, extraída de `applySlotValues`): `""` mantém o texto
  da camada, `{ content: "" }` o apaga, id vence nome — reproduzir a
  semântica "à mão" foi como a leitura passou a afirmar ausência de um texto
  que continuava na arte.
- **`consultar-base` recebe `em`** (a data em que a peça VAI AO AR):
  `vigenteEm(início daquele dia em Brasília)` — o que vence durante o dia
  ainda vale para a peça que sai nele. 🔴 Só dia que EXISTE (`dataValida`,
  ida e volta pelo ISO): `new Date('2026-02-31')` não recusa, normaliza para
  3 de março em silêncio, e a base seria lida para outro dia — vale também
  para `evitarUsadasDesde` e para `inicio`/`fim` da janela. A resposta diz `referencia` e traz
  `dados` (o `metadata` estruturado da entrada, sem os carimbos `origem`/
  `revisao`). A descrição separa os três horários que se confundiam: o de
  PUBLICAÇÃO (grade), o do SERVIÇO (funcionamento, na copy) e a VIGÊNCIA da
  oferta (`validade`).
- **`buscar-fotos` recebe `excluir` (driveFileIds já escolhidos) e
  `evitarUsadasDesde`** ("AAAA-MM-DD", por `PhotoUsage` + legado): a exclusão
  é aplicada sobre a lista JÁ ranqueada, ANTES de a proposta ser registrada (o
  que se registra é o que a pessoa viu), e declarada em `excluidas` (`porId`,
  `porUso`, `naoEncontrados`). Data inválida (formato errado ou dia que não
  existe) não exclui nada e vira aviso. O rodízio continua empurrando a usada
  para baixo; excluir é decisão de quem busca.
  🔴 **A exclusão entra na IDENTIDADE da proposta registrada**
  (`normalizarExclusao` → `criterios.excluir`/`evitarUsadasDesde` na chave de
  `registrarProposta`; revisão de 619e7877): a lista vista com a foto A
  excluída é OUTRA lista, com outro topo — sem isso o `upsert` do mesmo dia
  reutilizava a proposta anterior e escolher B contava como troca humana. Os
  mesmos ids em outra ordem continuam sendo o mesmo pedido; quem nunca
  excluiu mantém a chave de sempre (os campos só entram quando pedidos).
  🔴 **A identidade da exclusão preserva a CAIXA dos ids** (`identidadeDaExclusao`,
  parte própria da chave): `resumoEstavel` passa strings por minúsculas e
  "AbC"/"abc" — que a filtragem distingue — colidiam na mesma proposta. E o
  corte de uso compara o DIA EM BRASÍLIA (`diaDoUso`): um uso às 02:30Z de
  segunda é domingo à noite aqui, e `evitarUsadasDesde: segunda` não pode
  excluí-lo; a data pura do catálogo legado fica como está.
  🔴 **Para EXCLUIR, o dia do último uso funde banco e legado DEPOIS de converter
  cada fonte para o dia em Brasília** (`diaDoUltimoUso`, R26 da revisão de
  2848096f): `mesclarUsos` compara os textos, e o timestamp do banco
  ("…07T02:30Z", domingo 6 aqui) vencia a data pura do legado ("2026-09-07")
  — a foto usada no dia 7 escapava de `evitarUsadasDesde: 2026-09-07` com a
  exclusão dada como cumprida. Para ORDENAR o rodízio `mesclarUsos` continua.
  🔴 **Com corte por uso, a identidade da proposta leva o conjunto
  EFETIVAMENTE excluído** (`resumo.idsPorUso` → `identidadeDaExclusao`): a
  lista que a pessoa vê muda quando uma foto do topo é usada no meio do dia,
  e o `upsert` reutilizaria a proposta com o topo antigo — escolher o novo
  topo viraria "troca" atribuída à pessoa. Nada mudou → a mesma proposta.
  🔴 **"Ninguém usou" e "não consegui ler os usos" são fatos diferentes**
  (`lerUsosDeFotoComEstado`, R24): `lerUsosDeFoto` engolia a falha do
  `groupBy` e devolvia mapa vazio — com `evitarUsadasDesde`, toda foto voltava
  elegível e a resposta dizia `porUso: 0` como exclusão cumprida. Agora o
  estado viaja (`usosLidos`), a busca continua, e a exclusão por uso é
  declarada INCOMPLETA (aviso + `excluidas.porUsoIncompleta`).
- 🔴 **`prisma/generated/` no `.gitignore` ignora a PASTA, não o symlink** que
  os worktrees usam: `git status` o lista como `??` e a prova imprimia
  "pendente: 1 arquivo(s)" numa árvore que estava limpa (foi o que a revisão
  cobrou). Está em `.git/info/exclude` (compartilhado por todos os
  worktrees), não no `.gitignore` — o symlink é artefato de máquina.
- 🔴 **A grade-semente e a complementação conferem a OCUPAÇÃO do formato da
  leva no PREENCHIMENTO** (R34 da revisão final, `montarSlotsDaLeva` em
  `proposta-de-semana.ts`, puro): `sugerirPosts` só devolve horário livre, mas
  a semente INVENTA horários (11:30, 15:00, 18:30) sem olhar a agenda, e o
  filtro por formato (R22) podia esvaziar a cadência e cair justamente nela —
  às 8h, com o story das 11h30 já agendado e só o feed das 19h livre, a leva
  de story propunha OUTRO story às 11h30. `gradeSemente`/`completarAteOAlvo`
  recebem `ocupado(data, hora)` (mesma régua de 45 min, mesmo formato do
  slot) e PULAM para o próximo horário — filtrar depois deixava um teto baixo
  sem nada. Só um FEED às 11h30 não tira o story das 11h30 (controle no
  teste). O orquestrador não decide horário: registra como sugestão o que a
  função devolve em `semeados`.
  🔴 **O slot semeado leva o FORMATO da leva, e a proposta registrada é por
  horário E formato** (R40 da quarta revisão final, `chaveDaSemente` e
  `planoDaSemente` em `proposta-de-semana.ts`, puros): `registrarSemente`
  usava só versão, projeto e horário — às 8h, sem cadência e sem ocupação,
  a leva de story e a de feed do mesmo dia recebiam 11h30 e o MESMO
  `sugestaoId`; descartar o story marcava como descartada a proposta do feed
  (aceitar depois não vence esse desfecho), e as dicas de copy dos dois
  formatos, ancoradas nesse id, eram comparadas como uma proposta só. Hoje
  `montarSlotsDaLeva` carimba `formato` em todo slot inventado (semente e
  complementação), a chave é a MESMA conta de `sugerir-posts` (R33, com o
  formato no fim) e `sugerido.formato` é gravado; o registro legado (sem
  formato) fica com a chave antiga, nunca reescrita. Teste: as duas levas
  com ids diferentes, reutilização no mesmo formato e âncoras independentes.
  🔴 **`proposta-de-semana.ts` entra no bundle da BANCADA** (R41 da revisão de
  637e9faa, P1): o store cliente importa `para-bancada`, que importa
  `lerFotoCandidatas` dali — e o commit anterior trouxe `aprendizado/chaves`
  para dentro, que importa `node:crypto`. A compilação cliente não resolve
  módulo exclusivo de Node, e a bancada não abriria; o vitest em Node não vê.
  A chave legada (sem formato) sai de `chaveDaPropostaDeSlot` com formato nulo
  (a MESMA string `slot|versao|projeto|horário`), sem nenhum import de
  `chaves`; o teste fixa a igualdade com a chave legada inteira. Módulo
  compartilhado com o navegador só importa módulo puro.
- 🔴 **A copy HERDADA da arte no agendamento cai quando essa arte é re-renderizada
  DEPOIS** (R42 da quinta revisão final, `textos-da-peca.ts`): a ordem inversa de
  R38 — agendar por `generationId` com a arte AINDA legítima copia a copy A para o
  post (sem página própria); a página é editada, a recomposição re-renderiza a
  Generation e `recompor.ts` troca só `mediaUrls`. Entregue, o leitor recusava o
  snapshot mas caía em `copy-do-post` e atribuía A à mídia B. Hoje, com mídia
  única, post sem `pageId` e arte `reRenderizada`, a copy do post (a herdada) não é
  afirmada em nenhum caminho — nem entregue, nem viva com a página ilegível —, e a
  peça é declarada indisponível com o porquê; a cópia REGISTRADA (`_copiaDaPagina`)
  continua valendo, e com a página da arte legível a peça viva já lê a página (que
  É a mídia B). Prova 3h: agendar → re-renderizar → entregar → consultar, sem A.
- 🔴 **Prova que registra propostas coleta o id LOGO depois de cada chamada, antes
  do próximo `await`** (R43): `sugerir-posts` e `buscar-fotos` registram sinal na
  emissão, e ids coletados só depois de TODAS as chamadas deixavam as anteriores
  fora do cleanup quando uma chamada intermediária falhava — sinal sintético
  acumulando no dev com cleanup declarado completo.
- 🔴 **A arte de `post-schedule` é um MODELO com a copy do post por cima, e a
  PÁGINA dela não é a peça** (R36 da segunda revisão final, `copyDaArteDeModelo`
  em `textos-da-peca.ts`): o render de post grava a Generation com
  `source: 'post-schedule'`, `pageId` do modelo e `slotValues` com a copy;
  reagendada pela galeria por `generationId`, o post nasce sem página e a
  agenda lia a página daquela arte — "Título do modelo" por uma mídia que
  mostra "Costela no bafo". Hoje a PROCEDÊNCIA vem antes da página: na arte de
  `post-schedule` com copy PRÓPRIA (`slotValuesParaRender` não nula) vale a
  copy registrada na arte, declarada PARCIAL (o que o modelo trazia fora dela
  e a caixa do render não têm registro), viva ou entregue; a cópia da página
  (`_copiaDaPagina`) e as outras procedências (compositor, com snapshot) caem
  na leitura de sempre. O `arteDe` do handler leva `source` e `slotValues`.
  🔴 E a arte de `post-schedule` RE-RENDERIZADA não afirma a copy antiga
  (R37): o re-render como a página estava preserva `source` e `slotValues`
  no `fieldValues` e grava um PNG que é a página atual, desenhada SEM essa
  copy — afirmá-la seria atribuir texto de outra versão à mídia, contornando
  R13. Com `reRenderizada`, vale o tratamento de sempre: página atual na peça
  viva; cópia registrada ou indisponível na entregue.
  🔴 E `agendarPost` NÃO copia para o post a copy de uma Generation
  re-renderizada (R38): reagendar por `generationId` (ou por `mediaUrls`
  casada pela URL) gravava os `slotValues` antigos em `SocialPost.slotValues`,
  e depois da entrega o fallback `copy-do-post` devolvia a copy A pela mídia B
  — declarar parcial não conserta texto já invalidado. O post nasce SEM cópia
  textual (com aviso) e a agenda declara os textos indisponíveis até um render
  com registro. A cópia legítima (arte não re-renderizada) continua sendo
  copiada.
  🔴 **O que reabilita a copy de arte re-renderizada é o MARCADOR da regravação,
  nunca a ausência da marca de re-render** (integração com o PR 0, 12/09/2026,
  opção a — as duas regras valem). A recuperação forçada do PR 0
  (REV-127-F02/REV-FINAL-02) regrava os `slotValues` com a copy visual do PNG
  que desenhou e grava `recomposicao.copyVisualRegravada: true` no MESMO
  registro. Com o marcador: `lerProcedencia` devolve a copy como visual (e como
  proposta, se não houver `copyDeAprendizado`), `agendarPost` a copia para o
  post por Generation ou por URL, e `textos-da-peca.ts` afirma a copy REGRAVADA
  da arte pela mídia (origem `arte`, parcial — sem a caixa e a ordem do render),
  depois da página na peça viva e antes da indisponibilidade. Sem o marcador
  (re-render anterior ao PR 0, página ilegível que manteve a copy, arte sem copy
  visual), R37/R38/R42 seguem como estavam. Três limites de propósito: o
  SNAPSHOT de arte re-renderizada continua sem afirmar nada (o re-render não o
  regrava); a arte de `post-schedule` re-renderizada não volta a ser lida como
  "modelo com copy por cima" (R37 — ela é a página desenhada), então R47–R50
  não mudam; e o marcador valida a copy da ARTE, nunca a que o post HERDOU
  antes do re-render (R42 continua recusando a herdada; com o slide resolvido
  pela arte, ela simplesmente não aparece). Só `true` estrito reabilita.
  ⚠️ O commit que GRAVA o marcador (`recompor.ts`, 5cc62726 no branch do PR 6)
  é código do PR 0 e deve descer para o PR 0 quando ele for mergeado.
  **Da pré-revisão do HEAD f0eee811 (BLOQUEADO, C6-01…03, 12/09/2026):**
  - 🔴 **C6-01 (P2, pré-existente): a RECUSA da recomposição não pode apagar o
    registro do re-render.** `registrarRecusa` gravava
    `recomposicao: registro('recusada')` por merge raso e o PNG re-renderizado
    ficava: sumiam `estado`, o marcador e `urlsAnteriores`, e R13/R37/R38/R42
    reabriam em silêncio (o slide entregue mostrava o snapshot antigo como
    texto da arte nova; `agendarPost` copiava a copy antiga). Hoje a recusa
    mora em `fieldValues.recusaDaRecomposicao` e `recomposicao` segue sendo o
    registro do render que produziu o PNG atual; o próximo sucesso grava
    `recusaDaRecomposicao: null`. ⚠️ Esse commit (513890a8) é código do PR 0:
    **desce para o PR 0 no merge ou é revisado junto com o PR 6**. A leitura
    da arte da agenda virou `arteDosFieldValues` (módulo puro), para o teste
    ler o mesmo que `ver-agenda`. **Quem escrever em `recomposicao` precisa
    escrever o registro de um render que produziu o `resultUrl` atual** —
    qualquer outro estado (recusa, aviso, tentativa) vai em chave própria.
  - 🔴 **C6-02 (P3): espelho em `fieldValues` é MERGE NO BANCO, nunca
    ler-e-regravar.** O espelho do feedback de arte fazia `findUnique` +
    `update({ ...anterior, feedback })`; um re-render no meio ressuscitava o
    marcador e a copy da versão anterior por cima do `resultUrl` novo (copy B
    afirmada pela mídia C). Hoje é `mesclarFieldValuesDaArte` só com a chave
    `feedback`.
  - 🔴 **C6-13 (P3): o registro do crivo também é merge no banco.**
    `registrarNaGeneration` (`crivo-avaliacao.ts`) fazia o mesmo
    `findUnique` + `update({ ...anterior, crivo })` do C6-02; hoje é
    `mesclarFieldValuesDaArte` só com `crivo`. Só era alcançável chamando
    `POST /crivo/avaliar` direto (o `BancadaCrivo` não está montado), mas a
    rota aceita `generationId` de arte recomponível. Os outros dois escritores
    de `fieldValues` inteiro foram conferidos e ficam como estão, porque só
    alcançam Generation da própria rodada: `fila.ts` (falha da composição) só
    roda para a Generation PROCESSING que `enfileirarPeca` /
    `enfileirarComposicaoDoPlano` acabaram de criar (a recomposição sai antes,
    para `recompor.ts`), e `carousel-service.ts` grava na capa recém-criada
    (ou na PROCESSING reaproveitada pelo dedupe da trilha arte-ia, sem página
    e fora do alcance da recomposição).
  - 🔴 **A avaliação do crivo só grava na arte do PRÓPRIO projeto**: `avaliarCrivo` confere `generation.findFirst({ id, projectId })` ANTES de avaliar — arte de outro projeto ou inexistente dá o mesmo 404 (`GENERATION_NOT_FOUND`), sem chamar o modelo nem gravar, e a rota `/crivo/avaliar` devolve 404 em vez do crivo manual; a trava mora no serviço, onde a escrita mora, e porta nova que embrulhe a avaliação a herda.
  - 🔴 **C6-03 (P3, pré-existente): todo caminho que deriva a cópia textual
    de um post de uma Generation passa por `lerProcedencia`.** A troca de arte
    pela galeria copiava `slotValues` cru; agora segue o R38 + marcador como
    `agendarPost`, e invalidada grava `slotValues: DbNull` com o MESMO aviso
    (`AVISO_COPY_DE_ARTE_RE_RENDERIZADA`) — não o "null = não apaga", que
    deixaria a copy da arte anterior no post. Caminho novo que copie
    `slotValues` de Generation para post precisa do mesmo tratamento.
  - A prova ganhou a seção 3j (marcador + recusa no agendamento, na troca e
    na agenda entregue, com o controle sem marcador). Não foi rodada nesta
    leva — quem roda prova é o orquestrador, em série.
- 🔴 **Na arte de `post-schedule`, o id vence o nome também na LEITURA** (R46
  da revisão final de b90b4335): a copy registrada na arte pode endereçar a
  mesma camada por id e por nome, e o render aplica só a do id. Enumerar os
  valores brutos devolvia o valor descartado como texto da mídia. Hoje só entra
  o que `aplicarSlotNaCamada` aplica às camadas de texto visíveis do REGISTRO
  das camadas desenhadas (o snapshot confiável da arte — R47), na ordem e na
  caixa delas. Sem registro legível, a arte se declara indisponível: a copy
  bruta nunca é atribuída à mídia.
- 🔴 **A estrutura ATUAL do modelo não diz o que a arte desenhou** (R47 da
  oitava revisão final de 74afb769): a Generation de `post-schedule` guarda
  slots e `pageId`, sem as camadas, e depois do render a camada pode ser
  apagada e recriada com outro id e o mesmo nome, ou ter caixa, ordem e
  visibilidade trocadas — aplicar os slots na página de HOJE devolvia pela mídia
  congelada o valor que o render descartou. Só o snapshot confiável afirma, em
  QUALQUER estado: o slide que lê a arte de modelo é sempre um PNG congelado
  (post sem página própria ou carrossel), e o handler não carrega mais a página
  do modelo para a peça entregue. A copy que o post herdou dessa arte no
  agendamento também não é afirmada pelo fallback `copy-do-post` — é o mesmo
  valor bruto. A leitura dessas artes só volta quando o render gravar o
  registro das camadas que desenhou.
- 🔴 **Prova que agenda pelo serviço tem de apagar os SINAIS dos posts que
  criou** (R39 da revisão de 03c279ff): `agendarPost` registra sinal de slot e
  de copy por post (`escolha-propria`), e `LearningSignal.postId` não tem FK —
  o `deleteMany` dos posts os deixava para trás, e cada rodada da prova
  acumulava sinais sintéticos no dev anunciando cleanup completo. O cleanup
  identifica os posts da rodada ANTES de apagar (ids coletados + os recuperados
  pela marca na legenda, para a falha parcial antes do `push`), apaga os sinais
  deles restritos por projeto, post e início da rodada, e confere que nenhum
  sobrou — sobra é falha do cleanup, não aviso.
- 🔴 **Cleanup de prova é uma lista de PASSOS INDEPENDENTES, e nenhuma exclusão
  roda fora da proteção** (R48 da oitava revisão final de 74afb769): o primeiro
  `generation.deleteMany` do `finally` estava fora do bloco protegido, e uma
  falha de conexão nele pulava tudo — posts, entradas, usos e sinais ficavam no
  dev e nem o `resultado.json` era escrito. `limparRodada`
  (`scripts/lib/limpeza-contexto-da-semana.ts`, sem Prisma) roda cada passo no
  próprio `try`, ACUMULA a falha e continua; a prova soma as falhas ao placar
  (saída ≠ 0) e grava o resultado e desconecta mesmo assim. Teste com banco
  falso em que só uma exclusão falha.
- ⚠️ **A grade de FEED não é lida da base**: a entrada com a cadência de feed
  (o Bacana tem uma, com tag `cadencia`) traz linhas DATADAS ("qui 03/09
  18h30"), não uma grade semanal — o parser a deixa de fora de propósito
  desde 01/09. O formato do feed vem do histórico.

- 🔴 **Só a leitura do SLIDE afirma texto de arte de modelo — o fallback da
  copy herdada nunca** (R49, revisão do commit 402c11b1). A presença do
  registro não basta: com o slot `{ content: "" }` pelo id o render descarta o
  valor pelo nome, `agendarPost` grava só o não-vazio, e o post herda
  `{ headline: "Costela" }` — que nunca foi desenhado; com registro ilegível,
  idem. Post sem página própria cuja mídia única é arte de modelo com copy, e
  que chegou ao fallback (o slide não resolveu), declara indisponível em todo
  estado. Teste: `R49` em `textos-da-peca.test.ts` (DRAFT, POSTED, no
  publicador, FAILED; sem valor aplicado e ilegível; controle com valor
  aplicado).
- 🔴 **O post que MANTÉM `pageId` também não afirma a copy bruta pelo
  fallback** (R50, nona revisão FINAL sobre a6fc900e). O post de template cuja
  arte entregue é `post-schedule` guarda os mesmos slots que o render recebeu
  (`later-scheduler` preserva id e nome endereçando a mesma camada; o render
  aplica só o do id). Sem a leitura do slide — sem registro, registro ilegível
  ou nenhum valor aplicado —, a copy do post é o registro NÃO validado do
  pedido: indisponível em todo estado entregue. A peça viva com a página
  legível responde no passo 1 e não chega ao fallback. Teste: `R50` em
  `textos-da-peca.test.ts` (POSTED, POSTING, FAILED, no publicador × três
  cenários; controles viva legível e registro válido).
- 🔴 **Página do post `NOT_NEEDED` cuja mídia é OUTRA arte é vínculo HISTÓRICO, não fonte** (R51 da revisão FINAL
  sobre 16af4e20, 13/09/2026). Trocar a arte pela GALERIA passa o post a `NOT_NEEDED` e CONSERVA `pageId`; ler a página
  ali devolvia os textos da arte anterior com origem `pagina`, antes da procedência da mídia atual (C6-03 contornado).
  `paginaDoPostEHistorica(post, arteDaMidia)` decide pelo estado que todo post já tem (`renderStatus` + a arte da mídia
  única não ser daquela página) — vale para registro antigo. Com ela a peça se resolve pela mídia, e o post conta como
  "sem página própria" para R42/R50. Leitor novo de textos de post passa `renderStatus`.
  🔴 **Só com UMA mídia.** Post sem mídia nenhuma não trocou arte por nada: a página segue sendo a fonte (legível, é lida;
  de OUTRO projeto ou apagada, INDISPONÍVEL — R29/R30). A 1ª versão tratava o post sem mídia como histórico, calava a
  declaração do R30 e zerava os textos do post `NOT_NEEDED` com página do próprio projeto; a prova-dev-36 pegou (sem
  vazamento: páginas e artes já são carregadas filtradas por projeto). Teste pelo caminho real:
  `ver-agenda-isolamento-por-projeto.test.ts`.
  🔴 **A igualdade de `pageId` não prova que a página seja a fonte** (R52 da revisão FINAL sobre 7e96c643, 18/09/2026).
  A arte de MODELO (`post-schedule`) aponta para a página do modelo — que pode ser a mesma do post — e o render aplicou
  só o valor do id quando id e nome endereçam a mesma camada; a troca pela galeria descarta o valor vazio e o post fica
  com o do nome. Com o post `NOT_NEEDED` e a mídia única numa arte de modelo, a página é histórica e vale a procedência
  da mídia (R36/R46/R47), com ou sem registro das camadas.
  🔴 **Os slots do post só entram na página quando ela RENDERIZA a mídia do post.** Com `NOT_NEEDED` e uma mídia que é
  a arte da própria página, o PNG é o da arte (mantido em dia pela recomposição); os slots que o post herdou na troca não
  são entrada de render, e aplicá-los à página editada depois devolvia o texto de antes. Sem mídia, eles SÃO a entrada
  do render que ainda vai acontecer. Testes: `ver-agenda-troca-pela-galeria.test.ts` (R52 e varredura).
  🔴 **A cópia textual que o post carrega só vale pela mídia quando é COMPROVADAMENTE daquela arte** (R53 da revisão
  FINAL sobre f96820bf, 20/09/2026). Com a página histórica, trocar a arte pela galeria por uma arte de IA SEM copy
  registrada (sem página, sem snapshot, não re-renderizada) não dispara nenhuma das duas invalidações do PR
  (`reRenderizada` e `post-schedule`) — e `trocar-arte-do-post` PRESERVA os slots nesse caso, por contrato ("null =
  não apaga", testado). O fallback devolvia "Oferta A" como `copy-do-post`/`copy-registrada` pela mídia B, com uma
  ressalva que só falava em leitura parcial. Hoje o que derruba a cópia é a EVIDÊNCIA DE TROCA
  (`midiaEDeOutraArte`): existe arte casada pela URL, ela está íntegra, e a copy registrada dela não é a do post
  (comparando os textos NÃO VAZIOS pelos dois lados — é assim que a troca os deriva); sem evidência,
  `indisponiveis` não; com ela, `indisponiveis` dizendo que o texto é de OUTRA arte. 🔴 Inferir pelo caminho da
  escrita não serve: são vários (troca pela galeria, melhoria com IA) e nenhum deixa marca.
  🔴 **O critério é EVIDÊNCIA DE TROCA, nunca "consegui conferir" — e essa distinção é o conserto de uma primeira
  versão que reprovou na prova de integração** (prova-dev-40 sobre 5058f94a, R12 e R13 em vermelho, 20/09/2026).
  Exigir a igualdade derrubava junto os dois casos em que NÃO há testemunha da mídia: sem arte casada pela URL
  (R12 — o `generationId` do post é de outra versão) e com a arte apenas RE-RENDERIZADA (R13 — é a MESMA peça
  refeita, e `renderPostArt` regrava a cópia a cada render). Nos dois, a cópia registrada no post é o registro da
  entrega daquela mídia e continua valendo, PARCIAL, como valia. Ausência de prova não é prova: só a arte
  PRESENTE e íntegra cuja copy diverge diz que houve troca. Testes por guarda em `textos-da-peca.test.ts`
  (describe R53) — cada uma desfeita por mutação derruba a sua.
  🔴 **A cópia MARCADA (`_copiaDaPagina`) entra na invalidação só por R53**, nunca pelas outras: em R37/R42/R50 a
  página do post ainda renderiza a mídia e `renderPostArt` regrava a cópia a cada render — num post `NOT_NEEDED` isso
  não acontece. Gatear as quatro portas com o `copyDoPostNaoAfirmavel` inteiro derrubaria as decisões testadas de
  R37/R42 (`copy-registrada-na-entrega` é o fallback permitido ali).
  ⚠️ **Consequência medida**: o post MELHORADO com IA que mantém `pageId` cai nesta regra — a melhoria grava
  `fieldValues.textos` (a régua), nunca `slotValues`, e nunca reescreve a cópia do post. A leitura dele passa de
  "copy do post, parcial" para indisponível. É o certo pelo contrato da casa (declarar, nunca afirmar sem prova) e
  em `refinar` a copy muda mesmo; fechar isso de verdade é a melhoria gravar a copy visual no post.
  🔴 **A evidência de troca vale para `semPaginaPropria`, não só para a página HISTÓRICA** (R54 da revisão FINAL
  sobre a996a082, 20/09/2026). O rascunho criado por `generationId` nasce com `pageId` NULO, e a MESMA troca pela
  galeria o deixava de fora do guard: "Oferta A" voltava como `copy-do-post` pela mídia B, vivo e depois da entrega.
  O residual que a 1ª rodada registrou como "decisão de produto" — "os dois estados são indistinguíveis" — valia
  contra o critério ANTIGO, o da igualdade. Com `midiaEDeOutraArte` eles se distinguem, e a prova está na ESCRITA:
  a copy de um post SEM página vem da arte (`agendarPost` grava `apenasTextos(copyVisual)`, os `slotValues` da
  própria Generation), então divergir É evidência de troca. Com página PRÓPRIA ativa (`RENDERED`) a copy continua
  legítima — o render desenha dela e `renderPostArt` regrava a cópia a cada render.
  🔴 **Post SEM cópia textual não invalida mídia nenhuma** (`if (!doPost) return false` em `midiaEDeOutraArte`):
  `copyIgual(null, null)` é FALSO, então sem essa guarda todo post entregue com `slotValues` nulo voltava com a
  ressalva de R53 no lugar do motivo REAL ("já foi entregue"). Pego pelo teste de R32.
  ⚠️ **O que muda em R32**: post sem página própria cuja arte não tem copy registrada e que CARREGA copy passa a ser
  indisponível — esse estado é o da troca, não sai de `agendarPost`. O caminho legítimo continua lido, porque a copy
  gravada no agendamento É a da arte (as duas batem); a fixture de R32 foi ajustada para a forma real.
  **Varredura da classe com `pageId: null` em mente** (os pontos que condicionam proteção à existência de página
  própria): `paginaDoPostEHistorica` (definicional — sem página não há vínculo histórico), a leitura da página viva
  (o handler só passa `camadas` com `post.pageId`, `agenda.ts:164`), `paginaIlegivel` (sem página própria quem
  declara a fonte é R32, pela mídia), R42 e R53/R54 (os dois em `semPaginaPropria`), R47/R49/R50 (sem gate de
  página) e `textosPorSlide` (dirigido pela arte, nunca por `post.pageId`). O guard de R53 era o único preso a
  `paginaHistorica`.  🔴 **A cópia anterior só sobrevive quando a arte nova a SUSTENTA — e isso se resolve na ESCRITA** (R55 da revisão
  FINAL sobre d95de3e6, 20/09/2026, a terceira variante da mesma família). **A invariante da classe: o texto que a
  agenda devolve descreve a mídia ATUAL do post, ou é declarado indisponível; nunca o texto de outra arte.**
  `trocar-arte-do-post` preservava os slots quando não sabia ler a arte nova ("`null` = não apaga"), e com uma peça
  do compositor RE-RENDERIZADA e sem `slotValues` isso produzia o estado que a leitura não tem como desfazer:
  `lerProcedencia` exige `slotValues !== null` para invalidar (`procedencia-da-copy.ts:101`), e na agenda a arte cai
  na exceção de R13 (re-render é a MESMA peça refeita) — "Oferta A" voltava pela mídia B nas duas portas
  `_copiaDaPagina`. Hoje a troca pela GALERIA apaga (`copyDaArteInvalidada || trocaDePagina || origem === 'galeria'`);
  o contrato "não apaga" fica só no ramo da PÁGINA, onde a mídia sai do render dela e `renderPostArt` regrava a cópia
  a cada render.
  🔴 **Não tente fechar isto pela leitura.** Do lado dela os dois estados são o MESMO objeto (post `NOT_NEEDED`,
  mídia única, arte re-renderizada, cópia que não confere), e a prova de integração OCUPA esse estado exigindo o
  desfecho oposto — as fixtures de R12/R13 gravam `NOT_NEEDED` + `pageId` e esperam `copy-registrada-na-entrega`.
  Foi o que a `prova-dev-40` mediu quando R53 nasceu por igualdade. Regra de leitura que feche R55 reabre R12/R13.
  **A leitura continua sendo a guarda da população LEGADA** (linha trocada antes do deploy) e do post melhorado com
  IA, que a escrita não alcança.
  🔴 **A classe é testada por MATRIZ no caminho real** (`trocarArteDoPost → handler de ver-agenda`, banco falso,
  serviço e handler reais): página própria (histórica · nenhuma) × cópia anterior (marcada · própria · nenhuma) ×
  arte nova (íntegra com copy · íntegra sem copy · re-renderizada sem slots · re-renderizada com slots e sem
  marcador · re-renderizada com `copyVisualRegravada` · de modelo com registro) × rascunho/entregue = 72 células,
  cada uma exigindo as duas metades da invariante. Célula nova da família nasce coberta. **Carrossel fica de fora**
  (leitura slide a slide, nenhum fallback do post a alcança — R15/R20) e a troca pela PÁGINA também (é o único ramo
  em que a cópia sobrevive, de propósito).
  ⚠️ **Depois da correção na escrita, a matriz não exercita mais o guard da LEITURA** — ela nunca chega ao estado
  que ele protege. Mutação nele (`semPaginaPropria → paginaHistorica`) só é pega pelos testes que reinjetam a cópia
  velha como linha legada. Teste de guard de leitura nesta classe precisa montar o estado à mão.
  🔴 **Correção na ESCRITA exige comprovar o LEGADO, e isso se conta em produção — por leitura pura**
  (PR6-F01, 20/09/2026). A regra de escrita só alcança a linha NOVA; a linha gravada antes do deploy fica, e
  nenhum teste responde se ela existe. `scripts/contar-copia-de-outra-arte.ts` (somente leitura, sem `update` e
  sem migration) classifica os candidatos com os MESMOS predicados exportados que `ver-agenda` usa
  (`arteDosFieldValues`, `paginaDoPostEHistorica`, `arteEntregue`) — medir com uma cópia das regras mede outra
  coisa. Medido em 20/09/2026 contra o endpoint `ep-fragrant-term-adnufsao-pooler`: **290 candidatos**
  (`NOT_NEEDED` + 1 mídia + `slotValues::text <> 'null'`), 284 com arte casada pela URL, e **ZERO** em F01; as
  12 com cópia marcada e arte íntegra são o caso que R53/R54 já comparam.
  🔴 **Conte pelos DOIS lados.** F01 exige arte RE-RENDERIZADA, e pelo lado da ARTE existem **5** em toda a base
  (`recomposicao.estado = 're-renderizada'`, criadas em 09–10/09/2026, nenhuma com `slotValues`), usadas por **1**
  post — um carrossel de 4 slides, sem página e sem cópia textual, que nem candidato é. Uma direção confirma a
  outra; o script faz as duas numa rodada.
  ⚠️ **A contagem tem DATA.** Até o deploy a escrita antiga segue em produção e pode criar a linha — mesmo
  precedente de `scripts/marcar-copia-da-pagina.ts` ("rode de novo depois dele"). Rodar o contador de novo custa
  uma leitura; aparecendo linha, o caminho é saneamento com dry-run (`--confirmar` para escrever, **sem backfill
  de texto inventado**: o que não se sustenta vira ausência, nunca palpite), nunca guarda nova na leitura.
  🔴 **O PR 6 LÊ a vizinhança que o #142 mudou, e a leitura tem de seguir o render** (rebase de 20/09/2026,
  `origin/main` em 17ff3e1a). `slotValuesParaRender` ganhou o parâmetro `paginaEhModelo` e passou a devolver
  NADA em página de CONTEÚDO — o render deixou de aplicar os slots do post ali. `textos-da-peca.ts` chamava a
  função em DOIS lugares, e o `tsc` acusou os dois (arity), mas **a resposta certa é diferente em cada um**,
  porque são PERGUNTAS diferentes:
  - `copyDaArteDeModelo` e o fallback `copy-do-post` perguntam "esta cópia é PRÓPRIA do post, ou é cópia da
    página?" — quem responde é a marca `_copiaDaPagina`, e a pergunta vale mesmo quando não há página nenhuma
    (post cuja página virou vínculo histórico). Passar `true` ali só para reaproveitar a função AFIRMARIA que a
    página é modelo sem saber. Por isso a pergunta ganhou nome próprio: `copyPropriaDoPost`, e
    `slotValuesParaRender` passou a delegar a ela (comportamento da main preservado, byte a byte).
  - `slotsDoRender` (a peça VIVA lida com os slots por cima da página) pergunta "o que o render vai desenhar?",
    e essa É a do #142: hoje chama `slotValuesParaRender(sv, fontes.paginaEhModelo === true)` — a MESMA função
    que `story-renderer` chama, para os dois não divergirem. `FontesDaPeca.paginaEhModelo` vem do handler
    (`Page.isTemplate`, no mesmo `select` das camadas); ausente = NÃO é modelo, que é o lado conservador.
  **Nenhuma célula da matriz de R53/R55 muda de desfecho**: as 72 são `NOT_NEEDED` com uma mídia, e ali
  `slotsDoRender` já era forçado a `null` (os slots herdados na troca não são entrada de render nenhum). Quem
  muda é a peça VIVA com página PRÓPRIA — fora da matriz e coberta pelo controle da galeria, que passou a
  esperar `origem: 'pagina'` com os textos da página. As 6 fixtures de `textos-da-peca.test.ts` que exercitam
  o caminho de template passaram a declarar `paginaEhModelo: true`: o intento delas sempre foi o MODELO
  ("texto do modelo", "Título do modelo"), e agora isso está escrito em vez de implícito.
  **Mutação** (o que cada metade guarda): `slotsDoRender` de volta a `proprios` → 1 falha (o controle da página
  de conteúdo); `proprios` trocado por `slotValuesParaRender(...)` → 6 falhas (o fallback some em toda peça sem
  página). A prova de integração cobre os DOIS lados no caminho real — página de conteúdo devolvendo a página, e
  uma página MODELO (quando o projeto tem uma com texto) em que os slots continuam vencendo.
