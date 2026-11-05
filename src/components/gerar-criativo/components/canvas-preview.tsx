'use client'

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback, useMemo } from 'react'
import { Stage, Layer as KonvaLayer, Image, Text, Rect, Line, Shape, Transformer, Group } from 'react-konva'
import { useImage } from 'react-konva-utils'
import type Konva from 'konva'
import type { Layer } from '@/types/template'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'
import { getFontManager } from '@/lib/font-manager'
import { dimensoesDaFotoCarregada } from '@/lib/image-fit'
import { desenhoDaImagemNaPrevia, fotosPendentes } from '@/lib/gerar-criativo/previa-da-imagem'
import { celulaVinculada, ladoMinimoNoEditor } from '@/lib/grades/ajustes'
import { applyOpacityToColor, getShapeChannelOpacity } from '@/lib/gerar-criativo/opacidade-da-previa'
import {
  configDoSvgPathNaPrevia,
  diagnosticoDoVetor,
  ehCandidatoVetorial,
  resumoDosProblemas,
  travaDaPrevia,
  vetoresComProblema,
} from '@/lib/gerar-criativo/previa-do-vetor'

/** Nós da UI de edição (realce de seleção, guias): nunca entram no PNG. */
const NOME_DA_UI = '__ui-da-previa'

interface ProjectFont {
  id: number
  name: string
  fontFamily: string
  fileUrl: string
}

// Snap threshold in pixels (larger value = easier to snap, especially on mobile)
const SNAP_THRESHOLD = 25

/** Quanto o export espera a foto da URL atual carregar (passos de 100 ms) antes de recusar */
const ESPERA_DA_FOTO_PASSOS = 30

