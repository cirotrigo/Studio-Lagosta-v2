# Melhoria de artes

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### A melhoria de artes na carteira inteira (02/09/2026)

Plano em `docs/PLANO-2026-09-01-MELHORIA-DE-ARTES.md` (F0–F6), executado em
02/09 depois do teste real de 01/09 no Quintal. Regras que valem para código
novo:

- 🔴 **A régua protege o que EXISTE; o buraco é o que o prompt sugere e a copy
  não tem.** O happy hour do Quintal voltou com "Rua Fernandes Tourinho, 133 ·
  Savassi, Belo Horizonte" e `textCheck: passed` (01/09). `passed` confere o que
  falta; `blocosAMais` (`text-comparison.ts`, puro) confere o que sobra, e
  separa bloco com DADO (endereço, hora, preço, cidade — `pareceDado`) de
  decoração. **Só avisa** (`textoAMaisAlerta`, decisão do Ciro) — a galeria e o
  `ver-geracao` mostram, o runner nunca regera por isso.
- **Régua sem bloco de serviço vira PROIBIÇÃO de criar rodapé** (regra 1 de
  `regras-da-melhoria.ts`), toda régua ganha CONTAGEM DE BLOCOS ("exatamente N,
  nem um a mais"), e os fatos oficiais da base (endereço, horário —
  `loadFatosDoCliente`) entram SÓ quando a régua tem serviço, como conferência.
  Sem serviço eles seriam justamente o dado que o modelo usaria para preencher.
- **`blocosDeServico` reconhece a linha dos modelos do Studio**: "Quinta, das
  11h às 00h · Praia do Canto, Vitória-ES" sobrava 31 chars e não era serviço.
  Dia no COMEÇO da linha é descontado; localidade (bairro/cidade/UF) junto de um
  horário é serviço.
- **`fieldValues.regua`** (`banco | linhagem | visao | nenhuma`) é gravado por
  extenso — `textCheckReason` mentia por omissão. E os `textos` propagam também
  pelo ramo de falha de cobrança, que os apagava.
- 🔴 **"quinta" está dentro de "Quintal".** `casaComDia` casava por substring e
  TODO template de "O Quintal Parrilla — …" era de quinta: foi assim que
  `escolher-modelo("funcionamento")` devolveu "Celebrações Especiais" pelo
  fallback só-dia. Hoje casa por TOKEN (`dia-semana.ts`), tema sem match é
  `NO_TEMPLATE_MATCH` com sugestão explícita (nunca o primeiro da lista), e
  `casaTemaComTags` exige ≥ 4 letras e início de token. Modelo errado com copy
  certa é pior que cair na IA.
- **A arte de MODELO passou a parecer a de IA** (`src/lib/creatives/halo/`):
  `renderShape` desenha `effects.blur` num offscreen com stack blur nos pixels
  da PRÓPRIA forma (folga 3× o raio); o `ShapeNode` do editor usa
  `Konva.Filters.Blur` + cache com offset; `aplicar-halo.ts` agrupa os textos
  em blocos, mede a luz da foto COMO ELA APARECE (cover, sem
  `extract().stats()`), calibra pelo alvo da cor (tinta ZERO em foto escura) e
  troca as camadas `veu*` por halos entre a foto e o texto. `createArteRapida`
  faz isso na família `lote-tema-2026-08` (ou página com véu), best-effort.
  ⚠️ O stack blur do Konva alcança ~R px; o `blur(R)` do canvas é gaussiano e
  desmancha mais longe — se a peça sair "dura", o lugar é o `blurRadius` em
  `montarCamadaDeHalo`, não o `_halo.py`.
- **Layout pela foto** (`layout-pela-foto.ts`, puro): nos templates "(3
  layouts)" o irmão é escolhido pela energia e luz das faixas (calma em cima →
  Topo; embaixo → Rodapé; < 12% → Dividido), salvo `layoutFixo`. Medido em
  02/09: funcionamento e happy hour foram ao rodapé, o executivo ao topo.
- **A grade da base manda no horário** (`grade-da-base.ts`, puro, desconfiado
  de propósito: só linha que DECLARA slot; linha de funcionamento e de feed
  ficam fora). `sugerirPosts` substitui a cadência nos dias que a grade cobre
  (`origem: 'grade'`, safra `grade-v1`). Quinta do Quintal: 08h/09h/14h.
- **Apagar rascunho devolve a foto ao rodízio**: `desfazerUsoDeFotoDoPost`
  roda ANTES do delete nos TRÊS caminhos, subindo a linhagem — o post aponta
  para a MELHORIA e o `PhotoUsage` está na original. **Explorar não é decidir**:
  `buscar-fotos` tem `explorando`, e sinal de foto expira em 24h.
