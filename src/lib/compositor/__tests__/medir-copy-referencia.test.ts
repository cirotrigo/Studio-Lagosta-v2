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
    // Três linhas: 2 × 80 + 80 = 240 > 220 → a unidade desce 1 px por rodada na régua da referência até 73 (219 ≤ 220).
    const tres = medirPor(compilar(brunchAlto), [{ papel: 'headline', linhas: ['Café', 'da', 'manhã'] }, { papel: 'apoio', linhas: ['Sabores'] }], assinaturaComVoz2)
    expect([bloco(tres, 'headline').fontSize, bloco(tres, 'headline2').fontSize]).toEqual([73, 73])
    expect(bloco(tres, 'headline2')).toMatchObject({ situacao: 'cabe-reduzido', corpo: { referencia: 80, efetivo: 73, teto: 73 } })
    expect(tres.cabeTudo).toBe(true)
  })
})
