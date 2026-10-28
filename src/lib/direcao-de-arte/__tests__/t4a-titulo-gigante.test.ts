/**
 * T4-A — o título gigante (MIN-10) no COMPOSITOR REAL (foto, página de assinatura e logo geradas): a escala dominante
 * faz a manchete crescer a partir do corpo da assinatura até ocupar a referência — a mesma conta no compor e no
 * medir-copy —, a identidade `id@versao` + impressão fica congelada na peça e o replay reproduz a mesma geometria. O
 * que não cabe é recusado com o código de sempre (copy nunca é cortada); o que não fica dominante, com um código próprio.
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
import { DOMINANCIA, materializarArquetipo } from '@/lib/compositor/arquetipos/materializar'
import { prepararArquetipo } from '@/lib/compositor/arquetipos/na-spec'
import { PADDING_DE_DESENHO } from '@/lib/creatives/halo/fundo-de-texto'
import { cenario, medidorCalibrado } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const GIGANTE = 'minimal-titulo-gigante'
const ASSINATURA = { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } }
const CLARO = '#F5F5F5'
const FORMATOS = ['story', 'feed'] as const
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } }
/** O corpo da manchete na página sintética (o da assinatura). */
const CORPO_DA_ASSINATURA = 90

const ARIAL = medidorCalibrado([{ fontFamily: 'Arial', fontSize: 100, lineHeight: 1, letterSpacing: 0, linhaMaisLonga: 'x'.repeat(10), width: 560 + 2 * PADDING_DE_DESENHO + 2, height: 115, linhas: 1 }])
const emArial = (l: Layer): Layer => (l.type === 'text' && l.style ? { ...l, style: { ...l.style, fontFamily: 'Arial' } } : l)

async function montar(m: { id: string; luz?: number; corpoDaManchete?: number; arial?: boolean; segundaVoz?: boolean }) {
  const foto = await fotoSintetica(() => m.luz ?? 60)
  const sintetica = paginaSintetica({
    id: m.id,
    headline: { cor: CLARO },
    apoio: { cor: CLARO },
    servico: { cor: CLARO },
    logoUrl: dataUrl(await logoSintetica('#808080')),
    fundoUrl: dataUrl(foto),
  })
  const comVoz2 = (ls: Layer[]): Layer[] => {
    if (!m.segundaVoz) return ls
    // O lockup de duas vozes da página (como no T1a): `headline2` no grupo da manchete, no mesmo corpo.
    const h = ls.find((l) => l.name === 'headline')!
    return [...ls, { ...h, id: 'headline2-pagina', name: 'headline2', content: 'Voz dois', position: { x: 92, y: h.position.y + h.size.height } }]
  }
  const layers = comVoz2(sintetica.layers)
    .map((l) => (m.corpoDaManchete && l.name === 'headline' ? { ...l, style: { ...l.style, fontSize: m.corpoDaManchete } } : l))
    .map((l) => (m.arial ? emArial(l) : l))
  const pagina = { ...sintetica, layers }
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
  cenario.atual = { ...base, ...(m.arial ? { medidor: ARIAL } : {}), projeto: { ...base.projeto, assinatura: ASSINATURA } }
  return pagina
}

const SEXTA = { papel: 'headline', linhas: ['Sexta'] }
const DUAS = { papel: 'headline', linhas: ['Noite de', 'jazz'] }
const APOIO = { papel: 'apoio', linhas: ['com a família'] }
const SERVICO = { papel: 'servico', linhas: ['Dom · 12h às 16h'] }

const spec = (pagina: string, blocos: Array<{ papel: string; linhas: string[] }>, extra: Record<string, unknown> = {}) => ({ ...specSintetica({ pagina, blocos }), ...extra })

