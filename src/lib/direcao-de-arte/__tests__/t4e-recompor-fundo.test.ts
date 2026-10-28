/**
 * T4-E rodada 1 — a RECOMPOSIÇÃO REAL (`recomporPaginaDefasada`) de uma peça sem foto, com o COMPOSITOR REAL: a peça E
 * nasce bege; a marca troca o `fundoClaro` para branco; a equipe edita só a copy; a recomposição desenha o PNG no fundo
 * GRAVADO da página (bege) — pixel do PNG, `Page.background` e `versaoGravada` concordam. A paleta de hoje não se
 * propaga sozinha. Página E sem fundo representável: recusa antes de subir PNG ou gravar. Controle: a peça com foto
 * (ramo A) recompõe como antes.
 * Dublados: banco (em memória — não é Postgres), Blob (`put` captura o PNG; nada sai da máquina), render da página,
 * fila e medidor sintético. Arquétipo E = FIXTURE injetada no catálogo (o #15 não é publicado).
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
vi.mock('@/lib/compositor/arquetipos/catalogo', async (original) =>
  (await import('@/lib/compositor/arquetipos/__tests__/suporte/arquetipo-sem-foto')).catalogoComAFixture(original as never),
)

import sharp from 'sharp'
import type { Layer } from '@/types/template'
import { comporPeca } from '@/lib/compositor/compor'
import { recomporPaginaDefasada } from '@/lib/compositor/recompor'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
import { lerCopyAutoral } from '@/lib/copy-autoral'
import { ID_SEM_FOTO } from '@/lib/compositor/arquetipos/__tests__/suporte/arquetipo-sem-foto'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura } from './suporte/sinteticos'

const BEGE = '#F4EFE6'
const BRANCO = '#FFFFFF'

async function montar(tinta: string, numeros: Record<string, unknown>) {
  const foto = await fotoSintetica(() => 60)
  const pagina = paginaSintetica({ id: 't4e-recompor', headline: { cor: tinta }, apoio: { cor: tinta }, servico: { cor: tinta }, logoUrl: dataUrl(await logoSintetica('#808080')), fundoUrl: dataUrl(foto) })
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
  cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: numeros } }
}

const COPY = {
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat', em: '2026-10-24T09:00:00.000Z' },
  revisoes: [],
  blocos: [
    { id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Nesta', 'semana'] },
    { id: 'lista', funcao: 'apoio', ordem: 1, linhas: ['Ter · Feijoada', 'Qua · Moqueca', 'Sex · Rodízio'] },
    { id: 'rodape', funcao: 'servico', ordem: 2, linhas: ['Seg a sáb · 11h às 15h'] },
  ],
}

/** Compõe a peça (persistência capturada), grava a página como o persist gravaria e aplica uma edição SÓ de copy. */
async function nascerEEditar(spec: Record<string, unknown>, editar: (l: Layer) => Layer) {
  banco.entradas = []
  await comporPeca(spec, { autor: 'u-fixture' })
  const entrada = banco.entradas.at(-1)!
  const editadas = (entrada.layers as Layer[]).map(editar)
  const revisao = revisaoDaPaginaComCamadas(lerCopyAutoral(entrada.copyAutoral).copy!, editadas, { autor: 'equipe', motivo: 'edição só de copy', superficie: 'editor' })
  banco.pagina = { id: 'p9', name: 'Semana', width: 1080, height: 1920, background: entrada.background, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: revisao.copy }
  banco.generations = [{ id: 'gen-e', projectId: 9002, resultUrl: 'https://blob.test/arte-e.png', authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p9' } }]
  return entrada
}

const pixel = async (png: Buffer) => {
  const { data } = await sharp(png).extract({ left: 20, top: 20, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
  return `#${[...data.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

const specE = () => {
  const { foto: _f, blocos: _b, ...base } = specSintetica({ pagina: 't4e-recompor', blocos: [] })
  return { ...base, arquetipo: { id: ID_SEM_FOTO }, copyAutoral: COPY }
}
const trocarManchete = (l: Layer): Layer => (l.id === 'headline' ? { ...l, content: 'Neste\nmês' } : l)

beforeEach(() => {
  banco.pngs = []
  banco.sql = []
  banco.posts = new Map([['post-carrossel', { id: 'post-carrossel', projectId: 9002, status: 'DRAFT', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: ['https://blob.test/capa.png', 'https://blob.test/arte-e.png'], laterPostId: null }]])
})

describe('T4-E rodada 1 · recomposição de peça sem foto', () => {
  it('nasce bege, a marca vira branco, edita-se só a copy: PNG, Page.background e versão gravada ficam no bege', async () => {
    await montar('#1F1F1F', { fundoClaro: BEGE })
    const entrada = await nascerEEditar(specE(), trocarManchete)
    expect(entrada.background).toBe(BEGE)
    // A marca troca o claro depois do nascimento.
    cenario.atual = { ...cenario.atual!, projeto: { ...cenario.atual!.projeto, assinatura: { fundoClaro: BRANCO } } }
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(banco.pngs).toHaveLength(1)
    expect(await pixel(banco.pngs[0])).toBe(BEGE)
    expect(banco.pagina!.background).toBe(BEGE)
    expect(banco.pagina!.layers.find((l: Layer) => l.id === 'headline').content).toBe('Neste\nmês')
    expect(r.versaoGravada).toBe(versaoDaPagina({ width: 1080, height: 1920, background: BEGE, layers: banco.pagina!.layers }))
    // Um nascimento NOVO continua seguindo a marca de hoje (branco) — a recomposição não virou bypass do fundo.
    banco.entradas = []
    await comporPeca(specE(), { autor: 'u-fixture' })
    expect(banco.entradas.at(-1)!.background).toBe(BRANCO)
  }, 60_000)

  it('a marca REMOVEU o fundo claro: a recomposição segue no bege da página (não depende do campo de hoje)', async () => {
    await montar('#1F1F1F', { fundoClaro: BEGE })
    await nascerEEditar(specE(), trocarManchete)
    cenario.atual = { ...cenario.atual!, projeto: { ...cenario.atual!.projeto, assinatura: {} } }
    await recomporPaginaDefasada({ pageId: 'p9' })
    expect(await pixel(banco.pngs[0])).toBe(BEGE)
    expect(banco.pagina!.background).toBe(BEGE)
  }, 60_000)

  for (const [nome, fundo] of [
    ['sem fundo', null],
    ['fundo escuro', '#202020'],
    ['fundo não-hex', 'creme'],
  ] as const) {
    it(`página E com ${nome}: ARQUETIPO_FUNDO_INDISPONIVEL antes de subir PNG ou gravar`, async () => {
      await montar('#1F1F1F', { fundoClaro: BEGE })
      await nascerEEditar(specE(), trocarManchete)
      banco.pagina = { ...banco.pagina!, background: fundo }
      const antes = structuredClone(banco.pagina)
      const erro = await recomporPaginaDefasada({ pageId: 'p9' }).then(
        () => null,
        (e) => e as { code: string; details?: Record<string, unknown> },
      )
      expect([erro?.code, erro?.details?.origem]).toEqual(['ARQUETIPO_FUNDO_INDISPONIVEL', 'pagina'])
      expect(banco.pngs).toHaveLength(0)
      expect(banco.pagina).toEqual(antes)
    }, 60_000)
  }

  it('controle ramo A (com foto): recompõe como antes — a foto e o fundo da marca, o fundo gravado da página não é lido', async () => {
    await montar('#F5F5F5', {})
    const comFoto = { ...specSintetica({ pagina: 't4e-recompor', blocos: [{ papel: 'headline', linhas: ['Nesta semana'] }, { papel: 'servico', linhas: ['Seg a sáb · 11h às 15h'] }] }), arquetipo: { id: 'minimal-fb-topo-esquerda' } }
    await nascerEEditar(comFoto, (l) => (l.id === 'headline' ? { ...l, content: 'Neste mês' } : l))
    banco.pagina = { ...banco.pagina!, background: 'creme' } // ilegível: no ramo A é ignorado, como sempre
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(banco.pngs).toHaveLength(1)
    expect(banco.pagina!.layers.some((l: Layer) => l.id === 'bg-foto')).toBe(true)
    expect(banco.pagina!.background).toBe('creme')
    expect(r.versaoGravada).toBe(versaoDaPagina({ width: 1080, height: 1920, background: 'creme', layers: banco.pagina!.layers }))
  }, 60_000)
})
