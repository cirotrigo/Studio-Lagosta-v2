/**
 * A peça da fila FECHA a Generation que a fila criou — nunca abre outra.
 *
 * O que se pina aqui é o fio que faltava em 04/09/2026: `opcoes.generationId`
 * tem de chegar ao persist como `generationId` (o campo que faz o
 * `renderPageAndRegister` fazer UPDATE em vez de CREATE). Anotá-lo só em
 * `fieldValues.generationIdDaFila`, como era, produzia a duplicata.
 */
import { describe, expect, it } from 'vitest'

import { entradaDePersistencia, TAG_DA_PECA_COMPOSTA } from '../persistencia'
import type { SpecDePeca } from '../spec'

const spec: SpecDePeca = {
  projectId: 6,
  formato: 'story',
  blocos: [{ papel: 'headline', linhas: ['Sexta é dia de churrasco'] }],
  foto: { driveFileId: 'drive-1' },
  itemDePlanoId: 'item-1',
  planoId: 'plano-1',
} as SpecDePeca

const base = {
  spec,
  projeto: { id: 6, name: 'Espeto Gaúcho', userId: 'user-interno' },
  pasta: { id: 42, name: 'Semana 07/09' },
  nome: 'Sex 11/09 · 15:00 · churrasco',
  ordem: 0,
  canvas: { width: 1080, height: 1920 },
  layers: [],
  fundo: '#111111',
  diagnostico: { avisos: [] },
  fotoUrl: 'https://blob/foto.jpg',
}

describe('entradaDePersistencia', () => {
  it('entrega a Generation da fila ao persist (é ela que fecha, não nasce outra)', () => {
    const e = entradaDePersistencia({ ...base, opcoes: { generationId: 'gen-da-fila', autor: 'u1', canal: 'claude-ai' } })
    expect(e.generationId).toBe('gen-da-fila')
    expect(e.fieldValues.generationIdDaFila).toBe('gen-da-fila')
    expect(e.createdBy).toBe('u1')
    expect(e.canal).toBe('claude-ai')
  })

  it('sem fila, não há Generation para fechar — o persist cria a dele', () => {
    const e = entradaDePersistencia({ ...base, opcoes: {} })
    expect(e.generationId).toBeNull()
    expect(e.fieldValues).not.toHaveProperty('generationIdDaFila')
  })

  it('a ordem de postagem vira Page.order — sem isso a página nasce no default 0 do schema', () => {
    const e = entradaDePersistencia({ ...base, ordem: 133_502, opcoes: {} })
    expect(e.pageOrder).toBe(133_502)
  })

  it('o slide é REGISTRADO por quem compõe (Generation.slideOrder), não deduzido depois', () => {
    const comSlide = entradaDePersistencia({ ...base, spec: { ...spec, carrossel: { slide: 3, de: 5 } }, opcoes: {} })
    expect(comSlide.slideOrder).toBe(3)
    // Peça avulsa não é slide de nada.
    expect(entradaDePersistencia({ ...base, opcoes: {} }).slideOrder).toBeNull()
  })

  it('carrega o vínculo com o plano, a foto e a tag da peça composta', () => {
    const e = entradaDePersistencia({ ...base, opcoes: { generationId: 'g' } })
    expect(e.fieldValues.itemDePlanoId).toBe('item-1')
    expect(e.fieldValues.planoId).toBe('plano-1')
    expect(e.fieldValues.driveImageId).toBe('drive-1')
    expect(e.fieldValues.source).toBe('compositor')
    expect(e.pageTags).toEqual([TAG_DA_PECA_COMPOSTA, 'story'])
    expect(e.templateId).toBe(42)
    expect(e.background).toBe('#111111')
  })
})
