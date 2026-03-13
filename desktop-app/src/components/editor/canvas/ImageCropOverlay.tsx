import { useCallback, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Rect } from 'react-konva'
import useImage from 'use-image'
import type Konva from 'konva'
import type { KonvaImageLayer, KonvaPage } from '@/types/template'
import { useEditorStore } from '@/stores/editor.store'
import { resolveCoverCrop } from '@/lib/editor/image-fit'

interface ImageCropOverlayProps {
  page: KonvaPage
  layer: KonvaImageLayer
  zoom: number
}

type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br' | null

export function ImageCropOverlay({ page, layer, zoom }: ImageCropOverlayProps) {
  const cropMode = useEditorStore((state) => state.cropMode)
  const updateCropPreview = useEditorStore((state) => state.updateCropPreview)
  const exitCropMode = useEditorStore((state) => state.exitCropMode)

  const [image] = useImage(layer.src ?? '', 'anonymous')
  const imageRef = useRef<Konva.Image>(null)
  const [resizing, setResizing] = useState<ResizeCorner>(null)
  const resizeStartRef = useRef<{
    mouseX: number
    mouseY: number
    crop: { x: number; y: number; width: number; height: number }
    corner: ResizeCorner
  } | null>(null)

  const frameWidth = layer.width ?? 280
  const frameHeight = layer.height ?? 220

  // Calculate current crop state
  const currentCrop = cropMode?.previewCrop ?? layer.crop

  // Calculate image dimensions and position based on crop
  const getImageState = useCallback(() => {
    if (!image) return null

    const imageWidth = image.width
    const imageHeight = image.height

    // Default crop if none specified (cover mode)
    const crop = currentCrop ?? resolveCoverCrop(imageWidth, imageHeight, frameWidth, frameHeight)

    // Calculate scale: frame size / crop size
    const scaleX = frameWidth / crop.width
    const scaleY = frameHeight / crop.height

    // Calculate image offset (negative because we're moving the image, not the crop)
    const offsetX = -crop.x * scaleX
    const offsetY = -crop.y * scaleY

    // Calculate displayed image dimensions
    const displayWidth = imageWidth * scaleX
    const displayHeight = imageHeight * scaleY

    return {
      imageWidth,
      imageHeight,
      scaleX,
      scaleY,
      offsetX,
      offsetY,
      displayWidth,
      displayHeight,
      crop,
    }
  }, [image, currentCrop, frameWidth, frameHeight])

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (!image) return

    const imageState = getImageState()
    if (!imageState) return

    const node = e.target
    const newX = node.x()
    const newY = node.y()

    // Convert screen position back to crop coordinates
    const { scaleX, scaleY, imageWidth, imageHeight } = imageState

    // New crop position (inverse of offset calculation)
    let cropX = -newX / scaleX
    let cropY = -newY / scaleY

    // Clamp crop to image bounds
    const maxCropX = Math.max(0, imageWidth - (frameWidth / scaleX))
    const maxCropY = Math.max(0, imageHeight - (frameHeight / scaleY))

    cropX = Math.max(0, Math.min(cropX, maxCropX))
    cropY = Math.max(0, Math.min(cropY, maxCropY))

    updateCropPreview({
      x: Math.round(cropX),
      y: Math.round(cropY),
      width: Math.round(frameWidth / scaleX),
      height: Math.round(frameHeight / scaleY),
    })

    // Update node position to clamped values
    node.x(-cropX * scaleX)
    node.y(-cropY * scaleY)
  }

  // Handle resize start
  const handleResizeStart = (corner: ResizeCorner, e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!image) return
    const imageState = getImageState()
    if (!imageState) return

    const stage = e.target.getStage()
    if (!stage) return

    const pointerPos = stage.getPointerPosition()
    if (!pointerPos) return

    setResizing(corner)
    resizeStartRef.current = {
      mouseX: pointerPos.x,
      mouseY: pointerPos.y,
      crop: { ...imageState.crop },
      corner,
    }

    const container = stage.container()
    if (container) container.style.cursor = 'nwse-resize'
  }

  // Handle resize move (on stage)
  const handleResizeMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!resizing || !resizeStartRef.current || !image) return

    const imageState = getImageState()
    if (!imageState) return

    const stage = e.target.getStage()
    if (!stage) return

    const pointerPos = stage.getPointerPosition()
    if (!pointerPos) return

    const { mouseX, mouseY, crop, corner } = resizeStartRef.current
    const deltaX = (pointerPos.x - mouseX) / zoom
    const deltaY = (pointerPos.y - mouseY) / zoom

    // Calculate scale change based on diagonal movement
    const diagonal = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    const sign = corner === 'br' || corner === 'tr' ? 1 : -1
    const direction = (deltaX + deltaY) > 0 ? 1 : -1
    const scaleFactor = 1 + (sign * direction * diagonal) / 200

    // New crop dimensions (smaller crop = larger image display)
    let newWidth = crop.width / scaleFactor
    let newHeight = crop.height / scaleFactor

    // Clamp to min/max sizes
    const minSize = 50
    const maxWidth = imageState.imageWidth
    const maxHeight = imageState.imageHeight

    newWidth = Math.max(minSize, Math.min(newWidth, maxWidth))
    newHeight = Math.max(minSize, Math.min(newHeight, maxHeight))

    // Keep aspect ratio of the frame
    const frameRatio = frameWidth / frameHeight
    if (newWidth / newHeight > frameRatio) {
      newWidth = newHeight * frameRatio
    } else {
      newHeight = newWidth / frameRatio
    }

    // Calculate new position to keep the image centered on the frame
    let newX = crop.x + (crop.width - newWidth) / 2
    let newY = crop.y + (crop.height - newHeight) / 2

    // Clamp position to image bounds
    newX = Math.max(0, Math.min(newX, imageState.imageWidth - newWidth))
    newY = Math.max(0, Math.min(newY, imageState.imageHeight - newHeight))

    updateCropPreview({
      x: Math.round(newX),
      y: Math.round(newY),
      width: Math.round(newWidth),
      height: Math.round(newHeight),
    })
  }, [resizing, image, getImageState, zoom, frameWidth, frameHeight, updateCropPreview])

  const handleResizeEnd = (e: Konva.KonvaEventObject<MouseEvent>) => {
    setResizing(null)
    resizeStartRef.current = null

    const stage = e.target.getStage()
    if (stage) {
      const container = stage.container()
      if (container) container.style.cursor = 'default'
    }
  }

  const imageState = getImageState()
  if (!image || !imageState) return null

  // Calculate handle size based on zoom
  const handleSize = 12 / zoom

  // Image corners in screen coordinates
  const imgCorners = [
    { key: 'tl', x: imageState.offsetX, y: imageState.offsetY, cursor: 'nwse-resize' },
    { key: 'tr', x: imageState.offsetX + imageState.displayWidth, y: imageState.offsetY, cursor: 'nesw-resize' },
    { key: 'bl', x: imageState.offsetX, y: imageState.offsetY + imageState.displayHeight, cursor: 'nesw-resize' },
    { key: 'br', x: imageState.offsetX + imageState.displayWidth, y: imageState.offsetY + imageState.displayHeight, cursor: 'nwse-resize' },
  ]

  return (
    <Group
      x={layer.x}
      y={layer.y}
      listening
      onMouseMove={resizing ? handleResizeMove : undefined}
      onMouseUp={resizing ? handleResizeEnd : undefined}
    >
      {/* Dark overlay blocks all events on underlying layers */}
      <Rect
        x={-layer.x - page.width}
        y={-layer.y - page.height}
        width={page.width * 3}
        height={page.height * 3}
        fill="rgba(0, 0, 0, 0.6)"
        listening
        onMouseMove={resizing ? handleResizeMove : undefined}
        onMouseUp={resizing ? handleResizeEnd : undefined}
      />

      {/* Ghost image showing full extent (with transparency) - render first (behind) */}
      <KonvaImage
        image={image}
        x={imageState.offsetX}
        y={imageState.offsetY}
        width={imageState.displayWidth}
        height={imageState.displayHeight}
        opacity={0.3}
        listening={false}
      />

      {/* Clipping group for the frame */}
      <Group
        clipFunc={(ctx) => {
          ctx.rect(0, 0, frameWidth, frameHeight)
        }}
      >
        {/* Full image (draggable) - cursor indicates pan mode */}
        <KonvaImage
          ref={imageRef}
          image={image}
          x={imageState.offsetX}
          y={imageState.offsetY}
          width={imageState.displayWidth}
          height={imageState.displayHeight}
          draggable={!resizing}
          onDragMove={handleDragMove}
          onMouseEnter={(e) => {
            if (resizing) return
            const container = e.target.getStage()?.container()
            if (container) container.style.cursor = 'grab'
          }}
          onMouseLeave={(e) => {
            if (resizing) return
            const container = e.target.getStage()?.container()
            if (container) container.style.cursor = 'default'
          }}
          onDragStart={(e) => {
            const container = e.target.getStage()?.container()
            if (container) container.style.cursor = 'grabbing'
          }}
          onDragEnd={(e) => {
            const container = e.target.getStage()?.container()
            if (container) container.style.cursor = 'grab'
          }}
          onDblClick={() => exitCropMode(true)}
          onDblTap={() => exitCropMode(true)}
        />
      </Group>

      {/* Frame border */}
      <Rect
        width={frameWidth}
        height={frameHeight}
        stroke="#3B82F6"
        strokeWidth={3 / zoom}
        listening={false}
      />

      {/* Frame corner indicators (fixed, non-interactive) */}
      {[
        { x: 0, y: 0 },
        { x: frameWidth, y: 0 },
        { x: 0, y: frameHeight },
        { x: frameWidth, y: frameHeight },
      ].map((pos, i) => (
        <Rect
          key={`frame-${i}`}
          x={pos.x - 4 / zoom}
          y={pos.y - 4 / zoom}
          width={8 / zoom}
          height={8 / zoom}
          fill="#3B82F6"
          listening={false}
        />
      ))}

      {/* Image resize handles (interactive) */}
      {imgCorners.map(({ key, x, y, cursor }) => (
        <Rect
          key={`img-handle-${key}`}
          x={x - handleSize / 2}
          y={y - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill="#FFFFFF"
          stroke="#3B82F6"
          strokeWidth={2 / zoom}
          cornerRadius={2 / zoom}
          onMouseDown={(e) => handleResizeStart(key as ResizeCorner, e)}
          onMouseEnter={(e) => {
            const container = e.target.getStage()?.container()
            if (container) container.style.cursor = cursor
          }}
          onMouseLeave={(e) => {
            if (resizing) return
            const container = e.target.getStage()?.container()
            if (container) container.style.cursor = 'default'
          }}
        />
      ))}

      {/* Image border (dashed to differentiate from frame) */}
      <Rect
        x={imageState.offsetX}
        y={imageState.offsetY}
        width={imageState.displayWidth}
        height={imageState.displayHeight}
        stroke="#FFFFFF"
        strokeWidth={1 / zoom}
        dash={[6 / zoom, 4 / zoom]}
        listening={false}
      />
    </Group>
  )
}
