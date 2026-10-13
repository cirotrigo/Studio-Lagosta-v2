import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * H5 do Dot — a IDENTIDADE da leva sob duas rodadas simultâneas. Duas instâncias do agente (ou um retry que
 * chegou junto) compõem o mesmo buraco com o mesmo loteId/itemId determinísticos: tem de nascer UMA peça. O
 * banco falso reproduz o que o `reservarItemDeLote` usa do Postgres: a chave única (P2002 para quem perde o
 * create) e a trava de linha (FOR UPDATE serializa quem chega depois). A decisão é a real (`identidade.ts`).
 */

const banco = vi.hoisted(() => ({
  linhas: new Map<string, Record<string, any>>(),
  geracoes: new Map<string, Record<string, any>>(),
  jobs: new Map<string, Record<string, any>>(),
  travas: new Map<string, Promise<void>>(),
  seq: 0,
}))

vi.mock('@/lib/db', () => {
  const chave = (d: { projectId: number; loteId: string; itemId: string }) => `${d.projectId}|${d.loteId}|${d.itemId}`
  const escolher = (l: Record<string, any> | undefined) => (l ? { ...l } : null)
  const delegados = {
    itemDeLote: {
      create: async ({ data }: any) => {
        await Promise.resolve()
        if ([...banco.linhas.values()].some((l) => chave(l as never) === chave(data))) throw Object.assign(new Error('unique'), { code: 'P2002' })
        const id = `linha-${++banco.seq}`
        banco.linhas.set(id, { id, generationId: null, jobId: null, ...data })
        return escolher(banco.linhas.get(id))
      },
      findUnique: async ({ where }: any) => {
        if (where.id) return escolher(banco.linhas.get(where.id))
        return escolher([...banco.linhas.values()].find((l) => chave(l as never) === chave(where.projectId_loteId_itemId)))
      },
      updateMany: async ({ where, data }: any) => {
        const l = banco.linhas.get(where.id)
        if (!l || l.generationId !== where.generationId) return { count: 0 }
        const { tentativas, ...resto } = data
        banco.linhas.set(where.id, { ...l, ...resto })
        return { count: 1 }
      },
    },
    generation: { findUnique: async ({ where }: any) => escolher(banco.geracoes.get(where.id)) },
    generationJob: { findUnique: async ({ where }: any) => escolher([...banco.jobs.values()].find((j) => j.generationId === where.generationId)) },
  }
  return {
    db: {
      ...delegados,
      $transaction: async (fazer: (tx: unknown) => Promise<unknown>) => {
        const soltar: Array<() => void> = []
        try {
          return await fazer({
            ...delegados,
            // A trava de LINHA do Postgres: quem pede a mesma linha espera o commit de quem a tem.
            $queryRaw: async (_partes: TemplateStringsArray, id: string) => {
              const anterior = banco.travas.get(id) ?? Promise.resolve()
              let liberar!: () => void
              const minha = new Promise<void>((r) => (liberar = r))
              banco.travas.set(id, anterior.then(() => minha))
              await anterior
              soltar.push(liberar)
              return []
            },
          })
        } finally {
          for (const s of soltar) s()
        }
      },
    },
  }
})

import { reservarItemDeLote } from '../reserva'

const identidade = { loteId: 'dot-6-2026-S38', itemId: '2026-09-14T19:00-story' }
const payload = { formato: 'story', blocos: [{ papel: 'headline', linhas: ['Espeto corrido'] }], quando: '2026-09-14 19:00' }
const criados: string[] = []
const criar = async (tx: any) => {
  await new Promise((r) => setTimeout(r, 5)) // o trabalho sob a trava (Generation + job) leva tempo
  const generationId = `gen-${++banco.seq}`
  banco.geracoes.set(generationId, { id: generationId, status: 'PROCESSING', resultUrl: null })
  const jobId = `job-${banco.seq}`
  banco.jobs.set(jobId, { id: jobId, generationId, status: 'PENDING' })
  criados.push(generationId)
  void tx
  return { generationId, jobId }
}

beforeEach(() => {
  banco.linhas.clear()
  banco.geracoes.clear()
  banco.jobs.clear()
  banco.travas.clear()
  banco.seq = 0
  criados.length = 0
})

describe('duas rodadas simultâneas na mesma identidade da leva', () => {
  it('o mesmo pedido ao mesmo tempo: UMA peça, as duas rodadas recebem a mesma', async () => {
    const [a, b] = await Promise.all([
      reservarItemDeLote({ projectId: 6, identidade, payload, criar }),
      reservarItemDeLote({ projectId: 6, identidade, payload, criar }),
    ])
    expect(criados).toHaveLength(1)
    expect(a.generationId).toBe(b.generationId)
    expect([a.desfecho, b.desfecho].sort()).toEqual(['criado', 'reaproveitado'])
    expect(banco.linhas.size).toBe(1)
  })

  it('conteúdo diferente na mesma identidade: a segunda é CONFLITO, nunca uma segunda peça independente', async () => {
    const outro = { ...payload, blocos: [{ papel: 'headline', linhas: ['Outra manchete'] }] }
    const resultados = await Promise.allSettled([
      reservarItemDeLote({ projectId: 6, identidade, payload, criar }),
      reservarItemDeLote({ projectId: 6, identidade, payload: outro, criar }),
    ])
    expect(criados).toHaveLength(1)
    const recusada = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(recusada.reason).toMatchObject({ code: 'LOTE_ITEM_CONFLITO' })
  })

  it('a rodada seguinte (sem memória) repete o pedido: reaproveita, nada novo', async () => {
    const primeira = await reservarItemDeLote({ projectId: 6, identidade, payload, criar })
    const segunda = await reservarItemDeLote({ projectId: 6, identidade, payload, criar })
    expect(segunda).toMatchObject({ generationId: primeira.generationId, desfecho: 'reaproveitado' })
    expect(criados).toHaveLength(1)
  })
})
