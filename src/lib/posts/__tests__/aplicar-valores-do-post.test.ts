/**
 * B1d — checkpoint b: `aplicarValoresDoPost`, o helper PURO que o render e a leitura vão compartilhar.
 *
 * Sem contrato novo: exatamente o legado de hoje (`aplicarSlotNaCamada`, o oráculo do render — não o
 * `bakeLayers`). Com `_slots`/`_papeis`: valida, resolve UMA vez (`resolverValoresSemanticos`), recusa os erros e
 * aplica por ÍNDICE no MESMO array recebido, antes de qualquer ordenação.
 */
import { describe, expect, it } from 'vitest'
import type { DesignData } from '@/types/template'

import { aplicarValoresDoPost } from '../aplicar-valores-do-post'
import { applySlotValues } from '../page-to-design-data'

type Camada = Record<string, unknown> & { id: string }
const texto = (id: string, extra: Record<string, unknown> = {}): Camada => ({ id, name: id, type: 'text', content: `modelo ${id}`, visible: true, ...extra })
const declarada = (papel: string, slot?: string) => ({ metadata: { compositor: { papel }, ...(slot ? { slot: { id: slot } } : {}) } })
/** O que o render faz hoje com o mapa legado. */
const oraculo = (camadas: Camada[], sv: Record<string, unknown>) => applySlotValues({ layers: camadas } as unknown as DesignData, sv).layers

describe('sem contrato novo: exatamente o legado de hoje (oráculo = applySlotValues)', () => {
  const camadas = [texto('t-h', { name: 'Título' }), texto('t-s'), { id: 'img', name: 'Foto', type: 'image', fileUrl: 'antiga', visible: true }, { id: 'rt', name: 'Rico', type: 'rich-text', content: 'rico', visible: true }]
  const casos: Array<[string, Record<string, unknown>]> = [
    ['por id', { 't-h': 'Por id' }],
    ['por nome', { Título: 'Por nome' }],
    ['id vence nome', { 't-h': 'Id', Título: 'Nome' }],
    ['9. string "" mantém o conteúdo', { 't-h': '' }],
    ['10. { content: "" } esvazia', { 't-h': { content: '' } }],
    ['{ fileUrl } como hoje', { img: { fileUrl: 'nova' } }],
    ['8. rich-text legado como hoje', { rt: 'Novo rico', Rico: { content: 'x' } }],
    ['11. chave desconhecida tolerada', { inexistente: 'X', 't-s': 'Y' }],
    ['controles `_…`', { _driveImageId: 'd1', _imageUrl: 'u', 't-s': 'Y' }],
  ]

  it.each(casos)('%s', (_n, sv) => {
    const r = aplicarValoresDoPost(camadas, sv)
    expect(r.semantico).toBe(false)
    expect(r.erros).toEqual([])
    expect(r.camadas).toEqual(oraculo(camadas, sv))
  })

  it('11. o diagnóstico de chave desconhecida é o de hoje (controles `_…` não entram)', () => {
    expect(aplicarValoresDoPost(camadas, { inexistente: 'X', _driveImageId: 'd', 't-s': 'Y' }).avisos).toEqual([{ codigo: 'CHAVE_SEM_CAMADA', chaves: ['inexistente'] }])
    expect(aplicarValoresDoPost(camadas, { 't-s': 'Y' }).avisos).toEqual([])
  })

  it('sem slotValues: as camadas voltam iguais', () => {
    expect(aplicarValoresDoPost(camadas, undefined)).toEqual({ camadas, semantico: false, erros: [], avisos: [] })
  })
})

