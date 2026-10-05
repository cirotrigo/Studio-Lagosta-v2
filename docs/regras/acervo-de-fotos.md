# Acervo de fotos

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### Reconciliação diária do acervo (11/08/2026)

`/api/cron/reconciliar-catalogos` (05:00 UTC = 02:00 BRT) mantém o
`_image-catalog.json` de cada cliente igual ao que existe no Drive: tira a
entrada cuja foto foi apagada na curadoria (sugestão com miniatura quebrada — o
TERO acumulou 214) e cataloga a foto que o fotógrafo subiu (invisível para a
busca por tema até então). Serviço em
`src/lib/creatives/reconciliar-catalogo.ts`; o contrato puro (diff, teto,
relógio, rotação) em `src/lib/creatives/reconciliacao.ts`.

- **É um DIFF DE IDS, sem janela de `createdTime`.** Foi a janela de meses do
  `analyze-drive-images.ts` que deixou 501+56 fotos antigas fora do catálogo — e
  a foto nova encontrada no Bacana em 11/08 tinha 8 meses. Sem janela a operação
  é idempotente e o acervo atrasado converge em poucas rodadas.
- **Catálogo inexistente ou VAZIO pula o projeto.** Criar do zero é decisão
  manual: a primeira análise de um acervo inteiro são milhares de chamadas pagas
  de visão, e isso não pode ser disparado por um cron da madrugada. Catálogo
  vazio é o mesmo caso com outra roupa (a análise falhou inteira contra um
  modelo aposentado em 10/08).
- 🔴 **Poda grande demais é tratada como varredura quebrada, não como
  curadoria**: varredura vazia com catálogo cheio, ou mais de 50% das entradas
  órfãs, e a rodada não grava NADA. O catálogo no Drive é a única cópia e não há
  quem confira de madrugada — credencial, permissão ou pasta reapontada
  apagariam o acervo inteiro em silêncio.
- 🔴 **Varredura recursiva do Drive vai em LOTE de pais** (`'a' in parents or
  'b' in parents …`, `listChildrenOfFolders`). Medido no acervo real: uma
  consulta por pasta custa 324 chamadas e 78s no By Rock (1.015 fotos); em lotes
  de 20, 20 chamadas e 6,3s, resultado idêntico. Os 10 clientes inteiros levam
  ~64s — é o que faz a rodada caber numa invocação. **`listFiles` tem
  `pageSize: 50` FIXO**; quem lista acervo por lá sem paginar trunca em silêncio.
- **Foto que a visão RECUSA analisar entra no catálogo mesmo assim**, com a
  descrição que dá para fazer sem vê-la (a pasta) e `analiseBloqueada: true`.
  Aconteceu na primeira rodada real: a foto nova do Bacana estava em
  "Fotos - Clientes" e o Gemini devolveu `PROHIBITED_CONTENT`. Deixá-la fora
  faria o diff redescobri-la TODA madrugada — uma chamada paga por dia, para
  sempre, e um `erros: 1` permanente, que é como se ensina a equipe a ignorar o
  resumo do cron.
- **Orçamento de tempo: 240s dos 300s de `maxDuration`.** A rodada para de PEGAR
  trabalho aos 240s; a folga de 60s existe porque pode haver até 4 análises em
  voo e ainda falta gravar o catálogo — análise paga descartada é o pior
  desfecho. Quem ficou de fora sai no JSON e o cron do dia seguinte continua.
- **A ordem dos projetos ROTACIONA por dia.** Ordem fixa + relógio que corta faz
  o primeiro projeto ser reconciliado sempre e o último talvez nunca — starvation
  silenciosa, que é o defeito que este cron existe para resolver. É stateless
  (não há coluna de "última reconciliação" e a frente não abriu migration).
- **Teto de 120 fotos novas por projeto por rodada**, concorrência 4. Modelo em
  `GEMINI_VISION_MODEL ?? 'gemini-2.5-flash'` — `gemini-2.0-flash` foi
  APOSENTADO e devolve 404 embora siga aparecendo no ListModels.
- **`writeFileAsJson` cria o stream DENTRO do retry**: `withRetry` reexecuta a
  closure, e um `Readable` já consumido subiria vazio na segunda tentativa —
  catálogo zerado sem erro nenhum.
### A trilha `imagem` ganhou conferência, e o acervo ganhou rodízio (12/08/2026)

