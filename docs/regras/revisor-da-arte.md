# Revisor da arte

> Regras da área, lidas antes de mexer nela. Trecho movido do antigo `CLAUDE.md` em 05/10/2026, sem alteração de texto (as seções seguem a ordem original). Índice geral: `AGENTS.md`.

### O revisor da arte: medida e visão antes de agendar (11/09/2026)

Pedido do Ciro: revisar a arte feita no EDITOR antes de concluir a programação
("o título está muito grande", "o horário de funcionamento não deu leitura") e
devolver os comandos para ajustar no editor. Diante do desenho só por código,
ele insistiu na visão: "tem detalhes que por código não está dando para ver — se
desse, o compositor não errava". Módulos em `src/lib/creatives/revisao/`
(contrato, versão, executor e regras PUROS, com teste; a visão com reconciliação
pura; o serviço `revisar-arte.ts`), a tool `revisar-arte` (só leitura) e
`ajustar-arte` com `ajustes` + `versaoEsperada`. O desenho passou pela revisão do
Codex antes de ser escrito.

- **Duas camadas, uma saída.** O código mede — a régua com correção em memória,
  a geometria dos glifos, corpo e entrelinha contra a variante da assinatura com
  que a peça foi composta (ou contra o modelo de onde a arte saiu), o assunto da
  foto, as fontes — e a visão (gpt-5.2) olha a peça renderizada com cada bloco
  marcado (T1, T2… e L1 para a logo) e recortes em resolução real. Os dois viram
  ACHADOS no mesmo formato, e o número de todo ajuste é do CÓDIGO: a visão
  escolhe a correção num vocabulário fechado (subir, reduzir-entrelinha,
  mais-gradiente…), nunca o valor.
