# Compositor (o editor como usina)

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### O editor como usina: compositor, assinatura e via `compor` (02/09/2026)

Plano em `docs/PLANO-2026-09-02-EDITOR-COMO-USINA.md` (F0–F5 + §8 templates +
§9 área livre), executado no mesmo dia e testado na leva de setembro da
Lagosta Criativa (63 peças). O que nasceu: `src/lib/compositor/` (a usina),
`src/lib/creatives/layer-contract.ts` (o contrato do Layer), a fila `COMPOR`,
a via `compor` dos planos, cinco tools no conector (`ver-assinatura`,
`compor-arte`, `compor-leva`, `reverter-arte`, `ver-ajustes-da-assinatura`)
e o sinal `geometria`. Regras que valem para código novo:

- **A copy chega por PAPEL e por LINHA** (`pre`, `headline`, `apoio`, `cta`,
  `servico`), e o compositor RESPEITA a quebra: ele mede cada linha com a
  fonte real, encolhe até 80% e, se não couber, recusa com ORÇAMENTO
  (`TEXTO_NAO_CABE_NA_COLUNA`, caracteres que cabem). Quebrar por conta
  própria mudaria o ritmo da frase — `copyParaBlocos` só o faz para item de
  plano, que não carrega papel.
- **A assinatura mora em DUAS casas de propósito** (§8 do plano): o ESTILO por
  papel numa PÁGINA do projeto (template `Assinatura`, página `isTemplate`
  com a tag `assinatura`, camadas de texto chamadas pelo papel) — porque a
  equipe edita página, não JSON; e os NÚMEROS (margens, safe area, faixa de
  tinta, raio, largura da logo) em `Project.assinatura`. Sem página o
  compositor RECUSA (`ASSINATURA_INCOMPLETA`): compor sem assinatura seria
  inventar a marca. Cadastro por `scripts/criar-pagina-de-assinatura.ts`
  (`--projeto <id>` ou `--todos`), com os kits em
  `scripts/lib/kits-de-assinatura.ts` — LIDOS do `PADRAO.md`/`gerar.py` do
  canvas de cada cliente. **Os 10 projetos de restaurante têm assinatura em
  produção desde 02/09/2026** (Ciro: "ajuste em todos os clientes").
  O que cada kit NÃO reproduz e fica como ajuste no editor: a segunda voz da
  headline (Quintal DomaniCP→Amithen, TERO âmbar+creme, By Rock 2ª linha
  vermelha, Wine Vix palavra dourada, Espeto palavra vermelha, Real palavra
  menta), o extrude sólido do Seu Quinto (sombra deslocada sem blur no lugar),
  ícones de serviço e filetes. 🔴 By Rock: o canvas rodava em Anton + Barlow
  (Google Fonts, não cadastradas) — o kit segue o DNA (Mortella na manchete,
  Metrisch no resto), e a manchete pode pedir corpo menor. TERO: `Montserrat
  Light` não está cadastrada; o apoio cai na regular.
