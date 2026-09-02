"use client"

import * as React from 'react'
import Konva from 'konva'
import { Rect } from 'react-konva'

import type { Layer } from '@/types/template'
import {
  escalaDoBlur,
  folgaDoBlur,
  raioDosCantos,
  resolverFundo,
  retanguloDasLinhas,
  retanguloDoFundo,
} from '@/lib/creatives/halo/fundo-de-texto'

interface FundoDoTextoProps {
  layer: Layer
  /** O Konva.Text da camada — é dele que saem as linhas (`textArr`) e a posição ao vivo. */
  textRef: React.RefObject<Konva.Text | null>
  /** A assinatura de tudo que muda o desenho do texto (a mesma do cache do Text). */
  assinaturaRender: string
  /** A opacidade que o factory calculou para a camada (visível/dimmed/style.opacity). */
  opacidadeDaCamada: number
}

/**
 * O fundo (ou HALO) atrás de um texto — `effects.background`.
 *
 * É um `Rect` IRMÃO do `Konva.Text`, desenhado antes dele (fica por baixo) e
 * fora do cache do texto — o blur do texto não o alcança, e o dele não alcança
 * o texto. Três coisas que o Rect inline antigo não fazia:
 *
 *  - **`fit: 'texto'` mede a TINTA** pelo `textArr` do próprio Konva (a
 *    quebra que o texto de fato usa) e passa por `retanguloDasLinhas` — a
 *    mesma função que o render server-side usa com as linhas dele. É o
 *    `width: fit-content` do halo do canvas de design.
 *  - **Segue o texto durante o arraste.** O Rect antigo lia `layer.position`
 *    do estado React, que só muda no `dragend` — o fundo ficava parado e
 *    pulava ao soltar. Aqui a geometria é IMPERATIVA: o efeito aplica a
 *    posição a cada commit e os eventos `dragmove`/`transform` do nó de texto
 *    reposicionam o Rect no meio do gesto.
 *  - **Desfoque nos PRÓPRIOS pixels** (`filter: blur()`, nunca
 *    `backdrop-filter`): o Konva só filtra nó cacheado, e o cache leva a folga
 *    de 3× o raio (senão o desfoque é cortado na borda) e `pixelRatio: 1/k`
 *    (`escalaDoBlur`) — o stack blur estoura int32 acima do raio ~180, e a
 *    mancha é lisa, então borrar em escala reduzida não custa nada visual.
 *
 * A opacidade vai no NÓ (não misturada na cor): mudar o slider não refaz o
 * cache do blur. O que refaz o cache é geometria, cor, cantos e raio.
 */
export function FundoDoTexto({ layer, textRef, assinaturaRender, opacidadeDaCamada }: FundoDoTextoProps) {
  const rectRef = React.useRef<Konva.Rect | null>(null)
  const fundo = React.useMemo(() => resolverFundo(layer.effects?.background), [layer.effects?.background])
  const assinaturaFundo = JSON.stringify(fundo)
  const escala = React.useMemo(() => escalaDoBlur(fundo?.blur ?? 0), [fundo?.blur])
  const filters = React.useMemo(() => (escala.raioNoBuffer > 0 ? [Konva.Filters.Blur] : undefined), [escala.raioNoBuffer])

  /**
   * Geometria a partir do NÓ (não do estado): posição, rotação e, no ajuste
   * pela tinta, as linhas que o Konva quebrou. Devolve false quando não há o
   * que desenhar (texto vazio no ajuste pela tinta).
   */
  const aplicarGeometria = React.useCallback((): boolean => {
    const rect = rectRef.current
    const node = textRef.current
    if (!rect || !node || !fundo) return false

    const caixa = { width: node.width(), height: node.height() }
    let tinta = null
    if (fundo.fit === 'texto') {
      const linhas = (node.textArr ?? []).map((l) => ({ largura: l.width, ultimaDoParagrafo: l.lastInParagraph }))
      tinta = retanguloDasLinhas({
        linhas,
        caixa,
        align: node.align(),
        anchor: node.verticalAlign(),
        fontSize: node.fontSize(),
        lineHeight: node.lineHeight(),
        padding: node.padding(),
      })
    }
    const r = retanguloDoFundo(fundo, caixa, tinta)
    if (!r || r.width <= 0 || r.height <= 0) {
      rect.visible(false)
      return false
    }
    // O Rect gira em torno da origem do texto (como o texto): posição e
    // rotação do nó, e o retângulo local entra como offset NEGATIVO
    rect.setAttrs({
      visible: true,
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      offsetX: -r.x,
      offsetY: -r.y,
      width: r.width,
      height: r.height,
      cornerRadius: raioDosCantos(fundo, r),
    })
    return true
  }, [fundo, textRef])

  const refazerCache = React.useCallback(() => {
    const rect = rectRef.current
    if (!rect) return
    rect.clearCache()
    if (rect.visible() && escala.raioNoBuffer > 0) {
      rect.cache({
        pixelRatio: 1 / escala.k,
        offset: folgaDoBlur(fundo?.blur ?? 0),
        imageSmoothingEnabled: true,
      })
    }
    rect.getLayer()?.batchDraw()
  }, [escala, fundo?.blur])

  // Geometria + cache a cada mudança do texto (a assinatura já inclui o tick
  // das fontes), da posição gravada e do próprio fundo. Layout effect: o
  // Konva já aplicou os atributos do Text neste commit, então o textArr é o
  // desta renderização.
  React.useLayoutEffect(() => {
    if (!fundo) return
    aplicarGeometria()
    refazerCache()
  }, [assinaturaRender, assinaturaFundo, layer.position?.x, layer.position?.y, layer.rotation, aplicarGeometria, refazerCache])

  // No meio do gesto: só posição/rotação/escala — o cache (que é local ao nó)
  // continua válido. A tinta nova de um resize chega no transformend, quando o
  // estado muda e o efeito de cima roda.
  React.useEffect(() => {
    const node = textRef.current
    if (!node || !fundo) return
    const seguir = () => {
      const rect = rectRef.current
      if (!rect) return
      rect.setAttrs({
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      })
    }
    node.on('dragmove.fundo transform.fundo', seguir)
    return () => {
      node.off('dragmove.fundo transform.fundo')
    }
  }, [textRef, fundo])

  if (!fundo) return null

  return (
    <Rect
      ref={rectRef}
      fill={fundo.color}
      opacity={Math.max(0, Math.min(1, fundo.opacity * opacidadeDaCamada))}
      listening={false}
      perfectDrawEnabled={false}
      filters={filters}
      blurRadius={escala.raioNoBuffer}
    />
  )
}
