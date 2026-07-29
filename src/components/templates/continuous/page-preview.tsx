"use client"

import * as React from 'react'
import type Konva from 'konva'
import { Stage, Layer as KonvaLayer, Rect, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import type { Layer, Page } from '@/types/template'
import { KonvaLayerFactory } from '../konva-layer-factory'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { calculateImageCrop } from '@/lib/image-crop-utils'

interface PagePreviewProps {
  page: Page
  /** Dimensões do slot em px de tela (página × zoom) */
  width: number
  height: number
  /** Escala aplicada ao stage vivo (zoom da coluna) */
  zoom: number
  /**
   * Preview vivo: stage Konva read-only desenhando as layers persistidas da
   * página (fidelidade total). Fora da janela de virtualização cai para
   * imagem — captura em memória > Page.thumbnail > placeholder numerado.
   */
  live?: boolean
  /**
   * DataURL capturado do stage quando a página deixou de ser a ativa —
   * mais nítido e mais fresco que o thumbnail persistido (150px).
   */
  capturedUrl?: string
  /** Índice da página (placeholder numerado quando não há imagem) */
  index: number
}

/**
 * Preview de página inativa no workspace contínuo.
 * Clique/ativação são responsabilidade do slot no ContinuousWorkspace.
 */
export function PagePreview({ page, width, height, zoom, live, capturedUrl, index }: PagePreviewProps) {
  if (live) {
    return <PagePreviewStage page={page} width={width} height={height} zoom={zoom} />
  }

  const src = capturedUrl ?? page.thumbnail

  return (
    <div
      className="h-full w-full cursor-pointer overflow-hidden rounded-md shadow-2xl ring-1 ring-border/20"
      style={{ width, height, backgroundColor: page.background || '#ffffff' }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- dataURL/thumbnail local, sem otimização do next/image
        <img
          src={src}
          alt={page.name}
          width={width}
          height={height}
          className="h-full w-full select-none object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="select-none text-5xl font-semibold text-muted-foreground/40">{index + 1}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Stage Konva read-only: mesmas layers, mesmo factory do editor, mas
 * listening=false, sem transformer/guias/atalhos e SEM registrar
 * setStageInstance (o stage ativo é a fonte da verdade do contexto).
 * Camada de vídeo vira poster/placeholder — nunca monta <video> em preview.
 */
function PagePreviewStage({ page, width, height, zoom }: { page: Page; width: number; height: number; zoom: number }) {
  const { projectId } = useTemplateEditor()
  const stageRef = React.useRef<Konva.Stage | null>(null)
  const noopSelect = React.useCallback(() => {}, [])
  const noopChange = React.useCallback(() => {}, [])

  const layers = React.useMemo(() => {
    const source = Array.isArray(page.layers) ? (page.layers as Layer[]) : []
    return [...source]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .filter((layer) => layer.visible !== false)
  }, [page.layers])

  return (
    <div className="h-full w-full cursor-pointer" style={{ width, height }}>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        scaleX={zoom}
        scaleY={zoom}
        listening={false}
        className="rounded-md shadow-2xl ring-1 ring-border/20"
      >
        <KonvaLayer listening={false}>
          <Rect
            x={0}
            y={0}
            width={page.width}
            height={page.height}
            fill={page.background ?? '#ffffff'}
            cornerRadius={8}
            listening={false}
          />
          {layers.map((layer) =>
            layer.type === 'video' ? (
              <VideoPosterLayer key={layer.id} layer={layer} />
            ) : (
              <KonvaLayerFactory
                key={layer.id}
                layer={layer}
                disableInteractions
                onSelect={noopSelect}
                onChange={noopChange}
                stageRef={stageRef}
                projectId={projectId}
              />
            ),
          )}
        </KonvaLayer>
      </Stage>
    </div>
  )
}

/**
 * Vídeo em preview: poster (primeiro frame persistido) com cover, ou
 * retângulo escuro quando não há poster. Nada de HTMLVideoElement aqui.
 */
function VideoPosterLayer({ layer }: { layer: Layer }) {
  const posterUrl = layer.videoMetadata?.posterUrl ?? ''
  const [poster] = useImage(posterUrl, posterUrl.startsWith('http') ? 'anonymous' : undefined)

  const x = layer.position?.x ?? 0
  const y = layer.position?.y ?? 0
  const width = Math.max(20, layer.size?.width ?? 0)
  const height = Math.max(20, layer.size?.height ?? 0)
  const rotation = layer.rotation ?? 0
  const opacity = layer.style?.opacity ?? 1

  if (posterUrl && poster) {
    const crop = calculateImageCrop(
      { width: poster.width, height: poster.height },
      { width, height },
      'center-middle',
    )
    return (
      <KonvaImage
        image={poster}
        x={x}
        y={y}
        width={width}
        height={height}
        rotation={rotation}
        opacity={opacity}
        {...crop}
        listening={false}
      />
    )
  }

  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      rotation={rotation}
      opacity={opacity}
      fill="#1f2937"
      stroke="#374151"
      dash={[8, 4]}
      listening={false}
    />
  )
}
