/**
 * F1: o medir-copy mede a peça por REFERÊNCIA como o compor a compõe — sem a pilha da faixa e sem a margem da marca:
 * a partida da manchete é a caixa aprovada do Ciro (y 1618), não a pilha a partir do apoio (y 1637 com gap 0).
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { montarAssinatura } from '../assinatura'
import { compilarReferencia } from '../arquetipos/referencia'
import { prepararArquetipo } from '../arquetipos/na-spec'
import { medirCopy } from '../medir-copy'
import brunch from '../arquetipos/__tests__/suporte/emporio-ref02-brunch.json'
import congelada from '../arquetipos/__tests__/suporte/emporio-ref02-brunch-v1-congelada.json'

const PAGINA = brunch as unknown as { id: string; name: string; width: number; height: number; tags: string[]; layers: Layer[] }
const medirFalso = (layer: Layer) => {
  // Como o medidor do servidor (`render-engine.ts`): só camada `text`; rich-text devolve null.
  if (layer.type !== 'text') return null
  const fontSize = Number(layer.style?.fontSize ?? 16)
  const linhas = (layer.content ?? '').split('\n')
  const largura = Math.max(...linhas.map((l) => l.length * fontSize * 0.55))
  const height = linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1)
  return { height, maxLineWidth: largura, lineCount: linhas.length, linhas: linhas.map((l) => ({ texto: l, largura: l.length * fontSize * 0.55 })) }
}
const texto = (id: string, style: Record<string, unknown>, content = 'x'): Layer => ({ id, name: id, type: 'text', visible: true, locked: false, order: 0, position: { x: 92, y: 100 }, size: { width: 896, height: 100 }, rotation: 0, content, style: { fontFamily: 'Montserrat', fontSize: 40, lineHeight: 1.1, color: '#fff', ...style } } as unknown as Layer)
const assinatura = montarAssinatura({
  pagina: {
    id: 'assinatura',
    name: 'Story base',
    width: 1080,
    height: 1920,
    layers: [
      texto('headline', { fontFamily: 'Montserrat', fontSize: 70, color: '#FFFFFF', lineHeight: 1 }),
      texto('apoio', { fontFamily: 'Montserrat', fontSize: 25, color: '#FFFFFF', lineHeight: 1 }),
    ],
  },
  formatoDaPagina: 'story',
  numerosDoProjeto: null,
  logoDoProjeto: { url: 'https://x/logo.png', razao: 65 / 200 },
})

describe('medir-copy por referência', () => {
  it('a partida da manchete é a caixa aprovada (y 1618), sem pilha: a MESMA do compor', () => {
    const c = compilarReferencia(PAGINA, { pageVersion: 'v', versao: 1 })
    if (!c.ok) throw new Error('não compilou')
    const spec = { projectId: 12, formato: 'story' as const, foto: { driveFileId: 'x' }, arquetipo: { id: c.definicao.id }, blocos: [{ papel: 'headline' as const, linhas: ['Café da manhã'] }, { papel: 'apoio' as const, linhas: ['Sabores da manhã'] }] }
    const arq = prepararArquetipo(spec, { definicoes: [c.definicao] })!
    const m = medirCopy({ assinatura, medir: medirFalso, familias: ['Montserrat'], fonteCarregada: () => true, formato: 'story', spec, arquetipo: arq })
    const pos = m.arquetipo?.posicoes
    expect(pos?.headline?.posicao.y).toBe(1618)
    expect(pos?.apoio?.posicao.y).toBe(1707)
    expect(pos?.logo?.posicao).toMatchObject({ x: 816, y: 160 })
  })
})

// ── F2c (02/11/2026): o corpo DESENHADO na referência é o teto da escada; a assinatura (70/25) dá fonte e cor ──
type Definicao = Parameters<typeof prepararArquetipo>[1]['definicoes'] extends ReadonlyArray<infer D> | undefined ? D : never
const compilar = (pagina: typeof PAGINA = PAGINA): Definicao => {
  const c = compilarReferencia(pagina, { pageVersion: 'v', versao: 1 })
  if (!c.ok) throw new Error(`${(c as { codigo: string }).codigo}: ${(c as { mensagem: string }).mensagem}`)
  return c.definicao
}
const medirPor = (definicao: Definicao, blocos: Array<{ papel: 'headline' | 'apoio'; linhas: string[] }>, assin = assinatura) => {
  const spec = { projectId: 12, formato: 'story' as const, foto: { driveFileId: 'x' }, arquetipo: { id: definicao.id }, blocos }
  const arq = prepararArquetipo(spec, { definicoes: [definicao] })!
  return medirCopy({ assinatura: assin, medir: medirFalso, familias: ['Montserrat'], fonteCarregada: () => true, formato: 'story', spec, arquetipo: arq })
}
const bloco = (m: ReturnType<typeof medirCopy>, id: string) => m.blocos.find((b) => b.id === id)!
/** A Brunch com a caixa da manchete mais alta (y 1480, 220 px) e TRÊS linhas desenhadas (`linhasMax: 3`), para a unidade manchete + segunda voz ter onde caber. */
const brunchAlto = { ...PAGINA, layers: PAGINA.layers.map((l) => (l.id === 'titulo' ? ({ ...l, content: 'Brunch\nEmpório\nFonseca', position: { ...l.position, y: 1480 }, size: { ...l.size, height: 220 }, style: { ...l.style, fontSize: 80 } } as Layer) : l)) }
const assinaturaComVoz2 = montarAssinatura({
  pagina: {
    id: 'assinatura-2',
    name: 'Story base',
    width: 1080,
    height: 1920,
    layers: [
      texto('headline', { fontFamily: 'Montserrat', fontSize: 70, color: '#FFFFFF', lineHeight: 1 }),
      texto('headline2', { fontFamily: 'Montserrat', fontSize: 35, color: '#FFFFFF', lineHeight: 1 }),
      texto('apoio', { fontFamily: 'Montserrat', fontSize: 25, color: '#FFFFFF', lineHeight: 1 }),
    ],
  },
  formatoDaPagina: 'story',
  numerosDoProjeto: null,
  logoDoProjeto: { url: 'https://x/logo.png', razao: 65 / 200 },
})

