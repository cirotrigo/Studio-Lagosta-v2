/**
 * Revisão FINAL do Codex sobre abac9b34 (18/09/2026) — a copy do ITEM DE PLANO
 * pelo serviço real (`atualizarItem`), com o banco em memória:
 *  - PR3-F06: o espelho posicional preserva as strings do contrato (nada de
 *    `trim`), e reenviar o próprio espelho não revisa nada;
 *  - PR3-F07: remover só o contrato (`copyAutoral: null`) mantém a lista;
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
import { copyDoItemNovo } from '../copy-do-item'
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

describe('o espelho posicional é exato (PR3-F06)', () => {
  it('o item criado reenvia o próprio espelho (como a bancada o salva junto de outro campo): contrato igual, nenhuma revisão', async () => {
    const criado = copyDoItemNovo({ copyAutoral: contrato })
    expect(criado.copyProposta).toEqual(['\nOlá\n', '  Sexta é dia  '])
    banco.item = itemCom(criado.copyAutoral, criado.copyProposta)
    // a bancada filtra só o vazio (`para-bancada.ts`), nunca apara
    const daBancada = criado.copyProposta.filter((b) => b.trim() !== '')
    await editar({ copyProposta: daBancada, legenda: 'nova legenda' })
    expect(banco.item.copyAutoral).toEqual(contrato)
    expect(banco.item.copyProposta).toEqual(criado.copyProposta)
    expect(banco.item.legenda).toBe('nova legenda')
  })

  it('controle: edição real pela lista continua virando revisão da equipe, com as strings como vieram', async () => {
    banco.item = itemCom(contrato, copyDoItemNovo({ copyAutoral: contrato }).copyProposta)
    await editar({ copyProposta: ['\nOi\n', '  Sexta é dia  '] })
    const lido = lerCopyAutoral(banco.item.copyAutoral).copy!
    expect(lido.blocos.find((b) => b.id === 'headline')!.linhas).toEqual(['', 'Oi', ''])
    expect(lido.revisoes).toHaveLength(1)
    expect(lido.revisoes[0]).toMatchObject({ autor: 'equipe', blocos: ['headline'] })
  })
})

describe('remover só o contrato não apaga a copy (PR3-F07)', () => {
  it('`{ copyAutoral: null }` sozinho: contrato sai, a lista fica como estava', async () => {
    const lista = copyDoItemNovo({ copyAutoral: contrato }).copyProposta
    banco.item = itemCom(contrato, lista)
    const r = await editar({ copyAutoral: null })
    expect(banco.item.copyAutoral).toBeNull()
    expect(banco.item.copyProposta).toEqual(lista)
    expect(r.avisos.join(' ')).toMatch(/removido/)
  })

  it('controle: `{ copyAutoral: null, copyProposta: [] }` limpa a lista também, porque foi pedido', async () => {
    banco.item = itemCom(contrato, ['x'])
    await editar({ copyAutoral: null, copyProposta: [] })
    expect(banco.item.copyAutoral).toBeNull()
    expect(banco.item.copyProposta).toEqual([])
  })
})
