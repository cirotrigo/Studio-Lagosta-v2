/**
 * #10 `minimal-coluna-foto@1` (foto à direita) e `minimal-coluna-foto-esquerda@1` (foto à esquerda) — IH 25/10/2026.
 * Catálogo REAL, sem `vi.mock`: os 2 publicados (MIN-05, `foto-em-caixa`), papéis, preferências, o fio opcional, o
 * espelho FUNCIONAL (foto, zonas e a referência da logo espelhadas; textos e fio no `xMin` da coluna), o validador sem
 * problema e as recusas com controle negativo. CT-08: a coluna justa da referência de texto aprovada (A10-1, w .436)
 * contra a medida REAL de "Bastidores" a 80 px no medidor do servidor com a Montserrat do repo. CT-09: a logo de
 * referência aprovada (A10-2a, D x .086 / E x .739) arredondada cabe na zona arredondada (a conferência da faixa, ±0,5
 * px) para TODA proporção da varredura do preflight. Sem banco, sem render.
 */
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { CreativeError } from '@/lib/creatives/errors'
import { colunaDaCaixa } from '@/lib/compositor/blocos'
import { NUMEROS_PADRAO } from '../../assinatura'
import { posicionarAcentos, receitasDoArquetipo } from '../acentos'
import { listarArquetipos, verArquetipo } from '../catalogo'
import { candidatosDeArquetipo } from '../candidatos'
import { faixasDoArquetipo } from '../candidatos-espaciais'
import { caixaDaFoto } from '../fundo'
import { impressaoDoArquetipo } from '../impressao'
import { referenciaDoPapel } from '../materializar'
import { conferirLinhas, prepararArquetipo, vitrineDeArquetipos } from '../na-spec'
import { CODIGOS_TAXONOMICOS, type ArquetipoDeLayout } from '../tipos'
import { areaSeguraPadrao, validarArquetipo } from '../validar'

const D = 'minimal-coluna-foto'
const E = 'minimal-coluna-foto-esquerda'
const def = (id: string) => verArquetipo(id, 1)!
/** As impressões novas, calculadas pela IH e TRAVADAS (a mesma lista de `arquetipos.test.ts`). */
const IMPRESSAO: Record<string, string> = { [D]: 'arq1-17a4b00f7ab1d1', [E]: 'arq1-15df4b7aedca7d' }
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } } as const
const FORMATOS = ['story', 'feed'] as const
const TEXTOS = ['headline', 'apoio', 'servico'] as const

function recusa(f: () => unknown): CreativeError {
  try {
    f()
  } catch (e) {
    expect(e).toBeInstanceOf(CreativeError)
    return e as CreativeError
  }
  throw new Error('não recusou')
}
const problemas = (a: ArquetipoDeLayout) => validarArquetipo(a).map((p) => `${p.codigo} ${p.campo}`)
const mutado = (id: string, f: (a: any) => void) => {
  const a = def(id) as any
  f(a)
  return a as ArquetipoDeLayout
}
const ref = (a: ArquetipoDeLayout, f: 'story' | 'feed', papel: string) => (a.formatos[f].papeis as any)[papel].referencia as { x: number; y: number; w: number; h: number }
const zona = (a: ArquetipoDeLayout, f: 'story' | 'feed', papel: string) => (a.formatos[f].papeis as any)[papel].zona as { xMin: number; xMax: number; yMin: number; yMax: number }
const perto = (a: number, b: number) => Math.abs(a - b) < 1e-9

