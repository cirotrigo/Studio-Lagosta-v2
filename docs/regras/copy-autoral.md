# Contrato da copy autoral

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### O contrato da copy autoral (F1 de "Marca simples, copy melhor", 12/09/2026)

Quem escreve é o Claude, no chat; o Studio é guardião da FIDELIDADE. Até
aqui a copy viajava como `string[]` posicional (`ItemDePlano.copyProposta`) ou
como `Bloco[]` por papel (`spec.blocos`), e o caminho até a arte cortava,
reordenava ou transformava o texto em pelo menos uma dezena de pontos sem
registro (seção 6 do plano). `src/lib/copy-autoral/` é o contrato — módulo
PURO (zod), sem Prisma, com teste de ida e volta exata.

- **Por bloco: `id` estável (do autor), `funcao` (pre · headline · apoio · cta ·
  servico · livre), `grupoDeLeitura` (os blocos que se leem como UMA frase —
  do AUTOR, nunca deduzido do papel), `ordem` explícita (a ordem do array não
  é contrato), `linhas` EXATAS (caixa, acento, quebra e `[colchetes]` como
  escritos), `fatos` (as entradas da base que sustentam preço, horário, data,
  promoção) e `estilo` (`herdaDe`, e a segunda voz da manchete DECLARADA por
  linha em `linhasNaVoz2` — até aqui a última linha mudava de voz sozinha).**
- **Na copy: `versao`, `origem` (quem escreveu, quando, por onde), `revisoes`
  (toda mudança com autor claude · equipe · sistema · desconhecido, data,
  motivo e blocos tocados) e `lacunas` (o que o contrato NÃO sabe).**
- 🔴 **Campo OMITIDO ≠ bloco VAZIO.** O autor que não escreveu o CTA não
  manda o bloco; o que quer a camada sem texto manda `linhas: []`. No legado
  os dois viravam "sem texto".
- 🔴 **O adaptador do legado DECLARA o que não sabe e NÃO INVENTA**:
  autoria `desconhecido` (nunca "claude" por palpite), ordem pela posição
  registrada em `lacunas`, sem grupos de leitura, e a lista posicional sai
  com função `livre` — atribuir papel pela posição era justamente a
  transformação silenciosa (`copyParaBlocos`) que o contrato existe para
  expor. `copyComparavel()` é falso para autoria desconhecida: legado entra
  na métrica como "não comparável", nunca como fidelidade comprovada.
- 🔴 **Adaptador nunca devolve contrato que o leitor rejeita** (PR2-01 da
  revisão final do Codex, 13/09/2026). O legado aceita o que o contrato não
  comporta — a API de itens aceita 2.000 caracteres por item, o contrato 300
  por linha e 12 linhas por bloco —, e a primeira versão devolvia sucesso que
  voltava `copy: null` na releitura. Hoje a saída passa por
  `validarCopyAutoral`: `converterListaLegada`/`converterBlocosLegados`
  devolvem `{ copy: null, problemas, original }` e `copyDeListaLegada`/
  `copyDeBlocosLegados` LANÇAM `CopyLegadaIncompativel`. **Nunca truncar nem
  redistribuir texto para caber** — é a transformação silenciosa que o
  contrato existe para expor.
- 🔴 **Histórico cheio é RECUSA, nunca compactação** (PR2-02). A revisão
  aceita até 80 ids tocados (trocar 40 blocos por 40 novos toca os dois lados),
  e com 200 revisões `aplicarRevisao` lança `HistoricoDaCopyCheio` (com a copy
  intacta e as mudanças pendentes). Não há saída sem perda: toda remoção
  precisa ficar registrada e revisão tem um autor só, então apagar ou fundir
  revisão antiga descarta autoria. **Quem chama `aplicarRevisao` num caminho
  que não pode falhar (autosave do editor) precisa tratar a recusa** —
  `historicoCheio(copy)` responde antes, sem exceção.
- 🔴 **As DUAS INVARIANTES do módulo são testadas por varredura de fronteira,
  não caso a caso** (auditoria do PR 2, 13/09/2026, depois de quatro rodadas
  do Codex achando um teto por vez — PR2-01 a PR2-04). (1) **Tudo que o
  módulo PRODUZ o leitor ACEITA, com conteúdo idêntico**; quando não dá, a
  recusa é explícita e a entrada fica intacta. (2) **Validar a parte concorda
  com validar o todo nas regras LOCAIS.** `__tests__/invariantes.test.ts` lê
  os tetos do PRÓPRIO zod e gera teto-1 · teto · teto+1 · vazio · omitido ·
  duplicado · fora do alfabeto em todo campo; tipo de schema que ela não
  conhece quebra o teste. Campo novo com limite entra sozinho — função
  produtora nova entra na varredura no mesmo commit.
- 🔴 **`aplicarRevisao` confere o RESULTADO inteiro no leitor antes de
  devolver.** Conferir campo a campo deixou escapar um teto por rodada:
  ids tocados (PR2-02), histórico (PR2-02), metadados (PR2-03 — motivo vazio
  ou de 301, `em`/`superficie` acima de 40). Hoje metadado fora do teto ou
  bloco novo que o contrato não comporta lança `RevisaoDaCopyInvalida`
  (original intacta, `problemas` completos; os de metadado começam por
  "revisão nova:"), e `tentarAplicarRevisao` devolve a mesma decisão sem
  exceção. **Mudança de comportamento para quem chama**: bloco inválido
  deixou de voltar como copy que o leitor rejeita — quem conferia DEPOIS
  (`copy-do-item.ts`, na F4) precisa trocar para `tentarAplicarRevisao`, e
  quem não pode falhar (autosave do editor via `copyEfetivaDasCamadas`) trata
  as duas exceções. Metadado vazio é RECUSADO, nunca omitido em silêncio
  (`superficie: ''` sumia; `em: ''` virava inválido).
- 🔴 **Regra LOCAL mora uma vez só**: `problemasLocaisDoBloco` (segunda voz só
  na manchete, só em linha que existe) e `problemasLocaisDaRevisao` (campos e
  remoções listados em `blocos`) são chamadas por `problemasDeCoerencia` E por
  `validarBlocoAutoral`/`validarRevisaoDaCopy`. Regra local nova entra nelas —
  escrita só em `problemasDeCoerencia`, o validador do elemento solto volta a
  aprovar o que a copy recusa (PR2-04). Regra de CONJUNTO (id repetido, ordem,
  grupo, revisão citando bloco que não existe) fica só na copy.
- **O que o ADAPTADOR inventa cabe no contrato por construção**: o id nascido
  do papel tem teto (56 + sufixo), a lacuna cita no máximo 60 caracteres do
  papel (com "…") e papéis desconhecidos além das vagas viram UMA lacuna de
  resumo. Antes, papel de 61+ caracteres ou 18 papéis desconhecidos viravam
  `CopyLegadaIncompativel` de um texto que cabia — recusa espúria.
- **A única conversão de saída é `blocosParaOCompositor`** (contrato →
  `Bloco[]` por papel, em ordem), e ela não transforma texto: bloco `livre`
  volta em `semPapel` em vez de sumir — quem chama decide (recusa, camada
  extra da F3, aviso). O PR 4 faz o compositor consumir o contrato direto.
- **Revisão é diff EXATO** (`aplicarRevisao`/`diferencasDeBlocos`): mudar a
  caixa ou o acento aparece como revisão de quem mexeu, e `autorDoBloco` diz
  quem foi o último a tocar em cada bloco. Sem mudança não há revisão vazia.
- **Validação devolve TODOS os problemas** (id repetido, ordem repetida ou
  com buraco, grupo de um bloco só, voz 2 fora da manchete ou em linha
  inexistente, revisão citando bloco que não existe), nunca só o primeiro.
- ~~Nada persiste ainda~~ — **o PR 3 gravou o contrato** (seção seguinte). Nenhum
  backfill inventa copy original para o histórico: página, item e arte antigos
  ficam sem contrato, e o adaptador do legado só entra quando uma spec nova
  chega só com `blocos`.

### A persistência do contrato da copy (PR 3 de "Marca simples, copy melhor", 12/09/2026)

Migration aditiva `20260912120000_copy_autoral`: `Page.copyAutoral` e
`ItemDePlano.copyAutoral` (JSONB, nulos). Na arte, `Generation.fieldValues.copyAutoral
= { original, efetiva, comparavel, lacunas? }`. Módulos: `src/lib/copy-autoral/efetiva.ts`
(camadas → contrato, puro), `persistir.ts` (a única casa do módulo que importa o
Prisma), `src/lib/planos/copy-do-item.ts` (puro). Prova de integração no branch de
dev: `scripts/validar-copy-autoral.ts`.

- 🔴 **A PÁGINA guarda a EFETIVA, a GENERATION guarda o ORIGINAL.** A efetiva é o
  original + a revisão do SISTEMA com o que o compositor mudou ao desenhar
  (`copyEfetivaDasCamadas`, superfície `compositor`). Medido na primeira rodada da
  prova: com a página guardando o original, a primeira edição da EQUIPE levava a
  culpa pela seta que o compositor põe no CTA e pelo destaque `[]` que ele não
  desenhou sem estilo cadastrado. O contrato da página descreve o que a página
  MOSTRA; a edição seguinte é diferenciada contra ele, e cada bloco tem o autor
  certo (`autorDoBloco`). O texto verbatim do autor está em
  `fieldValues.copyAutoral.original` (e em `ItemDePlano.copyAutoral`).
- **`comparavel` só é verdadeiro com autoria conhecida.** Spec que chega só com
  `blocos` (legado) vira contrato ADAPTADO com `origem.autor: 'desconhecido'` e
  entra na métrica como "não comparável" — nunca como fidelidade comprovada.
- 🔴 **Quem grava camadas grava a revisão do contrato NA MESMA ESCRITA**
  (`revisaoDaPaginaComCamadas`, puro, em `revisar-pagina.ts`): o PATCH do editor
  (`equipe`, `editor` — disparado por QUALQUER mudança de camadas, e o diff
  exato decide se há revisão: só o destaque do rich text, ou uma quebra, revisa;
  autosave idêntico não), `ajustarArte` (`equipe` com `canal: 'studio'`, `claude`
  no resto), `reverterCamadasDaArte` (`sistema`, `reverter-arte`) e a
  recomposição. Calculada num `after()`, dois autosaves fora de ordem deixavam
  a página com as camadas B e o contrato de A (R02 da revisão do Codex). Página
  SEM contrato fica sem (`sem-contrato`), nunca lança. A Generation do ajuste
  leva `original` (o contrato da página, já revisado) e `efetiva` (as camadas
  finais). `registrarRevisaoDaPagina` (com Prisma, compare-and-set no contrato
  lido) é só o caminho tardio para quem tem o `pageId` e camadas já gravadas.
- **A recomposição leva à spec o contrato DA PÁGINA como ela está** (lido das
  camadas atuais sobre o contrato gravado) e tira os blocos dele; ao terminar,
  grava a efetiva recomposta na página e em `fieldValues.copyAutoral.efetiva`
  (o `original` fica). Manter o contrato velho na spec fazia `validarSpec`
  recusar a recomposição e o slide ficava com o texto antigo (R01).
- **Bloco VAZIO de propósito não vira bloco do compositor**
  (`blocosParaOCompositor` o pula; ele continua no contrato): o schema exige
  linha, e o item de plano com `cta: []` caía em `SPEC_INVALIDA` na fila.
- **Texto solto lido como bloco `extra-<id>` é relido ESTÁVEL** (o bloco casa
  também pelo id que a leitura anterior deu à camada; ids únicos) — antes a
  segunda leitura esvaziava o bloco e criava outro com o mesmo id, e o
  contrato deixava de ser lido (R03). Duplicar página leva o contrato (R08).
- **O compositor ainda transforma texto, e o contrato EXPÕE isso em vez de
  esconder**: a seta no CTA e o destaque não desenhado saem em `ver-geracao`
  como `copy.blocosDiferentes` e na revisão do sistema. Tirar as transformações
  é o PR 4 — não "corrija" a efetiva para bater com o original.
- 🔴 **`validarSpec` deriva `blocos` de `copyAutoral`** (a única conversão
  sancionada, `blocosParaOCompositor`) e recusa: bloco `livre` COM texto (a camada
  livre chega na F3 — recusar é o oposto de sumir em silêncio) e `blocos` que não
  batem com o contrato quando os dois vêm. `blocos` passou a ser opcional na spec;
  sem contrato continua obrigatório.
- **Item de plano: o contrato manda, `copyProposta` é o ESPELHO posicional**
  (um item por bloco com texto, linhas unidas por `\n`) — é o que a bancada,
  `executar-plano` e as vias de template/IA leem até o PR 5. Contrato inválido
  recusa o item (`COPY_AUTORAL_INVALIDA`, 400). Edição só da lista (bancada) vira
  revisão da `equipe` quando casa posição a posição (mesmo número de blocos com
  texto; a segunda voz por índice acompanha a linha que sumiu); quando não casa,
  o contrato é DESCARTADO COM AVISO — manter um contrato que não descreve mais o
  texto seria mentir para a métrica. `montarSpecDoItem` leva o contrato à spec.
- **No conector**: `compor-arte`, `compor-leva`, `criar-plano` e
  `editar-item-do-plano` aceitam `copyAutoral` (com ele `blocos`/`texto` são
  dispensáveis); `editar-item-do-plano` assina a revisão como `claude`;
  `ver-geracao` devolve `copy` (escrita × desenhada, `comparavel`,
  `blocosDiferentes`, `lacunas`). Os quatro snapshots do registro foram atualizados
  no mesmo commit.
- ⚠️ **A migration ainda não foi aplicada em produção** (regra da casa: escrita à
  mão + `db:deploy`, com o OK do Ciro); no branch de dev está aplicada. O código
  sem a coluna falha na leitura de `Page.copyAutoral` — não subir o código antes
  do schema.
- 🔴 **A camada escondida pelo REVISOR não é remoção autoral** (rebase do PR 3
  sobre o PR 0, 12/09/2026). O ajuste `visibilidade` do revisor grava na camada
  `metadata.revisao.ocultaPeloRevisor`; `revisaoDaPaginaComCamadas` lê as
  camadas por `camadasParaDecisao` (a escondida pelo revisor conta como
  presente), então o PATCH do editor, `ajustarArte` (`claude`/`equipe`),
  `reverterCamadasDaArte` e `registrarRevisaoDaPagina` não assinam o bloco
  vazio como edição de quem pediu — nem mostrar a camada de novo vira adição.
  Camada escondida SEM a marca continua sendo remoção autoral. A efetiva da
  ARTE (`copyEfetivaDasCamadas` sobre as camadas cruas: Generation do ajuste,
  recomposição, compositor) segue dizendo o que foi DESENHADO, como revisão do
  sistema — a marca nunca muda o que a arte mostra. Leitor novo que decida
  AUTORIA a partir de camadas precisa do mesmo `camadasParaDecisao`. Teste em
  `revisar-pagina.test.ts` (com a marca: sem revisão; edição em outro bloco:
  só aquele bloco; controle sem a marca: revisão da equipe).

**Da pré-revisão do commit bf85cb26 (BLOQUEADO, C3-01…02, 12/09/2026):**

- 🔴 **`ajustarArte` SEM `versaoEsperada` também grava por compare-and-set**
  (C3-01, P2). O ajuste só de foto ou de nome, vindo do chat, lia a página,
  levava segundos resolvendo imagem, medindo e rodando o autofix, e gravava com
  `update` cru: se o editor salvasse texto novo no meio, a revisão calculada
  contra a leitura antiga saía `sem-mudanca`, as camadas velhas iam por cima e a
  página ficava **camadas X, contrato Y** — e a próxima edição no editor
  assinava como `equipe` a volta do texto. Hoje, perdida a corrida, a página é
  RELIDA e o ajuste só segue se o CONTEÚDO (`versaoDaPagina`) e o contrato
  continuam os que ele leu; senão nada é gravado e volta 409
  `PAGINA_MUDOU_DURANTE_O_AJUSTE` (`ajusteGravado: false`), que o conector
  devolve como erro, sem retentar. **Não troque a releitura por um
  compare-and-set puro em `updatedAt`**: o carimbo muda em qualquer escrita, e
  com o editor aberto o autosave grava miniatura e camadas idênticas a cada
  pausa — todo ajuste do chat tomaria 409 falso. Vale para página com e sem
  contrato (sem contrato, gravar por cima apagava a edição da equipe em
  silêncio). O ramo COM `versaoEsperada` ficou como estava (compare-and-set
  estrito). Teste em `ajustar-arte-concorrencia.test.ts`.
- **No PATCH, a marca `ocultaPeloRevisor` é reconciliada contra a leitura
  PROTEGIDA** (C3-02, P3): contra a base fresca antes da prévia e de novo contra
  `fresca` a cada volta do compare-and-set, antes de medir a diferença e revisar
  o contrato — nunca contra `existingPage`. O autosave não espera o PATCH em voo:
  mostrar a camada (P1) e escondê-la de novo fazia P2 manter a marca antiga lida
  antes de P1, e a remoção humana nunca entrava no contrato nem no aprendizado.
  Troca consciente: aba desatualizada que regrave escondida e marcada uma camada
  que outra aba mostrou conta como remoção de quem gravou por último. Teste em
  `src/app/api/templates/[id]/pages/[pageId]/__tests__/patch-marca-do-revisor.test.ts`.
- **As duas regras cobrem também a reconciliação com as camadas ANTERIORES do
  PR 5** (`camadasAnteriores`): as anteriores de `ajustarArte` são a leitura que
  o compare-and-set protege, e as do PATCH são a `fresca` contra a qual a marca
  foi reconciliada. Leitura nova de "como a página estava" que entre numa decisão
  de autoria precisa ser a mesma que a escrita substitui.

**Da pré-revisão do commit 046d2a5e (BLOQUEADO, C3-11…12, 12/09/2026):**

