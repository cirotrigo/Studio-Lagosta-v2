/**
 * T4-E — o arquétipo SEM FOTO (`fundo: 'liso-claro'`, família E) no COMPOSITOR REAL: o fundo efetivo é o claro da
 * marca e é o MESMO no que o compor desenha (prova PNG), mede (contraste), devolve, persiste e no que o medir-copy
 * diz; a marca sem fundo claro e a spec com foto são recusadas (nunca o fundo escuro nem a foto descartada em
 * silêncio); o contrato da copy (ids, ordem, 3 linhas autorais de um bloco) atravessa inteiro; o replay reproduz.
 * O arquétipo é uma FIXTURE de teste injetada no catálogo — o #15 não é publicado nesta fase.
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
vi.mock('@/lib/compositor/arquetipos/catalogo', async (original) =>
  (await import('@/lib/compositor/arquetipos/__tests__/suporte/arquetipo-sem-foto')).catalogoComAFixture(original as never),
)

import sharp from 'sharp'
import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { medirCopyDoProjeto } from '@/lib/compositor/medir-copy-service'
import { fundoDaPeca, LUMINANCIA_MINIMA_DO_CLARO } from '@/lib/compositor/arquetipos/fundo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { listarArquetipos as publicadosDeVerdade } from '@/lib/compositor/arquetipos/catalogo'
import { validarArquetipo } from '@/lib/compositor/arquetipos/validar'
import { ARQUETIPO_SEM_FOTO, ID_SEM_FOTO } from '@/lib/compositor/arquetipos/__tests__/suporte/arquetipo-sem-foto'
import type { ArquetipoDeLayout } from '@/lib/compositor/arquetipos/tipos'
import type { Layer } from '@/types/template'
import { PADDING_DE_DESENHO } from '@/lib/creatives/halo/fundo-de-texto'
import { cenario, medidorCalibrado } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura } from './suporte/sinteticos'

const CLARO = '#F4EFE6'
const TINTA = '#1F1F1F'
const FORMATOS = ['story', 'feed'] as const
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } }
/** As provas PNG medem como o renderizador desenha: Arial com a calibragem da T4-A (o medidor sintético usa 0,5 do corpo por caractere e a Montserrat real é mais larga — "Qua · Moqueca" quebrava só no PNG). */
const ARIAL = medidorCalibrado([{ fontFamily: 'Arial', fontSize: 100, lineHeight: 1, letterSpacing: 0, linhaMaisLonga: 'x'.repeat(10), width: 560 + 2 * PADDING_DE_DESENHO + 2, height: 115, linhas: 1 }])
const emArial = (l: Layer): Layer => (l.type === 'text' && l.style ? { ...l, style: { ...l.style, fontFamily: 'Arial' } } : l)

