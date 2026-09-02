"use client"

import * as React from 'react'
import Konva from 'konva'
import { Rect } from 'react-konva'

import type { Layer } from '@/types/template'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import {
  escalaDoBlur,
  folgaDoBlur,
  raioDosCantos,
  resolverFundo,
  retanguloDasLinhas,
  retanguloDoFundo,
  type FundoResolvido,
} from '@/lib/creatives/halo/fundo-de-texto'
import { assinaturaDoBloco, papelNoBloco, retanguloDoBloco } from '@/lib/creatives/halo/bloco-de-fundo'
import type { Rect as Retangulo } from '@/lib/creatives/halo/halo'

/** Tudo que muda ONDE o texto está, com o namespace `.fundo` para o off() só tirar os nossos. */
const EVENTOS_DE_POSICAO = 'xChange.fundo yChange.fundo rotationChange.fundo scaleXChange.fundo scaleYChange.fundo'

interface FundoDoTextoProps {
  layer: Layer
  /** O Konva.Text da camada — é dele que saem as linhas (`textArr`) e a posição ao vivo. */
  textRef: React.RefObject<Konva.Text | null>
  /** A assinatura de tudo que muda o desenho do texto (a mesma do cache do Text). */
  assinaturaRender: string
  /** A opacidade que o factory calculou para a camada (visível/dimmed/style.opacity). */
  opacidadeDaCamada: number
}

