/**
 * CP3 — a LEGIBILIDADE DA LOGO no compositor real (15/10/2026): a logo é medida pixel a pixel contra o fundo
 * efetivo; com arquétipo, a que não lê é trocada por outra variante AUTORIZADA (a fixa do topo-esquerda não muda de
 * lugar; a automática do centro-óptico pode ir a outro canto livre) ou a peça recusa com código próprio. Sem
 * arquétipo, só diagnóstico (os baselines `t1a-`/`cp2b-baseline-sem-arquetipo` provam que nada muda).
 *
 * Numeração do pedido do owner: 7 explícita preservada · 8 alternativa · 9 nenhuma · 10 não autorizada nunca entra ·
 * 11 centro-óptico · 12 topo-esquerda fixa · 13 tratamento no fundo · 14/15 recomposição · 16 asset quebrado · 18
 * cinza sobre cinza. (1–6 estão em `compositor/__tests__/legibilidade-da-logo.test.ts`; 17 são os baselines.)
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

import type { Layer } from '@/types/template'
import { CreativeError } from '@/lib/creatives/errors'
import { comporPeca, type OpcoesDeComposicao, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { escolhaEspacialOriginal, specComACopyDaPagina, specComAPosicaoOriginal } from '@/lib/compositor/defasagem'
import { specDaRecomposicao } from '@/lib/compositor/spec-da-recomposicao'
import { validarSpec, type SpecDePeca } from '@/lib/compositor/spec'
import { ALFA_VISIVEL_DA_LOGO, LIMIAR_DE_CONTRASTE_DA_LOGO, LOGO_INDISPONIVEL, LOGO_SEM_VARIANTE_LEGIVEL, PERCENTIL_DA_LOGO, fundoSemALogo, medirLogoNoFundo } from '@/lib/compositor/legibilidade-da-logo'
import { ehGradienteDeLeitura } from '@/lib/compositor/gradiente-de-leitura'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { LIMIAR_DE_CONTRASTE_DA_LOGO as LIMIAR_DO_ORACULO, P10_DA_LOGO, leituraDaLogo } from './suporte/propriedades'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const TOPO = 'minimal-fb-topo-esquerda'
const CENTRO = 'minimal-fb-centro-optico'
const ASSINATURA = { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } }
const ESCURO = '#1E1E1E'
const CLARO = '#F5F5F5'
const CINZA = '#808080'
const CANVAS = { width: 1080, height: 1920 }
const QUEBRADA = 'data:image/png;base64,QUJDREVG'

interface Cena {
  id: string
  arquetipo?: string
  luz: (x: number, y: number) => number
  cores: { headline: string; apoio?: string; servico: string }
  /** A tinta da logo que a PÁGINA desenha (a explícita), ou uma URL pronta. */
  logo: string
  /** As linhas `Logo` do projeto (tinta, ou URL pronta), com a marca de principal (padrão true). */
  projeto?: Array<{ tinta: string; isProjectLogo?: boolean }>
  candidatasDoVeu?: string[]
}

const url = async (tinta: string) => (tinta.startsWith('data:') ? tinta : dataUrl(await logoSintetica(tinta)))

async function montar(c: Cena) {
  const foto = await fotoSintetica(c.luz)
  const pagina = paginaSintetica({ id: c.id, headline: { cor: c.cores.headline }, ...(c.cores.apoio ? { apoio: { cor: c.cores.apoio } } : {}), servico: { cor: c.cores.servico }, logoUrl: await url(c.logo), fundoUrl: dataUrl(foto) })
  const logosDoProjeto = await Promise.all((c.projeto ?? []).map(async (p) => ({ fileUrl: await url(p.tinta), isProjectLogo: p.isProjectLogo ?? true })))
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: c.candidatasDoVeu ?? [], logosDoProjeto })
  cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: ASSINATURA } }
  return { pagina, logosDoProjeto }
}

