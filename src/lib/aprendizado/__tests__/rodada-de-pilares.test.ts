import { describe, it, expect } from 'vitest'
import {
  filaDeClassificacao,
  fraseDoProgresso,
  percorrerComOrcamento,
  restantesDaPassada,
} from '../rodada-de-pilares'

const projeto = (id: number, pilaresAprovados: number) => ({
  id,
  nome: `projeto ${id}`,
  pilaresAprovados,
})

const DIA_MS = 86_400_000

describe('filaDeClassificacao', () => {
  it('projeto sem taxonomia aprovada não entra na fila', () => {
    const fila = filaDeClassificacao([projeto(1, 6), projeto(2, 0), projeto(3, 5)], new Date(0))
    expect(fila.map((p) => p.id)).not.toContain(2)
    expect(fila).toHaveLength(2)
  })

  it('taxonomia só proposta (nenhuma aprovada) também fica de fora', () => {
    expect(filaDeClassificacao([projeto(1, 0), projeto(2, 0)], new Date(0))).toHaveLength(0)
  })

  /**
   * O defeito que a rotação existe para impedir: com ordem fixa e um relógio
   * que corta a rodada no meio, o primeiro cliente seria classificado todo dia
   * e o último talvez nunca — starvation silenciosa.
   */
  it('em dias consecutivos, todo cliente chega a ser o primeiro da fila', () => {
    const projetos = [projeto(1, 5), projeto(2, 5), projeto(3, 5), projeto(4, 5)]
    const primeiros = new Set<number>()
    for (let dia = 0; dia < projetos.length; dia++) {
      primeiros.add(filaDeClassificacao(projetos, new Date(dia * DIA_MS))[0].id)
    }
    expect(primeiros.size).toBe(projetos.length)
  })

  it('a rotação não perde nem duplica ninguém', () => {
    const projetos = [projeto(1, 5), projeto(2, 5), projeto(3, 5)]
    for (let dia = 0; dia < 7; dia++) {
      const ids = filaDeClassificacao(projetos, new Date(dia * DIA_MS)).map((p) => p.id)
      expect([...ids].sort()).toEqual([1, 2, 3])
    }
  })

  it('quem não tem taxonomia não conta para a rotação dos que têm', () => {
    const projetos = [projeto(1, 0), projeto(2, 5), projeto(3, 5)]
    const primeiros = new Set<number>()
    for (let dia = 0; dia < 2; dia++) {
      primeiros.add(filaDeClassificacao(projetos, new Date(dia * DIA_MS))[0].id)
    }
    expect(primeiros).toEqual(new Set([2, 3]))
  })
})

describe('percorrerComOrcamento', () => {
  /** Relógio de mentira: cada trabalho consome `passo` milissegundos. */
  function relogio(passo: number) {
    let agora = 0
    return {
      agora: () => agora,
      gastar: () => {
        agora += passo
      },
    }
  }

  it('estourado o orçamento, para de PEGAR trabalho novo', async () => {
    const t = relogio(100)
    const trabalhados: number[] = []

    const { feitos, adiados } = await percorrerComOrcamento(
      [1, 2, 3, 4, 5],
      async (n) => {
        trabalhados.push(n)
        t.gastar()
        return n * 10
      },
      { prazoEm: 250, agora: t.agora },
    )

    expect(trabalhados).toEqual([1, 2, 3])
    expect(feitos).toEqual([10, 20, 30])
    expect(adiados).toEqual([4, 5])
  })

  it('o trabalho em voo termina — o corte é só na hora de pegar o próximo', async () => {
    const t = relogio(1_000)
    const { feitos, adiados } = await percorrerComOrcamento(
      ['a', 'b'],
      async (x) => {
        t.gastar()
        return x
      },
      { prazoEm: 10, agora: t.agora },
    )

    // O primeiro começou dentro do prazo e estourou o relógio SOZINHO; ainda
    // assim o resultado dele conta (é uma chamada paga de modelo).
    expect(feitos).toEqual(['a'])
    expect(adiados).toEqual(['b'])
  })

  it('com folga de sobra, ninguém é adiado', async () => {
    const t = relogio(1)
    const { feitos, adiados } = await percorrerComOrcamento([1, 2, 3], async (n) => n, {
      prazoEm: 1_000,
      agora: t.agora,
    })
    expect(feitos).toHaveLength(3)
    expect(adiados).toHaveLength(0)
  })

  it('orçamento já vencido não processa nada, e devolve a fila inteira', async () => {
    const { feitos, adiados } = await percorrerComOrcamento([1, 2], async (n) => n, {
      prazoEm: 0,
      agora: () => 10,
    })
    expect(feitos).toEqual([])
    expect(adiados).toEqual([1, 2])
  })
})

describe('restantesDaPassada', () => {
  it('o que o teto cortou continua faltando', () => {
    expect(restantesDaPassada(509, 200)).toBe(309)
  })

  /**
   * Lote cujo modelo não respondeu deixa os posts como estavam. Contá-los como
   * resolvidos esconderia trabalho que ainda falta — daí a conta ser contra o
   * que ficou GRAVADO, não contra o que entrou nos lotes.
   */
  it('post que entrou no lote mas não ficou gravado continua faltando', () => {
    expect(restantesDaPassada(100, 75)).toBe(25)
  })

  it('passada que deu conta de tudo não deixa resto', () => {
    expect(restantesDaPassada(80, 80)).toBe(0)
  })

  /**
   * Entre a contagem e o fim da passada alguém pode ter classificado pelo botão
   * — "faltam -3" na tela é pior do que "faltam 0".
   */
  it('nunca devolve negativo', () => {
    expect(restantesDaPassada(10, 25)).toBe(0)
  })
})

describe('fraseDoProgresso', () => {
  it('sobrando trabalho, ela convida a clicar de novo', () => {
    const frase = fraseDoProgresso({ classificados: 200, semTexto: 44, restantes: 309 })
    expect(frase).toContain('200 publicação(ões)')
    expect(frase).toContain('44 sem texto')
    expect(frase).toContain('Faltam 309')
  })

  it('sem resto, diz que o histórico está em dia', () => {
    const frase = fraseDoProgresso({ classificados: 12, semTexto: 0, restantes: 0 })
    expect(frase).toContain('12 publicação(ões)')
    expect(frase).not.toContain('Faltam')
    expect(frase).not.toContain('sem texto')
  })

  it('nada a fazer é dito como nada a fazer, não como zero classificadas', () => {
    expect(fraseDoProgresso({ classificados: 0, semTexto: 0, restantes: 0 })).toBe(
      'Nada novo para classificar — o histórico já está em dia.',
    )
  })
})
