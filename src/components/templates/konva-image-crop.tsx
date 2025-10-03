"use client"

import * as React from 'react'
import Konva from 'konva'
import { Group, Rect, Transformer, Line, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'

interface KonvaImageCropProps {
  imageNode: Konva.Image
  onConfirm: (croppedDataUrl: string) => void
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
 */
export function KonvaImageCrop({ imageNode, onConfirm, onCancel, stageRef }: KonvaImageCropProps) {
  const cropRectRef = React.useRef<Konva.Rect | null>(null)
  const transformerRef = React.useRef<Konva.Transformer | null>(null)
  const cropGroupRef = React.useRef<Konva.Group | null>(null)

  // Dimensões da imagem
  const imageWidth = imageNode.width()
  const imageHeight = imageNode.height()
  const imageX = imageNode.x()
  const imageY = imageNode.y()

  // Estado do crop (área selecionada)
  const [cropArea, setCropArea] = React.useState({
    x: imageX + Math.max(50, imageWidth * 0.1),
    y: imageY + Math.max(50, imageHeight * 0.1),
    width: Math.max(100, imageWidth * 0.8),
    height: Math.max(100, imageHeight * 0.8),
  })

  // Atualizar área de crop quando rect muda
  const handleTransform = React.useCallback(() => {
    const rect = cropRectRef.current
    if (!rect) return

    const scaleX = rect.scaleX()
    const scaleY = rect.scaleY()

    setCropArea({
      x: rect.x(),
      y: rect.y(),
      width: Math.max(50, rect.width() * scaleX),
      height: Math.max(50, rect.height() * scaleY),
    })

    // Resetar scale para evitar problemas
    rect.scaleX(1)
    rect.scaleY(1)
    rect.width(Math.max(50, rect.width() * scaleX))
    rect.height(Math.max(50, rect.height() * scaleY))
  }, [])

  const handleDragMove = React.useCallback(() => {
    const rect = cropRectRef.current
    if (!rect) return

    // Limitar crop aos limites da imagem
    const box = rect.getClientRect({ skipTransform: true })
    let newX = rect.x()
    let newY = rect.y()

    if (box.x < imageX) newX = imageX
    if (box.y < imageY) newY = imageY
    if (box.x + box.width > imageX + imageWidth) newX = imageX + imageWidth - box.width
    if (box.y + box.height > imageY + imageHeight) newY = imageY + imageHeight - box.height

    rect.position({ x: newX, y: newY })

    setCropArea({
      x: newX,
      y: newY,
      width: box.width,
      height: box.height,
    })
  }, [imageHeight, imageWidth, imageX, imageY])

  // Confirmar crop
  const handleConfirm = React.useCallback(() => {
    const stage = stageRef.current
    if (!stage) return

    // Criar canvas temporário para área cropada
    const canvas = document.createElement('canvas')
    canvas.width = cropArea.width
    canvas.height = cropArea.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const image = imageNode.image() as HTMLImageElement | HTMLCanvasElement
    if (!image) return

    // Calcular coordenadas relativas à imagem original
    const relX = cropArea.x - imageX
    const relY = cropArea.y - imageY

    // Desenhar área cropada
    ctx.drawImage(
      image,
      relX,
      relY,
      cropArea.width,
      cropArea.height,
      0,
      0,
      cropArea.width,
      cropArea.height
    )

    const dataUrl = canvas.toDataURL('image/png')
    onConfirm(dataUrl)
  }, [cropArea, imageNode, imageX, imageY, onConfirm, stageRef])

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
      {/* Overlay escurecido */}
      <Rect
        x={0}
        y={0}
        width={stageWidth}
        height={stageHeight}
        fill="rgba(0, 0, 0, 0.7)"
        listening={false}
      />

      {/* Área clara (região do crop) */}
      <Rect
        x={cropArea.x}
        y={cropArea.y}
        width={cropArea.width}
        height={cropArea.height}
        fill="white"
        globalCompositeOperation="destination-out"
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
        onTransformEnd={handleTransform}
        onDragEnd={handleDragMove}
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

          // Limitar aos limites da imagem
          const maxX = imageX + imageWidth
          const maxY = imageY + imageHeight

          if (newBox.x < imageX || newBox.y < imageY || newBox.x + newBox.width > maxX || newBox.y + newBox.height > maxY) {
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
