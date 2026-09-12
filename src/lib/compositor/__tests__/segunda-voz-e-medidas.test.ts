import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { dividirManchete } from '../segunda-voz'
import { medidasFinaisDasCamadas } from '../medidas'
import { escolherVariante } from '../assinatura'
import { specComAPosicaoOriginal } from '../defasagem'
import { validarSpec, type SpecDePeca } from '../spec'
import { VERSAO_DO_CONTRATO, copyEfetivaDasCamadas, validarCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'

describe('a segunda voz da manchete é do AUTOR', () => {
  const linhas = ['Milk-shake', 'vem', 'em dobro']
  it('com contrato e declaração: as linhas declaradas (o fim) vão na voz 2', () => {
    expect(dividirManchete(linhas, { temSegundaVoz: true, comContrato: true, declaradas: [1, 2] })).toEqual({ voz1: ['Milk-shake'], voz2: ['vem', 'em dobro'], origem: 'contrato', aviso: null })
  })
  it('com contrato e SEM declaração: manchete inteira na voz 1, mesmo com headline2 na variante', () => {
    expect(dividirManchete(linhas, { temSegundaVoz: true, comContrato: true, declaradas: null })).toEqual({ voz1: linhas, voz2: [], origem: 'nenhuma', aviso: null })
  })
  it('declaração numa variante sem voz 2: não some em silêncio — aviso', () => {
    const d = dividirManchete(linhas, { temSegundaVoz: false, comContrato: true, declaradas: [2] })
    expect(d.voz2).toEqual([])
    expect(d.aviso).toMatch(/não tem "headline2"/)
  })
  it('declaração fora do fim (não contígua): aviso, e a manchete fica inteira na voz 1', () => {
    const d = dividirManchete(linhas, { temSegundaVoz: true, comContrato: true, declaradas: [0] })
    expect(d.voz2).toEqual([])
    expect(d.aviso).toMatch(/ÚLTIMAS linhas/)
  })
  it('sem contrato (legado): a última linha, como antes', () => {
    expect(dividirManchete(linhas, { temSegundaVoz: true, comContrato: false })).toEqual({ voz1: ['Milk-shake', 'vem'], voz2: ['em dobro'], origem: 'legado', aviso: null })
    expect(dividirManchete(['Só uma'], { temSegundaVoz: true, comContrato: false }).origem).toBe('nenhuma')
  })
  it('o contrato recusa segunda voz que não seja o fim contíguo da manchete', () => {
    const base: CopyAutoral = { versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude' }, blocos: [{ id: 'headline', funcao: 'headline', ordem: 0, linhas, estilo: { linhasNaVoz2: [0] } }], revisoes: [] }
    expect(validarCopyAutoral(base).problemas.map((p) => p.mensagem).join(' ')).toMatch(/ÚLTIMAS linhas/)
    expect(validarCopyAutoral({ ...base, blocos: [{ ...base.blocos[0], estilo: { linhasNaVoz2: [1, 2] } }] }).problemas).toEqual([])
    expect(validarCopyAutoral({ ...base, blocos: [{ ...base.blocos[0], estilo: { linhasNaVoz2: [2] } }] }).problemas).toEqual([])
  })
})

describe('as medidas finais e o prefixo declarado', () => {
  const camada = (id: string, papel: string, extra: Partial<Layer> = {}): Layer =>
    ({ id, name: id, type: 'text', visible: true, locked: false, order: 1, content: 'a\nb', position: { x: 0, y: 0 }, size: { width: 500.4, height: 120.6 }, style: { fontFamily: 'Lato', fontSize: 48, lineHeight: 1.1 }, textboxConfig: { autoWrap: { lineHeight: 1.05 } }, metadata: { compositor: { papel } }, ...extra }) as Layer
  it('lê corpo, entrelinha (do autoWrap), caixa arredondada, linhas e o prefixo; marca não medido pela família que não carregou', () => {
    const m = medidasFinaisDasCamadas([camada('headline', 'headline'), camada('cta', 'cta', { metadata: { compositor: { papel: 'cta', prefixo: '→ ' } } } as Partial<Layer>), { ...camada('x', 'apoio'), visible: false } as Layer, { ...camada('logo', 'logo'), type: 'image' } as Layer], new Set(['Lato']))
    expect(m).toHaveLength(2)
    expect(m[0]).toEqual({ id: 'headline', papel: 'headline', fontFamily: 'Lato', fontSize: 48, lineHeight: 1.05, width: 500, height: 121, linhas: 2, naoMedido: true })
    expect(m[1].prefixo).toBe('→ ')
    expect(medidasFinaisDasCamadas([camada('headline', 'headline')])[0].naoMedido).toBe(false)
  })
  it('voz 2 declarada e NÃO desenhada (variante sem headline2): a efetiva sai sem linhasNaVoz2 e o diff aponta o estilo', () => {
    const contrato: CopyAutoral = { versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude' }, blocos: [{ id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Título fiel', 'ao contrato'], estilo: { linhasNaVoz2: [1] } }], revisoes: [] }
    const r = copyEfetivaDasCamadas(contrato, [camada('headline', 'headline', { content: 'Título fiel\nao contrato' } as Partial<Layer>)], { superficie: 'compositor' })
    expect(r.efetiva.blocos[0].estilo).toBeUndefined()
    expect(r.mudancas).toEqual([expect.objectContaining({ id: 'headline', campos: ['estilo'] })])
  })

  it('a copy efetiva desconta o prefixo DECLARADO pelo compositor; sem declaração ele conta como diferença', () => {
    const contrato: CopyAutoral = { versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude' }, blocos: [{ id: 'cta', funcao: 'cta', ordem: 0, linhas: ['Conheça nossos pacotes'] }], revisoes: [] }
    const declarado = [camada('cta', 'cta', { content: '→ Conheça nossos pacotes', metadata: { compositor: { papel: 'cta', prefixo: '→ ' } } } as Partial<Layer>)]
    expect(copyEfetivaDasCamadas(contrato, declarado, { superficie: 'compositor' }).mudancas).toEqual([])
    const naoDeclarado = [camada('cta', 'cta', { content: '→ Conheça nossos pacotes' } as Partial<Layer>)]
    expect(copyEfetivaDasCamadas(contrato, naoDeclarado, { superficie: 'compositor' }).mudancas.map((m) => m.id)).toEqual(['cta'])
  })
})