**A7 — fidelidade da cena.** A trilha `imagem` não tinha conferência nenhuma:
`textCheck` saía `skipped` com o motivo "peça não leva texto", o que é verdade
e responde a PERGUNTA ERRADA. O risco dela nunca foi texto — é o prato ter
mudado (aconteceu: numa cena de bar noturno o prato azul virou branco, sem
aviso). Ganhou peso quando a trilha passou a entregar o nativo, porque a cena
virou insumo de arte e o erro se propaga para a peça publicada.
`conferirFidelidadeDaCena` (`creative-qa.ts`) compara a cena com a foto
`subject`.

- 🔴 **O teto é deliberadamente ALTO, e o motivo é histórico.** A revisão visual
  por IA já foi ligada e DESLIGADA nesta casa (10/08/2026) por falso negativo
  repetido — "alarme falso ensina quem aprova a ignorar o aviso, que é pior do
  que não ter aviso". Por isso: pergunta estreita (cor, componentes,
  quantidade), prompt que LISTA o que não é divergência (enquadramento, ângulo,
  luz, fundo e arranjo mudam de propósito — a cena é nova), e **só
  `confianca: 'alta'` vira aviso**. Média e baixa passam calado.
- Avisa, nunca reprova; visão fora do ar devolve `pulada`. O aviso entra em
  `fieldValues.cenaAlerta` e aparece na galeria e na bancada, no mesmo lugar do
  alerta de texto.

**B5 — uso de foto.** `PhotoUsage` (tabela nova) passa a registrar que uma foto
do acervo foi usada. Antes, NENHUM caminho do Studio escrevia o `usageHistory`
do `_image-catalog.json` — o único `push` vivo é o do gerador CLI antigo —,
então `ultimoUso()` devolvia `'2000-01-01'` para toda foto, o `sort` de "menos
usadas primeiro" ordenava um campo CONSTANTE, e toda foto respondia
`ultimoUso: 'nunca'`. A regra do DNA de não repetir foto na semana nunca teve
como ser cumprida, nem para foto usada dentro do Studio.

- 🔴 **No BANCO, não no JSON do Drive**, por duas razões: o catálogo é arquivo
  único e duas gerações simultâneas fariam read-modify-write uma por cima da
  outra; e **regerar o catálogo zera `usageHistory`** (`reconciliar-catalogo.ts`
  cria entrada com `[]`), então o histórico morria a cada recatalogação.
- **O catálogo segue sendo lido como legado**: `mesclarUsos` funde as duas
  fontes e vence a data mais recente — jogar o legado fora faria foto realmente
  usada voltar ao topo do rodízio.
- **Escreve DEPOIS do sucesso** (`arte-ia` runner e `createArteRapida`): contar
  uso de foto cuja arte falhou mentiria sobre a preferência do cliente — mesma
  razão pela qual o rodízio de referência de estilo só marca uso quando a arte
  existe. E `registrarUsoDeFoto` **nunca lança**: telemetria de curadoria não
  derruba arte que já foi paga.
- **`marcar-foto-como-usada`** cobre o buraco central: peça montada FORA do
  Studio. Aceita `quando` (AAAA-MM-DD) para marcar publicação passada com a
  data real — sem isso o rodízio acharia que a foto acabou de sair.
- 🔴 **Quase não existe histórico para semear, e isso mede outra coisa.**
  `scripts/semear-uso-de-fotos.ts` reconstrói o uso passado, e o rendimento é
  de **42 usos a partir de 7.832 posts publicados**: 7.769 deles (99,2%) NÃO
  têm vínculo recuperável com foto do Drive. A causa é estrutural e já
  conhecida — a peça foi montada FORA do Studio e `/api/external/posts` aceita
  só `mediaUrls` e `caption`. É o mesmo número, por outro ângulo, da cobertura
  do corpus de aprendizado: **o sistema só sabe o que acontece dentro dele**.
  Semeado em 12/08 (28 no Espeto Gaúcho, 6 no projeto 7, 3+3+2 nos demais); as
  fotos semeadas foram para as posições 519–530 de 547 na busca do projeto 6.
- **`origem: 'historico'` é separada de propósito** — uso RECONSTRUÍDO, não
  observado. Dá para auditar e desfazer (`--desfazer`) sem tocar no que foi
  capturado ao vivo.
- **A fonte `backgroundImageUrl` foi RECUSADA**: ela guarda URL do Blob com o
  nome original do arquivo, e casá-lo com o catálogo por NOME é heurística —
  nome repete entre pastas, e marcação errada empurra para o fim da fila uma
  foto que nunca foi usada. Eram 2 linhas; não pagam o risco.

### A sugestão de fotos aprende: score, prata da casa e a semana como conjunto (30/08/2026)

