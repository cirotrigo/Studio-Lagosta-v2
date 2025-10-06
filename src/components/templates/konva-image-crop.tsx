"use client"

import * as React from 'react'
import Konva from 'konva'
import { Group, Rect, Transformer, Line, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'

interface KonvaImageCropProps {
  imageNode: Konva.Image
  onConfirm: (result: {
    cropData: { x: number; y: number; width: number; height: number }
    displaySize: { width: number; height: number }
  }) => void
  onCancel: () => void
  stageRef: React.RefObject<Konva.Stage | null>
}

/**
 * KonvaImageCrop - Componente de crop interativo para imagens
 *
 * Funcionalidades:
 * - Overlay escurecido fora da área de crop
 * - Transformer com handles circulares nos cantos
 * - Botões Done/Cancel
 * - Grid de terços (rule of thirds)
 * - Atalhos de teclado (Enter/Escape)
 * - Crop limitado aos limites da imagem
 * - Usa propriedades nativas de crop do Konva (cropX, cropY, cropWidth, cropHeight)
 */
export function KonvaImageCrop({ imageNode, onConfirm, onCancel, stageRef }: KonvaImageCropProps) {
  const cropRectRef = React.useRef<Konva.Rect | null>(null)
  const transformerRef = React.useRef<Konva.Transformer | null>(null)
  const cropGroupRef = React.useRef<Konva.Group | null>(null)

  // Dimensões e transformações da imagem no canvas
  const imageX = imageNode.x()
  const imageY = imageNode.y()
  const imageScaleX = imageNode.scaleX()
  const imageScaleY = imageNode.scaleY()

  // Obter imagem original (sem crop, pois crop foi desabilitado no modo de edição)
  const image = imageNode.image() as HTMLImageElement | HTMLCanvasElement

  // Dimensões do node Konva (layer.size)
  const nodeWidth = imageNode.width()
  const nodeHeight = imageNode.height()

  // Dimensões da imagem ORIGINAL (completa, sem crop)
  const originalWidth = image?.width ?? nodeWidth
  const originalHeight = image?.height ?? nodeHeight

  // Calcular scale necessário para ajustar imagem original ao node
  const scaleToFitX = nodeWidth / originalWidth
  const scaleToFitY = nodeHeight / originalHeight
  const scaleToFit = Math.min(scaleToFitX, scaleToFitY)

  // Dimensões da imagem original quando ajustada ao node (contain)
  const fittedWidth = originalWidth * scaleToFit
  const fittedHeight = originalHeight * scaleToFit

  // Posição centralizada da imagem no node
  const offsetX = (nodeWidth - fittedWidth) / 2
  const offsetY = (nodeHeight - fittedHeight) / 2

  // Dimensões exibidas no canvas (considerando scale do node)
  const displayWidth = fittedWidth * imageScaleX
  const displayHeight = fittedHeight * imageScaleY
  const displayX = imageX + offsetX * imageScaleX
  const displayY = imageY + offsetY * imageScaleY

  // Inicializar área de crop
  // Usar 80% da área central da imagem ORIGINAL exibida
  const initialCropArea = React.useMemo(() => {
    return {
      x: displayX + Math.max(50, displayWidth * 0.1),
      y: displayY + Math.max(50, displayHeight * 0.1),
      width: Math.max(100, displayWidth * 0.8),
      height: Math.max(100, displayHeight * 0.8),
    }
  }, [displayX, displayY, displayWidth, displayHeight])

  // Estado do crop (área selecionada no espaço de exibição)
  const [cropArea, setCropArea] = React.useState(initialCropArea)

  // Atualizar área de crop durante transform (resize)
  const handleTransform = React.useCallback(() => {
    const rect = cropRectRef.current
    if (!rect) return

    const scaleX = rect.scaleX()
    const scaleY = rect.scaleY()

    // Aplicar scale nas dimensões
    const newWidth = Math.max(50, rect.width() * scaleX)
    const newHeight = Math.max(50, rect.height() * scaleY)

    // Resetar scale para evitar distorção
    rect.scaleX(1)
    rect.scaleY(1)
    rect.width(newWidth)
    rect.height(newHeight)

    // Atualizar estado
    setCropArea({
      x: rect.x(),
      y: rect.y(),
      width: newWidth,
      height: newHeight,
    })
  }, [])

  const handleDragMove = React.useCallback(() => {
    const rect = cropRectRef.current
    if (!rect) return

    // Obter posição e dimensões atuais
    let newX = rect.x()
    let newY = rect.y()
    const width = rect.width()
    const height = rect.height()

    // Limitar aos limites da imagem original exibida
    if (newX < displayX) newX = displayX
    if (newY < displayY) newY = displayY
    if (newX + width > displayX + displayWidth) newX = displayX + displayWidth - width
    if (newY + height > displayY + displayHeight) newY = displayY + displayHeight - height

    // Aplicar nova posição
    rect.position({ x: newX, y: newY })

    // Atualizar estado
    setCropArea({
      x: newX,
      y: newY,
      width,
      height,
    })
  }, [displayX, displayY, displayWidth, displayHeight])

  // Confirmar crop - retorna coordenadas de crop na imagem original (não-destrutivo)
  const handleConfirm = React.useCallback(() => {
    const image = imageNode.image() as HTMLImageElement | HTMLCanvasElement
    if (!image) return

    // Converter coordenadas do espaço de exibição para coordenadas da imagem original
    // cropArea está em coordenadas do canvas (pixels)
    // Precisamos converter para coordenadas da imagem original

    // Remover offset e scale para obter coordenadas relativas à imagem exibida
    const relativeX = (cropArea.x - displayX) / imageScaleX
    const relativeY = (cropArea.y - displayY) / imageScaleY
    const relativeWidth = cropArea.width / imageScaleX
    const relativeHeight = cropArea.height / imageScaleY

    // Converter de coordenadas da imagem fitted para coordenadas da imagem original
    const cropX = relativeX / scaleToFit
    const cropY = relativeY / scaleToFit
    const cropWidth = relativeWidth / scaleToFit
    const cropHeight = relativeHeight / scaleToFit

    // Dimensões da área selecionada no canvas (para redimensionar o layer)
    const displayWidth = cropArea.width / imageScaleX
    const displayHeight = cropArea.height / imageScaleY

    onConfirm({
      cropData: {
        x: Math.max(0, Math.round(cropX)),
        y: Math.max(0, Math.round(cropY)),
        width: Math.round(cropWidth),
        height: Math.round(cropHeight),
      },
      displaySize: {
        width: Math.round(displayWidth),
        height: Math.round(displayHeight),
      },
    })
  }, [cropArea, displayX, displayY, imageScaleX, imageScaleY, scaleToFit, onConfirm])

  // Atalhos de teclado
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleConfirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleConfirm, onCancel])

  // Conectar transformer ao crop rect
  React.useEffect(() => {
    const transformer = transformerRef.current
    const rect = cropRectRef.current
    if (transformer && rect) {
      transformer.nodes([rect])
      transformer.getLayer()?.batchDraw()
    }
  }, [])

  // Dimensões do stage para overlay
  const stage = stageRef.current
  const stageWidth = stage?.width() || 1920
  const stageHeight = stage?.height() || 1080

  return (
    <Group ref={cropGroupRef} name="crop-mode">
      {/* Overlay escurecido - 4 retângulos ao redor da área de crop */}
      {/* Topo */}
      <Rect
        x={0}
        y={0}
        width={stageWidth}
        height={cropArea.y}
        fill="rgba(0, 0, 0, 0.7)"
        listening={false}
      />
      {/* Esquerda */}
      <Rect
        x={0}
        y={cropArea.y}
        width={cropArea.x}
        height={cropArea.height}
        fill="rgba(0, 0, 0, 0.7)"
        listening={false}
      />
      {/* Direita */}
      <Rect
        x={cropArea.x + cropArea.width}
        y={cropArea.y}
        width={stageWidth - (cropArea.x + cropArea.width)}
        height={cropArea.height}
        fill="rgba(0, 0, 0, 0.7)"
        listening={false}
      />
      {/* Baixo */}
      <Rect
        x={0}
        y={cropArea.y + cropArea.height}
        width={stageWidth}
        height={stageHeight - (cropArea.y + cropArea.height)}
        fill="rgba(0, 0, 0, 0.7)"
        listening={false}
      />

      {/* Retângulo de crop (invisível, apenas para controle) */}
      <Rect
        ref={cropRectRef}
        x={cropArea.x}
        y={cropArea.y}
        width={cropArea.width}
        height={cropArea.height}
        stroke="#00a8ff"
        strokeWidth={2}
        draggable
        onTransform={handleTransform}
        onDragMove={handleDragMove}
        onDblClick={handleConfirm}
        onDblTap={handleConfirm}
      />

      {/* Grid de terços */}
      {/* Linhas verticais */}
      <Line
        points={[
          cropArea.x + cropArea.width / 3,
          cropArea.y,
          cropArea.x + cropArea.width / 3,
          cropArea.y + cropArea.height,
        ]}
        stroke="rgba(255, 255, 255, 0.5)"
        strokeWidth={1}
        dash={[5, 5]}
        listening={false}
      />
      <Line
        points={[
          cropArea.x + (cropArea.width * 2) / 3,
          cropArea.y,
          cropArea.x + (cropArea.width * 2) / 3,
          cropArea.y + cropArea.height,
        ]}
        stroke="rgba(255, 255, 255, 0.5)"
        strokeWidth={1}
        dash={[5, 5]}
        listening={false}
      />
      {/* Linhas horizontais */}
      <Line
        points={[
          cropArea.x,
          cropArea.y + cropArea.height / 3,
          cropArea.x + cropArea.width,
          cropArea.y + cropArea.height / 3,
        ]}
        stroke="rgba(255, 255, 255, 0.5)"
        strokeWidth={1}
        dash={[5, 5]}
        listening={false}
      />
      <Line
        points={[
          cropArea.x,
          cropArea.y + (cropArea.height * 2) / 3,
          cropArea.x + cropArea.width,
          cropArea.y + (cropArea.height * 2) / 3,
        ]}
        stroke="rgba(255, 255, 255, 0.5)"
        strokeWidth={1}
        dash={[5, 5]}
        listening={false}
      />

      {/* Transformer com handles circulares */}
      <Transformer
        ref={transformerRef}
        rotateEnabled={false}
        borderStroke="#00a8ff"
        borderStrokeWidth={2}
        anchorStroke="#ffffff"
        anchorFill="#00a8ff"
        anchorSize={16}
        anchorCornerRadius={50} // Círculos
        anchorStrokeWidth={3}
        enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
        keepRatio={false}
        boundBoxFunc={(oldBox, newBox) => {
          // Tamanho mínimo
          if (newBox.width < 50 || newBox.height < 50) {
            return oldBox
          }

          // Limitar aos limites da imagem original exibida
          const maxX = displayX + displayWidth
          const maxY = displayY + displayHeight

          if (newBox.x < displayX || newBox.y < displayY || newBox.x + newBox.width > maxX || newBox.y + newBox.height > maxY) {
            return oldBox
          }

          return newBox
        }}
      />

      {/* Botões Done e Cancel */}
      <CropButton
        x={20}
        y={20}
        text="✓ Done"
        fill="#00a8ff"
        onClick={handleConfirm}
      />
      <CropButton
        x={120}
        y={20}
        text="✕ Cancel"
        fill="#666666"
        onClick={onCancel}
      />
    </Group>
  )
}

