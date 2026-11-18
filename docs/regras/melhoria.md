# Melhoria de artes

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### A foto da melhoria é a da origem (11/11/2026)

Pedido do Ciro depois do teste em produção em três rascunhos do Bacana: em
`rediagramar` e `refinar` a carne saiu "plástica" e os croutons mudaram de
desenho, com `textCheck: passed`. O `images.edit` redesenha a imagem inteira
mesmo quando o pedido é só texto, e a máscara da API não garante pixel (medido
em 08/09/2026).

- 🔴 **Em `rediagramar` e `refinar` a foto não vem do gerador.** A peça gerada é
  recomposta por código (`preservar-foto.ts`): a arte de referência entra pixel
  por pixel em tudo o que não é bloco de texto. Bloco de texto = mudança forte,
  chapada, com cor de tinta (branco e as cores da marca) e densa. Com
  `instrucaoImagem` ou fundo novo a foto muda de propósito e nada disto roda.
- **A referência é a RAIZ da linhagem**, não a última melhoria
  (`arteDeReferenciaDaFoto`): refinar três vezes não acumula perda. A subida
  para no elo que mudou a foto de propósito.
- **A conferência de texto lê a peça RECOMPOSTA**, que é a que vai ao ar. Texto
  divergente nela pode ser letra comida pela máscara estrita: a mesma geração é
  recomposta no rigor folgado e conferida de novo antes de outra chamada paga.
- **A foto também reprova.** Máscara acima de `TETO_DA_MASCARA` (a IA mexeu em
  área demais) e, em `redesenhar`, assunto fora do lugar (`deslocamentoDaFoto`)
  descartam a tentativa como o texto divergente descarta: nova tentativa pela
  fila e, sem tentativa sobrando, `FAILED` com "foto alterada". O que foi
  medido fica em `fieldValues.foto*`.
- **A emenda não corta letra** (segunda rodada em produção, 11/11/2026): o
  bloco aceito cresce por onde houver tinta que mudou, mesmo pouco. Sem isso o
  ponto laranja do rodapé do Bacana saía manchado, com as duas versões
  misturadas na borda da máscara.
- **`rediagramar` confere a caixa** (`caixaTrocada`): a conferência de texto
  compara sem caixa, e "Quinta pede aquele" voltou "QUINTA PEDE AQUELE" com
  `passed`. Troca de caixa reprova como texto divergente. Troca de FONTE não é
  conferida: não há como ler fonte pelo texto.
- **A busca de deslocamento é por eixo** (12% de cada um): com o alcance preso
  à largura, a carne que desceu 8% do story ficava fora da busca e o redesenho
  saía como pronto.
- ⚠️ **Limites conhecidos.** A heurística foi calibrada em quatro peças do
  Bacana (texto claro sobre foto escura). Pedido de `refinar` que mexe em
  elemento gráfico sem cor de tinta (tirar um selo fora da paleta) volta à
  origem sem aviso: `fotoRecusada` registra a área. `redesenhar` não é
  recomposto, e texto sobre o assunto da foto ainda não é barrado (falta saber
  onde está o assunto). Para medir um par em disco:
  `npx tsx scripts/medir-preservacao-da-foto.ts <origem> <gerada>`.
- **17/11/2026:** a volta à origem "sem aviso" acabou (a melhoria agora
  termina dizendo que a mudança não entrou), e há um segundo gerador que não
  depende do filtro de tinta. Ver "Gerador selecionável e recomposição por
  zona", no fim deste arquivo.

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

### Gerador selecionável e recomposição por zona (17/11/2026)

Relatado pelo Ciro no By Rock (`cmwl4l8lr004vswmgokql3lju`, arte do
compositor): "trocar o tracejado por ondas sonoras estilizadas e rediagramar o
bloco de texto". Em `refinar` a melhoria devolveu a arte IDÊNTICA à origem,
marcada como pronta e cobrada; em `redesenhar` falhou com "a IA tirou o assunto
da foto do lugar". As duas coisas saem do mesmo fato: o gpt-image redesenha a
imagem inteira, e o que devolve a foto (`preservar-foto.ts`) só aceita bloco
chapado, com cor de tinta e caixa preenchida. Barra fina de onda sonora não é
nada disso e voltava à origem.