- **As duas portas têm a MESMA melhoria**: `applyToItemDePlanoId`/`applyToPlanoId`/
  `applyToSlideOrdem` atravessam modal → fila local → rota → serviço → runner,
  que reaponta o item (ou slide) por `transicionarItem` ao terminar. A prévia da
  bancada tem "Melhorar com IA" só em card vindo do plano. No MCP,
  `melhorar-arte` aceita `itemId` (OU `postId`) e `editar-item-do-plano` aceita
  `generationId` ("usa esta arte"). A bancada ainda troca a via de `template`
  para `ia` ao apertar Gerar — registrado, não mudado.
- **A régua por construção do canvas é o `entrega.json`** (`design-canvas/
  _entrega.py`): `[{arquivo, textos[], quando?, tema?, itemId?}]`, com
  `textos: []` como AFIRMAÇÃO de foto pura. Os 5 geradores das levas com halo
  o escrevem; `upload-creative` lê por `entregaPath` e sobe cada render COM a
  sua copy numa chamada, com destino opcional na bancada (`planoId`). Skill
  `agendar-artes` atualizada.
- **O prompt da GERAÇÃO e o da melhoria falam em HALO, não em véu** (Ciro,
  02/09/2026: "a geração precisa usar o halo no lugar do véu"). Regras 4/4b/4c
  do `image-prompt-builder` e a regra do halo nas regras da casa da melhoria
  (era a 3, virou a **4** na renumeração de 04/09): mancha escura
  DESFOCADA só atrás do bloco de texto, sem borda;
  ⚠️ **o teto de "~1/3 do quadro" continua só na GERAÇÃO** — saiu do prompt da
  melhoria em 04/09, porque numa peça cujo texto ocupa ~80% da altura ele é
  impossível de cumprir e o modelo resolvia escurecendo tudo (ver a seção
  "A melhoria PRESCREVIA layout"). Não o reintroduza ali sem reler aquilo;
  proibido gradiente de faixa de borda a borda, tarja, topo ou rodapé inteiros
  escurecidos. O LOOK SPINE do carrossel repete "halo de leitura".
  🔴 **A regra geral não segurou o rodapé**: medido em produção na Wine Vix
  (02/09), a manchete pousou num halo local e o gpt-image ainda escureceu o
  quinto inferior INTEIRO, de borda a borda, para as duas linhas de serviço —
  "rodapé" puxa para faixa tanto quanto para a borda. O halo do serviço é dito
  DENTRO de `[SERVIÇO — LUGAR FIXO NO RODAPÉ]` (`blocos-de-servico.ts`):
  instrução colada ao bloco vence a regra geral, lição de 17/08.
- 🔴 **A caixa da arte de origem manda no prompt da melhoria** (Bacana,
  02/09/2026: "as letras devem ser em caixa alta"). `aplicarCaixaDaOrigem`
  transcreve a origem e põe cada bloco em [TEXTO EXATO] na caixa em que a
  arte já o mostra, decidido pela MAIORIA das letras (a visão transcreve o
  wordmark da logo em minúsculo e derrubava a unanimidade); no primeiro bloco
  o mapa `CAIXA_DA_MANCHETE` vence (Bacana = `alta`). A régua da conferência
  segue a copy como veio.
- 🔴 **Texto a mais desconta o que JÁ ESTAVA na origem**: o print de cardápio
  dentro do mockup (Lagosta Criativa) disparava o alerta em toda rodada. Quando
  sobra texto a mais, a origem é transcrita e o que está nela sai do alarme.
- 🔴 **A logo na melhoria segue o `compor` da geração** (`logo-na-melhoria.ts`):
  com o arquivo oficial como referência o gpt-image ainda redesenhou o selo da
  Wine Vix com letras aproximadas, e casar o selo desenhado por correlação de
  bordas NÃO achou (0,12 no lugar certo — polaridade e proporções mudam). Para
  projeto em `compor` (TERO, Lagosta, Wine Vix) o prompt reserva o canto, a
  logo não vai como referência e o PNG oficial é colado por `comporLogo` no
  canto mais calmo com contraste. Sem logo escolhida, a oficial do projeto
  entra por padrão (`loadImprovementAssets`).
- **Medir antes de mexer no prompt**: `scripts/medir-melhoria.ts` (KPI
  semanal, também no relatório de domingo), `medir-melhoria-da-carteira.ts`
  (1 story + 1 feed por cliente, n rodadas, folha de contato) e
  `spike-melhoria-com-mascara.ts` (F5: máscara do `images.edit` a partir das
  caixas de texto da página; a medida é a diferença de pixels FORA da máscara,
  que tem de ser zero). Dry-run por padrão nos três.
