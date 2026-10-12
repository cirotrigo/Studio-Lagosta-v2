/**
 * B1d — checkpoint a: o contrato semântico novo pelo caminho REAL do render (`renderStoryImage`), com banco,
 * fontes, Blob e canvas falsos. Caracteriza o que acontece HOJE com `_slots` em página MODELO e em página de
 * CONTEÚDO, e que o legado por id/nome segue igual. Os `it.fails` são o comportamento que o B1d vai mudar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ pagina: null as any, desenhado: null as any }))

vi.mock('@/lib/db', () => ({ db: { page: { findUnique: vi.fn(async () => estado.pagina) } } }))
vi.mock('@vercel/blob', () => ({ put: vi.fn(async (caminho: string) => ({ url: `https://blob.test/${caminho}` })) }))
vi.mock('../register-project-fonts', () => ({ registerProjectFonts: vi.fn(async () => undefined) }))
vi.mock('@/lib/creatives/server-text-measurer', () => ({ createServerTextMeasurer: vi.fn(async () => () => 100) }))
vi.mock('@/lib/combo-stack-reflow', () => ({ reflowLayersAfterFill: (layers: unknown[]) => layers }))
vi.mock('@/lib/canvas-renderer', () => ({
  CanvasRenderer: class {
    async renderDesign(design: unknown) {
      estado.desenhado = design
      return Buffer.from('png')
    }
  },
}))

import { renderStoryImage } from '../story-renderer'

const camadas = () => [
  { id: 't-h', name: 'Título', type: 'text', content: 'texto do modelo', visible: true, order: 1, position: { x: 0, y: 0 }, size: { width: 100, height: 50 }, metadata: { compositor: { papel: 'headline' }, slot: { id: 'manchete' } } },
]
const pagina = (isTemplate: boolean) => ({ id: 'p1', name: 'P', width: 1080, height: 1920, layers: camadas(), background: '#000', audio: null, isTemplate, Template: { projectId: 8 } })
const textoDesenhado = () => estado.desenhado.layers.find((l: any) => l.id === 't-h').content

beforeEach(() => {
  estado.desenhado = null
})

describe('D. página MODELO + `_slots`: renderiza com o texto do modelo, sem erro', () => {
  it('hoje: o contrato não é aplicado, e o render ainda declara aplicouSlots', async () => {
    estado.pagina = pagina(true)
    const r = await renderStoryImage('p1', 'post-1', { _slots: { manchete: 'Noite do vinho' } })
    expect(textoDesenhado()).toBe('texto do modelo')
    expect(r.aplicouSlots).toBe(true)
  })

  it.fails('B1d (d): o render desenha o texto pedido pelo slot (ou falha explicitamente)', async () => {
    estado.pagina = pagina(true)
    await renderStoryImage('p1', 'post-1', { _slots: { manchete: 'Noite do vinho' } })
    expect(textoDesenhado()).toBe('Noite do vinho')
  })
})

describe('E. página de CONTEÚDO + `_slots`: o contrato some em silêncio', () => {
  it('hoje: renderiza a página como está, sem erro e sem aplicar nada', async () => {
    estado.pagina = pagina(false)
    const r = await renderStoryImage('p1', 'post-1', { _slots: { manchete: 'Noite do vinho' } })
    expect(textoDesenhado()).toBe('texto do modelo')
    expect(r.aplicouSlots).toBe(false)
  })

  it.fails('B1d (c–d): contrato novo em página de conteúdo não renderiza em silêncio', async () => {
    estado.pagina = pagina(false)
    await expect(renderStoryImage('p1', 'post-1', { _slots: { manchete: 'Noite do vinho' } })).rejects.toThrow()
  })
})

describe('F. legado pelo caminho real do render: intacto', () => {
  it('página MODELO: por id e por nome aplica, como hoje', async () => {
    estado.pagina = pagina(true)
    await renderStoryImage('p1', 'post-1', { 't-h': 'Por id' })
    expect(textoDesenhado()).toBe('Por id')
    await renderStoryImage('p1', 'post-1', { Título: 'Por nome' })
    expect(textoDesenhado()).toBe('Por nome')
  })

  it('página de CONTEÚDO: a página manda, os slots legados não voltam para a arte', async () => {
    estado.pagina = pagina(false)
    const r = await renderStoryImage('p1', 'post-1', { 't-h': 'cópia antiga' })
    expect(textoDesenhado()).toBe('texto do modelo')
    expect(r.aplicouSlots).toBe(false)
  })
})