- **A visão ARBITRA o que a medida aproxima.** Leitura que a régua acusou e a
  visão não viu vira sugestão; assunto só estimado pela textura e não confirmado
  sai; o que a visão confirma vira evidência do achado medido, sem comando
  duplicado. Visão fora do ar deixa a revisão só com as medidas (cobertura "não
  avaliada") — nunca derruba a revisão.
- **Na visão valem as lições do crivo e do decodificador**: schema de texto livre
  com todo campo opcional e o rigor na reconciliação; a resposta aponta pela
  MARCA desenhada, nunca por índice; evidência observável obrigatória; confiança
  baixa descartada; no máximo 6 achados.
- 🔴 **A cedilha cortada é do EDITOR, não da arte.** Medido em 11/09 em manchetes
  com entrelinha 0,9–0,94 (Lobster em "direção.", Amithen em "Bora votar"): a
  tinta passa 5 a 8px da caixa gravada, o render do servidor desenha a letra
  inteira, e o cache do Konva (`textNode.cache()`, que liga acima de 24px)
  recorta na altura da caixa. O revisor acusa (`tinta-fora-da-caixa`, sem
  ajuste); o conserto é no cache do editor, nunca na altura da caixa — ela é o
  contrato com o render (ver "O modo Auto re-mede…").
- 🔴 **Peso de fonte não é fonte faltando.** A carteira cadastra cada peso como
  família própria ("Lato Bold", "Didot HTF B06 Bold") e o render usa o estilo do
  arquivo que existe: conferir o peso pedido contra o do arquivo deu **45 falsos
  alarmes em 30 peças reais**. Só a família ausente do registro conta.
- **A régua acusa demais em cor saturada e com sombra presa ao glifo** (18 de 30
  peças na primeira calibração): o alvo de luminância do vermelho do Espeto pede
  fundo quase preto, e a régua apaga a sombra antes de medir. Esses casos descem
  um nível de severidade e dizem por quê; a visão decide o resto.
- **Assunto estimado pela textura precisa cobrir 40% do bloco** (com 25% ele
  acusava 8 de 30 peças sem nada visível); o do catálogo continua nos 25% do
  mapa de calma.
- **Um ajuste por camada por rodada.** Dois achados que mexem nas mesmas camadas
  não empilham deltas calculados sobre a geometria antiga — o segundo espera a
  revisão seguinte. Corpo e entrelinha nas MESMAS camadas se fundem num comando;
  gradiente na mesma borda fica com a força maior; reduzir o gradiente só quando
  TODOS os blocos daquela borda sobram (um folgado não tira a leitura do vizinho).
- **O executor preserva a diagramação.** Corpo novo re-mede a altura e refaz a
  pilha pelo delta — rich text incluído, que o `combo-stack-reflow` não enxerga —;
  o elemento ao lado do texto (relógio, alfinete) acompanha o centro dele; grupo
  da metade de baixo mantém a BASE; a entrelinha vai nos dois campos; o encaixe
  da voz 2 escala com o corpo; o gradiente muda por `comForca`, e borda sem
  gradiente ganha um logo acima da foto.
- **A versão é do conteúdo** (`versaoDaPagina`: hash de dimensões, fundo e
  camadas com as chaves ordenadas), nunca `updatedAt` nem a URL. Com
  `versaoEsperada`, `ajustar-arte` recusa página que mudou (`VERSAO_DIVERGENTE`,
  409) e grava com compare-and-set em `updatedAt`. **`versaoEsperada` é
  OBRIGATÓRIA quando vierem `ajustes`** (`VERSAO_OBRIGATORIA`, 400; decidido em
  12/09/2026 na revisão do Codex): ajuste calculado sobre uma versão só se
  aplica a ela. Chamada sem `ajustes` (texto, foto, nome) continua sem exigir
  versão. Ajuste recusado volta com o motivo; nenhum aplicável e nada mais a
  mudar é `AJUSTE_SEM_EFEITO` — e, desde o CP4, `AJUSTE_PIOROU_ARTE`,
  `AJUSTE_NAO_MELHOROU_O_ACHADO`, `AJUSTE_NAO_MEDIDO` e `TEXTO_NAO_CABE` por
  ajuste (ver "Ajustar sem piorar (CP4)" no fim deste arquivo).
- **As regras da casa continuam valendo no ajuste**: a escrita é a de
  `ajustarArte` (recusa página-modelo, `invalidateScheduledRenders` +
  `pedirRecomposicaoDaArteCongelada`, Generation nova com `fieldValues.revisao`).
  Ajuste de diagramação não muda copy e por isso não gera sinal de copy — a
  correção do revisor não pode virar "preferência da equipe" no aprendizado.
- 🔴 **A arte do compositor fica no template ANTIGO depois que a página muda de
  pasta** (`moverPaginaParaSemana`, ao agendar): buscar a Generation da página
  filtrando por `templateId` perdia a referência de corpo e o assunto. A busca é
  por projeto + `fieldValues.pageId`.
- 🔴 **`levantarPagina` (recomposição) só lê Generations do PROJETO da página**
  (REV-2CEB-02, 12/09/2026): `fieldValues.pageId` é gravado sem conferir o dono
  (o `konva-export` aceita `body.pageId`), e uma Generation de OUTRO projeto
  apontando para a página era a "arte mais recente" — o job de recomposição
  nascia preso a ela. A prova do PR 6 cria exatamente essa linha, e rodando ao
  mesmo tempo derrubou a prova deste PR em 2 de 3 rodadas: o "flake" de 6a/6h
  era isolamento por projeto, não tempo. A prova agora cria a alheia de
  propósito e confere que o job nasce na Generation certa.
- 🔴 **O ajuste do revisor INVALIDA a miniatura da página junto das camadas**
  (REV-127-F01, P1 da revisão FINAL, 12/09/2026): `Page.thumbnail` é o PNG do
  render ANTERIOR, e `agendarPost` o reutiliza como mídia (post `RENDERED`)
  quando a página ainda não tem post. Peça composta sem post + ajuste cujo
  render falha = a invalidação não acha post nenhum, a recuperação sai sem
  slide (`enfileirarRecomposicaoDaPagina` devolve null), e o agendamento
  seguinte pela página nascia com a versão velha, fora do cron de renders
  pendentes. Com o thumbnail nulo na MESMA escrita das camadas, o post nasce
  `PENDING` (`nextRenderAt` agora) e o cron desenha a página ajustada; o
  render que dá certo regrava a miniatura. Prova 9h.
- 🔴 **A recuperação forçada regrava a copy VISUAL da Generation que reutiliza**
  (REV-127-F02, P2): o re-render passa por `renderPageAndRegister` com o
  `generationId` da arte mais recente da página — que pode ser a de um AJUSTE
  anterior, cujos `slotValues` afirmavam o texto que o ajuste seguinte
  escondeu (render falhou → recuperação). A URL trocava e `lerProcedencia`
  seguia devolvendo o texto ausente como `copyVisual`; agendar por
  `generationId` ou pela URL registrava texto que a imagem não mostra.
  `copyVisualDasCamadas` (puro, `procedencia-da-copy.ts`) é a MESMA conta do
  `slotValuesFinais` do ajuste, e entra no patch do re-render só quando a arte
  JÁ carrega copy visual (a arte do compositor não ganha uma inventada); a
  copy de APRENDIZADO e a trava ficam como estão (merge no banco). Prova 9i.
  🔴 **E a regravação deixa MARCA** (integração com o R38/R42 do PR 6,
  12/09/2026): `recomposicao.copyVisualRegravada: true`, DENTRO do registro do
  re-render e só quando os `slotValues` do mesmo patch foram regravados. Sem
  a marca, `re-renderizada` + `slotValues` não diz se a copy é deste PNG ou de
  outra versão da mídia (página ilegível mantém a copy, arte re-renderizada
  antes deste código também) — e o PR 6 invalida essa copy. Como o merge é
  raso, a próxima escrita de `recomposicao` apaga a marca junto com o registro
  antigo. Nasceu num commit de integração no branch do PR 6
  (`feat/f2-contexto-da-semana`) e **desceu para o PR 0 por cherry-pick em
  12/09/2026** — o PR 0 é o dono.
- 🔴 **`copyVisualDasCamadas` recebe `Page.layers` COMO ESTÁ NO BANCO e
  decodifica por `lerCamadas`** (REV-93D-01, 12/09/2026): a rota de edição
  de camada grava a lista como STRING JSON (há página duplamente codificada)
  e o render desenha essas páginas normalmente — lendo o valor bruto, toda
  string virava `{}` e a recuperação apagava a copy visual de uma arte cujo
  PNG tem texto. `null` = ilegível (o re-render mantém a copy que tinha e
  avisa); `{}` = legível sem texto visível. Prova 9j, em JSON simples e duplo.
- 🔴 **Antes de SUBSTITUIR a copy visual, a copy anterior vira proposta de
  aprendizado quando a arte não tem uma** (`preservarPropostaDeAprendizado`,
  REV-93D-02): `lerProcedencia` usa `slotValues` como `copyProposta` sem
  `copyDeAprendizado` (a arte rápida grava só `slotValues`), e a recuperação
  forçada que regrava a copy visual sem o texto que o revisor escondeu fazia
  a proposta perder esse texto — ao agendar com página e Generation,
  `copyParaDecisao` (que conta a camada escondida pelo revisor) voltava a
  acusar uma ADIÇÃO humana. É UMA instrução condicional no Postgres (só com
  `slotValues` objeto e `copyDeAprendizado` não-objeto): um ajuste
  concorrente, que grava a proposta certa, nunca é sobrescrito. Prova 9j.
- **No chat** (instruções do conector): compor → `revisar-arte` → `ajustar-arte`
  com os ajustes → revisar de novo, no máximo DUAS rodadas; o que sobrar vira
  observação para a pessoa, e a revisão nunca trava a agenda. `ARTE_REVISAO_VISAO=off`
  desliga a visão; `OPENAI_REVISOR_MODEL` troca o modelo.
- `scripts/revisar-pecas-reais.ts` roda o revisor nas últimas peças do
  compositor de cada cliente, sem gravar (`--sem-visao` só mede), e imprime o
  placar por regra: regra que acusa em quase toda peça boa é limite para
  recalibrar, não defeito da carteira. Recalibrado em 12/09/2026 com a régua
  texto a texto da main (20 peças, 2 por cliente, 30 dias): 22 ajustes e UM
  ponto como problema — o serviço em texto escuro sobre a camisa escura da Real
  ("milk-shake em dobro"), que é defeito real e sem ajuste mecânico.
  `scripts/revisar-antes-depois.ts` renderiza a peça antes e depois dos
  ajustes EM MEMÓRIA (nada gravado) — é a evidência da calibração de gosto.
  `scripts/validar-revisor-da-arte.ts` é a prova de integração no branch de
  dev (versão, projeto errado, modelo, autosave no meio, imagem única, slide
  de carrossel, render falhando); ela sobe PNG ao Blob de produção e apaga no
  cleanup. 🔴 **Fixture criada em OUTRO projeto entra na lista do cleanup no
  INSTANTE da criação** (`generationsAlheias`, apagada pelo id exato no
  `finally` externo, e a exclusão que não acontece CONTA como falha): o cleanup
  filtra por projeto e marca e não a alcançaria, e um `try/finally` local com
  `.catch(() => undefined)` deixava a órfã no outro projeto quando o passo
  quebrava antes dele, com a prova verde (REV-052-01). 🔴 **A prova lê cada imagem do Blob UMA
  vez por URL, com nova tentativa espaçada em 403/429/5xx** (só no processo
  dela, trocando `CanvasRenderer.nodeImageLoader`): as provas 29 a 33 pararam
  no mesmo ponto com o desafio anti-bot do Blob sobre a logo que ela renderiza
  dezenas de vezes, e esperar três `curl` com 200 antes de lançar não segurava.
  E o processo sai explicitamente no fim — as provas 32 e 33 ficaram penduradas
  uma hora com conexões de banco abertas depois do resumo.
- **Gradiente se aponta pelo id.** Sem `camadas`, o ajuste só mexe no gradiente
  de LEITURA da borda (o que o compositor desenhou) ou cria um; o gradiente que a
  equipe desenhou à mão só muda quando o ajuste traz o id dele, e as regras nunca
  propõem enfraquecê-lo. Antes, "criar gradiente" numa borda com o gradiente da
  equipe alterava o dela, que a régua nem reconhece como gradiente de leitura.
- 🔴 **O delta da pilha sai do MESMO medidor dos dois lados** (antes e depois do
  ajuste). A altura gravada pode ter vindo do editor; comparar a medida nova do
  servidor com ela deslocava o bloco pela diferença entre os medidores, não pela
  mudança pedida. E o reflow de preenchimento só roda quando algum TEXTO foi
  trocado: com ajustes e nenhum texto novo, normalizar a pilha antes deslocaria a
  base do grupo que o executor preserva.
- **Gosto nunca passa de sugestão.** Posição estranha, respiro desequilibrado e
  desalinhado vistos pela visão ficam em sugestão mesmo com confiança alta — na
  recalibração de 11/09 o respiro saía aviso em 7 de 20 peças boas.
- **Revisão sem achado não é aprovação quando a cobertura tem buraco**: o resumo
  diz o que não foi avaliado (visão que não rodou ou concluiu só em parte, regra
  medida em parte), e visão com item que não pôde ser lido
  (`visaoConclusiva: false`) não rebaixa nem tira nada.
- **A agenda é avisada mesmo quando o render falha**: `Page.layers` já está
  gravado quando `renderPageAndRegister` roda, então a invalidação e a
  recomposição rodam no `catch` antes de o erro subir.
- ⚠️ **Depois de um ajuste, a página deixa de ser recomposta.** A arte mais nova
  dela passa a ser a do ajuste (Generation de `renderPageAndRegister`, sem
  `layersSnapshot` nem spec), e `lerArteDaPagina` usa a mais recente: uma edição
  de copy posterior cai no re-render como está. Os ajustes sobrevivem, mas o
  texto novo não é medido de novo — revise a peça outra vez depois de editar a
  copy.
- ⚠️ Rich text é medido como texto simples (a largura dos trechos destacados é
  aproximada, cobertura "parcial").
- 🔴 **A copy de APRENDIZADO da Generation não é a copy VISUAL** (REV-2CEB-01 da
  revisão de 2ceb25fc): `lerProcedencia` devolve as duas — `copyProposta`
  (`copyDeAprendizado` vence `slotValues`; é o lado "antes" do diff do
  agendamento, com a camada escondida pelo revisor contada como presente) e
  `copyVisual` (os `slotValues` como a ARTE os mostra). Sem página (só
  `generationId`, ou `mediaUrls` casada pela URL) a cópia que o post carrega é a
  VISUAL: com a de aprendizado, o post afirmava um CTA que o PNG não tem, e
  `textoDoPost` o levava ao histórico. A prova 9g agenda só pela Generation e
  pela URL e confere que o texto escondido não está no post.
- **A prova-dev-24 (2ceb25fc) fechou com 6 falhas em 6h/6m–6r que NÃO se
  reproduziram**: a prova-dev-25, no mesmo commit, fechou 128 ok / 0 falhas com
  um vigia lendo do banco as Generations da 2ª página a cada 15 s — spec e
  snapshot presentes em 6h. Em 24 a arte lida em 6h estava sem spec e sem
  snapshot (o log do recompor diz "Esta arte não guardou a spec"), com as
  páginas já apagadas pelo cleanup quando a investigação começou. Fica como
  ocorrência não explicada; a chain passou a NÃO disparar a revisão quando a
  prova tem falha.

- 🔴 **Desde 15/10/2026 o revisor NÃO esconde texto com conteúdo** (decisão do owner no CP4,
  `CONTEUDO_NAO_PODE_SER_OCULTADO`): os itens abaixo sobre "esconder pelo revisor" valem só para texto VAZIO e
  camadas decorativas; as provas 9a/9e/9i(a) de `scripts/validar-revisor-da-arte.ts` escondem texto com
  conteúdo e precisam ser redesenhadas. `hidden: true` pelo `slotValues` continua sendo gesto HUMANO pelo chat.
- 🔴 **Esconder por ajuste do revisor NÃO é a pessoa apagando o texto** (REV-9E-01
  da revisão FINAL do Codex, 12/09/2026). O ajuste `visibilidade` grava na
  camada `metadata.revisao.ocultaPeloRevisor` (com a página, no mesmo write —
  sobrevive ao render que falha); mostrar de novo tira a marca. O APRENDIZADO
  lê a página por `copyParaDecisao` (a escondida pelo revisor conta como
  presente) nos quatro pontos — `agendarPost`, `ajustarArte` (antes e depois),
  o PATCH do editor —, enquanto o render e a cópia que o post carrega
  (`slotValues`) seguem `copyDeCamadas`: a marca nunca muda o que a arte
  mostra. Camada escondida SEM a marca é decisão humana e conta como remoção;
  e no PATCH do editor `reconciliarMarcasDoRevisor` tira a marca da camada que
  estava visível e chega escondida (a pessoa a escondeu). Módulo puro
  `revisao/oculta-pelo-revisor.ts`; prova no passo 9 (com render OK, com
  render falhando, e o controle humano virando `editada`).
- 🔴 **A proposta do diff sem plano é `fieldValues.copyDeAprendizado`, não os
  `slotValues`** (REV-8AD-01). Os `slotValues` da Generation do ajuste são a
  copy VISÍVEL; contra a página lida por `copyParaDecisao` eles acusavam o
  texto escondido pelo revisor como ADICIONADO pela pessoa
  (`versusProposta: 'editada'`). O ajuste grava as duas: `slotValues` para o
  que a arte mostra, `copyDeAprendizado` (com as ocultações mecânicas) para o
  aprendizado; `lerProcedencia` (`procedencia-da-copy.ts`, puro) lê a de
  aprendizado primeiro. Prova 9e, sem leva nem dica.
- 🔴 **A marca sai em todo gesto HUMANO sobre a camada** (REV-8AD-02): ao
  MOSTRAR pelo editor (`reconciliarMarcasDoRevisor` tira a marca de qualquer
  camada que chega visível) e ao esconder pelo chat (`hidden: true` no
  `bakeLayers` passa por `semMarcaDoRevisor`). Marca antiga que sobrevivesse
  encobriria a remoção humana. Prova 9f pelos dois caminhos.
- **Falha dentro do passo 9 LANÇA, nunca `abortar`** (REV-8AD-03):
  `process.exit` não passa pelo `finally`, e o cleanup do Blob e do banco
  ficaria para trás.
- **A prova captura a URL da arte IMEDIATAMENTE depois de cada render** e o
  cleanup varre também `recomposicao.urlsAnteriores`: dois renders seguidos
  sobre a mesma Generation sobrescrevem `resultUrl`, e o 1º PNG do passo 6d
  ficava no Blob de produção (REV-9E-02). E falha do `del` CONTA como falha
  da prova, com "encontrados" e "apagados" separados (REV-9E-03) — resíduo no
  Blob não passa no gate.
- **A recuperação da arte CONGELADA depois de um ajuste** (rodadas da revisão
  do Codex em 12/09/2026, REV-01 a REV-11 e a revisão FINAL, prova em
  `scripts/validar-revisor-da-arte.ts`, passos 6a–6m): quando o render do ajuste
  falha, `ajustarArte` pede a recomposição FORÇADA — re-render da página como
  está, nunca pela spec. O pedido vive no payload do job (`recompor.forcar`,
  `forcaPedidaEm`, `forcaTentada`, `forcaAtendida`), promovido por
  compare-and-set num job PENDING/RUNNING (com orçamento próprio), e
  `fecharJob`/`falharJob` devolvem o job à fila enquanto houver força NOVA por
  atender — nunca DONE nem FAILED com pedido pendente; a própria forçada que
  falha em 3/3 é FAILED terminal, reabrível pela edição seguinte.
- 🔴 **A trava `somenteReRender` nasce JUNTO da gravação do ajuste, NA MESMA
  TRANSAÇÃO** (`travarRecomposicaoDaArte(pageId, motivo, tx)`, chamada por
  `ajustarArte` antes do render): a arte do compositor (spec e snapshot) não
  conhece o ajuste, e uma recomposição pela spec o desfaria. Até a revisão
  FINAL a marca só era gravada pelo re-render forçado bem-sucedido — com o
  render e as recuperações falhando, a edição de texto seguinte reabria o job
  normal e recompunha (REV-F01); e fora da transação um worker lia a página já
  ajustada com a arte ainda sem trava e recompunha por cima (REV-D01). Se a
  trava falhar, a página não é gravada. 🔴 **Dentro da transação nada usa
  `db`**: medido em 12/09/2026 no pool do dev, uma leitura pelo cliente raiz
  com a transação interativa aberta no MESMO cliente fica presa até o
  timeout dela (P2028 aos 20s) — a prova de dev (6o) lê a página por um
  `PrismaClient` próprio, e a busca da arte da página filtra por
  `projectId` (JSON path sem o índice do projeto varria a tabela: 1,9s
  contra 0,75s).
- 🔴 **`Generation.fieldValues` de uma arte que dois lados escrevem se grava por
  MERGE NO BANCO** (`mesclarFieldValuesDaArte`, `src/lib/creatives/
  mesclar-field-values.ts`: jsonb `||` sobre a linha atual, numa instrução
  só), nunca por `{ ...fieldValues }` capturado antes. O worker da fila lê a
  arte no começo, trabalha dezenas de segundos e gravava o objeto inteiro: a
  trava `somenteReRender` que o revisor gravasse nesse intervalo (na
  transação do ajuste) era apagada, e a edição de texto seguinte recompunha
  pela spec e desfazia o ajuste (REV-R01 da revisão do Codex, 12/09/2026).
  Reler antes de um `update` incondicional só encurta a janela. Passam pelo
  merge: a escrita da recomposição, o `renderPageAndRegister` com
  `generationId` (o re-render e a fila `COMPOR` — o persist manda só o patch
  no lote com as colunas), a própria trava e o registro da recusa. Escritor
  NOVO de `fieldValues` de arte que já existe usa o helper; `update` com o
  objeto inteiro é a corrida de volta. A prova de dev (6p) grava a trava no
  meio da execução do worker e confere que ela sobrevive à escrita dele.
- 🔴 **O runner confere a VERSÃO VISUAL da página depois de refazer a arte**
  (`versaoGravada`, o hash de `versaoDaPagina`), nunca só a copy: só a força de
  um gradiente salva durante o render não muda copy nem diff geométrico, e o
  re-render forçado fechava DONE com o slide em G1 e a página em G2 (REV-F02).
  Divergiu → `pedirNovaTentativa` e a execução ACABA ali (a seguinte desenha a
  página atual); sem orçamento, falha explícita (`PAGINA_MUDOU_DURANTE`, pelo
  `falharJob` de sempre) — nunca DONE com o slide velho nem força marcada como
  atendida (REV-D02).
- **A recomposição RECUSA (`PAGINA_MUDOU_DURANTE`) quando a página mudou entre o
  levantamento e a leitura que compõe, ou entre a composição e a gravação**
  (compare-and-set em `updatedAt`; o PNG é apagado). O executor lê o job FRESCO
  ao reservar (`reservarJob`), porque a força pode chegar entre a varredura e a
  reserva.
- **"Menos gradiente" nunca é proposto sobre gradiente desenhado à mão** — nem
  com a régua satisfeita (`ehGradienteDeLeitura` na regra; o apontamento da
  visão fica como observação). E `revisar-antes-depois.ts` renderiza sobre o
  MESMO fundo do serviço (`convertPageToDesignData`): página sem fundo é branca.
- 🔴 **A página que mudou DURANTE a recomposição é re-renderizada COMO ESTÁ no
  retry, em dia ou não** (`recompor.renderizarComoEsta` no payload do job,
  gravado por `marcarRenderComoEsta` ANTES de devolver o job à fila; revisão
  FINAL do Codex, REV-FINAL-01 e REV-C19-01, 12/09/2026). A divergência de
  versão detectada no fim da execução pode ser SÓ de gradiente (paradas e
  força), que o diff de conteúdo não vê: sem o marcador o retry dizia "em dia"
  e fechava DONE com o slide velho. E o marcador vale mesmo quando o editor
  também mudou o TEXTO antes do retry — condicioná-lo a "em dia" deixava esse
  caso recompor pela spec e apagar o gradiente salvo. O marcador sai do
  payload quando a execução o consome; não escreve a trava `somenteReRender`
  (o ajuste do editor não é ajuste do revisor).
- **A redução de força da visão (`menos-gradiente`) respeita a necessidade de
  CADA texto da borda** com a conta da régua (`max(piso, atual − passo,
  …necessárias)`; REV-FINAL-02): texto legível AGORA não é texto com folga.
  Redução abaixo do mínimo (0,08) vira observação — e a conta é em MILÉSIMOS
  (`reducaoAtingeOMinimo`): `0.6 − 0.52` dá 0,0799… em ponto flutuante, e a
  redução exatamente no mínimo era descartada (REV-C19-02).
- 🔴 **A recuperação de job expirado é compare-and-set sobre o que LEU**
  (`recuperarJobsPerdidos`: tentativas, orçamento e payload; perdeu a corrida
  → relê e decide de novo). Entre a leitura dos vencidos e a escrita terminal,
  um ajuste cujo render falhou pode PROMOVER o job (força nova no payload,
  `maxAttempts` ampliado): com o filtro só por id e status, a recuperação
  gravava FAILED por cima da força aceita, com orçamento disponível, e o
  carrossel ficava com a arte anterior (REV-127-01 da revisão FINAL do Codex,
  12/09/2026). Prova 6s.
- **`menos-gradiente` da visão com texto ESCURO na borda fica como observação**
  (REV-127-02): a conta da necessidade é a do texto claro (o gradiente
  escurece; sem ele o fundo fica claro demais); para texto escuro a
  desigualdade é a inversa e a mesma conta propunha tirar o clareamento de
  que o texto depende. Grupo de sentidos mistos idem.
- 🔴 **Texto visível que o medidor não mede não vira regra "avaliada"**
  (REV-127-03): curvo, `fitty` e `auto-resize-*` fazem `measureTextLayerBox`
  devolver `null` sem exceção, e a geometria simplesmente os omitia — colisão,
  corte e margem saíam avaliadas sem ter olhado a camada, e a visão ficava sem
  marca dela. `revisarArte` compara os textos visíveis com as métricas e passa
  `textosSemMetrica`; `avaliarPeca` rebaixa para `parcial`, com os ids, tudo
  que depende da métrica (inclusive a visão). Prova 6t.

**Da revisão FINAL do Codex sobre 618e45f7 (BLOQUEADO, REV-FINAL-01…02, 12/09/2026):**

- 🔴 **O render do ajuste só PUBLICA se a página ainda estiver na versão que
  ele desenhou** (REV-FINAL-01). A proteção de versão cobria a escrita das
  CAMADAS; a miniatura e a Generation eram gravadas sem conferir nada.
  Intercalação real: numa peça sem post, o ajuste A grava V1 e renderiza; o
  ajuste B lê V1, grava V2 e publica; A termina por último, regravava a
  miniatura e virava a Generation mais recente com V1 — e `agendarPost`
  reutiliza a miniatura como mídia `RENDERED`, fora da fila de renders.
- **`renderPageAndRegister` recebe `versaoEsperada`** (o hash de
  `versaoDaPagina` das camadas que renderizou) e publica numa transação só:
  trava a linha da página (`SELECT … FOR UPDATE`), relê a versão, grava
  miniatura e Generation. Mudou → PNG apagado, nada publicado,
  `PAGINA_MUDOU_DURANTE` (409; no ajuste, com `ajusteGravado: true`). Quem
  gravou a versão seguinte responde pela arte dela; a agenda é avisada como no
  render que falha.
- 🔴 **A conferência é pelo CONTEÚDO, nunca `updatedAt`.** O autosave do
  PageSync que só troca a miniatura move o carimbo sem mudar o desenho, e
  descartar por ele recusaria ajuste bom. Os outros chamadores (fila COMPOR,
  recomposição, arte nova) não passam versão e seguem como antes — a
  recomposição já confere a versão no runner.
- 🔴 **Mapa de copy por camada usa `chaveUnicaDeTexto`** (`page-layers.ts`, a
  regra `#2`, `#3` de `textosDaPagina`), nunca `Object.fromEntries` por
  `name ?? id` (REV-FINAL-02). `copyVisualDasCamadas` colapsava duas camadas
  de mesmo nome ("Texto" em texto simples e em rich text): o PNG mostrava as
  duas, e a copy visual regravada pela recuperação, a conferência de texto e o
  post agendado por Generation/URL ficavam só com a última. O conteúdo entra
  inteiro, sem trim. Generation antiga já colapsada é regravada com os dois na
  próxima recuperação forçada.
- Provas: `ajuste-render-atrasado.test.ts` (A parado no `put`, B completo, A
  liberado por último; e o autosave de miniatura no meio, que NÃO descarta),
  `copy-visual-nomes-repetidos.test.ts` (as três codificações de
  `Page.layers`) e o passo 9k da prova de integração (costura
  `_prova.antesDePublicar`; escrito, ainda não rodado).

**Da revisão do commit 90aa3739 (BLOQUEADO, REV-90AA-01, 12/09/2026):**

- 🔴 **A costura de prova que roda ENTRE o upload e a publicação recebe a URL
  do PNG** (`antesDePublicar({ url })`) e a registra para a limpeza ANTES de
  fazer qualquer outra coisa. O PNG de A já está no Blob quando o passo 9k
  roda o ajuste B: se B lançar, A sai sem apagar nada; se o `del` da versão
  descartada falhar, `persist` só avisa (não pode derrubar o 409 esperado). Nos
  dois casos a URL não estava em Generation nenhuma nem no conjunto `blobs`, e
  a prova terminava verde com resíduo no Blob de PRODUÇÃO.
- **A limpeza de Blob da prova mora em `scripts/lib/limpeza-de-blobs.ts`**
  (`apagarBlobsDaRodada`, sem Prisma nem SDK): só URLs do Blob, sem repetição,
  falha ao apagar devolve erro e as URLs que ficaram — e quem chama conta como
  falha da prova (REV-9E-03). Tentar de novo o PNG que `persist` já apagou não
  custa nada; é o que pega a exclusão que virou só aviso.
- Provas: `ajuste-render-atrasado.test.ts` (a costura recebe a URL antes da
  publicação; se lançar, a URL já foi entregue) e
  `src/lib/__tests__/limpeza-de-blobs-da-prova.test.ts`.

**Da revisão FINAL do Codex sobre 0352c590 (BLOQUEADO, REV-127-INTEGRAL-01…02, REV-0352-01, 12/09/2026):**

- 🔴 **Id de camada criada pelo revisor se confere contra TODAS as camadas,
  escondidas inclusive — nunca só a primeira colisão** (REV-127-INTEGRAL-01).
  `aplicarAjustes` criava o gradiente de leitura e, se o id existia, tentava só
  `-revisao`. Criar, ocultar e recriar deixa `gradiente-leitura-rodape` e
  `…-revisao` ocultos na página; a terceira criação repetia `…-revisao`, e dois
  ids iguais em `Page.layers` fazem o ajuste seguinte por id atingir as DUAS
  camadas (o `Map` escolhe uma, a substituição por `l.id === alvoId` escreve nas
  duas, visibilidade inclusive). Hoje `idLivre` procura `-revisao`,
  `-revisao-2`… até achar um id livre; os ids existentes nunca mudam.
- 🔴 **Lista de saída do modelo cortada por teto é COBERTURA PARCIAL e nunca
  rebaixa achado medido** (REV-127-INTEGRAL-02). `reconciliarVisao` parava no
  6º achado com `break`, sem contar o resto: a visão saía "avaliada" e, se o 7º
  confirmava a falta de leitura medida, a leitura era rebaixada a sugestão
  dizendo que a visão não a viu. Hoje o achado válido e distinto além do teto
  conta em `truncados` (item inválido além dele segue em `descartados`); o
  estado da visão chega a `avaliarPeca` por `insumosDaVisao` (num lugar só,
  para ninguém esquecer o corte), e a regra trata `visaoTruncados > 0` como
  parcial mesmo com `visaoConclusiva: true` — a trava mora na regra, não só em
  quem chama.
- 🔴 **Gate de falha nunca é `if (erro)`: string vazia é falsy** (REV-0352-01).
  A exclusão do Blob que rejeitava com `new Error('')` ou `throw ''` devolvia
  `erro: ''` e a prova terminava com código zero e URLs no Blob de produção.
  Hoje a mensagem nunca sai vazia (texto padrão quando vem vazia) e a prova
  decide por `limpezaFalhou(r)` = `erro !== null` ou sobra de URL.
- Varredura: em `src/lib/creatives/revisao/` o único id com sufixo gerado é o do
  gradiente criado, e a única lista de saída de modelo com teto é a da visão.
  O `.slice(0, 5)` dos recortes é ENTRADA do modelo (a peça inteira e a marcada
  vão junto), e os `slice` de `descricao`/`evidencia`/`motivo` cortam texto,
  não lista.
- Provas: `aplicar-ajustes.test.ts` (quatro ciclos criar/ocultar com ids únicos
  e o ajuste por id que só toca a camada indicada), `visao.test.ts` (sete
  achados → `truncados: 1`; repetição não é corte; `insumosDaVisao`),
  `regras.test.ts` (cadeia reconciliar → insumos → avaliar com a confirmação da
  leitura em 7º: parcial e `problema`; controle dentro do teto: avaliada) e
  `limpeza-de-blobs-da-prova.test.ts` (rejeição com mensagem vazia e o gate
  `limpezaFalhou`). Cada correção desfeita por mutação faz a sua prova falhar.

**Da pré-revisão do commit 65b40096 (BLOQUEADO, C0-01…02, 12/09/2026):**

- 🔴 **A visão só rebaixa o achado MEDIDO que ela RECEBEU marcado** (C0-01).
  O laço que manda "texto sem leitura" para sugestão, e tira o assunto
  estimado, rodava ANTES de a revisão saber que a visão não teve marca daquele
  texto. Duas variantes, as duas com a régua medindo o horário fora do alvo e
  a visão devolvendo lista vazia: (A) o horário é texto sem métrica (curvo,
  fitty, auto-resize), que não ganha marca T, e era rebaixado dizendo que "a
  visão olhou e não viu", enquanto a cobertura, logo depois, virava parcial
  porque a visão não o recebeu (relatório contraditório); (B) a medição dos
  textos falhou, nenhum texto ganhou marca, TODA leitura medida descia e a
  visão ficava "avaliada". Hoje a cobertura é decidida antes: achado com
  alguma camada fora de `visaoCamadasMarcadas` (que `insumosDaVisao(visao,
  marcas)` preenche; sem o campo, a regra deriva de `blocosDeTexto`, a mesma
  conta de `marcasDaPeca`) continua medido e deixa a visão parcial, com os
  ids. Com `motivoSemMedida`, a visão nunca sai "avaliada".
- 🔴 **Confirmação da visão vale para TODOS os achados a que se aplica, nunca
  só ao primeiro** (C0-02). "Gradiente claro demais" apontado para a peça
  inteira (sem marca) confirmava, por `find`, só o primeiro `texto-sem-leitura`
  da lista; o horário ficava sem a confirmação e descia com a nota falsa de
  que a visão não viu problema de leitura. Hoje é `filter`: cada irmão recebe
  o olhar. Item com marca continua confirmando só o que cruza a marca.
- Varredura em `regras.ts` dos pontos em que a presença da visão muda a classe
  de um achado medido: o laço de arbitragem (leitura → sugestão; assunto
  estimado → sai) passa pela checagem de marca, e a confirmação por irmão
  (que protege do rebaixamento) é por `filter`. `contradicaoDaMedida` só anota
  o achado da própria visão, e os desmentidos descartam apontamentos DA
  visão, não achados medidos.
- **O cleanup do banco e a exclusão do Blob da prova são passos independentes**
  (nota não bloqueante da mesma pré-revisão): `limparBancoEBlobs`
  (`scripts/lib/limpeza-de-blobs.ts`) roda o banco num `try`, apaga o Blob
  mesmo que ele lance (com as URLs juntadas até ali) e devolve `erroDoBanco`,
  nunca vazio, que a prova conta como falha.
- Provas: `regras.test.ts` (texto sem métrica e medição que falhou, os dois
  mantendo `problema` e a visão parcial, com o controle marcado que ainda
  desce; o assunto estimado sem marca que fica; a peça inteira confirmando as
  duas leituras, com o controle só em T1), `visao.test.ts` (`insumosDaVisao`
  leva as camadas marcadas) e `limpeza-de-blobs-da-prova.test.ts` (banco que
  lança não impede o Blob). Cada correção desfeita por mutação faz a sua prova
  falhar.

**Da pré-revisão do commit 400277a5 (APTO COM NOTAS, C0-11) e da pré-revisão do PR 3 (C3-11), 12/09/2026:**

- **Texto VAZIO não entra em achado de leitura** (C0-11). O medidor devolve
  `null` para conteúdo vazio (sem métrica, sem marca), `textosSemMetrica` exige
  conteúdo, mas a régua mede a CAIXA de todo texto visível. Num grupo
  `{cta: "Reserve já", servico: ""}` sobre foto clara, o achado nascia com
  `['cta', 'servico']`, severidade de serviço e "o horário não dá leitura", e a
  regra do C0-01 bloqueava o rebaixamento dizendo que a visão "não recebeu
  marca" de uma camada sem nada para ver. Hoje a seção 6 tira do achado todo
  texto sem conteúdo (`textoSemConteudo`, o mesmo critério de
  `textosSemMetrica`), e grupo só de textos vazios não gera achado. A
  checagem de marca não precisou de filtro próprio: o único produtor de
  `texto-sem-leitura` é a seção 6. ⚠️ A régua continua medindo a caixa vazia
  no p98 do GRUPO — isso é anterior e fica fora deste conserto.
- **Lacuna de teste fechada**: a regra "medição falhou ⇒ visão parcial" agora
  tem prova SEM achado de leitura (antes a mesma prova tinha `naoVistas`
  preenchido, e tirar `|| e.motivoSemMedida` não quebrava nada).
- 🔴 **A marca do revisor só sobrevive se a BASE também está escondida COM
  ela** (C3-11). O editor guarda a camada no estado local e reenvia a marca
  que o servidor já tirou: mostrar → esconder de novo → qualquer edição, e
  `reconciliarMarcasDoRevisor` mantinha a marca porque só olhava se a base
  estava escondida. O esconder humano virava mecânico e o contrato recebia
  depois uma revisão `equipe` restaurando o bloco. Hoje é
  `if (a && !ocultaPeloRevisor(a))` — base visível cai no mesmo ramo; camada
  nova (sem base) mantém a marca; o autosave logo depois do ajuste também.
- **As mensagens do cleanup da prova dizem o que aconteceu**: tudo em
  `criados` começa em zero e cresce com a contagem de cada delete (o resumo
  afirmava uma página que não tinha sido apagada); a linha do banco só diz que
  o Blob foi apagado quando foi; e cada consulta que descobre URL é anunciada
  antes de rodar (`descoberta.pendente/feita`), então as que não rodaram saem
  listadas como "URLs NÃO descobertas". Tudo em `falhasDoCleanup`, testado sem
  banco.
- **Dois commits do PR 0 que nasceram no branch do PR 6 desceram por
  cherry-pick**: `copyVisualRegravada` (o marcador da copy visual regravada no
  re-render) e `recusaDaRecomposicao` (a recusa em chave própria, C6-01), com
  os testes do harness do PR 0 passando aqui sem nada do PR 6.
- 🔴 **A prova 6n lê a recusa em `recusaDaRecomposicao`** (C6-11 da
  pré-revisão do PR 6): ela lia `recomposicao` e ficaria vermelha em toda
  rodada com o C6-01 — e o conserto tentador seria reverter o C6-01. Agora ela
  exige também `recomposicao.estado === 're-renderizada'` (o registro do
  re-render que a mesma rodada gravou antes de lançar) e `arteTrocada: true`.
- **A recusa sabe se a imagem já foi trocada** (C6-12): o runner guarda o
  resultado da recomposição antes das checagens seguintes e passa
  `arteTrocada` e os posts trocados a `registrarRecusa`; o histórico usa
  `mensagemDaRecusaNoHistorico` e o conselho é neutro ("confira a página e
  salve de novo" — a mudança pode ter sido a foto). O docstring deixou de
  dizer que a galeria e `ver-geracao` leem a recusa: hoje só o histórico do
  post avisa, e a chave na arte é diagnóstico.
- Provas: `regras.test.ts` (grupo com texto vazio: achado só com o CTA,
  sugestão e visão avaliada; só vazio: sem achado; controle curvo: problema e
  parcial; medição que falhou sem achado: parcial),
  `oculta-pelo-revisor.test.ts` e `patch-da-pagina-marca-do-revisor.test.ts`
  (mostrar → esconder → editar, na função pura e pelo PATCH real da página),
  `limpeza-de-blobs-da-prova.test.ts` (mensagens e consultas não rodadas) e
  `copy-visual-regravada-marcador.test.ts` (histórico por post e
  `arteTrocada`). A 6n da prova foi só tipada, não rodada aqui.

### A regra `logo-sem-leitura` (CP3, 15/10/2026)

- O revisor mede cada logo SOLTA (`logosDaPeca`) contra o fundo efetivo sem ela, pelo mesmo módulo do
  compositor (`medirLogosDaPeca` em `legibilidade-da-logo.ts`): p10 da diferença de luz pixel a pixel
  ≥ 45, só nos pixels com alfa ≥ 128. O achado é `problema`, `certeza: 'medida'`, com p10, média,
  proporção no limiar, pixels, limiar, alfa, a variante (url e, quando a composição gravou, a origem) e
  a posição em `evidencia`. **Sem ajuste mecânico**: trocar a variante ou o canto é do compositor com
  arquétipo; o humano só é avisado (o gate autônomo é do CP5).
- Arquivo que não baixou ou não decodificou NÃO é "sem contraste": a logo entra como `indisponivel` e a
  regra fica `parcial` (ou `nao-avaliada`, se nenhuma mediu), com o motivo. O render que falha deixa a
  regra `nao-avaliada` (`motivoSemLeituraDaLogo`).
- A regra não depende das métricas de texto: as listas de exceção de `motivoSemMedida` e
  `textosSemMetrica` a mantêm avaliada.

### Ajustar sem piorar (CP4, 15/10/2026)

Pedido do owner (operação noturna de 14→15/10): "TODO ajuste mecânico → medir antes → aplicar em memória
→ medir depois → aceitar ou recusar; UMA escrita no fim; nunca escrever → medir → desfazer; sem pontuação
global". Módulos em `src/lib/creatives/revisao/`:

- **`revisar-arte.ts`** ganhou `contextoDaMedicao` (o que vem do banco: assinatura, gerações, faixa,
  referências, assunto, origens da logo, cache da logo) e `medirCamadasDaPeca(camadas, ctx, { corrigir })`
  (fontes, geometria, régua, logo) — a MESMA medição de `revisarArte`, que agora é só
  `contextoDaMedicao` → `medirCamadasDaPeca` → `avaliarPeca` + visão. O revisor mede com `corrigir: true`
  (precisa de `tintaCorrigida` para propor força); o executor do CP4 com `corrigir: false` (julga a peça
  como vai ser gravada — ver a rodada de revisão abaixo). `MedidaDaPeca` é a `EntradaDaRevisao` sem visão.
- **`nao-piora.ts`** (puro, sem banco): `compararNaoPiora(antes, depois, { achadoAlvo })` compara
  propriedade a propriedade — os achados mecânicos das regras comparadas (`texto-cortado`,
  `tinta-fora-da-caixa`, `colisao`, `fora-da-area-segura`, `tratamento-piorou-leitura`,
  `texto-sobre-assunto`, `logo-sobre-texto`, `logo-sem-leitura`, `fonte-nao-carregada`) pela
  **gravidade por regra** (`gravidadeDoAchado`: linhas cortadas, px, cobertura, o que falta ao p10 da
  logo), achado a achado pela chave estável (regra + camadas ordenadas); o **contraste de cada texto**
  pela régua (texto no alvo que sai dele; fora do alvo que se afasta além de `TOLERANCIA_DE_PIORA` —
  a regra do oráculo P9 do CP0); a **geometria** (caixa degenerada ou inteira fora do canvas). O
  veredito é `aceito` só sem piora, sem propriedade não medida (cobertura `nao-avaliada` ou régua
  `null` de um lado → `AJUSTE_NAO_MEDIDO`, fail-closed) e com o achado alvo resolvido ou melhorado.
  Nenhuma melhora compensa uma piora. A visão (`certeza: 'visao'`) não entra: um achado de visão que
  aparece depois não é piora, e o ajuste que declara corrigir um achado de visão não precisa de prova
  — mas passa pela não-piora como qualquer outro.
- **Achado alvo**: `ajuste.achado` é o id do achado (`regra:camadas`). Mensurável e não resolvido nem
  melhorado → `AJUSTE_NAO_MELHOROU_O_ACHADO`, mesmo sem piorar nada. `texto-sem-leitura` é medido pela
  **régua** (a distância ao alvo do texto), não pela evidência do achado. Id que não existe no antes →
  `nao-encontrado` (aceito pela não-piora, dito na comparação).
- **`ajustar-sem-piorar.ts`**: `aplicarAjustesSemPiorar` aplica cada ajuste SOZINHO numa cópia
  (`aplicarAjustes`, puro — as recusas estruturais continuam as dele), passa a cópia pelo autofix
  geométrico (`TEXTO_NAO_CABE` recusa só aquele ajuste), mede e compara com o estado atual; aceito → a
  cópia vira o estado (o próximo ajuste é medido sobre ela); recusado → descartado. Lote parcial: 1
  bom, 2 ruim, 3 bom → 1 e 3 entram, `resultadoDosAjustes = 'parcial'`.
- **`ajustarArte`** chama o executor ANTES de qualquer escrita; a proteção de versão
  (`VERSAO_DIVERGENTE`) continua antes de medir. Todos recusados pela qualidade e nada mais a gravar →
  `AJUSTE_PIOROU_ARTE` (422, `details.recusados` com `comparacao` antes/depois, `ajusteGravado: false`):
  **nenhuma escrita, nenhuma Generation, nenhum render reaberto** — a última versão boa fica. Cada
  `ajustesAplicados`/`ajustesRecusados` traz `indice`, `tipo`, `achado`, `codigo`, `motivo` e
  `comparacao`; a Generation grava o mesmo.
- **Regressão do piloto** (`piloto-ciclo.test.ts`, fixture `piloto-2026-10-13`): os 3 ajustes que o
  agente mandou em produção — `mover servico −230` (o texto claro afasta-se do alvo: p98 194 → 233),
  `gradiente` com cor (estrutural, CP1) e `mover headline+apoio +110` (a manchete escura sai do alvo:
  185 → 114) — são TODOS recusados e a página fica na v1. O P9 do CP0 ("um ajuste persistido nunca
  deixa a peça pior") virou `it()`. Provas em PNG: `PROVAS_DIR=/tmp/provas-cp4 npx vitest run
  src/lib/direcao-de-arte/__tests__/piloto-ciclo.test.ts -t provas` (antes, recusado, aceito, agente-v2).
- 🔴 **Fora do CP4**: o gate autônomo (`REVISAO_HUMANA_NECESSARIA`, draft-only) é do CP5 — o
  `hojeViola` P11 "recusado ANTES de substituir a versão do rascunho" só vira `it()` lá. O CP4 não
  muda o fluxo humano além de recusar o ajuste que piora (warn + recusa estruturada, nunca em silêncio).
- **Rodada de revisão adversarial (6 revisores, 15/10/2026)** — o que mudou depois do primeiro commit:
  - 🔴 **O executor mede com `corrigir: false`.** Com `corrigir: true` a régua aplica em memória a força de
    gradiente que PROPORIA e sobrescreve `textos[].p98ComHalo/ok` com a leitura pós-correção — o revisor
    humano se protege com `antesDaCorrecao`, o comparador não: o CP4 julgava uma peça hipotética (piora
    real 161→177 aceita; ajuste inócuo "resolvia" `texto-sem-leitura`). Provado pelo revisor B na régua
    real com véu escuro; coberto no piloto ("a régua do executor NÃO aplica a correção hipotética").
  - **Catraca fechada**: cada candidata é comparada com o estado atual E com o de ENTRADA da chamada
    (`comparacao.contraEntrada`): N passos "dentro da tolerância" não somam 30 px.
  - **Chave do achado = `id`** (não regra+camadas): `texto-largo` ≠ `texto-cortado`; `logo-sobre-texto`
    casa pela logo (textos tocados = gravidade); `fonte-nao-carregada` pela família (camadas = gravidade);
    `colisao` pelas camadas ordenadas.
  - **Desaparecer não é melhorar**: texto com conteúdo que some é piora de geometria (salvo pelo próprio
    ajuste `visibilidade`); a logo escondida ou empurrada para fora do canvas é piora sempre; o achado cuja
    camada sumiu fica `nao-melhorou` ("só escondeu"). Texto que APARECE sem leitura é piora. Texto VAZIO
    não entra no contraste. 🔴 **Decisão do owner (15/10/2026): AJUSTAR-ARTE NÃO PODE APAGAR COPY.**
    `visibilidade: false` em texto/rich-text com conteúdo (após trim) é recusado ESTRUTURALMENTE
    (`CONTEUDO_NAO_PODE_SER_OCULTADO`, na pré-checagem, antes de qualquer medida), com ou sem `achado`,
    mesmo que esconder resolvesse colisão/contraste; se UMA camada do ajuste é texto com conteúdo, o ajuste
    INTEIRO é recusado (nada parcial). A mensagem diz quais camadas têm conteúdo. `visibilidade: true`,
    texto vazio e camada decorativa seguem o contrato de sempre (gate de não-piora); a logo escondida
    continua piora. Um `achado` sem solução mecânica fica ABERTO (revisão humana / outra composição).
    A recusa olha também o conteúdo que a PÁGINA tinha antes da chamada (`conteudoAnterior`): esvaziar pelo
    `slotValues` e esconder por `visibilidade` na mesma chamada é apagar copy em dois passos — recusado. Quando
    só há essa recusa, o código da CHAMADA é `CONTEUDO_NAO_PODE_SER_OCULTADO`. **Fora desta decisão (pendente
    do owner)**: `slotValues` com `''` ou `hidden: true` esvazia/esconde texto pelo caminho HUMANO do chat (gesto
    documentado, REV-8AD-02) e `hidden` não aparece em `camposAlterados`; `fonte` até 8 px (`escala 0.5`) passa o
    gate porque `texto-pequeno` não é propriedade comparada. **→ Fechados no CP4.1 (abaixo).**
  - **Camada sem métrica** (fonte não cadastrada, curvo/fitty/auto-resize, rich text, logo não medida):
    mexer nela é `AJUSTE_NAO_MEDIDO`; mexer noutra continua medido pelo que a cobertura `parcial` cobriu.
  - **Regra inaplicável não bloqueia**: `texto-sobre-assunto` `nao-avaliada` dos dois lados numa peça
    SEM foto de fundo — ou, desde o CP4.1, com a foto LIDA e sem assunto localizável (cobertura
    `naoSeAplica`) — vai a `comparacao.naoAplicaveis`; foto que existe e não baixou segue não medida.
    Logo num arranjo ou fora do contrato (rotação, opacidade, cover, recorte): o conserto é no editor.
  - **Id de achado desconhecido** (não `visao-…`) é `AJUSTE_NAO_MELHOROU_O_ACHADO`, não passe livre; o
    `visao-…` é `nao-mensuravel` (nunca está na medida sem visão).
  - **Autofix**: o "antes" já passou pelo autofix dos textos/foto da chamada (slot que não cabe é
    `TEXTO_NAO_CABE` da CHAMADA, antes de medir); o que o autofix mexe na candidata aceita é DITO em
    `ajustesAplicados[].autocorrecao`; não há segunda passada depois da medida — o medido é o gravado.
  - **Código da chamada** quando tudo é recusado: o mais grave que houve (PIOROU > NÃO MELHOROU >
    NÃO MEDIDO > SEM EFEITO); "não medido" nunca sai como "a peça ficaria pior".
  - `tratamento-piorou-leitura` que aparece sem a leitura do texto piorar não é piora (o contraste
    decide); o achado dessa regra só está resolvido se a leitura não piorou.
  - **Rodada do Codex (R1, 15/10/2026)**: as camadas TOCADAS vêm da diferença real entre o estado e a
    candidata (`camadasQueMudaram`), não do que o ajuste declara — `mover`/`visibilidade` não entram em
    `alteradas` do executor puro, e sem isso um `mover` em texto sem fonte passava; a candidata nasce de
    `structuredClone` (nenhuma camada compartilhada); logo já parcialmente fora e empurrada MAIS para fora
    é piora (px fora antes → depois); o `achado` sobrevive a índice > 0 (`indiceBase`). No harness do
    piloto as famílias da fixture são declaradas presentes para `fontesQueFaltam` (artefato do ambiente;
    o render segue com a fonte de reserva) — e com a geometria contando, o `mover headline+apoio −60`
    passou a ser recusado por invadir a margem do topo em 26 px: o "aceito" dos testes é −20.
  - **Codex R2**: a conferência das fontes que falha (`fontesQueFaltam` lança) não vira "nenhuma fonte
    falta": `motivoSemFontes` deixa `fonte-nao-carregada` não avaliada e o executor recusa como não medido.
  - Lote só de recusas estruturais não mede nada; `PAGINA_COM_VIDEO` antes de medir; fontes do projeto
    registradas uma vez por chamada; bytes da logo em cache por chamada (um download, falha
    determinística no lote); `fontesQueFaltam` cercada; o índice da marca `ocultaPeloRevisor.ajuste` é
    o do lote (`indiceBase`).
- Limites medidos: o executor roda a régua (dois renders) por ajuste — um lote de 30 ajustes custa
  ~30× a medida (+1 render da logo por medida); o conector limita a 30. Achados de visão nunca entram
  na comparação. Não são propriedades comparadas: `titulo-grande`, `entrelinha-grande`, `palavra-orfa`,
  `gradiente-forte-demais`; `texto-pequeno` É comparada desde o CP4.1 (abaixo); a geometria só pega caixa degenerada/fora do canvas, logo
  parcialmente fora e desaparecimento; gradiente/imagem/forma fora do canvas só indiretamente. O limiar
  do `ok` da régua (`TOLERANCIA_DO_ALVO`) é a linha dura: texto com folga zero que sai do alvo por 1
  unidade é piora (a regra P9). A baseline é `reflowed` (com os textos da chamada), não a página gravada:
  com `slotValues` + `ajustes`, os textos entram mesmo que todos os ajustes caiam.

### CP4.1 — fecha a remoção de copy e completa o não-piorar (15/10/2026)

Decisão do owner: **o agente autônomo não pode apagar copy para "corrigir" design** — nem pelo `slotValues`.

- **`copyRemovidaDoBake(sourceLayers, bakedLayers, slotValues, valores)`** (`src/lib/creatives/bake-layers.ts`,
  puro): o que o bake fez com a copy EXISTENTE — texto (`text`/`rich-text`) com conteúdo não vazio, visível
  (ou escondido pelo revisor, que o aprendizado conta como presente) que saiu `escondido` (`hidden: true`)
  ou `esvaziado` (`''`, só espaço, `{ content: '' }`, inclusive por `_slots`/`_papeis`). Protege o RESULTADO,
  não a sintaxe; compara por índice (o bake preserva a posição); o `endereco` é a mesma precedência do
  bake (`layerId` > `slotId`/`semanticRole` > `name`). A chave de NOME atinge toda camada com esse nome:
  uma entrada, N remoções, por camada.
- **Draft-only** (`input.apenasRascunho`): `ajustarArte` lê o bake SEM a foto logo depois da resolução
  semântica e, se houver remoção, recusa `CONTEUDO_NAO_PODE_SER_REMOVIDO` (422) ANTES de qualquer
  escrita — inclusive do cache do Blob em `resolveImageUrl`. `details.copyRemovida[]` traz `layerId`,
  `operacao`, `tinhaConteudo`, `endereco` (sem o texto integral); a mensagem diz o nome da camada e a
  operação. Trocar "Texto A" por "Texto B" continua permitido (gates normais); esconder slot JÁ vazio
  segue o contrato. A criação de arte (`createArteRapida`, placeholders não usados escondidos) não passa
  por aqui: a guarda vive em `ajustarArte` sob `apenasRascunho`.
- **Fluxo humano**: continua podendo esconder/esvaziar texto pelo chat, mas fica AUDITÁVEL: `copyRemovida`
  no retorno de `ajustarArte` (ao lado de `camposAlterados`, que é "conteúdo alterado") e em
  `Generation.fieldValues.copyRemovida` — distingue conteúdo alterado / esvaziado / visibilidade alterada.
  Sem migration.
- **`texto-pequeno` na não-piora**: propriedade comparada com a gravidade da própria regra
  (`max(0, piso1080 − corpo1080)` da evidência; o piso já é relativo ao modelo — modelo que nasceu miúdo
  tem piso menor; tolerância 1 px pelo arredondamento da evidência). Saudável → 8 px aparece (piora);
  já pequeno → menor piora; → maior melhora; reduzir a fonte para resolver colisão e cruzar o piso é
  recusa (sem pontuação global); o encolhimento pelo autofix que cruza o piso também é recusa (a
  candidata medida é a pós-autofix). Camada não medida: fail-closed do CP4. **Fora, por desenho da regra
  9 (decisão pendente do owner)**: títulos (`headline`/`headline2`) não entram em `texto-pequeno` — a
  manchete 84 → 8 px não é detectada por esta regra; cobrir exigiria mudar a regra do revisor.
- **Provas do passo 9 de `scripts/validar-revisor-da-arte.ts`** redesenhadas sem esconder texto com conteúdo
  (ver o cabeçalho do passo 9 no script): 9a/9b/9c provam a recusa PRÉ-escrita (página, miniatura, marca,
  Generation e job intactos; dica aceita-como-veio; post RENDERED); 9e usa a força do gradiente (copies iguais
  à página); 9g lê a divergência do 9e E planta/restaura uma segunda direto na Generation (valor só da `copyDeAprendizado`); 9h/9i/9j usam `mover` permitido e
  conferem `copyVisualRegravada`; 9f (controle humano) fortalecida — marca antiga sai, `copyRemovida`, sinal do
  ajuste, `removidos` exatos; 9d (remoção humana sem marca → `editada`) não mudou.
- **Ajuste final do owner (15/10, tarde) — remoção por PONTUAÇÃO fecha**: "ALMOÇO EXECUTIVO" → "." (ou "...",
  "—", "___", "!!!", "()", "/", "•••") passava como "texto por texto" porque ainda havia caractere visual; é remoção
  com outra sintaxe. `temTextoSubstantivo` (`texto-visivel.ts`, puro) diz se há CONTEÚDO — uma letra (`\p{L}`), um
  número (`\p{N}`) ou um pictograma/emoji (`\p{Extended_Pictographic}`, mais as bandeiras) — por propriedade Unicode,
  sem lista ASCII; `temTextoVisivel` NÃO mudou (continua "há algo desenhável?" para a geometria e o revisor). O guard
  (`copyRemovidaDoBake`) só protege origem SUBSTANTIVA (placeholder "-" ou "." não vira copy protegida) e registra
  a terceira operação `sem-conteudo` quando o resultado do bake é só pontuação/símbolo; draft-only recusa com o
  mesmo `CONTEUDO_NAO_PODE_SER_REMOVIDO` (zero escrita, zero Generation, zero render); o humano pode, e
  `copyRemovida` registra `sem-conteudo` (não entra em `camposAlterados`). "Almoço" → "Jantar" / "11h" / "🍷" /
  "50% OFF" / "R$ 79" continuam permitidos: a qualidade editorial é da copy/gate, não deste guard. Provado por
  id, nome, `_slots` e `_papeis`. **Caça-bypass do predicado (1 subagente, medido em Node 22)**: os fillers Hangul
  U+115F/U+1160 são `\p{L}` e passavam (BLOCKER) → `INVISIVEIS` usa `\p{Default_Ignorable_Code_Point}`; `‼ ⁉ 〰 ↔`
  e `© ® ™` são `Extended_Pictographic` e passavam → excluídos os que também são `\p{P}`/`\p{Sm}` e as marcas;
  letras modificadoras (`\p{Lm}`: ʼ ʹ ˆ ː) passavam → excluídas. Os keycaps `#️⃣`/`*️⃣` entram como sequência (Codex: origem protegida e destino permitido).
  **Residuais documentados, não mexidos**: falsos positivos raros (texto em braille com pontos, moeda sozinha `€`, ícone de fonte PUA; `✓`/`→`
  bloqueados × `✔`/`➡` aceitos, por classificação do Unicode); pictograma não atribuído passa; valor de TIPO errado
  em `slotValues` (número, array, `{ hidden: 'true' }`, `{ visible: false }`) é ignorado pelo bake e a chamada
  responde sucesso regravando a página igual — não vaza copy, custa um render e engana o agente (candidato a
  `VALOR_INVALIDO` no legado, fora deste ajuste).
- **Foto sem assunto localizável não trava mais o ajuste** (achado da prova de integração, passo 6): a peça
  cuja foto o mapa de calma lê sem achar região forte (o compositor grava `assuntoOrigem: 'nenhum'`) vinha com
  `texto-sobre-assunto` "não avaliada" e o CP4 recusava TODO ajuste nela como `AJUSTE_NAO_MEDIDO` — não era
  falha de medição, era "não há assunto". `assuntoDaPeca` passou a dizer o motivo e a marcar a cobertura com
  `naoSeAplica: true` (sem foto; `assuntoOrigem: 'nenhum'` gravado para a mesma foto/corte/formato; ou o mapa
  de calma sem região forte); o comparador trata a marca dos DOIS lados como regra inaplicável. A estimativa
  que FALHOU (foto não baixou, sharp não leu) continua sem a marca e não medida (fail-closed).
- **Pendências registradas no fechamento do CP4.1 (roadmap, NÃO implementadas neste PR)**:
  - **CP4.2 — título pequeno**: `texto-pequeno` exclui `headline`/`headline2` por desenho da regra 9; um ajuste
    autônomo ainda pode transformar a manchete em corpo absurdamente pequeno. Cobrir reutilizando a referência do
    modelo (corpo/entrelinha de referência da página), sem inventar um limiar isolado.
  - **CP5 — oclusão**: forma/imagem desenhada ACIMA do texto (z-order) não é propriedade determinística medida. Antes
    de um `APTO` autônomo, o CP5 precisa medir/provar a oclusão OU marcar a situação como não comprovada e mandar
    para `REVISAO_HUMANA_NECESSARIA`.
  - **MCP-M5 — auditoria durável**: no fluxo humano, `copyRemovida` gravada na Generation depende de o render
    concluir; página alterada + render falho pode ficar sem o registro durável (a página já perdeu a copy na
    transação). Entra na trilha de recuperação/auditoria, não aqui.
- **Rodada dos 4 revisores (15/10)**: "tem conteúdo" é texto VISÍVEL (`texto-visivel.ts`: `trim` mais os
  caracteres de formato U+200B/C/D, U+2060, U+00AD, U+FEFF, U+034F, U+3164/FFA0, U+2800) — no bake, no
  ajuste `visibilidade`, no comparador e em `textoSemConteudo`; esvaziar destrói conteúdo seja a camada
  visível, escondida pela pessoa ou pelo revisor; `hidden: true` numa camada escondida PELO REVISOR conta
  como esconder (o bake lava a marca); `{ content: '', hidden: true }` registra as duas operações; o mesmo
  registro `CopyRemovida` vai aos `details`, ao retorno e à Generation; `camposAlterados` passa a ser só
  "texto trocado por outro texto" (o esvaziado sai dele); as mensagens das duas recusas dizem a camada,
  nunca o texto. **Residuais conhecidos**: `camposAlterados` é cego a rich-text (pré-existente; `copyRemovida` o vê); a auditoria durável
  (Generation e sinal) só nasce se o render do ajuste terminar — a página já perdeu a copy na transação
  (limite pré-existente); oclusão de texto por forma/imagem acima dele (z-order) não é propriedade medida.

### CP4.2 — piso da manchete e `slotValues` inválidos (15/10/2026, noite)

Contrato aprovado pelo owner: `docs/PLANO-2026-10-15-CP4-2-CONTRATO.md` (HEAD 9b85ec29 + duas precisões). O que
está implementado:

- **CP4.2a — a manchete entra em `texto-pequeno`, um achado por componente.** A regra 9 deixou de pular
  `headline`/`headline2`. Para cada título ela avalia três pisos SEPARADOS (`pisosDoTitulo`, puro, `regras.ts`) e
  emite até três achados com id estável `texto-pequeno:<camada>:<componente>` e gravidade própria
  (`piso − corpo`, inteiros pelo arredondamento de sempre): **modelo** = `pisoRelativo` (0,8) × a referência do
  título (`referenciasDaPagina`: variante da assinatura por papel ou página-modelo por id; a referência INFERIDA do
  fallback 16 — camada do modelo sem `fontSize` numérico — é dita (`inferida: true`) e conta como ausente para
  títulos); **hierarquia** = o maior corpo1080 dos textos secundários medidos (fator 1,0 — o título não fica menor
  que apoio/serviço; `K_REFERENCIA_HIERARQUIA` continua só telemetria); **celular** = `pisoDeFonte1080` (24), salvo
  modelo deliberadamente discreto (referência válida < 24: só o recuo de 80 % conta). Severidade `aviso`; uma
  sugestão de `fonte` por título (sobe ao maior piso cruzado). Como `texto-pequeno` já é propriedade comparada e a
  chave do achado é o id, a não-piora compara cada componente sozinho: **uma melhora na hierarquia não compensa o
  modelo que aparece** (o contraexemplo do owner — título 84/apoio 160 com `escala 0,5` nos dois — é recusa, com
  `comparacao.pioras[].id = texto-pequeno:headline:modelo`). `Piora`/`Melhora` passaram a trazer `id`.
- **A classificação e a referência dos títulos vêm da página ANTERIOR à chamada.** `ajustarArte` passa ao executor
  `camadasDaPagina` (= `sourceLayers`, antes do bake e do autofix); o executor fixa `titulosFixados` por
  `titulosDaPagina` (papel GRAVADO `headline`/`headline2` entra mesmo vazio ou oculto; sem papel, inferência por
  tamanho só entre os anteriores visíveis com conteúdo) e monta o contexto com essas camadas — o `papel` enviado no
  próprio pedido não rebaixa a manchete nem troca a referência (que casa pelo papel gravado, inclusive com a camada
  anterior oculta). Título sem referência válida recebe o corpo ANTERIOR como referência (`origem: 'página como
  está'`). Rebaixar o papel pelo `slotValues` continua permitido: na chamada SEGUINTE a camada é julgada pelo papel
  que a página passou a ter. A regra 7 (`titulo-grande`) sugere escala que respeita o piso compartilhado e o 0,5
  do `ajusteSchema`. `revisar-arte` solto continua inferindo os títulos como sempre (cobertura `parcial` quando o
  título não tem referência de modelo). **Só a classificação e as referências vêm da página anterior**: o ASSUNTO da
  foto sai das camadas EFETIVAS depois do bake (`args.camadas` em `contextoDaMedicao`) — trocar a foto e ajustar na
  mesma chamada mede o ajuste contra o assunto da foto NOVA, e foto nova ilegível fica "não medida"
  (`AJUSTE_NAO_MEDIDO`), nunca herda o "não se aplica" da anterior (revisão do owner, 15/10; provas (a)/(b)/(c) e o
  controle sem troca em `piloto-ciclo.test.ts`).
- **CP4.2b — `slotValues` inválido é recusado antes de qualquer escrita, por uma fonte só.** Em
  `src/lib/semantica/resolver-valores.ts`: `valorLegadoValido` (string, ou objeto NÃO vazio só com
  `content: string` / `fileUrl` não vazia / `hidden: true` exato / `papel`,`bloco` não vazios);
  `validarFormatoDosSlotValues` (FASE 1, sem página: legado inválido → `VALOR_INVALIDO` com origem
  `{ tipo: 'chave' }`; `_imageUrl`/`_driveImageId` só string não vazia — só AUSENTE é "não fornecido", `null` é
  `VALOR_INVALIDO` (revisão do owner, 15/10: `_imageUrl: null` respondia sucesso, regravava a página, criava Generation e
  fazia `put`); `_slots`/`_papeis: null` continuam "não fornecido" (compatibilidade aprovada); outro `_…`
  → `CHAVE_DESCONHECIDA`; `_slots`/`_papeis` continuam com `validarEntradaSemantica`);
  `validarEnderecosDosSlotValues` (FASE 2, contra as camadas do modelo EFETIVO: chave que não é id nem nome de
  camada → `CHAVE_DESCONHECIDA`; a precedência é a do bake, id > semântico > nome POR CAMADA — uma chave que é id de
  uma camada e nome de outra preenche as duas). **400 para formato, 422 para endereço/resolução.** Pedido misto
  (válido + inválido) é recusado inteiro: `slotValues` é um mapa aplicado num só bake (diferente do lote de
  `ajustes`, julgado por índice). `""`, espaço, `"."`, `{ content: "" }`, `{ hidden: true }` continuam FORMATOS
  válidos e chegam ao guard do CP4.1, que decide o conteúdo. O objeto só com `papel`/`bloco` e `temAjuste` não
  mudaram.
- **Onde roda:** `ajustarArte` — FASE 1 antes do banco, FASE 2 logo depois de `camadasParaBake` (antes do
  semântico, do guard de copy, da foto e de qualquer escrita). `createArteRapida` — FASE 1 antes de ler a foto;
  **`resolveImageUrl` foi separada em `lerImagemDeEntrada`** (autorização por projeto + download da miniatura do
  Drive, SEM `put`) **e `persistirCacheDoDrive`** (o `put`, mesma chave determinística; `resolveImageUrl` continua
  como a composição das duas para os outros chamadores); a foto do Drive é lida por bytes (`lerFotoDeBytes`) para
  escolher o layout; FASE 2 contra a irmã escolhida ANTES do `put`, do template, da persistência e do render; a foto
  lida recebe a URL final antes do halo. Efeito residual declarado: a miniatura do Drive é LIDA antes da validação
  de endereço (o endereço depende do modelo que a foto escolhe). Handlers `ajustar-arte` e `criar-arte-de-modelo`
  rodam a FASE 1 no handler por `erroDeValores` (em `src/lib/creatives/errors.ts`, e não em `arte-rapida.ts`: os
  testes das guardas mockam o serviço inteiro; a mensagem nomeia a chave e o formato aceito), para a porta devolver `code`,
  `details.erros[]` e a chave — o `safeParse` do schema só devolveria texto; o serviço repete a conferência (API
  externa e execução de plano não passam pela porta).
- **Provas:** `regras.test.ts` (componentes, discreto, sem referência/inferida, `titulosFixados`, `titulosDaPagina`,
  regra 7), `nao-piora.test.ts` (sem compensação, ids), `ajustar-sem-piorar.test.ts` (contexto da página anterior),
  `piloto-ciclo.test.ts` com o renderer real sobre a fixture (T1/T2, T3/T14, T4, T17, T18/T19, T20a/b/c);
  `resolver-valores.test.ts` (tabela de formatos, controles, misto, V18), `ajustar-arte-concorrencia.test.ts`
  (V1–V12, V14, V15, V18 — zero escrita/Generation/`put`), `criar-arte-semantica.test.ts` (V16 Drive + endereço
  inválido sem `put`; formato antes da foto; caminho válido com a mesma escolha de layout, `put` único e URL final no
  halo; URL direta), `foto-do-drive-no-projeto.test.ts` (ler × persistir, autorização),
  `criar-arte-de-modelo-copy-crua.test.ts` (V17, porta preserva o erro).

### CP5a — o veredito puro (`gate.ts`), 16/10/2026

Contrato aprovado pelo owner: `docs/PLANO-2026-10-15-CP5A-CONTRATO.md` (PR #236, HEAD 08a44af5). Nada de produção chama o
gate: `agendar-leva` continua criando DRAFT sem veredito (CP5c), `ajustar-arte` continua só com a não-piora (CP5d),
nada é persistido (CP5b). O que existe:

- **`src/lib/creatives/revisao/gate.ts`** (puro, sem banco nem render): `gateDaMedida({ medida, identidade, copy?,
  politicaDoAssunto })` → `{ gate: GateDaArte, relatorio }`. A medida (`MedidaDaPeca`, o que `medirCamadasDaPeca` devolve)
  é a FONTE ÚNICA — camadas, canvas e formato saem dela, e o relatório é calculado dentro por `avaliarPeca`. Saída
  `APTO | REVISAO_HUMANA_NECESSARIA` com `cobertura` por regra crítica E por conferência (`copy-completa`,
  `piso-de-interface`, `oclusao`, `identidade`), `motivos` em ordem determinística, `achados` (com `certeza`),
  `naoMedidos` e `avisos`. **APTO ⇔ zero motivos**: as 11 críticas (`REGRAS_CRITICAS`, conjunto fechado por teste
  contra `REGRAS_DA_REVISAO`) comprovadas ou inaplicáveis, copy `sem-mudanca` sem lacunas, `pageVersion` legível,
  piso de interface satisfeito (só story) e nenhum cenário de oclusão.
- **Decisões adotadas pelo owner (16/10)**: oclusão (B) conservadora; copy sem contrato exige humano; ausência de
  logo solta gera aviso (comprovada); `texto-pequeno` é crítica; a tolerância texto × texto reutiliza EXATAMENTE a
  de `colisao` (`toleranciaDeColisao`, extraída de `text-geometry.ts` sem mudar o número; `colisao` passa a chamá-la);
  a política do assunto é parâmetro OBRIGATÓRIO (`POLITICA_DO_ASSUNTO_RECOMENDADA` = `estimado: 'humano'`, foto lida
  sem assunto → `nao-se-aplica`, é proposta nomeada, sem padrão silencioso); versionamento fica no CP5b (o gate copia
  `relatorio.versaoDasRegras`).
- **Assunto da foto** (casos A–E + C'): catálogo comprova/reprova; estimado → humano (ou, com `'comprova'`, o achado
  ESTIMADO reprova — a única exceção ao predicado `certeza === 'medida'`, declarada); foto LIDA sem assunto com
  arquivo → não se aplica + aviso; camada de foto SEM `fileUrl` → não comprovada; falha ao analisar → não comprovada
  sempre; sem foto → não se aplica sempre.
- **Oclusão por detecção do cenário** (`cenariosNaoMedidos(medida, cobertura)`): toda camada visível com `order >=`
  ao de um texto visível cujos limites intersectam os dele. **Só mede pela caixa o que a paridade com o render REAL
  prova contido** (`gate.test.ts` G21c/G21e, GERADA de `CHAVES_CLASSIFICADAS`: toda folha aceita tem `valorDeProva`):
  retângulos, formas centradas (`circle`/`triangle`/`star` em torno de `position`, como o Konva), imagem/logo/elemento,
  gradientes e texto simples COM métrica; expansões por traço (`strokeWidth`/`border.width`; no texto `effects.stroke`
  com fallback `style.border`), desfoque (`folgaDoBlur`), sombra (`effects.shadow` ou `style.shadow`); rotação pelos
  quatro cantos em torno da ORIGEM `position` (o pivô do render, `render-engine.ts:199-205`) — nos dois lados do par
  (`limitesDe` para a camada de cima, `limitesDoTexto` para o texto protegido: caixa ∪ glifos da métrica, que é medida
  sem rotação). Tudo o mais acima de um texto é `transformacao-nao-suportada` → `NAO_MEDIDO`: `svg-path`, `icon`,
  `line`/`arrow`, `video`, `style.filter`, `rich-text`, texto com `effects.background` ou `effects.curved`, texto sem
  métrica, chave fora da árvore (fail-closed em execução; G23b lê as chaves declaradas em `template.ts` com chaves
  balanceadas e exige classificação). Duas exceções com prova positiva: texto × texto (ambos simples, sem rotação,
  com métrica, sem folha expansora, `colisao` avaliada, interseção de glifos DENTRO da tolerância de `colisao` —
  política 9.7, não medição) e logo solta × texto (ambos sem rotação, sem filtro, sem folha expansora, texto com
  métrica, `logo-sobre-texto` avaliada — a regra usa `tintaDoTexto` sem contorno/sombra/desfoque, por isso o texto
  com efeito perde a exceção). A mancha de `effects.background` do texto PROTEGIDO fica fora dos limites (é mancha,
  não glifo; a leitura já é medida pela régua com todas as camadas).
- **Desvios do contrato, ditos** (ver também o relatório): (1) `FOLGA_DE_ANTIALIAS = 1` px somada a todo limite — o
  render suaviza bordas 1 px além da geometria; sem a folga a paridade falha por 1 px (o contrato não a previa; RATIFICADA pelo owner em 16/10 e incorporada ao contrato em adffff17). (2)
  Triângulo e estrela com traço: a junção em MITRA estende o traço até `miterLimit × lineWidth / 2` além do vértice
  (padrão do canvas 10) — a expansão usa `5 × strokeWidth` para essas formas (G21c pegou a estrela: a ponta saía
  19 px com traço 12; o contrato dizia `+ strokeWidth`). (3) `effects.curved` (texto curvo) classificado como não
  suportado — o contrato não o listava (G23b o achou no tipo). (4) `foraDaInterface` (a função que o oráculo dos
  testes do CP0 importa) usa a própria caixa como métrica sintética para texto sem métrica — SÓ para o oráculo; o
  gate (`pisoDeInterface` dentro de `gateDaMedida`) exige a métrica real e deixa a camada não comprovada. (5) Um
  texto com mancha ACIMA (por `order`) de outro texto é ocluidora não suportada mesmo sem interseção, porque a
  classificação vem antes do teste de caixa (6.2 do contrato) — dito aqui porque bloqueia peças do compositor em que
  o serviço com mancha fica acima da headline na ordem das camadas. (6) `video` VISÍVEL em qualquer ordem derruba as
  4 regras que leem pixels (texto-sem-leitura, tratamento-piorou-leitura, logo-sem-leitura, texto-sobre-assunto) — o
  contrato original (§6) só previa vídeo ACIMA do texto como não medido; abaixo, o render parado não o desenha e a
  publicação (MP4) sim (Codex, rodada 10). Incorporado ao contrato em adffff17 (16/10). (7) Camada com `movimento` idem — a página com áudio publica o quadro do movimento;
  ratificado pelo owner em 16/10 (revisão humana para movimento/vídeo na cobertura atual do CP5a).
- **Revisão final adversarial (owner + Codex, 16/10)** — quatro falsos APTO fechados, todos fail-closed: (1) `order`,
  `position`, `size` e os valores dos efeitos (traço, sombra, desfoque, borda) têm de ser NÚMEROS finitos — `order: 'z'`,
  `position.x: 'abc'`, `shadowOffsetX: 'muito'` viravam NaN, a interseção falhava e a camada passava como se estivesse
  abaixo; agora `order` não numérica é "acima de todo texto" e geometria/efeito não numérico é `contido: false`
  (`order` ausente/`null` continua 0, como `a.order ?? 0` no render); (2) `contraste: []` com textos visíveis não
  comprova a leitura — cada texto medido precisa da sua leitura na régua (`textos[].camada`/`camadas`), senão
  `texto-sem-leitura` e `tratamento-piorou-leitura` ficam não comprovadas (o contrato dizia só `!== null`; a regra
  é mais estrita); (3) toda logo SOLTA (`logosDaPeca`) precisa de entrada em `leituraDaLogo` — `[]` com logo na peça é
  não comprovada, e o aviso "sem logo solta" só sai quando não há logo; (4) a métrica só prova o par das exceções quando
  é ÚNICA por id e descreve a MESMA caixa da camada (métrica duplicada ou de outra caixa → sem métrica → oclusão).
  Rodada 2: (5) o retângulo CALCULADO tem de ser finito (`rotation: 1e308` → radianos Infinity → sin/cos NaN →
  `contido: false`); (6) a leitura da régua é por TEXTO: só `textos[].camada` conta — `camadas` do grupo sem `textos`
  (medida antiga, leitura de um representante) não prova a leitura de cada texto. Rodada 4 (esforço máximo): (7) a
  leitura da logo do CP3 lê o ARQUIVO — logo solta com `invert`, `flipH`/`flipV`, `mask`, `filter`, `grayscale`,
  `sepia`, `exposure`/`brightness`, `contrast`, `highlights`, `shadows`, `whites`, `blacks`, `saturation`, `vignette`
  ou `blur` de estilo é desenhada diferente do que foi medido → `logo-sem-leitura` não comprovada mesmo com estado
  `medida`; logo solta que não é `logo`/`image` (uma `shape` com id "logo") idem; (8) a exceção logo × texto só vale
  para `logo`/`image` — a regra `logo-sobre-texto` compara a caixa de CANTO, e uma `shape` circular com id "logo" é
  desenhada centrada em `position`, fora dessa caixa. Rodada 5 (esforço máximo): (9) `border.radius` RECORTA os cantos
  da imagem no render (`render-engine.ts` :1681-1683), `border.width` pinta tinta sobre ela e sombra/desfoque/traço
  (`style.shadow`, qualquer `effects.*` ligado) mudam a composição — logo solta com qualquer um deles → `logo-sem-leitura`
  não comprovada (o controle anterior que dizia "radius é inerte" estava ERRADO e foi invertido); os `naoMedidos` dessa
  recusa levam o id da logo; (10) `texto-sobre-assunto`: `assuntoDaPeca` (revisar-arte.ts) reaproveita o assunto
  gravado por arquivo + formato + `cropPosition`, e a estimativa lê só `cropPosition`, enquanto o render prioriza
  `style.crop` (`image-fit.ts`) — um recorte manual deslocado deixava o retângulo velho com estado `medida` e o gate
  aceitava. Fail-closed no gate: foto de fundo com `style.crop`, `flipH`/`flipV`/`flipX`/`flipY`, `mask`, `filter`,
  `blur` ou `rotation` efetivos → assunto não comprovada com as 4 políticas (o conserto de `mesmaComposicao` fica para
  o revisor, fora do CP5a). Regressões: G12 (5 estilos de logo) e G13b. Rodada 6 (esforço máximo): (11) a medida do
  assunto lê a foto como UM cover do canvas inteiro (`lerFotoComoCover(bytes, canvas, …)`; o retângulo gravado é da
  peça composta) e `mesmaComposicao` não compara `objectFit`, `position` nem `size` — fundo com `objectFit` ≠ `cover`
  (o render ESTICA a imagem inteira, `image-fit.ts`), caixa diferente de (0,0,canvas), filtro de pixel
  (`exposure`/`contrast`/… de `konva/filters/apply.ts`) ou uma SEGUNDA foto visível que não é logo solta (o revisor só
  olha `bg-foto`, `fotoDeFundo` em regras.ts) → `texto-sobre-assunto` não comprovada com as 4 políticas, e os ids vão em
  `camadas`; (12) valores JSON fora do tipo: o render liga efeito por verdade JS (`enabled: 1`, `'true'`) e coage
  `opacity: '0.5'`, e o CP3 só recusa NÚMERO abaixo de 1 — na logo, `enabled` efetivo (não `=== true`) e `opacity`
  que não seja número finito igual a 1 → não comprovada; (13) invariante 2.3 do contrato imposto na estrutura: o que
  entra em `naoMedidos` sem motivo vira NAO_MEDIDO e `resultado` exige motivos E naoMedidos vazios — o helper `gate()`
  dos testes confere `APTO ⇔ motivos vazio ∧ naoMedidos vazio` em TODA chamada. Regressões: G12 (`enabled: 1`/`'true'`,
  `opacity` string/0,5/NaN, controle `opacity: 1` + `enabled: 0`/`false`), G13c, G30. Decisão que sobe ao owner
  (Codex R6): a prova de `texto-sobre-assunto` no CP5a exige UM fundo `cover` cobrindo o canvas na posição original e
  recusa o resto (fail-closed); medir o assunto a partir da composição renderizada é trabalho do revisor (CP5b+).
  Rodada 7 (esforço máximo): (14) `opacity: null` na logo — o render aplica opacidade sempre que a chave EXISTE
  (`!== undefined`) e `Math.min(1, null)` é 0: a logo some; a guarda aceita só número finito igual a 1 (null recusa);
  (15) "valor efetivo" é a VERDADE JS do render: `' '` (string só de espaços) liga `flipH`/`enabled` no render e
  `valorEfetivo` passou a devolver `v !== ''` em vez de `trim()`; (16) `element` é desenhado pelo mesmo `renderImage`
  que `image` — conta como segunda foto; (17) G30 passou a alcançar o ramo residual (peça só com logo, sem fundo e sem
  texto visível + id residual em `textosSemMetrica` → único motivo NAO_MEDIDO; sem o id → APTO).
  Rodada 8 (esforço máximo): (18) `valorEfetivo` É a verdade JS do render (`Boolean(v)`, número `!== 0`, NaN conta como
  efetivo): `[]` e `{}` ligam `flipH`/`enabled`/`invert` no render e eram inertes; (19) `rotation` em string na logo
  (`'90'` gira por coerção; o CP3 só recusa número; abaixo dos textos nem a oclusão olha a logo) → recusa qualquer
  `rotation` efetiva; (20) `cropPosition` do fundo só com os nove valores `(left|center|right)-(top|middle|bottom)` — o
  medidor omite `''` (centro) e o render passa `''` ao recorte (esquerda/topo); (21) foto de fundo com `movimento`: o
  revisor lê um cover parado e a página com áudio sai no quadro do movimento (`persist.ts`; `afastar` começa em 1,15×)
  → não comprovada (humano) até o owner decidir a política (excluir páginas com foto em movimento do gate autônomo ou
  medir o quadro publicado — ratificado 16/10: humano). A folga de antialias de 1 px (desvio 1) foi RATIFICADA pelo
  owner em 16/10, preservando os pisos 188/224: no topo y=188 reprova e 189 passa; no rodapé base em H−224 reprova e
  H−225 passa (G26 testa os dois lados, texto e logo; o contrato #236 diz o mesmo). Regressões em G12, G13b, G13c.
  Rodada 9 (esforço máximo): (22) a guarda de movimento sai da foto de fundo e vira UMA regra em `decidirCritica`:
  QUALQUER camada visível com `movimento` efetivo (fundo, logo-imagem, imagem solta sob a logo sem foto de fundo
  escolhida — `camadasNoInstante` anima qualquer `image`) derruba as 4 regras que leem PIXELS do quadro parado
  (`texto-sem-leitura`, `tratamento-piorou-leitura`, `logo-sem-leitura`, `texto-sobre-assunto`); invisível não conta;
  (23) `interfaceDoStory` com configuração não finita (`NaN`, `Infinity`, string) nunca afrouxa: só número finito acima
  do piso aperta. Regressões: G31 e G26.
  Rodada 10 (esforço máximo): (24) o assunto de CATÁLOGO é o retângulo da peça COMPOSTA, no canvas canônico do formato
  (`DIMENSOES` de `compositor/spec.ts`), e `mesmaComposicao` não compara largura/altura — fora do canônico (página
  redimensionada, ou sem formato) o retângulo não vale → não comprovada; o estimado é feito para o canvas atual e não é
  afetado; (25) `video` conta como movimento: o render parado NÃO desenha `video` (cai no `default`), mas a página com
  vídeo é publicada como MP4 com ele — abaixo do texto a oclusão não o examina e a régua foi medida sem ele; desvio
  conservador do contrato original (§6 só previa vídeo ACIMA), hoje incorporado ao contrato (adffff17); (26) a guarda
  da foto de fundo passa a usar a MESMA lista da logo (`chavesQueALeituraDoArquivoNaoVe`: filtros de pixel, borda,
  `style.shadow`, `effects.*` ligados, opacidade ≠ 1, rotação) — um PNG com sujeito e sombra deslocada publica uma
  segunda silhueta que o assunto não conhece. Regressões: G13b, G13c, G13d, G31; G29 ganhou o canvas canônico do feed.
  Rodada 11 (esforço máximo): (27) o canvas canônico vale para TODA origem do assunto — `assuntoDaPeca` reaproveita o
  cache da composição (catálogo, ESTIMADO e "nenhum") por arquivo + formato + `cropPosition`, sem largura/altura — e a
  guarda subiu para antes do `if (medida.assunto)`; (28) o piso do story (188/224) é em px do canônico: story
  2160×3840 com texto em y=250 passaria e, exibido em 1080, cai em y=125 — fora do canônico, `piso-de-interface` não
  comprovada; (29) foto visível que `fotoDeFundo` NÃO reconhece (`element` de tela inteira, `image` < 90%) sem
  `bg-foto` → `texto-sobre-assunto` não comprovada em vez de "não se aplica" (o assunto dela ninguém mediu).
  Regressões: G13d (estimado/nenhum/piso no canvas grande) e G13e. Fechamento 16/10 (owner): ratificados a folga de
  1 px, a revisão humana para movimento/vídeo, foto sem fundo reconhecido e assunto não comprovado pelo cover
  canônico; a política do assunto segue parâmetro obrigatório sem padrão (9.1), e o comentário de `gate.ts` que
  dizia "adotada pelo owner" foi corrigido. A correção do crash nativo do @napi-rs/canvas fica FORA deste PR.
  Regressões em G9, G12, G21 e no bloco G21f (valores não numéricos, chave no topo, tipo novo, `effects.curved`,
  `textboxConfig` desconhecido, opacidade 0/parcial, `filter` vazio, `visible` 0/"false", efeitos combinados com
  paridade no render real — forma e imagem com máscara + flip + recorte + sombra + desfoque).
- **Provas** (`gate.test.ts`, 56 testes): G1–G29 e subcasos; G21c (paridade do lado de cima, >100 renders reais) e
  G21e (lado protegido, métrica real do medidor); oclusão EFETIVA comprovada pelo renderer (texto a 90° sob forma sem
  rotação: os pixels do texto somem no render e o gate acusa; controle com a forma abaixo → comprovada); logo limpa
  sobre a expansão do texto por contorno/sombra/desfoque/borda → oclusão, e o controle sem efeitos preserva a exceção.

### CP5b — o registro do gate: persistência, identidade e `rulesVersion` (16/10/2026)

Contrato: `docs/PLANO-2026-10-16-CP5B-CONTRATO.md` (PR #239, 17 rodadas do Codex). O veredito do CP5a passa a ser
GRAVADO como auditoria em `Generation.fieldValues.gateDaArte` — e **nenhum caminho de produção o consulta para
decidir, nem como sinal positivo nem negativo**: toda decisão autônoma é fresca (CP5c mede e decide sempre).

- **`decidirEMontarRegistro`** (`revisao/gate-registro.ts`, puro): o registro nasce da MESMA chamada que decide.
  Antes de chamar `gateDaMedida`, confere o VÍNCULO da entrada com a página: `estavel(medida.camadas)` ≡ camadas da
  página; identidade da entrada ≡ `identidadeDaPagina(page)`; formato e canvas da medida = os da página;
  `TIPO_DO_POST_POR_FORMATO[formato] === vinculo.postType`; e os DOIS classificadores de formato concordam
  (`assinatura.ts` por nome/tags/tamanho, o do revisor; `compositor/formato.ts` `formatoDaPaginaGravada`, extraída de
  `pastas.ts`, por tags/tamanho — trocar só as tags muda este sem mudar o hash). Falhou → `{ decisao: 'sem-vinculo' }`
  SEM gate: nenhum APTO existe para o produtor usar. A copy é reconciliada DENTRO (`revisaoDaPaginaComCamadas` da
  mesma `page.copyAutoral`/`page.layers`); `copy` nos args é ignorada. O registro sai SELADO (tipo com `unique symbol`
  não exportado), congelado em profundidade e num `WeakSet` privado.
- **Identidade** (`versao.ts` `identidadeDaPagina`): `pageVersion` = `versaoDaPagina(page)` SEM áudio (a chamada do
  revisor), `copyVersion` = `copyVersionDe(Page.copyAutoral)`, `formato` e `formatoDoCompositor`. O que ela NÃO
  cobre (bytes de assets e fontes, assinatura, gradiente, o que a medição lê fora da página) é dito em
  `NAO_CONFERIDO_PELA_IDENTIDADE` e sai em todo `coincidente` — por isso **não existe "vigente"**.
- **Escrita** (`gate-persistido.ts` `gravarGateDaArte`): só por `mesclarFieldValuesDaArte` com `somenteSe`
  (`WHERE id AND projectId AND fieldValues->>'pageId' AND EXISTS (Page → Template.projectId)`), a chave inteira;
  registro sem proveniência (clone, objeto à mão) → `'sem-proveniencia'` sem SQL; 0 linhas → `'sem-vinculo'`;
  exceção PROPAGA (o CP5c decide o rollback). `mesclarFieldValuesDaArte` ganhou a opção sem mudar o SQL dos
  chamadores atuais (quatro formas testadas).
- **Leitura** (`lerGateDaArte`): `ausente` / `invalido` / `ok`. Schema estrito + invariante 2.3 do CP5a + o que o CP5a
  só produz para ESTA página (APTO exige `pageVersion` não nulo; piso de interface `nao-se-aplica` ⇔ formato ≠ story —
  Codex R1 do PR #240); um JSON rejeitado não expõe nada além do caminho do campo, de um texto FIXO da invariante e
  das versões gravadas (só quando casam com `/^[a-z0-9][a-z0-9.-]{0,31}$/`). Bump de `VERSAO_DO_GATE` torna os registros anteriores `invalido` (decisão 9.13).
- **Validade** (`validadeDoGate`): `coincidente` (vínculo, os dois formatos, 4 versões e política iguais) /
  `historico` (com a lista) / `ilegivel`. Nunca devolve `resultado`.
- **`rulesVersion`**: bump manual cobrado por DUAS impressões digitais (`impressao-digital.ts`): a do revisor
  (`REGRAS_DA_REVISAO` + medida e `avaliarPeca` de cada peça do corpus) e a do gate (tabelas + medida e saída de
  `gateDaMedida` sem as três cópias, com as 4 políticas), serializadas com `serializarParaImpressao` (preserva
  `NaN`/`Infinity`/`-0`). Arquivos em `__tests__/impressao-digital/`; `scripts/validar-impressao-digital.ts` (CI) torna
  imutável o de uma versão já na `main`. Corpus (`__tests__/suporte/corpus-do-gate.ts`): 166 peças (as fixtures de `gate.test.ts` com as suas variantes +
  piloto v1/v2), ainda AMOSTRAL —
  regra que nenhuma peça toca muda em silêncio (decisão 9.6); PR em `regras.ts`/`gate.ts` responde "o corpus cobre?".
- **Barreira**: `no-restricted-imports` em `eslint.config.mjs` — `gateDaMedida` só em `gate-registro.ts` e testes;
  `lerGateDaArte`/`validadeDoGate`/`decidirEMontarRegistro` só em `gate-persistido.ts`, `ver-geracao-retorno.ts`,
  `arte-ia.ts`, o produtor do CP5c e testes. O que o lint não vê (import dinâmico, require, reexportação, a string
  `gateDaArte`) é o inventário `inventario-gate-da-arte.test.ts`.
- **Consumidor**: `ver-geracao` traz o bloco `gate` (só leitura; `null` sem registro; nunca inventa APTO). Manual do
  Dot `dot-operacao-v5`: "nunca agende por ele". `auditar-operacao` fica para o CP5c.
- **Fora**: nenhum produtor em produção (o primeiro é o CP5c — seção 12 do contrato lista o que ele herda);
  oclusão por pixels; histórico de vereditos; migration.

### CP5c — o gate em `agendar-leva` (perfil draft-only): medir e decidir SOB AS TRAVAS (16/10/2026)

Contrato: `docs/PLANO-2026-10-16-CP5C-CONTRATO.md` (PR #241, 9 rodadas do Codex; APTO na rodada 9). O primeiro
PRODUTOR do registro do CP5b. Só vale com `apenasRascunho` (o perfil é decidido pela tool, por `perfilDoPrincipal`);
o fluxo humano é byte a byte o de antes (C7).

- **Onde a medição acontece**: DENTRO da transação de `agendarItem`, depois das travas e antes de qualquer escrita de
  post — por isso não existe "identidade medida × identidade relida": é a mesma leitura. Ordem comum das travas
  (`inventario-gate-agendar-leva.test.ts`, C13): `pg_advisory_xact_lock(agenda)` → `pg_advisory_xact_lock(fontes)`
  (chave nova `chaveDasFontes`, também tomada pelas rotas que criam/apagam `CustomFont` — `FOR SHARE` não impede a
  linha nova) → `ItemDeLote` → `ItemDePlano` → posts da página (`ORDER BY "id" FOR UPDATE`; `ajustar-arte` ganhou o
  mesmo `ORDER BY`) → `Page` → `Generation` da peça → `FOR SHARE` em `Project`, página de assinatura e página-modelo
  apontadas pela Generation da peça, e `CustomFont` do projeto.
- **`medirEDecidir(cliente, …)`** (`agendar-itens.ts`): `recusaComoImagem` → `lerCamadas` → `contextoDaMedicao` +
  `medirCamadasDaPeca(…, { corrigir: false })` (a MESMA medição do revisor e do CP4; `contextoDaMedicao` ganhou
  `cliente`, `sinal`, `prazoPorDownloadMs`, `composicaoReaproveitavel`, `generationDaPeca` — sem mudar o revisor) →
  `decidirEMontarRegistro` (origem `agendar-leva`, `principal` do MCP). A cadeia inteira corre numa `Promise.race`
  com `PRAZO_DA_MEDICAO_MS` (8 s); `fetchBuffer` aceita `{ signal, timeoutMs }` (`PRAZO_POR_DOWNLOAD_MS` 4 s): fonte e
  foto do assunto são abortadas de verdade, render da régua e logo são cobertos pelo race (C21: fonte, assunto, logo,
  régua presos → `nao-medida`, nenhum post, travas liberadas; `fetch-buffer-sinal.test.ts`: laço de redirecionamento).
  Toda exceção vira `nao-medida` (fail-closed, nunca `ERRO`).
- **Coerência página × Generation** (§ 4.3): a `composicao` gravada só é cache quando
  `fieldValues.versaoRenderizada === versaoDaPagina(page, { audio })`; senão o assunto é estimado de novo e a
  variante da logo vem da página — a assinatura e a página-modelo continuam sendo a referência (C20; a v2 do piloto é
  MEDIDA, não recusada sem medir). A medição lê SÓ a Generation da peça (travada), nunca "a mais recente" (C22).
- **Resultado**: `medida` APTO → `gravarGateDaArte(tx)` ANTES de `criarPostDoAgendamento`/adoção (`sem-vinculo`/
  `sem-proveniencia` → rollback, `REVISAO_HUMANA_NECESSARIA`); não APTO → o registro reprovado é gravado e a transação
  COMMITA só com ele (decisão 8.3, proposta), item `falhou` `REVISAO_HUMANA_NECESSARIA` com `generationId`, `pageId`,
  `editUrl` (template atual) e `revisao` (`medida` com `achados`/`motivos`; `sem-vinculo`; `nao-medida`); exceção na
  gravação ou timeout da transação → rollback e o mesmo código (C10/C18); deadlock (`40P01`/`P2034`) →
  `LOTE_AGENDAMENTO_CONCORRENTE` (C13). Adoção (§ 4.6): o post tem de estar entre os travados, `DRAFT` sem
  `laterPostId`, da página e do projeto, com `generationId === peca.id` (decisão 8.5, proposta: outro ou nulo →
  revisão humana); ação ou post que mudou entre as duas decisões → `LOTE_AGENDAMENTO_CONCORRENTE` (C19).
- **Efeitos pós-commit NÃO rodam no draft-only** (decisão 8.7, proposta B): depois do commit nenhuma escrita acontece
  por conta de `agendar-leva` (C6); o item traz `AVISO_EFEITOS_NAO_RODAM_NO_DRAFT_ONLY`; a repetição HUMANA do mesmo
  pedido completa; `reaproveitar` devolve `revisao` `nao-medida` (`MOTIVO_RASCUNHO_JA_EXISTENTE`), nunca um APTO que a
  chamada não mediu. `simular: true` mede e decide pelo leitor, sem gravar nada (C8).
- **Decisões do owner implementadas como PROPOSTA nomeada** (trocáveis numa linha, nenhuma "aprovada"): 8.1
  `POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA = POLITICA_DO_ASSUNTO_RECOMENDADA` (`lotes/agendamento.ts`; `ver-geracao`
  compara com ela); 8.2 concorrência = `LOTE_AGENDAMENTO_CONCORRENTE`; 8.3 gravar o reprovado; 8.5 não adotar sem a
  arte; 8.7 B; 8.8 medir dentro da transação; 8.9 8 s / 4 s. 8.4 (`auditar-operacao`) e 8.6 (bytes por URL) ficam
  fora, como o contrato diz.
- **Testes**: `lotes/__tests__/agendar-itens-gate.test.ts` (C1–C22, banco falso com travas de linha e eventos
  ordenados; C18 sintético mede a medição REAL em ~0,4 s por página sintética, no ambiente de teste),
  `inventario-gate-agendar-leva.test.ts` (C9, C11, C13 por código-fonte), `fetch-buffer-sinal.test.ts`,
  `piloto-portao.test.ts` (P11: os 8 `hojeViola` viraram `it()`, com a medição REAL sobre a fixture — v1 e v2
  recusadas com os achados do serviço, controle limpo aprovado), harness de `agendar-itens.test.ts` (mede limpo; o
  resto do serviço igual), `c9-allowlist-comportamental.test.ts` (cada tool MUTANTE da allowlist executada com banco
  falso que registra criação de post e gravação do veredito + o fecho de imports de cada handler). Limites ditos (Codex
  R1 do PR #242): bytes de assets/fontes por URL não protegidos (CP5b § 4.2); `scripts/` que gravem `CustomFont` fora
  das rotas ficam fora da garantia da trava das fontes; `Template.projectId` é lido para conferir a posse sem trava
  própria — a garantia supõe que um Template não muda de projeto (nenhuma rota faz isso hoje); páginas de referência
  (assinatura/modelo) de projetos diferentes podem formar ciclo entre travas de `Page` — o deadlock é mapeado para
  `LOTE_AGENDAMENTO_CONCORRENTE` ("repita"); o "benchmark sintético do CP3" do contrato não existe como harness no
  repositório — C18 usa as páginas sintéticas de `sinteticos.ts` (CP0/CP2); C7 prova um cenário do fluxo humano, não
  igualdade byte a byte (o diff do fluxo humano é só o `ORDER BY "id"` em `ajustar-arte`); o inventário por regex não
  vê SQL montado em variável.

### CP5d — o gate em `ajustar-arte` (perfil draft-only): a versão final medida sob as travas (17/10/2026)

Contrato: `docs/PLANO-2026-10-17-CP5D-CONTRATO.md` (PR #243, 6 rodadas do Codex; APTO na rodada 6). Só vale com
`apenasRascunho`; o fluxo humano é byte a byte o de antes (A6).

- **Onde**: dentro de `db.$transaction` de `ajustarArte`, depois do executor do CP4 (que continua FORA, medindo as N
  candidatas como hoje) e ANTES de qualquer escrita. Ordem comum (a do CP5c): `pg_advisory_xact_lock(agenda)` →
  `pg_advisory_xact_lock(fontes)` → posts da página `ORDER BY "id" FOR UPDATE` → `Page FOR UPDATE` → **Generations de
  ORIGEM (a do compositor da página) e do ALVO da recomposição** (`alvoDaRecomposicao`, extraída de
  `travarRecomposicaoDaArte` — a mesma seleção: 20 mais recentes com `resultUrl`, a primeira por `ehArteDaPagina`)
  numa instrução `IN (…) ORDER BY "id" FOR UPDATE` → `FOR SHARE` em `Project`, assinatura/modelo apontadas pela origem
  e `CustomFont`.
- **Conferência sob trava** (§ 4.2): versão visual (`versaoDaPagina`), contrato (`copyAutoral`) E áudio da página
  relida iguais aos lidos antes — senão `VERSAO_DIVERGENTE` / `PAGINA_MUDOU_DURANTE_O_AJUSTE`, sem medir.
- **Generation PROCESSING** criada na transação (`source: 'ajuste-arte'`, `pageId`, `sourcePageId`): é dela o
  `generationId` do registro; o render depois do commit a FECHA (`renderPageAndRegister({ generationId })`). Render que
  falha ou `PAGINA_MUDOU_DURANTE` → `fecharGenerationComoFalha(db, id, { error })` — UMA `UPDATE` condicionada a
  `PROCESSING` (status, `completedAt`, `fieldValues || patch`); o cron de órfãs (`generation-queue.ts`,
  `marcarGenerationFalha`) passou a usar a mesma (antes gravava `{ ...lido, error }`, violando a regra 🔴 do
  `AGENTS.md` e apagando o que outro escritor gravou). Quem fecha primeiro vence; o segundo escreve 0 linhas.
- **`medirEDecidirAjuste(tx, …)`**: `recusaComoImagem(candidata, audio travado)` → `contextoDaMedicao({ cliente: tx,
  sinal, prazoPorDownloadMs, composicaoReaproveitavel: false, generationDaPeca: origem })` + `medirCamadasDaPeca(…, {
  corrigir: false })` → `decidirEMontarRegistro` sobre a PÁGINA FUTURA (camadas finais, nome e contrato revisado;
  `vinculo.postType` pelo formato; origem `ajustar-arte`). Race de 8 s. Sem Generation do compositor (arte livre) →
  sem referências → recusa dita. APTO → `gravarGateDaArte(tx)` ANTES da escrita da página (CAS como hoje) e de
  `travarRecomposicaoDaArte(…, { alvo })` (que agora respeita a linha já travada e a marca já gravada). Não APTO →
  `RecusaDoGate` → rollback inteiro → `CreativeError('REVISAO_HUMANA_NECESSARIA', 422, { ajusteGravado: false,
  pageId, versao, editUrl, revisao, achados?, motivos?, ajustesAplicados?, ajustesRecusados? })`; exceção na
  gravação / timeout → o mesmo código com `revisao` `nao-medida`; deadlock → `AJUSTE_CONCORRENTE` ("repita").
- **Recusa TOTAL do CP4 no draft-only** (decisão 8.8, proposta): código `REVISAO_HUMANA_NECESSARIA` com
  `details.causa` = o código do CP4 (`AJUSTE_PIOROU_ARTE`…), `details.recusados` iguais, `revisao` `nao-medida`
  ("nenhuma versão nova para medir"). No perfil normal o código do CP4 continua.
- **Política de preservação (decisão 8.2, proposta P1)**: o agente só grava versão APTA — não existe versão
  intermediária não apta gravada pelo agente; o progresso incremental sobre uma peça reprovada fica para o humano (ou
  P2, documentada no contrato).
- **Decisões do owner implementadas como PROPOSTA nomeada**: 8.1 `POLITICA_DO_ASSUNTO_DO_GATE` (a do CP5c, renomeada;
  `POLITICA_DO_ASSUNTO_DO_AGENDAR_LEVA` reexportada), 8.2 P1, 8.3 reprovado não gravado, 8.4 trava da agenda tomada,
  8.5 `AJUSTE_CONCORRENTE`, 8.7 prazos do CP5c (`revisao/gate-no-fluxo.ts`, compartilhados), 8.8 acima. 8.6 (P11
  humano) fica para o CP5e.
- **Módulo compartilhado** `revisao/gate-no-fluxo.ts` (puro): `RevisaoDoItem`, prazos, `revisaoDe`,
  `paginasDeReferencia`, `ehDeadlock`/`ehTimeoutDaTransacao` — usados pelos dois produtores (`agendar-itens.ts` reexporta
  os nomes antigos). O nome do contrato (`revisao-do-item.ts`) colidia com `planos/revisao-do-item.ts`.
- **Testes**: `creatives/__tests__/ajustar-arte-gate.test.ts` (A1–A18 com banco falso de travas e eventos),
  `piloto-ciclo.test.ts` (P11 draft-only vira `it()`, com rollback real no harness; o ajuste ACEITO pelo CP4 numa
  página não apta agora é recusado — a caracterização antiga foi invertida), `ajustar-arte-concorrencia.test.ts` (mede
  limpo: a corrida e a escrita são o objeto), inventários do CP5c estendidos a `arte-rapida.ts`.

**Revisão do Codex da implementação (R1, 17/10/2026) — dois bloqueadores fechados**: (1) a Generation de ORIGEM era
lida ANTES do `FOR UPDATE` e esse objeto alimentava referências e medida; agora a busca só ESCOLHE a linha, e o que a
medição lê (composição, páginas de referência em `FOR SHARE`) é a RELEITURA pela `tx` depois da trava — se a linha
travada já não é a arte do compositor desta página, `AJUSTE_CONCORRENTE` ("repita"), nada gravado; (2) `versaoDaPagina`
não cobre nome nem TAGS, e as tags decidem o formato que o gate mede (`formatoDaPaginaGravada`): a conferência sob trava
passou a comparar `name` e `tags` com a leitura inicial (mudou → `VERSAO_DIVERGENTE`/`PAGINA_MUDOU_DURANTE_O_AJUSTE`,
sem medir) e `paginaFutura` nasce das tags lidas sob trava. Harness: `FOR UPDATE` falso devolve a linha DEPOIS da trava
(o publicador que segurava o DRAFT e o entregou ao Zernio é visto); a matriz ganhou as intercalações A13 (worker segurando
a origem, ordem inversa com `agendar-leva`, rota de fontes, `later-scheduler`) e as demais causas de A7; o harness de
P11 tem fila por trava e um controle POSITIVO com medição real (a peça limpa, `suporte/peca-limpa.ts`). **R3**: o CAS
da escrita no draft-only usa o carimbo `updatedAt` lido SOB TRAVA (a conferência sob trava é a prova de versão) — o render
condicionado de outra chamada move o `@updatedAt` ao gravar só a miniatura, e com o carimbo de antes da espera o ajuste
recusaria `VERSAO_DIVERGENTE` numa página igual (A13e; o banco falso move o carimbo em toda escrita de Page, como o Prisma).

## CP5e — provas de autonomia: o gate como informação, o resumo do registro e a prova ponta a ponta (17/10/2026)

Contrato: `docs/PLANO-2026-10-17-CP5E-CONTRATO.md` (Codex APTO na rodada 5). O que entrou:

- **`revisarArte` devolve `gate`** (`GateInformativo`: `medida` | `sem-vinculo` | `nao-medida`, sempre com a frase fixa
  `INFORMACAO_DO_GATE_DO_REVISOR`). A medida do revisor é CORRIGIDA em memória pela régua (`corrigir: true`: o `ok` da força
  PROPOSTA); o gate decide sobre uma SEGUNDA medida fiel (`corrigir: false`, a dos produtores) sobre o mesmo contexto —
  custo: dois renders do fundo a mais por chamada. `decidirEMontarRegistro` com origem `revisar-arte`, SEM gravar. A
  Generation da peça é escolhida UMA vez e relida com `sourcePageId` (pedida → compositor → última arte → nenhuma) e passada
  ao contexto; a composição só é reaproveitada quando a arte é desta versão (regra do CP5c) — numa página editada depois da
  arte, o assunto é estimado de novo. Página-modelo → `sem-vinculo` (decisão 5.2, proposta).
- **O "em até 2 ciclos" virou `it()` tipado** (`piloto-ciclo.test.ts`): apta ⇔ gate APTO + regras duras mediram + sem
  problema aberto; escalada ⇔ gate REVISAO_HUMANA_NECESSARIA com motivos ou `ajustar-arte` com `details.revisao`. Dois
  casos: a fixture (escala — CP2 fica) e a peça limpa com o apoio fora da margem (mover → APTO). "Não há" conta como medido
  (`naoSeAplica`), só a falha de leitura não.
- **`auditar-operacao`**: bloco `gate` por `gate-resumo.ts` (puro; `lerGateDaArte` + `validadeDoGate`; fail-closed no vínculo
  post → Generation → `fieldValues.pageId` → `Template.projectId`; rótulos `coincidente`/`historico`/`ilegivel`/`semRegistro`/
  `registroInvalido`; teto 200 e `parcial`). Nada medido, nada escrito.
- **Barreira de lint por NOME** (`eslint.config.mjs`): leitores nunca decidem, produtores nunca leem/validam; o inventário
  cobre os dois lados.
- **Prova ponta a ponta** (`piloto-ponta-a-ponta.test.ts`, banco falso com travas em `suporte/banco-com-travas.ts` +
  medição real): E0 compõe com o compositor REAL no banco falso e `revisar-arte` vê o gate com o vínculo na Generation
  composta — **medido**: a composição legada (assinatura 250/350) cai no piso de interface 188/224 e em `texto-sem-leitura`
  (headline escuro sobre o fundo escuro), REVISAO_HUMANA_NECESSARIA; por isso E1–E10 partem da peça limpa montada à mão (o
  controle positivo dos pilotos), e o compor APTO de ponta a ponta fica para quando o compositor respeitar o piso (P6, trilha
  de design). E1 APTO → DRAFT (registro, `coincidente`, resumo); E2 não APTO → nenhum DRAFT; E3 corrigir → APTO → DRAFT (dois
  registros, mesma `pageVersion`); E-div (véu escuro com folga: a medida corrigida dá `ok` no serviço, a fiel não; os motivos
  do gate informativo = os do `agendar-leva`); E4 edição concorrente → `VERSAO_DIVERGENTE`; E5 DRAFT bom preservado; E6 post
  aprovado intocável e `agendar-leva` reaproveita; E7 conferência de fontes falha → não comprovada → humano; E7b fonte
  ausente → crítico → humano; E8 nenhum efeito pós-commit em caso algum; E10 página editada → `historico` nos dois leitores.
  **Não prova**: travas/SQL reais, Blob, autorização MCP, comportamento do chat, custo/repetibilidade (§ 4.8).
