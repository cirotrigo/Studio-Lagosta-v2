'use client'

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react'
import { Stage, Layer as KonvaLayer, Image, Text, Rect, Line, Transformer } from 'react-konva'
import { useImage } from 'react-konva-utils'
import type Konva from 'konva'
import type { Layer } from '@/types/template'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'
import { getFontManager } from '@/lib/font-manager'

interface ProjectFont {
  id: number
  name: string
  fontFamily: string
  fileUrl: string
}

// Snap threshold in pixels (larger value = easier to snap, especially on mobile)
const SNAP_THRESHOLD = 25

export interface CanvasPreviewHandle {
  exportToDataUrl: (format?: 'png' | 'jpeg', quality?: number) => Promise<string>
}

interface CanvasPreviewProps {
  layers: Layer[]
  selectedLayerId: string | null
  onSelectLayer: (id: string | null) => void
  imageValues: Record<string, ImageSource>
  textValues: Record<string, string>
  hiddenLayerIds: Set<string>
  templateWidth?: number
  templateHeight?: number
  templateBackground?: string
  onLayerDrag?: (layerId: string, position: { x: number; y: number }) => void
  onLayerResize?: (layerId: string, size: { width: number; height: number }, position: { x: number; y: number }) => void
  projectFonts?: ProjectFont[]
}

interface SnapGuides {
  vertical: boolean // Show vertical center line
  horizontal: boolean // Show horizontal center line
}

function ImageLayer({
  layer,
  isSelected,
  onSelect,
  imageUrl,
  onDragEnd,
  onDragMove,
  onDragStart,
  shapeRef,
}: {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
  imageUrl?: string
  onDragEnd?: (position: { x: number; y: number }) => void
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>, width: number, height: number) => void
  onDragStart?: () => void
  shapeRef?: React.RefObject<Konva.Image>
}) {
  const src = imageUrl || layer.fileUrl || ''
  const [image] = useImage(src, 'anonymous')
  const width = layer.size?.width || 100
  const height = layer.size?.height || 100

  return (
    <Image
      ref={shapeRef}
      name={layer.id}
      image={image}
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={width}
      height={height}
      rotation={layer.rotation || 0}
      opacity={layer.style?.opacity ?? 1}
      onClick={onSelect}
      onTap={onSelect}
      stroke={isSelected ? '#3b82f6' : undefined}
      strokeWidth={isSelected ? 4 : 0}
      draggable={!!onDragEnd}
      onDragStart={onDragStart}
      onDragMove={(e) => onDragMove?.(e, width, height)}
      onDragEnd={(e) => {
        if (onDragEnd) {
          onDragEnd({ x: e.target.x(), y: e.target.y() })
        }
      }}
    />
  )
}

function applyTextTransform(text: string, transform?: string): string {
  if (!transform || transform === 'none') return text
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase()
    case 'lowercase':
      return text.toLowerCase()
    case 'capitalize':
      return text.replace(/\b\w/g, (char) => char.toUpperCase())
    default:
      return text
  }
}

function TextLayer({
  layer,
  isSelected,
  onSelect,
  textOverride,
  onDragEnd,
  onDragMove,
  onDragStart,
  shapeRef,
}: {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
  textOverride?: string
  onDragEnd?: (position: { x: number; y: number }) => void
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>, width: number, height: number) => void
  onDragStart?: () => void
  shapeRef?: React.RefObject<Konva.Text>
}) {
  const rawContent = textOverride ?? layer.content ?? ''
  const content = applyTextTransform(rawContent, layer.style?.textTransform)
  const width = layer.size?.width || 100
  const height = layer.size?.height || 50

  // Build font style string (e.g., "bold italic")
  const fontStyle = [
    layer.style?.fontWeight === 'bold' || (typeof layer.style?.fontWeight === 'number' && layer.style.fontWeight >= 700) ? 'bold' : '',
    layer.style?.fontStyle === 'italic' ? 'italic' : '',
  ].filter(Boolean).join(' ') || 'normal'

  return (
    <Text
      ref={shapeRef}
      name={layer.id}
      text={content}
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={width}
      height={height}
      fontSize={layer.style?.fontSize || 16}
      fontFamily={layer.style?.fontFamily || 'sans-serif'}
      fontStyle={fontStyle}
      fill={layer.style?.color || '#000'}
      align={layer.style?.textAlign || 'left'}
      lineHeight={(layer.style?.lineHeight || 1.2)}
      letterSpacing={layer.style?.letterSpacing || 0}
      opacity={layer.style?.opacity ?? 1}
      onClick={onSelect}
      onTap={onSelect}
      draggable={!!onDragEnd}
      onDragStart={onDragStart}
      onDragMove={(e) => onDragMove?.(e, width, height)}
      onDragEnd={(e) => {
        if (onDragEnd) {
          onDragEnd({ x: e.target.x(), y: e.target.y() })
        }
      }}
    />
  )
}

