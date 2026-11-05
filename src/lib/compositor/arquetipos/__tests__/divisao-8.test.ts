/**
 * #8 `minimal-divisao-foto-topo@1` (T3-B, 24/10/2026) — o contrato, o validador do `foto-em-caixa`, a geometria em px
 * contra o cálculo do preflight (`geometria-8.txt`), as funções puras do fundo (`textoNoLiso`, `caixaDaFoto`,
 * `luzParaAVariante`, `tintasAtivas`, `papelDoBloco`) e a vitrine. Puro: sem banco, sem render, sem medidor.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { CreativeError } from '@/lib/creatives/errors'
import { listarArquetipos, verArquetipo } from '../catalogo'
import { faixasDoArquetipo } from '../candidatos-espaciais'
import { caixaDaFoto, fundoDaPeca, luzParaAVariante, papelDoBloco, semFoto, textoNoLiso, tintasAtivas, type TintaAtiva } from '../fundo'
import { impressaoDoArquetipo } from '../impressao'
import { referenciaDoPapel } from '../materializar'
import { prepararArquetipo, vitrineDeArquetipos } from '../na-spec'
import type { ArquetipoDeLayout } from '../tipos'
import { areaSeguraPadrao, validarArquetipo } from '../validar'

const ID = 'minimal-divisao-foto-topo'
const def = () => verArquetipo(ID, 1)!
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } } as const
const ESCURO = '#0B0B0B'
const CLARO = '#F4EFE6'

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
const tinta = (cor: string, camada = 'headline'): TintaAtiva => ({ camada, inicio: 0, fim: 5, cor, origem: 'base' })
const camada = (content: string, color: string | undefined, richTextStyles?: Array<Record<string, unknown>>, type: 'text' | 'rich-text' = 'rich-text') =>
  ({ layer: { id: 'headline', type, content, style: color ? { color } : {}, ...(richTextStyles ? { richTextStyles } : {}) } as unknown as Layer })

describe('#8 · contrato e catálogo (G-K2, G-K3)', () => {
  it('o @1 está publicado, válido, com a impressão fixada; sem versão → @1', () => {
    const a = def()
    expect([a.id, a.versao, a.codigoTaxonomico, a.fundo]).toEqual([ID, 1, 'MIN-04', 'foto-em-caixa'])
    expect(verArquetipo(ID)!.versao).toBe(1)
    expect(impressaoDoArquetipo(a)).toBe('arq1-03ccaf6af70501')
    expect(validarArquetipo(a)).toEqual([])
    expect(a.papeis.map((p) => [p.papel, p.obrigatorio])).toEqual([
      ['headline', true],
      ['apoio', false],
      ['servico', true],
      ['logo', true],
    ])
    expect(a.preferencias).toEqual({ ancora: 'rodape', alinha: 'esquerda', cantoDaMarca: 'inferior-direito' })
    expect(a.elementos).toBeUndefined()
  })

  it('a definição é congelada: mutar a cópia não muda a fonte', () => {
    const copia = def() as unknown as { formatos: { story: { foto: { h: number } } }; nome: string }
    copia.formatos.story.foto.h = 0.9
    copia.nome = 'outro'
    expect(def().formatos.story.foto).toEqual({ x: 0, y: 0, w: 1, h: 0.6 })
    expect(impressaoDoArquetipo(def())).toBe('arq1-03ccaf6af70501')
  })
})

describe('#8 · validador do foto-em-caixa (G-V1–G-V4)', () => {
  const mutado = (f: (a: any) => void) => {
    const a = def() as any
    f(a)
    return a as ArquetipoDeLayout
  }

  it('G-V1: a caixa da foto é obrigatória sse foto-em-caixa; fora de 0..1 é recusada', () => {
    expect(problemas(mutado((a) => delete a.formatos.story.foto))).toEqual(['CAMPO_INVALIDO formatos.story.foto'])
    expect(problemas(mutado((a) => (a.formatos.feed.foto = { x: 0, y: 0, w: 1, h: 1.2 })))).toEqual(['COORDENADA_FORA formatos.feed.foto'])
    expect(problemas(mutado((a) => (a.formatos.story.foto = { x: 0, y: 0, w: 1, h: 0.6, cor: 1 })))).toContain('CAMPO_PROIBIDO formatos.story.foto.cor')
  })

  it('G-V2: zona de papel ou caixa de elemento que toca a caixa da foto → ZONA_SOBRE_A_FOTO, com o campo; encostar não é tocar', () => {
    expect(problemas(mutado((a) => (a.formatos.story.papeis.headline.zona.yMin = 0.59)))).toEqual(['ZONA_SOBRE_A_FOTO formatos.story.papeis.headline.zona'])
    expect(problemas(mutado((a) => (a.formatos.feed.papeis.logo.zona.yMin = 0.5)))).toEqual(['ZONA_SOBRE_A_FOTO formatos.feed.papeis.logo.zona'])
    // A zona que só ENCOSTA na borda da caixa (yMin = h da foto) é válida.
    expect(problemas(mutado((a) => (a.formatos.story.papeis.headline.zona.yMin = 0.6)))).toEqual([])
    const comFio = mutado((a) => {
      a.elementos = [{ id: 'fio', tipo: 'fio-fino', opcional: true, corPorPapel: 'texto', presoA: 'headline' }]
      a.formatos.story.elementos = { fio: { x: 0.085, y: 0.55, w: 0.3, h: 0.003 } }
      a.formatos.feed.elementos = { fio: { x: 0.085, y: 0.6, w: 0.3, h: 0.003 } }
    })
    expect(problemas(comFio)).toEqual(['ZONA_SOBRE_A_FOTO formatos.story.elementos.fio'])
  })

  it('G-V3: canto "auto" ou logo automática no foto-em-caixa → PREFERENCIA_INCOERENTE', () => {
    expect(problemas(mutado((a) => (a.preferencias.cantoDaMarca = 'auto')))).toContain('PREFERENCIA_INCOERENTE preferencias.cantoDaMarca')
    const auto = mutado((a) => {
      a.preferencias.cantoDaMarca = 'auto'
      a.formatos.story.papeis.logo = { automatica: 'canto-mais-calmo' }
      a.formatos.feed.papeis.logo = { automatica: 'canto-mais-calmo' }
    })
    expect(problemas(auto)).toEqual(['PREFERENCIA_INCOERENTE preferencias.cantoDaMarca', 'PREFERENCIA_INCOERENTE formatos.story.papeis.logo', 'PREFERENCIA_INCOERENTE formatos.feed.papeis.logo'])
  })

  it('G-V4: a caixa da foto num arquétipo de foto ou liso-claro está fora do contrato', () => {
    const topo = verArquetipo('minimal-fb-topo-esquerda', 1) as any
    topo.formatos.story.foto = { x: 0, y: 0, w: 1, h: 0.6 }
    expect(problemas(topo)).toEqual(['CAMPO_DESCONHECIDO formatos.story.foto'])
    const lista = verArquetipo('minimal-tipografico-lista', 1) as any
    lista.formatos.feed.foto = { x: 0, y: 0, w: 1, h: 0.5 }
    expect(problemas(lista)).toEqual(['CAMPO_DESCONHECIDO formatos.feed.foto'])
  })
})

describe('#8 · geometria em px (G-G1, G-G2), contra o cálculo puro do preflight (geometria-8.txt)', () => {
  // [x0, y0, x1, y1] da referência e da zona efetiva (a zona recortada pelo HARD), em px.
  const TABELA = {
    story: {
      foto: { x: 0, y: 0, width: 1080, height: 1152 },
      headline: { ref: [91.8, 1248, 847.8, 1459.2], zona: [92, 1209.6, 901.8, 1478.4] },
      apoio: { ref: [91.8, 1488, 847.8, 1584], zona: [92, 1468.8, 901.8, 1603.2] },
      servico: { ref: [91.8, 1612.8, 739.8, 1689.6], zona: [92, 1593.6, 739.8, 1695.4] },
      logo: { ref: [799.2, 1593.6, 988.2, 1689.6], zona: [756, 1574.4, 988, 1695.4] },
    },
    feed: {
      foto: { x: 0, y: 0, width: 1080, height: 783 },
      headline: { ref: [91.8, 850.5, 847.8, 1026], zona: [92, 823.5, 901.8, 1046.2] },
      apoio: { ref: [91.8, 1053, 847.8, 1134], zona: [92, 1032.8, 901.8, 1147.5] },
      servico: { ref: [91.8, 1161, 739.8, 1228.5], zona: [92, 1140.8, 739.8, 1244.7] },
      logo: { ref: [799.2, 1147.5, 988.2, 1228.5], zona: [756, 1134, 988, 1244.7] },
    },
  } as const
  for (const f of ['story', 'feed'] as const) {
    it(`${f}: caixa da foto, referências e zonas efetivas (±0,5 px: o arredondamento do produto), 1 faixa, tudo abaixo da junção`, () => {
      const a = def()
      expect(caixaDaFoto(a, f, CANVAS[f])).toEqual(TABELA[f].foto)
      const { margemH, safeTopo, safeRodape } = areaSeguraPadrao(f)
      for (const papel of ['headline', 'apoio', 'servico', 'logo'] as const) {
        const r = referenciaDoPapel(a, f, CANVAS[f], { margemH, safeTopo, safeRodape }, papel)!
        // Cada número (x, y, largura, altura) é arredondado à parte pelo produto: ±0,5 em cada um.
        const px = (q: { x: number; y: number; width: number; height: number }) => [q.x, q.y, q.width, q.height]
        const daTabela = (t: readonly number[]) => [t[0], t[1], t[2] - t[0], t[3] - t[1]]
        px(r.referencia).forEach((v, i) => expect(Math.abs(v - daTabela(TABELA[f][papel].ref)[i]), `${papel} ref[${i}] ${v}`).toBeLessThanOrEqual(0.5))
        px(r.zonaEfetiva!).forEach((v, i) => expect(Math.abs(v - daTabela(TABELA[f][papel].zona)[i]), `${papel} zona[${i}] ${v}`).toBeLessThanOrEqual(0.5))
        expect(r.zonaEfetiva!.y).toBeGreaterThanOrEqual(TABELA[f].foto.height)
      }
      expect(faixasDoArquetipo(a, f)).toEqual([['headline', 'apoio', 'servico', 'logo']])
    })
  }
})

describe('#8 · fundo: textoNoLiso, caixa, luz e a regressão do fundoDaPeca (G-F4)', () => {
  it('textoNoLiso vale para liso-claro e foto-em-caixa; semFoto continua só o liso-claro', () => {
    const tabela = [null, undefined, { fundo: undefined }, { fundo: 'foto' }, { fundo: 'liso-claro' }, { fundo: 'foto-em-caixa' }] as const
    expect(tabela.map((d) => textoNoLiso(d as never))).toEqual([false, false, false, false, true, true])
    expect(tabela.map((d) => semFoto(d as never))).toEqual([false, false, false, false, true, false])
  })

  it('caixaDaFoto é nula fora do foto-em-caixa; a luz sai da escolha só no texto no liso', () => {
    expect(caixaDaFoto(verArquetipo('minimal-fb-topo-esquerda')!, 'story', CANVAS.story)).toBeNull()
    expect(caixaDaFoto(verArquetipo('minimal-tipografico-lista')!, 'feed', CANVAS.feed)).toBeNull()
    expect(luzParaAVariante(def(), 200)).toBeNull()
    expect(luzParaAVariante(verArquetipo('minimal-tipografico-lista')!, 200)).toBeNull()
    expect(luzParaAVariante(verArquetipo('minimal-fb-topo-esquerda')!, 200)).toBe(200)
    expect(luzParaAVariante(null, 37)).toBe(37)
  })

  it('fundoDaPeca: a mesma saída de antes para foto, sem arquétipo e liso-claro (o foto-em-caixa não passa por ele)', () => {
    const numeros = { fundo: ESCURO, fundoClaro: CLARO }
    const lista = verArquetipo('minimal-tipografico-lista')!
    expect(fundoDaPeca(null, numeros)).toBe(ESCURO)
    expect(fundoDaPeca(verArquetipo('minimal-fb-topo-esquerda')!, numeros)).toBe(ESCURO)
    expect(fundoDaPeca(lista, numeros)).toBe(CLARO)
    expect(fundoDaPeca(lista, numeros, '#FAFAFA')).toBe('#FAFAFA')
    expect((recusa(() => fundoDaPeca(lista, { fundo: ESCURO })).details as any).origem).toBe('marca')
    expect((recusa(() => fundoDaPeca(lista, numeros, '#222222')).details as any).origem).toBe('pagina')
    // Não é chamado no #8, e se fosse: o fundo de sempre (não é semFoto).
    expect(fundoDaPeca(def(), numeros)).toBe(ESCURO)
  })
})

describe('#8 · tintasAtivas: só o que desenha glifo (G-F11–G-F14)', () => {
  const cores = (t: TintaAtiva[]) => t.map((x) => [x.cor, x.origem, x.inicio, x.fim])

  it('G-F11: destaque cobre 100% do texto → só a tinta do destaque; a base não entra', () => {
    expect(cores(tintasAtivas([camada('Noite de vinhos', '#FFFFFF', [{ start: 0, end: 15, fill: '#000000' }])]))).toEqual([['#000000', 'trecho', 0, 15]])
  })

  it('G-F12: destaques separados só por espaço ou só por quebra → a base (espaço/quebra) não entra', () => {
    const espaco = tintasAtivas([camada('Noite de vinhos', '#FFFFFF', [{ start: 0, end: 5, fill: '#000000' }, { start: 6, end: 15, fill: '#000000' }])])
    expect(espaco.map((t) => t.cor)).toEqual(['#000000', '#000000'])
    const quebra = tintasAtivas([camada('Noite\nde vinhos', '#FFFFFF', [{ start: 0, end: 5, fill: '#000000' }, { start: 6, end: 15, fill: '#000000' }])])
    expect(quebra.map((t) => t.cor)).toEqual(['#000000', '#000000'])
  })

  it('G-F13: destaque parcial → base e destaque; trecho sem fill herda a base', () => {
    expect(cores(tintasAtivas([camada('Noite de vinhos', '#FFFFFF', [{ start: 9, end: 15, fill: '#000000' }])]))).toEqual([
      ['#FFFFFF', 'base', 0, 9],
      ['#000000', 'trecho', 9, 15],
    ])
    expect(cores(tintasAtivas([camada('Noite de vinhos', '#FFFFFF', [{ start: 0, end: 5, fontFamily: 'Outra' }])]))).toEqual([
      ['#FFFFFF', 'trecho', 0, 5],
      ['#FFFFFF', 'base', 5, 15],
    ])
    // Sem style.color, a base é a do renderer ('#000000').
    expect(tintasAtivas([camada('Oi', undefined)]).map((t) => t.cor)).toEqual(['#000000'])
  })

  it('G-F14: intervalo vazio, fora do conteúdo, sobrescrito e largura zero não criam tinta; camada só de espaços, nenhuma', () => {
    expect(cores(tintasAtivas([camada('Noite', '#FFFFFF', [{ start: 2, end: 2, fill: '#FF0000' }])]))).toEqual([['#FFFFFF', 'base', 0, 5]])
    expect(cores(tintasAtivas([camada('Noite', '#FFFFFF', [{ start: 20, end: 30, fill: '#FF0000' }])]))).toEqual([['#FFFFFF', 'base', 0, 5]])
    expect(cores(tintasAtivas([camada('Noite', '#FFFFFF', [{ start: 0, end: 5, fill: '#FF0000' }, { start: 0, end: 5, fill: '#000000' }])]))).toEqual([['#000000', 'trecho', 0, 5]])
    expect(tintasAtivas([camada('A​', '#FFFFFF', [{ start: 1, end: 2, fill: '#FF0000' }])]).map((t) => t.cor)).toEqual(['#FFFFFF'])
    expect(tintasAtivas([camada('Noite de vinhos', '#FFFFFF', undefined)]).map((t) => t.cor)).toEqual(['#FFFFFF'])
    expect(tintasAtivas([camada('   \n ', '#FFFFFF', undefined)])).toEqual([])
    // Camada `text` (não rich-text): o renderer não lê richTextStyles nela — a coleta também não.
    expect(tintasAtivas([camada('Noite', '#FFFFFF', [{ start: 0, end: 5, fill: '#000000' }], 'text')]).map((t) => t.cor)).toEqual(['#FFFFFF'])
  })
})

describe('#8 · papelDoBloco: o papel do liso pelo critério da régua (G-F1–G-F3)', () => {
  const numeros = { fundo: ESCURO, fundoClaro: CLARO }

  it('texto claro → escuro; texto escuro com o claro da marca → claro; sem tintas (empate) → escuro', () => {
    expect(papelDoBloco(def(), numeros, [tinta('#FFFFFF')])).toMatchObject({ fundo: ESCURO, papel: 'escuro' })
    expect(papelDoBloco(def(), numeros, [tinta('#1F1F1F')])).toMatchObject({ fundo: CLARO, papel: 'claro' })
    expect(papelDoBloco(def(), numeros, [])).toMatchObject({ fundo: ESCURO, papel: 'escuro' })
    // A amarela clara só lê no escuro: o claro reprova e o escuro vence, com as folgas dos dois candidatos ditas.
    const r = papelDoBloco(def(), numeros, [tinta('#FFFFFF'), tinta('#E8C547', 'apoio')])
    expect(r.papel).toBe('escuro')
    expect(r.folgas.map((f) => f.papel)).toEqual(['escuro', 'claro'])
  })

  it('texto escuro sem fundoClaro → ARQUETIPO_FUNDO_INDISPONIVEL origem contraste; tintas mistas → a mesma recusa, com folgas e tintas', () => {
    const semClaro = recusa(() => papelDoBloco(def(), { fundo: ESCURO }, [tinta('#1F1F1F')]))
    expect([semClaro.code, semClaro.status, (semClaro.details as any).origem, (semClaro.details as any).fundoClaro]).toEqual(['ARQUETIPO_FUNDO_INDISPONIVEL', 422, 'contraste', null])
    const mistas = recusa(() => papelDoBloco(def(), numeros, [tinta('#FFFFFF', 'headline'), tinta('#000000', 'headline2')]))
    const d = mistas.details as any
    expect(d.origem).toBe('contraste')
    expect(d.tintas.map((t: TintaAtiva) => [t.camada, t.cor])).toEqual([
      ['headline', '#FFFFFF'],
      ['headline2', '#000000'],
    ])
    expect(d.folgas.map((f: any) => [f.papel, f.atende, f.reprovadas.map((r: any) => r.camada)])).toEqual([
      ['escuro', false, ['headline2']],
      ['claro', false, ['headline']],
    ])
    expect(mistas.message).toMatch(/headline2 #000000/)
  })

  it('congelado (recomposição): o fundo da página que atende vale (papel pagina); o que não atende, ou nulo, recusa origem pagina', () => {
    expect(papelDoBloco(def(), numeros, [tinta('#FFFFFF')], '#202020')).toMatchObject({ fundo: '#202020', papel: 'pagina' })
    const naoAtende = recusa(() => papelDoBloco(def(), numeros, [tinta('#FFFFFF')], '#F0F0F0'))
    expect([(naoAtende.details as any).origem, (naoAtende.details as any).fundoDaPagina]).toEqual(['pagina', '#F0F0F0'])
    expect((recusa(() => papelDoBloco(def(), numeros, [tinta('#FFFFFF')], null)).details as any).origem).toBe('pagina')
  })

  it('tinta que a régua não interpreta → recusa (falha fechada)', () => {
    const r = recusa(() => papelDoBloco(def(), numeros, [tinta('rgba(0,0,0,1)')]))
    expect(r.code).toBe('ARQUETIPO_FUNDO_INDISPONIVEL')
    expect((r.details as any).folgas.every((f: any) => f.folgaMinima === null)).toBe(true)
  })
})

describe('#8 · na spec e vitrine (G-M3, G-P5, G-N1, G-N4)', () => {
  const spec = (extra: Record<string, unknown> = {}) => ({ formato: 'story', arquetipo: { id: ID }, blocos: [{ papel: 'headline', linhas: ['Noite de vinhos'] }, { papel: 'servico', linhas: ['Sexta · 20h'] }], ...extra }) as never

  it('a vitrine lista 10 ids e o #8 com fundo foto-em-caixa, a caixa da foto e disponível', () => {
    const v = vitrineDeArquetipos()
    // H9: o #9@1 publicado → 10 ids; ele também é foto-em-caixa (a caixa embaixo, com o topo em arco). IH #10: os 2 da coluna → 12.
    // O #4 guardado fora da vitrine (25/10) → 11; o #3 guardado (26/10) → 10.
    expect(v).toHaveLength(10)
    expect(new Set(v.map((a) => a.id)).size).toBe(10)
    expect(v.find((a) => a.id === ID)).toMatchObject({ versao: 1, fundo: 'foto-em-caixa', disponibilidade: 'disponivel', caixaDaFoto: { story: { x: 0, y: 0, w: 1, h: 0.6 }, feed: { x: 0, y: 0, w: 1, h: 0.58 } } })
    // Só o #8, o #9 (H9) e os 2 do #10 (IH) dizem a caixa, na ordem da vitrine.
    expect(v.filter((a) => 'caixaDaFoto' in a).map((a) => a.id)).toEqual(['minimal-coluna-foto', 'minimal-coluna-foto-esquerda', 'minimal-divisao-cor-topo-arco', ID])
    expect(listarArquetipos().filter((a) => a.fundo === 'foto-em-caixa').map((a) => `${a.id}@${a.versao}`)).toEqual(['minimal-coluna-foto@1', 'minimal-coluna-foto-esquerda@1', 'minimal-divisao-cor-topo-arco@1', `${ID}@1`])
  })

  it('sem foto: o compor (exigirFoto) recusa ARQUETIPO_FOTO_AUSENTE; o medir (sem a opção) segue', () => {
    expect(recusa(() => prepararArquetipo(spec(), { exigirFoto: true })).code).toBe('ARQUETIPO_FOTO_AUSENTE')
    expect(prepararArquetipo(spec())!.resolvido).toEqual({ id: ID, versao: 1, impressao: 'arq1-03ccaf6af70501' })
    expect(prepararArquetipo(spec({ foto: { url: 'https://fotos.test/8.jpg' } }), { exigirFoto: true })!.formato).toBe('story')
  })

  it('pré, cta e herdaDe → ARQUETIPO_PAPEIS_INCOMPATIVEIS (nada some); quadrado → formato não suportado', () => {
    const comPre = spec({ foto: { url: 'https://fotos.test/8.jpg' }, blocos: [{ papel: 'pre', linhas: ['Hoje'] }, { papel: 'headline', linhas: ['Noite'] }, { papel: 'servico', linhas: ['20h'] }] })
    const r = recusa(() => prepararArquetipo(comPre, { exigirFoto: true }))
    expect([r.code, (r.details as any).naoSuportados]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', ['pre']])
    const comCta = spec({ blocos: [{ papel: 'headline', linhas: ['Noite'] }, { papel: 'servico', linhas: ['20h'] }, { papel: 'cta', linhas: ['Reserve'] }] })
    expect((recusa(() => prepararArquetipo(comCta)).details as any).naoSuportados).toEqual(['cta'])
    const herda = spec({ blocos: [{ papel: 'headline', linhas: ['Noite'] }, { papel: 'servico', linhas: ['20h'] }, { papel: 'apoio', id: 'x', herdaDe: 'apoio', linhas: ['a'] }] })
    expect((recusa(() => prepararArquetipo(herda)).details as any).extras).toEqual(['x'])
    expect(recusa(() => prepararArquetipo(spec({ formato: 'quadrado' }))).code).toBe('ARQUETIPO_FORMATO_NAO_SUPORTADO')
  })
})
