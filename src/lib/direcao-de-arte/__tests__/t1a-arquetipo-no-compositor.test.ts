/**
 * T1a — o arquétipo no COMPOSITOR REAL (foto, página de assinatura e logo
 * geradas): a geometria vem da referência do arquétipo, o estilo da
 * assinatura; nada é movido, nada some; o CP2A trata o contraste depois.
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
import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { montarAssinatura } from '@/lib/compositor/assinatura'
import { medirCopy } from '@/lib/compositor/medir-copy'
import { validarSpec } from '@/lib/compositor/spec'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { prepararArquetipo } from '@/lib/compositor/arquetipos/na-spec'
import { CreativeError } from '@/lib/creatives/errors'
import { cenario, medidorCalibrado, type PaginaDeAssinatura, noPisoDe1310 } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { leiturasDosTextos, tratamentosQuePioram } from './suporte/propriedades'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const TOPO = 'minimal-fb-topo-esquerda'
const CENTRO = 'minimal-fb-centro-optico'
const ASSINATURA = { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } }
const CLARO = '#F5F5F5'

/** Um pré-título na página sintética (ela não traz): 32 px, no topo. */
function comPre(pagina: PaginaDeAssinatura): PaginaDeAssinatura {
  const headline = pagina.layers.find((l) => l.name === 'headline')!
  const pre: Layer = { ...headline, id: 'pre-pagina', name: 'pre', position: { x: 92, y: 230 }, size: { width: 896, height: 38 }, style: { ...headline.style, fontSize: 32 } }
  return { ...pagina, layers: [...pagina.layers, pre] }
}

interface Montagem {
  id: string
  luz?: number
  apoio?: boolean
  pre?: boolean
  assinatura?: Record<string, unknown>
}

async function montar(m: Montagem) {
  const foto = await fotoSintetica(() => m.luz ?? 205)
  let pagina = paginaSintetica({
    id: m.id,
    headline: { cor: CLARO },
    ...(m.apoio ? { apoio: { cor: CLARO } } : {}),
    servico: { cor: CLARO },
    logoUrl: dataUrl(await logoSintetica('#808080')),
    fundoUrl: dataUrl(foto),
  })
  if (m.pre) pagina = comPre(pagina)
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
  cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: noPisoDe1310(m.assinatura ?? ASSINATURA) } }
  return pagina
}

const spec = (pagina: string, blocos: Array<{ papel: string; linhas: string[] }>, extra: Record<string, unknown> = {}) => ({ ...specSintetica({ pagina, blocos }), ...extra })

async function compor(s: Record<string, unknown>): Promise<{ r: ResultadoDaComposicao; entrada: Record<string, any> | undefined }> {
  const antes = cap.entradas.length
  const r = await comporPeca(s, { autor: 'u-fixture' })
  return { r, entrada: cap.entradas.length > antes ? cap.entradas.at(-1) : undefined }
}

async function recusa(s: Record<string, unknown>): Promise<CreativeError> {
  try {
    await comporPeca(s, { somenteAvaliar: true })
  } catch (e) {
    expect(e).toBeInstanceOf(CreativeError)
    return e as CreativeError
  }
  throw new Error('a composição não recusou')
}

const camada = (r: ResultadoDaComposicao, id: string) => r.layers.find((l) => l.id === id)!
const impressaoDe = (id: string) => impressaoDoArquetipo(verArquetipo(id, 1)!)
const HEADLINE = { papel: 'headline', linhas: ['Almoço', 'de domingo'] }
const SERVICO = { papel: 'servico', linhas: ['Dom · 12h às 16h'] }
const APOIO = { papel: 'apoio', linhas: ['com a família toda'] }

