"use client"

/**
 * G3 · ajustes da grade no editor.
 *
 * `useAjustarGrade`: decide o alvo ANTES de medir (grade, assinatura de todos os membros, página, documento, geração),
 * mede cada foto pela URL EXATA com o medidor do G1/G2 (prazo de 20 s, cancelamento; `dimensoesDaFotoCarregada`
 * recusa a medida de outra URL), em fila de no máximo 2 por vez (Q2: a grade de 28 fotos), e aplica pelo contexto,
 * que confere tudo de novo DENTRO do updater. Um pedido por vez por instância. Avisa o motivo de toda recusa (menos
 * "nada a mudar").
 *
 * `useArrasteDaGrade`: a cola do stage. Num arraste que toca grade, a posição que cada nó grava sozinho é consumida;
 * as irmãs da célula arrastada andam juntas no Konva; ao soltar, UMA operação (`moverSelecao`) move tudo — os proxies
 * do Transformer soltam no mesmo instante e não movem de novo. Recusa devolve os nós do Konva ao lugar.
 */
import * as React from 'react'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { toast } from '@/hooks/use-toast'
import { dimensoesDaFotoCarregada } from '@/lib/image-fit'
import { medirFotoNoNavegador, type MedidorDeFoto } from '@/lib/grades/medir-foto'
import { medirEmFila } from '@/lib/grades/fila-de-medidas'
import { celulaVinculada, participantesDoArraste, type DesfechoDoAjuste } from '@/lib/grades/ajustes'
import type { MudancaDeGrade } from '@/lib/grades/operacoes'
import type { Layer } from '@/types/template'

/** Recusa explica (menos "nada a mudar" e cancelado); sucesso só fala quando há aviso (fotos que sobraram avulsas) */
export function avisarDesfecho(r: DesfechoDoAjuste) {
  if (!r.ok) {
    if (r.codigo !== 'SEM_MUDANCA' && r.codigo !== 'CANCELADO') toast({ variant: 'destructive', description: r.mensagem })
  } else if (r.aviso) {
    toast({ description: r.aviso })
  }
}

export function useAjustarGrade({ medirFoto = medirFotoNoNavegador }: { medirFoto?: MedidorDeFoto } = {}) {
  const { planejarAjusteDaGrade, aplicarAjusteDaGrade } = useTemplateEditor()
  const [emVoo, setEmVoo] = React.useState(false)
  const controladorRef = React.useRef<AbortController | null>(null)

  const ajustar = React.useCallback(
    async (gradeId: string, mudanca: MudancaDeGrade): Promise<DesfechoDoAjuste> => {
      if (controladorRef.current) return { ok: false, codigo: 'EM_ANDAMENTO', mensagem: 'Espere o ajuste anterior da grade terminar.' }
      const plano = planejarAjusteDaGrade(gradeId)
      if (plano.tipo !== 'grade') {
        const recusa: DesfechoDoAjuste = { ok: false, codigo: plano.codigo, mensagem: plano.mensagem }
        avisarDesfecho(recusa)
        return recusa
      }
      const controlador = new AbortController()
      controladorRef.current = controlador
      setEmVoo(true)
      try {
        const base = typeof window === 'undefined' ? undefined : window.location.href
        const dimensoes = new Map<string, { width: number; height: number }>()
        const fotos = await medirEmFila(plano.alvo.urls, medirFoto, { signal: controlador.signal })
        for (const url of plano.alvo.urls) {
          const natural = dimensoesDaFotoCarregada(fotos.get(url), url, base)
          if (natural) dimensoes.set(url, natural)
        }
        const r = await aplicarAjusteDaGrade(plano.alvo, mudanca, dimensoes, controlador.signal)
        avisarDesfecho(r)
        return r
      } finally {
        if (controladorRef.current === controlador) controladorRef.current = null
        setEmVoo(false)
      }
    },
    [planejarAjusteDaGrade, aplicarAjusteDaGrade, medirFoto],
  )
  const cancelar = React.useCallback(() => controladorRef.current?.abort(), [])
  return { ajustar, emVoo, cancelar }
}

