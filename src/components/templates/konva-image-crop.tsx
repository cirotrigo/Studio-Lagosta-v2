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
  const groupRef = React.useRef<Konva.Group | null>(null)

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

  /**
   * Retângulo VISÍVEL, em coordenadas do canvas.
   *
   * No modo contínuo (padrão do desktop) o stage tem o tamanho exato da página:
   * tudo que a imagem tem para fora dela é cortado pela borda do stage —
   * inclusive as alças dos cantos, que ficavam inalcançáveis assim que a foto
   * passava a ser maior que a página (ou seja, quase sempre). É por isso que as
   * alças são desenhadas presas a esta janela.
   *
   * Sai do próprio stage e não de `design.canvas`: no modo clássico o stage é
   * do tamanho do CONTAINER, então ali sobra área em volta da página — e ela
   * muda quando a janela é redimensionada.
   */
  const [view, setView] = React.useState<Rect | null>(null)
  const viewRef = React.useRef<Rect | null>(null)
  viewRef.current = view

  const medirView = React.useCallback(() => {
    const stage = groupRef.current?.getStage()
    if (!stage) return
    const escala = stage.scaleX() || 1
    const proximo: Rect = {
      x: -stage.x() / escala,
      y: -stage.y() / escala,
      width: stage.width() / escala,
      height: stage.height() / escala,
    }
    setView((anterior) =>
      anterior &&
      Math.abs(anterior.x - proximo.x) < 0.5 &&
      Math.abs(anterior.y - proximo.y) < 0.5 &&
      Math.abs(anterior.width - proximo.width) < 0.5 &&
      Math.abs(anterior.height - proximo.height) < 0.5
        ? anterior
        : proximo,
    )
  }, [])

  React.useEffect(() => {
    medirView()
    // O zoom do modo clássico é aplicado no stage por um efeito do COMPONENTE
    // PAI, que roda depois deste — sem o frame seguinte, a medição sairia com a
    // escala anterior a cada mudança de zoom
    const frame = requestAnimationFrame(medirView)
    const container = groupRef.current?.getStage()?.container()
    const observer = container ? new ResizeObserver(() => medirView()) : null
    if (container && observer) observer.observe(container)
    window.addEventListener('resize', medirView)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', medirView)
    }
    // canvas.width/height: trocar o formato da página (painel Redimensionar)
    // muda o tamanho do stage no modo contínuo — a janela precisa ser remedida
  }, [medirView, zoom, image, design.canvas.width, design.canvas.height])

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

  // Estado corrente para o reposicionamento da alça no fim do gesto (o React
  // só reaplica x/y quando o valor muda, e o Konva deixa o círculo onde o
  // ponteiro largou)
  const imageRectRef = React.useRef(imageRect)
  imageRectRef.current = imageRect

  const handleScaleEnd = React.useCallback(
    (event: KonvaEventObject<DragEvent>, index: number) => {
      scaleStartRef.current = null
      const rect = imageRectRef.current
      if (!rect) return
      const canto = [
        [rect.x, rect.y],
        [rect.x + rect.width, rect.y],
        [rect.x, rect.y + rect.height],
        [rect.x + rect.width, rect.y + rect.height],
      ][index]
      const janela = viewRef.current
      const raio = 8 / (zoom || 1)
      const folga = raio + 4 / (zoom || 1)
      event.target.position(
        janela
          ? {
              x: Math.min(Math.max(canto[0], janela.x + folga), janela.x + janela.width - folga),
              y: Math.min(Math.max(canto[1], janela.y + folga), janela.y + janela.height - folga),
            }
          : { x: canto[0], y: canto[1] },
      )
      event.target.getLayer()?.batchDraw()
    },
    [zoom],
  )

  if (!layer || !image || !imageRect) return null

  // Área "infinita" para o esmaecido fora da moldura
  const BIG = 100000
  const handleRadius = 8 / (zoom || 1)
  const traco = 2 / (zoom || 1)

  // Alça presa à janela visível: o canto verdadeiro fica marcado pelo contorno
  // tracejado da foto, mas o ponto de arrastar nunca sai da tela
  const margem = handleRadius + 4 / (zoom || 1)
  const emVista = (x: number, y: number): [number, number] => {
    if (!view) return [x, y]
    return [
      Math.min(Math.max(x, view.x + margem), view.x + view.width - margem),
      Math.min(Math.max(y, view.y + margem), view.y + view.height - margem),
    ]
  }

  return (
    <Group name="crop-overlay" ref={groupRef}>
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

      {/* Arestas da FOTO INTEIRA: é o que dá noção do tamanho real e de quanto
          sobra para cada lado. Duas linhas sobrepostas porque uma branca some
          em foto clara e uma escura some em foto escura. */}
      <Rect
        x={imageRect.x}
        y={imageRect.y}
        width={imageRect.width}
        height={imageRect.height}
        stroke="rgba(0,0,0,0.65)"
        strokeWidth={traco * 2}
        dash={[10 / (zoom || 1), 7 / (zoom || 1)]}
        listening={false}
      />
      <Rect
        x={imageRect.x}
        y={imageRect.y}
        width={imageRect.width}
        height={imageRect.height}
        stroke="rgba(255,255,255,0.95)"
        strokeWidth={traco}
        dash={[10 / (zoom || 1), 7 / (zoom || 1)]}
        listening={false}
      />

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

      {/* Alças dos cantos da IMAGEM: aproximar/afastar */}
      {(
        [
          [imageRect.x, imageRect.y],
          [imageRect.x + imageRect.width, imageRect.y],
          [imageRect.x, imageRect.y + imageRect.height],
          [imageRect.x + imageRect.width, imageRect.y + imageRect.height],
        ] as Array<[number, number]>
      ).map(([cantoX, cantoY], index) => {
        const [cx, cy] = emVista(cantoX, cantoY)
        const presaNaBorda = cx !== cantoX || cy !== cantoY
        return (
          <React.Fragment key={`scale-${index}`}>
            {/* Canto fora da tela: uma linha liga a alça ao canto real */}
            {presaNaBorda && (
              <Line
                points={[cx, cy, cantoX, cantoY]}
                stroke="rgba(255,255,255,0.5)"
                strokeWidth={traco / 2}
                listening={false}
              />
            )}
            <Circle
              x={cx}
              y={cy}
              radius={handleRadius}
              fill="#ffffff"
              stroke="#00a8ff"
              strokeWidth={traco}
              shadowColor="rgba(0,0,0,0.6)"
              shadowBlur={6 / (zoom || 1)}
              draggable
              onDragStart={handleScaleStart}
              onDragMove={handleScaleMove}
              onDragEnd={(event) => handleScaleEnd(event, index)}
            />
          </React.Fragment>
        )
      })}
    </Group>
  )
}