async function montar(m: { id: string; numeros?: Record<string, unknown>; tinta?: string; arial?: boolean }) {
  const foto = await fotoSintetica(() => 60)
  const pagina = paginaSintetica({
    id: m.id,
    headline: { cor: m.tinta ?? TINTA },
    apoio: { cor: m.tinta ?? TINTA },
    servico: { cor: m.tinta ?? TINTA },
    logoUrl: dataUrl(await logoSintetica('#808080')),
    fundoUrl: dataUrl(foto),
  })
  const final = m.arial ? { ...pagina, layers: pagina.layers.map(emArial) } : pagina
  const base = await cenarioSintetico({ pagina: final, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
  cenario.atual = { ...base, ...(m.arial ? { medidor: ARIAL } : {}), projeto: { ...base.projeto, assinatura: m.numeros ?? { fundoClaro: CLARO } } }
  return final
}

/** A copy da lista: UM bloco de 3 linhas autorais (o contrato já representa; nenhum papel "item" inventado). */
const COPY = {
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat', em: '2026-10-24T09:00:00.000Z' },
  revisoes: [],
  blocos: [
    { id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Nesta', 'semana'] },
    { id: 'lista', funcao: 'apoio', ordem: 1, linhas: ['Ter · Feijoada', 'Qua · Moqueca', 'Sex · Rodízio'] },
    { id: 'rodape', funcao: 'servico', ordem: 2, linhas: ['Seg a sáb · 11h às 15h'] },
  ],
}

/** Spec SEM foto (o `specSintetica` traz uma; o E não leva). */
function specE(pagina: string, extra: Record<string, unknown> = {}) {
  const { foto: _foto, blocos: _blocos, ...base } = specSintetica({ pagina, blocos: [] })
  return { ...base, arquetipo: { id: ID_SEM_FOTO }, copyAutoral: COPY, ...extra }
}

async function compor(s: Record<string, unknown>, opcoes: Parameters<typeof comporPeca>[1] = {}) {
  const antes = cap.entradas.length
  const r = await comporPeca(s, { autor: 'u-fixture', ...opcoes })
  return { r, entrada: cap.entradas.length > antes ? cap.entradas.at(-1) : undefined }
}

async function recusa(promessa: Promise<unknown>): Promise<{ code: string; message: string; details?: Record<string, any> }> {
  try {
    await promessa
  } catch (e) {
    return e as { code: string; message: string; details?: Record<string, any> }
  }
  throw new Error('esperava recusa')
}

const camada = (r: ResultadoDaComposicao, id: string) => r.layers.find((l) => l.id === id)!

describe('T4-E · contrato do fundo no arquétipo', () => {
  it('a fixture E é válida; os publicados não declaram fundo (impressões e JSON intocados pelo campo novo)', () => {
    expect(validarArquetipo(ARQUETIPO_SEM_FOTO)).toEqual([])
    const reais = publicadosDeVerdade().filter((a) => a.id !== ID_SEM_FOTO)
    // 11 versões publicadas: as 6 do T0–#16, o #16@2 (C2), também `liso-claro`, o #8@1 (`foto-em-caixa`, 24/10), o #4@1 e o #5@1
    // (foto, 24/10), o #9@1 (`foto-em-caixa`, H9 25/10) e os 2 do #10 (`foto-em-caixa`, IH 25/10) → 13.
    expect(reais).toHaveLength(13)
    expect(reais.filter((a) => a.id === 'minimal-tipografico-convite').map((a) => [a.versao, a.fundo])).toEqual([[1, 'liso-claro'], [2, 'liso-claro']])
    // Os 4 com foto não declaram o campo; o #15 e o #16 (24/10) são os `liso-claro` publicados; o #8 e o #9 (H9), os `foto-em-caixa`.
    const semFoto = ['minimal-tipografico-convite', 'minimal-tipografico-lista']
    const emCaixa = ['minimal-divisao-foto-topo', 'minimal-divisao-cor-topo-arco', 'minimal-coluna-foto', 'minimal-coluna-foto-esquerda']
    for (const id of emCaixa) expect(reais.find((a) => a.id === id)?.fundo).toBe('foto-em-caixa')
    expect(reais.filter((a) => !semFoto.includes(a.id) && !emCaixa.includes(a.id)).every((a) => !('fundo' in a))).toBe(true)
    for (const id of semFoto) expect(reais.find((a) => a.id === id)?.fundo).toBe('liso-claro')
  })

  it('incoerências do E são recusadas: foto ideal, logo automática, canto auto, fundo fora do vocabulário', () => {
    const com = (extra: Partial<ArquetipoDeLayout>) => validarArquetipo({ ...ARQUETIPO_SEM_FOTO, ...extra } as ArquetipoDeLayout).map((p) => `${p.codigo} ${p.campo}`)
    expect(com({ fotoIdeal: { areaCalma: 'topo', assunto: ['meio'], descricao: 'x', referencias: [] } })).toContain('PREFERENCIA_INCOERENTE fotoIdeal')
    expect(com({ preferencias: { ...ARQUETIPO_SEM_FOTO.preferencias, cantoDaMarca: 'auto' } })).toContain('PREFERENCIA_INCOERENTE preferencias.cantoDaMarca')
    const auto = JSON.parse(JSON.stringify(ARQUETIPO_SEM_FOTO))
    auto.formatos.story.papeis.logo = { automatica: 'canto-mais-calmo' }
    auto.preferencias.cantoDaMarca = 'auto'
    expect(validarArquetipo(auto).map((p) => `${p.codigo} ${p.campo}`)).toContain('PREFERENCIA_INCOERENTE formatos.story.papeis.logo')
    expect(com({ fundo: 'liso-escuro' as never })).toContain('CAMPO_INVALIDO fundo')
  })

  it('fundoDaPeca: sem arquétipo e com arquétipo de foto, o fundo de sempre; E exige um claro de verdade', () => {
    const numeros = { fundo: '#0B0B0B', fundoClaro: CLARO }
    // IH #10: o [0] passa a ser o #10 (`minimal-coluna-foto`, também `foto-em-caixa`, como o #9 era): o fundo de sempre.
    const foto = publicadosDeVerdade()[0]
    expect(fundoDaPeca(null, numeros)).toBe('#0B0B0B')
    expect(fundoDaPeca(foto, numeros)).toBe('#0B0B0B')
    expect(fundoDaPeca(ARQUETIPO_SEM_FOTO, numeros)).toBe(CLARO)
    for (const ruim of [undefined, '#333333', 'creme', '#GGGGGG']) {
      const e = (() => {
        try {
          fundoDaPeca(ARQUETIPO_SEM_FOTO, { fundo: '#0B0B0B', fundoClaro: ruim })
        } catch (x) {
          return x as { code: string; status: number }
        }
      })()
      expect([e?.code, e?.status], String(ruim)).toEqual(['ARQUETIPO_FUNDO_INDISPONIVEL', 422])
    }
    expect(LUMINANCIA_MINIMA_DO_CLARO).toBe(0.5)
  })
})

describe('T4-E · sem foto no compositor real', () => {
  for (const formato of FORMATOS) {
    it(`${formato}: sem camada de foto; fundo claro igual no resultado, na prova, na persistência e no medir-copy`, async () => {
      await montar({ id: `t4e-${formato}` })
      const { r, entrada } = await compor(specE(`t4e-${formato}`, { formato }))
      expect(r.layers.some((l) => l.id === 'bg-foto' || l.type === 'image')).toBe(false)
      expect(r.fundo).toBe(CLARO)
      // Persistência: a página nasce com o fundo efetivo (o que o GET e o editor reabrem).
      expect(entrada!.background).toBe(CLARO)
      // A copy da lista: o bloco de 3 linhas inteiro, ids e ordem do contrato, nada fundido nem cortado.
      expect(camada(r, 'apoio').content).toBe('Ter · Feijoada\nQua · Moqueca\nSex · Rodízio')
      expect(camada(r, 'headline').content).toBe('Nesta\nsemana')
      const efetiva = entrada!.copyAutoral as { blocos: Array<{ id: string; ordem: number; linhas: string[] }> }
      expect(efetiva.blocos.map((b) => [b.id, b.ordem, b.linhas])).toEqual(COPY.blocos.map((b) => [b.id, b.ordem, b.linhas]))
      // Identidade congelada.
      expect(entrada!.fieldValues.spec.arquetipo).toEqual({ id: ID_SEM_FOTO, versao: 1, impressao: impressaoDoArquetipo(ARQUETIPO_SEM_FOTO) })
      // A prova desenha o MESMO fundo: um pixel de canto, longe de texto e logo.
      const { r: prova } = await compor(specE(`t4e-${formato}`, { formato }), { provar: true })
      const { data } = await sharp(prova.prova!).extract({ left: 20, top: 20, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
      expect(`#${[...data.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()).toBe(CLARO)
      expect(prova.fundo).toBe(CLARO)
      // O medir-copy diz o mesmo fundo (uma conta só).
      const medicao = await medirCopyDoProjeto({ projectId: 9002, formato, variante: `t4e-${formato}`, copyAutoral: COPY, arquetipo: { id: ID_SEM_FOTO } } as never)
      expect(medicao.fundo).toBe(CLARO)
      expect(camada(r, 'headline').position.y + camada(r, 'headline').size.height).toBeLessThan(0.4 * CANVAS[formato].height)
    }, 60_000)
  }

  it('o replay com a identidade gravada reproduz a mesma geometria e o mesmo fundo', async () => {
    await montar({ id: 't4e-replay' })
    const { r, entrada } = await compor(specE('t4e-replay'))
    const gravada = JSON.parse(JSON.stringify(entrada!.fieldValues.spec.arquetipo))
    const { r: replay, entrada: e2 } = await compor(specE('t4e-replay', { arquetipo: gravada }))
    for (const id of ['headline', 'apoio', 'servico', 'logo']) {
      expect({ ...camada(replay, id).position, ...camada(replay, id).size }, id).toEqual({ ...camada(r, id).position, ...camada(r, id).size })
    }
    expect(e2!.background).toBe(CLARO)
  }, 60_000)

  it('marca SEM fundo claro: ARQUETIPO_FUNDO_INDISPONIVEL no compor e no medir-copy, nada persistido', async () => {
    await montar({ id: 't4e-sem-claro', numeros: {} })
    const antes = cap.entradas.length
    const e = await recusa(compor(specE('t4e-sem-claro')))
    expect([e.code, e.details?.fundoClaro]).toEqual(['ARQUETIPO_FUNDO_INDISPONIVEL', null])
    expect(cap.entradas.length).toBe(antes)
    const m = await recusa(medirCopyDoProjeto({ projectId: 9002, formato: 'story', variante: 't4e-sem-claro', copyAutoral: COPY, arquetipo: { id: ID_SEM_FOTO } } as never))
    expect(m.code).toBe('ARQUETIPO_FUNDO_INDISPONIVEL')
  }, 60_000)

  it('spec E com foto: ARQUETIPO_FOTO_NAO_SUPORTADA antes de compor (a foto nunca é descartada calada)', async () => {
    await montar({ id: 't4e-com-foto' })
    const e = await recusa(compor(specE('t4e-com-foto', { foto: { driveFileId: 'foto-sintetica' } })))
    expect(e.code).toBe('ARQUETIPO_FOTO_NAO_SUPORTADA')
  }, 60_000)

  it('ramo A intacto: o topo-esquerda com foto segue com a foto e o fundo de sempre', async () => {
    // Tinta clara sobre a foto escura da fixture, como nos testes do T1a/T4-A.
    await montar({ id: 't4e-ramo-a', tinta: '#F5F5F5' })
    const comFoto = { ...specSintetica({ pagina: 't4e-ramo-a', blocos: [{ papel: 'headline', linhas: ['Nesta semana'] }, { papel: 'servico', linhas: ['Seg a sáb · 11h às 15h'] }] }), arquetipo: { id: 'minimal-fb-topo-esquerda' } }
    const { r, entrada } = await compor(comFoto)
    expect(r.layers.some((l) => l.id === 'bg-foto')).toBe(true)
    expect(r.fundo).toBe('#0B0B0B')
    expect(entrada!.background).toBe('#0B0B0B')
  }, 60_000)
})

/**
 * Provas visuais LOCAIS (só com PROVAS_DIR; o CI pula): a fixture E × story e feed, pelo renderizador do Studio, com
 * página sintética. Não é o #15 nem aceite visual do owner.
 *   PROVAS_DIR=/caminho npx vitest run src/lib/direcao-de-arte/__tests__/t4e-sem-foto.test.ts
 */
describe.skipIf(!process.env.PROVAS_DIR)('T4-E · provas visuais locais', () => {
  for (const formato of FORMATOS) {
    it(`fixture sem foto ${formato}`, async () => {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      const dir = process.env.PROVAS_DIR!
      mkdirSync(dir, { recursive: true })
      await montar({ id: `t4e-prova-${formato}`, arial: true })
      const { r } = await compor(specE(`t4e-prova-${formato}`, { formato }), { provar: true })
      writeFileSync(join(dir, `t4e-fixture-sem-foto-${formato}.png`), r.prova!)
      writeFileSync(
        join(dir, `t4e-fixture-sem-foto-${formato}.json`),
        JSON.stringify({ formato, fundo: r.fundo, camadas: r.layers.map((l) => ({ id: l.id, type: l.type, position: l.position, size: l.size, content: l.content, fill: (l.style as any)?.color ?? (l.style as any)?.fill })) }, null, 2),
      )
    }, 60_000)
  }
})
