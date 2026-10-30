/**
 * #8 `minimal-divisao-foto-topo@1` — a RECOMPOSIÇÃO REAL da Generation (`recomporPaginaDefasada`), compositor real e fontes
 * reais. Prova o que este corte congela (a geometria pela versão, a foto e o corte, o papel da Page CONFERIDO) e o que
 * continua vivo (a referência à variante da assinatura):
 * - G-R1: edição só de texto → o mesmo corte, a mesma caixa, as mesmas posições e o mesmo fundo;
 * - G-R2: a marca muda os papéis depois → a peça sai no fundo da PÁGINA, não no de hoje da marca;
 * - G-R3: um `@2` dublê publicado → a peça `@1` recompõe igual; pedido novo sem versão → `@2`;
 * - G-R4: o assunto catalogado muda e o corte congelado o perde → recusa, nada escrito;
 * - G-R5: foto trocada no editor → busca nova de corte, dito;
 * - G-R6: caixa/enquadramento da foto mexidos à mão → re-render como está, sem recompor;
 * - G-R7: `Page.background` editado (não é ajuste manual detectado): o que atende vale; o que não atende recusa;
 * - G-R8: a cor da manchete muda na página de assinatura → a recomposição usa a nova e confere o papel da Page.
 * Dublados como no t4e16c2-recompor: banco em memória (não é Postgres), Blob (`put` captura), fila, render da página.
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
  /** G-R3: um `@2` dublê do #8 publicado ao lado (o catálogo vivo alterado). */
  v2: null as Record<string, any> | null,
}))