- 🔴 **A marca do revisor só sobrevive se a BASE também a tem** (C3-11, P2).
  O editor nunca recebe a remoção da marca feita no servidor (o `design` só é
  recarregado quando muda o id da página), então depois de mostrar e esconder de
  novo uma camada que o revisor ocultou, QUALQUER autosave seguinte reenviava a
  marca; como a base estava escondida SEM marca, a regra antiga ("tira a marca
  só se a base estava visível") a mantinha, e o contrato ganhava uma revisão da
  `equipe` devolvendo o bloco sobre uma camada que a página mostra escondida —
  mais uma decisão falsa de copy no corpus. A regra passa a ser `a &&
  !ocultaPeloRevisor(a)` → sem marca. **A correção mora em
  `src/lib/creatives/revisao/oculta-pelo-revisor.ts`, que é código do PR 0: foi
  aplicada lá e chega ao PR 3 pelo rebase** — não se mexe nesse módulo no PR 3.
- **`ajustarArte` recusa a página promovida a MODELO no meio do ajuste**
  (C3-12, P3). A releitura do compare-and-set conferia conteúdo e contrato, mas
  não `isTemplate`: "Marcar modelo" durante os segundos do ajuste deixava gravar
  camadas e criar Generation numa página-modelo. Hoje as DUAS escritas
  protegidas (com e sem `versaoEsperada`) levam `isTemplate: false` no `where`,
  e quem perde a corrida relê a página e lança a MESMA recusa da leitura inicial
  (`PAGINA_E_MODELO`, 400, `erroDePaginaModelo`). O `where` cobre o escritor que
  não move o carimbo; o toggle do editor move, e aí quem pega é a releitura.
- **O 409 `PAGINA_MUDOU_DURANTE_O_AJUSTE` não convida a repetir**: a mensagem
  manda rever a arte como ela está (conferir-arte), contar à pessoa que ela mudou
  e confirmar antes de ajustar de novo. Repetir na hora regravaria o texto que a
  equipe acabou de editar. O código do erro ficou o mesmo.
- **A comparação do contrato na releitura tem teste próprio** (só o contrato
  muda, conteúdo idêntico → 409), embora hoje nenhum escritor mude só o
  contrato: sem o caso, apagar `mesmoContrato` passava por todos os testes.
- 🔴 **Quem grava camadas TRATA as duas recusas do contrato; nenhuma vira 500
  nem derruba peça** (restack sobre o PR 2, `e3c1f75f` e `9238098f`, 13/09/2026).
  `HistoricoDaCopyCheio` e `RevisaoDaCopyInvalida` (camada com linha acima de
  300, mais de 12 linhas, mais de 40 blocos) chegam por `copyEfetivaDasCamadas`
  a todo caminho que grava camadas: use `tentarCopyEfetivaDasCamadas` (devolve
  `ok: false` + aviso com o que fazer) e `revisaoDaPaginaComCamadas`, que devolve
  `historico-cheio`/`copy-invalida` — `recusaDaRevisao(r)` dá o aviso. A
  regra de produto é uma só: **as camadas e a arte seguem, o contrato fica como
  estava (nunca a 201ª revisão), e o aviso sai** — no PATCH do editor
  (`avisoDaCopy` na resposta + log), no `ajustarArte` e no `reverter-arte`
  (`avisos`), na recomposição (avisos do registro) e no compositor
  (`fieldValues.avisosDaCopyAutoral` e `diagnostico.avisos`). Na spec sem
  contrato, que não limita caracteres, o compositor usa `converterBlocosLegados`
  e segue SEM contrato com aviso quando o legado não cabe. No plano, o erro vira
  4xx explícito (`COPY_HISTORICO_CHEIO` 409, `COPY_LEGADA_INCOMPATIVEL` e
  `COPY_REVISAO_INVALIDA` 400) com o que fazer; `orientacaoDosProblemas` traduz
  problema de LIMITE em instrução ("quebre a linha"). Quem descarta a revisão
  inválida usa `tentarAplicarRevisao`, nunca confere DEPOIS de `aplicarRevisao`
  (ela já lança). **As lacunas da leitura das camadas entram no contrato só até
  o teto do schema** (`lacunasQueCabem`, com uma de resumo); a lista inteira
  segue em `CopyEfetiva.lacunas` para o registro da arte. ⚠️ Com `strict:
  false`, `!x.ok` NÃO estreita a união: use `x.ok === false` antes de ler `aviso`.

**Da revisão FINAL do Codex sobre abac9b34 (BLOQUEADO, PR3-F01…F07, 18/09/2026):**

- 🔴 **Toda escrita de `Page.layers` em página que pode ter contrato passa por
  `gravarCamadasComRevisao`** (`src/lib/copy-autoral/persistir.ts`) ou tem o
  mesmo laço escrito no lugar (PATCH do editor, `ajustarArte`, recomposição):
  relê a página, calcula as camadas SOBRE ela, revisa o contrato sobre ela e
  grava por compare-and-set em `updatedAt` (4 voltas, depois 409
  `PAGINA_MUDOU_DURANTE`). Escrita humana passa `humana: true` (a marca do
  revisor é reconciliada contra a mesma base). Faltava em três portas: a
  reversão (F01 — lia o contrato fora da escrita; um PATCH no meio deixava
  camadas X com contrato Y, e no ramo com revisão apagava a revisão
  concorrente), o PATCH de CAMADA (`use-auto-save-layer`) e o PUT do TEMPLATE
  (F03 — gravavam camadas sem revisar o contrato; a edição seguinte levava a
  autoria errada). O PATCH de camada funde a camada na página RELIDA: o
  autosave de outra camada no meio não é desfeito. Porta nova que grave
  camadas usa a função — `tx.page.update({ data: { layers } })` cru é o
  defeito de volta.
- 🔴 **Quem troca o PNG de uma arte que carrega `fieldValues.copyAutoral` grava
  o registro de novo** (`registroDaCopyDaArte`, puro, em
  `src/lib/copy-autoral/registro-da-arte.ts`; F02). O re-render da recomposição
  (página ajustada à mão, recuperação forçada) trocava o PNG e mantinha a
  `efetiva` antiga, que `ver-geracao` mostrava como `desenhada` com
  `comparavel: true`. A efetiva é medida nas camadas que o PNG desenha, sobre o
  contrato da página; sem como medir (histórico cheio, copy que não cabe,
  camadas ilegíveis), `efetiva: null`, `comparavel: false` e o motivo em
  `lacunas` — **nunca a efetiva antiga como se fosse a da imagem nova**. Arte
  sem registro não ganha um. Vale também para a recomposição que troca a
  imagem sem conseguir ler o contrato (`copyDaArteIndisponivel`).
- 🔴 **A segunda voz da manchete é RECONSTRUÍDA das camadas presentes**
  (`comSegundaVoz` em `efetiva.ts`; F05): `linhasNaVoz2` nunca é herdado do
  contrato na leitura das camadas. Sem `headline2` visível o índice sai; manchete
  não desenhada sai sem ele. Herdado, o índice apontava para linha inexistente
  (revisão válida recusada, contrato velho) ou sobrevivia às linhas reunidas na
  primeira voz (mudança sem registro). `herdaDe` fica.
- **O espelho posicional do item leva as strings EXATAS do contrato** (F06):
  `espelhoDoContrato` não apara nada, e só o bloco sem texto (vazio ou só
  linhas em branco — o que a bancada já filtra) fica de fora. A lista
  posicional num item COM contrato é comparada como veio. Aparar convertia a
  normalização do sistema em revisão da `equipe` quando a bancada reenviava o
  espelho ao salvar outro campo.
- **Campo omitido não é campo vazio** (F07): `{ copyAutoral: null }` sem
  `copyProposta` remove só o contrato — a lista fica (`CopyDoItem.copyProposta`
  `undefined` = não mexe). Limpar a lista é pedir `copyProposta: []`.
- 🔴 **`atualizarItem` grava condicionado à versão lida** (F04): `updateMany`
  com `updatedAt`; perdida a corrida o item é relido e a edição recalculada (as
  duas revisões ficam no histórico; a lista de quem grava por último vale, como
  sempre valeu); depois de 3 voltas, 409 `ITEM_MUDOU_DURANTE` com nada gravado.
  Harness de teste que mocke `itemDePlano.update` para `atualizarItem` precisa
  de `updateMany`.

**Da revisão FINAL do Codex sobre cc14f30a (BLOQUEADO, PR3-R8-01…03, 18/09/2026):**

- 🔴 **Superfície que edita copy de um item com contrato edita BLOCO a BLOCO,
  nunca um texto concatenado** (R8-01). O modal "Editar a peça" da bancada
  juntava os blocos num textarea e separava por quebra de linha: bloco de duas
  linhas virava dois, linhas vazias sumiam, e salvar SÓ a legenda descartava o
  contrato (mudou o número de blocos) ou registrava a normalização como revisão
  da `equipe`. Hoje é um campo por bloco (`blocosParaEdicao`), a copy volta
  como a lista ORIGINAL quando não foi editada (`copyDaEdicao`) e o patch só
  leva `copyProposta` quando ela mudou (`patchDaEdicaoDoItem`, em
  `para-bancada.ts`). O teste segue o caminho real — item do servidor → card →
  modal → patch → `atualizarItem`; testar só a hidratação pulava justamente a
  transformação do modal. Varredura: o compositor da bancada e o
  `gerar-arte-ia-modal` ainda usam "um bloco por linha", mas criam item/arte
  NOVOS (sem contrato a preservar); duplicar card e duplicar da galeria copiam
  o espelho exato e o item novo nasce sem contrato.
- 🔴 **Bloco ÚNICO da função leva TODAS as camadas dela** (R8-02,
  `copyEfetivaDasCamadas`). O compositor reparte um bloco em várias camadas do
  mesmo papel (`servico` e `servico-2` pelo arranjo; `distribuirLinhas` faz o
  mesmo com qualquer papel), e a leitura dava a 1ª camada ao bloco e criava
  OUTRO bloco `servico` com a 2ª: `Page.copyAutoral` ficava com dois serviços
  e a recomposição seguinte morria em `papel repetido`, com o slide preso na
  imagem velha. As linhas voltam juntas de cima para baixo; quando são as
  MESMAS do bloco em outra ordem, fica a ordem do autor (quem reordenou foi o
  arranjo — horário no grupo do relógio, endereço no do alfinete). Numa camada
  só, reordenar continua sendo edição. Com vários blocos da função, uma camada
  por bloco na ordem vertical, como antes. `copyDosPapeis` passou a juntar o
  papel repetido como `copyDosPapeisComDestaque` já fazia.
  ⚠️ **Com o PR 9 por baixo** (restack de 18/09/2026) a leitura das partes é
  a do PR 9 (R18–R28): a marca `linhasDoBloco` põe cada linha na posição
  autoral, e a página legada se lê pelo id `<papel>-N` e pela altura. A
  varredura ampla ("leva TODAS as camadas", que engolia a caixa posta à mão) e
  a reordenação pelo conjunto saíram — as provas deste bullet passam pela regra
  do PR 9, e o invariante do PR 9 recusa reordenar página legada editada.
- 🔴 **Camada "usada" se marca por OBJETO, nunca por id** (varredura do R8-02).
  O contador `${papel}-${n}` de `compor.ts` recomeça em CADA grupo: o serviço
  repartido entre dois grupos da página (Happy wine do TERO) sai com duas
  camadas de id `servico`, e com `usadas` por id a segunda sumia da leitura —
  o endereço deixava o contrato e a recomposição o apagava. ⚠️ O id duplicado
  continua nascendo no compositor (é do PR 4); aqui só a leitura ficou imune.
- 🔴 **Os blocos DERIVADOS do contrato passam pelo mesmo schema dos
  explícitos** (R8-03, `validarSpec`). O contrato aceita linha vazia e até 12
  linhas; o compositor não. Sem a conferência, `enfileirarPeca` gravava o job
  e o worker recusava com `SPEC_INVALIDA` ao revalidar a spec expandida — o
  mesmo conteúdo com dois destinos. A recusa é na porta, sem cortar texto, e
  toda spec aceita revalida igual depois da ida e volta do payload.
  ⚠️ **Com o PR 9 por baixo** (restack de 18/09/2026) os limites de linha da
  spec são os do contrato (R06): linha vazia e até 12 linhas são aceitas na
  porta E na revalidação. A conferência segue com os limites da própria spec
  (`specSchema.shape.blocos`) e recusa o que passa do teto do contrato.
- Provas: `atualizar-item-copy.test.ts` (o modal real, legenda só e uma linha
  editada), `recompor-servico-repartido.test.ts` (spec → persistência →
  edição da manchete → recomposição, com o `validarSpec` real, a troca do
  slide e a capa; o arranjo que inverte as linhas; os dois grupos com id
  repetido; dois blocos da função) e `spec-blocos-derivados.test.ts` (linha
  vazia e sete linhas recusadas antes do banco). Cada correção desfeita por
  mutação faz a sua prova falhar.

**Da revisão do Codex sobre cd98cd6d (BLOQUEADO, PR3-R9-01…03, 20/09/2026):**

- 🔴 **Efeito colateral se decide pela base EFETIVAMENTE SUBSTITUÍDA, nunca
  pela leitura do começo do handler** (PR3-R9-01). É a TERCEIRA rodada desta
  mesma classe (REV-01 da 3ª rodada no PATCH da página; PR3-F01/F03 nas portas
  de escrita), agora no PUT do template: ele lia X em `existingPages`, um PATCH
  concorrente gravava Y, `gravarCamadasComRevisao` relia Y e gravava X por
  compare-and-set — e `marcarSeMudou`, comparando X com X, deixava a gravação
  FORA de `paginasAlteradas`. A página ia de Y para X sem invalidar a imagem
  única nem pedir a recomposição do slide, e uma mídia já produzida com Y
  seguia divergente. Hoje `gravarCamadasComRevisao` devolve em `base` também
  `background`/`width`/`height`, e a decisão é `g.camadas` (as camadas
  EFETIVAMENTE gravadas, já com a marca do revisor reconciliada) contra
  `g.base` — os três campos visuais na MESMA comparação protegida.
  **A regra geral**: a leitura que decide o efeito colateral tem de ser a
  MESMA que a escrita protegida substitui. Se a leitura não é o predicado do
  compare-and-set, ela não serve para decidir nada depois dele.
- 🔴 **Editar uma parte do bloco REPARTIDO não reordena o contrato**
  (PR3-R9-02, `linhasRepartidas` em `efetiva.ts`). A decisão era tudo-ou-nada:
  mesmo conjunto de linhas → ordem do autor; qualquer diferença → ordem
  VISUAL. Num arranjo que põe o endereço acima do horário, editar só o horário
  fazia a comparação de conjuntos falhar e o bloco voltava `[endereço, horário
  editado]` — uma inversão que ninguém pediu, assinada pela `equipe` e levada
  à recomposição. Hoje cada linha desenhada volta à POSIÇÃO AUTORAL da linha
  igual a ela, e a editada fica com a vaga que sobrou (ordem visual entre as
  vagas). Com as mesmas linhas o resultado é idêntico ao de antes; numa camada
  só, reordenar continua sendo edição.
  ⚠️ Linha ACRESCENTADA numa das camadas vai para o fim, não para dentro da
  fatia daquela camada — a correspondência é por LINHA, não por camada.
- 🔴 **O schema HTTP que recebe o espelho lê os tetos do PRÓPRIO contrato**
  (PR3-R9-03, `MAX_ITENS_DO_ESPELHO`/`MAX_CARACTERES_DO_ESPELHO` em
  `copy-do-item.ts`, ao lado de `espelhoDoContrato`). A API do item aceitava 12
  strings de 2.000 caracteres e o contrato comporta 40 blocos de 3.611 (12
  linhas de 300 + as quebras): item criado com um `copyAutoral` VÁLIDO de 13
  blocos — ou com um bloco de 7 linhas cheias — voltava 400 assim que alguém
  mexia num caractere no modal. Aceitar na criação e recusar na edição é o
  mesmo conteúdo com dois destinos (irmão do R8-03). As duas rotas de plano
  (POST e PATCH do item) usam os mesmos tetos; **nada de truncar para caber**.
- **Varredura da classe (3ª vez), CAS a CAS**: PUT do template (corrigido);
  PATCH da página (`efetiva`/`baseGravada` da volta vencedora, inclusive
  `copyParaDecisao` e `diffDeGeometria` — ✅); PATCH de camada (`layerChanged`
  é calculado DENTRO do `camadas(base)`, sobre a base relida — ✅);
  `reverterCamadasDaArte` e `ajustarArte` (invalidam sempre, sem portão — ✅);
  `recomporPaginaDefasada` (decide por `versaoGravada`, escrita pela própria
  rodada — ✅); `atualizarItem` (relê o item a cada volta e recalcula copy e
  avisos contra ela — ✅); `trocarArteDoPost` (o sinal usa `midiasAtuais`, que
  É o predicado do CAS — ✅); `registrarFeedbackDeArte` (CAS na linha lida;
  perdeu a corrida, relê — ✅); `reapontarItemDoPlano`, `executar-plano` e
  `artes-do-post` (CAS sobre o que leram; o efeito sai do `count` — ✅);
  `marcarForcaEmExecucao`/`marcarRenderComoEsta` (só promovem payload — ✅).
- Provas: `put-efeito-por-base-gravada.test.ts` (Y intercalado entre a leitura
  inicial e a gravação, por camadas e por fundo; congelados; dois controles),
  `recompor-servico-repartido.test.ts` (o arranjo invertido com o horário
  editado, até a recomposição, mantendo o id do bloco) e
  `patch-espelho-do-contrato.test.ts` (criação com contrato → card → modal →
  handler HTTP → serviço, nos dois limites, com o controle acima do que o
  contrato comporta ainda em 400). Cada correção desfeita por mutação faz a
  sua prova falhar.

**Da revisão FINAL do Codex sobre 89930e44 (BLOQUEADO, PR3-R10-01, 20/09/2026):**

- 🔴 **Quem DISPUTA as camadas de uma função são os blocos COM texto**
  (`copyEfetivaDasCamadas`). O bloco explicitamente vazio (`linhas: []`) é
  "esta camada fica sem texto": `blocosParaOCompositor` o OMITE da spec, então
  ele nunca originou camada e não pode consumir uma. Contando-o, um contrato
  com `servico-vazio` + `servico-info` sobre um arranjo que reparte o serviço
  em duas camadas dava uma a cada bloco — o horário migrava de id sem ninguém
  ter editado nada, a página guardava dois serviços com texto, e a edição
  seguinte levava a recomposição a `papel repetido`, deixando o slide na
  imagem antiga. Ele também não vira lacuna: a arte mostra exatamente o que o
  autor pediu. É a regra "campo OMITIDO ≠ bloco VAZIO" do lado da LEITURA.
- **Quando NENHUM bloco da função tem texto, os vazios voltam a disputar**: aí
  a camada com texto é a de um bloco que alguém preencheu no editor, e
  mandá-la para um `extra-…` trocaria o id do mesmo jeito.
- Varredura da classe "distribuir camadas desenhadas contando bloco que a
  conversão omitiu": era o único ponto. `vincularExtras` (blocos `livre`) casa
  por identidade (nome/id/`extra-…`/texto), nunca por contagem;
  `distribuirLinhas` e `blocosParaOCompositor` vão no sentido contrário e já
  pulam bloco sem linhas; `specComACopyDaPagina` mapeia por papel sobre blocos
  de spec (sem vazios); `copy-do-item` preserva o vazio fora do casamento
  posicional.
- Prova no mesmo `recompor-servico-repartido.test.ts`: `validarSpec` aceita →
  persistência (vazio preservado, as duas linhas no preenchido, sem revisão) →
  edição só da manchete → recomposição com UM serviço, slide trocado e capa
  intacta; mais o controle com todos os blocos da função vazios. As duas
  mutações (contagem antiga; vazio nunca disputando) derrubam uma prova cada.

### O compositor consome o contrato sem conversão implícita (PR 4 de "Marca simples, copy melhor", 12/09/2026)

Até aqui o compositor recebia `Bloco[]` por papel e TRANSFORMAVA texto sem
registro: a última linha da manchete virava voz 2 sozinha, o CTA ganhava uma
seta que a copy não tinha, fonte que não carregou no servidor saía medida na
fonte de fallback como se a medida valesse, e a recomposição podia trocar de
variante. Módulos puros com teste: `segunda-voz.ts`, `medidas.ts`;
`scripts/validar-compositor-fiel.ts` é a prova de integração no branch de dev.

- **A segunda voz da manchete é do AUTOR** (`estilo.linhasNaVoz2` no contrato,
  `dividirManchete`): com contrato, só as linhas DECLARADAS vão para
  `headline2` — e têm de ser o fim contíguo da manchete (`validarCopyAutoral`
  recusa o resto); sem declaração, a manchete inteira fica na voz 1 mesmo com
  `headline2` na variante; declaração numa variante SEM voz 2 vira aviso e a
  efetiva registra o estilo como revisão do sistema — nunca some em silêncio.
  Sem contrato (legado) vale a regra antiga: a última linha.
  🔴 Manchete INTEIRA na voz 2 não gera camada de voz 1 vazia, e a efetiva lê
  a `headline2` como a própria manchete (id preservado, índices do zero) — sem
  isso o bloco saía vazio com índice para linha inexistente e a camada virava
  `extra-headline2` (R01 da revisão do Codex).
- **O prefixo que a assinatura desenha antes do texto (o "→ " do CTA) é
  DECLARADO** em `metadata.compositor.prefixo` e descontado por
  `copyEfetivaDasCamadas`; prefixo sem declaração conta como diferença entre o
  escrito e o desenhado — `ver-geracao` mostra, ninguém "corrige" a efetiva.
- 🔴 **Fonte que não carregou no servidor é "não medido", nunca medida.**
  `familiasNaoCarregadas` (`GlobalFonts.has`) confere TODAS as famílias que a
  camada usa — a do estilo E as dos trechos de rich text (`familiasDaCamada`; o
  destaque costuma estar na versão pesada, e é com ela que a largura extra é
  medida). Ausente → aviso, `composicao.fontesNaoCarregadas`,
  `blocos[].naoMedido` e `medidasFinais[].naoMedido` (R02).
- **`composicao.medidasFinais`** (`medidasFinaisDasCamadas`): corpo, entrelinha
  (do `autoWrap`), caixa arredondada, número de linhas e prefixo de cada texto
  COMO FOI GRAVADO, depois do autofix — é o que `ver-geracao` e a métrica da F2
  leem. A prova casa cada medida com a camada final por id.
- 🔴 **Um bloco espalhado por várias caixas do mesmo papel volta a UM bloco**
  (PR4-01 da revisão final do Codex, 18/09/2026). `distribuirLinhas` põe uma
  linha por caixa quando o arranjo tem mais de um texto do papel (duas caixas
  de voz 2, Local + Horário), e a efetiva lia só a primeira: a segunda virava
  `extra-…`, com revisão falsa, e o bloco `livre` com texto travava a
  recomposição em `validarSpec`. Quem resolve isso é a marca do VÍNCULO do
  PR 3 (`metadata.compositor.bloco` = o **id** do bloco do contrato, com as
  posições em `linhas`, rastreadas por `juntarNoGrupo`/`distribuirLinhas`): a
  camada volta ao bloco que declara e fica RESERVADA para ele, então as duas
  caixas do mesmo papel voltam juntas. Camada sem a marca (posta à mão no
  editor) continua lida como antes — nada é juntado por palpite.
  🔴 **O PR 4 chegou a ter a sua própria marca** (`blocoDaCopy` = índice em
  `spec.blocos`, com `continuacoes`/`tomar` em `efetiva.ts`); no rebase sobre a
  main de 20/09/2026 ela foi RETIRADA em favor da do PR 3, que é a mesma ideia
  pelo id do contrato — estável através da conversão spec↔contrato — e mais
  ampla (reserva a camada, trata a voz 2 declarada, a voz 1 escondida e o bloco
  vazio: PR3-R9-02, R10-01, R11-01/02, R12-01, R13-01). **Não reintroduza
  `blocoDaCopy`**: duas marcas para o mesmo fato é como a junção `c35c2918` foi
  necessária da primeira vez. `validarSpec` já recusa papel repetido, então
  cada função tem no máximo um bloco no compositor.
  🔴 **E o PR 9 teve a MESMA marca retirada pelo mesmo motivo** (rebase sobre a
  main de 21/09/2026): a camada extra chegou com `metadata.compositor.parte` e
  `linhasDoBloco` (R18/R19/R20/R27), que são a posição autoral de cada linha —
  a MESMA ideia do `linhas` do PR 3, deduzida do id da montagem (`<papel>-N`)
  em vez de declarada. Ficou a do PR 3, e o extra passou a CARIMBÁ-LA como
  qualquer outra camada (`bloco` = o id que o AUTOR deu ao bloco, nunca o do
  papel de que ele só herda o estilo). **Não reintroduza `linhasDoBloco` nem
  `parte`**, pela razão escrita acima: quem grava a marca é quem DESENHA, e
  duas marcas para o mesmo fato é a segunda fonte de verdade que os dois lados
  fecharam uma por rodada.
- 🔴 **Id de camada é único na PEÇA inteira, nunca por grupo** (varredura do PR
  3, 18/09/2026): o contador de repetição de papel recomeçava a cada grupo, e o
  serviço repartido entre dois grupos (horário junto da oferta, endereço no pé)
  saía com duas camadas `servico` — ajuste por id (revisor, `ajustar-arte`)
  atingia as duas, e `elementosPorTexto`, chaveado pelo id, perdia o ícone do
  primeiro grupo. A logo presa a um grupo (`logo`) também ganha sufixo quando
  outro grupo já a tem. Gerador novo de camada no compositor confere contra os
  ids que a peça já tem.
- 🔴 **Manchete só na voz 2 continua sendo a manchete no LAYOUT** (PR4-02): o
  grupo principal é o que tem `headline` OU `headline2` (sem isso o pré-título
  em grupo separado herdava a posição pedida e o mapa da foto), e `vaoEntre`
  dá vão de manchete antes de `headline2` que não segue outra voz da manchete
  (antes encostava no pré-título como se fosse lockup). Estado novo que o PR
  cria precisa ser conferido em todo consumidor que perguntava pelo papel antigo.
- **A recomposição fixa a VARIANTE pelo id da página** da composição original
  (`preferencias.varianteOriginal = composicao.assinatura.pageId`; motivo
  `fixada por id`; o id vence o nome que o contém em `escolherVariante`) — a
  edição de texto não pode trocar a peça de variante.
  🔴 O id é procurado ANTES do filtro por formato (PR4-03): a peça de feed que
  nasceu na assinatura de STORY (o fallback quando não havia a de feed)
  continua com ela depois que o projeto ganha uma de feed — antes a
  recomposição recusava com `ASSINATURA_INCOMPLETA`. E a fixação da
  recomposição vai em `varianteOriginal`, não em `variante`: a página pode ter
  sido arquivada (as stories do Quintal e do TERO foram, em 11/09), e aí a
  escolha automática segue, com o motivo dizendo que a original não existe
  mais. `variante` continua sendo o pedido explícito — ausente é recusa.
- ~~`PAPEIS_INCOMPATIVEIS` continua até a camada extra (F3)~~ — **superado pelos
  PRs 9 e 10**: papel que a variante não tem vira camada extra quando o bloco
  declara `herdaDe`; sem herança, continua recusando, nunca some.

**Da revisão FINAL do Codex sobre b5c2bd5b (BLOQUEADO, PR4-FINAL-01…02, 21/09/2026).**
Os dois são a MESMA forma: uma decisão tomada por PROXY (o primeiro bloco do
papel; a medida de fallback) em vez de pela identidade ou pelo fato já resolvido.

- 🔴 **A declaração da segunda voz vem do bloco que ORIGINOU a manchete — o id
  já resolvido em `blocoDoPapel` —, nunca do primeiro `headline` do contrato**
  (PR4-FINAL-01). O contrato aceita um bloco `headline` VAZIO ao lado do
  preenchido: `blocosParaOCompositor` omite o vazio (`legado.ts:227`), então
  `validarSpec` não vê papel repetido e a entrada passa. Pelo primeiro, a busca
  caía no vazio e recebia `null`: a manchete saía inteira na voz 1 **mesmo com
  `headline2` na assinatura**, sem o aviso de voz 2 indisponível, e a leitura
  seguinte registrava a mudança de estilo como decisão do compositor. É a mesma
  identidade que vincula as camadas (`metadata.compositor.bloco`) — decidir por
  proxy foi o defeito.
- 🔴 **As fontes são conferidas ANTES das decisões de encaixe, e a RECUSA diz
  quando a medida não vale** (PR4-FINAL-02). Família que não carregou faz o
  medidor cair no FALLBACK, e é dessa medida que saem a escada de encolhimento e
  o ORÇAMENTO de caracteres. `familiasNaoCarregadas` era consultada só no fim,
  depois do `throw` de `TEXTO_NAO_CABE_NA_COLUNA`: a recusa mandava reescrever a
  copy por um número que este mesmo PR declara inválido. Hoje o conjunto é
  calculado antes do laço (superconjunto: estilo de cada papel da assinatura e de
  cada arranjo candidato, mais a família do trecho DESTACADO — R02), a recusa do
  bloco cuja família falta sai com `naoMedido: true` + `fontesNaoCarregadas` e
  **sem orçamento**, e a mensagem manda cadastrar a fonte. O diagnóstico do fim
  filtra o superconjunto pelo que as camadas FINAIS usam, para o aviso não citar
  fonte de arranjo que não foi escolhido.
  🔴 **Quais famílias a recusa cita vem da PRÓPRIA recusa (`familiasMedidas`),
  nunca de uma releitura dos colchetes em quem chama** (PR4-R2-01 da segunda
  revisão FINAL, 21/09/2026). A 1ª correção somava `destaqueDoBloco?.fontFamily`
  INCONDICIONALMENTE, mas `montarBloco` só ativa o destaque com trecho entre
  `[colchetes]` **e** estilo de destaque cadastrado (`blocos.ts`), e só então
  mede a largura extra: marca configurada com fonte de destaque ausente e copy
  SEM colchetes teve tudo medido na base — que está carregada — e ainda assim
  perdia o `caracteresQueCabem`, com a recusa mandando cadastrar uma fonte que
  aquele bloco não usa. O inverso do defeito que o FINAL-02 veio consertar.
  `RecusaDeBloco.familiasMedidas` é a resposta de quem MEDIU (estilo sempre;
  destaque só quando participou), e `compor.ts` a intersecta com `semFonte`.
  **Não copie a regra dos colchetes para fora de `montarBloco`** — a divergência
  entre as duas leituras é como o defeito volta. O superconjunto continua largo
  de propósito: ele é só o cache de "esta família carregou?", e o que a recusa
  DIZ é sempre a interseção com as famílias daquele bloco — família de outro
  papel ou de arranjo não escolhido não tem como chegar nela.
- **Varredura das duas formas** (pedida com os consertos): *escolha por papel em
  vez do id* — os únicos consumidores de `copyAutoral.blocos` no compositor são
  `blocoDoPapel` (filtra `linhas.length > 0`, e `validarSpec` recusa papel
  repetido entre os blocos COM texto, então é 1:1) e a linha corrigida;
  `combinacoes.ts:279` (`find(papel === 'headline') ?? itens[0]`) lê o ARRANJO da
  página de assinatura para escolher a referência de alinhamento — não há id de
  contrato ali, é o template; `efetiva.ts:499` (primeira `headline2` livre) é a
  RESERVA documentada do PR 3, que só roda quando não há marca. *Medida de
  fallback virando número* — `medidasFinais[]` e `diagnostico.blocos[]` já
  carregam `naoMedido` (R02); o único número que mandava AGIR era o orçamento da
  recusa, agora coberto. ⚠️ Fica o aviso "fonte reduzida a N% para caber na
  coluna", que também nasce da medida de fallback: ele descreve o que a
  composição FEZ (a escala está mesmo gravada na camada) e não pede ação, e o
  mesmo bloco já sai com `naoMedido` e com o aviso de que a medida não vale —
  acrescentar ressalva ali seria ruído.

### Medir antes de compor: `ver-assinatura` por variante e `medir-copy` (PR 8 de "Marca simples, copy melhor", 12/09/2026)

Quem escreve a copy no chat precisava de uma medida VERIFICÁVEL antes de gastar
uma composição: o único jeito de saber se a manchete cabia era compor e ler a
recusa, e o orçamento vinha de cabeça nas instruções ("headline até ~18
caracteres") — igual para toda marca. Módulo PURO com teste:
`src/lib/compositor/medir-copy.ts`; serviço em `medir-copy-service.ts`. Sem
migration. Prova no branch de dev: `scripts/validar-medir-copy.ts` (confere
que NADA é gravado e que a medida é a da composição).

- 🔴 **A MESMA PREPARAÇÃO da composição, nunca uma conta paralela**: a
  preparação dos blocos — agrupamento pela página de assinatura, escolha do
  arranjo de cada grupo (página ou combinação salva), distribuição das linhas
  (horário no texto do horário, endereço no do endereço), segunda voz, estilo
  de cada texto, ids (`servico`, `servico-2`, `headline2`) e a montagem com a
  régua — saiu de `comporPeca` para `preparar-blocos.ts` (puro), e `medirCopy`
  a chama com o medidor do render. Uma medição por `assinatura.papeis[papel]`
  dizia "cabe" para uma copy que a composição recusava (R01 da revisão do
  Codex). A prova compara bloco a bloco, pela IDENTIDADE e na ordem: id, papel,
  escala, largura, altura, "não medido" e os arranjos — IDÊNTICOS.
- **A escolha da variante é a da composição** (`chaveDaPeca` num lugar só; a
  foto entra pela luz clara/escura e pela chave do rodízio, como em
  `comporPeca`). Sem variante pedida e sem a foto, a escolha é declarada
  PROVISÓRIA (`escolhaProvisoria` + `comoFixar`): quem compõe fixa
  `preferencias.variante` com o id medido (R02).
- **As famílias que a montagem PEDE são sabidas antes de montar**
  (`familiasPedidas`: a do papel e, com [colchetes], a do destaque): valem
  também no bloco RECUSADO — a recusa medida no fallback é `naoMedido`, com a
  família ausente declarada e as medidas por linha invalidadas (R03).
- **A medida é dita pelo que é**: `cabe` (escala 1), `cabe-reduzido` (fonte
  encolhida até o piso de 80%, com a escala), `nao-cabe` (com o orçamento por
  linha — os mesmos `caracteresQueCabem` da recusa `TEXTO_NAO_CABE_NA_COLUNA`)
  e `papel-ausente` (a variante não tem o papel; declarado, nunca some).
  🔴 **`naoMedido` = a fonte do papel não está carregada no servidor**
  (`familiasNaoCarregadas`): os números saíram na fonte de fallback e NÃO
  valem — a tool devolve os números E o aviso, nunca finge que mediu.
  **`aproximado` = há destaque entre [colchetes]**: o trecho ganha outra
  família e a largura extra é estimada trecho a trecho (o medidor do servidor
  não mede rich text).
- 🔴 **O destaque alarga a linha na MESMA conta da montagem, nos três lugares**
  (`larguraExtraDoDestaque`, exportada de `blocos.ts`): a montagem, a medida
  por linha e o orçamento da recusa somam o quanto os trechos entre
  [colchetes] crescem na família pesada. Sem isso, com destaque em família mais
  larga e fontes disponíveis, o bloco dizia `nao-cabe` enquanto a única linha
  dele dizia `cabe` e o orçamento vinha VAZIO (R08 da revisão de fd82505c). O
  destaque só conta como na montagem: [colchetes] na copy E estilo na marca; o
  bloco preparado carrega o `destaque` com que foi medido. Teste com régua
  sensível à família.
- 🔴 **`ver-assinatura` declara as fontes ausentes de TODOS os textos
  reconhecidos da variante** (`familiasUsadasNaVariante`, puro): `montarAssinatura`
  guarda só o PRIMEIRO estilo de cada papel, e a família própria do segundo
  serviço (o endereço em "Fonte Rara") sumia de `fontesNaoCarregadas` mesmo
  detectada entre as cadastradas — o texto era medido em fallback sem aviso
  (R09). Camada oculta e camada sem papel ficam de fora. `descreverVariantes` é
  testado com o serviço mockado (Prisma, medidor e registro de fontes).
  🔴 **O destaque AUTOMÁTICO conta** (R11 da revisão de 775f4377): com
  `destaque.pesado: true` a composição resolve a família pesada do papel entre
  as CADASTRADAS (`familiaMaisPesada`), e `familiasUsadasNaVariante` faz a
  mesma conta (`estiloDeDestaqueDoPapel`, a função da preparação dos blocos)
  — só com as famílias explícitas, `ver-assinatura` dizia "nenhuma ausente"
  enquanto `medir-copy` com [colchetes] declarava a "Barlow Bold" ausente.
- 🔴 **`medir-copy` é LEITURA e não escreve no Blob** (R10 da revisão de
  775f4377): `carregarFoto` do compositor resolve a foto do Drive por
  `resolveImageUrl`, que PUBLICA `drive-cache/<id>-s1920.jpg` (público,
  sobrescrevendo) — certo para compor, errado para medir. A medição lê os
  bytes por `carregarFotoParaMedir` (`foto-para-medir.ts`: a URL dada, ou a
  miniatura grande do Drive, sem `put`); a luz e a escolha da variante saem
  iguais. O módulo não importa `@vercel/blob` nem `persist.ts`, e há teste
  que confere isso no fonte. A prova mede com uma foto real do acervo (Drive
  só leitura).
- **O orçamento ANTES do texto** (`orcamentoDaVariante`) é medido com uma
  amostra em português (`AMOSTRA_DO_ORCAMENTO`) na fonte real de cada papel:
  caracteres por linha e linhas na altura útil, por variante. É aproximado por
  construção (a largura de uma linha depende das letras dela) e dito assim.
  As instruções do conector deixaram de dar o número de cabeça.
- **`ver-assinatura` descreve CADA variante** (`descreverVariantes`): estilos
  próprios por papel (fonte, `fonteDisponivel`, tamanho já na escala do
  formato pedido, cor, caixa, prefixo, destaque, grupo, alinhamento), papéis,
  `aceitaServico`, `temSegundaVoz`, a área útil do formato (coluna = largura −
  2·margem; altura = altura − safe topo − safe rodapé; `escalaDoFormato`), o
  orçamento e as fontes não carregadas. Até aqui os detalhes eram só da
  variante carregada, e as outras apareciam pelo nome e pelos papéis.
- **`medir-copy` escolhe a variante como a composição** (`carregarAssinatura`
  com os mesmos critérios: id/nome/tag pedido, papéis, tema) e mede a copy
  também contra as OUTRAS variantes do formato (`outrasVariantes`: cabe tudo?
  falta papel? reduzido?) — é a "capacidade medida" para escolher a variante
  pela mensagem, sem trocar a escolha da composição.
- **Nada é gravado**: nem página, nem Generation, nem sinal, nem Blob. A prova
  conta as tabelas antes e depois; `comporPeca(…, { provar: true })` na prova
  renderiza em memória e não persiste (é a tool `compor-arte` que sobe a prova
  ao Blob, não o serviço).
- 🔴 **Provisório é pela LUZ disponível, e a fixação é variante E arranjos**
  (R12 e R13 da revisão de 4b326e7c). `escolhaProvisoria` era `!spec.foto`:
  foto pedida que NÃO carregou (Drive fora do ar, `foto: null` com aviso)
  passava como contexto suficiente e a tool omitia o `comoFixar` — com a foto
  carregando na composição seguinte, a luz clara/escura mudava a variante.
  Hoje a provisoriedade sai de `luzDaFoto === null` (sem foto OU foto não
  medida), com `motivosDaProvisoriedade` e um aviso. E fixar só a variante
  não fixava o segundo sorteio: a chave da peça (`chaveDaPeca`) inclui a foto
  e é a chave do rodízio de ARRANJOS também — medir sem foto e compor com
  foto podia trocar fonte, tamanho e distribuição das linhas de um arranjo
  empatado, e uma copy medida como `cabe` ser recusada. A medição devolve
  `fixacao: { variante, arranjos }`; `comoFixar` manda repetir a medição com a
  foto definitiva ou passar os DOIS em `preferencias` ao compor (o compositor
  honra `preferencias.arranjos` como "mantido"). Prova 3c: a medição COM a
  foto e a fixação da medição sem foto reproduz variante e arranjos.
- 🔴 **A fixação é POR GRUPO e tem de passar pela porta pública** (R14 e R15 da
  revisão de 4413e0a1). `preferencias.arranjos` não estava no schema público de
  `compor-arte`/`compor-leva`: a porta faz `safeParse` e o zod aninhado
  DESCARTA a chave desconhecida — `comoFixar` mandava um campo que nunca
  chegava ao compositor. E a lista `[A, B]` sem grupo colapsava dois grupos de
  serviço com combinações distintas no primeiro id da lista. Hoje o arranjo
  fixado é `{ grupo, arranjo }` (`arranjoFixadoSchema`; a string nua é legado e
  vale para qualquer grupo), `escolherArranjo` recebe o `grupo`, a spec gravada
  e a `fixacao` da medição carregam o par, e o schema público declara o campo
  (fixture do registro atualizada de propósito). Teste do parse pela porta em
  `src/lib/mcp/__tests__/compositor-preferencias-arranjos.test.ts`.
- **Download ou decodificação da foto falhando NÃO aborta a medição** (R16 da
  revisão de 5d628520): `carregarFotoParaMedir` devolve `{ foto: null, aviso }`
  também quando `fetchBuffer` rejeita (403/503 do lh3, conexão) ou o sharp não
  lê os bytes — a medição segue provisória, como sem foto, sem publicar nada.

### As vias consomem o contrato: modelo por PAPEL, IA com escrita × enviada × lida (PR 5 de "Marca simples, copy melhor", 12/09/2026)

O PR 4 fez o compositor fiel; as OUTRAS vias — o modelo (`createArteRapida`,
`executar-plano` via template, `criar-arte-de-modelo`), a IA
(`startArtGeneration`, `gerar-imagem`), a melhoria e a conferência — ainda
recebiam a copy como lista posicional e não registravam nada. Módulos puros com
teste: `planos/execucao.ts` (`mapearContratoParaCampos`, `papelDoCampo`),
`copy-autoral/registro-da-arte.ts`; prova de integração no branch de dev:
`scripts/validar-vias-da-copy.ts`.

- **Na via de MODELO o bloco casa com o campo do MESMO PAPEL, nunca por
  posição** (`mapearContratoParaCampos`): o papel do campo é o declarado da
  camada (`metadata.compositor.papel`) ou o que o NOME diz (Pré-título,
  Título, Subtítulo, Chamada, Horário); nome que não diz nada é `null`. Bloco
  sem campo do seu papel vai só para campo SEM papel reconhecido (declarado
  como `posicao`) — o campo de manchete não recebe o serviço só porque sobrou;
  o que sobrar fica em `semCampo` e no aviso, nunca perdido em silêncio. Bloco
  `linhas: []` não ocupa campo; campo sem copy fica oculto, como sempre. Os
  `[colchetes]` saem (o modelo desenha texto simples) e a quebra do autor fica.
  Sem contrato, `mapearCopyParaSlots` (posicional) continua para o legado.
- **O slot deixa de ser só texto**: `{ content, papel, bloco }`, e `bakeLayers`
  carimba `metadata.compositor.{papel,bloco}` na camada. É o carimbo que faz a
  leitura da copy efetiva reencontrar o bloco numa camada de id UUID — sem ele
  a via de modelo relia o contrato como `extra-<uuid>`.
- **A arte de modelo grava o mesmo registro do compositor**: `Page.copyAutoral =
  efetiva` (superfície `modelo`) e `fieldValues.copyAutoral = { original,
  efetiva, comparavel, lacunas }`. `ver-geracao` mostra.
- 🔴 **Na via de IA não há camada, e o registro DIZ isso em vez de fingir uma
  efetiva** (`registro-da-arte.ts`): `original` (o contrato), `enviada` (os
  blocos como FORAM ao modelo de imagem), `conferencia` (o que a visão leu, o
  que faltou, se passou, a régua) e a lacuna `LACUNA_SEM_CAMADAS`.
  `ver-geracao` devolve `comparadoPor: 'visao'` e a arte só é `comparavel`
  quando a conferência RODOU (`passou !== null`).
  🔴 **`enviada` é LIDA do prompt que saiu, nunca a transformação que o sistema
  aplicaria** (`enviadaNoPrompt`, PR5-10 da revisão final do Codex, 18/09/2026):
  o `finalPrompt` de quem chamou vai verbatim, e o prompt montado por código
  (`buildArtePrompt`, os moldes das portas, o `[TEXTO EXATO]` da melhoria)
  colapsa espaços — e com eles a quebra. Gravar a caixa da marca como enviada
  punha na conta do gerador uma diferença nascida no registro. Cada bloco é
  procurado no prompt (forma da marca, forma crua, cada uma também com espaços
  colapsados); bloco que não aparece deixa `enviada` AUSENTE com a lacuna
  dizendo qual. A criação da Generation não conhece o prompt: grava o registro
  sem `enviada` e com `LACUNA_PROMPT_AINDA_NAO_MONTADO`, que o runner troca
  (`comEnviada`); na melhoria o prompt exato chega por
  `improveCreative.aoMontarPrompt`. Sem `enviada`, `ver-geracao` segue
  comparando por visão quando a conferência rodou.
- **Com `copyAutoral`, `startArtGeneration` deriva a copy do contrato** (blocos
  com texto, em ordem, linhas do autor unidas por quebra) e RECUSA `copy` que
  divirja dele (`COPY_DIVERGE_DO_CONTRATO`). O contrato viaja nos args do
  runner, que fecha o registro no sucesso; a falha preserva o registro da
  criação (`fieldValuesPreservando`).
- 🔴 **`copyComCaixaDaMarca` preserva a QUEBRA do autor**: o colapso de espaços
  vale dentro de cada linha, nunca sobre o "\n" — antes ele apagava a quebra
  antes de a copy chegar ao prompt. A linha VAZIA interna ("Almoço", "", "em
  família" — o contrato permite) também passa: o filtro de linha vazia apagava
  o respiro do autor antes do diretor de arte (PR5-09). ⚠️ Os caminhos de
  FALLBACK (`buildArtePrompt`, os moldes das portas, o `[TEXTO EXATO]` da
  melhoria) continuam colapsando a quebra — o prompt deles não foi mexido; o
  registro diz isso em `enviada`.
- **A melhoria PROPAGA o contrato pela cadeia como a régua** (`copyAutoral.original`
  da arte de origem). Em `refinar`, copy trocada pelo pedido vira REVISÃO
  EXPLÍCITA de `claude` com o pedido como motivo (`revisaoPosicional`, a mesma
  regra do item de plano: casou posição a posição, é revisão; não casou, a
  lacuna diz e o texto enviado é o do pedido). A caixa da origem
  (`aplicarCaixaDaOrigem`) NÃO conta como revisão: bloco igual ao do contrato a
  menos de caixa/acento mantém as linhas do autor. Gravado no sucesso, na falha
  de cobrança e na falha.
  🔴 **Só quando a imagem melhorada É a arte daquela Generation**
  (`contratoDaOrigemDaMelhoria`, PR5-08): melhorar o slide 2 pela agenda manda o
  `generationId` do post (a arte do slide 1) com a URL do slide 2 — o serviço
  marca `skipTextVerification` e descarta os textos esperados, e o contrato cai
  junto. Sem isso a melhoria de B gravava a copy autoral de A como a sua e a
  levava pela cadeia. A ausência é dita (`fieldValues.copyAutoralNaoHerdada`).
  Tudo que se lê da Generation de origem é de UMA imagem: dado novo que a
  melhoria herde dela passa pelo mesmo portão.
- **`conferir-arte` devolve a metade que faltava**: `textoAMais` (com dado é
  alerta), `grafiaDivergente` e a `copy` da arte quando ela tem contrato —
  avisa, nunca veta.
- **Fixtures do registro MCP** (`criar-arte-de-modelo`, `gerar-imagem`)
  atualizadas nos mesmos commits — mudança deliberada do schema.
- ⚠️ **Carrossel de IA e `criar-arte` (textos livres) continuam sem contrato**:
  o slide vive em `slides[].copy` posicional e a arte livre não passa por
  `startArtGeneration` com contrato. É lacuna declarada, não regressão.

**Da revisão FINAL do Codex sobre 2269eec9 (BLOQUEADO, PR5-11…13, 21/09/2026).**
Os três são a mesma família: **o registro afirmando mais do que sabe** — "enviei
o texto" quando só achou um pedaço, "o sistema transformou" quando não
transformou, "foi o Claude" quando foi a equipe.

- 🔴 **`enviada` exige o bloco INTEIRO numa ocorrência LIVRE** (PR5-11,
  `enviadaNoPrompt`). O `includes` cru achava `R$ 20` dentro de `"R$ 200"` e
  `Venha hoje` dentro de `"Venha hoje mesmo"`, e gravava `enviada` sem lacuna:
  a diferença que ENTROU no prompt ia para a conta do gerador. E a mesma
  aparição servia a vários blocos — dois blocos iguais com uma ocorrência só
  passavam como dois enviados. A fronteira é a borda do prompt, a quebra de
  linha ou a ASPA, que é como TODO caminho da casa escreve a copy: `- "bloco"`
  (`buildArtePrompt`, `[TEXTO EXATO]` da melhoria), `"bloco"` por linha
  (`prompt-da-referencia`) e o bloco sozinho na linha (`prompt-do-manual`).
  Cada ocorrência é consumida por UM bloco. Prompt pronto que embuta a copy no
  meio de uma frase corrida não permite dizer o que saiu: vira lacuna, que é o
  comportamento pedido — nunca um palpite.
- 🔴 **Conteúdo NOVO não herda a DECLARAÇÃO de prefixo da camada anterior**
  (PR5-12, `semPrefixoHerdado` + `bakeLayers`). `metadata.compositor.prefixo`
  descreve o ornamento que o COMPOSITOR desenhou (a seta antes do CTA), e quem
  preenche a camada escreve o texto tal e qual. Herdada, `linhasDaCamada`
  descontava da leitura um "→ " que agora é TEXTO DO AUTOR: o modelo com
  `prefixo: '→ '` recebendo um bloco que começa pela mesma seta mostrava
  "→ Venha hoje" na arte e gravava "Venha hoje" no contrato — uma transformação
  do sistema que nunca aconteceu, e é assim que isto encosta no PR 4. A camada
  que NÃO recebe conteúdo novo continua declarando o prefixo; quem preencher
  ACRESCENTANDO ornamento declara de novo.
  **`bakeLayers` mudou de casa** (`src/lib/creatives/bake-layers.ts`, PURO):
  `arte-rapida.ts` importa o Prisma, e esta decisão precisa ser conferida sem
  banco — é a regra da casa para código testável.
- 🔴 **O refino é assinado por QUEM PEDIU, nunca sempre por `claude`** (PR5-13,
  `autorDoPedido`). A rota da interface chama o MESMO serviço do conector, e o
  runner cravava `autor: 'claude'`: a pessoa pedia a troca de texto pela tela e
  o histórico dizia que quem mexeu foi o assistente — autoria errada seguindo
  pela cadeia nas melhorias seguintes, o oposto do que o contrato existe para
  fazer. A distinção já existe e é o CANAL (`creatives/canal.ts`), decidido na
  porta de entrada: a rota passa `canal: 'studio'` (→ `equipe`), o conector
  passa o canal do principal (→ `claude`). O canal viaja em
  `ImprovementJobArgs`; job enfileirado antes disto não tem canal e fica em
  `desconhecido` — o conservador. Caminho novo que registre autoria de copy a
  partir de um pedido usa `autorDoPedido(canal)`, nunca um literal.
- **Varredura das três formas no PR** (pedida com os consertos): *autor fixo* —
  os outros dois literais são corretos por construção (`equipe` no PATCH do
  editor, que é a UI da pessoa logada; `sistema` na reconciliação com as
  camadas anteriores); *substring numa afirmação do registro* — só
  `enviadaNoPrompt`; `PAPEIS_DO_MODELO.includes` e `comTexto.indexOf(b)` são
  pertinência e identidade em ARRAY, não texto. *Herança de metadado* — o único
  ponto que escreve camada é `bakeLayers`, e ali `papel` e `bloco` também são
  herdados: **descartado com razão**, porque na via COM contrato o carimbo os
  sobrescreve em toda camada que recebe copy, e a que não recebe fica OCULTA
  (`ehTextoVisivel` a tira da leitura); na via legada não há contrato na página
  para lê-los. Só o `prefixo` alcançava uma leitura.

**Da revisão FINAL do Codex sobre c0e2649b (BLOQUEADO, PR5-11-R2, PR5-12-R2, 21/09/2026).**
As duas são as correções anteriores ficando curtas na fronteira, e a mesma
lição: **a guarda tinha sido escrita a partir do caso do exemplo, não da
regra** — "terminou antes de `\n`" no lugar de "é o bloco inteiro", "o
conteúdo mudou" no lugar de "veio conteúdo".

- 🔴 **A unidade de `enviada` é o BLOCO COMPLETO, nunca a vizinhança de um
  pedaço** (PR5-11-R2). `enviadaNoPrompt('[TEXTO EXATO]\n- "Venha hoje\nmesmo"',
  [['Venha hoje']])` começa depois de uma aspa e termina antes de `\n`, então a
  fronteira por caractere aceitava: metade de um bloco citado voltava como
  `enviada` sem lacuna, e a amplificação que já estava no prompt ia para a
  conta do gerador; e as duas LINHAS de um único bloco entre aspas podiam
  servir a dois blocos esperados. Hoje `unidadesDoPrompt` parte o prompt nas
  unidades que os caminhos da casa escrevem — **dentro de ASPAS a quebra
  interna NÃO encerra o bloco** (`- "bloco"` do `buildArtePrompt` e do
  `[TEXTO EXATO]`, `"bloco"` por linha do `prompt-da-referencia`); **fora
  delas a delimitação é por LINHA** (o bloco sozinho na linha do
  `prompt-do-manual`) —, e o bloco esperado tem de ser IGUAL a uma unidade
  inteira e ainda livre. Ambiguidade vira lacuna, como já era.
- 🔴 **A camada que RECEBE conteúdo perde a declaração de prefixo, mesmo que
  os caracteres coincidam** (PR5-12-R2). Modelo com `content: '→ Reserve já'`
  e `prefixo: '→ '` recebendo do contrato literalmente `→ Reserve já`: a
  guarda `novo === layer.content` mantinha a declaração, a arte mostrava a
  seta que o AUTOR escreveu e `linhasDaCamada` a descontava — a mesma
  transformação fictícia, agora onde o texto não mudou. O fato é TER VINDO
  conteúdo; só a camada sem preenchimento continua declarando o prefixo.
- 🔴 **O terceiro lugar com o mesmo proxy era a herança do contrato na
  melhoria** (PR5-14, achado na varredura pedida). `contratoDaOrigemDaMelhoria`
  recebia `outraImagem: !!args.skipTextVerification` — a BANDEIRA da régua de
  texto, que hoje tem uma causa só e por isso coincidia com o fato. Qualquer
  motivo NOVO para pular a conferência (peça sem texto, régua indisponível,
  opt-out) derrubaria o contrato junto **e afirmaria no registro que "a imagem
  melhorada é outro slide do post"**, que seria falso. O serviço passou a
  nomear o FATO (`melhoraOutraImagem`, dos mesmos dois pontos que o
  produziam: o slide com `generationId` próprio e a mídia do post que não é o
  `resultUrl` da origem) e dele DERIVA `skipTextVerification`; o runner lê o
  fato, com a bandeira como fallback só para job enfileirado antes do campo,
  quando ela tinha essa causa única. Sem teste novo: a correção é de fiação —
  uma atribuição vira dois campos —, e a semântica de `outraImagem` já é
  provada pelo PR5-08.
- 🔴 **A REGRA que as três deixam, e o caso que a mede**: *condição escrita
  pelo caso do exemplo passa nos testes do exemplo*. As três testam a
  CONSEQUÊNCIA que o caso em mãos produziu, não o fato — e enquanto a
  consequência tem uma causa só, as duas leituras são indistinguíveis, que é
  justamente por que passam em revisão: o exemplo prova as duas. O que as
  separa é perguntar **"que OUTRA coisa produz este sintoma?"** — e **"hoje,
  nenhuma" ainda é resposta errada**, porque a condição se quebra sozinha na
  primeira causa nova, sem barulho. O caso que mede isso é o `skipTextVerification`
  do PR5-14: motivo novo para pular a conferência derrubaria o contrato junto
  **e faria o registro afirmar um motivo falso** ("a imagem é outro slide"),
  que é o oposto do que o contrato existe para fazer.
- **O que a varredura DESCARTOU com razão**: `autorDoPedido` (canal é o fato,
  não sintoma — PR5-13); `revisaoDoRefino`, que localiza o bloco pelo texto
  normalizado e **declara** a ambiguidade (`candidatos.length !== 1` →
  `descartado`) em vez de escolher; `mapearContratoParaCampos`, cuja
  aproximação por NOME de campo é declarada item a item (`por: 'posicao'`,
  `semCampo`, avisos); e `COPY_DIVERGE_DO_CONTRATO`, comparação exata entre os
  dois lados limpos pela MESMA função, numa porta em que o contrato vence de
  qualquer forma.

**Da revisão FINAL do Codex sobre fcd79518 (BLOQUEADO, PR5-11-R3, PR5-15, 21/09/2026).**
As duas na MESMA função (`enviadaNoPrompt`), e a mesma lição da rodada anterior
um nível abaixo: a regra da unidade foi escrita para os formatos que a casa
PRODUZ, e a fronteira ENTRE eles ficou sem dono — texto solto **e** citado na
mesma linha; normalizar para comparar **e** para registrar.

- 🔴 **Linha que MISTURA texto solto e aspas contribui só com o que está entre
  aspas** (PR5-11-R3). Ao encontrar a aspa, a versão anterior fechava as linhas
  pendentes e emitia o fragmento externo como unidade: `Venha hoje "mesmo"`
  comprovava os blocos `Venha hoje` **e** `mesmo`, sem lacuna — uma linha
  AMPLIADA provando dois blocos que ninguém escreveu separados. Hoje a abertura
  de aspas não fecha nada (o trecho citado vira um marcador de uma posição, sem
  quebra) e o texto solto em volta de uma citação é FRAGMENTO, nunca bloco.
  Mistura que não deixa identificar o bloco vira lacuna, como já era o contrato.
  Continua valendo o positivo: duas citações em LINHAS separadas são dois blocos.
- 🔴 **O colapso de espaços LOCALIZA a ocorrência; `enviada` grava o que está
  ESCRITO no prompt** (PR5-15). Um bloco citado com quebra INTERNA casa pela
  forma colapsada e gravava a candidata NORMALIZADA — **apagando do registro uma
  quebra que existe no prompt**, e a comparação escrita × enviada × lida podia
  cobrar essa diferença do gerador. Hoje a candidata só serve para ACHAR a
  unidade; o que entra em `enviada` é a unidade encontrada, com as quebras e os
  espaços dela.
- 🔴 **UM TESTE EXISTENTE CONSAGRAVA A PERDA, e trocar a expectativa foi parte
  do conserto.** `revisao-final-pr5.test.ts:105` exigia a forma COLAPSADA
  (`Venha hoje mesmo`, numa linha só) para um prompt que TEM a quebra; hoje
  exige as duas linhas como estão lá. Não é "ajustar o teste para passar": a
  expectativa antiga afirmava como enviado um texto que nunca foi escrito no
  prompt, que é exatamente o defeito. Quem ler o diff amanhã vê a troca aqui
  declarada, com o caso da quebra DUPLA interna acrescentado ao lado.
- 🔴 **A terceira fronteira do arquivo não era lógica, era do FONTE: o sentinela
  NUL estava escrito LITERAL, e um byte NUL faz o `grep` tratar o arquivo como
  BINÁRIO.** Medido: `grep -c "" registro-da-arte.ts` saía **vazio, com código
  1** — toda busca do repositório passava por cima deste módulo em silêncio, e
  só `grep -a` o enxergava. O sentinela agora é montado por código
  (`String.fromCharCode(0)`), a semântica é idêntica (NUL não aparece em prompt)
  e o fonte volta a ser texto. **Caractere de controle em módulo novo se monta,
  nunca se digita** — some à família de "o método de medição é que estava
  quebrado".
- **O que a varredura da família DESCARTOU**: `revisaoDoRefino` já tem
  exatamente a forma certa (localiza por `normalizeForComparison`, grava o texto
  REAL do pedido, e declara a ambiguidade em vez de escolher); `revisaoPosicional`
  grava a linha crua; e `conferenciaDoCheck` corta a lista `lida` em 40 ITENS,
  mas ela é diagnóstico — `passou` e `faltando` vêm do próprio check, então o
  corte não muda veredito nenhum (diferente do teto da visão do PR 0, que
  mudava).

### A camada EXTRA: função separada de estilo (PR 9 de "Marca simples, copy melhor", 12/09/2026)

> 🔴 **Decisão (A) no rebase sobre a main (21/09/2026): a leitura da copy efetiva
> é a do PR 3, e a inferência pelo id do PR 9 foi APOSENTADA.** Quem arbitra de
> qual bloco é uma camada é o vínculo DECLARADO (`metadata.compositor.bloco` +
> `linhas`), não o id da camada. As notas R08–R28, C9 e F01/F02 abaixo descrevem
> a leitura por id e ficam como registro; onde contradizem este bloco, vale este.
>
> - **Saíram** `parteMarcada`, `linhasDoBloco`, `partesDoBloco`, `ordenarPartes`,
>   `temIdDoBloco`, `declaraOutroBloco` e `extraComIdentidade`. `parte` e
>   `linhasDoBloco` eram a MESMA informação do `linhas` do PR 3, deduzida do id da
>   montagem em vez de declarada — o mesmo movimento que tirou o `blocoDaCopy` do
>   PR 4. **Não reintroduza nenhuma das duas**: duas marcas para o mesmo fato é a
>   segunda fonte de verdade que os dois lados fecharam uma por rodada.
> - **Ficou do PR 9**: a resolução e a medição dos extras; o bloco `livre` com
>   herança; e o **carimbo do extra apontando para o PRÓPRIO bloco** (`bloco` = o
>   id que o autor deu, nunca o do papel de que ele só herda o estilo).
>   `blocoDoPapel` (`preparar-blocos.ts`) pula bloco com `estilo.herdaDe`: com a
>   F3 a premissa "papel e bloco são um para um" vale só entre os comuns.
>   `materializarVinculosDoIdFisico` ficou reduzido ao PAPEL que só o id dava e ao
>   BLOCO cujo id é o id físico — este último só quando o contrato tem MAIS DE UM
>   bloco daquela função; com bloco único a reserva já reúne as partes, e marcar só
>   a parte cujo id coincide deixava o bloco meio declarado.
> - **As guardas que RESTRINGEM a regra da main** (readotadas; nenhuma infere):
>   `casaPeloIdInferido` (bloco com herança nunca casa pelo id inferido
>   `extra-<camada>` — R25); `incluirOcultas` na leitura (a camada oculta segue
>   vinculada ao livre dela, que sai vazio, e não fica livre para o vizinho tomar
>   — R23); o extra com herança só lê a camada que DECLARA, nunca a reserva por
>   função (oculta ou excluída, ele sai vazio — R23); e `renomearExtrasDuplicados`
>   só renomeia o id que a LEITURA inventou, nunca o do autor (R14/R25). Os buracos
>   que elas fecham só existem porque o PR 9 introduz id autoral e camada extra: na
>   main o livre só tem id inventado pela leitura.
> - **Dois defeitos da leitura da MAIN apareceram no invariante e foram
>   corrigidos com o mecanismo dela** (a marca declarada estava sendo ignorada):
>   a voz 2 repartida em dois textos era concatenada pela ALTURA (R27), e a única
>   parte que sobrava visível lia em ordem visual contra a própria declaração
>   (R20). Os dois passam por `ordemDeclarada`, como a voz 1 já passava.
> - `semIdentidadeAutoral` segue a regra da main (`camadaClonada`, PR3-R14-01): a
>   marca do compositor sai INTEIRA — o `prefixo` também (PR5-12) —, e só o
>   `papel` volta, e só na página SEM contrato (C9-11).
> - **O invariante declara o escopo da página sem marca**: com a marca ele afirma
>   tudo e passa; sem ela, estados e verificações posicionais que só a inferência
>   pelo id sustentava saem da afirmação — medidos e contados, nunca escondidos
>   (ver o cabeçalho de `invariante-copy-autoral.test.ts`). 🔴 **Contrato F3 em
>   página sem marca EXISTE** — colar ou duplicar um texto e apagar o original o
>   produz, com blocos vazios e textos novos sem marca (revisão FINAL do Codex
>   sobre b6980b5b). A leitura acerta nesse caminho, e o oráculo dele é a regra
>   dura "a cópia tem identidade nova". Só fica fora a camada do PRÓPRIO extra sem
>   `bloco`, porque nada a grava: o compositor escreve `extra` e `bloco` juntos, e
>   toda operação que tira a marca tira as duas.
> - 🔴 **"A peça tem extra" se pergunta às DUAS formas** (`specTemExtra`,
>   `camadas-extras.ts`): `camadasExtras` (o livre com herança) E `blocos` com
>   `herdaDe` (o extra COM função). A guarda do re-render da recomposição olhava só
>   a primeira; sem contrato legível, o extra com função caía em
>   `specComACopyDaPagina`, que reconstrói o bloco como `{ papel, linhas }` — dois
>   serviços comuns (`papel repetido`, slide antigo) ou a herança perdida
>   (PR9-F01, 21/09/2026).
> - 🔴 **O materializador da duplicação NUNCA carimba bloco com função pelo id**:
>   a leitura da main atribui bloco com função pela marca ou pela reserva por papel
>   e posição, e a duplicação preserva as duas coisas. Carimbar pela coincidência
>   do id inventava atribuição — o extra vazio `servico-2` recebia a parte do
>   serviço comum cuja camada se chama `servico-2` (PR9-F02, 21/09/2026). Só o
>   bloco LIVRE ganha `bloco` pelo id, porque essa é a regra 1 de `vincularExtras`.
>   Teste de marca começa da forma LEGADA: partir de camadas recém-preparadas (já
>   carimbadas) é o método que não pode dar outro resultado.
> - ⚠️ **Limitação da main, anterior ao PR 9 e fora do escopo dele**: numa página
>   SEM marca com duas vozes 2, a reserva documenta "a PRIMEIRA `headline2` livre
>   da peça" — a outra vira bloco solto e a recomposição seguinte recusa a spec. O
>   R28 ficou pulado com esse motivo. Tratar é mudança da leitura da main, à parte.
>   🔴 **É estado SEM produtor**: a voz 2 com várias linhas só nasceu no #146
>   (antes, `b.linhas.slice(-1)` dava à segunda voz UMA camada `headline2`), e o
>   carimbo `bloco`/`linhas` já estava no #144 — toda página com duas vozes 2 tem
>   marca. Medido em produção em 21/09/2026, somente leitura: nenhuma página com
>   duas camadas `headline2`, nenhum id `headline2-N`, nenhuma recusa gravada.

"Copy primeiro, campos depois" ganhou o mecanismo que faltava: um texto que
veste o estilo de um papel da assinatura SEM ser esse papel. Até aqui, papel que
a variante não tinha era `PAPEIS_INCOMPATIVEIS`, e bloco `livre` com texto era
recusado ("a camada livre chega na F3"). Módulo PURO em
`src/lib/compositor/camadas-extras.ts` (com teste em `camadas-extras.test.ts`);
`preparar-blocos.ts`, `compor.ts` e `medir-copy.ts` chamam a MESMA resolução.
~~Ainda sem anunciar no conector~~ — **anunciada no PR 10** (seção "O ciclo da
camada extra", no fim deste arquivo), depois que editar, trocar a foto e
recompor passaram a preservar os extras.

- **Um extra declara `id` + `linhas` + `herdaDe` (o papel de ESTILO) e,
  opcionalmente, `grupoVisual` (`principal` · `topo` · `rodape`), `grupoDeLeitura`
  e `ordem`.** Ele herda fonte, peso, corpo (na faixa do papel, com a escala da
  peça), entrelinha, tracking, caixa alta, cor, sombra e prefixo — é
  `estiloHerdado(assinatura.papeis[herdaDe])`, que TIRA `caixa`, `grupo` e
  `alinhamento`: a POSIÇÃO do papel de origem nunca é herdada. Nem o id, nem o
  grupo: a camada nasce com o id do autor e `metadata.compositor.extra = { id,
  funcao, herdaDe, grupoVisual, grupoDeLeitura?, ordem? }`.
- 🔴 **Função ≠ estilo.** `metadata.compositor.papel` do extra é a FUNÇÃO
  original (`servico` na linha de horário que herda do apoio) — é o que
  `papelDaCamada`/`copyDosPapeis` e a recomposição leem; `livre` não é papel e
  fica sem ele. O papel de ESTILO (`herdaDe`) mora só em `extra.herdaDe`. Medir
  e compor contam o bloco pela `funcao` (`BlocoPreparado.funcao`), nunca pelo
  papel de estilo: a peça que precisa de horário funciona numa variante sem o
  campo, e `medir-copy` não a declara `papel-ausente`.
- **Grupo de LEITURA ≠ grupo VISUAL.** `grupoDeLeitura` é do autor (os blocos
  que se leem como uma frase) e viaja intacto; `grupoVisual` decide onde o
  extra POUSA: `principal` junta-se ao grupo da manchete (depois dos textos do
  arranjo, fora da distribuição de linhas — o extra não é o papel de que
  herda); `topo`/`rodape` formam grupo só de extras (`extra:<borda>`), sem
  arranjo da página nem combinação salva, ancorado na borda com `temCaixa:
  false`. Padrão: `servico` → `rodape`; o resto → `principal`
  (`grupoVisualPadrao`).
- **Na spec**: `blocos[].herdaDe` (+ `id` + `grupoVisual`) para papel que a
  variante não tem, ou para repetir um papel com estilo emprestado — papel
  repetido só passa quando toda ocorrência além da primeira tem `id` próprio E
  `herdaDe`; a manchete nunca herda (ela É o papel); ids de camada não se
  repetem (nem com `camadasExtras`). `camadasExtras[]` (até 5) é o que os
  blocos `livre` do contrato viram: `validarSpec` exige `estilo.herdaDe` no
  bloco livre com texto (sem herança não há de onde tirar fonte, corpo e cor —
  recusar continua sendo o oposto de sumir em silêncio), aceita
  `estilo.grupoVisual`, e recusa `camadasExtras` que não batam com o contrato.
  `blocosParaOCompositor` passa `id`/`herdaDe`/`grupoVisual` adiante.
- 🔴 **`herdaDe` declarado é sempre honrado**, mesmo quando a variante TEM o
  papel: função ≠ estilo é decisão do autor. `herdaDe` de papel que a variante
  não tem FALTA (com aviso dizendo qual), e `PAPEIS_INCOMPATIVEIS` passou a
  sugerir a saída ("declare de que papel ele herda o estilo").
- **R17 (P3 da revisão do PR 8)**: em `medir-copy-service` o motivo "algum
  arranjo saiu por rodízio" não depende mais de `preferencias.arranjos` estar
  vazio — fixar o arranjo de UM grupo não fixa o do outro; o motivo vale
  enquanto algum arranjo ainda sair por rodízio (teste com dois grupos).

Da revisão do Codex sobre o primeiro commit (BLOQUEADO, R01…R07, 12/09/2026):

- 🔴 **O vínculo por ID vem ANTES da associação por função e posição** (R01,
  `copyEfetivaDasCamadas`): dois extras de função `servico` herdando `apoio`,
  um no topo e outro no rodapé, trocavam de texto entre os ids já na
  persistência inicial — a leitura casava por função + `y`. A camada extra
  nasce com o id do bloco (`metadata.compositor.extra.id`), e uma camada comum
  tem o id do papel; esses vínculos são reservados antes da fila por função.
- 🔴 **A unicidade é conferida contra os ids que a PREPARAÇÃO produz** (R02,
  `idReservado`): `id` num bloco SEM `herdaDe` é recusado (a camada se chama
  pelo papel; um id avulso era ignorado na composição e só enganava a
  conferência), e nenhum extra pode tomar `headline2` nem `<papel>-N` — a
  segunda voz e o segundo texto do mesmo papel são gerados pela preparação. A
  resolução repete a porta com aviso.
- **Extra que não pôde ser resolvido é DECLARADO por bloco** (R03,
  `ResolucaoDosExtras.falhas` → `MedidaDeBloco` `papel-ausente` com o id do
  bloco, e `cabeTudo` os conta): o livre herdando um `cta` ausente sumia da
  medição com `cabeTudo` verdadeiro enquanto `comporPeca` recusava a mesma
  entrada. `papeisAusentes` passou a olhar só os blocos sem herança.
- **O extra com função leva `grupoDeLeitura` e `ordem`, e os extras das duas
  fontes são ordenados JUNTOS pela ordem do autor** (R04): o contrato com nota
  livre na ordem 1 e serviço na ordem 2 saía com o serviço antes da nota,
  porque a resolução acrescentava primeiro os por papel e depois os livres. Sem
  `ordem` (spec legada) vale a posição de declaração, blocos antes de
  `camadasExtras`. Os campos atravessam `blocoSchema`, `BlocoLegado`,
  `blocosParaOCompositor` e a identidade do extra até a camada.
- 🔴 **O contrato é CANÔNICO** (R05): `blocos` e `camadasExtras` mandados
  junto dele têm de dizer o MESMO em todos os campos (id, herança, grupo
  visual, grupo de leitura, ordem), e extra declarado sem correspondente no
  contrato também diverge. Comparar só id e linhas deixava a versão sem
  herança prevalecer e a composição recusar uma variante que o contrato
  resolvia.
- 🔴 **`validarSpec(validarSpec(x).spec)` tem de continuar válido** (R06): os
  limites de linha da spec são os do contrato (linha vazia é respiro permitido,
  `MAX_LINHAS`, 40 blocos), e a forma derivada é revalidada pelo schema antes de
  ser aceita — o worker da fila revalida a spec gravada, e uma spec aceita na
  porta falhava lá.
- **Sem contrato, o ORIGINAL persistido nasce da spec INTEIRA** (R07,
  `copyDaSpecSemContrato`): o extra livre e o serviço herdado entram com id,
  herança, grupo visual, grupo de leitura e ordem (renumerada do zero, porque o
  contrato exige ordem contígua), autoria `desconhecido`. Antes só `spec.blocos`
  virava original e a nota fornecida na entrada aparecia como texto a mais do
  sistema, com id `extra-…`.

Da revisão do Codex sobre o segundo commit (BLOQUEADO, R08…R11, 12/09/2026):

- 🔴 **O id EXPLÍCITO do extra viaja exato, caixa inclusive** (R08,
  `copyDaSpecSemContrato`): só a identidade inferida do legado (o papel) passa
  por `idUnico`, que normaliza; o id do extra, já validado pela spec, entra no
  `usados` antes e nunca é reescrito. "Nota" virava "nota" no original, a
  efetiva não achava a camada e criava `extra-Nota` com revisão fictícia.
- 🔴 **Vínculo por id físico só com a MESMA função** (R09,
  `copyEfetivaDasCamadas`): primeiro `metadata.compositor.extra.id`; depois
  `layer.id === bloco.id` apenas quando `papelDaCamada` é a função do bloco. Um
  contrato com ids trocados entre funções (id "apoio" na manchete) trocava os
  textos na persistência — e o autosave registrava a troca como edição da equipe.
- 🔴 **Nenhum extra toma o nome de uma camada interna** (R10, `idReservado`):
  além de `headline2` e `<papel>-N`, `bg-foto`, `logo`, `gradiente-leitura-*` e
  `<texto>-elemento-N`; e `comporPeca` confere a unicidade no conjunto FINAL de
  camadas (`idsDeCamadaRepetidos`, `SPEC_INVALIDA`) — id repetido torna seleção,
  ajuste e leitura por id ambíguos.
- 🔴 **Sem contrato, a copy DERIVADA da spec passa no contrato do leitor antes
  de a spec valer** (R11, `validarSpec` → `validarCopyAutoral(copyDaSpecSemContrato(…))`):
  grupo de leitura de um bloco só e mais de 40 blocos SOMADOS entre `blocos` e
  `camadasExtras` são recusados na porta. Antes a persistência gravava um
  contrato que `lerCopyAutoral` devolvia inválido e a edição seguinte caía em
  `sem-contrato`.

Da revisão do Codex sobre o terceiro commit (BLOQUEADO, R12…R14, 12/09/2026):

- 🔴 **A identidade EXPLÍCITA vem antes de TODO fallback legado, livres
  inclusive** (R12, `vincularExtras`): o passo 0 casa o bloco livre pela
  `metadata.compositor.extra.id` da camada, e camada que declara OUTRO bloco não
  entra em nenhum fallback (nome, id inferido `extra-<id>`, forma antiga, nem a
  associação por função). Um livre vazio `extra-hora` tomava a camada `hora` do
  serviço pelo id inferido e esvaziava o serviço já na persistência inicial.
- 🔴 **A numeração de textos comuns do mesmo papel é da PEÇA, não do grupo**
  (R13, `prepararBlocos`): horário num grupo e endereço noutro saíam os dois com
  id `servico`, a conferência final recusava a composição e os ícones de um
  texto sobrescreviam os do outro em `elementosPorTexto`. Hoje o segundo é
  `servico-2`, como no mesmo grupo.
- 🔴 **Duplicar página não renomeia id AUTORAL** (R14,
  `renomearExtrasDuplicados`): só o id INFERIDO do id da camada (`extra-<id>`,
  atual ou antigo) acompanha a camada nova; o bloco que a camada declara em
  `extra.id`, ou cujo id não é derivado dela, mantém o id e as referências no
  histórico — senão contrato e metadados divergiam depois de uma operação
  técnica.

Da revisão do Codex sobre o quarto commit (BLOQUEADO, R15, 12/09/2026):

- 🔴 **Com contrato, a recomposição rederiva do CONTRATO os blocos E as camadas
  extras** (R15, `specDaRecomposicao` em `spec-da-recomposicao.ts`, puro): o
  espalhamento da spec antiga preservava `camadasExtras` com o texto de antes da
  edição, `validarSpec` (contrato canônico, R05) recusava e o slide agendado
  ficava com a arte antiga em toda tentativa. Quem monta spec a partir de uma
  spec gravada e de um contrato novo tira da antiga TUDO o que sai do contrato
  (`copyAutoral`, `blocos`, `camadasExtras`). Sem contrato, a spec legada segue
  com os extras que tinha. Teste do consumidor com banco falso em
  `__tests__/recompor-camadas-extras.test.ts`.

Da revisão FINAL do Codex sobre E (BLOQUEADO, R18, 12/09/2026):

- 🔴 **O bloco de um papel que a preparação REPARTE entre textos do arranjo
  continua sendo UM bloco na copy efetiva.** O horário num grupo e o endereço
  noutro saem como `servico` e `servico-2`; a efetiva casava só a primeira
  camada com o bloco autoral e a segunda virava `extra-servico-2`, com função
  `servico` e SEM herança — revisão fictícia do sistema na persistência e, na
  edição seguinte, `papel repetido: servico` (SPEC_INVALIDA) na recomposição,
  com o slide preso na arte antiga. Hoje a preparação marca cada parte
  (`metadata.compositor.parte`, na ordem das linhas; só quando o papel foi
  repartido) e `copyEfetivaDasCamadas` reúne as partes no bloco ÚNICO daquela
  função sem herança, na ordem da numeração, mantendo id e linhas. Página
  composta antes da marca reúne pelo id `<papel>` / `<papel>-N`, que só a
  composição gera (reservado na spec); a marca sobrevive à duplicação (o id
  muda, a metadata vai junto). Camada com identidade explícita de extra nunca
  é parte, e com dois blocos da mesma função vale a associação por posição.
- ⚠️ O defeito nasce na efetiva do PR 3 (a leitura por função existe desde
  lá): o PR 3 não pode ir à main sem esta correção na pilha.

Da revisão do commit F (BLOQUEADO, R19, 12/09/2026):

- 🔴 **A ordem das partes vem da posição AUTORAL de cada linha, nunca do id da
  montagem.** A montagem segue a ordem dos grupos e do arranjo, não a do autor:
  com o endereço no grupo da MANCHETE (que já existe quando o serviço é
  distribuído), o endereço sai `servico` e o horário `servico-2`, e a marca
  `parte` derivada do id gravava `[endereço, horário]` como revisão do sistema,
  que a recomposição seguinte adotava. Hoje a distribuição (`juntarNoGrupo`,
  `dividirManchete`, `distribuirLinhas`) carrega o índice de cada linha no
  bloco até a camada, e a preparação grava `metadata.compositor.linhasDoBloco`
  (paralela às linhas do texto; só quando o papel foi repartido). A marca
  `parte` deixou de ser escrita.
- 🔴 **Uma camada pode receber linhas NÃO consecutivas** (`[0, 2]` no texto do
  relógio, `[1]` no do pin), e a sobra entra no último texto DEPOIS das linhas
  tipadas. A efetiva põe cada linha na sua posição, intercalando as camadas;
  reunir camada a camada, mesmo na ordem certa das camadas, embaralha o bloco.
- **Camada editada cuja contagem de linhas já não bate com a marca** entra
  INTEIRA, como trecho contíguo, no menor índice marcado. Sem a marca em todas
  as partes (página composta antes dela) vale a ordem do R18: `parte`, depois
  o id `<papel>-N`, depois a altura.

Da revisão do commit G (BLOQUEADO, R20, 12/09/2026):

- 🔴 **Uma parte marcada que SOBROU continua sendo parte.** Com o serviço
  `[reserva, horário, endereço]`, a sobra entra depois do endereço (`[2, 0]`) e
  o horário vai sozinho (`[1]`); ocultado ou excluído o horário, sobrava uma
  candidata e o retorno antecipado (`< 2`) caía no caminho comum, que lê a
  ordem do TEXTO — `[endereço, reserva]`, inversão que o autosave atribuía à
  equipe. Hoje a leitura pela marca vale também com uma única candidata
  marcada; uma camada só SEM a marca segue o caminho de sempre.

**Da revisão FINAL do Codex sobre e11abce7 (BLOQUEADO, R21…R22, 12/09/2026):**

- 🔴 **R21 — papel repetido se confere pela CONTAGEM de blocos comuns, nunca
  pela posição do extra.** `validarSpec` exigia id e herança da "segunda
  ocorrência" do papel. A spec sem contrato
  `[headline, servico, servico (id hora-extra, herdaDe apoio, ordem 0)]` passava;
  `copyDaSpecSemContrato` gravava o contrato na ordem AUTORAL
  `[hora-extra, headline, servico]`; a recomposição derivava os blocos desse
  contrato, o serviço comum virava a segunda ocorrência e a mesma validação o
  recusava — `SPEC_INVALIDA` na edição seguinte, slide preso na arte antiga.
  Hoje cada papel admite no máximo UM bloco comum (sem `id`+`herdaDe`), e todo
  o resto daquele papel tem de ser extra, em qualquer posição. O mesmo vício de
  "primeira ocorrência" estava no `medirCopy`: o papel ausente contava as
  linhas do extra declarado antes do bloco comum (agora `!b.herdaDe`).
  Testes: o cenário da revisão atravessa validação → preparação → persistência
  → edição → recomposição (e revalidação), pela spec sem contrato E pela
  entrada direta do contrato; dois serviços comuns continuam recusados com o
  extra antes, entre ou depois; e o consumidor `recomporPaginaDefasada` troca
  só o slide da arte (post entregue intacto), com cada texto no seu id.
- 🔴 **R22 — duplicar a página tem de levar o vínculo que só o ID dava.** A
  página legada reúne `servico` e `servico-2` (sem `parte` nem
  `linhasDoBloco`) pelos ids reservados; a duplicação os troca por UUIDs, e a
  cópia reunia uma parte só — a outra virava `extra-…` de função `servico` sem
  herança: alteração técnica que o autosave atribuía à equipe e, de novo, dois
  serviços comuns que a recomposição recusa. A transformação da rota saiu para
  `duplicarCamadasDaPagina` (`src/lib/copy-autoral/duplicacao.ts`, pura), que
  antes de regenerar os ids chama `marcarPartesLegadas`: grava a marca antiga
  `parte` com o MESMO número que a leitura tiraria do id (`<papel>` → 1,
  `<papel>-N` → N), só em texto sem `parte` e sem identidade de extra. A cópia
  se lê exatamente como a original; `linhasDoBloco` nunca é inventado. O
  reconhecimento pelo id e o da marca são as MESMAS funções no leitor e no
  duplicador. Teste: o cenário legado do R18 duplicado pela função da rota —
  um único `svc`, as mesmas linhas, nenhuma revisão, `parte` 1 e 2 sem marca
  autoral, e a spec derivada válida.
- **As três correções têm prova por mutação** (arquivo corrigido salvo,
  correção desfeita, teste falhando, restauro conferido com `cmp`).

**Da revisão FINAL do Codex sobre 838bde61 (BLOQUEADO, R23…R24, 12/09/2026):**

As duas são o MESMO defeito visto de lados opostos, e a revisão vinha achando
a variante seguinte a cada rodada. R23: um bloco cuja camada própria sumiu
(oculta ou excluída) tomava uma camada por uma regra MAIS FRACA — o extra
`hora-extra` levava pela função o texto do serviço comum `svc`, e o autosave
gravava a troca como revisão da equipe. R24: a duplicação troca o id físico
por UUID e perdia todo vínculo que a leitura só reconhecia por ele — o bloco
livre autoral `nota` (camada `id: "nota"`, nome "Nota da casa", sem metadata)
esvaziava e nascia `extra-<uuid>`. A regra única, na ordem de força:

| Vínculo | Vale oculta? | Sobrevive à duplicação por |
|---|---|---|
| identidade do extra (`metadata.compositor.extra.id`) | sim: o bloco sai vazio | a própria metadata |
| id do bloco = id físico (comum: com o papel; livre: id ou nome, **só em texto SEM papel** — R26) | sim: o bloco sai vazio | `metadata.compositor.bloco` (novo) |
| id inferido `extra-<camada>` (formas atual e antiga) — **só o livre SEM herança** (R25), **só em texto SEM papel** (R26) | sim, livres resolvidos sobre todas as camadas | renomear o bloco (R03/R14) |
| marca `linhasDoBloco` / `parte` — **inclusive as partes da voz 2 da manchete** (R27) | as partes visíveis seguem do bloco único | a própria metadata |
| id reservado `<papel>` / `<papel>-N`, **inclusive `headline2` / `headline2-N`** (R28) | as partes visíveis seguem do bloco único | `parte` (R22; a voz 2 também, R28) |
| papel reconhecido só pelo id | — | `metadata.compositor.papel` |
| posição (fila por função; voz 2 sem marca, pela altura) | **não é identidade**: só decide o que nada acima decidiu | — |

- 🔴 **Identidade vence posição, inclusive oculta.** A identidade é procurada
  também nas camadas ocultas (a visível primeiro); o bloco vinculado a uma
  camada oculta sai `[]` e NÃO entra no fallback por função — só as partes
  reconhecidas do mesmo bloco único (id reservado ou marca) ainda contam.
  Os livres passam a ser vinculados sobre todas as camadas na LEITURA, como já
  eram na duplicação: as duas pontas discordavam, e ocultar "Nota" fazia
  `extra-nota` tomar "nota" pela forma atual do id e esvaziar `extra-nota-2`.
- 🔴 **O extra com identidade (herança em função que não é `livre` nem
  `headline`) só é lido por ela.** Sem a camada, sai vazio — nem pela função,
  nem pela sobra. "Resolver os comuns primeiro" foi avaliado e RECUSADO: numa
  página cujo extra fosse uma camada `servico-2` comum, o bloco único juntaria
  as duas como partes dele. A compatibilidade que existe de fato é a segunda
  voz LEGADA (`headline2`: função headline herdando headline, dos
  adaptadores), que a F3 nunca produz e continua lida pela voz 2. Página
  composta ANTES da F3 com extra sem metadata não é suportada: o contrato
  (`copyAutoral`) não está na main, então esse registro só existe em dev.
- 🔴 **Posição não é identidade — e é por isso que não se ocultam camadas do
  fallback por posição.** Incluir as ocultas na FILA por função pareceu mais
  correto (dois blocos comuns, a de cima oculta) e foi recusado: a arte-rápida
  deixa invisível o campo que a copy não cobre, e a camada oculta de cima
  tomaria o bloco da visível de baixo. O caso só por posição continua
  ambíguo por construção.
- 🔴 **A duplicação materializa TODO vínculo do id físico** antes de trocá-lo
  (`materializarVinculosDoIdFisico`, com o MESMO valor que a leitura tiraria
  do id), e `duplicarCamadasDaPagina(camadas, novoId, contrato)` devolve
  camadas e contrato da cópia numa chamada — a rota não reimplementa nada.
  Nunca inventa `linhasDoBloco`, não sobrescreve marca, não toca camada com
  identidade de extra, e só age com contrato legível: página sem contrato
  duplica exatamente como antes.
- Testes (`camadas-extras.test.ts`, bloco R23–R24): extra oculto, excluído,
  oculto e reexibido, e na página duplicada (só `hora-extra` muda, `svc`
  intacto, releitura estável, recomposição válida); extra excluído com camada
  nova da equipe (vira `extra-…`, não é tomada); segunda voz legada; dois
  comuns com a camada do id oculta; parte visível do bloco único com a do id
  oculta; livre `nota` pelo id físico duplicado (id, texto e histórico, e
  oculto no original → reexibido na cópia); dois comuns duplicados; papel só
  pelo id duplicado; "Nota"/"nota" com uma oculta. Mutação por regra (M1–M6).

**Da revisão FINAL do Codex sobre 01786a00 (BLOQUEADO, R25, 12/09/2026):**

- 🔴 **Colisão de NAMESPACE: um id autoral pode ser igual ao id que a leitura
  INFERE de outra camada.** A spec com o extra livre `extra-servico` (herda do
  apoio) é aceita e compõe certo; excluída só a camada dele, o livre ficava sem
  a identidade explícita, e `idDeExtra('servico') === 'extra-servico'` o
  reassociava à camada do serviço comum — `servico` saía `[]`, `extra-servico`
  levava "11h às 15h", o autosave gravava a troca como revisão da equipe, e a
  duplicação renomeava o id autoral para `extra-<uuid>` por achar o vínculo
  inferido.
- **A regra: o namespace inferido é definido pela HERANÇA, não pelo prefixo.**
  `casaPeloIdInferido` — só o bloco livre SEM `estilo.herdaDe` (o que a própria
  leitura criou para texto solto) é casado pelo id inferido, nas formas atual e
  antiga (`extra-x-2`). O extra autoral só é lido pela identidade. A leitura
  nunca grava `herdaDe` num bloco que ela criou, então a marca é exata. A
  duplicação herda a distinção por construção: `renomearExtrasDuplicados` tira
  os vínculos de `vincularExtras`, e o autoral nunca chega lá ligado a outra
  camada.
- 🔴 **Reservar o prefixo `extra-` na spec foi avaliado e RECUSADO.**
  `idReservado` guarda as DUAS portas — `validarSpec` e a preparação
  (`resolverCamadasExtras`). Reservá-lo recusaria a entrada que a própria
  revisão declara válida, faria a preparação pular em silêncio o extra de uma
  spec gravada, e a recomposição (que revalida a spec) recusaria todo contrato
  já gravado com esse id. Os ids que a leitura cria sem herança (`extra-<uuid>`)
  não passam por essa porta: livre com texto sem herança já é recusado antes, e
  o vazio fica fora das camadas extras.
- **A varredura do resto do namespace**: `headline2`, `<papel>-N`, `bg-foto`,
  `logo`, `gradiente-leitura-*` e `<texto>-elemento-N` já são reservados (R02,
  R10); o papel nu (`servico`) só colide com a camada comum do mesmo papel, e a
  unicidade de id da spec já recusa; o valor da marca `bloco` sai dos ids do
  próprio contrato (únicos); e o `extra-<id>` que a leitura cria para texto
  solto desvia de id autoral existente com o sufixo `-N`.
- Testes: validação → preparação → persistência → exclusão → revisão →
  duplicação com `extra-servico` (só ele muda, serviço intacto, id autoral
  preservado, releitura estável, spec derivada válida); ocultar e reexibir, no
  original e na cópia (controle); a forma antiga `extra-servico-2`; o autoral
  `extra-nota` excluído com texto solto novo `nota` (o solto vira `extra-nota-2`
  inferido e só ele é renomeado na duplicação); o inferido `extra-solta` de
  sempre; e a varredura dos ids gerados na spec. Mutação M1–M2.

**Da revisão FINAL do Codex sobre 5d5d378e (BLOQUEADO, R26…R27, 12/09/2026):**

Sexta rodada na mesma família. Além das duas correções, um teste INVARIANTE
passou a enumerar os casos em vez de escolhê-los à mão
(`src/lib/compositor/__tests__/invariante-copy-autoral.test.ts`).

- 🔴 **R26 — o livre só alcança texto SEM papel.** O livre vazio `servico-2`
  (herda da manchete) ficava fora de `camadasExtras` e escapava da conferência
  de ids; na leitura, reservava pelo id físico a segunda parte do serviço
  repartido antes da reunião das partes de `svc` — o endereço ia para o livre,
  e a recomposição seguinte recusava o livre que ganhou texto
  (`SPEC_INVALIDA`). O invariante mostrou que a família era maior que o
  relatado: o livre `servico`, `headline` ou `extra-headline2` capturava do
  mesmo jeito a camada comum, a manchete ou a voz 2 — pelo id físico, pelo nome
  ou pelo id inferido. Hoje, fora da identidade explícita (passo 0), os
  fallbacks do livre (`livreParaFallback`) só alcançam camada cujo
  `papelDaCamada` é nulo: texto com papel é lido pela cascata das funções. E
  `validarSpec` passa os ids dos livres VAZIOS pelas mesmas conferências
  (reservado e repetido) dos outros ids.
  ⚠️ Contrato já gravado com esse livre é LIDO sem capturar nada, mas a
  recomposição dele é recusada na porta pelo id — recusa com motivo, nunca o
  contrato intermediário. Como o contrato não está na main, só dev tem registro.
- 🔴 **R27 — a segunda voz também é repartida.** Um arranjo com dois textos
  `headline2` recebe as linhas 1 e 2 da manchete (marcas `linhasDoBloco` [1] e
  [2]); a leitura pegava só a primeira voz 2 livre e `hoje` virava
  `extra-headline2-2` (livre sem herança): revisão fictícia e recomposição
  recusada. `partesDaVoz2` reúne todas as vozes 2 livres na ordem autoral, com a
  MESMA ordenação de `partesDoBloco` (`ordenarPartes`: marca, depois número
  legado e altura), e `linhasNaVoz2` são as últimas linhas.
- 🔴 **Achado do invariante, anterior a R27**: manchete INTEIRA na voz 2 com a
  camada dela oculta ou excluída saía `linhas: []` com `linhasNaVoz2: [0]` —
  contrato inválido que o autosave gravaria e a leitura seguinte recusaria.
  Bloco não desenhado agora sai sem `linhasNaVoz2`.
- **O invariante**: 708 contratos enumerados (A: manchete de 1 a 3 linhas com e
  sem voz 2 declarada × serviço de 0 a 3 linhas × 0 a 2 extras com herança ×
  quatro arranjos — um texto por papel, serviço em dois grupos (R18), serviço
  num grupo (R20), voz 2 em dois textos (R27); B: ids autorais do namespace que
  colide — papel nu, `<papel>-N`, `extra-<papel>`, `headline2` — num livre com e
  sem herança, vazio ou não). Para cada caso aceito: persistência com os mesmos
  ids e linhas e sem `extra-*`; releitura, duplicação e recomposição montada de
  novo sem mudança; e, texto a texto, ocultar, excluir, ocultar e reexibir, e
  duplicar e ocultar mudando SÓ o bloco dono, que perde exatamente as linhas
  daquele texto. Hoje: 243 aceitos, 3.266 operações, 0 falhas, menos de 1s.
  Antes das correções (mesmo oráculo): 310 aceitos e **88 casos falhando** — 45
  de captura pelo livre nos quatro arranjos, 37 da voz 2 repartida e 6 da
  manchete inteira na voz 2.
- 🔴 **O oráculo do invariante também erra, e errou na primeira rodada**:
  recompor sem nenhum bloco COM função e com texto é recusa legítima ("pelo
  menos um bloco"), não defeito. Falha de invariante nova se lê pela amostra
  antes de virar correção.
- Mutação por regra: M0 (tudo desfeito) 88 casos; M1 (livre alcança texto com
  papel) 16; M2 (spec sem o id do livre vazio) pego pelo teste R26; M3 (só a
  primeira voz 2) 15; M4 (bloco vazio com `linhasNaVoz2`) 6.

**Da revisão do commit 9c96dec9 (BLOQUEADO, R28, 12/09/2026):**

- 🔴 **R28 — a voz 2 também tem número legado, e a duplicação precisa levá-lo.**
  Página legada (sem `linhasDoBloco` nem `parte`) com a manchete
  `['Costela', 'na brasa', 'hoje']` em `headline` + `headline2` + `headline2-2`:
  a leitura original junta as vozes 2 pela numeração dos ids (`partesDaVoz2`,
  R27), mesmo com as camadas movidas no editor contra ela. Mas
  `materializarVinculosDoIdFisico` EXCLUÍA a `headline2` da marca `parte`; os ids
  viravam UUIDs e a cópia ordenava pela altura — `['Costela', 'hoje', 'na brasa']`,
  com o contrato duplicado dizendo o contrário, e a edição seguinte registrando
  a inversão como revisão da equipe. Hoje a materialização grava `parte` para
  todo número que a leitura usa — `<papel>`, `<papel>-N`, `headline2`,
  `headline2-N` — pela mesma função (`numeroDaPartePeloId`).
- 🔴 **O invariante só via página PREPARADA, e a preparada carrega a marca.**
  Ganhou dois eixos de VARIANTE de página: marcas (`preparada`; `legada`, sem
  `linhasDoBloco`/`parte`/`bloco`; `legada-sem-papel`, sem o papel também) e
  altura (`identidade`, `invertida`, `troca-no-grupo` nas partes de cada papel
  repartido). Duas lições de construção do próprio teste:
  - **a preparação devolve todo texto em y 0** — permutar alturas empatadas não
    reordena nada, e a primeira versão passou sem enxergar o R28. As alturas
    distintas são atribuídas na ordem do array (a da numeração) ANTES de
    permutar;
  - **o contrato AUTORAL não é oráculo da página legada**: ela foi persistida
    pela leitura legada, que numa distribuição `[0, 2]` / `[1]` segue a
    numeração e não a ordem autoral. Na legada vale PRESERVAR a leitura em toda
    operação (releitura, duplicação, ocultar e reexibir, e ocultar na cópia igual
    a ocultar na original); o contrato autoral e o dono texto a texto valem só na
    preparada. `legada-sem-papel` é forma que o compositor nunca gravou (o papel
    existe desde 02/09, o id numerado desde 11/09) e só entra na regra
    diferencial.
- Números: 708 contratos, 243 aceitos, **1.239 variantes de página, 18.042
  operações, 0 falhas**. Antes da correção: **15 casos falhando**, todos na voz 2
  em dois textos, página legada com altura invertida ou trocada, na duplicação.
  Teste do R28 em `camadas-extras.test.ts` (leituras original e duplicada
  idênticas, sem revisão, `parte` 1 e 2 na cópia). Mutação: devolver a exclusão
  da `headline2` derruba o teste R28 e os mesmos 15 casos.

**Da pré-revisão do HEAD 980eea2a (APTO COM NOTAS, C9-01…02, 12/09/2026):**

- 🔴 **C9-02 — a camada DUPLICADA ou COLADA no editor não leva a identidade
  da original.** `duplicateLayer` e `pasteLayers` copiavam a metadata inteira: a
  cópia do extra `nota` nascia declarando `extra.id = 'nota'`, e com duas camadas
  no mesmo bloco só a altura desempatava — arrastar a cópia para cima trocava
  três blocos do contrato e o autosave assinava como edição da equipe, sem texto
  editado. Hoje as duas ações passam por `semIdentidadeAutoral`
  (`src/lib/copy-autoral/camada-copiada.ts`, puro): a cópia sai sem `extra`,
  `bloco`, `parte`, `linhasDoBloco` **e sem `papel`**. O papel sai também porque
  uma segunda camada do mesmo papel vira um segundo bloco COMUM daquela função
  — e com dois comuns o bloco repartido deixa de reunir as partes e a leitura
  volta a ser por posição. Sem papel a cópia é texto solto, com o próprio bloco
  inferido ligado a ela pelo id. Grupo, prefixo e encaixe ficam.
  ⚠️ Custo aceito: a cópia de um texto do compositor perde o papel e, com ele,
  o que o painel de combinações lê dele; quem quiser a cópia num papel o
  atribui de novo. `parte` e `linhasDoBloco` sozinhos não mudam a leitura de
  uma camada SEM papel — a mutação que os mantém é pega só pelo teste do helper,
  e eles saem para a cópia não voltar a ser parte se alguém lhe der o papel
  depois.
- 🔴 **C9-01 — o invariante passou a provar CORREÇÃO também na página legada,
  e a encadear operações.**
  - **Oráculo da legada** (`leituraLegada`): a leitura que o leitor LEGADO fazia —
    as partes de cada bloco comum pela numeração dos ids (`<papel>`,
    `<papel>-N`, e a voz 2 depois da manchete) — e o dono de cada texto nessa
    leitura. Persistência, ocultar e excluir comparam com ele, não só a cópia
    com a original. A página artificial sem papel continua só na regra
    diferencial.
  - **Só o id que não é do autor é mascarado**: o `extra-*` autoral (com herança)
    fica visível em toda comparação; o livre SEM herança com id `extra-*` segue
    mascarado, porque pela regra do R25 ele É o namespace inferido (a primeira
    rodada acusou 2 casos da página sem papel exatamente por essa renomeação).
    Os ids enumerados ganharam `extra-nota` e `extra-servico-2`.
  - **Roteiros encadeados por texto**: excluir → salvar (a revisão que o
    autosave grava) → reler → duplicar → validar a spec da recomposição; e
    duplicar → ocultar → salvar → reler → reexibir → salvar.
- Números: **780 contratos, 229 aceitos, 1.167 variantes de página, 40.644
  operações (7.662 encadeadas), 0 falhas**. Antes das correções: as 6 variantes
  do C9-02 falhavam, e o invariante estendido não achou defeito novo no leitor.
  Mutação: a leitura legada só pela altura (a prova sugerida pela pré-revisão)
  derruba **80 casos** na legada e o teste R28; o id inferido casando livre com
  herança derruba 5 casos, entre eles os roteiros encadeados; cada marca mantida
  na cópia derruba o cenário dela (`extra` → o extra, `bloco` → o livre ligado por
  bloco, `papel` → manchete, parte marcada e parte legada).

**Da pré-revisão do commit 099818b0 (BLOQUEADO, C9-11…13, 12/09/2026):**

- 🔴 **C9-11 — o `papel` só sai da camada copiada quando a página TEM contrato
  da copy.** O C9-02 tirava o papel em qualquer página, e na página SEM contrato
  (a assinatura, a de combinação) o papel é justamente o que o COMPOSITOR lê:
  duplicar o texto de serviço para fazer a linha do endereço gerava uma cópia
  sem papel, `arranjoDasCamadas` a descartava junto com o ícone preso a ela, e
  toda peça seguinte daquela variante punha horário e endereço no mesmo texto,
  em silêncio. Lá não há leitura de autoria a proteger (`revisar-pagina` devolve
  `sem-contrato`). Hoje `semIdentidadeAutoral(camada, { paginaTemContrato })`
  tira SEMPRE `extra`, `bloco`, `parte` e `linhasDoBloco` e o `papel` só com
  contrato — a nota do C9-02 sobre "sem papel" vale só para essas páginas.
  - **Os dois callbacks do editor chamam funções PURAS** (`camadaDuplicadaNoEditor`,
    `camadasColadasNoEditor`, em `camada-copiada.ts`), e um teste lê a fonte de
    `template-editor-context.tsx`: antes, voltar `duplicateLayer` ou
    `pasteLayers` a copiar a camada inteira não derrubava teste nenhum, porque
    o teste refazia o spread por conta própria.
  - 🔴 **O `MultiPageProvider` mapeia os campos da página UM A UM** e descartava
    `copyAutoral`, que a rota `GET /api/templates/[id]/pages` já devolve. O
    editor lê `Page.temCopyAutoral` (boolean derivado no mapeamento) por
    `useMultiPageOpcional()` — o `useMultiPage()` lança fora do provider. Campo
    novo de `Page` que o editor precise ler tem de entrar nesse mapeamento,
    senão some sem erro.
- **`definirPapel` (painel de combinações) passou a MESCLAR**
  (`comPapelNoCompositor`, `font-combinations-capture.ts`): substituía
  `metadata.compositor` por `{ papel }` e, numa página composta, apagava `extra`,
  `bloco`, `parte`, `linhasDoBloco` e `encaixe`. Tirar o papel remove só o papel.
- 🔴 **C9-12 — o invariante ganhou o eixo da ORDEM DO ARRAY** (textos invertidos
  e rotacionados no array, alturas na numeração, donos procurados pelo ID da
  camada). Na página preparada a ordem do array coincide sempre com a numeração
  dos ids, e o painel de camadas muda o array. Medido contra o invariante do
  HEAD 099818b0: tirar o `sort` do ramo legado de `ordenarPartes` derrubava 196
  casos, **todos** em `voz2-dois-textos` (pelas permutações de Y) — e **zero**
  nas páginas de serviço. Com o eixo: 714 falhas, 322 delas em
  `servico-dois-grupos` e `servico-mesmo-grupo` (74 de persistência). Trocar a
  numeração pela posição no array dá o mesmo placar. A mesma troca no ramo das
  partes MARCADAS é mutante equivalente (as linhas vão pela posição autoral de
  `linhasDoBloco`, não pela ordem das camadas).
- 🔴 **C9-13 — os dois primeiros passos dos roteiros encadeados eram f(x) contra
  f(x)** (`salvar` é a leitura crua quando não há camada escondida pelo revisor)
  e saíram, junto com a contagem deles. Entraram: excluir → salvar → reler →
  duplicar → spec da recomposição → **desfazer** → salvar (devolve a leitura
  original), e a camada escondida pelo **REVISOR** (`comVisibilidadeDoRevisor`):
  salvar é `sem-mudanca`, a leitura da arte é igual a ocultar, e desfazer segue
  `sem-mudanca`. Mutações: `camadasParaDecisao` como identidade derruba 11.226
  verificações (o roteiro do revisor); a revisão que só registra remoção derruba
  o desfazer e o reexibir.
- Números: **780 contratos, 229 aceitos, 1.647 variantes, 74.354 operações
  (16.839 encadeadas), 0 falhas**. Mutações do editor, cada uma derrubando o
  teste dela: o helper ignorando a opção (3 testes), `duplicateLayer` e
  `pasteLayers` copiando a camada inteira, o contexto sem `temCopyAutoral`, o
  painel substituindo o compositor e `comPapelNoCompositor` substituindo.
- 🔴 **`copyDaSpecSemContrato` confere a própria saída** (restack sobre o PR 2, `9238098f`/`493e8d6a`,
  13/09/2026): `converterSpecSemContrato` devolve `{ copy: null, problemas, original }` quando a spec sem
  contrato não cabe no leitor, e `copyDaSpecSemContrato` LANÇA `CopyLegadaIncompativel` — a mesma forma dos
  adaptadores do PR 2, que também valem aqui (lacuna de resumo para papéis desconhecidos, `em`/`superficie`
  vazios recusados, nunca omitidos). `validarSpec` e a persistência do compositor usam o `converter*`; e a
  função entrou na varredura de fronteira de `invariantes.test.ts`, como o PR 2 manda para produtora nova.

**Da revisão FINAL do Codex sobre a0b2cdcc (BLOQUEADO, PR9-F01…F02, 18/09/2026):**

- 🔴 **PR9-F01 — ~~sem contrato legível, peça com camada extra NÃO se recompõe.~~**
  **Superado em 21/09/2026 pelo PR 10 (R1, e PR10-04/05):** sem contrato
  legível, a peça com camada extra RECOMPÕE quando dá e é RE-RENDERIZADA como
  está quando não dá. Com o HISTÓRICO CHEIO a peça é composta com o contrato
  COMO A PÁGINA O MOSTRA (`contratoLidoParaRecompor`), e re-renderizada quando
  ele não representa a página (texto que nenhum bloco originou, conteúdo que não
  passa em `validarSpec`); na página SEM contrato, `specComACopyDaPagina` lê
  cada extra pelo `metadata.compositor.extra.id`, com o texto da PÁGINA; com
  `RevisaoDaCopyInvalida` (o texto da página não cabe no contrato e, pelos
  mesmos limites, nem na spec), re-render. "A peça tem extra" é
  `specTemExtra` — as DUAS formas: `camadasExtras` (o livre) e bloco com
  `herdaDe` (o extra COM função). Ver "PR9-F01 no PR 10", na seção do ciclo.
  Com o histórico cheio (200 revisões) ou um bloco novo que o contrato não
  comporta, `tentarCopyEfetivaDasCamadas` recusa e a recomposição caía no
  caminho sem contrato — que atualiza só os blocos por papel (`specComACopyDaPagina`)
  e deixa `specDaRecomposicao` conservar as `camadasExtras` da spec ANTIGA. O
  compositor recebia "Hoje" e gravava sobre o "Amanhã" que a equipe tinha
  salvo, e o slide ia junto. A leitura do contrato passou para ANTES da
  decisão (`recomporPaginaDefasada`): ~~sem contrato legível e com extra na spec
  (inclusive página legada sem contrato), a arte é **re-renderizada como a
  página está** — camadas e contrato intactos, aviso no registro, só o slide
  troca.~~ Regra geral: caminho de fallback que usa dado DERIVADO de outra versão
  (a spec antiga) não pode escrever por cima da página; re-renderizar o que está
  gravado é o fallback seguro.
- 🔴 **PR9-F02 — o extra VAZIO COM FUNÇÃO e herança também disputa o
  namespace.** `blocosParaOCompositor` omite bloco com função vazio dos blocos
  derivados, e a conferência de ids só recuperava os vazios de `semPapel`
  (livres): `servico-2` (serviço herdando o apoio, `linhas: []`) passava, e na
  leitura tomava pelo id físico a segunda parte do serviço comum repartido —
  `svc` perdia o endereço e a recomposição seguinte caía em SPEC_INVALIDA.
  `validarSpec` confere todo bloco vazio que vira camada própria (livre ou com
  herança), e a leitura (`copyEfetivaDasCamadas`, 2º passo do vínculo por id
  físico) nunca entrega a um bloco com herança uma camada que é PARTE da
  composição (`parte`, `linhasDoBloco` ou id `<funcao>`/`<funcao>-N`) — é o que
  protege contrato já gravado antes da porta. O invariante enumera o extra vazio
  com função (cobertura `f02`).
### O ciclo da camada extra (PR 10 de "Marca simples, copy melhor", 12/09/2026)

O PR 9 criou a camada extra; este fecha o CICLO dela — criar, editar, trocar a
foto, re-renderizar, editar a copy e recompor — em imagem única e em slide de
carrossel, e só então a anuncia no conector. Testes puros em
`src/lib/compositor/__tests__/ciclo-extras.test.ts`; prova no branch de dev em
`scripts/validar-camadas-extras.ts` (variante sem `servico`, horário e nota
herdando do apoio, os dois tipos de post).

- 🔴 **A camada extra se lê pela IDENTIDADE, nunca pelo papel da função dela**
  (`copyDaPaginaPorIdentidade`, em `defasagem.ts`). O serviço que herda do
  apoio grava `metadata.compositor.papel = 'servico'`, e a recomposição SEM
  contrato (`specComACopyDaPagina`) juntava o texto dele ao do serviço comum,
  tirava `herdaDe` e `id`, e devolvia ao compositor um bloco de papel que a
  variante não tem: `PAPEIS_INCOMPATIVEIS` (ou "papel repetido"), e o slide
  ficava com a arte velha. O livre, sem papel, nem era lido. Hoje o extra volta
  com a identidade da SPEC (id, herança, grupos, ordem) e só o TEXTO vem da
  página, respiro incluído; extra apagado na página sai da spec com aviso.
  `copyDosPapeis` continua lendo o extra pela função — é outra pergunta.
- **Com contrato, os extras saem do CONTRATO**: a spec da recomposição não
  carrega `camadasExtras` da spec antiga (R15 do PR 9, `specDaRecomposicao`) —
  com o texto editado, o `validarSpec` a recusava como divergente.
- 🔴 **Trocar a foto é defasagem** (`Defasagem.fotoTrocada`). `precisaRefazer`
  só olhava texto e geometria, e a foto trocada no editor num slide de
  carrossel NUNCA chegava ao post — a página parecia em dia. A peça é
  RECOMPOSTA com a foto da página (os extras junto). Só conta com foto dos dois
  lados: imagem acrescentada ou removida já é ajuste manual pelo diff.
- **O enquadramento da foto mexido à mão é ajuste manual** (`style.crop`,
  `cropPosition`, `objectFit` da camada de imagem, que o diff de geometria não
  via): recompor escolheria o corte de novo pelo mapa de calma e apagaria o
  acerto. Re-renderiza como está.
- **O aviso de ajuste manual nomeia o extra pelo id que ele DECLARA**
  (`metadata.compositor.extra.id`), não pelo papel da função ("hora foi movida",
  nunca "servico foi movida" numa peça que também tem o serviço comum).
  🔴 Nunca pelo FORMATO do id: `idReservado` só proíbe `<papel>-N` numérico, e o
  extra `servico-fds` (id aceito) começava por `servico-` — o aviso o chamava de
  "servico" (varredura do 2º restack, 21/09/2026; a mesma inferência pelo id
  que o PR9-F02 tirou da duplicação). O rótulo é só texto: toda decisão
  (`soTexto`, `precisaRefazer`, `paginaMudouDesde`) lê a CONTAGEM de
  `mexidoNaMao`.
- **Escritas visuais: nenhuma nova neste PR.** As cinco portas (PATCH da página,
  PUT do template, PATCH de camada, `ajustarArte`, `reverterCamadasDaArte`) já
  chamam `invalidateScheduledRenders` + `pedirRecomposicaoDaArteCongelada`, e os
  dois escritores de cópia da página em `slotValues` (`agendarPost`,
  `trocar-arte-do-post` por página) já usam `comoCopiaDaPagina` — a cópia leva
  o extra pelo id da camada, e `renderPostArt` a mantém em dia.
- ⚠️ **O PATCH de camada avulsa** (`/api/pages/[pageId]/layers/[layerId]`, o
  autosave do painel do gerador de criativos) **não revisa o contrato** da
  página: texto de extra mudado por ali entra na próxima leitura como revisão do
  SISTEMA (superfície da recomposição), não da equipe. Herdado do PR 3.
- **No conector** (`catalogo/compositor.ts`): `compor-arte`, `compor-leva` e
  `medir-copy` aceitam `id`, `herdaDe`, `grupoVisual`, `grupoDeLeitura` e `ordem`
  no bloco, e `camadasExtras`; o teto de blocos é o da spec (40, somados com os
  extras — `validarSpec` confere a soma). `medir-copy` devolve `extra` em cada
  bloco medido (o `papel` ali é o de estilo). A regra "até a camada extra
  existir" saiu de TODOS os lugares no mesmo commit (instruções, descrição,
  `FORMAS-DE-ARTE.md`, este arquivo, comentários) — regra velha e nova
  convivendo é defeito. Snapshots do registro atualizados de propósito.
- ⚠️ **A escolha da VARIANTE ainda pontua pelo papel da FUNÇÃO**
  (`carregarAssinatura` recebe `spec.blocos.map(b => b.papel)`): o horário que
  herda do apoio conta como "pede servico" e empurra para a variante que tem o
  campo, se houver. Não quebra nada — a peça compõe nas duas —, mas quem quer a
  variante sem o campo fixa `preferencias.variante`.
- ⚠️ **Arte ajustada por `ajustarArte` deixa de ser recomposta**: a Generation
  nova não tem spec nem snapshot, e daí em diante a página só re-renderiza como
  está (os extras continuam na página, editáveis). Herdado do desenho da
  recomposição, não deste PR.
- 🔴 **A recomposição grava a spec VALIDADA, com a mesma forma que a
  composição grava** (prova-dev-1 do PR 10, 12/09/2026). `specDaRecomposicao`
  tira os extras velhos e deixa só contrato + blocos; `camadasExtras` só é
  remontado por `validarSpec`. Gravar a entrada deixava a nota (extra `livre`)
  apenas dentro do contrato, e quem lê `fieldValues.spec.camadasExtras` a
  perdia depois da primeira recomposição. Teste: o consumidor R15 em
  `recompor-camadas-extras.test.ts` confere a spec gravada.

**Da revisão dos patches do PR 10 (commit cb3e951e, BLOQUEADO, R01…R04, 12/09/2026):**

- 🔴 **R01 — o job que está RODANDO não é reaberto pelo enfileiramento, então
  a conferência do FIM do job tem de olhar tudo o que a recomposição consome.**
  Causa: o runner comparava só a COPY antes × depois; a foto trocada (ou o
  corte mexido) depois da gravação condicional da página e antes do fim do job
  terminava com o slide mostrando B e a página mostrando C — o compare-and-set
  da página não cobre essa janela. Regra (reescrita pela C10-04, depois do
  rebase sobre o PR 0): **com arte refeita**, a referência é o que o job GRAVOU
  — a versão visual `versaoGravada` do PR 0 (dimensões, fundo e camadas: foto e
  corte vivem nas camadas); **sem nada refeito** não houve gravação, e a
  referência é a página lida ANTES do job, perguntada por
  `paginaMudouDesde(camadasAntes, agora)` (`defasagem.ts`, a pergunta de
  `medirDefasagem`: texto de toda camada visível, extras inclusive; foto;
  enquadramento; geometria; tipo; camada acrescentada ou removida). Nos dois
  ramos, sem orçamento para outra tentativa o job LANÇA `PAGINA_MUDOU_DURANTE`
  (C10-01). Ilegível não pede tentativa. Não existe `camadasDaArte` no resultado
  — o campo foi removido por não ter leitor. Testes: consumidor do runner em
  `ciclo-extras-revisao.test.ts` (arte refeita: troca só de foto na janela →
  nova tentativa com "renderizar como está" → a segunda execução re-renderiza
  com C e o slide mostra C; só o corte → nova tentativa; sem edição → nenhuma.
  Nada refeito: ver a pré-revisão abaixo).
- 🔴 **R02 — schema público que espelha validador interno usa os limites DELE.**
  Causa: `linhasDoBloco` do conector exigia string não vazia e até 6 linhas, e
  `compor-arte`, `compor-leva` e `medir-copy` recusavam na porta o respiro ("")
  e as 7 a 12 linhas que `validarSpec` e o contrato aceitam. Regra: as linhas,
  o id, o grupo de leitura, a ordem e os enums vêm de `blocoSchema`/`PAPEIS`/
  `GRUPOS_VISUAIS` (`compositor/spec.ts`, módulo puro — o catálogo continua
  carregando sem env); os tetos que ficaram literais (40 blocos, 3 candidatas,
  20 slides, 8 arranjos) têm teste de PARIDADE do JSON Schema com a spec.
  Snapshots do registro atualizados de propósito. ⚠️ Campos públicos MAIS
  FROUXOS que a spec (`nome` sem o teto de 120, `preferencias.variante` sem o de
  80, `projectId` sem inteiro positivo, `fotoUrl` sem formato de URL) ficaram
  como estão: a recusa acontece em `validarSpec`, POR ITEM — apertar na porta
  faria um item ruim recusar a `compor-leva` inteira. Testes: as três tools com
  respiro inicial/interno/final e 7–12 linhas preservados, 13 linhas e linha de
  301 caracteres recusados, em `compositor-camadas-extras.test.ts`.
- 🔴 **R03 — na recomposição, decidir AUSÊNCIA de texto é separado de
  TRANSFORMAR as linhas.** Causa: `copyDaPaginaPorIdentidade` fazia `trim()`
  antes de separar as linhas (["", "vale só no almoço", ""] voltava como uma
  linha só) e `specComACopyDaPagina` filtrava linha vazia do bloco comum —
  mudando copy e espaçamento em silêncio na recomposição SEM contrato. Regra: o
  conteúdo volta BRUTO, como o contrato já lê a camada (`linhasDaCamada`), e
  `temTexto` só decide se a camada tem texto. Testes: ida e volta pela
  preparação e pelo consumidor, extra de bloco, extra livre em rich text
  (`[colchetes]`) e bloco comum, com os arrays comparados inteiros.
  ⚠️ Fica aberto (fora do PR 10): a DETECÇÃO lê `textosDaPagina`, que apara —
  editar SÓ o respiro (ou só o destaque de um rich text) não conta como
  defasagem, e o slide só pega a mudança na próxima edição que conte.
- 🔴 **R04 — mapa chaveado por id do autor é sem protótipo.** Causa: o mapa de
  extras era `{}`; "constructor" e "toString" são ids permitidos, e o extra
  esvaziado na página (texto vazio não entra no mapa) achava a propriedade
  HERDADA — valor verdadeiro, `texto.split is not a function`, a recomposição
  falhava e o slide ficava velho, com ou sem contrato (a leitura roda antes de
  adotar o contrato). Regra: `Object.create(null)` e leitura só por
  `textoDoExtraNaPagina` (propriedade própria e string). Testes: os dois ids,
  com e sem contrato, pelo consumidor da recomposição — sem exceção, extra
  tirado com aviso, slide trocado. (`textosDaPagina` usa `in` e renomeia a
  chave para "constructor#2": cosmético, sem exceção.)

**Da pré-revisão do HEAD 8b8e801f (BLOQUEADO, C10-01…04, 12/09/2026):**

- 🔴 **C10-01 — sem nada refeito e sem orçamento, a edição feita durante o job
  NÃO pode virar sucesso.** Causa: a união do rebase trouxe o ramo "nada foi
  refeito" (`paginaMudouDesde`) sem a metade do REV-D02: com `pedirNovaTentativa`
  devolvendo `false` o runner seguia, `fecharJob` lia a Generation COMPLETED e
  fechava DONE — a página com a foto ou o texto novo, o slide com a arte velha,
  sem `lastError` nem recusa. Regra: os dois ramos da conferência final lançam
  `PAGINA_MUDOU_DURANTE` quando não há mais tentativa; o `catch` grava a recusa
  na arte e no histórico do post e relança (o job fica FAILED com motivo).
  Teste: página em dia no levantamento, foto trocada logo depois dele,
  orçamento esgotado → rejeita com `PAGINA_MUDOU_DURANTE`, a recusa gravada em
  `fieldValues.recusaDaRecomposicao` (chave própria, C6-01 do PR 0 — o registro
  `recomposicao` do último render fica como estava) e histórico "A arte NÃO foi
  atualizada: … confira a página e salve de novo".
- 🔴 **C10-02 — a voz 2 legada é a última linha COM TEXTO, com os respiros que
  a seguem, e nunca uma voz 2 vazia** (`dividirManchete`, `segunda-voz.ts`).
  Causa: o R03 passou a preservar o respiro, e a regra legada "última linha na
  voz 2" pegava a linha VAZIA de "na brasa\n": numa página sem contrato (todas
  as de produção hoje) uma edição em OUTRO texto recompunha a peça com "na
  brasa" na voz 1 (sem a cor e a fonte da segunda voz) e reescrevia as camadas.
  O R02 abriu a mesma porta pela composição do chat (linha "" aceita na porta).
  Com contrato nada muda: manda `linhasNaVoz2`. Menos de duas linhas com texto
  = sem segunda voz. Testes: unidade (normal, "\n" no fim, linha só de espaços
  no fim, respiro interno, uma linha com texto, controle com contrato) e
  consumidor sem contrato, variante com `headline2`, apoio editado → `headline2`
  mantém "na brasa" exatamente como estava. **Como o editor grava o "\n" final:**
  lido no código, não medido no navegador — `konva-editable-text.tsx` põe a
  quebra com Shift+Enter (Enter confirma) e confirma com `onChange({ content:
  finalValue })`, o valor cru do textarea, sem `trim`; o PATCH da página aceita
  `layers` como `z.array(z.unknown())` e não normaliza `content`.
- **C10-03 — o teste do fim do job tem de ALCANÇAR o ramo que prova.** Causa:
  os três casos do R01 partiam de arte que precisava ser refeita, então o ramo
  "nada foi refeito" não era alcançado (apagá-lo deixava a suíte verde), e a
  fila falsa ignorava o "renderizar como está": a 2ª execução recompunha pela
  spec, caminho que a produção não segue. Regra: a fila falsa grava o marcador
  e `jobAtual()` o entrega à execução seguinte; o re-render falso registra (nova
  URL e merge do patch). Testes novos no ramo "nada foi refeito": com orçamento
  → tentativa sem compor nem renderizar, e a seguinte recompõe com C; sem
  orçamento → `PAGINA_MUDOU_DURANTE`; sem edição → nada.
- **C10-04 — documentação e código dizem a mesma regra**: o parágrafo do R01
  acima foi reescrito com os dois ramos, e `ResultadoDaRecomposicao.camadasDaArte`
  (preenchido e sem leitor) saiu. Comparar com o que o job gravou é a regra
  certa — e é o que a `versaoGravada` do PR 0 já faz no ramo em que houve
  gravação.
- ⚠️ **Limites conhecidos, herdados do PR 0 e NÃO mexidos aqui:**
  - edição salva DEPOIS da leitura final da conferência e antes de `fecharJob`
    também encontra o job `RUNNING` e não o reabre: o job fecha DONE com a arte
    anterior, até a próxima edição ou a varredura. Fechar isso exige marcar no
    job uma "edição pendente" no enfileiramento, como já se faz com a força;
  - recusa determinística desatualizada: se a equipe encurta o texto enquanto o
    job refaz a peça com o texto longo, o job termina
    `TEXTO_NAO_CABE_NA_COLUNA` → FAILED, com a recusa gravada nos posts, e a
    edição que resolveria não reabre o job em andamento. A recusa fica
    desatualizada até a próxima edição.

**Da pré-revisão do commit 3fad6ba2 (APTO COM NOTAS, C10-11, 12/09/2026):**

- 🔴 **C10-11 — antes de falhar (ou pedir tentativa) no ramo "nada foi refeito",
  confira se AINDA HÁ o que refazer.** Causa: o throw da C10-01 decidia só por
  `paginaMudouDesde` (página antes × depois). Com o post congelado
  (`laterPostId`) no meio do caminho, ele saía dos slides, a edição feita no
  levantamento disparava o throw, e o job fechava FAILED dizendo que "o slide"
  ficou com a versão anterior quando slide nenhum existia — e a recusa, por
  merge raso, apagava o registro do último render (a C6-01, que o PR 6
  conserta). Antes da C10-01 esse caso fechava DONE, o desfecho certo. Regra:
  mudou → `levantarPagina` de novo e a MESMA pergunta do enfileiramento (arte
  registrada, `slides.length > 0` e `precisaRefazer`, ou força); sem o que
  refazer, fecha normalmente, sem tentativa e sem recusa. A conferência vale
  para os dois desfechos (com e sem orçamento): tentativa que não acha trabalho
  só gasta orçamento. Testes: post congelado + foto trocada no levantamento,
  com e sem orçamento → resolve, `pedirNovaTentativa` não chamado, histórico
  vazio, `fieldValues` da arte idêntico byte a byte.
- **O motivo da falha é em português da equipe e diz o que mudou**
  (`edicaoDuranteOJob`, `defasagem.ts`, pela defasagem do novo levantamento):
  "a foto da página foi trocada…", "o texto da página foi alterado…", os dois,
  ou "a página foi alterada…" (caixa, corte, camada). Saíram o jargão ("que a
  encontrou em dia") e a redundância com o modelo do histórico. O sufixo do
  histórico é neutro — "confira a página e salve de novo" —, vale para texto e
  para foto, e sai de `mensagemDaRecusaNoHistorico` (C6-12, descido com o PR 0):
  quando a mesma rodada já trocou o PNG, a mensagem diz que a imagem foi
  trocada em vez de afirmar que continua a anterior.
- Comentários que ainda diziam "a última linha" (`preparar-blocos.ts`,
  `defasagem.ts#specComACopyDaPagina`) passaram a dizer "a última linha COM
  TEXTO, com os respiros que a seguem", como `segunda-voz.ts`.

**Da revisão FINAL do Codex sobre 75301ff0 (BLOQUEADO, PR10-01…03, 18/09/2026):**

- **PR9-F01 no PR 10**: ~~com histórico cheio, a recomposição SEM contrato
  segue — `specComACopyDaPagina` reconstrói cada extra pela identidade da
  camada, então o texto novo chega à spec~~ — **superado em 21/09/2026 pelos
  PR10-04/05** (abaixo): com o histórico cheio a peça é composta com o contrato
  lido das camadas, nunca pelo caminho sem contrato. Com `RevisaoDaCopyInvalida`
  (o texto da página não cabe no contrato, e pelos mesmos limites não cabe na
  spec) a peça com extra é re-renderizada como está, como no PR 9.
  ⚠️ **Peça SEM extra com leitura inválida recompõe e cai em `SPEC_INVALIDA`**
  (erro determinístico no runner: sem nova tentativa, recusa na arte e no
  histórico do post, job FAILED, slide com a arte antiga) — a trava só
  re-renderiza com extra. É igual na regra do PR 9 e na do PR 10 e anterior ao
  2º restack: comportamento ATUAL, documentado por teste
  (`recompor-camadas-extras.test.ts`, "COMPORTAMENTO ATUAL"), não defeito novo.
  Vale também para histórico cheio + conteúdo inválido SEM extra (o contrato
  lido não passa em `validarSpec`, e sem extra a peça segue pelo caminho sem
  contrato). "Re-renderizar como está também sem extra?" é pergunta de desenho
  em aberto.
- 🔴 **PR10-01 — toda leitura do runner da recomposição mora DENTRO do `try`.**
  `camadasAntes` era lida antes dele: um timeout transitório atravessava o
  dispatch e `falharJob` gravava FAILED com tentativas sobrando, sem recusa no
  histórico. Agora ela passa por `pedirNovaTentativa`/`registrarRecusa` como
  qualquer erro de infra. ⚠️ `marcarForcaEmExecucao` (PR 0) continua ANTES do
  `try`, com a mesma forma — não mexido aqui por ser do PR 0.
- 🔴 **PR10-02 — o `pattern` publicado no conector perdia a flag do regex.**
  `idDeCamadaSchema` era `/…/i` e o `zodToJsonSchema` anunciava `^[a-z0-9]…$`:
  cliente que valide o inputSchema recusava `Nota`, que o zod aceita. O regex
  passou a declarar as maiúsculas EXPLICITAMENTE (vale também para o servidor
  stdio, que converte o zod pelo SDK), e `derivarSchemaJson` usa
  `applyRegexFlags: true` como guarda para qualquer regex com flag no catálogo.
  O teste valida `Nota`/`nota` contra o `schemaJson` ANUNCIADO — a paridade
  zod × zod comparava duas conversões que perdiam a flag igual.
  ⚠️ `idDeBlocoSchema` (contrato, PR 2) ainda usa `/i`; hoje não é publicado
  em nenhuma tool.
- PR10-03: as duas passagens deste arquivo que descreviam a recusa em
  `recomposicao.estado = 'recusada'` e o sufixo antigo do histórico foram
  corrigidas para `recusaDaRecomposicao` e "confira a página e salve de novo".

**Da revisão FINAL do Codex sobre 1d18e983 (BLOQUEADO, PR10-04…05, 21/09/2026):**

- 🔴 **PR10-04 — a classe da PRIMEIRA recusa não prova que o conteúdo seja
  válido.** `tentarAplicarRevisao` recusa o histórico cheio ANTES de validar o
  conteúdo novo: com 200 revisões e uma linha de 301 caracteres num extra, a
  leitura devolvia `HistoricoDaCopyCheio`, a guarda do re-render (que exigia
  `RevisaoDaCopyInvalida`) ficava falsa, a recomposição reconstruía uma spec
  inválida, o compositor lançava `SPEC_INVALIDA` e o runner, tratando o erro
  como determinístico, deixava o slide com a arte antiga. Hoje a spec
  reconstruída passa por `validarSpec` ANTES de liberar a recomposição; não
  passando, a peça com extra é re-renderizada como está. O estado é alcançável
  pelo editor de verdade: o PATCH da página devolve `historico-cheio` para a
  linha longa, pela mesma máscara (passo 16 da prova).
- 🔴 **PR10-05 — com o histórico cheio a peça é composta com o contrato COMO A
  PÁGINA O MOSTRA, nunca pelo caminho sem contrato.** O caminho sem contrato
  perdia o que só o contrato carrega; o caso medido: a regra legada de
  `dividirManchete` punha "na brasa" na voz 2 de uma manchete que nasceu inteira
  na voz 1, e a de três linhas com duas declaradas na voz 2 voltava com uma.
  `contratoLidoParaRecompor` (`spec-da-recomposicao.ts`) aplica ao contrato
  gravado a MESMA leitura da copy efetiva (`blocosLidosDasCamadas`, a primeira
  metade de `copyEfetivaDasCamadas`, extraída sem mudar comportamento) — só a
  revisão que registraria a mudança fica de fora, porque não cabe.
- 🔴 **Esse contrato vale só para COMPOR.** Nunca é gravado como contrato da
  copy — nem na página, nem no `copyAutoral` da arte, que segue `efetiva:
  null` —: os blocos dele mudaram sem revisão, e contrato com mudança sem autor
  é o que o histórico existe para impedir. A SPEC gravada na arte o leva, porque
  ela é o registro do que foi composto; tirá-lo a deixaria inválida (o grupo de
  leitura entre um comum e um extra só existe com contrato) e a arte nunca mais
  recomporia.
- **A classe inteira, item por item** — o que o caminho sem contrato fazia com
  cada decisão autoral, medido com a preparação real sobre as camadas que ela
  mesma grava. **6 de 16 se perdiam; um mecanismo só cobre as seis**, e o
  contrato lido reproduz a página nos 16:

  | Decisão do contrato | Caminho sem contrato | Contrato lido |
  |---|---|---|
  | validade do conteúdo | **perdida**: a recusa do histórico a mascarava → `SPEC_INVALIDA` | conferida; não cabendo, re-render |
  | `linhasNaVoz2` | **perdida**: regra legada (sem voz 2 ganha voz 2; duas linhas na voz 2 viram uma) | preservada |
  | grupo de leitura entre um comum e um extra | **perdida**: a spec sem contrato não o representa → `SPEC_INVALIDA` | preservada |
  | ordem autoral das linhas de um bloco repartido | **perdida** na spec (ordem visual); o desenho só se salvava pelo casamento tipado horário/endereço | preservada |
  | marcas `bloco`/`linhas` nas camadas comuns | **perdidas** (a leitura seguinte volta a inferir) | preservadas |
  | declaração do prefixo (a seta do CTA) | **perdida**: a seta vira texto do autor | preservada |
  | caixa exata da string | preservada | preservada |
  | `[colchetes]` desenhados | preservados (os não desenhados já saíram da efetiva) | preservados |
  | respiros (linhas vazias) | preservados (R03) | preservados |
  | bloco vazio como afirmação | igual: omitido da composição nos dois | igual |
  | ordem entre blocos | preservada | preservada |
  | função | preservada | preservada |
  | herança e grupo visual dos extras | preservados (identidade da camada) | preservados |
  | grupo de leitura entre comuns | não é insumo da composição | idem |
  | fatos | não é insumo da composição; o contrato não é reescrito | idem |
  | identidade e texto dos extras | preservados | preservados |

- **Página que o contrato lido NÃO representa não é recomposta com decisão
  inventada**: texto que nenhum bloco originou — o estado LEGADO do extra com
  função, sem a marca `bloco`, que a leitura criaria como `extra-…` e viraria
  serviço comum, sem a herança — e spec que não passa em `validarSpec`. Com
  extra, re-render como está; sem extra, o caminho sem contrato. A atribuição
  pela ORDEM de leitura (`vincularExtras`, passo 4) não precisa de guarda
  própria: ela só alcança bloco livre SEM herança, que `validarSpec` recusa
  quando tem texto.
- ⚠️ **Mudanças de comportamento declaradas**: (1) a peça SEM extra com o
  histórico cheio passa a compor pelo contrato lido (antes: caminho sem
  contrato, com a voz 2 legada); (2) o extra com função em página LEGADA (sem
  `bloco`) com o histórico cheio passa a ser re-renderizado (antes: recomposto
  pela identidade da camada).
- ⚠️ **Residuais**: página SEM contrato nenhum continua no caminho sem contrato
  (é o único que ela tem, e ali a voz 2 legada vale — C10-02); histórico cheio +
  conteúdo inválido SEM extra cai em `SPEC_INVALIDA`, como o item documentado
  acima.
- Provas: `ciclo-extras-revisao.test.ts` (PR10-04 pelo runner nas duas formas
  de extra; PR10-05 pelo consumidor real, manchete sem voz 2 e com duas linhas
  declaradas, nas duas formas e sem extra, comparando o texto POR VOZ) e o
  passo 16 da prova de integração. Mutações: sem a conferência de
  `validarSpec` → 2 testes caem; sem o contrato lido → 7; sem a guarda do texto
  que nenhum bloco originou → 1; com o `recompor.ts` de 1d18e983 → os 8 novos.