- **`MELHORIA_GERADOR=openai|gemini`** (`gerador-da-melhoria.ts`). O padrão é
  `openai`: sem a variável nada muda. `gemini` chama o Nano Banana 2.1
  (`gemini-nano-banana-2.1`, id conferido na listagem de modelos da API) por
  `gemini-image-client.ts`, com o MESMO prompt do diretor de arte e as mesmas
  imagens, na mesma ordem. `fieldValues.model` diz qual gerador fez a peça.
- **No caminho Gemini a recomposição é por zona** (`recompor-por-zona.ts`,
  puro), nos três modos: a peça gerada (2K, 1536x2752 no story) é alinhada ao
  tamanho da origem, o mapa de diferença vira zonas por limiar e componentes
  conexos, e fora das zonas entra a origem pixel por pixel. **Sem filtro de cor
  de tinta nem de preenchimento**: elemento gráfico novo é zona como texto é.
  Só funciona com gerador que mantém o resto da imagem; com o gpt-image a zona
  seria a arte inteira.
- 🔴 **O mapa de diferença compara com a FAIXA da vizinhança, não pixel a
  pixel.** A peça volta de 2K para 1080 amaciada e um ou dois pixels fora do
  lugar; comparando pixel a pixel (mesmo procurando o par a 2 px), toda borda
  de letra virava "mudança" e a logo inteira virava zona. Cada pixel é medido
  contra o mínimo e o máximo dos vizinhos (2 px) do outro lado: borrão e
  deslocamento caem dentro da faixa, barra nova fica fora.
- 🔴 **Sem casamento de tom no caminho Gemini.** O Nano Banana não escurece o
  quadro (viés medido de até 2,6 por canal; o gpt-image dá -9), e o LUT de
  histograma (`casarTomGlobal`), com um elemento vermelho novo na conta, mexia
  na foto mais do que o gerador (diferença 5,8 onde sem ele dá 0).
- 🔴 **A emenda não passa por cima de texto.** O gerador redesenha o bloco
  inteiro, e a linha que ficou quase igual cai dentro da tolerância: entre a
  zona do título e a do convite sobrava uma faixa estreita da origem, e na
  borda suave as duas versões da linha se misturavam ("DAS 16H ÀS 20H" com
  fantasma no By Rock). Um fechamento (dilata e erode, 2,5% da altura) une as
  zonas vizinhas; a foto entre zonas distantes continua sendo a da origem.
- **A logo é sempre a da origem.** Com a tolerância acima a logo que o gerador
  "quase copiou" nem vira zona. Quando vira (o gerador mexeu ali), o arquivo
  oficial é procurado em volta das zonas e a caixa dele volta à origem
  (`logoProtegida`, `logoCorrelacao`). O casamento só pela forma (canal alfa),
  aproveitado do branch `claude/redesenhar-foto-e-logo`, não serve para logo
  com desenho por dentro: a palheta vermelha do By Rock tem o alfa em mancha
  lisa e casou com a espuma do chope (0,71) melhor que com ela mesma. Logo com
  desenho interno casa pelo desenho, só nos pixels opacos (0,94 no lugar
  certo). Por isso, no caminho Gemini, projeto em `compor` NÃO reserva canto
  nem cola o PNG depois: daria duas logos.
- **As guardas continuam**: `deslocamentoDaFoto` (agora nos três modos do
  caminho Gemini, antes de recompor), `TETO_DA_MASCARA` sobre a área das zonas,
  a conferência de texto na peça recomposta e a de caixa em `rediagramar`. Com
  `instrucaoImagem` ou fundo novo nada disto roda, como antes.
- 🔴 **Resultado honesto, nos dois geradores** (`mudancaNaoEntrou`): se depois
  da recomposição a peça não difere VISIVELMENTE da origem, a tentativa é
  descartada e, sem outra, a melhoria termina `FAILED` com "a mudança pedida
  não entrou", `fieldValues.mudancaNaoEntrou`, e sem cobrança (o crédito só sai
  depois do sucesso). Quando o gerador devolveu a arte como estava, vale nova
  tentativa pela fila; quando a IA mudou e foi a recomposição do caminho OpenAI
  que devolveu tudo (o caso das ondas sonoras), não: repetir a geração repete o
  desfecho.
