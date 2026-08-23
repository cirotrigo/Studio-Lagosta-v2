/**
 * Composição da logo REAL sobre a arte gerada.
 *
 * Regra canônica das skills que produzem as melhores artes: **a logo nunca é
 * desenhada pela IA** — modelo de imagem distorce logotipo. O prompt reserva
 * uma área limpa e o sistema cola o PNG oficial ali depois.
 *
 * O custo de ignorar isso foi medido em 09/08/2026: sem logo nas referências,
 * o gpt-image INVENTOU a logomarca do By Rock (palheta pequena + "BY ROCK" em
 * sans-serif, quando a real é uma palheta grande com "By Rock" manuscrito
 * dentro). Marca errada é pior que arte feia — o cliente não publica.
 *
 * Onde colar: o DNA da casa diz que "a logomarca varia de canto conforme o
 * espaço livre". Aqui isso vira medida: entre os cantos reservados, escolhe o
 * mais CALMO (menor desvio-padrão de luminância), que é o que o BRIEF do
 * Quintal descreveu como "a posição do logotipo depende de onde a foto é
 * calma".
 *
 * Calma não basta, e isso custou uma medição em 10/08/2026. O canto mais calmo
 * de uma foto costuma ser uma parede lisa ou uma toalha — que é justamente o
 * mais CLARO. E depois que as logos dos projetos foram alinhadas com as do
 * insta-automatico, metade delas virou branco puro (Quintal, TERO e Bacana com
 * luminância média 255, 255 e 252). Logo branca no canto mais calmo de uma foto
 * clara é logo invisível: a peça sai "sem marca" sem que nada falhe.
 *
 * Por isso o score tem duas partes: calma E contraste entre a luminância média
 * da logo e a do canto. Um canto que engole a logo é descartado antes de
 * competir por calma.
 */

import sharp from 'sharp'

/** Cantos candidatos, na ordem de preferência quando houver empate. */
export type LogoCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

/**
 * Projetos cuja logo o gpt-image NÃO consegue desenhar com fidelidade — o
 * default `modelo` vira `compor` (o arquivo oficial é colado por sharp).
 *
 * TERO (3): o wordmark tem a ligadura E+R, e o modelo a desdobra de um jeito
 * diferente a cada rodada — "TERRO" (14/08/2026), "TLRO" e a tagline "BRASA X
 * E VINHO" com letra inventada (17/08, duas artes seguidas reprovadas pela
 * Roberta: "a logomarca está totalmente errada"). A soletração e a ligadura
 * explícitas no preâmbulo perderam quatro vezes; wordmark com ligadura é o
 * caso documentado do `compor`.
 *
 * ⚠️ O efeito colateral do `compor` (10/08: o modelo desenhava a logo DELE
 * mesmo com o DO NOT DRAW, e a peça saía com duas) é mitigado pela linha
 * "contains NO brand mark at all" em `instrucaoAreaReservada` — se a segunda
 * marca voltar, o caminho é reforçar lá, nunca voltar o TERO para `modelo`.
 */
const LOGO_MODE_POR_PROJETO = new Map<number, LogoMode>([
  [3, 'compor'],
  /**
   * Lagosta Criativa (8): o wordmark é brush com gradiente laranja e garras nas
   * pontas — letra desenhada à mão que o gpt-image "reinterpreta" a cada
   * rodada. E é a peça com DUAS marcas (a da agência e a do cliente citado,
   * ver `instrucaoMarcaDoCliente`): com as duas compostas por sharp, os cantos
   * são decididos aqui e não no prompt, e nenhuma das duas vira loteria.
   * Decisão de 23/08/2026, junto com o co-branding.
   */
  [8, 'compor'],
])

/** O modo de logo default deste projeto, quando o chamador não escolhe. */
export function logoModePadraoPara(projectId?: number | null): LogoMode {
  return (typeof projectId === 'number' && LOGO_MODE_POR_PROJETO.get(projectId)) || 'modelo'
}

