/**
 * #4 `minimal-fb-base-centro@1` (24/10/2026) — o contrato, o validador (eixo, metade de cima, logo fixa, âncora), a
 * geometria em px contra o cálculo puro do preflight (`cp-t4-a-4-preflight/evidencias/geometria-4.txt`), a logo FIXA em
 * contain centrada, as duas faixas e os intervalos de `dy`, os papéis recusados no `@1` e a spec. Puro: sem banco, sem
 * render, sem medidor.
 */
import { describe, expect, it } from 'vitest'
import { CreativeError } from '@/lib/creatives/errors'
import { validarSpec } from '../../spec'
import { listarArquetipos, verArquetipo } from '../catalogo'
import { candidatosDasFaixas, faixasDoArquetipo } from '../candidatos-espaciais'
import { impressaoDoArquetipo } from '../impressao'
import { materializarArquetipo, referenciaDoPapel, type RetanguloPx } from '../materializar'
import { conferirPapeis, conferirPreferencias, excessosDeLinhas, vitrineDeArquetipos } from '../na-spec'
import type { ArquetipoDeLayout, FormatoDoArquetipo } from '../tipos'
import { areaSeguraPadrao, validarArquetipo, validarCatalogo } from '../validar'

const ID = 'minimal-fb-base-centro'
const IMPRESSAO = 'arq1-15c914b2112ca8'
const def = () => verArquetipo(ID, 1)!
const copia = (): any => JSON.parse(JSON.stringify(def()))
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } } as const
const problemas = (a: unknown) => validarArquetipo(a as ArquetipoDeLayout).map((p) => `${p.codigo} ${p.campo}`)
const geometria = (f: FormatoDoArquetipo) => {
  const { margemH, safeTopo, safeRodape } = areaSeguraPadrao(f)
  return { margemH, safeTopo, safeRodape }
}

function recusa(f: () => unknown): CreativeError {
  try {
    f()
  } catch (e) {
    expect(e).toBeInstanceOf(CreativeError)
    return e as CreativeError
  }
  throw new Error('não recusou')
}

describe('#4 · contrato e catálogo (G-K2, G-K3)', () => {
  it('o @1 está publicado e válido, com a impressão fixada; sem versão → @1; MIN-01, foto inteira, sem elementos', () => {
    const a = def()
    expect(validarCatalogo(listarArquetipos())).toEqual([])
    expect(validarArquetipo(a)).toEqual([])
    expect(impressaoDoArquetipo(a)).toBe(IMPRESSAO)
    expect(verArquetipo(ID)!.versao).toBe(1)
    expect([a.id, a.versao, a.codigoTaxonomico]).toEqual([ID, 1, 'MIN-01'])
    expect('fundo' in a).toBe(false)
    expect(a.elementos).toBeUndefined()
    expect(a.papeis.map((p) => [p.papel, p.obrigatorio, p.ordemDeLeitura])).toEqual([
      ['headline', true, 0],
      ['servico', true, 1],
      ['logo', true, 2],
    ])
    expect(a.preferencias).toEqual({ ancora: 'rodape', alinha: 'centro', cantoDaMarca: 'superior-centro' })
    for (const f of ['story', 'feed'] as const) {
      expect(a.formatos[f].limitesDeTexto).toEqual({ headline: { linhasMax: 2, caracteresPorLinha: 16 }, servico: { linhasMax: 2, caracteresPorLinha: 30 } })
    }
  })

  it('a definição é congelada: mutar a cópia não muda a fonte', () => {
    const c = copia()
    c.formatos.story.papeis.logo.referencia.y = 0.5
    c.nome = 'outro'
    expect((def().formatos.story.papeis.logo as { referencia: { y: number } }).referencia.y).toBe(0.105)
    expect(impressaoDoArquetipo(def())).toBe(IMPRESSAO)
  })

  it('Story e Feed são definições próprias, no mesmo eixo e na mesma ordem; nenhuma zona passa de 30% da altura', () => {
    const a = def()
    expect(a.formatos.story).not.toEqual(a.formatos.feed)
    for (const f of ['story', 'feed'] as const) {
      for (const [papel, p] of Object.entries(a.formatos[f].papeis) as Array<[string, any]>) {
        expect(p.zona.yMax - p.zona.yMin, `${f} ${papel}`).toBeLessThanOrEqual(0.3)
        expect(Math.abs(p.referencia.x + p.referencia.w / 2 - 0.5), `${f} ${papel}`).toBeLessThan(1e-9)
      }
      const y = (papel: string) => (a.formatos[f].papeis as any)[papel].referencia.y
      expect(y('logo') < y('headline') && y('headline') < y('servico')).toBe(true)
    }
  })
})

