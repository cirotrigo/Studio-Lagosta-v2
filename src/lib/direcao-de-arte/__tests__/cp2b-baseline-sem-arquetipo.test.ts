/**
 * CP2B — a REGRA DE OURO onde a FOTO manda: spec sem `arquetipo` compõe EXATAMENTE como antes do CP2B. O snapshot
 * deste arquivo foi gerado no código da base (19f87df4, ANTES de qualquer linha do CP2B) e entra no PR como o
 * primeiro commit; os commits do CP2B não podem mudá-lo. Diferença no `.snap` = regressão do caminho sem arquétipo.
 *
 * Complementa o baseline do T1a (fotos uniformes): metades claro/escuro nos dois sentidos, faixa escura no meio,
 * região protegida pelo catálogo, foto larga em story (3 cortes horizontais) e feed de foto vertical (3 cortes
 * verticais) — é onde o mapa de calma, o assunto e o corte decidem, e onde o CP2B mexe com arquétipo.
 */
import { describe, expect, it, vi } from 'vitest'

const cap = vi.hoisted(() => ({ entradas: [] as Array<Record<string, any>> }))

vi.mock('@/lib/db', async () => (await import('./suporte/compositor')).mockDoBanco())
vi.mock('@/lib/creatives/persist', async () => ({
  ...(await import('./suporte/compositor')).mockDaPersistencia(),
  persistAndRenderCreative: async (e: Record<string, any>) => {
    cap.entradas.push(e)
    return { generationId: `g-${cap.entradas.length}`, pageId: `p-${cap.entradas.length}`, url: 'https://blob.test/arte.png' }
  },
}))
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

import { comporPeca } from '@/lib/compositor/compor'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { projecao } from './suporte/projecao'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const ASSINATURA = { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } }
const ESCURO = '#1E1E1E'
const CLARO = '#F5F5F5'

type Luz = (x: number, y: number) => number

async function compor(args: {
  id: string
  luz: Luz
  dimensoes?: { width: number; height: number }
  cores: { headline: string; apoio?: string; servico: string }
  formato?: 'story' | 'feed'
  assunto?: { x0: number; y0: number; x1: number; y1: number }
  preferencias?: Record<string, unknown>
}) {
  const foto = await fotoSintetica(args.luz, args.dimensoes)
  const pagina = paginaSintetica({
    id: args.id,
    headline: { cor: args.cores.headline },
    ...(args.cores.apoio ? { apoio: { cor: args.cores.apoio } } : {}),
    servico: { cor: args.cores.servico },
    logoUrl: dataUrl(await logoSintetica('#808080')),
    fundoUrl: dataUrl(foto),
  })
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], ...(args.assunto ? { assunto: args.assunto } : {}) })
  cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: ASSINATURA } }
  const blocos = [
    { papel: 'headline', linhas: ['Almoço', 'de domingo'] },
    ...(args.cores.apoio ? [{ papel: 'apoio', linhas: ['com a família toda'] }] : []),
    { papel: 'servico', linhas: ['Dom · 12h às 16h'] },
  ]
  const spec = { ...specSintetica({ pagina: args.id, blocos, preferencias: args.preferencias }), ...(args.formato ? { formato: args.formato } : {}) }
  const antes = cap.entradas.length
  const r = await comporPeca(spec, { autor: 'u-fixture' })
  return projecao(r, cap.entradas.length > antes ? cap.entradas.at(-1) : undefined)
}

const metades = (topo: number, rodape: number): Luz => (_x, y) => (y < 960 ? topo : rodape)

describe('CP2B · baseline sem arquétipo onde a foto decide (gerado na base 19f87df4)', () => {
  it('1. topo claro e base escura, headline escura e serviço claro (o caso H)', async () => {
    expect(await compor({ id: 'cp2b-base-h', luz: metades(205, 55), cores: { headline: ESCURO, servico: CLARO } })).toMatchSnapshot()
  }, 60_000)

  it('2. topo escuro e base clara, headline clara e serviço escuro (o inverso)', async () => {
    expect(await compor({ id: 'cp2b-base-inverso', luz: metades(55, 205), cores: { headline: CLARO, apoio: CLARO, servico: ESCURO } })).toMatchSnapshot()
  }, 60_000)

  it('3. faixa escura no meio de foto clara, textos claros', async () => {
    expect(await compor({ id: 'cp2b-base-faixa', luz: (_x, y) => (y > 650 && y < 810 ? 40 : 175), cores: { headline: CLARO, apoio: CLARO, servico: CLARO } })).toMatchSnapshot()
  }, 60_000)

  it('4. região protegida pelo catálogo na metade esquerda do topo', async () => {
    expect(await compor({ id: 'cp2b-base-regiao', luz: () => 60, cores: { headline: CLARO, servico: CLARO }, assunto: { x0: 0, y0: 0.05, x1: 0.5, y1: 0.45 } })).toMatchSnapshot()
  }, 60_000)

  it('5. foto larga (1920×1920) em story: 3 cortes horizontais, o lado esquerdo escuro', async () => {
    expect(await compor({ id: 'cp2b-base-larga', luz: (x) => (x < 640 ? 50 : 200), dimensoes: { width: 1920, height: 1920 }, cores: { headline: CLARO, servico: CLARO } })).toMatchSnapshot()
  }, 60_000)

  it('6. feed de foto vertical: 3 cortes verticais, o topo escuro', async () => {
    expect(await compor({ id: 'cp2b-base-feed', luz: metades(50, 200), formato: 'feed', cores: { headline: CLARO, apoio: CLARO, servico: CLARO } })).toMatchSnapshot()
  }, 60_000)
})