/**
 * O canto em que o MODELO escolhido põe a marca, traduzido da leitura por
 * visão (banda 1-8 e lado).
 *
 * 🔴 Até 17/08/2026 a peça avulsa deixava o canto livre de propósito — "quem vê
 * a foto sabe onde ela está vazia" —, e isso valia enquanto ninguém sabia onde
 * a referência põe a marca. Agora o decodificador lê, e o cliente pediu
 * explicitamente que siga: "a logomarca ficou posicionada no topo e não
 * posicionou como na referência".
 *
 * Devolve `null` quando a leitura não permite concluir um CANTO — marca
 * centralizada não é canto, e chutar esquerda ou direita seria inventar. Aí o
 * canto volta a ser escolha do gerador, como antes.
 */
export function cantoDaAssinatura(
  assinatura?: { banda?: number; lado?: 'esquerda' | 'centro' | 'direita' } | null,
): LogoCorner | null {
  if (!assinatura) return null
  const { banda, lado } = assinatura
  if (typeof banda !== 'number' || !Number.isFinite(banda)) return null
  if (lado !== 'esquerda' && lado !== 'direita') return null
  const vertical = Math.round(banda) >= 5 ? 'bottom' : 'top'
  return `${vertical}-${lado === 'esquerda' ? 'left' : 'right'}` as LogoCorner
}

const CORNER_ORDER: LogoCorner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left']

/** Fração da largura da arte que a logo ocupa. Discreta, como manda a regra. */
// 0.22 → 0.15 em 10/08/2026, a pedido do Ciro olhando a leva real do Espeto:
// "estou achando ela um pouco grande". Vale para os DOIS modos — o valor do
// prompt (instrucaoLogoPeloModelo) acompanha, senão compor e modelo divergem.
const LOGO_WIDTH_RATIO = 0.15
/** Margem a partir da borda, também proporcional. */
const MARGIN_RATIO = 0.055

export interface LogoCompositionResult {
  buffer: Buffer
  corner: LogoCorner
  /** Desvio-padrão de luminância da região escolhida (menor = mais calma). */
  calmness: number
  /**
   * Distância de luminância entre a logo e o canto escolhido (0–255). null
   * quando não deu para medir a logo. Vai para o `fieldValues`: logo sumida na
   * arte se explica por este número.
   */
  contraste: number | null
  /** true quando o canto reservado no prompt estava ocupado e a logo mudou de lugar. */
  moveu: boolean
  /**
   * 'original' na maioria; 'negativa' quando o arquivo foi recolorido (branco
   * sobre canto escuro, preto sobre canto claro) porque NENHUM canto dava o
   * contraste mínimo — é a versão de knockout que todo manual de marca prevê.
   * O desenho (alpha) é preservado; só a tinta muda.
   */
  versao: 'original' | 'negativa'
}

/**
 * Vantagem dada ao canto que o prompt reservou: ele só perde para outro se o
 * outro for claramente mais calmo. Sem isso, ruído de textura da foto faria a
 * logo pular de canto entre peças da mesma leva.
 */
const RESERVED_BONUS = 0.8

/**
 * Contraste mínimo (0–255) entre a luminância média da logo e a do canto para
 * o canto ser considerado legível.
 *
 * 45 é a distância abaixo da qual uma logo branca sobre parede clara deixa de
 * se destacar a olho nu na miniatura do feed. Não é WCAG — logo não é texto de
 * corpo, e exigir contraste de leitura descartaria canto bom.
 */
const CONTRASTE_MINIMO = 45

/**
 * Peso do contraste no score. A calma continua mandando (é ela que faz a logo
 * fugir do bloco de copy); o contraste desempata e afunda canto que engole a
 * marca.
 */
const PESO_CONTRASTE = 0.6

