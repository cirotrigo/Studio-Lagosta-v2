/**
 * A régua protege o que existe; o buraco é o que o prompt sugere e a copy não
 * tem (01/09/2026, happy hour do Quintal). Estas regras fecham o buraco.
 */
import { describe, expect, it } from 'vitest'

import {
  contagemDeBlocos,
  fatosDoClienteNaMelhoria,
  instrucaoDeServicoNaMelhoria,
  regrasDaCasaNaMelhoria,
} from '../regras-da-melhoria'

const REGUA_SEM_SERVICO = ['Happy hour', 'Chope e Drinks', 'em Dobro', 'Chope e drinks selecionados em dobro.', 'Junta a galera']
const REGUA_COM_SERVICO = ['Quinta no', 'Quintal', 'Quinta, das 11h às 00h · Praia do Canto, Vitória-ES', 'Chega mais']
const FATOS = ['Endereço: Rua Aleixo Netto, 1158, Praia do Canto, Vitória/ES.', 'Terça a sábado: das 11h à meia-noite.']

describe('serviço condicional à régua', () => {
  it('régua sem serviço vira PROIBIÇÃO de criar rodapé', () => {
    const r = instrucaoDeServicoNaMelhoria(REGUA_SEM_SERVICO)
    expect(r).toMatch(/NÃO TEM LINHA DE SERVIÇO/)
    expect(r).toMatch(/não escreva horário, endereço/i)
    expect(r).toMatch(/pino de localização/)
    expect(r).not.toMatch(/SERVIÇO VAI PARA O RODAPÉ/)
    expect(r).toMatch(/exatamente 5 blocos/)
  })

  it('régua com serviço mantém a instrução de rodapé e a contagem', () => {
    const r = instrucaoDeServicoNaMelhoria(REGUA_COM_SERVICO)
    expect(r).toMatch(/SERVIÇO VAI PARA O RODAPÉ/)
    expect(r).toMatch(/exatamente 4 blocos/)
  })

  it('sem régua nenhuma continua condicional ao que o modelo vê, sem contagem', () => {
    const r = instrucaoDeServicoNaMelhoria([])
    expect(r).toMatch(/Se a arte tiver linha de horário/)
    expect(r).not.toMatch(/CONTAGEM/)
  })
})

describe('linha de serviço dos modelos do Studio', () => {
  it('dia + horário + bairro/UF numa linha só é serviço', async () => {
    const { blocosDeServico } = await import('../blocos-de-servico')
    expect(blocosDeServico(['Quinta, das 11h às 00h · Praia do Canto, Vitória-ES'])).toHaveLength(1)
    expect(blocosDeServico(['Ter a Sex, das 16h às 19h'])).toHaveLength(1)
    // Assunto continua assunto.
    expect(blocosDeServico(['Sexta é dia de quintal', 'Almoço com a família e amigos, a partir das 11h'])).toHaveLength(0)
  })
})

describe('contagemDeBlocos', () => {
  it('conta e proíbe o a mais, com a logomarca fora da conta', () => {
    const r = contagemDeBlocos(REGUA_COM_SERVICO)
    expect(r).toMatch(/exatamente 4 blocos/)
    expect(r).toMatch(/nem um a mais/)
    expect(r).toMatch(/logomarca/)
  })
})

describe('fatos do cliente', () => {
  it('só entram quando a régua tem ENDEREÇO — horário sozinho não basta', () => {
    expect(fatosDoClienteNaMelhoria({ expectedTexts: REGUA_SEM_SERVICO, userRequest: '', fatosDoCliente: FATOS })).toBeNull()
    // O happy hour real de 02/09: régua com horário, sem endereço → sem fatos.
    expect(fatosDoClienteNaMelhoria({ expectedTexts: ['Happy hour', 'Chope e Drinks', 'em Dobro', 'Ter a Sex, das 16h às 19h', 'Junta a galera'], userRequest: '', fatosDoCliente: FATOS })).toBeNull()
    const r = fatosDoClienteNaMelhoria({ expectedTexts: REGUA_COM_SERVICO, userRequest: '', fatosDoCliente: FATOS })
    expect(r).toMatch(/só para conferir, nunca para acrescentar/)
    expect(r).toMatch(/Aleixo Netto/)
  })

  it('bloco inteiro segue a ordem: serviço, fatos, fidelidade por último', () => {
    const r = regrasDaCasaNaMelhoria({ expectedTexts: REGUA_COM_SERVICO, userRequest: '', fatosDoCliente: FATOS })
    expect(r.indexOf('[FATOS DO CLIENTE')).toBeGreaterThan(r.indexOf('SERVIÇO VAI PARA O RODAPÉ'))
    expect(r.indexOf('A FOTOGRAFIA É INTOCÁVEL')).toBeGreaterThan(r.indexOf('[FATOS DO CLIENTE'))
  })
})
