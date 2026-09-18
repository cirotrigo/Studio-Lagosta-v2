/**
 * PR3-F04 (revisão FINAL do Codex sobre abac9b34, 18/09/2026): duas edições
 * concorrentes do mesmo ITEM DE PLANO, pelo serviço real (`atualizarItem`) e
 * o banco em memória, não apagam a revisão uma da outra — a escrita é
 * condicionada à versão lida (`updatedAt`); perdida a corrida, o item é relido
 * e a edição recalculada sobre ele, e só depois de insistir é recusada (409).
 *  - PR3-F04: duas edições concorrentes não apagam a revisão uma da outra.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  item: null as any,
  relogio: 1_000,
  escritas: 0,
  /** Roda uma vez ANTES da N-ésima escrita do item. */
  antesDaEscrita: {} as Record<number, () => Promise<void>>,
}))

vi.mock('@/lib/db', async () => {
  const { Prisma } = await import('../../../../prisma/generated/client')
  // `Prisma.DbNull` é como o serviço limpa a coluna Json — no banco vira null.
  const aplicar = (data: Record<string, unknown>) => {
    const semDbNull = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === Prisma.DbNull ? null : v]))
    banco.item = { ...banco.item, ...semDbNull, updatedAt: new Date(++banco.relogio) }
  }
  const antes = async () => {
    const n = ++banco.escritas
    const fn = banco.antesDaEscrita[n]
    delete banco.antesDaEscrita[n]
    if (fn) await fn()
  }
  return {
    db: {
      project: { findUnique: async () => ({ id: 8 }) },
      itemDePlano: {
        findFirst: async () => structuredClone(banco.item),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          await antes()
          aplicar(data)
          return structuredClone(banco.item)
        },
        updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date }; data: Record<string, unknown> }) => {
          await antes()
          if (where.updatedAt && where.updatedAt.getTime() !== banco.item.updatedAt.getTime()) return { count: 0 }
          aplicar(data)
          return { count: 1 }
        },
      },
    },
  }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))

import { VERSAO_DO_CONTRATO, lerCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'
import { atualizarItem } from '../plano-service'

const contrato: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['', 'Olá', ''] },
    { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['  Sexta é dia  '] },
    { id: 'cta', funcao: 'cta', ordem: 2, linhas: [] },
  ],
  revisoes: [],
}

function itemCom(copy: CopyAutoral | null, lista: string[]) {
  return { id: 'item-1', planoId: 'plano-1', projectId: 8, ordem: 0, status: 'proposto', legenda: null, copyAutoral: copy, copyProposta: lista, updatedAt: new Date(banco.relogio), plano: { id: 'plano-1', status: 'ativo', inicio: new Date('2026-09-07T03:00:00Z'), fim: new Date('2026-09-14T02:59:59Z') } }
}

const editar = (patch: Record<string, unknown>, autorDaCopy?: 'claude' | 'equipe') => atualizarItem({ projectId: 8, planoId: 'plano-1', itemId: 'item-1', patch: patch as never, ...(autorDaCopy ? { autorDaCopy } : {}) })

beforeEach(() => {
  banco.escritas = 0
  banco.antesDaEscrita = {}
})


describe('edições concorrentes do item preservam o histórico (PR3-F04)', () => {
  const simples: CopyAutoral = {
    ...contrato,
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake'] },
      { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Sexta é dia'] },
    ],
  }

  it('A (chat) e B (bancada) leem o mesmo contrato; B grava no meio de A: as duas revisões ficam no histórico', async () => {
    banco.item = itemCom(simples, ['Milk-shake', 'Sexta é dia'])
    banco.antesDaEscrita[1] = async () => {
      await editar({ copyProposta: ['Milk-shake', 'Sábado também'] }, 'equipe')
    }
    await editar({ copyProposta: ['Milk-shake em dobro', 'Sexta é dia'] }, 'claude')
    const lido = lerCopyAutoral(banco.item.copyAutoral).copy!
    expect(lido.revisoes.map((r) => r.autor)).toEqual(['equipe', 'claude'])
    // a lista inteira de A é a última escrita (último a gravar vence, como sempre foi) — e o contrato a descreve
    expect(lido.blocos.map((b) => b.linhas)).toEqual([['Milk-shake em dobro'], ['Sexta é dia']])
    expect(banco.item.copyProposta).toEqual(['Milk-shake em dobro', 'Sexta é dia'])
  })

  it('perdendo a corrida sempre, a edição é recusada com 409 explícito — nada é gravado por cima', async () => {
    banco.item = itemCom(simples, ['Milk-shake', 'Sexta é dia'])
    for (let n = 1; n <= 10; n++) banco.antesDaEscrita[n] = async () => { banco.item = { ...banco.item, updatedAt: new Date(++banco.relogio) } }
    const antes = structuredClone(banco.item.copyAutoral)
    await expect(editar({ copyProposta: ['Milk-shake', 'Outro'] })).rejects.toMatchObject({ code: 'ITEM_MUDOU_DURANTE', status: 409 })
    expect(banco.item.copyAutoral).toEqual(antes)
  })
})
