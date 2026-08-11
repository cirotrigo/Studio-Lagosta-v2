import { describe, it, expect } from 'vitest'
import {
  caiNaEscolhaPropria,
  decidirDesfechoDaCopy,
  escolherItemDoPlano,
} from '../fechar-copy-por-pagina-contrato'

/**
 * O defeito que este arquivo trava, em uma frase: **um sinal por proposta,
 * nunca dois com rótulos opostos.**
 *
 * Desde que `propor-semana` passou a registrar a copy como sugestão emitida,
 * uma peça nascida de leva tem uma proposta EM ABERTO. Se as superfícies que
 * corrigem o texto (o chat por `ajustar-arte`, o editor pelo autosave)
 * continuassem registrando uma escolha absoluta, o mesmo texto viraria dois
 * sinais de sentidos opostos: um dizendo "ninguém propôs nada" e outro
 * pendente, que expiraria como indiferença. O denominador do KPI infla e a
 * taxa de aceitação vira ficção — é o mesmo defeito que a F1 já corrigiu uma
 * vez para os slots (`e3236624`).
 */
describe('escolherItemDoPlano — esta arte veio de uma leva?', () => {
  const AGORA = new Date('2026-08-11T12:00:00.000Z')
  const ONTEM = new Date('2026-08-10T12:00:00.000Z')

  /**
   * O caso COMUM: arte criada no chat ou no editor, sem plano nenhum atrás.
   * Precisa continuar caindo na escolha absoluta — o corpus das primeiras
   * semanas é feito quase só disso.
   */
  it('arte que não veio de leva não acha item', () => {
    expect(escolherItemDoPlano([], { pageId: 'page-1' })).toBeNull()
    expect(
      escolherItemDoPlano([{ id: 'i1', pageId: 'outra', generationId: 'gen-outra' }], {
        pageId: 'page-1',
        generationId: 'gen-1',
      }),
    ).toBeNull()
  })

  it('acha o item pela página da arte', () => {
    const item = escolherItemDoPlano([{ id: 'i1', pageId: 'page-1', generationId: 'gen-1' }], {
      pageId: 'page-1',
    })
    expect(item?.id).toBe('i1')
  })

  /** Na via `ia` o item pode ter arte sem página — casar por arte é o resgate. */
  it('acha o item pela arte quando não há página', () => {
    const item = escolherItemDoPlano([{ id: 'i1', pageId: null, generationId: 'gen-1' }], {
      generationId: 'gen-1',
    })
    expect(item?.id).toBe('i1')
  })

  /**
   * 🔴 A regra que o `ajustar-arte` exige: ele cria uma Generation NOVA a cada
   * ajuste, então o `generationId` em mãos é de uma arte que nenhum item viu.
   * O que sobrevive ao ajuste é a página — e ela precisa vencer, senão um item
   * homônimo por arte roubaria o desfecho.
   */
  it('a PÁGINA vence a arte quando as duas casam com itens diferentes', () => {
    const item = escolherItemDoPlano(
      [
        { id: 'por-arte', pageId: 'outra', generationId: 'gen-1', atualizadoEm: AGORA },
        { id: 'por-pagina', pageId: 'page-1', generationId: 'gen-antiga', atualizadoEm: ONTEM },
      ],
      { pageId: 'page-1', generationId: 'gen-1' },
    )
    expect(item?.id).toBe('por-pagina')
  })

  /** Dois itens na mesma página só acontece com regeneração: vale o último. */
  it('empate na mesma página resolve pelo item mexido por último', () => {
    const item = escolherItemDoPlano(
      [
        { id: 'velho', pageId: 'page-1', atualizadoEm: ONTEM },
        { id: 'novo', pageId: 'page-1', atualizadoEm: AGORA },
      ],
      { pageId: 'page-1' },
    )
    expect(item?.id).toBe('novo')
  })

  it('sem chave nenhuma não há o que procurar', () => {
    expect(escolherItemDoPlano([{ id: 'i1', pageId: 'page-1' }], {})).toBeNull()
    expect(escolherItemDoPlano([{ id: 'i1', pageId: 'page-1' }], { pageId: '  ' })).toBeNull()
  })
})