describe('#10 · contrato e catálogo (CT-01–CT-03)', () => {
  it('CT-01: MIN-05 em CODIGOS_TAXONOMICOS (aditivo, os 5 de antes na mesma ordem)', () => {
    expect(CODIGOS_TAXONOMICOS).toEqual(['MIN-01', 'MIN-02', 'MIN-04', 'MIN-09', 'MIN-10', 'MIN-05'])
  })

  for (const [id, canto] of [
    [D, 'superior-esquerdo'],
    [E, 'superior-direito'],
  ] as const) {
    it(`CT-02/CT-03 ${id}@1: publicado, válido, MIN-05, foto-em-caixa, papéis, preferências, o fio opcional; sem versão → @1`, () => {
      const a = def(id)
      expect([a.id, a.versao, a.codigoTaxonomico, a.fundo]).toEqual([id, 1, 'MIN-05', 'foto-em-caixa'])
      expect(verArquetipo(id)!.versao).toBe(1)
      expect(impressaoDoArquetipo(a)).toBe(IMPRESSAO[id])
      expect(validarArquetipo(a)).toEqual([])
      expect(a.papeis.map((p) => [p.papel, p.obrigatorio, p.ordemDeLeitura])).toEqual([
        ['headline', true, 0],
        ['apoio', true, 1],
        ['servico', true, 2],
        ['logo', true, 3],
      ])
      expect(a.preferencias).toEqual({ ancora: 'topo', alinha: 'esquerda', cantoDaMarca: canto })
      expect(a.elementos).toEqual([{ id: 'fio', tipo: 'fio-fino', opcional: true, corPorPapel: 'texto', presoA: 'headline' }])
      expect(a.fotoIdeal).toMatchObject({ areaCalma: 'topo', assunto: ['meio', 'base'], referencias: [id === D ? 'S050' : 'S014'] })
      for (const f of FORMATOS) expect(a.formatos[f].limitesDeTexto).toEqual({ headline: { linhasMax: 3 }, apoio: { linhasMax: 3 }, servico: { linhasMax: 2 } })
    })
  }

  it('CT-03: 13 versões / 12 ids; os 2 do #10 ordenam 1º e 2º (por id); a vitrine diz a caixa dos 4 foto-em-caixa', () => {
    const lista = listarArquetipos()
    expect([lista.length, new Set(lista.map((a) => a.id)).size]).toEqual([13, 12])
    expect(lista.slice(0, 3).map((a) => a.id)).toEqual([D, E, 'minimal-divisao-cor-topo-arco'])
    const v = vitrineDeArquetipos()
    expect(v.filter((a) => 'caixaDaFoto' in a).map((a) => a.id)).toEqual([D, E, 'minimal-divisao-cor-topo-arco', 'minimal-divisao-foto-topo'])
    expect(v.find((a) => a.id === D)).toMatchObject({ fundo: 'foto-em-caixa', disponibilidade: 'disponivel', caixaDaFoto: { story: { x: 0.575, y: 0, w: 0.425, h: 1 }, feed: { x: 0.575, y: 0, w: 0.425, h: 1 } } })
    expect(v.find((a) => a.id === E)).toMatchObject({ caixaDaFoto: { story: { x: 0, y: 0, w: 0.425, h: 1 }, feed: { x: 0, y: 0, w: 0.425, h: 1 } } })
    expect(v.filter((a) => a.id === D || a.id === E).every((a) => !('mascaraDaFoto' in a))).toBe(true)
  })

  it('a definição é congelada: mutar a cópia não muda a fonte', () => {
    const antes = impressaoDoArquetipo(def(D))
    const copia = def(D) as any
    copia.formatos.story.foto.w = 0.9
    expect(def(D).formatos.story.foto).toEqual({ x: 0.575, y: 0, w: 0.425, h: 1 })
    expect(impressaoDoArquetipo(def(D))).toBe(antes)
  })
})