- 🔴 **"Visível" não é "zona".** Texto que o gerador redesenhou no mesmo lugar
  difere nas bordas das letras e vira zona (15% do quadro no Bacana), e a peça
  é a mesma para quem olha. A conferência (`areaVisivelmenteAlterada`,
  `fotoAreaVisivel`) refaz o mapa com a vizinhança em 6 px e reprova abaixo de
  0,5% do quadro. Medido em 13 peças: as duas que voltaram iguais deram 0,0% e
  0,4%; a menor mudança real (um filete fino), 3,9%.
- **Medir antes de virar o padrão**: `scripts/medir-geradores-da-melhoria.ts`
  roda os dois geradores na mesma arte, com o mesmo prompt, e grava por caso a
  área mexida, a diferença da foto fora das zonas, o desfecho, a conferência de
  texto, o tempo e os tokens, mais a folha de contato. Só lê o banco (o de
  DESENVOLVIMENTO: recusa o do `.env`), não sobe arquivo e não cobra crédito.
  `--reaproveitar` recalcula a partir das peças salvas, para calibrar limiar
  sem pagar outra geração.

**O que foi medido (17/11/2026).** Quatro artes do compositor, de quatro
clientes (By Rock, Espeto Gaúcho e Real Gelateria em story; Bacana em feed),
dois pedidos cada (um elemento gráfico novo; uma rediagramação), uma geração
por caso e por gerador, com o mesmo prompt do diretor de arte. A folha de
contato não fica no repositório (ele é público e ela mostra arte de cliente
que ainda não foi ao ar): o script a grava em `.tmp-medicao-geradores/`.

| caso | modo | gerador | desfecho | mexeu | foto bruta | foto final | mudança visível | texto | s | tokens (ent/saída) |
|---|---|---|---|---|---|---|---|---|---|---|
| byrock-elemento | refinar | openai (low) | não entrou: a recomposição devolveu 59% à origem (a mudança não é texto) | 97% | 7,2 | – | 0,0% | – | 17 | 4994/148 |
| byrock-elemento | refinar | gemini | pronta | 24% | 4 | 0 | 22,0% | ok | 37 | 3931/2959 |
| espeto-elemento | refinar | openai (low) | pronta | 4% | 6,1 | 1 | 3,6% | ok | 16 | 4400/148 |
| espeto-elemento | refinar | gemini | pronta | 8% | 5,9 | 0 | 3,9% | ok | 22 | 3829/2142 |
| real-elemento | refinar | openai (low) | pronta | 10% | 4,6 | 0 | 10,1% | ok | 16 | 4056/148 |
| real-elemento | refinar | gemini | pronta | 18% | 3,8 | 0 | 6,9% | ok | 18 | 3813/2239 |
| bacana-elemento | refinar | openai (low) | pronta | 83% | 5,6 | 0 | 1,7% | ok | 16 | 3787/181 |
| bacana-elemento | refinar | gemini | pronta | 19% | 9,3 | 0 | 4,0% | ok | 23 | 3783/2137 |
| byrock-rediagramacao | redesenhar | openai (medium) | reprovada: a IA tirou o assunto da foto do lugar (54 de 54 pedaços) | 98% | 6 | – | – | – | 29 | 6475/1331 |
| byrock-rediagramacao | redesenhar | gemini | pronta | 26% | 4,3 | 0 | 25,2% | ok | 41 | 5019/2813 |
| espeto-rediagramacao | redesenhar | openai (medium) | reprovada: a IA tirou o assunto da foto do lugar (5 de 6 pedaços) | 93% | 8,1 | – | – | – | 30 | 6017/1331 |
| espeto-rediagramacao | redesenhar | gemini | não entrou: o gerador devolveu a arte praticamente como estava | 5% | 5,8 | – | 0,0% | – | 37 | 5062/2719 |
| real-rediagramacao | rediagramar | openai (low) | pronta | 13% | 4,9 | 1,6 | 12,4% | ok | 16 | 5562/148 |
| real-rediagramacao | rediagramar | gemini | pronta | 22% | 3,7 | 0 | 12,6% | ok | 24 | 4927/2216 |
| bacana-rediagramacao | rediagramar | openai (low) | pronta | 100% | 9,6 | 0 | 4,8% | ok | 14 | 5358/181 |
| bacana-rediagramacao | rediagramar | gemini | não entrou: o gerador devolveu a arte praticamente como estava | 17% | 9,1 | – | 0,4% | – | 25 | 4965/2187 |