describe('T1a · minimal-fb-topo-esquerda no compositor real', () => {
  it('13. story: cada papel na referência, rente à esquerda; logo em contain; spec e composição com id+versão+impressão', async () => {
    await montar({ id: 't1a-13', apoio: true })
    const { r, entrada } = await compor(spec('t1a-13', [HEADLINE, APOIO, SERVICO], { arquetipo: { id: TOPO } }))
    expect(camada(r, 'headline').position).toEqual({ x: 92, y: 298 })
    expect(camada(r, 'apoio').position).toEqual({ x: 92, y: 547 })
    expect(camada(r, 'servico').position).toEqual({ x: 92, y: 1555 })
    for (const id of ['headline', 'apoio', 'servico']) expect(camada(r, id).style?.textAlign).toBe('left')
    // A logo do arquivo (160×80, razão 0,5) em contain na referência (799,1555 189×134): a maior caixa com a proporção.
    const logo = camada(r, 'logo')
    expect(logo.position).toEqual({ x: 799, y: 1575 })
    expect(logo.size).toEqual({ width: 189, height: 95 })
    expect(logo.style?.objectFit).toBe('contain')
    // O estilo é da assinatura: a fonte e a cor da página.
    expect(camada(r, 'headline').style).toMatchObject({ fontFamily: 'Sintetica Display', color: CLARO })
    // A procedência fica no diagnóstico e a spec gravada traz a versão exata — nunca "a mais recente".
    const d = r.diagnostico.arquetipo!
    expect(d).toMatchObject({ id: TOPO, versao: 1, impressao: impressaoDe(TOPO), codigoTaxonomico: 'MIN-01', formato: 'story', modo: 'busca-espacial-v1', elementosMaterializados: ['fio'] })
    expect(d.elementosDeclarados).toEqual([{ id: 'fio', tipo: 'fio-fino', opcional: true }])
    expect(d.papeis.map((p) => [p.papel, p.posicao.x, p.posicao.y])).toEqual([
      ['headline', 92, 298],
      ['apoio', 92, 547],
      ['servico', 92, 1555],
    ])
    expect(d.logo).toMatchObject({ modo: 'referencia', canto: 'inferior-direito' })
    expect(r.diagnostico.posicao).toMatchObject({ ancora: 'topo', alinha: 'esquerda', crop: 'center-middle' })
    expect(r.diagnostico.candidatos).toEqual([])
    expect(entrada!.fieldValues.spec.arquetipo).toEqual({ id: TOPO, versao: 1, impressao: impressaoDe(TOPO) })
    expect(entrada!.fieldValues.composicao.arquetipo.impressao).toBe(impressaoDe(TOPO))
    // A Page é Layer[] normal: nenhum tipo novo de camada (o fio do T1b é um `shape`, tipo que o editor e o render já têm).
    expect(new Set(entrada!.layers.map((l: Layer) => l.type))).toEqual(new Set(['image', 'text', 'logo', 'gradient', 'shape']))
  }, 60_000)

  it('14. feed: a geometria própria do feed (não a do story escalada)', async () => {
    await montar({ id: 't1a-14' })
    const { r } = await compor(spec('t1a-14', [HEADLINE, SERVICO], { formato: 'feed', arquetipo: { id: TOPO } }))
    expect(camada(r, 'headline').position).toEqual({ x: 92, y: 209 })
    expect(camada(r, 'servico').position).toEqual({ x: 92, y: 1134 })
    expect(r.diagnostico.arquetipo!.formato).toBe('feed')
  }, 60_000)

  it('19. a assinatura agrupa headline + apoio (mesmo Cmd+G): nenhum papel do arquétipo desaparece, e cada um tem o próprio grupo', async () => {
    await montar({ id: 't1a-19', apoio: true })
    const { r } = await compor(spec('t1a-19', [HEADLINE, APOIO, SERVICO], { arquetipo: { id: TOPO } }))
    const grupo = (id: string) => (camada(r, id).metadata as { groupId?: string }).groupId
    expect([grupo('headline'), grupo('apoio'), grupo('servico')]).toEqual(['grupo-arq-headline', 'grupo-arq-apoio', 'grupo-arq-servico'])
    expect(r.diagnostico.arquetipo!.papeis.map((p) => p.papel)).toEqual(['headline', 'apoio', 'servico'])
    // Na página os dois moram juntos no topo; na peça, cada um na referência dele.
    expect(camada(r, 'apoio').position.y - camada(r, 'headline').position.y).toBe(249)
  }, 60_000)

  it('as margens da PÁGINA não competem: o pré-título pousa em 230 mesmo com o primeiro texto da página em 230/300', async () => {
    await montar({ id: 't1a-margem', pre: true })
    const { r } = await compor(spec('t1a-margem', [{ papel: 'pre', linhas: ['hoje'] }, HEADLINE, SERVICO], { arquetipo: { id: TOPO } }))
    expect(camada(r, 'pre').position).toEqual({ x: 92, y: 230 })
  }, 60_000)

  it('16. referência fora da área segura EFETIVA do projeto: desde o CP2B a faixa é RESGATADA na vertical (a referência é preferência), dito no aviso — e o medir-copy parte do mesmo lugar', async () => {
    const pagina = await montar({ id: 't1a-16', pre: true, luz: 60, assinatura: { ...ASSINATURA, geometria: { story: { safeTopo: 250 } } } })
    const blocos = [{ papel: 'pre', linhas: ['hoje'] }, HEADLINE, SERVICO]
    const { r } = await compor(spec('t1a-16', blocos, { arquetipo: { id: TOPO } }))
    const d = r.diagnostico.arquetipo!
    const pre = d.papeis.find((p) => p.papel === 'pre')!
    // A referência (y 230) fica acima do piso de 250: a faixa {pre, headline} desce o mínimo para caber.
    expect(pre.referencia).toEqual({ x: 92, y: 230, width: 540, height: 58 })
    expect(pre.zonaEfetiva.y).toBe(250)
    expect(pre.posicao.y).toBeGreaterThanOrEqual(250)
    const dy = pre.posicao.y - 230
    expect(d.papeis.find((p) => p.papel === 'headline')!.posicao.y).toBe(298 + dy)
    expect(r.diagnostico.avisos.some((a) => /pre: a referência do arquétipo sai da zona efetiva/.test(a))).toBe(true)
    // O medir-copy mede na MESMA partida (o resgate), e diz que cabe.
    const assinatura = montarAssinatura({ pagina, formatoDaPagina: 'story', numerosDoProjeto: { ...ASSINATURA, geometria: { story: { safeTopo: 250 } } }, logoDoProjeto: null })
    const v = validarSpec(spec('t1a-16', blocos, { arquetipo: { id: TOPO } }))
    const m = medirCopy({ spec: v.spec!, assinatura, formato: 'story', medir: medidorCalibrado(), familias: [], fonteCarregada: () => true, combinacoesSalvas: [], arquetipo: prepararArquetipo(v.spec!) })
    expect(m.cabeTudo).toBe(true)
    expect(m.arquetipo!.posicoes!.pre!.posicao.y).toBe(pre.posicao.y)
    expect(m.arquetipo!.avaliacaoEspacial).toBe('nao-executada')
  }, 60_000)

  it('18. linhasMax é HARD: três linhas de manchete são recusadas antes de medir', async () => {
    await montar({ id: 't1a-18' })
    const e = await recusa(spec('t1a-18', [{ papel: 'headline', linhas: ['um', 'dois', 'três'] }, SERVICO], { arquetipo: { id: TOPO } }))
    expect(e.code).toBe('ARQUETIPO_LINHAS_EXCEDIDAS')
  }, 60_000)

  it('20. o CP2A continua valendo: texto claro sobre foto clara recebe o tratamento por borda, e nenhum tratamento piora a leitura', async () => {
    await montar({ id: 't1a-20', luz: 205 })
    const { r } = await compor(spec('t1a-20', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }))
    expect(r.diagnostico.tratamentoDeLeitura?.map((t) => [t.borda, t.estado])).toEqual([
      ['topo', 'tratado'],
      ['rodape', 'tratado'],
    ])
    expect(tratamentosQuePioram(await leiturasDosTextos(r.layers, { width: 1080, height: 1920 }))).toEqual([])
  }, 60_000)
})

