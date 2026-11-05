/**
 * #4 `minimal-fb-base-centro@1` — a RECOMPOSIÇÃO REAL da Generation (`recomporPaginaDefasada`), compositor real e fontes
 * reais. Prova o que a peça congela (versão, impressão, corte, deslocamentos — o da logo incluído — e a variante gravada
 * da logo) e o que continua vivo (a página de assinatura):
 * - G-R1: edição só de texto → a mesma posição de tudo (a logo no dy dela) e a mesma variante gravada;
 * - G-R2: copy que não cabe na posição congelada → ARQUETIPO_POSICAO_CONGELADA_NAO_CABE, nada movido nem escrito;
 * - G-R3: foto trocada → busca nova; a variante gravada vai primeiro e, se não lê na foto nova, cai pela grade, dito;
 * - G-R4: estilo novo na página de assinatura → segue na recomposição; a geometria e a versão ficam;
 * - G-R5: camada movida à mão → re-render como está, sem recompor;
 * - G-R6: versão ausente / impressão divergente → recusa; logo da assinatura com outra proporção → o dy válido mais
 *   perto, com aviso.
 * Dublados como no t3b8-recompor: banco em memória (não é Postgres), Blob (`put` captura), fila, render da página. Marca,
 * fotos e logo SINTÉTICAS (`cenario-4.ts`).
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
}))

vi.mock('@/lib/db', async () => {
  const base = (await import('./suporte/compositor')).mockDoBanco().db as Record<string, any>
  const db: Record<string, any> = {
    ...base,
    project: {
      findUnique: async (args: unknown) => ({ ...(await base.project.findUnique(args)), id: 9004, instagramAccountId: null, titleFontFamily: 'Georgia', bodyFontFamily: 'Montserrat', subtitleFontFamily: null }),
    },
    page: {
      ...base.page,
      findUnique: async ({ where }: { where: { id: string } }) =>
        banco.pagina && where.id === banco.pagina.id ? { ...banco.pagina, Template: { id: 77, name: 'Programação', projectId: 9004 } } : null,
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
    fontCombination: { findMany: async () => [] },
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
    return { url: `https://blob.test/arte-rapida/9004/p4-${banco.pngs.length}.png` }
  }),
  del: vi.fn(),
}))
vi.mock('@/lib/creatives/persist', async () => ({
  ...(await import('./suporte/compositor')).mockDaPersistencia(),
  getPublicAppUrl: () => 'https://studio.test',
  persistAndRenderCreative: async (e: Record<string, any>) => {
    banco.entradas.push(e)
    return { generationId: 'gen-4', pageId: 'p4', url: 'https://blob.test/arte-4.png' }
  },
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
import { logoSintetica } from './suporte/sinteticos'
import { DIMENSOES, ID_BASE_CENTRO, LOGO_CLARA, LOGO_ESCURA, cenario4, fontesNoDisco, fotoDoCenario4, medidorComFontesReais, paginaDoCenario4, spec4 } from './suporte/cenario-4'

/** A região anotada sob a logo de referência (Story y 200–290): a logo nasce deslocada (dy ≠ 0) dentro da zona. */
const REGIAO_SOB_A_LOGO = { x0: 0.42, y0: 200 / 1920, x1: 0.58, y1: 290 / 1920 }

/** Alto claro (210): a desenhada CLARA não lê e a escura autorizada entra — a variante gravada é a escura. */
async function montar(opcoes: { topo?: number; logo?: string; catalogo?: typeof REGIAO_SOB_A_LOGO | null } = {}) {
  const { medir } = await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  const foto = await fotoDoCenario4(DIMENSOES.story, { topo: opcoes.topo ?? 210 })
  const pagina = await paginaDoCenario4('b4-recompor', { logo: opcoes.logo ?? LOGO_CLARA })
  const catalogo = opcoes.catalogo === null ? null : { driveFileId: 'drive-4', assunto: opcoes.catalogo ?? REGIAO_SOB_A_LOGO }
  cenario.atual = await cenario4(pagina, medir, { foto, catalogo })
}