describe('#4 · validador (G-V1–G-V4)', () => {
  it('G-V1: logo fora do eixo (referência ou zona) → PREFERENCIA_INCOERENTE', () => {
    const ref = copia()
    ref.formatos.story.papeis.logo.referencia.x = 0.45
    expect(problemas(ref)).toEqual(['PREFERENCIA_INCOERENTE formatos.story.papeis.logo.zona'])
    const zona = copia()
    zona.formatos.feed.papeis.logo.zona.xMax = 0.75
    expect(problemas(zona)).toEqual(['PREFERENCIA_INCOERENTE formatos.feed.papeis.logo.zona'])
  })

  it('G-V2: zona da logo na metade de baixo → PREFERENCIA_INCOERENTE', () => {
    const embaixo = copia()
    embaixo.formatos.story.papeis.logo = { referencia: { x: 0.41, y: 0.52, w: 0.18, h: 0.045 }, zona: { xMin: 0.3, xMax: 0.7, yMin: 0.5, yMax: 0.6 } }
    expect(problemas(embaixo)).toContain('PREFERENCIA_INCOERENTE formatos.story.papeis.logo.zona')
  })

  it('G-V3: logo automática com superior-centro, e cantoDaMarca auto com a logo fixa → PREFERENCIA_INCOERENTE', () => {
    const automatica = copia()
    automatica.formatos.story.papeis.logo = { automatica: 'canto-mais-calmo' }
    expect(problemas(automatica)).toEqual(['PREFERENCIA_INCOERENTE formatos.story.papeis.logo'])
    const auto = copia()
    auto.preferencias.cantoDaMarca = 'auto'
    expect(problemas(auto)).toEqual(['PREFERENCIA_INCOERENTE formatos.story.papeis.logo', 'PREFERENCIA_INCOERENTE formatos.feed.papeis.logo'])
  })

  it('G-V4: âncora rodapé com a zona da headline começando antes de .50 → PREFERENCIA_INCOERENTE', () => {
    const alta = copia()
    alta.formatos.feed.papeis.headline.zona.yMin = 0.45
    expect(problemas(alta)).toEqual(['PREFERENCIA_INCOERENTE formatos.feed.papeis.headline.zona'])
  })
})

