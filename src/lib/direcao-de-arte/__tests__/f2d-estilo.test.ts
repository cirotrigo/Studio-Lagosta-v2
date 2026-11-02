/**
 * F2d (02/11/2026) — o ESTILO desenhado na referência no compositor REAL (dublês; foto sintética; a referência do Brunch
 * injetada): a camada nasce na família, cor, caixa e espaçamento da referência com o corpo da F2c; a sombra é a da casa
 * quando a referência não tem; o medir-copy dá o mesmo; a revisão sem `estilos` compõe na assinatura, como antes.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'

const definicoes = vi.hoisted(() => ({ atual: [] as unknown[] }))
vi.mock('@/lib/db', async () => (await import('./suporte/compositor')).mockDoBanco())
vi.mock('@/lib/creatives/persist', async () => (await import('./suporte/compositor')).mockDaPersistencia())
vi.mock('@/lib/posts/register-project-fonts', async () => (await import('./suporte/compositor')).mockDasFontes())
vi.mock('@/lib/creatives/server-text-measurer', async () => (await import('./suporte/compositor')).mockDoMedidor())
vi.mock('@/lib/creatives/text-autofix', async () => (await import('./suporte/compositor')).mockDoAutofix())
vi.mock('@/lib/creatives/uso-de-foto', async () => (await import('./suporte/compositor')).mockDoUsoDeFoto())
vi.mock('@/lib/creatives/acervo', async () => (await import('./suporte/compositor')).mockDoAcervo())
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('./suporte/compositor')).gradientesDoCenario,
}))
vi.mock('@/lib/compositor/referencias', () => ({ resolucaoParaASpec: async () => ({ definicoes: definicoes.atual }) }))

import { comporPeca } from '@/lib/compositor/compor'
import { medirCopyDoProjeto } from '@/lib/compositor/medir-copy-service'
import { compilarReferencia } from '@/lib/compositor/arquetipos/referencia'
import brunch from '@/lib/compositor/arquetipos/__tests__/suporte/emporio-ref02-brunch.json'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

type Pagina = { id: string; name: string; width: number; height: number; tags: string[]; layers: Layer[] }
const PAGINA = brunch as unknown as Pagina
/** A Brunch com a caixa da manchete alta (y 1440, 260 px, três linhas): o medidor sintético mede a linha mais alta que a TrajanPro. */
const ALTA: Pagina = { ...PAGINA, layers: PAGINA.layers.map((l) => (l.id === 'titulo' ? ({ ...l, content: 'Brunch\nEmpório\nFonseca', position: { ...l.position, y: 1440 }, size: { ...l.size, height: 260 } } as Layer) : l)) }
const compilar = (pagina: Pagina = ALTA) => {
  const c = compilarReferencia(pagina, { pageVersion: 'v', versao: 1 })
  if (!c.ok) throw new Error(`${(c as { codigo: string }).codigo}: ${(c as { mensagem: string }).mensagem}`)
  return c.definicao
}
const BLOCOS = [
  { papel: 'headline', linhas: ['Café da manhã'] },
  { papel: 'apoio', linhas: ['Sabores da manhã'] },
]
const LUZ = (_x: number, y: number) => (y < 960 ? 40 : 200)

async function montar() {
  const foto = await fotoSintetica(LUZ)
  const base0 = paginaSintetica({ id: 'f2d', headline: { cor: '#F5F5F5' }, apoio: { cor: '#F5F5F5' }, logoUrl: dataUrl(await logoSintetica('#808080')), fundoUrl: dataUrl(foto) })
  // A assinatura sintética com peso 700, caixa alta e espaçamento 2 na manchete: a referência limpa os três.
  const pagina = { ...base0, layers: base0.layers.map((l) => (l.name === 'headline' ? ({ ...l, style: { ...l.style, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 } } as Layer) : l)) }
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
  cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } } } }
}
const spec = (id: string, blocos = BLOCOS) => ({ ...specSintetica({ pagina: 'f2d', blocos }), foto: { driveFileId: 'foto-sintetica' }, arquetipo: { id } })
const camada = (layers: Layer[], id: string) => layers.find((l) => l.id === id)!

describe('F2d · o estilo da referência no compositor', () => {
  it('a camada nasce na família, cor, caixa e espaçamento DESENHADOS, com o corpo da F2c; a sombra é a da casa; o diagnóstico diz a origem; o medir-copy dá o mesmo', async () => {
    await montar()
    const def = compilar()
    definicoes.atual = [def]
    const r = await comporPeca(spec(def.id), { somenteAvaliar: true })
    const h = camada(r.layers, 'headline')
    const a = camada(r.layers, 'apoio')
    expect(h.style).toMatchObject({ fontFamily: 'TrajanPro Regular', fontSize: 85, textTransform: 'uppercase', letterSpacing: 0, color: '#F8F8F8' })
    expect(h.style?.fontWeight).toBeUndefined()
    expect(a.style).toMatchObject({ fontFamily: 'TrajanPro Regular', fontSize: 39, letterSpacing: 3, color: '#F8F8F8' })
    // A referência não tem sombra: a base fica — a assinatura sintética está SEM sombra (`null`), e o `null` não vira default.
    expect(h.effects?.shadow).toBeUndefined()
    // A base dos dois blocos é o ARRANJO da página de assinatura (headline e apoio no mesmo grupo): a origem do que a
    // referência não cobre (a sombra) é dita como 'arranjo', não 'assinatura'.
    const diag = r.diagnostico.arquetipo!.estilos!
    expect(diag.map((e) => [e.camada, e.fontFamily, e.color, e.letterSpacing, e.origem.fontFamily, e.origem.sombra])).toEqual([['headline', 'TrajanPro Regular', '#F8F8F8', 0, 'referencia', 'arranjo'], ['apoio', 'TrajanPro Regular', '#F8F8F8', 3, 'referencia', 'arranjo']])
    const m = await medirCopyDoProjeto({ projectId: 9002, formato: 'story', blocos: BLOCOS, arquetipo: { id: def.id } } as never)
    for (const id of ['headline', 'apoio']) {
      const b = m.medicao.blocos.find((x) => x.id === id)!
      const l = camada(r.layers, id)
      expect([id, b.fontSize, b.estilo?.fontFamily, b.estilo?.letterSpacing, b.estilo?.color]).toEqual([id, l.style?.fontSize, l.style?.fontFamily, l.style?.letterSpacing, l.style?.color])
    }
  }, 60_000)

  it('a revisão SEM estilos (só corpos, como a @2 da Brunch) compõe na assinatura: Sintetica Display, peso 700, caixa alta, espaçamento escalado — nada muda', async () => {
    await montar()
    const base = compilar()
    const { estilos: _e, ...soCorpos } = base.formatos.story
    const def = { ...base, formatos: { story: soCorpos } } as typeof base
    definicoes.atual = [def]
    const r = await comporPeca(spec(def.id), { somenteAvaliar: true })
    const h = camada(r.layers, 'headline')
    expect(h.style).toMatchObject({ fontFamily: 'Sintetica Display', fontSize: 85, fontWeight: 700, textTransform: 'uppercase', color: '#F5F5F5' })
    expect(h.style?.letterSpacing).toBeCloseTo(2 * (85 / 90), 2)
    expect(r.diagnostico.arquetipo!.estilos).toBeUndefined()
  }, 60_000)
})