describe('F2c · o corpo da referência no medir-copy', () => {
  it('a copy curta sai no corpo DESENHADO (85/39), não no da assinatura (70/25): cabe, redução 0, orçamento medido no corpo da referência', () => {
    const m = medirPor(compilar(), [{ papel: 'headline', linhas: ['Café da manhã'] }, { papel: 'apoio', linhas: ['Sabores da manhã'] }])
    expect([bloco(m, 'headline').fontSize, bloco(m, 'apoio').fontSize]).toEqual([85, 39])
    expect(bloco(m, 'headline')).toMatchObject({ situacao: 'cabe', corpo: { referencia: 85, efetivo: 85, piso: 68, reducao: 0 } })
    expect(bloco(m, 'apoio')).toMatchObject({ situacao: 'cabe', corpo: { referencia: 39, efetivo: 39, piso: 31, reducao: 0 } })
    expect(m.arquetipo!.papeis.headline!.corpo).toMatchObject({ referencia: 85, piso: 68 })
    expect(m.arquetipo!.papeis.headline!.corpo!.caracteresPorLinha).toBeGreaterThan(10)
    expect(m.cabeTudo).toBe(true)
  })

  it('a copy mais longa desce da referência — dito como reduzido contra os 85 px desenhados (a escala técnica fica acima de 1), nunca abaixo do piso 68', () => {
    const m = medirPor(compilar(), [{ papel: 'headline', linhas: ['Café da manhã servido'] }, { papel: 'apoio', linhas: ['Sabores da manhã'] }])
    const h = bloco(m, 'headline')
    expect(h.situacao).toBe('cabe-reduzido')
    expect(h.fontSize!).toBeLessThan(85)
    expect(h.fontSize!).toBeGreaterThanOrEqual(68)
    expect(h.escala!).toBeGreaterThan(1)
    expect(h.corpo).toMatchObject({ referencia: 85, efetivo: h.fontSize, piso: 68 })
    expect(h.corpo!.reducao).toBeGreaterThan(0)
    expect(h.avisos.join(' ')).toMatch(/abaixo dos 85 px da referência/)
    // Só a manchete encolheu: o apoio fica no teto dele (a independência do teto inicial).
    expect(bloco(m, 'apoio')).toMatchObject({ fontSize: 39, situacao: 'cabe', corpo: { reducao: 0 } })
  })

  it('a chegada EXATA ao piso (39 → 31, 79 %) e a recusa logo abaixo dele, com o orçamento medido NO PISO (não na assinatura) e a mensagem em px', () => {
    // Coluna de tinta da caixa do apoio: 951 − 2×6 − 2 = 937 px; o medidor falso dá 0,55 × corpo por caractere.
    // 54 caracteres cabem só a 31 px (920 ≤ 937; a 32: 950); 55 não cabem nem a 31 (938 > 937).
    const cabe31 = medirPor(compilar(), [{ papel: 'headline', linhas: ['Café'] }, { papel: 'apoio', linhas: ['a'.repeat(54)] }])
    expect(bloco(cabe31, 'apoio')).toMatchObject({ fontSize: 31, situacao: 'cabe-reduzido', corpo: { referencia: 39, efetivo: 31, piso: 31, reducao: 0.205 } })
    const recusa = medirPor(compilar(), [{ papel: 'headline', linhas: ['Café'] }, { papel: 'apoio', linhas: ['a'.repeat(55)] }])
    const a = bloco(recusa, 'apoio')
    expect(a.situacao).toBe('nao-cabe')
    expect(a.corpo).toMatchObject({ referencia: 39, piso: 31, efetivo: null })
    expect(a.avisos.join(' ')).toMatch(/no piso da referência \(31 px, 79 % dos 39 px desenhados\)/)
    // O orçamento é medido no piso: a linha de 55 estoura por 1 caractere (54 cabem) — na assinatura (25 px) caberia e o orçamento sairia vazio.
    expect(a.orcamento).toHaveLength(1)
    expect(a.orcamento![0].caracteresQueCabem).toBe(54)
    expect(a.linhasMedidas[0].cabe).toBe(false)
    expect(recusa.cabeTudo).toBe(false)
  })

  it('corpo 8 na referência: piso 8 = teto — a copy curta sai em 8, a longa recusa sem escada', () => {
    const miudo = { ...PAGINA, layers: PAGINA.layers.map((l) => (l.id === 'apoio' ? ({ ...l, style: { ...l.style, fontSize: 8 } } as Layer) : l)) }
    expect(compilar(miudo).formatos.story.corpos).toEqual({ headline: 85, apoio: 8 })
    const curta = medirPor(compilar(miudo), [{ papel: 'headline', linhas: ['Café'] }, { papel: 'apoio', linhas: ['Sabores'] }])
    expect(bloco(curta, 'apoio')).toMatchObject({ fontSize: 8, situacao: 'cabe', corpo: { referencia: 8, piso: 8, efetivo: 8 } })
    const longa = medirPor(compilar(miudo), [{ papel: 'headline', linhas: ['Café'] }, { papel: 'apoio', linhas: ['a'.repeat(220)] }])
    expect(bloco(longa, 'apoio')).toMatchObject({ situacao: 'nao-cabe', corpo: { referencia: 8, piso: 8 } })
  })

  it('independência DENTRO do papel: a manchete longa encolhe pela largura e a segunda voz curta fica no teto (80), com a pilha cabendo', () => {
    // 'Cafédamanhãservidocedo' (22 chars, SEM espaço: não há onde distribuir) não cabe a 80 na coluna de 940 (22 × 80 × 0,55 = 968):
    // desce pela largura; 'já' cabe em 80. (Com espaços a linha seria distribuída em 2 no teto — ver o teste seguinte.)
    const m = medirPor(compilar(brunchAlto), [{ papel: 'headline', linhas: ['Cafédamanhãservidocedo', 'já'] }, { papel: 'apoio', linhas: ['Sabores'] }], assinaturaComVoz2)
    const h = bloco(m, 'headline')
    const v2 = bloco(m, 'headline2')
    expect(h.fontSize!).toBeLessThan(80)
    expect(h.fontSize!).toBeGreaterThanOrEqual(64)
    expect(v2).toMatchObject({ fontSize: 80, situacao: 'cabe', corpo: { referencia: 80, teto: 80, efetivo: 80, reducao: 0 } })
    expect(h.corpo).toMatchObject({ referencia: 80, teto: 80, efetivo: h.fontSize })
    expect(m.cabeTudo).toBe(true)
  })

  it('a linha única que não cabe no teto é DISTRIBUÍDA em linhas equilibradas no corpo desenhado (03/11/2026), não encolhida', () => {
    // 'Café da manhã servido cedo' (26 chars) não cabe a 80 na coluna de 940 (1144 px); a referência desenha 3 linhas, e a
    // quebra mais equilibrada em 2 ('Café da manhã' / 'servido cedo', 13 / 12) cabe folgada em 80: sai em 2 linhas cheias.
    const m = medirPor(compilar(brunchAlto), [{ papel: 'headline', linhas: ['Café da manhã servido cedo'] }, { papel: 'apoio', linhas: ['Sabores'] }])
    const h = bloco(m, 'headline')
    expect(h).toMatchObject({ fontSize: 80, situacao: 'cabe', linhas: 2, corpo: { referencia: 80, efetivo: 80, reducao: 0 } })
    expect(h.linhasMedidas.map((l) => l.linha)).toEqual(['Café da manhã', 'servido cedo'])
    expect(h.avisos.join(' ')).toMatch(/headline: "Café da manhã servido cedo" distribuída em 2 linhas pelo compositor/)
    expect(m.cabeTudo).toBe(true)
    // O que cabe em uma linha fica em uma.
    expect(bloco(medirPor(compilar(brunchAlto), [{ papel: 'headline', linhas: ['Café da manhã'] }, { papel: 'apoio', linhas: ['Sabores'] }]), 'headline')).toMatchObject({ fontSize: 80, linhas: 1 })
  })

  it('manchete INTEIRA na segunda voz pelo contrato (`linhasNaVoz2: [0]`): só headline2, partindo de corpos.headline (80) — sem "bloco principal"', () => {
    const copyAutoral = { blocos: [{ id: 'h', funcao: 'headline', ordem: 0, linhas: ['Café da manhã'], estilo: { linhasNaVoz2: [0] } }, { id: 'a', funcao: 'apoio', ordem: 1, linhas: ['Sabores'] }] }
    const spec = { projectId: 12, formato: 'story' as const, foto: { driveFileId: 'x' }, arquetipo: { id: compilar(brunchAlto).id }, blocos: [{ papel: 'headline' as const, linhas: ['Café da manhã'] }, { papel: 'apoio' as const, linhas: ['Sabores'] }], copyAutoral }
    const arq = prepararArquetipo(spec, { definicoes: [compilar(brunchAlto)] })!
    const m = medirCopy({ assinatura: assinaturaComVoz2, medir: medirFalso, familias: ['Montserrat'], fonteCarregada: () => true, formato: 'story', spec: spec as never, arquetipo: arq })
    expect(m.blocos.find((b) => b.id === 'headline')).toBeUndefined()
    expect(bloco(m, 'headline2')).toMatchObject({ fontSize: 80, situacao: 'cabe', corpo: { referencia: 80, efetivo: 80, piso: 64, reducao: 0 } })
    expect(bloco(m, 'headline2').avisos.join(' ')).not.toMatch(/MESMO teto/)
    expect(m.arquetipo!.papeis.headline!.corpo!.medidoCom.map((x) => x.bloco)).toEqual(['headline2'])
  })

  it('feed a partir da assinatura de STORY (escalaDoFormato 0,875): o corpo da referência sai em px LITERAIS (85), não 0,875 × — a divisão por escalaDoFormato é explícita', () => {
    // A Brunch transposta para o canvas canônico do feed (1080×1350), com as mesmas caixas e corpos.
    const feed = { ...PAGINA, width: 1080, height: 1350, tags: ['feed'], layers: PAGINA.layers.map((l) => (l.id === 'titulo' ? ({ ...l, position: { ...l.position, y: 1100 } } as Layer) : l.id === 'apoio' ? ({ ...l, position: { ...l.position, y: 1190 } } as Layer) : l.type === 'image' ? ({ ...l, size: { width: 1080, height: 1350 } } as Layer) : l)) }
    const d = compilar(feed as typeof PAGINA)
    expect(d.formatos.feed.corpos).toEqual({ headline: 85, apoio: 39 })
    const spec = { projectId: 12, formato: 'feed' as const, foto: { driveFileId: 'x' }, arquetipo: { id: d.id }, blocos: [{ papel: 'headline' as const, linhas: ['Café da manhã'] }, { papel: 'apoio' as const, linhas: ['Sabores'] }] }
    const arq = prepararArquetipo(spec, { definicoes: [d] })!
    const m = medirCopy({ assinatura, medir: medirFalso, familias: ['Montserrat'], fonteCarregada: () => true, formato: 'feed', spec, arquetipo: arq })
    expect(m.areaUtil.escalaDoFormato).toBe(0.875)
    expect([bloco(m, 'headline').fontSize, bloco(m, 'apoio').fontSize]).toEqual([85, 39])
    expect(bloco(m, 'headline').corpo).toMatchObject({ referencia: 85, efetivo: 85, piso: 68, reducao: 0 })
  })

  it('o retorno ao teto é medido também pelo medir-copy: a unidade de 3 linhas desce até 73; com 2 linhas as duas vozes voltam a 80 — e o orçamento do papel vale para as duas', () => {
    const tres = medirPor(compilar(brunchAlto), [{ papel: 'headline', linhas: ['Café', 'da', 'manhã'] }, { papel: 'apoio', linhas: ['Sabores'] }], assinaturaComVoz2)
    const duas = medirPor(compilar(brunchAlto), [{ papel: 'headline', linhas: ['Café', 'da manhã'] }, { papel: 'apoio', linhas: ['Sabores'] }], assinaturaComVoz2)
    expect([bloco(tres, 'headline').corpo!.teto, bloco(duas, 'headline').corpo!.teto]).toEqual([73, 80])
    expect([bloco(duas, 'headline').fontSize, bloco(duas, 'headline2').fontSize]).toEqual([80, 80])
    // O orçamento do papel (no corpo da referência) é o MESMO nos dois ciclos: ele não depende da copy, só do corpo e dos estilos.
    expect(tres.arquetipo!.papeis.headline!.corpo!.caracteresPorLinha).toBe(duas.arquetipo!.papeis.headline!.corpo!.caracteresPorLinha)
  })

  it('a recusa por ALTURA no piso da referência: duas linhas de manchete numa caixa de 100 px (linhasMax 3) não cabem nem a 64', () => {
    const baixa = { ...PAGINA, layers: PAGINA.layers.map((l) => (l.id === 'titulo' ? ({ ...l, content: 'Brunch\nEmpório\nFonseca', position: { ...l.position, y: 1600 }, size: { ...l.size, height: 100 }, style: { ...l.style, fontSize: 80 } } as Layer) : l)) }
    const m = medirPor(compilar(baixa), [{ papel: 'headline', linhas: ['Café', 'da manhã'] }, { papel: 'apoio', linhas: ['Sabores'] }])
    const h = bloco(m, 'headline')
    expect(h.situacao).toBe('nao-cabe')
    expect(h.avisos.join(' ')).toMatch(/altura.*no piso da referência \(64 px, 80 % dos 80 px desenhados\)/)
  })


  it('a revisão F1 CONGELADA (sem corpos) mede como antes: 70 px da assinatura, sem o campo corpo', () => {
    const m = medirPor(congelada.definicao as unknown as Definicao, [{ papel: 'headline', linhas: ['Café da manhã'] }, { papel: 'apoio', linhas: ['Sabores da manhã'] }])
    expect([bloco(m, 'headline').fontSize, bloco(m, 'apoio').fontSize]).toEqual([70, 25])
    expect(bloco(m, 'headline').corpo).toBeUndefined()
    expect(m.arquetipo!.papeis.headline!.corpo).toBeUndefined()
  })

  it('a segunda voz parte do MESMO teto absoluto (80), não de uma proporção (35/70); a unidade que não cabe desce na régua comum, em px, até caber — e tirar uma linha devolve o teto', () => {
    const duas = medirPor(compilar(brunchAlto), [{ papel: 'headline', linhas: ['Café', 'da manhã'] }, { papel: 'apoio', linhas: ['Sabores'] }], assinaturaComVoz2)
    expect([bloco(duas, 'headline').fontSize, bloco(duas, 'headline2').fontSize]).toEqual([80, 80])
    expect(bloco(duas, 'headline2').corpo).toMatchObject({ referencia: 80, efetivo: 80, piso: 64, reducao: 0 })
    // A política é DITA no bloco: os dois partem do mesmo teto; a hierarquia pode inverter.
    expect(bloco(duas, 'headline2').avisos.join(' ')).toMatch(/os 2 blocos de headline \(headline, headline2\) partem do MESMO teto de 80 px/)
    // O orçamento do papel é medido com o estilo EFETIVO de cada bloco (os dois, aqui com a mesma família) e diz de onde saiu.
    expect(duas.arquetipo!.papeis.headline!.corpo!.medidoCom.map((x) => x.bloco)).toEqual(['headline', 'headline2'])
    // Três linhas: 2 × 80 + 80 = 240 > 220 → a unidade desce 1 px por rodada na régua da referência até 73 (219 ≤ 220).
    const tres = medirPor(compilar(brunchAlto), [{ papel: 'headline', linhas: ['Café', 'da', 'manhã'] }, { papel: 'apoio', linhas: ['Sabores'] }], assinaturaComVoz2)
    expect([bloco(tres, 'headline').fontSize, bloco(tres, 'headline2').fontSize]).toEqual([73, 73])
    expect(bloco(tres, 'headline2')).toMatchObject({ situacao: 'cabe-reduzido', corpo: { referencia: 80, efetivo: 73, teto: 73 } })
    expect(tres.cabeTudo).toBe(true)
  })
})

