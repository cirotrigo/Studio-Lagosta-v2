/**
 * PR3-R9-03 (revisão do Codex sobre cd98cd6d, 20/09/2026): contrato aceito na
 * CRIAÇÃO não podia ser editado pela bancada. O schema HTTP do PATCH aceitava
 * 12 strings de 2.000 caracteres, e o espelho do contrato chega a 40 blocos de
 * 3.611 (12 linhas de 300 + as quebras): criar o item com um `copyAutoral`
 * VÁLIDO de 13 blocos — ou com um bloco de 7 linhas cheias — e mexer num
 * caractere no modal voltava 400, sem chegar ao serviço.
 *
 * O caminho inteiro: criação com contrato → card → modal → patch → **handler
 * HTTP real** → serviço. O teste do modal (`atualizar-item-copy.test.ts`) liga
 * as funções direto ao serviço e pula justamente este schema.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ item: null as any, relogio: 1_000 }))

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_equipe', orgId: null }) }))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async () => ({ id: 8 }),
  hasProjectWriteAccess: () => true,
}))
vi.mock('@/lib/db', async () => {
  const { Prisma } = await import('../../../../../../../../../../prisma/generated/client')
  const aplicar = (data: Record<string, unknown>) => {
    const semDbNull = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === Prisma.DbNull ? null : v]))
    banco.item = { ...banco.item, ...semDbNull, updatedAt: new Date(++banco.relogio) }
  }
  return {
    db: {
      user: { findUnique: async () => ({ id: 'user-interno' }) },
      project: { findUnique: async () => ({ id: 8 }) },
      itemDePlano: {
        findFirst: async () => structuredClone(banco.item),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          aplicar(data)
          return structuredClone(banco.item)
        },
        updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date }; data: Record<string, unknown> }) => {
          if (where.updatedAt && where.updatedAt.getTime() !== banco.item.updatedAt.getTime()) return { count: 0 }
          aplicar(data)
          return { count: 1 }
        },
      },
    },
  }
})
vi.mock('@prisma/client', async () => await import('../../../../../../../../../../prisma/generated/client'))

import { PATCH } from '../route'
import { VERSAO_DO_CONTRATO, lerCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'
import { copyDoItemNovo } from '@/lib/planos/copy-do-item'
import { blocosParaEdicao, copyDaEdicao, paraItemDaBancada, patchDaEdicaoDoItem } from '@/lib/planos/para-bancada'

const origem = { autor: 'claude', em: '2026-09-20T10:00:00.000Z', superficie: 'chat' } as const
const bloco = (n: number, linhas: string[]) => ({ id: `b${n}`, funcao: 'livre' as const, ordem: n, linhas })

/** 13 blocos com texto: o espelho passa dos 12 itens que o schema antigo aceitava. */
const treiseBlocos: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem,
  blocos: Array.from({ length: 13 }, (_, i) => bloco(i, [`Bloco número ${i + 1}`])),
  revisoes: [],
}
/** Um bloco de 7 linhas de 300: o espelho passa dos 2.000 caracteres por item. */
const linhaCheia = (c: string) => c.repeat(300)
const blocoGordo: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem,
  blocos: [bloco(0, ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(linhaCheia))],
  revisoes: [],
}

const req = (body: unknown) => ({ json: async () => structuredClone(body) }) as unknown as Request
const params = Promise.resolve({ projectId: '8', planoId: 'plano-1', itemId: 'item-1' })

function comContrato(copy: CopyAutoral) {
  const criado = copyDoItemNovo({ copyAutoral: copy })
  banco.item = {
    id: 'item-1',
    planoId: 'plano-1',
    projectId: 8,
    ordem: 0,
    status: 'proposto',
    legenda: null,
    copyAutoral: criado.copyAutoral,
    copyProposta: criado.copyProposta,
    updatedAt: new Date(banco.relogio),
    plano: { id: 'plano-1', status: 'ativo', inicio: new Date('2026-09-14T03:00:00Z'), fim: new Date('2026-09-21T02:59:59Z') },
  }
  return criado
}

/** O gesto real: card → um campo por bloco → a pessoa mexe → patch da fila. */
function doModal(editar: (campos: string[]) => string[]) {
  const card = paraItemDaBancada({ ...banco.item, formato: 'story', via: 'ia' } as never, { id: 'plano-1', projectId: 8 } as never)
  const campos = editar(blocosParaEdicao(card.copy))
  const { copy, editada } = copyDaEdicao(card.copy, campos)
  return patchDaEdicaoDoItem({ copy, copyEditada: editada, legenda: null, pedido: '', instrucaoImagem: null, referencias: card.referencias })
}

beforeEach(() => {
  banco.item = null
})

describe('o PATCH aceita o espelho que o contrato produz (PR3-R9-03)', () => {
  it('13 blocos com texto: um caractere editado no modal chega ao serviço, com o texto integral e UMA revisão', async () => {
    const criado = comContrato(treiseBlocos)
    expect(criado.copyProposta).toHaveLength(13)

    const patch = doModal((c) => [...c.slice(0, 12), `${c[12]}!`])
    expect((patch as { copyProposta?: string[] }).copyProposta).toHaveLength(13)

    const r = await PATCH(req(patch), { params })
    expect(r.status).toBe(200)

    const lido = lerCopyAutoral(banco.item.copyAutoral).copy!
    expect(lido.blocos.map((b) => b.linhas)).toEqual([
      ...Array.from({ length: 12 }, (_, i) => [`Bloco número ${i + 1}`]),
      ['Bloco número 13!'],
    ])
    expect(lido.revisoes).toHaveLength(1)
    expect(lido.revisoes[0]).toMatchObject({ autor: 'equipe', blocos: ['b12'] })
  })

  it('um bloco de 7 linhas de 300: idem, sem perder um caractere', async () => {
    const criado = comContrato(blocoGordo)
    expect(criado.copyProposta![0]).toHaveLength(7 * 300 + 6)

    // A troca é de UM caractere (não um a mais): o contrato não aceita linha
    // de 301, e acrescentar seria pedir o que ele recusa — outro assunto.
    const patch = doModal((c) => [`${c[0].slice(0, -1)}!`])
    const r = await PATCH(req(patch), { params })
    expect(r.status).toBe(200)

    const lido = lerCopyAutoral(banco.item.copyAutoral).copy!
    expect(lido.blocos[0].linhas).toEqual(['a', 'b', 'c', 'd', 'e', 'f'].map(linhaCheia).concat([`${linhaCheia('g').slice(0, -1)}!`]))
    expect(lido.revisoes).toHaveLength(1)
    expect(lido.revisoes[0]).toMatchObject({ autor: 'equipe', blocos: ['b0'] })
  })

  it('controle: além do que o CONTRATO comporta, o schema continua recusando com 400', async () => {
    comContrato(treiseBlocos)
    const r = await PATCH(req({ copyProposta: Array.from({ length: 41 }, (_, i) => `bloco ${i}`) }), { params })
    expect(r.status).toBe(400)
    expect(banco.item.copyProposta).toHaveLength(13)
  })
})
