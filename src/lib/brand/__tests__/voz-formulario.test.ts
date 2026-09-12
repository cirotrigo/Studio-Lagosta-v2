import { describe, expect, it } from 'vitest'
import { lerVoz, type VozCompacta } from '../voz'
import { formularioParaVoz, formulariosIguais, linhasParaAntesDepois, linhasParaLista, regraEmBranco, substituirRegraNoFormulario, vozParaFormulario } from '../voz-formulario'

const voz: VozCompacta = {
  versao: 'voz-v1',
  descricao: 'Direta, quente, sem gíria corporativa.',
  tratamento: 'você',
  exemplos: ['Sexta é dia de costela.', 'Vem pra cá.'],
  antesDepois: [{ antes: 'Venha conhecer nossas opções', depois: 'Vem provar', motivo: 'menos institucional' }],
  termos: ['costela no bafo', 'happy em dobro'],
  proibicoes: ['"o melhor da cidade"'],
  regras: [
    { id: 'regra-2026-09-04-1', texto: 'Pré-título, manchete e apoio se leem como UMA frase.', motivo: 'Ciro, 03/09', em: '2026-09-04', escopo: 'copy', ativa: true },
    { id: 'regra-2026-08-01-1', texto: 'Nunca "vem pro fogo".', motivo: 'Ciro, 06/09', em: '2026-08-01', escopo: 'ambas', ativa: false },
  ],
}

describe('voz-formulario — ida e volta EXATA entre o contrato e os campos da tela', () => {
  it('vozParaFormulario → formularioParaVoz devolve a mesma voz (passa em lerVoz sem diferença)', () => {
    const form = vozParaFormulario(voz)
    expect(form.exemplos).toBe('Sexta é dia de costela.\nVem pra cá.')
    expect(form.antesDepois).toBe('Venha conhecer nossas opções → Vem provar — menos institucional')
    const volta = lerVoz(formularioParaVoz(form))
    expect(volta.problemas).toEqual([])
    expect(volta.voz).toEqual(voz)
  })
  it('campo vazio vira ausente (tratamento) ou lista vazia; marcador de lista e linha em branco saem; sem seta a reescrita fica só com "antes" e o contrato recusa', () => {
    const form = vozParaFormulario(null)
    form.descricao = 'Curta.'
    form.termos = '- a\n\n• b\n  c  '
    const obj = formularioParaVoz(form) as Record<string, unknown>
    expect(obj).not.toHaveProperty('tratamento')
    expect(obj.termos).toEqual(['a', 'b', 'c'])
    expect(obj.exemplos).toEqual([])
    expect(lerVoz(obj).voz).not.toBeNull()
    expect(linhasParaAntesDepois('x -> y')).toEqual([{ antes: 'x', depois: 'y', motivo: '' }])
    expect(linhasParaAntesDepois('só antes')).toEqual([{ antes: 'só antes', depois: '', motivo: '' }])
    expect(lerVoz(formularioParaVoz({ ...form, antesDepois: 'só antes' })).voz).toBeNull()
    expect(linhasParaLista('')).toEqual([])
  })
  it('regraEmBranco não repete id; substituir inativa a antiga e a nova aponta para ela; regra já inativa não é substituída de novo', () => {
    const form = vozParaFormulario(voz)
    const nova = regraEmBranco(form.regras, '2026-09-04')
    expect(nova.id).toBe('regra-2026-09-04-2')
    const regras = substituirRegraNoFormulario(form.regras, 'regra-2026-09-04-1', { texto: 'Pré-título e manchete se leem como uma frase; o apoio é livre.', motivo: 'Ciro, 12/09', em: '2026-09-12', escopo: 'copy' })
    expect(regras.find((r) => r.id === 'regra-2026-09-04-1')?.ativa).toBe(false)
    const criada = regras[regras.length - 1]
    expect(criada).toMatchObject({ substitui: 'regra-2026-09-04-1', ativa: true, id: 'regra-2026-09-12-1' })
    expect(lerVoz(formularioParaVoz({ ...form, regras })).problemas).toEqual([])
    expect(substituirRegraNoFormulario(regras, 'regra-2026-09-04-1', { texto: 'x', motivo: 'y', em: '2026-09-13', escopo: 'copy' })).toBe(regras)
  })
  it('formulariosIguais ignora espaço e ordem das chaves, mas vê mudança de conteúdo', () => {
    const a = vozParaFormulario(voz)
    expect(formulariosIguais(a, { ...a, descricao: `  ${a.descricao}  ` })).toBe(true)
    expect(formulariosIguais(a, { ...a, termos: a.termos + '\nchimarrão' })).toBe(false)
  })
})