// ── F2d (02/11/2026): o estilo DESENHADO na referência veste o bloco; a assinatura (Montserrat, branca) é a base ──
const assinaturaPesada = montarAssinatura({
  pagina: {
    id: 'assinatura-3',
    name: 'Story base',
    width: 1080,
    height: 1920,
    layers: [
      texto('headline', { fontFamily: 'Montserrat', fontSize: 70, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 5, color: '#CAB371', lineHeight: 1.2 }),
      texto('headline2', { fontFamily: 'Montserrat', fontSize: 35, color: '#CAB371', lineHeight: 1 }),
      texto('apoio', { fontFamily: 'Montserrat', fontSize: 38, color: '#CAB371', lineHeight: 1 }),
    ],
  },
  formatoDaPagina: 'story',
  numerosDoProjeto: null,
  logoDoProjeto: { url: 'https://x/logo.png', razao: 65 / 200 },
})
const estiloDe = (m: ReturnType<typeof medirCopy>, id: string) => bloco(m, id).estilo!

describe('F2d · o estilo da referência no medir-copy', () => {
  it('o bloco sai na família e na cor da referência, com a caixa e o espaçamento dela — e a origem de cada campo é dita', () => {
    const m = medirPor(compilar(), [{ papel: 'headline', linhas: ['Café da manhã'] }, { papel: 'apoio', linhas: ['Sabores da manhã'] }], assinaturaPesada)
    expect(bloco(m, 'headline')).toMatchObject({ fonte: 'TrajanPro Regular', fontSize: 85 })
    expect(estiloDe(m, 'headline')).toMatchObject({ fontFamily: 'TrajanPro Regular', fontWeight: null, textTransform: 'uppercase', letterSpacing: 0, color: '#F8F8F8' })
    expect(estiloDe(m, 'headline').origem).toMatchObject({ fontFamily: 'referencia', fontWeight: 'referencia', color: 'referencia', sombra: 'assinatura' })
    // O apoio: espaçamento 3 px NO corpo desenhado (39 → 3,00).
    expect(estiloDe(m, 'apoio')).toMatchObject({ fontFamily: 'TrajanPro Regular', letterSpacing: 3, color: '#F8F8F8' })
    expect(bloco(m, 'apoio').fontSize).toBe(39)
  })

  it('as AUSÊNCIAS da referência vencem: o peso 700 e a caixa alta da assinatura são limpos quando a página não os desenha', () => {
    const semCaixa = { ...PAGINA, layers: PAGINA.layers.map((l) => (l.id === 'titulo' ? ({ ...l, style: { ...l.style, textTransform: undefined } } as Layer) : l)) }
    const m = medirPor(compilar(semCaixa), [{ papel: 'headline', linhas: ['Café da manhã'] }, { papel: 'apoio', linhas: ['Sabores'] }], assinaturaPesada)
    expect(estiloDe(m, 'headline')).toMatchObject({ fontWeight: null, textTransform: null })
  })

  it('o espaçamento é derivado do corpo MATERIALIZADO: 39 → 3,00; no piso 31 → 2,38 (e não da escala contínua)', () => {
    const m = medirPor(compilar(), [{ papel: 'headline', linhas: ['Café'] }, { papel: 'apoio', linhas: ['a'.repeat(54)] }], assinaturaPesada)
    expect(bloco(m, 'apoio')).toMatchObject({ fontSize: 31, corpo: { efetivo: 31, piso: 31 } })
    expect(estiloDe(m, 'apoio').letterSpacing).toBe(2.38)
  })

  it('feed a partir da assinatura de story (0,875), base 38 ≠ referência 39, degrau intermediário: 31 px → 2,38, não 2,42', () => {
    const feed = { ...PAGINA, width: 1080, height: 1350, tags: ['feed'], layers: PAGINA.layers.map((l) => (l.id === 'titulo' ? ({ ...l, position: { ...l.position, y: 1100 } } as Layer) : l.id === 'apoio' ? ({ ...l, position: { ...l.position, y: 1190 } } as Layer) : l.type === 'image' ? ({ ...l, size: { width: 1080, height: 1350 } } as Layer) : l)) }
    const d = compilar(feed as typeof PAGINA)
    const spec = { projectId: 12, formato: 'feed' as const, foto: { driveFileId: 'x' }, arquetipo: { id: d.id }, blocos: [{ papel: 'headline' as const, linhas: ['Café'] }, { papel: 'apoio' as const, linhas: ['a'.repeat(54)] }] }
    const arq = prepararArquetipo(spec, { definicoes: [d] })!
    const m = medirCopy({ assinatura: assinaturaPesada, medir: medirFalso, familias: ['Montserrat'], fonteCarregada: () => true, formato: 'feed', spec, arquetipo: arq })
    expect(m.areaUtil.escalaDoFormato).toBe(0.875)
    expect(bloco(m, 'apoio').fontSize).toBe(31)
    expect(estiloDe(m, 'apoio').letterSpacing).toBe(2.38)
    const specCurta = { ...spec, blocos: [{ papel: 'headline' as const, linhas: ['Café'] }, { papel: 'apoio' as const, linhas: ['Sabores'] }] }
    const curta = medirCopy({ assinatura: assinaturaPesada, medir: medirFalso, familias: ['Montserrat'], fonteCarregada: () => true, formato: 'feed', spec: specCurta, arquetipo: prepararArquetipo(specCurta, { definicoes: [d] })! })
    expect([bloco(curta, 'apoio').fontSize, estiloDe(curta, 'apoio').letterSpacing]).toEqual([39, 3])
  })

  it('a segunda voz toma SÓ a cor da referência: a família, o peso e a entrelinha ficam da assinatura', () => {
    const m = medirPor(compilar(brunchAlto), [{ papel: 'headline', linhas: ['Café', 'da manhã'] }, { papel: 'apoio', linhas: ['Sabores'] }], assinaturaPesada)
    expect(estiloDe(m, 'headline2')).toMatchObject({ fontFamily: 'Montserrat', color: '#F8F8F8' })
    expect(estiloDe(m, 'headline2').origem).toMatchObject({ fontFamily: 'assinatura', color: 'referencia' })
    expect(estiloDe(m, 'headline')).toMatchObject({ fontFamily: 'TrajanPro Regular', color: '#F8F8F8' })
  })

  it('a família da referência entra na conferência de fontes: não carregada → o bloco sai naoMedido (nunca apresentado como medido)', () => {
    const d = compilar()
    const spec = { projectId: 12, formato: 'story' as const, foto: { driveFileId: 'x' }, arquetipo: { id: d.id }, blocos: [{ papel: 'headline' as const, linhas: ['Café'] }, { papel: 'apoio' as const, linhas: ['Sabores'] }] }
    const arq = prepararArquetipo(spec, { definicoes: [d] })!
    const m = medirCopy({ assinatura: assinaturaPesada, medir: medirFalso, familias: ['Montserrat'], fonteCarregada: (f) => f !== 'TrajanPro Regular', formato: 'story', spec, arquetipo: arq })
    expect(bloco(m, 'headline').naoMedido).toBe(true)
    expect(m.fontesNaoCarregadas).toContain('TrajanPro Regular')
  })

  it('o orçamento do papel SEM bloco nesta copy sai na família da referência (a assinatura vestida), não na da assinatura crua', () => {
    const m = medirPor(compilar(), [{ papel: 'headline', linhas: ['Café'] }], assinaturaPesada)
    expect(m.arquetipo!.papeis.apoio!.corpo!.medidoCom).toEqual([{ bloco: 'apoio', fonte: 'TrajanPro Regular', caracteresPorLinha: expect.any(Number) }])
  })
})

