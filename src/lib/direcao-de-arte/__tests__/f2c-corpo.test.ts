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
 * A Brunch com a caixa da manchete mais alta (y 1440, 260 px): o medidor sintético mede a linha mais alta que a TrajanPro
 * real, e nos 97 px da página a manchete de 85 invadiria o apoio (ORDEM_DE_LEITURA); e três linhas desenhadas dão
 * `linhasMax: 3` (a página real tem uma). A geometria é a do teste; o corpo (85/39) é o da página real.
 */
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
/** Topo escuro, base clara: o texto da Brunch pousa no rodapé (claro), a logo no topo. */
const LUZ = (_x: number, y: number) => (y < 960 ? 40 : 200)

async function montar(opcoes: { segundaVoz?: boolean } = {}) {
  const foto = await fotoSintetica(LUZ)
  // A assinatura sintética desenha a manchete em 90 px e o apoio em 40 (ver `paginaSintetica`): a referência pede 85/39.
  const base0 = paginaSintetica({ id: 'f2c', headline: { cor: '#F5F5F5' }, apoio: { cor: '#F5F5F5' }, logoUrl: dataUrl(await logoSintetica('#808080')), fundoUrl: dataUrl(foto) })
  // A segunda voz na assinatura (45 px, metade da manchete): a regra legada manda a última linha da manchete para ela.
  const manchete = base0.layers.find((l) => l.name === 'headline')!
  // A manchete da assinatura com letterSpacing 2 (px no corpo de 90): o efeito existente de escalar junto fica medido.
  const comEspaco = { ...base0, layers: base0.layers.map((l) => (l.name === 'headline' ? ({ ...l, style: { ...l.style, letterSpacing: 2 } } as Layer) : l)) }
  const pagina = opcoes.segundaVoz
    ? { ...comEspaco, layers: [...comEspaco.layers, { ...manchete, id: 'headline2-pagina', name: 'headline2', position: { x: 92, y: 410 }, size: { width: 896, height: 54 }, style: { ...manchete.style, fontSize: 45 } } as Layer] }
    : comEspaco
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
    // F2d: o espaçamento passou a ser o DESENHADO na referência (a Brunch tem 0 na manchete), não o da assinatura escalado.
    expect(camada(r.layers, 'headline').style?.letterSpacing).toBe(0)
    const m = await medirCopyDoProjeto({ projectId: 9002, formato: 'story', blocos: BLOCOS, arquetipo: { id: def.id } } as never)
    expect(m.medicao.blocos.map((b) => [b.id, b.fontSize, b.situacao])).toEqual([['headline', 85, 'cabe'], ['apoio', 39, 'cabe']])
  }, 60_000)

  it('a referência MAIOR do que a caixa comporta (150 px, duas linhas numa caixa de 260) desce pela régua comum até caber — nunca abaixo do piso 120 — e a peça DIZ quanto encolheu', async () => {
    await montar()
    const base = compilar()
    const def = { ...base, formatos: { story: { ...base.formatos.story, corpos: { headline: 150, apoio: 39 } } } } as typeof base
    definicoes.atual = [def]
    // Duas linhas a 150 px passam dos 260 px da caixa: a escada desce até caber, nunca abaixo de 120.
    const r = await comporPeca(spec(def.id, [{ papel: 'headline', linhas: ['Café da manhã', 'servido cedo'] }, { papel: 'apoio', linhas: ['Sabores da manhã'] }]), { somenteAvaliar: true })
    const corpo = Number(camada(r.layers, 'headline').style?.fontSize)
    expect(corpo).toBeLessThan(150)
    expect(corpo).toBeGreaterThanOrEqual(120)
    const diag = r.diagnostico.arquetipo!.corpos!.find((c) => c.camada === 'headline')!
    expect(diag).toMatchObject({ referencia: 150, piso: 120, efetivo: corpo })
    expect(diag.reducao).toBeGreaterThan(0)
    expect(r.diagnostico.avisos.join(' ')).toMatch(new RegExp(`headline: coube em ${corpo} px, não nos 150 px da referência`))
    // O medir-copy dá o MESMO corpo (paridade) e o diz como reduzido contra a referência.
    const m = await medirCopyDoProjeto({ projectId: 9002, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Café da manhã', 'servido cedo'] }, { papel: 'apoio', linhas: ['Sabores da manhã'] }], arquetipo: { id: def.id } } as never)
    const h = m.medicao.blocos.find((b) => b.id === 'headline')!
    expect([h.fontSize, h.situacao]).toEqual([corpo, 'cabe-reduzido'])
    expect(h.corpo).toMatchObject({ referencia: 150, piso: 120, efetivo: corpo })
  }, 60_000)

  it('redução CONJUNTA com paridade compor/medir: manchete + segunda voz partem do mesmo teto (85), a pilha que não cabe desce em px até caber nos dois; uma linha só volta ao teto', async () => {
    await montar({ segundaVoz: true })
    const def = compilar()
    definicoes.atual = [def]
    // Três linhas (voz 1 com duas, voz 2 com a última) a 85 passam dos 260 px: a unidade desce em px até caber nas duas vozes.
    const duasVozes = [{ papel: 'headline', linhas: ['Café da manhã', 'servido', 'cedo'] }, { papel: 'apoio', linhas: ['Sabores da manhã'] }]
    const r = await comporPeca(spec(def.id, duasVozes), { somenteAvaliar: true })
    const h = camada(r.layers, 'headline')
    const v2 = camada(r.layers, 'headline2')
    expect(h.style?.fontSize).toBe(v2.style?.fontSize)
    expect(Number(h.style?.fontSize)).toBeLessThan(85)
    expect(Number(h.style?.fontSize)).toBeGreaterThanOrEqual(68)
    const corpos = r.diagnostico.arquetipo!.corpos!
    expect(corpos.map((c) => [c.camada, c.efetivo, c.teto])).toEqual([['headline', h.style?.fontSize, h.style?.fontSize], ['headline2', v2.style?.fontSize, h.style?.fontSize], ['apoio', 39, 39]])
    expect(corpos[1].observacao).toMatch(/partem do MESMO teto de 85 px/)
    // Paridade: o medir-copy dá o mesmo corpo, a mesma caixa e a mesma classificação por bloco.
    const m = await medirCopyDoProjeto({ projectId: 9002, formato: 'story', blocos: duasVozes, arquetipo: { id: def.id } } as never)
    for (const id of ['headline', 'headline2', 'apoio']) {
      const b = m.medicao.blocos.find((x) => x.id === id)!
      const l = camada(r.layers, id)
      expect([id, b.fontSize, b.width, b.height, b.situacao]).toEqual([id, l.style?.fontSize, l.size.width, l.size.height, id === 'apoio' ? 'cabe' : 'cabe-reduzido'])
    }
    // Uma linha só (sem segunda voz): a manchete volta ao teto de 85.
    const r1 = await comporPeca(spec(def.id), { somenteAvaliar: true })
    expect(camada(r1.layers, 'headline').style?.fontSize).toBe(85)
  }, 60_000)

  it('a revisão F1 CONGELADA (sem corpos), com a GEOMETRIA e a IMPRESSÃO intactas: o medir-copy mede como antes (90 px da assinatura, sem corpo) e a composição pelo caminho sem corpos sai em 90', async () => {
    await montar()
    // A geometria real (manchete y 1618, 97 px; apoio y 1707) só compõe com a TrajanPro de verdade: o medidor calibrado do
    // harness mede a manchete terminando em 1713 e a busca espacial elimina por ORDEM_DE_LEITURA (também na F1, antes da
    // F2c). A medição estrutural não passa pela busca: roda sobre a definição congelada INTACTA, com versão e impressão fixadas.
    const v1 = congelada.definicao as unknown as ReturnType<typeof compilar>
    definicoes.atual = [v1]
    const m = await medirCopyDoProjeto({ projectId: 9002, formato: 'story', blocos: BLOCOS, arquetipo: { id: v1.id, versao: 1, impressao: congelada.impressao } } as never)
    expect(m.medicao.arquetipo!.impressao).toBe(congelada.impressao)
    // A escada legada: parte dos 90 da assinatura e desce (até 80 %) para caber nos 97 px da caixa real — sem `corpo`.
    const h = m.medicao.blocos.find((b) => b.id === 'headline')!
    expect(h.fontSize!).toBeLessThanOrEqual(90)
    expect(h.fontSize!).toBeGreaterThanOrEqual(72)
    expect([h.corpo, m.medicao.blocos.find((b) => b.id === 'apoio')!.fontSize]).toEqual([undefined, 40])
    expect(m.medicao.arquetipo!.papeis.headline!.corpo).toBeUndefined()
    // A composição real pelo caminho SEM corpos (a definição congelada com a caixa alta do harness, impressão recomputada só
    // para o teste): a manchete nos 90 px da assinatura, nenhum `corpos` no diagnóstico.
    const alta = { ...v1, formatos: { story: { ...compilar().formatos.story } } } as ReturnType<typeof compilar>
    delete (alta.formatos.story as unknown as Record<string, unknown>).corpos
    definicoes.atual = [alta]
    const r = await comporPeca(spec(alta.id), { somenteAvaliar: true })
    expect([camada(r.layers, 'headline').style?.fontSize, camada(r.layers, 'apoio').style?.fontSize]).toEqual([90, 40])
    expect(r.diagnostico.arquetipo!.corpos).toBeUndefined()
  }, 60_000)
})
