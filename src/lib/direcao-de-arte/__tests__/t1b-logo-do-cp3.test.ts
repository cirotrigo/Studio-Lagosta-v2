/**
 * T1b (rodada 1 da revisão) — a logo DEFINITIVA do CP3 não cai em cima de um acento. No centro-óptico a logo é
 * automática: quando a desenhada não lê, o CP3 tenta outras variantes no canto e nos cantos livres. Uma variante ALTA
 * no canto de cima alcança o spark (sem tocar texto nenhum): ela tem de sair da grade como "fora da área", e a peça
 * fica com outra variante — o spark desenhado e o diagnóstico coerentes.
 */
import sharp from 'sharp'
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

import type { Layer } from '@/types/template'
import { comporPeca } from '@/lib/compositor/compor'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const CENTRO = 'minimal-fb-centro-optico'
const CLARO = '#F5F5F5'

/**
 * Logo 160×210 (razão 1,31): um bloco claro opaco no meio — em 500 px de largura, 656 de altura. Era 160×200 (625 de
 * altura) até 29/10/2026: com a margem da casa no topo em 160 (era 188) a variante pousa 28 px mais alto e a de 625
 * parava 2 px ANTES do spark (785 × 787) — a premissa do caso ("a variante alta alcançaria o spark") pede 656.
 */
async function logoAlta(tinta: string): Promise<Buffer> {
  const W = 160
  const H = 210
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(tinta.slice(i, i + 2), 16))
  const px = Buffer.alloc(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4
    const opaco = x > 20 && x < 140 && y > 20 && y < 190
    px[p] = r; px[p + 1] = g; px[p + 2] = b; px[p + 3] = opaco ? 255 : 0
  }
  return sharp(px, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
}

const intersecta = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const caixa = (l: Layer) => ({ x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height })

describe('T1b · a logo definitiva do CP3 e os acentos', () => {
  it('a variante alta que alcançaria o spark é ELIMINADA pela grade do CP3; a peça sai com outra variante, o spark fica', async () => {
    const foto = await fotoSintetica(() => 128)
    const pagina = paginaSintetica({ id: 't1b-cp3', headline: { cor: CLARO }, apoio: { cor: CLARO }, servico: { cor: CLARO }, logoUrl: dataUrl(await logoSintetica('#808080')), fundoUrl: dataUrl(foto) })
    // A logo da página, larga (500 px): cinza sobre cinza, não lê — o CP3 vai às variantes do projeto.
    pagina.layers = pagina.layers.map((l) => (l.id === 'logo-pagina' ? { ...l, size: { width: 500, height: 250 } } : l))
    const alta = dataUrl(await logoAlta('#F5F5F5'))
    const baixa = dataUrl(await logoSintetica('#F5F5F5'))
    const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: [{ fileUrl: alta, isProjectLogo: true }, { fileUrl: baixa, isProjectLogo: true }] })
    cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO }, destaque: { fill: '#E4572E' } } } }
    const s = { ...specSintetica({ pagina: 't1b-cp3', blocos: [{ papel: 'headline', linhas: ['Sexta'] }, { papel: 'apoio', linhas: ['jazz ao vivo'] }, { papel: 'servico', linhas: ['Dom · 12h às 16h'] }] }), arquetipo: { id: CENTRO } }
    const r = await comporPeca(s, { somenteAvaliar: true })

    const spark = r.layers.find((l) => l.id === 'acento-spark')!
    const logo = r.layers.find((l) => l.id === 'logo')!
    const textos = r.layers.filter((l) => l.type === 'text').map(caixa)
    expect(spark).toBeDefined()
    expect(intersecta(caixa(logo), caixa(spark))).toBe(false)
    expect(logo.fileUrl).toBe(baixa)

    // A grade do CP3: a variante alta no canto foi avaliada e eliminada SÓ por causa do acento — não toca texto nenhum.
    const avaliacoes = r.diagnostico.logo!.legibilidade!.avaliacoes
    const daAlta = avaliacoes.filter((a) => a.variante.url === alta)
    const barradaPeloAcento = daAlta.filter((a) => intersecta(a.posicao, caixa(spark)) && !textos.some((t) => intersecta(t, a.posicao)))
    expect(barradaPeloAcento.length).toBeGreaterThan(0)
    for (const a of barradaPeloAcento) expect(a.estado).toBe('fora-da-area')
    // O diagnóstico diz a mesma peça: o spark desenhado, nada omitido.
    expect(r.diagnostico.arquetipo!.elementosMaterializados).toEqual(['spark'])
    expect(r.diagnostico.arquetipo!.acentosOmitidos).toBeUndefined()
  }, 120_000)
})
