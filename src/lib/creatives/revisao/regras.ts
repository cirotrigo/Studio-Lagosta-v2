/**
 * O REVISOR DA ARTE — as regras (11/09/2026).
 *
 * Recebe a peça MEDIDA (geometria dos glifos, régua de contraste, corpo de
 * referência, assunto da foto, fontes) e, quando a visão rodou, o que ela viu;
 * devolve os achados e os ajustes prontos para `ajustar-arte`. Nada aqui mede
 * nem chama modelo: tudo chega pronto em `EntradaDaRevisao`.
 *
 * Como os limites foram escolhidos:
 *  - o que já é regra da casa foi herdado sem mudança: a tolerância de colisão
 *    e o encaixe de desenho (`text-geometry.ts`), o piso de 24px e de 80% do
 *    corpo (autofix), o teto de 25% de cobertura do assunto (mapa de calma), a
 *    tolerância de 12 níveis da régua e a margem de segurança do editor;
 *  - o que é novo (título grande por proporção, sobra de gradiente, entrelinha)
 *    começa como proposta calibrada contra peças reais
 *    (`scripts/revisar-pecas-reais.ts`) e sai como AVISO ou SUGESTÃO — "maior
 *    que o modelo" não prova "ruim".
 *
 * Um ajuste por camada por rodada: dois achados que mexem nas mesmas camadas
 * (colisão + margem, por exemplo) não empilham deltas calculados sobre a
 * mesma geometria antiga — o segundo espera a revisão seguinte. Duas propostas
 * de corpo/entrelinha nas MESMAS camadas se fundem num comando só, e duas de
 * gradiente na mesma borda ficam com a força maior.
 *
 * Módulo PURO.
 */

import type { Layer } from '@/types/template'
import { temTextoVisivel } from './texto-visivel'
import { TEXT_DRAW_PADDING, type TextGeometryIssue, type TextLayerMetrics } from '@/lib/creatives/text-geometry'
import { margensDoEditor } from '@/lib/canvas-margin'
import { formatoDaPaginaGravada } from '@/lib/compositor/formato'
import { ajusteParaDentro } from './para-dentro'
import { textosForaDaPiora, tratamentosQuePioraramALeitura, type ContrasteMedido, type PioraDeTratamento } from '@/lib/compositor/regua'
import { papelDaCamada } from '@/lib/compositor/defasagem'
import { alcanceDoGrupo, alturaDaFaixa, bordaDoGrupo, ehGradienteDeLeitura, forcaDaCamada, GRADIENTE_PADRAO, type Borda } from '@/lib/compositor/gradiente-de-leitura'
import { luzDaCor, uniao, type Rect } from '@/lib/creatives/halo/halo'
import { ALFA_VISIVEL_DA_LOGO, LIMIAR_DE_CONTRASTE_DA_LOGO, PERCENTIL_DA_LOGO, type MedidaDaLogo } from '@/lib/compositor/legibilidade-da-logo'
import { TETO_DE_COBERTURA_DO_ASSUNTO, TETO_DE_COBERTURA_DO_ASSUNTO_ESTIMADO } from '@/lib/compositor/mapa-de-calma'
import { bordaDaLeitura } from './aplicar-ajustes'
import {
  ajusteSchema,
  ORDEM_DE_SEVERIDADE,
  problemaDoAjuste,
  REGRAS_DA_REVISAO,
  VERSAO_DAS_REGRAS,
  type AchadoDaRevisao,
  type Ajuste,
  type Certeza,
  type CoberturaDaRegra,
  type RegraDaRevisao,
  type RelatorioDaRevisao,
} from './contrato'
import type { AchadoVisto, ProblemaVisto } from './visao'

/**
 * A leitura que DECIDE um achado de contraste. Quando a régua corrigiu a força,
 * é a medida de ANTES da correção — p98, ok, força, alvo e sentido juntos: a
 * régua mede texto a texto e o grupo vale o pior, e o pior texto pode ser
 * outro depois que a força muda (11/09/2026). Sem correção, é a medida atual.
 */
/**
 * As leituras texto a texto de um grupo medido. Medida anterior a 12/09/2026
 * (sem `textos`) volta como um texto só — o representante do grupo.
 */
export function leiturasDoGrupo(m: ContrasteMedido): Array<{ camada: string; sentido: 'claro' | 'escuro'; alvo: number; p98SemHalo: number; p98ComHalo: number; ok: boolean }> {
  if (m.textos && m.textos.length > 0) return m.textos
  return [{ camada: m.camadas[0] ?? m.grupo, sentido: m.sentido, alvo: m.alvo, p98SemHalo: m.p98SemHalo, p98ComHalo: m.p98ComHalo, ok: m.ok }]
}

export function leituraDecisiva(m: ContrasteMedido): { p98: number; ok: boolean; tinta: number; alvo: number; sentido: 'claro' | 'escuro' } {
  const a = m.antesDaCorrecao
  return a
    ? { p98: a.p98, ok: a.ok, tinta: a.tinta, alvo: a.alvo, sentido: a.sentido }
    : { p98: m.p98ComHalo, ok: m.ok, tinta: m.tinta, alvo: m.alvo, sentido: m.sentido }
}

/** Onde a força de um gradiente está na faixa da marca, e quanto ela ainda pode mudar. */
export interface DiagnosticoDaForca {
  posicao: 'abaixo-do-piso' | 'piso' | 'entre' | 'teto' | 'acima-do-teto'
  forca: number
  minima: number
  maxima: number
  margemParaAumentar: number
  margemParaDiminuir: number
}

/**
 * Pura (CP1, 13/10/2026): a posição REAL da força na faixa. O revisor dizia
 * "já está no teto" para força 0.45 — que era o PISO (peça piloto). Faixa
 * degenerada (mínimo = máximo) conta como teto: não há margem. Compara na
 * precisão em que a força é gravada (3 casas): a posição e a margem saem da
 * MESMA diferença real — 0.746 sob teto 0.75 está entre, com margem 0.004.
 */
export function diagnosticoDaForca(forca: number, [minima, maxima]: [number, number]): DiagnosticoDaForca {
  const f = arred(forca, 3)
  const min = arred(minima, 3)
  const max = arred(maxima, 3)
  const posicao: DiagnosticoDaForca['posicao'] = f > max ? 'acima-do-teto' : f === max ? 'teto' : f < min ? 'abaixo-do-piso' : f === min ? 'piso' : 'entre'
  return {
    posicao,
    forca,
    minima,
    maxima,
    margemParaAumentar: Math.max(0, arred(max - f, 3)),
    margemParaDiminuir: Math.max(0, arred(f - min, 3)),
  }
}

/** A frase da posição da força, para o achado de leitura (`proposta`: a força é a que o revisor propõe). */
function fraseDaForca(d: DiagnosticoDaForca, borda: Borda, proposta = false): string {
  const qual = borda === 'topo' ? 'do topo' : 'do rodapé'
  const faixa = `força ${d.forca}; faixa da marca ${d.minima}–${d.maxima}`
  const aumentar = d.margemParaAumentar > 0 ? `há margem para aumentar até ${d.maxima}` : 'não há margem para aumentar'
  const diminuir = d.margemParaDiminuir > 0 ? `há margem para diminuir até ${d.minima}` : 'não há margem para diminuir'
  const onde = {
    'acima-do-teto': 'está ACIMA do teto da faixa da marca',
    teto: 'está no TETO da faixa da marca',
    entre: 'está entre o piso e o teto da faixa da marca',
    piso: 'está no PISO da faixa da marca',
    'abaixo-do-piso': 'está ABAIXO do piso da faixa da marca',
  }[d.posicao]
  return proposta ? `Com a proposta, o gradiente ${qual} ${onde.replace(/^está/, 'fica')} (${faixa}): ${aumentar}; ${diminuir}.` : `O gradiente ${qual} ${onde} (${faixa}): ${aumentar}; ${diminuir}.`
}

export interface ReferenciaDeCamada {
  /** Corpo do modelo, normalizado para 1080 de largura. */
  fontSize1080: number
  entrelinha: number | null
  origem: string
  /**
   * CP4.2a: a camada do modelo não tinha `fontSize` numérico e o corpo veio do fallback (16). Para TÍTULOS essa
   * referência vale como AUSENTE (nunca vira um piso de 12,8 px); os demais seguem como sempre.
   */
  inferida?: true
}

export interface LeituraDaLogoNaRevisao {
  camada: string
  /** O arquivo desenhado e, quando a composição a gravou, a origem (página de assinatura ou logo do projeto). */
  variante: { url: string; origem?: 'pagina' | 'projeto' }
  posicao: Rect
  medida: MedidaDaLogo | null
  /**
   * `indisponivel`: o arquivo não baixou ou não decodificou; `sem-pixels`: nenhum pixel visível sobre o fundo;
   * `fora-do-contrato`: a camada é desenhada com rotação, opacidade, recorte ou `cover` — a caixa não representa o desenho.
   */
  estado: 'medida' | 'indisponivel' | 'sem-pixels' | 'fora-do-contrato'
  motivo?: string
}

export interface EntradaDaRevisao {
  canvas: { width: number; height: number }
  formato: 'story' | 'feed' | 'quadrado' | null
  camadas: Layer[]
  /** Uma por texto visível; rich text medido como texto simples do mesmo corpo. */
  metricas: TextLayerMetrics[]
  geometria: TextGeometryIssue[]
  /** A régua rodada COM correção, em memória: `tintaCorrigida` é a força proposta. `null` = não medida. */
  contraste: ContrasteMedido[] | null
  /**
   * As pioras de tratamento na peça COMO ESTÁ (`ReguaResultado.pioras`, antes
   * da correção em memória). `null` = a régua não rodou. Ausente: derivadas de
   * `contraste` — o estado que a medida descreve, que nos grupos corrigidos é
   * o DEPOIS da correção (CP1, 13/10/2026).
   */
  pioras?: PioraDeTratamento[] | null
  faixaDoGradiente: [number, number]
  /** Corpo e entrelinha de referência por id de camada da página revisada. */
  referencias: Record<string, ReferenciaDeCamada>
  /**
   * CP4.2a: os títulos FIXADOS pelo executor a partir da página ANTERIOR à chamada (`titulosDaPagina`). Presente, a
   * classificação não é inferida de novo em cada medida — reduzir a manchete (ou reclassificá-la pelo `papel` do
   * pedido) não a tira da proteção. Ausente (revisar-arte solto), a inferência de sempre.
   */
  titulosFixados?: string[]
  assunto: { rect: Rect; origem: 'catalogo' | 'estimado' } | null
  /** Sem assunto: o motivo, e se a regra `texto-sobre-assunto` é inaplicável (foto lida sem assunto) em vez de não medida. */
  motivoSemAssunto?: string
  assuntoNaoSeAplica?: true
  /**
   * A leitura de cada logo solta (CP3, 15/10/2026): a medida pixel a pixel contra o fundo efetivo sem ela
   * (`legibilidade-da-logo.ts`), ou o motivo de o ARQUIVO não ter carregado (`indisponivel`) — que é cobertura
   * parcial, nunca "sem contraste". `null`/ausente = a medição não rodou (`motivoSemLeituraDaLogo`).
   */
  leituraDaLogo?: LeituraDaLogoNaRevisao[] | null
  motivoSemLeituraDaLogo?: string
  fontesAusentes: Array<{ familia: string; peso: number | null; camadas: string[] }>
  /** A conferência das fontes NÃO rodou (o registro de fontes falhou): `fonte-nao-carregada` sai "não avaliada", nunca "nenhuma falta". */
  motivoSemFontes?: string
  /** Camadas medidas por aproximação (rich text). */
  medidasAproximadas: string[]
  /**
   * A medição dos textos NÃO rodou (fonte, medidor ou geometria falharam):
   * toda regra que depende de `metricas` sai "não avaliada" com este motivo.
   * Métrica ausente nunca vira avaliação positiva (R4, 12/09/2026).
   */
  motivoSemMedida?: string
  /**
   * Textos VISÍVEIS que o medidor não mediu (curvo, `fitty`, `auto-resize-*` —
   * `measureTextLayerBox` devolve null e a geometria simplesmente os omite).
   * Sem isto, colisão, corte e margem terminavam "avaliadas" sem ter olhado a
   * camada, e a visão ficava sem marca dela (REV-127-03 da revisão FINAL do
   * Codex, 12/09/2026).
   */
  textosSemMetrica?: string[]
  /** O que a visão viu, já reconciliado. `undefined` = a visão não rodou. */
  vistos?: AchadoVisto[]
  motivoSemVisao?: string
  /**
   * A resposta da visão foi lida INTEIRA (nenhum item descartado na
   * reconciliação). Só resposta conclusiva autoriza a arbitragem negativa —
   * rebaixar leitura ou tirar assunto porque "a visão não viu": um item com
   * marca inválida pode ter sido justamente sobre aquele bloco.
   */
  visaoConclusiva?: boolean
  /**
   * Achados válidos que a reconciliação deixou além do teto. Resposta cortada
   * também não é conclusiva: o que ficou de fora podia confirmar a leitura
   * medida (REV-127-INTEGRAL-02). Use `insumosDaVisao` para preencher os dois.
   */
  visaoTruncados?: number
  /**
   * As camadas de texto que a visão RECEBEU marcadas (T1, T2…). Achado medido
   * só é rebaixado pelo olhar quando TODAS as camadas dele tinham marca: texto
   * sem métrica (curvo, fitty, auto-resize) e a peça inteira quando a medição
   * falha não recebem marca, e a visão não tinha como confirmá-los (C0-01).
   * Sem o campo, deriva de `blocosDeTexto` — a mesma conta de `marcasDaPeca`.
   */
  visaoCamadasMarcadas?: string[]
}