describe('a variante fixada por id', () => {
  const paginas = [
    { id: 'pg-a', name: 'Assinatura — story', tags: ['assinatura'], width: 1080, height: 1920 },
    { id: 'pg-b', name: 'Promoção pg-a', tags: ['assinatura', 'promocao'], width: 1080, height: 1920 },
  ] as never[]
  it('o id da página vence o nome que o contém', () => {
    const r = escolherVariante(paginas as never, { formato: 'story', variante: 'pg-a' })
    expect(r.pagina && (r.pagina as { id: string }).id).toBe('pg-a')
    expect(r.motivo).toBe('fixada por id')
  })
  it('a recomposição fixa a variante pelo pageId da composição original, sem mexer em quem já pediu', () => {
    const spec = { projectId: 8, formato: 'story', blocos: [{ papel: 'headline', linhas: ['x'] }] } as unknown as SpecDePeca
    const fv = { composicao: { posicao: { ancora: 'topo', alinha: 'esquerda' }, assinatura: { pageId: 'pg-b' } } }
    expect(specComAPosicaoOriginal(spec, fv).preferencias).toEqual({ variante: 'pg-b', ancora: 'topo', alinha: 'esquerda' })
    expect(specComAPosicaoOriginal({ ...spec, preferencias: { variante: 'pg-a' } }, fv).preferencias?.variante).toBe('pg-a')
    expect(specComAPosicaoOriginal(spec, { composicao: { assinatura: { pageId: 'pg-b' } } }).preferencias).toEqual({ variante: 'pg-b' })
    expect(validarSpec(specComAPosicaoOriginal(spec, fv)).problemas).toEqual([])
  })
})