interface CropButtonProps {
  x: number
  y: number
  text: string
  fill: string
  onClick: () => void
}

function CropButton({ x, y, text, fill, onClick }: CropButtonProps) {
  const [isHovered, setIsHovered] = React.useState(false)
  const groupRef = React.useRef<Konva.Group | null>(null)

  const handleMouseEnter = React.useCallback(() => {
    setIsHovered(true)
    const container = groupRef.current?.getStage()?.container()
    if (container) container.style.cursor = 'pointer'
  }, [])

  const handleMouseLeave = React.useCallback(() => {
    setIsHovered(false)
    const container = groupRef.current?.getStage()?.container()
    if (container) container.style.cursor = 'default'
  }, [])

  const handleClick = React.useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true
      onClick()
    },
    [onClick]
  )

  return (
    <Group
      ref={groupRef}
      x={x}
      y={y}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onTap={handleClick}
    >
      <Rect
        width={80}
        height={36}
        fill={fill}
        cornerRadius={6}
        shadowColor="black"
        shadowBlur={5}
        shadowOpacity={0.3}
        opacity={isHovered ? 0.8 : 1}
      />
      <Text
        text={text}
        fontSize={14}
        fontFamily="Arial"
        fill="white"
        width={80}
        height={36}
        align="center"
        verticalAlign="middle"
        padding={10}
        listening={false}
      />
    </Group>
  )
}