describe('#4 · geometria em px (G-G1, G-G2), contra geometria-4.txt', () => {
  // [x0, y0, x1, y1] da referência e da zona efetiva (a zona recortada pelo HARD), em px.
  const TABELA = {
    story: {
      logo: { ref: [442.8, 201.6, 637.2, 288.0], zona: [324, 188.2, 756, 384.0] },
      headline: { ref: [129.6, 1267.2, 950.4, 1497.6], zona: [108, 1209.6, 972, 1516.8] },
      servico: { ref: [216, 1536, 864, 1689.6], zona: [162, 1507.2, 918, 1695.4] },
    },
    feed: {
      logo: { ref: [442.8, 141.8, 637.2, 202.5], zona: [324, 120.1, 756, 270] },
      headline: { ref: [129.6, 864, 950.4, 1026], zona: [108, 823.5, 972, 1046.2] },
      servico: { ref: [216, 1080, 864, 1188], zona: [162, 1039.5, 918, 1244.7] },
    },
  } as const
  for (const f of ['story', 'feed'] as const) {
    it(`${f}: referências e zonas efetivas (±0,5 px por número); 2 faixas [headline, servico] e [logo]`, () => {
      const a = def()
      for (const papel of ['logo', 'headline', 'servico'] as const) {
        const r = referenciaDoPapel(a, f, CANVAS[f], geometria(f), papel)!
        const px = (q: RetanguloPx) => [q.x, q.y, q.width, q.height]
        const daTabela = (t: readonly number[]) => [t[0], t[1], t[2] - t[0], t[3] - t[1]]
        px(r.referencia).forEach((v, i) => expect(Math.abs(v - daTabela(TABELA[f][papel].ref)[i]), `${papel} ref[${i}] ${v}`).toBeLessThanOrEqual(0.5))
        px(r.zonaEfetiva!).forEach((v, i) => expect(Math.abs(v - daTabela(TABELA[f][papel].zona)[i]), `${papel} zona[${i}] ${v}`).toBeLessThanOrEqual(0.5))
      }
      expect(faixasDoArquetipo(a, f)).toEqual([['headline', 'servico'], ['logo']])
    })
  }

  it('G-G3: a zona do serviço afastada da manchete vira 3 faixas → ARQUETIPO_LIMITE_DA_BUSCA (a junção é estrutural)', () => {
    const a = copia()
    a.formatos.story.papeis.servico.zona.yMin = 0.795
    expect(validarArquetipo(a)).toEqual([])
    expect(faixasDoArquetipo(a, 'story')).toEqual([['headline'], ['servico'], ['logo']])
    const m = materializarArquetipo({ arquetipo: a, formato: 'story', canvas: CANVAS.story, geometria: geometria('story'), medidas: { headline: { width: 600, height: 105.6 }, servico: { width: 400, height: 44 } }, logo: { razao: 0.41 } })
    expect(m.ok).toBe(true)
    const e = recusa(() => candidatosDasFaixas({ arquetipo: a, formato: 'story', papeis: (m as any).papeis, ornamentos: {} }))
    expect(e.code).toBe('ARQUETIPO_LIMITE_DA_BUSCA')
  })
})

