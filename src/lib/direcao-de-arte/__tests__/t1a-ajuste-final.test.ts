/**
 * T1a — o autofix final não encolhe peça com arquétipo: se ele mexeria num
 * texto (corpo, entrelinha, posição), a peça não é a que o medir-copy mediu, e
 * é recusada (ARQUETIPO_AJUSTE_FINAL). Sem arquétipo, o autofix age como sempre.
 * Aqui um autofix de prova que reduz o corpo da manchete em 10%.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => (await import('./suporte/compositor')).mockDoBanco())
vi.mock('@/lib/creatives/persist', async () => (await import('./suporte/compositor')).mockDaPersistencia())
vi.mock('@/lib/posts/register-project-fonts', async () => (await import('./suporte/compositor')).mockDasFontes())
vi.mock('@/lib/creatives/server-text-measurer', async () => (await import('./suporte/compositor')).mockDoMedidor())
vi.mock('@/lib/creatives/text-autofix', () => ({
  aplicarAutofixOuFalhar: async (args: { layers: Array<Record<string, any>> }) => ({
    layers: args.layers.map((l) => (l.id === 'headline' ? { ...l, style: { ...l.style, fontSize: Math.round(l.style.fontSize * 0.9) } } : l)),
    avisos: ['headline: corpo reduzido pelo ajuste final'],
  }),
}))
vi.mock('@/lib/creatives/uso-de-foto', async () => (await import('./suporte/compositor')).mockDoUsoDeFoto())
vi.mock('@/lib/creatives/acervo', async () => (await import('./suporte/compositor')).mockDoAcervo())
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('./suporte/compositor')).gradientesDoCenario,
}))

import { comporPeca } from '@/lib/compositor/compor'
import { CreativeError } from '@/lib/creatives/errors'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const BLOCOS = [
  { papel: 'headline', linhas: ['Almoço', 'de domingo'] },
  { papel: 'servico', linhas: ['Dom · 12h às 16h'] },
]

describe('T1a · o ajuste final', () => {
  it('com arquétipo, o autofix que mexeria num texto é recusa; sem arquétipo, ele age como sempre', async () => {
    const foto = await fotoSintetica(() => 200)
    const pagina = paginaSintetica({ id: 't1a-ajuste', headline: { cor: '#F5F5F5' }, servico: { cor: '#F5F5F5' }, logoUrl: dataUrl(await logoSintetica('#808080')), fundoUrl: dataUrl(foto) })
    const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
    cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } } } }

    const erro = await comporPeca({ ...specSintetica({ pagina: 't1a-ajuste', blocos: BLOCOS }), arquetipo: { id: 'minimal-fb-topo-esquerda' } }, { somenteAvaliar: true }).then(
      () => null,
      (e) => e,
    )
    expect(erro).toBeInstanceOf(CreativeError)
    expect((erro as CreativeError).code).toBe('ARQUETIPO_AJUSTE_FINAL')
    expect((erro as CreativeError).details).toMatchObject({ camadas: ['headline'] })

    const r = await comporPeca(specSintetica({ pagina: 't1a-ajuste', blocos: BLOCOS }), { somenteAvaliar: true })
    expect(r.layers.find((l) => l.id === 'headline')!.style?.fontSize).toBe(81)
  }, 60_000)
})
