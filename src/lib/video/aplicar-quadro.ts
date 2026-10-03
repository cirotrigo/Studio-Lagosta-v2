/**
 * O aplicador do quadro (Decisão 9 do plano de 03/10/2026): escreve o efeito
 * de tempo de cada camada — o movimento da foto — no GRUPO DE EFEITO que
 * envolve o nó editável, nunca no nó. Um só para a prévia (motor da página) e
 * para o export (konva-video-export), para os dois desenharem o mesmo quadro.
 *
 * Estrutura, montada pelo KonvaLayerFactory:
 *   Group.efeito-de-tempo (camadaId)   ← recorte pela caixa da camada
 *     Group.efeito-movimento           ← escala em torno do centro + deslize
 *       nó editável (KonvaImage ou o Group da máscara)
 *
 * O React só põe nome e `camadaId` nesses grupos, então um re-render não
 * desfaz o quadro; os handlers de arraste e de transformação continuam lendo e
 * gravando o nó de dentro.
 *
 * Na prévia o efeito fica SUSPENSO (identidade) quando a pessoa mexe na
 * camada: do toque até soltar, enquanto ela está selecionada (as alças do
 * Transformer seguem a caixa de verdade) e enquanto o nó não bate com o
 * design (logo depois de um arraste, antes de o React gravar). A suspensão do
 * toque acontece ANTES de o Konva calcular o deslocamento do arraste — senão a
 * posição gravada levaria o efeito junto.
 */

import type Konva from 'konva'
import { paginaEVideo } from './camadas-de-video'
import { linhaDoTempo } from './linha-do-tempo'
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

export type DesignDoQuadro = { layers: readonly CamadaDoQuadro[]; audio?: TrilhaDoQuadro | null }

export type OpcoesDoQuadro = {
  /** Export e miniatura: o quadro vale para tudo — sem seleção nem toque. */
  gravando?: boolean
  /** id da camada → duração do `<video>` montado (vídeo sem duração gravada). */
  duracoes?: ReadonlyMap<string, number> | null
}

type Alvo = {
  /** Polígono do recorte, em coordenadas da página; null = sem recorte. */
  recorte: number[] | null
  x: number
  y: number
  offsetX: number
  offsetY: number
  escala: number
}

const IDENTIDADE: Alvo = { recorte: null, x: 0, y: 0, offsetX: 0, offsetY: 0, escala: 1 }

/** O último alvo escrito em cada grupo: parado, nada é reescrito nem redesenhado. */
const assinaturas = new WeakMap<Konva.Node, string>()
/** Grupos tocados agora (ponteiro abaixado), até soltar. */
const tocados = new Set<Konva.Node>()
const stagesComToque = new WeakSet<Konva.Stage>()

function assinatura(a: Alvo): string {
  const r = (n: number) => Math.round(n * 100) / 100
  return [a.recorte ? a.recorte.map(r).join(',') : '-', r(a.x), r(a.y), r(a.offsetX), r(a.offsetY), r(a.escala * 1000)].join('|')
}

