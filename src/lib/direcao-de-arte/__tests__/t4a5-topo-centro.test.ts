/**
 * #5 `minimal-fb-topo-centro@1` (24/10/2026) no COMPOSITOR e no MEDIDOR reais, com FONTES REAIS (Georgia e Montserrat,
 * `createServerTextBoxMeasurer`). Foto INTEIRA: a logo FIXA no topo-centro, a manchete e o apoio centrados logo abaixo e
 * o serviço de UMA linha na base, envolvido pela PÍLULA DE CONTORNO (acento obrigatório, cor do serviço, traço 2, raio de
 * meia altura). A pílula se mede pela caixa REAL do serviço desenhado; o interior permitido é o CURVO que os renderers
 * desenham; a folga conta na zona e na faixa. A leitura da logo é do CP3 (só variante, na mesma caixa centrada; sem
 * variante legível, recusa) — nenhum véu novo.
 * Dublados: banco (o cenário em memória), Blob (a persistência só captura a entrada), registro de fontes, autofix, acervo.
 * A foto vem por URL de identidade fixa e os bytes pelo dublê do fetch: nada de Drive, Blob ou rede. Marca, fotos e logo
 * SINTÉTICAS (`cenario-5.ts`) — não é aceite de marca real nem aceite estético (G-H1 é do owner).
 */
import { describe, expect, it, vi } from 'vitest'

const cap = vi.hoisted(() => ({ entradas: [] as Array<Record<string, any>> }))

vi.mock('@/lib/db', async () => {
  const { cenario: c, mockDoBanco } = await import('./suporte/compositor')
  const base = mockDoBanco().db as Record<string, any>
  return {
    db: {
      ...base,
      project: { findUnique: async (args: unknown) => ({ ...(await base.project.findUnique(args)), titleFontFamily: 'Georgia', bodyFontFamily: 'Montserrat', subtitleFontFamily: null }) },
      page: {
        ...base.page,
        findMany: async (args?: { where?: { id?: { in?: string[]; not?: string } } }) =>
          c.atual!.paginasDeAssinatura.filter((p) => (!args?.where?.id?.in || args.where.id.in.includes(p.id)) && (!args?.where?.id?.not || p.id !== args.where.id.not)),
      },
      fontCombination: { findMany: async () => [] },
    },
  }
})
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

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { medirCopyDoProjeto } from '@/lib/compositor/medir-copy-service'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { cabeNoInteriorDaPilula } from '@/lib/compositor/arquetipos/acentos'
import { ehGradienteDeLeitura } from '@/lib/compositor/gradiente-de-leitura'
import { LOGO_SEM_VARIANTE_LEGIVEL } from '@/lib/compositor/legibilidade-da-logo'
import { medirContrasteDaPeca } from '@/lib/compositor/regua'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { gateDaMedida } from '@/lib/creatives/revisao/gate'
import { POLITICA_DO_ASSUNTO_DO_GATE } from '@/lib/lotes/agendamento'
import { medida as medidaDoGate, metrica as metricaDoGate } from '@/lib/creatives/revisao/__tests__/suporte/corpus-do-gate'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import type { Layer } from '@/types/template'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { logoSintetica } from './suporte/sinteticos'
import { DIMENSOES, ID_TOPO_CENTRO, LOGO_CLARA, LOGO_ESCURA, PROJETO_5, TINTA_ESCURA, cenario5, copy5, fontesNoDisco, fotoDoCenario5, medidorComFontesReais, paginaDoCenario5, spec5 } from './suporte/cenario-5'

