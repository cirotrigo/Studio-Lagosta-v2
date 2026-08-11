import { describe, it, expect } from 'vitest'
import {
  itemEditavel,
  motivoDeNaoEditavel,
  normalizarFormato,
  normalizarStatusDoItem,
  normalizarStatusDoPlano,
  normalizarVia,
  progressoDoPlano,
  rotuloDaVia,
  ROTULO_DO_STATUS,
  STATUS_DO_ITEM,
  transicaoPermitida,
  VIA_PADRAO,
} from '../vocabulario'

describe('transicaoPermitida', () => {
  it('o caminho normal do item vai de proposto a agendado', () => {
    expect(transicaoPermitida('proposto', 'editado')).toBe(true)
    expect(transicaoPermitida('editado', 'aprovado')).toBe(true)
    expect(transicaoPermitida('aprovado', 'na-fila')).toBe(true)
    expect(transicaoPermitida('na-fila', 'gerando')).toBe(true)
    expect(transicaoPermitida('gerando', 'pronto')).toBe(true)
    expect(transicaoPermitida('pronto', 'agendado')).toBe(true)
  })

  /**
   * Voltar de "gerando" para "editado" pareceria inofensivo e é o defeito que
   * esta regra trava: a arte está sendo produzida com o conteúdo ANTIGO, e o
   * item passaria a mostrar um texto que a peça não tem. Mesma família do
   * congelamento da agenda, onde editar depois do envio publicava a arte velha.
   */
  it('item que já está gerando não volta a ser editado', () => {
    expect(transicaoPermitida('gerando', 'editado')).toBe(false)
    expect(transicaoPermitida('gerando', 'aprovado')).toBe(false)
    expect(transicaoPermitida('gerando', 'na-fila')).toBe(false)
  })

  /**
   * `agendado` é terminal porque daí em diante a verdade é o POST. Um item que
   * voltasse criaria duas fontes de verdade para a mesma publicação — e a que
   * publica é a outra.
   */
  it('nada sai de agendado', () => {
    for (const destino of STATUS_DO_ITEM) {
      expect(transicaoPermitida('agendado', destino)).toBe(destino === 'agendado')
    }
  })

  /**
   * O plano de evolução é literal: reprovar "vira transição registrada E sinal,
   * não beco". Sem saída de `reprovado`, a recusa com motivo mataria o item.
   */
  it('reprovado nunca é beco sem saída', () => {
    expect(transicaoPermitida('reprovado', 'editado')).toBe(true)
    expect(transicaoPermitida('reprovado', 'na-fila')).toBe(true)
  })

  /** Falhar não pode custar o item: dá para corrigir e reenviar. */
  it('o que falhou pode ser corrigido e devolvido à fila', () => {
    expect(transicaoPermitida('erro', 'editado')).toBe(true)
    expect(transicaoPermitida('erro', 'na-fila')).toBe(true)
    // Mas não vira arte pronta por decreto: só a geração produz `pronto`.
    expect(transicaoPermitida('erro', 'pronto')).toBe(false)
    expect(transicaoPermitida('proposto', 'pronto')).toBe(false)
    expect(transicaoPermitida('aprovado', 'agendado')).toBe(false)
  })

  /**
   * Repetir a mesma situação é no-op e NÃO é erro: o retry de uma rota ou a
   * repetição de uma tool no chat não podem falhar por já terem acontecido.
   */
  it('ficar na mesma situação é permitido (no-op)', () => {
    for (const status of STATUS_DO_ITEM) {
      expect(transicaoPermitida(status, status)).toBe(true)
    }
  })
})

describe('itemEditavel', () => {
  it('só antes de a arte existir', () => {
    expect(itemEditavel('proposto')).toBe(true)
    expect(itemEditavel('editado')).toBe(true)
    expect(itemEditavel('aprovado')).toBe(true)
    expect(itemEditavel('reprovado')).toBe(true)
    expect(itemEditavel('erro')).toBe(true)
  })

  /**
   * O caso que este teste trava: `gerando` parece "ainda não terminou, então dá
   * para mexer". Não dá — a chamada paga já saiu com o conteúdo antigo.
   */
  it('item gerando NÃO é editável', () => {
    expect(itemEditavel('gerando')).toBe(false)
    expect(itemEditavel('na-fila')).toBe(false)
    expect(itemEditavel('pronto')).toBe(false)
    expect(itemEditavel('agendado')).toBe(false)
  })

  it('a recusa explica o porquê em português, sem jargão', () => {
    for (const status of STATUS_DO_ITEM.filter((s) => !itemEditavel(s))) {
      const motivo = motivoDeNaoEditavel(status)
      expect(motivo.length).toBeGreaterThan(0)
      expect(motivo).not.toMatch(/DRAFT|SCHEDULED|pageId|status/)
    }
  })
})

