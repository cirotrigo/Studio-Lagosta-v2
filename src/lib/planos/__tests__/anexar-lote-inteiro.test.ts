/**
 * Anexar à leva ativa normaliza o LOTE INTEIRO antes de escrever (RB-01 da
 * revisão do rebase, 21/09/2026). O serviço é o real
 * (`anexarItensAoPlanoAtivo`); o banco é falso, mas guarda o que foi gravado —
 * é isso que faz "nenhuma criação" ser uma afirmação e não uma esperança.
 *
 * O defeito: `normalizarItem` rodava DENTRO do laço de gravação, então um lote
 * com o item 2 recusado deixava o item 1 no banco, a chamada falhava sem
 * devolver os ids, e reenviar a leva corrigida duplicava o item 1. Sem leva em
 * aberto, ainda sobrava uma leva vazia criada para nada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  planos: [] as Array<Record<string, any>>,
  itens: [] as Array<Record<string, any>>,
  seq: 0,
}))

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: async () => ({ id: 8 }), findMany: async () => [] },
    planoDeConteudo: {
      findFirst: async ({ where }: { where: Record<string, any> }) => {
        const plano = banco.planos.find(
          (p) => p.projectId === where.projectId && (where.id ? p.id === where.id : p.status === 'ativo'),
        )
        return plano ? { ...plano, itens: banco.itens.filter((i) => i.planoId === plano.id) } : null
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        const plano = { id: `plano-${++banco.seq}`, status: 'ativo', ...data, itens: undefined }
        banco.planos.push(plano)
        for (const item of data.itens?.create ?? []) {
          banco.itens.push({ id: `item-${++banco.seq}`, planoId: plano.id, status: 'proposto', ...item })
        }
        return { ...plano, itens: banco.itens.filter((i) => i.planoId === plano.id) }
      },
    },
    itemDePlano: {
      create: async ({ data }: { data: Record<string, any> }) => {
        const item = { id: `item-${++banco.seq}`, status: 'proposto', ...data }
        banco.itens.push(item)
        return { id: item.id }
      },
    },
    generation: { findMany: async () => [] },
  },
}))
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))

import { VERSAO_DO_CONTRATO, type CopyAutoral } from '@/lib/copy-autoral'
import type { CreativeError } from '@/lib/creatives/errors'
import { anexarItensAoPlanoAtivo } from '../plano-service'

function contrato(headline: string): CopyAutoral {
  return {
    versao: VERSAO_DO_CONTRATO,
    origem: { autor: 'claude', em: '2026-09-21T10:00:00.000Z', superficie: 'chat' },
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: [headline] },
      { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Hoje a partir das 19h'] },
    ],
    revisoes: [],
  }
}

/** O lote que o achado descreve: o primeiro item bom, o segundo com um contrato que o schema genérico da tool deixa passar. */
const LOTE_COM_O_SEGUNDO_QUEBRADO = [
  { formato: 'story' as const, copyAutoral: contrato('Primeiro') },
  { formato: 'story' as const, copyAutoral: {} },
]
const LOTE_CORRIGIDO = [
  { formato: 'story' as const, copyAutoral: contrato('Primeiro') },
  { formato: 'story' as const, copyAutoral: contrato('Segundo') },
]

function planoAtivoNoBanco() {
  banco.planos.push({
    id: 'plano-vivo',
    projectId: 8,
    status: 'ativo',
    titulo: 'Semana',
    inicio: new Date('2026-09-21T03:00:00Z'),
    fim: new Date('2026-09-28T02:59:59Z'),
  })
}

async function recusa(p: Promise<unknown>): Promise<CreativeError> {
  try {
    await p
  } catch (erro) {
    return erro as CreativeError
  }
  throw new Error('esperava recusa')
}

beforeEach(() => {
  banco.planos = []
  banco.itens = []
  banco.seq = 0
})

describe('anexar à leva ativa: o lote inteiro é normalizado antes de escrever', () => {
  it('COM leva em aberto: o 2º contrato inválido recusa o lote e NÃO deixa o 1º item no banco; o reenvio corrigido grava exatamente dois', async () => {
    planoAtivoNoBanco()

    const erro = await recusa(anexarItensAoPlanoAtivo({ projectId: 8, itens: LOTE_COM_O_SEGUNDO_QUEBRADO }))
    expect(erro.code).toBe('COPY_AUTORAL_INVALIDA')
    expect(erro.message).toContain('item 2')
    expect(banco.itens).toHaveLength(0) // ← o 1º item NÃO foi criado

    const { criados } = await anexarItensAoPlanoAtivo({ projectId: 8, itens: LOTE_CORRIGIDO })

    expect(criados).toHaveLength(2)
    expect(banco.itens).toHaveLength(2) // ← nada duplicado
    expect(banco.itens.map((i) => i.planoId)).toEqual(['plano-vivo', 'plano-vivo'])
    // contrato e espelho preservados, item a item
    expect((banco.itens[0].copyAutoral as CopyAutoral).blocos[0].linhas).toEqual(['Primeiro'])
    expect((banco.itens[1].copyAutoral as CopyAutoral).blocos[0].linhas).toEqual(['Segundo'])
    expect(banco.itens[0].copyProposta).toEqual(['Primeiro', 'Hoje a partir das 19h'])
    expect(banco.itens[1].copyProposta).toEqual(['Segundo', 'Hoje a partir das 19h'])
    expect(banco.itens.map((i) => i.ordem)).toEqual([0, 1])
  })

  it('SEM leva em aberto: o lote recusado não cria a leva automática; o reenvio corrigido cria UMA leva com os dois itens', async () => {
    const erro = await recusa(anexarItensAoPlanoAtivo({ projectId: 8, itens: LOTE_COM_O_SEGUNDO_QUEBRADO }))
    expect(erro.code).toBe('COPY_AUTORAL_INVALIDA')
    expect(banco.planos).toHaveLength(0) // ← nenhuma leva vazia deixada para trás
    expect(banco.itens).toHaveLength(0)

    const { criados, plano } = await anexarItensAoPlanoAtivo({ projectId: 8, itens: LOTE_CORRIGIDO })

    expect(banco.planos).toHaveLength(1)
    expect(criados).toHaveLength(2)
    expect(banco.itens).toHaveLength(2)
    expect(banco.itens.every((i) => i.planoId === plano.id)).toBe(true)
    expect((banco.itens[1].copyAutoral as CopyAutoral).blocos[0].linhas).toEqual(['Segundo'])
  })

  it('a recusa por ITEM não é só do contrato: formato, via e escopo também derrubam o lote inteiro sem gravar nada', async () => {
    planoAtivoNoBanco()

    for (const [campo, item] of [
      ['formato', { formato: 'retrato' }],
      ['via', { formato: 'story', via: 'mágica' }],
      ['escopo', { formato: 'story', escopo: 'urgente' }],
    ] as const) {
      const erro = await recusa(
        anexarItensAoPlanoAtivo({ projectId: 8, itens: [{ formato: 'story', copyAutoral: contrato('Primeiro') }, item as never] }),
      )
      expect(erro.status, campo).toBe(400)
      expect(banco.itens, campo).toHaveLength(0)
    }
  })

  it('CONTROLE: lote inteiro válido continua gravando — a correção não é "nunca grava"', async () => {
    planoAtivoNoBanco()
    const { criados, avisos } = await anexarItensAoPlanoAtivo({ projectId: 8, itens: LOTE_CORRIGIDO })
    expect(criados).toHaveLength(2)
    expect(banco.itens).toHaveLength(2)
    expect(avisos).toEqual([])
  })
})