- **Modelos do Quintal saneados em 02/09**: página legada `Pag.01` despromovida,
  "17h" de fábrica → 16h, e o lote regenerado com halo + tema `funcionamento`
  (`sanear-modelos-quintal.ts`, `criar-templates-por-tema.ts --projeto 2`). Não
  há modelo de ALMOÇO EXECUTIVO no pool — o teste caiu no de parrilla; cadastrar
  é curadoria, não código.

### 🔴 A melhoria PRESCREVIA layout, e desmontava a peça (04/09/2026)

Relatado pelo Ciro: a Roberta pedia melhoria e a IA não obedecia. Testado por
ela na Wine Vix, e a causa não era o modelo ignorar o pedido — era o **sistema
dando uma contra-ordem**, mais enfática e mais acima no prompt que o pedido
dela. `regras-da-melhoria.ts` inverteu: **preserva, não prescreve.**

- 🔴 **A arte era uma AGENDA e a regra mandava desmontá-la.** 13 blocos, 6
  deles "Funcionamento - 10h às 22h" / "Happy Hour - 16h às 19h", um par por
  dia. `blocosDeServico` classificou os 6 como serviço — corretamente — e a
  regra 1 então mandava "MOVA para o rodapé: isto é uma correção, não uma
  opção" e "ele sai da sequência de cima". Mas os dias existem só para rotular
  aqueles horários, e `[TEXTO EXATO]` manda reproduzir os 13 na ordem: duas
  ordens incompatíveis. O gpt-image cumpriu **as duas** — manteve a lista por
  dia E criou o rodapé, que saiu sendo a programação inteira REPETIDA. Nas duas
  rodadas de produção; uma delas com o pedido "Não inclua textos extras".
  A regra fora calibrada (17/08, 01/09) para UMA linha de horário perdida perto
  da manchete. **Não crie a guarda "e se a peça inteira for uma agenda?"** — a
  variação é grande demais (peça com serviço e sem, comunicado que foge do DNA,
  peça de um título só), e qualquer regra que decida layout sozinha erra em
  alguma delas. Decisão do Ciro: **sem pedido o modelo só REDIAGRAMA — posiciona
  melhor o texto em relação à imagem e não muda mais nada; com pedido, manda o
  pedido.**
