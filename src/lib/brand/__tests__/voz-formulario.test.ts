import { describe, expect, it } from 'vitest'
import { lerVoz, type VozCompacta } from '../voz'
import {
  formularioParaVoz,
  formulariosIguais,
  podeReativar,
  reativarRegraNoFormulario,
  regraEmBranco,
  substituidaPor,
  substituirRegraNoFormulario,
  vozParaFormulario,
} from '../voz-formulario'

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

/** O caso do PR14-01: travessão no "depois", seta no exemplo, marcador literal, quebra de linha interna. */
const vozComArestas: VozCompacta = {
  ...voz,
  exemplos: ['Fogo\nna mesa', '- costela, não "costelinha"', 'Vem → hoje'],
  antesDepois: [
    { antes: 'Venha', depois: 'Vem — hoje', motivo: 'mais direto' },
    { antes: 'a -> b', depois: 'a → b -- c', motivo: 'seta e travessão são conteúdo' },
  ],
  termos: ['• happy em dobro', 'costela no bafo — a da casa'],
  proibicoes: ['"o melhor da cidade"', '- emoji na manchete'],
}

describe('voz-formulario — ida e volta EXATA entre o contrato e os campos da tela', () => {
  it('vozParaFormulario → formularioParaVoz devolve a mesma voz (passa em lerVoz sem diferença)', () => {
    const form = vozParaFormulario(voz)
    expect(form.exemplos).toEqual(['Sexta é dia de costela.', 'Vem pra cá.'])
    expect(form.antesDepois).toEqual([{ antes: 'Venha conhecer nossas opções', depois: 'Vem provar', motivo: 'menos institucional' }])
    const volta = lerVoz(formularioParaVoz(form))
    expect(volta.problemas).toEqual([])
    expect(volta.voz).toEqual(voz)
  })
  it('PR14-01: travessão, seta, marcador literal e quebra interna atravessam a ida e volta LITERALMENTE', () => {
    const form = vozParaFormulario(vozComArestas)
    const volta = lerVoz(formularioParaVoz(form))
    expect(volta.problemas).toEqual([])
    expect(volta.voz).toEqual(vozComArestas)
  })
  it('PR14-01: editar SÓ a descrição não muda nenhum outro campo', () => {
    const form = vozParaFormulario(vozComArestas)
    const editado = { ...form, descricao: 'Direta e quente.' }
    const volta = lerVoz(formularioParaVoz(editado)).voz
    expect(volta).toEqual({ ...vozComArestas, descricao: 'Direta e quente.' })
    expect(formulariosIguais(form, editado)).toBe(false)
  })
  it('campo vazio vira ausente (tratamento) ou lista vazia; item em branco sai; só o espaço das pontas é limpo; reescrita pela metade FICA e o contrato recusa', () => {
    const form = vozParaFormulario(null)
    form.descricao = 'Curta.'
    form.termos = ['  a  ', '', '- b', '   ']
    const obj = formularioParaVoz(form) as Record<string, unknown>
    expect(obj).not.toHaveProperty('tratamento')
    expect(obj.termos).toEqual(['a', '- b'])
    expect(obj.exemplos).toEqual([])
    expect(lerVoz(obj).voz).not.toBeNull()
    const soAntes = formularioParaVoz({ ...form, antesDepois: [{ antes: 'só antes', depois: '', motivo: '' }] }) as { antesDepois: unknown[] }
    expect(soAntes.antesDepois).toEqual([{ antes: 'só antes', depois: '', motivo: '' }])
    expect(lerVoz(soAntes).voz).toBeNull()
    const emBranco = formularioParaVoz({ ...form, antesDepois: [{ antes: ' ', depois: '', motivo: '' }] }) as { antesDepois: unknown[] }
    expect(emBranco.antesDepois).toEqual([])
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
  it('PR14-03: regra SUBSTITUÍDA não pode ser reativada (a voz não passaria no contrato); regra só desativada pode', () => {
    const form = vozParaFormulario(voz)
    const regras = substituirRegraNoFormulario(form.regras, 'regra-2026-09-04-1', { texto: 'x y z', motivo: 'm', em: '2026-09-12', escopo: 'copy' })
    expect(substituidaPor(regras, 'regra-2026-09-04-1')?.id).toBe('regra-2026-09-12-1')
    expect(podeReativar(regras, 'regra-2026-09-04-1')).toBe(false)
    expect(reativarRegraNoFormulario(regras, 'regra-2026-09-04-1')).toBe(regras)
    // o que a tela oferecia antes: reativar por baixo → o contrato recusa
    const forcado = regras.map((r) => (r.id === 'regra-2026-09-04-1' ? { ...r, ativa: true } : r))
    expect(lerVoz(formularioParaVoz({ ...form, regras: forcado })).problemas.some((p) => /continua ativa/.test(p.mensagem))).toBe(true)
    // a regra apenas desativada volta, e a voz continua válida
    expect(podeReativar(regras, 'regra-2026-08-01-1')).toBe(true)
    const reativadas = reativarRegraNoFormulario(regras, 'regra-2026-08-01-1')
    expect(reativadas.find((r) => r.id === 'regra-2026-08-01-1')?.ativa).toBe(true)
    expect(lerVoz(formularioParaVoz({ ...form, regras: reativadas })).problemas).toEqual([])
    expect(podeReativar(regras, 'regra-2026-09-12-1')).toBe(false)
  })
  it('formulariosIguais ignora espaço das pontas, mas vê mudança de conteúdo', () => {
    const a = vozParaFormulario(voz)
    expect(formulariosIguais(a, { ...a, descricao: `  ${a.descricao}  ` })).toBe(true)
    expect(formulariosIguais(a, { ...a, termos: [...a.termos, 'chimarrão'] })).toBe(false)
  })
})
