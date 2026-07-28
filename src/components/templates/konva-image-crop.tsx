"use client"

import * as React from 'react'
import Konva from 'konva'
import { Group, Rect, Line, Circle, Image as KonvaImage } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import useImage from 'use-image'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { resolveImageSourceRect } from '@/lib/image-fit'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * KonvaImageCropOverlay - Reenquadramento de imagem in-canvas (estilo Canva)
 *
 * Entra por duplo clique na imagem (ou botão Recortar da toolbar).
 *
 * A MOLDURA NÃO SE MEXE: a área que a imagem ocupa no layout é o contrato do
 * template (o texto ao redor foi posicionado contando com ela). Quem se move é
 * a IMAGEM por dentro — arrastar reposiciona, as alças aproximam/afastam.
 * Fora da moldura a imagem aparece esmaecida, para o usuário ver o que sobra.
 *
 * A imagem é obrigada a cobrir a moldura o tempo todo (não dá para deixar
 * buraco), como no Canva.
 *
 * Confirmar grava UM updateLayer (1 passo de undo) mexendo SÓ em `style.crop`
 * — frações da imagem original, o mesmo campo que o render server-side lê.
 * `position` e `size` da camada ficam intactos.
 *
 * Tudo vive em coordenadas do CANVAS (dentro do Stage), então zoom e scroll do
 * editor funcionam de graça. v1 não suporta camada rotacionada — os pontos de
 * entrada bloqueiam antes.
 */