- 🔴 **O ícone era autorizado por padrão, e ela desligava na mão.** O único
  ponto do prompt que o permitia era a regra de serviço ("um ícone pequeno pode
  separar horário de endereço"). Medido nos 74 pedidos da Roberta entre 01/08 e
  04/09: **36 (49%) eram, também, uma proibição** — "não inclua ícones" 34
  vezes, "não mude as fontes" 11, "não mude o tamanho" 5, "não mude as cores" 4,
  "não mude o alinhamento" 3. Pedido que é majoritariamente proibição é o sinal
  de que o padrão está errado, não o usuário.
- 🔴 **Falar em rodapé de serviço ABRE o slot do endereço inventado.** Com
  `temEndereco(régua)` falso, `fatosDoClienteNaMelhoria` corretamente NÃO injeta
  o endereço real — e o modelo preenche o slot que o prompt sugeriu com um
  plausível: "Dom. Pedro II, 716 | Higienópolis, São José do Rio Preto - SP",
  num cliente de Vitória (o mesmo mecanismo do Quintal em 01/09). Não dizendo
  nada sobre rodapé, o slot não existe. `textoAMaisAlerta` pegou; a conferência
  de texto deu `passed`, porque ela só confere o que FALTA.
- **`instrucaoDeEstrutura` substituiu `instrucaoDeServicoNaMelhoria`**, que
  segue exportada e testada como caminho de volta (precedente do spine estrito
  do modo livre). Saíram também "DESTAQUE AS PALAVRAS-CHAVE" (obrigava mexer em
  cor e peso — o Ciro pediu destaque 3× em 01/09 e a Roberta proibiu 15×; dois
  donos pedindo o oposto na mesma regra fixa é o sinal de que a decisão não é do
  sistema) e "TEXTO EM BLOCOS", absorvida na forma preservadora. **Ficou o que é
  preservação**: foto intocável sem pedido, não inventar dado, contagem de
  blocos, arte sem texto, halo em vez de véu, margem.
- **O `[PEDIDO DO CLIENTE]` passou a vencer as REGRAS DA CASA nominalmente.** A
  formulação antiga listava "palavras, família tipográfica, paleta e logo" como
  limite intransponível — quem pedisse "destaque o dia em dourado" pedia algo
  declarado proibido. Os dois limites que ficaram são MECÂNICOS: as palavras
  (conferidas por visão depois — mudar uma REPROVA a arte, foi o que derrubou 3
  tentativas de "altere o horário 11h30 para 11h" no Bacana em 02/09) e a logo
  (composta por código).
- 🔴 **TIRAR A LICENÇA DAS REGRAS DA CASA NÃO BASTA: ELA TAMBÉM VIVE NO DNA DE
  CADA CLIENTE.** Varredura dos 11 projetos (05/09/2026, 21 inconsistências
  confirmadas por verificação adversarial): `BrandDNA.composition` e
  `visualStyle` descrevem LAYOUT, e essa prosa é injetada inteira em
  [IDENTIDADE DA MARCA] a ~22-35% do prompt — contra a regra 1, a ~72-79%.
  Verbatim do banco: "Endereço e horário, quando entram na arte, vão SEMPRE no
  rodapé" e "separe o TÍTULO na parte superior" (Real Gelateria); "O rodapé pode
  apresentar informações de funcionamento com ícones de relógio" e "linha fina
  com losango central" (Real); "ícone de relógio antes do horário e alfinete de
  mapa antes do endereço" (Espeto, By Rock, Empório Fonseca); ornamento e selo
  em quase todos. **A premissa "o único ponto do prompt que autorizava ícone era
  a regra de serviço" era FALSA para 4 dos 11 clientes** — inclusive para aquele
  onde o defeito foi medido.
  🔴 Pior: a regra ANTIGA tinha a arbitragem ("Onde a identidade da marca fala em
  'endereço no rodapé', isso vale para peças que TÊM endereço na copy — esta não
  tem") e a reescrita a removeu JUNTO com a autorização. A regra 1 ganhou a
  cláusula de volta, agora geral e nominal: vence as descrições de LUGAR e de
  ORNAMENTO da identidade, e **não** a paleta nem a tipografia — que é o que faz
  a peça continuar sendo daquela marca. Regra nova que contradiga seção anterior
  do prompt PRECISA se declarar vencedora, como as regras 6 e 7 já fazem.
- ⚠️ **EM ABERTO, e é risco de publicação**: `[FATOS DO CLIENTE]` pode injetar
  endereço que o DNA do próprio cliente PROÍBE na arte. Na Real Gelateria o
  `contentRules` diz "Nunca o endereço completo na arte: só o NOME da unidade e o
  horário, nunca a rua e o número" e "a fábrica de Piúma nunca aparece em
  comunicação" — e os fatos entram com a rua, o número e o endereço da fábrica.
  O portão é `temEndereco(expectedTexts)`, que dá falso positivo porque
  `LOCALIDADE` casa "praia" no NOME da unidade ("Real Praia do Canto"). Não
  consertado nesta leva: exige decidir entre estreitar `temEndereco` e filtrar os
  fatos pelas proibições do DNA.
- 🔴 **A LICENÇA DO PEDIDO PRECISA SER ESTREITA — e errar isso é pior que não
  ter cláusula.** A 1ª redação abria com "as regras 1 a 4 acima descrevem o que
  fazer quando ninguém pede nada", e o modelo lia: há um pedido, logo elas não
  valem — inclusive o "não repita nenhum bloco". Medido com o pedido REAL da
  Roberta, que só PROÍBE ("não inclua ícones. Não inclua textos extras") e não
  pede mudança nenhuma: numa leva de 2 rodadas o rodapé duplicado voltou nas
  DUAS (8 e 7 blocos repetidos) — **pior que o prompt antigo na mesma leva**.
  Com a cláusula estreitada ("NAQUILO QUE ELE PEDIR" + "pedido que apenas
  PROÍBE não revoga nada, acrescenta uma restrição"), 4 rodadas seguidas sem
  duplicação. **Metade do que a equipe escreve é proibição** — 34 dos 74
  pedidos —, então este é o formato que mais importa acertar.
- **Medido** com `scripts/medir-regras-da-melhoria.ts` (A/B do prompt antes ×
  depois na MESMA arte; dry-run por padrão, não escreve no banco, não cobra
  crédito, ~US$ 0,008/rodada em `low`). Na agenda da Wine Vix, contando as
  rodadas em que o rodapé duplicado apareceu:

  | | rodadas com duplicação |
  |---|---|
  | antes · pedido vazio | **4 de 4** (2, 2, 3, 3 blocos repetidos) |
  | depois · pedido vazio | **0 de 4** |
  | antes · pedido da Roberta | **5 de 6** (2, 3, 3, 5, 7 — uma rodada limpa) |
  | depois · pedido da Roberta, cláusula larga | 2 de 6 (8 e 6 numa leva; 0 nas outras 4) |
  | depois · pedido da Roberta, cláusula estreita | **0 de 4** |

- 🔴 **A MÉTRICA DE DUPLICAÇÃO CONTA POR CONTINÊNCIA, NUNCA POR IGUALDADE.** A
  1ª versão de `duplicacao()` comparava as strings normalizadas com `Map.get` e
  só enxergava a repetição quando a visão transcrevia o rodapé duplicado com as
  MESMAS quebras da origem. O rodapé agrupado costuma ser lido como uma linha só
  ("SEXTA-FEIRA | Funcionamento - 10h às 22h"), que não casa com "Funcionamento
  - 10h às 22h" por igualdade mas o CONTÉM. Rodada sobre a peça defeituosa REAL,
  devolvia `repetidos: 0` — a métrica dizia "limpo" sobre o defeito que existe
  para medir. A re-medição das artes já geradas mudou os números **do braço
  ANTES** (uma rodada saltou de 0 para 5) e não mexeu em nenhuma do DEPOIS: o
  defeito da métrica escondia defeito do prompt antigo, não inventava melhora do
  novo. Contar os dois lados pelo mesmo critério é o que mantém a linha de base
  honesta.

  🔴 **n=2 não decide nada aqui**: a variância entre rodadas do MESMO prompt é
  enorme (a cláusula larga deu 0,0,0,0 numa leva e 8,6 na outra). Foi só com 4+
  rodadas por braço que o sinal apareceu. Quem for mexer neste prompt de novo
  precisa medir com pelo menos 4 — e com o pedido VAZIO **e** um pedido que só
  proíbe, porque eles se comportam diferente.
- 🔴 **O script de medição tem de terminar na peça COMO ELA É ENTREGUE.** A 1ª versão do
  script chamava `runImageEdit` cru e parava aí — mas nos projetos em `compor`
  (Wine Vix é um) a logo NÃO é desenhada pelo modelo: o prompt reserva o canto
  e `finalizarLogoDaMelhoria` cola o PNG oficial DEPOIS. As peças medidas saíam
  sem marca nenhuma e a régua acusava "faltou WINE VIX" nas quatro rodadas —
  ruído que esconderia uma falha de régua de verdade. Com a logo composta, as
  quatro fecham `régua OK`.
- ⚠️ **Pedido que manda MOVER continua duplicando.** A "passe o horário de cada
  dia para um rodapé agrupado" o modelo monta o rodapé pedido **e** mantém a
  lista (11 e 8 repetidos). A cláusula "MOVER É MOVER, NUNCA COPIAR" reduziu e
  não fechou. **Não resolva endurecendo mais o prompt** — foi assim que a
  rigidez nasceu. O pedido era adversarial de propósito e é ambíguo nesta peça
  (tirando os horários, os dias ficam sem nada embaixo).

- ⚠️ **O escurecimento da foto NÃO foi resolvido.** A luz média caiu 43% a 62%
  em relação à origem nas rodadas novas (contra 52% a 61% nas antigas) — melhora
  no caso de pedido vazio, mas varia e às vezes piora, com a regra 9 no prompt
  dizendo que a fotografia é INTOCÁVEL. A causa é outra: numa peça cujo texto
  ocupa ~80% da altura, "halo local de no máximo 1/3 do quadro" é impossível de
  cumprir. A regra 4 ganhou a saída por escrito ("escolha a região mais calma e
  mantenha o resto com o brilho original"), que ajuda e não fecha.
- ⚠️ **Também em aberto**: pedido que manda MUDAR um dado ("altere o horário
  11h30 para 11h", 7 dos 74) é impossível por construção — `[TEXTO EXATO]` é a
  última seção e vence o pedido, e a conferência reprova a arte por ela ter
  feito o que foi pedido. Gastou 3 tentativas seguidas no Bacana em 02/09.

### A logo composta cai sobre a copy; o portão dos fatos abria sozinho (05/09/2026)

Testando duas melhorias da Wine Vix, o Ciro viu a logo colada **em cima de
"Happy Hour - 16h às 19h"**, cobrindo a palavra "Happy". Diagnóstico dele: "você
pode colocar a logo onde existe texto e não tem como você encaixar ela
economicamente na arte".

- 🔴 **`compor` serve à GERAÇÃO e não serve à MELHORIA.** Na geração o prompt
  reserva o canto ANTES de a diagramação existir, e o modelo compõe em volta do
  vazio. Na melhoria a arte já está diagramada — e desde 04/09 as regras da casa
  mandam PRESERVAR essa diagramação, então não há canto a reservar.
  `comporLogo` escolhe por calma (desvio-padrão) e contraste, medidas que **não
  distinguem área escura vazia de área escura com uma linha de texto**. Ele não
  tem como saber onde a copy está. `MELHORIA_NAO_COMPOE` (`logo-na-melhoria.ts`)
  tira a Wine Vix do `compor` **só na melhoria**; a geração continua compondo.
- ⚠️ **O preço foi aceito conscientemente**: em 02/09 a melhoria da Wine Vix
  redesenhou as letras do selo ("W|NE", "V|X") com o arquivo oficial como
  referência. Trocamos um defeito CERTO (logo sobre a copy, que estraga a peça
  em silêncio) por um PROVÁVEL (letra aproximada, que quem aprova enxerga).
- 🔴 **`conferirLogo` NÃO É CHAMADA EM LUGAR NENHUM** — nem na geração, nem na
  melhoria. A QA que compara por visão a marca desenhada com o arquivo oficial
  existe em `creative-qa.ts` e está órfã. Ligá-la é o conserto de verdade deste
  trade-off, e é o que permitiria devolver mais clientes ao `modelo`.
- 🔴 **A seção `[FATOS DO CLIENTE]` FOI REMOVIDA da melhoria (05/09/2026).** Ela
  injetava endereço e horário oficiais da base "só para conferir" um endereço
  que a copy já tivesse — e o que produziu foi dado DESENHADO: "Rua Fernandes
  Tourinho, 133 · Savassi" numa peça de Vitória (Quintal, 01/09) e "Dom. Pedro
  II, 716 | Higienópolis, São José do Rio Preto - SP" (Wine Vix, 04/09). Dado
  disponível no prompt vira dado na arte; o portão só decidia a frequência.
  E o portão abria sozinho: `temEndereco` aceitava localidade, e "praia" casa em
  "Real Praia do Canto, loja principal", que é NOME de unidade — na Real
  Gelateria isso levava ao prompt a rua, o número e o endereço da fábrica, os
  três proibidos na arte pelo `contentRules` do próprio cliente.
  🔴 **O conserto NÃO é filtrar os fatos pelas proibições do DNA** (decisão do
  Ciro): **as proibições do DNA valem na criação da COPY**. Ali são aplicadas, e
  depois a copy passa pelo olho de quem pede a melhoria. Quando a arte chega à
  melhoria, o que ela mostra já foi decidido e revisado duas vezes — não há o
  que conferir nem por que acrescentar. `[TEXTO EXATO]` é a verdade da peça e a
  regra 1 já proíbe criar bloco. `temEndereco` e `loadFatosDoCliente` foram
  removidas por falta de consumidor, e sobra uma consulta a menos à base por
  melhoria.
  ⚠️ **Resíduo conhecido**: o `[IDENTIDADE DA MARCA]` ainda cita dados dentro
  das próprias proibições — "a fábrica de Piúma nunca aparece em comunicação"
  põe o endereço da fábrica no prompt para proibi-lo. Medido em 05/09 no prompt
  real da Real Gelateria. Risco baixo (a frase diz "nunca"), e **não se resolve
  tirando `contentRules` da melhoria**: ele também carrega regra de ARTE que ela
  usa ("o texto NUNCA cobre o produto da foto", "gradiente leve, nunca a ponto
  de escurecer a fotografia"). Resolver exigiria separar, no DNA, proibição de
  COPY de proibição de ARTE.

- 🔴 **"Não modifique a foto" não é alcançável por prompt** — e a resposta já
  existe no código. `images.edit` regenera o quadro inteiro: a fotografia é
  redesenhada mesmo com a regra 7 dizendo que é intocável (medido: luz média
  caindo 43% a 65%). O mecanismo certo é a MÁSCARA, que `runImageEdit` já
  aceita: a área transparente é a única que o modelo pode redesenhar, o resto
  sai pixel por pixel. Spikeado em 01/09 (`scripts/spike-melhoria-com-mascara.ts`)
  e nunca promovido. ⚠️ O limite conhecido: a máscara do spike sai das caixas de
  texto de `Page.layers`, e **60 das 74 melhorias medidas não têm página**
  (arte de canvas ou upload) — para essas seria preciso derivar as faixas de
  texto por visão. É o caminho, não um ajuste de prompt.

### 🔴 A melhoria não acrescenta contraste: o halo saiu do prompt (05/09/2026)

Relatado pelo Ciro no almoço de feriado do Quintal (post `cmtoe5bb20001l804x5qdygl5`):
"o melhorar com IA está aplicando um contraste que em algum momento eu pedi,
mas está escurecendo muito a imagem e gostaria de retirar essa funcionalidade".
Medido na peça: luz média de 102,7 na origem para 83,1 na melhorada (-19%), com
o terço inferior inteiro escurecido, sem pedido nenhum.

- 🔴 **A licença era a regra 4 das REGRAS DA CASA ("HALO DE LEITURA, NÃO VÉU")**
  — nascida de um pedido do próprio Ciro em 02/09 ("a geração precisa usar o
  halo no lugar do véu"), portada da geração para a melhoria em 01/09 e
  reforçada em 04/09. Ela dizia "quando o texto precisar de contraste, use uma
  mancha escura desfocada". Na MELHORIA isso está errado por desenho: a peça já
  chega com a leitura resolvida (o halo da assinatura do compositor, o do
  canvas), aprovada por quem cuida da marca; qualquer licença de "contraste"
  aqui só produz escurecimento a mais. Na GERAÇÃO a regra do halo continua (lá a
  peça nasce do zero) — não misture as duas.
- **A regra 4 agora é "NENHUM CONTRASTE ACRESCENTADO"**: nem halo, nem véu, nem
  gradiente, nem sombra, nem escurecimento parcial ou total. O que a origem já
  tem atrás do texto fica EXATAMENTE como está (e acompanha o texto se ele
  mudar de lugar); texto ilegível se resolve só por POSIÇÃO (regra 3). A regra
  1 deixou de listar "o contraste de leitura" entre o que a melhoria melhora.
- 🔴 **A licença vivia em TRÊS lugares além da regra, e a regra os revoga PELO
  NOME** (lei da casa: instrução que não se declara vencedora perde para a mais
  enfática): o DNA do cliente — o `composition` do Quintal descreve "Gradiente
  de Leitura… opacidade máxima na borda entre 35% e 55%" e o `visualStyle`,
  "Dark warm como véu e fundo: 8 a 15%", prosa do tempo do véu que continua
  injetada inteira em [IDENTIDADE DA MARCA]; a direção de arte
  (`art-direction.ts`, `[COMPOSIÇÃO DOS TEXTOS]` autorizava "um degradê discreto
  atrás do texto" — a linha foi trocada, mas `Project.artImprovementPrompt` de
  projeto pode carregar a versão antiga); e a própria regra 1. O DNA NÃO foi
  editado: é documento da marca e a decisão de tirar o "gradiente de leitura"
  de lá é do Ciro.
- ⚠️ **O que o prompt NÃO resolve**: `images.edit` regenera o quadro inteiro e
  a luz média cai mesmo com a foto declarada intocável (regra 7). O mecanismo
  é a MÁSCARA (`scripts/spike-melhoria-com-mascara.ts`, nunca promovido) —
  não outra linha de prompt. Foi o que sobrou na medição abaixo: os 13-18%
  que ficam são a regeneração do quadro (a foto inteira sai um pouco mais
  escura e quente), não uma camada por cima.
- **Medido** com `scripts/medir-regras-da-melhoria.ts --so=depois --rodadas=4
  --tier=low --gen=<origem>` antes e depois da mudança, na MESMA arte de
  origem (luz 102,7), pedido vazio. ⚠️ Passe a geração de ORIGEM em `--gen`:
  o script melhora a arte que a geração passada tem como `resultUrl`, e com o
  id da melhoria a linha de base sai "melhorando a melhorada".

  | | luz média das 4 rodadas |
  |---|---|
  | prompt com halo autorizado | 84,1 / 74,6 / 77,6 / 76,6 (**-18% a -27%**, foto inteira escurecida em 4 de 4) |
  | prompt sem contraste | 88,6 / 84,7 / 85,7 / 89,0 (**-13% a -18%**, sem véu nem faixa em 4 de 4 — o texto pousa direto na foto) |

### 🔴 A régua por visão exigia a LOGO como texto (TERO, 03/09/2026)

A Roberta não conseguia melhorar nenhuma arte do TERO: as duas tentativas
falhavam por "texto divergente" com blocos que NÃO são copy — `"TRO"` e
`"BRASA E VINHO"`. Medido com o transcritor de produção nas artes de origem:
`transcreverTextosDaArte` lê a logo como texto (`TERO`, `BRASA E VINHO` e,
pela ligadura E+R, `TRO`), e a peça gerada nunca a traz — no projeto em
`compor` o prompt reserva o canto e o PNG oficial é colado DEPOIS da
conferência (`finalizarLogoDaMelhoria` vem depois de `verifyImageTexts`).
Defeito determinístico: 100% das melhorias de arte do canvas/upload do TERO
reprovavam, nas duas tentativas do job. A logo do Quintal fez o mesmo em 02/09
(`"PARRILLA BAR"`).

- **A régua por visão passa por `semTextosDaMarca`** (`text-comparison.ts`,
  puro): a logo oficial é transcrita à parte (uma chamada de visão a mais) e
  saem da régua o bloco contido num texto da logo, o bloco cujas palavras são
  todas da marca/genérico de casa, e a palavra curta a UMA edição de uma
  palavra da marca (a ligadura mal lida: `TRO`, `TLRO`, `TERRO`). A régua do
  BANCO e da LINHAGEM não passam por ali — copy aprovada não traz logo.
- **Copy que CITA a marca fica** ("SABORES TERO", "VEM PRO TERO"): tem palavra
  que não é da marca. E a distância de uma edição vale só para marca e logo,
  nunca para os genéricos — senão "MAR" cai por parecer "BAR".
- A transcrição COMPLETA da origem (com a logo) continua servindo à caixa
  (`aplicarCaixaDaOrigem`) e ao desconto do texto a mais; o que muda é só o
  que a conferência EXIGE. Os blocos descontados ficam em
  `fieldValues.textosDaMarcaDescontados`.
- Casos reais em `scripts/validar-regua-sem-marca.ts` (sem banco, sem API).

### A rodada de revisão do Espeto: a régua lia a origem por visão e reprovava peça certa (06/09/2026)

O Ciro revisou a semana 07–13/09 do Espeto pedindo ajustes com IA: 24
melhorias, 20 concluídas, **4 FAILED** — e as quatro eram defeito do sistema,
não da peça. Os pedidos reais da rodada ("use mais elementos da marca",
"destaque o valor", "deixe mais divertida", "tire da frente do rosto do
garçom") são o formato que vale medir.

- 🔴 **A peça do COMPOSITOR não tinha régua de banco.** `extractExpectedTexts`
  lia `slotValues`/`texts`/`textos`/`textosLivres`, e o compositor grava a
  copy em `layersSnapshot` — TODA melhoria da semana caía na régua por VISÃO,
  que transcreveu a origem como "PICAHNA,PICAHNA SUINA,LINGUICA" e "ESPACO
  GAUCHO" (o arco do selo). A arte nova saiu certa ("picanha", e a logo
  redesenhada) e a conferência reprovou três vezes (duas na mesma peça, o
  Ciro tentou de novo). Hoje `layersSnapshot` é a última forma lida
  (`textosDaPagina`, uma linha por bloco) — régua exata, `regua: 'banco'`,
  sem OCR. Replay offline das três falhas contra a transcrição gravada:
  **3 de 3 passam**.
- **A régua por visão tolera UM erro de grafia por palavra** (`casarComTolerancia`,
  Damerau/OSA ≤ 1, só palavra de 5+ letras — número, preço e hora exatos) e
  AVISA (`grafiaAlerta`), nunca reprova: o modelo corrige a grafia ao desenhar
  E ao ler, então "PICAHNA"→"PICANHA" é ruído de OCR de um dos lados. O traço
  (`-`) virou espaço na normalização, como `·` e `|`: "frango - a partir"
  colava em "FRANGO-A" e reprovava contra "FRANGO A".
- **Palavra longa a duas edições da marca é a marca** (`semTextosDaMarca`):
  "ESPACO" ~ "ESPETO". E o desconto do texto a mais compara palavra a palavra
  com a mesma tolerância — a placa da fachada voltava como "CHURRASCARIA & CIA"
  numa leitura e "CHURRASCO & CIA" na outra, e o alerta tocava em toda rodada.
- 🔴 **O filtro de segurança da OpenAI olha a FOTO, e para esta foto é
  DETERMINÍSTICO**: `safety_violations=[sexual]` num salão cheio com famílias
  e crianças (Sex 11/09, `cmtmfvn5v0081sw712x35e42v`), pedido "distribua
  melhor os textos". Sondado com `runImageEdit` cru: **4 de 4 recusas**, duas
  delas com prompt neutro ("reproduce this image exactly as it is") — não é o
  prompt, não é o planejador, não é sorteio. A recusa não custa a chamada; o
  runner retenta UMA vez (`filtroDeSeguranca.retentado`, ~20s) porque em outra
  foto pode ser ruído, e na segunda recusa a mensagem diz "tente com outra
  foto" em vez de um request ID. Para essa peça a melhoria por IA não existe:
  é editor ou outra foto.
- 🔴 **O ramo FAILED gravava só `error` e `textCheck`** — sem modo, régua,
  textos, planejador nem prompt; o diagnóstico teve de ser refeito à mão a
  partir da transcrição. `registroDaRun` vive fora do try e é preenchido
  conforme a run decide; o catch espalha as mesmas chaves do ramo feliz.
- **"Vem pro fogo" entrou no DNA do Espeto** como proibição (`virarRegra`,
  contentRules), pelo feedback do Ciro na peça de quarta: "Não use mais esse
  termo… Vou aprovar dessa vez mas não uso mais."
