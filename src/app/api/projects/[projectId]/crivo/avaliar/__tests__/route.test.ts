/**
 * `POST /api/projects/[projectId]/crivo/avaliar` só grava `fieldValues.crivo`
 * na arte do PRÓPRIO projeto (12/09/2026, visto na pré-revisão do C6-13).
 *
 * A rota e o serviço são os reais; Clerk, o acesso ao projeto, o banco, o
 * modelo, o DNA e a base são falsos. O banco aplica o merge raso de
 * `mesclarFieldValuesDaArte` e registra cada patch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  generations: new Map<string, Record<string, unknown>>(),
  donos: new Map<string, number>(),
  merges: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  findFirst: vi.fn(),
  generateObject: vi.fn(async () => ({ object: { itens: [] } })),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1', orgId: null }) }))
vi.mock('@/lib/projects/access', () => ({
  fetchProjectWithShares: async (id: number) => ({ id }),
  hasProjectReadAccess: () => true,
}))
vi.mock('@/lib/db', () => ({
  db: {
    generation: {
      findFirst: banco.findFirst,
      findUnique: async ({ where }: { where: { id: string } }) => {
        const fv = banco.generations.get(where.id)
        return fv ? { id: where.id, fieldValues: structuredClone(fv) } : null
      },
      update: async ({ where, data }: { where: { id: string }; data: { fieldValues: Record<string, unknown> } }) => {
        banco.generations.set(where.id, data.fieldValues)
        return { id: where.id }
      },
    },
    $executeRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
      const sql = partes.join('?')
      if (!sql.includes('||')) throw new Error(`SQL inesperado no teste: ${sql}`)
      const id = String(valores[valores.length - 1])
      const patch = JSON.parse(String(valores[0])) as Record<string, unknown>
      banco.merges.push({ id, patch })
      const atual = banco.generations.get(id)
      if (!atual) return 0
      banco.generations.set(id, { ...atual, ...patch })
      return 1
    },
  },
}))
vi.mock('ai', () => ({ generateObject: banco.generateObject }))
vi.mock('@ai-sdk/openai', () => ({ openai: () => 'modelo-falso' }))
vi.mock('@/lib/knowledge/search', () => ({ getProjectPromptKnowledgeContext: async () => ({ context: '', warnings: [] }) }))
vi.mock('@/lib/brand/brand-context', () => ({
  loadBrandContext: async () => ({
    projectName: 'Lagosta Criativa',
    fonts: [],
    colors: [],
    dna: { approvalChecklist: 'A arte está sem emoji?\nO preço confere com a base?', toneOfVoice: null, contentRules: null, composition: null, visualStyle: null, photoDirection: null },
  }),
}))

import { POST } from '../route'

async function avaliar(projectId: string, corpo: Record<string, unknown>) {
  const req = new Request(`http://studio.test/api/projects/${projectId}/crivo/avaliar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  const res = await POST(req, { params: Promise.resolve({ projectId }) })
  return { status: res.status, corpo: (await res.json()) as Record<string, unknown> }
}

const DO_OUTRO = { source: 'ajuste-arte', prompt: 'arte do projeto 9', recomposicao: { estado: 're-renderizada', copyVisualRegravada: true } }

beforeEach(() => {
  banco.generations = new Map<string, Record<string, unknown>>([
    ['gen-do-8', { source: 'arte-ia', prompt: 'arte do projeto 8' }],
    ['gen-do-9', structuredClone(DO_OUTRO)],
  ])
  banco.donos = new Map([['gen-do-8', 8], ['gen-do-9', 9]])
  banco.merges = []
  banco.generateObject.mockClear()
  banco.findFirst.mockReset()
  banco.findFirst.mockImplementation(async ({ where }: { where: { id: string; projectId?: number } }) =>
    banco.donos.has(where.id) && banco.donos.get(where.id) === where.projectId ? { id: where.id } : null,
  )
})

describe('POST /crivo/avaliar — a avaliação só grava na arte do próprio projeto', () => {
  it('generationId de OUTRO projeto: 404, sem avaliar e sem gravar — a arte do outro fica intacta', async () => {
    const r = await avaliar('8', { copy: ['Almoço executivo'], generationId: 'gen-do-9' })
    expect(r.status).toBe(404)
    expect(r.corpo).toMatchObject({ code: 'GENERATION_NOT_FOUND' })
    expect(banco.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'gen-do-9', projectId: 8 } }))
    expect(banco.generateObject).not.toHaveBeenCalled()
    expect(banco.merges).toHaveLength(0)
    expect(banco.generations.get('gen-do-9')).toEqual(DO_OUTRO)
  })

  it('generationId inexistente devolve o MESMO 404 (a resposta não revela se a arte existe em outro projeto)', async () => {
    const deOutro = await avaliar('8', { copy: ['Almoço executivo'], generationId: 'gen-do-9' })
    const inexistente = await avaliar('8', { copy: ['Almoço executivo'], generationId: 'nao-existe' })
    expect(inexistente).toEqual(deOutro)
  })

  it('arte do PRÓPRIO projeto: 200, e o único patch gravado é a chave `crivo` nessa arte', async () => {
    const r = await avaliar('8', { copy: ['Almoço executivo'], generationId: 'gen-do-8' })
    expect(r.status).toBe(200)
    expect(r.corpo).toMatchObject({ degradado: false })
    expect(banco.merges).toHaveLength(1)
    expect(banco.merges[0].id).toBe('gen-do-8')
    expect(Object.keys(banco.merges[0].patch)).toEqual(['crivo'])
    expect(banco.generations.get('gen-do-8')).toMatchObject({ prompt: 'arte do projeto 8', crivo: { degradado: false } })
  })

  it('sem generationId: comportamento de hoje — avalia, não consulta dono de arte nenhuma e não grava', async () => {
    const r = await avaliar('8', { copy: ['Almoço executivo'] })
    expect(r.status).toBe(200)
    expect(banco.generateObject).toHaveBeenCalledTimes(1)
    expect(banco.findFirst).not.toHaveBeenCalled()
    expect(banco.merges).toHaveLength(0)
  })
})