`mexeu` é a área das zonas na peça como o gerador devolveu (perto de 100% é a
imagem inteira redesenhada, e aí `foto bruta`, medida na sobra, não diz nada).
`foto final` é a diferença média (0 a 255) entre a peça final e a origem fora
das zonas. `openai` passou pela recomposição e pelas guardas do caminho de
produção dele.

- **Nano Banana: 6 prontas, 2 "não entrou", nenhuma reprovada.** Nas 6 a foto
  fora das zonas é a origem (0), o texto confere e, olhando os blocos de texto
  em tamanho real, não há emenda nem letra estragada. Os quatro elementos
  gráficos entraram. As duas que não entraram são pedidos de rediagramação: o
  gerador redesenhou o texto no mesmo lugar e a peça voltou igual.
- **Um desvio da bancada, não do gerador:** a arte do By Rock entrou por
  arquivo (não está no banco de dev), então a régua dela saiu por visão, que
  leu "ATÉ 50% OFF, DAS 16H" com ponto no lugar da vírgula. As peças dos dois
  geradores saíram com o ponto. Em produção a arte do compositor tem a régua
  do banco.
- **gpt-image: 5 "prontas", 1 "não entrou", 2 reprovadas.** As reprovadas são os
  dois `redesenhar` (o assunto da foto saiu do lugar, como no relato). A que
  não entrou é a do By Rock, que antes saía como pronta. E, olhando a folha,
  duas das cinco "prontas" têm defeito que nenhuma conferência acusou: no
  Bacana o filete pedido não está na peça (a recomposição o devolveu à origem
  e o texto que andou alguns pixels bastou para passar), e na rediagramação do
  Bacana "SABADOU" saiu duplicado e a logo voltou redesenhada, maior. Sobram 3
  de 8.
- **Tempo e consumo**: Nano Banana de 18 a 41 s, gpt-image de 14 a 30 s. O
  Nano Banana consome de 2,1 a 3,0 mil tokens de saída por imagem; o gpt-image,
  148 a 181 no `low` e 1.331 no `medium`. O preço por imagem do Nano Banana 2.1
  não foi conferido na tabela do Google.
- **Decisão: a medição sustenta um piloto com `MELHORIA_GERADOR=gemini`, e
  ainda não sustenta trocar o padrão de vez.** A favor: nos pedidos de elemento
  gráfico foram 4 de 4 contra 2 de 4, e nenhuma peça do Nano Banana saiu como
  pronta com defeito (2 de 8 no gpt-image). Contra virar o padrão já: são 4 artes e uma
  geração por caso, sem repetição; em rediagramação o Nano Banana é tímido (2
  de 4 voltaram iguais, e cada uma custa duas gerações à casa antes do
  `FAILED`); e ficaram fora da amostra os projetos em `compor` (TERO, Lagosta),
  a arte de template chapado (o alvo do `redesenhar`), o carrossel e a
  melhoria em cima de melhoria.
- ⚠️ **Limites conhecidos do caminho Gemini.** A conferência honesta mede
  mudança visível, não "o pedido foi atendido": se o gerador mexer em outra
  coisa e ignorar o pedido, a peça sai como pronta. Texto sobre o assunto da
  foto continua sem barreira (no `redesenhar` do By Rock o convite foi para
  cima do chope). Mudança leve e larga (um halo que some) só entra quando
  encosta numa zona forte. A logo que o gerador levar para outro canto fica
  duplicada: a da origem volta ao lugar e a redesenhada permanece. E a logo só
  é protegida quando a da origem é o arquivo oficial com transparência.


### Melhorar a foto com IA: foto por baixo, texto por cima (17/11/2026)

Pedido do Ciro: a melhoria deve também melhorar a FOTOGRAFIA (balanço de
branco, cara de câmera e lente melhores, fundo desfocado, prato nítido) e
humanizar (a mão puxando o queijo, o garfo na batata, o vinho sendo servido, o
brinde). Plano aprovado em `docs/PLANO-2026-11-17-MELHORAR-FOTO-COM-IA.md`;
esta seção é a Fase 1 (o chat). Tudo atrás de `MELHORIA_DE_FOTO`, desligada por
padrão.

**As regras (decisão do Ciro, 17/11/2026).**

