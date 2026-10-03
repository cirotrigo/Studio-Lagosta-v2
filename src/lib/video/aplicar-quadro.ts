/**
 * O aplicador do quadro (Decisão 9 do plano de 03/10/2026): escreve o efeito
 * de tempo de cada camada — o movimento da foto e a transição entre clipes —
 * no GRUPO DE EFEITO que envolve o nó editável, nunca no nó. Um só para a
 * prévia (motor da página) e para o export (konva-video-export), para os dois
 * desenharem o mesmo quadro.
 *
 * Estrutura, montada pelo KonvaLayerFactory:
 *   Group.efeito-de-tempo (camadaId)   ← visível? opacidade e deslocamento da
 *                                        transição
 *     nó editável (KonvaImage, o Group da máscara, o vídeo)
 *       [foto em movimento] Group (recorte preso à caixa: máscara ∩ cantos)
 *         Group.efeito-movimento       ← escala em torno do centro + deslize,
 *                                        no espaço da própria caixa
 *           KonvaImage
 *       [foto em movimento] a borda, presa à caixa
 *
 * O React só põe nome e `camadaId` nesses grupos, então um re-render não
 * desfaz o quadro; os handlers de arraste e de transformação continuam lendo e
 * gravando o nó editável. A VISIBILIDADE dos clipes também mora aqui (é ela
 * que mostra os dois clipes da junção durante a transição).
 *
 * Na prévia o efeito fica SUSPENSO (identidade) só durante o GESTO: do toque
 * na camada (ou numa alça do Transformer que a segura) até soltar, e enquanto
 * o nó não bate com o design (logo depois de um arraste, antes de o React
 * gravar). Selecionada e parada, a camada mostra o efeito do instante, como o
 * export. A suspensão do toque acontece ANTES de o Konva tratar o pointerdown
 * — senão a posição gravada levaria o efeito junto; na alça, o Konva ainda acha
 * a alça pelo canvas de clique do quadro anterior e mede o arraste a partir da
 * posição já suspensa. A visibilidade nunca é suspensa: é a linha do tempo,
 * não um efeito.
 */

import type Konva from 'konva'
import { ehClipe, paginaEVideo } from './camadas-de-video'
import { linhaDoTempo, quadroDosClipes, type QuadroDoClipe } from './linha-do-tempo'
import { ehMovimento, progressoDoMovimento, quadroDoMovimento } from './movimento'

export const GRUPO_DE_EFEITO = 'efeito-de-tempo'
export const GRUPO_DE_MOVIMENTO = 'efeito-movimento'

type CamadaDoQuadro = {
  id: string
  type?: string
  visible?: boolean
  order?: number
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  rotation?: number
  movimento?: unknown
  [k: string]: unknown
}

type TrilhaDoQuadro = { source?: string; musicId?: number | null; startTime?: number; endTime?: number }

export type DesignDoQuadro = {
  layers: readonly CamadaDoQuadro[]
  audio?: TrilhaDoQuadro | null
  /** A largura da página: o deslize entre clipes anda em fração dela. */
  canvas: { width: number }
}

export type OpcoesDoQuadro = {
  /** Export e miniatura: o quadro vale para tudo — sem seleção nem toque. */
  gravando?: boolean
  /** id da camada → duração do `<video>` montado (vídeo sem duração gravada). */
  duracoes?: ReadonlyMap<string, number> | null
}

type Alvo = {
  /** Visibilidade do clipe na linha do tempo (não-clipe: sempre visível). */
  visivel: boolean
  /** Opacidade e deslocamento horizontal (px da página) da transição, no grupo de fora. */
  opacidade: number
  deslocamento: number
  /** O grupo de movimento, no espaço da caixa da camada. */
  x: number
  y: number
  offsetX: number
  offsetY: number
  escala: number
}

const IDENTIDADE: Alvo = {
  visivel: true,
  opacidade: 1,
  deslocamento: 0,
  x: 0,
  y: 0,
  offsetX: 0,
  offsetY: 0,
  escala: 1,
}

/** O último alvo escrito em cada grupo: parado, nada é reescrito nem redesenhado. */
const assinaturas = new WeakMap<Konva.Node, string>()
/** Grupos tocados agora (ponteiro abaixado), até soltar. */
const tocados = new Set<Konva.Node>()
/** Os ouvintes de toque de cada stage, para tirar no descarte (restaurarIdentidade). */
const desinstaladores = new WeakMap<Konva.Stage, () => void>()

