'use client'

/**
 * Fila da bancada — os itens que o operador está produzindo agora.
 *
 * O item nasce RASCUNHO no navegador (foto + copy + papéis, antes de gastar
 * crédito): é o que permite montar a leva inteira e revisar antes de gerar,
 * como na bancada do insta-automatico. A partir do "Gerar", a verdade passa a
 * ser o banco — o item guarda só o `generationId` e o resto vem de lá.
 *
 * localStorage e não tabela nova: o que se perde é um rascunho AINDA não
 * gerado em outro dispositivo, e é o mesmo contrato da fila de melhorias que
 * já roda em produção. Arte gerada, post agendado — o que importa — já são
 * duráveis no banco.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PapelReferencia } from '@/components/creatives/arte-ia-image-picker'

export type BancadaStatus = 'rascunho' | 'gerando' | 'pronto' | 'erro' | 'agendado'

export interface BancadaReferencia {
  papel: PapelReferencia
  driveFileId?: string
  url?: string
  label?: string
  thumbUrl: string
}

export interface BancadaItem {
  id: string
  projectId: number
  trilha: 'arte' | 'imagem'
  formato: 'story' | 'feed' | 'quadrado'
  copy: string[]
  pedido: string
  instrucaoImagem?: string | null
  referencias: BancadaReferencia[]
  /** Horário planejado (slot da cadência ou escolha manual), "YYYY-MM-DD HH:mm". */
  quando?: string | null
  /** Por que este horário (motivo do slot) — some quando o operador escolhe à mão. */
  motivoDoSlot?: string | null
  status: BancadaStatus
  criadoEm: number
  /** Generation no servidor, a partir do "Gerar". */
  generationId?: string
  resultUrl?: string | null
  erro?: string | null
  /** Post criado ao agendar — o card vira "agendado" e sai do caminho. */
  postId?: string
}

export type NovoItem = Omit<BancadaItem, 'id' | 'status' | 'criadoEm'>

interface BancadaState {
  itens: BancadaItem[]
  hidratou: boolean

  adicionar: (input: NovoItem) => string
  atualizar: (id: string, patch: Partial<BancadaItem>) => void
  remover: (id: string) => void
  limparFinalizados: (projectId: number) => void
  setHidratou: (v: boolean) => void
}

const STORAGE_KEY = 'lagosta.bancada'

function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

export const useBancadaStore = create(
  persist<BancadaState>(
    (set) => ({
      itens: [],
      hidratou: false,

      adicionar: (input) => {
        const id = novoId()
        set((state) => ({
          itens: [{ ...input, id, status: 'rascunho', criadoEm: Date.now() }, ...state.itens],
        }))
        return id
      },

      atualizar: (id, patch) =>
        set((state) => ({
          itens: state.itens.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })),

      remover: (id) => set((state) => ({ itens: state.itens.filter((i) => i.id !== id) })),

      limparFinalizados: (projectId) =>
        set((state) => ({
          itens: state.itens.filter(
            (i) => i.projectId !== projectId || (i.status !== 'agendado' && i.status !== 'erro'),
          ),
        })),

      setHidratou: (v) => set({ hidratou: v }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ itens: state.itens } as BancadaState),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('[bancada] erro ao reidratar a fila', error)
        if (state) {
          // Item que ficou "gerando" ao recarregar continua gerando NO
          // SERVIDOR — o polling reata pelo generationId. Sem generationId,
          // porém, o clique se perdeu antes do POST: volta a rascunho para
          // não ficar um card girando para sempre.
          state.itens = state.itens.map((i) =>
            i.status === 'gerando' && !i.generationId ? { ...i, status: 'rascunho' } : i,
          )
          state.setHidratou(true)
        }
      },
    },
  ),
)

/** Itens de um projeto, mais recentes primeiro (é fila, não grade). */
export function selecionarItensDoProjeto(projectId: number) {
  return (state: BancadaState) => state.itens.filter((i) => i.projectId === projectId)
}