describe('T1a · minimal-fb-centro-optico no compositor real', () => {
  it('15. headline centrada no centro óptico, serviço embaixo, logo no canto automático de sempre', async () => {
    // Foto escura: o texto claro lê sem tratamento em qualquer posição, e a busca (CP2B) fica na referência. Na foto
    // clara e uniforme, o véu mais leve (rumo à borda) venceria a referência — é a regra do CP2B, provada nos testes dele.
    await montar({ id: 't1a-15', apoio: true, luz: 60 })
    const { r } = await compor(spec('t1a-15', [{ papel: 'headline', linhas: ['Sexta'] }, { papel: 'apoio', linhas: ['jazz ao vivo'] }, SERVICO], { arquetipo: { id: CENTRO } }))
    const h = camada(r, 'headline')
    expect(h.style?.textAlign).toBe('center')
    expect(h.position.y).toBe(854)
    expect(Math.abs(h.position.x + h.size.width / 2 - 540)).toBeLessThanOrEqual(1)
    expect(camada(r, 'servico').position.y).toBe(1613)
    const d = r.diagnostico.arquetipo!
    expect(d.logo.modo).toBe('automatica')
    expect(['inferior-esquerdo', 'inferior-direito', 'superior-esquerdo', 'superior-direito']).toContain(d.logo.canto)
    expect(camada(r, 'logo').metadata).toMatchObject({ compositor: { canto: d.logo.canto } })
    expect(d.elementosDeclarados).toEqual([{ id: 'spark', tipo: 'spark-4', opcional: true }])
    // T1b: o spark opcional é desenhado, preso à manchete (o detalhe está em t1b-acentos.test.ts).
    expect(d.elementosMaterializados).toEqual(['spark'])
  }, 60_000)
})

