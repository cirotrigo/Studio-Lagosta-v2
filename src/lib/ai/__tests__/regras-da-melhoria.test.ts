/**
 * As sete correções REAIS que o Ciro fez no By Rock em 01/09/2026, na rodada
 * que originou este módulo. Quatro delas eram a mesma regra ("o horário devia
 * estar no rodapé"), que o sistema já sabia desde 17/08 e não dizia à
 * melhoria. É contra esses textos que as regras foram calibradas.
 */
import { describe, expect, it } from 'vitest'

import {
  instrucaoDeServicoNaMelhoria,
  pedeMenosTexto,
  regrasDaCasaNaMelhoria,
} from '../regras-da-melhoria'

/** Os pedidos reais da rodada de 01/09, verbatim. */
const PEDIDOS_REAIS = {
  soArte: 'Melhore a diagramação e o posicionamento dos textos e passem o CTA para o rodapé, estilize melhor com onda sonoras.',
  menosTexto: 'diminua a quantidade de texto e melhore a leitura',
  foto: 'Humaniza essa foto com uma mão dando uma colherada no sorvete e a calda caindo em cima do sorvete',
  horario: 'Corrija o horário de funcionamento que é todos os dias de 11 à meia-noite',
}

describe('pedeMenosTexto', () => {
  it('reconhece o pedido real de enxugar', () => {
    expect(pedeMenosTexto(PEDIDOS_REAIS.menosTexto)).toBe(true)
    expect(pedeMenosTexto('A copy está muito grande, precisa de menos textos')).toBe(true)
    expect(pedeMenosTexto('enxugue a descrição do prato')).toBe(true)
  })

  it('não confunde com pedido de diagramação nem de foto', () => {
    expect(pedeMenosTexto(PEDIDOS_REAIS.soArte)).toBe(false)
    expect(pedeMenosTexto(PEDIDOS_REAIS.foto)).toBe(false)
    expect(pedeMenosTexto(PEDIDOS_REAIS.horario)).toBe(false)
  })

  it('pedido vazio (só a direção de arte) não autoriza cortar nada', () => {
    expect(pedeMenosTexto('')).toBe(false)
  })
})

describe('instrucaoDeServicoNaMelhoria', () => {
  it('aponta os blocos pelo nome quando a copy é conhecida', () => {
    const texto = instrucaoDeServicoNaMelhoria([
      'ALMOÇO EXECUTIVO',
      'Funcionamento - 11h às 00h',
      'R. Aleixo Netto, 1158 - Praia do Canto, Vitória',
    ])
    expect(texto).toContain('horário: "Funcionamento - 11h às 00h"')
    expect(texto).toContain('endereço: "R. Aleixo Netto, 1158 - Praia do Canto, Vitória"')
  })

  /**
   * 🔴 O caso COMUM, e a razão de este módulo não reusar `instrucaoDeServico`
   * da geração: nas 6 melhorias medidas em 01/09, as 6 vinham do canvas
   * (`source: 'arte-enviada'`) e tinham `textCheck: 'skipped'` — não há copy
   * nenhuma para apontar. A regra vira condicional ao que o modelo LÊ.
   * `instrucaoDeServico` devolve `null` aqui, e null não corrige nada.
   */
  it('sem copy conhecida, a regra continua existindo e fica condicional ao que o modelo vê', () => {
    const texto = instrucaoDeServicoNaMelhoria([])
    expect(texto).toContain('Se a arte tiver linha de horário')
    expect(texto).toContain('RODAPÉ')
  })

  /**
   * 🔴 DIVERGE DA GERAÇÃO DE PROPÓSITO. Lá o serviço vai "no MENOR nível de
   * texto"; aqui o Ciro reprovou exatamente isso duas vezes no mesmo dia
   * ("as fontes do horário do endereço ficaram muito pequena, não dá pra ler
   * bem"). O piso de legibilidade tem de vencer a hierarquia.
   */
  it('manda o serviço ser legível, e não apenas o menor nível', () => {
    const texto = instrucaoDeServicoNaMelhoria([])
    expect(texto).toContain('LEGÍVEL')
    expect(texto).toContain('a legibilidade vence')
  })
})