describe('progressoDoPlano', () => {
  it('o agregado legível sai na ordem do mais adiantado para o mais atrasado', () => {
    const progresso = progressoDoPlano([
      { status: 'pronto' },
      { status: 'gerando' },
      { status: 'pronto' },
      { status: 'erro' },
      { status: 'pronto' },
      { status: 'gerando' },
    ])
    expect(progresso.total).toBe(6)
    expect(progresso.frase).toBe('3 prontas, 2 gerando e 1 falharam')
    expect(progresso.porStatus).toEqual({ pronto: 3, gerando: 2, erro: 1 })
  })

  /** Plano recém-criado (e plano cujo último item saiu) passa por aqui. */
  it('plano sem item não quebra e não inventa frase', () => {
    const progresso = progressoDoPlano([])
    expect(progresso.total).toBe(0)
    expect(progresso.frase).toBe('nenhum item')
    expect(progresso.porStatus).toEqual({})
    expect(progresso.concluido).toBe(false)
  })

  it('com uma situação só, a frase não ganha "e" solto', () => {
    expect(progressoDoPlano([{ status: 'proposto' }, { status: 'proposto' }]).frase).toBe(
      '2 propostas',
    )
  })

  /**
   * Situação que o vocabulário não conhece é ruído de dado. Somá-la a um balde
   * qualquer faria o resumo mentir sobre o que existe no plano.
   */
  it('situação desconhecida não é contada nem inventada', () => {
    const progresso = progressoDoPlano([{ status: 'pronto' }, { status: 'PENDENTE_XYZ' }])
    expect(progresso.total).toBe(1)
    expect(progresso.frase).toBe('1 prontas')
  })

  it('a leva termina quando tudo virou post ou foi reprovado', () => {
    expect(progressoDoPlano([{ status: 'agendado' }, { status: 'reprovado' }]).concluido).toBe(true)
    expect(progressoDoPlano([{ status: 'agendado' }, { status: 'pronto' }]).concluido).toBe(false)
  })
})

describe('normalizadores', () => {
  it('aceitam caixa, acento e separador diferentes', () => {
    expect(normalizarStatusDoItem('NA FILA')).toBe('na-fila')
    expect(normalizarStatusDoItem('na_fila')).toBe('na-fila')
    expect(normalizarStatusDoItem(' Pronto ')).toBe('pronto')
    expect(normalizarVia('Template')).toBe('template')
    expect(normalizarFormato('QUADRADO')).toBe('quadrado')
    expect(normalizarStatusDoPlano('Arquivado')).toBe('arquivado')
  })

  /** Valor estranho nunca vira um valor plausível — quem chama decide. */
  it('não inventam valor para o que não conhecem', () => {
    expect(normalizarStatusDoItem('publicado')).toBeUndefined()
    expect(normalizarVia('canva')).toBeUndefined()
    expect(normalizarFormato('reels')).toBeUndefined()
    expect(normalizarStatusDoItem(null)).toBeUndefined()
    expect(normalizarStatusDoItem(42)).toBeUndefined()
  })
})

describe('rótulos', () => {
  /**
   * A regra da casa proíbe jargão de banco na conversa e nas telas. `na-fila` é
   * valor de coluna; "na fila" é o que a pessoa lê.
   */
  it('toda situação tem rótulo em português, sem hífen de código', () => {
    for (const status of STATUS_DO_ITEM) {
      expect(ROTULO_DO_STATUS[status]).toBeTruthy()
      expect(ROTULO_DO_STATUS[status]).not.toContain('-')
    }
  })

  it('a via padrão é o modelo do cliente, que não gasta crédito de imagem', () => {
    expect(VIA_PADRAO).toBe('template')
    expect(rotuloDaVia('template')).toBe('modelo do cliente')
  })
})
