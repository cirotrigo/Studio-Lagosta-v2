/**
 * O que o modelo escolhido à mão manda para o prompt — e o que ele NUNCA manda.
 *
 * Os dados abaixo são a leitura real da arte de referência do O Quintal
 * Parrilla ("Sabadouu"), gravada em `Generation.fieldValues` em 17/08/2026,
 * quando as cinco peças da leva saíram com o endereço e o horário daquele post
 * antigo — e com tudo empilhado num bloco no meio do quadro.
 */
import { describe, expect, it } from 'vitest'

import {
  descricaoDoGuia,
  elementosDoGuia,
  faixaDaBanda,
  textosDoGuia,
  zonasDoGuia,
} from '../carousel-guide-decoder'

/** A referência tem manchete no ALTO e serviço no RODAPÉ: duas zonas. */
const MODELO_EM_ZONAS = {
  zonas: [
    {
      papel: 'manchete',
      banda: 2,
      lado: 'centro' as const,
      alinhamento: 'centro' as const,
      niveis: [
        { texto: 'Sabadouuu', papel: 'título', cor: 'branco', tamanhoRelativo: 'o maior' },
        { texto: 'sua resenha é aqui!', papel: 'subtítulo', cor: 'branco', tamanhoRelativo: 'metade do título' },
      ],
    },
    {
      papel: 'serviço',
      banda: 8,
      lado: 'esquerda' as const,
      alinhamento: 'esquerda' as const,
      niveis: [
        { texto: 'Funcionamento - 11h às 00h', papel: 'apoio', cor: 'branco' },
        { texto: 'R. Aleixo Netto, 1158 - Praia do Canto, Vitória', papel: 'apoio', cor: 'branco' },
      ],
    },
  ],
  elementosGraficos: [
    'ícone de relógio à esquerda do horário',
    // A visão cita a vizinhança entre aspas: a última porta do vazamento.
    // (Ornamento de verdade — "selo" seria a MARCA, e a marca é filtrada.)
    "filete fino acima de 'O Quintal Parrilla Bar'",
    { tipo: 'ícone de localização', posicao: "antes de 'R. Aleixo Netto, 1158'" },
  ],
}

describe('descricaoDoGuia', () => {
  it('NÃO escreve as palavras do modelo — foi o que vazou para as cinco peças', () => {
    const texto = descricaoDoGuia(MODELO_EM_ZONAS)

    expect(texto).not.toContain('Sabadouuu')
    expect(texto).not.toContain('Funcionamento')
    expect(texto).not.toContain('Aleixo Netto')
    expect(texto).not.toContain('1158')
  })

  it('tira as palavras citadas na descrição do elemento gráfico, sem perder a posição', () => {
    const texto = descricaoDoGuia(MODELO_EM_ZONAS)

    expect(texto).toContain('filete fino acima do texto')
    expect(texto).toContain('ícone de localização — antes do texto')
    // A vizinhança continua dita; as palavras dela, não.
    expect(texto).toContain('ícone de relógio à esquerda do horário')
    expect(texto).not.toContain('Parrilla Bar')
  })

  it('descreve a FORMA de cada nível, que é o que se copia', () => {
    const texto = descricaoDoGuia(MODELO_EM_ZONAS)

    expect(texto).toContain('título')
    expect(texto).toContain('cor branco')
    expect(texto).toContain('o maior')
    // A caixa é MEDIDA no texto transcrito, nunca perguntada ao modelo.
    expect(texto).toContain('caixa Title Case')
    expect(texto).toContain('ícone de relógio à esquerda do horário')
  })

  it('mantém as duas zonas separadas, cada uma na sua faixa', () => {
    const texto = descricaoDoGuia(MODELO_EM_ZONAS)

    expect(texto).toContain('ZONAS DE TEXTO: 2')
    expect(texto).toContain('faixa terço superior (começa a ~19% da altura)')
    expect(texto).toContain('faixa rodapé (começa a ~94% da altura)')
  })

  it('aceita a resposta no formato ANTIGO, de bloco único', () => {
    // Reconciliação: o modelo às vezes responde como respondia antes.
    const texto = descricaoDoGuia({
      posicaoDoBloco: 'canto inferior esquerdo, margem de ~5% da largura',
      alinhamento: 'esquerda',
      niveis: [{ texto: 'Mini Kaftas', papel: 'título', cor: 'branco' }],
    })

    expect(texto).toContain('Bloco de texto')
    expect(texto).toContain('alinhado à esquerda')
    expect(texto).toContain('título')
    expect(texto).not.toContain('Mini Kaftas')
  })

  it('sem zona nenhuma devolve vazio, para o chamador desistir da leitura', () => {
    expect(descricaoDoGuia({}).trim()).toBe('')
  })

  it('NÃO manda tratar a foto na peça avulsa, e manda na série', () => {
    // "Tratamento da foto: temperatura neutra, contraste alto" foi ao prompt do
    // TERO em 17/08/2026 e a peça saiu com a foto estourada — é a descrição da
    // foto ANTIGA virando ordem sobre a NOVA. No carrossel a linha fica: lá o
    // guia estabelece o look de uma série que precisa parecer a mesma sessão.
    const guia = { ...MODELO_EM_ZONAS, tratamentoDaFoto: 'temperatura neutra, contraste alto' }

    expect(descricaoDoGuia(guia)).not.toContain('Tratamento da foto')
    expect(descricaoDoGuia(guia, { tratamentoDaFoto: true })).toContain(
      'Tratamento da foto: temperatura neutra, contraste alto',
    )
  })
})