export const LIMITES_DA_REVISAO = {
  /** Fração da altura útil (entre as margens do editor) ocupada pelos glifos do título. */
  tituloAlturaSugestao: 0.2,
  tituloAlturaAviso: 0.27,
  /** Corpo do título contra o do modelo. */
  tituloRelativo: 1.15,
  pisoDeFonte1080: 24,
  pisoRelativo: 0.8,
  orfaFracao: 0.3,
  /** Os tetos moram no mapa de calma: o compositor e a busca espacial usam os MESMOS (uma fonte só). */
  coberturaDoAssunto: TETO_DE_COBERTURA_DO_ASSUNTO,
  /** Assunto só ESTIMADO pela textura: 25% acusava 8 de 30 peças reais sem nada visível — o teto é outro. */
  coberturaDoAssuntoEstimado: TETO_DE_COBERTURA_DO_ASSUNTO_ESTIMADO,
  /** px de tinta além da caixa antes de acusar (antialias). */
  folgaDeTinta: 1.5,
  /** Níveis de p98 abaixo do alvo que já contam como gradiente sobrando. */
  gradienteSobra: 40,
  gradienteReducaoMinima: 0.08,
  entrelinhaRelativa: 0.12,
  entrelinhaTituloAbsoluta: 1.3,
  entrelinhaTextoAbsoluta: 1.6,
} as const

const PAD = TEXT_DRAW_PADDING
const arred = (v: number, casas = 0) => Number(v.toFixed(casas))
/**
 * A redução de força atinge o mínimo? Comparado em MILÉSIMOS: em ponto
 * flutuante `0.6 - 0.52` dá 0,0799…, menor que 0,08, e uma redução válida
 * exatamente no mínimo virava observação (REV-C19-02 da revisão do Codex,
 * 12/09/2026). As forças já andam em milésimos (`arred(…, 3)`).
 */
const reducaoAtingeOMinimo = (de: number, para: number, minimo: number) => Math.round((de - para) * 1000) >= Math.round(minimo * 1000)

/** Sombra presa ao glifo: segura a leitura onde o fundo não segura, e a régua não a mede. */
function temSombraNoGlifo(l: Layer): boolean {
  const s = l.effects?.shadow
  return !!s?.enabled && (s.shadowOpacity ?? 1) > 0.2
}

/**
 * Cor saturada (o vermelho do Espeto, o amarelo do By Rock): o alvo de
 * luminância pede fundo quase preto, mas a letra lê pelo contraste de COR —
 * o mesmo motivo que já faz a régua não medi-la como texto escuro.
 */
function corSaturada(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max > 140 && (max - min) / max > 0.55
}
const pct = (v: number) => `${Math.round(v * 100)}%`

/** Texto sem conteúdo (`content` vazio ou só espaço): o mesmo critério de `textosSemMetrica` em `revisar-arte`. */
export function textoSemConteudo(l: Layer): boolean {
  return (l.type === 'text' || l.type === 'rich-text') && !temTextoVisivel(l.content)
}

export function ehTextoVisivel(l: Layer): boolean {
  return (l.type === 'text' || l.type === 'rich-text') && l.visible !== false
}

/**
 * CP4.2a — os títulos de uma página, pela MESMA regra de `idsDeTitulo`, mas lidos das camadas gravadas (a página
 * ANTERIOR à chamada), para o executor fixar a classificação antes do lote: todo texto com papel GRAVADO
 * `headline`/`headline2` (metadata/id/nome) entra, mesmo vazio ou oculto (uma manchete vazia que o pedido preenche
 * continua manchete); sem papel gravado, a inferência por TAMANHO só entre os textos visíveis e com conteúdo (os
 * mensuráveis): o maior é título se tem corpo ≥ 1,5× o segundo. Puro.
 */
export function titulosDaPagina(camadas: Layer[]): string[] {
  const textos = camadas.filter((l) => l.type === 'text' || l.type === 'rich-text')
  const porPapel = textos.filter((l) => {
    const p = papelDaCamada(l)
    return p === 'headline' || p === 'headline2'
  })
  if (porPapel.length > 0) return porPapel.map((l) => l.id)
  const mensuraveis = textos.filter((l) => l.visible !== false && temTextoVisivel(l.content) && typeof l.style?.fontSize === 'number')
  if (mensuraveis.length < 2) return []
  const ordenadas = [...mensuraveis].sort((a, b) => Number(b.style!.fontSize) - Number(a.style!.fontSize))
  return Number(ordenadas[0].style!.fontSize) >= Number(ordenadas[1].style!.fontSize) * 1.5 ? [ordenadas[0].id] : []
}

export type ComponenteDoPisoDoTitulo = 'modelo' | 'hierarquia' | 'celular'

/**
 * CP4.2a — os pisos de corpo (em px de 1080) de um TÍTULO, um por componente, SEM `max` entre eles: cada um vira um
 * achado próprio e é comparado sozinho (uma melhora na hierarquia não compensa cruzar o piso do modelo).
 *   modelo     — 0,8 × referência (`pisoRelativo`, a mesma escada do compositor e dos não-títulos); só com referência
 *                válida (a inferida do fallback 16 conta como ausente);
 *   hierarquia — o maior corpo1080 entre os textos visíveis que NÃO são título (fator 1,0: não inverter; K segue
 *                telemetria); só quando há secundário medido;
 *   celular    — `pisoDeFonte1080` (24), salvo modelo deliberadamente discreto (referência válida < 24: só o recuo
 *                de 80 % conta, como na regra dos não-títulos).
 */
export function pisosDoTitulo(args: {
  referencia: ReferenciaDeCamada | undefined
  maiorSecundario1080: number | null
  limites?: Pick<typeof LIMITES_DA_REVISAO, 'pisoRelativo' | 'pisoDeFonte1080'>
}): Array<{ componente: ComponenteDoPisoDoTitulo; piso1080: number }> {
  const L = args.limites ?? LIMITES_DA_REVISAO
  const ref = args.referencia && !args.referencia.inferida && Number.isFinite(args.referencia.fontSize1080) && args.referencia.fontSize1080 > 0 ? args.referencia.fontSize1080 : null
  const pisos: Array<{ componente: ComponenteDoPisoDoTitulo; piso1080: number }> = []
  if (ref !== null) pisos.push({ componente: 'modelo', piso1080: L.pisoRelativo * ref })
  if (args.maiorSecundario1080 !== null && args.maiorSecundario1080 > 0) pisos.push({ componente: 'hierarquia', piso1080: args.maiorSecundario1080 })
  if (ref === null || ref >= L.pisoDeFonte1080) pisos.push({ componente: 'celular', piso1080: L.pisoDeFonte1080 })
  return pisos
}

export function grupoDaCamada(l: Layer | undefined): string | null {
  const g = l?.metadata?.groupId
  return typeof g === 'string' && g ? g : null
}

export function entrelinhaDaCamada(l: Layer): number {
  const v = l.textboxConfig?.autoWrap?.lineHeight ?? l.style?.lineHeight
  return typeof v === 'number' && v > 0 ? v : 1.2
}

export function nomeDaCamada(l: Layer | undefined): string {
  if (!l) return '?'
  return papelDaCamada(l) ?? (l.name?.trim() || l.id)
}

function rectDaCamada(l: Layer): Rect {
  return { x: l.position?.x ?? 0, y: l.position?.y ?? 0, width: l.size?.width ?? 0, height: l.size?.height ?? 0 }
}

function areaDe(r: Rect): number {
  return Math.max(0, r.width) * Math.max(0, r.height)
}

function intersecao(a: Rect, b: Rect): number {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.width, b.x + b.width)
  const y1 = Math.min(a.y + a.height, b.y + b.height)
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
}

function expandir(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, width: r.width + 2 * d, height: r.height + 2 * d }
}

/**
 * As margens de segurança do editor (as guias azuis), na escala da peça — a MARGEM DA MARCA padrão de
 * `margensDoEditor` (29/10/2026: Story 64/160/160, Feed 64/72/72), pelo formato que o tamanho do canvas diz. Eram
 * 70/120/100 fixos (até o L5 da instrução das linhas-guia, antecipado no PR das margens de 29/10).
 */
export function limitesDoEditor(canvas: { width: number; height: number }) {
  return margensDoEditor({ formato: formatoDaPaginaGravada(canvas), assinatura: null, largura: canvas.width, altura: canvas.height }).marca
}

/** A TINTA do texto na peça: vertical pelos glifos, horizontal pela linha mais larga no alinhamento. */
export function tintaDoTexto(m: TextLayerMetrics, camada: Layer | undefined): Rect {
  const w = Math.max(1, m.maxLineWidth)
  const alinhamento = camada?.style?.textAlign ?? 'left'
  const x =
    alinhamento === 'center'
      ? m.box.x + m.box.width / 2 - w / 2
      : alinhamento === 'right'
        ? m.box.x + m.box.width - PAD - w
        : m.box.x + PAD
  return { x, y: m.glyphTop, width: w, height: Math.max(1, m.glyphBottom - m.glyphTop) }
}

export interface BlocoDeTexto {
  chave: string
  textos: Array<{ camada: Layer; metrica: TextLayerMetrics; tinta: Rect }>
  /** Todas as camadas visíveis do grupo (textos e elementos presos a eles). */
  membros: Layer[]
  tinta: Rect
}

/** Os blocos de texto da peça (o grupo da página, ou o texto solto), de cima para baixo. */
export function blocosDeTexto(camadas: Layer[], metricas: TextLayerMetrics[]): BlocoDeTexto[] {
  const porId = new Map(camadas.map((l) => [l.id, l]))
  const blocos = new Map<string, BlocoDeTexto>()
  for (const m of metricas) {
    const camada = porId.get(m.layerId)
    if (!camada) continue
    const grupo = grupoDaCamada(camada)
    const chave = grupo ?? camada.id
    const tinta = tintaDoTexto(m, camada)
    const bloco =
      blocos.get(chave) ??
      ({
        chave,
        textos: [],
        membros: grupo ? camadas.filter((l) => grupoDaCamada(l) === grupo && l.visible !== false) : [camada],
        tinta,
      } as BlocoDeTexto)
    bloco.textos.push({ camada, metrica: m, tinta })
    bloco.tinta = uniao(bloco.textos.map((t) => t.tinta)) ?? tinta
    blocos.set(chave, bloco)
  }
  return [...blocos.values()].sort((a, b) => a.tinta.y - b.tinta.y || a.tinta.x - b.tinta.x)
}

/** A foto de fundo da peça (`bg-foto` ou a imagem que cobre ≥ 90% do canvas): sem ela não há assunto a proteger. */
export function fotoDeFundo(camadas: Layer[], canvas: { width: number; height: number }): Layer | null {
  return (
    camadas.find((l) => l.id === 'bg-foto' && l.visible !== false) ??
    camadas.find((l) => l.type === 'image' && l.visible !== false && (l.size?.width ?? 0) >= canvas.width * 0.9 && (l.size?.height ?? 0) >= canvas.height * 0.9) ??
    null
  )
}

/** As logos soltas da peça (a logo que mora num arranjo de texto é desenho, não conta). */
export function logosDaPeca(camadas: Layer[]): Layer[] {
  return camadas.filter(
    (l) =>
      l.visible !== false &&
      !grupoDaCamada(l) &&
      (l.type === 'logo' || l.id === 'logo' || (l.type === 'image' && /\blogo\b/i.test(l.name ?? ''))),
  )
}

type Canto = 'superior-esquerdo' | 'superior-direito' | 'inferior-esquerdo' | 'inferior-direito'

