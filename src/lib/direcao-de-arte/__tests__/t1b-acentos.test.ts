/**
 * T1b — os acentos do arquétipo no COMPOSITOR REAL (foto, página de assinatura e logo geradas): o fio, a moldura em L
 * e o spark nascem como camadas `shape` normais, presos à manchete DEPOIS da posição escolhida pela foto, na cor dela
 * (ou do destaque dela), abaixo dos textos; a receita fica congelada na peça, e o medir-copy prevê o mesmo lugar.
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
import { lerAcentosGravados, receitasDoArquetipo } from '@/lib/compositor/arquetipos/acentos'
import { prepararArquetipo } from '@/lib/compositor/arquetipos/na-spec'
import { problemasDosVetores } from '@/lib/vetor/validar-camada'
import { PADDING_DE_DESENHO } from '@/lib/creatives/halo/fundo-de-texto'
import { cenario, medidorCalibrado, noPisoDe1310 } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const TOPO = 'minimal-fb-topo-esquerda'
const CENTRO = 'minimal-fb-centro-optico'
const BASE = 'minimal-fb-base-esquerda'
const ASSINATURA = { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } }
const CLARO = '#F5F5F5'
const CLARO_CANONICO = 'rgba(245, 245, 245, 1)'
const DESTAQUE = '#E4572E'

/** Só para as provas visuais: a fonte da página vira Arial e o medidor é calibrado nela (como no CP2B), para a tinta do PNG bater com a caixa medida. */
const ARIAL = medidorCalibrado([{ fontFamily: 'Arial', fontSize: 100, lineHeight: 1, letterSpacing: 0, linhaMaisLonga: 'x'.repeat(10), width: 560 + 2 * PADDING_DE_DESENHO + 2, height: 115, linhas: 1 }])
const emArial = (l: Layer): Layer => (l.type === 'text' && l.style ? { ...l, style: { ...l.style, fontFamily: 'Arial' } } : l)

async function montar(m: { id: string; luz?: number; assinatura?: Record<string, unknown>; arial?: boolean }) {
  const foto = await fotoSintetica(() => m.luz ?? 60)
  const sintetica = paginaSintetica({
    id: m.id,
    headline: { cor: CLARO },
    apoio: { cor: CLARO },
    servico: { cor: CLARO },
    logoUrl: dataUrl(await logoSintetica('#808080')),
    fundoUrl: dataUrl(foto),
  })
  const pagina = m.arial ? { ...sintetica, layers: sintetica.layers.map(emArial) } : sintetica
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
  cenario.atual = { ...base, ...(m.arial ? { medidor: ARIAL } : {}), projeto: { ...base.projeto, assinatura: noPisoDe1310(m.assinatura ?? ASSINATURA) } }
  return pagina
}

const HEADLINE = { papel: 'headline', linhas: ['Almoço', 'de domingo'] }
const APOIO = { papel: 'apoio', linhas: ['com a família'] }
const SERVICO = { papel: 'servico', linhas: ['Dom · 12h às 16h'] }
const CURTA = { papel: 'headline', linhas: ['Sexta'] }

const spec = (pagina: string, blocos: Array<{ papel: string; linhas: string[] }>, extra: Record<string, unknown> = {}) => ({ ...specSintetica({ pagina, blocos }), ...extra })

async function compor(s: Record<string, unknown>, opcoes: Parameters<typeof comporPeca>[1] = {}): Promise<{ r: ResultadoDaComposicao; entrada: Record<string, any> | undefined }> {
  const antes = cap.entradas.length
  const r = await comporPeca(s, { autor: 'u-fixture', ...opcoes })
  return { r, entrada: cap.entradas.length > antes ? cap.entradas.at(-1) : undefined }
}

const camada = (r: ResultadoDaComposicao, id: string) => r.layers.find((l) => l.id === id)
const indice = (r: ResultadoDaComposicao, id: string) => r.layers.findIndex((l) => l.id === id)
const fundo = (l: Layer) => l.position.y + l.size.height