describe('com contrato novo: valida, resolve uma vez, aplica por índice no array original', () => {
  it('1–2. A (order 20) antes de B (order 1): o slot de A cai em A, na posição original, sem ordenar', () => {
    const camadas = [texto('a', { order: 20, metadata: { slot: { id: 'sa' } } }), texto('b', { order: 1, metadata: { slot: { id: 'sb' } } })]
    const r = aplicarValoresDoPost(camadas, { _slots: { sa: 'Para A' } })
    expect(r.semantico).toBe(true)
    expect(r.erros).toEqual([])
    expect(r.camadas.map((c) => [c.id, c.content, c.order])).toEqual([['a', 'Para A', 20], ['b', 'modelo b', 1]])
  })

  it('o array recebido não é mutado', () => {
    const camadas = [texto('a', { metadata: { slot: { id: 's' } } })]
    aplicarValoresDoPost(camadas, { _slots: { s: 'X' } })
    expect(camadas[0].content).toBe('modelo a')
  })

  it('_papeis com papel DECLARADO e único', () => {
    const r = aplicarValoresDoPost([texto('h', declarada('headline'))], { _papeis: { headline: 'Por papel' } })
    expect(r.camadas[0].content).toBe('Por papel')
  })

  it('3. id legado × slot semântico EQUIVALENTE: sucesso, aplicado uma vez', () => {
    const r = aplicarValoresDoPost([texto('h', { metadata: { slot: { id: 's' } } })], { h: 'Igual', _slots: { s: 'Igual' } })
    expect(r.erros).toEqual([])
    expect(r.camadas[0].content).toBe('Igual')
  })

  it('legado e semântico em camadas DIFERENTES coexistem, cada um pela sua regra', () => {
    const r = aplicarValoresDoPost([texto('a', { metadata: { slot: { id: 's' } } }), texto('b')], { _slots: { s: 'Semântico' }, b: '' })
    expect(r.camadas.map((c) => c.content)).toEqual(['Semântico', 'modelo b']) // "" legado mantém, como hoje
  })

  it('semântico "" esvazia o texto (mesmo efeito da criação), diferente do legado ""', () => {
    expect(aplicarValoresDoPost([texto('a', { metadata: { slot: { id: 's' } } })], { _slots: { s: '' } }).camadas[0].content).toBe('')
  })

  it('{ fileUrl } semântico em imagem', () => {
    const r = aplicarValoresDoPost([{ id: 'i', name: 'Foto', type: 'image', fileUrl: 'antiga', visible: true, metadata: { slot: { id: 'f' } } }], { _slots: { f: { fileUrl: 'nova' } } })
    expect(r.camadas[0].fileUrl).toBe('nova')
  })

  describe('erros: estruturados, sem conteúdo, e nenhuma camada alterada', () => {
    const recusa = (camadas: Camada[], sv: Record<string, unknown>, codigo: string) => {
      const r = aplicarValoresDoPost(camadas, sv)
      expect(r.semantico).toBe(true)
      expect(r.erros[0]).toMatchObject({ codigo })
      expect(r.camadas).toBe(camadas)
      return r
    }

    it('4. divergente do legado → VALOR_CONFLITANTE', () => {
      recusa([texto('h', { metadata: { slot: { id: 's' } } })], { h: 'A', _slots: { s: 'B' } }, 'VALOR_CONFLITANTE')
    })

    it('5. papel inferido → PAPEL_NAO_DECLARADO', () => {
      recusa([texto('headline')], { _papeis: { headline: 'X' } }, 'PAPEL_NAO_DECLARADO')
    })

    it('6. camada oculta → CAMADA_OCULTA', () => {
      recusa([texto('h', { visible: false, metadata: { slot: { id: 's' } } })], { _slots: { s: 'X' } }, 'CAMADA_OCULTA')
    })

    it('7. rich-text semântico → VALOR_INCOMPATIVEL_COM_CAMADA (quarentena #209)', () => {
      recusa([{ id: 'rt', name: 'Rico', type: 'rich-text', content: 'rico', visible: true, metadata: { slot: { id: 'r' } } }], { _slots: { r: 'X' } }, 'VALOR_INCOMPATIVEL_COM_CAMADA')
    })

    it('slot inexistente → ALVO_NAO_RESOLVIDO', () => {
      recusa([texto('h')], { _slots: { inexistente: 'X' } }, 'ALVO_NAO_RESOLVIDO')
    })

    it('entrada malformada (`_slots: null`, valor inválido) → recusa estrutural', () => {
      recusa([texto('h')], { _slots: null }, 'ENTRADA_INVALIDA')
      recusa([texto('h', { metadata: { slot: { id: 's' } } })], { _slots: { s: { hidden: true } } }, 'VALOR_INVALIDO')
    })

    it('os erros não carregam o texto nem a URL pedidos', () => {
      const r = aplicarValoresDoPost([texto('h', { metadata: { slot: { id: 's' } } })], { h: 'texto-secreto-A', _slots: { s: 'texto-secreto-B' } })
      expect(JSON.stringify(r.erros)).not.toMatch(/texto-secreto/)
    })
  })
})

describe('checkpoint d: o helper diz quais camadas de TEXTO receberam conteúdo semântico (fonte do reflow)', () => {
  const camadas = [
    texto('a', { metadata: { slot: { id: 'sa' } } }),
    texto('b', { metadata: { slot: { id: 'sb' } } }),
    { id: 'i', name: 'Foto', type: 'image', fileUrl: 'antiga', visible: true, metadata: { slot: { id: 'f' } } },
  ]

  it('string e { content } em text entram; { fileUrl } em imagem não; conteúdo igual ao original também entra (precedente do bakeLayers)', () => {
    const r = aplicarValoresDoPost(camadas, { _slots: { sa: 'Novo', sb: { content: 'modelo b' }, f: { fileUrl: 'nova' } } })
    expect(r.changedTextIds).toEqual(['a', 'b'])
  })

  it('legado: o campo não aparece (o render mantém o cálculo de hoje)', () => {
    expect('changedTextIds' in aplicarValoresDoPost(camadas, { a: 'X' })).toBe(false)
  })

  it('com erro: o campo não aparece', () => {
    expect('changedTextIds' in aplicarValoresDoPost(camadas, { _slots: { inexistente: 'X' } })).toBe(false)
  })
})

describe('checkpoint d (Codex): post MISTO — o texto legado em outra camada também entra no reflow', () => {
  it('_slots numa camada e chave legada noutra: as camadas de texto do legado entram pelo critério de hoje (inclusive "")', () => {
    const camadas = [texto('a', { metadata: { slot: { id: 'sa' } } }), texto('b', { name: 'Título' }), texto('c'), { id: 'i', name: 'Foto', type: 'image', fileUrl: 'x', visible: true }]
    const r = aplicarValoresDoPost(camadas, { _slots: { sa: 'Semântico' }, Título: 'Legado bem maior', c: '', i: { fileUrl: 'y' } })
    // o legado mantém o critério de hoje do render: (slots[id] ?? slots[name]) !== undefined em camada text
    expect(r.changedTextIds).toEqual(['a', 'b', 'c'])
  })
})
