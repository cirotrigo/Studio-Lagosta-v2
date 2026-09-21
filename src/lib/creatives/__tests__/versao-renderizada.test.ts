/**
 * R12-01 (revisão FINAL do Codex sobre 7755e7e9, 13/09/2026): a VERSÃO VISUAL
 * que o PNG desenhou (`versaoDaPagina`: dimensões, fundo e camadas) é gravada
 * JUNTO do PNG, em `fieldValues.versaoRenderizada`. É contra ela que o
 * agendamento do lote confere se a miniatura da página ainda serve de arte
 * (`thumbnailEhAtual`); comparar só as camadas aceitava a página
 * redimensionada ou com outro fundo pelo PATCH, com o PNG velho.
 *
 * O `persistAndRenderCreative` e o `renderPageAndRegister` de verdade, com o
 * banco em memória e o Blob/render falsos, nos três caminhos de gravação:
 * Generation nova, a da fila (merge no banco) e a publicação condicionada à
 * versão (transação).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as any,
  generations: [] as Array<Record<string, any>>,
  merges: [] as Array<{ generationId: unknown; patch: Record<string, unknown> }>,
}))

vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    page: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { id: 'p1', ...data }
        return banco.pagina
      },
      findUnique: async ({ where }: { where: { id: string } }) => (banco.pagina && where.id === banco.pagina.id ? banco.pagina : null),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { ...banco.pagina, ...data }
        return banco.pagina
      },
    },
    generation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `gen-${banco.generations.length + 1}`
        banco.generations.push({ id, ...data })
        return { id }
      },
      update: async ({ where }: { where: { id: string } }) => ({ id: where.id }),
    },
    // `mesclarFieldValuesDaArte`: UPDATE … "fieldValues" || ${json}::jsonb … WHERE "id" = ${generationId}
    $executeRaw: async (_partes: TemplateStringsArray, ...valores: unknown[]) => {
      banco.merges.push({ patch: JSON.parse(String(valores[0])), generationId: valores.at(-1) })
      return 1
    },
    $queryRaw: async () => [],
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({ put: vi.fn(async (caminho: string) => ({ url: `https://blob.test/${caminho}` })), del: vi.fn() }))
vi.mock('@/lib/canvas-renderer', () => ({
  CanvasRenderer: class {
    async renderDesign() {
      return Buffer.from('png-falso')
    }
  },
}))
vi.mock('@/lib/posts/register-project-fonts', () => ({ registerProjectFonts: async () => undefined, fetchBuffer: vi.fn() }))

import { persistAndRenderCreative, renderPageAndRegister } from '../persist'
import { versaoDaPagina } from '../revisao/versao'

const CAMADAS = [
  { id: 'bg-foto', type: 'image', fileUrl: 'https://blob.test/foto.png', visible: true, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 } },
  { id: 'headline', type: 'text', content: 'Costela no bafo', visible: true, order: 1, position: { x: 100, y: 1500 }, size: { width: 880, height: 120 }, style: { fontSize: 80 } },
]
const entrada = (extra: Record<string, unknown> = {}) => ({
  project: { id: 8, name: 'Lagosta Criativa', userId: 'dono-interno' },
  templateId: 77,
  templateName: 'Stories · Semana 14 a 20/09',
  pageName: 'Seg 14/09 · 19:00 · Costela',
  width: 1080,
  height: 1920,
  layers: CAMADAS,
  background: '#101010',
  fieldValues: { source: 'compositor', layersSnapshot: CAMADAS },
  authorName: 'compositor',
  ...extra,
})
const versaoDaPaginaGravada = () => versaoDaPagina({ width: banco.pagina.width, height: banco.pagina.height, background: banco.pagina.background, layers: banco.pagina.layers })

beforeEach(() => {
  banco.pagina = null
  banco.generations = []
  banco.merges = []
})

describe('R12-01 — o PNG é gravado com a versão visual que desenhou', () => {
  it('peça nova (Generation criada): `versaoRenderizada` é a versão da página criada — dimensões, fundo e camadas', async () => {
    const r = await persistAndRenderCreative(entrada())
    const fv = banco.generations[0].fieldValues as Record<string, unknown>
    expect(fv.versaoRenderizada).toBe(versaoDaPaginaGravada())
    expect(fv.versaoRenderizada).toEqual(expect.stringMatching(/^v1:/))
    expect(banco.pagina.thumbnail).toBe(r.url)
    expect(banco.generations[0].resultUrl).toBe(r.url)
  })

  it('a peça da FILA (o caminho do compositor e do lote): a versão entra no MESMO merge que a URL do PNG', async () => {
    await persistAndRenderCreative(entrada({ generationId: 'gen-fila' }))
    expect(banco.merges).toHaveLength(1)
    expect(banco.merges[0]).toMatchObject({ generationId: 'gen-fila', patch: { versaoRenderizada: versaoDaPaginaGravada(), thumbnailUrl: banco.pagina.thumbnail } })
  })

  it('publicação condicionada à versão (o ajuste do revisor): a versão gravada é a que o render desenhou', async () => {
    banco.pagina = { id: 'p1', name: 'Seg', width: 1080, height: 1920, background: '#101010', layers: CAMADAS }
    const pagina = { ...banco.pagina }
    await renderPageAndRegister({
      project: { id: 8, name: 'Lagosta Criativa', userId: 'dono-interno' },
      templateId: 77,
      templateName: 'Programação',
      page: pagina,
      fieldValues: { source: 'ajuste-arte' },
      authorName: 'ajuste-arte',
      versaoEsperada: versaoDaPagina(pagina),
    })
    expect(banco.generations[0].fieldValues).toMatchObject({ versaoRenderizada: versaoDaPagina(pagina) })
  })

  it('controle: outro fundo é outra versão — o registro distingue a página que só mudou de fundo', async () => {
    await persistAndRenderCreative(entrada())
    const gravada = (banco.generations[0].fieldValues as Record<string, unknown>).versaoRenderizada
    expect(gravada).toEqual(expect.stringMatching(/^v1:/))
    expect(versaoDaPagina({ width: 1080, height: 1920, background: '#ffffff', layers: CAMADAS })).not.toBe(gravada)
    expect(versaoDaPagina({ width: 1080, height: 1350, background: '#101010', layers: CAMADAS })).not.toBe(gravada)
  })
})