- 🔴 **"A fotografia é intocável" continua sendo o padrão** dos modos de
  diagramação (`rediagramar`, `redesenhar`, `refinar`). O que entrou é uma
  lista FECHADA de exceções com nome, as **receitas de foto**
  (`receitas-de-foto.ts`): Humanizar, Foto profissional, Abrir espaço para o
  texto e Ajuste livre. Receita é sempre escolhida por gente. **Nenhum revisor
  automático dispara receita de foto.**
- 🔴 **A comida é a do cliente.** Não acrescentar, tirar nem trocar
  ingrediente, porção, louça ou bebida. Tratar a foto não é mudar o prato.
- 🔴 **O lugar é o do cliente.** Mesa, parede, móveis e fundo continuam os
  mesmos. Desfocar pode; trocar não.
- 🔴 **Nenhum contraste para segurar texto** (véu, gradiente, tarja,
  escurecimento). A regra de 05/09 fica como está, também nas receitas: "abrir
  espaço" se resolve com área calma da própria cena.
- 🔴 **Gente entra pelas bordas do quadro** (mão, antebraço), nunca casa cheia,
  nunca rosto em foco sem autorização (parâmetro `rosto: true` da receita
  Humanizar). **Homem nunca de terno ou blazer** (regra do Ciro de 22/10/2026,
  que não estava escrita em lugar nenhum).
- 🔴 **Rosto de pessoa real não é refeito.** O Nano Banana repinta o quadro
  inteiro, então qualquer receita pode alterar um rosto que já está na foto. O
  prompt manda manter cada pessoa como está, e a opção sai com um aviso EM
  DESTAQUE ("esta foto tem rosto: confira se a pessoa continua a mesma"). Não
  há trava por código. A receita de postura e sorriso ficou de fora.
- 🔴 **As conferências AVISAM e nunca vetam** (regra de 10/08/2026): assunto no
  lugar (`deslocamentoDaFoto`), o prato é o mesmo (`conferirFidelidadeDaCena`),
  rosto em foco. O único descarte é medido por código: a opção que saiu igual à
  origem (`mudancaNaoEntrou`). Quem decide é gente, com o antes e depois na
  frente.
- 🔴 **Nada é aplicado a página ou post sem alguém escolher a opção.** A
  melhoria de foto devolve uma PROPOSTA; aplicar é outra chamada.
- **Sem preço em créditos** (o Studio não é mais SaaS, Ciro, 17/11/2026): este
  caminho não confere saldo nem debita. Cada opção gerada vira uma linha de
  `UsageHistory` com `creditsUsed: 0` e o custo real em dólar nos `details`
  (`registrar-uso-sem-cobranca.ts`), esteja `CREDITOS_APLICADOS` ligado ou não.

**Como funciona.**

- **A IA edita só a foto limpa; o Studio renderiza o resto por cima.** A
  melhoria de sempre manda a arte chapada (foto, texto e logo num PNG) para a
  IA redesenhar tudo, e por isso o texto e a logo saem estragados. Aqui o texto
  nunca passa pela IA: a arte continua editável e o post continua ligado à
  página.
- **A rota** (`rotaDaMelhoriaDeFoto`, puro): arte com página própria e foto vai
  pela página. Vão pela RESERVA a arte sem página (importada, canvas, trazida
  do Zernio), a página-modelo (o `ajustarArte` a recusa) e a **arte que já é
  melhoria chapada**. Nesta a página existe, mas não é o que o post mostra, e
  trocar a foto nela jogaria fora a diagramação aprovada.
- **A foto é a primeira camada `image` visível com arquivo**, fora de grade.
  A IA recebe o QUADRO que a peça mostra, não a foto inteira do acervo
  (`recortarQuadro`, com o mesmo retângulo de `image-fit.ts` que o editor e o
  render usam). A foto nova volta para a MESMA camada com o recorte inteiro
  (`RECORTE_INTEIRO`): ela já vem no quadro.
- 🔴 **A troca é por `ajustarArte` com a operação de camadas, não por
  `imageUrl`.** `imageUrl` não zera o `crop` (a foto nova seria recortada de
  novo pelo recorte da antiga) e escolhe a camada por outra regra (a vaga
  dinâmica vazia primeiro). `camadas: [{ op: 'definir', camada, campos: {
  fileUrl, style: { crop: inteiro } } }]` grava a camada certa e passa pela
  mesma porta: mesmo render, `invalidateScheduledRenders` e
  `pedirRecomposicaoDaArteCongelada`.