- **O halo é definido VISUALMENTE na página de assinatura** (03/09/2026, ao
  ler as quatro primeiras assinaturas ajustadas pelo Ciro): se ALGUM papel da
  página tem `effects.background` ligado, a página é a verdade papel a papel
  — cor, ajuste caixa/texto, margem, desfoque, cantos E opacidade vêm dela,
  EXATAMENTE (Ciro, 03/09: "não precisa ajustar de acordo com a luminosidade";
  a modulação pela foto e a correção da régua só valem no modo calibrado pela
  casa, quando nenhum papel tem fundo). Papel sem fundo sai sem mancha. **O
  GRUPO da peça é o grupo da página** (Cmd+G): a mancha é a do líder, como o
  editor desenha — nunca juntar nem separar agrupamentos ("o halo ficava por
  cima de algumas fontes porque juntou o de cima com o de baixo"). O
  agrupamento é o ESQUELETO: o bloco com a manchete é o principal e o mapa só
  escolhe o HORIZONTAL (a âncora vertical é a da página); os outros ficam na
  âncora e no alinhamento que têm na página. As MARGENS também vêm da página
  (onde o primeiro texto começa e o último termina). Logo sem sombra e sem halo.
  A sombra segue a mesma lei: camada sem sombra na página = peça sem sombra.
  `Page.background` NÃO é mais lido (o editor grava `#ffffff` ao pôr foto de
  referência na página); fundo liso e mancha da logo vêm de `Project.assinatura`.
- 🔴 **COPY PRIMEIRO, CAMPOS DEPOIS** (Ciro, 11/09/2026; substitui a regra de
  04/09 "não adicione campos; a copy é feita em cima dos campos que existem no
  template"). A redação aprovada: *A assinatura define a identidade visual e oferece composições iniciais. Os campos são opcionais. A mensagem determina quais blocos e grupos de leitura a peça precisa. O Claude pode escolher outra variante, acrescentar camadas com estilos da assinatura e reorganizar a composição. Nenhum texto é descartado por ausência de campo. Fatos vêm da base; a caixa vem da string; safe area e avatar permanecem respeitados. O verificador informa problemas e não veta a peça.* Nada é escrito para
  preencher espaço. Desde o PR 10 (12/09/2026) o texto cujo papel a variante
  não tem entra como CAMADA EXTRA quando declara `herdaDe` (ver "A camada
  EXTRA" e "O ciclo da camada extra" no fim deste arquivo); sem a herança
  declarada, papel que a variante não tem volta como `PAPEIS_INCOMPATIVEIS` —
  nunca some em silêncio. A regra
  nova entrou de uma vez em todos os lugares onde a antiga estava ativa
  (CLAUDE.md, `docs/FORMAS-DE-ARTE.md`, `instrucoes.ts`, descrição de
  `compor-arte`, comentários do compositor): regra velha e nova convivendo era
  o defeito. O que continua: a página do formato é a verdade daquele formato
  (o `completarComStory` segue removido — papel de feed não vem da story);
  `copyParaBlocos(copy, { papeis })` distribui a copy do item de plano sobre os
  papéis do formato — no modo `estrito` (o executor semanal) o que não cabe
  LANÇA `PAPEIS_INCOMPATIVEIS` (com `textosSemPapel`); no modo legado o excedente ainda é CORTADO
  sem aviso, que é a perda posicional que o PR 5 da F1 vai fechar; o
  alinhamento da headline na
  página é PREFERÊNCIA do rodízio (a foto ainda manda); o serviço reserva a
  própria altura quando o bloco principal também vai ao rodapé.
- **A régua entende texto ESCURO**: para cor de texto com luz < 128 a
  pergunta inverte (p2 do fundo ≥ alvo claro) e ela só confere, nunca corrige
  — mancha clara é desenho da equipe (Real: apoio verde sobre creme).
- **Mais de uma página por formato = VARIANTES** (`escolherVariante`, 03/09/2026,
  pergunta do Ciro "posso criar mais variações?"): TODA página do template
  "Assinatura" conta (duplicar no editor basta). A escolha é pela MENSAGEM
  (`avaliarVariantes`, Ciro: "escolher o template de acordo com a mensagem, e
  saber quais aceitam o horário de funcionamento"): +10 por ter todos os
  papéis que a peça pede e −4 por papel que falta (a story sem `servico` não
  serve para a peça de funcionamento — aconteceu na sexta da Real), −1 por
  papel que sobra, +3 por palavra do tema no nome/tags da página, ±2 pela tag
  `clara`/`escura` contra a luz da foto; empate → rodízio pela chave da peça.
  Papel pedido que a variante escolhida não tem é RECUSADO antes de gravar
  (`PAPEIS_INCOMPATIVEIS`, com a lista do que falta) — nunca sai da peça em
  silêncio; a saída é outra variante ou `criar-arte` com `textosLivres`, com a
  copy preservada (só a manchete é obrigatória para compor). `ver-assinatura`
  lista as variantes com os papéis
  e `aceitaServico`. Nome/tag da página é o que faz o tema casar: vale nomear
  as variantes pelo que elas servem. O compositor NÃO varia cor de fonte nem
  cor do halo por conta própria — variação de estilo é página nova; o que ele
  varia sozinho é posição, enquadramento, canto da logo e a TINTA do halo
  (dentro da faixa). A variante usada fica em `composicao.assinatura.variante`.
- **Variantes como DESIGNS de uma leva (Espeto, 04/09/2026)**: o Ciro achou os
  designs da semana 1 (canvas: 3 arranjos + promoção com preço) melhores que
  os da semana 2 (compositor, 20 peças no mesmo arranjo). A resposta foi
  `scripts/criar-variantes-assinatura-espeto.ts`: três PÁGINAS novas no
  template Assinatura, clonadas da página que ele ajustou — "Promoção"
  (headline2 vermelha; `apoio` = descrição Barlow branco, `servico` = PREÇO
  Bevan amarelo; tags promocao/preco/rodizio/marmitex), "Rodapé" e "Topo".
  🔴 Numa variante os PAPÉIS podem mudar de sentido — a copy é escrita
  contra a variante (`ver-assinatura` mostra fonte/cor por papel): na
  Promoção o preço vai no `servico`, nunca "a partir das 17h". A 2ª linha da
  manchete vira `headline2` quando a página o tem: deixe a palavra-chave na
  2ª linha. Rodar o script de novo SOBRESCREVE as páginas pelo nome.
- 🔴 **A posição vem da FOTO, nunca do template** (§9). `mapa-de-calma.ts`:
  grade 6×10 sobre a foto COMO APARECE (cover, no corte candidato), pontuação
  por calma (energia de borda), tinta necessária (p98 vs alvo da cor) e
  preferência; cobrir o ASSUNTO **descarta** (fração maior entre "do assunto"
  e "do bloco" — uma só deixava o texto pousar no prato quando o prato ocupa
  meio quadro). O ENQUADRAMENTO é candidato também: foto que sobra no eixo
  ganha três cortes (`cropPosition`), e o render já o lê.
- **O halo é `effects.background` no grupo de texto**, não shape solta — é o
  que faz a mancha SEGUIR o texto quando a equipe o move. A tinta anda numa
  FAIXA (`faixaTexto`, 0,26–0,58 na Lagosta), decidida pela necessidade,
  nunca perseguindo alvo (decisão do Ciro, PADRAO.md §5.0). Só a logo leva
  shape (`halo-marca`), porque o efeito é de texto.
- **A régua (`regua.ts`) mede a peça RENDERIZADA sem os textos** (cor
  transparente, halo mantido) e compara o p98 com o alvo da cor; corrige a
  tinta UMA vez dentro da faixa e AVISA — nunca reprova. `TOLERANCIA_DO_ALVO
  = 12`: um ponto acima não é defeito visível; sem ela toda peça de headline
  laranja (alvo 76) saía "fora" e o aviso virava ruído. Medido na leva: a
  maioria das peças com fundo claro fica no teto da faixa e ainda acima do
  alvo — é o preço da mancha invisível, e quem segura a leitura é a sombra
  presa ao glifo.
- 🔴 **Feed e quadrado usam `safeTopo` 120**, não 96: o autofix confere a
  margem de segurança do EDITOR (`CANVAS_MARGIN.top`), e a primeira prova
  acusou "pre invade a margem" em toda peça de feed. O compositor não pode
  pousar texto onde o editor o acusa.
- **`provar: true` renderiza em memória e não grava nada** — é o dry-run que
  fez o canvas ser iterável. Toda leva grande começa por UMA prova.
- 🔴 **O destino padrão de uma leva é a AGENDA, como rascunho — a bancada só
  com pedido explícito** (Ciro, 04/09/2026: "eu não pedi para colocar na fila
  da bancada, os posts devem ser colocados lá somente se solicitado; o padrão
  deveria ser colocar na agenda"). Semana pedida pelo chat: compor a peça
  (`compor-arte`/`compor-leva`) e `colocar-na-agenda` **com o `pageId` da
  peça, nunca com o `generationId`** (Ciro, 04/09: "não é preciso gerar o
  criativo para agendar, você pode agendar a página diretamente para eu
  conseguir editar depois") — são `pageId` + `templateId` no post que dão o
  botão "Editar Template" na agenda e fazem a edição refluir para a arte;
  por `generationId` o post nasce sem página e o botão some. Carrossel de
  fotos vai com as URLs do acervo. `criar-plano`
  só quando a pessoa disser "bancada". A semana 2 do Espeto (07–13/09) foi
  parar no plano e teve de ser movida; as instruções do conector
  (`src/lib/mcp/instrucoes.ts`, etapas 2-4) já dizem isso.
- **Fila: o MCP só enfileira** (`compor-leva`, `executar-plano`); a bancada
  compõe na hora (`gerarItemPorModelo` com via `compor`). O cron pega até 12
  composições em série DEPOIS do lote de IA, dentro de 200s. `maxAttempts`
  3, porque não há chamada paga.
- **`persistAndRenderCreative` aceita `generationId`** e FECHA a Generation
  PROCESSING da fila em vez de criar outra — a bancada segue o id que tem.
  🔴 **O `comporPeca` só cumpria isso na promessa** (medido em 04/09/2026,
  Espeto Gaúcho, `compor-leva` com 20 itens): ele anotava o id da fila em
  `fieldValues.generationIdDaFila` e NÃO o entregava ao persist — nasciam 20
  Generations COMPLETED duplicadas, as 20 da fila ficavam PROCESSING para
  sempre (a varredura de órfãs PULA Generation que tem job, então nem FAILED
  viravam), `fecharJob` marcava o job FAILED sem `lastError`, e os itens do
  plano ficavam `proposto` com a arte pronta na galeria. Hoje a entrada do
  persist é montada em `persistencia.ts` (puro, testado) com o `generationId`;
  **quem reaponta o item do plano é a FILA** (`reapontarItemDoPlano` em
  `fila.ts`: `na-fila` ao enfileirar, `pronto` com generationId/pageId ao
  terminar, `erro` na falha definitiva — caminhando por `caminhoAte`, nunca
  derrubando a peça); e `fecharJob` escreve por que falhou quando o runner
  deixa a Generation aberta. Teste em `__tests__/fila.test.ts`. A limpeza das
  40 linhas do incidente é `scripts/limpar-compor-duplicado-2026-09-04.ts`
  (dry-run por padrão; preserva o que item ou post referenciam).
- **Snapshot em `fieldValues.layersSnapshot`** e `reverter-arte`: o "git" de
  uma peça. Página promovida a modelo não reverte (mataria curadoria).
- **`LearningSignal tipo 'geometria'`** nasce no PATCH da página, só em
  página com a tag `compositor`, balde de 10 min — mover, encolher, realinhar,
  esconder, com tolerância de 3px/2% para ruído de arraste. Destilado por
  `destilar-geometria.ts` em PROPOSTAS (n ≥ 5), nunca aplicado sozinho.
- **Contrato do Layer (F0)**: `fontWeight` múltiplo de 100, entrelinha nos
  DOIS campos, `order` renumerado, `autoExpand` ligado, `objectFit` em
  imagem — `prepararCamadasParaGravar` em toda porta de escrita de
  `Page.layers` vinda de fora do editor (`create-page`/`create-template` do
  MCP local já passam). `FEED_PORTRAIT` não existe em `TemplateType`.
- **A aba de Templates tem QUATRO seções** (03/09/2026, `src/lib/templates/
  classificar.ts`, puro): assinatura · modelos da equipe · programação ·
  arquivo (recolhido; pasta automática VAZIA não tem card — vale para o
  arquivo e, desde 04/09, para a programação também). A seção diz quem criou e
  para quê. **A peça composta vai para a pasta da SEMANA da data prevista, E
  DO FORMATO** (`pasta-da-semana.ts`: segunda a domingo em BRT, categoria
  `programacao`), pedido de uma arte, de uma sexta ou da semana inteira caindo
  no mesmo lugar; sem data vai para `Avulsas · <mês>` e é MOVIDA para a semana
  quando o post é agendado (`moverPaginaParaSemana`, chamado de `agendarPost`,
  nunca derruba o agendamento). A API de templates devolve `situacao` (peças,
  na agenda, publicadas, rascunhos, falhas) para as pastas.
  🔴 `Template` tem FK com cascade a partir de `Generation`: NUNCA apagar
  pasta "vazia" sem antes reapontar as Generations — e `SocialPost.templateId`
  é SetNull, então apagar também tira o "Editar Template" do post. Por isso a
  pasta esvaziada some da ABA, nunca do banco.
- **Story e feed em pastas SEPARADAS, ordem de postagem, nome com data e
  slide** (04/09/2026, pedido do Ciro depois de revisar a Lagosta: "eu me
  perco"). São três defeitos que andavam juntos e viraram uma correção só:
  - **Uma pasta por semana E por formato**: `pastaDaPeca(quando, formato)`.
    A pasta 395 tinha 13 stories e 17 páginas de feed intercaladas, e a
    aprovação de cada frente corre separada. A chave da tag ganhou o sufixo
    (`semana:2026-09-07:story`) e é ela que `garantirPasta` procura; a tag SEM
    formato CONTINUA nas tags, porque é por ela que se filtra a semana inteira
    (`chaveDaSemana` casa as duas formas — nunca depender da ordem do array).
    Cada pasta leva o `type`/`dimensions` do seu formato: o rótulo deixou de
    ser mentira. Nome: "Stories · Semana 7 a 13/09".
  - 🔴 **`Page.order` é GRAVADO na composição** (`ordemNaPasta`): antes toda
    peça nascia no default 0 do schema e o editor listava na ordem arbitrária
    do Postgres — as 30 páginas da 395 tiveram de ser renumeradas à mão. A
    ordem é minutos desde a segunda 00:00 BRT × 100 + o slide, e é
    DESEMPATADA contra o que já está na pasta: sem o desempate, carrossel
    composto sem declarar o slide empata tudo no mesmo número e a pasta volta
    à ordem arbitrária (medido em 04/09 numa leva real do Empório — quatro
    slides com `order` 549000).
  - 🔴 **O slide é REGISTRADO por quem compõe** (`spec.carrossel` →
    `Generation.slideOrder`, a coluna que o carrossel de IA já usava), nunca
    deduzido depois. A única forma de recuperá-lo em peça antiga é casar o
    `SocialPost.mediaUrls` pelo nome do arquivo do render
    (`<pageId>-<epoch>.png`) — é o que a migração faz, e é frágil de propósito
    ali. `carouselGroupId` fica nulo: cada slide é composto sozinho, e um
    grupo de um só seria pior que nenhum.
  - **Nome da página**: "Qua 09/09 · 19:30 · Seu Quinto · slide 2/5" — com a
    DATA (não só o dia da semana) e o número do slide; sem eles os quatro
    slides do mesmo carrossel saíam com nomes IDÊNTICOS. O formato saiu do
    nome da página porque já é o começo do nome da pasta.
  - **A capa do carrossel costuma ser foto do acervo**, então as peças
    compostas começam no slide 2 — o número é a posição como ela sai no
    Instagram, não o índice das peças compostas.
  - Migração: `scripts/separar-pastas-por-formato.ts` (dry-run por padrão,
    `--projeto <id>` ou `--todos`). O formato de mais páginas FICA na pasta
    atual (renomeada); os outros vão para a pasta do seu formato. Ele reaponta
    `Generation.templateId` e `SocialPost.templateId` das páginas que mudam de
    casa, e **não apaga nada**. 🔴 O período da pasta sai da TAG dela, nunca da
    data das páginas: em 04/09 a pasta "Semana 14 a 20/09" da Lagosta guardava
    páginas agendadas para 10/09 e, pelas datas, reivindicava a chave da
    semana errada — duas pastas com a mesma tag, que é o que a tag existe para
    impedir. 🔴 Mas a PÁGINA vai para a pasta da PRÓPRIA data, e a distinção
    é a lição: "de que semana é esta PASTA" sai da tag dela; "para que pasta
    vai esta PÁGINA" sai da data da peça. Confundir as duas deixou 14 páginas
    da Lagosta com o nome de uma semana ("Qui 10/09") dentro da pasta de
    outra — nome e pasta dizendo coisas diferentes sobre a mesma peça, que é
    a confusão que a separação veio resolver. Sem data (avulsas), aí sim a
    origem manda: é o único caso em que não há data para consultar.
  - Os coletores "Arte Composta" não são mais alimentados;
    `scripts/organizar-programacao.ts` moveu as 63 peças da Lagosta.
- **O card da pasta: capa em mosaico, nome fora do card e o botão Agendar**
  (04/09/2026, ao ver a aba depois da separação):
  - **O nome mora FORA do card** (`LegendaDoCard`), em até TRÊS linhas
    (`line-clamp-3`: com duas, o nome longo do arquivo — mediana 36 e máximo
    56 caracteres — continua cortado nos cards de 171px do celular). Ele
    vivia só no overlay de hover com `truncate`, e "Stories · Semana 14 a
    20/09" não cabe na largura de um card — a semana ficava cortada justamente
    na parte que identifica a pasta.
  - **A capa é o CONJUNTO, não a primeira peça**: a pasta não tem
    `thumbnailUrl` própria (nasce de `garantirPasta`), e a miniatura de uma
    arte solta não diz que aquilo é a semana de stories. `capa` vem da API com
    até 4 miniaturas de página; com 3, a primeira ocupa a linha inteira —
    buraco na grade lê como peça que faltou.
    🔴 **Miniatura `data:` fica de fora**: o PageSync sobrescreve
    `Page.thumbnail` com um JPEG base64 assim que a página é aberta no editor,
    e mandar isso numa listagem multiplicaria o payload por pasta.
  - 🔴 **`grid-rows-2` NÃO gera CSS neste repo** (medido: a classe nem aparece
    na folha de estilo) — o mosaico usa `gridTemplateRows` em estilo INLINE.
    `grid-cols-*` funciona; não dá para inferir uma da outra. Some à família
    de classes mortas.
  - **`GET|POST /api/templates/[id]/agenda-das-paginas`** dá o horário previsto
    de cada peça e o post que já existe, e agenda uma peça como RASCUNHO no
    horário que a composição previu — é o botão "Agendar" / a etiqueta
    "Agendado" na faixa de cada página do workspace contínuo.
    🔴 Fica em cache PRÓPRIO (`['agenda-das-paginas', templateId]`), **nunca**
    dentro de `['pages', templateId]`: o autosave do editor substitui o objeto
    da página naquele cache a cada pausa da digitação, com o retorno do PATCH
    — que não traz estes campos.
    🔴 **O horário NÃO vem do cliente**: é lido no servidor da spec da
    Generation, para o botão não poder agendar em data diferente da que a tela
    mostrou. E o servidor recusa (409) peça que já tem post — o botão
    desativado não segura dois cliques rápidos.
  - 🔴 **`agendarPost` NÃO infere o tipo pelo tamanho**: sem `postType` ele
    grava `STORY` (`input.postType ?? 'STORY'`). Agendar uma peça de feed sem
    dizer o tipo cria um story de 1080x1350. Todo caminho novo que agende
    precisa derivar o tipo do formato.
  - `Page.order` codifica dia e hora, mas só DENTRO da semana — para peça
    remarcada para outra semana ele daria a data errada. Por isso o horário
    previsto sai sempre da spec, nunca da ordem nem do nome.
- **Templates** (§8): o contêiner fica; a página-modelo como layout a
  preencher NÃO se cadastra mais (14 usos em 128, 0/33 no placar); o kit vira
  a página de assinatura. A curadoria das 147 existentes é do próximo
  planejamento — despromover, nunca excluir.
- **O que o editor perde em relação ao canvas, aceito**: gradiente em texto
  (a headline da Lagosta sai sólida), sombra de três camadas presa ao glifo
  (o editor tem uma), e o assunto do catálogo ainda não é preenchido pela
  análise de visão (o compositor usa a estimativa por energia; `assunto`
  em frações na entrada do catálogo é o contrato, quando existir).

### 🔴 A arte do slide de carrossel não seguia a página (04/09/2026)

Editar a copy de uma página no editor tinha dois desfechos opostos, e ninguém
via a diferença: em peça de imagem ÚNICA o PATCH chama
`invalidateScheduledRenders`, o post volta para `PENDING` e o cron
`render-stories` refaz a arte; em SLIDE DE CARROSSEL **não acontecia nada** —
o post seguia com o render antigo em `mediaUrls` e publicaria o texto velho,
em silêncio.

A causa não era esquecimento: post de carrossel é `NOT_NEEDED` e sem `pageId`
de propósito, porque `renderPostArt` grava `mediaUrls: [url]` e um post
`RENDERED` de 5 slides perderia 4 no primeiro re-render. A proteção evitava o
estrago e, no mesmo movimento, abandonava a edição. Medido na conferência de
04/09 (projeto 8): das 65 artes agendadas, **11 não batiam com o texto da
página** — 7 eram slides parados desde a composição, e 2 tinham sobreposição
de texto visível. Nada disso apareceu em log, aviso ou status.

O conserto é `src/lib/compositor/recompor.ts` (serviço) e `defasagem.ts`
(contrato puro), na fila durável. Regras que valem para código novo:

- 🔴 **`invalidateScheduledRenders` tem um COMPANHEIRO obrigatório.** Quem
  muda o visual de uma página chama os dois: a invalidação devolve à fila de
  render quem RENDERIZA da página; `pedirRecomposicaoDaArteCongelada` refaz a
  arte de quem não renderiza (slide de carrossel, arte agendada por
  `generationId`). Cada uma sozinha deixa metade das artes publicando o
  antigo. As cinco portas já chamam as duas: PATCH da página, PUT do template,
  PATCH de camada, `ajustarArte` e `reverterCamadasDaArte`.
- 🔴 **A defasagem se mede por CONTEÚDO, nunca por carimbo de hora.**
  `Page.updatedAt` muda em qualquer escrita — em 04/09 um `update` de `order`
  em 30 páginas apagou o sinal de uma vez. A comparação é o texto de
  `Page.layers` contra o de `Generation.fieldValues.layersSnapshot`, lidos por
  `lerCamadas`/`copyDeCamadas` (ilegível **nunca** vira "em dia").
- 🔴 **Recompor, não só re-renderizar.** Re-renderizar a página como está
  reproduz a colisão: a caixa foi medida para o texto ANTIGO (foi assim que o
  apoio saiu impresso por cima da manchete em duas peças). O caminho é pegar a
  `fieldValues.spec`, trocar só a copy pela que está na página e chamar
  `comporPeca`, que mede cada linha na fonte real e encolhe até caber.
- 🔴 **`comporPeca` roda em `provar: true` e a gravação é feita à mão, na
  MESMA página.** Deixar o compositor persistir criaria página nova (em outra
  pasta, com outro nome) e o post continuaria apontando para a antiga — editar
  de novo deixaria de ter efeito para sempre. O `provar` também evita os
  efeitos colaterais da persistência: pasta da semana, `registrarUsoDeFoto` e
  a transição do item do plano. Recompor é refazer A MESMA peça.
- 🔴 **Recompor só quando a página é a que o compositor pousou.** A
  recomposição reconstrói TODAS as camadas: se alguém moveu uma caixa,
  escondeu um bloco ou acrescentou camada, isso iria embora em silêncio. Nesse
  caso a arte é só re-renderizada como está (a edição chega ao post do mesmo
  jeito) com o aviso de que a diagramação não foi medida de novo. A **altura**
  de caixa de texto não conta como ajuste manual: ela é derivada
  (`autoExpand`) e cresce sozinha quando o texto muda — contá-la faria a
  recomposição nunca acontecer.
- 🔴 **Nem toda spec tem foto.** Duas peças tinham `spec.foto` indefinida
  porque a imagem foi posta à mão no editor depois de compor: recompor pela
  spec devolveu a peça com FUNDO PRETO, sem erro nenhum. A PÁGINA é a verdade
  sobre a foto (`fotoDaPagina`), e trocar a URL derruba junto o `driveFileId`
  antigo, que levaria o assunto errado do catálogo.
- 🔴 **O casamento post↔arte é por URL EXATA, nunca pelo prefixo do nome do
  arquivo.** `renderPostArt` nomeia por POST (`<postId>-<epoch>.png`) e o
  compositor por PÁGINA (`<pageId>-<epoch>.png`); supor uma coisa só produziu
  9 falsos "página que não existe mais" no diagnóstico. A URL do Blob tem
  sufixo aleatório, então a igualdade é inequívoca.
- **A troca é cirúrgica**: `montarNovasMidias` (o mesmo de
  `trocar-arte-do-post`) troca UMA posição, com compare-and-swap sobre o array
  inteiro. A contagem de mídias nunca diminui. O alcance é o MESMO da
  invalidação — `DRAFT`/`SCHEDULED`, `laterPostId: null` —, e post que a
  invalidação atende é pulado (`alcancadoPelaInvalidacao`), senão as duas
  trocariam a mídia uma da outra.
- **`headline2` volta a ser `headline` na spec.** `comporPeca` parte a
  manchete em duas vozes quando a assinatura tem `headline2`; devolvê-lo como
  papel faria `validarSpec` recusar a peça inteira e o slide continuaria com o
  texto velho.
- **A RECUSA (`TEXTO_NAO_CABE_NA_COLUNA`) não vira log.** Ela é correta — a
  linha não cabe na coluna nem a 80% da fonte —, e fica gravada em
  `Generation.fieldValues.recusaDaRecomposicao` (chave própria, por merge,
  nunca substituição — ver abaixo) **e** no histórico de cada post afetado,
  com o orçamento de caracteres. Em geral a arte continua sendo a antiga, e
  quem editou decide; quando a MESMA rodada já trocou o PNG antes de falhar (a
  página mudou durante o render), a recusa grava `arteTrocada: true` e o
  histórico do post diz que a imagem já foi trocada. Nada regenera sozinho
  além disso.
  🔴 **E a recusa NÃO substitui o registro do re-render** (C6-01 da
  pré-revisão do HEAD f0eee811, 12/09/2026): ela mora em
  `fieldValues.recusaDaRecomposicao` (`em`, `erro`, `errorCode`, `detalhes`),
  gravada pelo merge raso de `mesclarFieldValuesDaArte`, e não toca
  `recomposicao`. Gravar `recomposicao: registro('recusada')` trocava o
  registro INTEIRO enquanto o PNG re-renderizado ficava — apagava
  `estado: 're-renderizada'`, o marcador `copyVisualRegravada` e
  `urlsAnteriores`, e os leitores voltavam a confiar no snapshot e na copy de
  OUTRA versão da mídia (R13/R37/R38/R42 do PR 6). Recusa é comum (texto que
  não cabe, página que virou modelo, tentativas esgotadas com o Blob fora). O
  próximo registro de sucesso (`feita` ou `re-renderizada`) grava
  `recusaDaRecomposicao: null`. Nasceu num commit de integração no branch do
  PR 6 e **desceu para o PR 0 por cherry-pick em 12/09/2026** — o PR 0 é o
  dono. Linha que já
  foi recusada antes disso perdeu o registro do re-render, e ele não se
  reconstrói.
- **A fila é a de sempre (`kind: COMPOR`), com o `generationId` da arte que já
  existe** — uma peça tem uma arte, e a fila tem um job por arte.
  `enfileirarRecomposicao` REABRE job já terminado (diferente de
  `enfileirarComposicao`, cujo `update: {}` engoliria a edição seguinte em
  silêncio) e **não carrega spec**: ela é lida da arte na hora de executar, o
  que faz o job trabalhar sempre sobre a versão mais nova. O runner LANÇA na
  falha definitiva (é o que faz `executarJob` gravar `falharJob` com o
  motivo); `fecharJob` sozinho leria a Generation COMPLETED e diria DONE.
- **O PATCH só ENFILEIRA.** Refazer a arte leva dezenas de segundos e aquele
  PATCH é o autosave. Medido em 04/09: o levantamento custa ~1,4s (duas idas
  ao banco) e roda dentro de `after()`.
- **A varredura por conteúdo é `scripts/recompor-artes-defasadas.ts`**
  (dry-run por padrão), e é ela que pega o que já está parado: post da agenda
  → `mediaUrls` → Generation → página → texto contra o snapshot.
- ⚠️ **Arte sem `layersSnapshot`** — a de `arte-rapida`, a do canvas de design
  (`upload-creative`) e tudo anterior ao compositor — não tem como ser
  conferida por conteúdo, e toda mudança visual nela cai no re-render puro
  (não dá para afirmar que está em dia, e refazer é barato perto de publicar o
  texto velho).
- 🔴 **"Sem snapshot" NÃO é o mesmo que "exposta", e o relatório precisa
  separar as duas.** Página sem CAMADA DE TEXTO — a do canvas de design, que é
  uma imagem em tela cheia com a copy dentro do PNG — não tem copy editável, e
  o defeito não se aplica a ela. Medido em 04/09/2026: as **53** páginas sem
  snapshot da carteira eram **todas** assim (`source: arte-enviada`, zero
  camadas de texto, nenhuma com `slotValues` de régua). Contá-las como "não
  deu para conferir" fazia o relatório soar alarmante sem nada a alarmar — e
  convidava a "consertar" 53 peças agendadas re-renderizando arte que
  `importarArte` guarda intacta de propósito ("os bytes enviados viram o
  `resultUrl` tal e qual").
- **Placar da carteira em 04/09/2026** (`--dias 30`, 145 posts, 160 páginas):
  **0 defasadas**, 36 congeladas conferidas contra o snapshot e em dia, 71
  atendidas pela invalidação (imagem única), 53 sem texto editável, **0 sem
  como conferir**. As 11 do projeto 8 já tinham sido consertadas na mão — o
  zero é a confirmação disso, não a ausência do problema.
- ⚠️ **Depois de uma recomposição, `reverter-arte` volta para a peça
  RECOMPOSTA**, não para a composição original: o snapshot é atualizado junto.
  É o que se quer (reverter desfaz o ajuste manual, não a edição de copy),
  mas a entrega original deixa de ser alcançável.
- ⚠️ **A recomposição REESCREVE `Page.layers`** (sem isso o editor e a arte
  publicada divergiriam para sempre). Enquanto a pessoa continua digitando, o
  autosave dela escreve o estado do navegador por cima da geometria recomposta
  e enfileira outra rodada; converge quando ela para de digitar.
- **`fieldValues.recomposicao.urlsAnteriores` guarda as últimas 5 URLs da
  arte.** Refazer sobrescreve `Generation.resultUrl`, e um post que perdeu o
  compare-and-swap ficaria com uma URL que nenhuma Generation tem mais —
  invisível para toda varredura seguinte. O rastro é o resgate.

### O compositor sem halo: gradiente de leitura e destaque com [colchetes] (11/09/2026)

Decisão do Ciro: "prefiro que deixe de usar o halo, e aprenda a usar o gradiente
de forma sutil", e destaque de palavra-chave com rich text, marcado na copy com
`[]` ("sem marcação a peça sai sem destaque"). Vale para TODA peça do
compositor — `compor-arte`, `compor-leva`, a fila COMPOR, o `executar-plano`
via compor, o Gerar da bancada e a recomposição —, porque todos terminam em
`comporPeca`. Módulos puros com teste: `src/lib/compositor/gradiente-de-leitura.ts`
e `destaques.ts`.

- **Uma camada de gradiente por BORDA que tem texto**; topo e rodapé em camadas
  INDEPENDENTES (pedido explícito). A faixa vai da borda até ~1,9× o alcance do
  texto mais distante, presa entre 30% e 62% da altura e nunca terminando antes
  do texto; a força (opacidade na borda) é a necessidade medida sob o texto,
  dentro de [0,45; 0,9]. Sem foto, sem gradiente. Números em
  `Project.assinatura.gradiente` (JSON, sem migration).
- **Código, e não os templates de gradiente**: a usina compõe sem ninguém
  escolher camada, e o gradiente precisa nascer onde o texto pousou — o que só
  se sabe depois de medir a foto. Os templates são GABARITO: a curva padrão é a
  `CURVA_REAL` que a Roberta mediu (template 427), normalizada para a faixa. A
  COR, nesta ordem: camada de gradiente na página de assinatura (a equipe
  desenha; manda também na curva) → `Project.assinatura.gradiente.cor` → o
  gradiente da marca que contrasta com o texto (`GRADIENTES_POR_PROJETO`, hoje
  só a Real) → a mancha.
- 🔴 **O fundo de texto da página de assinatura NÃO é mais copiado, e o
  `halo-marca` saiu.** As 10 páginas ainda têm halo ligado em todos os papéis
  (medido em 11/09) — é lido só para diagnóstico. `Project.assinatura.halo`,
  `diagnostico.halos` (sempre vazio) e os valores antigos de
  `tratamentoDeTexto` ficam aceitos como legado; nenhum devolve o halo.
- **A régua corrige a FORÇA do gradiente da borda** (uma vez, dentro da faixa),
  não mais a opacidade do fundo. E mede rich text: apaga a cor dos TRECHOS
  também, senão o destaque contava como fundo.
- Logo numa borda sem texto, sobre canto claro (necessidade > 0,5), ganha um
  gradiente fraco (metade da necessidade) — é o que substituiu o halo-marca.
- **Destaque**: `[palavra]` numa linha da copy → o bloco sai como camada
  `rich-text`. Estilo: a camada rich-text do papel na página de assinatura
  (primeiro trecho que difere da base) → `Project.assinatura.destaque`
  (`{ fill, fontFamily, pesado }`); `pesado` escolhe a versão mais pesada da
  MESMA família do papel entre as fontes cadastradas (`familiaMaisPesada`: ~300
  acima, ao menos Medium — é o que a equipe fazia à mão). Sem estilo, sai texto
  comum com aviso; sem colchetes, sem destaque. Regra em `destaqueDoPapel`.
- 🔴 **Papel que JÁ É da cor de destaque não destaca nada** — o CTA vermelho do
  Espeto, a manchete dourada do Empório. Medido em 11/09: 8 dos 10 clientes têm
  papel da cor de destaque em alguma variante. Distância RGB < 90 usa
  `destaque.alternativa` (também da paleta); sem ela fica só o peso, e sem peso
  nada. Semeado por `scripts/semear-destaque-da-marca.ts`.
- 🔴 **O renderer de rich text IGNORA `effects.shadow` da camada** e só desenha
  sombra por trecho: com sombra na assinatura, os trechos cobrem o conteúdo
  INTEIRO. E o medidor do servidor não mede rich text: a altura sai do texto
  simples (mesmo corpo e entrelinha) e a largura soma o quanto os trechos
  alargam na família pesada — sem isso a linha que "cabia" transbordava.
- 🔴 **Os colchetes são marcação e saem em todo caminho que desenha texto
  simples**: `startArtGeneration` (IA), `decidirGeracao`, `mapearCopyParaSlots`
  (template), o nome da página e o `diff-copy` do aprendizado (senão toda copy
  aceita como veio contaria como editada). Na volta, `specComACopyDaPagina`
  reconstrói os colchetes a partir do rich text (`linhasComColchetes`) — sem
  isso o destaque sumiria na primeira edição de texto. `copyParaBlocos` não
  conta os colchetes no teto nem corta a linha dentro de um.
- **Quem escreve a copy marca**: instruções do conector, descrições de
  `compor-arte`, `compor-leva`, `criar-plano` e `editar-item-do-plano`, e o
  prompt da dica de copy (safra `dica-copy-v2`).
- ⚠️ Rich text não passa pelo autofix de colisão (`text-geometry` só enxerga
  `text`): o compositor empilha pela própria medida. Escritor NOVO de camada
  rich-text precisa medir a altura sozinho.
- ⚠️ **Em produção desde 11/09/2026** (merge 6f1ebed7), junto com a troca da
  assinatura do Quintal e do TERO pelos modelos da marca — o Ciro autorizou
  subir antes de revisar as 10 amostras de gradiente, que continuam nas pastas
  "AMOSTRA · Gradiente e destaque — não agendar". As primeiras peças compostas
  de cada cliente são a revisão que falta.

### Combinações de texto no compositor: papel, elementos e logo no grupo (11/09/2026)

Pedido do Ciro: o compositor aproveitar da assinatura também ícones, filetes e
outros elementos, usando (e editando) as combinações de texto da aba Texto. Até
aqui a usina lia só texto, logo e gradiente da página de assinatura; o resto
ficava para trás. Plano em `docs/PLANO-2026-09-11-COMBINACOES-NO-COMPOSITOR.md`,
núcleo em `src/lib/compositor/combinacoes.ts` (puro, com teste).

- **Um grupo de texto é um ARRANJO**: o grupo da página de assinatura (Cmd+G) ou
  uma combinação salva. Carrega o estilo de cada texto, o vão vertical antes de
  cada um e os ELEMENTOS presos a cada texto. O compositor continua escolhendo
  onde o bloco pousa pela foto; o arranjo diz como ele é por dentro.
- **Só serve à usina texto com PAPEL** (`pre`, `headline`, `headline2`, `apoio`,
  `cta`, `servico`): `metadata.compositor.papel` (o painel grava), o nome da
  camada ou o rótulo. Combinação com algum texto sem papel fica de fora — é o
  que mantém o catálogo base ("Sabor de Verdade") longe das peças até alguém
  revisá-lo.
- **O elemento se mede pela TINTA do texto, nunca pela caixa**: na página a
  caixa costuma ser larga, e na peça ela é justa. `lado` (`antes`, `depois`,
  `acima`, `abaixo`) + `eixo` (`inicio`, `centro`, `fim`) dizem a que borda ele
  se prende (`caixaDoOrnamento`); preso à base, o filete acompanha o texto que
  cresce. Forma do editor guarda o MOLDE da camada + `tamanhoDaCamada` + `ajuste`
  (o Konva gira em torno da origem, então a caixa visível ≠ posição), e a logo no
  grupo vira elemento com `logo: true` — a peça não ganha outra no canto.
- **Associação pela geometria** (`associarIcones` / `associarOrnamentos`):
  imagem à esquerda, na faixa do texto, é o ícone; o resto na mesma faixa (centro
  dentro da caixa ou metade da altura do menor sobreposta — o divisor vertical é
  mais alto que a linha) é `antes`/`depois`; fora dela, o texto mais perto na
  vertical, e entre dois a distâncias parecidas fica o de BAIXO (o filete some
  junto com o apoio que falta).
- **Elemento ao lado de uma linha que a peça não tem sai** (o alfinete da
  segunda linha do serviço quando só há horário). Papel com vários textos (Local
  + Horário) recebe uma linha por texto, casando horário com relógio e endereço
  com alfinete (`blocosDeServico` + pistas do ícone) antes da ordem; na volta,
  `copyDosPapeis` junta os textos do mesmo papel de cima para baixo.
- **Escolha** (`escolherArranjo`): o grupo da página e as combinações que cobrem
  os papéis do grupo; −1 por papel sem copy, +3 por palavra do tema no nome,
  empate em rodízio pela chave da peça. Os arranjos usados ficam em
  `spec.preferencias.arranjos`: a recomposição refaz A MESMA peça.
- **Elementos entram DEPOIS do autofix**, presos à caixa final (o autofix pode
  encolher a fonte), e o gradiente de leitura cobre o grupo com eles.
- **O gradiente de cada borda segue a camada que a página desenhou naquela
  borda** (`bordaDaCamadaDeGradiente`: segmento explícito ou ângulo; 169° topo,
  11° rodapé). Ler só a primeira camada prendia o rodapé à força do topo.
- 🔴 **As margens derivadas da página saem da METADE em que cada texto mora.**
  Página com todo o texto no rodapé dava `safeTopo` de 1281 px.
- **Provar antes de a usina usar**: `comporPeca(spec, { provar: true,
  paginasDeAssinatura: [ids] })` compõe com páginas em espera sem gravar nada —
  `scripts/provar-combinacoes-no-compositor.ts`. Nunca em produção.
- 🔴 **O editor ANTERIOR a este deploy descarta os campos novos** ao salvar uma
  combinação (o zod antigo stripa `papel`, `ornamentos`, `destaque`). Combinação
  gravada com eles não pode ser editada no app antigo — grave os dados da usina
  junto com o deploy.
- 🔴 **O vão entre os textos de um grupo vem da página, e página que DESENHA POR
  CIMA não tem vão.** As variantes Promoção, Rodapé e Topo do Espeto guardam a
  manchete inteira ("COSTELA⏎NO BAFO") na caixa da voz 1 e põem a voz 2 sobre a
  última linha. Lido ao pé da letra, isso é um vão de −75px, e na peça, em que
  cada voz tem só as suas linhas, as duas se sobrepunham: TEXTO_NAO_CABE nas três
  variantes. `vaoDaPagina` aceita sobreposição de até meia linha (lockup
  apertado); além disso devolve `null` e a peça usa o ritmo da casa (a voz 2
  encosta na 1), como o compositor sempre fez. Pego pela prova das assinaturas
  de TODOS os clientes antes do merge — com os modelos do Quintal e do TERO
  sozinhos, não aparecia.

### A assinatura do Quintal e do TERO são os modelos da marca (11/09/2026)

Os modelos recriados no editor a partir das artes de referência (Quintal 3,
TERO 7) viraram as variantes de STORY da usina, por decisão do Ciro, no mesmo
deploy do compositor de arranjos (PRs #119 e #121). Troca feita por
`scripts/trocar-assinatura-pelos-modelos.ts` (dry-run por padrão).

- **As páginas foram MOVIDAS para o template "Assinatura", não copiadas.** A aba
  Modelos lista as páginas-modelo de TODOS os templates do projeto
  (`/api/templates/[id]/template-pages`), então a cópia apareceria duas vezes, e
  as duas versões divergiriam na primeira edição. Com uma página só, editar o
  modelo no editor é editar a assinatura. Os templates "Modelos da marca" (457 e
  458) ficaram vazios.
- **As stories antigas foram arquivadas, nunca apagadas**: template
  "Assinatura — arquivada em 11/09/2026", categoria
  `__system_assinatura_arquivada__` (seção Arquivo da aba Templates; a listagem
  só esconde a categoria do export do Konva), páginas com `isTemplate: false` e a
  tag `assinatura` trocada por `assinatura-arquivada`. Voltar atrás é mover as
  páginas de volta.
- **As páginas de feed ficaram**: os modelos são só story. A de feed do Quintal
  se chama "Assinatura — story" e mesmo assim é lida como feed, porque
  `formatoDaPagina` testa o TAMANHO de feed (1080x1350) antes do nome "story".
- 🔴 **A troca só vale com o compositor de arranjos no ar.** O código anterior
  lia papel só de `type === 'text'`: o serviço e o apoio em rich-text dos modelos
  sumiam da escolha de variante, e ícones, filetes e a logo do grupo eram
  ignorados. Página de assinatura com elemento ou rich-text não pode voltar para
  um deploy anterior ao #121.
- ⚠️ **O script que recriou os modelos (`recriar-modelos-da-marca.ts`, fora do
  repo) procura as páginas no template "Modelos da marca" pelo nome.** Rodado de
  novo, ele RECRIA os modelos lá em vez de atualizar os que estão na assinatura.
- **Provas**: `provar-combinacoes-no-compositor.ts --assinatura` prova as páginas
  que a usina lê hoje, cada uma com a copy dela (página de feed prova peça de
  feed); `--paginas` prova páginas em espera. Antes do merge rodaram também as
  últimas peças reais de cada cliente, recompostas com a spec gravada: 47 de 50.
  As 3 recusas eram do Wine Vix e já aconteciam em produção — copy com `apoio`
  de 04/09 e a página de story editada sem apoio horas depois. Recusa por papel
  que a variante perdeu não é regressão do compositor: é a página que mudou.
- ⚠️ A prova tira a copy da própria página. Em página que desenha a voz 2 por
  cima da manchete, a manchete da prova sai com a última linha repetida — é
  artefato da prova, não da usina (a copy real chega com as linhas uma vez só).

### A peça segue o modelo ajustado: lado, margens, peso e encaixe (11/09/2026)

O Ciro ajustou os modelos do Quintal e do TERO no editor, e a comparação
`provar-combinacoes-no-compositor.ts --assinatura --comparar` (o modelo
renderizado como está, ao lado da peça com a mesma copy e a mesma foto, e a
tabela papel a papel de posição, corpo e cor) mostrou seis divergências. Cinco
eram da usina:

- 🔴 **A preferência de posição NUNCA valia o lado do modelo.** Em
  `candidatosDePosicao` só o ALINHAMENTO vinha da página; a âncora seguia
  sorteada pelo rodízio, e como a preferência de 0,6 pede as duas, o lado do
  modelo pontuava 0,30 como os outros. Medido: o Almoço executivo do Quintal
  (esquerda no modelo) perdia para a direita por 0,469 × 0,438; o do TERO, por
  0,666 × 0,660; o feed do Quintal (centro), por 0,823 × 0,794. Hoje a âncora
  da página entra no rodízio; o sorteio só completa o que a página não diz. Os
  pesos do mapa não mudaram — a foto ainda vira o lado quando o outro é
  claramente melhor ou cobre o assunto.
- 🔴 **A margem de baixo NÃO conta a logo solta no canto.** Ela conta os textos
  e os elementos que moram no grupo deles (ícone, filete, a logo ao lado do
  serviço). No "Convite do dia" do Quintal a logo terminava 32 px abaixo do
  CTA: o grupo descia até encostar nela, e ela fugia para o canto de cima.
- 🔴 **A margem lateral é a do lado em que o texto alinha, e cada grupo leva a
  sua.** A caixa larga de um texto alinhado à esquerda chega perto da borda
  direita sem que a tinta chegue — o endereço do Happy wine dava 40 px e o bloco
  todo encostava na esquerda, 47 px além do modelo. E uma margem só para todos
  os grupos punha o serviço com ícone do Happy hour 18 px para dentro. Hoje a
  margem de cada grupo de página é a caixa dos textos dele na borda em que
  alinham, menos o quanto os elementos passam da tinta (`margemDoGrupo`);
  virado pelo mapa, leva a mesma distância à borda oposta.
- 🔴 **O peso da fonte chega como TEXTO do editor** (`"100"`, `"bold"`), e
  `estiloDaCamada` só lia número: o "HOUR" em Montserrat 100 do Happy hour saía
  no peso normal.
- 🔴 **A regra de vão do Espeto (sobrepor mais de meia linha = sem vão) desfazia
  encaixe legítimo**: o "quintal" em script entra 44 px em "é dia de" no
  Convite do dia, e descolava 55 px. Hoje só é "desenhado por cima" o texto que
  REPETE uma linha do anterior ou COMEÇA numa delas; o resto mantém o vão da
  página, com teto de meia altura.
- 🔴 **Encaixe de desenho não é colisão.** O compositor marca a camada com
  quanto a página sobrepõe (`metadata.compositor.encaixe`), e `checkTextGeometry`
  soma isso à tolerância vertical entre textos do MESMO grupo. Sem a marca, o
  autofix encolhia a manchete até desfazer o encaixe ("Almoço" 88 → 77 px;
  "Sexta é dia de" 97 → 93). Entre grupos diferentes a marca não vale nada.
- ⚠️ A sexta divergência era da PROVA: a camada "headline Copy" do feed antigo
  do Quintal é a segunda voz para a assinatura (`papelDoNome`), mas
  `copyDosPapeis` da defasagem só aceita o nome exato do papel, e a copy da
  prova saía sem "Quintal".
- **A logo da página é conferida contra a caixa de cada TEXTO**, não contra o
  retângulo do grupo: a linha longa do serviço esticava o retângulo do rodapé
  do Convite do dia até a logo, e ela ia para o canto de cima.

Depois do deploy, a recomposição das peças reais (`scripts/recompor-pecas-reais.ts`,
rodada antes e depois, folha contra folha) pegou mais três coisas:

- 🔴 **O canto gravado na spec (`cantoDaMarca`) cai quando encosta no texto.** O
  chat grava canto em boa parte das peças (30 dias: Bacana 38 de 39, Quintal 21
  de 32, Real 7 de 31), e `escolherCanto` obedecia o pedido mesmo colidindo:
  sem canto livre na lista do pedido, devolvia o próprio pedido. Com o lado da
  página valendo, a variante da Real alinhada à direita pôs pré-título e
  manchete debaixo da logo "Real" do canto de cima. Hoje o pedido que encosta
  cai com aviso, e vale a posição da página e depois o canto livre.
- 🔴 **Recompor fixa a posição original** (`specComAPosicaoOriginal`): âncora e
  alinhamento de `fieldValues.composicao.posicao` entram na spec da
  recomposição, a não ser que ela já peça posição. Sem isso, a primeira edição
  de texto de uma peça composta antes de 11/09 mudaria o lado do bloco.
- 🔴 **Caixa alta de modelo é PROPRIEDADE da camada, não texto digitado em
  maiúsculas.** Os 7 modelos recriados do TERO traziam o exemplo escrito em
  caixa alta sem `textTransform`; a usina copia o estilo, não a caixa do
  exemplo, e depois da troca as manchetes saíram em caixa mista — a assinatura
  antiga tinha `uppercase` em pré-título, manchete, apoio e CTA. Corrigido nos
  dados (uppercase só nas camadas já escritas em caixa alta). Quem recriar
  modelo marca `textTransform: 'uppercase'` onde a referência usa caixa alta de
  propósito.
- ⚠️ **A prova dos modelos não pega esse tipo de regressão**: ela compõe com a
  copy da própria página, que já vem em maiúsculas. Troca de assinatura pede
  também a recomposição das peças reais com a spec gravada, antes e depois.

### A Real ajustada: recuo no grupo, vão entre grupos e a régua por texto (11/09/2026)

O Ciro ajustou os seis modelos da Real Gelateria (template 461, em espera), e a
mesma comparação (`--comparar`) mostrou divergências que eram todas da usina,
nenhuma dos modelos:

- 🔴 **Texto recuado dentro do grupo saía rente.** Na segunda, "Funcionamento"
  começa em x=70 e as unidades em x=160, ao lado dos ícones; `posicionar` punha
  todo texto do grupo no mesmo x, e como o ícone passa 86 px da tinta, a margem
  do grupo caía no piso de 24: as três linhas saíam em x=116 e os ícones a 30 px
  da borda. Hoje `arranjoDasCamadas` grava o `recuo` de cada texto (da tinta até
  a borda em que o grupo alinha; só texto alinhado como o grupo; até 2 px é arraste
  e não conta — 3 px já pode ser alinhamento ótico, como o apoio 7 px para
  dentro da manchete serifada no Feriado do TERO), e `empilhar(blocos, gap, lado)` monta a pilha
  recuada, em que o ícone que mora no recuo não empurra a coluna. O recuo vale
  no lado em que o grupo alinha na página; virado pelo mapa, o grupo sai rente.
  🔴 **Recuo que abriga elemento SOLTO não vale**: a peça só desenha elemento
  de grupo, e na assinatura antiga da Real o relógio está fora do grupo — o
  serviço entrava 47 px sozinho, com o vão vazio. O ícone no grupo (a segunda
  dos modelos) mantém o recuo; solto, ele é zerado.
- 🔴 **O vão entre dois grupos era o ritmo fixo de 1,6 gap, não o da página.** Na
  terça o apoio ficava a 24 px de "Funcionamento" (61 no modelo, Δy=+37); a
  segunda subia 14 px e a quarta 5. Hoje o arranjo guarda a `faixaDaTinta` (do
  topo da primeira tinta à base da última) e o vão entre dois grupos da MESMA
  borda é o da página, descontado o que os elementos passam das pilhas. Bordas
  diferentes, página de outro formato, sobreposição ou vão maior que um quarto
  da altura ficam no ritmo da casa. Era o resíduo de "Δy entre grupos" que as
  comparações do Quintal e do TERO já mostravam.
- 🔴 **A margem do grupo nunca chegava ao principal.** `margemPara` foi declarada
  em `candidatosDePosicao` (f9c24278) e não era usada: o principal caía na
  margem da assinatura, a do texto mais rente da página inteira. Na Real batia
  por coincidência, porque o principal é o grupo mais rente em todos os modelos.
- 🔴 **A régua mede cada TEXTO, não a união do grupo.** Com o recuo certo, a
  segunda passou a acusar "foto clara demais" no próprio modelo: o marrom de
  "Funcionamento" (alvo 69) era julgado pelo pires claro que só passa sob as
  linhas creme. E o dourado da segunda voz do Dia dos Pais (luz 132) sobre o
  creme era medido como texto CLARO, com alvo 0, porque o corte de texto escuro
  era fixo em 128. Hoje cada camada tem o próprio retângulo, o próprio sentido
  (escuro quando a mancha é clara e o texto é 48 mais escuro que ela) e o
  próprio alvo; o grupo vale o pior, e a força do gradiente se corrige pelo
  texto claro mais longe do alvo.

Medido. Real (`--comparar`, 6 modelos): antes 3 de 6 peças fora do modelo
(Δy de −14, +37 e −5; serviço da segunda em x=116); depois as 6 com Δx = Δy = 0
em todos os papéis. TERO (8 páginas): Δy = 0 em todos os papéis menos o apoio do
Happy hour (−3), com o recuo ótico seguindo o modelo. Quintal (3 stories): Δy = 0.
Peças reais recompostas (últimas 5 de 10 clientes, geometria por camada antes ×
depois): 36 iguais e 11 mudaram, todas para a posição da página (Wine Vix
pré-título 55 → 70; TERO apoio +7 e serviço +13 pelo vão da página; By Rock −6 e
Lagosta +20 pela margem do grupo); as 3 recusas antigas do Wine Vix nos dois
lados; nenhum aviso novo e 12 a menos (invasão de margem e "foto clara demais"
falsos). ⚠️ Sobra um aviso real: o dourado da segunda voz do Dia dos Pais sobre o
creme fica abaixo de 3:1 onde a foto escurece — é o desenho do modelo.