const blocos = (c: Cena) => [
  { papel: 'headline', linhas: c.arquetipo === CENTRO ? ['Sexta'] : ['Almoço', 'de domingo'] },
  ...(c.cores.apoio ? [{ papel: 'apoio', linhas: ['jazz ao vivo'] }] : []),
  { papel: 'servico', linhas: ['Dom · 12h às 16h'] },
]
const specDe = (c: Cena) => ({ ...specSintetica({ pagina: c.id, blocos: blocos(c) }), ...(c.arquetipo ? { arquetipo: { id: c.arquetipo } } : {}) })

async function compor(c: Cena, opcoes: OpcoesDeComposicao = { somenteAvaliar: true }) {
  const m = await montar(c)
  const antes = cap.entradas.length
  const r = await comporPeca(specDe(c), opcoes)
  return { r, ...m, entrada: cap.entradas.length > antes ? cap.entradas.at(-1) : undefined }
}

async function recusa(c: Cena, opcoes: OpcoesDeComposicao = { somenteAvaliar: true }): Promise<CreativeError> {
  await montar(c)
  try {
    await comporPeca(specDe(c), opcoes)
  } catch (e) {
    expect(e).toBeInstanceOf(CreativeError)
    return e as CreativeError
  }
  throw new Error(`a composição de ${c.id} não recusou`)
}

const logoDe = (r: ResultadoDaComposicao) => r.layers.find((l) => l.id === 'logo')!
const leitura = (r: ResultadoDaComposicao) => r.diagnostico.logo!.legibilidade!
const uniforme = (v: number) => () => v

/** A mesma peça, medida pelo ORÁCULO do CP0 (independente): o critério e os números têm de coincidir. */
async function conferePeloOraculo(r: ResultadoDaComposicao) {
  const o = await leituraDaLogo(r.layers, CANVAS)
  const m = leitura(r).medida!
  expect(o).not.toBeNull()
  expect(o!.legivel).toBe(m.legivel)
  expect(o!.pixelsOpacos).toBe(m.pixelsAvaliados)
  expect(Math.abs(o!.p10 - m.contrasteP10)).toBeLessThanOrEqual(1)
  expect(Math.abs(o!.media - m.contrasteMedio)).toBeLessThanOrEqual(1)
}

describe('o contrato é um só', () => {
  it('as constantes de produção e as do oráculo do CP0 coincidem', () => {
    expect(LIMIAR_DE_CONTRASTE_DA_LOGO).toBe(LIMIAR_DO_ORACULO)
    expect(PERCENTIL_DA_LOGO).toBe(P10_DA_LOGO)
    expect(ALFA_VISIVEL_DA_LOGO).toBe(128)
  })
})

