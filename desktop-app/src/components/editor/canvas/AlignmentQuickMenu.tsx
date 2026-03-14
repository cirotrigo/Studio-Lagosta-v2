import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
} from 'lucide-react'
import type { Layer } from '@/types/template'

interface AlignmentQuickMenuProps {
  selectedLayers: Layer[]
  pagePosition: { x: number; y: number }
  zoom: number
  onAlign: (alignment: AlignmentType) => void
}

type AlignmentType = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'

function getBoundingBox(layers: Layer[]) {
  if (layers.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  layers.forEach((layer) => {
    minX = Math.min(minX, layer.x)
    minY = Math.min(minY, layer.y)
    maxX = Math.max(maxX, layer.x + (layer.width ?? 100))
    maxY = Math.max(maxY, layer.y + (layer.height ?? 100))
  })

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}

export function AlignmentQuickMenu({
  selectedLayers,
  pagePosition,
  zoom,
  onAlign,
}: AlignmentQuickMenuProps) {
  if (selectedLayers.length === 0) return null

  const boundingBox = getBoundingBox(selectedLayers)
  if (!boundingBox) return null

  // Posiciona o menu acima da seleção
  const menuX = pagePosition.x + boundingBox.centerX * zoom
  const menuY = pagePosition.y + boundingBox.y * zoom - 48

  return (
    <div
      className="pointer-events-auto absolute z-50 flex items-center gap-1 rounded-xl border border-white/10 bg-[#1a1a1a]/95 px-2 py-1.5 shadow-lg backdrop-blur-xl transition-opacity duration-150"
      style={{
        left: menuX,
        top: Math.max(8, menuY),
        transform: 'translateX(-50%)',
      }}
    >
      <button
        type="button"
        onClick={() => onAlign('left')}
        className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-primary/10 hover:text-primary"
        title="Alinhar à esquerda"
      >
        <AlignStartVertical size={16} />
      </button>
      <button
        type="button"
        onClick={() => onAlign('center-h')}
        className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-primary/10 hover:text-primary"
        title="Centralizar horizontalmente"
      >
        <AlignCenterVertical size={16} />
      </button>
      <button
        type="button"
        onClick={() => onAlign('right')}
        className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-primary/10 hover:text-primary"
        title="Alinhar à direita"
      >
        <AlignEndVertical size={16} />
      </button>

      <div className="mx-1 h-4 w-px bg-white/10" />

      <button
        type="button"
        onClick={() => onAlign('top')}
        className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-primary/10 hover:text-primary"
        title="Alinhar ao topo"
      >
        <AlignStartHorizontal size={16} />
      </button>
      <button
        type="button"
        onClick={() => onAlign('center-v')}
        className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-primary/10 hover:text-primary"
        title="Centralizar verticalmente"
      >
        <AlignCenterHorizontal size={16} />
      </button>
      <button
        type="button"
        onClick={() => onAlign('bottom')}
        className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-primary/10 hover:text-primary"
        title="Alinhar à base"
      >
        <AlignEndHorizontal size={16} />
      </button>
    </div>
  )
}

export type { AlignmentType }
