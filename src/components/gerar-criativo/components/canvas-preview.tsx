'use client'

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback, useMemo } from 'react'
import { Stage, Layer as KonvaLayer, Image, Text, Rect, Line, Transformer } from 'react-konva'
import { useImage } from 'react-konva-utils'
import type Konva from 'konva'
import type { Layer } from '@/types/template'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'
import { getFontManager } from '@/lib/font-manager'
import { calculateImageCrop } from '@/lib/image-crop-utils'

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
  const [image] = useImage(src, src.startsWith('http') ? 'anonymous' : undefined)
  const width = Math.max(20, layer.size?.width ?? 100)
  const height = Math.max(20, layer.size?.height ?? 100)

  // Calculate crop for objectFit: cover (match editor behavior)
  const crop = useMemo(() => {
    if (!image) return undefined

    // Use objectFit: cover by default to match editor behavior
    const objectFit = layer.style?.objectFit ?? 'cover'
    if (objectFit === 'cover') {
      return calculateImageCrop(
        { width: image.width, height: image.height },
        { width, height },
        'center-middle'
      )
    }

    return undefined
  }, [image, width, height, layer.style?.objectFit])

  const borderColor = layer.style?.border?.color ?? '#000000'
  const borderWidth = layer.style?.border?.width ?? 0
  const borderRadius = layer.style?.border?.radius ?? 0

  return (
    <Image
      ref={shapeRef}
      name={layer.id}
      image={image}
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={width}
      height={height}
      {...crop}
      rotation={layer.rotation || 0}
      opacity={layer.style?.opacity ?? 1}
      cornerRadius={borderRadius}
      stroke={isSelected ? '#3b82f6' : (borderWidth > 0 ? borderColor : undefined)}
      strokeWidth={isSelected ? 4 : (borderWidth > 0 ? borderWidth : 0)}
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
  const width = layer.size?.width ?? 240
  const height = layer.size?.height ?? 120

  // Match editor's font style handling
  const fontStyle = layer.style?.fontStyle ?? 'normal'
  // Use fontVariant for weight like the editor does
  const fontVariant = layer.style?.fontWeight ? String(layer.style.fontWeight) : undefined

  return (
    <Text
      ref={shapeRef}
      name={layer.id}
      text={content}
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={width}
      height={height}
      fontSize={layer.style?.fontSize ?? 16}
      fontFamily={layer.style?.fontFamily ?? 'Inter'}
      fontStyle={fontStyle}
      fontVariant={fontVariant}
      fill={layer.style?.color ?? '#000000'}
      align={layer.style?.textAlign ?? 'left'}
      padding={6}
      lineHeight={layer.style?.lineHeight ?? 1.2}
      letterSpacing={layer.style?.letterSpacing ?? 0}
      wrap="word"
      ellipsis={false}
      rotation={layer.rotation ?? 0}
      opacity={layer.style?.opacity ?? 1}
      perfectDrawEnabled={true}
      stroke={
        layer.effects?.stroke?.enabled
          ? layer.effects.stroke.strokeColor
          : (layer.style?.border?.width && layer.style.border.width > 0 ? layer.style.border.color : undefined)
      }
      strokeWidth={
        layer.effects?.stroke?.enabled
          ? layer.effects.stroke.strokeWidth
          : (layer.style?.border?.width && layer.style.border.width > 0 ? layer.style.border.width : undefined)
      }
      shadowColor={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowColor : undefined}
      shadowBlur={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowBlur : 0}
      shadowOffsetX={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowOffsetX : 0}
      shadowOffsetY={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowOffsetY : 0}
      shadowOpacity={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowOpacity : 1}
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
  const width = Math.max(10, layer.size?.width ?? 100)
  const height = Math.max(10, layer.size?.height ?? 100)
  const fill = layer.style?.fill ?? '#2563eb'
  const stroke = layer.style?.strokeColor ?? (layer.style?.border?.width && layer.style.border.width > 0 ? layer.style.border.color : undefined)
  const strokeWidth = layer.style?.strokeWidth ?? layer.style?.border?.width ?? 0
  const cornerRadius = layer.style?.border?.radius ?? 0

  return (
    <Rect
      ref={shapeRef}
      name={layer.id}
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={width}
      height={height}
      rotation={layer.rotation ?? 0}
      fill={fill}
      cornerRadius={cornerRadius}
      stroke={stroke}
      strokeWidth={strokeWidth}
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

/**
 * Convert CSS gradient angle to Konva start/end points
 * Uses the same calculation as the main editor (konva-layer-factory.tsx)
 */
function calculateGradientFromAngle(
  angleInDegrees: number,
  width: number,
  height: number
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  // Convert CSS angle (180 = top) to math angle (0 = right)
  const angle = ((180 - angleInDegrees) / 180) * Math.PI

  // Calculate length to reach corners
  const length = Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle))

  // Calculate x,y points centered on shape
  const halfx = (Math.sin(angle) * length) / 2.0
  const halfy = (Math.cos(angle) * length) / 2.0
  const cx = width / 2.0
  const cy = height / 2.0

  return {
    start: { x: cx - halfx, y: cy - halfy },
    end: { x: cx + halfx, y: cy + halfy },
  }
}

/**
 * Convert hex color to rgba string
 */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
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
  const gradientStops = layer.style?.gradientStops
  const angle = layer.style?.gradientAngle ?? 0
  const gradientType = layer.style?.gradientType ?? 'linear'
  const width = Math.max(20, layer.size?.width ?? 0)
  const height = Math.max(20, layer.size?.height ?? 0)
  const borderRadius = layer.style?.border?.radius ?? 0
  const borderColor = layer.style?.border?.color ?? '#000000'
  const borderWidth = layer.style?.border?.width ?? 0

  // Build color stops using editor's format
  const colorStops = useMemo(() => {
    const stops = Array.isArray(gradientStops) && gradientStops.length > 0
      ? gradientStops
      : [
          { id: '1', position: 0, color: '#000000', opacity: 1 },
          { id: '2', position: 1, color: '#ffffff', opacity: 1 },
        ]

    // Sort by position and convert to Konva format with opacity support
    return stops
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .flatMap((stop) => [
        stop.position ?? 0,
        hexToRgba(stop.color ?? '#000000', stop.opacity ?? 1)
      ])
  }, [gradientStops])

  const handleDragEnd = (e: { target: { x: () => number; y: () => number } }) => {
    if (onDragEnd) {
      onDragEnd({ x: e.target.x(), y: e.target.y() })
    }
  }

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragMove?.(e, width, height)
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
        rotation={layer.rotation ?? 0}
        fillRadialGradientStartPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientEndRadius={Math.max(width, height) / 2}
        fillRadialGradientColorStops={colorStops}
        cornerRadius={borderRadius}
        opacity={layer.style?.opacity ?? 1}
        stroke={borderWidth > 0 ? borderColor : undefined}
        strokeWidth={borderWidth > 0 ? borderWidth : undefined}
        onClick={onSelect}
        onTap={onSelect}
        draggable={!!onDragEnd}
        onDragStart={onDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    )
  }

  // Linear gradient - use editor's calculation
  const gradientPoints = calculateGradientFromAngle(angle, width, height)

  return (
    <Rect
      ref={shapeRef}
      name={layer.id}
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={width}
      height={height}
      rotation={layer.rotation ?? 0}
      fillLinearGradientStartPoint={gradientPoints.start}
      fillLinearGradientEndPoint={gradientPoints.end}
      fillLinearGradientColorStops={colorStops}
      cornerRadius={borderRadius}
      opacity={layer.style?.opacity ?? 1}
      stroke={borderWidth > 0 ? borderColor : undefined}
      strokeWidth={borderWidth > 0 ? borderWidth : undefined}
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
        console.log('[CanvasPreview] Starting export...')
        const stage = stageRef.current
        const transformer = transformerRef.current
        if (!stage) {
          console.error('[CanvasPreview] Stage not ready')
          throw new Error('Canvas not ready for export')
        }

        // Wait for fonts to load if not loaded yet
        if (!fontsLoaded && projectFonts.length > 0) {
          console.log('[CanvasPreview] Waiting for fonts to load...')
          // Wait up to 3 seconds for fonts
          for (let i = 0; i < 30; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100))
            if (fontsLoaded) break
          }
          console.log('[CanvasPreview] Fonts loaded:', fontsLoaded)
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

        // Hide selection stroke on selected layer during export
        let selectedShape: Konva.Shape | null = null
        let prevStroke: string | CanvasGradient | undefined
        let prevStrokeWidth: number | undefined
        if (selectedLayerId) {
          const node = stage.findOne(`.${selectedLayerId}`)
          if (node && 'stroke' in node) {
            selectedShape = node as Konva.Shape
            prevStroke = selectedShape.stroke()
            prevStrokeWidth = selectedShape.strokeWidth()
            selectedShape.stroke('')
            selectedShape.strokeWidth(0)
          }
        }

        try {
          // Reset to 1:1 scale for export
          stage.scale({ x: 1, y: 1 })
          stage.position({ x: 0, y: 0 })
          stage.batchDraw()

          // Wait for next frame to ensure fonts and images are rendered
          await new Promise((resolve) => requestAnimationFrame(resolve))
          // Extra wait for font rendering
          await new Promise((resolve) => setTimeout(resolve, 200))

          console.log('[CanvasPreview] Exporting canvas...')
          console.log('[CanvasPreview] Stage dimensions:', templateWidth, 'x', templateHeight)

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

          console.log('[CanvasPreview] Export complete, dataUrl length:', dataUrl.length)
          return dataUrl
        } catch (exportError) {
          console.error('[CanvasPreview] Export error:', exportError)
          throw exportError
        } finally {
          // Restore previous state
          stage.scale(previousScale)
          stage.position(previousPosition)

          // Restore transformer visibility
          if (transformer && transformerWasVisible) {
            transformer.visible(true)
          }

          // Restore selection stroke
          if (selectedShape) {
            selectedShape.stroke(prevStroke)
            selectedShape.strokeWidth(prevStrokeWidth)
          }

          stage.batchDraw()
        }
      },
    }), [fontsLoaded, projectFonts.length, templateWidth, templateHeight, selectedLayerId])

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