describe('decidirDesfechoDaCopy — o desfecho é calculado, nunca declarado', () => {
  const PROPOSTOS = ['NOITE DE CORTES', 'Terça a domingo, das 18h']

  it('a copy usada como veio fecha como aceita-como-veio', () => {
    const d = decidirDesfechoDaCopy(PROPOSTOS, [...PROPOSTOS])
    expect(d.acao).toBe('fechar')
    expect(d.acao === 'fechar' && d.desfecho).toBe('aceita-como-veio')
  })

  /**
   * Quem edita tem todo incentivo a relatar acerto; por isso a comparação é do
   * servidor. Um texto mexido é `editada`, não aceitação.
   */
  it('a copy mexida fecha como editada', () => {
    const d = decidirDesfechoDaCopy(PROPOSTOS, ['NOITE DE CORTES', 'Terça a sábado, das 19h'])
    expect(d.acao === 'fechar' && d.desfecho).toBe('editada')
  })

  it('nada da proposta sobrevivendo é troca, não edição', () => {
    const d = decidirDesfechoDaCopy(PROPOSTOS, ['CHOPP GELADO O DIA TODO'])
    expect(d.acao === 'fechar' && d.desfecho).toBe('trocada')
  })

  /** O editor manda a copy por NOME de campo; a dica guarda blocos sem nome. */
  it('reconhece a mesma copy vinda por campo, não por lista', () => {
    const d = decidirDesfechoDaCopy(PROPOSTOS, {
      titulo: 'NOITE DE CORTES',
      apoio: 'Terça a domingo, das 18h',
    })
    expect(d.acao === 'fechar' && d.desfecho).toBe('aceita-como-veio')
  })

  /**
   * 🔴 O defeito mais grave possível aqui. `Page.layers` tem codificação
   * inconsistente no banco e `copyDeCamadas` devolve `null` quando não
   * consegue ler. Tratar isso como "não mudou nada" ensinaria ao corpus que a
   * proposta estava perfeita justamente nas páginas que ninguém lê.
   */
  it('ILEGÍVEL não vira aceitação — fica sem desfecho', () => {
    const d = decidirDesfechoDaCopy(PROPOSTOS, null)
    expect(d.acao).toBe('nao-sei')
    expect(d.diff.ilegivel).toBe(true)
  })

  /** Copy final vazia é "não sei" pelo mesmo motivo: não é "trocou tudo". */
  it('copy final vazia também fica sem desfecho', () => {
    expect(decidirDesfechoDaCopy(PROPOSTOS, []).acao).toBe('nao-sei')
    expect(decidirDesfechoDaCopy(PROPOSTOS, {}).acao).toBe('nao-sei')
  })

  /** Proposta ilegível é o espelho do caso acima — também não conclui nada. */
  it('proposta ilegível não conclui nada', () => {
    expect(decidirDesfechoDaCopy(null, ['ALGO']).acao).toBe('nao-sei')
  })
})

describe('caiNaEscolhaPropria — quem pode abrir uma linha nova', () => {
  /** Arte sem plano: o comportamento de sempre, intacto. */
  it('sem plano, a escolha absoluta continua sendo registrada', () => {
    expect(caiNaEscolhaPropria('sem-plano')).toBe(true)
  })

  /**
   * Arte de plano: o desfecho JÁ foi gravado. Registrar de novo é exatamente a
   * contagem dupla — a linha paralela que este trabalho existe para impedir.
   */
  it('dica fechada NÃO gera a linha paralela', () => {
    expect(caiNaEscolhaPropria('fechada')).toBe(false)
  })

  /** Pendente é de propósito: a varredura de expiração fecha como `expirada`. */
  it('indecisa deixa a proposta pendente, sem inventar decisão nova', () => {
    expect(caiNaEscolhaPropria('indecisa')).toBe(false)
  })

  /**
   * O caso perigoso: sem saber se havia dica, abrir uma linha paralela pode
   * ser justamente o defeito. Perder um sinal num soluço de banco é barato.
   */
  it('erro não autoriza chute — perde-se o sinal, não a honestidade do KPI', () => {
    expect(caiNaEscolhaPropria('erro')).toBe(false)
  })
})