function assinatura(a: Alvo): string {
  const r = (n: number) => Math.round(n * 100) / 100
  return [
    a.visivel ? 'v' : 'o',
    r(a.opacidade * 1000),
    r(a.deslocamento),
    r(a.x),
    r(a.y),
    r(a.offsetX),
    r(a.offsetY),
    r(a.escala * 1000),
  ].join('|')
}

function escrever(grupo: Konva.Group, a: Alvo): boolean {
  const chave = assinatura(a)
  if (assinaturas.get(grupo) === chave) return false
  assinaturas.set(grupo, chave)
  grupo.setAttrs({ visible: a.visivel, opacity: a.opacidade, x: a.deslocamento })
  grupo
    .findOne('.' + GRUPO_DE_MOVIMENTO)
    ?.setAttrs({ x: a.x, y: a.y, offsetX: a.offsetX, offsetY: a.offsetY, scaleX: a.escala, scaleY: a.escala })
  return true
}

/** A caixa da camada, como o nó a desenha (o editor usa ao menos 20 px). */
function caixa(camada: CamadaDoQuadro) {
  return {
    x: camada.position?.x ?? 0,
    y: camada.position?.y ?? 0,
    w: Math.max(20, camada.size?.width ?? 0),
    h: Math.max(20, camada.size?.height ?? 0),
    graus: camada.rotation ?? 0,
  }
}

type AlvoDoMovimento = Pick<Alvo, 'x' | 'y' | 'offsetX' | 'offsetY' | 'escala'>

function alvoDoMovimento(camada: CamadaDoQuadro, escala: number, deslocamentoX: number): AlvoDoMovimento {
  const { w, h } = caixa(camada)
  // No espaço da própria caixa (o grupo de movimento mora dentro do nó):
  // escala em torno do centro e deslize no eixo X dela — a mesma geometria do
  // render de servidor (render-engine.ts)
  return { x: w / 2 + deslocamentoX * w, y: h / 2, offsetX: w / 2, offsetY: h / 2, escala }
}

/** O nó não bate com o design: arrastado agora, ou o React ainda não gravou. */
function desalinhado(no: Konva.Node, camada: CamadaDoQuadro): boolean {
  const { x, y, graus } = caixa(camada)
  return (
    Math.abs(no.x() - x) > 0.5 ||
    Math.abs(no.y() - y) > 0.5 ||
    Math.abs(no.rotation() - graus) > 0.5 ||
    no.scaleX() !== 1 ||
    no.scaleY() !== 1 ||
    no.isDragging()
  )
}

function instalarToque(stage: Konva.Stage) {
  if (desinstaladores.has(stage) || typeof window === 'undefined') return
  const container = stage.container?.()
  if (!container) return
  // Captura: roda antes de o Konva tratar o pointerdown (e calcular o
  // deslocamento do arraste a partir da posição absoluta, que inclui o efeito).
  // A área clicável não muda com a suspensão: o recorte é a própria caixa.
  const tocar = (evt: PointerEvent) => {
    stage.setPointersPositions(evt)
    const pos = stage.getPointerPosition()
    const alvo = pos ? stage.getIntersection(pos) : null
    if (!alvo) return
    // Alça do Transformer, ou camada selecionada junto com outras (o arraste
    // leva todas): o gesto é nos nós que o Transformer segura
    const grupoDoAlvo = alvo.findAncestor('.' + GRUPO_DE_EFEITO)
    const transformer =
      (alvo.findAncestor('Transformer') as Konva.Transformer | null) ??
      (grupoDoAlvo
        ? (stage.find('Transformer') as Konva.Transformer[]).find((tr) =>
            tr.nodes().some((n) => n.findAncestor('.' + GRUPO_DE_EFEITO) === grupoDoAlvo),
          )
        : undefined)
    const redesenhar = new Set<Konva.Layer>()
    for (const no of transformer ? transformer.nodes() : [alvo]) {
      const grupo = no.findAncestor('.' + GRUPO_DE_EFEITO) as Konva.Group | null
      if (!grupo) continue
      tocados.add(grupo)
      const camada = grupo.getLayer()
      if (escrever(grupo, IDENTIDADE) && camada) redesenhar.add(camada)
    }
    redesenhar.forEach((l) => l.batchDraw())
  }
  const soltar = () => tocados.clear()
  container.addEventListener('pointerdown', tocar, { capture: true })
  window.addEventListener('pointerup', soltar, { capture: true })
  window.addEventListener('pointercancel', soltar, { capture: true })
  desinstaladores.set(stage, () => {
    container.removeEventListener('pointerdown', tocar, { capture: true })
    window.removeEventListener('pointerup', soltar, { capture: true })
    window.removeEventListener('pointercancel', soltar, { capture: true })
    for (const grupo of tocados) if (grupo.getStage() === stage || !grupo.getStage()) tocados.delete(grupo)
  })
}

