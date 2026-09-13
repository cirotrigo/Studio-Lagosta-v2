/**
 * As recusas do contrato da copy no plano viram 4xx em português, com o que
 * fazer — nunca 500 (restack sobre o PR2-01/PR2-02, `e3c1f75f`). O serviço é o
 * real (`criarPlano`, `atualizarItem`); o banco é falso.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ item: null as any, updates: [] as Array<Record<string, unknown>>, criados: 0 }))

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: async () => ({ id: 8 }) },
    planoDeConteudo: {
      create: async () => {
        banco.criados++
        return { id: 'plano-1', itens: [] }
      },
    },
    itemDePlano: {
      findFirst: async () => structuredClone(banco.item),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        banco.updates.push(data)
        return { ...banco.item, ...data }
      },
    },
  },
}))
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))

import { MAX_REVISOES_DA_COPY, ORIENTACAO_LINHA_LONGA, VERSAO_DO_CONTRATO, type CopyAutoral } from '@/lib/copy-autoral'
import { CreativeError } from '@/lib/creatives/errors'
import { atualizarItem, criarPlano } from '../plano-service'

const LINHA_301 = 'x'.repeat(301)

function contratoCom(revisoes: number, apoio = 'Sexta é dia'): CopyAutoral {
  return {
    versao: VERSAO_DO_CONTRATO,
    origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake'] },
      { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: [apoio] },
    ],
    revisoes: Array.from({ length: revisoes }, () => ({ em: '2026-09-12T11:00:00.000Z', autor: 'equipe' as const, motivo: 'edição', superficie: 'bancada', blocos: ['apoio'], campos: { apoio: ['linhas'] } })),
  }
}

function itemCom(contrato: CopyAutoral) {
  return { id: 'item-1', planoId: 'plano-1', projectId: 8, ordem: 0, status: 'proposto', copyAutoral: contrato, copyProposta: ['Milk-shake', 'Sexta é dia'], plano: { id: 'plano-1', status: 'ativo', inicio: new Date('2026-09-07T03:00:00Z'), fim: new Date('2026-09-14T02:59:59Z') } }
}

async function falha(p: Promise<unknown>): Promise<CreativeError> {
  try {
    await p
  } catch (erro) {
    return erro as CreativeError
  }
  throw new Error('esperava recusa')
}

beforeEach(() => {
  banco.updates = []
  banco.criados = 0
})

describe('plano — recusas do contrato da copy são 4xx com o que fazer', () => {
  it('edição da lista num item com o histórico CHEIO: 409 COPY_HISTORICO_CHEIO, em português, e nada é gravado', async () => {
    banco.item = itemCom(contratoCom(MAX_REVISOES_DA_COPY))
    const erro = await falha(atualizarItem({ projectId: 8, planoId: 'plano-1', itemId: 'item-1', patch: { copyProposta: ['Milk-shake', 'Sábado também'] } }))
    expect(erro).toBeInstanceOf(CreativeError)
    expect(erro.code).toBe('COPY_HISTORICO_CHEIO')
    expect(erro.status).toBe(409)
    expect(erro.message).toMatch(/limite de 200 revisões/)
    expect(erro.message).toMatch(/mande a copy inteira como contrato novo/)
    expect(banco.updates).toHaveLength(0)
  })

  it('controle: com 199 revisões a mesma edição vira a 200ª revisão, gravada', async () => {
    banco.item = itemCom(contratoCom(MAX_REVISOES_DA_COPY - 1))
    const r = await atualizarItem({ projectId: 8, planoId: 'plano-1', itemId: 'item-1', patch: { copyProposta: ['Milk-shake', 'Sábado também'] } })
    expect(banco.updates).toHaveLength(1)
    expect((banco.updates[0].copyAutoral as CopyAutoral).revisoes).toHaveLength(MAX_REVISOES_DA_COPY)
    expect(r.avisos).toEqual([])
  })

  it('linha de 301 caracteres num item NOVO com contrato: 400 COPY_AUTORAL_INVALIDA dizendo para quebrar a linha, e o plano não é criado', async () => {
    const erro = await falha(
      criarPlano({ projectId: 8, inicio: '2026-09-07', fim: '2026-09-13', itens: [{ formato: 'story', copyAutoral: contratoCom(0, LINHA_301) }] } as never),
    )
    expect(erro.code).toBe('COPY_AUTORAL_INVALIDA')
    expect(erro.status).toBe(400)
    expect(erro.message).toContain('do item 1')
    expect(erro.message).toContain(ORIENTACAO_LINHA_LONGA)
    expect(banco.criados).toBe(0)
  })

  it('linha de 301 caracteres na edição da LISTA: nunca 500 — o contrato é descartado com aviso que manda quebrar a linha', async () => {
    banco.item = itemCom(contratoCom(0))
    const r = await atualizarItem({ projectId: 8, planoId: 'plano-1', itemId: 'item-1', patch: { copyProposta: ['Milk-shake', LINHA_301] } })
    expect(banco.updates).toHaveLength(1)
    expect(banco.updates[0].copyProposta).toEqual(['Milk-shake', LINHA_301])
    expect(r.avisos.join(' ')).toContain(ORIENTACAO_LINHA_LONGA)
  })
})
