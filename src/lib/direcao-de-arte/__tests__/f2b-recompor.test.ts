/**
 * F2b (02/11/2026) — a janela assistida na RECOMPOSIÇÃO REAL da Generation (`recomporPaginaDefasada`, compositor real;
 * banco em memória, Blob, fila e render da página dublados, como no t4a5-recompor): a janela calculada para uma foto não
 * vira pedido na spec e não segue para a foto trocada; a janela editada na página, sim (Codex, F2b rodada 1, P2 #1).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
  entradas: [] as Array<Record<string, any>>,
  definicoes: [] as unknown[],
}))

const POST = vi.hoisted(() => ({ id: 'post-f2b', projectId: 9002, status: 'DRAFT', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: ['https://blob.test/capa.png', 'https://blob.test/arte-f2b.png'], laterPostId: null }))

vi.mock('@/lib/db', async () => {
  const base = (await import('./suporte/compositor')).mockDoBanco().db as Record<string, any>
  const db: Record<string, any> = {
    ...base,
    project: {
      findUnique: async (args: unknown) => ({ ...(await base.project.findUnique(args)), instagramAccountId: null, titleFontFamily: 'Georgia', bodyFontFamily: 'Montserrat', subtitleFontFamily: null }),
    },
    page: {
      ...base.page,
      findUnique: async ({ where }: { where: { id: string } }) => (banco.pagina && where.id === banco.pagina.id ? { ...banco.pagina, Template: { id: 77, name: 'Programação', projectId: 9002 } } : null),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { ...banco.pagina, ...data }
        return { count: 1 }
      },
    },
    generation: { findMany: async () => [...banco.generations].reverse(), findFirst: async () => banco.generations.at(-1) ?? null },
    socialPost: {
      findMany: async () => [{ ...POST }],
      findUnique: async () => ({ ...POST }),
      updateMany: async () => ({ count: 1 }),
    },
    fontCombination: { findMany: async () => [] },
    postLog: { create: async ({ data }: { data: unknown }) => data },
    // A escrita da arte é por merge no banco (`mesclarFieldValuesDaArte`): o patch é o JSON com a spec.
    $executeRaw: async (_p: TemplateStringsArray, ...valores: unknown[]) => {
      const patch = valores.find((v) => typeof v === 'string' && v.includes('"layersSnapshot"'))
      if (patch) Object.assign(banco.generations[0].fieldValues, JSON.parse(patch as string))
      return 1
    },
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
// A foto nova é lh3 (a fonte coerente com o catálogo): o render a lê do cenário, não da rede.
vi.mock('@napi-rs/canvas', async (original) => {
  const m = await original<typeof import('@napi-rs/canvas')>()
  const { cenario } = await import('./suporte/compositor')
  return { ...m, loadImage: (fonte: unknown, ...resto: []) => m.loadImage(typeof fonte === 'string' && fonte.includes('lh3.googleusercontent.com') ? cenario.atual!.foto!.bytes : (fonte as string), ...resto) }
})
vi.mock('@vercel/blob', () => ({ put: vi.fn(async () => ({ url: 'https://blob.test/arte-f2b.png' })), del: vi.fn() }))
vi.mock('@/lib/creatives/persist', async () => ({
  ...(await import('./suporte/compositor')).mockDaPersistencia(),
  getPublicAppUrl: () => 'https://studio.test',
  persistAndRenderCreative: async (e: Record<string, any>) => {
    banco.entradas.push(e)
    return { generationId: 'gen-f2b', pageId: 'p-f2b', url: 'https://blob.test/arte-f2b.png' }
  },
  renderPageAndRegister: async (e: Record<string, any>) => ({ generationId: e.generationId, url: 'https://blob.test/re-render.png' }),
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
vi.mock('@/lib/compositor/referencias', () => ({ resolucaoParaASpec: async () => ({ definicoes: banco.definicoes }) }))

import type { Layer } from '@/types/template'
import { comporPeca } from '@/lib/compositor/compor'
import { recomporPaginaDefasada } from '@/lib/compositor/recompor'
import { compilarReferencia } from '@/lib/compositor/arquetipos/referencia'
import type { Caixa } from '@/lib/compositor/arquetipos/tipos'
import brunch from '@/lib/compositor/arquetipos/__tests__/suporte/emporio-ref02-brunch.json'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

type Pagina = { id: string; name: string; width: number; height: number; tags: string[]; layers: Layer[] }
const PAGINA = brunch as unknown as Pagina
const ALTA: Pagina = { ...PAGINA, layers: PAGINA.layers.map((l) => (l.id === 'titulo' ? ({ ...l, content: 'Brunch\nEmpório\nFonseca', position: { ...l.position, y: 1440 }, size: { ...l.size, height: 260 } } as Layer) : l)) }
const BLOCOS = [
  { papel: 'headline', linhas: ['Café da manhã'] },
  { papel: 'apoio', linhas: ['Sabores da manhã'] },
]
const ALVO: Caixa = { x: 0.45, y: 0.12, w: 0.4, h: 0.25 }
const LH3_NOVA = 'https://lh3.googleusercontent.com/d/foto-nova=w2000'
const CAIXA_NASCIDA = { x0: 0.1, y0: 0.7, x1: 0.3, y1: 0.85 }
const CAIXA_NOVA = { x0: 0.6, y0: 0.5, x1: 0.8, y1: 0.65 }

const fundo = (layers: Layer[]) => layers.find((l) => l.id === 'bg-foto')!
const janelaDe = (layers: Layer[]) => fundo(layers).style?.crop

async function nascer() {
  const c = compilarReferencia(ALTA, { pageVersion: 'v', versao: 1 })
  if (!c.ok) throw new Error('a Brunch deveria compilar')
  const def = { ...c.definicao, formatos: { ...c.definicao.formatos, story: { ...c.definicao.formatos.story, assunto: { caixa: ALVO, visivel: 1 } } } }
  banco.definicoes = [def]
  const foto = await fotoSintetica(() => 150, { width: 2160, height: 3840 })
  const pagina = paginaSintetica({ id: 'f2b', headline: { cor: '#F5F5F5' }, apoio: { cor: '#F5F5F5' }, logoUrl: dataUrl(await logoSintetica('#808080')), fundoUrl: dataUrl(foto) })
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
  cenario.atual = { ...base, catalogo: { driveFileId: 'foto-sintetica', assunto: CAIXA_NASCIDA }, projeto: { ...base.projeto, assinatura: { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } } } }
  banco.entradas = []
  await comporPeca({ ...specSintetica({ pagina: 'f2b', blocos: BLOCOS }), foto: { driveFileId: 'foto-sintetica' }, arquetipo: { id: def.id } }, { autor: 'u-fixture' })
  const entrada = banco.entradas.at(-1)!
  banco.pagina = { id: 'p-f2b', name: 'Brunch', width: 1080, height: 1920, background: entrada.background, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: entrada.layers, copyAutoral: null }
  banco.generations = [{ id: 'gen-f2b', projectId: 9002, resultUrl: 'https://blob.test/arte-f2b.png', authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p-f2b' } }]
  return entrada
}

const editar = (fn: (l: Layer) => Layer) => {
  banco.pagina = { ...banco.pagina, layers: (banco.pagina!.layers as Layer[]).map(fn) }
}
const trocarFoto = (assunto = CAIXA_NOVA) => {
  editar((l) => (l.id === 'bg-foto' ? { ...l, fileUrl: LH3_NOVA } : l))
  cenario.atual = { ...cenario.atual!, foto: { ...cenario.atual!.foto!, url: LH3_NOVA }, catalogo: { driveFileId: 'foto-nova', assunto } }
}
const specGravada = () => banco.generations[0].fieldValues.spec
const assistenciaGravada = () => banco.generations[0].fieldValues.composicao.posicao.assistencia

describe('F2b · a janela assistida na recomposição real', () => {
  beforeEach(() => {
    banco.pagina = null
    banco.generations = []
  })

  it('só a foto trocada: a janela da foto antiga não é herdada; a busca nova calcula a da foto nova', async () => {
    const entrada = await nascer()
    const antiga = janelaDe(entrada.layers)
    expect(antiga).toBeDefined()
    const nascida = specGravada()
    trocarFoto()
    const r = await recomporPaginaDefasada({ pageId: 'p-f2b' })
    expect(r.recomposta).toBe(true)
    expect(assistenciaGravada().estado).toBe('janela-do-assunto')
    const direta = await comporPeca({ ...nascida, foto: { url: LH3_NOVA } }, { somenteAvaliar: true })
    expect(janelaDe(banco.pagina!.layers)).toEqual(janelaDe(direta.layers))
    expect(janelaDe(banco.pagina!.layers)).not.toEqual(antiga)
    expect(specGravada().foto).toEqual({ url: LH3_NOVA })
  }, 120_000)

  it('edição de texto: a escolha reproduz a janela, que NÃO vira pedido na spec; a troca de foto depois ainda recalcula', async () => {
    const entrada = await nascer()
    const antiga = janelaDe(entrada.layers)
    editar((l) => (l.id === 'headline' ? { ...l, content: 'Café da tarde' } : l))
    expect((await recomporPaginaDefasada({ pageId: 'p-f2b' })).recomposta).toBe(true)
    expect(janelaDe(banco.pagina!.layers)).toEqual(antiga)
    expect(specGravada().foto.janela).toBeUndefined()
    expect(assistenciaGravada().estado).toBe('escolha-reproduzida')

    trocarFoto()
    expect((await recomporPaginaDefasada({ pageId: 'p-f2b' })).recomposta).toBe(true)
    expect(assistenciaGravada().estado).toBe('janela-do-assunto')
    expect(janelaDe(banco.pagina!.layers)).not.toEqual(antiga)
  }, 120_000)

  it('a janela editada na página é preservada, com a foto trocada junto ou numa troca posterior', async () => {
    const entrada = await nascer()
    const antiga = janelaDe(entrada.layers)!
    const editada = { ...antiga, x: antiga.x + antiga.width + 0.02 <= 1 ? antiga.x + 0.02 : antiga.x - 0.02 }
    editar((l) => (l.id === 'bg-foto' ? { ...l, style: { ...l.style, crop: editada } } : l))
    expect((await recomporPaginaDefasada({ pageId: 'p-f2b' })).recomposta).toBe(true)
    expect(janelaDe(banco.pagina!.layers)).toEqual(editada)
    expect(specGravada().foto.janela).toEqual(editada)

    trocarFoto(CAIXA_NASCIDA)
    expect((await recomporPaginaDefasada({ pageId: 'p-f2b' })).recomposta).toBe(true)
    expect(janelaDe(banco.pagina!.layers)).toEqual(editada)
    expect(assistenciaGravada().estado).toBe('janela-pedida')
  }, 120_000)
})
