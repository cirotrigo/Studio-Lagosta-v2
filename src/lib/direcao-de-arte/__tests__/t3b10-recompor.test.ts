/**
 * #10 `minimal-coluna-foto@1` / `-esquerda@1` — a RECOMPOSIÇÃO REAL da Generation (`recomporPaginaDefasada`), compositor
 * real, catálogo real e a Montserrat do repo (`cenario-10.ts`). Prova R-05 (IH, 25/10/2026):
 * - edição só de texto → o mesmo corte congelado (o da caixa da coluna), a mesma caixa, as mesmas posições, o mesmo fio
 *   (receita levada adiante) e o mesmo fundo da Page;
 * - o catálogo ALTERADO por mock (um `@2` dublê com outra caixa da foto) → a peça `@1` recompõe igual; o
 *   pedido novo sem versão pega o `@2`;
 * - a impressão gravada divergente → `ARQUETIPO_IMPRESSAO_DIVERGENTE`, nada escrito;
 * - a logo pelo CP3 de hoje: a variante gravada é preferência (fica quando lê); sem variante que leia no liso → recusa
 *   `LOGO_SEM_VARIANTE_LEGIVEL`, nada escrito.
 * Dublados como no t3b8-recompor: banco em memória (não é Postgres), Blob (`put` captura), fila, render da página.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
  entradas: [] as Array<Record<string, any>>,
  pngs: [] as Buffer[],
  rerenders: [] as Array<Record<string, any>>,
  sql: [] as unknown[][],
  posts: new Map<string, Record<string, any>>(),
  /** R-05: um `@2` dublê do #10 publicado ao lado (o catálogo vivo alterado). */
  v2: null as Record<string, any> | null,
}))

