import { describe, it, expect } from 'vitest'

import type { Layer } from '@/types/template'
import { diffDeGeometria, descreverDiff } from '@/lib/aprendizado/diff-geometria'
import { copyParaBlocos, quebrarEmDuas } from '../copy-para-blocos'

const camada = (id: string, extra: Partial<Layer> = {}): Layer => ({
  id,
  name: id,
  type: 'text',
  visible: true,
  locked: false,
  order: 0,
  position: { x: 100, y: 200 },
  size: { width: 500, height: 100 },
  style: { fontSize: 96, textAlign: 'left' },
  metadata: { compositor: { papel: id } },
  ...extra,
})

describe('diffDeGeometria', () => {
  it('ignora ruído de arraste e pega o que é decisão', () => {
    const antes = [camada('headline'), camada('apoio')]
    const depois = [
      camada('headline', { position: { x: 102, y: 201 } }),
      camada('apoio', { position: { x: 100, y: 260 }, style: { fontSize: 80, textAlign: 'center' } }),
    ]
    const d = diffDeGeometria(antes, JSON.stringify(depois))
    expect(d.ilegivel).toBe(false)
    expect(d.deltas).toHaveLength(1)
    expect(d.deltas[0]).toMatchObject({ papel: 'apoio', dy: 60, escalaDaFonte: 0.833, alinhamento: { antes: 'left', depois: 'center' } })
    expect(descreverDiff(d)[0]).toMatch(/apoio: moveu/)
  })

  it('ilegível nunca vira "não mudou nada"', () => {
    const d = diffDeGeometria('{quebrado', [camada('x')])
    expect(d.ilegivel).toBe(true)
    expect(d.mudou).toBe(false)
  })

  it('camada removida e adicionada contam', () => {
    const d = diffDeGeometria([camada('a'), camada('b')], [camada('a'), camada('c')])
    expect(d.removidas).toEqual(['b'])
    expect(d.adicionadas).toEqual(['c'])
    expect(d.mudou).toBe(true)
  })
})

describe('copyParaBlocos', () => {
  it('com a lista de papéis do template, a copy só ocupa os campos que existem', () => {
    const copy = ['Sexta-feira', 'Aberto até mais tarde', 'Gelato e café para fechar o dia', 'Sexta, das 12h às 00h']
    // feed sem pre nem servico: sobram headline e apoio; serviço e pré-título ficam de fora
    const b = copyParaBlocos(copy, { papeis: ['headline', 'apoio', 'cta'] })
    expect(b.map((x) => x.papel)).toEqual(['headline', 'apoio', 'cta'])
    expect(b[0].linhas.join(' ')).toBe('Sexta-feira')
    // story completa com 3 textos + serviço: a prioridade é headline > apoio > cta (o pré-título é o último a entrar)
    const c = copyParaBlocos(copy, { papeis: ['pre', 'headline', 'apoio', 'cta', 'servico'] })
    expect(c.map((x) => x.papel)).toEqual(['headline', 'apoio', 'cta', 'servico'])
    // com 4 textos + serviço, entram os quatro
    const d = copyParaBlocos([...copy, 'Vem provar'], { papeis: ['pre', 'headline', 'apoio', 'cta', 'servico'] })
    expect(d.map((x) => x.papel)).toEqual(['pre', 'headline', 'apoio', 'cta', 'servico'])
    // um texto só e um template só com headline
    expect(copyParaBlocos(['Só a manchete'], { papeis: ['headline', 'servico'] }).map((x) => x.papel)).toEqual(['headline'])
  })

  it('quebra a headline no espaço mais perto do meio', () => {
    expect(quebrarEmDuas('Foto Nova a Cada Quinze Dias', 18)).toEqual(['Foto Nova a Cada', 'Quinze Dias'])
    expect(quebrarEmDuas('Curta', 18)).toEqual(['Curta'])
  })

  it('mapeia pela ordem de leitura e manda serviço para o rodapé', () => {
    const b = copyParaBlocos(['Happy hour da casa', 'Chope e petiscos com desconto até as 20h', 'Terça a sexta, das 17h às 20h', 'Vem pra cá'])
    expect(b.map((x) => x.papel)).toEqual(['headline', 'apoio', 'cta', 'servico'])
    expect(b[3].linhas).toEqual(['Terça a sexta, das 17h às 20h'])
    expect(copyParaBlocos(['Só a manchete']).map((x) => x.papel)).toEqual(['headline'])
    expect(copyParaBlocos(['Pré', 'Manchete', 'Apoio', 'CTA']).map((x) => x.papel)).toEqual(['pre', 'headline', 'apoio', 'cta'])
  })
})