/**
 * O grupo aparece? Não-clipe, sempre — menos o oculto na gravação, que o
 * export já tirou de cena. Clipe: o que a linha do tempo diz para o instante;
 * fora dela (oculto, ou além do teto de clipes) não aparece, a não ser o clipe
 * OCULTO na prévia, que o editor mostra esmaecido como qualquer camada oculta.
 */
function visibilidade(camada: CamadaDoQuadro | undefined, quadro: QuadroDoClipe | undefined, gravando: boolean): boolean {
  if (!camada) return true
  if (gravando && camada.visible === false) return false
  if (!ehClipe(camada)) return true
  if (quadro) return quadro.visivel
  return !gravando && camada.visible === false
}

/**
 * Escreve o quadro do instante `t` em todos os grupos de efeito do stage.
 * Barato quando nada muda (compara com o último alvo escrito), então a prévia
 * chama a cada quadro e o export a cada quadro gravado.
 */
export function aplicarQuadro(
  stage: Konva.Stage | null | undefined,
  design: DesignDoQuadro,
  t: number,
  opcoes: OpcoesDoQuadro = {},
): void {
  if (!stage) return
  const grupos = stage.find('.' + GRUPO_DE_EFEITO) as Konva.Group[]
  if (grupos.length === 0) return
  if (!opcoes.gravando) instalarToque(stage)

  const audio = design.audio ?? null
  const ehVideo = paginaEVideo(design.layers, audio)
  // A linha vale fora de página-vídeo também: um clipe sozinho segue visível
  const linha = linhaDoTempo(design.layers, audio, opcoes.duracoes)
  const quadros = quadroDosClipes(linha.clipes, t)
  const porId = new Map(design.layers.map((l) => [l.id, l]))

  const redesenhar = new Set<Konva.Layer>()
  for (const grupo of grupos) {
    const camada = porId.get(grupo.getAttr('camadaId'))
    // O nó editável é o filho do grupo de efeito (Transformer e handlers o seguram)
    const no = grupo.getChildren()[0]
    const quadro = camada ? quadros.get(camada.id) : undefined
    let alvo: Alvo = { ...IDENTIDADE, visivel: visibilidade(camada, quadro, !!opcoes.gravando) }
    // Selecionar não suspende: só o gesto (toque, arraste, alça) e o nó fora do design
    const suspenso = !opcoes.gravando && !!camada && !!no && (tocados.has(grupo) || desalinhado(no, camada))
    if (camada && !suspenso) {
      if (quadro) alvo = { ...alvo, opacidade: quadro.opacidade, deslocamento: quadro.deslocamentoX * design.canvas.width }
      if (ehVideo && no && camada.type === 'image' && ehMovimento(camada.movimento)) {
        const q = quadroDoMovimento(camada.movimento, progressoDoMovimento(camada, linha, t))
        alvo = { ...alvo, ...alvoDoMovimento(camada, q.escala, q.deslocamentoX) }
      }
    }
    if (escrever(grupo, alvo)) {
      const camadaKonva = grupo.getLayer()
      if (camadaKonva) redesenhar.add(camadaKonva)
    }
  }
  redesenhar.forEach((l) => l.batchDraw())
}

/**
 * Tudo de volta à identidade (fim do export, troca de página, saída) — e os
 * ouvintes de toque do stage saem junto: remontar o stage não os acumula. O
 * próximo `aplicarQuadro` da prévia os instala de novo.
 */
export function restaurarIdentidade(stage: Konva.Stage | null | undefined): void {
  if (!stage) return
  desinstaladores.get(stage)?.()
  desinstaladores.delete(stage)
  const redesenhar = new Set<Konva.Layer>()
  for (const grupo of stage.find('.' + GRUPO_DE_EFEITO) as Konva.Group[]) {
    if (escrever(grupo, IDENTIDADE)) {
      const camadaKonva = grupo.getLayer()
      if (camadaKonva) redesenhar.add(camadaKonva)
    }
  }
  redesenhar.forEach((l) => l.batchDraw())
}