function ShapeLayer({
  layer,
  isSelected,
  onSelect,
  onDragEnd,
  onDragMove,
  onDragStart,
  shapeRef,
}: {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
  onDragEnd?: (position: { x: number; y: number }) => void
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>, width: number, height: number) => void
  onDragStart?: () => void
  shapeRef?: React.RefObject<Konva.Rect>
}) {
  const width = layer.size?.width || 100
  const height = layer.size?.height || 100

  return (
    <Rect
      ref={shapeRef}
      name={layer.id}
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={width}
      height={height}
      fill={layer.style?.fill || '#ccc'}
      cornerRadius={layer.style?.border?.radius || 0}
      opacity={layer.style?.opacity ?? 1}
      onClick={onSelect}
      onTap={onSelect}
      draggable={!!onDragEnd}
      onDragStart={onDragStart}
      onDragMove={(e) => onDragMove?.(e, width, height)}
      onDragEnd={(e) => {
        if (onDragEnd) {
          onDragEnd({ x: e.target.x(), y: e.target.y() })
        }
      }}
    />
  )
}

function GradientLayer({
  layer,
  isSelected,
  onSelect,
  onDragEnd,
  onDragMove,
  onDragStart,
  shapeRef,
}: {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
  onDragEnd?: (position: { x: number; y: number }) => void
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>, width: number, height: number) => void
  onDragStart?: () => void
  shapeRef?: React.RefObject<Konva.Rect>
}) {
  const width = layer.size?.width || 100
  const height = layer.size?.height || 100
  const gradientStops = layer.style?.gradientStops || []
  const gradientAngle = layer.style?.gradientAngle || 0
  const gradientType = layer.style?.gradientType || 'linear'

  // Convert CSS gradient angle to Konva coordinates
  // CSS: 0deg = bottom→top, 90deg = left→right, 180deg = top→bottom
  // Math: 0rad = right, π/2 = up
  // Conversion: math_angle = css_angle - 90
  const angleRad = ((gradientAngle - 90) * Math.PI) / 180
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)

  // Calculate gradient points based on angle
  const startX = width / 2 - (cos * width) / 2
  const startY = height / 2 - (sin * height) / 2
  const endX = width / 2 + (cos * width) / 2
  const endY = height / 2 + (sin * height) / 2

  // Build color stops array for Konva
  const colorStops: (number | string)[] = []
  const sortedStops = [...gradientStops].sort((a, b) => a.position - b.position)

  sortedStops.forEach((stop) => {
    colorStops.push(stop.position)
    // Apply opacity to color if needed
    if (stop.opacity !== undefined && stop.opacity < 1) {
      // Convert hex to rgba
      const hex = stop.color.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)
      colorStops.push(`rgba(${r},${g},${b},${stop.opacity})`)
    } else {
      colorStops.push(stop.color)
    }
  })

  const handleDragEnd = (e: { target: { x: () => number; y: () => number } }) => {
    if (onDragEnd) {
      onDragEnd({ x: e.target.x(), y: e.target.y() })
    }
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragMove?.(e, width, height)
  }

  // Fallback if no gradient stops defined
  if (colorStops.length === 0) {
    return (
      <Rect
        ref={shapeRef}
        name={layer.id}
        x={layer.position?.x || 0}
        y={layer.position?.y || 0}
        width={width}
        height={height}
        fill={layer.style?.fill || '#ccc'}
        cornerRadius={layer.style?.border?.radius || 0}
        opacity={layer.style?.opacity ?? 1}
        onClick={onSelect}
        onTap={onSelect}
        draggable={!!onDragEnd}
        onDragStart={onDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    )
  }

  if (gradientType === 'radial') {
    return (
      <Rect
        ref={shapeRef}
        name={layer.id}
        x={layer.position?.x || 0}
        y={layer.position?.y || 0}
        width={width}
        height={height}
        fillRadialGradientStartPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientEndPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndRadius={Math.max(width, height) / 2}
        fillRadialGradientColorStops={colorStops}
        cornerRadius={layer.style?.border?.radius || 0}
        opacity={layer.style?.opacity ?? 1}
        onClick={onSelect}
        onTap={onSelect}
        draggable={!!onDragEnd}
        onDragStart={onDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    )
  }

  // Linear gradient
  return (
    <Rect
      ref={shapeRef}
      name={layer.id}
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={width}
      height={height}
      fillLinearGradientStartPoint={{ x: startX, y: startY }}
      fillLinearGradientEndPoint={{ x: endX, y: endY }}
      fillLinearGradientColorStops={colorStops}
      cornerRadius={layer.style?.border?.radius || 0}
      opacity={layer.style?.opacity ?? 1}
      onClick={onSelect}
      onTap={onSelect}
      draggable={!!onDragEnd}
      onDragStart={onDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    />
  )
}

function LayerRenderer({
  layer,
  isSelected,
  onSelect,
  imageUrl,
  textOverride,
  onDragEnd,
  onDragMove,
  onDragStart,
  shapeRef,
}: {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
  imageUrl?: string
  textOverride?: string
  onDragEnd?: (position: { x: number; y: number }) => void
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>, width: number, height: number) => void
  onDragStart?: () => void
  shapeRef?: React.RefObject<Konva.Shape>
}) {
  if (layer.type === 'image' || layer.type === 'logo' || layer.type === 'element') {
    return (
      <ImageLayer
        layer={layer}
        isSelected={isSelected}
        onSelect={onSelect}
        imageUrl={imageUrl}
        onDragEnd={onDragEnd}
        onDragMove={onDragMove}
        onDragStart={onDragStart}
        shapeRef={shapeRef as React.RefObject<Konva.Image>}
      />
    )
  }

  if (layer.type === 'text' || layer.type === 'rich-text') {
    return (
      <TextLayer
        layer={layer}
        isSelected={isSelected}
        onSelect={onSelect}
        textOverride={textOverride}
        onDragEnd={onDragEnd}
        onDragMove={onDragMove}
        onDragStart={onDragStart}
        shapeRef={shapeRef as React.RefObject<Konva.Text>}
      />
    )
  }

  if (layer.type === 'gradient' || layer.type === 'gradient2') {
    return (
      <GradientLayer
        layer={layer}
        isSelected={isSelected}
        onSelect={onSelect}
        onDragEnd={onDragEnd}
        onDragMove={onDragMove}
        onDragStart={onDragStart}
        shapeRef={shapeRef as React.RefObject<Konva.Rect>}
      />
    )
  }

  if (layer.type === 'shape') {
    return (
      <ShapeLayer
        layer={layer}
        isSelected={isSelected}
        onSelect={onSelect}
        onDragEnd={onDragEnd}
        onDragMove={onDragMove}
        onDragStart={onDragStart}
        shapeRef={shapeRef as React.RefObject<Konva.Rect>}
      />
    )
  }

  return null
}

export const CanvasPreview = forwardRef<CanvasPreviewHandle, CanvasPreviewProps>(
  function CanvasPreview(
    {
      layers,
      selectedLayerId,
      onSelectLayer,
      imageValues,
      textValues,
      hiddenLayerIds,
      templateWidth = 1080,
      templateHeight = 1920,
      templateBackground = '#ffffff',
      onLayerDrag,
      onLayerResize,
      projectFonts = [],
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const stageRef = useRef<Konva.Stage>(null)
    const transformerRef = useRef<Konva.Transformer>(null)
    const [scale, setScale] = useState(1)
    const [snapGuides, setSnapGuides] = useState<SnapGuides>({ vertical: false, horizontal: false })
    const [fontsLoaded, setFontsLoaded] = useState(false)

    // Center coordinates
    const centerX = templateWidth / 2
    const centerY = templateHeight / 2

    useEffect(() => {
      const updateScale = () => {
        if (containerRef.current) {
          const containerWidth = containerRef.current.clientWidth
          setScale(containerWidth / templateWidth)
        }
      }

      updateScale()
      window.addEventListener('resize', updateScale)
      return () => window.removeEventListener('resize', updateScale)
    }, [templateWidth])

    // Load project fonts
    useEffect(() => {
      if (projectFonts.length === 0) {
        setFontsLoaded(true)
        return
      }

      const loadFonts = async () => {
        setFontsLoaded(false)
        const fontManager = getFontManager()

        try {
          for (const font of projectFonts) {
            await fontManager.loadDatabaseFont({
              id: font.id,
              name: font.name,
              fontFamily: font.fontFamily,
              fileUrl: font.fileUrl,
              projectId: 0, // Not needed for loading
            })
          }
          console.log(`✅ Loaded ${projectFonts.length} project fonts for canvas`)
        } catch (error) {
          console.error('Error loading project fonts:', error)
        } finally {
          setFontsLoaded(true)
          // Force redraw after fonts are loaded
          stageRef.current?.batchDraw()
        }
      }

      loadFonts()
    }, [projectFonts])

    // Attach transformer to selected node
    useEffect(() => {
      const transformer = transformerRef.current
      const stage = stageRef.current
      if (!transformer || !stage) return

      if (selectedLayerId && onLayerResize) {
        // Find the selected node by name in the stage
        const selectedNode = stage.findOne(`.${selectedLayerId}`)
        if (selectedNode) {
          transformer.nodes([selectedNode])
          transformer.getLayer()?.batchDraw()
        } else {
          transformer.nodes([])
        }
      } else {
        transformer.nodes([])
      }
    }, [selectedLayerId, onLayerResize, layers]) // Include layers to re-attach when they change

    // Handle transform end (resize)
    const handleTransformEnd = useCallback(
      (e: Konva.KonvaEventObject<Event>) => {
        const node = e.target
        const layerId = node.name()
        if (!layerId || !onLayerResize) return

        // Get the new size after transform
        const scaleX = node.scaleX()
        const scaleY = node.scaleY()
        const newWidth = Math.max(5, node.width() * scaleX)
        const newHeight = Math.max(5, node.height() * scaleY)

        // Reset scale to 1 (we apply scale to width/height instead)
        node.scaleX(1)
        node.scaleY(1)

        onLayerResize(
          layerId,
          { width: newWidth, height: newHeight },
          { x: node.x(), y: node.y() }
        )
      },
      [onLayerResize]
    )

    // Handle drag move with snapping
    const handleDragMove = useCallback(
      (e: Konva.KonvaEventObject<DragEvent>, elementWidth: number, elementHeight: number) => {
        const node = e.target
        const x = node.x()
        const y = node.y()

        // Calculate element center
        const elementCenterX = x + elementWidth / 2
        const elementCenterY = y + elementHeight / 2

        // Check for vertical center alignment (element center aligns with canvas center)
        const snapToVerticalCenter = Math.abs(elementCenterX - centerX) < SNAP_THRESHOLD
        // Check for horizontal center alignment
        const snapToHorizontalCenter = Math.abs(elementCenterY - centerY) < SNAP_THRESHOLD

        // Apply snapping
        if (snapToVerticalCenter) {
          node.x(centerX - elementWidth / 2)
        }
        if (snapToHorizontalCenter) {
          node.y(centerY - elementHeight / 2)
        }

        // Update guide visibility
        setSnapGuides({
          vertical: snapToVerticalCenter,
          horizontal: snapToHorizontalCenter,
        })
      },
      [centerX, centerY]
    )

    // Handle drag start - reset guides
    const handleDragStart = useCallback(() => {
      setSnapGuides({ vertical: false, horizontal: false })
    }, [])

    // Handle drag end - hide guides and update position
    const handleDragEnd = useCallback(
      (layerId: string, position: { x: number; y: number }) => {
        setSnapGuides({ vertical: false, horizontal: false })
        onLayerDrag?.(layerId, position)
      },
      [onLayerDrag]
    )

    // Expose export function via ref
    useImperativeHandle(ref, () => ({
      exportToDataUrl: async (format: 'png' | 'jpeg' = 'png', quality = 0.9) => {
        const stage = stageRef.current
        const transformer = transformerRef.current
        if (!stage) {
          throw new Error('Canvas not ready for export')
        }

        // Save current state
        const previousScale = { x: stage.scaleX(), y: stage.scaleY() }
        const previousPosition = { x: stage.x(), y: stage.y() }

        // Hide guides and transformer during export
        setSnapGuides({ vertical: false, horizontal: false })

        // Hide transformer during export
        const transformerWasVisible = transformer?.visible() ?? false
        if (transformer) {
          transformer.visible(false)
        }

        try {
          // Reset to 1:1 scale for export
          stage.scale({ x: 1, y: 1 })
          stage.position({ x: 0, y: 0 })
          stage.batchDraw()

          // Wait for next frame to ensure fonts and images are rendered
          await new Promise((resolve) => requestAnimationFrame(resolve))
          // Extra wait for font rendering
          await new Promise((resolve) => setTimeout(resolve, 100))

          // Export with original dimensions
          const dataUrl = stage.toDataURL({
            pixelRatio: 1,
            mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
            quality: format === 'jpeg' ? quality : undefined,
            x: 0,
            y: 0,
            width: templateWidth,
            height: templateHeight,
          })

          return dataUrl
        } finally {
          // Restore previous state
          stage.scale(previousScale)
          stage.position(previousPosition)

          // Restore transformer visibility
          if (transformer && transformerWasVisible) {
            transformer.visible(true)
          }

          stage.batchDraw()
        }
      },
    }))

    const visibleLayers = layers.filter((l) => !hiddenLayerIds.has(l.id) && l.visible !== false)

    return (
      <div ref={containerRef} className="w-full">
        <Stage
          ref={stageRef}
          width={templateWidth * scale}
          height={templateHeight * scale}
          scaleX={scale}
          scaleY={scale}
          onClick={(e) => {
            if (e.target === e.target.getStage()) {
              onSelectLayer(null)
            }
          }}
          onTap={(e) => {
            if (e.target === e.target.getStage()) {
              onSelectLayer(null)
            }
          }}
        >
          <KonvaLayer>
            <Rect x={0} y={0} width={templateWidth} height={templateHeight} fill={templateBackground} />
            {visibleLayers.map((layer) => (
              <LayerRenderer
                key={layer.id}
                layer={layer}
                isSelected={layer.id === selectedLayerId}
                onSelect={() => onSelectLayer(layer.id)}
                imageUrl={imageValues[layer.id]?.url}
                textOverride={textValues[layer.id]}
                onDragStart={handleDragStart}
                onDragMove={onLayerDrag ? handleDragMove : undefined}
                onDragEnd={onLayerDrag ? (pos) => handleDragEnd(layer.id, pos) : undefined}
              />
            ))}

            {/* Transformer for resize - only show when onLayerResize is provided */}
            {onLayerResize && (
              <Transformer
                ref={transformerRef}
                boundBoxFunc={(oldBox, newBox) => {
                  // Limit minimum size
                  if (newBox.width < 20 || newBox.height < 20) {
                    return oldBox
                  }
                  return newBox
                }}
                onTransformEnd={handleTransformEnd}
                // Touch-friendly settings
                anchorSize={20}
                anchorCornerRadius={10}
                anchorStroke="#3b82f6"
                anchorFill="#ffffff"
                anchorStrokeWidth={2}
                borderStroke="#3b82f6"
                borderStrokeWidth={2}
                borderDash={[6, 3]}
                // Enable rotation
                rotateEnabled={false}
                // Keep aspect ratio when pressing shift
                keepRatio={false}
                // Enable all anchors for touch
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
              />
            )}

            {/* Snap guide lines */}
            {snapGuides.vertical && (
              <Line
                points={[centerX, 0, centerX, templateHeight]}
                stroke="#3b82f6"
                strokeWidth={2}
                dash={[10, 5]}
                listening={false}
              />
            )}
            {snapGuides.horizontal && (
              <Line
                points={[0, centerY, templateWidth, centerY]}
                stroke="#3b82f6"
                strokeWidth={2}
                dash={[10, 5]}
                listening={false}
              />
            )}
          </KonvaLayer>
        </Stage>
      </div>
    )
  }
)
