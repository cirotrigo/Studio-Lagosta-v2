/**
 * B1c: `bakeLayers` recebe os valores semânticos JÁ RESOLVIDOS por índice
 * (`resolverValoresSemanticos`, sobre o mesmo array) e os aplica na ordem
 * `id legado → semântico → nome legado`. Não recalcula conflito (quem resolveu
 * já recusou fontes divergentes) e não muda nada sem eles.
 */
import { describe, expect, it } from 'vitest'
import { bakeLayers, copyRemovidaDoBake } from '../bake-layers'
import { resolverValoresSemanticos } from '@/lib/semantica/resolver-valores'

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

describe('CP4.1 — copyRemovidaDoBake: o que o bake fez com a copy existente (resultado, não sintaxe)', () => {
  const t = (id: string, content: string, extra: Record<string, unknown> = {}) => ({ id, name: id, type: 'text', content, visible: true, ...extra })
  const camadas = () => [t('headline', 'Almoço', { metadata: { compositor: { papel: 'headline' } } }), t('cta', 'Reserve'), t('vazio', '  '), { id: 'foto', name: 'Foto', type: 'image', visible: true, fileUrl: 'x' }, t('rico', 'Rico', { type: 'rich-text' })]
  const remocoes = (slotValues: Record<string, unknown>) => {
    const src = camadas()
    const valores = resolverValoresSemanticos(src as never, slotValues).valores
    return copyRemovidaDoBake(src, bakeLayers(src, slotValues, null, valores).layers, slotValues, valores)
  }
  it('esconder, esvaziar (string, espaço, {content}), por id, por nome, por _slots/_papeis; texto vazio e imagem não contam; rich-text conta', () => {
    expect(remocoes({ cta: { hidden: true } })).toEqual([expect.objectContaining({ layerId: 'cta', operacao: 'escondido', endereco: { tipo: 'layerId', chave: 'cta' } })])
    expect(remocoes({ cta: '' })).toEqual([expect.objectContaining({ layerId: 'cta', operacao: 'esvaziado' })])
    expect(remocoes({ cta: '   ' })).toEqual([expect.objectContaining({ layerId: 'cta', operacao: 'esvaziado' })])
    expect(remocoes({ cta: { content: '' } })).toEqual([expect.objectContaining({ layerId: 'cta', operacao: 'esvaziado' })])
    expect(remocoes({ rico: { hidden: true } })).toEqual([expect.objectContaining({ layerId: 'rico', operacao: 'escondido' })])
    expect(remocoes({ vazio: { hidden: true }, foto: { hidden: true } })).toEqual([])
    expect(remocoes({ cta: 'Outro texto' })).toEqual([])
    expect(remocoes({ _papeis: { headline: '' } })).toEqual([expect.objectContaining({ layerId: 'headline', endereco: { tipo: 'semanticRole', chave: 'headline' } })])
  })
  it('a chave de NOME atinge TODAS as camadas com esse nome: uma entrada, duas remoções, por camada', () => {
    const src = [t('a', 'Um', { name: 'Texto' }), t('b', 'Dois', { name: 'Texto' })]
    const slotValues = { Texto: '' }
    expect(copyRemovidaDoBake(src, bakeLayers(src, slotValues, null).layers, slotValues).map((c) => [c.layerId, c.endereco])).toEqual([
      ['a', { tipo: 'name', chave: 'Texto' }],
      ['b', { tipo: 'name', chave: 'Texto' }],
    ])
  })
  it('camada já escondida pela PESSOA fica de fora; escondida pelo REVISOR (marca) conta como presente e esvaziá-la é remoção', () => {
    const src = [t('x', 'Oculto pela pessoa', { visible: false }), t('y', 'Oculto pelo revisor', { visible: false, metadata: { revisao: { ocultaPeloRevisor: { em: '2026-10-15T00:00:00.000Z', ajuste: 0 } } } })]
    const slotValues = { x: '', y: '' }
    // Esvaziar destrói conteúdo nas duas (a visibilidade não protege o texto); esconder a do revisor conta como esconder.
    expect(copyRemovidaDoBake(src, bakeLayers(src, slotValues, null).layers, slotValues).map((c) => [c.layerId, c.operacao])).toEqual([['x', 'esvaziado'], ['y', 'esvaziado']])
    const esconder = { y: { hidden: true }, x: { hidden: true } }
    expect(copyRemovidaDoBake(src, bakeLayers(src, esconder, null).layers, esconder).map((c) => [c.layerId, c.operacao])).toEqual([['y', 'escondido']])
  })
  it('CP4.1 (revisores A/B) — invisíveis são vazio; `{ content: "", hidden: true }` registra as DUAS operações', () => {
    for (const invisivel of ['\u200b', '\u200d', '\u2060', '\u00ad', '\u034f', '\u3164', '\u2800', '\ufeff']) expect(remocoes({ cta: invisivel }).map((c) => c.operacao)).toEqual(['esvaziado'])
    expect(remocoes({ cta: { content: '', hidden: true } }).map((c) => c.operacao)).toEqual(['esvaziado', 'escondido'])
  })
})