/** Luminância média dos pixels VISÍVEIS — pixel transparente não é a logo. */
async function luminanciaDaLogo(logoPng: Buffer): Promise<number | null> {
  try {
    const { data, info } = await sharp(logoPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let soma = 0
    let n = 0
    for (let p = 0; p < data.length; p += info.channels) {
      if (data[p + 3] < 128) continue
      soma += 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
      n++
    }
    return n > 0 ? soma / n : null
  } catch {
    // Sem a medida, o comportamento volta a ser o antigo (só calma) — que é
    // pior, mas não quebra nada.
    return null
  }
}

function cornerBox(
  corner: LogoCorner,
  canvas: { width: number; height: number },
  box: { width: number; height: number },
  margin: number,
  marginVertical: number = margin,
): { left: number; top: number } {
  const left = corner.endsWith('right') ? canvas.width - box.width - margin : margin
  const top = corner.startsWith('bottom')
    ? canvas.height - box.height - marginVertical
    : marginVertical
  return { left: Math.max(0, Math.round(left)), top: Math.max(0, Math.round(top)) }
}

/**
 * Compõe a logo na arte. Devolve a arte intacta (corner null via exceção
 * tratada pelo chamador) se algo falhar — arte sem logo é melhor que arte
 * quebrada, e o chamador registra o aviso.
 */
export async function comporLogo(
  arteBuffer: Buffer,
  logoBuffer: Buffer,
  {
    cornerReservado,
    formato,
    cantoFixo,
    cantosProibidos,
    larguraRatio,
  }: {
    cornerReservado?: LogoCorner
    /**
     * Canto OBRIGATÓRIO, sem disputa por calma/contraste. É o que o co-branding
     * usa para a segunda marca: a da agência já ocupa o canto reservado e a do
     * cliente citado precisa ir para o canto combinado no prompt, senão a
     * disputa pode mandá-la justamente para cima da primeira.
     */
    cantoFixo?: LogoCorner
    /**
     * Cantos fora da disputa (ex.: onde a marca da casa já está composta).
     * Ignorado quando `cantoFixo` é passado.
     */
    cantosProibidos?: LogoCorner[]
    /** Fração da largura que a logo ocupa; default `LOGO_WIDTH_RATIO`. */
    larguraRatio?: number
    /**
     * 🔴 Em STORY o canto superior ESQUERDO não concorre — é onde o Instagram
     * desenha o avatar e o nome do perfil, e a colisão foi real: a logo
     * composta do TERO saiu ali, sob o avatar, em duas artes seguidas
     * (17/08/2026), porque a margem era 5,5% da LARGURA nos dois eixos (~3% da
     * altura num 9:16). A margem VERTICAL sobe para a mesma safe area do texto
     * (1/8 da altura), o que também deixa o canto superior DIREITO abaixo dos
     * controles de fechar/menu — por isso ele PODE (decisão do Ciro em
     * 20/08/2026, afrouxando a primeira versão, que filtrava os dois de cima).
     */
    formato?: 'story' | 'feed' | 'quadrado'
  } = {},
): Promise<LogoCompositionResult> {
  const arte = sharp(arteBuffer)
  const meta = await arte.metadata()
  const width = meta.width ?? 1080
  const height = meta.height ?? 1920

  const alvoLargura = Math.round(width * (larguraRatio ?? LOGO_WIDTH_RATIO))
  const margem = Math.round(width * MARGIN_RATIO)
  const ehStory = formato === 'story'
  // A mesma fração da regra 9 do prompt (FAIXA_RESERVADA = 1/8): texto e logo
  // terminam ANTES da faixa que o Instagram cobre.
  const margemVertical = ehStory ? Math.max(margem, Math.round(height * 0.125)) : margem
  const cantosCandidatos = (
    cantoFixo
      ? [cantoFixo]
      : ehStory
        ? CORNER_ORDER.filter((c) => c !== 'top-left')
        : CORNER_ORDER
  ).filter((c) => cantoFixo === c || !(cantosProibidos ?? []).includes(c))

  // Redimensiona preservando o alpha (converter PNG sem alpha vira retângulo
  // sólido — erro documentado no padrão de produção da casa).
  const logoRedim = await sharp(logoBuffer)
    .resize({ width: alvoLargura, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  const logoMeta = await sharp(logoRedim).metadata()
  const box = { width: logoMeta.width ?? alvoLargura, height: logoMeta.height ?? alvoLargura }

  /**
   * Mede a CALMA de cada canto — desvio-padrão da luminância na região onde a
   * logo entraria. Texto tem contraste alto e sobe muito o desvio, então a
   * medida faz a logo fugir do bloco de copy sozinha. É o que salva a peça
   * quando o modelo ignora a área reservada (aconteceu no primeiro teste: a
   * logo cobriu o "20h").
   */
  const lumLogo = await luminanciaDaLogo(logoRedim)
  /**
   * Selo/badge (disco, emblema): maioria dos pixels é VISÍVEL — o arquivo
   * carrega o próprio fundo e lê em qualquer canto. Para ele, o filtro de
   * contraste não vale (a média de luminância mede o miolo do disco, não a
   * borda que o destaca — o selo do Wine Vix, preto de anel amarelo, media 54
   * e era dado como invisível) e o knockout é PROIBIDO: recolorir um disco
   * sólido produz um borrão chapado, não uma versão negativa (aconteceu em
   * 23/08/2026, três peças com um círculo branco sobre a copy).
   */
  const seloAutocontido = (await coberturaDoAlpha(logoRedim)) >= 0.5

  type Candidato = {
    corner: LogoCorner
    calmness: number
    contraste: number
    lumCanto: number | null
    score: number
    pos: { left: number; top: number }
  }
  const candidatos: Candidato[] = []

  for (const corner of cantosCandidatos) {
    const pos = cornerBox(corner, { width, height }, box, margem, margemVertical)
    const regiao = {
      left: Math.max(0, pos.left - 8),
      top: Math.max(0, pos.top - 8),
      width: Math.min(box.width + 16, width - Math.max(0, pos.left - 8)),
      height: Math.min(box.height + 16, height - Math.max(0, pos.top - 8)),
    }
    let calmness = Number.POSITIVE_INFINITY
    let contraste = Number.POSITIVE_INFINITY
    let lumCanto: number | null = null
    try {
      // ⚠️ O `.toBuffer()` no meio NÃO é desperdício: `stats()` do sharp
      // IGNORA o `extract()` do mesmo pipeline e devolve as estatísticas da
      // imagem INTEIRA. Medido em 10/08/2026 numa arte metade escura e metade
      // clara: recortar o topo e recortar a base davam o mesmo `mean 134,
      // stdev 108` (o do quadro todo), enquanto o recorte materializado dava
      // `mean 26, stdev 0`.
      //
      // Enquanto essa linha rodava encadeada, os quatro cantos mediam IGUAL —
      // a escolha por calma era um empate perpétuo decidido só pelo
      // RESERVED_BONUS, ou seja, a logo ia sempre para o canto reservado e o
      // mecanismo de fugir do bloco de copy nunca chegou a existir.
      const recorte = await sharp(arteBuffer).extract(regiao).toBuffer()
      const stats = await sharp(recorte).greyscale().stats()
      calmness = stats.channels[0]?.stdev ?? Number.POSITIVE_INFINITY
      lumCanto = typeof stats.channels[0]?.mean === 'number' ? stats.channels[0].mean : null
      if (lumLogo !== null && lumCanto !== null) {
        contraste = Math.abs(lumLogo - lumCanto)
      }
    } catch {
      // região inválida (arte menor que o esperado) — canto descartado
    }
    if (!Number.isFinite(calmness)) continue

    // Menor é melhor: calma pesa cheio, e falta de contraste vira penalidade.
    // Contraste alto não dá bônus infinito — passado o mínimo, o que decide
    // volta a ser a calma.
    const deficit = Number.isFinite(contraste) ? Math.max(0, CONTRASTE_MINIMO - contraste) : 0
    let score = calmness + deficit * PESO_CONTRASTE
    if (corner === cornerReservado) score *= RESERVED_BONUS
    candidatos.push({ corner, calmness, contraste, lumCanto, score, pos })
  }

  if (candidatos.length === 0) {
    throw new Error('nenhum canto válido para compor a logo')
  }

  // Cantos que ENGOLEM a logo saem da disputa antes de competir por calma —
  // uma parede branca lisa é o canto mais calmo do quadro e o pior lugar
  // possível para uma logo branca. Se todos engolirem, a penalidade do score
  // ainda escolhe o menos ruim.
  const legiveis = seloAutocontido
    ? candidatos
    : candidatos.filter((c) => !Number.isFinite(c.contraste) || c.contraste >= CONTRASTE_MINIMO)
  const disputa = legiveis.length > 0 ? legiveis : candidatos
  if (legiveis.length === 0 && lumLogo !== null) {
    console.warn(
      `[logo] nenhum canto contrasta com a logo (luminância ${lumLogo.toFixed(0)}) — usando o menos ruim`,
    )
  }

  const melhor = disputa.reduce((a, b) => (b.score < a.score ? b : a))

  /**
   * Último recurso quando NENHUM canto contrasta (logo escura em peça escura —
   * o caso real: a marca do Wine Vix, luminância 54, sumia nas peças de story
   * da Lagosta, 23/08/2026): a VERSÃO NEGATIVA, que todo manual de marca prevê.
   * O desenho é o do arquivo (alpha preservado); só a tinta vira branca sobre
   * canto escuro, preta sobre canto claro. Melhor uma marca legível na versão
   * de knockout do que "faltou a logo" — que foi o feedback.
   */
  let logoFinal = logoRedim
  let versao: 'original' | 'negativa' = 'original'
  if (
    !seloAutocontido &&
    Number.isFinite(melhor.contraste) &&
    melhor.contraste < CONTRASTE_MINIMO &&
    melhor.lumCanto !== null
  ) {
    const tinta = melhor.lumCanto < 128 ? 255 : 0
    logoFinal = await versaoNegativa(logoRedim, tinta)
    versao = 'negativa'
    console.warn(
      `[logo] contraste ${melhor.contraste.toFixed(0)} abaixo do mínimo em todos os cantos — aplicada a versão negativa (${tinta === 255 ? 'branca' : 'preta'})`,
    )
  }

  const buffer = await sharp(arteBuffer)
    .composite([{ input: logoFinal, left: melhor.pos.left, top: melhor.pos.top }])
    .jpeg({ quality: 92 })
    .toBuffer()

  return {
    buffer,
    corner: melhor.corner,
    calmness: melhor.calmness,
    contraste: Number.isFinite(melhor.contraste) ? melhor.contraste : null,
    moveu: !!cornerReservado && melhor.corner !== cornerReservado,
    versao,
  }
}

/** Fração dos pixels do PNG que são visíveis (alpha ≥ 128). */
async function coberturaDoAlpha(logoPng: Buffer): Promise<number> {
  try {
    const { data, info } = await sharp(logoPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let visiveis = 0
    const total = data.length / info.channels
    for (let p = 3; p < data.length; p += info.channels) if (data[p] >= 128) visiveis++
    return total > 0 ? visiveis / total : 0
  } catch {
    // Sem a medida, o caminho conservador: tratar como recorte (knockout
    // continua possível) — era o comportamento anterior.
    return 0
  }
}

/** Recolore os pixels VISÍVEIS do PNG com uma tinta única, preservando o alpha. */
async function versaoNegativa(logoPng: Buffer, tinta: number): Promise<Buffer> {
  const { data, info } = await sharp(logoPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let p = 0; p < data.length; p += info.channels) {
    if (data[p + 3] === 0) continue
    data[p] = tinta
    data[p + 1] = tinta
    data[p + 2] = tinta
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels as 4 } })
    .png()
    .toBuffer()
}

/**
 * Instrução que o prompt precisa carregar quando a logo será composta depois.
 * Em inglês porque fala com o modelo de imagem, e explícita porque o modelo
 * tende a "assinar" a peça por conta própria.
 */
export type LogoMode = 'compor' | 'modelo'

/**
 * Instrução ALTERNATIVA: o modelo DESENHA a logo a partir do arquivo oficial
 * enviado como referência, em vez de o sistema compor depois.
 *
 * É o que o insta-automatico faz em produção (a logo vai como IMAGEM 3, com
 * "reproduza EXATAMENTE forma, proporção e cores"). A vantagem é integração:
 * a marca nasce dentro da composição, com a luz e a perspectiva da peça, em
 * vez de ser um adesivo colado num canto.
 *
 * O risco é o de sempre — modelo de imagem distorce logotipo. Por isso o modo
 * é OPT-IN e a peça é conferida por visão depois.
 */
export function instrucaoLogoPeloModelo(
  corner?: LogoCorner | null,
  formato?: 'story' | 'feed' | 'quadrado',
): string {
  const ehStory = formato === 'story'
  /**
   * 🔴 Em STORY o canto superior ESQUERDO não existe para a marca: é onde o
   * Instagram desenha o avatar e o nome do perfil, e a logo ali "briga com a
   * logomarca que o próprio Instagram tem nos stories" (reprovação real do
   * O Quintal, 20/08/2026). O superior DIREITO pode — decisão do Ciro no mesmo
   * dia, corrigindo a primeira versão desta regra, que derrubava os dois
   * cantos de cima: os controles do topo direito ficam dentro da faixa de 1/8
   * que a safe area já reserva. Canto vindo do modelo escolhido desce para o
   * mesmo lado: seguir o modelo não vale brigar com a interface.
   */
  const cantoEfetivo = ehStory && corner === 'top-left' ? ('bottom-left' as LogoCorner) : corner

  const onde = cantoEfetivo
    ? {
        'bottom-right': 'lower-right corner',
        'bottom-left': 'lower-left corner',
        'top-right': 'upper-right corner',
        'top-left': 'upper-left corner',
      }[cantoEfetivo]
    : null

  return [
    '[LOGO — REPRODUZA O ARQUIVO OFICIAL]',
    'Uma das imagens de referência é a LOGO OFICIAL da marca. Desenhe-a na peça reproduzindo EXATAMENTE a forma, as proporções, o desenho das letras e as cores do arquivo.',
    onde
      ? `Coloque-a UMA ÚNICA VEZ, no ${onde}, ocupando NO MÁXIMO 12% da largura do quadro — bem menor do que a tendência: é assinatura de canto, do tamanho de um selo, nunca um elemento da composição.`
      : // Sem canto fixo: quem vê a foto sabe onde ela está vazia. As artes de
        // referência do Espeto movem a marca de peça para peça (topo-esquerda,
        // topo-direita, base-esquerda) conforme o enquadramento, e um canto
        // cravado no prompt produziria a mesma assinatura em todas.
        // No story a escolha livre exclui o canto superior ESQUERDO — ver o
        // comentário de `cantoEfetivo`.
        `Coloque-a UMA ÚNICA VEZ, num CANTO CALMO da foto — o que estiver mais livre nesta imagem${ehStory ? ', NUNCA o canto superior esquerdo' : ''} —, ocupando NO MÁXIMO 12% da largura do quadro — bem menor do que a tendência: é assinatura de canto, do tamanho de um selo, nunca um elemento da composição. Não a ponha sobre o assunto nem sobre a copy.`,
    // O DNA de marca entra no MESMO prompt, mais abaixo, e pode descrever a
    // logo com outros números — o do O Quintal diz "logotipo mono branco deve
    // ocupar de 25% a 32% da largura ... alternando entre topo à esquerda,
    // rodapé à direita", e em 20/08/2026 o modelo obedeceu ao DNA: marca
    // grande no topo esquerdo do story, reprovada. Sem esta linha, o bloco
    // perde por volume para a identidade.
    'Esta seção VENCE qualquer descrição de logo que apareça na identidade/DNA mais abaixo (percentual de largura maior, rodízio de cantos, "topo à esquerda"): quando divergirem, valem os 12% e o canto definidos AQUI.' +
      (ehStory
        ? ' Em STORY o canto superior ESQUERDO é proibido para a marca: ali o Instagram desenha o avatar e o nome do perfil por cima da peça. Os outros três cantos podem.'
        : ''),
    // A safe area também está nas regras de composição, mas ali é o item 9 de
    // uma lista de dez e fala de TEXTO em primeiro lugar. "Canto calmo" é lido
    // como "o canto", e o canto do quadro é justamente onde o Instagram desenha
    // por cima: nas peças do O Quintal (17/08/2026) a marca saiu grudada na
    // borda de cima e na de baixo. A regra tem de estar COLADA à decisão.
    'CANTO NÃO É BORDA: a marca fica DENTRO da área segura — abaixo de ~1/8 da altura no alto, acima dos ~7/8 embaixo, e a pelo menos ~6% da largura das laterais. Nada de logo encostada na borda, nem quando o modelo a seguir tiver a dele encostada.',
    // O modelo desenhou o lockup no topo E o símbolo sozinho no rodapé (almoço
    // executivo do O Quintal, 17/08/2026) — porque o símbolo tinha chegado por
    // outra porta, como "elemento gráfico" do modelo a seguir. Aquela porta foi
    // fechada no decodificador; esta linha fecha o lado da logo.
    '⛔ UMA MARCA POR PEÇA, e ela é o ARQUIVO INTEIRO: não desenhe o símbolo (ícone, selo, emblema circular) separado do nome em outro canto, não repita a marca em tamanho menor e não use o símbolo como ornamento. Se a arte de referência parecer ter dois, é a MESMA marca vista uma vez — aqui ela aparece uma vez só.',
    '⛔ Não redesenhe, não estilize, não simplifique e não "melhore" a marca. Não invente símbolo, monograma, contorno ou selo que não esteja no arquivo. Não escreva o nome da marca com outra fonte.',
    // Soletração e ligadura, explícitas. O caso real que exigiu as duas linhas:
    // a logo do TERO tem o R EMENDADO no E (ligadura), e o modelo a "desdobrou"
    // em letras separadas — a arte saiu "TERRO", com o tagline "BRASAL E
    // VINHO" no lugar de "BRASA E VINHO" (pego pelo Ciro em 14/08/2026; a
    // conferência visual está desligada desde 10/08, então nada avisou).
    'SOLETRAÇÃO: a marca é uma FORMA a copiar, não um texto a recompor. Reproduza EXATAMENTE as letras do arquivo, no nome e no tagline — nunca acrescente, duplique, troque ou omita uma letra sequer. Antes de finalizar, confira letra por letra contra o arquivo.',
    'LIGADURA: quando duas letras do arquivo dividem um traço (letras emendadas), desenhe-as como UMA forma fundida, igual ao arquivo — NUNCA desdobre a ligadura em letras separadas nem em letra repetida.',
    'Se não conseguir reproduzir a marca fielmente, deixe o canto VAZIO — arte sem marca é aproveitável, marca errada não é.',
  ].join('\n')
}

export function instrucaoAreaReservada(corner: LogoCorner = 'bottom-right'): string {
  const onde = {
    'bottom-right': 'lower-right corner',
    'bottom-left': 'lower-left corner',
    'top-right': 'upper-right corner',
    'top-left': 'upper-left corner',
  }[corner]
  return [
    '[LOGO — DO NOT DRAW]',
    `⛔ Do NOT draw, letter or reproduce any logo, wordmark, brand symbol, monogram or signature anywhere in the image. The real logo is composited by the system after generation.`,
    `Reserve the ${onde} for it: a clean, calm area of about 30% of the width and 18% of the height, with no text, no key subject and no busy detail.`,
    `Every line of copy must END before that reserved area — keep the whole text block clear of it, shortening the text lines or moving the block if needed. Text running under the reserved corner ruins the piece.`,
    // A linha que faltava em 10/08, quando o modo compor produzia DUAS marcas:
    // o modelo desenhava a logo DELE apesar do DO NOT DRAW, porque a via nas
    // referências. Dizer de onde ela veio é o que fecha a porta.
    `If a brand mark, wordmark or logo appears in ANY reference image, it belongs to that old piece — this image contains NO brand mark at all, not even small, not even in a corner. The official file is placed by the system afterwards.`,
  ].join('\n')
}

/**
 * Co-branding: a peça leva DUAS marcas — a do projeto dono (a agência) e a do
 * CLIENTE CITADO na copy. As duas são compostas por sharp depois da geração
 * (fidelidade garantida, canto decidido em código), então o prompt só precisa
 * reservar o segundo canto e deixar claro que NENHUMA marca é desenhada pelo
 * modelo. É o par de `instrucaoAreaReservada`, que cuida do canto da marca
 * principal.
 *
 * Por que não mandar o modelo desenhar a marca do cliente: são nove marcas
 * diferentes (wordmark com ligadura, brush, serifa fina) e a fidelidade de
 * cada uma seria uma loteria por peça — a conferência de logo já reprova a
 * marca da casa quando diverge; duas marcas desenhadas dobram o risco.
 */
export function instrucaoMarcaDoCliente(corner: LogoCorner, nomeDoCliente: string): string {
  const onde = {
    'bottom-right': 'lower-right corner',
    'bottom-left': 'lower-left corner',
    'top-right': 'upper-right corner',
    'top-left': 'upper-left corner',
  }[corner]
  return [
    '[CLIENT LOGO — DO NOT DRAW]',
    `This piece is about the agency's client "${nomeDoCliente}". The client's official logo is ALSO composited by the system after generation — do NOT draw, letter or reproduce it anywhere in the image.`,
    `Reserve the ${onde} for it: a second clean, calm area of about 28% of the width and 14% of the height, with no text, no key subject and no busy detail. Keep every line of copy clear of this area too.`,
    `The client's NAME may appear in the copy as plain text, exactly as written — that is text, not a logo.`,
  ].join('\n')
}
