import type { Layer } from '@/types/template'

/** Preset aprovado na Real em 09/09/2026; nunca aplicado por nome/id de cliente. */
export const GRADIENTE_SUAVE_TOPO = 'gradiente-suave-topo'
export const ID_GRADIENTE_SUAVE = 'tratamento-gradiente-suave-topo'
export const STOPS_GRADIENTE_SUAVE = [[0, .58], [.15, .54], [.32, .41], [.55, .20], [.8, .04], [1, 0]] as const

export function textosNoTopo(layers: Layer[], canvas: { height: number }): Layer[] {
  return layers.filter((l) => l.type === 'text' && l.visible !== false && !l.locked && (l.position.y + l.size.height / 2) / canvas.height < .45)
}

/** Puro, compartilhado com o editor; um preset vira uma layer normal editável. */
export function aplicarGradienteSuave(layers: Layer[], canvas: { width: number; height: number }): Layer[] {
  const alvos = new Set(textosNoTopo(layers, canvas).map((l) => l.id))
  if (!alvos.size || layers.some((l) => l.id === ID_GRADIENTE_SUAVE && l.locked)) return layers
  const ordenadas = layers.filter((l) => l.id !== ID_GRADIENTE_SUAVE).slice().sort((a, b) => a.order - b.order)
  const primeira = ordenadas.findIndex((l) => alvos.has(l.id))
  const gradiente: Layer = {
    id: ID_GRADIENTE_SUAVE, name: 'Gradiente suave no topo', type: 'gradient', visible: true, locked: false, order: 0,
    position: { x: 0, y: 0 }, size: { width: canvas.width, height: canvas.height * .625 },
    metadata: { tratamentoDeTexto: GRADIENTE_SUAVE_TOPO },
    style: { gradientType: 'linear', gradientStartX: 0, gradientStartY: 0, gradientEndX: 0, gradientEndY: 1,
      gradientStops: STOPS_GRADIENTE_SUAVE.map(([position, opacity], i) => ({ id: `suave-${i}`, position, opacity, color: '#000000' })) },
  }
  ordenadas.splice(primeira, 0, gradiente)
  return ordenadas.map((l, order) => {
    if (!alvos.has(l.id)) return { ...l, order }
    const effects = { ...l.effects }; delete effects.background
    return { ...l, order, effects }
  })
}
