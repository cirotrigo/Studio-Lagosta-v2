/**
 * A união dos dois livros-caixa é a parte fácil; o risco todo está na
 * deduplicação — sem ela, o `finalize` do gerar-criativo (que grava na
 * Generation E na AICreativeGeneration na mesma requisição) conta cada criação
 * duas vezes e infla justamente a via da UI.
 */

import { describe, expect, it } from 'vitest'
import { contarUsosPorModelo, dedupar, type UsoDeModelo } from '../historico-de-artes'

const uso = (p: Partial<UsoDeModelo> & Pick<UsoDeModelo, 'modeloPageId' | 'via' | 'quando'>): UsoDeModelo => ({
  generationId: null,
  copiaPageId: null,
  ...p,
})

describe('dedupar', () => {
  it('funde o par que o finalize grava nos dois livros, mantendo a via da UI', () => {
    const base = new Date('2026-08-10T12:00:00Z')
    const out = dedupar([
      uso({ modeloPageId: 'modelo-1', via: 'chat', quando: base, generationId: 'gen-1' }),
      uso({
        modeloPageId: 'modelo-1',
        via: 'ui',
        quando: new Date(base.getTime() + 800),
        copiaPageId: 'copia-1',
      }),
    ])

    expect(out).toHaveLength(1)
    expect(out[0].via).toBe('ui')
    // Nenhum dos dois lados se perde na fusão: o generationId liga à galeria,
    // a copiaPageId liga à página criada.
    expect(out[0].generationId).toBe('gen-1')
    expect(out[0].copiaPageId).toBe('copia-1')
  })

  it('não funde duas criações do mesmo modelo separadas por mais de um minuto', () => {
    const base = new Date('2026-08-10T12:00:00Z')
    const out = dedupar([
      uso({ modeloPageId: 'modelo-1', via: 'chat', quando: base }),
      uso({ modeloPageId: 'modelo-1', via: 'ui', quando: new Date(base.getTime() + 90_000) }),
    ])
    expect(out).toHaveLength(2)
  })

  it('não funde duas artes da MESMA via, por mais próximas que estejam', () => {
    // Uma leva da skill cria várias artes do mesmo modelo em segundos — são
    // usos distintos e precisam contar todos.
    const base = new Date('2026-08-10T12:00:00Z')
    const out = dedupar([
      uso({ modeloPageId: 'modelo-1', via: 'chat', quando: base }),
      uso({ modeloPageId: 'modelo-1', via: 'chat', quando: new Date(base.getTime() + 1_000) }),
      uso({ modeloPageId: 'modelo-1', via: 'chat', quando: new Date(base.getTime() + 2_000) }),
    ])
    expect(out).toHaveLength(3)
  })

  it('não funde modelos diferentes criados ao mesmo tempo', () => {
    const base = new Date('2026-08-10T12:00:00Z')
    const out = dedupar([
      uso({ modeloPageId: 'modelo-1', via: 'chat', quando: base }),
      uso({ modeloPageId: 'modelo-2', via: 'ui', quando: base }),
    ])
    expect(out).toHaveLength(2)
  })

  it('funde no máximo um par: três linhas próximas não viram uma só', () => {
    const base = new Date('2026-08-10T12:00:00Z')
    const out = dedupar([
      uso({ modeloPageId: 'm', via: 'chat', quando: base }),
      uso({ modeloPageId: 'm', via: 'ui', quando: new Date(base.getTime() + 500) }),
      uso({ modeloPageId: 'm', via: 'chat', quando: new Date(base.getTime() + 900) }),
    ])
    // O primeiro par funde; o terceiro é outra criação e sobrevive.
    expect(out).toHaveLength(2)
  })
})

describe('contarUsosPorModelo', () => {
  it('separa as vias e guarda o uso mais recente', () => {
    const contagem = contarUsosPorModelo([
      uso({ modeloPageId: 'm1', via: 'chat', quando: new Date('2026-08-01T10:00:00Z') }),
      uso({ modeloPageId: 'm1', via: 'ui', quando: new Date('2026-08-09T10:00:00Z') }),
      uso({ modeloPageId: 'm1', via: 'chat', quando: new Date('2026-08-05T10:00:00Z') }),
      uso({ modeloPageId: 'm2', via: 'chat', quando: new Date('2026-08-02T10:00:00Z') }),
    ])

    expect(contagem.get('m1')).toEqual({
      total: 3,
      chat: 2,
      ui: 1,
      ultimoUso: new Date('2026-08-09T10:00:00Z'),
    })
    expect(contagem.get('m2')?.total).toBe(1)
    expect(contagem.has('m3')).toBe(false)
  })
})