/** Um medidor que CONTA o espaçamento (o `medirFalso` o ignora): largura = n × corpo × 0,55 + (n − 1) × letterSpacing. */
const medirComEspaco = (layer: Layer) => {
  if (layer.type !== 'text') return null
  const fontSize = Number(layer.style?.fontSize ?? 16)
  const ls = Number(layer.style?.letterSpacing ?? 0)
  const linhas = (layer.content ?? '').split('\n')
  const larguraDe = (l: string) => l.length * fontSize * 0.55 + Math.max(0, l.length - 1) * ls
  const largura = Math.max(...linhas.map(larguraDe))
  const height = linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1)
  return { height, maxLineWidth: largura, lineCount: linhas.length, linhas: linhas.map((l) => ({ texto: l, largura: larguraDe(l) })) }
}

describe('F2d · rodada 1 do Codex: destaque, larguras e origem nas recusas', () => {
  const familias = ['Montserrat', 'TrajanPro Regular', 'TrajanPro Bold']
  const medirCom = (fonteCarregada: (f: string) => boolean, linhas: string[], medir = medirFalso) => {
    const d = compilar()
    const spec = { projectId: 12, formato: 'story' as const, foto: { driveFileId: 'x' }, arquetipo: { id: d.id }, blocos: [{ papel: 'headline' as const, linhas }, { papel: 'apoio' as const, linhas: ['Sabores'] }] }
    return medirCopy({ assinatura: assinaturaPesada, medir, familias, fonteCarregada, formato: 'story', spec, arquetipo: prepararArquetipo(spec, { definicoes: [d] })! })
  }

  it('[colchetes] na copy: a camada preparada é rich-text, mas a remedição mede pela camada SIMPLES com os valores materializados (o medidor só mede text) — largura, cabe e caracteres continuam vindo; a família pesada é derivada da referência', () => {
    const m = medirCom(() => true, ['Café [da manhã]'])
    const h = bloco(m, 'headline')
    expect(h.aproximado).toBe(true)
    expect(h.naoMedido).toBe(false)
    expect(h.linhasMedidas[0].largura).not.toBeNull()
    expect(h.linhasMedidas[0].cabe).toBe(true)
    expect(h.linhasMedidas[0].caracteresQueCabem).toBeGreaterThan(10)
    expect(estiloDe(m, 'headline').fontFamily).toBe('TrajanPro Regular')
  })

  it('o destaque derivado da referência (TrajanPro Bold) que não carregou deixa o bloco naoMedido e consta em fontesNaoCarregadas', () => {
    const m = medirCom((f) => f !== 'TrajanPro Bold', ['Café [da manhã]'])
    expect(bloco(m, 'headline').naoMedido).toBe(true)
    expect(m.fontesNaoCarregadas).toContain('TrajanPro Bold')
  })

  it('a largura medida usa o espaçamento MATERIALIZADO (2,38 no piso 31), não o da escala contínua', () => {
    const m = medirCom(() => true, ['Café'], medirComEspaco)
    // O apoio curto ('Sabores', 7 letras) a 39 px com 3 px de espaçamento: 7 × 39 × 0,55 + 6 × 3 = 150,15 + 18.
    expect(bloco(m, 'apoio').linhasMedidas[0].largura).toBe(Math.round(7 * 39 * 0.55 + 6 * 3))
    const d = compilar()
    // 48 caracteres cabem só a 31 px CONTANDO o espaçamento (48 × 17,05 + 47 × 2,38 = 930 ≤ 937; a 32: 960): o encaixe
    // da escada e a remedição usam a mesma largura, com o espaçamento materializado.
    const spec = { projectId: 12, formato: 'story' as const, foto: { driveFileId: 'x' }, arquetipo: { id: d.id }, blocos: [{ papel: 'headline' as const, linhas: ['Café'] }, { papel: 'apoio' as const, linhas: ['a'.repeat(48)] }] }
    const m2 = medirCopy({ assinatura: assinaturaPesada, medir: medirComEspaco, familias, fonteCarregada: () => true, formato: 'story', spec, arquetipo: prepararArquetipo(spec, { definicoes: [d] })! })
    const a = bloco(m2, 'apoio')
    expect(a.fontSize).toBe(31)
    expect(estiloDe(m2, 'apoio').letterSpacing).toBe(2.38)
    expect(a.linhasMedidas[0].largura).toBe(Math.round(48 * 31 * 0.55 + 47 * 2.38))
  })

  it('a RECUSA publica o estilo com que foi medida (no piso) e a origem por campo', () => {
    const m = medirPor(compilar(), [{ papel: 'headline', linhas: ['Café'] }, { papel: 'apoio', linhas: ['a'.repeat(55)] }], assinaturaPesada)
    const a = bloco(m, 'apoio')
    expect(a.situacao).toBe('nao-cabe')
    expect(a.estilo).toMatchObject({ fontFamily: 'TrajanPro Regular', letterSpacing: 2.38, color: '#F8F8F8' })
    expect(a.estilo!.origem.fontFamily).toBe('referencia')
  })
})