- **O gerador é o Nano Banana 2.1** em modo edição, 2K, na proporção aceita
  mais próxima do quadro (`proporcaoMaisProxima`); a saída é cortada no centro
  para a proporção exata (`ajustarAoQuadro`). Uma opção por padrão, duas em
  paralelo quando a pessoa pede.
- **Quem escreve o prompt** (`diretor-de-foto.ts`, irmão do diretor de arte:
  mesmo modelo, mesmo controle de prazo, validação por código com três
  rodadas). Ele olha a foto e a arte, recebe as receitas, a direção de foto do
  DNA e a caixa do texto, e devolve `leitura` (português), `prompt` (inglês,
  até 4.000, verbo da operação primeiro, o que muda, o que fica igual, câmera,
  lente e luz) e `riscos`. Com `promptPronto` (o chat escreveu), **o Studio não
  reescreve**. Nos dois casos o bloco de preservação da casa e das receitas
  entra POR CÓDIGO no fim (`montarPromptDeFoto`): o que é mecânico não depende
  de quem escreveu.
- 🔴 **A direção de foto do DNA não é tarefa a mais.** No primeiro teste (By
  Rock, só Humanizar pedido) o diretor mandou esquentar a luz, escurecer o
  fundo e limpar a mesa, puxado pelo `photoDirection` da marca. Sem a receita
  Foto profissional, luz, cor, desfoque e limpeza ficam como estão: o DNA diz
  COMO fazer o que a receita pede.
- **A proposta é uma Generation** de `source: 'melhoria-de-foto'`, com
  `fieldValues.melhoriaDeFoto` (`melhoria-de-foto-registro.ts`): leitura,
  prompt, riscos e as opções (foto limpa e prévia no Blob, na trilha
  `foto-melhorada`, com avisos). A prévia é a página renderizada EM MEMÓRIA com
  a foto trocada (`renderizarPrevia`); a página e a miniatura não são gravadas.
  `resultUrl` é a prévia da primeira opção válida.
- **Aplicar** (`aplicarOpcaoDeFoto`): confere o post ANTES de qualquer escrita
  (`laterPostId` dentro da janela de publicação recusa sem tocar na página),
  confere que a foto da página ainda é a da proposta (`fotoAindaEAMesma`: outra
  foto, outro recorte ou outra caixa recusam, porque a foto nova cairia no
  lugar errado), troca pela porta de `ajustarArte` e grava `aplicada` por merge
  no banco. Post que já está no Zernio recebe a arte renderizada por
  `aplicarArteMelhoradaAoPost`, como a melhoria de sempre. Aplicar de novo a
  mesma opção devolve a aplicação que existe; depois de uma aplicada, a outra
  não entra.
- **A reserva** é o runner de sempre com três desvios (`fotoPelaReserva`): o
  gerador é forçado em `gemini`, o prompt é o do diretor de foto avisado de que
  a imagem é a arte pronta ("texto e logo intactos, letra por letra"), e a
  logo da origem volta por `recomporPorZona(..., { tudoEZona: true })`, que
  aceita a peça gerada inteira menos a caixa da logo oficial. A conferência de
  texto roda como sempre e reprova texto divergente. Nada é aplicado ao post
  sozinho, e a resposta avisa que o texto pode ter saído diferente.
- **No MCP:** `melhorar-arte` ganhou `alvo` (`arte` é o padrão e o
  comportamento de sempre), `receitas[]`, `promptPronto`, `opcoes` (1 ou 2) e
  `instrucaoImagem` (que só a tela tinha); `ver-geracao` devolve `leitura` e
  `prompt` de toda melhoria e, na proposta de foto, `opcoes`, `riscos` e
  `aplicada`; `aplicar-opcao-de-foto` aplica a escolhida. O perfil só-rascunho
  continua sem nenhuma das duas escritas (allowlist).
- **O gancho do acervo** (`registrarFotoMelhoradaNoAcervo`) é chamado ao
  aplicar e hoje não faz nada: a cópia para `Fotos/IA_LAGOSTA`, a ficha no
  catálogo e o `buscar-fotos` são a próxima fatia. A foto fica só no Blob.

**O que a bancada ensinou (17 e 18/11/2026).**