/** O acento fica acima da foto e dos véus e abaixo de TODO texto. */
function conferirOrdem(r: ResultadoDaComposicao, id: string) {
  const i = indice(r, id)
  expect(i).toBeGreaterThan(indice(r, 'bg-foto'))
  for (const [j, l] of r.layers.entries()) {
    if (l.type === 'text') expect(i, `${id} abaixo de ${l.id}`).toBeLessThan(j)
    if (l.id.startsWith('gradiente-leitura')) expect(i, `${id} acima de ${l.id}`).toBeGreaterThan(j)
  }
}

const FORMATOS = ['story', 'feed'] as const
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } }

describe('T1b · topo-esquerda: o fio preso ao fim da manchete', () => {
  for (const formato of FORMATOS) {
    it(`${formato}: o fio pousa sob a manchete real, rente à tinta, na cor dela, abaixo dos textos; a receita fica congelada na peça`, async () => {
      await montar({ id: `t1b-topo-${formato}` })
      const { r, entrada } = await compor(spec(`t1b-topo-${formato}`, [HEADLINE, APOIO, SERVICO], { formato, arquetipo: { id: TOPO } }))
      const h = camada(r, 'headline')!
      const fio = camada(r, 'acento-fio')!
      const { width: W, height: H } = CANVAS[formato]
      const def = verArquetipo(TOPO)!.formatos[formato]
      const ref = def.papeis.headline as { referencia: { y: number; h: number } }
      const vao = (def.elementos!.fio.y - (ref.referencia.y + ref.referencia.h)) * H
      // A caixa da unidade (manchete) vem do diagnóstico; o fio fica o vão declarado abaixo dela — não na posição fixa do catálogo.
      const unidade = r.diagnostico.arquetipo!.papeis.find((p) => p.papel === 'headline')!.posicao
      expect(fio.type).toBe('shape')
      expect(fio.position).toEqual({ x: h.position.x + 6, y: Math.round(unidade.y + unidade.height + vao) })
      expect(fio.size.width).toBe(Math.round(def.elementos!.fio.w * W))
      expect(fio.position.y).toBeGreaterThanOrEqual(fundo(h))
      expect(fio.position.y + fio.size.height).toBeLessThanOrEqual(camada(r, 'apoio')!.position.y)
      expect(fio.style).toMatchObject({ shapeType: 'line', fill: CLARO_CANONICO, strokeWidth: 2, vetor: { asset: { id: 'fio-fino', versao: 1 } } })
      expect(fio.metadata).toMatchObject({ compositor: { acento: { elemento: 'fio', presoA: 'headline', corPorPapel: 'texto', fonteDaCor: 'texto-do-papel' } } })
      conferirOrdem(r, 'acento-fio')
      expect(problemasDosVetores(r.layers)).toEqual([])

      const d = r.diagnostico.arquetipo!
      expect(d.elementosMaterializados).toEqual(['fio'])
      expect(d.acentos).toEqual([{ ...receitasDoArquetipo(verArquetipo(TOPO)!).receitas[0], camada: 'acento-fio', rect: { ...fio.position, ...fio.size }, cor: CLARO, fonteDaCor: 'texto-do-papel' }])
      expect(d.acentosOmitidos).toBeUndefined()
      // `diagnostico` é o mesmo objeto gravado em `fieldValues.composicao`: a recomposição lê a receita daqui.
      expect(entrada!.fieldValues.composicao.arquetipo.acentos).toEqual(d.acentos)
    }, 60_000)
  }

  it('manchete de uma linha: o fio sobe junto com o fim do texto (preso, não na caixa fixa do catálogo)', async () => {
    await montar({ id: 't1b-topo-curta' })
    const duas = (await compor(spec('t1b-topo-curta', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }))).r
    const uma = (await compor(spec('t1b-topo-curta', [CURTA, SERVICO], { arquetipo: { id: TOPO } }))).r
    const delta = fundo(camada(duas, 'headline')!) - fundo(camada(uma, 'headline')!)
    expect(delta).toBeGreaterThan(40)
    expect(camada(duas, 'acento-fio')!.position.y - camada(uma, 'acento-fio')!.position.y).toBe(delta)
  }, 60_000)
})

