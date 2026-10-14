/**
 * CP1 (13/10/2026) — COR REAL POR BORDA no diagnóstico do compositor. Quando a
 * página da assinatura desenha um gradiente de cor diferente em cada borda, o
 * compositor já desenhava a cor de cada uma, mas o diagnóstico repetia a
 * PRIMEIRA nas duas. Página sintética; as cores são fixture.
 */
import { describe, expect, it, vi } from 'vitest'

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

import type { Layer } from '@/types/template'
import { comporPeca } from '@/lib/compositor/compor'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const DO_TOPO = '#202A44'
const DO_RODAPE = '#4A1C1C'

/** Gradiente desenhado na página: forte na borda (ângulo 180 = topo, 0 = rodapé), some no meio. */
const gradienteDaPagina = (id: string, cor: string, angulo: number, y: number): Layer =>
  ({
    id,
    name: id,
    type: 'gradient',
    visible: true,
    locked: false,
    order: 1,
    position: { x: 0, y },
    size: { width: 1080, height: 700 },
    style: {
      gradientAngle: angulo,
      gradientStops: [
        { id: 'a', position: 0, color: cor, opacity: 0.8 },
        { id: 'b', position: 1, color: cor, opacity: 0 },
      ],
    },
  }) as Layer

async function compor(gradientes: Layer[], luz: (x: number, y: number) => number = () => 120) {
  const foto = await fotoSintetica(luz)
  const pagina = paginaSintetica({
    id: `cp1-cor-por-borda-${gradientes.length}`,
    headline: { cor: '#F5F5F5' },
    servico: { cor: '#F5F5F5' },
    logoUrl: dataUrl(await logoSintetica('#F5F5F5')),
    fundoUrl: dataUrl(foto),
  })
  pagina.layers.push(...gradientes)
  cenario.atual = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [VEU_ESCURO, VEU_CLARO] })
  return comporPeca(specSintetica({ pagina: pagina.id, blocos: [{ papel: 'headline', linhas: ['Sintético'] }, { papel: 'servico', linhas: ['Seg a sex · 12h às 22h'] }] }), { somenteAvaliar: true })
}

describe('o diagnóstico diz a cor DESENHADA em cada borda e de onde ela veio', () => {
  it('página com gradiente só no topo e rodapé CLARO sob o serviço claro: o rodapé ganha a cor da página (escura), com origem "pagina"', async () => {
    const r = await compor([gradienteDaPagina('grad-topo', DO_TOPO, 180, 0)], (_x, y) => (y > 960 ? 205 : 120))
    const diag = Object.fromEntries((r.diagnostico.gradientes ?? []).map((g) => [g.borda, g]))
    expect(diag.topo).toMatchObject({ cor: DO_TOPO, origemDaCor: 'pagina-na-borda' })
    expect(diag.rodape).toMatchObject({ cor: DO_TOPO, origemDaCor: 'pagina' })
  }, 60_000)

  it('CP2A: sem necessidade no rodapé, nenhum véu automático ali — e o gradiente EXPLÍCITO do topo, da página, fica', async () => {
    const r = await compor([gradienteDaPagina('grad-topo', DO_TOPO, 180, 0)])
    expect(r.layers.some((l) => l.id === 'gradiente-leitura-rodape')).toBe(false)
    expect((r.diagnostico.gradientes ?? []).map((g) => [g.borda, g.origemDaCor])).toEqual([['topo', 'pagina-na-borda']])
    const porBorda = Object.fromEntries((r.diagnostico.tratamentoDeLeitura ?? []).map((t) => [t.borda, t.estado]))
    expect(porBorda).toEqual({ topo: 'explicito-do-template', rodape: 'sem-necessidade' })
  }, 60_000)

  it('página com um gradiente de cor diferente por borda: cada borda reporta a sua cor, com origem "pagina-na-borda"', async () => {
    const r = await compor([gradienteDaPagina('grad-topo', DO_TOPO, 180, 0), gradienteDaPagina('grad-rodape', DO_RODAPE, 0, 1220)])
    const desenhada = (borda: string) => {
      const l = r.layers.find((x) => x.id === `gradiente-leitura-${borda}`)!
      return (l.style as { gradientStops: Array<{ color: string }> }).gradientStops[0].color
    }
    const diag = Object.fromEntries((r.diagnostico.gradientes ?? []).map((g) => [g.borda, g]))
    expect(desenhada('topo')).toBe(DO_TOPO)
    expect(desenhada('rodape')).toBe(DO_RODAPE)
    expect(diag.topo).toMatchObject({ cor: DO_TOPO, origemDaCor: 'pagina-na-borda' })
    expect(diag.rodape).toMatchObject({ cor: DO_RODAPE, origemDaCor: 'pagina-na-borda' })
  }, 60_000)
})
