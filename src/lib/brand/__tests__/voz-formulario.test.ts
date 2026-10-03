import { describe, expect, it } from 'vitest'
import { lerVoz, problemasDaVozEmPortugues, TETO_DO_PROMPT_DA_VOZ, type VozCompacta } from '../voz'
import {
  ESTADO_INICIAL_DA_VOZ,
  formularioParaVoz,
  formulariosIguais,
  reconciliarComServidor,
  registroComRecibo,
  registroParaFormulario,
  podeReativar,
  podeRemoverRegra,
  removerRegraNoFormulario,
  sucessoraAtiva,
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
  it('PR14-05: regra nova em branco pode ser REMOVIDA sem comprometer a edição; regra já gravada ou referenciada só desativa', () => {
    const form = vozParaFormulario(voz)
    const gravadas = form.regras.map((r) => r.id)
    const editado = { ...form, descricao: 'Direta e quente.', regras: [...form.regras, regraEmBranco(form.regras, '2026-09-12')] }
    // com a regra vazia na lista, o contrato não deixa salvar nem a descrição
    expect(lerVoz(formularioParaVoz(editado)).voz).toBeNull()
    const idNova = editado.regras[editado.regras.length - 1].id
    expect(podeRemoverRegra(editado.regras, idNova, gravadas)).toBe(true)
    const semANova = { ...editado, regras: removerRegraNoFormulario(editado.regras, idNova, gravadas) }
    const volta = lerVoz(formularioParaVoz(semANova))
    expect(volta.problemas).toEqual([])
    expect(volta.voz).toEqual({ ...voz, descricao: 'Direta e quente.' })
    // regra parcialmente preenchida também sai
    const parcial = { ...editado, regras: editado.regras.map((r) => (r.id === idNova ? { ...r, texto: 'só o texto' } : r)) }
    expect(lerVoz(formularioParaVoz(parcial)).voz).toBeNull()
    expect(lerVoz(formularioParaVoz({ ...parcial, regras: removerRegraNoFormulario(parcial.regras, idNova, gravadas) })).voz).not.toBeNull()
    // regra gravada não se remove (é histórico); regra referenciada por uma substituição também não
    expect(podeRemoverRegra(form.regras, 'regra-2026-09-04-1', gravadas)).toBe(false)
    expect(removerRegraNoFormulario(form.regras, 'regra-2026-09-04-1', gravadas)).toBe(form.regras)
    const comSubstituicao = substituirRegraNoFormulario(editado.regras, 'regra-2026-09-04-1', { texto: 'nova', motivo: 'm', em: '2026-09-12', escopo: 'copy' })
    const idDaSubstituta = comSubstituicao[comSubstituicao.length - 1].id
    expect(podeRemoverRegra(comSubstituicao, 'regra-2026-09-04-1', [])).toBe(false)
    // a substituta ainda não gravada pode ser removida — e a antiga continua inativa até a pessoa reativá-la
    expect(podeRemoverRegra(comSubstituicao, idDaSubstituta, gravadas)).toBe(true)
    const desfeita = removerRegraNoFormulario(comSubstituicao, idDaSubstituta, gravadas)
    expect(podeReativar(desfeita, 'regra-2026-09-04-1')).toBe(true)
  })
  it('PR14-06: A → B → C — a sucessora ativa de A é C; voltar ao texto de A cria D que substitui C', () => {
    const form = vozParaFormulario(voz)
    const ab = substituirRegraNoFormulario(form.regras, 'regra-2026-09-04-1', { texto: 'B', motivo: 'm', em: '2026-09-10', escopo: 'copy' })
    const idB = ab[ab.length - 1].id
    const abc = substituirRegraNoFormulario(ab, idB, { texto: 'C', motivo: 'm', em: '2026-09-11', escopo: 'copy' })
    const idC = abc[abc.length - 1].id
    expect(substituidaPor(abc, 'regra-2026-09-04-1')?.id).toBe(idB)
    expect(abc.find((r) => r.id === idB)?.ativa).toBe(false)
    expect(sucessoraAtiva(abc, 'regra-2026-09-04-1')?.id).toBe(idC)
    expect(sucessoraAtiva(abc, idB)?.id).toBe(idC)
    expect(sucessoraAtiva(abc, idC)).toBeNull()
    const textoDeA = abc.find((r) => r.id === 'regra-2026-09-04-1')!.texto
    const abcd = substituirRegraNoFormulario(abc, idC, { texto: textoDeA, motivo: 'voltou ao texto de A', em: '2026-09-12', escopo: 'copy' })
    const d = abcd[abcd.length - 1]
    expect(d).toMatchObject({ substitui: idC, ativa: true, texto: textoDeA })
    const cadeia = abcd.filter((r) => ['regra-2026-09-04-1', idB, idC, d.id].includes(r.id))
    expect(cadeia.filter((r) => r.ativa).map((r) => r.id)).toEqual([d.id])
    expect(lerVoz(formularioParaVoz({ ...form, regras: abcd })).problemas).toEqual([])
    expect(podeReativar(abcd, 'regra-2026-09-04-1')).toBe(false)
    expect(podeReativar(abcd, idB)).toBe(false)
    expect(podeReativar(abcd, idC)).toBe(false)
  })
  it('PR14-13: id com espaço nas pontas e a referência a ele atravessam a ida e volta literais; editar só a descrição não quebra o vínculo', () => {
    const comEspaco: VozCompacta = {
      ...voz,
      regras: [
        { id: ' regra-A ', texto: 'Regra antiga que foi substituída.', motivo: 'm', em: '2026-08-01', escopo: 'copy', ativa: false },
        { id: 'regra-B', texto: 'Regra nova no lugar da antiga.', motivo: 'm', em: '2026-09-01', escopo: 'copy', substitui: ' regra-A ', ativa: true },
      ],
    }
    expect(lerVoz(comEspaco).problemas).toEqual([])
    const form = vozParaFormulario(comEspaco)
    const volta = lerVoz(formularioParaVoz({ ...form, descricao: 'Direta.' }))
    expect(volta.problemas).toEqual([])
    expect(volta.voz).toEqual({ ...comEspaco, descricao: 'Direta.' })
  })
  it('formulariosIguais ignora espaço das pontas, mas vê mudança de conteúdo', () => {
    const a = vozParaFormulario(voz)
    expect(formulariosIguais(a, { ...a, descricao: `  ${a.descricao}  ` })).toBe(true)
    expect(formulariosIguais(a, { ...a, termos: [...a.termos, 'chimarrão'] })).toBe(false)
  })
})

