/**
 * F2c (02/11/2026) — o CORPO desenhado na referência no compositor REAL (dublês de banco, persistência, fontes, medidor e
 * acervo; foto sintética; a referência do Brunch injetada pela resolução): a peça parte do corpo da referência, não do
 * da assinatura; a referência MAIOR que a caixa desce (dito); a revisão F1 congelada compõe como antes; e o medir-copy
 * dá o MESMO corpo do compor.
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
// A referência do cliente chega pela resolução (a camada de serviço lê o banco; aqui a definição vem direto).
vi.mock('@/lib/compositor/referencias', () => ({ resolucaoParaASpec: async () => ({ definicoes: definicoes.atual }) }))

import { comporPeca } from '@/lib/compositor/compor'
import { medirCopyDoProjeto } from '@/lib/compositor/medir-copy-service'
import { compilarReferencia } from '@/lib/compositor/arquetipos/referencia'
import brunch from '@/lib/compositor/arquetipos/__tests__/suporte/emporio-ref02-brunch.json'
import congelada from '@/lib/compositor/arquetipos/__tests__/suporte/emporio-ref02-brunch-v1-congelada.json'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

type Pagina = { id: string; name: string; width: number; height: number; tags: string[]; layers: Layer[] }
const PAGINA = brunch as unknown as Pagina
/**
 * A Brunch com a caixa da manchete mais alta (y 1480, 220 px): o medidor sintético mede a linha mais alta que a TrajanPro
 * real, e nos 97 px da página a manchete de 85 invadiria o apoio (ORDEM_DE_LEITURA); e três linhas desenhadas dão
 * `linhasMax: 3` (a página real tem uma). A geometria é a do teste; o corpo (85/39) é o da página real.
 */
const ALTA: Pagina = { ...PAGINA, layers: PAGINA.layers.map((l) => (l.id === 'titulo' ? ({ ...l, content: 'Brunch\nEmpório\nFonseca', position: { ...l.position, y: 1480 }, size: { ...l.size, height: 220 } } as Layer) : l)) }
const compilar = (pagina: Pagina = ALTA) => {
  const c = compilarReferencia(pagina, { pageVersion: 'v', versao: 1 })
  if (!c.ok) throw new Error(`${(c as { codigo: string }).codigo}: ${(c as { mensagem: string }).mensagem}`)
  return c.definicao
}
const BLOCOS = [
  { papel: 'headline', linhas: ['Café da manhã'] },
  { papel: 'apoio', linhas: ['Sabores da manhã'] },
]
/** Topo escuro, base clara: o texto da Brunch pousa no rodapé (claro), a logo no topo. */
const LUZ = (_x: number, y: number) => (y < 960 ? 40 : 200)

async function montar() {
  const foto = await fotoSintetica(LUZ)
  // A assinatura sintética desenha a manchete em 90 px e o apoio em 40 (ver `paginaSintetica`): a referência pede 85/39.
  const pagina = paginaSintetica({ id: 'f2c', headline: { cor: '#F5F5F5' }, apoio: { cor: '#F5F5F5' }, logoUrl: dataUrl(await logoSintetica('#808080')), fundoUrl: dataUrl(foto) })
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
  cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } } } }
}
const spec = (id: string, blocos = BLOCOS) => ({ ...specSintetica({ pagina: 'f2c', blocos }), foto: { driveFileId: 'foto-sintetica' }, arquetipo: { id } })
const camada = (layers: Layer[], id: string) => layers.find((l) => l.id === id)!