describe('T1b · base-esquerda: a moldura em L obrigatória — o modelo compõe', () => {
  for (const formato of FORMATOS) {
    it(`${formato}: o braço de cima fica na referência, o vertical termina o vão declarado acima da manchete, na cor dela`, async () => {
      await montar({ id: `t1b-base-${formato}` })
      const { r } = await compor(spec(`t1b-base-${formato}`, [HEADLINE, APOIO, SERVICO], { formato, arquetipo: { id: BASE } }))
      const h = camada(r, 'headline')!
      const l = camada(r, 'acento-moldura')!
      const { height: H, width: W } = CANVAS[formato]
      const def = verArquetipo(BASE)!.formatos[formato]
      const e = def.elementos!.moldura
      const ref = (def.papeis.headline as { referencia: { y: number } }).referencia
      const unidade = r.diagnostico.arquetipo!.papeis.find((p) => p.papel === 'headline')!.posicao
      // Na margem da marca (29/10/2026) o braço de cima da moldura (211/135 no catálogo, na faixa da margem) pousa no topo do piso padrão.
      expect(l.position).toEqual({ x: h.position.x + 6, y: formato === 'story' ? 188 : 120 })
      expect(l.size.width).toBe(Math.round(e.w * W))
      expect(Math.abs(fundo(l) - (unidade.y - (ref.y - (e.y + e.h)) * H))).toBeLessThanOrEqual(1)
      expect(fundo(l)).toBeLessThan(h.position.y)
      expect(l.style).toMatchObject({ shapeType: 'svg-path', pathData: 'M0 100 L0 0 L100 0', fill: 'transparent', strokeColor: CLARO_CANONICO, strokeWidth: 2 })
      // A logo (topo à direita) não encosta no braço de cima.
      const logo = camada(r, 'logo')!
      expect(l.position.x + l.size.width).toBeLessThan(logo.position.x)
      conferirOrdem(r, 'acento-moldura')
      expect(r.diagnostico.arquetipo!.elementosMaterializados).toEqual(['moldura'])
      expect(problemasDosVetores(r.layers)).toEqual([])
    }, 60_000)
  }
})

describe('T1b · centro-óptico: o spark acima da manchete, na cor do destaque', () => {
  for (const formato of FORMATOS) {
    it(`${formato}: com destaque de cor na marca, o spark é desse destaque, centrado na manchete real e acima dela`, async () => {
      await montar({ id: `t1b-centro-${formato}`, assinatura: { ...ASSINATURA, destaque: { fill: DESTAQUE } } })
      const { r } = await compor(spec(`t1b-centro-${formato}`, [CURTA, { papel: 'apoio', linhas: ['jazz ao vivo'] }, SERVICO], { formato, arquetipo: { id: CENTRO } }))
      const h = camada(r, 'headline')!
      const s = camada(r, 'acento-spark')!
      expect(Math.abs(s.position.x + s.size.width / 2 - (h.position.x + h.size.width / 2))).toBeLessThanOrEqual(1)
      expect(fundo(s)).toBeLessThan(h.position.y)
      expect(s.size.width).toBe(s.size.height) // quadrado em px nos dois formatos (a caixa do catálogo)
      expect(s.style).toMatchObject({ shapeType: 'svg-path', fill: 'rgba(228, 87, 46, 1)', manterProporcao: true })
      expect(r.diagnostico.arquetipo!.acentos![0]).toMatchObject({ elemento: 'spark', cor: DESTAQUE, fonteDaCor: 'destaque-do-papel' })
      conferirOrdem(r, 'acento-spark')
    }, 60_000)
  }

  it('marca sem destaque de cor: o spark herda a cor da manchete, e a fonte da cor diz isso', async () => {
    await montar({ id: 't1b-centro-sem' })
    const { r } = await compor(spec('t1b-centro-sem', [CURTA, { papel: 'apoio', linhas: ['jazz ao vivo'] }, SERVICO], { arquetipo: { id: CENTRO } }))
    expect(camada(r, 'acento-spark')!.style?.fill).toBe(CLARO_CANONICO)
    expect(r.diagnostico.arquetipo!.acentos![0].fonteDaCor).toMatch(/texto-do-papel \(a marca não tem destaque de cor\)/)
  }, 60_000)
})

