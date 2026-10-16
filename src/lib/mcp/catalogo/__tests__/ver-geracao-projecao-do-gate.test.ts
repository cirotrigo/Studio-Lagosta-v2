/**
 * CP5b § 6 — H11b: a PROJEÇÃO do banco de `ver-geracao` (banco falso). O `select` da Generation inclui os campos de
 * hoje + `projectId`; o da página inclui os de hoje + os de `identidadeDaPagina`, com `Template: { projectId }` no
 * `where` (página de outro projeto continua indisponível → `gate` ilegível); o resto do retorno é o de hoje.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  generation: null as Record<string, any> | null,
  pagina: null as Record<string, any> | null,
  selects: { generation: null as Record<string, unknown> | null, pagina: null as Record<string, unknown> | null, wherePagina: null as Record<string, unknown> | null },
}))

vi.mock('@/lib/db', () => ({
  db: {
    generation: {
      findFirst: async ({ where, select }: { where: { id: string; projectId: number }; select: Record<string, unknown> }) => {
        banco.selects.generation = select
        const g = banco.generation
        if (!g || g.id !== where.id || g.projectId !== where.projectId) return null
        return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, g[k] ?? null]))
      },
    },
    page: {
      findFirst: async ({ where, select }: { where: { id: string; Template?: { projectId?: number } }; select: Record<string, unknown> }) => {
        banco.selects.pagina = select
        banco.selects.wherePagina = where
        const p = banco.pagina
        // Filtra por projeto só se a consulta pedir: sem `Template: { projectId }` no handler, a página de outro projeto é devolvida.
        if (!p || p.id !== where.id || (where.Template?.projectId !== undefined && p.projectId !== where.Template.projectId)) return null
        return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, p[k] ?? null]))
      },
    },
    socialPost: { findFirst: async () => null },
  },
}))
vi.mock('@prisma/client', async () => await import('../../../../../prisma/generated/client'))

import '@/lib/db'
import { toolsDeArteIA } from '../arte-ia'
import { PAGINA_LIMPA, decidirOk } from '@/lib/creatives/revisao/__tests__/suporte/pagina-limpa'

const verGeracao = toolsDeArteIA.find((t) => t.nome === 'ver-geracao')!
const PROJETO = 8
const PAGINA = { ...PAGINA_LIMPA, projectId: PROJETO, templateId: 412, isTemplate: false }
const registro = () => JSON.parse(JSON.stringify(decidirOk().registro))

beforeEach(() => {
  banco.generation = { id: 'gen-1', projectId: PROJETO, status: 'COMPLETED', resultUrl: 'https://blob.test/a.png', fieldValues: { source: 'compositor', pageId: 'pg-1', gateDaArte: registro() }, createdAt: new Date(), completedAt: new Date(), sourceGenerationId: null }
  banco.pagina = { ...PAGINA }
  banco.selects = { generation: null, pagina: null, wherePagina: null }
})

const chamar = async () => (await verGeracao.handler({ projectId: PROJETO, geracaoId: 'gen-1' }, { kind: 'service' } as never)) as Record<string, any>

describe('H11b — a projeção de ver-geracao', () => {
  it('lê a Generation com os campos de hoje + projectId e a página com os de hoje + os da identidade, filtrada por projeto; o gate sai coincidente e o resto igual', async () => {
    const r = await chamar()
    expect(Object.keys(banco.selects.generation!).sort()).toEqual(['completedAt', 'createdAt', 'fieldValues', 'id', 'projectId', 'resultUrl', 'sourceGenerationId', 'status'])
    expect(Object.keys(banco.selects.pagina!).sort()).toEqual(['background', 'copyAutoral', 'height', 'id', 'isTemplate', 'layers', 'name', 'tags', 'templateId', 'width'])
    expect(banco.selects.wherePagina).toEqual({ id: 'pg-1', Template: { projectId: PROJETO } })
    expect(r.situacao).toBe('pronta')
    expect(r.pageId).toBe('pg-1')
    expect(r.editUrl).toContain('/templates/412/editor?pageId=pg-1')
    expect(r.comoAgendar).toContain('pageId "pg-1"')
    expect(r.gate).toMatchObject({ validade: 'coincidente', resultado: 'APTO', origem: 'piloto' })
  })

  it('página de OUTRO projeto ou sumida → gate ilegível (sem resultado) e a página marcada como indisponível, como hoje', async () => {
    banco.pagina = { ...PAGINA, projectId: 9 }
    const r = await chamar()
    expect(r.gate).toMatchObject({ validade: 'ilegivel' })
    expect(r.gate).not.toHaveProperty('resultado')
    expect(r.paginaApagada).toBe(true)
    banco.pagina = null
    expect((await chamar()).gate).toMatchObject({ validade: 'ilegivel' })
  })

  it('arte sem registro → gate: null (não APTO, não pendente); em andamento e falhou também trazem o bloco', async () => {
    banco.generation!.fieldValues = { source: 'compositor', pageId: 'pg-1' }
    expect((await chamar()).gate).toBeNull()
    banco.generation!.status = 'PROCESSING'
    expect((await chamar()).gate).toBeNull()
    banco.generation!.status = 'FAILED'
    banco.generation!.fieldValues = { source: 'compositor', pageId: 'pg-1', error: 'x', gateDaArte: registro() }
    expect((await chamar()).gate).toMatchObject({ validade: 'coincidente' })
  })
})
