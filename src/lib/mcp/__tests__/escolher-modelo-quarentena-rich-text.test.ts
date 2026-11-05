/**
 * G. Quarentena do rich-text (#209) pelo CONSUMIDOR: a resposta do `escolher-modelo`, como a porta do MCP a
 * serializa, não oferece rich-text como campo editável — nem por layerId, nem por slot, nem por papel.
 */
import { describe, expect, it, vi } from 'vitest'

const camadas = [
  { id: 't-h', name: 'headline', type: 'text', content: 'Happy hour', metadata: { compositor: { papel: 'headline' }, slot: { id: 'manchete' } } },
  { id: 'rt-1', name: 'Rico', type: 'rich-text', content: 'Até 15h', metadata: { compositor: { papel: 'servico' }, slot: { id: 'horario' } } },
]

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: vi.fn(async () => ({ id: 1, name: 'Bacana', status: 'ACTIVE', instagramUsername: null, googleDriveImagesFolderId: null, googleDriveFolderId: null })) },
    template: { findMany: vi.fn(async () => [{ id: 10, name: 'Stories', tags: [], Page: [{ id: 'p-main', name: 'Happy 1', templateId: 10, tags: ['happy hour'] }] }]) },
    page: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => ({ id: 'p-main', templateId: 10, name: 'Happy 1', tags: ['happy hour'], layers: camadas, width: 1080, height: 1920, background: null })),
    },
    knowledgeBaseEntry: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock('@prisma/client', () => ({ KnowledgeCategory: {}, Prisma: {} }))
vi.mock('@/lib/mcp/tools', () => ({ projetosVisiveis: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/sinal-de-modelo', () => ({ registrarSugestaoDeModelo: vi.fn(async () => null), fecharSugestaoDeModelo: vi.fn() }))

import { toolsDeModelos } from '../catalogo/modelos'
import { executarTool } from '../registro/porta'

describe('G. escolher-modelo não promete rich-text como campo editável', () => {
  it('o rich-text com slot e papel aparece descrito, com addressableBy vazio; o texto vizinho segue prometido', async () => {
    const indice = new Map(toolsDeModelos.map((t) => [t.nome, t]))
    const gates = { projeto: vi.fn(async () => undefined), curador: vi.fn(async () => undefined) }
    const r = await executarTool(indice, 'remoto', 'escolher-modelo', { projectId: 1, theme: 'happy hour' }, { kind: 'service' } as never, { gates })
    expect(r.isError).toBeFalsy()
    const page = JSON.parse(String((r.content[0] as { text: string }).text)).page
    const rico = page.slotFields.find((f: any) => f.layerId === 'rt-1')
    expect(rico.semantic.slot).toEqual({ status: 'declared', id: 'horario' })
    expect(rico.semantic.addressableBy).toEqual([])
    expect(rico.semantic.problems).toContainEqual({ code: 'RICH_TEXT_NOT_SUPPORTED' })
    expect(page.slotFields.find((f: any) => f.layerId === 't-h').semantic.addressableBy).toEqual(['layerId', 'slotId', 'semanticRole'])
  })
})