describe('F2d · rodada 2 do Codex: a largura no FEED (0,875) com o espaçamento materializado', () => {
  it('base 38 ≠ referência 39, degrau 31,4 → 31 px: a largura medida conta 2,38 por caractere e a escada encaixa pela mesma largura', () => {
    const feed = { ...PAGINA, width: 1080, height: 1350, tags: ['feed'], layers: PAGINA.layers.map((l) => (l.id === 'titulo' ? ({ ...l, position: { ...l.position, y: 1100 } } as Layer) : l.id === 'apoio' ? ({ ...l, position: { ...l.position, y: 1190 } } as Layer) : l.type === 'image' ? ({ ...l, size: { width: 1080, height: 1350 } } as Layer) : l)) }
    const d = compilar(feed as typeof PAGINA)
    // 48 caracteres cabem só a 31 px contando o espaçamento (930 ≤ 937; a 32 px: 960).
    const spec = { projectId: 12, formato: 'feed' as const, foto: { driveFileId: 'x' }, arquetipo: { id: d.id }, blocos: [{ papel: 'headline' as const, linhas: ['Café'] }, { papel: 'apoio' as const, linhas: ['a'.repeat(48)] }] }
    const m = medirCopy({ assinatura: assinaturaPesada, medir: medirComEspaco, familias: ['Montserrat', 'TrajanPro Regular', 'TrajanPro Bold'], fonteCarregada: () => true, formato: 'feed', spec, arquetipo: prepararArquetipo(spec, { definicoes: [d] })! })
    expect(m.areaUtil.escalaDoFormato).toBe(0.875)
    const a = bloco(m, 'apoio')
    expect([a.fontSize, estiloDe(m, 'apoio').letterSpacing, a.situacao]).toEqual([31, 2.38, 'cabe-reduzido'])
    expect(a.linhasMedidas[0].largura).toBe(Math.round(48 * 31 * 0.55 + 47 * 2.38))
    expect(a.width).toBe(Math.min(937, Math.ceil(48 * 31 * 0.55 + 47 * 2.38)) + 14)
  })
})