/** O que define a ARTE exportada (a seleção e a UI de edição ficam de fora): igual na entrada e na captura, ou recusa */
interface EntradasDaArte {
  layers: Layer[]
  imageValues: Record<string, ImageSource>
  textValues: Record<string, string>
  hiddenLayerIds: Set<string>
  templateWidth: number
  templateHeight: number
}
const assinaturaDaArte = (e: EntradasDaArte) =>
  JSON.stringify([e.layers, e.imageValues, e.textValues, [...e.hiddenLayerIds].sort(), e.templateWidth, e.templateHeight])

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
  onSelect,
  imageUrl,
  onDragEnd,
  onDragMove,
  onDragStart,
  shapeRef,
  aoConferirFoto,
}: {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
  imageUrl?: string
  onDragEnd?: (position: { x: number; y: number }) => void
  onDragMove?: (e: Konva.KonvaEventObject<DragEvent>, width: number, height: number) => void
  onDragStart?: () => void
  shapeRef?: React.RefObject<Konva.Image>
  /** Rodada 1: avisa a prévia qual URL esta camada tem PRONTA (conferida); `null` = nenhuma */
  aoConferirFoto?: (layerId: string, src: string | null) => void
}) {
  const src = imageUrl || layer.fileUrl || ''
  const [carregada] = useImage(src, src.startsWith('http') ? 'anonymous' : undefined)
  // G4.2: só a foto que esta camada pede (o use-image entrega a anterior numa troca rápida) — medida e desenho
  // saem da MESMA foto; outra URL não é desenhada
  const natural = useMemo(
    () => dimensoesDaFotoCarregada(carregada, src, typeof window === 'undefined' ? undefined : window.location.href),
    [carregada, src],
  )
  const image = natural ? carregada : undefined
  useEffect(() => {
    aoConferirFoto?.(layer.id, natural ? src : null)
    return () => aoConferirFoto?.(layer.id, null)
  }, [aoConferirFoto, layer.id, natural, src])
  // Recorte manual, cover, raio, espelhos e o piso do editor (8 px na célula) pelo helper único do servidor
  const desenho = useMemo(() => desenhoDaImagemNaPrevia(layer, natural), [layer, natural])
  const { largura: width, altura: height, crop, cornerRadius, espelho } = desenho

  const borderColor = layer.style?.border?.color ?? '#000000'
  const borderWidth = layer.style?.border?.width ?? 0

  const visual = {
    image,
    width,
    height,
    crop,
    cornerRadius,
    // a seleção é desenhada pelo RealceDeSelecao, nunca no contorno da camada
    stroke: borderWidth > 0 ? borderColor : undefined,
    strokeWidth: borderWidth > 0 ? borderWidth : 0,
  }
  const no = {
    name: layer.id,
    x: layer.position?.x || 0,
    y: layer.position?.y || 0,
    rotation: layer.rotation || 0,
    opacity: layer.style?.opacity ?? 1,
    onClick: onSelect,
    onTap: onSelect,
    draggable: !!onDragEnd,
    onDragStart,
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => onDragMove?.(e, width, height),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      if (onDragEnd) {
        onDragEnd({ x: e.target.x(), y: e.target.y() })
      }
    },
  }

  // Espelho como no editor: escala negativa na imagem DENTRO de um grupo — o nó que arrasta e redimensiona fica com
  // escala positiva
  const imagem = <Image ref={espelho ? undefined : shapeRef} {...(espelho ?? no)} {...visual} />
  if (!espelho) return imagem
  return (
    <Group {...no} ref={shapeRef as unknown as React.RefObject<Konva.Group>}>
      {imagem}
    </Group>
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
  shapeRef?: React.RefObject<Konva.Shape>
}) {
  // svg-path: o adaptador do editor (traçado único do CP-V0, pintura pelo
  // fillStrokeShape, que também desenha o canvas de clique com o fillRule).
  // Vetor que a prévia não desenha igual ao servidor não vira retângulo: não é
  // desenhado, e a tela e o export bloqueiam a geração (diagnosticoDoVetor).
  if (ehCandidatoVetorial(layer)) {
    if (diagnosticoDoVetor(layer).length > 0) return null
    const config = configDoSvgPathNaPrevia(layer)
    return (
      <Shape
        ref={shapeRef}
        {...config}
        onClick={onSelect}
        onTap={onSelect}
        draggable={!!onDragEnd}
        onDragStart={onDragStart}
        onDragMove={(e) => onDragMove?.(e, config.width as number, config.height as number)}
        onDragEnd={(e) => {
          if (onDragEnd) {
            onDragEnd({ x: e.target.x(), y: e.target.y() })
          }
        }}
      />
    )
  }

  const width = Math.max(10, layer.size?.width ?? 100)
  const height = Math.max(10, layer.size?.height ?? 100)
  const fill = layer.style?.fill ?? '#2563eb'
  const stroke = layer.style?.strokeColor ?? (layer.style?.border?.width && layer.style.border.width > 0 ? layer.style.border.color : undefined)
  const strokeWidth = layer.style?.strokeWidth ?? layer.style?.border?.width ?? 0
  const cornerRadius = layer.style?.border?.radius ?? 0
  const opacity = layer.style?.opacity ?? 1
  const resolvedFill = applyOpacityToColor(fill, opacity * getShapeChannelOpacity(layer, 'fill'))
  const resolvedStroke = stroke
    ? applyOpacityToColor(stroke, opacity * getShapeChannelOpacity(layer, 'stroke'))
    : undefined

  return (
    <Rect
      ref={shapeRef as React.RefObject<Konva.Rect>}
      name={layer.id}
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={width}
      height={height}
      rotation={layer.rotation ?? 0}
      fill={resolvedFill}
      cornerRadius={cornerRadius}
      stroke={resolvedStroke}
      strokeWidth={strokeWidth}
      opacity={1}
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
        applyOpacityToColor(stop.color ?? '#000000', stop.opacity ?? 1)
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
  aoConferirFoto,
}: {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
  imageUrl?: string
  aoConferirFoto?: (layerId: string, src: string | null) => void
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
        aoConferirFoto={aoConferirFoto}
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
        shapeRef={shapeRef}
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
    // Rodada 1: camada → URL cuja foto está desenhada e conferida (o export espera a da URL ATUAL)
    const fotosProntasRef = useRef(new Map<string, string | null>())
    const aoConferirFoto = useCallback((layerId: string, src: string | null) => {
      fotosProntasRef.current.set(layerId, src)
    }, [])
    // Residual da rodada 1: as entradas ATUAIS da arte (a closure do export guarda as do clique; trocar ou ocultar uma
    // foto durante as esperas muda o Stage, e o finalize gravaria camadas e fotos do clique com o PNG de outra arte)
    const entradasDaArteRef = useRef<EntradasDaArte>({ layers, imageValues, textValues, hiddenLayerIds, templateWidth, templateHeight })
    entradasDaArteRef.current = { layers, imageValues, textValues, hiddenLayerIds, templateWidth, templateHeight }

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

      // G4.2: célula de grade não tem alças (a geometria dela é da grade; mudar a caixa a quebraria)
      const selecionada = layers.find((l) => l.id === selectedLayerId)
      if (selectedLayerId && onLayerResize && !(selecionada && celulaVinculada(selecionada))) {
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

        // Get the new size after transform (a foto espelhada é um grupo, sem largura própria: vale a da camada)
        const camada = layers.find((l) => l.id === layerId)
        const scaleX = node.scaleX()
        const scaleY = node.scaleY()
        const newWidth = Math.max(5, (node.width() || camada?.size?.width || 0) * scaleX)
        const newHeight = Math.max(5, (node.height() || camada?.size?.height || 0) * scaleY)

        // Reset scale to 1 (we apply scale to width/height instead)
        node.scaleX(1)
        node.scaleY(1)

        onLayerResize(
          layerId,
          { width: newWidth, height: newHeight },
          { x: node.x(), y: node.y() }
        )
      },
      [onLayerResize, layers]
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
        // A arte que o clique pediu (a mesma que o finalize vai gravar): conferida de novo logo antes da captura
        const assinaturaDoPedido = assinaturaDaArte(entradasDaArteRef.current)
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

        // Vetor que a prévia não desenha igual ao servidor: interrompe antes do
        // PNG (a tela já bloqueia o botão; esta é a segunda linha de defesa)
        const problemas = vetoresComProblema(layers, hiddenLayerIds)
        if (problemas.length > 0) {
          throw new Error(`Vetor que o assistente não desenha: ${resumoDosProblemas(problemas)}`)
        }

        // Rodada 1: foto pendente, com erro ou ainda da URL anterior sairia como buraco no PNG gravado — espera a da
        // URL atual (com teto) e, se não vier, não exporta (o finalize nem é chamado). Célula vazia não espera.
        const pendentes = () => {
          const e = entradasDaArteRef.current
          return fotosPendentes(e.layers, e.hiddenLayerIds, e.imageValues, fotosProntasRef.current)
        }
        for (let i = 0; i < ESPERA_DA_FOTO_PASSOS && pendentes().length > 0; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        const faltam = pendentes()
        if (faltam.length > 0) {
          throw new Error(`A foto ainda não carregou na prévia (${faltam.map((l) => l.name || l.id).join(', ')}). Espere a imagem aparecer e gere de novo.`)
        }

        // Save current state
        const previousScale = { x: stage.scaleX(), y: stage.scaleY() }
        const previousPosition = { x: stage.x(), y: stage.y() }

        // A UI de edição (Transformer, realce de seleção, guias) sai do PNG por
        // visibilidade. Nenhuma camada da arte é tocada: zerar o contorno do nó
        // selecionado apagava o contorno legítimo de forma, texto e gradiente.
        // As guias também saem só por visibilidade: mudar o estado de snap aqui
        // desmontaria os nós no meio do export e eles não voltariam no finally.
        const uiDeEdicao: Konva.Node[] = [
          ...(transformer ? [transformer] : []),
          ...stage.find(`.${NOME_DA_UI}`),
        ]
        const visibilidadeAntes = uiDeEdicao.map((node) => node.visible())

        try {
          uiDeEdicao.forEach((node) => node.visible(false))
          // Reset to 1:1 scale for export
          stage.scale({ x: 1, y: 1 })
          stage.position({ x: 0, y: 0 })
          stage.batchDraw()

          // Wait for next frame to ensure fonts and images are rendered
          await new Promise((resolve) => requestAnimationFrame(resolve))
          // Extra wait for font rendering
          await new Promise((resolve) => setTimeout(resolve, 200))

          // Residual da rodada 1 — depois de TODAS as esperas e imediatamente antes da captura: a arte ainda é a do
          // pedido (camadas, fotos, textos, ocultas, tamanho) e toda foto está pronta NA URL ATUAL. Senão, nada de PNG
          // (e o finalize nem é chamado); o finally devolve escala, posição e UI
          if (assinaturaDaArte(entradasDaArteRef.current) !== assinaturaDoPedido) {
            throw new Error('A arte mudou durante a exportação (foto, texto ou camada). Nada foi gerado: gere de novo.')
          }
          const faltamAgora = pendentes()
          if (faltamAgora.length > 0) {
            throw new Error(`A foto ainda não carregou na prévia (${faltamAgora.map((l) => l.name || l.id).join(', ')}). Espere a imagem aparecer e gere de novo.`)
          }

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
          // Restore previous state (também quando o export falha)
          stage.scale(previousScale)
          stage.position(previousPosition)
          uiDeEdicao.forEach((node, i) => node.visible(visibilidadeAntes[i]))
          stage.batchDraw()
        }
      },
    }), [fontsLoaded, projectFonts.length, templateWidth, templateHeight, layers, hiddenLayerIds, imageValues])

    const visibleLayers = layers.filter((l) => !hiddenLayerIds.has(l.id) && l.visible !== false)
    const selectedLayer = visibleLayers.find((l) => l.id === selectedLayerId)
    const trava = travaDaPrevia(selectedLayer)

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
                aoConferirFoto={aoConferirFoto}
                textOverride={textValues[layer.id]}
                onDragStart={handleDragStart}
                // G4.2: célula de grade não arrasta sozinha (a grade se move inteira, no editor)
                onDragMove={onLayerDrag && !celulaVinculada(layer) ? handleDragMove : undefined}
                onDragEnd={onLayerDrag && !celulaVinculada(layer) ? (pos) => handleDragEnd(layer.id, pos) : undefined}
              />
            ))}

            {/* Realce de seleção da imagem: nó da UI, fora da camada (o export o esconde) */}
            {selectedLayer && ['image', 'logo', 'element'].includes(selectedLayer.type) && (
              <Rect
                name={NOME_DA_UI}
                x={selectedLayer.position?.x || 0}
                y={selectedLayer.position?.y || 0}
                width={Math.max(ladoMinimoNoEditor(selectedLayer), selectedLayer.size?.width ?? 100)}
                height={Math.max(ladoMinimoNoEditor(selectedLayer), selectedLayer.size?.height ?? 100)}
                rotation={selectedLayer.rotation || 0}
                cornerRadius={selectedLayer.style?.border?.radius ?? 0}
                stroke="#3b82f6"
                strokeWidth={4}
                listening={false}
              />
            )}

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
                // Forma com manterProporcao: keepRatio e só os cantos (como no editor)
                keepRatio={trava.keepRatio}
                // Enable all anchors for touch
                enabledAnchors={trava.ancoras}
              />
            )}

            {/* Snap guide lines */}
            {snapGuides.vertical && (
              <Line
                name={NOME_DA_UI}
                points={[centerX, 0, centerX, templateHeight]}
                stroke="#3b82f6"
                strokeWidth={2}
                dash={[10, 5]}
                listening={false}
              />
            )}
            {snapGuides.horizontal && (
              <Line
                name={NOME_DA_UI}
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