O acervo deixou de ser ordenado só por "menos usada primeiro" (medido: 12% de
aceitação, 53% das trocas fora do top-10 — a foto ruim nunca escolhida morava
no topo para sempre). Plano completo e placar em
`docs/PLANO-2026-08-29-SUGESTAO-DE-FOTOS.md`. Regras que valem para código novo:

- **A ordem do acervo é o score de `ranquearAcervo`**
  (`src/lib/creatives/ranquear-acervo.ts`, PURO): destaque > escolha (correção
  > busca; no tema > global) > rejeição desce; o rodízio virou DESEMPATE, e
  entre nunca-avaliadas vale a semente diária (hash por `driveFileId+dia` —
  estável dentro do dia, porque a paginação por offset exige). Score ORDENA,
  nunca esconde. A safra é `acervo-v2` — mudou a heurística, suba a versão.
- 🔴 **Script/validação NUNCA chama `buscarNoAcervo`** — ela registra um
  `LearningSignal` por busca. Os insumos saem por `lerCatalogoDoProjeto` +
  `montarInsumosDeRanking` (exports de `acervo.ts` sem registro) +
  `filtrarAcervo`/`ranquearAcervo` puros. O backtest
  (`scripts/validar-ranking-do-acervo.ts`) existe assim.
- 🔴 **`QUALIDADE_ALTA = 0` é MEDIÇÃO, não esquecimento**: 93–99% de cada
  acervo está marcado 'alta' — era um muro sem informação que enterrava a foto
  certa (backtest 30/08). `BAIXA` −6 fica ('baixa' é raro e informativo). Não
  restaurar sem re-medir.
- **O que o backtest ensinou**: com qualquer sinal aprendido da foto, top-3 em
  91,7% (mediana 1,5); sem sinal, não há o que aprender — **corpus é a
  alavanca, não peso**. `ranquearAcervo(entrada, pesos?)` aceita pesos para
  calibração offline.
- **`PhotoDestaque` mora no BANCO** (corrida + regeração do catálogo, as duas
  razões do `PhotoUsage`); despromover é `revogadoEm`, NUNCA delete; a semente
  (`scripts/semear-destaques.ts`) jamais ressemeia revogado. Curadoria exige
  curador nas três portas (rota web espelha `/modelos`; MCP
  `marcar-foto-destaque` usa acesso `curador`; o picker mostra a estrela e
  trata o 403). Semeada em produção em 30/08: 105 destaques.
- **`catalogadaEm` só existe nas entradas NOVAS do catálogo** (reconciliação
  carimba; o diff não retoca as antigas — aqui isso é o comportamento certo:
  ausência = sem boost de novidade). Teto da reconciliação: 200 fotos
  novas/cliente/noite; quem corta primeiro numa leva gigante é o orçamento de
  240s, e o excedente rola.
- 🔴 **Fechamento fiel ao card**: `fecharSugestaoDeFoto` aceita `fotoDoCard`, e
  quando a foto usada é a que o card mostrou o desfecho é `aceita-como-veio`
  mesmo fora do topo — a descida na lista foi do SISTEMA (dedupe de
  pasta/arquivo), não da pessoa. Caminho novo que crie arte de item de plano
  precisa passar `fotoDoCard` (hoje: `executar-plano.ts` → `createArteRapida`).
- **`ItemDePlano.fotoCandidatas`** = `[{ driveFileId, fileName, vaga:
  'score'|'exploracao', sugestaoId }]`; a `[0]` é a escolhida; o `sugestaoId`
  é o do sinal da BUSCA (o do item é o do SLOT — não confundir). Uma das 3
  vagas é exploração quando existir — é a cota que impede a ossificação da
  prata da casa.
- **`marcar-foto-como-usada` aceita `geracaoId`**, e ele importa: a colheita
  da correção pós-produção junta `troca-de-arte.generationId` ×
  `PhotoUsage.generationId` — sem o id, a foto escolhida ao refazer via
  canvas/upload fica invisível para o aprendizado.
- **`tipoDaPasta` casa por PREFIXO DE TOKEN, nunca substring** ("05_sobremesas"
  não é ambiente por conter "mesa"). Na escolha da semana, pasta vence tipo, e
  tipo só desempata entre livres.
- **`propor-semana` não emite carrossel (slides) hoje** — a regra "slides
  irmãos da mesma pasta" está documentada no ponto certo
  (`proposta-de-semana.ts`) para quando emitir.