describe('T1a · recusas estruturadas no compositor', () => {
  it('8. quadrado; 9. CTA (o 12 — o modelo 2 recusado até o T1b — compõe desde o T1b: t1b-acentos.test.ts)', async () => {
    await montar({ id: 't1a-rec', apoio: true })
    expect((await recusa(spec('t1a-rec', [HEADLINE, SERVICO], { formato: 'quadrado', arquetipo: { id: TOPO } }))).code).toBe('ARQUETIPO_FORMATO_NAO_SUPORTADO')
    const cta = await recusa(spec('t1a-rec', [HEADLINE, SERVICO, { papel: 'cta', linhas: ['Reserve'] }], { arquetipo: { id: TOPO } }))
    expect(cta.code).toBe('ARQUETIPO_PAPEIS_INCOMPATIVEIS')
    expect(cta.details).toMatchObject({ naoSuportados: ['cta'] })
  }, 60_000)

  it('5. impressão divergente e 6/7. modelo/versão inexistentes são recusados na composição', async () => {
    await montar({ id: 't1a-imp' })
    expect((await recusa(spec('t1a-imp', [HEADLINE, SERVICO], { arquetipo: { id: TOPO, versao: 1, impressao: 'arq1-00000000000000' } }))).code).toBe('ARQUETIPO_IMPRESSAO_DIVERGENTE')
    expect((await recusa(spec('t1a-imp', [HEADLINE, SERVICO], { arquetipo: { id: 'minimal-inexistente' } }))).code).toBe('ARQUETIPO_DESCONHECIDO')
    expect((await recusa(spec('t1a-imp', [HEADLINE, SERVICO], { arquetipo: { id: TOPO, versao: 7 } }))).code).toBe('ARQUETIPO_VERSAO_INEXISTENTE')
  }, 60_000)

  it('preferência de posição diferente da do arquétipo é recusada; a igual é aceita e declarada', async () => {
    await montar({ id: 't1a-pref' })
    expect((await recusa(spec('t1a-pref', [HEADLINE, SERVICO], { arquetipo: { id: TOPO }, preferencias: { variante: 't1a-pref', alinha: 'centro' } }))).code).toBe('ARQUETIPO_PREFERENCIA_CONFLITANTE')
    const { r } = await compor(spec('t1a-pref', [HEADLINE, SERVICO], { arquetipo: { id: TOPO }, preferencias: { variante: 't1a-pref', ancora: 'topo' } }))
    expect(r.diagnostico.arquetipo!.preferenciasCoincidentes).toEqual(['ancora'])
  }, 60_000)
})

