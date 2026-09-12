import { describe, expect, it } from 'vitest'
import { comConferencia, conferenciaDoCheck, LACUNA_SEM_CAMADAS, registroParaIA, revisaoPosicional, textoEnviadoDoContrato, type CopyAutoral } from '..'

const contrato: CopyAutoral = {
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat', em: '2026-09-12T10:00:00.000Z' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake', 'em [dobro]'], estilo: { linhasNaVoz2: [1] } },
    { id: 'cta', funcao: 'cta', ordem: 1, linhas: [] },
    { id: 'servico', funcao: 'servico', ordem: 2, linhas: ['Seg a sáb · 11h às 22h'] },
  ],
  revisoes: [],
}

describe('o registro da copy numa arte SEM camadas (via de IA e melhoria)', () => {
  it('o texto enviado é cada bloco COM texto, em ordem, com as linhas do autor unidas por quebra; bloco vazio fica de fora', () => {
    expect(textoEnviadoDoContrato(contrato)).toEqual(['Milk-shake\nem [dobro]', 'Seg a sáb · 11h às 22h'])
  })

  it('registroParaIA declara a lacuna das camadas e só é comparável com autoria conhecida', () => {
    const r = registroParaIA(contrato, ['MILK-SHAKE\nEM DOBRO', 'Seg a sáb · 11h às 22h'])
    expect(r.comparavel).toBe(true)
    expect(r.lacunas[0]).toBe(LACUNA_SEM_CAMADAS)
    expect(r.enviada[0]).toBe('MILK-SHAKE\nEM DOBRO')
    const legado = registroParaIA({ ...contrato, origem: { autor: 'desconhecido', superficie: 'legado' } }, ['x'])
    expect(legado.comparavel).toBe(false)
  })

  it('a conferência entra como registro: transcrição, o que faltou, se passou; sem check, passou é null', () => {
    const c = conferenciaDoCheck({ passed: false, missing: ['SEG A SAB 11H AS 22H'], extracted: ['MILK-SHAKE EM DOBRO'], grafiaDivergente: [] }, 'copy')
    expect(c).toEqual({ lida: ['MILK-SHAKE EM DOBRO'], faltando: ['SEG A SAB 11H AS 22H'], passou: false, regua: 'copy' })
    expect(conferenciaDoCheck(null, 'nenhuma (visão indisponível)')).toEqual({ lida: [], faltando: [], passou: null, regua: 'nenhuma (visão indisponível)' })
    const r = comConferencia(registroParaIA(contrato, ['a']), c)
    expect(r.conferencia?.faltando).toEqual(['SEG A SAB 11H AS 22H'])
  })

  it('revisaoPosicional: o pedido de refino que troca UM bloco vira revisão de quem pediu, com o motivo; a voz 2 acompanha a linha', () => {
    const r = revisaoPosicional(contrato, ['Milk-shake\nem [dobro]', 'Ter a dom · 11h às 23h'], { autor: 'claude', superficie: 'melhoria' }, 'pedido de refino: troque o horário')
    expect('copy' in r).toBe(true)
    if (!('copy' in r)) return
    expect(r.mudou).toBe(true)
    expect(r.copy.blocos.find((b) => b.id === 'servico')?.linhas).toEqual(['Ter a dom · 11h às 23h'])
    expect(r.copy.blocos.find((b) => b.id === 'headline')?.estilo?.linhasNaVoz2).toEqual([1])
    expect(r.copy.blocos.find((b) => b.id === 'cta')?.linhas).toEqual([])
    const ultima = r.copy.revisoes.at(-1)
    expect(ultima?.autor).toBe('claude')
    expect(ultima?.motivo).toBe('pedido de refino: troque o horário')
    expect(ultima?.blocos).toEqual(['servico'])
  })

  it('revisaoPosicional: a MESMA copy não abre revisão; número de blocos diferente é descartado com motivo', () => {
    const igual = revisaoPosicional(contrato, ['Milk-shake\nem [dobro]', 'Seg a sáb · 11h às 22h'], { autor: 'claude', superficie: 'melhoria' }, 'x')
    expect('copy' in igual && igual.mudou).toBe(false)
    const r = revisaoPosicional(contrato, ['só um bloco'], { autor: 'claude', superficie: 'melhoria' }, 'x')
    expect('descartado' in r && r.descartado).toMatch(/mudou o número de blocos com texto \(2 → 1\)/)
  })
})