describe('#4 · logo fixa centrada (G-G4) e faixa do texto (G-B4)', () => {
  // A tabela do preflight (geometria-4.txt) calcula sobre a posição em fração de px; o produto arredonda a posição ao
  // pixel antes da conta (materializar.ts), e o intervalo sai até 1 px diferente nas pontas. Fixamos o do PRODUTO e
  // conferimos que fica a ≤ 1 px da tabela.
  const INTERVALO_DA_LOGO: Record<FormatoDoArquetipo, Record<string, [number, number]>> = {
    story: { '0.25': [-32, 112], '0.41': [-16, 97], '1': [-13, 94], '2': [-13, 94] },
    feed: { '0.25': [-27, 71], '0.41': [-21, 65], '1': [-21, 65], '2': [-21, 65] },
  }
  const DA_TABELA: Record<FormatoDoArquetipo, Record<string, [number, number]>> = {
    story: { '0.25': [-31, 113], '0.41': [-16, 97], '1': [-12, 94], '2': [-12, 94] },
    feed: { '0.25': [-27, 72], '0.41': [-21, 66], '1': [-21, 66], '2': [-21, 66] },
  }
  const pertoDaTabela = (v: readonly number[], t: readonly number[]) => v.every((x, i) => Math.abs(x - t[i]) <= 1)
  for (const f of ['story', 'feed'] as const) {
    it(`${f}: contain com razões 0,25/0,41/1/2 sai com o centro em x 540, dentro da zona; o dy da faixa da logo é o da tabela`, () => {
      for (const razao of [0.25, 0.41, 1, 2]) {
        const m = materializarArquetipo({ arquetipo: def(), formato: f, canvas: CANVAS[f], geometria: geometria(f), medidas: {}, logo: { razao } })
        expect(m.ok, `${f} ${razao}`).toBe(true)
        const l = (m as any).papeis.logo
        const p = l.posicao as RetanguloPx
        expect(Math.abs(p.x + p.width / 2 - 540), `${f} ${razao}`).toBeLessThanOrEqual(0.5)
        // Nunca rente a um lado da referência quando a logo é mais estreita que ela.
        if (p.width < 194) expect(p.x > 442.8 + 1 && p.x + p.width < 637.2 - 1).toBe(true)
        const z = l.zonaEfetiva as RetanguloPx
        expect(p.x >= z.x && p.x + p.width <= z.x + z.width && p.y >= z.y && p.y + p.height <= z.y + z.height).toBe(true)
        const [faixa] = candidatosDasFaixas({ arquetipo: def(), formato: f, papeis: { logo: l }, ornamentos: {} })
        expect(faixa.membros).toEqual(['logo'])
        expect([faixa.intervalo.min, faixa.intervalo.max], `${f} ${razao}`).toEqual(INTERVALO_DA_LOGO[f][String(razao)])
        expect(pertoDaTabela(INTERVALO_DA_LOGO[f][String(razao)], DA_TABELA[f][String(razao)])).toBe(true)
        // Os candidatos ficam no eixo: só dy.
        expect(faixa.candidatos[0]).toEqual({ rotulo: 'referencia', dy: 0 })
      }
    })
  }

  it('G-B4: faixa do texto com o corpo das provas — manchete de 1 linha vai até +113 (Story) / +107 (Feed); com 2 linhas, +37 / +32 (tabela ±1)', () => {
    // [formato, altura da manchete, intervalo do produto, intervalo da tabela do preflight]
    const casos = [
      ['story', 105.6, [-28, 113], [-28, 113]],
      ['story', 211.2, [-28, 37], [-28, 36]],
      ['feed', 74.25, [-39, 107], [-40, 106]],
      ['feed', 148.5, [-39, 32], [-40, 32]],
    ] as const
    for (const [f, alturaDaManchete, esperado, tabela] of casos) {
      expect(pertoDaTabela(esperado, tabela)).toBe(true)
      const m = materializarArquetipo({ arquetipo: def(), formato: f, canvas: CANVAS[f], geometria: geometria(f), medidas: { headline: { width: 600, height: alturaDaManchete }, servico: { width: 400, height: 44 } }, logo: null })
      expect(m.ok).toBe(true)
      const [texto] = candidatosDasFaixas({ arquetipo: def(), formato: f, papeis: (m as any).papeis, ornamentos: {} })
      expect(texto.membros).toEqual(['headline', 'servico'])
      expect([texto.intervalo.min, texto.intervalo.max], `${f} ${alturaDaManchete}`).toEqual(esperado)
      // Centrado: o x da manchete e o do serviço dividem o eixo.
      expect(Math.abs((m as any).papeis.headline.posicao.x + 300 - 540)).toBeLessThanOrEqual(0.5)
      expect(Math.abs((m as any).papeis.servico.posicao.x + 200 - 540)).toBeLessThanOrEqual(0.5)
    }
  })
})