- 🔴 **"Saiu igual" tem duas medidas, não uma.** `mudancaNaoEntrou` (o mapa de
  zonas do `recompor-por-zona.ts`) compara cada pixel com a faixa dos vizinhos
  e foi feito para elemento novo (mão, texto). Tratamento GLOBAL de luz não
  vira zona: na primeira rodada a receita Foto profissional saiu com "0% de
  mudança" em 4 de 4 e foi descartada em 3. A opção só é descartada quando não
  há elemento novo **e** a `diferencaDeTom` (média da diferença em 48x48
  borrado, 0 a 255) fica abaixo de `PISO_DE_TOM` (3). Calibração, olhando os
  pares: as fotos que voltaram iguais deram 2,0 a 2,9; o menor tratamento que
  se enxerga, 4,1. São poucas peças: quem mexer no limiar mede de novo.
- 🔴 **A arte de origem pode não ser mais o retrato da página.** Em 2 das 4
  artes da bancada a página tinha sido editada depois da arte (outro texto
  numa, outro recorte da foto na outra). A prévia é a página de HOJE com a
  foto trocada, e ao lado da arte antiga parecia ter mexido no texto e no
  enquadramento, que a IA nem viu. Quando `versaoRenderizada` da arte difere da
  versão da página, o runner renderiza o "antes" da página de hoje
  (`antesUrl`), o diretor olha esse "antes" e a opção sai com o aviso
  `AVISO_DE_PAGINA_EDITADA`. Arte antiga, sem `versaoRenderizada`, não tem como
  ser conferida e segue sem o aviso.
- 🔴 **A logo e os elementos ficam POR CIMA da foto.** A mão do Humanizar saiu
  embaixo da logo do Espeto: o diretor recebia só a caixa do texto. Hoje recebe
  também as caixas das camadas `logo` e `element` (`caixasDaMarcaNoQuadro`).
- **Foto profissional no padrão (`leve`) quase não muda foto que já é boa.** As
  fotos da carteira são de sessão profissional: o tratamento leve fica no
  limite do que se enxerga e parte volta como "saiu igual" (o que custa uma
  segunda geração pela fila). Se o padrão deve ser `marcada` é decisão do
  Ciro, olhando a folha.

**O que foi medido (bancada de 18/11/2026).** Quatro artes do compositor, de
quatro clientes (By Rock, Espeto Gaúcho e Real Gelateria em story; Bacana em
feed), três receitas, uma opção cada, pelo código da fila
(`scripts/medir-melhoria-de-foto.ts`). A folha de contato fica FORA do
repositório (ele é público e ela mostra arte de cliente): o script grava em
`~/Documents/Clientes/_medicoes/2026-11-melhorar-foto/`.

| arte | receita | desfecho | mudou (zonas) | tom | aviso de conferência | s |
|---|---|---|---|---|---|---|
| By Rock | Humanizar | opção | 21% | 9,5 | nenhum | 43 |
| By Rock | Foto profissional | saiu igual | 0% | 2,9 | – | 54 |
| By Rock | Abrir espaço | opção | 86% | 37,2 | nenhum | 55 |
| Espeto | Humanizar | opção | 4% | 3,3 | rosto (destaque), página editada | 53 |
| Espeto | Foto profissional | opção | 0% | 4,1 | rosto (destaque), página editada | 55 |
| Espeto | Abrir espaço | saiu igual | 0% | 2,0 | – | 47 |
| Real | Humanizar | opção | 19% | 13,1 | página editada | 61 |
| Real | Foto profissional | opção | 0% | 3,0 | página editada | 61 |
| Real | Abrir espaço | opção | 94% | 48,7 | página editada, prato (cor e proporção das bolas) | 65 |
| Bacana | Humanizar | opção | 8% | 5,5 | nenhum | 45 |
| Bacana | Foto profissional | opção | 2% | 15,1 | nenhum | 66 |
| Bacana | Abrir espaço | opção | 65% | 38,7 | nenhum | 63 |

- **10 opções em 12; 2 descartadas por terem saído iguais.** O texto, a logo e
  os elementos saíram idênticos nas 10, por construção (são renderizados por
  cima). Na Real, que tem recorte manual na foto, a foto nova caiu no mesmo
  enquadramento.
- **Humanizar: 4 de 4 com o gesto**, todos entrando pela borda (garfo, pinça,
  mão no cone), sem rosto novo e fora da área da logo. No By Rock veio junto
  um pedaço de manga escura do braço, no canto do texto.
