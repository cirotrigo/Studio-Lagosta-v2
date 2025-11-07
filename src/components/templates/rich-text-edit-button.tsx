"use client"

import * as React from 'react'
import Konva from 'konva'
import { Pencil } from 'lucide-react'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Layer } from '@/types/template'

/**
 * RichTextEditButton - Botão flutuante para editar rich text
 *
 * Aparece próximo ao canto superior direito da caixa de texto selecionada.
 * Permite converter texto simples em rich text e abrir o editor.
 *
 * @component
 */

interface RichTextEditButtonProps {
  selectedLayer: Layer
}

export function RichTextEditButton({ selectedLayer }: RichTextEditButtonProps) {
  const { updateLayer, zoom } = useTemplateEditor()
  const [buttonPosition, setButtonPosition] = React.useState<{ x: number; y: number } | null>(null)

  // Atualizar posição do botão continuamente para acompanhar a caixa
  React.useEffect(() => {
    let animationFrameId: number

    const updatePosition = () => {
      // Buscar stage do Konva no DOM
      const stageElement = document.querySelector('.konvajs-content')
      if (!stageElement) {
        animationFrameId = requestAnimationFrame(updatePosition)
        return
      }

      const stage = Konva.stages.find(s => s.container() === stageElement.parentElement)
      if (!stage) {
        animationFrameId = requestAnimationFrame(updatePosition)
        return
      }

      const stageContainer = stage.container()
      if (!stageContainer) {
        animationFrameId = requestAnimationFrame(updatePosition)
        return
      }

      // Pegar posição do stage na página
      const stageRect = stageContainer.getBoundingClientRect()

      // Buscar o node do layer para pegar posição real (incluindo transforms)
      const node = stage.findOne(`#${selectedLayer.id}`)
      if (!node) {
        animationFrameId = requestAnimationFrame(updatePosition)
        return
      }

      // Pegar posição e tamanho reais do node (considerando zoom e transforms)
      const nodeX = node.x() * zoom
      const nodeY = node.y() * zoom
      const nodeWidth = (node.width?.() ?? selectedLayer.size?.width ?? 100) * zoom
      const nodeHeight = (node.height?.() ?? selectedLayer.size?.height ?? 50) * zoom

      // Posicionar botão grudado ao nó middle-right (meio da direita)
      // Os nós do transformer têm 10px, botão tem 18px
      const buttonSize = 18
      const anchorSize = 10
      const spacing = -4 // Negativo para sobrepor um pouco o nó

      const buttonX = stageRect.left + nodeX + nodeWidth + anchorSize / 2 + spacing
      const buttonY = stageRect.top + nodeY + nodeHeight / 2 - buttonSize / 2

      setButtonPosition({ x: buttonX, y: buttonY })

      // Continuar atualizando
      animationFrameId = requestAnimationFrame(updatePosition)
    }

    // Iniciar loop de atualização
    animationFrameId = requestAnimationFrame(updatePosition)

    // Cleanup
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [selectedLayer.id, zoom])

  const handleClick = () => {
    // Se for texto simples, converter para rich-text
    if (selectedLayer.type === 'text') {
      updateLayer(selectedLayer.id, (layer) => ({
        ...layer,
        type: 'rich-text' as const,
        richTextStyles: [],
        content: selectedLayer.content,
        size: selectedLayer.size,
        style: selectedLayer.style,
      }))
    }

    // Aguardar conversão e abrir modal via duplo-clique simulado
    setTimeout(() => {
      // Buscar stage do Konva
      const stageElement = document.querySelector('.konvajs-content')
      if (!stageElement) return

      const stage = Konva.stages.find(s => s.container() === stageElement.parentElement)
      if (!stage) return

      const node = stage.findOne(`#${selectedLayer.id}`)
      if (node) {
        // Simular duplo-clique para abrir o modal
        node.fire('dblclick', { target: node, cancelBubble: false })
      }
    }, 100)
  }

  if (!buttonPosition) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: buttonPosition.x,
        top: buttonPosition.y,
        zIndex: 1000,
        pointerEvents: 'auto',
      }}
    >
      <button
        className="h-[18px] w-[18px] rounded-[4px] p-0 bg-white border-2 border-primary hover:bg-primary/10 transition-colors flex items-center justify-center cursor-pointer"
        onClick={handleClick}
        title="Editar Rich Text (múltiplas cores/fontes)"
        style={{
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <Pencil className="h-[10px] w-[10px] text-primary" strokeWidth={2.5} />
      </button>
    </div>
  )
}