export function KonvaImageCropOverlay() {
  const { design, croppingLayerId, setCroppingLayerId, updateLayer, zoom } = useTemplateEditor()

  const layer = React.useMemo(
    () => design.layers.find((item) => item.id === croppingLayerId) ?? null,
    [design.layers, croppingLayerId],
  )

  const fileUrl = layer?.fileUrl ?? ''
  const [image] = useImage(fileUrl, fileUrl.startsWith('http') ? 'anonymous' : undefined)

  // Moldura FIXA: a caixa da camada, exatamente como está no layout
  const frame = React.useMemo<Rect>(
    () => ({
      x: layer?.position?.x ?? 0,
      y: layer?.position?.y ?? 0,
      width: Math.max(1, layer?.size?.width ?? 1),
      height: Math.max(1, layer?.size?.height ?? 1),
    }),
    [layer],
  )

  const frameCenter = React.useMemo(
    () => ({ x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }),
    [frame],
  )

  /**
   * Posição/tamanho da imagem INTEIRA em coordenadas do canvas, de forma que o
   * recorte visível hoje caia exatamente sobre a moldura. kx/ky são "canvas px
   * por pixel de imagem" por eixo — iguais no cover; diferentes numa imagem
   * esticada (contain/fill), e aí o pano de fundo aparece com a mesma
   * distorção que o usuário já vê.
   */
  const initialImageRect = React.useMemo<Rect | null>(() => {
    if (!image || !layer) return null
    const natural = { width: image.width, height: image.height }
    const src =
      resolveImageSourceRect(natural, { width: frame.width, height: frame.height }, layer.style) ?? {
        cropX: 0,
        cropY: 0,
        cropWidth: natural.width,
        cropHeight: natural.height,
      }
    const kx = frame.width / src.cropWidth
    const ky = frame.height / src.cropHeight
    return {
      x: frame.x - src.cropX * kx,
      y: frame.y - src.cropY * ky,
      width: natural.width * kx,
      height: natural.height * ky,
    }
  }, [image, layer, frame])

  const [imageRect, setImageRect] = React.useState<Rect | null>(initialImageRect)
  React.useEffect(() => {
    setImageRect(initialImageRect)
  }, [initialImageRect])

  /** A imagem sempre cobre a moldura — nada de buraco branco nas bordas */
  const clampImage = React.useCallback(
    (candidate: Rect): Rect => {
      const aspect = candidate.width / candidate.height || 1
      let width = candidate.width
      let height = candidate.height
      if (width < frame.width) {
        width = frame.width
        height = width / aspect
      }
      if (height < frame.height) {
        height = frame.height
        width = height * aspect
      }
      const x = Math.max(Math.min(candidate.x, frame.x), frame.x + frame.width - width)
      const y = Math.max(Math.min(candidate.y, frame.y), frame.y + frame.height - height)
      return { x, y, width, height }
    },
    [frame],
  )

  const scaleAround = React.useCallback(
    (rect: Rect, factor: number): Rect =>
      clampImage({
        width: rect.width * factor,
        height: rect.height * factor,
        x: frameCenter.x - (frameCenter.x - rect.x) * factor,
        y: frameCenter.y - (frameCenter.y - rect.y) * factor,
      }),
    [clampImage, frameCenter],
  )

  const handleConfirm = React.useCallback(() => {
    if (!layer || !imageRect) return
    // Frações da imagem original correspondentes à moldura (que não mudou)
    const crop = {
      x: (frame.x - imageRect.x) / imageRect.width,
      y: (frame.y - imageRect.y) / imageRect.height,
      width: frame.width / imageRect.width,
      height: frame.height / imageRect.height,
    }
    updateLayer(layer.id, (prev) => ({
      ...prev,
      // position/size intocados de propósito: o layout não pode se mexer
      style: { ...prev.style, crop },
    }))
    setCroppingLayerId(null)
  }, [layer, imageRect, frame, updateLayer, setCroppingLayerId])

  const handleCancel = React.useCallback(() => {
    setCroppingLayerId(null)
  }, [setCroppingLayerId])

  const handleReset = React.useCallback(() => {
    setImageRect(initialImageRect)
  }, [initialImageRect])

  // Teclado (Enter/Esc) + botões HTML da barra (Aplicar/Cancelar/zoom)
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        handleConfirm()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        handleCancel()
      }
    }
    const onConfirmEvent = () => handleConfirm()
    const onCancelEvent = () => handleCancel()
    const onZoomIn = () => setImageRect((prev) => (prev ? scaleAround(prev, 1.1) : prev))
    const onZoomOut = () => setImageRect((prev) => (prev ? scaleAround(prev, 1 / 1.1) : prev))
    const onReset = () => handleReset()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('lagosta:crop-confirm', onConfirmEvent)
    window.addEventListener('lagosta:crop-cancel', onCancelEvent)
    window.addEventListener('lagosta:crop-zoom-in', onZoomIn)
    window.addEventListener('lagosta:crop-zoom-out', onZoomOut)
    window.addEventListener('lagosta:crop-reset', onReset)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('lagosta:crop-confirm', onConfirmEvent)
      window.removeEventListener('lagosta:crop-cancel', onCancelEvent)
      window.removeEventListener('lagosta:crop-zoom-in', onZoomIn)
      window.removeEventListener('lagosta:crop-zoom-out', onZoomOut)
      window.removeEventListener('lagosta:crop-reset', onReset)
    }
  }, [handleConfirm, handleCancel, handleReset, scaleAround])

  /** Arrastar a imagem = reposicionar o enquadramento */
  const handleImageDragMove = React.useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      const node = event.target
      setImageRect((prev) => {
        if (!prev) return prev
        const next = clampImage({ ...prev, x: node.x(), y: node.y() })
        // Devolve o node para dentro do limite (senão a imagem "escapa" da
        // moldura enquanto o ponteiro continua andando)
        node.position({ x: next.x, y: next.y })
        return next
      })
    },
    [clampImage],
  )

  // Alças de canto: aproximar/afastar a imagem (escala em torno do centro da
  // moldura). Guardamos o estado do início do gesto para a conta ser estável.
  const scaleStartRef = React.useRef<{ dist: number; rect: Rect } | null>(null)

  const pointerInCanvas = (node: Konva.Node) => {
    const stage = node.getStage()
    const pointer = stage?.getPointerPosition()
    if (!stage || !pointer) return null
    const scale = stage.scaleX() || 1
    return { x: (pointer.x - stage.x()) / scale, y: (pointer.y - stage.y()) / scale }
  }

  const handleScaleStart = React.useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      if (!imageRect) return
      const point = pointerInCanvas(event.target)
      if (!point) return
      const dist = Math.hypot(point.x - frameCenter.x, point.y - frameCenter.y) || 1
      scaleStartRef.current = { dist, rect: imageRect }
    },
    [imageRect, frameCenter],
  )

  const handleScaleMove = React.useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      const start = scaleStartRef.current
      if (!start) return
      const point = pointerInCanvas(event.target)
      if (!point) return
      const dist = Math.hypot(point.x - frameCenter.x, point.y - frameCenter.y)
      const factor = Math.max(0.05, dist / start.dist)
      setImageRect(scaleAround(start.rect, factor))
    },
    [frameCenter, scaleAround],
  )

  const handleScaleEnd = React.useCallback(() => {
    scaleStartRef.current = null
  }, [])

  if (!layer || !image || !imageRect) return null

  // Área "infinita" para o esmaecido fora da moldura
  const BIG = 100000
  const handleRadius = 8 / (zoom || 1)

  return (
    <Group name="crop-overlay">
      {/* Imagem inteira, arrastável */}
      <KonvaImage
        image={image}
        x={imageRect.x}
        y={imageRect.y}
        width={imageRect.width}
        height={imageRect.height}
        draggable
        onDragMove={handleImageDragMove}
      />

      {/* Esmaecido fora da moldura (não captura clique: o arraste é da imagem) */}
      <Rect x={-BIG} y={-BIG} width={BIG * 2} height={BIG + frame.y} fill="rgba(0,0,0,0.55)" listening={false} />
      <Rect x={-BIG} y={frame.y + frame.height} width={BIG * 2} height={BIG} fill="rgba(0,0,0,0.55)" listening={false} />
      <Rect x={-BIG} y={frame.y} width={BIG + frame.x} height={frame.height} fill="rgba(0,0,0,0.55)" listening={false} />
      <Rect x={frame.x + frame.width} y={frame.y} width={BIG} height={frame.height} fill="rgba(0,0,0,0.55)" listening={false} />

      {/* Grade de terços dentro da moldura */}
      {[1, 2].map((i) => (
        <React.Fragment key={`grid-${i}`}>
          <Line
            points={[frame.x + (frame.width * i) / 3, frame.y, frame.x + (frame.width * i) / 3, frame.y + frame.height]}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth={1 / (zoom || 1)}
            dash={[5, 5]}
            listening={false}
          />
          <Line
            points={[frame.x, frame.y + (frame.height * i) / 3, frame.x + frame.width, frame.y + (frame.height * i) / 3]}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth={1 / (zoom || 1)}
            dash={[5, 5]}
            listening={false}
          />
        </React.Fragment>
      ))}

      {/* Contorno da moldura fixa */}
      <Rect
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        stroke="#00a8ff"
        strokeWidth={2}
        strokeScaleEnabled={false}
        listening={false}
      />

      {/* Alças nos cantos da IMAGEM: aproximar/afastar */}
      {(
        [
          [imageRect.x, imageRect.y],
          [imageRect.x + imageRect.width, imageRect.y],
          [imageRect.x, imageRect.y + imageRect.height],
          [imageRect.x + imageRect.width, imageRect.y + imageRect.height],
        ] as Array<[number, number]>
      ).map(([cx, cy], index) => (
        <Circle
          key={`scale-${index}`}
          x={cx}
          y={cy}
          radius={handleRadius}
          fill="#ffffff"
          stroke="#00a8ff"
          strokeWidth={2 / (zoom || 1)}
          draggable
          onDragStart={handleScaleStart}
          onDragMove={handleScaleMove}
          onDragEnd={handleScaleEnd}
        />
      ))}
    </Group>
  )
}
