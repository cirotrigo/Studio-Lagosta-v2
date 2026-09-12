import { describe, expect, it } from 'vitest'
import { camadasParaDecisao, comVisibilidadeDoRevisor, marcaDoRevisor, ocultaPeloRevisor, reconciliarMarcasDoRevisor, semMarcaDoRevisor } from '../oculta-pelo-revisor'

const marca = { em: '2026-09-12T10:00:00.000Z', ajuste: 0 }

describe('a marca da camada escondida pelo revisor (REV-9E-01)', () => {
  it('esconder grava a marca em metadata.revisao e preserva o resto do metadata; mostrar tira só a marca', () => {
    const l = { id: 'cta', visible: true, metadata: { groupId: 'g1', revisao: { outra: 1 } } }
    const escondida = comVisibilidadeDoRevisor(l, false, marca)
    expect(escondida.visible).toBe(false)
    expect(escondida.metadata).toEqual({ groupId: 'g1', revisao: { outra: 1, ocultaPeloRevisor: marca } })
    expect(ocultaPeloRevisor(escondida)).toBe(true)
    expect(marcaDoRevisor(escondida)).toEqual(marca)
    const mostrada = comVisibilidadeDoRevisor(escondida, true, { ...marca, ajuste: 3 })
    expect(mostrada.visible).toBe(true)
    expect(mostrada.metadata).toEqual({ groupId: 'g1', revisao: { outra: 1 } })
    expect(ocultaPeloRevisor(mostrada)).toBe(false)
    // sem metadata nenhum, esconder cria o mínimo; tirar a marca de quem não tem é no-op
    const semMetadata: { id: string; visible?: boolean; metadata?: Record<string, unknown> } = { id: 'x' }
    expect(comVisibilidadeDoRevisor(semMetadata, false, marca).metadata).toEqual({ revisao: { ocultaPeloRevisor: marca } })
    const semRevisao = semMarcaDoRevisor(comVisibilidadeDoRevisor(semMetadata, false, marca))
    expect(semRevisao.metadata).toEqual({})
    expect(semMarcaDoRevisor({ id: 'y', metadata: { a: 1 } })).toEqual({ id: 'y', metadata: { a: 1 } })
  })

  it('só é "oculta pelo revisor" quem tem a marca E continua escondida; marca malformada não conta', () => {
    expect(ocultaPeloRevisor({ visible: false })).toBe(false)
    expect(ocultaPeloRevisor({ visible: false, metadata: { revisao: { ocultaPeloRevisor: true } } })).toBe(false)
    expect(ocultaPeloRevisor({ visible: false, metadata: { revisao: { ocultaPeloRevisor: { em: 'x' } } } })).toBe(false)
    expect(ocultaPeloRevisor({ visible: true, metadata: { revisao: { ocultaPeloRevisor: marca } } })).toBe(false)
    expect(ocultaPeloRevisor(null)).toBe(false)
  })

  it('camadasParaDecisao: a escondida pelo revisor volta visível para o aprendizado; a escondida pela pessoa fica escondida', () => {
    const camadas = [
      comVisibilidadeDoRevisor({ id: 'cta', type: 'text', content: 'Vem', visible: true }, false, marca),
      { id: 'pre', type: 'text', content: 'Pré', visible: false },
      { id: 'headline', type: 'text', content: 'Título', visible: true },
    ]
    expect(camadasParaDecisao(camadas).map((l) => [l.id, l.visible])).toEqual([['cta', true], ['pre', false], ['headline', true]])
    // não muda o original
    expect(camadas[0].visible).toBe(false)
  })

  it('reconciliar depois de uma escrita humana: camada que estava visível e chega escondida perde a marca; a que continua escondida desde o ajuste a mantém; sem "antes", nada muda', () => {
    const escondidaPeloRevisor = comVisibilidadeDoRevisor({ id: 'cta', visible: true }, false, marca)
    // a pessoa mostrou (no editor) e depois escondeu de novo: a marca antiga não pode valer
    const mostradaPelaPessoa = { ...escondidaPeloRevisor, visible: true }
    const escondidaPelaPessoa = { ...mostradaPelaPessoa, visible: false }
    const r = reconciliarMarcasDoRevisor([mostradaPelaPessoa], [escondidaPelaPessoa])
    expect(marcaDoRevisor(r[0])).toBeNull()
    expect(ocultaPeloRevisor(r[0])).toBe(false)
    // continua escondida desde o ajuste: mantém
    const r2 = reconciliarMarcasDoRevisor([escondidaPeloRevisor], [escondidaPeloRevisor])
    expect(ocultaPeloRevisor(r2[0])).toBe(true)
    // camada nova (sem "antes") com marca escondida: mantém (não há evidência de gesto humano)
    expect(ocultaPeloRevisor(reconciliarMarcasDoRevisor([], [escondidaPeloRevisor])[0])).toBe(true)
    expect(ocultaPeloRevisor(reconciliarMarcasDoRevisor(null, [escondidaPeloRevisor])[0])).toBe(true)
  })
})