/** A segunda voz na página (o lockup de duas vozes): `headline2` no grupo da manchete, as duas no corpo pedido. */
function comSegundaVoz(pagina: PaginaDeAssinatura, corpo: number): PaginaDeAssinatura {
  // Texto curto (uma linha na página) e a voz 2 logo abaixo da 1: o arranjo lê o vão desenhado, sem encaixe.
  const altura = Math.round(corpo * 1.15)
  const layers = pagina.layers.map((l) => (l.name === 'headline' ? { ...l, content: 'Voz um', size: { width: 896, height: altura }, style: { ...l.style, fontSize: corpo } } : l))
  const h = layers.find((l) => l.name === 'headline')!
  return { ...pagina, layers: [...layers, { ...h, id: 'headline2-pagina', name: 'headline2', content: 'Voz dois', position: { x: 92, y: 300 + altura } }] }
}

describe('T1a · a escada da UNIDADE (manchete + segunda voz)', () => {
  async function montarComVoz2(id: string, corpo: number) {
    const pagina = await montar({ id })
    cenario.atual = { ...cenario.atual!, paginasDeAssinatura: [comSegundaVoz(pagina, corpo)] }
    return cenario.atual.paginasDeAssinatura[0]
  }
  const medirCom = (pagina: PaginaDeAssinatura, blocos: Array<{ papel: string; linhas: string[] }>) => {
    const assinatura = montarAssinatura({ pagina, formatoDaPagina: 'story', numerosDoProjeto: noPisoDe1310(ASSINATURA), logoDoProjeto: null })
    assinatura.camadasDaPagina = pagina.layers
    const v = validarSpec(spec(pagina.id, blocos, { arquetipo: { id: TOPO } }))
    return medirCopy({ spec: v.spec!, assinatura, formato: 'story', medir: medidorCalibrado(), familias: [], fonteCarregada: () => true, combinacoesSalvas: [], arquetipo: prepararArquetipo(v.spec!) })
  }

  it('cada voz cabe sozinha, a unidade não: a escada sancionada desce a UNIDADE até caber (80%) — e o medir-copy diz o mesmo', async () => {
    const pagina = await montarComVoz2('t1a-voz2', 120)
    const { r } = await compor(spec('t1a-voz2', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }))
    const escala = (id: string) => r.diagnostico.blocos.find((b) => b.id === id)!.escala
    expect([escala('headline'), escala('headline2')]).toEqual([0.8, 0.8])
    // As duas vozes na mesma unidade, empilhadas na referência da manchete.
    expect(camada(r, 'headline').position).toEqual({ x: 92, y: 298 })
    expect(camada(r, 'headline2').position.y).toBe(298 + camada(r, 'headline').size.height)
    expect((camada(r, 'headline2').metadata as { groupId?: string }).groupId).toBe('grupo-arq-headline')
    const m = medirCom(pagina, [HEADLINE, SERVICO])
    expect(m.cabeTudo).toBe(true)
    for (const id of ['headline', 'headline2']) {
      const b = m.blocos.find((x) => x.id === id)!
      expect([b.situacao, b.escala, b.height]).toEqual(['cabe-reduzido', 0.8, r.diagnostico.blocos.find((x) => x.id === id)!.height])
    }
  }, 60_000)

  it('mover a segunda voz na PÁGINA não muda a geometria da peça (o vão da unidade é o ritmo da casa)', async () => {
    const pagina = await montarComVoz2('t1a-voz2-vao', 90)
    const { r: antes } = await compor(spec('t1a-voz2-vao', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }))
    // A equipe afasta (e depois encaixa por cima) a voz 2 na página de assinatura: a peça não muda.
    for (const dy of [180, -60]) {
      cenario.atual = {
        ...cenario.atual!,
        paginasDeAssinatura: [{ ...pagina, layers: pagina.layers.map((l) => (l.name === 'headline2' ? { ...l, position: { x: l.position.x, y: l.position.y + dy } } : l)) }],
      }
      const { r } = await compor(spec('t1a-voz2-vao', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }))
      expect(camada(r, 'headline2').position, `dy ${dy}`).toEqual(camada(antes, 'headline2').position)
      expect((camada(r, 'headline2').metadata as { compositor?: { encaixe?: number } }).compositor?.encaixe).toBeUndefined()
    }
  }, 60_000)

  it('nem no piso a unidade cabe: recusa com o orçamento da unidade — e o medir-copy marca os blocos como não cabe', async () => {
    const pagina = await montarComVoz2('t1a-voz2-grande', 150)
    const e = await recusa(spec('t1a-voz2-grande', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }))
    expect(e.code).toBe('ARQUETIPO_TEXTO_NAO_CABE')
    const p = (e.details as { problemas: Array<Record<string, any>> }).problemas[0]
    expect(p.papel).toBe('headline')
    expect(p.orcamento).toMatchObject({ capacidade: { largura: 756, altura: 230 }, escala: 0.8 })
    expect(p.orcamento.blocos.map((b: { id: string }) => b.id)).toEqual(['headline', 'headline2'])
    const m = medirCom(pagina, [HEADLINE, SERVICO])
    expect(m.cabeTudo).toBe(false)
    expect(m.blocos.filter((b) => b.id.startsWith('headline')).map((b) => b.situacao)).toEqual(['nao-cabe', 'nao-cabe'])
    expect(m.arquetipo!.problemas[0].orcamento!.escala).toBe(0.8)
  }, 60_000)
})