describe('#4 · papéis, linhas e spec (G-P1, G-P2, G-S1)', () => {
  const blocos = (...b: Array<[string, string[]]>) => ({ blocos: b.map(([papel, linhas]) => ({ papel, linhas })) }) as never
  const base: Array<[string, string[]]> = [
    ['headline', ['Noite de vinhos']],
    ['servico', ['Sexta · 20h']],
  ]

  it('G-P1: pre, apoio ou cta na copy → ARQUETIPO_PAPEIS_INCOMPATIVEIS com naoSuportados', () => {
    expect(() => conferirPapeis(def(), blocos(...base))).not.toThrow()
    for (const papel of ['pre', 'apoio', 'cta']) {
      const e = recusa(() => conferirPapeis(def(), blocos(...base, [papel, ['Algum texto']])))
      expect([e.code, e.status, (e.details as any).naoSuportados]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', 422, [papel]])
    }
  })

  it('G-P2: serviço ou manchete ausente → faltam; camada extra / herdaDe → extras', () => {
    expect((recusa(() => conferirPapeis(def(), blocos(['headline', ['Noite de vinhos']]))).details as any).faltam).toEqual(['servico'])
    expect((recusa(() => conferirPapeis(def(), blocos(['servico', ['Sexta · 20h']]))).details as any).faltam).toEqual(['headline'])
    const extra = recusa(() => conferirPapeis(def(), { ...(blocos(...base) as object), camadasExtras: [{ id: 'livre-1', herdaDe: 'headline' }] } as never))
    expect((extra.details as any).extras).toEqual(['livre-1'])
  })

  it('linhas: 3 linhas na manchete (voz 2 incluída) ou no serviço passam do teto 2', () => {
    for (const f of ['story', 'feed'] as const) {
      expect(excessosDeLinhas(def(), f, blocos(['headline', ['Noite', 'de vinhos']], ['servico', ['Sexta', '20h']]))).toEqual([])
      expect(excessosDeLinhas(def(), f, blocos(['headline', ['Noite', 'de', 'vinhos']], ['servico', ['Sexta']]))).toEqual([{ papel: 'headline', linhas: 3, linhasMax: 2 }])
      expect(excessosDeLinhas(def(), f, blocos(['headline', ['Noite']], ['servico', ['Sexta', '20h', 'Rua X']]))).toEqual([{ papel: 'servico', linhas: 3, linhasMax: 2 }])
    }
  })

  it('G-S1: spec com um dos 4 cantos ou nenhum → ARQUETIPO_PREFERENCIA_CONFLITANTE; auto passa; superior-centro não entra na spec pública', () => {
    for (const canto of ['inferior-esquerdo', 'inferior-direito', 'superior-esquerdo', 'superior-direito', 'nenhum']) {
      const e = recusa(() => conferirPreferencias(def(), { cantoDaMarca: canto }))
      expect([e.code, (e.details as any).conflitos]).toEqual(['ARQUETIPO_PREFERENCIA_CONFLITANTE', [{ campo: 'cantoDaMarca', pedido: canto, doArquetipo: 'superior-centro' }]])
    }
    expect(conferirPreferencias(def(), { cantoDaMarca: 'auto' })).toEqual({ coincidentes: [] })
    expect(conferirPreferencias(def(), { ancora: 'rodape', alinha: 'centro' })).toEqual({ coincidentes: ['ancora', 'alinha'] })
    expect(recusa(() => conferirPreferencias(def(), { ancora: 'topo' })).code).toBe('ARQUETIPO_PREFERENCIA_CONFLITANTE')
    const spec = (cantoDaMarca: string) => ({ projectId: 1, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Noite'] }], arquetipo: { id: ID }, preferencias: { cantoDaMarca } })
    expect(validarSpec(spec('auto')).problemas).toEqual([])
    expect(validarSpec(spec('superior-centro')).problemas.length).toBeGreaterThan(0)
  })
})

describe('#4 · vitrine (G-Y1, puro)', () => {
  it('o #4 está fora da vitrine (guardado, 25/10), mas segue no catálogo (13 versões / 12 ids) e resolvível pelo id com a mesma impressão', () => {
    const v = vitrineDeArquetipos()
    expect(v.map((a) => a.id)).not.toContain(ID)
    expect(v).toHaveLength(10) // o #3 também guardado (26/10)
    expect(listarArquetipos()).toHaveLength(13)
    expect(new Set(listarArquetipos().map((a) => a.id)).size).toBe(12)
    const a = verArquetipo(ID, 1)!
    expect(a).not.toBeNull()
    expect(impressaoDoArquetipo(a)).toBe(IMPRESSAO)
    expect(a.fundo).toBeUndefined()
    expect(a.elementos ?? []).toEqual([])
  })
})
