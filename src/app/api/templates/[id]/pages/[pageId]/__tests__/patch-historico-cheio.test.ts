/**
 * PR2-02 (`e3c1f75f`) no autosave do editor: com o contrato da página em 200
 * revisões, `aplicarRevisao` RECUSA a 201ª (`HistoricoDaCopyCheio`). O PATCH não
 * pode virar 500 nem perder o que a pessoa editou: as camadas são gravadas, o
 * contrato fica EXATAMENTE como estava (nunca um contrato que a releitura
 * rejeita) e a resposta traz o aviso.
 *
 * O handler real, com o banco em memória (o mesmo contrato do Prisma que o
 * teste C3-02 usa: `findUnique` + compare-and-set por `updateMany`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ pagina: null as any, relogio: 1_000 }))

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
  after: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_equipe', orgId: null }) }))
vi.mock('@/lib/templates/access', () => ({
  fetchTemplateWithProject: async () => ({ id: 77, Project: { id: 8 } }),
  hasTemplateReadAccess: () => true,
  hasTemplateWriteAccess: () => true,
}))
vi.mock('@/lib/aprendizado/captura', () => ({ registrarDecisaoSemSugestao: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/fechar-copy-por-pagina', () => ({ caiNaEscolhaPropria: () => false, fecharDicaDeCopyDaPagina: vi.fn(async () => null) }))
vi.mock('@/lib/posts/invalidate-renders', async () => ({
  invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }),
  normalizeLayersString: (await import('@/lib/posts/page-layers')).normalizeLayersString,
}))
vi.mock('@/lib/db', () => {
  const copia = () => structuredClone(banco.pagina)
  const db: Record<string, any> = {
    page: {
      findFirst: async () => copia(),
      findUnique: async ({ select }: { select?: Record<string, boolean> } = {}) => {
        const p = copia()
        if (!select) return p
        return Object.fromEntries(Object.keys(select).map((k) => [k, p[k] ?? null]))
      },
      updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date }; data: Record<string, unknown> }) => {
        if (where.updatedAt && where.updatedAt.getTime() !== banco.pagina.updatedAt.getTime()) return { count: 0 }
        banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
        return { count: 1 }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
        return copia()
      },
    },
    user: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db }
})

import { PATCH } from '../route'
import { MAX_REVISOES_DA_COPY, ORIENTACAO_LINHA_LONGA, VERSAO_DO_CONTRATO, lerCopyAutoral, serializarCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'

type Camada = Record<string, any>

function texto(id: string, y: number, content: string): Camada {
  return { id, name: id, type: 'text', content, visible: true, locked: false, order: y, position: { x: 100, y }, size: { width: 800, height: 60 }, style: { fontSize: 40 }, metadata: { compositor: { papel: id } } }
}

function contratoCom(revisoes: number): CopyAutoral {
  return {
    versao: VERSAO_DO_CONTRATO,
    origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
    blocos: [
      { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake'] },
      { id: 'cta', funcao: 'cta', ordem: 1, linhas: ['Conheça nossos pacotes'] },
    ],
    revisoes: Array.from({ length: revisoes }, (_, i) => ({ em: `2026-09-12T10:${String(i % 60).padStart(2, '0')}:00.000Z`, autor: 'equipe' as const, motivo: `edição ${i + 1}`, superficie: 'editor', blocos: ['cta'], campos: { cta: ['linhas'] } })),
  }
}

async function patch(camadas: Camada[]) {
  const request = new Request('http://studio.test/api/templates/77/pages/p1', { method: 'PATCH', body: JSON.stringify({ layers: camadas }) })
  return (await PATCH(request, { params: Promise.resolve({ id: '77', pageId: 'p1' }) })) as unknown as { status: number; body: any }
}

function paginaCom(contrato: CopyAutoral) {
  return { id: 'p1', templateId: 77, name: 'Peça', width: 1080, height: 1920, background: '#101010', isTemplate: false, tags: [], thumbnail: null, audio: null, order: 1, updatedAt: new Date(banco.relogio), layers: JSON.stringify([texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes')]), copyAutoral: serializarCopyAutoral(contrato) }
}

const editadas = () => [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Fale com a gente')]

beforeEach(() => {
  banco.relogio = 1_000
})

describe('PR2-02 no PATCH da página — histórico da copy cheio no autosave', () => {
  it('201ª revisão: 200, as camadas editadas são gravadas, o contrato fica idêntico e a resposta avisa', async () => {
    banco.pagina = paginaCom(contratoCom(MAX_REVISOES_DA_COPY))
    const contratoAntes = banco.pagina.copyAutoral
    const r = await patch(editadas())
    expect(r.status).toBe(200)
    expect((JSON.parse(banco.pagina.layers) as Camada[]).find((c) => c.id === 'cta')!.content).toBe('Fale com a gente')
    expect(banco.pagina.copyAutoral).toEqual(contratoAntes)
    const relido = lerCopyAutoral(banco.pagina.copyAutoral)
    expect(relido.problemas).toEqual([])
    expect(relido.copy!.revisoes).toHaveLength(MAX_REVISOES_DA_COPY)
    expect(r.body.avisoDaCopy).toMatch(/limite de 200 revisões/)
    expect(r.body.avisoDaCopy).toContain('"cta"')
  })

  it('controle: com 199 revisões a edição entra como a 200ª, assinada pela equipe, sem aviso', async () => {
    banco.pagina = paginaCom(contratoCom(MAX_REVISOES_DA_COPY - 1))
    const r = await patch(editadas())
    expect(r.status).toBe(200)
    const relido = lerCopyAutoral(banco.pagina.copyAutoral)
    expect(relido.problemas).toEqual([])
    expect(relido.copy!.revisoes).toHaveLength(MAX_REVISOES_DA_COPY)
    expect(relido.copy!.revisoes.at(-1)).toMatchObject({ autor: 'equipe', superficie: 'editor', blocos: ['cta'] })
    expect(r.body.avisoDaCopy).toBeUndefined()
  })

  it('histórico cheio e autosave idêntico (sem mudança de copy): nada a avisar', async () => {
    banco.pagina = paginaCom(contratoCom(MAX_REVISOES_DA_COPY))
    const r = await patch([texto('headline', 120, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes')])
    expect(r.status).toBe(200)
    expect(r.body.avisoDaCopy).toBeUndefined()
  })

  it('RevisaoDaCopyInvalida (9238098f): camada com linha de 301 caracteres — 200, a camada é gravada como veio, o contrato fica idêntico e o aviso manda quebrar a linha', async () => {
    banco.pagina = paginaCom(contratoCom(3))
    const contratoAntes = banco.pagina.copyAutoral
    const longa = 'x'.repeat(301)
    const r = await patch([texto('headline', 100, 'Milk-shake'), texto('cta', 300, longa)])
    expect(r.status).toBe(200)
    expect((JSON.parse(banco.pagina.layers) as Camada[]).find((c) => c.id === 'cta')!.content).toBe(longa)
    expect(banco.pagina.copyAutoral).toEqual(contratoAntes)
    expect(lerCopyAutoral(banco.pagina.copyAutoral).problemas).toEqual([])
    expect(r.body.avisoDaCopy).toMatch(/não cabe no contrato/)
    expect(r.body.avisoDaCopy).toContain(ORIENTACAO_LINHA_LONGA)
  })
})
