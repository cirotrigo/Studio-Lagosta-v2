import { describe, expect, it } from 'vitest'
import {
  situacaoDoPilar,
  curadoriaPendente,
  prioridadesDaPauta,
  clientesSemPauta,
  legendaDoPdf,
  mensagemCompleta,
  MINIMO_DE_FOTOS_POR_PILAR,
  type PautaDeFotografia,
} from '../pauta-fotografos-contrato'

function pautaDeExemplo(): PautaDeFotografia {
  return {
    geradaEm: '2026-08-31',
    clientes: [
      {
        projectId: 3,
        nome: 'TERO',
        totalDoAcervo: 1398,
        totalDestacadas: 15,
        pilares: [
          { nome: 'Rolha free', casaveis: 0, pctDoAcervo: 0, destacadasQueCasam: 0 },
          { nome: 'Sobremesas', casaveis: 500, pctDoAcervo: 35.8, destacadasQueCasam: 4 },
        ],
        temasRejeitados: [{ tema: 'Almoço Executivo', fechadas: 2, trocadas: 1, expiradas: 1 }],
      },
      {
        projectId: 6,
        nome: 'Espeto Gaúcho',
        totalDoAcervo: 552,
        totalDestacadas: 16,
        pilares: [{ nome: 'Promoções', casaveis: 8, pctDoAcervo: 1.4, destacadasQueCasam: 0 }],
        temasRejeitados: [],
      },
      {
        projectId: 11,
        nome: 'Wine Vix',
        totalDoAcervo: 936,
        totalDestacadas: 12,
        pilares: [{ nome: 'Harmonização', casaveis: 847, pctDoAcervo: 90.5, destacadasQueCasam: 5 }],
        temasRejeitados: [],
      },
      {
        projectId: 9,
        nome: 'Ciro Trigo',
        totalDoAcervo: 0,
        totalDestacadas: 0,
        pilares: [],
        temasRejeitados: [],
        semCatalogo: true,
      },
    ],
  }
}

describe('situacaoDoPilar', () => {
  it('zero, magro e ok nos limites', () => {
    expect(situacaoDoPilar(0)).toBe('zero')
    expect(situacaoDoPilar(MINIMO_DE_FOTOS_POR_PILAR - 1)).toBe('magro')
    expect(situacaoDoPilar(MINIMO_DE_FOTOS_POR_PILAR)).toBe('ok')
  })
})

describe('curadoriaPendente', () => {
  it('tem foto e nenhuma destacada = pendente; sem foto NÃO é curadoria (é câmera)', () => {
    expect(curadoriaPendente({ nome: 'x', casaveis: 10, pctDoAcervo: 1, destacadasQueCasam: 0 })).toBe(true)
    expect(curadoriaPendente({ nome: 'x', casaveis: 0, pctDoAcervo: 0, destacadasQueCasam: 0 })).toBe(false)
    expect(curadoriaPendente({ nome: 'x', casaveis: 10, pctDoAcervo: 1, destacadasQueCasam: 2 })).toBe(false)
  })
})

describe('prioridadesDaPauta', () => {
  it('ordena pela força da evidência: falta no acervo, buscas mortas, magro', () => {
    const prioridades = prioridadesDaPauta(pautaDeExemplo())
    expect(prioridades.map((p) => p.tipo)).toEqual(['falta-no-acervo', 'busca-morta', 'cobertura-magra'])
    expect(prioridades[0]).toMatchObject({ cliente: 'TERO', assunto: 'Rolha free' })
    expect(prioridades[1]).toMatchObject({ cliente: 'TERO', assunto: 'Almoço Executivo' })
    expect(prioridades[2]).toMatchObject({ cliente: 'Espeto Gaúcho', assunto: 'Promoções' })
  })

  it('cliente sem catálogo fica fora das prioridades', () => {
    const prioridades = prioridadesDaPauta(pautaDeExemplo())
    expect(prioridades.some((p) => p.cliente === 'Ciro Trigo')).toBe(false)
  })
})

describe('clientesSemPauta', () => {
  it('só quem não tem lacuna nem curadoria pendente', () => {
    // Wine Vix tem pilar ok e COM destacadas; TERO e Espeto têm lacunas;
    // Ciro Trigo está sem catálogo (não é "sem pauta", é "sem medição").
    expect(clientesSemPauta(pautaDeExemplo())).toEqual(['Wine Vix'])
  })
})

describe('textos', () => {
  it('a legenda é curta, cita a contagem e manda para o PDF', () => {
    const legenda = legendaDoPdf(pautaDeExemplo())
    expect(legenda).toContain('31/08/2026')
    expect(legenda).toContain('3 ponto(s)')
    expect(legenda).toContain('TERO — Rolha free')
    expect(legenda).toContain('PDF')
    expect(legenda.length).toBeLessThan(500)
  })

  it('teste é rotulado como teste', () => {
    expect(legendaDoPdf(pautaDeExemplo(), { teste: true }).startsWith('[TESTE]')).toBe(true)
    expect(mensagemCompleta(pautaDeExemplo(), { teste: true }).startsWith('[TESTE]')).toBe(true)
  })

  it('a mensagem completa carrega prioridades, curadoria e sem-pauta', () => {
    const texto = mensagemCompleta(pautaDeExemplo())
    expect(texto).toContain('FALTA NO ACERVO')
    expect(texto).toContain('Curadoria pendente')
    expect(texto).toContain('Espeto Gaúcho: Promoções')
    expect(texto).toContain('Sem pauta urgente:* Wine Vix')
    expect(texto).toContain('Regras de sempre')
  })

  it('pauta vazia não inventa prioridade', () => {
    const vazia: PautaDeFotografia = { geradaEm: '2026-08-31', clientes: [] }
    expect(prioridadesDaPauta(vazia)).toEqual([])
    expect(legendaDoPdf(vazia)).toContain('Sem lacuna nova')
  })
})