describe('F2c · o corpo da referência no compositor', () => {
  it('a peça pela Brunch nasce nos 85/39 px DESENHADOS (a assinatura sintética tem 90/40); o diagnóstico diz corpo, teto, piso e redução 0; o medir-copy dá o MESMO corpo', async () => {
    await montar()
    const def = compilar()
    definicoes.atual = [def]
    const r = await comporPeca(spec(def.id), { somenteAvaliar: true })
    expect([camada(r.layers, 'headline').style?.fontSize, camada(r.layers, 'apoio').style?.fontSize]).toEqual([85, 39])
    expect(r.diagnostico.arquetipo!.corpos).toEqual([
      { camada: 'headline', papel: 'headline', referencia: 85, teto: 85, piso: 68, efetivo: 85, reducao: 0 },
      { camada: 'apoio', papel: 'apoio', referencia: 39, teto: 39, piso: 31, efetivo: 39, reducao: 0 },
    ])
    expect(r.diagnostico.avisos.join(' ')).not.toMatch(/não nos 85 px/)
    const m = await medirCopyDoProjeto({ projectId: 9002, formato: 'story', blocos: BLOCOS, arquetipo: { id: def.id } } as never)
    expect(m.medicao.blocos.map((b) => [b.id, b.fontSize, b.situacao])).toEqual([['headline', 85, 'cabe'], ['apoio', 39, 'cabe']])
  }, 60_000)

  it('a referência MAIOR do que a caixa comporta (120 px, duas linhas numa caixa de 220) desce pela régua comum até caber — nunca abaixo do piso 96 — e a peça DIZ quanto encolheu', async () => {
    await montar()
    const base = compilar()
    const def = { ...base, formatos: { story: { ...base.formatos.story, corpos: { headline: 120, apoio: 39 } } } } as typeof base
    definicoes.atual = [def]
    // Duas linhas a 120 px passam dos 220 px da caixa: a escada desce até caber, nunca abaixo de 96.
    const r = await comporPeca(spec(def.id, [{ papel: 'headline', linhas: ['Café da manhã', 'servido cedo'] }, { papel: 'apoio', linhas: ['Sabores da manhã'] }]), { somenteAvaliar: true })
    const corpo = Number(camada(r.layers, 'headline').style?.fontSize)
    expect(corpo).toBeLessThan(120)
    expect(corpo).toBeGreaterThanOrEqual(96)
    const diag = r.diagnostico.arquetipo!.corpos!.find((c) => c.camada === 'headline')!
    expect(diag).toMatchObject({ referencia: 120, piso: 96, efetivo: corpo })
    expect(diag.reducao).toBeGreaterThan(0)
    expect(r.diagnostico.avisos.join(' ')).toMatch(new RegExp(`headline: coube em ${corpo} px, não nos 120 px da referência`))
    // O medir-copy dá o MESMO corpo (paridade) e o diz como reduzido contra a referência.
    const m = await medirCopyDoProjeto({ projectId: 9002, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Café da manhã', 'servido cedo'] }, { papel: 'apoio', linhas: ['Sabores da manhã'] }], arquetipo: { id: def.id } } as never)
    const h = m.medicao.blocos.find((b) => b.id === 'headline')!
    expect([h.fontSize, h.situacao]).toEqual([corpo, 'cabe-reduzido'])
    expect(h.corpo).toMatchObject({ referencia: 120, piso: 96, efetivo: corpo })
  }, 60_000)

  it('a revisão F1 CONGELADA (sem corpos) compõe como antes: a manchete nos 90 px da assinatura, sem `corpos` no diagnóstico', async () => {
    await montar()
    // A congelada é da página REAL (caixa de 97 px): a manchete de 90 px da assinatura sintética não cabe nela com o medidor
    // sintético — a caixa alta entra na definição congelada sem tocar no resto (impressão recomputada só para este teste).
    const v1 = { ...(congelada.definicao as unknown as ReturnType<typeof compilar>), formatos: { story: { ...compilar().formatos.story, corpos: undefined } } } as ReturnType<typeof compilar>
    delete (v1.formatos.story as unknown as Record<string, unknown>).corpos
    definicoes.atual = [v1]
    const r = await comporPeca(spec(v1.id), { somenteAvaliar: true })
    expect([camada(r.layers, 'headline').style?.fontSize, camada(r.layers, 'apoio').style?.fontSize]).toEqual([90, 40])
    expect(r.diagnostico.arquetipo!.corpos).toBeUndefined()
  }, 60_000)
})