describe('textosDoGuia', () => {
  it('entrega as palavras do modelo para a CONFERÊNCIA — o único uso delas', () => {
    expect(textosDoGuia(MODELO_EM_ZONAS)).toEqual([
      'Sabadouuu',
      'sua resenha é aqui!',
      'Funcionamento - 11h às 00h',
      'R. Aleixo Netto, 1158 - Praia do Canto, Vitória',
    ])
  })
})

describe('zonasDoGuia', () => {
  it('ignora zona vazia devolvida pela visão', () => {
    expect(zonasDoGuia({ zonas: [{}, { banda: 8 }] })).toEqual([{ banda: 8 }])
  })
})

describe('faixaDaBanda', () => {
  it('conclui o rótulo e a altura a partir da banda medida', () => {
    expect(faixaDaBanda(1)).toBe('topo (começa a ~6% da altura)')
    expect(faixaDaBanda(6)).toBe('terço inferior (começa a ~69% da altura)')
    expect(faixaDaBanda(8)).toBe('rodapé (começa a ~94% da altura)')
  })

  it('não conclui posição nenhuma fora de 1..8 — inventar lugar é pior que omitir', () => {
    expect(faixaDaBanda(undefined)).toBeNull()
    expect(faixaDaBanda(0)).toBeNull()
    expect(faixaDaBanda(9)).toBeNull()
    expect(faixaDaBanda(Number.NaN)).toBeNull()
  })
})

/**
 * A marca NÃO é ornamento nem nível de texto — ela tem bloco próprio.
 *
 * Caso real do almoço executivo do O Quintal (17/08/2026): a visão devolveu
 * "selo à direita do serviço" como elemento gráfico e uma zona de assinatura
 * como zona de texto; o SPINE promoveu o selo a "DESENHE OBRIGATORIAMENTE" e a
 * arte saiu com o lockup completo no topo MAIS o símbolo sozinho no rodapé.
 */
describe('a marca do modelo', () => {
  const COM_ASSINATURA = {
    zonas: [
      {
        papel: 'manchete',
        banda: 2,
        niveis: [{ texto: 'Almoço Executivo', papel: 'título', cor: 'branco' }],
      },
      {
        papel: 'assinatura',
        banda: 8,
        lado: 'direita' as const,
        niveis: [{ texto: 'O Quintal Parrilla Bar', papel: 'selo', cor: 'branco' }],
      },
    ],
    elementosGraficos: ['selo à direita do serviço', 'filete acima da manchete'],
  }

  it('não entra na lista de ornamentos obrigatórios', () => {
    expect(elementosDoGuia(COM_ASSINATURA)).toEqual(['filete acima da manchete'])
  })

  it('vira UMA linha dizendo onde a marca mora, não um nível para letrar', () => {
    const texto = descricaoDoGuia(COM_ASSINATURA)

    expect(texto).toContain('ASSINATURA DA MARCA')
    expect(texto).toContain('UMA única vez')
    expect(texto).toContain('lado direita')
    // Não pode virar item de "níveis de texto": é assim que ela é desenhada 2x.
    expect(texto).not.toContain('1. selo')
  })

  it('não conta como zona de TEXTO — senão o modelo procura copy que não existe', () => {
    // Duas zonas, mas só UMA de texto: a linha de contagem não aparece.
    expect(descricaoDoGuia(COM_ASSINATURA)).not.toContain('ZONAS DE TEXTO')
  })

  it('"marcador" continua sendo ornamento legítimo', () => {
    expect(elementosDoGuia({ elementosGraficos: ['marcador entre as linhas do serviço'] })).toEqual([
      'marcador entre as linhas do serviço',
    ])
  })
})