describe('topo-esquerda: a logo é FIXA na geometria; só a variante muda', () => {
  const explicitaLe: Cena = { id: 'cp3-7', arquetipo: TOPO, luz: uniforme(45), cores: { headline: CLARO, servico: CLARO }, logo: '#D0D0D0', projeto: [{ tinta: CLARO }] }
  const alternativa: Cena = { id: 'cp3-8', arquetipo: TOPO, luz: uniforme(128), cores: { headline: CLARO, servico: CLARO }, logo: CINZA, projeto: [{ tinta: CLARO }] }

  it('7. a explícita que passa é MANTIDA, mesmo havendo variante do projeto com p10 maior; a medida bate com o oráculo', async () => {
    const { r, pagina } = await compor(explicitaLe)
    const paginaUrl = pagina.layers.find((l) => l.type === 'logo')!.fileUrl
    expect(logoDe(r).fileUrl).toBe(paginaUrl)
    const l = leitura(r)
    expect(l).toMatchObject({ estado: 'medida', legivel: true, escolha: 'mantida', canto: 'inferior-direito', variante: { origem: 'pagina' }, limiar: 45, alfaMinimo: 128, percentil: 0.1 })
    expect(l.medida!.contrasteP10).toBeGreaterThanOrEqual(45)
    expect(l.avaliacoes).toHaveLength(1)
    expect(r.diagnostico.arquetipo!.logo.variante).toEqual({ origem: 'pagina', url: paginaUrl })
    expect(r.diagnostico.avisos.filter((a) => /logo/i.test(a))).toEqual([])
    await conferePeloOraculo(r)
  }, 60_000)

  it('8 e 12. a explícita falha (cinza sobre cinza) e a principal do projeto lê: a alternativa entra, NO MESMO LUGAR, dito no aviso', async () => {
    const [{ r: ref }, { r, logosDoProjeto }] = [await compor(explicitaLe), await compor(alternativa)]
    expect(logoDe(r).fileUrl).toBe(logosDoProjeto[0].fileUrl)
    const l = leitura(r)
    expect(l).toMatchObject({ legivel: true, escolha: 'variante-trocada', canto: 'inferior-direito', variante: { origem: 'projeto' } })
    // 12: a caixa da logo fixa é a MESMA da peça em que a explícita lia (o canto não muda; a variante tem a mesma proporção).
    expect({ position: logoDe(r).position, size: logoDe(r).size }).toEqual({ position: logoDe(ref).position, size: logoDe(ref).size })
    expect(logoDe(r).metadata?.compositor).toMatchObject({ canto: 'inferior-direito' })
    // A grade: a explícita (ilegível) e a do projeto (legível), nada mais — a fixa não tem canto alternativo.
    expect(l.avaliacoes.map((a) => [a.variante.origem, a.canto, a.estado])).toEqual([
      ['pagina', 'inferior-direito', 'ilegivel'],
      ['projeto', 'inferior-direito', 'legivel'],
    ])
    expect(l.avaliacoes[0].medida!.contrasteP10).toBeLessThan(45)
    expect(r.diagnostico.avisos.some((a) => a.includes('não lia no inferior-direito') && a.includes('logo principal do projeto'))).toBe(true)
    await conferePeloOraculo(r)
  }, 90_000)

  it('determinismo: a mesma peça duas vezes dá a mesma logo e a mesma leitura', async () => {
    const { r: a } = await compor(alternativa)
    const { r: b } = await compor(alternativa)
    expect(logoDe(b)).toEqual(logoDe(a))
    expect(leitura(b)).toEqual(leitura(a))
  }, 90_000)

  it('9 e 18. nenhuma variante autorizada lê (cinza sobre cinza): LOGO_SEM_VARIANTE_LEGIVEL, determinístico, com a grade e o critério', async () => {
    const e = await recusa({ ...alternativa, id: 'cp3-9', projeto: [{ tinta: '#707070' }] })
    expect(e.code).toBe(LOGO_SEM_VARIANTE_LEGIVEL)
    expect(e.status).toBe(422)
    expect(e.message).toMatch(/p10 .* ≥ 45/)
    expect(e.message).toMatch(/Nenhuma variante é fabricada/)
    const d = e.details as { limiar: number; alfaMinimo: number; avaliacoes: Array<{ variante: { origem: string }; estado: string; medida: { contrasteP10: number; contrasteMedio: number } } > }
    expect(d.limiar).toBe(45)
    expect(d.alfaMinimo).toBe(128)
    expect(d.avaliacoes.map((a) => [a.variante.origem, a.estado])).toEqual([['pagina', 'ilegivel'], ['projeto', 'ilegivel']])
    for (const a of d.avaliacoes) expect(a.medida.contrasteP10).toBeLessThan(45)
    // O cinza sobre cinza: diferença praticamente zero.
    expect(d.avaliacoes[0].medida.contrasteMedio).toBeLessThan(15)
  }, 60_000)

  it('10. a linha `Logo` sem `isProjectLogo` NUNCA entra, mesmo que lesse: a peça recusa e a grade não a cita', async () => {
    const e = await recusa({ ...alternativa, id: 'cp3-10', projeto: [{ tinta: CLARO, isProjectLogo: false }] })
    expect(e.code).toBe(LOGO_SEM_VARIANTE_LEGIVEL)
    const d = e.details as { avaliacoes: Array<{ variante: { origem: string } }> }
    expect(d.avaliacoes.map((a) => a.variante.origem)).toEqual(['pagina'])
  }, 60_000)

  it('16. asset quebrado é LOGO_INDISPONIVEL (503), nunca "sem contraste" — também quando é a ALTERNATIVA que não carrega', async () => {
    const quebrada = await recusa({ ...alternativa, id: 'cp3-16a', logo: QUEBRADA, projeto: [] })
    expect(quebrada.code).toBe(LOGO_INDISPONIVEL)
    expect(quebrada.status).toBe(503)
    expect(quebrada.message).toMatch(/não pôde ser carregada/)
    // A explícita não lê e a alternativa não carregou: não dá para afirmar "nenhuma lê".
    const semConclusao = await recusa({ ...alternativa, id: 'cp3-16b', projeto: [{ tinta: QUEBRADA }] })
    expect(semConclusao.code).toBe(LOGO_INDISPONIVEL)
    expect(semConclusao.message).toMatch(/não carregou/)
    expect((semConclusao.details as { indisponiveis: unknown[] }).indisponiveis).toHaveLength(1)
  }, 90_000)

  it('13. o tratamento EXISTENTE entra no fundo medido: a logo clara sobre foto clara só lê por causa do véu escuro do serviço — nenhum véu novo', async () => {
    const c: Cena = { id: 'cp3-13', arquetipo: TOPO, luz: uniforme(200), cores: { headline: ESCURO, servico: CLARO }, logo: '#F0F0F0' }
    const { r } = await compor(c)
    const l = leitura(r)
    expect(l).toMatchObject({ legivel: true, escolha: 'mantida' })
    // Há um véu de TEXTO no rodapé (o serviço claro sobre a foto clara pediu), e nenhum véu da logo.
    const veus = r.layers.filter((l) => ehGradienteDeLeitura(l))
    expect(veus.map((v) => v.metadata?.borda)).toEqual(['rodape'])
    expect(r.diagnostico.tratamentoDeLeitura?.find((t) => t.borda === 'rodape')).toMatchObject({ estado: 'tratado' })
    expect(r.diagnostico.tratamentoDeLeitura?.some((t) => t.veuDaLogo)).toBe(false)
    expect(l.medida!.luzDoFundo).toBeLessThan(150)
    // Sem o véu, a mesma logo no mesmo lugar NÃO leria: é o fundo efetivo que decide.
    const semVeu = await fundoSemALogo({ layers: r.layers.filter((l) => !ehGradienteDeLeitura(l)), canvas: CANVAS, background: '#808080' })
    const bytes = Buffer.from(String(logoDe(r).fileUrl).split(',')[1], 'base64')
    const nua = await medirLogoNoFundo({ bytes, rect: { ...logoDe(r).position, ...logoDe(r).size }, fundo: semVeu })
    expect(nua!.legivel).toBe(false)
    await conferePeloOraculo(r)
  }, 60_000)
})

