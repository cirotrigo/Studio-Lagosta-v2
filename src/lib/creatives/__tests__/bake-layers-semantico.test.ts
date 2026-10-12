/**
 * B1c: `bakeLayers` recebe os valores semânticos JÁ RESOLVIDOS por índice
 * (`resolverValoresSemanticos`, sobre o mesmo array) e os aplica na ordem
 * `id legado → semântico → nome legado`. Não recalcula conflito (quem resolveu
 * já recusou fontes divergentes) e não muda nada sem eles.
 */
import { describe, expect, it } from 'vitest'
import { bakeLayers } from '../bake-layers'

const texto = (id: string, name: string, content = 'Modelo') => ({ id, name, type: 'text', content, visible: true })
const valor = (indice: number, v: unknown) => [indice, { indice, valor: v, origem: { tipo: 'slotId', chave: 's' } }] as const

describe('bakeLayers com valores semânticos por índice', () => {
  it('aplica pelo ÍNDICE, sem achatar para chave (nada vaza pelo nome)', () => {
    // a camada 1 tem como NOME o id da camada 0: por chave, o valor cairia nas duas
    const camadas = [texto('x', 'Título'), texto('y', 'x')]
    const r = bakeLayers(camadas, {}, null, new Map([valor(0, 'Novo')]))
    expect(r.layers.map((l) => l.content)).toEqual(['Novo', 'Modelo'])
    expect(r.changedTextIds).toEqual(['x'])
  })

  it('a chave legada pelo id vem antes; o semântico antes da chave pelo nome', () => {
    const camadas = [texto('a', 'n-a'), texto('b', 'n-b')]
    const r = bakeLayers(camadas, { a: 'legado-id', 'n-b': 'legado-nome' }, null, new Map([valor(0, 'sem'), valor(1, 'sem')]))
    expect(r.layers.map((l) => l.content)).toEqual(['legado-id', 'sem'])
  })

  it('{ fileUrl } semântico numa imagem: aplicado e a camada sai do alvo da foto', () => {
    const img = { id: 'i', name: 'I', type: 'image', isDynamic: true, visible: true }
    const r = bakeLayers([img], {}, 'https://foto', new Map([valor(0, { fileUrl: 'https://pedida' })]))
    expect(r.layers[0].fileUrl).toBe('https://pedida')
    expect(r.imageApplied).toBe(false)
  })

  it('sem valores (ou mapa vazio): exatamente o resultado de hoje', () => {
    const camadas = [texto('a', 'headline'), texto('b', 'apoio')]
    const sv = { headline: 'X', b: { content: 'Y' } }
    expect(bakeLayers(camadas, sv, null, new Map())).toEqual(bakeLayers(camadas, sv, null))
  })
})

describe('opção C (#208): fileUrl SEMÂNTICO no primeiro alvo da foto é estrito; o legado segue como sempre', () => {
  const dyn = (id: string) => ({ id, name: id, type: 'image', isDynamic: true, visible: true })
  const semantico = (i: number, fileUrl: string) => new Map([valor(i, { fileUrl })])

  it('1. semântico no primeiro alvo: preserva, não escorre para a segunda, imageApplied false e motivo', () => {
    const r = bakeLayers([dyn('bg'), dyn('segunda')], {}, 'https://generica', semantico(0, 'https://semantica'))
    expect(r.layers.map((l) => l.fileUrl)).toEqual(['https://semantica', undefined])
    expect(r.imageApplied).toBe(false)
    expect(r.imageBloqueadaPeloSemantico).toBe(true)
  })

  it('2. semântico na segunda, primeira livre: a genérica vai para a primeira', () => {
    const r = bakeLayers([dyn('bg'), dyn('segunda')], {}, 'https://generica', semantico(1, 'https://semantica'))
    expect(r.layers.map((l) => l.fileUrl)).toEqual(['https://generica', 'https://semantica'])
    expect(r.imageApplied).toBe(true)
    expect(r.imageBloqueadaPeloSemantico).toBe(false)
  })

  it('3. LEGADO por layerId no primeiro alvo: comportamento histórico (a genérica cai na próxima dinâmica)', () => {
    const r = bakeLayers([dyn('bg'), dyn('segunda')], { bg: { fileUrl: 'https://legado' } }, 'https://generica')
    expect(r.layers.map((l) => l.fileUrl)).toEqual(['https://legado', 'https://generica'])
    expect(r.imageApplied).toBe(true)
    expect(r.imageBloqueadaPeloSemantico).toBe(false)
  })

  it('3b. LEGADO pelo nome no primeiro alvo: idem', () => {
    const r = bakeLayers([{ ...dyn('bg'), name: 'Fundo' }, dyn('segunda')], { Fundo: { fileUrl: 'https://legado' } }, 'https://generica')
    expect(r.layers.map((l) => l.fileUrl)).toEqual(['https://legado', 'https://generica'])
  })

  it('4. origem semanticRole (_papeis): mesma regra de _slots', () => {
    const papel = new Map([[0, { indice: 0, valor: { fileUrl: 'https://papel' }, origem: { tipo: 'semanticRole' as const, chave: 'foto' } }]])
    const r = bakeLayers([dyn('bg'), dyn('segunda')], {}, 'https://generica', papel)
    expect(r.layers.map((l) => l.fileUrl)).toEqual(['https://papel', undefined])
    expect(r.imageBloqueadaPeloSemantico).toBe(true)
  })
})
