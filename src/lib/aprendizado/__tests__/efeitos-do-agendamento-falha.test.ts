/**
 * R12-02 (revisão final do PR 12): o sinal que o banco derruba NÃO lança — a
 * captura engole o erro — e o lote só sabe que o registro do agendamento não
 * terminou pelo RETORNO. Este arquivo prova, pelo caminho real até o banco, o
 * elo que o harness do lote não alcança: a copy de uma peça de plano fecha a
 * DICA (`registrarCopyDoPost` → `fecharDicaDeCopyDaPagina` →
 * `fecharDicaDeCopyDoItem` → `registrarDesfecho`), e o desfecho que o banco não
 * gravou era devolvido como `fechada`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ falharDesfecho: false, desfechos: [] as Array<Record<string, unknown>> }))

vi.mock('@/lib/db', () => ({
  db: {
    itemDePlano: {
      findMany: async () => [{ id: 'item-1', pageId: 'page-1', generationId: 'gen-1', updatedAt: new Date('2026-09-10T12:00:00.000Z') }],
      findFirst: async () => ({ sugestaoId: 'slot-1', quando: null, campaignId: null, sourcePageId: null }),
    },
    learningSignal: {
      findFirst: async () => ({ id: 'dica-1', sugerido: { blocos: ['Manchete 1'] } }),
      findUnique: async () => ({ desfecho: null }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (banco.falharDesfecho) throw new Error('a conexão com o banco caiu no meio do desfecho')
        banco.desfechos.push(data)
        return { count: 1 }
      },
      upsert: async () => {
        throw new Error('a copy de uma peça de plano fecha a dica — nunca abre decisão nova')
      },
    },
  },
}))

import { registrarCopyDoPost } from '../sinal-de-agendamento'

const copyDoPost = () =>
  registrarCopyDoPost({ projectId: 6, postId: 'post-1', copyFinal: { headline: 'Manchete 1' }, pageId: 'page-1', generationId: 'gen-1' })

beforeEach(() => {
  banco.falharDesfecho = false
  banco.desfechos = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('R12-02 — a copy de peça de plano que o banco não gravou', () => {
  it('devolve false quando o desfecho da dica cai no banco (antes voltava como fechada, e o lote carimbava os efeitos)', async () => {
    banco.falharDesfecho = true
    expect(await copyDoPost()).toBe(false)
    expect(banco.desfechos).toEqual([])
  })

  it('controle: com o banco são o desfecho da dica é gravado e o registro terminou', async () => {
    expect(await copyDoPost()).toBe(true)
    expect(banco.desfechos).toEqual([expect.objectContaining({ desfecho: 'aceita-como-veio' })])
  })
})
