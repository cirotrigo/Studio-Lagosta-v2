import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'

import {
  assinaturaDoBloco,
  elegivelParaBloco,
  grupoDaCamada,
  membrosDoBloco,
  papelNoBloco,
  retanguloDoBloco,
} from '../bloco-de-fundo'
import { resolverFundo } from '../fundo-de-texto'

function texto(id: string, extra: Partial<Layer> = {}): Layer {
  return {
    id,
    type: 'text',
    name: id,
    visible: true,
    locked: false,
    order: 0,
    position: { x: 100, y: 100 },
    size: { width: 400, height: 100 },
    content: id,
    metadata: { groupId: 'grupo-1' },
    effects: { background: { enabled: true, backgroundColor: '#111111', padding: 20, fit: 'texto' } },
    ...extra,
  }
}

describe('elegivelParaBloco', () => {
  it('texto visível, com fundo, sem rotação e sem curva', () => {
    expect(elegivelParaBloco(texto('a'))).toBe(true)
    expect(elegivelParaBloco(texto('b', { visible: false }))).toBe(false)
    expect(elegivelParaBloco(texto('c', { rotation: 12 }))).toBe(false)
    expect(elegivelParaBloco(texto('d', { effects: { curved: { enabled: true, curvature: 30 } } }))).toBe(false)
    expect(elegivelParaBloco(texto('e', { effects: {} }))).toBe(false)
    expect(elegivelParaBloco({ ...texto('f'), type: 'shape' })).toBe(false)
  })

  it('rotação 0 e curva com curvatura 0 não excluem', () => {
    expect(elegivelParaBloco(texto('a', { rotation: 0 }))).toBe(true)
    expect(
      elegivelParaBloco(
        texto('b', {
          effects: {
            curved: { enabled: true, curvature: 0 },
            background: { enabled: true, backgroundColor: '#111', padding: 1 },
          },
        }),
      ),
    ).toBe(true)
  })
})

describe('membrosDoBloco / papelNoBloco', () => {
  const manchete = texto('manchete', { order: 3 })
  const apoio = texto('apoio', { order: 5 })
  const servico = texto('servico', { order: 7, metadata: { groupId: 'grupo-2' } })
  const semFundo = texto('sem-fundo', { order: 1, effects: {} })
  const girado = texto('girado', { order: 2, rotation: -8 })
  const layers = [servico, girado, apoio, manchete, semFundo]

  it('só os elegíveis do MESMO grupo, pela ordem de empilhamento', () => {
    expect(membrosDoBloco(layers, apoio).map((l) => l.id)).toEqual(['manchete', 'apoio'])
    // sozinho no grupo-2: a lista tem só ele — e com um membro não há bloco
    expect(membrosDoBloco(layers, servico).map((l) => l.id)).toEqual(['servico'])
    expect(membrosDoBloco(layers, semFundo)).toEqual([])
    expect(membrosDoBloco(layers, girado)).toEqual([])
    expect(grupoDaCamada(texto('x', { metadata: {} }))).toBeNull()
  })

  it('o líder é o de menor order; o outro é membro; quem não tem bloco está sozinho', () => {
    expect(papelNoBloco(layers, manchete)).toMatchObject({ papel: 'lider' })
    expect(papelNoBloco(layers, apoio)).toMatchObject({ papel: 'membro' })
    expect(papelNoBloco(layers, apoio).membros.map((l) => l.id)).toEqual(['manchete', 'apoio'])
    // sozinho no grupo-2, girado, sem fundo: cada um desenha o seu (ou nada)
    expect(papelNoBloco(layers, servico)).toEqual({ papel: 'sozinho', membros: [servico] })
    expect(papelNoBloco(layers, girado)).toEqual({ papel: 'sozinho', membros: [girado] })
    expect(papelNoBloco(layers, texto('solto', { metadata: {} }))).toMatchObject({ papel: 'sozinho' })
  })

  it('membro oculto ou girado sai do bloco sem desfazer o bloco dos outros', () => {
    const tres = [manchete, apoio, texto('cta', { order: 9, visible: false })]
    expect(membrosDoBloco(tres, manchete).map((l) => l.id)).toEqual(['manchete', 'apoio'])
  })
})

describe('retanguloDoBloco', () => {
  const fundo = resolverFundo({ enabled: true, backgroundColor: '#111', padding: 10, offsetX: 5, offsetY: -5 })!

  it('união das bases crescida pela borda e deslocada', () => {
    const r = retanguloDoBloco(fundo, [
      { x: 100, y: 100, width: 200, height: 50 },
      { x: 150, y: 180, width: 100, height: 40 },
    ])
    expect(r).toEqual({ x: 95, y: 85, width: 220, height: 140 })
  })

  it('base vazia não conta; sem base não há bloco', () => {
    expect(retanguloDoBloco(fundo, [{ x: 0, y: 0, width: 0, height: 0 }, { x: 10, y: 10, width: 10, height: 10 }])).toEqual({
      x: 5,
      y: -5,
      width: 30,
      height: 30,
    })
    expect(retanguloDoBloco(fundo, [])).toBeNull()
  })
})

describe('assinaturaDoBloco', () => {
  it('muda quando um irmão muda de conteúdo ou posição', () => {
    const a = texto('a')
    const b = texto('b')
    const antes = assinaturaDoBloco([a, b])
    expect(assinaturaDoBloco([a, { ...b, content: 'outro' }])).not.toBe(antes)
    expect(assinaturaDoBloco([a, { ...b, position: { x: 1, y: 1 } }])).not.toBe(antes)
    expect(assinaturaDoBloco([a, { ...b, locked: true }])).toBe(antes)
  })
})
