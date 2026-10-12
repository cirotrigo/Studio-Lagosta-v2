/**
 * B1b pelo CONSUMIDOR: a resposta do `escolher-modelo`, como a porta do MCP a
 * serializa (texto JSON), traz `slotFields` enriquecidos e `semanticIssues` na
 * página principal E em cada alternativa — o mesmo contrato, a mesma análise,
 * nenhuma query a mais. Banco falso; `prepareCreative` real.
 */
import { describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ nomeDoTemplate: 'Stories' }))

const camadasPrincipal = [
  { id: 't-h', name: 'headline', type: 'text', content: 'Happy hour' },
  { id: 't-e', name: 'Endereço', type: 'text', content: 'Rua A', metadata: { compositor: { papel: 'servico' }, slot: { id: 'servico-endereco' } } },
  { id: 't-o', name: 'Horário', type: 'text', content: '18h', metadata: { compositor: { papel: 'servico' }, slot: { id: 'servico-horario' } } },
]
const camadasAlternativa = [
  { id: 'a-h', name: 'headline', type: 'text', content: 'Happy' },
  { id: 'shape-1', name: 'Forma', type: 'shape', metadata: { slot: { id: 'com espaço' } } },
]

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: vi.fn(async () => ({ id: 1, name: 'Bacana', status: 'ACTIVE', instagramUsername: null, googleDriveImagesFolderId: null, googleDriveFolderId: null })) },
    template: {
      findMany: vi.fn(async () => [
        { id: 10, name: estado.nomeDoTemplate, tags: [], Page: [
          { id: 'p-main', name: 'Happy 1', templateId: 10, tags: ['happy hour'] },
          { id: 'p-alt', name: 'Happy 2', templateId: 10, tags: ['happy hour'] },
        ] },
      ]),
    },
    page: {
      findMany: vi.fn(async () => [{ id: 'p-alt', layers: camadasAlternativa }]),
      findUnique: vi.fn(async () => ({ id: 'p-main', templateId: 10, name: 'Happy 1', tags: ['happy hour'], layers: camadasPrincipal, width: 1080, height: 1920, background: null })),
    },
    knowledgeBaseEntry: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock('@prisma/client', () => ({ KnowledgeCategory: {}, Prisma: {} }))
vi.mock('@/lib/mcp/tools', () => ({ projetosVisiveis: vi.fn(async () => null) }))
vi.mock('@/lib/aprendizado/sinal-de-modelo', () => ({ registrarSugestaoDeModelo: vi.fn(async () => null), fecharSugestaoDeModelo: vi.fn() }))

import { toolsDeModelos } from '../catalogo/modelos'
import { executarTool } from '../registro/porta'

const indice = new Map(toolsDeModelos.map((t) => [t.nome, t]))
const gates = { projeto: vi.fn(async () => undefined), curador: vi.fn(async () => undefined) }

async function escolher() {
  const r = await executarTool(indice, 'remoto', 'escolher-modelo', { projectId: 1, theme: 'happy hour' }, { kind: 'service' } as never, { gates })
  const texto = String((r.content[0] as { text: string }).text)
  expect(r.isError).toBeFalsy()
  return JSON.parse(texto)
}

describe('escolher-modelo devolve a descoberta semântica (B1b)', () => {
  it('a principal traz slotFields enriquecidos e semanticIssues', async () => {
    const r = await escolher()
    expect(r.page.slotFields.map((f: any) => [f.layerId, f.semantic.slot.id, f.semantic.addressableBy])).toEqual([
      ['t-h', null, ['layerId']],
      ['t-e', 'servico-endereco', ['layerId']],
      ['t-o', 'servico-horario', ['layerId']],
    ])
    expect(r.page.semanticIssues).toEqual([])
  })

  it('a alternativa tem o MESMO contrato, e a corrupção fora dos campos aparece no diagnóstico dela', async () => {
    const r = await escolher()
    const [alt] = r.alternatives
    expect(Object.keys(alt).filter((k) => k === 'slotFields' || k === 'semanticIssues')).toEqual(['slotFields', 'semanticIssues'])
    expect(alt.slotFields.map((f: any) => f.layerId)).toEqual(['a-h'])
    expect(Object.keys(alt.slotFields[0])).toEqual(Object.keys(r.page.slotFields[0]))
    expect(Object.keys(alt.slotFields[0].semantic)).toEqual(Object.keys(r.page.slotFields[0].semantic))
    expect(alt.semanticIssues).toEqual([{ code: 'SLOT_INVALID', layerIds: ['shape-1'] }])
  })

  it('os cinco campos legados continuam lá, com os mesmos valores', async () => {
    const r = await escolher()
    expect(r.page.slotFields[0]).toMatchObject({ layerId: 't-h', name: 'headline', type: 'text', isDynamic: false, currentValue: 'Happy hour' })
  })
})

describe('alternativa que não volta da consulta (revisão adversarial B1b, F2)', () => {
  it('não vira "modelo sem campos": PAGE_NOT_LOADED no diagnóstico dela', async () => {
    const { db } = await import('@/lib/db')
    ;(db.page.findMany as any).mockResolvedValueOnce([])
    const r = await escolher()
    expect(r.alternatives[0].slotFields).toEqual([])
    expect(r.alternatives[0].semanticIssues).toEqual([{ code: 'PAGE_NOT_LOADED', layerIds: [] }])
  })
})

describe('família "(3 layouts)": a criação pode trocar a página — nada prometido, na principal e na alternativa', () => {
  it('principal e alternativa: addressableBy vazio e PAGE_MAY_CHANGE_BY_LAYOUT; a semântica segue descrita; sem query a mais', async () => {
    const { db } = await import('@/lib/db')
    vi.clearAllMocks()
    estado.nomeDoTemplate = 'Stories (3 layouts)'
    try {
      const r = await escolher()
      for (const f of [...r.page.slotFields, ...r.alternatives[0].slotFields]) {
        expect(f.semantic.addressableBy).toEqual([])
        expect(f.semantic.problems).toContainEqual({ code: 'PAGE_MAY_CHANGE_BY_LAYOUT' })
      }
      expect(r.page.slotFields[1].semantic.slot).toEqual({ status: 'declared', id: 'servico-endereco' })
      // não é corrupção: o diagnóstico da página não muda por isso
      expect(r.page.semanticIssues).toEqual([])
      expect(r.alternatives[0].semanticIssues).toEqual([{ code: 'SLOT_INVALID', layerIds: ['shape-1'] }])
      // as mesmas consultas de sempre: uma de templates, uma das alternativas, uma da principal
      expect((db.template.findMany as any).mock.calls).toHaveLength(1)
      expect((db.page.findMany as any).mock.calls).toHaveLength(1)
      expect((db.page.findUnique as any).mock.calls).toHaveLength(1)
    } finally {
      estado.nomeDoTemplate = 'Stories'
    }
  })
})