describe('centro-óptico: a logo AUTOMÁTICA elimina o canto ilegível antes da preferência', () => {
  it('11. o canto mais calmo (escuro) não vence com a logo escura: ela vai ao canto claro, livre de texto, dito; o canto congelado da escolha acompanha', async () => {
    // O rodapé é escuro e calmo (o canto que `escolherCanto` prefere no story); o resto é claro. A logo é escura.
    const c: Cena = { id: 'cp3-11', arquetipo: CENTRO, luz: (_x, y) => (y > 1500 ? 40 : 205), cores: { headline: ESCURO, apoio: ESCURO, servico: CLARO }, logo: ESCURO }
    const { r } = await compor(c)
    const l = leitura(r)
    expect(l.escolha).toBe('canto-trocado')
    expect(l.legivel).toBe(true)
    expect(l.canto.startsWith('superior')).toBe(true)
    expect(l.avaliacoes[0]).toMatchObject({ canto: expect.stringMatching(/^inferior/), estado: 'ilegivel' })
    expect(logoDe(r).metadata?.compositor).toMatchObject({ canto: l.canto })
    expect(logoDe(r).position.y + logoDe(r).size.height).toBeLessThan(960)
    expect(r.diagnostico.arquetipo!.buscaEspacial!.escolha.cantoDaLogo).toBe(l.canto)
    expect(r.diagnostico.arquetipo!.logo).toMatchObject({ modo: 'automatica', canto: l.canto, variante: { origem: 'pagina' } })
    expect(r.diagnostico.avisos.some((a) => a.includes('não lia no inferior'))).toBe(true)
    // Sem colidir com texto: a logo não toca nenhuma caixa de texto.
    for (const t of r.layers.filter((x) => x.type === 'text' || x.type === 'rich-text')) {
      const a = logoDe(r)
      const separados = a.position.x + a.size.width <= t.position.x || t.position.x + t.size.width <= a.position.x || a.position.y + a.size.height <= t.position.y || t.position.y + t.size.height <= a.position.y
      expect(separados, `logo sobre ${t.id}`).toBe(true)
    }
    await conferePeloOraculo(r)
  }, 60_000)
})

