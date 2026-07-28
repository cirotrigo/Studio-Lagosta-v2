"use client"

import * as React from 'react'
import Konva from 'konva'
import { Group, Rect, Line, Circle, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { resolveImageSourceRect } from '@/lib/image-fit'

/**
 * KonvaImageCropOverlay - Recorte de imagem in-canvas (estilo Polotno)
 *
 * Entra por duplo clique na imagem (ou botão Recortar da toolbar). Mostra a
 * imagem INTEIRA como pano de fundo, com tudo fora da janela de recorte
 * esmaecido; a janela nasce exatamente no recorte visível atual da camada.
 *
 * - Arrastar a janela: move o enquadramento sobre a imagem
 * - Alças circulares nos cantos: redimensionam a janela
 * - Enter/botão Aplicar confirma; Esc/Cancelar sai sem mudar nada
 *
 * Confirmação grava em UM updateLayer (1 passo de undo): a caixa da camada
 * vira a janela escolhida e `style.crop` guarda as FRAÇÕES da imagem original
 * (o mesmo campo que o render server-side lê via resolveImageSourceRect).
 *
 * Tudo aqui vive em coordenadas do CANVAS (dentro do Stage), então zoom e
 * scroll funcionam de graça. v1 não suporta camada rotacionada — os pontos de
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

  const cropRectRef = React.useRef<Konva.Rect | null>(null)

  // Caixa atual da camada (canvas coords)
  const box = React.useMemo(
    () => ({
      x: layer?.position?.x ?? 0,
      y: layer?.position?.y ?? 0,
      width: Math.max(1, layer?.size?.width ?? 1),
      height: Math.max(1, layer?.size?.height ?? 1),
    }),
    [layer],
  )

  // Pano de fundo D: a imagem inteira posicionada de forma que o recorte
  // VISÍVEL HOJE caia exatamente sobre a caixa da camada. kx/ky são
  // "canvas px por pixel de imagem" POR EIXO — para cover são iguais; para
  // imagem esticada (contain/fill) diferem, e o fundo aparece com a mesma
  // distorção que o usuário já vê no node.
  const backdrop = React.useMemo(() => {
    if (!image || !layer) return null
    const natural = { width: image.width, height: image.height }
    const src =
      resolveImageSourceRect(natural, { width: box.width, height: box.height }, layer.style) ?? {
        cropX: 0,
        cropY: 0,
        cropWidth: natural.width,
        cropHeight: natural.height,
      }
    const kx = box.width / src.cropWidth
    const ky = box.height / src.cropHeight
    return {
      x: box.x - src.cropX * kx,
      y: box.y - src.cropY * ky,
      width: natural.width * kx,
      height: natural.height * ky,
    }
  }, [image, layer, box])

  // Janela de recorte (canvas coords) — nasce na caixa da camada
  const [rect, setRect] = React.useState(box)
  React.useEffect(() => {
    setRect(box)
    // Reinicia só quando troca a camada em recorte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [croppingLayerId])

  const clampToBackdrop = React.useCallback(
    (next: { x: number; y: number; width: number; height: number }) => {
      if (!backdrop) return next
      const width = Math.min(next.width, backdrop.width)
      const height = Math.min(next.height, backdrop.height)
      const x = Math.min(Math.max(next.x, backdrop.x), backdrop.x + backdrop.width - width)
      const y = Math.min(Math.max(next.y, backdrop.y), backdrop.y + backdrop.height - height)
      return { x, y, width, height }
    },
    [backdrop],
  )

  const handleConfirm = React.useCallback(() => {
    if (!layer || !backdrop) return
    const finalRect = clampToBackdrop(rect)
    const crop = {
      x: (finalRect.x - backdrop.x) / backdrop.width,
      y: (finalRect.y - backdrop.y) / backdrop.height,
      width: finalRect.width / backdrop.width,
      height: finalRect.height / backdrop.height,
    }
    // Um updateLayer = um snapshot de undo: caixa nova + frações do recorte
    updateLayer(layer.id, (prev) => ({
      ...prev,
      position: { x: Math.round(finalRect.x), y: Math.round(finalRect.y) },
      size: { width: Math.round(finalRect.width), height: Math.round(finalRect.height) },
      style: { ...prev.style, crop },
    }))
    setCroppingLayerId(null)
  }, [layer, backdrop, rect, clampToBackdrop, updateLayer, setCroppingLayerId])

  const handleCancel = React.useCallback(() => {
    setCroppingLayerId(null)
  }, [setCroppingLayerId])

  // Teclado (Enter/Esc) + eventos dos botões HTML (Aplicar/Cancelar)
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

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('lagosta:crop-confirm', onConfirmEvent)
    window.addEventListener('lagosta:crop-cancel', onCancelEvent)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('lagosta:crop-confirm', onConfirmEvent)
      window.removeEventListener('lagosta:crop-cancel', onCancelEvent)
    }
  }, [handleConfirm, handleCancel])

  const handleDragMove = React.useCallback(() => {
    const node = cropRectRef.current
    if (!node) return
    const clamped = clampToBackdrop({
      x: node.x(),
      y: node.y(),
      width: node.width(),
      height: node.height(),
    })
    node.position({ x: clamped.x, y: clamped.y })
    setRect(clamped)
  }, [clampToBackdrop])

  /**
   * Redimensiona a janela arrastando uma alça de canto: o canto OPOSTO fica
   * fixo, o arrastado segue o ponteiro (limitado ao backdrop e a 20px).
   */
  const handleCornerDrag = React.useCallback(
    (corner: 'tl' | 'tr' | 'bl' | 'br') => (event: Konva.KonvaEventObject<DragEvent>) => {
      if (!backdrop) return
      const handle = event.target
      // Posição da alça em coordenadas do canvas, presa ao backdrop
      const px = Math.min(Math.max(handle.x(), backdrop.x), backdrop.x + backdrop.width)
      const py = Math.min(Math.max(handle.y(), backdrop.y), backdrop.y + backdrop.height)

      setRect((prev) => {
        const fixedX = corner === 'tl' || corner === 'bl' ? prev.x + prev.width : prev.x
        const fixedY = corner === 'tl' || corner === 'tr' ? prev.y + prev.height : prev.y
        const x1 = Math.min(px, fixedX)
        const x2 = Math.max(px, fixedX)
        const y1 = Math.min(py, fixedY)
        const y2 = Math.max(py, fixedY)
        const next = {
          x: x1,
          y: y1,
          width: Math.max(20, x2 - x1),
          height: Math.max(20, y2 - y1),
        }
        return next
      })
    },
    [backdrop],
  )

  if (!layer || !image || !backdrop) return null

  // Área "infinita" para o esmaecido fora da janela
  const BIG = 100000

  return (
    <Group name="crop-overlay">
      {/* Imagem inteira por baixo (brilho total dentro da janela, o resto
          fica sob os 4 retângulos escuros) */}
      <KonvaImage
        image={image}
        x={backdrop.x}
        y={backdrop.y}
        width={backdrop.width}
        height={backdrop.height}
        listening={false}
      />

      {/* Esmaecido fora da janela */}
      <Rect x={-BIG} y={-BIG} width={BIG * 2} height={BIG + rect.y} fill="rgba(0,0,0,0.55)" listening={false} />
      <Rect x={-BIG} y={rect.y + rect.height} width={BIG * 2} height={BIG} fill="rgba(0,0,0,0.55)" listening={false} />
      <Rect x={-BIG} y={rect.y} width={BIG + rect.x} height={rect.height} fill="rgba(0,0,0,0.55)" listening={false} />
      <Rect x={rect.x + rect.width} y={rect.y} width={BIG} height={rect.height} fill="rgba(0,0,0,0.55)" listening={false} />

      {/* Grade de terços */}
      {[1, 2].map((i) => (
        <React.Fragment key={`grid-${i}`}>
          <Line
            points={[rect.x + (rect.width * i) / 3, rect.y, rect.x + (rect.width * i) / 3, rect.y + rect.height]}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={1}
            dash={[5, 5]}
            listening={false}
          />
          <Line
            points={[rect.x, rect.y + (rect.height * i) / 3, rect.x + rect.width, rect.y + (rect.height * i) / 3]}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={1}
            dash={[5, 5]}
            listening={false}
          />
        </React.Fragment>
      ))}

      {/* Janela de recorte */}
      <Rect
        ref={cropRectRef}
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        stroke="#00a8ff"
        strokeWidth={2}
        strokeScaleEnabled={false}
        draggable
        onDragMove={handleDragMove}
      />

      {/* Alças de canto (círculos com tamanho constante em tela) */}
      {(
        [
          ['tl', rect.x, rect.y],
          ['tr', rect.x + rect.width, rect.y],
          ['bl', rect.x, rect.y + rect.height],
          ['br', rect.x + rect.width, rect.y + rect.height],
        ] as Array<['tl' | 'tr' | 'bl' | 'br', number, number]>
      ).map(([corner, cx, cy]) => (
        <Circle
          key={corner}
          x={cx}
          y={cy}
          radius={8 / (zoom || 1)}
          fill="#00a8ff"
          stroke="#ffffff"
          strokeWidth={2 / (zoom || 1)}
          draggable
          onDragMove={handleCornerDrag(corner)}
          onDragEnd={handleCornerDrag(corner)}
        />
      ))}
    </Group>
  )
}