describe('#10 · geometria aprovada (A10-1, A10-2a) e o espelho funcional (CT-04, CT-05)', () => {
  it('A10-1: as referências de TEXTO com w .436; zona D até .521, E de .479 até .915; textos E em x .479', () => {
    for (const f of FORMATOS) {
      for (const p of TEXTOS) {
        expect([f, p, ref(def(D), f, p).x, ref(def(D), f, p).w, zona(def(D), f, p).xMin, zona(def(D), f, p).xMax]).toEqual([f, p, 0.085, 0.436, 0.085, 0.521])
        expect([f, p, ref(def(E), f, p).x, ref(def(E), f, p).w, zona(def(E), f, p).xMin, zona(def(E), f, p).xMax]).toEqual([f, p, 0.479, 0.436, 0.479, 0.915])
      }
    }
  })

  it('A10-2a: a referência da logo D x .086 / E x .739 (w .175); Feed h .035 nos dois lados', () => {
    for (const f of FORMATOS) {
      expect([ref(def(D), f, 'logo').x, ref(def(D), f, 'logo').w, ref(def(D), f, 'logo').h]).toEqual([0.086, 0.175, 0.035])
      expect([ref(def(E), f, 'logo').x, ref(def(E), f, 'logo').w, ref(def(E), f, 'logo').h]).toEqual([0.739, 0.175, 0.035])
    }
  })

  for (const f of FORMATOS) {
    it(`CT-05 ${f}: foto, zonas e a referência da logo espelhadas (x' = 1 − x − w); textos e fio no xMin da coluna; y e h iguais`, () => {
      const a = def(D)
      const b = def(E)
      expect(a.formatos[f].foto).toEqual({ x: 0.575, y: 0, w: 0.425, h: 1 })
      expect(b.formatos[f].foto).toEqual({ x: 0, y: 0, w: 0.425, h: 1 })
      for (const p of [...TEXTOS, 'logo'] as const) {
        const za = zona(a, f, p)
        const zb = zona(b, f, p)
        expect([p, perto(zb.xMin, 1 - za.xMax), perto(zb.xMax, 1 - za.xMin), zb.yMin, zb.yMax]).toEqual([p, true, true, za.yMin, za.yMax])
        expect([p, ref(b, f, p).y, ref(b, f, p).w, ref(b, f, p).h]).toEqual([p, ref(a, f, p).y, ref(a, f, p).w, ref(a, f, p).h])
      }
      expect(perto(ref(b, f, 'logo').x, 1 - ref(a, f, 'logo').x - ref(a, f, 'logo').w)).toBe(true)
      for (const p of TEXTOS) expect([p, ref(b, f, p).x]).toEqual([p, zona(b, f, p).xMin])
      const fa = (a.formatos[f].elementos as any).fio
      const fb = (b.formatos[f].elementos as any).fio
      expect([fa.x, fb.x, fb.y, fb.w, fb.h]).toEqual([0.085, 0.479, fa.y, fa.w, fa.h])
      // 3 faixas ({logo}, {headline}, {apoio, serviço}): o teto do texto no liso; só a partida.
      for (const x of [a, b]) expect(faixasDoArquetipo(x, f)).toEqual([['headline'], ['apoio', 'servico'], ['logo']])
    })
  }

  it('CT-04: Story × Feed com o mesmo x por papel (a logo inclusive), sem ser escala; o fio entre a manchete e o apoio, fora da foto', () => {
    for (const a of [def(D), def(E)]) {
      for (const p of [...TEXTOS, 'logo'] as const) expect([a.id, p, ref(a, 'story', p).x]).toEqual([a.id, p, ref(a, 'feed', p).x])
      expect(ref(a, 'story', 'headline').h).not.toBe(ref(a, 'feed', 'headline').h)
      for (const f of FORMATOS) {
        const fio = (a.formatos[f].elementos as any).fio
        expect(fio.y).toBeGreaterThan(ref(a, f, 'headline').y + ref(a, f, 'headline').h)
        expect(fio.y + fio.h).toBeLessThan(ref(a, f, 'apoio').y)
        const foto = a.formatos[f].foto!
        expect(fio.x + fio.w <= foto.x || fio.x >= foto.x + foto.w).toBe(true)
      }
    }
  })

  it('T6 (L-05): candidatosDeArquetipo lista os 2 em 1º e 2º (a ordem por id, não ranking)', () => {
    const blocos = [
      { papel: 'headline', linhas: ['Bastidores', 'da nova', 'sessão'] },
      { papel: 'apoio', linhas: ['Luz natural e cada'] },
      { papel: 'servico', linhas: ['Ter a dom · 18h às 23h'] },
    ]
    const r = candidatosDeArquetipo({ formato: 'story', foto: { url: 'https://fotos.test/10.jpg' }, blocos } as never, { temLogo: true })
    expect(r.origem).toBe('catalogo')
    expect(r.candidatos.slice(0, 2).map((c) => [c.id, c.versao, c.compativel])).toEqual([
      [D, 1, true],
      [E, 1, true],
    ])
  })
})

