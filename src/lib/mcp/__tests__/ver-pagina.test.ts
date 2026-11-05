/**
 * T1 (05/11/2026): `ver-pagina` devolve a página como dados — camadas normalizadas, a `versao` que `ajustar-arte`
 * exige, o link do editor; página de outro cliente e página ilegível são erro, nunca lista vazia.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  paginas: new Map<string, Record<string, unknown>>(),
  geracoes: new Map<string, Record<string, unknown>>(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    page: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => m.paginas.get(where.id) ?? null) },
    generation: { findFirst: vi.fn(async ({ where }: { where: { id: string; projectId: number } }) => (m.geracoes.get(where.id)?.projectId === where.projectId ? m.geracoes.get(where.id) : null)) },
  },
}))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))

import { CATALOGO } from '@/lib/mcp/catalogo'
import { TOOLS_DRAFT_ONLY } from '@/lib/mcp/registro/perfil'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'

const tool = CATALOGO.get('ver-pagina')!
const camadas = [
  { id: 'bg', type: 'image', name: 'Fundo', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: 'https://blob.test/f.jpg', style: { objectFit: 'cover' }, metadata: { compositor: { papel: 'foto' } } },
  { id: 'h', type: 'text', name: 'Título', visible: true, locked: false, order: 1, position: { x: 100, y: 1200 }, size: { width: 880, height: 160 }, content: 'OI', style: { fontSize: 72, vetor: { partes: [] } } },
]
const pagina = (extra: Record<string, unknown> = {}) => ({
  id: 'pg-1',
  name: 'Story teste',
  width: 1080,
  height: 1920,
  background: '#000000',
  // A string JSON, como o PageSync grava: `lerCamadas` decodifica.
  layers: JSON.stringify(camadas),
  isTemplate: false,
  tags: ['story'],
  thumbnail: 'https://blob.test/thumb.png',
  templateId: 12,
  updatedAt: new Date('2026-11-05T10:00:00Z'),
  Template: { name: 'Arte Rápida', projectId: 8 },
  ...extra,
})

beforeEach(() => {
  m.paginas.clear()
  m.geracoes.clear()
  m.paginas.set('pg-1', pagina())
  m.geracoes.set('gen-1', { projectId: 8, fieldValues: { pageId: 'pg-1' } })
})

describe('ver-pagina', () => {
  it('está no catálogo, é leitura, remoto+local e na allowlist do draft-only', () => {
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
    expect(tool.acesso).toEqual({ tipo: 'projeto' })
    expect([...tool.superficies]).toEqual(['remoto', 'local'])
    expect(TOOLS_DRAFT_ONLY.has('ver-pagina')).toBe(true)
    expect(tool.schema.safeParse({ projectId: 8, pageId: 'pg-1', outra: 1 }).success).toBe(false)
  })

  it('devolve a página, a versao (a mesma de revisar-arte/ajustar-arte), o editUrl e as camadas normalizadas', async () => {
    const r = (await tool.handler({ projectId: 8, pageId: 'pg-1' }, { kind: 'service' } as never)) as Record<string, any>
    expect(r).toMatchObject({ pageId: 'pg-1', nome: 'Story teste', formato: 'story', largura: 1080, altura: 1920, fundo: '#000000', isTemplate: false, tags: ['story'], templateId: 12, thumbnail: 'https://blob.test/thumb.png' })
    expect(r.versao).toBe(versaoDaPagina({ width: 1080, height: 1920, background: '#000000', layers: camadas }))
    expect(r.editUrl).toBe('https://studio.test/templates/12/editor?pageId=pg-1')
    expect(r.camadas).toHaveLength(2)
    expect(r.camadas[0]).toEqual({ id: 'bg', type: 'image', name: 'Fundo', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: 'https://blob.test/f.jpg', style: { objectFit: 'cover' } })
    expect(r.camadas[1].style).toEqual({ fontSize: 72 })
    expect(r.camadas[1]).not.toHaveProperty('metadata')
    expect(r.comoAjustar).toContain(`versaoEsperada "${r.versao}"`)
  })

  it('pelo generationId: resolve a página gravada na arte; arte sem página é GERACAO_SEM_PAGINA', async () => {
    const r = (await tool.handler({ projectId: 8, generationId: 'gen-1' }, { kind: 'service' } as never)) as Record<string, any>
    expect(r.pageId).toBe('pg-1')
    m.geracoes.set('gen-ia', { projectId: 8, fieldValues: { source: 'arte-ia' } })
    await expect(tool.handler({ projectId: 8, generationId: 'gen-ia' }, { kind: 'service' } as never)).rejects.toMatchObject({ code: 'GERACAO_SEM_PAGINA', status: 422 })
    await expect(tool.handler({ projectId: 9, generationId: 'gen-1' }, { kind: 'service' } as never)).rejects.toMatchObject({ code: 'GERACAO_NAO_ENCONTRADA', status: 404 })
  })

  it('página de outro projeto é PAGINA_DE_OUTRO_PROJETO; inexistente é PAGE_NOT_FOUND; sem id é SEM_PAGINA', async () => {
    await expect(tool.handler({ projectId: 9, pageId: 'pg-1' }, { kind: 'service' } as never)).rejects.toMatchObject({ code: 'PAGINA_DE_OUTRO_PROJETO', status: 403 })
    await expect(tool.handler({ projectId: 8, pageId: 'nada' }, { kind: 'service' } as never)).rejects.toMatchObject({ code: 'PAGE_NOT_FOUND', status: 404 })
    await expect(tool.handler({ projectId: 8 }, { kind: 'service' } as never)).rejects.toMatchObject({ code: 'SEM_PAGINA', status: 400 })
  })

  it('página ilegível é erro (CAMADAS_ILEGIVEIS), nunca camadas: []', async () => {
    m.paginas.set('pg-1', pagina({ layers: '{nao-e-json' }))
    await expect(tool.handler({ projectId: 8, pageId: 'pg-1' }, { kind: 'service' } as never)).rejects.toMatchObject({ code: 'CAMADAS_ILEGIVEIS', status: 422 })
  })

  it('página-modelo e página com vídeo saem com aviso (quem edita é a tela)', async () => {
    m.paginas.set('pg-1', pagina({ isTemplate: true, layers: JSON.stringify([...camadas, { id: 'v', type: 'video', name: 'V', visible: true, locked: false, order: 2, position: { x: 0, y: 0 }, size: { width: 1, height: 1 } }]) }))
    const r = (await tool.handler({ projectId: 8, pageId: 'pg-1' }, { kind: 'service' } as never)) as Record<string, any>
    expect(r.avisos).toHaveLength(2)
    expect(r.comoAjustar).toBeNull()
  })
})