/** Um ícone do arranjo preso ao serviço (o relógio do horário), antes ou depois do texto, no mesmo grupo da página. */
async function comIcone(pagina: PaginaDeAssinatura, lado: 'antes' | 'depois'): Promise<PaginaDeAssinatura> {
  const servico = pagina.layers.find((l) => l.name === 'servico')!
  const texto = { ...servico, content: 'Dom · 12h às 16h', position: { x: lado === 'antes' ? 140 : 92, y: 1640 }, size: { width: 600, height: 46 }, style: { ...servico.style, textAlign: 'left' as const }, metadata: { groupId: 'g-rodape' } }
  const icone: Layer = {
    id: 'icone-relogio',
    name: 'Ícone relógio',
    type: 'icon',
    visible: true,
    locked: false,
    order: 5,
    position: { x: lado === 'antes' ? 92 : 92 + 6 + 272 + 16, y: 1645 },
    size: { width: 36, height: 36 },
    fileUrl: dataUrl(await logoSintetica('#F5F5F5')),
    style: { objectFit: 'contain' },
    metadata: { groupId: 'g-rodape' },
  }
  return { ...pagina, layers: [...pagina.layers.filter((l) => l.name !== 'servico'), texto, icone] }
}

describe('T1a · a página não decide geometria por outra via', () => {
  it('a ordem dentro da unidade é a da copy: a voz 2 desenhada ACIMA da manchete na página continua depois dela na peça', async () => {
    const pagina = await montar({ id: 't1a-ordem' })
    const comVoz2 = comSegundaVoz(pagina, 90)
    cenario.atual = {
      ...cenario.atual!,
      paginasDeAssinatura: [{ ...comVoz2, layers: comVoz2.layers.map((l) => (l.name === 'headline2' ? { ...l, position: { x: l.position.x, y: 150 } } : l)) }],
    }
    const { r } = await compor(spec('t1a-ordem', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }))
    expect(camada(r, 'headline').position.y).toBe(298)
    expect(camada(r, 'headline2').position.y).toBeGreaterThan(camada(r, 'headline').position.y)
  }, 60_000)

  it('o ornamento do arranjo não desloca o texto: com o ícone DEPOIS, o serviço pousa exatamente na referência', async () => {
    const pagina = await montar({ id: 't1a-orn-depois' })
    cenario.atual = { ...cenario.atual!, paginasDeAssinatura: [await comIcone(pagina, 'depois')] }
    const { r } = await compor(spec('t1a-orn-depois', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }))
    expect(camada(r, 'servico').position).toEqual({ x: 92, y: 1555 })
    expect(r.layers.some((l) => (l.metadata as { compositor?: { elementoDe?: string } } | undefined)?.compositor?.elementoDe === 'servico')).toBe(true)
  }, 60_000)

  it('o ornamento ANTES do texto, com o texto na referência, sai da zona efetiva: recusa (compositor e medir-copy concordam), sem mover o texto', async () => {
    const pagina = await comIcone(await montar({ id: 't1a-orn-antes' }), 'antes')
    cenario.atual = { ...cenario.atual!, paginasDeAssinatura: [pagina] }
    const e = await recusa(spec('t1a-orn-antes', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }))
    expect(e.code).toBe('ARQUETIPO_FORA_DA_ZONA')
    const problema = (e.details as { problemas: Array<{ papel: string; motivo: string }> }).problemas[0]
    expect(problema.papel).toBe('servico')
    expect(problema.motivo).toMatch(/ornamentos/)
    const assinatura = montarAssinatura({ pagina, formatoDaPagina: 'story', numerosDoProjeto: noPisoDe1310(ASSINATURA), logoDoProjeto: null })
    assinatura.camadasDaPagina = pagina.layers
    const v = validarSpec(spec('t1a-orn-antes', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }))
    const m = medirCopy({ spec: v.spec!, assinatura, formato: 'story', medir: medidorCalibrado(), familias: [], fonteCarregada: () => true, combinacoesSalvas: [], arquetipo: prepararArquetipo(v.spec!) })
    expect(m.cabeTudo).toBe(false)
    expect(m.arquetipo!.problemas.map((p) => [p.codigo, p.papel])).toEqual([['ARQUETIPO_FORA_DA_ZONA', 'servico']])
  }, 60_000)
})