vi.mock('@/lib/db', async () => {
  const base = (await import('./suporte/compositor')).mockDoBanco().db as Record<string, any>
  const db: Record<string, any> = {
    ...base,
    project: {
      findUnique: async (args: unknown) => ({ ...(await base.project.findUnique(args)), id: 9010, instagramAccountId: null }),
    },
    page: {
      ...base.page,
      findUnique: async ({ where }: { where: { id: string } }) =>
        banco.pagina && where.id === banco.pagina.id ? { ...banco.pagina, Template: { id: 77, name: 'Programação', projectId: 9010 } } : null,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { ...banco.pagina, ...data }
        return { count: 1 }
      },
    },
    generation: {
      findMany: async () => [...banco.generations].reverse(),
      findFirst: async () => banco.generations.at(-1) ?? null,
    },
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
    return { url: `https://blob.test/arte-rapida/9010/p10-${banco.pngs.length}.png` }
  }),
  del: vi.fn(),
}))
vi.mock('@/lib/creatives/persist', async () => ({
  ...(await import('./suporte/compositor')).mockDaPersistencia(),
  getPublicAppUrl: () => 'https://studio.test',
  persistAndRenderCreative: async (e: Record<string, any>) => {
    banco.entradas.push(e)
    return { generationId: 'gen-10', pageId: 'p9', url: 'https://blob.test/arte-10.png' }
  },
  // o re-render "como está" é capturado (a página mexida à mão não passa pelo compositor).
  renderPageAndRegister: async (e: Record<string, any>) => {
    banco.rerenders.push(e)
    return { generationId: e.generationId, url: 'https://blob.test/re-render.png' }
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
// R-05: o catálogo VIVO com um `@2` dublê ao lado (só quando `banco.v2`), como no t1b-replay-sem-catalogo.
vi.mock('@/lib/compositor/arquetipos/catalogo', async (original) => {
  const real = await original<typeof import('@/lib/compositor/arquetipos/catalogo')>()
  const copia = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
  const lista = () => [...real.listarArquetipos(), ...(banco.v2 ? [copia(banco.v2)] : [])] as ReturnType<typeof real.listarArquetipos>
  return { ...real, listarArquetipos: lista, verArquetipo: (id: string, versao?: number) => { const a = real.resolverArquetipo(lista(), id, versao); return a ? copia(a) : null } }
})

import sharp from 'sharp'
import type { Layer } from '@/types/template'
import { comporPeca } from '@/lib/compositor/compor'
import { recomporPaginaDefasada } from '@/lib/compositor/recompor'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
import { lerCopyAutoral } from '@/lib/copy-autoral'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { cenario } from './suporte/compositor'
import { CLARO_10, ID_COLUNA_D, ID_COLUNA_E, cenario10, medidorComAsFontesDoRepo, spec10, type Lado10 } from './suporte/cenario-10'

/** O assunto catalogado na metade ESQUERDA da foto 682×1024: na coluna D (459×1920, cover 1,875×) só o corte left o mostra. */
const ASSUNTO_ESQUERDA = { x0: 0.02, y0: 0.4, x1: 0.3, y1: 0.6 }

async function montar() {
  const medir = await medidorComAsFontesDoRepo(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  cenario.atual = await cenario10('claro', medir, { catalogo: { driveFileId: 'drive-10', assunto: ASSUNTO_ESQUERDA } })
}

const porId = (layers: Layer[], id: string) => layers.find((l) => l.id === id)!
const fioDe = (layers: Layer[]) => layers.find((l) => /fio/.test(l.id))!
const trocarApoio = (l: Layer): Layer => (l.id === 'apoio' ? { ...l, content: 'Luz natural\nem cada prato' } : l)
const specRecompor = (lado: Lado10 = 'D', extra: Record<string, unknown> = {}) => spec10('story', lado, 'claro', { foto: { driveFileId: 'drive-10' }, ...extra })

/** Compõe a peça (persistência capturada), grava a página como o persist gravaria e aplica a edição pedida. */
async function nascerEEditar(lado: Lado10 = 'D', editar: (l: Layer) => Layer = trocarApoio) {
  banco.entradas = []
  await comporPeca(specRecompor(lado), { autor: 'u-fixture' })
  const entrada = banco.entradas.at(-1)!
  const editadas = (entrada.layers as Layer[]).map(editar)
  const revisao = revisaoDaPaginaComCamadas(lerCopyAutoral(entrada.copyAutoral).copy!, editadas, { autor: 'equipe', motivo: 'edição', superficie: 'editor' })
  banco.pagina = { id: 'p9', name: 'Coluna', width: 1080, height: 1920, background: entrada.background, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: revisao.copy }
  banco.generations = [{ id: 'gen-10', projectId: 9010, resultUrl: 'https://blob.test/arte-10.png', authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p9' } }]
  banco.posts = postDaArte()
  banco.pngs = []
  banco.rerenders = []
  banco.sql = []
  return entrada
}
const pixel = async (png: Buffer, x: number, y: number) => {
  const { data } = await sharp(png).extract({ left: Math.round(x), top: Math.round(y), width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
  return `#${[...data.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}
const geometria = (l: Layer) => ({ x: l.position.x, y: l.position.y, w: l.size.width, h: l.size.height, corte: (l.style as any)?.cropPosition ?? null })
async function recusa(promessa: Promise<unknown>): Promise<{ code: string; status?: number; message: string; details?: Record<string, any> }> {
  try {
    await promessa
  } catch (e) {
    return e as { code: string; status?: number; message: string; details?: Record<string, any> }
  }
  throw new Error('esperava recusa')
}
/** Recusa SEM escrever: nem PNG no Blob dublê, nem Page, nem Generation, nem SQL, nem re-render. */
async function recusaSemEscrever(promessa: Promise<unknown>) {
  const [pagina, generations] = [structuredClone(banco.pagina), structuredClone(banco.generations)]
  const e = await recusa(promessa)
  expect(banco.pngs).toHaveLength(0)
  expect(banco.rerenders).toHaveLength(0)
  expect(banco.pagina).toEqual(pagina)
  expect(banco.generations).toEqual(generations)
  expect(banco.sql).toEqual([])
  return e
}

/** O slide congelado que aponta para a arte (sem ele a recomposição sai sem escrever) — recriado a cada peça nascida. */
const postDaArte = () => new Map([['post-10', { id: 'post-10', projectId: 9010, status: 'DRAFT', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: ['https://blob.test/capa.png', 'https://blob.test/arte-10.png'], laterPostId: null }]])

beforeEach(() => {
  banco.pngs = []
  banco.rerenders = []
  banco.sql = []
  banco.v2 = null
  banco.posts = postDaArte()
})

describe('#10 · recomposição real da Generation (R-05)', () => {
  for (const [lado, id] of [
    ['D', ID_COLUNA_D],
    ['E', ID_COLUNA_E],
  ] as const) {
    it(`${id}: edição só de texto → o mesmo corte congelado, a mesma caixa, as mesmas posições, o mesmo fio e o mesmo fundo; versão e impressão gravadas`, async () => {
      await montar()
      const entrada = await nascerEEditar(lado)
      expect(entrada.fieldValues.spec.arquetipo).toEqual({ id, versao: 1, impressao: impressaoDoArquetipo(verArquetipo(id, 1)!) })
      const corte = entrada.fieldValues.composicao.arquetipo.buscaEspacial.escolha.corte
      expect(corte).toMatch(lado === 'D' ? /^left-/ : /^(center|left)-/)
      const nascida = entrada.layers as Layer[]
      const r = await recomporPaginaDefasada({ pageId: 'p9' })
      expect([r.recomposta, banco.pngs.length]).toEqual([true, 1])
      const layers = banco.pagina!.layers as Layer[]
      expect(porId(layers, 'apoio').content).toBe('Luz natural\nem cada prato')
      expect(geometria(porId(layers, 'bg-foto'))).toEqual({ x: lado === 'D' ? 621 : 0, y: 0, w: 459, h: 1920, corte })
      for (const c of ['bg-foto', 'headline', 'servico', 'logo']) expect(geometria(porId(layers, c)), c).toEqual(geometria(porId(nascida, c)))
      expect(geometria(fioDe(layers))).toEqual(geometria(fioDe(nascida)))
      expect(porId(layers, 'logo').fileUrl).toBe(porId(nascida, 'logo').fileUrl)
      expect(banco.pagina!.background).toBe(CLARO_10)
      expect(await pixel(banco.pngs[0], lado === 'D' ? 40 : 1040, 1890)).toBe(CLARO_10)
    }, 120_000)
  }

  it('catálogo alterado por mock: um @2 dublê com outra caixa da foto (x .6, w .4) → a peça @1 recompõe igual; o pedido novo sem versão pega o @2', async () => {
    await montar()
    const entrada = await nascerEEditar('D')
    const v1 = verArquetipo(ID_COLUNA_D, 1)!
    const v2 = JSON.parse(JSON.stringify(v1))
    v2.versao = 2
    v2.formatos.story.foto = { x: 0.6, y: 0, w: 0.4, h: 1 }
    banco.v2 = v2
    expect(verArquetipo(ID_COLUNA_D)!.versao).toBe(2)
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(r.recomposta).toBe(true)
    const layers = banco.pagina!.layers as Layer[]
    expect(geometria(porId(layers, 'bg-foto'))).toEqual(geometria(porId(entrada.layers as Layer[], 'bg-foto')))
    banco.entradas = []
    await comporPeca({ ...specRecompor('D'), arquetipo: { id: ID_COLUNA_D } }, { autor: 'u-fixture' })
    const nova = banco.entradas.at(-1)!
    expect(nova.fieldValues.spec.arquetipo).toMatchObject({ id: ID_COLUNA_D, versao: 2 })
    expect(porId(nova.layers as Layer[], 'bg-foto').size).toEqual({ width: 432, height: 1920 })
  }, 120_000)

  it('impressão gravada divergente da definição → ARQUETIPO_IMPRESSAO_DIVERGENTE, nada escrito', async () => {
    await montar()
    await nascerEEditar('E')
    const g = banco.generations[0]
    g.fieldValues = { ...g.fieldValues, spec: { ...g.fieldValues.spec, arquetipo: { ...g.fieldValues.spec.arquetipo, impressao: 'arq1-00000000000000' } } }
    const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p9' }))
    expect(e.code).toBe('ARQUETIPO_IMPRESSAO_DIVERGENTE')
  }, 120_000)

  it('logo pelo CP3 de hoje: sem nenhuma variante que leia no liso claro (só a clara cadastrada) → LOGO_SEM_VARIANTE_LEGIVEL, nada escrito', async () => {
    await montar()
    await nascerEEditar('D')
    const clara = cenario.atual!.projeto.logosDoProjeto![0].fileUrl
    cenario.atual = {
      ...cenario.atual!,
      projeto: { ...cenario.atual!.projeto, logosDoProjeto: [{ fileUrl: clara, isProjectLogo: true }] },
      paginasDeAssinatura: cenario.atual!.paginasDeAssinatura.map((p) => ({ ...p, layers: p.layers.map((l) => (l.type === 'logo' ? { ...l, fileUrl: clara } : l)) })),
    }
    const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p9' }))
    expect(e.code).toBe('LOGO_SEM_VARIANTE_LEGIVEL')
  }, 120_000)
})
