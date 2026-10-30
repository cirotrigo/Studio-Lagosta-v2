/**
 * #16@2 — a RECOMPOSIÇÃO REAL da Generation (`recomporPaginaDefasada`), compositor real e fontes reais, com o `@2` publicado:
 * - RG-1: a peça `@2` recomposta com o `SHAPES_LIBRARY` mutado e a paleta trocada mantém o path DERIVADO congelado
 *   (braços de 130 px), a cor e a variante da logo — o replay nunca deriva de novo nem lê o catálogo vivo;
 * - RG-2: a peça `@1` (a do t4e16-recompor) recomposta COM o `@2` publicado continua C1 (path do asset, ocupação 226 × 379,
 *   impressão do `@1`);
 * - RG-3: `derivacao` malformada → ARQUETIPO_ESCOLHA_ILEGIVEL 422; derivação válida com o path C1 →
 *   ARQUETIPO_ELEMENTO_NAO_CABE 422 — nos dois, nada é escrito (Generation, Page, Blob dublê).
 * Dublados como no t4e16-recompor: banco em memória (não é Postgres), Blob (`put` captura), fila, render da página.
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
import { cenario } from './suporte/compositor'
import { ocupacaoDoAcento } from '@/lib/compositor/arquetipos/acentos'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { CLARO, DOURADO, ID_CONVITE, cenario16, fontesNoDisco, medidorComFontesReais, paginaDoCenario16, spec16 } from './suporte/cenario-16'

async function montar(assinatura: Record<string, unknown>, logo?: string) {
  const { medir } = await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  cenario.atual = await cenario16(await paginaDoCenario16('c16-recompor', { logo }), medir, assinatura)
}

/** Compõe a peça (persistência capturada), grava a página como o persist gravaria e aplica uma edição SÓ de copy. */
async function nascerEEditar(editar: (l: Layer) => Layer, versao: 1 | 2 = 2) {
  banco.entradas = []
  await comporPeca(spec16('c16-recompor', { arquetipo: { id: ID_CONVITE, versao } }), { autor: 'u-fixture' })
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

// Na margem da marca (29/10/2026) a caixa das cantoneiras é 896 × 1508 (topo 188, base 1696 — o piso padrão): 130/1508.
const PATH_STORY = 'M0 8.6207 L0 0 L14.5089 0 M85.4911 0 L100 0 L100 8.6207 M100 91.3793 L100 100 L85.4911 100 M14.5089 100 L0 100 L0 91.3793'
const ASSET = SHAPES_LIBRARY.find((a) => a.id === 'cantoneiras')!.pathData!
async function recusa(promessa: Promise<unknown>): Promise<{ code: string; status?: number; message: string }> {
  try {
    await promessa
  } catch (e) {
    return e as { code: string; status?: number; message: string }
  }
  throw new Error('esperava recusa')
}

describe.skipIf(!fontesNoDisco())('#16@2 · recomposição real da Generation', () => {
  it('RG-1: @2 recomposto com o catálogo vivo mutado e a paleta trocada — path derivado, cor e variante congelados', async () => {
    await montar({ fundoClaro: CLARO, destaque: { fill: DOURADO } }, '#F2F2F2')
    const entrada = await nascerEEditar(trocarApoio)
    expect(entrada.fieldValues.spec.arquetipo).toMatchObject({ id: ID_CONVITE, versao: 2 })
    const nascida = entrada.layers as Layer[]
    const gravada = entrada.fieldValues.composicao.arquetipo.acentos[0]
    expect([gravada.desenho.pathData, gravada.derivacao]).toEqual([PATH_STORY, { regra: 'bracos-iguais', bracoPx: 130, caixa: { width: 896, height: 1508 } }])
    const variante = entrada.fieldValues.composicao.arquetipo.buscaEspacial.escolha.logo
    const asset = SHAPES_LIBRARY.find((a) => a.id === 'cantoneiras')!
    try {
      asset.pathData = 'M0 25 L0 0 L25 0 M75 0 L100 0 L100 25'
      cenario.atual = { ...cenario.atual!, projeto: { ...cenario.atual!.projeto, assinatura: { fundoClaro: '#FFFFFF', destaque: { fill: '#C0392B' } } } }
      await recomporPaginaDefasada({ pageId: 'p9' })
    } finally {
      asset.pathData = ASSET
    }
    expect(banco.pngs).toHaveLength(1)
    const layers = banco.pagina!.layers as Layer[]
    expect(porId(layers, 'apoio').content).toBe('Menu degustação')
    const [antes, depois] = [porId(nascida, 'acento-cantoneiras'), porId(layers, 'acento-cantoneiras')]
    expect(caixa(depois)).toEqual(caixa(antes))
    expect((depois.style as any).pathData).toBe(PATH_STORY)
    expect((depois.style as any).strokeColor).toBe((antes.style as any).strokeColor)
    expect((depois.metadata as any).compositor.acento).toMatchObject({ ancoradoA: 'peca', derivacao: { regra: 'bracos-iguais', bracoPx: 130 } })
    expect(porId(layers, 'logo').fileUrl).toBe(variante.url)
    // No PNG: tinta dourada a 129 px do canto, fundo claro gravado a 140 px — nem o vermelho nem o branco de hoje.
    const c = depois.position
    expect(await pixel(banco.pngs[0], c.x + 129, c.y)).not.toBe(CLARO)
    expect(await pixel(banco.pngs[0], c.x + 129, c.y)).not.toBe('#C0392B')
    expect(await pixel(banco.pngs[0], c.x + 140, c.y)).toBe(CLARO)
  }, 120_000)

  it('RG-1b (30/10/2026, revisão do Codex): a marca muda a margem depois de a peça nascer → a moldura segue o piso e o path é re-derivado pela MESMA regra e braço congelados', async () => {
    await montar({ fundoClaro: CLARO, destaque: { fill: DOURADO }, geometria: { story: { margemH: 64 } } }, '#F2F2F2')
    const entrada = await nascerEEditar(trocarApoio)
    const gravada = entrada.fieldValues.composicao.arquetipo.acentos[0]
    expect(gravada.derivacao).toEqual({ regra: 'bracos-iguais', bracoPx: 130, caixa: { width: 952, height: 1508 } })
    const nascida = porId(entrada.layers as Layer[], 'acento-cantoneiras')
    expect(caixa(nascida)).toEqual({ x: 64, y: 188, w: 952, h: 1508 })
    // A marca afrouxa a margem para 48: a caixa da moldura cresce para 984; o path congelado (130/952) não vale mais nela.
    cenario.atual = { ...cenario.atual!, projeto: { ...cenario.atual!.projeto, assinatura: { fundoClaro: CLARO, destaque: { fill: DOURADO }, geometria: { story: { margemH: 48 } } } } }
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(r.recomposta).toBe(true)
    const depois = porId(banco.pagina!.layers as Layer[], 'acento-cantoneiras')
    expect(caixa(depois)).toEqual({ x: 48, y: 188, w: 984, h: 1508 })
    expect((depois.metadata as any).compositor.acento.derivacao).toEqual({ regra: 'bracos-iguais', bracoPx: 130, caixa: { width: 984, height: 1508 } })
    // Os braços continuam de 130 px nos dois eixos: 130/984 e 130/1508 (não 130/952 esticado).
    expect((depois.style as any).pathData).toMatch(/^M0 8\.6207 L0 0 L13\.2114 0 /)
    expect(porId(banco.pagina!.layers as Layer[], 'apoio').content).toBe('Menu degustação')
  }, 120_000)

  it('RG-2: @1 recomposto com o @2 publicado continua C1 — path do asset, ocupação 226 × 379, impressão do @1', async () => {
    await montar({ fundoClaro: CLARO, destaque: { fill: DOURADO } })
    const entrada = await nascerEEditar(trocarApoio, 1)
    expect(entrada.fieldValues.spec.arquetipo).toEqual({ id: ID_CONVITE, versao: 1, impressao: impressaoDoArquetipo(verArquetipo(ID_CONVITE, 1)!) })
    expect(entrada.fieldValues.spec.arquetipo.impressao).toBe('arq1-1cdd408f7eeb8d')
    await recomporPaginaDefasada({ pageId: 'p9' })
    expect(banco.pngs).toHaveLength(1)
    const depois = porId(banco.pagina!.layers as Layer[], 'acento-cantoneiras')
    expect((depois.style as any).pathData).toBe(ASSET)
    expect('derivacao' in (depois.metadata as any).compositor.acento).toBe(false)
    const receita = entrada.fieldValues.composicao.arquetipo.acentos[0]
    expect(receita.derivacao).toBeUndefined()
    const o = ocupacaoDoAcento(receita, { x: depois.position.x, y: depois.position.y, width: depois.size.width, height: depois.size.height })
    expect(o.map((r) => [r.width, r.height])).toEqual(Array(4).fill([226, 379]))
  }, 120_000)

  it('RG-3: derivação malformada → ESCOLHA_ILEGIVEL; derivação válida com path C1 → ELEMENTO_NAO_CABE; nada escrito', async () => {
    await montar({ fundoClaro: CLARO, destaque: { fill: DOURADO } })
    await nascerEEditar(trocarApoio)
    const generationOriginal = structuredClone(banco.generations)
    const paginaOriginal = structuredClone(banco.pagina)
    const casos: Array<[string, (a: Record<string, any>) => void]> = [
      ['ARQUETIPO_ESCOLHA_ILEGIVEL', (a) => (a.derivacao = { regra: 'x', bracoPx: 130 })],
      ['ARQUETIPO_ELEMENTO_NAO_CABE', (a) => (a.desenho.pathData = ASSET)],
    ]
    for (const [codigo, adulterar] of casos) {
      banco.generations = structuredClone(generationOriginal)
      adulterar(banco.generations[0].fieldValues.composicao.arquetipo.acentos[0])
      const adulterada = structuredClone(banco.generations)
      const e = await recusa(recomporPaginaDefasada({ pageId: 'p9' }))
      expect([e.code, e.status], e.message).toEqual([codigo, 422])
      // Nada escrito: nem PNG no Blob dublê, nem Page, nem Generation, nem SQL.
      expect(banco.pngs).toHaveLength(0)
      expect(banco.pagina).toEqual(paginaOriginal)
      expect(banco.generations).toEqual(adulterada)
      expect(banco.sql).toEqual([])
    }
  }, 120_000)
})