/** O canto livre para a logo, com as mesmas distâncias à borda que ela tem hoje. No story, o superior esquerdo é do avatar. */
export function cantoLivreParaLogo(
  logo: Layer,
  tintas: Rect[],
  canvas: { width: number; height: number },
  formato: EntradaDaRevisao['formato'],
): { canto: Canto; dx: number; dy: number } | null {
  const r = rectDaCamada(logo)
  const W = canvas.width
  const H = canvas.height
  const lim = limitesDoEditor(canvas)
  const mx = Math.max(lim.esquerda, Math.min(r.x, W - r.x - r.width))
  const my = Math.max(0, Math.min(r.y, H - r.y - r.height))
  const topo = Math.max(my, lim.topo)
  const base = Math.max(my, H - lim.base)
  const posicao: Record<Canto, { x: number; y: number }> = {
    'superior-esquerdo': { x: mx, y: topo },
    'superior-direito': { x: W - mx - r.width, y: topo },
    'inferior-esquerdo': { x: mx, y: H - base - r.height },
    'inferior-direito': { x: W - mx - r.width, y: H - base - r.height },
  }
  const emCima = r.y + r.height / 2 < H / 2
  const aEsquerda = r.x + r.width / 2 < W / 2
  const atual = `${emCima ? 'superior' : 'inferior'}-${aEsquerda ? 'esquerdo' : 'direito'}` as Canto
  const trocaLado = (c: Canto) => (c.endsWith('esquerdo') ? c.replace('esquerdo', 'direito') : c.replace('direito', 'esquerdo')) as Canto
  const trocaAltura = (c: Canto) => (c.startsWith('superior') ? c.replace('superior', 'inferior') : c.replace('inferior', 'superior')) as Canto
  for (const canto of [trocaLado(atual), trocaAltura(atual), trocaAltura(trocaLado(atual))]) {
    if (formato === 'story' && canto === 'superior-esquerdo') continue
    const alvo = { ...posicao[canto], width: r.width, height: r.height }
    if (tintas.some((t) => intersecao(expandir(alvo, 16), t) > 0)) continue
    return { canto, dx: Math.round(alvo.x - r.x), dy: Math.round(alvo.y - r.y) }
  }
  return null
}

/** Os achados do código que a visão pode CONFIRMAR — o olhar vira evidência do achado medido, sem comando novo. */
const REGRAS_DO_PROBLEMA: Partial<Record<ProblemaVisto, RegraDaRevisao[]>> = {
  'acento-ou-cedilha-cortado': ['tinta-fora-da-caixa', 'texto-cortado'],
  'texto-cortado': ['texto-cortado'],
  'texto-sem-leitura': ['texto-sem-leitura'],
  'gradiente-claro-demais': ['texto-sem-leitura'],
  'gradiente-escuro-demais': ['gradiente-forte-demais'],
  'entrelinha-grande': ['entrelinha-grande'],
  'titulo-grande': ['titulo-grande'],
  'texto-pequeno': ['texto-pequeno'],
  colisao: ['colisao'],
  'logo-sobre-texto': ['logo-sobre-texto'],
  'texto-sobre-assunto': ['texto-sobre-assunto'],
  'palavra-orfa': ['palavra-orfa'],
  desalinhado: ['fora-da-area-segura'],
}

const ROTULO_DO_PROBLEMA: Record<ProblemaVisto, string> = {
  'acento-ou-cedilha-cortado': 'acento ou cedilha cortados',
  'texto-cortado': 'texto cortado',
  'texto-sem-leitura': 'texto sem leitura',
  'gradiente-escuro-demais': 'gradiente escuro demais sobre a foto',
  'gradiente-claro-demais': 'gradiente claro demais para o texto',
  'entrelinha-grande': 'entrelinha grande demais',
  'titulo-grande': 'título grande demais',
  'texto-pequeno': 'texto pequeno demais',
  'posicao-estranha': 'bloco numa posição estranha',
  desalinhado: 'blocos desalinhados',
  'respiro-desequilibrado': 'respiro desequilibrado',
  colisao: 'colisão',
  'logo-sobre-texto': 'logo sobre o texto',
  'texto-sobre-assunto': 'texto sobre o assunto da foto',
  'palavra-orfa': 'palavra sozinha na última linha',
}

