import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Autorização horizontal (auditoria de 12/10/2026): `escolher-modelo` aceita
 * `projectHint` e o gate da porta só roda com `projectId` numérico. A busca por
 * nome tem de ficar DENTRO dos projetos visíveis ao principal — projeto alheio
 * se comporta como inexistente e não conta para ambiguidade.
 */
const PROJETOS = [
  { id: 1, name: 'Bacana', status: 'ACTIVE' },
  { id: 2, name: 'Bacana Eventos', status: 'ACTIVE' },
  { id: 3, name: 'Bacana Bar', status: 'ACTIVE' },
  { id: 9, name: 'Segredo Alheio', status: 'ACTIVE' },
]

const m = vi.hoisted(() => ({ visiveis: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    project: {
      // Simula o `where` do resolveProject: status, contains insensitive e id in.
      findMany: vi.fn(async ({ where }: any) =>
        PROJETOS.filter(
          (p) =>
            p.status === where.status &&
            p.name.toLowerCase().includes(String(where.name.contains).toLowerCase()) &&
            (!where.id?.in || where.id.in.includes(p.id)),
        ),
      ),
      findUnique: vi.fn(async ({ where }: any) => PROJETOS.find((p) => p.id === where.id) ?? null),
    },
    // Sem páginas: o projeto RESOLVIDO aparece no NO_TEMPLATE_PAGES.
    template: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock('@prisma/client', () => ({ KnowledgeCategory: {}, Prisma: {} }))
vi.mock('@/lib/mcp/tools', () => ({ projetosVisiveis: m.visiveis }))

import { toolsDeModelos } from '../catalogo/modelos'
import { CATALOGO } from '../catalogo'
import { executarTool } from '../registro/porta'

const indice = new Map(toolsDeModelos.map((t) => [t.nome, t]))
const gates = { projeto: vi.fn(async () => undefined), curador: vi.fn(async () => undefined) }
const usuario = { kind: 'user', userId: 'user_x' } as never
const servico = { kind: 'service' } as never
const chamar = (args: Record<string, unknown>, principal = usuario) =>
  executarTool(indice, 'remoto', 'escolher-modelo', { theme: 'happy hour', ...args }, principal, { gates })
const texto = (r: { content: Array<Record<string, unknown>> }) => String(r.content[0]?.text)

beforeEach(() => {
  vi.clearAllMocks()
  m.visiveis.mockImplementation(async (p: { kind: string }) => (p.kind === 'service' ? null : [1]))
})

describe('escolher-modelo por projectHint respeita o principal', () => {
  it('hint que só casa com projeto alheio = projeto inexistente, sem vazar nada', async () => {
    const alheio = texto(await chamar({ projectHint: 'segredo' }))
    const inexistente = texto(await chamar({ projectHint: 'nada-disso' }))
    expect(alheio).toContain('PROJECT_NOT_FOUND')
    expect(alheio).not.toMatch(/Segredo Alheio|"id": 9/)
    expect(alheio.replace('segredo', 'X')).toBe(inexistente.replace('nada-disso', 'X'))
  })

  it('invisível não conta para ambiguidade: "bacana" resolve o único visível', async () => {
    const r = texto(await chamar({ projectHint: 'bacana' }))
    expect(r).not.toContain('AMBIGUOUS_PROJECT')
    expect(r).toContain('NO_TEMPLATE_PAGES')
    expect(r).toContain('"id": 1')
    expect(r).not.toMatch(/Eventos|Bacana Bar/)
  })

  it('dois visíveis → AMBIGUOUS_PROJECT listando só os visíveis', async () => {
    m.visiveis.mockResolvedValue([1, 2])
    const r = texto(await chamar({ projectHint: 'bacana' }))
    expect(r).toContain('AMBIGUOUS_PROJECT')
    expect(r).toContain('Bacana Eventos')
    expect(r).not.toContain('Bacana Bar')
  })

  it('service continua resolvendo todos', async () => {
    const r = texto(await chamar({ projectHint: 'segredo' }, servico))
    expect(r).toContain('NO_TEMPLATE_PAGES')
    expect(r).toContain('Segredo Alheio')
    expect(texto(await chamar({ projectHint: 'bacana' }, servico))).toContain('Bacana Bar')
  })

  it('projectId numérico: passa pelo gate da porta e, mesmo com gate permissivo, o escopo barra o id alheio', async () => {
    const alheio = texto(await chamar({ projectId: 2 }))
    expect(gates.projeto).toHaveBeenCalledWith(2, usuario)
    expect(alheio).toContain('PROJECT_NOT_FOUND')
    expect(alheio).not.toContain('Bacana Eventos')
    expect(texto(await chamar({ projectId: 1 }))).toContain('NO_TEMPLATE_PAGES')
  })
})

describe('scan: nenhuma outra tool de projeto aceita o id como opcional', () => {
  it('só escolher-modelo resolve projeto sem id (e é protegida acima)', () => {
    const opcionais = [...CATALOGO.values()]
      .filter((t) => t.acesso.tipo === 'projeto' || t.acesso.tipo === 'curador')
      .filter((t) => {
        const param = ('param' in t.acesso && t.acesso.param) || 'projectId'
        const req = (t.schemaJson.required as string[] | undefined) ?? []
        return !req.includes(param)
      })
      .map((t) => t.nome)
    expect(opcionais).toEqual(['escolher-modelo'])
  })
})
