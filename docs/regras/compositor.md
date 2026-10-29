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

## Tratamento de leitura por borda (CP2A, 14/10/2026)

Antes, UMA cor de véu servia à peça inteira: a que mais distava da luz de todos
os textos (`corQueContrasta`), sem olhar o fundo. Toda borda com texto ganhava
véu, com força mínima 0.45 mesmo sem necessidade. Na peça piloto da Real, o
véu creme que servia ao texto escuro do topo clareava o fundo do serviço claro
do rodapé (p98 166 → 194).

Agora (`tratamento-de-leitura.ts`, chamado no passo 7c do `comporPeca`):

- **O tratamento é decidido por borda, com os grupos onde o layout os pôs.** O
  CP2A não move nada: a pontuação de posição continua usando a cor global de
  antes.
- **O fundo é medido sob cada texto, sem tratamento** (`medirFundoDosTextos`,
  o mesmo render e a mesma leitura da régua):
  - texto claro precisa de p98 ≤ `alvoPorContraste`;
  - texto escuro precisa de p02 ≥ `alvoClaroPorContraste`.
- **A polaridade é `polaridadeDoTexto`.** É a MESMA regra para quem escolhe o
  tratamento, quem detecta a piora (CP1) e quem mede (o `sentido` da régua),
  para que nunca se contradigam:
  - pelo fundo quando ele não deixa dúvida (e o lado lê — `ladosDeLeitura`);
  - pela classe WCAG da cor quando o fundo atravessa a luz do texto.

  A luz do texto e a do véu são lidas no **espaço da medida** (`luzMedida`, a
  luminância WCAG codificada em sRGB, a do `b-w` do sharp), não na luma Rec.601
  de `luzDaCor`: #FF0000 dá 76 numa e ≈124 na outra, e o vermelho saturado
  virava "escuro" e ganhava véu claro.
  - ⚠️ A cor de luz média (vermelho, laranja) segue essa regra: sobre foto
    clara, o vermelho escuro (By Rock `#dc0909`) não pede véu e lê como escuro.
  - **Emenda do CP0 (decisão do owner, 14/10/2026):** o oráculo das
    propriedades (`polaridadeDoOraculo`, em `suporte/propriedades.ts`) também
    é contextual. Antes ele usava a cor isolada (`textoEscuro`, luma < 128),
    premissa errada para cor de luz intermediária. A regra é reescrita por fora,
    só com luminância e razão de contraste, sem importar `polaridadeDoTexto`
    (seria circular); um teste confere essa independência. A mesma cor
    (#dc0909) lê pelo lado claro sobre foto escura e pelo escuro sobre foto
    clara.
- **Decisões do owner (14/10/2026):**
  - o tratamento explícito da assinatura é preservado, mas não fica isento:
    a piora é diagnosticada, e o gate autônomo poderá julgar a peça não apta;
  - `BrandColor` fica fora do véu automático até haver papéis explícitos.
- **Sem necessidade, nenhum véu automático.** O piso 0.45 só vale quando há
  necessidade.
- **Textos claro e escuro sem leitura na mesma borda tornam a ESTRATÉGIA
  inviável**, não a peça: o motivo é `POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA`,
  vai para o diagnóstico e gera aviso. O CP2A **nunca** emite `SEM_COMBINACAO`;
  isso só depois de posição e tratamento esgotados.
- **A cor da candidata tem de ficar do lado legível do ALVO** de quem pede
  leitura (≤ alvo do texto claro, ≥ alvo do escuro). Assim nenhum pixel do
  fundo passa de legível a ilegível.
- **Uma candidata que, no pior caso previsto, piora algum texto que o véu
  alcança não vence** (o contrato do CP1, `pioraDaLeitura`), inclusive texto
  da outra borda na cauda da faixa.
  - O que a régua provar pior, medido com e sem o véu, sai da peça
    (`gradientesARecusar`). Com vários véus sob o texto, sai o automático que
    empurra o fundo contra ele. Se o explícito do template também estiver ali,
    o automático que ajuda fica.
  - A correção de força da régua que cria piora volta só nos véus envolvidos.
- **A logo de uma borda de texto que ficou sem véu** mantém a regra da borda só
  com logo (a logo inteligente é do CP3). O véu dela entra na regra 7.
- **Na seleção**, o contraste que falha num texto cuja borda ficou sem
  estratégia (inviável ou recusada) é `pendentesDePosicao`, não impedimento:
  não vira `SEM_COMBINACAO`.
- **Sem a medida do fundo, nenhum véu automático de texto** (`nao-medido`, com
  aviso): a regra antiga de uma cor só não volta.
- **A pontuação de posição usa a cor global de antes** (o primeiro gradiente da
  página, de qualquer forma): o CP2A não move grupo nenhum, nem quando a
  página tem gradiente decorativo.
- **As cores candidatas vêm das fontes estruturadas da assinatura:**
  - o gradiente de leitura da página;
  - `gradiente.cor`;
  - a mancha.

  `GRADIENTES_POR_PROJETO` é **LEGADO**: não expandir, e só entra como último
  recurso. O escuro de cada linha é a própria mancha, então na prática só o
  claro ainda sai dali.
  - `BrandColor` não entra: em 14/10/2026 as paletas eram cores de acento sem
    papel (vermelho, laranja, amarelo, verde), e um véu amarelo seria decisão
    estética.
  - Quando houver pares de leitura estruturados, eles entram antes do legado.

**Gradiente de leitura ≠ decorativo.** Um gradiente da página de assinatura só
vira tratamento quando tem a forma de um (`ehGradienteDeLeituraDaPagina`):
- marcado como tratamento;
- ou com tudo isto:
  - linear, de eixo quase vertical (até 30°) e sem rotação;
  - cobrindo a largura da página;
  - preso à sua borda FORTE (folga de 2%), com opacidade ABSOLUTA de pelo
    menos 0.3 ali e perto da máxima da camada (a mais fraca de produção é 0.55,
    TERO);
  - transparente (≤ 0.05) na ponta oposta.

Radial, lateral, diagonal, faixa parcial, tinta uniforme e faixa solta no meio
são decorativos: não mandam na cor e não são removidos (nunca foram copiados
para a peça).

`bordaDaCamadaDeGradiente` segue o render: sem ângulo, 0° (começa embaixo), e o
segmento só vale com os quatro números.

Medido em 14/10/2026: os 21 gradientes das páginas de assinatura em produção
(Quintal, TERO, Wine Vix e mais um) têm a forma de leitura. Os 7 com segmento
explícito têm o eixo vertical. A borda cuja camada
de gradiente a página desenha é o **tratamento explícito do template**: é
reproduzida como sempre (cor e força), sem a regra de necessidade zero e sem
troca de cor. A piora dela só é acusada (CP1).

**Decisão arquitetural FUTURA (pesquisa Canva/editor, 14/10/2026). Não está em
código:**
- os arquétipos serão definidos em código;
- o compositor materializa uma Page normal;
- as posições respeitam as zonas do arquétipo;
- a foto decide a posição final dentro da zona;
- assinatura e arquétipo NÃO podem virar duas fontes concorrentes.

O CP2B (separar polaridades no espaço) deve nascer dessas zonas.

## Catálogo de arquétipos minimalistas (T0, 14/10/2026)

A decisão futura acima ganhou o contrato, ainda **sem ligação com o compositor**:
`src/lib/compositor/arquetipos/` traz 3 modelos (`minimal-fb-topo-esquerda`,
`minimal-fb-base-esquerda`, `minimal-fb-centro-optico`), cada um em story e feed, com referência
e zona em frações, e um validador puro.

- 🔴 **Versão publicada é imutável**: o teste fixa a impressão de cada `id@versao`. Qualquer mudança
  é versão nova, publicada ao lado; a antiga nunca sai do catálogo.
- A área segura é lida de `NUMEROS_PADRAO.geometria`, nunca copiada para o arquétipo: ela RECORTA
  a zona, e o validador só confere que o recorte comporta a caixa.
- As preferências do arquétipo (`ancora`, `alinha`, `cantoDaMarca`) têm de concordar com a
  geometria (`PREFERENCIA_INCOERENTE`): nem dentro do arquétipo há duas fontes de posição.
- O arquétipo não guarda fonte, cor nem cliente.

Detalhe e próximos passos (T1a, T1b, CP2B) em `docs/design/arquetipos-minimalistas-v1.md`.

## Arquétipo na spec e no compositor (T1a, 14/10/2026)

`spec.arquetipo` liga o catálogo do T0 ao compositor, ao `medir-copy`, à fila, à recomposição e ao
MCP (compor-arte, compor-leva, medir-copy; o ver-assinatura lista os arquétipos e a
disponibilidade). É **opt-in**: sem `arquetipo`, nada muda, e o baseline em
`direcao-de-arte/__tests__/t1a-baseline-sem-arquetipo.test.ts` (gerado na base, antes do T1a)
falha se mudar.

- 🔴 **A peça nunca depende de "a mais recente"**: o pedido `{ id }` vira `{ id, versao, impressao }`
  na porta (compor, fila, medir-copy) e é isso que se grava. Spec com impressão é conferida
  (`ARQUETIPO_IMPRESSAO_DIVERGENTE`); a recomposição exige a versão (`ARQUETIPO_VERSAO_AUSENTE`) e
  confere antes de qualquer escrita. As recusas `ARQUETIPO_*` são determinísticas na fila e na
  recomposição.
- 🔴 **Uma fonte de geometria.** Com arquétipo, cada papel é uma unidade própria na REFERÊNCIA, e a
  assinatura dá só estilo.
  - Papéis que a página agrupa não se fundem.
  - Cada unidade tem `groupId` próprio, que a régua e o autofix leem.
  - Dentro da unidade, a ordem é a da copy, o vão é o ritmo da casa, e os ornamentos do arranjo não
    deslocam o texto (só precisam caber na zona). Âncora/alinhamento/canto da spec diferentes dos do arquétipo são recusados
  (`ARQUETIPO_PREFERENCIA_CONFLITANTE`), e a recomposição não injeta os legados
  (`specComAPosicaoOriginal`).
- 🔴 **A área segura com arquétipo é `assinatura.pisoDoProjeto`** (`NUMEROS_PADRAO` +
  `Project.assinatura`), não `numeros.geometria`: esta é reescrita pelas margens dos textos da
  PÁGINA (que chegam a 60 px do topo ou 200 px da lateral), e a página não pode competir com o
  arquétipo.
- **Sem busca e sem clamp** (é o CP2B). A caixa que não cabe na capacidade da referência é recusada
  com `ARQUETIPO_TEXTO_NAO_CABE`, que traz o orçamento.
  - A escada sancionada de 80% vale no bloco E na unidade do papel (manchete + segunda voz),
    em `prepararNoArquetipo`.
  - A caixa que não cabe na zona efetiva é recusada com `ARQUETIPO_FORA_DA_ZONA`, que traz
    referência, zona e motivo.
  - O corte da foto é o central.
  - O autofix final não encolhe peça com arquétipo: o que ele teria a ajustar é
    `ARQUETIPO_AJUSTE_FINAL`, a mesma conferência no medir-copy.
- **O medir-copy mede a mesma conta**: a coluna é a do bloco (`BlocoPreparado.coluna`), nunca
  recalculada; unidades e materialização são `arquetipos/no-compositor.ts`, as mesmas do compor.
- **Fora do T1a, recusado**: modelo com elemento obrigatório (`minimal-fb-base-esquerda`, o L é do
  T1b), formato quadrado, `cta`, camada extra / `herdaDe`, seleção experimental.

Detalhe em `docs/design/arquetipos-minimalistas-v1.md`, seção "T1a".

## Posição do arquétipo pela foto (CP2B, 14/10/2026)

Com `spec.arquetipo`, a foto escolhe, DENTRO das zonas do arquétipo, o corte e a posição de cada
**faixa**; o CP2A continua sendo o juiz do contraste. **Posição primeiro, tratamento de leitura
depois.** Sem arquétipo nada muda: os baselines `t1a-baseline-sem-arquetipo` (fotos uniformes) e
`cp2b-baseline-sem-arquetipo` (metades, faixa, região protegida, 3 cortes), gerados na base, falham
se mudar.

- 🔴 **A unidade de busca é a FAIXA**: os papéis cujas zonas se sobrepõem na vertical
  (`faixasDoArquetipo`). Topo-esquerda: {pre, headline, apoio} e {servico, logo}; centro-óptico:
  {headline, apoio} e {servico}. A faixa anda inteira com um `dy` só: ordem, ritmo e a relação
  interna da referência ficam por construção, e o serviço/logo do rodapé andam juntos.
- 🔴 **Só vertical.** O alinhamento ancora uma linha (margem esquerda, eixo central); `dx` moveria
  essa linha. Caixa que passa da zona na horizontal é recusa estrutural.
- 🔴 **A referência é preferência, não obrigação.** Até 5 candidatos por faixa (a referência, o mais
  acima, o meio rumo à referência, o mais abaixo), ≥ 16 px entre si. Quando a área segura do projeto
  corta a referência, a faixa é RESGATADA na vertical (a partida é a posição válida mais perto
  dela, com aviso). `partidaNoArquetipo` é o portão estrutural, o MESMO no compor e no medir-copy.
- 🔴 **Eliminar antes de pontuar** (`MOTIVOS_DE_ELIMINACAO`): fora da zona ou da área segura,
  ornamento fora, corte que mostra menos de 75% do assunto do CATÁLOGO (SEMPRE, haja ou não outro corte
  melhor — o catálogo é dado curado; com o enquadramento fixo, o lateral que resolve vira
  PREFERENCIA_INVIAVEL; se NENHUM corte preserva, a peça nova recusa com `SEM_COMBINACAO`, motivo
  `CORTE_PERDE_O_ASSUNTO`, e nada é persistido: a foto não serve a este formato), região
  protegida do CATÁLOGO acima do teto (0,25; textos, unidades e a logo fixa), colisão, ordem de
  leitura, hierarquia, e o plano do CP2A `inviavel` (piora, sem cor aprovada, polaridade
  incompatível).
- 🔴 **A região ESTIMADA pela energia é um PATAMAR, não recusa**: quem não a cobre (teto 0,40, o do
  revisor) vence quem cobre ANTES do custo do véu; se todas cobrem, fica a de menor cobertura, com
  aviso. Em produção o catálogo não tem caixa de assunto (o campo é texto): a estimada é a única
  proteção real — atrás do véu, a busca puxava o texto para cima do prato para fugir do véu (revisão
  adversarial). Como recusa dura, a borda de uma faixa de luz zerava fotos inteiras.
- 🔴 **Catálogo INDISPONÍVEL não é "foto sem anotação"** (Codex R2): com arquétipo, só `SEM_CATALOGO`
  (projeto sem catálogo, ou vazio) cai na região estimada; qualquer outro erro ao ler o catálogo
  recusa a peça com `CATALOGO_INDISPONIVEL` (503, transitório: a fila e a recomposição tentam de
  novo — o código não começa com `ARQUETIPO_` de propósito, senão a fila o trataria como definitivo).
  Sem arquétipo o erro segue engolido, como sempre. O diagnóstico diz de onde veio a região:
  `buscaEspacial.regiaoProtegida` = `catalogo` ou `estimada` — FATO, o mesmo de `assuntoOrigem` (o corte
  escolhido): `estimada` só quando a textura de fato deu uma região; sem foto, ou foto sem região
  estimável, o campo some (ajuste final, 14/10/2026).
- 🔴 **A foto pedida é obrigatória, e vem por UMA fonte** (Codex R3). Foto que não carregou (o
  resolvedor devolve sem URL quando o Drive falha) recusa a peça com arquétipo: `FOTO_INDISPONIVEL`
  (503, transitório) — antes ela saía sem foto, na partida, sem região nenhuma. `url` e `driveFileId`
  juntos são recusados no portão (`prepararArquetipo`, o mesmo do medir-copy):
  `ARQUETIPO_FOTO_AMBIGUA` — o resolvedor desenha a URL e o catálogo protege o ID, e fotos diferentes
  deixariam a desenhada sem a proteção dela. Foto por URL do Drive (fonte única): o id da URL é o do
  catálogo (`extractDriveFileId`, o mesmo que o resolvedor reconhece). `foto: {}` não pede foto e
  compõe pela partida. Sem arquétipo, nada disso muda.
- 🔴 **Tratamento é custo dominante.** Entre as válidas vence o menor custo de véu (tolerância
  0,05); depois a pontuação (calma 0,4, contraste natural 0,2, assunto 0,15, referência 0,15,
  corte central 0,1; tolerância 0,02); depois a mais perto da referência e o corte central. A
  estimativa usa `planejarTratamentoDaBorda` com os percentis do raster de cada corte
  (`percentisNoRect`); a borda de cada unidade é a GEOMÉTRICA da posição candidata
  (`bordaDaUnidade`, o lado de H/2), a mesma da régua e do revisor — fixar a da referência fazia a
  régua corrigir o véu errado no centro-óptico (a zona da manchete atravessa H/2).
- **Cortes**: os de `cortesCandidatos` (1 ou 3), respeitando `enquadramento: 'fixo'`. Limite
  explícito: 3 cortes × 25 combinações = 75 avaliações (`LIMITES_DA_BUSCA`).
- **Sem solução**: `SEM_COMBINACAO` (com `motivo` do CP2A quando todas caem no mesmo, e a contagem
  das recusas) só depois de esgotar cortes × posições × tratamentos; `PREFERENCIA_INVIAVEL` quando
  é o `enquadramento: 'fixo'` que impede o corte que resolve.
- 🔴 **A recomposição REPRODUZ, não busca.** A escolha (`composicao.arquetipo.buscaEspacial.escolha`:
  corte, `dy` por membro, canto da logo automática, foto) é lida por `escolhaEspacialOriginal` e
  passada em `opcoes.escolhaEspacial`, com o resumo da busca original (que o diagnóstico leva
  adiante). Um `dy` por faixa (membros que discordam, ou faixa sem nenhum `dy` gravado — a busca grava todos, zero
  inclusive —, = `ARQUETIPO_ESCOLHA_ILEGIVEL`; só a peça do T1a não grava, ela é a referência). Copy que não
  cabe na posição congelada, ou que nela invade a região do catálogo, colide ou inverte a ordem:
  `ARQUETIPO_POSICAO_CONGELADA_NAO_CABE`, nada é movido (o tratamento é do CP2A: só aviso). O corte
  congelado que passou a perder o assunto do catálogo (a anotação mudou depois) recusa com código
  próprio, `ARQUETIPO_CORTE_CONGELADO_PERDE_O_ASSUNTO`, e a saída
  "peça uma nova composição" (o histórico não manda encurtar o texto) — só na peça do CP2B: a do T1a
  nasceu no corte central com esse aviso, e a edição de texto dela segue com o aviso. A logo
  fixa que mudou de proporção vai ao dy válido dela (aviso); a logo automática congelada que
  encostaria no texto novo vai ao canto livre (aviso). Foto trocada: busca nova, com aviso. A
  identidade da foto é a impressão da URL que a peça desenha; com arquétipo, a página que mostra a
  MESMA foto desenhada (`fieldValues.imageUrl`) mantém a foto da spec — só o `driveFileId` — na
  recomposição (`specComACopyDaPagina`): o compositor o resolve na mesma URL (o cache do Blob é
  determinístico por projeto e arquivo), e o assunto do catálogo continua protegendo. Custo: a
  recomposição com arquétipo volta ao Drive; Drive fora do ar é `FOTO_INDISPONIVEL`, e a fila tenta
  de novo. Peça do T1a (`modo: 'referencia'`): reproduz a referência no corte central e o canto
  da logo automática que gravou; foto trocada nela também faz busca nova, com aviso.
- **Diagnóstico** em `composicao.arquetipo.buscaEspacial` (nunca no topo do diagnóstico): versão,
  id, escolha, cortes e combinações avaliadas, faixas, vencedor e até 2 alternativas (componentes,
  tratamento estimado, leituras), recusas por motivo, exemplos e o motivo em uma frase. O
  `compor-arte` devolve a forma compacta.
- **medir-copy não busca**: `avaliacaoEspacial: 'nao-executada'` — garante o encaixe estrutural, não
  uma posição visual boa na foto.
- **Fora do CP2B**: escolha automática de arquétipo, logo inteligente (a logo de referência fixa
  acompanha a faixa do serviço; contraste da logo é do CP3), SVG/elementos (T1b), o modelo
  base-esquerda.

Detalhe em `docs/design/arquetipos-minimalistas-v1.md`, seção "CP2B".

## Legibilidade da logo (CP3, 15/10/2026)

As provas do CP2B mostraram a fragilidade seguinte: texto e foto certos, e a logo sem leitura — cinza
sobre cinza. A escolha de canto conferia calma, luminância da foto, colisão e preferência; nada disso
prova que a logo lê. O CP3 prova mecanicamente, contra o fundo REAL.

- 🔴 **O critério é REGIONAL, pixel a pixel** (`legibilidade-da-logo.ts`): para os pixels VISÍVEIS da
  logo (alfa ≥ `ALFA_VISIVEL_DA_LOGO` = 128), |luz da logo − luz do fundo| no MESMO pixel, em luz 709;
  o **p10 ≥ `LIMIAR_DE_CONTRASTE_DA_LOGO` = 45** decide. Média, proporção de pixels no limiar e pixels
  avaliados são diagnóstico: **a média não salva uma logo cujo p10 falha** (a logo de dois tons da
  prova 3: média 144, p10 6 — a barra some). O 45 e o 128 moram neste módulo; `logo-compositor.ts`
  os importa (antes eram literais em dois lugares).
- 🔴 **O fundo medido é o EFETIVO**: a peça renderizada pelo renderer de produção, com as camadas
  FINAIS (foto no corte, fundo, gradientes e tratamentos como a régua os deixou), sem a própria
  logo e sem a tinta dos textos (`fundoSemALogo`). Nunca a média da foto, a média do canto, um
  pixel ou uma cor teórica. A logo é lida como o render a desenha: esticada na caixa
  (`objectFit: contain` não faz letterbox — `image-fit.ts`); o oráculo do CP0 foi corrigido para o
  mesmo (lia em letterbox e as contagens divergiam).
- 🔴 **Nenhuma variante é fabricada.** Proibido inverter, tingir, recolorir, sintetizar negativa,
  IA, BrandColor. Entram só as **variantes autorizadas** (`variantesAutorizadasDaLogo`): a logo que
  a página de assinatura desenha (a explícita, primeiro) e as linhas `Logo` com `isProjectLogo`
  (em ordem de id), sem repetir arquivo. Linhas sem a marca NÃO entram: a tabela mistura parceiro,
  campanha, co-branding e asset antigo, e nada no banco diz o contrário (auditoria de 15/10). Hoje
  há uma principal por projeto na prática (sem unique no banco); a seleção já aceita várias.
- 🔴 **A conferência roda no FIM do `comporPeca` (passo 8b, `logo-da-peca.ts`)**, depois da régua.
  Com arquétipo: a logo desenhada que não lê é trocada por outra variante autorizada; a FIXA do
  topo-esquerda nunca muda de lugar (a caixa da variante é o contain da caixa materializada); a
  AUTOMÁTICA do centro-óptico pode ir a outro canto já autorizado (`cantosOrdenados`, só os livres
  de texto). Ordem: primeiro ELIMINA (não carregou, sem pixel, p10 < 45); só depois a preferência —
  variantes na ordem autorizada (a gravada na recomposição vai primeiro), e dentro da variante os
  cantos (o atual/congelado, depois os mais calmos). **A explícita que passa é mantida mesmo com
  outra de p10 maior.** O canto calmo porém ilegível não vence.
- 🔴 **Sem véu novo para a logo.** O véu automático da logo (7b) que não a salvou SAI quando a
  conferência troca algo; nenhum tratamento nasce para salvar a logo. Se a logo não lê: outra
  variante autorizada, ou **`LOGO_SEM_VARIANTE_LEGIVEL`** (422, determinístico na fila e na
  recomposição, com a grade medida e o critério nos `details`). Asset que não baixou ou não
  decodificou é **`LOGO_INDISPONIVEL`** (503, transitório) — nunca "sem contraste"; e quando uma
  alternativa não carregou e nenhuma das outras lê, também é `LOGO_INDISPONIVEL` (não dá para
  afirmar "nenhuma lê").
- 🔴 **Sem arquétipo NADA muda** — nem as camadas, nem os avisos: os baselines `t1a-`/`cp2b-baseline`
  são idênticos (a projeção deles lê `logo` sem `legibilidade`). A medida e a mesma grade vão a
  `diagnostico.logo.legibilidade` (`codigo` `LOGO_SEM_VARIANTE_LEGIVEL` quando nenhuma variante lê
  em canto nenhum; `PREFERENCIA_INVIAVEL` quando o canto pedido ou a posição da página impede a
  solução que existe; `alternativa` e `mensagem`). Asset quebrado no legado é `estado: 'nao-medida'`.
- 🔴 **Recomposição preserva a variante**: `buscaEspacial.escolha.logo = { origem, url }` (e
  `arquetipo.logo.variante` na peça do T1a); `escolhaEspacialOriginal` a lê (malformada =
  `ARQUETIPO_ESCOLHA_ILEGIVEL`). A gravada é medida de novo primeiro: se continua a ler, fica
  (`escolha: 'reproduzida'`), não trocamos por "ficou melhor"; se já não é autorizada ou não lê, a
  troca é DITA no aviso. `compor-arte` devolve `leituraDaLogo` compacta.
- **Revisor**: regra `logo-sem-leitura` (problema, `certeza: 'medida'`), com p10, média, proporção,
  pixels, limiar, alfa, variante/origem e posição na evidência. Sem ajuste mecânico (a correção é do
  compositor); o fluxo humano segue só avisando — o gate é do CP5. Arquivo que não carregou é
  cobertura parcial, dita.
- Provas: `legibilidade-da-logo.test.ts` (1–6, 10, 16, 18 puros), `cp3-logo.test.ts` (7–16 e 18 no
  compositor real, recomposição, legado), `cp3-provas.test.ts` (PNG com `PROVAS_DIR`). Os `hojeViola`
  D, E, F, P4 do piloto e "acusa a logo sem leitura" viraram `it()`.
- **Rodada 1 da revisão adversarial + Codex (15/10/2026)** — o que mudou:
  - 🔴 **A logo DESENHADA é medida na caixa EXATA em que o render a desenha** (`logo.position/size`,
    esticada), nunca numa caixa recalculada: a logo do projeto no fallback tem `razao` 0,41 fixa e a
    caixa da página pode não ter a proporção do arquivo — medir o contain do arquivo deixava metade da
    caixa desenhada sem medida (p10 205 contain vs 16 desenhada, provado pelo revisor A). Outra variante
    no canto atual ocupa a caixa pela LARGURA no canto (a mesma das alternativas — `caixaNoCantoAtual`);
    na logo fixa, o contain da REFERÊNCIA do arquétipo deslocada como a posição (não da posição já
    contida pela proporção da explícita, que encolhia uma variante quadrada a 41%); fora da zona, vale a
    posição. A variante que entra com menos de 60% da largura da desenhada é avisada.
  - 🔴 **Colisão ELIMINA, mesmo legível**: o canto atual passa pelo mesmo critério das alternativas
    (`livreNoCantoAtual`); a logo fixa e a posição da página já vêm conferidas.
  - 🔴 **Identificador estável**: `VarianteDaLogo` leva `logoId` (linha `Logo`) ou `camada` (id da camada
    da página) além da `url` — o Blob já trocou de host uma vez; a recomposição casa primeiro pelo id
    (`mesmaVariante`). `isProjectLogo` tem de ser `true` (ausente não é autorizado); sem variante
    autorizada nenhuma, a desenhada NÃO entra por definição (recusa com arquétipo; "não medida" no legado).
  - 🔴 **A variante gravada é preferência e não depende da foto**: com a foto trocada a busca roda de
    novo, mas a logo gravada ainda vai primeiro (`pedidoDeReproducao.logo`; na peça do T1a, `lida.logo`).
    A gravada não autorizada é dita no aviso E nos `details`/mensagem da recusa (`gravada`,
    `gravadaAutorizada`, `avisos`). O rótulo cita o nome do arquivo.
  - 🔴 **Quando o véu automático da logo sai, a régua é REMEDIDA** (`corrigir: false`) para `contraste`,
    `tratamentoPiorou` e o tratamento por borda descreverem a peça que sai (o véu podia estar sob um texto
    de borda sem plano tratado). `escolha: 'veu-removido'` quando a mesma logo no mesmo canto passa a ler
    sem o véu. Decisão a confirmar com o owner: as outras variantes são medidas SEM o véu da logo (ele
    existe só para a logo; mantê-lo para salvar outra variante seria "véu para a logo").
  - **O p10 que decide é o exibido** (2 casas): 44,9974 sai `45.00` e legível.
  - **Fundo que não é cor sólida** (`transparent`, rgba) não é medido: `fundoSemALogo` recusa em vez de
    medir contra preto (no revisor vira "não avaliada"; com arquétipo, `LOGO_INDISPONIVEL`).
  - **Revisor**: camada desenhada com rotação, opacidade, recorte ou `cover` está `fora-do-contrato`
    (cobertura parcial, dita — a caixa não representa o desenho); logo só em ARRANJO (grupo) deixa a regra
    `nao-avaliada` com motivo, nunca "avaliada" com zero pixels; `image` com "logo" no nome (parceiro,
    selo) ilegível é AVISO com observação própria; data URL vai truncada à evidência. Regra com teste
    próprio (`cp3-logo-sem-leitura.test.ts`).
  - **Histórico da recomposição** ganhou ramos para `LOGO_SEM_VARIANTE_LEGIVEL` (salvar de novo não
    resolve) e `LOGO_INDISPONIVEL` (cadastre a logo de novo se o endereço morreu).
  - `compor-arte` compacta devolve variante com url/id, posição, `alternativa` e `mensagem` (legado).
  - **Mudança de comportamento documentada**: peça CP2B/T1a anterior ao CP3 cuja explícita não lê passa,
    numa edição de texto, a trocar variante/canto (com aviso) ou a recusar `LOGO_SEM_VARIANTE_LEGIVEL`; a
    arte antiga permanece, `recusaDaRecomposicao` é gravada e o job não tenta de novo.
  - **Limitações conhecidas (não corrigidas aqui)**: a explícita da página é detectada por `/logo|marca/i`
    em camada `logo` ou `image` (pré-existente: uma "marca d'água" ou um parceiro na página vira a
    explícita); pixels com alfa 128–254 contam com contraste cheio (o contrato do owner — infla o p10 de
    logos finas reduzidas); matiz não conta (vermelho sobre azul = 36, ilegível); a luz da logo (709 sobre
    sRGB) não é a escala da régua (b-w); o p10 é global (até 10% da logo pode sumir). Candidatas a
    recalibração do 45 (REA).
  - **O que o legado ganhou de custo e de ruído (revisor F, 15/10/2026)** — sem mudar camada nem aviso
    (os baselines cobrem camadas, avisos e chaves do diagnóstico; só `logo.legibilidade` fica fora da
    projeção): (1) **um render completo extra por peça** (`fundoSemALogo`: 120–360 ms nos sintéticos,
    estimado 0,5–1,5 s com foto real) — em `selecionar-combinacao.ts` é um por candidata (o
    `cacheDeLogos` poupa o download, não o render); (2) **download de TODAS as variantes autorizadas**
    por composição, pelo `fetchBuffer` SEM timeout — um Blob que pendura segura a composição até o teto
    do cron (candidato a timeout); (3) a grade inteira (`avaliacoes`, até 9 células, mais `mensagem`)
    persistida em `fieldValues.composicao.logo.legibilidade` de toda peça legada; (4) `compor-arte` e
    `ver-geracao` mostram `codigo: LOGO_SEM_VARIANTE_LEGIVEL` numa peça legada que SAIU normalmente — é
    SINALIZAÇÃO, não recusa (os testes D/E/F dos sintéticos dizem "sinaliza"). Medir uma leva real antes
    de ligar o arquétipo em todos os clientes. Nos testes T1a/CP2B com `variantesClaraEEscura()`, a logo
    cinza da página sintética não lê sobre a foto escura e é TROCADA pela clara do projeto em ~20 testes
    (`escolha: 'variante-trocada'`): a geometria da logo ali passa pelo `caixaDaVariante` (bate porque as
    duas logos têm a mesma razão 0,5); a reprodução da variante gravada só está provada em `cp3-logo` 14/14b.
- Fora do CP3: gate autônomo (CP5), logo do arranjo (elementos), mais de uma logo por peça no
  compositor, piso de tamanho da marca, recalibração do 45 (REA).

## Forma vetorial inválida: combinações (P6), MCP stdio (P7) e `reverter` (CP-X2c, 22/10/2026)

O CP-X2b ligou a guarda do `svg-path` nas portas de `Page.layers` (P1–P5; ver `editor-e-galeria.md`, "Forma vetorial
inválida não é gravada pelas portas P1–P5"). O CP-X2c fecha as três entradas que sobravam. Candidato, códigos e
`lerCor` são os mesmos (`src/lib/vetor/validar-camada.ts`).

- **P6 — combinações de texto** (`POST`/`PUT` de `/api/projects/[projectId]/font-combinations`):
  - `elements[].ornamentos[].camada` é um Layer cru, que o compositor e a `criar-arte` materializam por spread na
    peça. `exigirOrnamentosValidos` (`src/lib/vetor/guarda-dos-ornamentos.ts`) roda **depois** de auth (401),
    projeto (404), acesso (403), combinação de outro projeto (404, no PUT) e zod (400), e **antes** de qualquer
    escrita;
  - recusa com **422 `VETOR_INVALIDO`**, com `elemento` e o índice do `ornamento` em cada camada. **Nunca** por
    `superRefine` no zod, que daria 400;
  - `shapeType` na RAIZ da camada não é candidato. O catálogo base (`FONT_COMBO_LAYOUTS`) não tem ornamentos.
- **P7 — `prepararCamadasParaGravar`** (`layer-contract.ts`):
  - junta aos problemas, como avulso, `camada <id>: VETOR_INVALIDO (<códigos>)`, examinando os candidatos CRUS
    (a camada que o schema recusa e que também tem vetor inválido sai com os dois motivos), e lança como antes. A camada não
    sai de `camadas` e o `camadaSchema` **não muda**: se o vetor entrasse no schema, o `reverter` restauraria o
    snapshot sem a camada, em silêncio;
  - `validarCamadas` também não muda: só quem grava recusa;
  - no MCP stdio, `create-page` e `create-template` devolvem `isError` com `VETOR_INVALIDO` no texto e não criam
    nada. O `create-template` prepara todas as páginas antes do `template.create`.
  - **Consumidores:** as duas tools do stdio e o `recompor` (`recompor.ts`). No `recompor`, a recusa é um `Error`
    comum: cai no ramo de infra (ganha nova tentativa), depois registra a recusa e marca o job FAILED. Não é
    silenciosa, mas também não é tratada como determinística. `compor.ts` e
    `scripts/criar-pagina-de-assinatura.ts` usam só `normalizarCamadas` e não passam por aqui.
- **`reverter` R1** (`reverterCamadasDaArte`, rota `generations/[id]/reverter-camadas` e a tool `reverter-arte`):
  - depois de `GENERATION_NOT_FOUND` 404, `PROJETO_SEM_ACESSO` 403, `SEM_PAGINA`, `SEM_SNAPSHOT`,
    `PAGE_NOT_FOUND` e `PAGINA_E_MODELO`, vetor inválido no snapshot dá **`CreativeError` 422 `VETOR_INVALIDO`**
    (`details.camadas`), **antes da transação**: nada é gravado, invalidado nem recomposto;
  - a conferência é no snapshot CRU (`lerCamadas`), para que uma camada vetorial que o schema descartasse não saia
    da restauração em silêncio;
  - **corpo:** a rota HTTP devolve, **só** para `VETOR_INVALIDO`, o corpo das portas
    `{ error, codigo, camadas }`, com `code` como alias; os outros `CreativeError` respondem como antes
    (`{ error, code }`). Na tool MCP, a porta serializa o `CreativeError` pelo `toJSON()`, que inclui `camadas`;
  - os outros `v.problemas` seguem como hoje: o PR #225 não é presumido.
- **Fora daqui:** a primeira composição (`compor` → `persist`) e as outras cópias (§3.3 do preflight do X2)
  propagam o que já está gravado. Quem garante o legado é a varredura G. O aceite global do X2 é P1–P7 + `reverter`
  ativados juntos, com a varredura zerada.

## Acentos do arquétipo presos ao texto (T1b, 24/10/2026)

O `fio-fino`, a `moldura-aberta` (┌) e o `spark-4` que o arquétipo declara viram camadas `shape` normais
(`arquetipos/acentos.ts`), o MESMO código no compor e no medir-copy. Com isso o `minimal-fb-base-esquerda`
(moldura obrigatória) deixou de ser indisponível.

- 🔴 **O acento segue o texto, depois da foto.** A posição sai da definição imutável e da caixa REAL do
  papel (`presoA`) onde a busca a pôs: abaixo do papel, o vão declarado depois do fim da caixa; acima, o
  vão declarado antes do topo; a moldura tem o braço de cima parado e o fim do vertical o vão declarado
  acima do texto. Na horizontal, rente à tinta (caixa + `PADDING_DE_DESENHO`) ou centrado na caixa. A
  busca espacial NÃO considera o acento.
- 🔴 **Nada é empurrado.** Fora da área segura do projeto (`pisoDoProjeto`) ou encostando em outra
  unidade de texto (com os ornamentos do arranjo) ou na logo: o opcional sai, dito em `avisos` e
  `composicao.arquetipo.acentosOmitidos`; o obrigatório recusa (`ARQUETIPO_ELEMENTO_NAO_CABE`). Os
  obstáculos saem de `obstaculosDosAcentos` nos dois lados; o medir-copy só não conhece a logo
  automática (canto escolhido pela foto).
- 🔴 **A logo do CP3 desvia dos acentos** (rodada 1 da revisão): `livre` e os cantos alternativos da
  conferência de legibilidade contam os acentos já desenhados como obstáculo — a variante/canto que os
  tocaria sai da grade como `fora-da-area`. Depois do CP3, a reconciliação (8c) confere a logo
  DEFINITIVA: o opcional que ela tocasse sai (dito), o obrigatório recusa.
- **A cor é a do texto**: `texto` = a cor da manchete desenhada; `destaque` = o `destaque.fill` que o
  compositor já resolveu para aquele papel (`destaqueDoPapel`); sem destaque de cor, a do texto, dito em
  `fonteDaCor`. Nunca a vitrine do catálogo nem `resolverCorDaMarca` (lá `texto` é o escuro da marca).
- 🔴 **`style.vetor` do acento leva só o asset, SEM `papeis`**: o "Reaplicar cores da marca" (CP-V3)
  trocaria a cor da manchete pelo escuro da marca. Quem é o acento fica em `metadata.compositor.acento`.
  A camada entra ABAIXO de todo texto (acima da foto e dos véus).
- 🔴 **A receita e a COR congelam na peça**: `composicao.arquetipo.acentos` grava o desenho do asset
  (forma, path, espessura, canal, versão), o papel de cor e a cor RESOLVIDA (`cor` literal +
  `fonteDaCor`). A recomposição desenha SÓ por ela (`acentosCongelados`, `defasagem.ts`), com a cor
  gravada: mudar a paleta/destaque da marca depois não repinta a peça antiga (só a peça nova herda).
  Peça do T1a/CP2B, sem o campo, continua sem acento; campo malformado (inclusive sem cor legível por
  `lerCor`) é `ARQUETIPO_ESCOLHA_ILEGIVEL` antes de qualquer escrita. Nunca reler `SHAPES_LIBRARY` para
  peça que já nasceu — nem para decidir disponibilidade: com `acentosCongelados`, `prepararArquetipo`
  pula `disponibilidadeDoArquetipo` (id, versão, impressão, formato e papéis continuam conferidos).
- **Lacunas**: o contraste do acento sobre a foto não entra na régua nem no tratamento (o L longo pode
  cruzar uma área clara); aceite visual com marcas reais pendente do owner.

## Título gigante e escala dominante (T4-A, 24/10/2026)

- **`minimal-titulo-gigante@1` (MIN-10)** entrou no catálogo ao lado dos três do T0 (impressão
  `arq1-1025df9d49631a` desde a rodada 1; as três antigas não mudaram um byte). Detalhe e desvios da pesquisa em
  `docs/design/arquetipos-minimalistas-v1.md`, seção "T4-A".
- **Escala é relação, nunca corpo.** O papel declara `escala: 'dominante'` (só a headline; o validador recusa em
  outro papel ou com outro valor). O corpo-base continua o da assinatura; `fontSize` no arquétipo segue proibido.
- **A escada do dominante sobe.** `prepararNoArquetipo` começa o papel em `TETO_DA_ESCALA_DOMINANTE` (8× a assinatura)
  e `montarBloco` desce no passo de sempre até o MAIOR corpo que cabe na referência (largura e altura), com o piso de
  sempre. Se a unidade (segunda voz) ainda não cabe, o próximo degrau é o de baixo do MAIOR corpo real da unidade —
  nunca do menor, que pularia o teto em que a primeira voz encolhe e a segunda, já no piso, cabe. Só no dominante; os
  outros papéis seguem a escada antiga exatamente. É a mesma função no compor e no medir-copy.
- **Dominância é conferida na materialização** (pura, a mesma nos dois lados): a caixa real do dominante tem de
  chegar a 80% da largura OU 22% da altura da peça (`DOMINANCIA`); abaixo, `ARQUETIPO_ESCALA_NAO_DOMINANTE` — nunca
  um título comum calado. Copy que não cabe nem no piso continua `ARQUETIPO_TEXTO_NAO_CABE`, sem corte.
- **Alinhamento próprio do papel** (`PapelNoArquetipo.alinha`, rodada 1): o apoio do #7 é alinhado à direita com a
  manchete à esquerda. `alinhaDoPapel` (fallback `preferencias.alinha`) decide o x da materialização e o `textAlign` de
  `camadasNaReferencia` — compor, medir-copy e busca usam a mesma função. Nunca na headline nem na logo.
- **Lote do piloto**: `arquetiposDoLote` lista só os três do piloto de 17/10 (loteId e denominadores congelados).
- **Lacunas**: aceite visual com marcas reais pendente; provas locais com medidor calibrado (a tinta Arial sai um pouco
  mais estreita que a caixa medida); "1–2 palavras" é SOFT (`caracteresPorLinha` 10), quem decide é a medida.
  #4/#5 (logo topo-centro) e #6 (marca-herói) seguem bloqueados por d09/CP1.

## Modelo sem foto e lista tipográfica (T4-E e #15, 24/10/2026)

Registro do contrato já existente (lacuna apontada na revisão do preflight do #16). Detalhe em
`docs/design/arquetipos-minimalistas-v1.md`, seção "T4-E e #15".

- 🔴 **`fundo: 'liso-claro'` é identidade, não sugestão.** O fundo sai de `fundoDaPeca` (`arquetipos/fundo.ts`), a mesma
  conta no compor, no medir-copy e na página de Layouts: o `fundoClaro` da marca, ou `ARQUETIPO_FUNDO_INDISPONIVEL`
  (nunca o fundo escuro com cara de E). Foto pedida: `ARQUETIPO_FOTO_NAO_SUPORTADA`.
- 🔴 **Recompor usa o `Page.background` congelado** (`fundoCongelado`), conferido do mesmo jeito; a paleta de hoje não
  repinta a peça.
- **Sem foto não há busca**: cada faixa na partida, teto de 3 faixas só sem foto (`faixasSemFoto`).
- **`cta` no arquétipo** é aditivo: modelo que não o declara segue recusando o bloco.

## Convite tipográfico: logo topo-centro e cantoneiras da peça (#16, 24/10/2026)

- **`minimal-tipografico-convite@1` (MIN-09)** entrou ao lado dos cinco (impressão `arq1-1cdd408f7eeb8d`; as cinco antigas
  não mudaram um byte). Sem foto (F1, escolha do owner), tudo centrado. Detalhe em `docs/design/arquetipos-minimalistas-v1.md`, seção "#16".
- 🔴 **d09 liberado só para ESTA logo**: fixa, topo-centro, escala normal, sem tratamento novo. Não libera #4, #5, #6
  nem marca-herói. `superior-centro` existe só no arquétipo (`CantoDaLogo`); a spec pública e `CANTOS` não mudam; a
  logo automática e o legado nunca o recebem.
- 🔴 **Cantoneiras são presas à PEÇA e ocupam só os braços.** `presoA` ausente só nelas (validador e
  `lerAcentosGravados`: fio, moldura e spark sem `presoA` continuam `ARQUETIPO_ESCOLHA_ILEGIVEL`). A colisão é por
  `ocupacaoDoAcento` (a caixa de cada subpath do path da RECEITA em uso) no compor, no medir-copy, no CP3 e na
  reconciliação — o retângulo inteiro conteria todos os textos e a logo. Na recomposição, o path congelado, nunca o
  `SHAPES_LIBRARY` vivo. Texto ou logo num braço: a obrigatória recusa `ARQUETIPO_ELEMENTO_NAO_CABE`, nada é empurrado.
- **Cor**: o destaque da manchete (`destaque-da-manchete (cantoneiras)`), congelada. A camada diz
  `ancoradoA: 'peca'` em `metadata.compositor.acento`; a vitrine (MCP e Layouts) também.
- **A linha final é o `cta`**: não há papel URL; herda o estilo inteiro da assinatura, inclusive o prefixo
  (`aplicarPrefixo`), sem prefixo dobrado quando o autor já o escreveu; a linha efetiva é a medida.
- **Lacunas**: aceite visual do owner (braço longo no Story, peças) pendente; marcas reais sem `fundoClaro`, sem estilo
  `cta` ou sem variante autorizada que leia sobre o claro recusam (422), não consultadas.

## #16 @2 — cantoneiras de braço igual e margens (24/10/2026)

- **`minimal-tipografico-convite@2`** ao lado do `@1` (impressões `arq1-01570f16b5b8cb` e `arq1-1cdd408f7eeb8d`). Detalhe
  em `docs/design/arquetipos-minimalistas-v1.md`, seção "#16 @2".
- 🔴 **Desenho derivado é congelado, nunca rederivado.** `receitasDoArquetipo(a, { formato, canvas })` deriva o path das
  cantoneiras do `braco` só na peça NOVA (compor e medir-copy, a mesma chamada); o replay desenha a receita gravada.
  `derivacao` diz de onde veio o path; `style.vetor.asset` continua `cantoneiras@1`.
- 🔴 **A guarda confere o PATH, não a flag** (`incoerenciaDoDesenho`): 4 Ls nos 4 cantos com braço = `bracoPx` ±0,5 px.
  Flag 130 com path C1, braço desigual ou canto deslocado → `ARQUETIPO_ELEMENTO_NAO_CABE` 422; `derivacao` malformada →
  `ARQUETIPO_ESCOLHA_ILEGIVEL` 422 (pelo `acentosCongelados`). Receita sem contexto não desenha o `@2`.
- **Vitrine = a mais recente por id** (`vitrineDeArquetipos`); o pedido com versão segue valendo, a peça persistida sem
  versão segue recusada.
- **Teste que pede o #16 sem versão passa a testar o `@2`**: os testes do `@1` fixam `versao: 1`.

## Divisão com a foto no alto: foto em caixa e papel do liso (#8, 24/10/2026)

- **`minimal-divisao-foto-topo@1` (MIN-04)** entrou ao lado das sete versões (impressão `arq1-03ccaf6af70501`; as sete
  antigas não mudaram um byte). Foto retangular no alto (60% Story, 58% Feed), texto embaixo no liso, logo fixa no canto
  inferior direito. Detalhe em `docs/design/arquetipos-minimalistas-v1.md`, seção "#8".
- 🔴 **`foto-em-caixa` = texto no liso** (`textoNoLiso`): a caixa da foto (`formatos.<f>.foto`) é obrigatória nele e
  proibida nos outros fundos; nenhuma zona de papel nem caixa de elemento a toca (`ZONA_SOBRE_A_FOTO`); logo fixa. Sem
  busca pela foto (só a partida), sem mapa de calma, sem véu — nem o automático nem o explícito da página (aviso dito).
- 🔴 **O papel do liso sai DEPOIS da preparação**, das tintas que a peça DESENHA (`tintasAtivas`: voz 2 criada, estilo do
  arranjo, destaque efetivo com a alternativa; por segmento efetivo com glifo, como o renderer — a base integralmente
  sobrescrita não conta). `papelDoBloco` escolhe entre o escuro e o claro da marca pelo critério da régua (sem a
  tolerância dela: aqui a escolha recusa), a mesma preparação para os dois, sem novo sorteio. Nenhum serve:
  `ARQUETIPO_FUNDO_INDISPONIVEL` (origem `contraste`), com tintas e folgas — a variante escolhida não é trocada. No
  medir-copy, cada variante com as tintas DELA (`MedicaoDaCopy.fundo`).
- 🔴 **Luz neutra não tira a foto da chave.** `luzParaAVariante` só zera o ±2 da luz na escolha de variante; a identidade
  da foto segue em `chaveDaPeca`. No medir-copy do `foto-em-caixa`, provisório é a falta da identidade da foto na spec
  (com as mesmas condições de variante e arranjos de hoje); identidade presente com bytes ilegíveis não é provisória e
  o aviso diz isso (sem "PROVISÓRIA").
- **Corte pela CAIXA** (`cortesCandidatos`, `assuntoEmPixels`, `fracaoVisivelDoAssunto` com a caixa): assunto catalogado →
  o corte de maior fração visível (≥ 0,75, senão `SEM_COMBINACAO`/`CORTE_PERDE_O_ASSUNTO`; com o fixo impedindo,
  `PREFERENCIA_INVIAVEL`); sem catálogo ou fixo → central. O corte vai em `corteSemLeitura` e fica gravado na escolha.
  Foto ampliada (cover > 1,0×): aviso com o fator, nunca veto.
- **Sem foto**: o compor recusa `ARQUETIPO_FOTO_AUSENTE` (opção `exigirFoto` de `prepararArquetipo`, só no compor); o
  medir-copy mede. A rota de Layouts já recusa antes (409 `LAYOUT_SEM_FOTO`).
- 🔴 **Recomposição**: o `Page.background` atual é o candidato ÚNICO (`fundoCongelado` por `textoNoLiso`), CONFERIDO
  contra as tintas (recusa origem `pagina`). Fundo editado não é ajuste manual detectado; caixa e enquadramento da foto
  mexidos à mão são (re-render como está). Corte congelado que perde o assunto catalogado: `ARQUETIPO_CORTE_CONGELADO_PERDE_O_ASSUNTO`.
  A variante segue VIVA (cor nova da assinatura entra e é conferida); este corte não congela marca, estilo nem logo.
- **Recusa antes de escrever** quer dizer sem Generation, Page nem arte final; o cache Drive→Blob herdado de
  `carregarFoto` pode acontecer antes do papel e do corte (não redesenhado aqui).
- 🔴 **Gate de autonomia fail-closed** para a foto em caixa (`assuntoRepresentaORender`: caixa ≠ canvas → texto-sobre-assunto
  não comprovada → revisão humana). Não relaxar; ensinar o revisor a foto em caixa é tarefa à parte.
- Sem `pre`/`cta` no `@1` (recusa; nos Layouts o recorte autoral é revisão do sistema no histórico da página nova).
  Não há `variante.ts`: o arquétipo já é a variante sintetizada em memória (estilo da página real, geometria do arquétipo).

## #4 base centrada: `superior-centro` sobre foto inteira (24/10/2026)

- **`minimal-fb-base-centro@1` (MIN-01)** entrou ao lado das oito versões (impressão `arq1-15c914b2112ca8`; as oito
  antigas não mudaram um byte). Foto inteira, manchete e serviço centrados na base, logo fixa no topo-centro. O delta de
  produto é só a definição no catálogo. Detalhe em `docs/design/arquetipos-minimalistas-v1.md`, seção "#4".
- **Supera** a linha "não libera #4, #5" da seção do #16 (acima), só para o #4: o d09 de 24/10 liberou a logo fixa
  topo-centro, normal, sem tratamento novo, sobre foto. O #5 (pílula) e o #6 (marca-herói, CP1) seguem fora.
- 🔴 **A logo fixa não muda de lugar**: a faixa dela só sai do `dy` 0 por eliminação (região protegida do catálogo ou
  colisão), na vertical, dentro da zona, no eixo. Nunca automática, nunca num canto.
- 🔴 **Nenhum véu novo para a logo**: o véu automático fraco existente é da família A (regra de 02/09) e sai quando
  não a salva; sem variante cadastrada legível, a peça recusa (`LOGO_SEM_VARIANTE_LEGIVEL`). No diagnóstico, o véu da
  logo no topo do #4 aparece como camada e em `legibilidade.veusRemovidos`, não em `tratamentoDeLeitura` (que só lista
  bordas com texto).
- 🔴 **Pré, apoio e cta recusam no `@1`** (`ARQUETIPO_PAPEIS_INCOMPATIVEIS`, compor e medir-copy); nos Layouts, saem em
  `foraDoLayout` com a revisão do sistema no contrato.

## Variante promovida: cópia de página fora do rodízio (T5, 24/10/2026)

- **O gesto**: `POST /api/templates/[id]/pages/[pageId]/promover-variante` (botão "Variante da marca" no editor, só o
  curador) COPIA qualquer página própria válida para o fim do template "Assinatura" do mesmo projeto. A origem nunca é
  escrita. Desfazer = apagar a variante no template Assinatura (a peça que nasceu com ela recompõe noutra: "não existe
  mais"). Decisões do owner: copiar; qualquer página válida; só estilo e geometria; semântica viva (editar a variante muda
  as próximas peças e recomposições); fora do rodízio.
- 🔴 **Cópia CRUA**: as camadas da origem na mesma ordem, com os mesmos ids, `parentId`, `order`, texto e metadata —
  nunca `normalizarCamadas` (ordenaria e completaria peso, entrelinha, `autoExpand`…). De `metadata.compositor` fica só
  a allowlist `{ papel }` (os ARRANJOS leem o papel por ali — `papelDoTexto`); bloco, linhas, extra, prefixo, encaixe,
  canto, elementoDe e acento saem (contrato de copy e receita de arquétipo), e o objeto some quando nada sobra. Tags
  recriadas `['fora-do-rodizio', formato]`; `copyAutoral` nulo; nenhuma tag `layout`/`arquetipo:*`/`compositor` viaja.
- 🔴 **Valida, nunca conserta** (`variante-promovida.ts`, puro): `validarCamadas(...).problemas` (a saída com defaults
  não é usada), ids únicos na página, vetores, formato story/feed pelos DOIS classificadores, manchete, e a
  EQUIVALÊNCIA origem × cópia — `montarAssinatura`, papéis pelas duas derivações (`papelDoNome(name) ?? papelDoNome(id)`
  e `papelDoTexto`) e `arranjosDaPagina`, com o mesmo medidor determinístico nos dois lados. Divergiu → 422
  `COPIA_NAO_EQUIVALENTE`. Página de Layouts vira variante sem a regra do arquétipo: foto em caixa, fundo liso e
  acentos NÃO se repetem nas peças (o diálogo avisa).
- 🔴 **A marca `fora-do-rodizio` (`fora-do-rodizio.ts`) exclui só da CANDIDATURA automática**, nunca do carregamento:
  `escolherVariante` calcula a base como se a promovida não existisse (com zero promovidas, tudo idêntico); a promovida é
  achada por id, `varianteOriginal` e nome (depois das da base), nunca pela tag reservada; só promovidas e nada pedido →
  sem página com o motivo, e compor/medir-copy recusam `ASSINATURA_INCOMPLETA` com ele. Consumidores fora do seletor:
  `selecionar-combinacao` (a promovida nunca entra no laço; a guarda usa as automáticas sem pedido), `outrasVariantes`
  do medir-copy, `spec-do-item` (união de papéis da copy legada), `descreverVariantes`/`ver-assinatura`/aba Marca
  (`foraDoRodizio`, marca filtrada das tags) e o padrão do script de revisão de copy (`variante-da-revisao.ts`).
- 🔴 **Os CINCO escritores que SUBSTITUEM `Page.tags`** preservam a marca da linha gravada (`tagsComMarcaPreservada`):
  rota de tags do curador, rota de tags do design, MCP `marcar-como-modelo`, PATCH da página (a linha relida em cada
  volta do compare-and-set) e PUT do template (a base relida por `gravarCamadasComRevisao`, `dados` como função). O
  pedido não põe nem tira a marca; não existe "entrar no rodízio" nesta fase. Escritor que CRIA página com tags do
  cliente pode nascer com a marca: isso exclui, não escala (limite declarado, sem guarda).
- 🔴 **Travas, ordem fixa**: consultiva `paginas-do-template:<destino>` → `Template` destino `FOR SHARE` (relido: nome,
  projeto, e a contagem de "Assinatura" = 1 dentro da transação) → leituras. Só `tx` e só banco dentro (cópia e
  validação são puras). Idempotente: a mesma cópia já promovida devolve 200 `jaExistia`. Depois do commit,
  `pedirRecomposicaoDaArteCongelada` só quando criou (AGENTS: as duas chamadas). Limites: a serialização real só se prova
  em PostgreSQL; não há unicidade GLOBAL do nome "Assinatura" contra quem cria template sem cooperar (só índice único).

## #5 topo centrado: a pílula de contorno, o primeiro acento que ENVOLVE (24/10/2026)

- **`minimal-fb-topo-centro@1` (MIN-01)** entrou ao lado das nove versões (impressão `arq1-023d4c649e2482`; as nove
  antigas não mudaram um byte). Foto inteira, logo fixa no topo-centro (d09 "#4 e #5", escala normal, CP3, sem
  tratamento novo), manchete e apoio opcional centrados logo abaixo e, na base, o serviço de UMA linha dentro de uma
  pílula de contorno obrigatória. Detalhe em `docs/design/arquetipos-minimalistas-v1.md`, seção "#5".
- **O tipo `pilula-contorno`** (`ELEMENTOS_QUE_ENVOLVEM`) é o único acento que envolve o papel a que se prende. A borda
  externa O é a caixa REAL do serviço (texto + ornamentos do arranjo, o mesmo obstáculo de `obstaculosDosAcentos`) mais a
  folga da DEFINIÇÃO (`envoltoriosDoArquetipo`: a caixa E do elemento contra a referência R, 32 × 19 px no Story, 32 × 16
  no Feed); a camada é O ⊖ ⌈traço/2⌉, `rounded-rectangle`, raio 9999 (os renderers limitam a meia altura), cor do serviço.
- 🔴 **O interior permitido é o CURVO** (`cabeNoInteriorDaPilula`): os quatro cantos do serviço ficam ≥ 1 px dentro da
  borda interna do traço, com o raio do clamp dos renderers. Nunca a AABB nem a folga escalar: com traço 16 e a mesma folga
  o canto invade o arco (contraexemplo da revisão do preflight) e a peça recusa (`ARQUETIPO_ELEMENTO_NAO_CABE`). A ocupação
  da pílula para os OUTROS (logo, CP3, 8c) é a AABB cheia O — conservadora, nunca o interior do serviço.
- 🔴 **A folga conta na zona e na faixa** (`materializarUnidades` e `partidaNoArquetipo`): a busca nunca oferece um `dy`
  que tire a pílula da zona efetiva; sem posição, `ARQUETIPO_FORA_DA_ZONA` com o motivo "pílula de contorno".
  Arquétipo sem envolvente: nada muda.
- 🔴 **Receita × elemento ANTES do lookup**: no ramo do envolvente, `posicionarAcentos` confere id, tipo, `presoA`
  declarado, envoltório (inteiro ≥ 8) e desenho antes de ler referência, posição ou obstáculo — receita incoerente é
  recusa, nunca opcional, nunca TypeError. No replay, `incoerenciaDosEnvolventesCongelados` (chamada no `compor` antes de
  medir) recusa `ARQUETIPO_ESCOLHA_ILEGIVEL` a peça sem a receita do envolvente obrigatório ou com ela presa a outro papel.
  A mesma lacuna nos acentos antigos (moldura do #2, cantoneiras do #16) é herdada e não foi tocada.
- 🔴 **O raio é congelado e transportado**: `lerAcentosGravados` aceita `rounded-rectangle` só na pílula (contorno, raio
  inteiro em [1, 9999], espessura, sem path, sem derivação) e devolve o raio; os tipos antigos saem como antes (sem raio).
- 🔴 **A logo topo-centro exige 24 px de folga dos textos no CP3** (`intersecta` do compor, folga padrão 24): a definição
  do #5 no Feed baixou a manchete para .16 (o preflight dizia .155, vão de 20 px, e toda peça Feed recusava a logo). Quem
  publicar outro modelo com logo fixa perto de texto confere esse vão.
- 🔴 **Pré e cta recusam no `@1`**; serviço em 2 linhas recusa (`ARQUETIPO_LINHAS_EXCEDIDAS`): pílula de 2 linhas seria
  `@2` com aceite próprio.

## Foto em caixa com máscara `arco-janela` (#9 técnico por fixture, 25/10/2026)

- **Só a técnica, por FIXTURE.** `minimal-divisao-cor-topo-arco@1` (MIN-04) NÃO está em `PUBLICADOS`: os testes o
  injetam por mock do catálogo (`arquetipos/__tests__/suporte/arquetipo-arco-9.ts`). Catálogo, impressão travada,
  Layouts, vitrine, MCP e candidatos são a habilitação (outra etapa, depois da revisão).
- 🔴 **O arquétipo guarda a INTENÇÃO, nunca o path**: `formatos.<f>.mascaraDaFoto = { tipo: 'arco-janela', raio }`
  (raio em fração da LARGURA da caixa, ≥ 0,5), só com `foto-em-caixa` (`CAMPO_DESCONHECIDO` fora dele), contrato
  fechado, flecha < altura da caixa em px (`CAMPO_INVALIDO`). `ZONA_SOBRE_A_FOTO` segue sobre o RETÂNGULO da caixa.
- 🔴 **O desenho é DERIVADO e CONGELADO.** `pathDoArcoJanela` (`arquetipos/mascara.ts`, v1 imutável: ⌈θ/45°⌉ cúbicas
  por metade, só `M L C Z`, 4 casas) sai da caixa em px na peça nova, passa pelos DOIS parsers (`segmentosDoPath` e o
  `Path2D` do @napi-rs/canvas — o servidor ignora path ruim em silêncio; aqui a falha recusa `ARQUETIPO_INDISPONIVEL`)
  e vai para `bg-foto.style.mask = { shapeId: 'arco-janela', path }` e para a receita
  `composicao.arquetipo.foto.mascara = { tipo, versao: 1, raio, caixa: {w,h}, path }` (`composicao.foto` não muda).
  Mudar o algoritmo ou o formatador = `versao: 2` ao lado, nunca reescrever a v1.
- 🔴 **O assunto é medido no ARCO** (`fracaoVisivelNoArco`), com a mesma regra 0,75 e as mesmas recusas do #8
  (`SEM_COMBINACAO`, `PREFERENCIA_INVIAVEL`, `ARQUETIPO_CORTE_CONGELADO_PERDE_O_ASSUNTO`): o canto que o arco esconde não
  conta como assunto visível.
- 🔴 **Recomposição: a receita é lida em `recompor.ts` ANTES do `comporPeca`** (`mascaraCongelada`), fechada, conferida
  contra a derivação v1 do PRÓPRIO raio/caixa (byte a byte) e depois contra o raio/caixa da definição EXATA já resolvida
  (id/versão/impressão) — nunca a mais recente, nunca o catálogo vivo de elementos. Passou: desenha o path GRAVADO e mede o
  assunto com o raio/caixa dele. Ausente (o arquétipo declara máscara), ilegível, de outra caixa, de outro raio (mesmo
  coerente) ou presente numa definição sem máscara: `ARQUETIPO_ESCOLHA_ILEGIVEL`, com zero consultas novas e nada escrito.
- 🔴 **Máscara mexida à mão é ajuste manual** (`mudancasDeEnquadramento` compara `shapeId`/`path` por VALOR; ordem das
  chaves irrelevante, ausência = ausência, SVG não validado): acrescentada, removida ou trocada → re-render como está, as
  camadas ficam, a receita não é lida. Vale para o #9 e para o legado (sem isso a recomposição apagava a máscara que a
  equipe pôs). Máscara igual: o caminho de antes.
- **Limites ditos**: redimensionar a foto à mão ESTICA o arco (o path é 0–100 da caixa e vira elipse) — e a caixa mexida
  já manda para o re-render como está; a edição de imagem do editor (`handleApplyImageEdit`) grava o tamanho da imagem
  editada (mesma coisa, também no #8). As portas de escrita não validam `style.mask.path` (lacuna herdada do CP-X2).
- 🔴 **A definição do #9 tem as referências de TEXTO com w .602 (650 px) e a logo do Feed com h .0348** (A-I1/A-I2 da
  I9, adotados na R1). Com as referências literais das amostras (w .60, h .035) o produto não reproduz o visual aceito:
  a coluna numa referência de 648 px é 634 (`colunaDaCaixa` = largura − 14) e a manchete de 87 px (636 px de linha)
  desce para 84 no Story; a logo do Feed (94,5 px) arredonda x e largura separados na materialização e passa 1 px da
  zona efetiva (recusa). Quem publicar outro arquétipo com o corpo medido numa amostra confere a coluna justa
  (referência − 14) e o arredondamento da logo contra a borda da área segura; o motor não muda por isso.
- 🔴 **Raio finito não basta**: o domínio da máscara recusa a conta não representável (r ou r² transbordando, r ou w/2
  sumindo, flecha ≤ 0 por cancelamento) — raio 1e308 dava path `NaN` aceito pelo leitor (R1 da I9).
- **Adendo H9 (25/10/2026) — publicado.** `minimal-divisao-cor-topo-arco@1` entrou em `PUBLICADOS` (`catalogo.ts`,
  `DIVISAO_ARCO`) com a definição final acima (texto w .602, logo do Feed h .0348, raio 0,62) e a impressão travada
  `arq1-04603bcf9d7623` (11 versões, 10 ids; as 10 impressões anteriores intocadas). A literal das amostras continua só
  na fixture de teste (`arq1-139cae795189c3`, não publicada); o mock `catalogoComOArco` tira o #9 real da lista antes de
  pôr a base, senão o publicado a esconderia (`resolverArquetipo` devolve o primeiro). A vitrine (`vitrineDeArquetipos`,
  GET dos Layouts e `ver-assinatura`) leva `mascaraDaFoto: { <formato>: { tipo, raio, path } }` com o path pela MESMA
  conta do compor (`caixaDaFoto` × `DIMENSOES` → `receitaDoArcoJanela`); o card do Layouts desenha o arco com esse path
  num `<svg viewBox="0 0 100 100" preserveAspectRatio="none">` e a legenda diz onde a foto está ("Foto embaixo com o topo
  em arco · fundo da marca em cima"; o #8 segue "Foto no alto"). `ARQUETIPO_FOTO_AUSENTE` diz "numa caixa", sem "no
  alto". Limites: o #9 é o 1º card, o 1º candidato e o 1º da vitrine (ordem por id, não escolha); a página criada tem
  `mask.shapeId: 'arco-janela'`, que a barra de imagem não lista (nenhum item marcado; trocar/tirar é ajuste manual);
  criar Layouts A PARTIR de uma página #9 pede foto de novo (409 `LAYOUT_SEM_FOTO`: a `bg-foto` cobre 58%, abaixo dos 90%
  da detecção, como no #8); o arredondamento separado de x/largura em `materializar.ts` segue como dívida.

## #10 `minimal-coluna-foto@1` e `minimal-coluna-foto-esquerda@1` — coluna de foto (IH, 25/10/2026)

- **Dois ids, um por lado** (MIN-05, `fundo: 'foto-em-caixa'`): a foto numa caixa de altura inteira e 42,5% da largura
  (D `x .575`, E `x 0`; 621/0 × 459 px), o texto numa coluna estreita no liso do outro lado, a logo FIXA no canto de
  cima do lado do texto (D superior-esquerdo, E superior-direito) e o fio opcional sob a manchete. Não existe parâmetro
  de espelho: a spec segue `arquetipo` strict e o lado é o id. O espelho é FUNCIONAL — foto, zonas e a referência da
  logo espelham; textos e fio ficam no `xMin` da coluna, alinhados à esquerda nos dois lados.
- 🔴 **A definição tem as referências de TEXTO com w .436 e a logo D x .086 / E x .739** (A10-1/A10-2a, decisões técnicas
  do preflight focal adotadas pelo Codex; o G-A10 aprovou as amostras v2 com .435 e .085/.74). Com .435 a coluna do
  medidor é 455 e "Bastidores" a 80 px (456 medido no servidor) desce para 77; com .74 a logo do Feed E 2:1 arredonda
  para 894 + 95 = 989 contra a zona que termina em 988 (e cerca de 18% das proporções de logo seriam recusadas). O texto
  E fica em .479 (zona .479–.915: .48 + .436 passaria do piso). Medido pela IH: corpos 80/40/30, largura gravada
  470/427/351 (`min(coluna, ceil(maior)) + 14`), tinta dos textos/logo/fio a ±2 px das amostras aceitas.
- **Coluna estreita, quebra do autor** (`blocos.ts`): toda linha da copy tem de caber inteira em 456 px; o produto não
  quebra dentro da linha. A manchete de 3 linhas e o apoio em 2 vêm com `\n` autoral; "Luz natural e cada prato no
  ponto certo" numa linha só é `ARQUETIPO_TEXTO_NAO_CABE`, e o medir-copy diz isso antes. Limite, não defeito.
- **Limites ditos**: ordem por id, não escolha — os 2 do #10 são o 1º e o 2º card, candidato e item da vitrine (o #9 vai
  a 3º, o #4 a 5º); o card desenha o retângulo da foto com a legenda pelo lado ("Foto à direita · fundo da marca à
  esquerda" / "Foto à esquerda · fundo da marca à direita"). Pré e cta fora do `@1`; sem manchete girada, pílula, fios
  cruzados, foto em altura parcial ou linha vertical. Toda peça #10 em leva autônoma vai à revisão humana (D8 do #8). A
  marca do G-A10 era sintética: não valida marcas reais nem release. O arredondamento separado de x/largura em
  `materializar.ts` segue como dívida (o #9 publicado, canto direito, tem a mesma exposição).

## #4 guardado: fora da vitrine, resolvível por id (25/10/2026)

- **`minimal-fb-base-centro@1` sai dos seletores**: `vitrineDeArquetipos()` (`na-spec.ts`) filtra os ids de
  `FORA_DA_VITRINE`, então o GET de Layouts, o painel e o `ver-assinatura` passam a listar 11 ids. O aceite visual
  G-H1 do #4 foi adiado pelo owner; a ocultação não o fecha.
- **O catálogo não muda**: 13 versões / 12 ids, `PUBLICADOS`, a impressão `arq1-15c914b2112ca8`, as receitas, o
  `resolverArquetipo` e o `recompor.ts` ficam como estavam. O replay das peças `#4@1` e o pedido explícito por id
  (`compor-arte`, `compor-leva`, `medir-copy`, POST de Layouts com `{ id, versao }`) continuam resolvendo.
- **Limite dito**: é ocultação dos seletores, não proibição de composições novas — quem conhece o id ainda compõe.
  `candidatosDeArquetipo` (`candidatos.ts`) continua listando os 12 ids pelo catálogo porque não está ligado a fluxo
  nenhum; quem o ligar decide ali se respeita `FORA_DA_VITRINE`.
- 🔴 **Contagem da vitrine ≠ contagem do catálogo**: teste de vitrine conta 11; teste de catálogo conta 13/12. Não troque
  um número pelo outro às cegas. O helper `card()` dos testes do painel lança quando o id não está no HTML — antes, um
  `not.toContain` contra um card ausente passava vazio.

## Altura física e orçamento transitório na escolha da escala (26/10/2026)

- **Caixa gravada = física**: a altura do bloco de texto é `ceil` da altura medida (o Konva descarta a linha que não
  cabe por fração de pixel). O medidor real expõe também `naturalHeight` (a altura antes do arredondamento).
- **Orçamento transitório só escolhe o degrau**: `montarBloco` decide descer a escala por `round(naturalHeight)`
  (`orcamentoDeAltura`); a pilha da unidade soma o mesmo orçamento (`alturaDoOrcamento`) só para essa decisão.
- **A régua física final encerra a descida**: a escada da unidade só para quando a pilha FÍSICA (ceil) também cabe na
  régua da materialização — `excedeAlturaDaReferencia` (`materializar.ts`, px brutos + `TOLERANCIA_PX`), a mesma conta
  da recusa. Orçamento menor nunca autoriza caixa física acima da referência (175,49/176 recusa; 175,5/176 aceita).
- **Medidor sem `naturalHeight`** (contrato antigo, mocks) usa a altura física: ninguém inventa a fração.
- **Nada transitório persiste**: `orcamentoDeAltura`/`alturaDoOrcamento` não entram no `Layer` nem na página.
- Consequência medida: #9 mantém corpo 86; #16@2 C2 Feed corpo 69, caixas 85/85, pilha 170 (folga 5,5); C1 corpo 62,
  pilha 156. Controles em `arquetipos/__tests__/materializar.test.ts` e `src/lib/__tests__/altura-fisica-reflow-real.test.ts`.

## #3 guardado: sem texto central sobre foto nas opções (26/10/2026)

- Decisão do owner (26/10): `minimal-fb-centro-optico` entra em `FORA_DA_VITRINE` (`arquetipos/na-spec.ts`), com o
  mesmo limite do #4 — o GET de Layouts, o painel e o `ver-assinatura` passam a listar 10 ids, e o #3 não é usado nas
  próximas provas.
- Catálogo (13 versões / 12 ids), impressões, resolução por id direto e replay de artes persistidas continuam iguais:
  só a vitrine muda. Nenhuma guarda nova em `prepararArquetipo`/`resolverArquetipo`, nenhuma troca automática de
  layout, artes existentes intocadas.

## O piso da marca vence na horizontal: a referência efetiva (opção A, 29/10/2026)

- **O problema medido** (coleção de revisão de 28/10, 19 páginas "[Rever margem]"): Wine e Real têm `margemH` 96 em
  `Project.assinatura`; o catálogo põe a referência dos papéis à esquerda em x .085 = 91,8 px. A zona efetiva
  (`zona ∩ pisoDoProjeto`) começava em 96, cortava a referência por 4,2 px e a materialização recusava todo papel com
  "a área segura do projeto corta a referência" — a saída de 28/10 foi relaxar o piso para 92 em memória, o contrário
  do que a marca cadastrou. Decisão do owner (29/10): **o piso da marca vence**.
- **A regra:** `referenciaEfetiva(referência, zonaEfetiva)` (`arquetipos/materializar.ts`) recolhe a referência do
  catálogo para DENTRO da zona efetiva **na horizontal**, de cada lado que o piso corta por mais que a tolerância de
  ½ px. A coluna do medidor (`caixasMaximas(…, geometria)`), a escada da unidade (`prepararNoArquetipo`, agora com
  `geometria`), o pouso e o `contain` da logo usam a MESMA caixa — no compor e no medir-copy, pelo mesmo
  `pisoDoProjeto[formato]`. Não é "empurrar para caber": é a precedência que o piso já tinha na vertical, onde a busca
  espacial resgata a referência cortada (CP2B).
- **O que não muda:** a vertical (capacidade de altura e resgate por dy); a zona; a recusa quando a zona não alcança a
  referência; e **o padrão** (`margemH` 92): 91,8 contra 92 está dentro da tolerância, nada é recolhido, e
  `caixasMaximas` sai byte a byte igual em todo o catálogo (teste 17b). Marcas com piso maior que 92 passam a compor
  4 px (ou mais) para dentro, com a coluna correspondentemente mais estreita — pode mudar quebra de linha.
- **Recomposição usa o piso ATUAL** (revisão do Codex, 29/10): a receita congelada da spec (id, versão, impressão,
  corte e `dy`) continua valendo e nenhuma identidade muda — a impressão é da definição imutável, não da referência
  materializada. A referência efetiva é derivada do piso que a assinatura devolve na hora, como a zona já era. Logo:
  peça de marca no padrão (92) recompõe igual; peça composta com piso maior (há casos aceitos antes desta regra, ex.
  modelos centrados como o centro-óptico, e as cópias de 28/10 feitas com o piso relaxado em memória) pode mudar a
  posição horizontal e a quebra na recomposição, ou recusar, se o piso cadastrado mudou. Não há coordenadas
  históricas congeladas na horizontal — a garantia é a receita, não o pixel.
- **Fora desta regra:** acentos presos à PEÇA (ex. cantoneiras) seguem sujeitos à área segura e podem continuar
  recusando com margem 96; `vaosDaLista` e `envoltoriosDoArquetipo` seguem derivados do catálogo (são folgas da
  receita, não coluna). Esta fase recolhe só a referência dos papéis de texto e da logo fixa.
- Controles em `arquetipos/__tests__/materializar.test.ts` (17 e 17b).

## Empilhar como a assinatura: a pilha da faixa (29/10/2026)

- **O problema medido** (29/10, artes agendadas da Wine e da Real, páginas de assinatura e os 6 stories do 465): a
  equipe empilha pré, manchete, apoio e serviço como UMA coluna contínua — 0 a 9 px entre as caixas, a entrelinha já
  dá o ar. O arquétipo pousava cada papel na própria referência do catálogo (pré y .105, manchete .14, apoio .27…),
  abrindo 20 px entre pré e manchete e 75–85 px entre manchete e apoio: a arte ficava com cara de blocos soltos.
  Corpos e entrelinha estavam certos (vêm da assinatura); o espaço entre os blocos é que não.
- **A regra:** `materializarArquetipo({ empilhar: { gap } })` — dentro de cada FAIXA (`faixasDoArquetipo`, agora em
  `arquetipos/faixas.ts`), os papéis de texto, na ordem das referências, encostam uns nos outros com o `gap` da marca
  (`gapEntreBlocos`, o mesmo da unidade). Âncora `topo`: o primeiro fica na referência e os outros descem; `rodape`: o
  último fica e os outros sobem. Entre dois papéis contam os ornamentos presos e o envoltório (#5). Só o y muda:
  referência, zona, capacidade e x ficam; a logo não entra; o `dy` da busca espacial vale para a faixa inteira.
- **A zona da pilha:** as zonas por papel do catálogo foram desenhadas em volta das referências soltas (no #8 a da
  manchete acaba 116 px acima da do serviço) e, mantidas, recusavam a pilha. A ÂNCORA guarda a própria zona — é ela que
  segura a identidade na busca espacial (a manchete do topo-esquerda nunca desce ao centro, CP2B 20); os que a seguem
  respondem ao casco das zonas da faixa na vertical; a horizontal segue a de cada papel.
- **Quem não empilha:** âncora `meio` (#3, #16) e layouts com lista (#15) — ali os vãos são da receita. Faixa com um
  papel só (manchete do título-gigante; serviço ao lado da logo) não tem o que empilhar.
- **Quem passa o gap:** `compor` e `medir-copy` (`gapEntreBlocos` da geometria do formato) por `partidaNoArquetipo` e
  `selecionarNoArquetipo` → `materializarUnidades`. Sem `gap`, a saída é a de sempre (testes antigos e replay).
- **O que muda de verdade:** toda composição por arquétipo com faixa de 2+ papéis sobe o apoio (e o serviço nos layouts
  de rodapé) para junto da manchete. As amostras aprovadas antes desta regra (Bv3 do #9, #8, #4, #10) mudam a posição
  vertical desses papéis — o owner decidiu em 29/10 que o espaçamento antigo estava errado. `gapEntreBlocos` é o botão
  da marca (padrão 14 px; as páginas da equipe usam 0–9).
- Controles em `arquetipos/__tests__/materializar.test.ts` (18, 18b).