describe('#10 · recusas com controle negativo (CT-07)', () => {
  const spec = (id: string, blocos: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => ({ formato: 'story', arquetipo: { id }, foto: { url: 'https://fotos.test/10.jpg' }, blocos, ...extra }) as never
  const COMPLETA = [
    { papel: 'headline', linhas: ['Bastidores', 'da nova', 'sessão'] },
    { papel: 'apoio', linhas: ['Luz natural e cada', 'prato no ponto certo'] },
    { papel: 'servico', linhas: ['Ter a dom · 18h às 23h'] },
  ]

  for (const id of [D, E]) {
    it(`${id}: a copy completa passa; pré/cta sem lugar e apoio ausente → ARQUETIPO_PAPEIS_INCOMPATIVEIS; sem foto → ARQUETIPO_FOTO_AUSENTE`, () => {
      expect(prepararArquetipo(spec(id, COMPLETA), { exigirFoto: true })!.resolvido).toMatchObject({ id, versao: 1 })
      const pre = recusa(() => prepararArquetipo(spec(id, [{ papel: 'pre', linhas: ['Hoje'] }, ...COMPLETA]), { exigirFoto: true }))
      expect([pre.code, (pre.details as any).naoSuportados]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', ['pre']])
      expect((recusa(() => prepararArquetipo(spec(id, [...COMPLETA, { papel: 'cta', linhas: ['Reserve'] }]))).details as any).naoSuportados).toEqual(['cta'])
      const semApoio = recusa(() => prepararArquetipo(spec(id, COMPLETA.filter((b) => b.papel !== 'apoio'))))
      expect([semApoio.code, (semApoio.details as any).faltam]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', ['apoio']])
      expect(recusa(() => prepararArquetipo(spec(id, COMPLETA, { foto: undefined }), { exigirFoto: true })).code).toBe('ARQUETIPO_FOTO_AUSENTE')
      // linhasMax é HARD (headline 3): 4 linhas recusam; 3 passam.
      expect(recusa(() => conferirLinhas(def(id), 'story', { blocos: [{ papel: 'headline', linhas: ['a', 'b', 'c', 'd'] }, ...COMPLETA.slice(1)] } as never)).code).toBe('ARQUETIPO_LINHAS_EXCEDIDAS')
      expect(() => conferirLinhas(def(id), 'feed', { blocos: COMPLETA } as never)).not.toThrow()
    })
  }

  it('o validador: zona sobre a foto, canto auto e o texto E em x .48 com w .436 (passa do piso de .915) são recusados', () => {
    expect(problemas(mutado(D, (a) => (a.formatos.story.papeis.headline.zona.xMax = 0.6)))).toEqual(['ZONA_SOBRE_A_FOTO formatos.story.papeis.headline.zona'])
    expect(problemas(mutado(E, (a) => (a.formatos.feed.papeis.apoio.zona.xMin = 0.4)))).toContain('ZONA_SOBRE_A_FOTO formatos.feed.papeis.apoio.zona')
    // Encostar na borda da caixa da foto (D: .575) não é tocar.
    expect(problemas(mutado(D, (a) => (a.formatos.story.papeis.headline.zona.xMax = 0.575)))).toEqual([])
    expect(problemas(mutado(D, (a) => (a.preferencias.cantoDaMarca = 'auto')))).toContain('PREFERENCIA_INCOERENTE preferencias.cantoDaMarca')
    const literal = problemas(
      mutado(E, (a) => {
        for (const f of FORMATOS) for (const p of TEXTOS) a.formatos[f].papeis[p].referencia.x = 0.48
      }),
    )
    expect(literal.length).toBeGreaterThan(0)
    expect(literal.every((p) => /^(REFERENCIA_FORA_DA_ZONA|FORA_DA_AREA_SEGURA) /.test(p)), literal.join(' | ')).toBe(true)
  })
})

describe('#10 · a regra justa no medidor REAL e o arredondamento da logo (CT-08, CT-09)', () => {
  it('CT-08: coluna da referência de .436 = 456 (a de .435 seria 455); "Bastidores" a 80 px, o apoio e o serviço das amostras cabem inteiros', async () => {
    const { GlobalFonts } = await import('@napi-rs/canvas')
    for (const peso of [400, 600, 800]) GlobalFonts.registerFromPath(join(process.cwd(), `assets/fonts/montserrat/Montserrat-${peso}.ttf`), 'Montserrat')
    const { createServerTextBoxMeasurer } = await import('@/lib/creatives/server-text-measurer')
    const m = await createServerTextBoxMeasurer()
    const largura = (texto: string, fontSize: number, fontWeight: number, lineHeight: number) =>
      m({ id: 'x', type: 'text', content: texto, position: { x: 0, y: 0 }, size: { width: 5000, height: 400 }, style: { fontFamily: 'Montserrat', fontWeight, fontSize, lineHeight, letterSpacing: 0 }, textboxConfig: { textMode: 'auto-wrap-fixed', anchor: 'top', autoWrap: { breakMode: 'word', autoExpand: true, lineHeight } } } as Layer)!.maxLineWidth
    expect([colunaDaCaixa(0.436 * 1080), colunaDaCaixa(0.435 * 1080)]).toEqual([456, 455])
    const coluna = colunaDaCaixa(ref(def(D), 'story', 'headline').w * 1080)
    expect(colunaDaCaixa(ref(def(E), 'feed', 'servico').w * 1080)).toBe(coluna)
    const medidas = {
      Bastidores: largura('Bastidores', 80, 800, 0.95),
      'Luz natural e cada': largura('Luz natural e cada', 40, 400, 1.2),
      'prato no ponto certo': largura('prato no ponto certo', 40, 400, 1.2),
      'Ter a dom · 18h às 23h': largura('Ter a dom · 18h às 23h', 30, 600, 1.2),
    }
    // A medida real é gravada no log do teste (a prova do CT-08, nunca um cálculo).
    console.info(`CT-08 medidas reais (px): ${JSON.stringify({ coluna, ...medidas })}`)
    for (const [t, w] of Object.entries(medidas)) expect([t, w <= coluna]).toEqual([t, true])
    // A linha mais larga aceita nas amostras (ceil 456) cabe; uma letra a mais não.
    expect(Math.ceil(medidas.Bastidores)).toBe(456)
    expect(largura('Bastidoress', 80, 800, 0.95)).toBeGreaterThan(coluna)
  })

  it('CT-09: a logo de referência (contain, rente ao canto de fora) arredondada fica dentro da zona arredondada (±0,5) para toda proporção de 0,10 a 2,00', () => {
    const recusadas: Record<string, number> = {}
    for (const id of [D, E]) {
      const a = def(id)
      for (const f of FORMATOS) {
        const { margemH, safeTopo, safeRodape } = areaSeguraPadrao(f)
        const r = referenciaDoPapel(a, f, CANVAS[f], { margemH, safeTopo, safeRodape }, 'logo')!
        const z = r.zonaEfetiva!
        const [zx, zw] = [Math.round(z.x), Math.round(z.width)]
        let n = 0
        for (let i = 0; i <= 3800; i++) {
          const razao = 0.1 + i * 0.0005
          const width = Math.min(r.referencia.width, r.referencia.height / razao)
          const x = a.preferencias.cantoDaMarca === 'superior-direito' ? r.referencia.x + r.referencia.width - width : r.referencia.x
          const [px, pw] = [Math.round(x), Math.round(width)]
          if (px < zx - 0.5 || px + pw > zx + zw + 0.5) n++
        }
        recusadas[`${id}·${f}`] = n
      }
    }
    expect(recusadas).toEqual({ [`${D}·story`]: 0, [`${D}·feed`]: 0, [`${E}·story`]: 0, [`${E}·feed`]: 0 })
  })

  it('a caixa da foto em px: D 621/0 × 459 × H, E 0/0 × 459 × H (inteiros: caixaDaFoto não arredonda)', () => {
    for (const f of FORMATOS) {
      expect(caixaDaFoto(def(D), f, CANVAS[f])).toEqual({ x: 621, y: 0, width: 459, height: CANVAS[f].height })
      expect(caixaDaFoto(def(E), f, CANVAS[f])).toEqual({ x: 0, y: 0, width: 459, height: CANVAS[f].height })
    }
  })
})

describe('#10 · o fio opcional (R-04, módulo puro): presente sob a manchete; omitido com motivo quando encostaria num texto', () => {
  for (const id of [D, E]) {
    for (const f of FORMATOS) {
      it(`${id} ${f}: na referência o fio nasce 6 px (±½, o arredondamento) à direita da manchete; com o apoio em cima dele, sai OMITIDO (dito), nada empurrado`, () => {
        const a = def(id)
        const { width: W, height: H } = CANVAS[f]
        const papeis = Object.fromEntries(
          Object.entries(a.formatos[f].papeis).map(([p, pos]: [string, any]) => [p, { posicao: { x: pos.referencia.x * W, y: pos.referencia.y * H, width: pos.referencia.w * W, height: pos.referencia.h * H } }]),
        )
        const outros = Object.entries(papeis).filter(([p]) => p !== 'headline').map(([p, v]) => ({ id: p, rect: (v as any).posicao }))
        const posicionar = (obstaculos: Array<{ id: string; rect: any }>) =>
          posicionarAcentos({ arquetipo: a, formato: f, canvas: CANVAS[f], geometria: NUMEROS_PADRAO.geometria[f], receitas: receitasDoArquetipo(a).receitas, papeis: papeis as never, obstaculos })
        const ok = posicionar(outros)
        expect([ok.omitidos, ok.recusas, ok.acentos.length]).toEqual([[], [], 1])
        const fio = ok.acentos[0].rect
        // A caixa do fio é arredondada ao pixel (a manchete aqui não: é a referência crua) — 6 px ± ½.
        expect(Math.abs(fio.x - (papeis as any).headline.posicao.x - 6)).toBeLessThanOrEqual(0.5)
        const r = posicionar([...outros, { id: 'apoio', rect: { ...fio, y: fio.y + 2 } }])
        expect([r.acentos, r.recusas]).toEqual([[], []])
        expect(r.omitidos).toEqual([{ elemento: 'fio', tipo: 'fio-fino', opcional: true, rect: fio, motivo: expect.stringMatching(/encosta em apoio/) }])
      })
    }
  }
})
