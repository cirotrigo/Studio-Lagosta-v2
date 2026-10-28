/**
 * T1b (rodada 1 da revisão) — a recomposição com os acentos GRAVADOS não depende do catálogo de elementos vivo: um
 * asset que ganhou outro canal (e outra espessura) bloqueia a peça NOVA, mas não a peça que já nasceu — nem a do T1a
 * (`[]`). O catálogo real não é tocado: só o módulo é substituído neste arquivo.
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
// O catálogo vivo "mudou": os três assets dos acentos ganharam um segundo canal e espessura 9 — sem receita possível.
vi.mock('@/lib/assets/shapes-library', async (original) => {
  const m = await original<typeof import('@/lib/assets/shapes-library')>()
  const mudou = new Set(['fio-fino', 'moldura-aberta', 'spark-4'])
  return {
    ...m,
    SHAPES_LIBRARY: m.SHAPES_LIBRARY.map((s) => (mudou.has(s.id) ? { ...s, strokeWidth: 9, slots: [...(s.slots ?? []), { canal: 'contorno' as const, papelPadrao: 'destaque' as const, rotulo: 'Novo' }] } : s)),
  }
})
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('./suporte/compositor')).gradientesDoCenario,
}))

import type { Layer } from '@/types/template'
import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { CreativeError } from '@/lib/creatives/errors'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const TOPO = 'minimal-fb-topo-esquerda'
const BASE = 'minimal-fb-base-esquerda'
const CLARO = '#F5F5F5'
const HEADLINE = { papel: 'headline', linhas: ['Almoço', 'de domingo'] }
const APOIO = { papel: 'apoio', linhas: ['com a família'] }
const SERVICO = { papel: 'servico', linhas: ['Dom · 12h às 16h'] }

async function montar(id: string) {
  const foto = await fotoSintetica(() => 60)
  const pagina = paginaSintetica({ id, headline: { cor: CLARO }, apoio: { cor: CLARO }, servico: { cor: CLARO }, logoUrl: dataUrl(await logoSintetica('#808080')), fundoUrl: dataUrl(foto) })
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
  cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } } } }
}
const spec = (pagina: string, arquetipo: string) => ({ ...specSintetica({ pagina, blocos: [HEADLINE, APOIO, SERVICO] }), arquetipo: { id: arquetipo } })
const camada = (r: ResultadoDaComposicao, id: string) => r.layers.find((l: Layer) => l.id === id)

/** A receita como a peça a gravou ANTES de o catálogo mudar (o desenho de então: traço 2, um canal). */
const fioGravado = {
  elemento: 'fio', tipo: 'fio-fino' as const, presoA: 'headline' as const, corPorPapel: 'texto' as const, canal: 'preenchimento' as const,
  asset: { id: 'fio-fino', versao: 1 }, desenho: { shapeType: 'line' as const, strokeWidth: 2, ajuste: 'livre' as const }, cor: CLARO, fonteDaCor: 'texto-do-papel',
}
const molduraGravada = {
  elemento: 'moldura', tipo: 'moldura-aberta' as const, presoA: 'headline' as const, corPorPapel: 'texto' as const, canal: 'contorno' as const,
  asset: { id: 'moldura-aberta', versao: 1 }, desenho: { shapeType: 'svg-path' as const, pathData: 'M0 100 L0 0 L100 0', strokeWidth: 2, ajuste: 'livre' as const }, cor: CLARO, fonteDaCor: 'texto-do-papel',
}

describe('T1b · replay sem o catálogo de elementos vivo', () => {
  it('peça NOVA: o catálogo vivo sem receita bloqueia (ARQUETIPO_INDISPONIVEL), como antes', async () => {
    await montar('t1b-cat-nova')
    const erro = await comporPeca(spec('t1b-cat-nova', TOPO), { somenteAvaliar: true }).then(() => null, (e) => e)
    expect(erro).toBeInstanceOf(CreativeError)
    expect((erro as CreativeError).code).toBe('ARQUETIPO_INDISPONIVEL')
  }, 60_000)

  it('recomposição com a receita gravada: compõe e desenha pela RECEITA (traço 2, um canal), não pelo catálogo vivo (traço 9)', async () => {
    await montar('t1b-cat-fio')
    const r = await comporPeca(spec('t1b-cat-fio', TOPO), { somenteAvaliar: true, acentosCongelados: [fioGravado] })
    expect(camada(r, 'acento-fio')!.style).toMatchObject({ shapeType: 'line', strokeWidth: 2, fill: 'rgba(245, 245, 245, 1)' })
    expect(r.diagnostico.arquetipo!.elementosMaterializados).toEqual(['fio'])
  }, 60_000)

  it('a moldura OBRIGATÓRIA também volta pela receita gravada', async () => {
    await montar('t1b-cat-base')
    const r = await comporPeca(spec('t1b-cat-base', BASE), { somenteAvaliar: true, acentosCongelados: [molduraGravada] })
    expect(camada(r, 'acento-moldura')!.style).toMatchObject({ pathData: 'M0 100 L0 0 L100 0', strokeWidth: 2 })
  }, 60_000)

  it('peça do T1a (`[]`): compõe sem acento, com o catálogo vivo indisponível', async () => {
    await montar('t1b-cat-legado')
    const r = await comporPeca(spec('t1b-cat-legado', TOPO), { somenteAvaliar: true, acentosCongelados: [] })
    expect(r.layers.some((l: Layer) => l.type === 'shape')).toBe(false)
    expect(r.diagnostico.arquetipo).toMatchObject({ elementosMaterializados: [], acentos: [] })
  }, 60_000)

  it('as outras guardas continuam no replay: impressão divergente e formato fora do arquétipo recusam', async () => {
    await montar('t1b-cat-guardas')
    const imp = await comporPeca({ ...spec('t1b-cat-guardas', TOPO), arquetipo: { id: TOPO, versao: 1, impressao: 'arq1-00000000000000' } }, { somenteAvaliar: true, acentosCongelados: [] }).then(() => null, (e) => e)
    expect((imp as CreativeError).code).toBe('ARQUETIPO_IMPRESSAO_DIVERGENTE')
    const quadrado = await comporPeca({ ...spec('t1b-cat-guardas', TOPO), formato: 'quadrado' }, { somenteAvaliar: true, acentosCongelados: [] }).then(() => null, (e) => e)
    expect((quadrado as CreativeError).code).toBe('ARQUETIPO_FORMATO_NAO_SUPORTADO')
    expect(verArquetipo(TOPO)).not.toBeNull()
  }, 60_000)
})