describe('reconciliarComServidor — o que chega do servidor nunca apaga edição local (PR14-02, PR14-15)', () => {
  const v1 = registroParaFormulario({ versao: 1, voz })
  const lida = reconciliarComServidor(ESTADO_INICIAL_DA_VOZ, v1, { enviado: null, substituindo: false })
  const a = { ...v1.form, descricao: 'A — direta e quente.' }
  const b = { ...v1.form, descricao: 'B — direta, quente e curta.' }

  it('leitura que confirmou ausência vira versão 0 (PR14-09); a primeira leitura adota o servidor', () => {
    expect(registroParaFormulario(null)).toEqual({ form: vozParaFormulario(null), versao: 0 })
    expect(lida).toEqual({ form: v1.form, base: v1.form, versaoLida: 1, divergente: null })
  })
  it('PR14-15: a resposta da PRÓPRIA gravação avança base e versão e mantém o rascunho posterior — não é conflito', () => {
    const comRascunho = { ...lida, form: b }
    const depois = reconciliarComServidor(comRascunho, registroParaFormulario({ versao: 2, voz: lerVoz(formularioParaVoz(a)).voz }), { enviado: a, substituindo: false })
    expect(depois.form).toBe(b)
    expect(formulariosIguais(depois.base, a)).toBe(true)
    expect(depois).toMatchObject({ versaoLida: 2, divergente: null })
  })
  it('o que OUTRA pessoa salvou por baixo marca a divergência e não descarta nada', () => {
    const comRascunho = { ...lida, form: b }
    const depois = reconciliarComServidor(comRascunho, registroParaFormulario({ versao: 2, voz: lerVoz(formularioParaVoz(a)).voz }), { enviado: null, substituindo: false })
    expect(depois).toEqual({ ...comRascunho, divergente: 2 })
  })
})

describe('registroComRecibo — a releitura falhou DEPOIS da escrita confirmada (PR14-16)', () => {
  const recibo = { versao: 3, voz }
  const anterior = { versao: 2, voz: null, problemas: [{ caminho: 'descricao', mensagem: 'antiga' }], migradaEm: '2026-09-12T10:00:00.000Z', dnaArquivado: { toneOfVoice: 'tom' }, atualizadaEm: '2026-09-12T10:00:00.000Z' }
  const agora = new Date('2026-09-21T12:00:00.000Z')

  it('o conteúdo e a versão vêm do recibo; a migração e o arquivo do DNA, que a gravação não toca, vêm do que a consulta tinha', () => {
    expect(registroComRecibo(anterior, recibo, agora)).toEqual({
      versao: 3,
      voz,
      problemas: [],
      migradaEm: '2026-09-12T10:00:00.000Z',
      dnaArquivado: { toneOfVoice: 'tom' },
      atualizadaEm: '2026-09-21T12:00:00.000Z',
    })
  })

  it('na PRIMEIRA gravação (sem registro anterior) nasce não migrado e sem arquivo — nunca `null`, que a tela leria como "não há voz"', () => {
    const r = registroComRecibo(null, { versao: 1, voz }, agora)
    expect(r).toMatchObject({ versao: 1, voz, migradaEm: null, dnaArquivado: null, problemas: [] })
    // A prova de que o `null` seria o estrago: ele vira formulário VAZIO na versão 0.
    expect(registroParaFormulario(r)).toEqual({ form: vozParaFormulario(voz), versao: 1 })
    expect(registroParaFormulario(null)).toEqual({ form: vozParaFormulario(null), versao: 0 })
  })

  it('o registro montado só do recibo é o que a reconciliação precisa: a base avança e o rascunho posterior fica', () => {
    const v1 = registroParaFormulario({ versao: 1, voz })
    const lida = reconciliarComServidor(ESTADO_INICIAL_DA_VOZ, v1, { enviado: null, substituindo: false })
    const a = { ...v1.form, descricao: 'A — direta e quente.' }
    const b = { ...v1.form, descricao: 'B — direta, quente e curta.' }
    const doRecibo = registroComRecibo({ ...anterior, versao: 1 }, { versao: 2, voz: lerVoz(formularioParaVoz(a)).voz }, agora)
    const depois = reconciliarComServidor({ ...lida, form: b }, registroParaFormulario(doRecibo), { enviado: a, substituindo: false })
    expect(depois.form).toBe(b)
    expect(formulariosIguais(depois.base, a)).toBe(true)
    expect(depois).toMatchObject({ versaoLida: 2, divergente: null })
  })
})

