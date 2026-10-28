/**
 * #4 `minimal-fb-base-centro@1` (24/10/2026) no COMPOSITOR e no MEDIDOR reais, com FONTES REAIS (Georgia e Montserrat,
 * `createServerTextBoxMeasurer`). Foto INTEIRA: a logo FIXA no topo-centro, a manchete e o serviço centrados na base. A
 * leitura da logo é do CP3 (só variante, na mesma caixa centrada; sem variante legível, recusa) e o véu fraco automático
 * da logo é o da família A (fica quando salva, sai quando não salva) — nenhum véu novo.
 * Dublados: banco (o cenário em memória), Blob (a persistência só captura a entrada), registro de fontes, autofix, acervo
 * (o catálogo do cenário). A foto vem por URL de identidade fixa e os bytes pelo dublê do fetch: nada de Drive, Blob ou
 * rede. Marca, fotos e logo SINTÉTICAS (`cenario-4.ts`) — não é aceite de marca real.
 *
 * As luzes do alto foram calibradas por uma sonda temporária (cp-t4-a-4, `sonda-t4a4-calibragem-*.txt`): o véu da logo
 * entra no alto ≥ 225 (Story) / ≥ 200 (Feed) e salva a logo clara; no Feed com o alto texturizado em 175 ele entra e NÃO
 * salva a logo escura.
 */
import { describe, expect, it, vi } from 'vitest'

const cap = vi.hoisted(() => ({ entradas: [] as Array<Record<string, any>>, reguas: [] as Array<{ corrigir: unknown }> }))

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
// Espião da régua: registra cada medida (com ou sem correção) sem trocar o comportamento (G-T3).
vi.mock('@/lib/compositor/regua', async (original) => {
  const real = await original<typeof import('@/lib/compositor/regua')>()
  return { ...real, medirContrasteDaPeca: (a: Parameters<typeof real.medirContrasteDaPeca>[0]) => (cap.reguas.push({ corrigir: a.corrigir }), real.medirContrasteDaPeca(a)) }
})

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { medirCopyDoProjeto } from '@/lib/compositor/medir-copy-service'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { ehGradienteDeLeitura } from '@/lib/compositor/gradiente-de-leitura'
import { LOGO_INDISPONIVEL, LOGO_SEM_VARIANTE_LEGIVEL, fundoSemALogo, medirLogoNoFundo } from '@/lib/compositor/legibilidade-da-logo'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import type { Layer } from '@/types/template'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { logoSintetica } from './suporte/sinteticos'
import { DIMENSOES, ID_BASE_CENTRO, LOGO_CLARA, LOGO_ESCURA, PROJETO_4, cenario4, copy4, fontesNoDisco, fotoDoCenario4, medidorComFontesReais, paginaDoCenario4, spec4 } from './suporte/cenario-4'

