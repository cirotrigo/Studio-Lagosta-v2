/**
 * #16 — a RECOMPOSIÇÃO REAL da GENERATION (`recomporPaginaDefasada`) de um convite, com o COMPOSITOR REAL e FONTES
 * REAIS: a peça nasce (cantoneiras douradas pelo destaque da manchete, logo central, fundo claro); depois a marca troca o
 * destaque e o claro, o catálogo VIVO muda o desenho das cantoneiras e a equipe edita só a copy. A recomposição redesenha
 * pela receita completa de `composicao.arquetipo.acentos` (desenho, cor), pela variante da logo gravada e pelo
 * `Page.background` congelado — nada da paleta nem do catálogo de hoje chega à peça.
 * Dublados: banco (em memória — não é Postgres), Blob (`put` captura o PNG; nada sai da máquina), fila, render da página.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
  entradas: [] as Array<Record<string, any>>,
  pngs: [] as Buffer[],
  sql: [] as unknown[][],
  posts: new Map<string, Record<string, any>>(),
}))

vi.mock('@/lib/db', async () => {
  const base = (await import('./suporte/compositor')).mockDoBanco().db as Record<string, any>
  const db: Record<string, any> = {
    ...base,
    project: {
      findUnique: async (args: unknown) => ({ ...(await base.project.findUnique(args)), id: 9002, instagramAccountId: null }),
    },
    page: {
      ...base.page,
      findUnique: async ({ where }: { where: { id: string } }) =>
        banco.pagina && where.id === banco.pagina.id ? { ...banco.pagina, Template: { id: 77, name: 'Programação', projectId: 9002 } } : null,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { ...banco.pagina, ...data }
        return { count: 1 }
      },
    },
    generation: {
      findMany: async () => [...banco.generations].reverse(),
      findFirst: async () => banco.generations.at(-1) ?? null,
    },
    // O slide congelado que aponta para a arte (sem ele a recomposição sai sem escrever) — o do harness do T1a.
    socialPost: {
      findMany: async () => [...banco.posts.values()].map((p) => ({ ...p })),
      findUnique: async ({ where }: { where: { id: string } }) => (banco.posts.has(where.id) ? { ...banco.posts.get(where.id) } : null),
      updateMany: async ({ where, data }: { where: { id: string; mediaUrls?: { equals: string[] } }; data: Record<string, unknown> }) => {
        const p = banco.posts.get(where.id)
        if (!p || (where.mediaUrls && JSON.stringify(where.mediaUrls.equals) !== JSON.stringify(p.mediaUrls))) return { count: 0 }
        banco.posts.set(where.id, { ...p, ...data })
        return { count: 1 }
      },
    },
    postLog: { create: async ({ data }: { data: unknown }) => data },
    $executeRaw: async (_p: TemplateStringsArray, ...valores: unknown[]) => {
      banco.sql.push(valores)
      return 1
    },
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (_caminho: string, png: Buffer) => {
    banco.pngs.push(png)
    return { url: `https://blob.test/arte-rapida/9002/p9-${banco.pngs.length}.png` }
  }),
  del: vi.fn(),
}))
vi.mock('@/lib/creatives/persist', async () => ({
  ...(await import('./suporte/compositor')).mockDaPersistencia(),
  getPublicAppUrl: () => 'https://studio.test',
  persistAndRenderCreative: async (e: Record<string, any>) => {
    banco.entradas.push(e)
    return { generationId: 'gen-e', pageId: 'p9', url: 'https://blob.test/arte-e.png' }
  },
  renderPageAndRegister: async () => {
    throw new Error('a recomposição desta prova não re-renderiza a página')
  },
}))
vi.mock('@/lib/ai/generation-queue', () => ({ marcarForcaAtendida: vi.fn(), marcarForcaEmExecucao: vi.fn(), marcarRenderComoEsta: vi.fn(), pedirNovaTentativa: vi.fn() }))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))
vi.mock('@/lib/compositor/pastas', () => ({ garantirPasta: async () => ({ id: 77, name: 'Semana' }), ordemNaPasta: async () => ({ ordem: 1, repeticao: 0 }) }))
vi.mock('@/lib/brand/voz-service', () => ({ carimboDaVozAgora: async () => null }))
vi.mock('@/lib/posts/register-project-fonts', async () => (await import('./suporte/compositor')).mockDasFontes())
vi.mock('@/lib/creatives/server-text-measurer', async () => (await import('./suporte/compositor')).mockDoMedidor())
vi.mock('@/lib/creatives/text-autofix', async () => (await import('./suporte/compositor')).mockDoAutofix())
vi.mock('@/lib/creatives/uso-de-foto', async () => (await import('./suporte/compositor')).mockDoUsoDeFoto())
vi.mock('@/lib/creatives/acervo', async () => (await import('./suporte/compositor')).mockDoAcervo())
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('./suporte/compositor')).gradientesDoCenario,
}))

import sharp from 'sharp'
import type { Layer } from '@/types/template'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { comporPeca } from '@/lib/compositor/compor'
import { recomporPaginaDefasada } from '@/lib/compositor/recompor'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
import { lerCopyAutoral } from '@/lib/copy-autoral'
import { cenario, noPisoDe1310 } from './suporte/compositor'
import { CLARO, DOURADO, cenario16, fontesNoDisco, medidorComFontesReais, paginaDoCenario16, spec16 } from './suporte/cenario-16'

async function montar(assinatura: Record<string, unknown>, logo?: string) {
  const { medir } = await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  cenario.atual = await cenario16(await paginaDoCenario16('c16-recompor', { logo }), medir, assinatura)
}

/** Compõe a peça (persistência capturada), grava a página como o persist gravaria e aplica uma edição SÓ de copy. */
async function nascerEEditar(editar: (l: Layer) => Layer) {
  banco.entradas = []
  await comporPeca(spec16('c16-recompor'), { autor: 'u-fixture' })
  const entrada = banco.entradas.at(-1)!
  const editadas = (entrada.layers as Layer[]).map(editar)
  const revisao = revisaoDaPaginaComCamadas(lerCopyAutoral(entrada.copyAutoral).copy!, editadas, { autor: 'equipe', motivo: 'edição só de copy', superficie: 'editor' })
  banco.pagina = { id: 'p9', name: 'Convite', width: 1080, height: 1920, background: entrada.background, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: revisao.copy }
  banco.generations = [{ id: 'gen-e', projectId: 9002, resultUrl: 'https://blob.test/arte-e.png', authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p9' } }]
  return entrada
}

const pixel = async (png: Buffer, x: number, y: number) => {
  const { data } = await sharp(png).extract({ left: Math.round(x), top: Math.round(y), width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
  return `#${[...data.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}
const porId = (layers: Layer[], id: string) => layers.find((l) => l.id === id)!
const caixa = (l: Layer) => ({ x: l.position.x, y: l.position.y, w: l.size.width, h: l.size.height })
const trocarApoio = (l: Layer): Layer => (l.id === 'apoio' ? { ...l, content: 'Menu degustação' } : l)

beforeEach(() => {
  banco.pngs = []
  banco.sql = []
  banco.posts = new Map([['post-carrossel', { id: 'post-carrossel', projectId: 9002, status: 'DRAFT', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: ['https://blob.test/capa.png', 'https://blob.test/arte-e.png'], laterPostId: null }]])
})

describe.skipIf(!fontesNoDisco())('#16 · recomposição real da Generation (receita completa dos acentos)', () => {
  it('a paleta, o claro e o catálogo vivo mudaram; a copy foi editada: cantoneiras, fio, logo e fundo saem como a peça nasceu', async () => {
    // A logo da página é CLARA (não lê no claro): o CP3 troca para a variante escura do projeto — a gravada.
    await montar({ fundoClaro: CLARO, destaque: { fill: DOURADO } }, '#F2F2F2')
    const entrada = await nascerEEditar(trocarApoio)
    const nascida = entrada.layers as Layer[]
    const variante = entrada.fieldValues.composicao.arquetipo.buscaEspacial.escolha.logo
    expect(variante.origem).toBe('projeto')
    const asset = SHAPES_LIBRARY.find((a) => a.id === 'cantoneiras')!
    const original = asset.pathData
    try {
      asset.pathData = 'M0 25 L0 0 L25 0 M75 0 L100 0 L100 25'
      cenario.atual = { ...cenario.atual!, projeto: { ...cenario.atual!.projeto, assinatura: noPisoDe1310({ fundoClaro: '#FFFFFF', destaque: { fill: '#C0392B' } }) } }
      await recomporPaginaDefasada({ pageId: 'p9' })
    } finally {
      asset.pathData = original
    }
    expect(banco.pngs).toHaveLength(1)
    const layers = banco.pagina!.layers as Layer[]
    expect(porId(layers, 'apoio').content).toBe('Menu degustação')
    // As cantoneiras: mesma caixa, o desenho e a cor CONGELADOS (nem o path de hoje, nem o vermelho de hoje).
    const [antes, depois] = [porId(nascida, 'acento-cantoneiras'), porId(layers, 'acento-cantoneiras')]
    expect(caixa(depois)).toEqual(caixa(antes))
    expect((depois.style as any).pathData).toBe(original)
    expect((depois.style as any).strokeColor).toBe((antes.style as any).strokeColor)
    expect((depois.metadata as any).compositor.acento).toMatchObject({ ancoradoA: 'peca', fonteDaCor: 'destaque-da-manchete (cantoneiras)' })
    // A logo: a variante gravada, no mesmo centro; o fio, acima do apoio editado.
    expect(porId(layers, 'logo').fileUrl).toBe(variante.url)
    expect(caixa(porId(layers, 'logo'))).toEqual(caixa(porId(nascida, 'logo')))
    const fio = porId(layers, 'acento-fio')
    expect(fio.position.y + fio.size.height).toBeLessThanOrEqual(porId(layers, 'apoio').position.y)
    // O fundo: o gravado na página, no PNG e no Page.background.
    expect(banco.pagina!.background).toBe(CLARO)
    expect(await pixel(banco.pngs[0], 20, 20)).toBe(CLARO)
    // No PNG o vértice do braço é dourado (o congelado), não o vermelho de hoje.
    const c = depois.position
    expect(await pixel(banco.pngs[0], c.x, c.y)).not.toBe(CLARO)
    expect(await pixel(banco.pngs[0], c.x, c.y)).not.toBe('#C0392B')
  }, 120_000)
})