- **O motivo da troca** (`escura`/`prato-antigo`/`nao-e-o-assunto`/`repetida`/
  `outro`, `MOTIVOS_DE_TROCA_DE_FOTO`) é opcional e pós-fato: o desfecho posta
  na troca, o chip anota depois (`anotarMotivoDaTroca`, merge cirúrgico com
  compare-and-set). Motivo inválido é DESCARTADO em silêncio — a rota de
  desfecho é fire-and-forget e continua 200.
- **KPI vivo**: `scripts/medir-sugestao-de-fotos.ts` (largada do `acervo-v2`:
  12,2% aceitação, 53,5% trocas fora do top-10);
  `scripts/relatorio-lacunas-do-acervo.ts` é o insumo do brief de fotógrafo
  (lacunas reais em 30/08: ambiente/Espeto, Happy Hour/By Rock, Almoço
  Executivo/TERO).

### A busca de fotos enxerga a foto: laço fechado, lexical de verdade, embedding e catálogo v3 (07/09/2026)

Plano em `docs/PLANO-2026-09-07-BUSCA-DE-FOTOS.md`. Nasceu da pauta de
fotografia de 07/09 acusando "AS BUSCAS MORRERAM" para croissant, gelato e
crepe na Real Gelateria — um acervo com 113, 2.380 e 145 fotos deles.
Medição em `scripts/medir-busca-de-fotos.ts` (leitura; NUNCA chama
`buscarNoAcervo`, que registra sinal).

- 🔴 **`expirada` mede FECHAMENTO, não busca.** 81% das buscas da carteira
  expiravam (488 de 603 desde 08/08) enquanto `PhotoUsage` registrava 1.131
  usos: compositor, canvas e chat usavam a foto sem fechar a busca. A pauta
  lia isso como "nenhuma serviu" e o ranking transformava cada expiração em
  rejeição das 3 do topo (~1.460 rejeições fabricadas). Hoje
  `registrarUsoDeFoto` fecha a busca (ponto único por onde todo uso passa;
  `historico`/`usedAt` no passado não fecham), `expirada` é NEUTRA no
  contrato do sinal, `busca-morta` exige ≥ 2 `trocada`, e a busca VAZIA
  (`total: 0`) passa a ser registrada — é ela que diz "falta no acervo".
- **Tema de uma palavra acertava 98%; composto, 16%** (23 temas reais da
  Real). `casaComTema` era OR por substring (`"cheio"` casava `"recheio"`),
  ignorava a descrição e não sabia que sorvete é gelato. Hoje
  `gruposDoTema` (palavra + sinônimos de `sinonimos-do-acervo.ts` + pilar) com
  MAIORIA (0,6), `raiz()` por token, `calcularIdf(todas)` como raridade e
  `COMPLETUDE` (casar tudo vale um destaque). Composto foi a 66% só com
  texto. `palavrasDoTema`/`casaComTema` mantêm o OR sem dicionário — são a
  régua das medições de PILAR (pauta, curadoria, cobertura).
- 🔴 **IDF do acervo INTEIRO, nunca da lista filtrada** — por isso
  `buscarNoAcervo` calcula uma vez e passa a `filtrarAcervo` e a
  `ranquearAcervo`. E palavra em toda foto tem idf 0 mas CASOU: o piso de 0,1
  mantém o casamento contando.
- **Maioria que zera relaxa para OR**: "noite fachada noturna luzes" tem 3
  fotos de noite e nenhuma "luzes"; devolver vazio é pior que devolver as 3.
- **F2: Gemini Embedding 2 + pgvector no Neon** (decisão do Ciro, chave
  paga). `PhotoEmbedding` guarda DOIS vetores por foto (imagem e
  descrição+tags) no MESMO modelo, 1.536 dims via MRL, versão na linha. O
  tema vira vetor, as 60 mais parecidas entram no pelotão mesmo sem casar
  palavra, e a similaridade vai a `ranquearAcervo` como insumo pré-calculado
  (`similaridade`, peso 60) — o módulo continua puro. Medido: 4 embeddings
  em 1,2s, coseno texto↔imagem entre 0,30 e 0,45, por isso a similaridade é
  NORMALIZADA por posição (`normalizarPorRank`, imagem 0,9 + texto 0,1),
  nunca coseno cru. Nada disto derruba a busca: sem chave/vetor/tabela, a
  lista é a lexical. Safra `acervo-v3`.
