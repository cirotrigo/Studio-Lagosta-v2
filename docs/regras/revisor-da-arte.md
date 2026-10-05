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
  mudar é `AJUSTE_SEM_EFEITO`.
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
