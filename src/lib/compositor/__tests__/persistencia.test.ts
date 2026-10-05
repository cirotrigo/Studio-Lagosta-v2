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
import { validarSpec, type SpecDePeca } from '../spec'
import { MAX_REVISOES_DA_COPY, ORIENTACAO_LINHA_LONGA, VERSAO_DO_CONTRATO, lerCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'

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

  it('PR 15: o carimbo da voz vai para fieldValues.vozNaEscrita, fora do contrato da copy', () => {
    const vozNaEscrita = { fonte: 'voz' as const, versao: 3, lidoEm: '2026-09-13T20:00:00.000Z' }
    const e = entradaDePersistencia({ ...base, opcoes: {}, vozNaEscrita })
    expect(e.fieldValues.vozNaEscrita).toEqual(vozNaEscrita)
    // O contrato estrito da copy NÃO ganha a chave (uma chave a mais o recusaria na leitura).
    expect((e.fieldValues.copyAutoral as { original: Record<string, unknown> }).original).not.toHaveProperty('vozNaEscrita')
  })

  it('PR 15: sem carimbo (leitura da voz falhou), a peça sai sem a chave', () => {
    expect(entradaDePersistencia({ ...base, opcoes: {}, vozNaEscrita: null }).fieldValues).not.toHaveProperty('vozNaEscrita')
    expect(entradaDePersistencia({ ...base, opcoes: {} }).fieldValues).not.toHaveProperty('vozNaEscrita')
  })
})

describe('entradaDePersistencia — a copy que não cabe no contrato não derruba a peça composta (restack sobre e3c1f75f)', () => {
  it('spec sem contrato com uma linha de 301 caracteres: validarSpec recusa (PR 9), e a persistência, se alcançada, segue SEM contrato com o aviso que manda quebrar a linha', () => {
    const longa = { ...spec, blocos: [{ papel: 'headline', linhas: ['x'.repeat(301)] }] } as SpecDePeca
    // Desde o PR 9 a copy derivada da spec passa pelo contrato em `validarSpec`; a persistência continua tolerante.
    const validada = validarSpec(longa)
    expect(validada.spec).toBeNull()
    expect(validada.problemas.join(' ')).toMatch(/blocos\.0\.linhas\.0: .*300/)
    const e = entradaDePersistencia({ ...base, spec: longa, opcoes: {} })
    expect(e.copyAutoral).toBeUndefined()
    const fv = e.fieldValues as Record<string, any>
    expect(fv.copyAutoral).toBeUndefined()
    expect(fv.avisosDaCopyAutoral).toHaveLength(1)
    expect(fv.avisosDaCopyAutoral[0]).toMatch(/SEM contrato/)
    expect(fv.avisosDaCopyAutoral[0]).toContain(ORIENTACAO_LINHA_LONGA)
    expect(fv.spec.blocos[0].linhas[0]).toHaveLength(301)
  })

  it('spec com contrato de histórico CHEIO e camadas que não o descrevem: segue sem contrato novo, com aviso — nunca grava a 201ª', () => {
    const cheio: CopyAutoral = {
      versao: VERSAO_DO_CONTRATO,
      origem: { autor: 'claude', superficie: 'chat' },
      blocos: [{ id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Sexta é dia de churrasco'] }],
      revisoes: Array.from({ length: MAX_REVISOES_DA_COPY }, () => ({ em: '2026-09-12T11:00:00.000Z', autor: 'equipe' as const, motivo: 'm', superficie: 'bancada', blocos: ['headline'] })),
    }
    expect(lerCopyAutoral(cheio).problemas).toEqual([])
    const e = entradaDePersistencia({ ...base, spec: { ...spec, copyAutoral: cheio } as SpecDePeca, opcoes: {} })
    expect(e.copyAutoral).toBeUndefined()
    const fv = e.fieldValues as Record<string, any>
    expect(fv.copyAutoral).toBeUndefined()
    expect(fv.avisosDaCopyAutoral.join(' ')).toMatch(/limite de 200 revisões/)
  })

  it('controle: a spec que cabe continua gravando original e efetiva, sem aviso', () => {
    const e = entradaDePersistencia({ ...base, opcoes: {} })
    const fv = e.fieldValues as Record<string, any>
    expect(e.copyAutoral).toBeDefined()
    expect(fv.copyAutoral.original.blocos[0].linhas).toEqual(['Sexta é dia de churrasco'])
    expect(fv.avisosDaCopyAutoral).toBeUndefined()
  })
})