- **Foto profissional (padrão `leve`): mudança no limite do que se enxerga.**
  Uma voltou igual, duas ficaram com tom 3,0 e 4,1 (quase nada), e só a do
  Bacana mudou de fato (15,1). Com `marcada`, numa geração à parte na Real, o
  tratamento aparece.
- **Abrir espaço: recompõe de verdade em 3 de 4** (o prato sobe ou o quadro
  abre) e voltou igual no Espeto, onde o texto já pousa no teto liso. No Bacana
  o letreiro luminoso atrás do título foi apagado para acalmar a área: é o
  mesmo lugar, mas é um caso para o olho de quem aprova. Na Real a conferência
  acusou diferença no prato, como aviso.
- **Tempo:** 43 a 66 s por opção, com o diretor de foto. **Custo:** US$ 0,05
  por imagem (tabela do Google); a bancada inteira, com a primeira rodada e a
  calibração, gerou 28 imagens.
- **O julgamento é do Ciro.** A bancada mede se o caminho funciona; se o prato
  continua o mesmo, se a mão convence e quantas ele usaria, é a folha que
  responde. Uma receita só fica ligada na tela se a maioria passar.
- ⚠️ **Fora da amostra:** página com a foto em parte do quadro (proporção fora
  das aceitas), carrossel, arte com vídeo, foto com rosto em primeiro plano, a
  receita Ajuste livre e o prompt pronto do chat com imagem real.

**Ponta a ponta no banco de desenvolvimento (17 e 18/11/2026).** Pela fila
(`startMelhoriaDeFoto`, `enfileirarMelhoria`, `dispararJobAgora`): By Rock,
Humanizar, uma opção em 60 s, prévia conferida, página intocada até aplicar,
saldo sem débito e uma linha de uso com `creditsUsed: 0`; aplicada, a página
ficou com a foto nova e o recorte inteiro, a arte renderizada bateu com a
prévia e aplicar de novo devolveu a mesma arte. Pelas tools do MCP
(`melhorar-arte`, `ver-geracao`, `aplicar-opcao-de-foto`): Real Gelateria,
página com recorte manual, duas opções em 53 s, as três miniaturas no
`ver-geracao`, aplicação e recusa da outra opção. Pela reserva: uma melhoria
chapada do Espeto, texto conferido (`passed`), sem cobrança.

- 🔴 **O recorte se compara campo a campo, nunca por `JSON.stringify`.** O
  registro passa pelo `jsonb` do Postgres, que reordena as chaves: comparada
  como texto, toda página com recorte manual "tinha mudado" e a aplicação era
  recusada. Foi o teste das tools que pegou.
- ⚠️ **Não foi exercitado com serviço real:** post com `laterPostId` (a troca
  no Zernio), a recusa dentro da janela de publicação e a invalidação de post
  agendado. Estão cobertos por teste com dublê
  (`melhoria-de-foto-service.test.ts`), não por chamada de verdade.

**Limites conhecidos.**

- ⚠️ A opção não usada fica no Blob: a limpeza em 30 dias (seção 6.1 do plano)
  não foi feita.
- ⚠️ A conferência de mão com defeito não existe: o diretor lista o risco e
  quem aprova olha. "A mudança entrou" mede mudança visível, não "o pedido foi
  atendido".
- ⚠️ Quadro fora das proporções que o gerador aceita (foto que ocupa só parte
  da arte) é gerado na proporção mais próxima e cortado no centro: perde-se uma
  faixa nas bordas.
- ⚠️ A foto é lida como o arquivo está, sem girar pelo EXIF, que é como o
  render do servidor a lê.
- ⚠️ O que o catálogo sabe da foto entra só pela caixa do assunto marcada à mão
  (`PhotoAssunto`); o nome do prato do catálogo (um JSON no Drive) não é lido.
- ⚠️ Carrossel é uma página por vez; item da leva (`itemId`) não aceita
  `alvo: 'foto'` nesta fase; a reserva gera uma opção por pedido.
- ⚠️ Na reserva a logo só volta à origem quando o arquivo oficial casa com a
  arte (correlação 0,65); no teste, numa arte que já era melhoria, casou 0,55 e
  a logo ficou a do gerador. E a tentativa descartada não vira linha de uso: só
  a que deu certo.
- ⚠️ O custo registrado é o da imagem (US$ 0,05 no Nano Banana 2.1 em 2K, tabela
  do Google lida em 17/11/2026). O diretor de foto e a conferência por visão
  não entram na conta.
