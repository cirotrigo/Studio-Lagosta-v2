import { describe, it, expect } from 'vitest'
import {
  agendamentoEmBrasilia,
  crivoManual,
  inversaoAceitavel,
  parseApprovalChecklist,
  reconciliarVeredito,
  textoDoItem,
} from '../approval-checklist'

/**
 * O núcleo puro do crivo. Está aqui, e não junto do serviço, porque
 * `crivo-avaliacao.ts` importa `@/lib/db` — que LANÇA no import sem
 * `DATABASE_URL`, e nada disto precisa de banco para ser verificado.
 */

describe('parseApprovalChecklist', () => {
  it('quebra uma pergunta por linha, sem a numeração de origem', () => {
    expect(parseApprovalChecklist('1. A peça evita domingo?\n- O horário bate?\n\n• E o CTA?')).toEqual(
      ['A peça evita domingo?', 'O horário bate?', 'E o CTA?'],
    )
  })

  it('devolve lista vazia sem crivo cadastrado', () => {
    expect(parseApprovalChecklist(null)).toEqual([])
    expect(parseApprovalChecklist('   ')).toEqual([])
  })
})

describe('agendamentoEmBrasilia', () => {
  it('lê a hora como Brasília, não como UTC', () => {
    // 21:00 de terça no Brasil é quarta 00:00 em UTC. `new Date(texto)` diria
    // quarta — e é justamente o erro que o crivo existe para pegar.
    const a = agendamentoEmBrasilia('2026-08-11 21:00')
    expect(a?.diaDaSemana).toBe('terça-feira')
    expect(a?.hora).toBe('21:00')
    expect(a?.data).toBe('11/08/2026')
  })

  it('aceita o separador com T', () => {
    expect(agendamentoEmBrasilia('2026-08-09T10:30')?.diaDaSemana).toBe('domingo')
  })

  it('recusa data impossível em vez de deixar o Date normalizar em silêncio', () => {
    expect(agendamentoEmBrasilia('2026-02-31 12:00')).toBeNull()
    expect(agendamentoEmBrasilia('2026-08-11 25:00')).toBeNull()
  })

  it('devolve null sem horário', () => {
    expect(agendamentoEmBrasilia(null)).toBeNull()
    expect(agendamentoEmBrasilia('amanhã de noite')).toBeNull()
  })
})

describe('crivoManual', () => {
  it('manda tudo para o olho humano, com as perguntas originais', () => {
    const avaliacao = crivoManual(['O layout é igual ao da peça anterior?'], 'modelo fora do ar')
    expect(avaliacao.degradado).toBe(true)
    expect(avaliacao.motivo).toBe('modelo fora do ar')
    expect(avaliacao.itens).toHaveLength(1)
    expect(avaliacao.itens[0].veredito).toBe('preciso-de-olho')
    // Sem o modelo não há como inverter a polaridade: o texto fica como está.
    expect(avaliacao.itens[0].perguntaNormalizada).toBe('O layout é igual ao da peça anterior?')
  })
})

describe('inversaoAceitavel', () => {
  it('aceita a reescrita de verdade', () => {
    expect(inversaoAceitavel('Tem emoji dentro da arte?', 'A arte está sem emoji?')).toBe(true)
    expect(
      inversaoAceitavel('Existe mais de uma oferta na mesma peça?', 'A peça tem uma oferta só?'),
    ).toBe(true)
    expect(
      inversaoAceitavel('O layout é igual ao da peça anterior?', 'O layout é diferente do da peça anterior?'),
    ).toBe(true)
  })

  it('🔴 recusa a "inversão" que só enfia um não na frase', () => {
    // As três frases medidas em produção em 11/08/2026.
    expect(inversaoAceitavel('Gramática impecável?', 'A gramática NÃO está impecável?')).toBe(false)
    expect(
      inversaoAceitavel(
        'A foto acontece dentro do salão real da casa?',
        'A foto não acontece dentro do salão real da casa?',
      ),
    ).toBe(false)
    expect(
      inversaoAceitavel(
        'O texto está dentro da área segura do formato?',
        'O texto não está dentro da área segura do formato?',
      ),
    ).toBe(false)
  })

  it('recusa vazio e repetição da original', () => {
    expect(inversaoAceitavel('Gramática impecável?', '')).toBe(false)
    expect(inversaoAceitavel('Gramática impecável?', '  ')).toBe(false)
    expect(inversaoAceitavel('Gramática impecável?', 'gramatica impecavel')).toBe(false)
  })
})