/**
 * O que a pessoa LÊ quando a voz ainda não passa. O Ciro digitou um exemplo
 * aprovado na Real Gelateria e recebeu "descricao: String must contain at
 * least 1 character(s)" — nome de campo do banco e frase do zod em inglês,
 * para quem cuida do Instagram de restaurante (22/09/2026).
 *
 * O teste anda o caminho REAL — formulário → `lerVoz` → mensagem — e a trava
 * que vale por todas é a última: nenhuma frase do zod pode chegar à tela.
 */
describe('o problema da voz, em português', () => {
  const vazio = vozParaFormulario(null)

  function naTela(form: ReturnType<typeof vozParaFormulario>): string[] {
    const { voz: passou, problemas } = lerVoz(formularioParaVoz(form))
    expect(passou).toBeNull()
    return problemasDaVozEmPortugues(problemas)
  }

  it('o caso do Ciro: diz o campo pelo rótulo da TELA e o que falta', () => {
    expect(naTela({ ...vazio, exemplos: ['Sua pausa com sabores Real'] })).toEqual(['Descrição: falta preencher'])
  })

  it('item de lista aponta QUAL item e qual parte dele', () => {
    const regra = { ...regraEmBranco([], '2026-09-22'), texto: '', motivo: '' }
    expect(naTela({ ...vazio, descricao: 'Direta e calorosa.', regras: [regra] })).toEqual([
      'Regras recentes (item 1), a regra: falta preencher',
      'Regras recentes (item 1), o motivo: falta preencher',
    ])
    // Reescrita pela metade FICA na lista de propósito (o contrato recusa e a pessoa vê onde).
    expect(naTela({ ...vazio, descricao: 'Direta e calorosa.', antesDepois: [{ antes: 'Venha conhecer', depois: '', motivo: '' }] })).toEqual([
      'Reescritas (item 1), o "depois": falta preencher',
      'Reescritas (item 1), o motivo: falta preencher',
    ])
  })

  it('texto comprido demais diz o limite, e o problema da voz INTEIRA passa como está', () => {
    expect(naTela({ ...vazio, descricao: 'a'.repeat(601) })).toEqual(['Descrição: passou de 600 caracteres — encurte o texto'])
    const grande = naTela({
      ...vazio,
      descricao: 'Direta.',
      exemplos: Array.from({ length: 12 }, (_, i) => `frase ${i} `.repeat(19)),
      proibicoes: Array.from({ length: 20 }, (_, i) => `proibição ${i} `.repeat(11)),
    })
    expect(grande).toHaveLength(1)
    expect(grande[0]).toContain(`passa de ${TETO_DO_PROMPT_DA_VOZ} caracteres no prompt`)
  })

  it('nenhuma frase do zod chega à tela', () => {
    const formulários = [
      { ...vazio },
      { ...vazio, descricao: 'a'.repeat(601), tratamento: 'b'.repeat(161) },
      { ...vazio, descricao: 'Direta.', exemplos: Array.from({ length: 13 }, (_, i) => `frase ${i}`) },
      { ...vazio, descricao: 'Direta.', regras: [{ ...regraEmBranco([], '2026-09-22'), texto: 'c'.repeat(241), motivo: '' }] },
      { ...vazio, descricao: 'Direta.', antesDepois: [{ antes: 'd'.repeat(201), depois: '', motivo: '' }] },
    ]
    for (const form of formulários) {
      for (const linha of naTela(form)) {
        expect(linha).not.toMatch(/String must|Array must|Required|Expected |Invalid enum|Unrecognized key/)
        expect(linha).toMatch(/^[A-ZÀ-Ú]/)
      }
    }
  })
})
