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

/**
 * A agenda de feriado da Wine Vix, verbatim do `fieldValues.textos` da
 * geração `cmtndl3fa0003gm0a72w6bl0u` (04/09/2026). Seis dos treze blocos são
 * classificados como serviço — é a peça que quebrou a regra antiga.
 */
const AGENDA_WINE_VIX = [
  'Programação Feriado',
  'Sexta-feira',
  'Funcionamento - 10h às 22h',
  'Happy Hour - 16h às 19h',
  'Sábado',
  'Funcionamento - 10h às 22h',
  'Happy Hour - 16h às 19h',
  'Domingo e Segunda',
  'FECHADO PARA MANUTENÇÃO',
  'Terça-feira',
  'Funcionamento - 10h às 22h',
  'Happy Hour - 16h às 19h',
  'Te esperamos com harmonizações incríveis',
]

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

/**
 * ⚠️ SUÍTE DO CAMINHO DE VOLTA. `instrucaoDeServicoNaMelhoria` está SEM USO
 * desde 04/09/2026 (ver o cabeçalho do módulo); ela e estes testes existem
 * para que voltar a usá-la seja uma linha, e não uma reescrita. Nada aqui
 * descreve o comportamento de produção de hoje.
 */
describe('instrucaoDeServicoNaMelhoria (legado, sem uso)', () => {
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
    expect(texto).toContain('A ESTRUTURA DA ARTE É DADA')
    expect(texto).toContain('MARGEM')
    expect(texto).toContain('NENHUM CONTRASTE ACRESCENTADO')
    expect(texto).toContain('LEIA A FOTO ANTES DE POSICIONAR O TEXTO')
    expect(texto).toContain('NÃO INVENTE DADO')
  })

  /**
   * 🔴 A MELHORIA NÃO ACRESCENTA CONTRASTE (Ciro, 05/09/2026: "está
   * escurecendo muito a imagem e gostaria de retirar essa funcionalidade").
   * A regra antiga AUTORIZAVA um halo "quando o texto precisar de contraste";
   * no almoço de feriado do Quintal isso voltou como o terço inferior inteiro
   * escurecido e -19% de luz média, sem pedido nenhum. A licença vive também
   * no DNA ("Gradiente de Leitura", "véu") e na direção de arte ("degradê
   * discreto"), então a regra precisa revogá-las PELO NOME.
   */
  it('não autoriza halo nem véu, e revoga pelo nome o gradiente do DNA e o degradê da direção de arte', () => {
    const texto = regrasDaCasaNaMelhoria({ expectedTexts: [], userRequest: '' })
    expect(texto).not.toContain('HALO DE LEITURA')
    expect(texto).not.toMatch(/quando o texto precisar de contraste/i)
    expect(texto).toMatch(/gradiente de leitura/i)
    expect(texto).toMatch(/véu de legibilidade/i)
    expect(texto).toMatch(/degradê discreto atrás do texto/i)
    // a única saída para texto ilegível é a posição (regra 3)
    expect(texto).toMatch(/ÚNICA ferramenta é a posição/)
    // e o que a origem já tem fica como está — nunca reforçado
    expect(texto).toMatch(/nunca reforce, nunca amplie/i)
  })

  /**
   * 🔴 O RAMO SEM RÉGUA É O CASO COMUM — 60 das 74 melhorias medidas em 04/09
   * (arte vinda do canvas ou de upload, que não tem texto esperado gravado).
   * `instrucaoDeEstrutura` emite ali uma frase PRÓPRIA, condicional ao que o
   * modelo lê na IMAGEM 1, e ela não tinha asserção nenhuma: provado por
   * mutação na revisão — trocando a frase inteira por lixo, as 28 asserções
   * das duas suítes continuavam verdes. É o caminho de 80% das melhorias.
   */
  it('sem régua, a contagem fica condicional ao que o modelo LÊ na arte', () => {
    const texto = regrasDaCasaNaMelhoria({ expectedTexts: [], userRequest: '' })
    expect(texto).toMatch(/CONTAGEM DE BLOCOS: os blocos de texto que você lê na IMAGEM 1 são TODOS os que existem/)
    expect(texto).toMatch(/nem um a mais/)
    // sem régua não há lista para contar — a contagem numérica não pode aparecer
    expect(texto).not.toMatch(/exatamente \d+ bloco/)
    // e a proibição de reescrever a palavra que ninguém aprovou vive só aqui
    expect(texto).toMatch(/Não corrija, não traduza, não abrevie e não complete nenhuma palavra/)
  })

  it('com régua, a contagem é numérica e substitui a condicional', () => {
    const texto = regrasDaCasaNaMelhoria({ expectedTexts: AGENDA_WINE_VIX, userRequest: '' })
    expect(texto).toContain('exatamente 13 blocos')
    expect(texto).not.toMatch(/os blocos de texto que você lê na IMAGEM 1 são TODOS/)
  })

  /**
   * 🔴 A REGRESSÃO DA WINE VIX (04/09/2026) — o teste que este módulo existe
   * para não repetir. A arte é uma AGENDA de feriado: 6 dos 13 blocos são
   * "Funcionamento - 10h às 22h" / "Happy Hour - 16h às 19h", um par por dia.
   * `blocosDeServico` os classifica como serviço, e a regra antiga então
   * mandava movê-los para um rodapé — desmontando a peça. O gpt-image cumpriu
   * as duas ordens incompatíveis (a lista por dia E o rodapé) e devolveu a
   * programação inteira repetida, nas duas rodadas.
   */
  it('peça que É uma agenda não recebe ordem de mover nada para o rodapé', () => {
    const texto = regrasDaCasaNaMelhoria({ expectedTexts: AGENDA_WINE_VIX, userRequest: '' })
    expect(texto).not.toContain('SERVIÇO VAI PARA O RODAPÉ')
    expect(texto).not.toMatch(/MOVA para o rodapé/i)
    expect(texto).not.toMatch(/sai da sequência de cima/i)
    // e diz o contrário, nominalmente
    expect(texto).toMatch(/NÃO mova um bloco para outra zona/)
    expect(texto).toContain('exatamente 13 blocos')
  })

  /**
   * 🔴 A ARBITRAGEM CONTRA A IDENTIDADE — o elo que faltava para esta regra
   * alcançar cliente nenhum. Varredura dos 11 projetos em 04-05/09/2026: o
   * `composition`/`visualStyle` do BrandDNA prescreve layout ("endereço SEMPRE
   * no rodapé", "título na parte superior", "ícones de relógio", "linha fina
   * com losango"), e essa prosa entra INTEIRA em [IDENTIDADE DA MARCA] a ~25%
   * do prompt, contra a regra 1 a ~75%. A regra ANTIGA tinha a ressalva; a
   * reescrita a removeu junto com a autorização de ícone.
   */
  it('a regra 1 se declara vencedora das descrições de layout da identidade', () => {
    const texto = regrasDaCasaNaMelhoria({ expectedTexts: [], userRequest: '' })
    expect(texto).toContain('ESTA REGRA VENCE AS DESCRIÇÕES DE LAYOUT DA [IDENTIDADE DA MARCA]')
    // revoga LUGAR e ORNAMENTO, pelo nome
    expect(texto).toMatch(/sempre no rodapé/)
    expect(texto).toMatch(/ícone de relógio, pino de localização, filete, losango, selo/)
    // e NÃO revoga o que faz a peça continuar sendo da marca
    expect(texto).toMatch(/a paleta, a tipografia e o jeito da marca se parecer/)
  })

  /**
   * 🔴 O ícone: único ponto do prompt que o autorizava era a regra de serviço,
   * injetada por padrão. A Roberta escreveu "não inclua ícones" em 34 dos 74
   * pedidos dela entre 01/08 e 04/09 — desligando na mão o que o sistema
   * ligava sozinho. Nenhuma régua pode voltar a autorizá-lo por conta própria.
   */
  it('nenhuma régua autoriza ícone por conta própria', () => {
    for (const regua of [[], AGENDA_WINE_VIX, ['ALMOÇO EXECUTIVO', 'Funcionamento - 11h às 00h']]) {
      const texto = regrasDaCasaNaMelhoria({ expectedTexts: regua, userRequest: '' })
      expect(texto).not.toMatch(/um ícone pequeno pode/i)
      expect(texto).toMatch(/nem ícone|não desenhe ícone/i)
    }
  })

  /**
   * A outra metade do desenho de 04/09: as regras são o PADRÃO, e quem pede
   * manda. Sem esta cláusula, "passe o horário para o rodapé" perderia para o
   * "⛔ não mova um bloco" da regra 1 — trocando uma rigidez por outra.
   */
  it('com pedido, o pedido se declara vencedor destas regras — e só delas', () => {
    const texto = regrasDaCasaNaMelhoria({
      expectedTexts: AGENDA_WINE_VIX,
      userRequest: 'passe o horário para o rodapé e destaque o dia em dourado',
    })
    expect(texto).toContain('O PEDIDO DO CLIENTE VENCE ESTAS REGRAS')
    expect(texto).toMatch(/se ele pedir para mover um bloco, mova/i)
    // o que o pedido NÃO revoga
    expect(texto).toMatch(/inventar dado que você não consegue ler/i)
    expect(texto).toMatch(/mexer na fotografia sem autorização/i)
    expect(texto).toMatch(/AS REGRAS ACIMA VALEM INTEIRAS/)
  })

  /**
   * 🔴 Metade do que a equipe escreve é PROIBIÇÃO ("não inclua ícones" apareceu
   * em 34 dos 74 pedidos da Roberta). Um pedido desses estreita as regras, não
   * as afrouxa — e a primeira redação da cláusula abria com "as regras 1 a 4
   * descrevem o que fazer quando ninguém pede nada", que o modelo leu como "há
   * um pedido, logo elas não valem": o rodapé duplicado voltou nas duas
   * rodadas medidas, pior que o prompt antigo.
   */
  it('pedido que só PROÍBE não afrouxa as regras', () => {
    const texto = regrasDaCasaNaMelhoria({
      expectedTexts: AGENDA_WINE_VIX,
      userRequest: 'Melhore a diagramação do texto não inclua ícones. Não inclua textos extras',
    })
    expect(texto).toMatch(/apenas PROÍBE algo .* não revoga nada/)
    expect(texto).toMatch(/acrescenta uma restrição/)
    expect(texto).not.toMatch(/regras 1 a 4 acima descrevem/)
  })

  /**
   * 🔴 Medido em 04/09/2026 na própria agenda, já com as regras novas: ao
   * pedido "passe o horário de cada dia para um rodapé agrupado", o gpt-image
   * montou o rodapé E manteve a lista de cima — 11 blocos repetidos. A
   * cláusula do pedido revogava a regra 1 INTEIRA, inclusive o "não repita",
   * e `[TEXTO EXATO]` não diz quantas vezes cada bloco aparece.
   */
  it('a licença do pedido não revoga o "cada bloco uma única vez"', () => {
    const texto = regrasDaCasaNaMelhoria({
      expectedTexts: AGENDA_WINE_VIX,
      userRequest: 'passe o horário e o happy hour de cada dia para um rodapé agrupado',
    })
    expect(texto).toContain('MOVER É MOVER, NUNCA COPIAR')
    expect(texto).toMatch(/ele SAI de onde estava/)
    expect(texto).toMatch(/UMA ÚNICA VEZ/)
    expect(texto).toMatch(/esta parte da regra 1 o pedido não revoga/i)
  })

  it('sem pedido, a cláusula não existe — não há o que vencer', () => {
    expect(regrasDaCasaNaMelhoria({ expectedTexts: [], userRequest: '' })).not.toContain(
      'O PEDIDO DO CLIENTE VENCE',
    )
    expect(regrasDaCasaNaMelhoria({ expectedTexts: [], userRequest: '   ' })).not.toContain(
      'O PEDIDO DO CLIENTE VENCE',
    )
  })

  /**
   * 🔴 SAÍRAM EM 04/09 porque mandavam REPROJETAR, e reprojeto é de quem pede.
   * "Destaque as palavras-chave" obrigava a mexer em cor e peso da tipografia
   * — o que a Roberta proibia à mão 15 vezes ("não mude as fontes", 11; "não
   * mude as cores", 4). Duas pessoas pedindo o oposto na mesma regra fixa é o
   * sinal de que a decisão não é do sistema.
   */
  it('não obriga destaque de palavra-chave nem reescrita em blocos', () => {
    const texto = regrasDaCasaNaMelhoria({ expectedTexts: [], userRequest: '' })
    expect(texto).not.toContain('DESTAQUE AS PALAVRAS-CHAVE')
    expect(texto).not.toContain('TEXTO EM BLOCOS, NUNCA EM PARÁGRAFO')
    expect(texto).not.toMatch(/Bloco inteiro no mesmo peso e na mesma cor é defeito/)
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
   * 🔴 O DEFEITO QUE ORIGINOU A REGRA 8, relatado pelo Ciro em 01/09/2026:
   * ele pediu a melhoria sem escrever nada e o modelo trocou o tratamento da
   * imagem de fundo. Com o pedido vazio, as instruções mais específicas sobre
   * a foto viram duas da direção de arte ("priorize contraste, profundidade de
   * campo, fundo suavemente desfocado" e "priorize iluminação quente"), que
   * são ordens de reprocessar a imagem.
   */
  it('sem pedido de ajuste na foto, declara a fotografia INTOCÁVEL', () => {
    const texto = regrasDaCasaNaMelhoria({ expectedTexts: [], userRequest: '' })
    expect(texto).toContain('A FOTOGRAFIA É INTOCÁVEL')
    expect(texto).toContain('REVOGA AS LICENÇAS DE TRATAMENTO')
    // as licenças precisam ser revogadas PELO NOME, senão a mais enfática vence
    expect(texto).toMatch(/fundo desfocado/i)
    expect(texto).toMatch(/ilumina/i)
  })

  it('com ajuste na foto pedido, a trava sai e vale a exceção autorizada', () => {
    const texto = regrasDaCasaNaMelhoria({
      expectedTexts: [],
      userRequest: 'melhore a diagramação',
      instrucaoImagem: 'corte a picanha ao meio para revelar o ponto',
    })
    expect(texto).not.toContain('A FOTOGRAFIA É INTOCÁVEL')
  })

  it('a trava vale mesmo quando há pedido sobre a ARTE — são campos diferentes', () => {
    const texto = regrasDaCasaNaMelhoria({
      expectedTexts: [],
      userRequest: 'passe o CTA para o rodapé e destaque as palavras-chave',
    })
    expect(texto).toContain('A FOTOGRAFIA É INTOCÁVEL')
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