/** O pedaço do nó/stage do Konva que o arraste usa */
export interface NoDoArraste {
  x(): number
  y(): number
  position(p: { x: number; y: number }): unknown
}
export interface PalcoDoArraste {
  findOne(seletor: string): NoDoArraste | null | undefined
}

export function useArrasteDaGrade() {
  const { design, selectedLayerIds, moverSelecao } = useTemplateEditor()
  const soltandoRef = React.useRef(false)
  const layers = design.layers

  const participantes = React.useCallback(
    (layerId: string) => participantesDoArraste(layers, selectedLayerIds.includes(layerId) ? selectedLayerIds : [layerId]),
    [layers, selectedLayerIds],
  )
  const comGrade = React.useCallback((ids: string[]) => layers.some((l) => ids.includes(l.id) && celulaVinculada(l)), [layers])

  /** O nó quer gravar a própria geometria: célula vinculada nunca grava sozinha; no arraste com grade, quem grava é `soltar` */
  const consumirGeometria = React.useCallback(
    (layerId: string, updates: Partial<Layer>) => {
      const camada = layers.find((l) => l.id === layerId)
      if (camada && celulaVinculada(camada)) return Boolean(updates.position || updates.size || updates.rotation !== undefined)
      const soPosicao = Object.keys(updates).length === 1 && !!updates.position
      return soPosicao && comGrade(participantes(layerId))
    },
    [layers, comGrade, participantes],
  )

  /** Durante o arraste com grade: os outros participantes andam o mesmo delta do nó arrastado (só no Konva) */
  const acompanhar = React.useCallback(
    (layer: Layer, no: NoDoArraste, stage: PalcoDoArraste | null | undefined) => {
      const ids = participantes(layer.id)
      if (!stage || !comGrade(ids)) return false
      const origem = layers.find((l) => l.id === layer.id) ?? layer
      const dx = no.x() - (origem.position?.x ?? 0)
      const dy = no.y() - (origem.position?.y ?? 0)
      for (const id of ids) {
        if (id === layer.id) continue
        const outra = layers.find((l) => l.id === id)
        const n = stage.findOne(`#${id}`)
        if (outra && n) n.position({ x: (outra.position?.x ?? 0) + dx, y: (outra.position?.y ?? 0) + dy })
      }
      return true
    },
    [layers, comGrade, participantes],
  )

  /** Fim do arraste com grade: UMA operação; os proxies do mesmo gesto só são consumidos. `false` = sem grade */
  const soltar = React.useCallback(
    (layer: Layer, stage: PalcoDoArraste | null | undefined) => {
      const ids = participantes(layer.id)
      if (!comGrade(ids)) return false
      if (soltandoRef.current) return true
      soltandoRef.current = true
      setTimeout(() => {
        soltandoRef.current = false
      }, 0)
      const lugar = ids.map((id) => [id, layers.find((l) => l.id === id)?.position] as const)
      const devolver = () => {
        for (const [id, p] of lugar) {
          const n = stage?.findOne(`#${id}`)
          if (n && p) n.position({ x: p.x, y: p.y })
        }
      }
      const origem = layers.find((l) => l.id === layer.id) ?? layer
      const no = stage?.findOne(`#${layer.id}`)
      const dx = no ? Math.round(no.x() - (origem.position?.x ?? 0)) : 0
      const dy = no ? Math.round(no.y() - (origem.position?.y ?? 0)) : 0
      if (dx === 0 && dy === 0) {
        devolver()
        return true
      }
      void moverSelecao(ids, dx, dy).then((r) => {
        if (r.ok) return
        devolver()
        avisarDesfecho(r)
      })
      return true
    },
    [layers, comGrade, participantes, moverSelecao],
  )

  return React.useMemo(() => ({ consumirGeometria, acompanhar, soltar }), [consumirGeometria, acompanhar, soltar])
}