/** Base do fundo (tinta ou caixa) de um Konva.Text, em coordenadas LOCAIS do nó. */
function baseDoNo(node: Konva.Text, fit: FundoResolvido['fit']): Retangulo | null {
  const caixa = { width: node.width(), height: node.height() }
  if (fit !== 'texto') return { x: 0, y: 0, width: caixa.width, height: caixa.height }
  const linhas = (node.textArr ?? []).map((l) => ({ largura: l.width, ultimaDoParagrafo: l.lastInParagraph }))
  return retanguloDasLinhas({
    linhas,
    caixa,
    align: node.align(),
    anchor: node.verticalAlign(),
    fontSize: node.fontSize(),
    lineHeight: node.lineHeight(),
    padding: node.padding(),
  })
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
 *    posição a cada commit e os eventos de ATRIBUTO do nó (`xChange`…)
 *    reposicionam o Rect no meio do gesto — inclusive no arraste em grupo, que
 *    move os irmãos com `position()` por código, sem dragmove neles.
 *  - **Desfoque nos PRÓPRIOS pixels** (`filter: blur()`, nunca
 *    `backdrop-filter`): o Konva só filtra nó cacheado, e o cache leva a folga
 *    de 3× o raio (senão o desfoque é cortado na borda) e `pixelRatio: 1/k`
 *    (`escalaDoBlur`) — o stack blur estoura int32 acima do raio ~180, e a
 *    mancha é lisa, então borrar em escala reduzida não custa nada visual.
 *
 * **Texto AGRUPADO** (bloco-de-fundo): os textos de um grupo com fundo ligado
 * dividem UMA mancha — a união das tintas, desenhada pelo LÍDER com a
 * configuração dele; os membros não desenham nada. O líder ouve a posição de
 * todos os irmãos e re-mede quando qualquer um muda.
 *
 * A opacidade vai no NÓ (não misturada na cor): mudar o slider não refaz o
 * cache do blur. O que refaz o cache é geometria, cor, cantos e raio.
 */
export function FundoDoTexto({ layer, textRef, assinaturaRender, opacidadeDaCamada }: FundoDoTextoProps) {
  const { design } = useTemplateEditor()
  const rectRef = React.useRef<Konva.Rect | null>(null)
  const fundo = React.useMemo(() => resolverFundo(layer.effects?.background), [layer.effects?.background])
  const assinaturaFundo = JSON.stringify(fundo)
  const bloco = React.useMemo(() => papelNoBloco(design.layers, layer), [design.layers, layer])
  const assinaturaBloco = bloco.papel === 'lider' ? assinaturaDoBloco(bloco.membros) : ''
  const escala = React.useMemo(() => escalaDoBlur(fundo?.blur ?? 0), [fundo?.blur])
  const filters = React.useMemo(() => (escala.raioNoBuffer > 0 ? [Konva.Filters.Blur] : undefined), [escala.raioNoBuffer])

  /** Os Konva.Text dos membros do bloco (o próprio nó para esta camada). */
  const nosDoBloco = React.useCallback((): Konva.Text[] => {
    const node = textRef.current
    if (!node) return []
    if (bloco.papel !== 'lider') return [node]
    const stage = node.getStage()
    const nos: Konva.Text[] = []
    for (const membro of bloco.membros) {
      if (membro.id === layer.id) {
        nos.push(node)
        continue
      }
      const outro = stage?.findOne(`#${membro.id}`)
      if (outro instanceof Konva.Text) nos.push(outro)
    }
    return nos
  }, [bloco, layer.id, textRef])

  /**
   * Geometria a partir dos NÓS (não do estado): posição, rotação e, no ajuste
   * pela tinta, as linhas que o Konva quebrou. Devolve false quando não há o
   * que desenhar (texto vazio no ajuste pela tinta).
   */
  const aplicarGeometria = React.useCallback((): boolean => {
    const rect = rectRef.current
    const node = textRef.current
    if (!rect || !node || !fundo) return false

    if (bloco.papel === 'lider') {
      // Bases em coordenadas da PÁGINA (sem rotação: texto girado não entra em
      // bloco), união crescida pela borda, e o Rect posicionado na página
      const bases: Retangulo[] = []
      for (const no of nosDoBloco()) {
        const base = baseDoNo(no, fundo.fit)
        if (!base) continue
        bases.push({ x: base.x + no.x(), y: base.y + no.y(), width: base.width, height: base.height })
      }
      const r = retanguloDoBloco(fundo, bases)
      if (!r || r.width <= 0 || r.height <= 0) {
        rect.visible(false)
        return false
      }
      rect.setAttrs({
        visible: true,
        x: r.x,
        y: r.y,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        offsetX: 0,
        offsetY: 0,
        width: r.width,
        height: r.height,
        cornerRadius: raioDosCantos(fundo, r),
      })
      return true
    }

    const caixa = { width: node.width(), height: node.height() }
    const tinta = fundo.fit === 'texto' ? baseDoNo(node, 'texto') : null
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
  }, [fundo, textRef, bloco.papel, nosDoBloco])

  const refazerCache = React.useCallback(() => {
    const rect = rectRef.current
    if (!rect) return
    rect.clearCache()
    if (rect.visible() && rect.width() > 0 && rect.height() > 0 && escala.raioNoBuffer > 0) {
      rect.cache({
        pixelRatio: 1 / escala.k,
        offset: folgaDoBlur(fundo?.blur ?? 0),
        imageSmoothingEnabled: true,
      })
    }
    rect.getLayer()?.batchDraw()
  }, [escala, fundo?.blur])

  // 🔴 O Konva.Text é IRMÃO POSTERIOR deste componente: no primeiro commit,
  // os efeitos daqui rodam ANTES de o ref do texto ser ligado (React liga
  // refs e roda layout effects na ordem da árvore). Sem isto, página aberta
  // com halo salvo ficava com o Rect em 0×0 — invisível e com "Can not cache
  // the node" no console — até a próxima mudança da camada. Um frame depois
  // o ref existe; `pronto` reexecuta geometria, cache e assinatura de eventos.
  const [pronto, setPronto] = React.useState(false)
  React.useLayoutEffect(() => {
    if (pronto) return
    if (textRef.current) {
      setPronto(true)
      return
    }
    const id = requestAnimationFrame(() => setPronto(true))
    return () => cancelAnimationFrame(id)
  }, [pronto, textRef])

  // Geometria + cache a cada mudança do texto (a assinatura já inclui o tick
  // das fontes), da posição gravada, do próprio fundo e — no líder — dos
  // irmãos do bloco. Layout effect: o Konva já aplicou os atributos dos
  // Texts neste commit, então o textArr é o desta renderização.
  const tamanhoRef = React.useRef('')
  React.useLayoutEffect(() => {
    if (!fundo || bloco.papel === 'membro') return
    aplicarGeometria()
    refazerCache()
    const rect = rectRef.current
    tamanhoRef.current = rect ? `${Math.round(rect.width())}x${Math.round(rect.height())}` : ''
  }, [pronto, assinaturaRender, assinaturaFundo, assinaturaBloco, layer.position?.x, layer.position?.y, layer.rotation, aplicarGeometria, refazerCache, fundo, bloco.papel])

  // No meio do gesto. Texto sozinho: só posição/rotação/escala — o cache (que
  // é local ao nó) continua válido. Líder: um irmão pode ter se movido em
  // relação aos outros, então a união é refeita e o cache só quando o TAMANHO
  // mudou (arraste em grupo move tudo junto: tamanho igual, sem re-cache).
  //
  // 🔴 Eventos de ATRIBUTO (`xChange`…), não `dragmove`/`transform`: o arraste
  // em grupo do stage move os outros membros com `otherNode.position(...)`,
  // imperativo, sem evento de drag nesses nós — só o texto agarrado disparava
  // dragmove e o halo dos irmãos ficava parado até soltar. `Node._setAttr`
  // dispara `<attr>Change` em qualquer escrita (drag, transform, alinhamento,
  // position() por código), então isto cobre todos os caminhos de uma vez.
  React.useEffect(() => {
    const node = textRef.current
    if (!node || !fundo || !pronto || bloco.papel === 'membro') return
    const nos = nosDoBloco()
    const seguir =
      bloco.papel === 'lider'
        ? () => {
            if (!aplicarGeometria()) return
            const rect = rectRef.current
            if (!rect) return
            const tamanho = `${Math.round(rect.width())}x${Math.round(rect.height())}`
            if (tamanho !== tamanhoRef.current) {
              tamanhoRef.current = tamanho
              refazerCache()
            }
          }
        : () => {
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
    for (const no of nos) no.on(EVENTOS_DE_POSICAO, seguir)
    return () => {
      for (const no of nos) no.off(EVENTOS_DE_POSICAO)
    }
  }, [textRef, fundo, pronto, bloco.papel, nosDoBloco, aplicarGeometria, refazerCache])

  if (!fundo || bloco.papel === 'membro') return null

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