function mesmoConjunto(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

function semIndefinidos<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

export function avaliarPeca(e: EntradaDaRevisao): RelatorioDaRevisao {
  const W = e.canvas.width
  const H = e.canvas.height
  const s = W / 1080
  const lim = limitesDoEditor(e.canvas)
  const L = LIMITES_DA_REVISAO
  const porId = new Map(e.camadas.map((l) => [l.id, l]))
  const metricaPorId = new Map(e.metricas.map((m) => [m.layerId, m]))
  const tintaPorId = new Map(e.metricas.map((m) => [m.layerId, tintaDoTexto(m, porId.get(m.layerId))]))
  const blocos = blocosDeTexto(e.camadas, e.metricas)
  const blocoDaCamada = new Map<string, BlocoDeTexto>()
  for (const b of blocos) for (const t of b.textos) blocoDaCamada.set(t.camada.id, b)
  const aproximada = new Set(e.medidasAproximadas)
  const fonteIncerta = new Set(e.fontesAusentes.flatMap((f) => f.camadas))
  const certezaDe = (ids: string[]): Certeza => (ids.some((id) => aproximada.has(id)) ? 'estimada' : 'medida')
  const cobertura: Partial<Record<RegraDaRevisao, CoberturaDaRegra>> = {}
  const marcarParcial = (regra: RegraDaRevisao, motivo: string) => {
    if (!cobertura[regra]) cobertura[regra] = { estado: 'parcial', motivo }
  }

  const achados: AchadoDaRevisao[] = []
  const ajustes: Ajuste[] = []
  const camadasComAjuste = new Set<string>()
  const gradientePorBorda = new Map<string, number>()
  /** O gradiente que a peça tem hoje naquela borda — o de leitura ou um desenhado à mão. */
  const gradienteNaBorda = (borda: string): Layer | undefined =>
    e.camadas.find(
      (l) => (l.type === 'gradient' || l.type === 'gradient2') && l.visible !== false && (l.size?.width ?? 0) >= W * 0.9 && bordaDaLeitura(l, H) === borda,
    )
  /** A força desse gradiente (0 sem gradiente). */
  const forcaDaBorda = (borda: string): number => {
    const g = gradienteNaBorda(borda)
    return g ? forcaDaCamada(g) : 0
  }

  /** Registra o achado e os ajustes dele, fundindo ou adiando o que colide com ajuste anterior. */
  function adicionar(base: Omit<AchadoDaRevisao, 'id' | 'ajustes'>, propostos: Ajuste[] = [], chave?: string): AchadoDaRevisao {
    const id = chave ?? `${base.regra}:${base.camadas.join('+') || 'peca'}`
    const achado: AchadoDaRevisao = { id, ...base, ajustes: [] }
    let adiado = false
    let opostos = false
    let invalido = false
    for (const proposto of propostos) {
      const a = semIndefinidos(proposto) as Ajuste
      // Todo ajuste calculado passa pelo mesmo contrato que o MCP aplica: comando
      // fora dos limites nunca chega a quem vai executá-lo.
      if (!ajusteSchema.safeParse(a).success || problemaDoAjuste(a)) {
        invalido = true
        continue
      }
      if (a.tipo === 'gradiente') {
        const existente = gradientePorBorda.get(a.borda!)
        if (existente != null) {
          // "Mais gradiente" e "menos gradiente" na mesma borda não se fundem:
          // ficar com a força maior prenderia o pedido de menos a um aumento.
          const atual = forcaDaBorda(a.borda!)
          const sobe = (x: Ajuste) => (x.forca ?? 0) > atual + 0.005
          if (sobe(a) !== sobe(ajustes[existente])) {
            opostos = true
            continue
          }
          const anterior = ajustes[existente]
          // A faixa precisa cobrir os dois blocos: fica a força maior e a altura maior.
          const altura = Math.max(anterior.altura ?? 0, a.altura ?? 0)
          ajustes[existente] = semIndefinidos({
            ...anterior,
            ...((a.forca ?? 0) > (anterior.forca ?? 0) ? a : {}),
            altura: altura > 0 ? altura : undefined,
            achado: anterior.achado,
          }) as Ajuste
          achado.ajustes.push(existente)
        } else {
          gradientePorBorda.set(a.borda!, ajustes.length)
          ajustes.push({ ...a, achado: id })
          achado.ajustes.push(ajustes.length - 1)
        }
        continue
      }
      if (a.tipo === 'fonte') {
        const fundivel = ajustes.findIndex(
          (x) =>
            x.tipo === 'fonte' &&
            mesmoConjunto(x.camadas, a.camadas) &&
            (x.entrelinha == null || a.entrelinha == null) &&
            ((x.escala == null && x.fontSize == null) || (a.escala == null && a.fontSize == null)),
        )
        if (fundivel >= 0) {
          ajustes[fundivel] = { ...ajustes[fundivel], ...a, achado: ajustes[fundivel].achado }
          achado.ajustes.push(fundivel)
          continue
        }
      }
      if ((a.camadas ?? []).some((c) => camadasComAjuste.has(c))) {
        adiado = true
        continue
      }
      ;(a.camadas ?? []).forEach((c) => camadasComAjuste.add(c))
      ajustes.push({ ...a, achado: id })
      achado.ajustes.push(ajustes.length - 1)
    }
    if (invalido) {
      achado.observacao = [achado.observacao, 'Um ajuste calculado para este ponto saiu fora dos limites e foi descartado: decida olhando a miniatura.']
        .filter(Boolean)
        .join(' ')
    }
    if (opostos) {
      achado.observacao = [achado.observacao, 'Há propostas opostas para o gradiente desta borda (mais e menos): decida olhando a miniatura.']
        .filter(Boolean)
        .join(' ')
    }
    if (adiado) {
      achado.observacao = [
        achado.observacao,
        'O ajuste deste ponto mexe nas mesmas camadas de um ajuste anterior: aplique aquele, revise de novo e este ponto volta com a medida nova.',
      ]
        .filter(Boolean)
        .join(' ')
    }
    achados.push(achado)
    return achado
  }

  const extensao = (l: Layer) => {
    const m = metricaPorId.get(l.id)
    return m ? { topo: m.glyphTop, base: m.glyphBottom } : { topo: l.position.y, base: l.position.y + l.size.height }
  }
  const topoDe = (ls: Layer[]) => Math.min(...ls.map((l) => extensao(l).topo))
  const baseDe = (ls: Layer[]) => Math.max(...ls.map((l) => extensao(l).base))
  const membrosDo = (l: Layer): Layer[] => blocoDaCamada.get(l.id)?.membros ?? [l]
  /** No mesmo grupo: o texto de baixo e tudo que está no nível dele ou abaixo (com o elemento ao lado). */
  const membrosAPartirDe = (l: Layer): Layer[] =>
    membrosDo(l).filter((m) => {
      if (m.position.y >= l.position.y - 1) return true
      const centro = m.position.y + m.size.height / 2
      return !ehTextoVisivel(m) && centro > l.position.y && centro < l.position.y + l.size.height
    })
  const membrosAte = (l: Layer): Layer[] =>
    membrosDo(l).filter((m) => m.position.y + m.size.height <= l.position.y + l.size.height + 1)

  // ── 1. Fonte não cadastrada ────────────────────────────────────────────
  for (const f of e.fontesAusentes) {
    adicionar({
      regra: 'fonte-nao-carregada',
      severidade: 'problema',
      certeza: 'medida',
      camadas: f.camadas,
      mensagem: `A fonte ${f.familia}${f.peso ? ` no peso ${f.peso}` : ''} não está cadastrada no projeto: a arte sai com outra no lugar, e tamanho, quebra e colisão dessas camadas não são confiáveis até cadastrar o arquivo.`,
      evidencia: { familia: f.familia, peso: f.peso },
    })
  }

  // ── 2. Texto cortado e tinta fora da caixa ─────────────────────────────
  for (const m of e.metricas) {
    const camada = porId.get(m.layerId)
    if (!camada) continue
    if (fonteIncerta.has(m.layerId)) {
      marcarParcial('texto-cortado', 'camada com fonte não cadastrada')
      continue
    }
    const nome = nomeDaCamada(camada)
    const certeza = certezaDe([m.layerId])
    const linhasQueCabem = Math.max(1, Math.floor((m.box.height + 0.001) / m.lineBox))
    // Rich text não trunca por altura no render: medido como texto simples, pareceria cortado.
    const cortadas = m.autoExpand || aproximada.has(m.layerId) ? 0 : m.lineCount - linhasQueCabem
    if (cortadas > 0) {
      adicionar(
        {
          regra: 'texto-cortado',
          severidade: 'problema',
          certeza,
          camadas: [m.layerId],
          mensagem: `"${nome}" tem ${m.lineCount} linhas e a caixa só mostra ${linhasQueCabem}: ${cortadas === 1 ? 'a última linha sai cortada' : `${cortadas} linhas saem cortadas`} na arte.`,
          evidencia: { linhas: m.lineCount, linhasVisiveis: linhasQueCabem },
        },
        [{ tipo: 'caixa', camadas: [m.layerId], alturaAutomatica: true }],
      )
    }

    const util = m.box.width - PAD * 2
    const estouro = m.maxLineWidth - util
    if (estouro > 2) {
      const nova = Math.ceil(m.maxLineWidth + PAD * 2 + 2)
      const dw = nova - m.box.width
      const alinhamento = camada.style?.textAlign ?? 'left'
      const x0 = alinhamento === 'center' ? m.box.x - dw / 2 : alinhamento === 'right' ? m.box.x - dw : m.box.x
      const cabe = x0 >= lim.esquerda - 1 && x0 + nova <= lim.direita + 1
      const escala = util / m.maxLineWidth
      const corpo1080 = m.fontSize / s
      const proposta: Ajuste[] = cabe
        ? [{ tipo: 'caixa', camadas: [m.layerId], largura: nova }]
        : escala >= L.pisoRelativo && corpo1080 * escala >= L.pisoDeFonte1080
          ? [{ tipo: 'fonte', camadas: [m.layerId], escala: arred(escala * 0.99, 3) }]
          : []
      adicionar(
        {
          regra: 'texto-cortado',
          severidade: 'aviso',
          certeza,
          camadas: [m.layerId],
          mensagem: `"${nome}" tem uma linha de ${m.maxLineWidth}px numa caixa de ${Math.round(util)}px: a palavra passa da caixa.`,
          evidencia: { larguraDaLinha: m.maxLineWidth, larguraUtil: Math.round(util) },
          ...(proposta.length ? {} : { observacao: 'Não cabe alargando a caixa nem com a fonte a 80%: encurte a linha.' }),
        },
        proposta,
        `texto-largo:${m.layerId}`,
      )
    }

    const acima = m.box.y - m.glyphTop
    const abaixo = m.glyphBottom - (m.box.y + m.box.height)
    if (Math.max(acima, abaixo) > L.folgaDeTinta && cortadas <= 0) {
      const maior = Math.max(acima, abaixo)
      adicionar({
        regra: 'tinta-fora-da-caixa',
        severidade: 'aviso',
        certeza,
        camadas: [m.layerId],
        mensagem: `${abaixo >= acima ? 'A cedilha ou a perna das letras' : 'O acento'} de "${nome}" passa ${Math.round(maior)}px ${abaixo >= acima ? 'abaixo' : 'acima'} da caixa do texto: no editor o pedaço pode aparecer cortado (o render da arte não recorta a caixa).`,
        evidencia: { pxAcima: arred(acima, 1), pxAbaixo: arred(abaixo, 1), entrelinha: entrelinhaDaCamada(camada) },
        observacao: 'É o recorte do cache do texto no editor, que para na altura da caixa — o conserto é no editor, não nesta peça.',
      })
    }
  }

  // ── 3. Colisão ─────────────────────────────────────────────────────────
  for (const issue of e.geometria.filter((i) => i.tipo === 'colisao')) {
    const [ma, mb] = issue.layerIds.map((id) => metricaPorId.get(id))
    if (!ma || !mb) continue
    if (fonteIncerta.has(ma.layerId) || fonteIncerta.has(mb.layerId)) {
      marcarParcial('colisao', 'camada com fonte não cadastrada')
      continue
    }
    const [cima, baixo] = ma.glyphTop <= mb.glyphTop ? [ma, mb] : [mb, ma]
    const la = porId.get(cima.layerId)!
    const lb = porId.get(baixo.layerId)!
    const grupo = grupoDaCamada(la)
    const mesmoGrupo = !!grupo && grupo === grupoDaCamada(lb)
    const encaixe = (l: Layer) => {
      const v = (l.metadata as { compositor?: { encaixe?: unknown } } | undefined)?.compositor?.encaixe
      return typeof v === 'number' && v > 0 ? v : 0
    }
    const tolerancia = Math.max(4, 0.18 * Math.max(cima.fontSize, baixo.fontSize)) + (mesmoGrupo ? Math.max(encaixe(la), encaixe(lb)) : 0)
    const passo = Math.max(4, Math.ceil(issue.px - tolerancia + 6))
    const desce = mesmoGrupo ? membrosAPartirDe(lb) : membrosDo(lb)
    const sobe = mesmoGrupo ? membrosAte(la) : membrosDo(la)
    let proposta: Ajuste | null = null
    if (baseDe(desce) + passo <= lim.base) proposta = { tipo: 'mover', camadas: desce.map((l) => l.id), dy: passo }
    else if (topoDe(sobe) - passo >= lim.topo) proposta = { tipo: 'mover', camadas: sobe.map((l) => l.id), dy: -passo }
    adicionar(
      {
        regra: 'colisao',
        severidade: 'aviso',
        certeza: certezaDe([la.id, lb.id]),
        camadas: [la.id, lb.id],
        mensagem: `"${nomeDaCamada(la)}" e "${nomeDaCamada(lb)}" se sobrepõem em ${issue.px}px na vertical.`,
        evidencia: { px: issue.px, tolerancia: arred(tolerancia, 1), afastamento: passo },
        ...(proposta ? {} : { observacao: 'Não há espaço para afastar os dois dentro da margem: encurte um dos textos ou reduza a fonte.' }),
      },
      proposta ? [proposta] : [],
    )
  }

  // ── 4. Margem de segurança ─────────────────────────────────────────────
  for (const b of blocos) {
    if (b.textos.some((t) => fonteIncerta.has(t.camada.id))) {
      marcarParcial('fora-da-area-segura', 'bloco com fonte não cadastrada')
      continue
    }
    // A conta mora em `para-dentro.ts` (L3 das linhas-guia): o editor usa a MESMA para o "Trazer para dentro"
    const { lados, dx, dy, maior, vertical, horizontal } = ajusteParaDentro(b.tinta, lim)
    if (lados.length === 0) continue
    const ids = b.textos.map((x) => x.camada.id)
    const nomes = b.textos.map((x) => nomeDaCamada(x.camada)).join(' + ')
    adicionar(
      {
        regra: 'fora-da-area-segura',
        severidade: 'aviso',
        certeza: certezaDe(ids),
        camadas: ids,
        mensagem: `O bloco "${nomes}" invade a margem de segurança (${lados.join(', ')}) em ${Math.round(maior)}px${e.formato === 'story' ? ' — no story, a interface do Instagram cobre essa faixa' : ''}.`,
        evidencia: { px: Math.round(maior), lados: lados.join(',') },
        ...(vertical || horizontal ? { observacao: 'O bloco é maior que a área útil nesse eixo: encurte o texto ou reduza a fonte.' } : {}),
      },
      dx || dy ? [{ tipo: 'mover', camadas: b.membros.map((l) => l.id), ...(dx ? { dx } : {}), ...(dy ? { dy } : {}) }] : [],
      `fora-da-area-segura:${b.chave}`,
    )
  }

  // ── 5. Logo sobre o texto ──────────────────────────────────────────────
  const tintas = [...tintaPorId.values()]
  for (const logo of logosDaPeca(e.camadas)) {
    const r = rectDaCamada(logo)
    const tocados = e.metricas.filter((m) => intersecao(expandir(r, 4), tintaPorId.get(m.layerId)!) > 0)
    if (tocados.length === 0) continue
    const destino = cantoLivreParaLogo(logo, tintas, e.canvas, e.formato)
    adicionar(
      {
        regra: 'logo-sobre-texto',
        severidade: 'aviso',
        certeza: 'medida',
        camadas: [logo.id, ...tocados.map((m) => m.layerId)],
        mensagem: `A logo encosta em "${tocados.map((m) => nomeDaCamada(porId.get(m.layerId))).join('", "')}".`,
        evidencia: { canto: destino?.canto ?? null },
        ...(destino ? {} : { observacao: 'Nenhum canto está livre de texto: mude o bloco de lugar ou tire a logo desta peça.' }),
      },
      destino ? [{ tipo: 'mover', camadas: [logo.id], dx: destino.dx, dy: destino.dy }] : [],
    )
  }

  // 5b. A LEITURA DA LOGO (CP3, 15/10/2026): a medida regional — p10 da diferença de luz pixel a pixel entre os
  //     pixels visíveis (alfa ≥ 128) da logo e o fundo efetivo sem ela, ≥ 45. A média é só diagnóstico: não salva
  //     uma logo cujo p10 falha. Sem ajuste mecânico: a correção (outra variante autorizada, outro canto) é do
  //     compositor com arquétipo; aqui o fluxo humano só avisa (o gate é do CP5). Arquivo que não carregou é
  //     cobertura PARCIAL, dita — nunca vira "sem contraste".
  if (e.leituraDaLogo === null || e.leituraDaLogo === undefined) {
    cobertura['logo-sem-leitura'] = { estado: 'nao-avaliada', motivo: e.motivoSemLeituraDaLogo ?? 'a leitura da logo não foi medida' }
  } else if (e.leituraDaLogo.length === 0 && e.camadas.some((l) => l.visible !== false && grupoDaCamada(l) && (l.type === 'logo' || l.id === 'logo'))) {
    // A logo mora num arranjo (grupo com o texto): fora do contrato do CP3 — "avaliada" com zero pixels mentiria.
    cobertura['logo-sem-leitura'] = { estado: 'nao-avaliada', motivo: 'a logo da peça está num arranjo (grupo com o texto) e não é medida como logo solta' }
  } else {
    const naoMedidas = e.leituraDaLogo.filter((l) => l.estado !== 'medida' || !l.medida)
    for (const l of e.leituraDaLogo) {
      if (l.estado !== 'medida' || !l.medida || l.medida.legivel) continue
      const m = l.medida
      // Camada `image` com "logo" no nome pode ser logo de parceiro ou selo: sem variante cadastrada para trocar, é aviso.
      const camadaDaLogo = porId.get(l.camada)
      const ehLogoDaMarca = !camadaDaLogo || camadaDaLogo.type === 'logo' || camadaDaLogo.id === 'logo'
      adicionar({
        regra: 'logo-sem-leitura',
        severidade: ehLogoDaMarca ? 'problema' : 'aviso',
        certeza: 'medida',
        camadas: [l.camada],
        mensagem: `A logo não lê contra o fundo: ${Math.round(100 * (1 - m.proporcaoAcima45))}% dos pixels dela têm contraste abaixo de ${LIMIAR_DE_CONTRASTE_DA_LOGO} (p10 ${m.contrasteP10}; a média ${m.contrasteMedio} não decide).`,
        evidencia: {
          codigo: 'LOGO_SEM_LEITURA',
          p10: m.contrasteP10,
          media: m.contrasteMedio,
          proporcaoNoLimiar: m.proporcaoAcima45,
          pixelsAvaliados: m.pixelsAvaliados,
          luzDaLogo: m.luzDaLogo,
          luzDoFundo: m.luzDoFundo,
          limiar: LIMIAR_DE_CONTRASTE_DA_LOGO,
          alfaMinimo: ALFA_VISIVEL_DA_LOGO,
          percentil: PERCENTIL_DA_LOGO,
          variante: l.variante.url.startsWith('data:') ? `${l.variante.url.slice(0, 48)}…` : l.variante.url,
          origem: l.variante.origem ?? null,
          x: Math.round(l.posicao.x),
          y: Math.round(l.posicao.y),
          largura: Math.round(l.posicao.width),
          altura: Math.round(l.posicao.height),
        },
        observacao: ehLogoDaMarca
          ? 'Critério regional (CP3): o p10 da diferença |luz da logo − luz do fundo| no mesmo pixel, só nos pixels visíveis. Nenhuma variante é fabricada: troque por uma variante cadastrada que leia, mude a foto ou a posição.'
          : 'Critério regional (CP3) numa imagem com "logo" no nome (parceiro, selo?): mude a foto ou a posição; se for a logo da marca, cadastre-a como logo.',
      })
    }
    if (naoMedidas.length > 0) {
      cobertura['logo-sem-leitura'] = { estado: e.leituraDaLogo.length === naoMedidas.length ? 'nao-avaliada' : 'parcial', motivo: naoMedidas.map((l) => `${l.camada}: ${l.estado === 'indisponivel' ? `o arquivo da logo não carregou (${l.motivo ?? 'sem motivo'})` : l.motivo ?? (l.estado === 'fora-do-contrato' ? 'camada fora do contrato do desenho' : 'sem pixel visível')}`).join('; ') }
    }
  }

  // As pioras de tratamento (CP1): calculadas aqui porque a seção 6 avisa quando propõe reforçar o
  // gradiente que piorou a leitura. Sem `pioras` na entrada, derivam da medida — o estado que ELA
  // descreve (a régua com correção grava nos grupos corrigidos o depois). `null` = régua não rodou.
  const pioras = e.pioras !== undefined ? e.pioras : e.contraste ? tratamentosQuePioraramALeitura(e.contraste) : null

  // ── 6. Leitura sobre a foto (a régua) e gradiente sobrando ─────────────
  if (!e.contraste) {
    cobertura['texto-sem-leitura'] = { estado: 'nao-avaliada', motivo: 'a régua de contraste não rodou' }
    cobertura['gradiente-forte-demais'] = { estado: 'nao-avaliada', motivo: 'a régua de contraste não rodou' }
  } else {
    const [forcaMinima, forcaMaxima] = e.faixaDoGradiente
    const corDeOutroGradiente = (() => {
      const g = e.camadas.find((l) => (l.type === 'gradient' || l.type === 'gradient2') && l.metadata?.tratamentoDeTexto)
      const stops = (g?.style as { gradientStops?: Array<{ color?: string }> } | undefined)?.gradientStops ?? []
      const cor = stops.find((x) => typeof x.color === 'string')?.color
      return cor && /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : '#000000'
    })()
    const sobrandoPorGradiente = new Map<string, { medidas: ContrasteMedido[]; todosSobrando: boolean }>()
    for (const m of e.contraste) {
      const { p98, ok: okAntes, tinta, alvo, sentido } = leituraDecisiva(m)
      // Texto VAZIO não tem tinta: a régua mede a caixa dele, mas não há o que ler nem o que a visão veja. Ele não
      // entra no achado de leitura (nem na severidade de serviço, nem no "não recebeu marca" da cobertura), e
      // grupo só de textos vazios não gera achado (C0-11 da pré-revisão de 400277a5).
      const ids = m.camadas.filter((id) => porId.has(id) && !textoSemConteudo(porId.get(id)!))
      if (ids.length === 0) continue
      const nomes = ids.map((id) => nomeDaCamada(porId.get(id))).join(' + ')
      const servico = ids.some((id) => papelDaCamada(porId.get(id)!) === 'servico')
      const gradiente = m.gradiente ? porId.get(m.gradiente) : undefined
      const rectDoGrupo = uniao(ids.map((id) => rectDaCamada(porId.get(id)!)))!
      const borda: Borda = gradiente ? bordaDaLeitura(gradiente, H) : bordaDoGrupo(rectDoGrupo, null, H)

      if (!okAntes) {
        const propostas: Ajuste[] = []
        let observacao: string | undefined
        if (sentido === 'escuro') {
          observacao = 'Texto escuro sobre fundo escuro: a régua não corrige esse caso — mova o bloco para uma área clara da foto ou mude a cor do texto.'
        } else if (gradiente && m.tintaCorrigida != null) {
          propostas.push({ tipo: 'gradiente', borda, camadas: [gradiente.id], forca: m.tintaCorrigida })
          // CP1: dizia "(teto da marca: X)" mesmo com a força proposta abaixo do teto — a posição e a margem são as reais.
          if (!m.ok)
            observacao = `Mesmo com a força proposta (${m.tintaCorrigida}) a leitura não fecha (p98 ${m.p98ComHalo} contra alvo ${m.alvo}). ${fraseDaForca(diagnosticoDaForca(m.tintaCorrigida, [forcaMinima, forcaMaxima]), borda, true)} Mova o bloco para uma área mais escura da foto ou troque a foto.`
        } else if (!gradiente) {
          const necessaria = m.p98SemHalo > 0 ? (m.p98SemHalo - (alvo - 10)) / m.p98SemHalo / 0.7 : forcaMinima
          const forca = arred(Math.min(forcaMaxima, Math.max(forcaMinima, necessaria)), 3)
          const desenhado = gradienteNaBorda(borda)
          if (desenhado) {
            // Gradiente desenhado à mão (sem a marca do compositor): a régua não o
            // reconhece. Nunca se propõe REDUZI-LO — só reforçar, apontado pelo id.
            if (forca > forcaDaCamada(desenhado) + 0.01) propostas.push({ tipo: 'gradiente', borda, camadas: [desenhado.id], forca })
            else observacao = 'O gradiente desenhado nessa borda já tem a força que a conta pede: mova o bloco para uma área mais escura da foto ou troque a foto.'
          } else {
            const altura = alturaDaFaixa(alcanceDoGrupo(rectDoGrupo, borda, H), H, GRADIENTE_PADRAO)
            propostas.push({ tipo: 'gradiente', borda, forca, altura, cor: corDeOutroGradiente })
          }
        } else {
          // A régua não achou força que feche a leitura. Dizer ONDE a força está de verdade (CP1: dizia "teto"
          // no piso) e, havendo margem, por que mais força deste véu não resolve.
          const forca = diagnosticoDaForca(tinta, [forcaMinima, forcaMaxima])
          const stops = (gradiente.style as { gradientStops?: Array<{ color?: string }> } | undefined)?.gradientStops ?? []
          const corDoVeu = stops.find((x) => typeof x.color === 'string')?.color
          const veuClareia = typeof corDoVeu === 'string' && /^#[0-9a-fA-F]{6}$/.test(corDoVeu) && luzDaCor(corDoVeu) >= m.p98SemHalo
          const porQue =
            forca.margemParaAumentar <= 0
              ? ''
              : tinta <= 0
                ? ' A régua não corrige um gradiente de força 0 (ele não está agindo sobre o texto).'
                : veuClareia
                ? ` Mais força não resolve: o véu (${corDoVeu}, luz ${Math.round(luzDaCor(corDoVeu!))}) é mais claro que o fundo sob o texto (p98 sem véu ${m.p98SemHalo}) — mais força clareia o fundo e piora a leitura.`
                : ' Mesmo assim a régua não acha força deste véu que feche a leitura.'
          observacao = `${fraseDaForca(forca, borda)}${porQue} Mova o bloco para uma área mais escura da foto ou troque a foto.`
        }
        // A proposta reforça um gradiente que, medido com e sem ele, PIOROU a leitura deste grupo: dizer,
        // não esconder (a correção da polaridade é de outro checkpoint).
        const gradientesReforcados = new Set(propostas.flatMap((p) => p.camadas ?? []))
        if (pioras?.some((p) => (p.gradientes ?? (p.gradiente ? [p.gradiente] : [])).some((g) => gradientesReforcados.has(g)) && ids.includes(p.camada))) {
          observacao = [observacao, 'Atenção: este gradiente PIOROU a leitura deste texto (TRATAMENTO_PIOROU_LEITURA, medido) — reforçá-lo tende a piorar mais; confira antes de aplicar.'].filter(Boolean).join(' ')
        }
        const doGrupo = ids.map((id) => porId.get(id)!)
        const sombra = doGrupo.some(temSombraNoGlifo)
        const saturada = doGrupo.some((c) => corSaturada(String(c.style?.color ?? '')))
        const atenuada = sentido === 'claro' && (sombra || saturada)
        if (atenuada) {
          observacao = [
            observacao,
            `A régua não mede ${sombra ? 'a sombra presa ao glifo' : 'o contraste de cor do texto saturado'}, que ajuda a leitura: confira na miniatura.`,
          ]
            .filter(Boolean)
            .join(' ')
        }
        const severidadeBase = servico ? 'problema' : 'aviso'
        const fundo = sentido === 'escuro' ? 'o fundo está escuro demais para o texto escuro' : 'a foto está clara demais sob o texto'
        adicionar(
          {
            regra: 'texto-sem-leitura',
            severidade: atenuada ? (severidadeBase === 'problema' ? 'aviso' : 'sugestao') : severidadeBase,
            certeza: certezaDe(ids),
            camadas: ids,
            mensagem: servico
              ? `O horário/serviço ("${nomes}") não dá leitura: ${fundo} (${sentido === 'escuro' ? 'p2' : 'p98'} ${p98} contra alvo ${alvo}).`
              : `"${nomes}" não dá leitura: ${fundo} (${sentido === 'escuro' ? 'p2' : 'p98'} ${p98} contra alvo ${alvo}).`,
            evidencia: {
              p98,
              alvo,
              forcaAtual: tinta,
              forcaMinima,
              forcaMaxima,
              posicaoDaForca: gradiente ? diagnosticoDaForca(tinta, [forcaMinima, forcaMaxima]).posicao : null,
              forcaProposta: m.tintaCorrigida ?? (propostas[0]?.forca ?? null),
              fechaComAProposta: gradiente ? m.ok : null,
            },
            ...(observacao ? { observacao } : {}),
          },
          propostas,
        )
      }
      // TODO bloco que depende do gradiente entra na conta: um bloco sem leitura
      // na mesma borda impede reduzir a força por causa do vizinho folgado.
      if (gradiente) {
        const registro = sobrandoPorGradiente.get(gradiente.id) ?? { medidas: [], todosSobrando: true }
        registro.medidas.push(m)
        // A sobra se lê no estado ATUAL da peça e em CADA texto do grupo: o
        // grupo é resumido pelo pior texto na força atual, mas o texto que
        // limita a redução pode ser outro (R1 da revisão do merge, 12/09/2026).
        const sobra = leiturasDoGrupo(m).every((t) => t.sentido === 'claro' && t.p98ComHalo < t.alvo - L.gradienteSobra)
        if (!okAntes || !sobra) registro.todosSobrando = false
        sobrandoPorGradiente.set(gradiente.id, registro)
      }
    }
    // Só se reduz a força quando TODOS os blocos daquela borda sobram: um bloco
    // folgado não pode tirar a leitura do vizinho que está no limite.
    for (const [gradienteId, { medidas, todosSobrando }] of sobrandoPorGradiente) {
      if (!todosSobrando) continue
      const gradiente = porId.get(gradienteId)!
      const tinta = medidas[0].tinta
      if (tinta <= forcaMinima + 0.02) continue
      // A força necessária é conferida texto a texto e vale a MAIOR: reduzir
      // pelo representante do grupo tirava a leitura do vizinho.
      const necessarias = medidas.flatMap((m) => leiturasDoGrupo(m)).map((t) => {
        const alvoFolgado = t.alvo - 15
        if (t.p98SemHalo <= alvoFolgado) return forcaMinima
        return (tinta * (t.p98SemHalo - alvoFolgado)) / Math.max(1, t.p98SemHalo - t.p98ComHalo)
      })
      const forca = arred(Math.min(tinta, Math.max(forcaMinima, ...necessarias)), 3)
      if (!reducaoAtingeOMinimo(tinta, forca, L.gradienteReducaoMinima)) continue
      const borda = bordaDaLeitura(gradiente, H)
      const ids = medidas.flatMap((m) => m.camadas).filter((id) => porId.has(id))
      adicionar(
        {
          regra: 'gradiente-forte-demais',
          severidade: 'sugestao',
          certeza: 'medida',
          camadas: [gradienteId, ...ids],
          mensagem: `O gradiente ${borda === 'topo' ? 'do topo' : 'do rodapé'} está mais forte do que o texto precisa (p98 ${Math.max(...medidas.map((m) => m.p98ComHalo))}, alvo ${Math.min(...medidas.map((m) => m.alvo))}): dá para devolver luz à foto.`,
          evidencia: { forcaAtual: tinta, forcaProposta: forca },
        },
        [{ tipo: 'gradiente', borda, camadas: [gradienteId], forca }],
      )
    }
  }

  // ── 6b. O tratamento PIOROU a leitura (CP1, 13/10/2026) ─────────────────
  // Derivado só da régua (com e sem o tratamento, texto a texto, nos dois
  // sentidos). É `problema` medido e a visão NÃO o rebaixa — o benchmark REA viu
  // ferramenta madura "melhorar o contraste" na polaridade errada e dizer que
  // melhorou. Diagnóstico: não propõe cor nem layout.
  if (!pioras) {
    cobertura['tratamento-piorou-leitura'] = { estado: 'nao-avaliada', motivo: 'a régua de contraste não rodou' }
  } else {
    // O que a regra NÃO julgou fica dito na cobertura, nunca lido como "sem piora".
    const foraDaPiora = textosForaDaPiora(e.contraste ?? [])
    const lacunas = [
      foraDaPiora.length > 0 ? `sem a medida com e sem o tratamento (ou cor que não é #hex): ${foraDaPiora.join(', ')}` : null,
      e.camadas.some((l) => (l.type === 'gradient' || l.type === 'gradient2') && l.visible !== false && !ehGradienteDeLeitura(l))
        ? 'gradiente desenhado à mão: só o gradiente de leitura do compositor é medido com e sem'
        : null,
      e.medidasAproximadas.length > 0 ? 'rich text: a polaridade sai da cor base do texto' : null,
    ].filter(Boolean)
    if (lacunas.length > 0) marcarParcial('tratamento-piorou-leitura', lacunas.join('; '))
    for (const p of pioras) {
      const camada = porId.get(p.camada)
      if (!camada || textoSemConteudo(camada)) continue
      const sobe = p.polaridade === 'clara'
      adicionar({
        regra: 'tratamento-piorou-leitura',
        severidade: 'problema',
        certeza: 'medida',
        camadas: [p.camada],
        mensagem: `${(p.gradientes?.length ?? 0) > 1 ? `Os tratamentos de leitura (${p.gradientes.join(', ')}) PIORARAM` : 'O tratamento de leitura PIOROU'} "${nomeDaCamada(camada)}": com ele, o ${p.percentil} do fundo sob o texto ${sobe ? 'claro SUBIU' : 'escuro DESCEU'} de ${p.antes} para ${p.depois} (tolerância ${p.tolerancia}).`,
        evidencia: {
          codigo: p.codigo,
          grupo: p.grupo,
          polaridade: p.polaridade,
          percentil: p.percentil,
          antes: p.antes,
          depois: p.depois,
          tolerancia: p.tolerancia,
          luzDoTexto: p.luzDoTexto,
          gradiente: p.gradiente,
          gradientes: (p.gradientes ?? []).join(', '),
          polaridadePor: p.polaridadePor,
        },
        observacao: 'Medido com e sem o tratamento: a visão não rebaixa este achado.',
      })
    }
  }

  // ── 7. Título grande ───────────────────────────────────────────────────
  const idsDeTitulo = (() => {
    // CP4.2a: fixados pelo executor a partir da página anterior à chamada — sem inferência nova (A.3 do contrato).
    if (e.titulosFixados) {
      const fixados = new Set(e.titulosFixados)
      return e.metricas.filter((m) => fixados.has(m.layerId)).map((m) => m.layerId)
    }
    const porPapel = e.metricas
      .filter((m) => {
        const p = papelDaCamada(porId.get(m.layerId)!)
        return p === 'headline' || p === 'headline2'
      })
      .map((m) => m.layerId)
    if (porPapel.length > 0) return porPapel
    if (e.metricas.length < 2) return []
    const ordenadas = [...e.metricas].sort((a, b) => b.fontSize - a.fontSize)
    return ordenadas[0].fontSize >= ordenadas[1].fontSize * 1.5 ? [ordenadas[0].layerId] : []
  })()
  /** CP4.2a: o maior corpo1080 entre os textos medidos que não são título (o componente `hierarquia` do piso). */
  const maiorSecundario1080De = (_titulo: string): number | null => {
    const secundarios = e.metricas.filter((m) => !idsDeTitulo.includes(m.layerId) && !textoSemConteudo(porId.get(m.layerId)!))
    return secundarios.length > 0 ? Math.max(...secundarios.map((m) => m.fontSize / s)) : null
  }
  if (idsDeTitulo.length === 0) {
    cobertura['titulo-grande'] = { estado: 'nao-avaliada', motivo: 'a peça não tem título identificável' }
  } else if (idsDeTitulo.some((id) => fonteIncerta.has(id))) {
    marcarParcial('titulo-grande', 'título com fonte não cadastrada')
  } else {
    const ms = idsDeTitulo.map((id) => metricaPorId.get(id)!)
    const topo = Math.min(...ms.map((m) => m.glyphTop))
    const base = Math.max(...ms.map((m) => m.glyphBottom))
    const alturaUtil = lim.base - lim.topo
    const fracao = (base - topo) / alturaUtil
    const linhas = ms.reduce((acc, m) => acc + m.lineCount, 0)
    let razao = 0
    let referencia: number | null = null
    for (const m of ms) {
      const ref = e.referencias[m.layerId]
      // CP4.2a (Codex): a referência INFERIDA (fallback 16 de camada do modelo sem corpo) é ausente também aqui —
      // senão um título de 84 sairia "5,25× maior que o modelo" e a sugestão seria recusada pelo executor.
      if (!ref || ref.inferida) continue
      const r = m.fontSize / s / ref.fontSize1080
      if (r > razao) {
        razao = r
        referencia = ref.fontSize1080
      }
    }
    const maiorQueOModelo = razao > L.tituloRelativo
    const grande = fracao > L.tituloAlturaSugestao
    if (maiorQueOModelo || grande) {
      const candidatas: number[] = []
      if (maiorQueOModelo) candidatas.push(1 / razao)
      if (grande) candidatas.push((L.tituloAlturaSugestao * 0.92) / fracao)
      let escala = Math.min(...candidatas)
      const corpoMinimo = Math.min(...ms.map((m) => m.fontSize / s))
      // CP4.2a: a escala sugerida respeita o piso COMPARTILHADO do título (modelo × hierarquia × celular, por título
      // atingido) e os limites do `ajusteSchema` (escala ≥ 0,5): a sugestão da regra 7 nunca produz um corpo que a
      // regra 9 acusaria e a não-piora recusaria.
      const razaoDoPisoCompartilhado = Math.max(
        0,
        ...ms.map((m) => Math.max(0, ...pisosDoTitulo({ referencia: e.referencias[m.layerId], maiorSecundario1080: maiorSecundario1080De(m.layerId), limites: L }).map((p) => p.piso1080)) / (m.fontSize / s)),
      )
      const piso = Math.max(maiorQueOModelo ? 0.5 : L.pisoRelativo, L.pisoDeFonte1080 / corpoMinimo, razaoDoPisoCompartilhado)
      escala = arred(Math.max(escala, Math.min(1, piso)), 3)
      const corpoMaior = Math.round(Math.max(...ms.map((m) => m.fontSize / s)))
      adicionar(
        {
          regra: 'titulo-grande',
          severidade: maiorQueOModelo || fracao > L.tituloAlturaAviso ? 'aviso' : 'sugestao',
          certeza: certezaDe(idsDeTitulo),
          camadas: idsDeTitulo,
          mensagem: `O título ocupa ${pct(fracao)} da altura útil da peça (${linhas} ${linhas === 1 ? 'linha' : 'linhas'}, corpo ${corpoMaior}px)${maiorQueOModelo ? ` e está ${pct(razao - 1)} maior que o modelo (${referencia}px)` : ''}.`,
          evidencia: {
            fracaoDaAlturaUtil: arred(fracao, 3),
            linhas,
            corpo1080: corpoMaior,
            referencia1080: referencia,
            razaoContraOModelo: razao ? arred(razao, 2) : null,
          },
        },
        escala < 0.985 ? [{ tipo: 'fonte', camadas: idsDeTitulo, escala }] : [],
      )
    }
  }

  // ── 8. Entrelinha grande ───────────────────────────────────────────────
  for (const m of e.metricas) {
    if (m.lineCount < 2 || fonteIncerta.has(m.layerId)) continue
    const camada = porId.get(m.layerId)!
    const lh = entrelinhaDaCamada(camada)
    const ref = e.referencias[m.layerId]
    const titulo = idsDeTitulo.includes(m.layerId)
    let alvo: number | null = null
    let severidade: 'aviso' | 'sugestao' = 'sugestao'
    if (ref?.entrelinha != null) {
      if (lh > ref.entrelinha + L.entrelinhaRelativa) {
        alvo = ref.entrelinha
        severidade = 'aviso'
      }
    } else if (lh > (titulo ? L.entrelinhaTituloAbsoluta : L.entrelinhaTextoAbsoluta)) {
      alvo = titulo ? 1.1 : 1.35
    }
    if (alvo == null) continue
    adicionar({
      regra: 'entrelinha-grande',
      severidade,
      certeza: certezaDe([m.layerId]),
      camadas: [m.layerId],
      mensagem: `A entrelinha de "${nomeDaCamada(camada)}" está em ${lh}×${ref?.entrelinha != null ? ` (o modelo usa ${ref.entrelinha}×)` : ''}: as ${m.lineCount} linhas ocupam ${Math.round(m.glyphBottom - m.glyphTop)}px.`,
      evidencia: { entrelinha: lh, referencia: ref?.entrelinha ?? null, linhas: m.lineCount },
    }, [{ tipo: 'fonte', camadas: [m.layerId], entrelinha: alvo }])
  }

  // ── 9. Texto pequeno ───────────────────────────────────────────────────
  // CP4.2a — os TÍTULOS: um achado por componente do piso (modelo, hierarquia, celular), cada um com id estável
  // `texto-pequeno:<camada>:<componente>` e gravidade própria — comparados um a um pela não-piora, sem compensação.
  for (const m of e.metricas) {
    if (!idsDeTitulo.includes(m.layerId) || fonteIncerta.has(m.layerId)) continue
    const camada = porId.get(m.layerId)!
    const corpo1080 = m.fontSize / s
    const ref = e.referencias[m.layerId]
    if (!ref || ref.inferida) marcarParcial('texto-pequeno', `título "${nomeDaCamada(camada)}" sem referência de corpo no modelo (só a hierarquia e o piso do celular valem)`)
    const maiorSecundario1080 = maiorSecundario1080De(m.layerId)
    const pisos = pisosDoTitulo({ referencia: ref, maiorSecundario1080, limites: L })
    const abaixo = pisos.filter((p) => corpo1080 < p.piso1080 - 0.5)
    const pisoMaior = Math.max(...abaixo.map((p) => p.piso1080), 0)
    abaixo.forEach((p, i) => {
      const porque =
        p.componente === 'modelo'
          ? `o modelo usa ${Math.round(ref!.fontSize1080)}px e o piso é ${Math.round(p.piso1080)}px`
          : p.componente === 'hierarquia'
            ? `o maior texto secundário tem ${Math.round(maiorSecundario1080!)}px e o título não pode ficar menor`
            : `abaixo do piso de leitura no celular (${Math.round(p.piso1080)}px)`
      adicionar(
        {
          regra: 'texto-pequeno',
          severidade: 'aviso',
          certeza: certezaDe([m.layerId]),
          camadas: [m.layerId],
          mensagem: `O título "${nomeDaCamada(camada)}" está com ${Math.round(corpo1080)}px: ${porque}.`,
          evidencia: {
            corpo1080: Math.round(corpo1080),
            piso1080: Math.round(p.piso1080),
            componente: p.componente,
            referencia1080: ref && !ref.inferida ? Math.round(ref.fontSize1080) : null,
            maiorSecundario1080: maiorSecundario1080 !== null ? Math.round(maiorSecundario1080) : null,
          },
        },
        // Uma correção só, no primeiro achado do título: subir ao maior dos pisos cruzados.
        i === 0 ? [{ tipo: 'fonte', camadas: [m.layerId], fontSize: Math.ceil(pisoMaior * s) }] : [],
        `texto-pequeno:${m.layerId}:${p.componente}`,
      )
    })
  }
  for (const m of e.metricas) {
    if (idsDeTitulo.includes(m.layerId) || fonteIncerta.has(m.layerId)) continue
    const camada = porId.get(m.layerId)!
    const corpo1080 = m.fontSize / s
    const ref = e.referencias[m.layerId]?.fontSize1080
    // Modelo que já nasceu miúdo é desenho da equipe: só o recuo de 80% conta.
    const piso = ref ? (ref >= L.pisoDeFonte1080 ? Math.max(L.pisoDeFonte1080, L.pisoRelativo * ref) : L.pisoRelativo * ref) : L.pisoDeFonte1080
    if (corpo1080 >= piso - 0.5) continue
    const servico = papelDaCamada(camada) === 'servico'
    adicionar(
      {
        regra: 'texto-pequeno',
        severidade: servico ? 'aviso' : 'sugestao',
        certeza: certezaDe([m.layerId]),
        camadas: [m.layerId],
        mensagem: `"${nomeDaCamada(camada)}" está com ${Math.round(corpo1080)}px${ref ? ` (o modelo usa ${Math.round(ref)}px)` : ''}: abaixo do piso de leitura no celular (${Math.round(piso)}px).`,
        evidencia: { corpo1080: Math.round(corpo1080), piso1080: Math.round(piso), referencia1080: ref ? Math.round(ref) : null },
      },
      [{ tipo: 'fonte', camadas: [m.layerId], fontSize: Math.ceil(piso * s) }],
    )
  }

  // ── 10. Palavra órfã ───────────────────────────────────────────────────
  for (const m of e.metricas) {
    if (!m.linhas || m.linhas.length < 2 || fonteIncerta.has(m.layerId)) continue
    const camada = porId.get(m.layerId)!
    const ultima = m.linhas[m.linhas.length - 1]
    const palavras = ultima.texto.trim().split(/\s+/).filter(Boolean)
    if (palavras.length !== 1 || ultima.largura >= L.orfaFracao * m.maxLineWidth) continue
    // A última linha escrita assim pela copy é decisão de quem escreveu.
    const linhasDaCopy = String(camada.content ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
    if (linhasDaCopy[linhasDaCopy.length - 1] === ultima.texto.trim()) continue
    const nova = Math.ceil(m.box.width + ultima.largura + 24)
    const dw = nova - m.box.width
    const alinhamento = camada.style?.textAlign ?? 'left'
    const x0 = alinhamento === 'center' ? m.box.x - dw / 2 : alinhamento === 'right' ? m.box.x - dw : m.box.x
    const cabe = x0 >= lim.esquerda - 1 && x0 + nova <= lim.direita + 1
    adicionar(
      {
        regra: 'palavra-orfa',
        severidade: 'sugestao',
        certeza: aproximada.has(m.layerId) ? 'estimada' : 'medida',
        camadas: [m.layerId],
        mensagem: `"${ultima.texto.trim()}" ficou sozinha na última linha de "${nomeDaCamada(camada)}".`,
        evidencia: { palavra: ultima.texto.trim(), largura: ultima.largura, linhaMaisLarga: m.maxLineWidth },
        ...(cabe ? {} : { observacao: 'A caixa não pode alargar dentro da margem: quebre a linha à mão na copy.' }),
      },
      cabe ? [{ tipo: 'caixa', camadas: [m.layerId], largura: nova }] : [],
    )
  }

  // ── 11. Texto sobre o assunto ──────────────────────────────────────────
  if (!e.assunto) {
    cobertura['texto-sobre-assunto'] = { estado: 'nao-avaliada', motivo: e.motivoSemAssunto ?? 'sem foto ou sem assunto localizado', ...(e.assuntoNaoSeAplica ? { naoSeAplica: true as const } : {}) }
  } else {
    const assunto = e.assunto
    for (const b of blocos) {
      const inter = intersecao(b.tinta, assunto.rect)
      if (inter <= 0) continue
      const cobertura = Math.max(inter / Math.max(1, areaDe(assunto.rect)), inter / Math.max(1, areaDe(b.tinta)))
      if (cobertura <= (assunto.origem === 'catalogo' ? L.coberturaDoAssunto : L.coberturaDoAssuntoEstimado)) continue
      const ids = b.textos.map((t) => t.camada.id)
      const oposta = b.tinta.y + b.tinta.height / 2 < H / 2 ? 'rodapé' : 'topo'
      adicionar(
        {
          regra: 'texto-sobre-assunto',
          severidade: assunto.origem === 'catalogo' ? 'aviso' : 'sugestao',
          certeza: assunto.origem === 'catalogo' ? 'medida' : 'estimada',
          camadas: ids,
          mensagem: `O bloco "${b.textos.map((t) => nomeDaCamada(t.camada)).join(' + ')}" cobre ${pct(cobertura)} do assunto da foto${assunto.origem === 'estimado' ? ' (assunto estimado pela textura da foto)' : ''}.`,
          evidencia: { cobertura: arred(cobertura, 2), origemDoAssunto: assunto.origem },
          observacao: `Mudar o bloco de borda é recompor a peça: compor-arte com a mesma copy e preferencias.ancora "${oposta === 'topo' ? 'topo' : 'rodape'}", ou outra foto.`,
        },
        [],
        `texto-sobre-assunto:${b.chave}`,
      )
    }
  }

  // ── 12. O que a visão viu ──────────────────────────────────────────────
  if (e.vistos) {
    const faixa = e.faixaDoGradiente
    let leiturasDesmentidas = 0
    let cortesDesmentidos = 0
    for (const v of e.vistos) {
      const olhar = { problema: v.problema, evidencia: v.evidencia, confianca: v.confianca }
      // "Sem leitura" onde a régua mede FOLGA clara (além da tolerância) é a
      // visão contra a medida — e nesse caso a medida vence. No limite do alvo,
      // a visão fica (é justamente onde o número não decide).
      // Rich text fica fora: a régua mede a cor BASE, e o trecho destacado (a
      // palavra vermelha sobre a carne) é justamente o que ela não vê.
      if (
        (v.problema === 'texto-sem-leitura' || v.problema === 'gradiente-claro-demais') &&
        v.marca &&
        e.contraste &&
        !v.marca.camadas.some((id) => aproximada.has(id))
      ) {
        const medida = e.contraste.find((c) => v.marca!.camadas.some((id) => c.camadas.includes(id)))
        if (medida) {
          const { p98, ok, alvo, sentido } = leituraDecisiva(medida)
          const folga = sentido === 'claro' ? alvo - p98 : p98 - alvo
          if (ok && folga >= 12) {
            leiturasDesmentidas++
            continue
          }
        }
      }
      const camadasDaMarca = v.marca?.camadas ?? []
      const irmas = REGRAS_DO_PROBLEMA[v.problema] ?? []
      // TODOS os irmãos recebem a confirmação, nunca só o primeiro: item da peça
      // inteira (sem marca) confirma cada leitura medida a que se aplica — com
      // `find`, o horário ficava sem ela e era rebaixado dizendo que a visão não
      // viu problema, logo depois de ela dizer que faltava sombra (C0-02).
      const irmaos = achados.filter(
        (a) => irmas.includes(a.regra) && (camadasDaMarca.length === 0 || a.camadas.some((c) => camadasDaMarca.includes(c))),
      )
      if (irmaos.length > 0) {
        for (const irmao of irmaos) irmao.visao = olhar
        continue
      }
      // Corte de linha ou de letra a medida vê EXATO (linha truncada, tinta além
      // da caixa, o render não recorta glifo). Sem ela, a visão leu desenho da
      // fonte ou a borda da marca como corte — foi o "Q" do Seu Quinto e o "DA
      // MESA" do Bacana, os dois com confiança alta, em 11/09/2026. Rich text
      // fica: ali a largura medida é aproximada.
      if (
        (v.problema === 'texto-cortado' || v.problema === 'acento-ou-cedilha-cortado') &&
        !(v.marca?.camadas ?? []).some((id) => aproximada.has(id))
      ) {
        cortesDesmentidos++
        continue
      }
      const propostas = ajustesDaCorrecao(v)
      const contradiz = contradicaoDaMedida(v)
      // Posição e respiro são GOSTO: nem com confiança alta passam de sugestão.
      // Na calibração de 11/09 o respiro desequilibrado saiu aviso em 7 de 20
      // peças boas — aviso que ninguém vai aplicar ensina a ignorar os outros.
      const deGosto = (['posicao-estranha', 'respiro-desequilibrado', 'desalinhado'] as string[]).includes(v.problema)
      adicionar(
        {
          regra: 'visao',
          severidade: v.confianca === 'alta' && !deGosto ? 'aviso' : 'sugestao',
          certeza: 'visao',
          camadas: camadasDaMarca,
          mensagem: `A visão viu ${ROTULO_DO_PROBLEMA[v.problema]}${v.marca ? ` em ${v.marca.marca} ("${v.marca.descricao}")` : ' na peça'}: ${v.evidencia}`,
          evidencia: { problema: v.problema, marca: v.marca?.marca ?? null, correcao: v.correcao, intensidade: v.intensidade },
          visao: olhar,
          ...([contradiz, v.confianca === 'media' ? 'Confiança média: confira na miniatura antes de aplicar.' : null].filter(Boolean).length
            ? { observacao: [contradiz, v.confianca === 'media' ? 'Confiança média: confira na miniatura antes de aplicar.' : null].filter(Boolean).join(' ') }
            : {}),
        },
        propostas,
        `visao-${v.problema}:${v.marca?.marca ?? 'peca'}`,
      )
    }

    /** A correção que a visão escolheu, com o NÚMERO calculado aqui a partir das medidas. */
    function ajustesDaCorrecao(v: AchadoVisto): Ajuste[] {
      if (!v.correcao) return []
      const i = { pouco: 0, medio: 1, muito: 2 }[v.intensidade]
      const marca = v.marca
      const textos = marca?.tipo === 'texto' ? marca.camadas.filter((id) => metricaPorId.has(id)) : []
      const bloco = textos.length ? blocoDaCamada.get(textos[0]) : undefined
      switch (v.correcao) {
        case 'reduzir-fonte':
        case 'aumentar-fonte': {
          if (!textos.length) return []
          const reduzir = v.correcao === 'reduzir-fonte'
          let escala = reduzir ? [0.93, 0.87, 0.8][i] : [1.07, 1.14, 1.22][i]
          const ms = textos.map((id) => metricaPorId.get(id)!)
          if (reduzir) {
            // O piso nunca vira aumento: texto já no piso fica sem ajuste.
            const piso = Math.max(...ms.map((m) => L.pisoDeFonte1080 / (m.fontSize / s)))
            if (piso >= 0.985) return []
            escala = Math.max(escala, piso)
          } else {
            const teto = Math.min(2, ...ms.map((m) => (m.box.width - PAD * 2) / Math.max(1, m.maxLineWidth)))
            if (teto <= 1.015) return []
            escala = Math.min(escala, teto)
          }
          escala = arred(escala, 3)
          if (reduzir ? escala >= 0.985 : escala <= 1.015) return []
          return [{ tipo: 'fonte', camadas: textos, escala }]
        }
        case 'reduzir-entrelinha':
        case 'aumentar-entrelinha': {
          // Por camada: uma entrelinha só para estilos diferentes aumentaria a de
          // quem já estava apertado quando o pedido é reduzir.
          const passo = [0.05, 0.1, 0.18][i]
          const reduzir = v.correcao === 'reduzir-entrelinha'
          return textos
            .filter((id) => metricaPorId.get(id)!.lineCount >= 2)
            .map((id) => {
              const atual = entrelinhaDaCamada(porId.get(id)!)
              return { id, atual, nova: arred(reduzir ? Math.max(0.85, atual - passo) : Math.min(2, atual + passo), 2) }
            })
            .filter((x) => (reduzir ? x.nova < x.atual - 0.005 : x.nova > x.atual + 0.005))
            .map((x) => ({ tipo: 'fonte', camadas: [x.id], entrelinha: x.nova }) as Ajuste)
        }
        case 'subir':
        case 'descer': {
          if (!bloco) return []
          const passo = H * [0.015, 0.035, 0.07][i]
          const pedido = v.correcao === 'subir' ? -passo : passo
          const dy = Math.round(Math.max(lim.topo - bloco.tinta.y, Math.min(lim.base - (bloco.tinta.y + bloco.tinta.height), pedido)))
          return Math.abs(dy) < 2 ? [] : [{ tipo: 'mover', camadas: bloco.membros.map((l) => l.id), dy }]
        }
        case 'mover-esquerda':
        case 'mover-direita': {
          if (!bloco) return []
          const passo = W * [0.02, 0.05, 0.1][i]
          const pedido = v.correcao === 'mover-esquerda' ? -passo : passo
          const dx = Math.round(Math.max(lim.esquerda - bloco.tinta.x, Math.min(lim.direita - (bloco.tinta.x + bloco.tinta.width), pedido)))
          return Math.abs(dx) < 2 ? [] : [{ tipo: 'mover', camadas: bloco.membros.map((l) => l.id), dx }]
        }
        case 'mais-gradiente':
        case 'menos-gradiente': {
          const gradientes = e.camadas.filter((l) => (l.type === 'gradient' || l.type === 'gradient2') && l.visible !== false && (l.size?.width ?? 0) >= W * 0.9)
          const borda: Borda | null = bloco
            ? bordaDoGrupo(bloco.tinta, null, H)
            : gradientes.length
              ? bordaDaLeitura(
                  [...gradientes].sort(
                    (a, b) => ((b.metadata?.forca as number | undefined) ?? 0) - ((a.metadata?.forca as number | undefined) ?? 0),
                  )[0],
                  H,
                )
              : null
          if (!borda) return []
          const gradiente = gradientes.find((l) => bordaDaLeitura(l, H) === borda)
          const atual = gradiente ? forcaDaCamada(gradiente) : 0
          const passo = [0.08, 0.15, 0.25][i]
          if (v.correcao === 'menos-gradiente') {
            if (!gradiente || atual <= faixa[0] + 0.01) return []
            // Gradiente desenhado À MÃO pela equipe nunca recebe proposta de
            // redução automática — só o de LEITURA (com a marca do compositor).
            // A proteção por borda abaixo olha a falta de leitura; esta olha a
            // ORIGEM, e vale mesmo com a régua satisfeita: o apontamento da
            // visão fica como observação (REV-F03 da revisão FINAL do Codex,
            // 12/09/2026; regra registrada no CLAUDE.md).
            if (!ehGradienteDeLeitura(gradiente)) return []
            // Tirar gradiente onde a régua mede falta de leitura pioraria o texto.
            // Vale pela borda, não só pelo id: a régua só associa o gradiente DE
            // LEITURA (com a marca do compositor); um gradiente desenhado à mão
            // fica com `gradiente: null` na medida, e o texto sem leitura naquela
            // borda protegia nada. Achado REV-03 da revisão do Codex (12/09/2026).
            const semLeituraNaBorda = (e.contraste ?? []).some((c) => {
              if (leituraDecisiva(c).ok) return false
              if (c.gradiente === gradiente.id) return true
              const rects = c.camadas.map((id) => porId.get(id)).filter((l): l is Layer => !!l).map(rectDaCamada)
              const rect = uniao(rects)
              return !!rect && bordaDoGrupo(rect, null, H) === borda
            })
            if (semLeituraNaBorda) return []
            /**
             * A redução pedida pela visão respeita a NECESSIDADE de cada texto
             * daquela borda, com a mesma conta da régua (seção 6): um texto no
             * limite não perde a leitura porque outro sobra ou porque a visão
             * achou a faixa pesada (REV-FINAL-02 da revisão FINAL do Codex,
             * 12/09/2026). Redução menor que o mínimo vira só observação.
             */
            const medidasDaBorda = (e.contraste ?? []).filter((c) => {
              if (c.gradiente === gradiente.id) return true
              const rects = c.camadas.map((id) => porId.get(id)).filter((l): l is Layer => !!l).map(rectDaCamada)
              const rect = uniao(rects)
              return !!rect && bordaDoGrupo(rect, null, H) === borda
            })
            const leiturasDaBorda = medidasDaBorda.flatMap((m) => leiturasDoGrupo(m))
            /**
             * A conta abaixo é a do texto CLARO (o gradiente escurece; sem ele o
             * fundo fica claro demais). Para texto ESCURO a desigualdade é a
             * inversa — "fundo sem gradiente abaixo de alvo − 15" é justamente
             * FALTA de luz —, e a mesma conta propunha tirar o clareamento de
             * que o texto depende (REV-127-02 da revisão FINAL do Codex,
             * 12/09/2026). Com texto escuro na borda, a redução fica como
             * observação: quem decide é gente.
             */
            if (leiturasDaBorda.some((t) => t.sentido === 'escuro')) return []
            const necessarias = leiturasDaBorda.map((t) => {
              const alvoFolgado = t.alvo - 15
              if (t.p98SemHalo <= alvoFolgado) return faixa[0]
              return (atual * (t.p98SemHalo - alvoFolgado)) / Math.max(1, t.p98SemHalo - t.p98ComHalo)
            })
            const forcaSegura = arred(Math.min(atual, Math.max(faixa[0], atual - passo, ...necessarias)), 3)
            if (!reducaoAtingeOMinimo(atual, forcaSegura, L.gradienteReducaoMinima)) return []
            return [{ tipo: 'gradiente', borda, camadas: [gradiente.id], forca: forcaSegura }]
          }
          const medida = e.contraste?.find((c) => textos.some((id) => c.camadas.includes(id)))
          const forca = arred(Math.min(faixa[1], Math.max(medida?.tintaCorrigida ?? 0, atual + passo, gradiente ? 0 : faixa[0])), 3)
          if (gradiente && forca <= atual + 0.01) return []
          if (gradiente) return [{ tipo: 'gradiente', borda, camadas: [gradiente.id], forca }]
          const alvo = bloco?.tinta ?? { x: 0, y: borda === 'topo' ? 0 : H - 1, width: W, height: 1 }
          return [{ tipo: 'gradiente', borda, forca, altura: alturaDaFaixa(alcanceDoGrupo(alvo, borda, H), H, GRADIENTE_PADRAO) }]
        }
        case 'mover-logo': {
          const logo = marca?.tipo === 'logo' ? porId.get(marca.camadas[0]) : logosDaPeca(e.camadas)[0]
          if (!logo) return []
          const destino = cantoLivreParaLogo(logo, tintas, e.canvas, e.formato)
          return destino ? [{ tipo: 'mover', camadas: [logo.id], dx: destino.dx, dy: destino.dy }] : []
        }
        case 'aumentar-caixa': {
          const cortadas = textos.filter((id) => {
            const m = metricaPorId.get(id)!
            return !m.autoExpand && !aproximada.has(id) && m.lineCount > Math.max(1, Math.floor((m.box.height + 0.001) / m.lineBox))
          })
          return cortadas.map((id) => ({ tipo: 'caixa', camadas: [id], alturaAutomatica: true }) as Ajuste)
        }
        default:
          return []
      }
    }

    /** Quando a medida diz o contrário do que a visão viu, os dois ficam — e a pessoa confere na miniatura. */
    function contradicaoDaMedida(v: AchadoVisto): string | null {
      if (
        v.problema === 'gradiente-escuro-demais' &&
        e.contraste?.some(
          (c) => !leituraDecisiva(c).ok && (!v.marca || v.marca.camadas.some((id) => c.camadas.includes(id))),
        )
      ) {
        return 'A régua mede falta de leitura nesse texto: tirar gradiente pioraria a leitura — o conserto é mudar o bloco de lugar ou a foto.'
      }
      if (v.problema !== 'texto-sem-leitura' || !e.contraste || !v.marca) return null
      const medida = e.contraste.find((c) => v.marca!.camadas.some((id) => c.camadas.includes(id)))
      if (!medida) return null
      const decisiva = leituraDecisiva(medida)
      if (!decisiva.ok) return null
      return `A régua mediu leitura dentro do alvo (p98 ${decisiva.p98}, alvo ${decisiva.alvo}): confira na miniatura.`
    }

    // A visão ARBITRA o que a medida aproxima. Leitura que a régua acusou e a
    // visão, olhando a peça, não viu vira sugestão; assunto só estimado pela
    // textura que ela não confirmou é ruído e sai.
    // A cobertura é decidida ANTES do rebaixamento (C0-01): só se rebaixa pelo
    // olhar o achado cujas camadas a visão recebeu marcadas. O que ficou sem
    // marca continua medido e deixa a visão parcial.
    const visaoTruncados = Math.max(0, e.visaoTruncados ?? 0)
    const visaoParcial = e.visaoConclusiva === false || visaoTruncados > 0
    const camadasMarcadas = new Set(e.visaoCamadasMarcadas ?? blocos.flatMap((b) => b.textos.map((t) => t.camada.id)))
    const naoVistas = new Set<string>()
    for (let i = achados.length - 1; i >= 0; i--) {
      const a = achados[i]
      if (a.visao) continue
      if (a.regra !== 'texto-sem-leitura' && !(a.regra === 'texto-sobre-assunto' && a.certeza === 'estimada')) continue
      const semMarca = a.camadas.filter((id) => !camadasMarcadas.has(id))
      if (a.camadas.length === 0 || semMarca.length > 0) {
        for (const id of semMarca) naoVistas.add(id)
        continue
      }
      if (visaoParcial) continue
      if (a.regra === 'texto-sem-leitura') {
        a.severidade = 'sugestao'
        a.observacao = [a.observacao, 'A visão olhou a peça e não viu problema de leitura neste bloco: aplique só se concordar.'].filter(Boolean).join(' ')
      } else if (a.regra === 'texto-sobre-assunto' && a.certeza === 'estimada') {
        achados.splice(i, 1)
      }
    }

    const desmentidos = [
      leiturasDesmentidas ? `${leiturasDesmentidas} de leitura (a régua mediu folga clara)` : null,
      cortesDesmentidos ? `${cortesDesmentidos} de corte (a medida não acha linha nem letra cortada)` : null,
    ].filter(Boolean)
    const motivos = [
      e.motivoSemMedida ? 'a medição dos textos falhou e a visão não recebeu marca de nenhum texto, então nada medido foi rebaixado por ela' : null,
      naoVistas.size > 0
        ? `a visão não recebeu marca de ${[...naoVistas].join(', ')}, então o que a medida achou ${naoVistas.size === 1 ? 'nesse texto' : 'nesses textos'} não foi rebaixado por ela`
        : null,
      e.visaoConclusiva === false ? 'parte da resposta da visão não pôde ser lida (item sem marca válida ou incompleto), então nada foi rebaixado por ela' : null,
      visaoTruncados > 0
        ? `a visão devolveu mais achados do que o teto aceita e ${visaoTruncados} ${visaoTruncados === 1 ? 'ficou' : 'ficaram'} de fora sem ser ${visaoTruncados === 1 ? 'examinado' : 'examinados'}, então nada foi rebaixado por ela`
        : null,
      desmentidos.length ? `apontamentos da visão descartados pela medida: ${desmentidos.join('; ')}` : null,
    ].filter(Boolean)
    cobertura.visao = {
      estado: visaoParcial || naoVistas.size > 0 || e.motivoSemMedida ? 'parcial' : 'avaliada',
      ...(motivos.length ? { motivo: `${motivos.join('. ')}.` } : {}),
    }
  } else {
    cobertura.visao = { estado: 'nao-avaliada', motivo: e.motivoSemVisao ?? 'a visão não rodou' }
  }

  for (const regra of REGRAS_DA_REVISAO) if (!cobertura[regra]) cobertura[regra] = { estado: 'avaliada' }
  // A conferência das fontes que falhou não é "nenhuma fonte falta" (Codex R2 do CP4): a regra fica não avaliada, com
  // o motivo — e o executor da não-piora recusa como NÃO MEDIDO.
  if (e.motivoSemFontes) cobertura['fonte-nao-carregada'] = { estado: 'nao-avaliada', motivo: e.motivoSemFontes }
  if (e.motivoSemMedida) {
    // Sem métricas só valem as regras que não medem texto: fonte ausente (do
    // registro), a régua (do render) e a visão.
    for (const regra of REGRAS_DA_REVISAO) {
      if (regra === 'fonte-nao-carregada' || regra === 'texto-sem-leitura' || regra === 'gradiente-forte-demais' || regra === 'tratamento-piorou-leitura' || regra === 'logo-sem-leitura' || regra === 'visao') continue
      cobertura[regra] = { estado: 'nao-avaliada', motivo: e.motivoSemMedida }
    }
  }
  if (e.medidasAproximadas.length > 0) {
    for (const regra of ['texto-cortado', 'colisao', 'palavra-orfa'] as RegraDaRevisao[]) {
      if (cobertura[regra]?.estado === 'avaliada') cobertura[regra] = { estado: 'parcial', motivo: 'rich text medido como texto simples (a largura dos trechos destacados é aproximada)' }
    }
  }  if (e.textosSemMetrica && e.textosSemMetrica.length > 0) {
    // Texto visível que o medidor não mede não foi examinado por NENHUMA regra
    // de geometria — e não recebeu marca para a visão. Cobertura parcial, com
    // os ids, em tudo que depende da métrica (REV-127-03).
    // O ID vai SEMPRE (dois textos podem dividir nome e papel); o nome vai
    // junto quando difere. Regra já parcial (rich text aproximado) GANHA este
    // motivo em vez de perdê-lo (REV-4B-02).
    const rotulo = (id: string) => { const l = porId.get(id); const nome = l ? nomeDaCamada(l) : null; return nome && nome !== id ? `${id} ("${nome}")` : id }
    const motivo = `texto(s) sem métrica — curvo, fitty ou auto-resize, que o medidor não mede: ${e.textosSemMetrica.map(rotulo).join(', ')}; as regras de geometria não os examinaram e a visão não recebeu marca deles`
    for (const regra of REGRAS_DA_REVISAO) {
      if (regra === 'fonte-nao-carregada' || regra === 'texto-sem-leitura' || regra === 'gradiente-forte-demais' || regra === 'tratamento-piorou-leitura' || regra === 'logo-sem-leitura') continue
      const atual = cobertura[regra]
      if (atual?.estado === 'avaliada') cobertura[regra] = { estado: 'parcial', motivo }
      else if (atual?.estado === 'parcial') cobertura[regra] = { estado: 'parcial', motivo: [atual.motivo, motivo].filter(Boolean).join('; ') }
    }
  }


  const ordenados = achados
    .map((a, i) => ({ a, i }))
    .sort((x, y) => ORDEM_DE_SEVERIDADE[x.a.severidade] - ORDEM_DE_SEVERIDADE[y.a.severidade] || x.i - y.i)
    .map(({ a }) => a)

  return {
    versaoDasRegras: VERSAO_DAS_REGRAS,
    achados: ordenados,
    ajustes,
    cobertura,
    resumo: resumir(ordenados, ajustes, cobertura),
  }
}

/**
 * O resumo nunca diz "nada a corrigir" sobre o que não foi olhado: visão que
 * não rodou ou não concluiu, e regra medida só em parte, entram na frase. Revisão
 * sem achado não é aprovação quando a cobertura tem buraco.
 */
function resumir(
  achados: AchadoDaRevisao[],
  ajustes: Ajuste[],
  cobertura: Partial<Record<RegraDaRevisao, { estado: string; motivo?: string }>>,
): string {
  const lacunas = (Object.entries(cobertura) as Array<[string, { estado: string }]>)
    .filter(([, c]) => c.estado !== 'avaliada')
    .map(([regra, c]) =>
      regra === 'visao'
        ? c.estado === 'parcial'
          ? 'a visão concluiu só em parte'
          : 'a visão não rodou'
        : `${regra} (${c.estado === 'parcial' ? 'em parte' : 'não avaliada'})`,
    )
  const cauda = lacunas.length ? ` Sem cobertura completa: ${lacunas.join(', ')}.` : ''
  if (achados.length === 0) {
    return lacunas.length
      ? `Nenhum problema no que foi avaliado.${cauda}`
      : 'Nada a corrigir: as medidas e o olhar sobre a peça não acharam problema.'
  }
  const conta = (sev: AchadoDaRevisao['severidade']) => achados.filter((a) => a.severidade === sev).length
  const partes = (
    [
      [conta('problema'), 'problema', 'problemas'],
      [conta('aviso'), 'aviso', 'avisos'],
      [conta('sugestao'), 'sugestão', 'sugestões'],
    ] as Array<[number, string, string]>
  )
    .filter(([q]) => q > 0)
    .map(([q, um, varios]) => `${q} ${q === 1 ? um : varios}`)
  const final = ajustes.length
    ? ` e ${ajustes.length} ${ajustes.length === 1 ? 'ajuste pronto' : 'ajustes prontos'} para ajustar-arte`
    : ', nenhum com ajuste mecânico'
  return `${achados.length} ${achados.length === 1 ? 'ponto' : 'pontos'} na peça (${partes.join(', ')})${final}.${cauda}`
}