describe('reconciliarVeredito', () => {
  const perguntas = ['A peça evita domingo?', 'O layout é igual ao da anterior?', 'Gramática ok?']

  it('mantém o veredito com evidência e a pergunta invertida quando declarada', () => {
    const itens = reconciliarVeredito(perguntas, [
      { indice: 0, veredito: 'conforme', evidencia: 'agendado para terça' },
      {
        indice: 1,
        veredito: 'preciso-de-olho',
        evidencia: 'só olhando a arte',
        simSignifica: 'errada',
        perguntaInvertida: 'O layout é DIFERENTE do da anterior?',
      },
      { indice: 2, veredito: 'reprova', evidencia: '"pratos" está sem acento' },
    ])

    expect(itens[0].veredito).toBe('conforme')
    // `perguntaNormalizada` só existe no olho humano — em conforme ela seria
    // ruído, e a UI mostra a pergunta do DNA.
    expect(itens[0].perguntaNormalizada).toBeUndefined()
    expect(textoDoItem(itens[1])).toBe('O layout é DIFERENTE do da anterior?')
    expect(itens[2].veredito).toBe('reprova')
  })

  it('🔴 derruba veredito de pergunta que o modelo declarou visual', () => {
    // Modo de falha medido em 11/08/2026: sem receber imagem nenhuma, o
    // modelo respondeu "a arte contém emoji, o que é proibido" — com
    // evidência de aparência perfeitamente plausível. A trava é do CÓDIGO
    // justamente porque a regra no prompt não sobreviveu às outras tarefas.
    const itens = reconciliarVeredito(perguntas, [
      {
        indice: 1,
        dependeDeVerAImagem: true,
        veredito: 'reprova',
        evidencia: 'o layout é igual ao da peça anterior',
      },
    ])
    expect(itens[1].veredito).toBe('preciso-de-olho')
    // A justificativa inventada não sobrevive junto.
    expect(itens[1].evidencia).toBe('')
  })

  it('mantém a evidência do olho quando o próprio veredito já era do olho', () => {
    const itens = reconciliarVeredito(perguntas, [
      {
        indice: 1,
        dependeDeVerAImagem: true,
        veredito: 'preciso-de-olho',
        evidencia: 'só olhando a arte para comparar com a peça anterior',
      },
    ])
    expect(itens[1].evidencia).toBe('só olhando a arte para comparar com a peça anterior')
  })

  it('🔴 NÃO troca a polaridade de pergunta que já estava certa', () => {
    // O modo de falha medido em 11/08/2026: o modelo inverteu "Gramática
    // impecável?" para "A gramática NÃO está impecável?" — marcar aquilo
    // significaria o oposto do que a pessoa quis dizer. Inverter só acontece
    // quando é DECLARADO; o default é o texto do DNA.
    const itens = reconciliarVeredito(perguntas, [
      {
        indice: 2,
        veredito: 'preciso-de-olho',
        evidencia: 'só olhando a arte',
        simSignifica: 'certa',
        perguntaInvertida: 'A gramática NÃO está ok?',
      },
    ])
    expect(textoDoItem(itens[2])).toBe('Gramática ok?')
  })

  it('mantém a original quando a inversão é declarada mas vem vazia', () => {
    const itens = reconciliarVeredito(perguntas, [
      {
        indice: 1,
        veredito: 'preciso-de-olho',
        evidencia: 'só olhando a arte',
        simSignifica: 'errada',
        perguntaInvertida: '  ',
      },
    ])
    expect(textoDoItem(itens[1])).toBe('O layout é igual ao da anterior?')
  })

  it('sem o campo de polaridade, mantém a pergunta do DNA', () => {
    const itens = reconciliarVeredito(perguntas, [
      { indice: 1, veredito: 'preciso-de-olho', evidencia: 'só olhando a arte' },
    ])
    expect(textoDoItem(itens[1])).toBe('O layout é igual ao da anterior?')
  })

  it('devolve para o olho a pergunta que o modelo não respondeu', () => {
    const itens = reconciliarVeredito(perguntas, [
      { indice: 0, veredito: 'conforme', evidencia: 'agendado para terça' },
    ])
    expect(itens).toHaveLength(3)
    expect(itens[1].veredito).toBe('preciso-de-olho')
    expect(itens[2].veredito).toBe('preciso-de-olho')
    expect(textoDoItem(itens[2])).toBe('Gramática ok?')
  })

  it('rebaixa veredito sem evidência — veredito sem lastro não vira carimbo', () => {
    const itens = reconciliarVeredito(perguntas, [
      { indice: 0, veredito: 'conforme', evidencia: '   ' },
      { indice: 1, veredito: 'reprova' },
    ])
    expect(itens[0].veredito).toBe('preciso-de-olho')
    expect(itens[1].veredito).toBe('preciso-de-olho')
  })

  it('🔴 corrige a lista inteira deslocada, usando o eco', () => {
    // Modo de falha medido em 11/08/2026 no By Rock: o modelo respondeu a
    // pergunta N e carimbou o número N-1, a lista toda. Sem o eco, isso punha
    // um ✅ verde numa pergunta com a evidência de OUTRA.
    const itens = reconciliarVeredito(perguntas, [
      { indice: 0, eco: 'O layout é igual', veredito: 'conforme', evidencia: 'layout novo' },
      { indice: 1, eco: 'Gramática ok', veredito: 'reprova', evidencia: 'faltou acento' },
    ])
    expect(itens[0].veredito).toBe('preciso-de-olho')
    expect(itens[1].evidencia).toBe('layout novo')
    expect(itens[2].veredito).toBe('reprova')
    expect(itens[2].evidencia).toBe('faltou acento')
  })

  it('descarta resposta cujo eco não casa com pergunta nenhuma', () => {
    const itens = reconciliarVeredito(perguntas, [
      { indice: 0, eco: 'O preço confere com o cardápio', veredito: 'conforme', evidencia: 'x' },
    ])
    expect(itens[0].veredito).toBe('preciso-de-olho')
    expect(itens[0].evidencia).toBe('')
  })

  it('com eco ambíguo, aceita o índice declarado só se ele estiver entre os candidatos', () => {
    const irmas = ['Se é peça de almoço, é dia útil?', 'Se é peça de happy hour, tem selo?']
    const ok = reconciliarVeredito(irmas, [
      { indice: 1, eco: 'Se é peça de', veredito: 'conforme', evidencia: 'tem selo' },
    ])
    expect(ok[1].veredito).toBe('conforme')

    const fora = reconciliarVeredito(irmas, [
      { indice: 7, eco: 'Se é peça de', veredito: 'conforme', evidencia: 'tem selo' },
    ])
    expect(fora[0].veredito).toBe('preciso-de-olho')
    expect(fora[1].veredito).toBe('preciso-de-olho')
  })

  it('sem eco, cai no índice declarado', () => {
    const itens = reconciliarVeredito(perguntas, [
      { indice: 2, veredito: 'conforme', evidencia: 'sem erro de grafia' },
    ])
    expect(itens[2].veredito).toBe('conforme')
  })

  it('ignora índice inventado, ausente ou repetido', () => {
    const itens = reconciliarVeredito(perguntas, [
      { indice: 99, veredito: 'conforme', evidencia: 'pergunta que não existe' },
      { veredito: 'conforme', evidencia: 'sem índice' },
      { indice: 0, veredito: 'conforme', evidencia: 'a primeira vence' },
      { indice: 0, veredito: 'reprova', evidencia: 'a segunda é ruído' },
    ])
    expect(itens).toHaveLength(3)
    expect(itens[0].veredito).toBe('conforme')
    expect(itens[0].evidencia).toBe('a primeira vence')
  })

  it('trata veredito desconhecido como olho humano', () => {
    const itens = reconciliarVeredito(perguntas, [
      { indice: 0, veredito: 'talvez', evidencia: 'sei lá' },
    ])
    expect(itens[0].veredito).toBe('preciso-de-olho')
    expect(textoDoItem(itens[0])).toBe('A peça evita domingo?')
  })
})