describe('recomposição: a variante gravada é reproduzida; trocar é dito', () => {
  const duasDoProjeto: Cena = { id: 'cp3-14', arquetipo: TOPO, luz: uniforme(128), cores: { headline: CLARO, servico: CLARO }, logo: CINZA, projeto: [{ tinta: CLARO }, { tinta: '#E6E6E6' }] }

  async function ciclo(c: Cena, variacoes: { escolhaLogo?: { origem: 'pagina' | 'projeto'; url: string }; projetoNaRecomposicao?: Cena['projeto'] } = {}) {
    const { r: r1, entrada, logosDoProjeto } = await compor(c, { autor: 'u-fixture' })
    const fv = entrada!.fieldValues
    const gravada = validarSpec(fv.spec).spec as SpecDePeca
    const escolha = escolhaEspacialOriginal(fv, gravada)!
    if (variacoes.escolhaLogo) (escolha as { logo?: unknown }).logo = variacoes.escolhaLogo
    const editadas = (entrada!.layers as Layer[]).map((l) => (l.id === 'servico' ? { ...l, content: 'Sáb · 12h às 16h' } : l))
    const posicionada = specComAPosicaoOriginal(specComACopyDaPagina(gravada, editadas).spec, fv)
    await montar({ ...c, ...(variacoes.projetoNaRecomposicao ? { projeto: variacoes.projetoNaRecomposicao } : {}) })
    const r2 = await comporPeca(specDaRecomposicao(posicionada, null), { somenteAvaliar: true, escolhaEspacial: escolha })
    return { r1, r2, fv, logosDoProjeto, escolha }
  }

  it('14. a variante escolhida é gravada na escolha espacial e reproduzida na recomposição (mesma caixa, mesmo arquivo, sem aviso)', async () => {
    const { r1, r2, fv, logosDoProjeto, escolha } = await ciclo(duasDoProjeto)
    expect(logoDe(r1).fileUrl).toBe(logosDoProjeto[0].fileUrl)
    expect(fv.composicao.arquetipo.buscaEspacial.escolha.logo).toEqual({ origem: 'projeto', url: logosDoProjeto[0].fileUrl })
    expect(escolha).toMatchObject({ logo: { origem: 'projeto', url: logosDoProjeto[0].fileUrl } })
    expect(logoDe(r2).fileUrl).toBe(logosDoProjeto[0].fileUrl)
    expect({ position: logoDe(r2).position, size: logoDe(r2).size }).toEqual({ position: logoDe(r1).position, size: logoDe(r1).size })
    expect(leitura(r2)).toMatchObject({ escolha: 'reproduzida', legivel: true, variante: { origem: 'projeto', url: logosDoProjeto[0].fileUrl } })
    expect(r2.diagnostico.avisos.filter((a) => /logo/i.test(a))).toEqual([])
    expect(r2.diagnostico.arquetipo!.buscaEspacial!.escolha.logo).toEqual({ origem: 'projeto', url: logosDoProjeto[0].fileUrl })
  }, 120_000)

  it('14b. a gravada vence a ordem: uma peça gravada com a SEGUNDA do projeto continua com ela, não com a primeira "melhor"', async () => {
    await montar(duasDoProjeto)
    const segunda = cenario.atual!.projeto.logosDoProjeto![1].fileUrl
    const { r2 } = await ciclo(duasDoProjeto, { escolhaLogo: { origem: 'projeto', url: segunda } })
    expect(logoDe(r2).fileUrl).toBe(segunda)
    expect(leitura(r2).escolha).toBe('reproduzida')
  }, 120_000)

  it('15. a gravada que já não é autorizada não é usada em silêncio: aviso, e a conferência parte da assinatura e diz o que ficou', async () => {
    await montar(duasDoProjeto)
    const segunda = cenario.atual!.projeto.logosDoProjeto![1].fileUrl
    const { r2, logosDoProjeto } = await ciclo(duasDoProjeto, { escolhaLogo: { origem: 'projeto', url: segunda }, projetoNaRecomposicao: [{ tinta: CLARO }] })
    expect(logoDe(r2).fileUrl).toBe(logosDoProjeto[0].fileUrl)
    expect(leitura(r2).escolha).toBe('variante-trocada')
    expect(r2.diagnostico.avisos.some((a) => a.includes('já não é autorizada'))).toBe(true)
    expect(r2.diagnostico.avisos.some((a) => a.includes('não lia no inferior-direito'))).toBe(true)
  }, 120_000)

  it('a variante gravada malformada é escolha ilegível (nunca "a mais recente" em silêncio); a peça do T1a leva a variante também', () => {
    const base = { composicao: { arquetipo: { id: TOPO, versao: 1, impressao: 'x', modo: 'referencia', logo: { modo: 'referencia', canto: 'inferior-direito', variante: { origem: 'projeto', url: 'https://blob/p.png' } } } } }
    const spec = { arquetipo: { id: TOPO, versao: 1, impressao: 'x' } } as unknown as SpecDePeca
    expect(escolhaEspacialOriginal(base, spec)).toEqual({ modo: 'referencia', logo: { origem: 'projeto', url: 'https://blob/p.png' } })
    const ruim = { composicao: { arquetipo: { ...base.composicao.arquetipo, logo: { modo: 'referencia', canto: null, variante: { origem: 'inventada', url: 'x' } } } } }
    expect(() => escolhaEspacialOriginal(ruim, spec)).toThrow(/variante da logo gravada/)
  })
})