type Formato = 'story' | 'feed'
let real: { medir: MeasureTextBox } | null = null
async function medidorReal() {
  real ??= await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  return real.medir
}
type OpcoesDaPagina = Parameters<typeof paginaDoCenario5>[1]
interface Montagem {
  formato?: Formato
  topo: number
  base?: number
  pagina?: OpcoesDaPagina
  variantes?: string[]
  assinatura?: Record<string, unknown>
}
async function montar(id: string, m: Montagem) {
  const f = m.formato ?? 'story'
  const pagina = await paginaDoCenario5(id, m.pagina)
  const variantes = m.variantes ? await Promise.all(m.variantes.map(async (t) => ({ fileUrl: dataUrl(await logoSintetica(t)), isProjectLogo: true as const }))) : undefined
  cenario.atual = await cenario5(pagina, await medidorReal(), { foto: await fotoDoCenario5(DIMENSOES[f], { topo: m.topo, base: m.base }), variantes, assinatura: m.assinatura })
}
async function compor(s: Record<string, unknown>, opcoes: Parameters<typeof comporPeca>[1] = {}) {
  const antes = cap.entradas.length
  const r = await comporPeca(s, { autor: 'u-fixture', ...opcoes })
  return { r, entrada: cap.entradas.length > antes ? cap.entradas.at(-1) : undefined }
}
async function recusa(promessa: Promise<unknown>): Promise<{ code: string; message: string; status?: number; details?: Record<string, any> }> {
  try {
    await promessa
  } catch (e) {
    return e as { code: string; message: string; details?: Record<string, any> }
  }
  throw new Error('esperava recusa')
}
/** A recusa ANTES de gravar: a persistência (dublê) não foi chamada — nem Generation, nem Page, nem arte final. */
async function recusaSemGravar(promessa: Promise<unknown>) {
  const antes = cap.entradas.length
  const e = await recusa(promessa)
  expect(cap.entradas.length, 'nada pode ser gravado numa recusa').toBe(antes)
  return e
}
const camada = (r: ResultadoDaComposicao, id: string) => r.layers.find((l) => l.id === id)!
const caixa = (l: Layer) => ({ x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height })
const pilula = (r: ResultadoDaComposicao) => camada(r, 'acento-pilula')
const leitura = (r: ResultadoDaComposicao) => (r.diagnostico.logo as any).legibilidade
const bordasDosVeus = (r: ResultadoDaComposicao) => r.layers.filter((l) => ehGradienteDeLeitura(l)).map((l) => (l.metadata as any)?.borda)
const centroX = (l: Layer) => l.position.x + l.size.width / 2
const HARD = { story: { x0: 92, x1: 988, y0: 188, y1: 1696 }, feed: { x0: 92, x1: 988, y0: 120, y1: 1246 } } as const
const FOLGA = { story: { x: 32, y: 19 }, feed: { x: 32, y: 16 } } as const
const def5 = verArquetipo(ID_TOPO_CENTRO, 1)!
const IMPRESSAO = impressaoDoArquetipo(def5)
const urlDa = async (tinta: string) => dataUrl(await logoSintetica(tinta))
const medir5 = (s: Record<string, any>, extra: Record<string, unknown> = {}) =>
  medirCopyDoProjeto({ projectId: PROJETO_5, formato: s.formato, copyAutoral: s.copyAutoral, ...(s.foto?.url ? { fotoUrl: s.foto.url } : {}), ...(s.preferencias?.variante ? { variante: s.preferencias.variante } : {}), arquetipo: s.arquetipo, ...extra })
const SERVICOS = { curto: ['20h'], medio: ['Sexta, 14/11 · 20h'], longo: ['Sexta, 14/11 · 20h · Centro'] } as const

/** A pílula desenhada contra a caixa REAL do serviço: borda externa, camada, interior curvo e HARD. */
function conferirPilula(r: ResultadoDaComposicao, formato: Formato) {
  const T = caixa(camada(r, 'servico'))
  const L = caixa(pilula(r))
  const s = (pilula(r).style as any).strokeWidth as number
  const O = { x: L.x - 1, y: L.y - 1, width: L.width + 2, height: L.height + 2 }
  // O = T ⊕ folga (±1 px do arredondamento da caixa da camada contra a posição da unidade).
  expect(Math.abs(O.x - (T.x - FOLGA[formato].x)), 'O.x').toBeLessThanOrEqual(1)
  expect(Math.abs(O.y - (T.y - FOLGA[formato].y)), 'O.y').toBeLessThanOrEqual(1)
  expect(Math.abs(O.width - (T.width + 2 * FOLGA[formato].x)), 'O.w').toBeLessThanOrEqual(1)
  expect(Math.abs(O.height - (T.height + 2 * FOLGA[formato].y)), 'O.h').toBeLessThanOrEqual(1)
  const interior = cabeNoInteriorDaPilula(T, L, s, 9999)
  expect(interior.cabe, `interior curvo ${JSON.stringify(interior)}`).toBe(true)
  const h = HARD[formato]
  expect(O.x >= h.x0 - 0.5 && O.x + O.width <= h.x1 + 0.5 && O.y >= h.y0 - 0.5 && O.y + O.height <= h.y1 + 0.5, `borda externa ${JSON.stringify(O)} no HARD`).toBe(true)
  return { T, L, O, sobra: interior.sobra }
}

