import { describe, expect, it } from 'vitest'
import { VERSAO_DO_CONTRATO, lerCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'
import { CopyAutoralInvalida, copyDoItemNoPatch, copyDoItemNovo, espelhoDoContrato } from '../copy-do-item'
import { montarSpecDoItem } from '../spec-do-item'
import { validarSpec } from '@/lib/compositor/spec'

const contrato: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'pre', funcao: 'pre', ordem: 0, linhas: ['Na sexta o'] },
    { id: 'headline', funcao: 'headline', ordem: 1, linhas: ['Milk-shake', 'vem [em dobro]'], estilo: { linhasNaVoz2: [1] } },
    { id: 'cta', funcao: 'cta', ordem: 2, linhas: [] },
    { id: 'servico', funcao: 'servico', ordem: 3, linhas: ['Seg a sáb · 11h às 22h'] },
  ],
  revisoes: [],
}

describe('a copy do item de plano: o contrato manda, a lista é o espelho', () => {
  it('item novo com contrato: grava o contrato e o espelho posicional SEM os blocos vazios', () => {
    const r = copyDoItemNovo({ copyAutoral: contrato, copyProposta: ['ignorado'] })
    expect(r.copyAutoral).toEqual(contrato)
    expect(r.copyProposta).toEqual(['Na sexta o', 'Milk-shake\nvem [em dobro]', 'Seg a sáb · 11h às 22h'])
    expect(espelhoDoContrato(contrato)).toEqual(r.copyProposta)
  })

  it('bloco de linhas só em branco fica fora do espelho E da edição posicional: a edição vira revisão, não descarte', () => {
    const comBranco: CopyAutoral = { ...contrato, blocos: contrato.blocos.map((b) => (b.id === 'cta' ? { ...b, linhas: [''] } : b)) }
    expect(lerCopyAutoral(comBranco).copy).not.toBeNull()
    const espelho = espelhoDoContrato(comBranco)
    expect(espelho).toHaveLength(3)
    const r = copyDoItemNoPatch(comBranco, { copyProposta: ['No sábado o', espelho[1], espelho[2]] }, { autor: 'equipe', superficie: 'bancada' })!
    expect(r.avisos).toEqual([])
    expect(r.copyAutoral!.blocos.find((b) => b.id === 'pre')!.linhas).toEqual(['No sábado o'])
    expect(r.copyAutoral!.blocos.find((b) => b.id === 'cta')!.linhas).toEqual([''])
  })

  it('item novo sem contrato: a lista legada, limpa; sem contrato inventado', () => {
    const r = copyDoItemNovo({ copyProposta: [' Título ', '', 'Apoio'] })
    expect(r).toEqual({ copyAutoral: null, copyProposta: ['Título', 'Apoio'], avisos: [] })
  })

  it('contrato que não passa no leitor é RECUSADO, nunca gravado pela metade', () => {
    expect(() => copyDoItemNovo({ copyAutoral: { ...contrato, blocos: [{ ...contrato.blocos[0] }, { ...contrato.blocos[0] }] } })).toThrow(CopyAutoralInvalida)
    try {
      copyDoItemNovo({ copyAutoral: { versao: 'x' } })
    } catch (e) {
      expect(e).toBeInstanceOf(CopyAutoralInvalida)
      expect((e as CopyAutoralInvalida).problemas.length).toBeGreaterThan(0)
    }
  })

  it('patch que não toca na copy devolve null', () => {
    expect(copyDoItemNoPatch(contrato, { tema: 'x' } as never, { autor: 'equipe', superficie: 'bancada' })).toBeNull()
  })

  it('patch só da lista posicional, mesmo número de blocos: vira REVISÃO do contrato com o autor de quem mexeu', () => {
    const r = copyDoItemNoPatch(contrato, { copyProposta: ['Na sexta o', 'Milk-shake\nvem [em DOBRO]', 'Seg a sáb · 11h às 23h'] }, { autor: 'equipe', superficie: 'bancada', em: '2026-09-12T11:00:00.000Z' })!
    expect(r.copyAutoral).not.toBeNull()
    expect(r.avisos).toEqual([])
    const lida = lerCopyAutoral(r.copyAutoral).copy!
    expect(lida.revisoes).toHaveLength(1)
    expect(lida.revisoes[0]).toMatchObject({ autor: 'equipe', superficie: 'bancada', em: '2026-09-12T11:00:00.000Z', blocos: ['headline', 'servico'] })
    expect(lida.blocos.find((b) => b.id === 'headline')!.linhas).toEqual(['Milk-shake', 'vem [em DOBRO]'])
    expect(lida.blocos.find((b) => b.id === 'headline')!.estilo).toEqual({ linhasNaVoz2: [1] })
    expect(lida.blocos.find((b) => b.id === 'cta')!.linhas).toEqual([])
    expect(r.copyProposta).toEqual(['Na sexta o', 'Milk-shake\nvem [em DOBRO]', 'Seg a sáb · 11h às 23h'])
  })

  it('a segunda voz aponta por índice: linha que sumiu leva o índice junto, e o contrato continua válido', () => {
    const r = copyDoItemNoPatch(contrato, { copyProposta: ['Na sexta o', 'Milk-shake em dobro', 'Seg a sáb · 11h às 22h'] }, { autor: 'equipe', superficie: 'bancada' })!
    const lida = lerCopyAutoral(r.copyAutoral).copy!
    expect(lida.blocos.find((b) => b.id === 'headline')!.linhas).toEqual(['Milk-shake em dobro'])
    expect(lida.blocos.find((b) => b.id === 'headline')!.estilo).toBeUndefined()
  })

  it('patch só da lista com OUTRO número de blocos: o contrato é descartado COM AVISO, nunca mantido mentindo', () => {
    const r = copyDoItemNoPatch(contrato, { copyProposta: ['Só a manchete'] }, { autor: 'equipe', superficie: 'bancada' })!
    expect(r.copyAutoral).toBeNull()
    expect(r.copyProposta).toEqual(['Só a manchete'])
    expect(r.avisos[0]).toMatch(/descartado.*3 → 1/)
  })

  it('patch com contrato novo substitui o inteiro; patch com null limpa e avisa', () => {
    const outro: CopyAutoral = { ...contrato, blocos: [{ id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Outra'] }] }
    const r1 = copyDoItemNoPatch(contrato, { copyAutoral: outro }, { autor: 'claude', superficie: 'chat' })!
    expect(r1.copyAutoral).toEqual(outro)
    expect(r1.copyProposta).toEqual(['Outra'])
    const r2 = copyDoItemNoPatch(contrato, { copyAutoral: null, copyProposta: ['Livre'] }, { autor: 'equipe', superficie: 'bancada' })!
    expect(r2.copyAutoral).toBeNull()
    expect(r2.copyProposta).toEqual(['Livre'])
    expect(r2.avisos).toHaveLength(1)
  })

  it('item sem contrato editado pela lista continua sem contrato (nada é inventado)', () => {
    const r = copyDoItemNoPatch(null, { copyProposta: ['A', 'B'] }, { autor: 'equipe', superficie: 'bancada' })!
    expect(r).toEqual({ copyAutoral: null, copyProposta: ['A', 'B'], avisos: [] })
  })

  it('R01 (C2): item com bloco VAZIO de propósito (cta: []) passa inteiro por copyDoItemNovo → montarSpecDoItem → validarSpec, e a fila o revalida', () => {
    const item = copyDoItemNovo({ copyAutoral: contrato })
    const spec = montarSpecDoItem({ id: 'item-1', planoId: 'plano-1', formato: 'story', copyAutoral: item.copyAutoral, copyProposta: item.copyProposta } as never, 8, [], false)
    expect(spec.blocos?.map((b) => b.papel)).toEqual(['pre', 'headline', 'servico'])
    const v = validarSpec(spec)
    expect(v.problemas).toEqual([])
    expect(v.spec?.copyAutoral?.blocos.find((b) => b.id === 'cta')?.linhas).toEqual([])
    // a spec revalidada (como a fila faz ao executar) continua válida
    expect(validarSpec(JSON.parse(JSON.stringify(v.spec))).problemas).toEqual([])
  })
})