vi.mock('@/lib/db', async () => {
  const base = (await import('./suporte/compositor')).mockDoBanco().db as Record<string, any>
  const db: Record<string, any> = {
    ...base,
    project: {
      findUnique: async (args: unknown) => ({ ...(await base.project.findUnique(args)), id: 9008, instagramAccountId: null }),
    },
    page: {
      ...base.page,
      findUnique: async ({ where }: { where: { id: string } }) =>
        banco.pagina && where.id === banco.pagina.id ? { ...banco.pagina, Template: { id: 77, name: 'Programação', projectId: 9008 } } : null,
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
    return { url: `https://blob.test/arte-rapida/9008/p9-${banco.pngs.length}.png` }
  }),
  del: vi.fn(),
}))
vi.mock('@/lib/creatives/persist', async () => ({
  ...(await import('./suporte/compositor')).mockDaPersistencia(),
  getPublicAppUrl: () => 'https://studio.test',
  persistAndRenderCreative: async (e: Record<string, any>) => {
    banco.entradas.push(e)
    return { generationId: 'gen-8', pageId: 'p9', url: 'https://blob.test/arte-8.png' }
  },
  // G-R6: o re-render "como está" é capturado (a página mexida à mão não passa pelo compositor).
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
// G-R3: o catálogo VIVO com um `@2` dublê ao lado (só quando `banco.v2`), como no t1b-replay-sem-catalogo.
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
import { dataUrl } from './suporte/fixture'
import { ESCURO_8, ID_DIVISAO, cenario8, fontesNoDisco, fotoDoCenario8, medidorComFontesReais, paginaDoCenario8, spec8 } from './suporte/cenario-8'

/** O assunto catalogado embaixo da foto 1080×1350: na caixa do Story (1080×1152) só o corte de baixo o mostra inteiro. */
const ASSUNTO_EMBAIXO = { x0: 0.34, y0: 0.85, x1: 0.66, y1: 0.98 }

async function montar() {
  const { medir } = await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  const foto = await fotoDoCenario8({ width: 1080, height: 1350 }, { assunto: [0.85, 0.98] })
  cenario.atual = await cenario8(await paginaDoCenario8('d8-recompor'), medir, { foto, catalogo: { driveFileId: 'drive-8', assunto: ASSUNTO_EMBAIXO } })
}

const porId = (layers: Layer[], id: string) => layers.find((l) => l.id === id)!
const trocarApoio = (l: Layer): Layer => (l.id === 'apoio' ? { ...l, content: 'Menu degustação' } : l)
const specRecompor = (extra: Record<string, unknown> = {}) => spec8('d8-recompor', { foto: { driveFileId: 'drive-8' }, ...extra })

/** Compõe a peça (persistência capturada), grava a página como o persist gravaria e aplica a edição pedida. */
async function nascerEEditar(editar: (l: Layer) => Layer = trocarApoio, pagina: Record<string, unknown> = {}) {
  banco.entradas = []
  await comporPeca(specRecompor(), { autor: 'u-fixture' })
  const entrada = banco.entradas.at(-1)!
  const editadas = (entrada.layers as Layer[]).map(editar)
  const revisao = revisaoDaPaginaComCamadas(lerCopyAutoral(entrada.copyAutoral).copy!, editadas, { autor: 'equipe', motivo: 'edição', superficie: 'editor' })
  banco.pagina = { id: 'p9', name: 'Divisão', width: 1080, height: 1920, background: entrada.background, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: revisao.copy, ...pagina }
  banco.generations = [{ id: 'gen-8', projectId: 9008, resultUrl: 'https://blob.test/arte-8.png', authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p9' } }]
  banco.posts = postDaArte()
  // Os registros de escrita são POR peça: a recusa de uma recomposição não confunde a escrita de uma anterior.
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
const postDaArte = () => new Map([['post-8', { id: 'post-8', projectId: 9008, status: 'DRAFT', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: ['https://blob.test/capa.png', 'https://blob.test/arte-8.png'], laterPostId: null }]])

beforeEach(() => {
  banco.pngs = []
  banco.rerenders = []
  banco.sql = []
  banco.v2 = null
  banco.posts = postDaArte()
})

describe.skipIf(!fontesNoDisco())('#8 · recomposição real da Generation', () => {
  it('G-R1: edição só de texto → o mesmo corte (o da caixa), a mesma caixa, as mesmas posições e o mesmo fundo; versão e impressão gravadas', async () => {
    await montar()
    const entrada = await nascerEEditar()
    const def = verArquetipo(ID_DIVISAO, 1)!
    expect(entrada.fieldValues.spec.arquetipo).toEqual({ id: ID_DIVISAO, versao: 1, impressao: impressaoDoArquetipo(def) })
    expect(entrada.fieldValues.composicao.arquetipo.buscaEspacial.escolha.corte).toBe('center-bottom')
    const nascida = entrada.layers as Layer[]
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect([r.recomposta, banco.pngs.length]).toEqual([true, 1])
    const layers = banco.pagina!.layers as Layer[]
    expect(porId(layers, 'apoio').content).toBe('Menu degustação')
    expect(geometria(porId(layers, 'bg-foto'))).toEqual({ x: 0, y: 0, w: 1080, h: 1152, corte: 'center-bottom' })
    for (const id of ['bg-foto', 'headline', 'servico', 'logo']) expect(geometria(porId(layers, id)), id).toEqual(geometria(porId(nascida, id)))
    expect(banco.pagina!.background).toBe(ESCURO_8)
    expect(await pixel(banco.pngs[0], 40, 1800)).toBe(ESCURO_8)
  }, 120_000)

  it('G-R2: a marca troca os papéis depois da peça → a recomposição usa o fundo da PÁGINA (conferido), nunca o de hoje da marca', async () => {
    await montar()
    await nascerEEditar()
    cenario.atual = { ...cenario.atual!, projeto: { ...cenario.atual!.projeto, assinatura: { fundo: '#2A0000', fundoClaro: '#FFFFFF' } } }
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(r.recomposta).toBe(true)
    expect(banco.pagina!.background).toBe(ESCURO_8)
    expect(await pixel(banco.pngs[0], 40, 1800)).toBe(ESCURO_8)
  }, 120_000)

  it('G-R3: um @2 dublê publicado com outra caixa → a peça @1 recompõe igual; um pedido novo sem versão pega o @2', async () => {
    await montar()
    const entrada = await nascerEEditar()
    const v1 = verArquetipo(ID_DIVISAO, 1)!
    banco.v2 = { ...JSON.parse(JSON.stringify(v1)), versao: 2, formatos: { ...v1.formatos, story: { ...v1.formatos.story, foto: { x: 0, y: 0, w: 1, h: 0.5 } } } }
    expect(verArquetipo(ID_DIVISAO)!.versao).toBe(2)
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(r.recomposta).toBe(true)
    expect(geometria(porId(banco.pagina!.layers as Layer[], 'bg-foto'))).toEqual({ x: 0, y: 0, w: 1080, h: 1152, corte: 'center-bottom' })
    expect(entrada.fieldValues.spec.arquetipo.versao).toBe(1)
    banco.entradas = []
    await comporPeca({ ...specRecompor(), arquetipo: { id: ID_DIVISAO } }, { autor: 'u-fixture' })
    const nova = banco.entradas.at(-1)!
    expect(nova.fieldValues.spec.arquetipo).toMatchObject({ id: ID_DIVISAO, versao: 2 })
    expect(porId(nova.layers as Layer[], 'bg-foto').size).toEqual({ width: 1080, height: 960 })
  }, 120_000)

  it('G-R4: o assunto catalogado muda e o corte congelado o perde → ARQUETIPO_CORTE_CONGELADO_PERDE_O_ASSUNTO, nada escrito', async () => {
    await montar()
    await nascerEEditar()
    cenario.atual = { ...cenario.atual!, catalogo: { driveFileId: 'drive-8', assunto: { x0: 0.34, y0: 0.02, x1: 0.66, y1: 0.15 } } }
    const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p9' }))
    expect([e.code, e.status, e.details!.escolha.corte], e.message).toEqual(['ARQUETIPO_CORTE_CONGELADO_PERDE_O_ASSUNTO', 422, 'center-bottom'])
  }, 120_000)

  it('G-R5: foto trocada no editor → a escolha gravada não vale; busca nova de corte (pela caixa), dita', async () => {
    await montar()
    const nova = await fotoDoCenario8({ width: 1080, height: 1350 }, { assunto: [0.4, 0.6] })
    await nascerEEditar((l) => (l.id === 'bg-foto' ? { ...l, fileUrl: dataUrl(nova) } : trocarApoio(l)))
    cenario.atual = { ...cenario.atual!, foto: { url: dataUrl(nova), bytes: nova } }
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(r.recomposta).toBe(true)
    expect(r.avisos.join(' ')).toMatch(/A foto da peça mudou/)
    // A foto nova, sem catálogo (a página a desenha por URL): o corte central; a caixa é a do @1.
    expect(geometria(porId(banco.pagina!.layers as Layer[], 'bg-foto'))).toEqual({ x: 0, y: 0, w: 1080, h: 1152, corte: 'center-middle' })
  }, 120_000)

  it('G-R5b (30/10/2026, revisão do Codex): peça de ANTES da margem da marca (T1a, na referência) com foto trocada → a busca nova nasce na opção A, sem `margem`; a peça nova guarda `margem: "marca"`', async () => {
    await montar()
    const nova = await fotoDoCenario8({ width: 1080, height: 1350 }, { assunto: [0.4, 0.6] })
    const entrada = await nascerEEditar((l) => (l.id === 'bg-foto' ? { ...l, fileUrl: dataUrl(nova) } : trocarApoio(l)))
    // A peça nova grava a margem da marca.
    expect(entrada.fieldValues.composicao.arquetipo.buscaEspacial.escolha.margem).toBe('marca')
    // A peça ANTIGA do T1a: posição na referência, sem busca gravada e sem `margem` — a troca de foto anula a escolha
    // (a busca roda de novo) mas NÃO a identidade geométrica: ela continua na opção A.
    const fv = banco.generations[0].fieldValues as Record<string, any>
    // Sem variante de logo gravada: é o ramo em que a foto trocada ANULA a escolha (`escolhaEspacial` null) — o que
    // originou o P2 (rodada 2 do Codex, P3: com a variante o recompor mantinha `{ modo: 'referencia', logo }`).
    fv.composicao = { ...fv.composicao, arquetipo: { ...fv.composicao.arquetipo, modo: 'referencia', buscaEspacial: undefined, logo: undefined } }
    expect(fv.composicao.arquetipo.logo).toBeUndefined()
    cenario.atual = { ...cenario.atual!, foto: { url: dataUrl(nova), bytes: nova } }
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(r.recomposta).toBe(true)
    expect(r.avisos.join(' ')).toMatch(/A foto da peça mudou/)
    // A página recomposta (busca NOVA pela foto nova, sem escolha) pousa onde a opção A pousa: a MESMA composição com
    // `margemDaPeca: null` — e NÃO onde a margem da marca pousaria (o serviço do #8 na base do piso).
    const pos = (l: Layer | undefined) => (l ? [l.position.x, l.position.y] : null)
    const headline = porId(banco.pagina!.layers as Layer[], 'headline')
    const servico = porId(banco.pagina!.layers as Layer[], 'servico')
    const comoAntes = await comporPeca(specRecompor(), { somenteAvaliar: true, margemDaPeca: null })
    const naMarca = await comporPeca(specRecompor(), { somenteAvaliar: true, margemDaPeca: 'marca' })
    expect([pos(headline), pos(servico)]).toEqual([pos(comoAntes.layers.find((l) => l.id === 'headline')), pos(comoAntes.layers.find((l) => l.id === 'servico'))])
    expect(pos(servico)).not.toEqual(pos(naMarca.layers.find((l) => l.id === 'servico')))
  }, 120_000)

  it('G-R6: a caixa da foto movida ou o enquadramento mudado à mão → ajuste manual detectado, re-render como está, sem recompor', async () => {
    for (const mexer of [(l: Layer): Layer => ({ ...l, position: { x: 0, y: 40 } }), (l: Layer): Layer => ({ ...l, style: { ...l.style, cropPosition: 'center-top' } })]) {
      await montar()
      banco.pngs = []
      banco.rerenders = []
      await nascerEEditar((l) => (l.id === 'bg-foto' ? mexer(l) : l))
      const antes = structuredClone(banco.pagina!.layers)
      const r = await recomporPaginaDefasada({ pageId: 'p9' })
      expect(r.recomposta).toBe(false)
      expect(banco.rerenders).toHaveLength(1)
      expect(banco.entradas.length).toBe(1)
      expect(r.avisos.join(' ')).toMatch(/ajustada à mão/)
      expect(banco.pagina!.layers).toEqual(antes)
    }
  }, 120_000)

  it('G-R7: Page.background editado (não é ajuste manual): o papel que atende vale e a peça sai nele; o que não atende recusa, nada escrito', async () => {
    await montar()
    await nascerEEditar(trocarApoio, { background: '#202020' })
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(r.recomposta).toBe(true)
    expect([banco.pagina!.background, await pixel(banco.pngs[0], 40, 1800)]).toEqual(['#202020', '#202020'])
    banco.pngs = []
    await nascerEEditar(trocarApoio, { background: '#F0F0F0' })
    const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p9' }))
    expect([e.code, e.details!.origem, e.details!.fundoDaPagina]).toEqual(['ARQUETIPO_FUNDO_INDISPONIVEL', 'pagina', '#F0F0F0'])
  }, 120_000)

  it('G-R8: a variante continua VIVA — a cor nova da manchete na assinatura entra, conferida contra o papel da Page (aceita ou recusa)', async () => {
    await montar()
    await nascerEEditar()
    const pintar = (cor: string) => {
      const pagina = cenario.atual!.paginasDeAssinatura[0]
      pagina.layers = pagina.layers.map((l) => (l.id === 'headline-pagina' ? { ...l, style: { ...l.style, color: cor } } : l))
    }
    pintar('#E8C547')
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(r.recomposta).toBe(true)
    expect((porId(banco.pagina!.layers as Layer[], 'headline').style as any).color).toBe('#E8C547')
    expect(banco.pagina!.background).toBe(ESCURO_8)
    banco.pngs = []
    await nascerEEditar()
    pintar('#000000')
    const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p9' }))
    expect([e.code, e.details!.origem, e.details!.tintas.find((t: any) => t.camada === 'headline').cor]).toEqual(['ARQUETIPO_FUNDO_INDISPONIVEL', 'pagina', '#000000'])
  }, 120_000)
})