describe.skipIf(!fontesNoDisco())('#5 · topo centrado com o serviço em pílula, compositor e medidor reais, fontes reais', () => {
  for (const formato of ['story', 'feed'] as const) {
    it(`P-05/P-09/P-10/P-12/P-15/B-06/M-01/M-03/R-01 ${formato}: a pílula pela tinta real (curto < médio < longo), centrada, abaixo dos textos, no interior curvo; compor = medir`, async () => {
      await montar(`p5-${formato}`, { formato, topo: 40, base: 40 })
      const larguras: number[] = []
      for (const [nome, servico] of Object.entries(SERVICOS)) {
        const s = spec5(`p5-${formato}`, { formato, copyAutoral: copy5({ apoio: ['Harmonização com o chef'], servico: [...servico] }) })
        const { r, entrada } = await compor(s)
        const p = pilula(r)
        const { L, sobra } = conferirPilula(r, formato)
        larguras.push(L.width)
        // A pílula fica centrada no eixo, com o serviço.
        expect(Math.abs(centroX(p) - 540), nome).toBeLessThanOrEqual(1)
        expect(Math.abs(centroX(camada(r, 'servico')) - 540), nome).toBeLessThanOrEqual(1)
        expect(sobra, `${nome}: sobra curva`).toBeGreaterThanOrEqual(0)
        // P-10: a camada é a do asset, com a cor do serviço; P-12: abaixo de todos os textos.
        const corDoServico = String((camada(r, 'servico').style as any).color)
        expect(p).toMatchObject({ type: 'shape', name: 'Acento · Pílula de contorno' })
        expect(p.style).toMatchObject({ shapeType: 'rounded-rectangle', fill: 'transparent', strokeWidth: 2, border: { radius: 9999 }, vetor: { asset: { id: 'pilula-contorno', versao: 1 } } })
        expect(p.style?.vetor?.papeis).toBeUndefined()
        expect((p.style as any).strokeColor).toBe('rgba(255, 255, 255, 1)')
        expect(corDoServico.toUpperCase()).toBe('#FFFFFF')
        expect((p.metadata as any).compositor.acento).toMatchObject({ elemento: 'pilula', tipo: 'pilula-contorno', presoA: 'servico', corPorPapel: 'texto', fonteDaCor: 'texto-do-papel', arquetipo: `${ID_TOPO_CENTRO}@1` })
        const textos = r.layers.filter((l) => l.type === 'text')
        expect(textos.every((t) => (t.order ?? 0) > (p.order ?? 0))).toBe(true)
        // B-06: logo, manchete e apoio na MESMA faixa (o mesmo dy); a logo centrada, superior-centro, nunca automática.
        const escolha = r.diagnostico.arquetipo!.buscaEspacial!.escolha
        expect(escolha.deslocamentos.logo).toBe(escolha.deslocamentos.headline)
        expect(escolha.deslocamentos.apoio).toBe(escolha.deslocamentos.headline)
        expect(Math.abs(centroX(camada(r, 'logo')) - 540)).toBeLessThanOrEqual(1)
        expect((camada(r, 'logo').metadata as any).compositor).toMatchObject({ canto: 'superior-centro' })
        // M-01/M-03: o medir-copy prevê a MESMA pílula (no dy da faixa do serviço) e as mesmas posições.
        const m = await medir5(s)
        expect(m.medicao.cabeTudo).toBe(true)
        const prevista = m.medicao.arquetipo!.acentos.previstos
        expect(prevista.map((a) => [a.elemento, a.tipo])).toEqual([['pilula', 'pilula-contorno']])
        const dy = escolha.deslocamentos.servico ?? 0
        expect({ ...prevista[0].rect, y: prevista[0].rect.y + dy }, nome).toEqual(L)
        expect(m.medicao.arquetipo!.acentos.recusas).toEqual([])
        for (const id of ['headline', 'apoio', 'servico', 'logo'] as const) {
          const pos = m.medicao.arquetipo!.posicoes![id]!.posicao
          const d = escolha.deslocamentos[id] ?? 0
          expect([Math.round(pos.x), Math.round(pos.y + d)], `${nome} ${id}`).toEqual([Math.round(camada(r, id).position.x), Math.round(camada(r, id).position.y)])
        }
        // R-01: a receita gravada tem exatamente os campos do D7, com a cor e a fonte da cor.
        expect(entrada!.fieldValues.spec.arquetipo).toEqual({ id: ID_TOPO_CENTRO, versao: 1, impressao: IMPRESSAO })
        const gravada = entrada!.fieldValues.composicao.arquetipo.acentos
        expect(gravada).toHaveLength(1)
        const { camada: _c, rect: _r, ...receita } = gravada[0]
        expect(receita).toEqual({ elemento: 'pilula', tipo: 'pilula-contorno', presoA: 'servico', corPorPapel: 'texto', canal: 'contorno', asset: { id: 'pilula-contorno', versao: 1 }, desenho: { shapeType: 'rounded-rectangle', strokeWidth: 2, raio: 9999, ajuste: 'livre' }, cor: corDoServico, fonteDaCor: 'texto-do-papel' })
      }
      expect(larguras[0] < larguras[1] && larguras[1] < larguras[2], JSON.stringify(larguras)).toBe(true)
    }, 240_000)
  }

  it('P-11: marca de tinta ESCURA sobre foto clara — a pílula pega a cor do serviço desenhado', async () => {
    await montar('p5-escura', { topo: 210, base: 210, pagina: { tinta: TINTA_ESCURA, logo: LOGO_ESCURA } })
    const { r } = await compor(spec5('p5-escura'), { somenteAvaliar: true })
    expect((pilula(r).style as any).strokeColor).toBe('rgba(30, 30, 30, 1)')
    expect((pilula(r).metadata as any).compositor.acento.fonteDaCor).toBe('texto-do-papel')
    conferirPilula(r, 'story')
  }, 120_000)

  it('G-08: pré e cta recusam no compor e no medir antes de compor; sem serviço → faltam', async () => {
    await montar('p5-papeis', { topo: 40, base: 40 })
    for (const extra of [
      { id: 'convite', funcao: 'pre', linhas: ['Você é convidado'] },
      { id: 'site', funcao: 'cta', linhas: ['Reserve'] },
    ]) {
      const s = spec5('p5-papeis', { copyAutoral: copy5({ extras: [extra] }) })
      const e = await recusaSemGravar(comporPeca(s, { autor: 'u' }))
      expect([e.code, e.status, e.details!.naoSuportados]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', 422, [extra.funcao]])
      const em = await recusa(medir5(s))
      expect([em.code, em.details!.naoSuportados]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', [extra.funcao]])
    }
    const semServico = spec5('p5-papeis', { copyAutoral: { ...copy5(), blocos: copy5().blocos.filter((b) => b.funcao !== 'servico') } })
    expect((await recusaSemGravar(comporPeca(semServico, { autor: 'u' }))).details!.faltam).toEqual(['servico'])
  }, 120_000)

  it('B-07: serviço de 2 linhas (ou manchete de 3) → ARQUETIPO_LINHAS_EXCEDIDAS no compor, declarado no medir', async () => {
    await montar('p5-linhas', { topo: 40, base: 40 })
    for (const [copy, linhas] of [[copy5({ servico: ['Sexta, 14/11', '20h'] }), 2], [copy5({ manchete: ['Noite', 'de', 'vinhos'], voz2: [2] }), 3]] as const) {
      const s = spec5('p5-linhas', { copyAutoral: copy })
      expect((await recusaSemGravar(comporPeca(s, { autor: 'u' }))).code).toBe('ARQUETIPO_LINHAS_EXCEDIDAS')
      const m = await medir5(s)
      expect(m.medicao.cabeTudo).toBe(false)
      expect(m.medicao.arquetipo!.excessosDeLinhas.map((x) => x.linhas)).toEqual([linhas])
    }
  }, 120_000)

  it('B-08: corpo do serviço acima da capacidade mesmo a 80% → ARQUETIPO_TEXTO_NAO_CABE com o orçamento; o medir não cabe', async () => {
    await montar('p5-corpo', { topo: 40, base: 40, pagina: { corpoDoServico: 90 } })
    const s = spec5('p5-corpo')
    const e = await recusaSemGravar(comporPeca(s, { autor: 'u' }))
    expect(e.code).toBe('ARQUETIPO_TEXTO_NAO_CABE')
    expect(JSON.stringify(e.details)).toMatch(/"papel":"servico"/)
    expect((await medir5(s)).medicao.cabeTudo).toBe(false)
  }, 120_000)

  it('P-08 / M-02: serviço de 1 caractere em corpo grande (L.w < L.h) → ELEMENTO_NAO_CABE com o motivo; o medir diz a MESMA recusa', async () => {
    await montar('p5-curto', { topo: 40, base: 40, pagina: { corpoDoServico: 56 } })
    const s = spec5('p5-curto', { copyAutoral: copy5({ servico: ['8'] }) })
    const e = await recusaSemGravar(comporPeca(s, { autor: 'u' }))
    expect([e.code, e.status]).toEqual(['ARQUETIPO_ELEMENTO_NAO_CABE', 422])
    expect(e.message).toMatch(/curto demais para a cápsula horizontal/)
    const m = await medir5(s)
    expect(m.medicao.arquetipo!.acentos.recusas.map((x) => x.motivo)).toEqual(e.details!.problemas.map((x: any) => x.motivo))
    expect(m.medicao.arquetipo!.acentos.previstos).toEqual([])
  }, 120_000)

  it('P-16 / M-02 (asset vivo com traço 16, dublado no catálogo de elementos): peça NOVA e medir recusam pela conferência CURVA — a escalar (19 − 8 − 8 = 3) passaria', async () => {
    await montar('p5-traco', { topo: 40, base: 40 })
    const asset = SHAPES_LIBRARY.find((a) => a.id === 'pilula-contorno')!
    const original = asset.strokeWidth
    asset.strokeWidth = 16
    try {
      const s = spec5('p5-traco', { copyAutoral: copy5({ servico: ['Sexta, 14/11 · 20h'] }) })
      const e = await recusaSemGravar(comporPeca(s, { autor: 'u' }))
      expect([e.code, e.status]).toEqual(['ARQUETIPO_ELEMENTO_NAO_CABE', 422])
      expect(e.message).toMatch(/do servico encostaria no contorno arredondado \(sobra -/)
      expect(e.message).toMatch(/traço 16/)
      const m = await medir5(s)
      expect(m.medicao.arquetipo!.acentos.recusas.map((x) => x.motivo)).toEqual(e.details!.problemas.map((x: any) => x.motivo))
    } finally {
      asset.strokeWidth = original
    }
    // Restaurado: a mesma copy pousa com o traço do asset.
    expect(pilula((await compor(spec5('p5-traco', { copyAutoral: copy5({ servico: ['Sexta, 14/11 · 20h'] }) }), { somenteAvaliar: true })).r)).toBeTruthy()
  }, 120_000)

  it('H-07: área segura do rodapé mais apertada — resgate na faixa com a pílula dentro; mais apertada ainda → FORA_DA_ZONA com o motivo da pílula', async () => {
    await montar('p5-area', { topo: 40, base: 40, assinatura: { geometria: { story: { safeRodape: 300 } } } })
    const { r } = await compor(spec5('p5-area'), { somenteAvaliar: true })
    const dy = r.diagnostico.arquetipo!.buscaEspacial!.escolha.deslocamentos.servico
    expect(dy).toBeLessThan(0)
    const L = caixa(pilula(r))
    expect(L.y + L.height + 1).toBeLessThanOrEqual(1620 + 0.5)
    await montar('p5-area', { topo: 40, base: 40, assinatura: { geometria: { story: { safeRodape: 340 } } } })
    const e = await recusaSemGravar(comporPeca(spec5('p5-area'), { autor: 'u' }))
    expect(e.code).toBe('ARQUETIPO_FORA_DA_ZONA')
    expect(e.message).toMatch(/pílula de contorno \(folga 32 × 19 px\)/)
  }, 120_000)

  it('L-01/L-04: topo claro, desenhada CLARA + escura autorizada → variante-trocada para a escura, na MESMA caixa centrada; o véu fraco da logo não nasce (a borda de cima tem texto)', async () => {
    await montar('p5-claro', { topo: 210, base: 210, pagina: { tinta: TINTA_ESCURA, logo: LOGO_CLARA } })
    const { r } = await compor(spec5('p5-claro'), { somenteAvaliar: true })
    expect(leitura(r)).toMatchObject({ legivel: true, escolha: 'variante-trocada', canto: 'superior-centro', variante: { origem: 'projeto', url: await urlDa(LOGO_ESCURA) } })
    expect(Math.abs(centroX(camada(r, 'logo')) - 540)).toBeLessThanOrEqual(1)
    const topo = (r.diagnostico.tratamentoDeLeitura ?? []).find((t) => t.borda === 'topo')
    expect(topo?.veuDaLogo).toBeUndefined()
    expect(bordasDosVeus(r)).not.toContain('topo')
  }, 120_000)

  it('L-02: topo escuro — desenhada ESCURA troca para a clara', async () => {
    await montar('p5-escuro', { topo: 40, base: 40, pagina: { logo: LOGO_ESCURA } })
    const { r } = await compor(spec5('p5-escuro'), { somenteAvaliar: true })
    expect(leitura(r)).toMatchObject({ legivel: true, escolha: 'variante-trocada', canto: 'superior-centro', variante: { url: await urlDa(LOGO_CLARA) } })
  }, 120_000)

  it('L-03 / M-04: uma variante só, ilegível → LOGO_SEM_VARIANTE_LEGIVEL, nada gravado, nenhum véu novo; o medir-copy (sem CP3) dizia que cabe', async () => {
    await montar('p5-neg', { topo: 210, base: 210, pagina: { tinta: TINTA_ESCURA, logo: LOGO_CLARA }, variantes: [LOGO_CLARA] })
    const s = spec5('p5-neg')
    expect((await medir5(s)).medicao.cabeTudo).toBe(true)
    const e = await recusaSemGravar(comporPeca(s, { autor: 'u' }))
    expect([e.code, e.status]).toEqual([LOGO_SEM_VARIANTE_LEGIVEL, 422])
    expect(e.message).toMatch(/nenhum véu novo é desenhado para a logo/)
  }, 120_000)

  it('X-03: a régua do serviço é a MESMA com e sem a camada da pílula (o interior é transparente e o traço fica fora da caixa)', async () => {
    for (const base of [40, 210]) {
      await montar(`p5-regua-${base}`, { topo: 40, base, pagina: base > 100 ? { tinta: TINTA_ESCURA } : {} })
      const { r } = await compor(spec5(`p5-regua-${base}`), { somenteAvaliar: true })
      const args = { canvas: DIMENSOES.story, background: '#808080', faixa: [0, 1] as [number, number], corrigir: false }
      const com = await medirContrasteDaPeca({ layers: r.layers, ...args })
      const sem = await medirContrasteDaPeca({ layers: r.layers.filter((l) => l.id !== 'acento-pilula'), ...args })
      const doServico = (x: typeof com) => JSON.stringify(x.medidas.filter((m: any) => JSON.stringify(m).includes('servico')))
      expect(doServico(com).length).toBeGreaterThan(2)
      expect(doServico(com)).toBe(doServico(sem))
    }
  }, 120_000)

  it('H-06/H-08: o gate não vê a pílula (abaixo dos textos, fora do piso e da oclusão) — o resultado com e sem a camada é o mesmo (medida sintética do corpus: não é veredito de APTO)', async () => {
    await montar('p5-gate', { topo: 40, base: 40 })
    const { r } = await compor(spec5('p5-gate'), { somenteAvaliar: true })
    const gate = (camadas: Layer[]) => gateDaMedida({ medida: medidaDoGate({ camadas, formato: 'story', metricas: camadas.filter((l) => l.type === 'text').map((l) => metricaDoGate(l)) }), identidade: { pageVersion: 'v1:teste', copyVersion: 'c1' }, copy: { estado: 'sem-mudanca', lacunas: [] }, politicaDoAssunto: POLITICA_DO_ASSUNTO_DO_GATE }).gate
    const com = gate(r.layers)
    const sem = gate(r.layers.filter((l) => l.id !== 'acento-pilula'))
    expect(JSON.stringify(com.achados)).not.toMatch(/acento-pilula/)
    expect([com.resultado, com.achados.map((a: any) => a.regra).sort()]).toEqual([sem.resultado, sem.achados.map((a: any) => a.regra).sort()])
    expect(com.cobertura).toEqual(sem.cobertura)
  }, 120_000)

  // X-04: as provas visuais do servidor (evidência para o G-H1 do owner, não aceite). Só com PROVAS_DIR.
  it.skipIf(!process.env.PROVAS_DIR)('provas visuais: PNG + JSON Story/Feed × serviço curto/longo × base clara/escura', async () => {
    const dir = process.env.PROVAS_DIR!
    mkdirSync(dir, { recursive: true })
    for (const formato of ['story', 'feed'] as const) {
      for (const base of ['escura', 'clara'] as const) {
        for (const tamanho of ['curto', 'longo'] as const) {
          const nome = `${formato}-base-${base}-${tamanho}`
          const clara = base === 'clara'
          await montar(`prova-${nome}`, { formato, topo: clara ? 210 : 40, base: clara ? 210 : 40, pagina: clara ? { tinta: TINTA_ESCURA, logo: LOGO_ESCURA } : { logo: LOGO_CLARA } })
          const copy = copy5({ apoio: ['Harmonização com o chef'], servico: [...SERVICOS[tamanho]] })
          const s = spec5(`prova-${nome}`, { formato, copyAutoral: copy })
          const r = await comporPeca(s, { provar: true })
          writeFileSync(join(dir, `t4a5-topo-centro-${nome}.png`), r.prova!)
          const { T, L, O, sobra } = conferirPilula(r, formato)
          const l = leitura(r)
          writeFileSync(
            join(dir, `t4a5-topo-centro-${nome}.json`),
            JSON.stringify(
              {
                marca: 'sintética (#5, cenario-5.ts) — não é marca real; foto e logo geradas',
                fontes: 'reais: Georgia, Georgia Bold Italic (sistema), Montserrat (kit local)',
                arquetipo: `${ID_TOPO_CENTRO}@1`,
                impressao: IMPRESSAO,
                formato,
                luz: { topo: clara ? 210 : 40, base: clara ? 210 : 40 },
                copy: { manchete: ['Noite de', 'vinhos'], voz2: [1], apoio: ['Harmonização com o chef'], servico: SERVICOS[tamanho] },
                pilula: { servico: T, camada: L, bordaExterna: O, folga: FOLGA[formato], traco: (pilula(r).style as any).strokeWidth, raio: (pilula(r).style as any).border?.radius, cor: (pilula(r).style as any).strokeColor, sobraCurvaAlemDe1px: Number(sobra.toFixed(2)) },
                logo: { variante: l.variante?.url === (await urlDa(LOGO_CLARA)) ? 'clara' : 'escura', escolha: l.escolha, legivel: l.legivel, p10: l.medida?.contrasteP10 },
                escolha: r.diagnostico.arquetipo?.buscaEspacial?.escolha,
                tratamentoDeLeitura: r.diagnostico.tratamentoDeLeitura,
                contraste: (r.diagnostico.contraste ?? []).flatMap((m) => m.textos ?? []).map((t) => ({ camada: t.camada, ok: t.ok, alvo: t.alvo, p98: t.p98ComHalo, sentido: t.sentido })),
                camadas: r.layers.map((x: Layer) => ({ id: x.id, type: x.type, x: x.position.x, y: x.position.y, w: x.size.width, h: x.size.height, ...(x.content ? { content: x.content } : {}), ...((x.style as any)?.color ? { cor: (x.style as any).color } : {}) })),
                avisos: r.diagnostico.avisos,
              },
              null,
              1,
            ),
          )
          expect(r.prova!.length).toBeGreaterThan(1000)
        }
      }
    }
  }, 600_000)
})