describe('T1a · medir-copy e compositor concordam', () => {
  async function medir(paginaId: string, blocos: Array<{ papel: string; linhas: string[] }>, arquetipo: Record<string, unknown>) {
    const pagina = cenario.atual!.paginasDeAssinatura[0]
    const assinatura = montarAssinatura({ pagina: { ...pagina, layers: pagina.layers }, formatoDaPagina: 'story', numerosDoProjeto: noPisoDe1310(ASSINATURA), logoDoProjeto: null })
    assinatura.camadasDaPagina = pagina.layers
    const v = validarSpec(spec(paginaId, blocos, { arquetipo }))
    const arq = prepararArquetipo(v.spec!)
    return medirCopy({ spec: v.spec!, assinatura, formato: 'story', medir: medidorCalibrado(), familias: [], fonteCarregada: () => true, combinacoesSalvas: [], arquetipo: arq })
  }

  it('17. copy que cabe: mesma coluna, mesma caixa; e a fixação traz id + versão + impressão', async () => {
    await montar({ id: 't1a-17' })
    const m = await medir('t1a-17', [HEADLINE, SERVICO], { id: TOPO })
    const { r } = await compor(spec('t1a-17', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }))
    expect(m.cabeTudo).toBe(true)
    expect(m.arquetipo).toMatchObject({ id: TOPO, versao: 1, impressao: impressaoDe(TOPO), problemas: [], excessosDeLinhas: [] })
    expect(m.arquetipo!.papeis.headline).toMatchObject({ largura: 756, coluna: 742, capacidade: 230, linhasMax: 2 })
    for (const b of m.blocos) {
      const c = r.diagnostico.blocos.find((x) => x.id === b.id)!
      expect([b.width, b.height], b.id).toEqual([c.width, c.height])
      expect(b.linhasMedidas.every((l) => l.coluna === (b.papel === 'servico' ? 580 : 742))).toBe(true)
    }
    expect(m.arquetipo!.posicoes!.headline!.posicao).toEqual(r.diagnostico.arquetipo!.papeis.find((p) => p.papel === 'headline')!.posicao)
  }, 60_000)

  it('17. copy larga demais: o medir-copy diz "não cabe" na coluna da referência e o compositor recusa com a MESMA coluna', async () => {
    await montar({ id: 't1a-17b' })
    const larga = [{ papel: 'headline', linhas: ['Uma manchete longa demais de verdade'] }, SERVICO]
    const m = await medir('t1a-17b', larga, { id: TOPO })
    expect(m.cabeTudo).toBe(false)
    const h = m.blocos.find((b) => b.id === 'headline')!
    expect(h.situacao).toBe('nao-cabe')
    expect(h.linhasMedidas[0]).toMatchObject({ coluna: 742, cabe: false })
    const e = await recusa(spec('t1a-17b', larga, { arquetipo: { id: TOPO } }))
    expect(e.code).toBe('ARQUETIPO_TEXTO_NAO_CABE')
    expect(e.details).toMatchObject({ orcamento: [expect.objectContaining({ papel: 'headline', coluna: 742 })] })
    // O mesmo diagnóstico da recusa da materialização: papel, referência, zona efetiva, medida e motivo.
    expect((e.details as { problemas: unknown[] }).problemas[0]).toMatchObject({
      papel: 'headline',
      referencia: { x: 92, y: 298, width: 756, height: 230 },
      zonaEfetiva: expect.objectContaining({ x: 92 }),
      medida: { width: expect.any(Number) },
      motivo: expect.stringMatching(/coluna da referência \(742px\)/),
    })
  }, 60_000)

  it('o piso da escada é medido EXATO: no feed a partir de página de story (escala 0,875), a linha que só cabe a 80% compõe — e o medir-copy concorda', async () => {
    const pagina = await montar({ id: 't1a-piso' })
    // Manchete de 100 px na página: no feed, 87,5 px; a linha de 21 letras só cabe na coluna (742) a 70 px — 80% exatos.
    const comCorpo = { ...pagina, layers: pagina.layers.map((l) => (l.name === 'headline' ? { ...l, style: { ...l.style, fontSize: 100 } } : l)) }
    cenario.atual = { ...cenario.atual!, paginasDeAssinatura: [comCorpo] }
    const blocos = [{ papel: 'headline', linhas: ['Almoço especial sexta'] }, SERVICO]
    const { r } = await compor(spec('t1a-piso', blocos, { formato: 'feed', arquetipo: { id: TOPO } }))
    expect(r.diagnostico.blocos.find((b) => b.id === 'headline')!.escala).toBe(0.8)
    const assinatura = montarAssinatura({ pagina: comCorpo, formatoDaPagina: 'story', numerosDoProjeto: noPisoDe1310(ASSINATURA), logoDoProjeto: null })
    assinatura.camadasDaPagina = comCorpo.layers
    const v = validarSpec(spec('t1a-piso', blocos, { formato: 'feed', arquetipo: { id: TOPO } }))
    const m = medirCopy({ spec: v.spec!, assinatura, formato: 'feed', medir: medidorCalibrado(), familias: [], fonteCarregada: () => true, combinacoesSalvas: [], arquetipo: prepararArquetipo(v.spec!) })
    expect(m.cabeTudo).toBe(true)
    expect(m.blocos.find((b) => b.id === 'headline')).toMatchObject({ situacao: 'cabe-reduzido', escala: 0.8 })
    // A linha é medida na escala FINAL do bloco: a mesma da caixa e do corpo — e ali ela cabe.
    expect(m.blocos.find((b) => b.id === 'headline')!.linhasMedidas[0]).toMatchObject({ coluna: 742, cabe: true, largura: 735 })
  }, 60_000)

  it('linha com quebra dentro do item: a recusa diz a quebra e a medida em linhas (nunca "linha de 0px")', async () => {
    await montar({ id: 't1a-quebra' })
    const e = await recusa(spec('t1a-quebra', [{ papel: 'headline', linhas: ['Almoço\nde domingo'] }, SERVICO], { arquetipo: { id: TOPO } }))
    expect(e.code).toBe('ARQUETIPO_TEXTO_NAO_CABE')
    const p = (e.details as { problemas: Array<Record<string, any>> }).problemas[0]
    expect(p).toMatchObject({ papel: 'headline', medida: { linhas: 2 }, quebras: [{ linha: 'Almoço\nde domingo', linhas: 2 }] })
    expect(p.motivo).toMatch(/quebra dentro do item/)
    expect(p.motivo).not.toMatch(/0px/)
    // A mensagem geral também diz a quebra, não "linha maior que a coluna".
    expect(e.message).toMatch(/quebra dentro do item/)
    expect(e.message).not.toMatch(/linha maior que a coluna/)
  }, 60_000)

  it('18. linhasMax no medir-copy: declarado (cabeTudo falso), não lançado', async () => {
    await montar({ id: 't1a-18m' })
    const m = await medir('t1a-18m', [{ papel: 'headline', linhas: ['um', 'dois', 'três'] }, SERVICO], { id: TOPO })
    expect(m.cabeTudo).toBe(false)
    expect(m.arquetipo!.excessosDeLinhas).toEqual([{ papel: 'headline', linhas: 3, linhasMax: 2 }])
  }, 60_000)
})