async function compor(s: Record<string, unknown>, opcoes: Parameters<typeof comporPeca>[1] = {}): Promise<{ r: ResultadoDaComposicao; entrada: Record<string, any> | undefined }> {
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
const dominaAPeca = (rect: { width: number; height: number }, formato: 'story' | 'feed') =>
  rect.width >= DOMINANCIA.largura * CANVAS[formato].width - 0.5 || rect.height >= DOMINANCIA.altura * CANVAS[formato].height - 0.5

describe('T4-A · título gigante no compositor real', () => {
  for (const formato of FORMATOS) {
    for (const [nome, headline] of [
      ['uma palavra', SEXTA],
      ['duas linhas', DUAS],
    ] as const) {
      it(`${formato}, ${nome}: a manchete cresce além do corpo da assinatura, domina a peça e cabe na referência`, async () => {
        await montar({ id: `t4a-${formato}-${nome}` })
        const { r, entrada } = await compor(spec(`t4a-${formato}-${nome}`, [headline, APOIO, SERVICO], { formato, arquetipo: { id: GIGANTE } }))
        const h = camada(r, 'headline')
        const corpo = Number(h.style?.fontSize)
        // Bem acima da assinatura (90 px no story, × a escala do formato no feed) — não é título comum.
        expect(corpo).toBeGreaterThan(CORPO_DA_ASSINATURA * 1.8)
        const bloco = r.diagnostico.blocos.find((b) => b.papel === 'headline')!
        expect(bloco.escala).toBeGreaterThan(1.8)
        const d = r.diagnostico.arquetipo!
        const unidade = d.papeis.find((p) => p.papel === 'headline')!
        expect(dominaAPeca(unidade.posicao, formato), JSON.stringify(unidade.posicao)).toBe(true)
        // Dentro da referência (capacidade) e da zona efetiva, sem sangrar a margem.
        expect(unidade.posicao.width).toBeLessThanOrEqual(unidade.referencia.width + 1)
        expect(unidade.posicao.height).toBeLessThanOrEqual(unidade.referencia.height + 1)
        expect(h.position.x).toBeGreaterThanOrEqual(92)
        expect(h.position.x + h.size.width).toBeLessThanOrEqual(CANVAS[formato].width - 92 + 1)
        // O apoio pequeno faz contraponto na coluna da direita; a manchete fica no topo.
        expect(camada(r, 'apoio').position.x).toBeGreaterThan(CANVAS[formato].width / 2)
        expect(Number(camada(r, 'apoio').style?.fontSize)).toBeLessThan(corpo / 3)
        expect(h.position.y + h.size.height).toBeLessThan(0.4 * CANVAS[formato].height)
        // Sem acento declarado: nada de shape.
        expect(d.elementosMaterializados).toEqual([])
        expect(r.layers.some((l) => l.type === 'shape')).toBe(false)
        // A identidade congelada na peça: id, versão e impressão exatas.
        expect(entrada!.fieldValues.spec.arquetipo).toEqual({ id: GIGANTE, versao: 1, impressao: impressaoDoArquetipo(verArquetipo(GIGANTE, 1)!) })
      }, 60_000)
    }
  }

  it('o replay com a identidade gravada reproduz a mesma manchete (corpo e caixa)', async () => {
    await montar({ id: 't4a-replay' })
    const { r, entrada } = await compor(spec('t4a-replay', [SEXTA, APOIO, SERVICO], { arquetipo: { id: GIGANTE } }))
    const gravada = JSON.parse(JSON.stringify(entrada!.fieldValues.spec.arquetipo))
    const { r: replay } = await compor(spec('t4a-replay', [SEXTA, APOIO, SERVICO], { arquetipo: gravada }))
    for (const id of ['headline', 'apoio', 'servico', 'logo']) {
      expect(camada(replay, id).position, id).toEqual(camada(r, id).position)
      expect(camada(replay, id).size, id).toEqual(camada(r, id).size)
    }
    expect(camada(replay, 'headline').style?.fontSize).toBe(camada(r, 'headline').style?.fontSize)
  }, 60_000)

  it('impressão divergente é recusada antes de compor (a identidade nunca é presumida)', async () => {
    await montar({ id: 't4a-impressao' })
    const e = await recusa(compor(spec('t4a-impressao', [SEXTA, SERVICO], { arquetipo: { id: GIGANTE, versao: 1, impressao: 'arq1-00000000000000' } })))
    expect(e.code).toBe('ARQUETIPO_IMPRESSAO_DIVERGENTE')
  }, 60_000)

  it('copy que não cabe nem no piso da escada: ARQUETIPO_TEXTO_NAO_CABE com o orçamento — nada é cortado', async () => {
    await montar({ id: 't4a-longa' })
    const longa = { papel: 'headline', linhas: ['Hoje tem rodízio completo de carnes nobres'] }
    const e = await recusa(compor(spec('t4a-longa', [longa, SERVICO], { arquetipo: { id: GIGANTE } })))
    expect(e.code).toBe('ARQUETIPO_TEXTO_NAO_CABE')
    expect(JSON.stringify(e.details)).toContain('orcamento')
  }, 60_000)

  it('três linhas na manchete: ARQUETIPO_LINHAS_EXCEDIDAS (linhasMax é HARD)', async () => {
    await montar({ id: 't4a-linhas' })
    const e = await recusa(compor(spec('t4a-linhas', [{ papel: 'headline', linhas: ['Um', 'dois', 'três'] }, SERVICO], { arquetipo: { id: GIGANTE } })))
    expect(e.code).toBe('ARQUETIPO_LINHAS_EXCEDIDAS')
  }, 60_000)

  it('assinatura com corpo pequeno demais para dominar (10 px × teto 8): ARQUETIPO_ESCALA_NAO_DOMINANTE, dito — nunca título comum calado', async () => {
    await montar({ id: 't4a-miuda', corpoDaManchete: 10 })
    const e = await recusa(compor(spec('t4a-miuda', [SEXTA, SERVICO], { arquetipo: { id: GIGANTE } })))
    expect(e.code).toBe('ARQUETIPO_ESCALA_NAO_DOMINANTE')
    expect(e.message).toMatch(/escala dominante/)
    // Encurtar não resolve (a escada já está no teto): a orientação não manda reescrever a copy.
    expect(e.message).not.toMatch(/encurte o texto/)
    expect(e.message).toMatch(/outro arquétipo ou outra assinatura/)
  }, 60_000)
})

describe('T4-A · o medir-copy prevê o que o compor desenha', () => {
  function medir(formato: 'story' | 'feed', paginaId: string, blocos: Array<{ papel: string; linhas: string[] }>) {
    const pagina = cenario.atual!.paginasDeAssinatura[0]
    const assinatura = montarAssinatura({ pagina: { ...pagina, layers: pagina.layers }, formatoDaPagina: 'story', numerosDoProjeto: ASSINATURA, logoDoProjeto: null })
    assinatura.camadasDaPagina = pagina.layers
    const v = validarSpec(spec(paginaId, blocos, { formato, arquetipo: { id: GIGANTE } }))
    return medirCopy({ spec: v.spec!, assinatura, formato, medir: medidorCalibrado(), familias: [], fonteCarregada: () => true, combinacoesSalvas: [], arquetipo: prepararArquetipo(v.spec!) })
  }

  for (const formato of FORMATOS) {
    it(`${formato}: cabe, com a mesma escala e a mesma caixa da manchete que o compor dá na partida`, async () => {
      await montar({ id: `t4a-medir-${formato}` })
      const blocos = [DUAS, APOIO, SERVICO]
      const m = medir(formato, `t4a-medir-${formato}`, blocos)
      const { r } = await compor(spec(`t4a-medir-${formato}`, blocos, { formato, arquetipo: { id: GIGANTE } }))
      expect(m.cabeTudo).toBe(true)
      expect(m.arquetipo).toMatchObject({ id: GIGANTE, versao: 1, impressao: impressaoDoArquetipo(verArquetipo(GIGANTE, 1)!), formato })
      // O CORPO absoluto e a caixa: o rótulo relativo `escala` depende da escala do formato de cada assinatura, e este
      // harness monta a do medir-copy à mão (montarAssinatura, 0,875 no feed) enquanto o compor resolve a dele.
      const headlineMedida = m.blocos.find((b) => b.papel === 'headline')!
      expect(headlineMedida.fontSize).toBe(Number(camada(r, 'headline').style?.fontSize))
      expect({ width: headlineMedida.width, height: headlineMedida.height }).toEqual(camada(r, 'headline').size)
      expect(r.diagnostico.arquetipo!.papeis.find((p) => p.papel === 'headline')!.posicao).toEqual(m.arquetipo!.posicoes!.headline!.posicao)
    }, 60_000)
  }

  it('a assinatura miúda: o medir-copy diz não-cabe pelo mesmo motivo do compor', async () => {
    await montar({ id: 't4a-medir-miuda', corpoDaManchete: 10 })
    const m = medir('story', 't4a-medir-miuda', [SEXTA, SERVICO])
    expect(m.cabeTudo).toBe(false)
    expect(m.avisos.some((a) => /escala dominante/.test(a))).toBe(true)
    expect(m.blocos.find((b) => b.papel === 'headline')!.situacao).toBe('nao-cabe')
  }, 60_000)
})

describe('T4-A · a recusa da dominância é da materialização (pura, a mesma no compor e no medir-copy)', () => {
  const a = verArquetipo(GIGANTE, 1)!
  const geometria = { margemH: 92, safeTopo: 188, safeRodape: 224 }
  const base = { arquetipo: a, formato: 'story' as const, canvas: CANVAS.story, geometria, logo: null }
  it('abaixo de 80% da largura E de 22% da altura: recusa; basta um dos dois para dominar', () => {
    const miuda = materializarArquetipo({ ...base, medidas: { headline: { width: 400, height: 200 } } })
    expect('problemas' in miuda && miuda.problemas.map((p) => p.codigo)).toEqual(['ARQUETIPO_ESCALA_NAO_DOMINANTE'])
    expect(materializarArquetipo({ ...base, medidas: { headline: { width: 870, height: 200 } } }).ok).toBe(true)
    expect(materializarArquetipo({ ...base, medidas: { headline: { width: 400, height: 430 } } }).ok).toBe(true)
  })
  it('os arquétipos sem escala dominante não conferem dominância (a mesma caixa miúda passa no topo-esquerda)', () => {
    const topo = verArquetipo('minimal-fb-topo-esquerda', 1)!
    expect(materializarArquetipo({ ...base, arquetipo: topo, medidas: { headline: { width: 400, height: 200 } } }).ok).toBe(true)
  })
})

/**
 * Provas visuais LOCAIS (só com PROVAS_DIR; o CI pula): o título gigante × story e feed, renderizado pelo renderizador
 * do Studio com foto e página sintéticas. Não substitui a aprovação visual do owner com marcas reais.
 *   PROVAS_DIR=/caminho npx vitest run src/lib/direcao-de-arte/__tests__/t4a-titulo-gigante.test.ts
 */
describe.skipIf(!process.env.PROVAS_DIR)('T4-A · provas visuais locais', () => {
  for (const [nome, headline, apoio] of [
    ['sexta', SEXTA, APOIO],
    ['noite-de-jazz', DUAS, APOIO],
    // Rodada 1: o apoio de duas linhas desiguais, alinhado à direita.
    ['apoio-duas-linhas', SEXTA, { papel: 'apoio', linhas: ['com a família', 'e os amigos de sempre'] }],
  ] as Array<[string, { papel: string; linhas: string[] }, { papel: string; linhas: string[] }]>) {
    for (const formato of FORMATOS) {
      it(`${nome} ${formato}`, async () => {
        const { mkdirSync, writeFileSync } = await import('node:fs')
        const { join } = await import('node:path')
        const dir = process.env.PROVAS_DIR!
        mkdirSync(dir, { recursive: true })
        await montar({ id: `t4a-prova-${nome}-${formato}`, arial: true })
        const r = await comporPeca(spec(`t4a-prova-${nome}-${formato}`, [headline, apoio, SERVICO], { formato, arquetipo: { id: GIGANTE } }), { provar: true })
        writeFileSync(join(dir, `${GIGANTE}-${nome}-${formato}.png`), r.prova!)
        const h = r.layers.find((l) => l.id === 'headline')!
        const ap = r.layers.find((l) => l.id === 'apoio')!
        writeFileSync(
          join(dir, `${GIGANTE}-${nome}-${formato}.json`),
          JSON.stringify(
            {
              headline: { fontSize: h.style?.fontSize, position: h.position, size: h.size, textAlign: h.style?.textAlign },
              apoio: { content: ap.content, position: ap.position, size: ap.size, textAlign: ap.style?.textAlign },
              arquetipo: r.diagnostico.arquetipo,
              avisos: r.diagnostico.avisos,
            },
            null,
            2,
          ),
        )
        expect(r.prova!.length).toBeGreaterThan(1000)
      }, 120_000)
    }
  }
})

/**
 * Rodada 1 (revisão Codex): a escada da UNIDADE do dominante não pode pular tetos que ainda reduziriam um bloco dela.
 * Manchete "O" (sobe até 4,8×) + segunda voz de 24 caracteres declarada no contrato (só cabe no piso, 0,8×): com o teto
 * em 8 a pilha passa da referência; descer o teto encolhe a primeira voz e a unidade cabe (teto ≈ 4).
 */
const VOZ2_LONGA = 'ABCDEFGHIJKLMNOPQRSTUVWX'
const COPY_AUTORAL = {
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat', em: '2026-10-24T09:00:00.000Z' },
  revisoes: [],
  blocos: [
    { id: 'h', funcao: 'headline', ordem: 0, linhas: ['O', VOZ2_LONGA], estilo: { linhasNaVoz2: [1] } },
    { id: 's', funcao: 'servico', ordem: 1, linhas: ['Dom · 12h às 16h'] },
  ],
}
/** Só o contrato: os blocos saem dele (a voz 2 declarada na linha 1). */
const comVoz2Declarada = (pagina: string) => {
  const { blocos: _b, ...semBlocos } = spec(pagina, [], { arquetipo: { id: GIGANTE }, copyAutoral: COPY_AUTORAL })
  return semBlocos
}

describe('T4-A rodada 1 · a escada da unidade dominante com segunda voz', () => {
  it('compor: a unidade cabe descendo a primeira voz; a segunda voz fica inteira, sem corte nem fusão; domina a peça', async () => {
    await montar({ id: 't4a-voz2', segundaVoz: true })
    const { r, entrada } = await compor(comVoz2Declarada('t4a-voz2'))
    const h1 = camada(r, 'headline')
    const h2 = camada(r, 'headline2')
    expect(h1.content).toBe('O')
    expect(h2.content).toBe(VOZ2_LONGA)
    const escala = (id: string) => r.diagnostico.blocos.find((b) => b.id === id)!.escala
    expect(escala('headline')).toBeLessThan(4.8)
    expect(escala('headline')).toBeGreaterThan(3)
    expect(escala('headline2')).toBe(0.8)
    const unidade = r.diagnostico.arquetipo!.papeis.find((p) => p.papel === 'headline')!
    expect(unidade.posicao.height).toBeLessThanOrEqual(unidade.referencia.height)
    expect(dominaAPeca(unidade.posicao, 'story')).toBe(true)
    expect(h2.position.y).toBe(h1.position.y + h1.size.height)
    // Replay com a identidade gravada: as mesmas vozes, o mesmo corpo, a mesma caixa.
    const gravada = JSON.parse(JSON.stringify(entrada!.fieldValues.spec.arquetipo))
    const { r: replay } = await compor({ ...comVoz2Declarada('t4a-voz2'), arquetipo: gravada })
    for (const id of ['headline', 'headline2']) {
      expect(camada(replay, id).content, id).toBe(camada(r, id).content)
      expect(camada(replay, id).style?.fontSize, id).toBe(camada(r, id).style?.fontSize)
      expect({ ...camada(replay, id).position, ...camada(replay, id).size }, id).toEqual({ ...camada(r, id).position, ...camada(r, id).size })
    }
  }, 60_000)

  it('medir-copy: cabe, com o mesmo corpo de cada voz que o compor dá', async () => {
    const pagina = await montar({ id: 't4a-voz2-medir', segundaVoz: true })
    const assinatura = montarAssinatura({ pagina, formatoDaPagina: 'story', numerosDoProjeto: ASSINATURA, logoDoProjeto: null })
    assinatura.camadasDaPagina = pagina.layers
    const v = validarSpec(comVoz2Declarada('t4a-voz2-medir'))
    expect(v.problemas).toEqual([])
    const m = medirCopy({ spec: v.spec!, assinatura, formato: 'story', medir: medidorCalibrado(), familias: [], fonteCarregada: () => true, combinacoesSalvas: [], arquetipo: prepararArquetipo(v.spec!) })
    const { r } = await compor(comVoz2Declarada('t4a-voz2-medir'))
    expect(m.cabeTudo).toBe(true)
    for (const id of ['headline', 'headline2']) expect(m.blocos.find((b) => b.id === id)!.fontSize, id).toBe(Number(camada(r, id).style?.fontSize))
  }, 60_000)
})

/** Rodada 1 (revisão Codex): o apoio do título gigante é ALINHADO à direita — a borda direita da tinta, não só a coluna. */
describe('T4-A rodada 1 · apoio alinhado à direita', () => {
  const APOIO_DESIGUAL = { papel: 'apoio', linhas: ['com a família', 'e os amigos de sempre'] }
  for (const formato of FORMATOS) {
    it(`${formato}: textAlign right, a caixa rente à borda direita da referência; manchete e serviço seguem à esquerda`, async () => {
      await montar({ id: `t4a-apoio-${formato}` })
      const blocos = [SEXTA, APOIO_DESIGUAL, SERVICO]
      const { r, entrada } = await compor(spec(`t4a-apoio-${formato}`, blocos, { formato, arquetipo: { id: GIGANTE } }))
      const apoio = camada(r, 'apoio')
      const ref = r.diagnostico.arquetipo!.papeis.find((p) => p.papel === 'apoio')!
      expect(apoio.content).toBe('com a família\ne os amigos de sempre')
      expect(apoio.style?.textAlign).toBe('right')
      expect(Math.abs(apoio.position.x + apoio.size.width - (ref.referencia.x + ref.referencia.width))).toBeLessThanOrEqual(1)
      expect(Math.abs(ref.posicao.x + ref.posicao.width - (ref.referencia.x + ref.referencia.width))).toBeLessThanOrEqual(1)
      expect(camada(r, 'headline').style?.textAlign).toBe('left')
      expect(camada(r, 'headline').position.x).toBe(92)
      expect(camada(r, 'servico').style?.textAlign).toBe('left')
      expect(camada(r, 'servico').position.x).toBe(92)
      // medir-copy prevê a mesma caixa do apoio; replay reproduz.
      const pagina = cenario.atual!.paginasDeAssinatura[0]
      const assinatura = montarAssinatura({ pagina, formatoDaPagina: 'story', numerosDoProjeto: ASSINATURA, logoDoProjeto: null })
      assinatura.camadasDaPagina = pagina.layers
      const v = validarSpec(spec(`t4a-apoio-${formato}`, blocos, { formato, arquetipo: { id: GIGANTE } }))
      const m = medirCopy({ spec: v.spec!, assinatura, formato, medir: medidorCalibrado(), familias: [], fonteCarregada: () => true, combinacoesSalvas: [], arquetipo: prepararArquetipo(v.spec!) })
      expect(m.arquetipo!.posicoes!.apoio!.posicao).toEqual(ref.posicao)
      const { r: replay } = await compor(spec(`t4a-apoio-${formato}`, blocos, { formato, arquetipo: JSON.parse(JSON.stringify(entrada!.fieldValues.spec.arquetipo)) }))
      expect({ ...camada(replay, 'apoio').position, align: camada(replay, 'apoio').style?.textAlign }).toEqual({ ...apoio.position, align: 'right' })
    }, 60_000)
  }
})