type Formato = 'story' | 'feed'
let real: { medir: MeasureTextBox } | null = null
async function medidorReal() {
  real ??= await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  return real.medir
}
type OpcoesDaPagina = Parameters<typeof paginaDoCenario4>[1]
interface Montagem {
  formato?: Formato
  topo: number
  base?: number
  ocupado?: boolean
  pagina?: OpcoesDaPagina
  variantes?: string[]
  catalogo?: { x0: number; y0: number; x1: number; y1: number }
  outras?: Array<[string, OpcoesDaPagina]>
}
async function montar(id: string, m: Montagem) {
  const f = m.formato ?? 'story'
  const pagina = await paginaDoCenario4(id, m.pagina)
  const variantes = m.variantes ? await Promise.all(m.variantes.map(async (t) => ({ fileUrl: dataUrl(await logoSintetica(t)), isProjectLogo: true as const }))) : undefined
  cenario.atual = await cenario4(pagina, await medidorReal(), {
    foto: await fotoDoCenario4(DIMENSOES[f], { topo: m.topo, base: m.base, ocupado: m.ocupado }),
    variantes,
    ...(m.catalogo ? { catalogo: { driveFileId: 'drive-4', assunto: m.catalogo } } : {}),
  })
  const outras = await Promise.all((m.outras ?? []).map(([oid, o]) => paginaDoCenario4(oid, o)))
  cenario.atual.paginasDeAssinatura = [pagina, ...outras]
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
const logoDe = (r: ResultadoDaComposicao) => camada(r, 'logo')
const leitura = (r: ResultadoDaComposicao) => (r.diagnostico.logo as any).legibilidade
const veus = (layers: Layer[]) => layers.filter((l) => ehGradienteDeLeitura(l))
const bordasDosVeus = (r: ResultadoDaComposicao) => veus(r.layers).map((l) => (l.metadata as any)?.borda)
const centroX = (l: Layer) => l.position.x + l.size.width / 2
const TEXTOS = ['headline', 'headline2', 'servico']
const HARD = { story: { x0: 92, x1: 988, y0: 188, y1: 1696 }, feed: { x0: 92, x1: 988, y0: 120, y1: 1246 } } as const
/** A zona da logo em px (geometria-4.txt; a do Feed com o topo recortado pelo HARD). */
const ZONA_DA_LOGO = { story: { x0: 324, x1: 756, y0: 188.2, y1: 384 }, feed: { x0: 324, x1: 756, y0: 120.1, y1: 270 } } as const
const def4 = verArquetipo(ID_BASE_CENTRO, 1)!
const IMPRESSAO = impressaoDoArquetipo(def4)
const urlDa = async (tinta: string) => dataUrl(await logoSintetica(tinta))
const medir4 = (s: Record<string, any>, extra: Record<string, unknown> = {}) =>
  medirCopyDoProjeto({ projectId: PROJETO_4, formato: s.formato, copyAutoral: s.copyAutoral, ...(s.foto?.url ? { fotoUrl: s.foto.url } : {}), ...(s.preferencias?.variante ? { variante: s.preferencias.variante } : {}), arquetipo: s.arquetipo, ...extra })

describe.skipIf(!fontesNoDisco())('#4 · base centrada sobre foto inteira, compositor e medidor reais, fontes reais', () => {
  for (const formato of ['story', 'feed'] as const) {
    it(`G-L1/G-G5/G-M1 ${formato}: logo fixa no topo-centro (superior-centro, x 540), textos centrados na base dentro do HARD; compor = medir`, async () => {
      await montar(`b4-${formato}`, { formato, topo: 40 })
      const s = spec4(`b4-${formato}`, { formato })
      const { r, entrada } = await compor(s)
      // A peça registra id, versão e impressão do #4@1.
      expect(entrada!.fieldValues.spec.arquetipo).toEqual({ id: ID_BASE_CENTRO, versao: 1, impressao: IMPRESSAO })
      expect(entrada!.fieldValues.composicao.arquetipo).toMatchObject({ id: ID_BASE_CENTRO, versao: 1, impressao: IMPRESSAO })
      // Foto inteira: a camada da foto cobre a peça (nada de caixa) e não há papel de fundo.
      const bg = camada(r, 'bg-foto')
      expect([bg.position, bg.size, (bg.style as any).objectFit]).toEqual([{ x: 0, y: 0 }, DIMENSOES[formato], 'cover'])
      expect(r.diagnostico.papelDoFundo).toBeUndefined()
      // G-L1: a logo FIXA, centrada no eixo, dentro da zona; o canto é superior-centro; a escolha não grava cantoDaLogo.
      const logo = logoDe(r)
      expect((logo.metadata as any).compositor).toMatchObject({ canto: 'superior-centro' })
      expect(Math.abs(centroX(logo) - 540)).toBeLessThanOrEqual(1)
      const z = ZONA_DA_LOGO[formato]
      expect(logo.position.x >= z.x0 - 1 && logo.position.x + logo.size.width <= z.x1 + 1 && logo.position.y >= z.y0 - 1 && logo.position.y + logo.size.height <= z.y1 + 1).toBe(true)
      const escolha = entrada!.fieldValues.composicao.arquetipo.buscaEspacial.escolha
      expect('cantoDaLogo' in escolha).toBe(false)
      expect(r.diagnostico.arquetipo!.logo).toMatchObject({ modo: 'referencia', canto: 'superior-centro' })
      // G-G5: textos e logo dentro do HARD (no Story, o piso de interface do gate 188/224 é o mesmo HARD); textos centrados.
      const pecas = [...r.layers.filter((l) => TEXTOS.includes(l.id)), logo]
      expect(pecas.map((l) => l.id).sort()).toEqual(['headline', 'headline2', 'logo', 'servico'])
      for (const l of pecas) {
        const h = HARD[formato]
        expect(l.position.x, `${l.id} x0`).toBeGreaterThanOrEqual(h.x0 - 1)
        expect(l.position.x + l.size.width, `${l.id} x1`).toBeLessThanOrEqual(h.x1 + 1)
        expect(l.position.y, `${l.id} y0`).toBeGreaterThanOrEqual(h.y0 - 1)
        expect(l.position.y + l.size.height, `${l.id} y1`).toBeLessThanOrEqual(h.y1 + 1)
      }
      for (const id of ['headline', 'servico']) expect(Math.abs(centroX(camada(r, id)) - 540), id).toBeLessThanOrEqual(1)
      // A ordem: logo no alto, manchete, serviço.
      expect(logo.position.y < camada(r, 'headline').position.y && camada(r, 'headline').position.y < camada(r, 'servico').position.y).toBe(true)
      expect(leitura(r)).toMatchObject({ estado: 'medida', legivel: true })
      // G-M1: o medir-copy no MESMO contexto dá a mesma fixação, as mesmas posições e nenhuma recusa.
      const m = await medir4(s)
      expect([m.medicao.cabeTudo, m.fixacao.arquetipo]).toEqual([true, entrada!.fieldValues.spec.arquetipo])
      expect(m.medicao.arquetipo!.excessosDeLinhas).toEqual([])
      for (const id of ['headline', 'servico', 'logo'] as const) {
        const pos = m.medicao.arquetipo!.posicoes![id]!.posicao
        const l = camada(r, id)
        expect([Math.round(pos.x), Math.round(pos.y)], id).toEqual([Math.round(l.position.x), Math.round(l.position.y)])
      }
    }, 120_000)
  }

  it('G-L2: topo claro, desenhada CLARA + escura autorizada → variante-trocada para a escura, na MESMA caixa centrada (Story uniforme; Feed texturizado)', async () => {
    // Story: alto 210 (abaixo do limiar do véu da logo). Feed: no alto claro uniforme o véu existente salva a clara (G-T2),
    // então a troca do Feed é provada no alto texturizado 150 (sem véu).
    for (const [formato, topo, ocupado] of [['story', 210, false], ['feed', 150, true]] as const) {
      await montar(`b4-claro-${formato}`, { formato, topo, ocupado, pagina: { logo: LOGO_CLARA } })
      const { r } = await compor(spec4(`b4-claro-${formato}`, { formato }), { somenteAvaliar: true })
      const l = leitura(r)
      const [clara, escura] = [await urlDa(LOGO_CLARA), await urlDa(LOGO_ESCURA)]
      expect(l).toMatchObject({ legivel: true, escolha: 'variante-trocada', canto: 'superior-centro', variante: { origem: 'projeto', url: escura } })
      expect(l.avaliacoes.map((a: any) => [a.variante.url === clara ? 'clara' : 'escura', a.estado])).toEqual([
        ['clara', 'ilegivel'],
        ['escura', 'legivel'],
      ])
      expect(l.avaliacoes[0].medida.contrasteP10).toBeLessThan(45)
      expect(logoDe(r).fileUrl).toBe(escura)
      // Mesma caixa: a escura tem a proporção da clara, então a caixa centrada não muda; nunca vai a um canto.
      expect(Math.abs(centroX(logoDe(r)) - 540)).toBeLessThanOrEqual(1)
      expect(l.avaliacoes.every((a: any) => a.canto === 'superior-centro')).toBe(true)
      expect(bordasDosVeus(r)).not.toContain('topo')
    }
  }, 180_000)

  it('G-L3: topo escuro — desenhada ESCURA troca para a clara; desenhada clara é mantida', async () => {
    for (const formato of ['story', 'feed'] as const) {
      await montar(`b4-escuro-${formato}`, { formato, topo: 40, pagina: { logo: LOGO_ESCURA } })
      const { r } = await compor(spec4(`b4-escuro-${formato}`, { formato }), { somenteAvaliar: true })
      expect(leitura(r)).toMatchObject({ legivel: true, escolha: 'variante-trocada', canto: 'superior-centro', variante: { url: await urlDa(LOGO_CLARA) } })
      await montar(`b4-escuro-${formato}`, { formato, topo: 40, pagina: { logo: LOGO_CLARA } })
      const { r: mantida } = await compor(spec4(`b4-escuro-${formato}`, { formato }), { somenteAvaliar: true })
      expect(leitura(mantida)).toMatchObject({ legivel: true, escolha: 'mantida', canto: 'superior-centro' })
      expect(leitura(mantida).avaliacoes).toHaveLength(1)
    }
  }, 180_000)

  it('G-L4 (controle negativo do CP3): topo claro com UMA variante só (a clara) → LOGO_SEM_VARIANTE_LEGIVEL 422, nada gravado, nenhum véu novo; o p10 da desenhada < 45', async () => {
    for (const [formato, topo, ocupado] of [['story', 210, false], ['feed', 150, true]] as const) {
      await montar(`b4-neg-${formato}`, { formato, topo, ocupado, pagina: { logo: LOGO_CLARA }, variantes: [LOGO_CLARA] })
      const e = await recusaSemGravar(comporPeca(spec4(`b4-neg-${formato}`, { formato }), { autor: 'u' }))
      expect([e.code, e.status]).toEqual([LOGO_SEM_VARIANTE_LEGIVEL, 422])
      expect(e.message).toMatch(/nenhum véu novo é desenhado para a logo/)
      const d = e.details as { avaliacoes: Array<{ estado: string; canto: string; medida: { contrasteP10: number } }> }
      // A foto de teste desafia a logo de verdade: a desenhada não lê, e não há canto alternativo (logo fixa).
      expect(d.avaliacoes.map((a) => [a.estado, a.canto])).toEqual([['ilegivel', 'superior-centro']])
      expect(d.avaliacoes[0].medida.contrasteP10).toBeLessThan(45)
      // Controle positivo, a MESMA foto com a escura também autorizada: a peça sai, e nenhuma camada de véu nasce para a logo.
      await montar(`b4-neg-${formato}`, { formato, topo, ocupado, pagina: { logo: LOGO_CLARA } })
      const { r } = await compor(spec4(`b4-neg-${formato}`, { formato }), { somenteAvaliar: true })
      expect(leitura(r).escolha).toBe('variante-trocada')
      expect(bordasDosVeus(r)).not.toContain('topo')
    }
  }, 180_000)

  it('G-L5: a linha Logo sem isProjectLogo nunca entra; asset que não carrega → LOGO_INDISPONIVEL 503', async () => {
    await montar('b4-naoaut', { topo: 210, pagina: { logo: LOGO_CLARA } })
    cenario.atual!.projeto.logosDoProjeto = [{ fileUrl: await urlDa(LOGO_ESCURA), isProjectLogo: false }]
    const e = await recusaSemGravar(comporPeca(spec4('b4-naoaut'), { autor: 'u' }))
    expect(e.code).toBe(LOGO_SEM_VARIANTE_LEGIVEL)
    expect((e.details as any).avaliacoes.map((a: any) => a.variante.origem)).toEqual(['pagina'])
    await montar('b4-quebrada', { topo: 210, pagina: { logo: LOGO_CLARA } })
    cenario.atual!.paginasDeAssinatura[0].layers = cenario.atual!.paginasDeAssinatura[0].layers.map((l) => (l.type === 'logo' ? { ...l, fileUrl: 'data:image/png;base64,QUJDREVG' } : l))
    cenario.atual!.projeto.logosDoProjeto = []
    const q = await recusaSemGravar(comporPeca(spec4('b4-quebrada'), { autor: 'u' }))
    expect([q.code, q.status]).toEqual([LOGO_INDISPONIVEL, 503])
  }, 120_000)

  it('G-T1: rodapé — o CP2A da família A (base média com texto branco pede o véu escuro do texto); nenhum tratamento além dos da família A', async () => {
    for (const formato of ['story', 'feed'] as const) {
      await montar(`b4-cp2a-${formato}`, { formato, topo: 40, base: 160 })
      const { r } = await compor(spec4(`b4-cp2a-${formato}`, { formato }), { somenteAvaliar: true })
      const t = r.diagnostico.tratamentoDeLeitura!
      expect(t.map((x) => x.borda)).toEqual(['rodape'])
      expect(t[0]).toMatchObject({ estado: 'tratado' })
      expect(t[0].veuDaLogo).toBeUndefined()
      expect(bordasDosVeus(r)).toEqual(['rodape'])
      // Nenhuma camada de gradiente fora dos véus de leitura (que são só os da família A).
      expect(r.layers.filter((l) => l.type === 'gradient' || l.type === 'gradient2').length).toBe(veus(r.layers).length)
      const textos = (r.diagnostico.contraste ?? []).flatMap((m) => m.textos ?? [])
      expect(textos.filter((x) => !x.ok), JSON.stringify(textos)).toEqual([])
    }
  }, 180_000)

  it('G-T2: topo claro — o véu fraco EXISTENTE da logo entra no alto e FICA quando a logo clara lê com ele (sem ele, não leria)', async () => {
    for (const [formato, topo] of [['story', 230], ['feed', 210]] as const) {
      await montar(`b4-veu-${formato}`, { formato, topo, pagina: { logo: LOGO_CLARA } })
      const { r } = await compor(spec4(`b4-veu-${formato}`, { formato }), { somenteAvaliar: true })
      const l = leitura(r)
      expect(l).toMatchObject({ legivel: true, escolha: 'mantida', canto: 'superior-centro' })
      expect(l.veusRemovidos).toBeUndefined()
      // O véu da logo é o automático da família A no TOPO (borda sem texto). O `tratamentoDeLeitura` só lista bordas com
      // texto, então a prova é a camada: um véu de leitura no topo, além do do rodapé (se houver).
      expect(bordasDosVeus(r)).toContain('topo')
      const veuDoTopo = veus(r.layers).find((v) => (v.metadata as any).borda === 'topo')!
      expect(veuDoTopo.id).toBe('gradiente-leitura-topo')
      // Sem o véu, a mesma logo no mesmo lugar NÃO leria: foi ele que a salvou.
      const semVeu = await fundoSemALogo({ layers: r.layers.filter((x) => x.id !== veuDoTopo.id), canvas: DIMENSOES[formato], background: '#808080' })
      const bytes = Buffer.from(String(logoDe(r).fileUrl).split(',')[1], 'base64')
      const nua = await medirLogoNoFundo({ bytes, rect: { ...logoDe(r).position, ...logoDe(r).size }, fundo: semVeu })
      expect(nua!.legivel).toBe(false)
      expect(nua!.contrasteP10).toBeLessThan(45)
    }
  }, 180_000)

  it('G-T3: Feed, alto texturizado 175 com a logo escura — o véu da logo entra e NÃO a salva: ele SAI, a variante é medida sem ele e a régua é remedida (corrigir: false)', async () => {
    await montar('b4-veu-sai', { formato: 'feed', topo: 175, ocupado: true, pagina: { logo: LOGO_ESCURA } })
    const antes = cap.reguas.length
    const { r } = await compor(spec4('b4-veu-sai', { formato: 'feed' }), { somenteAvaliar: true })
    const l = leitura(r)
    expect(l).toMatchObject({ legivel: true, escolha: 'veu-removido', canto: 'superior-centro', veusRemovidos: ['gradiente-leitura-topo'] })
    expect(logoDe(r).fileUrl).toBe(await urlDa(LOGO_ESCURA))
    // A desenhada sob o véu não lia; sem ele, a mesma lê (a grade não traz variante nova nem canto).
    expect(l.avaliacoes[0].medida.contrasteP10).toBeGreaterThanOrEqual(45)
    expect(bordasDosVeus(r)).not.toContain('topo')
    expect(r.diagnostico.avisos.some((a) => /não a salvava e saiu/.test(a))).toBe(true)
    const novas = cap.reguas.slice(antes).map((x) => x.corrigir)
    expect(novas.at(-1)).toBe(false)
  }, 120_000)

  it('G-T4: o gradiente EXPLÍCITO da página no rodapé segue como na família A — não some e não duplica', async () => {
    await montar('b4-grad', { topo: 40, base: 160, pagina: { gradiente: true } })
    const { r } = await compor(spec4('b4-grad'), { somenteAvaliar: true })
    const t = r.diagnostico.tratamentoDeLeitura!
    expect(t.find((x) => x.borda === 'rodape')).toMatchObject({ estado: 'explicito-do-template' })
    const doRodape = r.layers.filter((l) => (l.type === 'gradient' || l.type === 'gradient2') && l.position.y + l.size.height >= 1900)
    expect(doRodape).toHaveLength(1)
  }, 120_000)

  it('G-B1/G-B2/G-B3: alto texturizado sem região não move a logo; região do catálogo sob ela a desce NA ZONA, no eixo; região cobrindo a zona → SEM_COMBINACAO (logo)', async () => {
    await montar('b4-busca', { topo: 120, ocupado: true, pagina: { logo: LOGO_CLARA } })
    const { r: livre } = await compor(spec4('b4-busca'), { somenteAvaliar: true })
    const esc = livre.diagnostico.arquetipo!.buscaEspacial!.escolha
    expect(esc.deslocamentos.logo ?? 0).toBe(0)
    const yLivre = logoDe(livre).position.y
    // G-B2: a região anotada sob a logo de referência (Story y 200–290).
    const sob = { x0: 0.42, y0: 200 / 1920, x1: 0.58, y1: 290 / 1920 }
    await montar('b4-busca', { topo: 120, ocupado: true, pagina: { logo: LOGO_CLARA }, catalogo: sob })
    const { r: desce } = await compor(spec4('b4-busca', { foto: { driveFileId: 'drive-4' } }), { somenteAvaliar: true })
    const dy = desce.diagnostico.arquetipo!.buscaEspacial!.escolha.deslocamentos.logo
    expect(dy).not.toBe(0)
    const logo = logoDe(desce)
    expect(Math.abs(centroX(logo) - 540)).toBeLessThanOrEqual(1)
    expect(Math.abs(logo.position.y - yLivre - dy)).toBeLessThanOrEqual(1)
    expect(logo.position.y >= 188 && logo.position.y + logo.size.height <= 384 + 1).toBe(true)
    expect((logo.metadata as any).compositor.canto).toBe('superior-centro')
    // G-B3: a região cobre a zona inteira da logo: nenhuma posição sobra; nada é empurrado para um canto.
    await montar('b4-busca', { topo: 120, ocupado: true, pagina: { logo: LOGO_CLARA }, catalogo: { x0: 0.28, y0: 0.09, x1: 0.72, y1: 0.21 } })
    const e = await recusaSemGravar(comporPeca(spec4('b4-busca', { foto: { driveFileId: 'drive-4' } }), { autor: 'u' }))
    expect([e.code, e.details!.motivo]).toEqual(['SEM_COMBINACAO', 'INVADE_REGIAO_PROTEGIDA'])
    expect(JSON.stringify(e.details!.exemplos)).toMatch(/"papel":"logo"/)
  }, 180_000)

  it('G-P1/G-P2: pré, apoio e cta recusam no compor e no medir antes de compor; sem serviço → faltam', async () => {
    await montar('b4-papeis', { topo: 40 })
    for (const extra of [
      { id: 'convite', funcao: 'pre', linhas: ['Você é convidado'] },
      { id: 'detalhe', funcao: 'apoio', linhas: ['Harmonização com o chef'] },
      { id: 'site', funcao: 'cta', linhas: ['Reserve'] },
    ]) {
      const s = spec4('b4-papeis', { copyAutoral: copy4({ extras: [extra] }) })
      const e = await recusaSemGravar(comporPeca(s, { autor: 'u' }))
      expect([e.code, e.status, e.details!.naoSuportados]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', 422, [extra.funcao]])
      const em = await recusa(medir4(s))
      expect([em.code, em.details!.naoSuportados]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', [extra.funcao]])
    }
    const semServico = spec4('b4-papeis', { copyAutoral: { ...copy4(), blocos: copy4().blocos.filter((b) => b.funcao !== 'servico') } })
    expect((await recusaSemGravar(comporPeca(semServico, { autor: 'u' }))).details!.faltam).toEqual(['servico'])
  }, 120_000)

  it('G-P3/G-P4: a voz 2 é parte da manchete — 2 linhas com ela cabem; 3 (contando a voz 2) ou serviço de 3 → LINHAS_EXCEDIDAS no compor, declarado no medir', async () => {
    await montar('b4-linhas', { topo: 40 })
    const { r } = await compor(spec4('b4-linhas', { copyAutoral: copy4({ manchete: ['Noite de', 'vinhos'], voz2: [1] }) }), { somenteAvaliar: true })
    expect(camada(r, 'headline2')).toBeTruthy()
    expect((camada(r, 'headline2').style as any).fontFamily).toBe('Georgia Italica')
    for (const copy of [copy4({ manchete: ['Noite', 'de', 'vinhos'], voz2: [2] }), copy4({ servico: ['Sexta', '14/11', '20h'] })]) {
      const s = spec4('b4-linhas', { copyAutoral: copy })
      expect((await recusaSemGravar(comporPeca(s, { autor: 'u' }))).code).toBe('ARQUETIPO_LINHAS_EXCEDIDAS')
      const m = await medir4(s)
      expect(m.medicao.cabeTudo).toBe(false)
      expect(m.medicao.arquetipo!.excessosDeLinhas.map((x) => x.linhas)).toEqual([3])
    }
  }, 120_000)

  it('G-M2: o portão do arquétipo roda em CADA variante do medir-copy (a variante com a manchete grande demais não cabe)', async () => {
    await montar('b4-var-a', { topo: 40, outras: [['b4-var-b', { corpoDaManchete: 220 }]] })
    const m = await medir4(spec4('b4-var-a'))
    expect([m.variante.id, m.medicao.cabeTudo]).toEqual(['b4-var-a', true])
    expect(m.outrasVariantes.map((v) => [v.id, v.cabeTudo])).toEqual([['b4-var-b', false]])
  }, 120_000)

  it('G-M3 (limite): o medir-copy não prevê o CP3 — a copy que mede OK recusa no compor pela logo (sem variante legível)', async () => {
    await montar('b4-m3', { topo: 210, pagina: { logo: LOGO_CLARA }, variantes: [LOGO_CLARA] })
    const s = spec4('b4-m3')
    const m = await medir4(s)
    expect(m.medicao.cabeTudo).toBe(true)
    expect((await recusaSemGravar(comporPeca(s, { autor: 'u' }))).code).toBe(LOGO_SEM_VARIANTE_LEGIVEL)
  }, 120_000)

  // G-E1: as provas visuais do servidor (evidência para o G-H1 do owner, não aceite). Só com PROVAS_DIR.
  it.skipIf(!process.env.PROVAS_DIR)('provas visuais: PNG + JSON Story/Feed × topo claro/escuro + manchete de 1 linha', async () => {
    const dir = process.env.PROVAS_DIR!
    mkdirSync(dir, { recursive: true })
    const casos: Array<{ nome: string; formato: Formato; topo: number; logo: string; manchete: string[]; voz2: number[] }> = [
      { nome: 'story-topo-claro', formato: 'story', topo: 210, logo: LOGO_CLARA, manchete: ['Noite de', 'vinhos'], voz2: [1] },
      { nome: 'story-topo-escuro', formato: 'story', topo: 40, logo: LOGO_CLARA, manchete: ['Noite de', 'vinhos'], voz2: [1] },
      { nome: 'feed-topo-claro', formato: 'feed', topo: 210, logo: LOGO_CLARA, manchete: ['Noite de', 'vinhos'], voz2: [1] },
      { nome: 'feed-topo-escuro', formato: 'feed', topo: 40, logo: LOGO_CLARA, manchete: ['Noite de', 'vinhos'], voz2: [1] },
      { nome: 'story-manchete-1-linha', formato: 'story', topo: 40, logo: LOGO_CLARA, manchete: ['Noite de vinhos'], voz2: [] },
      { nome: 'feed-manchete-1-linha', formato: 'feed', topo: 40, logo: LOGO_CLARA, manchete: ['Noite de vinhos'], voz2: [] },
    ]
    for (const c of casos) {
      await montar(`prova-${c.nome}`, { formato: c.formato, topo: c.topo, pagina: { logo: c.logo } })
      const s = spec4(`prova-${c.nome}`, { formato: c.formato, copyAutoral: copy4({ manchete: c.manchete, voz2: c.voz2 }) })
      const r = await comporPeca(s, { provar: true })
      writeFileSync(join(dir, `t4a4-base-centro-${c.nome}.png`), r.prova!)
      const l = leitura(r)
      writeFileSync(
        join(dir, `t4a4-base-centro-${c.nome}.json`),
        JSON.stringify(
          {
            marca: 'sintética (#4, cenario-4.ts) — não é marca real; foto e logo geradas',
            fontes: 'reais: Georgia, Georgia Bold Italic (sistema), Montserrat (kit local)',
            arquetipo: `${ID_BASE_CENTRO}@1`,
            impressao: IMPRESSAO,
            formato: c.formato,
            luzDoAlto: c.topo,
            copy: { manchete: c.manchete, voz2: c.voz2, servico: ['Sexta, 14/11 · 20h'] },
            logo: { variante: l.variante?.url === (await urlDa(LOGO_CLARA)) ? 'clara' : 'escura', escolha: l.escolha, legivel: l.legivel, p10: l.medida?.contrasteP10, veusRemovidos: l.veusRemovidos ?? [], veuNoTopo: bordasDosVeus(r).includes('topo') },
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
  }, 300_000)
})