describe('T1b · a recomposição desenha a receita CONGELADA', () => {
  it('peça de antes do T1b (`acentosCongelados: []`): continua sem acento — nunca ganha o fio do catálogo de hoje', async () => {
    await montar({ id: 't1b-rec-vazia' })
    const { r } = await compor(spec('t1b-rec-vazia', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }), { acentosCongelados: [] })
    expect(camada(r, 'acento-fio')).toBeUndefined()
    expect(r.layers.some((l) => l.type === 'shape')).toBe(false)
    expect(r.diagnostico.arquetipo).toMatchObject({ elementosMaterializados: [], acentos: [] })
  }, 60_000)

  it('o desenho gravado vence o catálogo vivo (espessura 5 congelada contra 2 de hoje)', async () => {
    await montar({ id: 't1b-rec-receita' })
    const [fio] = receitasDoArquetipo(verArquetipo(TOPO)!).receitas
    const congelada = { ...fio, desenho: { ...fio.desenho, strokeWidth: 5 }, cor: CLARO, fonteDaCor: 'texto-do-papel' }
    const { r } = await compor(spec('t1b-rec-receita', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }), { acentosCongelados: [congelada] })
    expect(camada(r, 'acento-fio')!.style?.strokeWidth).toBe(5)
    expect(r.diagnostico.arquetipo!.acentos![0].desenho.strokeWidth).toBe(5)
  }, 60_000)

  it('receita de um elemento que a definição não tem: não é desenhada, e a peça diz por quê (aviso e acentosOmitidos)', async () => {
    await montar({ id: 't1b-rec-estranha' })
    const [moldura] = receitasDoArquetipo(verArquetipo(BASE)!).receitas
    const { r } = await compor(spec('t1b-rec-estranha', [HEADLINE, SERVICO], { arquetipo: { id: TOPO } }), { acentosCongelados: [{ ...moldura, cor: CLARO, fonteDaCor: 'texto-do-papel' }] })
    expect(camada(r, 'acento-moldura')).toBeUndefined()
    expect(r.diagnostico.arquetipo!.acentosOmitidos).toEqual([expect.objectContaining({ elemento: 'moldura', motivo: expect.stringMatching(/não existe/) })])
    expect(r.diagnostico.avisos.some((a) => /acento moldura/.test(a))).toBe(true)
  }, 60_000)

  it('a COR congelada vence a paleta de hoje: spark laranja gravado continua laranja depois de o destaque da marca virar verde', async () => {
    const VERDE = '#2E9E4F'
    const blocos = [CURTA, { papel: 'apoio', linhas: ['jazz ao vivo'] }, SERVICO]
    await montar({ id: 't1b-rec-cor', assinatura: { ...ASSINATURA, destaque: { fill: DESTAQUE } } })
    const { entrada } = await compor(spec('t1b-rec-cor', blocos, { arquetipo: { id: CENTRO } }))
    // O que a recomposição lê: o JSON gravado na peça, pelo mesmo leitor do replay.
    const gravados = lerAcentosGravados(JSON.parse(JSON.stringify(entrada!.fieldValues.composicao.arquetipo.acentos)))
    if ('problema' in gravados) throw new Error(gravados.problema)
    expect(gravados).toEqual([expect.objectContaining({ elemento: 'spark', cor: DESTAQUE, fonteDaCor: 'destaque-do-papel' })])

    await montar({ id: 't1b-rec-cor', assinatura: { ...ASSINATURA, destaque: { fill: VERDE } } })
    const servicoEditado = [CURTA, { papel: 'apoio', linhas: ['jazz ao vivo'] }, { papel: 'servico', linhas: ['Sex · 20h'] }]
    const replay = (await compor(spec('t1b-rec-cor', servicoEditado, { arquetipo: { id: CENTRO } }), { acentosCongelados: gravados })).r
    expect(camada(replay, 'acento-spark')!.style?.fill).toBe('rgba(228, 87, 46, 1)')
    expect(replay.diagnostico.arquetipo!.acentos![0]).toMatchObject({ cor: DESTAQUE, fonteDaCor: 'destaque-do-papel' })
    // A peça NOVA na mesma marca herda o destaque de hoje.
    const nova = (await compor(spec('t1b-rec-cor', servicoEditado, { arquetipo: { id: CENTRO } }))).r
    expect(camada(nova, 'acento-spark')!.style?.fill).toBe('rgba(46, 158, 79, 1)')
  }, 60_000)
})