function escrever(grupo: Konva.Group, a: Alvo): boolean {
  const chave = assinatura(a)
  if (assinaturas.get(grupo) === chave) return false
  assinaturas.set(grupo, chave)
  const recorte = a.recorte
  // O Konva entrega o próprio Context (que repassa moveTo/lineTo); o tipo
  // declarado dele é o do canvas
  grupo.clipFunc(
    recorte
      ? (ctx: CanvasRenderingContext2D) => {
          ctx.moveTo(recorte[0], recorte[1])
          for (let i = 2; i < recorte.length; i += 2) ctx.lineTo(recorte[i], recorte[i + 1])
          ctx.closePath()
        }
      : (undefined as never),
  )
  const interno = grupo.getChildren()[0] as Konva.Group | undefined
  interno?.setAttrs({ x: a.x, y: a.y, offsetX: a.offsetX, offsetY: a.offsetY, scaleX: a.escala, scaleY: a.escala })
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

function alvoDoMovimento(camada: CamadaDoQuadro, escala: number, deslocamentoX: number): Alvo {
  const { x, y, w, h, graus } = caixa(camada)
  const rad = (graus * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const ponto = (u: number, v: number) => [x + u * cos - v * sin, y + u * sin + v * cos]
  const [cx, cy] = ponto(w / 2, h / 2)
  return {
    recorte: [...ponto(0, 0), ...ponto(w, 0), ...ponto(w, h), ...ponto(0, h)],
    // Escala em torno do centro da caixa e deslize no eixo X dela: a mesma
    // geometria do render de servidor (render-engine.ts)
    x: cx + deslocamentoX * w * cos,
    y: cy + deslocamentoX * w * sin,
    offsetX: cx,
    offsetY: cy,
    escala,
  }
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
  if (stagesComToque.has(stage) || typeof window === 'undefined') return
  const container = stage.container?.()
  if (!container) return
  stagesComToque.add(stage)
  // Captura: roda antes de o Konva tratar o pointerdown (e calcular o
  // deslocamento do arraste a partir da posição absoluta, que inclui o efeito).
  // A área clicável não muda com a suspensão: o recorte é a própria caixa.
  container.addEventListener(
    'pointerdown',
    (evt) => {
      stage.setPointersPositions(evt)
      const pos = stage.getPointerPosition()
      const grupo = pos ? stage.getIntersection(pos)?.findAncestor('.' + GRUPO_DE_EFEITO) : null
      if (!grupo) return
      tocados.add(grupo)
      if (escrever(grupo as Konva.Group, IDENTIDADE)) grupo.getLayer()?.batchDraw()
    },
    { capture: true },
  )
  const soltar = () => tocados.clear()
  window.addEventListener('pointerup', soltar, { capture: true })
  window.addEventListener('pointercancel', soltar, { capture: true })
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
  const linha = ehVideo ? linhaDoTempo(design.layers, audio, opcoes.duracoes) : null
  const porId = new Map(design.layers.map((l) => [l.id, l]))
  const selecionados = opcoes.gravando
    ? null
    : new Set((stage.find('Transformer') as Konva.Transformer[]).flatMap((tr) => tr.nodes()))

  const redesenhar = new Set<Konva.Layer>()
  for (const grupo of grupos) {
    const camada = porId.get(grupo.getAttr('camadaId'))
    const no = (grupo.getChildren()[0] as Konva.Group | undefined)?.getChildren()[0]
    let alvo = IDENTIDADE
    if (linha && camada && no && camada.type === 'image' && ehMovimento(camada.movimento)) {
      const suspenso = !opcoes.gravando && (tocados.has(grupo) || selecionados?.has(no) || desalinhado(no, camada))
      if (!suspenso) {
        const q = quadroDoMovimento(camada.movimento, progressoDoMovimento(camada, linha, t))
        alvo = alvoDoMovimento(camada, q.escala, q.deslocamentoX)
      }
    }
    if (escrever(grupo, alvo)) {
      const camadaKonva = grupo.getLayer()
      if (camadaKonva) redesenhar.add(camadaKonva)
    }
  }
  redesenhar.forEach((l) => l.batchDraw())
}

/** Tudo de volta à identidade (fim do export, troca de página, saída). */
export function restaurarIdentidade(stage: Konva.Stage | null | undefined): void {
  if (!stage) return
  const redesenhar = new Set<Konva.Layer>()
  for (const grupo of stage.find('.' + GRUPO_DE_EFEITO) as Konva.Group[]) {
    if (escrever(grupo, IDENTIDADE)) {
      const camadaKonva = grupo.getLayer()
      if (camadaKonva) redesenhar.add(camadaKonva)
    }
  }
  redesenhar.forEach((l) => l.batchDraw())
}