describe('regrasDaCasaNaMelhoria', () => {
  it('as regras de composição não dependem de nada do runtime', () => {
    const texto = regrasDaCasaNaMelhoria({ expectedTexts: [], userRequest: '' })
    expect(texto).toContain('SERVIÇO VAI PARA O RODAPÉ')
    expect(texto).toContain('MARGEM')
    expect(texto).toContain('VÉU DE LEITURA LOCAL E SUAVE')
    expect(texto).toContain('LEIA A FOTO ANTES DE POSICIONAR O TEXTO')
    expect(texto).toContain('DESTAQUE AS PALAVRAS-CHAVE')
  })

  it('a licença de enxugar exige as DUAS condições', () => {
    const semCopyEPedindo = regrasDaCasaNaMelhoria({
      expectedTexts: [],
      userRequest: PEDIDOS_REAIS.menosTexto,
    })
    expect(semCopyEPedindo).toContain('ENXUGAR O TEXTO ESTÁ AUTORIZADO')

    // Copy aprovada no Studio continua intocável, mesmo pedindo.
    expect(
      regrasDaCasaNaMelhoria({
        expectedTexts: ['ALMOÇO EXECUTIVO'],
        userRequest: PEDIDOS_REAIS.menosTexto,
      }),
    ).not.toContain('ENXUGAR O TEXTO ESTÁ AUTORIZADO')

    // Sem pedido explícito, ninguém corta nada por conta própria.
    expect(
      regrasDaCasaNaMelhoria({ expectedTexts: [], userRequest: PEDIDOS_REAIS.soArte }),
    ).not.toContain('ENXUGAR O TEXTO ESTÁ AUTORIZADO')
  })

  /**
   * 🔴 A licença precisa REVOGAR nominalmente, não só autorizar.
   * `[LIMITES ABSOLUTOS]` proíbe encurtar "NENHUMA palavra" e `[PEDIDO DO
   * CLIENTE]` diz que o pedido nunca vence os limites de palavras. A lei da
   * casa, medida três vezes em 16-17/08 na caixa das letras, é que a
   * instrução que não se declara vencedora perde para a mais enfática.
   */
  it('a licença de enxugar se declara vencedora da proibição', () => {
    const texto = regrasDaCasaNaMelhoria({
      expectedTexts: [],
      userRequest: PEDIDOS_REAIS.menosTexto,
    })
    expect(texto).toContain('REVOGA A PROIBIÇÃO DE ENCURTAR')
    expect(texto).toContain('CORTAR é permitido, CRIAR não')
  })

  /**
   * 🔴 ESTE TESTE PROTEGE UMA OMISSÃO DELIBERADA, não um esquecimento.
   *
   * `regraDeSafeArea` (geração) manda reservar ~1/8 da altura no topo e no
   * rodapé do story. Portar isso contradiria a correção do Ciro em 01/09 —
   * "a margem do topo e do rodapé estão GRANDES, use por padrão 90 pixels" —,
   * porque a arte vem do canvas com margens próprias já aprovadas. A melhoria
   * PRESERVA a margem da peça; quem define safe area é quem CRIA a peça.
   *
   * Se um dia a decisão mudar, mude este teste no mesmo commit — de propósito.
   */
  it('NÃO reintroduz a safe area em pixel da geração', () => {
    const texto = regrasDaCasaNaMelhoria({ expectedTexts: [], userRequest: '' })
    expect(texto).not.toMatch(/safe area/i)
    expect(texto).not.toMatch(/1\/8|7\/8/)
    expect(texto).toContain('preserve a margem da arte original')
  })
})