describe('sem arquétipo: o legado não muda — só o diagnóstico', () => {
  it('asset quebrado no legado não derruba a peça: a leitura fica "não medida", as camadas saem como sempre', async () => {
    const c: Cena = { id: 'cp3-legado-quebrada', luz: uniforme(128), cores: { headline: CLARO, servico: CLARO }, logo: QUEBRADA }
    const { r } = await compor(c)
    expect(logoDe(r).fileUrl).toBe(QUEBRADA)
    expect(leitura(r)).toMatchObject({ estado: 'nao-medida', escolha: 'sem-mudanca', legivel: false })
    expect(leitura(r).motivo).toMatch(/não carregou/)
    expect(r.diagnostico.avisos.filter((a) => /logo/i.test(a))).toEqual([])
  }, 60_000)

  it('cinza sobre cinza no legado: a peça sai igual, e o diagnóstico sinaliza LOGO_SEM_VARIANTE_LEGIVEL com a grade inteira', async () => {
    const c: Cena = { id: 'cp3-legado-cinza', luz: uniforme(128), cores: { headline: CLARO, servico: CLARO }, logo: CINZA, projeto: [{ tinta: '#707070' }] }
    const { r, pagina } = await compor(c)
    expect(logoDe(r).fileUrl).toBe(pagina.layers.find((l) => l.type === 'logo')!.fileUrl)
    const l = leitura(r)
    expect(l).toMatchObject({ estado: 'medida', legivel: false, escolha: 'sem-mudanca', codigo: LOGO_SEM_VARIANTE_LEGIVEL })
    expect(l.alternativa).toBeUndefined()
    // Duas variantes × (o canto atual + os cantos livres): nenhuma lê em lugar nenhum.
    expect(l.avaliacoes.length).toBeGreaterThanOrEqual(2)
    expect(l.avaliacoes.every((a) => a.estado === 'ilegivel')).toBe(true)
    expect(l.mensagem).toMatch(/Sem arquétipo a peça sai como está/)
    expect(r.diagnostico.avisos.filter((a) => /logo/i.test(a))).toEqual([])
  }, 60_000)
})