describe('T1b · o medir-copy prevê o mesmo acento que o compor desenha', () => {
  function medir(formato: 'story' | 'feed', paginaId: string, blocos: Array<{ papel: string; linhas: string[] }>, id: string) {
    const pagina = cenario.atual!.paginasDeAssinatura[0]
    const assinatura = montarAssinatura({ pagina: { ...pagina, layers: pagina.layers }, formatoDaPagina: 'story', numerosDoProjeto: noPisoDe1310(ASSINATURA), logoDoProjeto: null })
    assinatura.camadasDaPagina = pagina.layers
    const v = validarSpec(spec(paginaId, blocos, { formato, arquetipo: { id } }))
    return medirCopy({ spec: v.spec!, assinatura, formato, medir: medidorCalibrado(), familias: [], fonteCarregada: () => true, combinacoesSalvas: [], arquetipo: prepararArquetipo(v.spec!) })
  }

  for (const [id, elemento, blocos] of [
    [TOPO, 'fio', [HEADLINE, APOIO, SERVICO]],
    [BASE, 'moldura', [HEADLINE, APOIO, SERVICO]],
  ] as const) {
    it(`${id} story: na posição de partida (a foto escura não move a peça), o retângulo previsto é o desenhado`, async () => {
      await montar({ id: `t1b-medir-${elemento}` })
      const m = medir('story', `t1b-medir-${elemento}`, [...blocos], id)
      const { r } = await compor(spec(`t1b-medir-${elemento}`, [...blocos], { arquetipo: { id } }))
      expect(m.cabeTudo).toBe(true)
      expect(m.arquetipo!.acentos).toMatchObject({ omitidos: [], recusas: [] })
      const desenhado = r.diagnostico.arquetipo!.acentos!.find((a) => a.elemento === elemento)!
      // A coerência vale quando o compor ficou na partida (a busca não moveu a faixa da manchete).
      expect(r.diagnostico.arquetipo!.papeis.find((p) => p.papel === 'headline')!.posicao).toEqual(m.arquetipo!.posicoes!.headline!.posicao)
      expect(m.arquetipo!.acentos.previstos).toEqual([{ elemento, tipo: desenhado.tipo, rect: desenhado.rect }])
    }, 60_000)
  }
})

/**
 * Provas visuais LOCAIS (só com PROVAS_DIR; o CI pula): os três arquétipos × story e feed, renderizados pelo
 * renderizador do Studio com foto e página sintéticas. Não substituem a aprovação visual do owner com marcas reais.
 *   PROVAS_DIR=/caminho npx vitest run src/lib/direcao-de-arte/__tests__/t1b-acentos.test.ts
 */
describe.skipIf(!process.env.PROVAS_DIR)('T1b · provas visuais locais', () => {
  const JAZZ = { papel: 'apoio', linhas: ['jazz ao vivo'] }
  for (const [id, blocos] of [
    [TOPO, [HEADLINE, APOIO, SERVICO]],
    [BASE, [HEADLINE, APOIO, SERVICO]],
    [CENTRO, [CURTA, JAZZ, SERVICO]],
  ] as const) {
    for (const formato of FORMATOS) {
      it(`${id} ${formato}`, async () => {
        const { mkdirSync, writeFileSync } = await import('node:fs')
        const { join } = await import('node:path')
        const dir = process.env.PROVAS_DIR!
        mkdirSync(dir, { recursive: true })
        await montar({ id: `t1b-prova-${id}-${formato}`, assinatura: { ...ASSINATURA, destaque: { fill: DESTAQUE } }, arial: true })
        const r = await comporPeca(spec(`t1b-prova-${id}-${formato}`, [...blocos], { formato, arquetipo: { id } }), { provar: true })
        writeFileSync(join(dir, `${id}-${formato}.png`), r.prova!)
        writeFileSync(join(dir, `${id}-${formato}.json`), JSON.stringify({ acentos: r.diagnostico.arquetipo!.acentos, omitidos: r.diagnostico.arquetipo!.acentosOmitidos ?? [], avisos: r.diagnostico.avisos }, null, 2))
        expect(r.prova!.length).toBeGreaterThan(1000)
      }, 120_000)
    }
  }
})