const porId = (layers: Layer[], id: string) => layers.find((l) => l.id === id)!
const trocarServico = (l: Layer): Layer => (l.id === 'servico' ? { ...l, content: 'Sábado, 15/11 · 21h' } : l)
const specRecompor = (extra: Record<string, unknown> = {}) => spec4('b4-recompor', { foto: { driveFileId: 'drive-4' }, ...extra })

/** Compõe a peça (persistência capturada), grava a página como o persist gravaria e aplica a edição pedida. */
async function nascerEEditar(editar: (l: Layer) => Layer = trocarServico, spec: Record<string, unknown> = specRecompor()) {
  banco.entradas = []
  await comporPeca(spec, { autor: 'u-fixture' })
  const entrada = banco.entradas.at(-1)!
  const editadas = (entrada.layers as Layer[]).map(editar)
  const revisao = revisaoDaPaginaComCamadas(lerCopyAutoral(entrada.copyAutoral).copy!, editadas, { autor: 'equipe', motivo: 'edição', superficie: 'editor' })
  banco.pagina = { id: 'p4', name: 'Base centrada', width: 1080, height: 1920, background: entrada.background, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: revisao.copy }
  banco.generations = [{ id: 'gen-4', projectId: 9004, resultUrl: 'https://blob.test/arte-4.png', authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p4' } }]
  banco.posts = postDaArte()
  banco.pngs = []
  banco.rerenders = []
  banco.sql = []
  return entrada
}
const geometria = (l: Layer) => ({ x: l.position.x, y: l.position.y, w: l.size.width, h: l.size.height })
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
const postDaArte = () => new Map([['post-4', { id: 'post-4', projectId: 9004, status: 'DRAFT', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: ['https://blob.test/capa.png', 'https://blob.test/arte-4.png'], laterPostId: null }]])
const escolhaGravada = () => banco.generations.at(-1)!.fieldValues.composicao.arquetipo.buscaEspacial.escolha
const urlDa = async (tinta: string) => dataUrl(await logoSintetica(tinta))

beforeEach(() => {
  banco.pngs = []
  banco.rerenders = []
  banco.sql = []
  banco.posts = postDaArte()
})

describe.skipIf(!fontesNoDisco())('#4 · recomposição real da Generation', () => {
  it('G-R1: edição só de texto → versão, impressão, corte, deslocamentos (o da logo, ≠ 0) e a variante gravada da logo reproduzidos', async () => {
    await montar()
    const entrada = await nascerEEditar()
    expect(entrada.fieldValues.spec.arquetipo).toEqual({ id: ID_BASE_CENTRO, versao: 1, impressao: impressaoDoArquetipo(verArquetipo(ID_BASE_CENTRO, 1)!) })
    const escolha = escolhaGravada()
    expect(escolha.deslocamentos.logo).not.toBe(0)
    expect(escolha.logo).toEqual({ origem: 'projeto', url: await urlDa(LOGO_ESCURA) })
    expect('cantoDaLogo' in escolha).toBe(false)
    const nascida = entrada.layers as Layer[]
    const r = await recomporPaginaDefasada({ pageId: 'p4' })
    expect([r.recomposta, banco.pngs.length]).toEqual([true, 1])
    const layers = banco.pagina!.layers as Layer[]
    expect(porId(layers, 'servico').content).toBe('Sábado, 15/11 · 21h')
    for (const id of ['bg-foto', 'headline', 'logo']) expect(geometria(porId(layers, id)), id).toEqual(geometria(porId(nascida, id)))
    expect(porId(layers, 'logo').fileUrl).toBe(await urlDa(LOGO_ESCURA))
    expect((porId(layers, 'logo').metadata as any).compositor.canto).toBe('superior-centro')
    // A arte regravada guarda a MESMA escolha (deslocamentos e variante).
    expect(escolhaGravada()).toMatchObject({ corte: escolha.corte, deslocamentos: escolha.deslocamentos, logo: escolha.logo })
    expect(banco.generations.at(-1)!.fieldValues.spec.arquetipo).toEqual(entrada.fieldValues.spec.arquetipo)
  }, 120_000)

  it('G-R2: a copy editada que não cabe na posição congelada → ARQUETIPO_POSICAO_CONGELADA_NAO_CABE; nada movido nem escrito', async () => {
    // A peça nasce com o serviço de 1 linha no alto da zona (dy −140, pela foto), acima de uma região anotada (y 1585–1690).
    // Na margem da marca (29/10/2026) o serviço do #4 (âncora no rodapé) pousa pela BASE da referência e cresce para CIMA:
    // editado para 2 linhas (dentro do limite e da capacidade) ele sairia da zona por cima NA POSIÇÃO CONGELADA — a
    // recomposição não o move. (Até 29/10 crescia para baixo e cobria a região; o código e a guarda são os mesmos.)
    await montar({ topo: 40, catalogo: { x0: 0.3, y0: 1585 / 1920, x1: 0.7, y1: 1690 / 1920 } })
    await nascerEEditar((l) => (l.id === 'servico' ? { ...l, content: 'Sexta, 14/11 · 20h\nRua das Flores, 120' } : l))
    const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p4' }))
    expect([e.code, e.status], e.message).toEqual(['ARQUETIPO_POSICAO_CONGELADA_NAO_CABE', 422])
    expect(e.message).toMatch(/servico .* sai da zona efetiva/)
    expect(e.details!.escolha.deslocamentos).toEqual(escolhaGravada().deslocamentos)
  }, 120_000)

  it('G-R3: foto trocada → busca nova (dita); a variante gravada (escura) vai primeiro e, sem ler no alto escuro, cai pela grade para a clara, dito', async () => {
    await montar()
    const nova = await fotoDoCenario4(DIMENSOES.story, { topo: 40 })
    await nascerEEditar((l) => (l.id === 'bg-foto' ? { ...l, fileUrl: dataUrl(nova) } : trocarServico(l)))
    cenario.atual = { ...cenario.atual!, foto: { url: dataUrl(nova), bytes: nova } }
    const r = await recomporPaginaDefasada({ pageId: 'p4' })
    expect(r.recomposta).toBe(true)
    expect(r.avisos.join(' ')).toMatch(/A foto da peça mudou/)
    const logo = porId(banco.pagina!.layers as Layer[], 'logo')
    expect(logo.fileUrl).toBe(await urlDa(LOGO_CLARA))
    expect(Math.abs(logo.position.x + logo.size.width / 2 - 540)).toBeLessThanOrEqual(1)
    expect(r.avisos.join(' ')).toMatch(/não lia no superior-centro/)
  }, 120_000)

  it('G-R4: a página de assinatura muda o estilo do serviço → a recomposição usa o novo; geometria e versão ficam', async () => {
    await montar()
    const entrada = await nascerEEditar()
    const pagina = cenario.atual!.paginasDeAssinatura[0]
    pagina.layers = pagina.layers.map((l) => (l.id === 'servico-pagina' ? { ...l, style: { ...l.style, color: '#E8C547' } } : l))
    const r = await recomporPaginaDefasada({ pageId: 'p4' })
    expect(r.recomposta).toBe(true)
    const layers = banco.pagina!.layers as Layer[]
    expect((porId(layers, 'servico').style as any).color).toBe('#E8C547')
    expect(geometria(porId(layers, 'logo'))).toEqual(geometria(porId(entrada.layers as Layer[], 'logo')))
    expect(banco.generations.at(-1)!.fieldValues.spec.arquetipo.versao).toBe(1)
  }, 120_000)

  it('G-R5: uma camada movida à mão → ajuste manual detectado, re-render como está, sem recompor nem aprender a edição', async () => {
    await montar()
    await nascerEEditar((l) => (l.id === 'headline' ? { ...l, position: { x: l.position.x, y: l.position.y - 300 } } : l))
    const antes = structuredClone(banco.pagina!.layers)
    const r = await recomporPaginaDefasada({ pageId: 'p4' })
    expect(r.recomposta).toBe(false)
    expect(banco.rerenders).toHaveLength(1)
    expect(banco.entradas.length).toBe(1)
    expect(r.avisos.join(' ')).toMatch(/ajustada à mão/)
    expect(banco.pagina!.layers).toEqual(antes)
  }, 120_000)

  it('G-R6: versão ausente, impressão ausente e impressão divergente recusam antes de compor; nada escrito', async () => {
    await montar()
    for (const [arquetipo, codigo] of [
      [{ id: ID_BASE_CENTRO }, 'ARQUETIPO_VERSAO_AUSENTE'],
      [{ id: ID_BASE_CENTRO, versao: 1 }, 'ARQUETIPO_IMPRESSAO_AUSENTE'],
      [{ id: ID_BASE_CENTRO, versao: 1, impressao: 'arq1-00000000000000' }, 'ARQUETIPO_IMPRESSAO_DIVERGENTE'],
    ] as const) {
      await nascerEEditar()
      banco.generations[0].fieldValues = { ...banco.generations[0].fieldValues, spec: { ...banco.generations[0].fieldValues.spec, arquetipo } }
      const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p4' }))
      expect(e.code).toBe(codigo)
    }
  }, 120_000)

  it('G-R6b: a logo da assinatura com OUTRA proporção que não cabe mais no dy congelado → vai ao dy válido mais perto, com aviso; o texto fica', async () => {
    // A logo nasce baixa (razão 0,25: 194×49 na referência) e uma região anotada ESTREITA (x 443–453, y 240–269, só onde a
    // logo larga passa) elimina o dy 0 e o meio-acima: ela nasce no topo da zona (o "acima", dy −32). A logo nova, de
    // razão 0,5, é mais estreita (x ≥ 454) e não toca a região em dy nenhum.
    const baixa = await sharp(await logoSintetica(LOGO_CLARA)).resize(320, 80, { fit: 'fill' }).png().toBuffer()
    const { medir } = await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
    const pagina = await paginaDoCenario4('b4-recompor', { logo: LOGO_CLARA })
    pagina.layers = pagina.layers.map((l) => (l.type === 'logo' ? { ...l, fileUrl: dataUrl(baixa), size: { width: 320, height: 80 } } : l))
    cenario.atual = await cenario4(pagina, medir, { foto: await fotoDoCenario4(DIMENSOES.story, { topo: 40 }), catalogo: { driveFileId: 'drive-4', assunto: { x0: 443 / 1080, y0: 240 / 1920, x1: 453 / 1080, y1: 269 / 1920 } }, variantes: [] })
    const entrada = await nascerEEditar()
    const dy = escolhaGravada().deslocamentos.logo
    // Na margem da marca (29/10/2026) a referência da logo já está no topo da zona (188, não 201,6): o "acima" é −18.
    expect(dy).toBeLessThan(-10)
    // A assinatura troca a logo por uma de razão 0,5 (mais alta): no dy congelado ela sairia da zona por cima.
    const nova = dataUrl(await logoSintetica(LOGO_CLARA))
    cenario.atual!.paginasDeAssinatura[0].layers = cenario.atual!.paginasDeAssinatura[0].layers.map((l) => (l.type === 'logo' ? { ...l, fileUrl: nova, size: { width: 160, height: 80 } } : l))
    banco.pagina = { ...banco.pagina!, layers: (banco.pagina!.layers as Layer[]).map((l) => (l.id === 'logo' ? { ...l, fileUrl: nova } : l)) }
    const r = await recomporPaginaDefasada({ pageId: 'p4' })
    expect(r.recomposta).toBe(true)
    expect(r.avisos.join(' ')).toMatch(/A logo da assinatura não cabia mais na posição congelada/)
    const layers = banco.pagina!.layers as Layer[]
    const logo = porId(layers, 'logo')
    expect(logo.position.y).toBeGreaterThanOrEqual(188)
    expect(Math.abs(logo.position.x + logo.size.width / 2 - 540)).toBeLessThanOrEqual(1)
    expect(geometria(porId(layers, 'headline'))).toEqual(geometria(porId(entrada.layers as Layer[], 'headline')))
  }, 120_000)
})