- 🔴 **A régua lexical NÃO mede a via semântica** ("todas as palavras do
  tema estão no texto da foto" dá zero a uma foto de salão lotado para
  "salão cheio"). Quem julga é `scripts/julgar-busca-de-fotos.ts` (visão
  sobre o top-5, vereditos em cache). Calibrado assim (Real, catálogo v3
  estável, 07/09): a lexical acerta 40% dos temas reais e 12% dos visuais;
  o vetor de imagem 43%/32%; a fusão 46%/24%. RRF não ganhou nos reais e um
  gate "só quando a lexical é fraca" custou os visuais. 🔴 Calibrar com o
  catálogo MUDANDO (reenriquecimento em curso) deu um ponto diferente — meça
  com o catálogo parado. 5 dos 13 temas
  reais são impossíveis (0/5 em todo método) — a sopa de palavras do chat
  pede o que o acervo não tem.
- 🔴 **`files.list` do Drive NÃO devolve `md5Checksum` neste acervo** (245
  fotos listadas, zero com hash, com o `fields` pedindo), embora o
  `files.get` devolva. Era por isso que o backfill da reconciliação nunca
  preencheu nada e `md5` estava vazio em 100% das 12.694 entradas. O
  indexador guarda o hash do `get` em `PhotoEmbedding` e o cron o copia de
  lá (+ até 200 gets por rodada).
- **Catálogo v3** (`catalogo-de-fotos.ts`, puro): UM schema zod tolerante no
  lugar de três interfaces divergentes, o prompt de visão ÚNICO do cron e do
  script, vocabulário FECHADO de tags (pilares + pastas + canônicas; fora
  dele vai para `tagsLivres`) e os campos que só a foto respondia: `assunto`
  (um só), `elementos`, `enquadramento`, `momento`, `lotacao`, `pessoas`.
  `enriquecer-catalogo.ts --v3` reanalisa só o que não é v3; depois
  `indexar-embeddings-de-fotos.ts` reembeda SÓ o texto de quem mudou.
- **Indexação roda fora da Vercel** (Mac): `indexar-embeddings-de-fotos.ts`
  (dry-run por padrão, ≈ US$ 0,00012/imagem, downloads do Drive em paralelo
  dentro do lote — em série eram 45 fotos/min). O dia a dia é do cron
  `reconciliar-catalogos`, que indexa a foto NOVA no mesmo passo em que a
  cataloga.

### O acervo se lista por NÍVEL, em todas as subpastas (13/09/2026)

As duas listagens cruas do Drive — `list-drive-images` (servidor MCP local) e
`listar-fotos-da-pasta` (`listarImagensDoDrive`, que também é o fallback do
seletor da bancada para projeto sem catálogo) — passam por
`src/lib/creatives/varredura-de-pastas.ts`: módulo puro que desce por nível,
consulta os filhos de até 20 pastas de uma vez e grava o `folder` como caminho
relativo (`07_ambiente/salao`), no formato do catálogo.

- 🔴 **`list-drive-images` descia UM nível só.** No TERO devolvia 116 fotos — só
  as soltas numa pasta de primeiro nível — contra 1.467 do catálogo, e um agente
  disse ao usuário que a pasta configurada estava errada. Ela estava certa.
  **Listagem que devolve pouco não prova pasta errada**: compare com
  `buscar-fotos` antes de concluir.
- **O conector remoto descia, mas escondia o fundo e custava caro**: uma
  consulta por pasta, subpastas lidas por `listFiles` (`pageSize: 50` fixo, sem
  paginar) e teto de 4 níveis. Medido nos 11 projetos: 10 com o mesmo conjunto
  de fotos, o Seu Quinto perdendo 35 em duas pastas de 6º nível, e cada listagem
  caindo de 11–89s para 2,5–9s.
- **O limite agora é 10 níveis e 2.000 pastas, e `parcial: true` diz quando
  sobrou algo** — a consulta de subpastas roda também no último nível justamente
  para isso. Mais fundo que a catalogação (4) de propósito: a listagem mostra a
  foto que o catálogo ainda não alcança.
- **Atalho de imagem não entra mais na listagem remota**: `listFolderFiles` o
  trazia, `listChildrenOfFolders` filtra por `mimeType contains 'image/'`, como a
  reconciliação. Nos 11 projetos nenhuma foto sumiu (−0 em todos).
- **Foto solta na raiz tem `folder: ''`** e fica fora de `pastasDisponiveis`
  (o servidor local usava `'(root)'`).
- ⚠️ **O projeto 9 (Ciro Trigo) não tem pasta de imagens** e cai na pasta geral,
  que é a árvore da agência inteira: 28.614 fotos em 693 pastas, ~74s. Antes a
  listagem parava no teto de 250 pastas com 3.318.
