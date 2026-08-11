import { describe, it, expect } from 'vitest'
import {
  caminhoDeTransicao,
  formatarQuandoBR,
  fundirComOLocal,
  hidratarItens,
  paraItemDaBancada,
  paraQuandoBRT,
  situacaoParaExibir,
  situacaoQueVence,
  statusMaisAvancado,
  temTrabalhoNoServidor,
  type ItemDePlanoDoServidor,
  type PlanoDoServidor,
} from '../para-bancada'
import type { BancadaItem } from '@/stores/bancada-store'

const AGORA = 1_754_900_000_000

function plano(itens: ItemDePlanoDoServidor[], extra: Partial<PlanoDoServidor> = {}): PlanoDoServidor {
  return { id: 'plano-1', projectId: 7, titulo: 'Semana de teste', itens, ...extra }
}

function doServidor(extra: Partial<ItemDePlanoDoServidor> = {}): ItemDePlanoDoServidor {
  return {
    id: 'item-1',
    planoId: 'plano-1',
    projectId: 7,
    ordem: 0,
    quando: '2026-08-15T22:00:00.000Z',
    tema: 'Happy hour de sexta',
    copyProposta: ['SEXTA É DIA', 'chope gelado até 20h'],
    formato: 'story',
    via: 'template',
    status: 'proposto',
    escopo: 'ROTINA',
    ...extra,
  }
}

function local(extra: Partial<BancadaItem> = {}): BancadaItem {
  return {
    id: 'plano:item-1',
    projectId: 7,
    itemDePlanoId: 'item-1',
    planoId: 'plano-1',
    situacaoNoPlano: 'proposto',
    trilha: 'arte',
    tipo: 'peca',
    formato: 'story',
    copy: ['SEXTA É DIA'],
    pedido: '',
    referencias: [],
    status: 'rascunho',
    criadoEm: AGORA - 1000,
    ...extra,
  }
}

// ── Tradução ────────────────────────────────────────────────────────────────

describe('paraItemDaBancada', () => {
  it('traduz o item do plano num card com a chave de dedupe', () => {
    const card = paraItemDaBancada(doServidor(), plano([]), AGORA)
    expect(card.itemDePlanoId).toBe('item-1')
    expect(card.planoId).toBe('plano-1')
    expect(card.projectId).toBe(7)
    expect(card.copy).toEqual(['SEXTA É DIA', 'chope gelado até 20h'])
    expect(card.via).toBe('template')
    expect(card.situacaoNoPlano).toBe('proposto')
    expect(card.status).toBe('rascunho')
  })

  /**
   * O horário viaja em UTC e é combinado em Brasília. Guardar o ISO cru e
   * converter em cada componente é como aparece "story das 21h" que na verdade
   * é meia-noite UTC.
   */
  it('o horário chega no formato que a bancada e o agendamento usam, em BRT', () => {
    const card = paraItemDaBancada(doServidor(), plano([]), AGORA)
    expect(card.quando).toBe('2026-08-15 19:00')
  })

  it('meia-noite de Brasília não vira 24h', () => {
    expect(paraQuandoBRT('2026-08-16T03:00:00.000Z')).toBe('2026-08-16 00:00')
  })

  it('item sem horário decidido continua sem horário', () => {
    expect(paraItemDaBancada(doServidor({ quando: null }), plano([]), AGORA).quando).toBeNull()
  })

  it('a foto do item vira a referência de cena que a geração precisa', () => {
    const card = paraItemDaBancada(
      doServidor({ fotoUrl: 'https://blob/foto.jpg', fotoDriveId: 'drive-1' }),
      plano([]),
      AGORA,
    )
    expect(card.referencias).toHaveLength(1)
    expect(card.referencias[0].papel).toBe('subject')
    expect(card.referencias[0].driveFileId).toBe('drive-1')
    expect(card.referencias[0].thumbUrl).toBe('https://blob/foto.jpg')
  })

  /**
   * 🔴 O caso REAL, e o que o teste acima não cobria: `propor-semana` escolhe a
   * foto pelo acervo, que devolve `driveFileId` e NUNCA `fotoUrl`. Com os dois
   * campos preenchidos o `thumbUrl` saía certo por acidente; com só o id do
   * Drive ele saía VAZIO e o card aparecia sem imagem — uma leva inteira do
   * Espeto Gaúcho (5 de 5) em 11/08/2026.
   */
  it('foto só com id do Drive ainda rende miniatura — é como o acervo devolve', () => {
    const card = paraItemDaBancada(
      doServidor({ fotoUrl: null, fotoDriveId: 'drive-1' }),
      plano([]),
      AGORA,
    )
    expect(card.referencias).toHaveLength(1)
    expect(card.referencias[0].driveFileId).toBe('drive-1')
    expect(card.referencias[0].thumbUrl).toBe('/api/drive/thumbnail/drive-1')
  })

  it('item sem foto nenhuma não inventa referência', () => {
    const card = paraItemDaBancada(
      doServidor({ fotoUrl: null, fotoDriveId: null }),
      plano([]),
      AGORA,
    )
    expect(card.referencias).toEqual([])
  })

  it('via e formato desconhecidos caem no padrão em vez de derrubar a tela', () => {
    const card = paraItemDaBancada(
      doServidor({ via: 'mágica', formato: 'panorâmico', status: 'inventado' }),
      plano([]),
      AGORA,
    )
    expect(card.via).toBe('template')
    expect(card.formato).toBe('story')
    expect(card.situacaoNoPlano).toBe('proposto')
  })
})

// ── Precedência ─────────────────────────────────────────────────────────────

describe('situacaoQueVence', () => {
  /**
   * O card em voo é a razão de existir da regra: a hidratação chega DEPOIS do
   * clique, com a situação que o servidor tinha antes dele. Deixar o servidor
   * mandar aqui devolveria o card a "na fila" com a geração já paga rodando —
   * e quem clicasse em Gerar de novo pagaria duas vezes.
   */
  it('o card que já está gerando não volta para a fila', () => {
    expect(situacaoQueVence('gerando', 'rascunho')).toBe('gerando')
    expect(situacaoQueVence('pronto', 'rascunho')).toBe('pronto')
    expect(situacaoQueVence('agendado', 'gerando')).toBe('agendado')
  })

  it('o servidor CONTA novidade: arte que ficou pronta pelo chat aparece pronta aqui', () => {
    expect(situacaoQueVence('rascunho', 'pronto')).toBe('pronto')
    expect(situacaoQueVence('gerando', 'agendado')).toBe('agendado')
  })

  it('erro é desfecho de quem gerava, e cede para a evidência de que a arte saiu', () => {
    expect(situacaoQueVence('gerando', 'erro')).toBe('erro')
    expect(situacaoQueVence('erro', 'pronto')).toBe('pronto')
    expect(situacaoQueVence('erro', 'rascunho')).toBe('erro')
  })
})

describe('statusMaisAvancado', () => {
  it('nunca devolve o passo anterior', () => {
    expect(statusMaisAvancado('gerando', 'proposto')).toBe('gerando')
    expect(statusMaisAvancado('proposto', 'na-fila')).toBe('na-fila')
    expect(statusMaisAvancado('agendado', 'pronto')).toBe('agendado')
  })

  it('ausência de um dos lados devolve o outro', () => {
    expect(statusMaisAvancado(undefined, 'aprovado')).toBe('aprovado')
    expect(statusMaisAvancado('aprovado', null)).toBe('aprovado')
    expect(statusMaisAvancado(null, undefined)).toBe('proposto')
  })
})

describe('situacaoParaExibir', () => {
  it('o "na fila" da bancada não apaga a situação fina do plano', () => {
    expect(situacaoParaExibir(local({ status: 'rascunho', situacaoNoPlano: 'aprovado' }))).toBe(
      'aprovado',
    )
    expect(situacaoParaExibir(local({ status: 'rascunho', situacaoNoPlano: 'reprovado' }))).toBe(
      'reprovado',
    )
  })

  it('o que a bancada sabe de mais recente vence o que o servidor confirmou', () => {
    expect(situacaoParaExibir(local({ status: 'pronto', situacaoNoPlano: 'gerando' }))).toBe(
      'pronto',
    )
  })
})

// ── Fusão ───────────────────────────────────────────────────────────────────

describe('fundirComOLocal', () => {
  it('o servidor manda no CONTEÚDO sem mexer na situação mais avançada', () => {
    const emVoo = local({
      status: 'gerando',
      generationId: 'gen-1',
      copy: ['texto velho'],
      situacaoNoPlano: 'gerando',
    })
    const atualizado = paraItemDaBancada(
      doServidor({ copyProposta: ['TEXTO NOVO'], tema: 'outro tema', status: 'proposto' }),
      plano([]),
      AGORA,
    )

    const fundido = fundirComOLocal(emVoo, atualizado, AGORA)

    expect(fundido.copy).toEqual(['TEXTO NOVO'])
    expect(fundido.tema).toBe('outro tema')
    expect(fundido.status).toBe('gerando')
    expect(fundido.situacaoNoPlano).toBe('gerando')
    expect(fundido.generationId).toBe('gen-1')
  })

  /**
   * A partir de `agendado` a verdade é o POST: o horário que vale é o que foi
   * agendado, não o que o plano propunha. Mesma razão de `agendado` não ter
   * saída na tabela de transições.
   */
  it('card já agendado guarda o próprio horário, não o proposto', () => {
    const agendado = local({
      status: 'agendado',
      postId: 'post-9',
      quando: '2026-08-15 20:30',
      situacaoNoPlano: 'agendado',
    })
    const fundido = fundirComOLocal(agendado, paraItemDaBancada(doServidor(), plano([]), AGORA), AGORA)

    expect(fundido.status).toBe('agendado')
    expect(fundido.quando).toBe('2026-08-15 20:30')
    expect(fundido.postId).toBe('post-9')
  })

  /**
   * `ItemDePlano` guarda o `generationId`, nunca a imagem. Um card "pronto" sem
   * `resultUrl` daria prévia vazia e agendamento cego — marcado como gerando, o
   * polling que já existe resolve a URL no primeiro tick.
   */
  it('pronto sem a URL da arte vira gerando, para o polling resolver', () => {
    const card = fundirComOLocal(
      undefined,
      paraItemDaBancada(doServidor({ status: 'pronto', generationId: 'gen-2' }), plano([]), AGORA),
      AGORA,
    )
    expect(card.status).toBe('gerando')
    expect(card.generationId).toBe('gen-2')
  })

  it('pronto sem arte e sem geração volta a esperar o Gerar', () => {
    const card = fundirComOLocal(
      undefined,
      paraItemDaBancada(doServidor({ status: 'pronto' }), plano([]), AGORA),
      AGORA,
    )
    expect(card.status).toBe('rascunho')
  })

  /**
   * O caso oposto do card em voo: aqui é o SERVIDOR que sabe mais. A arte
   * ficou pronta pelo chat enquanto a bancada tinha dado o card por perdido
   * (teto de 8 minutos), e o card volta a acompanhar em vez de ficar em falha.
   */
  it('arte que ficou pronta no servidor tira o card do erro', () => {
    const perdido = local({ status: 'erro', erro: 'A geração passou de 8 minutos.', generationId: 'gen-4' })
    const fundido = fundirComOLocal(
      perdido,
      paraItemDaBancada(doServidor({ status: 'pronto', generationId: 'gen-4' }), plano([]), AGORA),
      AGORA,
    )
    expect(fundido.status).toBe('gerando')
    expect(fundido.erro).toBeNull()
    expect(fundido.criadoEm).toBe(AGORA)
  })

  /**
   * O teto de 8 minutos do polling é medido a partir de `criadoEm`. Herdar o
   * horário de criação do item faria o card ser dado como perdido no mesmo
   * instante em que passou a acompanhar.
   */
  it('entrar em gerando reinicia o relógio do teto de 8 minutos', () => {
    const antigo = local({ status: 'rascunho', criadoEm: AGORA - 60 * 60_000 })
    const fundido = fundirComOLocal(
      antigo,
      paraItemDaBancada(doServidor({ status: 'gerando', generationId: 'gen-3' }), plano([]), AGORA),
      AGORA,
    )
    expect(fundido.status).toBe('gerando')
    expect(fundido.criadoEm).toBe(AGORA)
  })

  it('card que continua gerando não tem o relógio reiniciado a cada hidratação', () => {
    const emVoo = local({ status: 'gerando', generationId: 'gen-3', criadoEm: AGORA - 120_000 })
    const fundido = fundirComOLocal(
      emVoo,
      paraItemDaBancada(doServidor({ status: 'gerando', generationId: 'gen-3' }), plano([]), AGORA),
      AGORA,
    )
    expect(fundido.criadoEm).toBe(AGORA - 120_000)
  })

  it('hidratação sem novidade devolve a MESMA referência', () => {
    const card = paraItemDaBancada(doServidor(), plano([]), AGORA)
    const igual = fundirComOLocal(card, paraItemDaBancada(doServidor(), plano([]), AGORA), AGORA)
    expect(igual).toBe(card)
  })
})

// ── Trabalho no servidor ────────────────────────────────────────────────────

describe('temTrabalhoNoServidor', () => {
  /**
   * No carrossel o `generationId` do item fica vazio e os ids vivem nos slides.
   * Olhar só o item fazia a série voltar para "na fila" a cada recarga, mesmo
   * com capa e guia prontos.
   */
  it('enxerga a geração que está nos SLIDES, não só a do item', () => {
    expect(
      temTrabalhoNoServidor({ slides: [{ generationId: 'gen-a' }, {}] }),
    ).toBe(true)
    expect(temTrabalhoNoServidor({ generationId: 'gen-b' })).toBe(true)
    expect(temTrabalhoNoServidor({ slides: [{}, {}] })).toBe(false)
    expect(temTrabalhoNoServidor({})).toBe(false)
  })
})

// ── Hidratação da fila ──────────────────────────────────────────────────────

describe('hidratarItens', () => {
  it('a leva do servidor entra na fila, com os cards novos no topo', () => {
    const meu = local({ id: 'meu', itemDePlanoId: undefined, planoId: undefined, situacaoNoPlano: undefined })
    const fila = hidratarItens([meu], plano([doServidor()]), 7, AGORA)

    expect(fila).toHaveLength(2)
    expect(fila[0].itemDePlanoId).toBe('item-1')
    expect(fila[1]).toBe(meu)
  })

  /**
   * O card montado na bancada nunca esteve no servidor. Não é a hidratação que
   * vai apagá-lo — é o defeito mais caro que ela poderia ter.
   */
  it('card montado na bancada sobrevive intacto', () => {
    const meu = local({ id: 'meu', itemDePlanoId: undefined, planoId: undefined, situacaoNoPlano: undefined })
    expect(hidratarItens([meu], plano([]), 7, AGORA)[0]).toBe(meu)
    expect(hidratarItens([meu], null, 7, AGORA)[0]).toBe(meu)
  })

  it('card de outro projeto não é tocado', () => {
    const outro = local({ id: 'outro', projectId: 99, itemDePlanoId: 'item-x' })
    const fila = hidratarItens([outro], plano([]), 7, AGORA)
    expect(fila[0]).toBe(outro)
  })

  it('item que já estava na fila é fundido, não duplicado', () => {
    const existente = local({ status: 'gerando', generationId: 'gen-1', situacaoNoPlano: 'gerando' })
    const fila = hidratarItens([existente], plano([doServidor()]), 7, AGORA)

    expect(fila).toHaveLength(1)
    expect(fila[0].status).toBe('gerando')
    expect(fila[0].generationId).toBe('gen-1')
  })

  /**
   * Jogar fora arte paga por causa de uma linha retirada do plano é o pior
   * desfecho possível. Sem trabalho nenhum atrás, aí sim o card sai: a proposta
   * foi retirada da leva e nunca virou nada.
   */
  it('item que sumiu do plano vira card local quando já houve trabalho', () => {
    const comArte = local({ status: 'pronto', generationId: 'gen-1', resultUrl: 'https://blob/a.png' })
    const fila = hidratarItens([comArte], plano([]), 7, AGORA)

    expect(fila).toHaveLength(1)
    expect(fila[0].itemDePlanoId).toBeUndefined()
    expect(fila[0].planoId).toBeUndefined()
    expect(fila[0].resultUrl).toBe('https://blob/a.png')
  })

  it('item que sumiu do plano sem nunca ter gerado nada sai da fila', () => {
    expect(hidratarItens([local()], plano([]), 7, AGORA)).toHaveLength(0)
  })

  it('carrossel com ids nos slides não é confundido com item sem trabalho', () => {
    const serie = local({
      id: 'serie',
      tipo: 'carrossel',
      status: 'guia-pronto',
      slides: [
        { ordem: 1, copy: [], referencia: { papel: 'subject', thumbUrl: 't1' }, generationId: 'g1' },
        { ordem: 2, copy: ['guia'], referencia: { papel: 'subject', thumbUrl: 't2' }, generationId: 'g2' },
        { ordem: 3, copy: ['terceiro'], referencia: { papel: 'subject', thumbUrl: 't3' } },
      ],
    })
    const fila = hidratarItens([serie], plano([]), 7, AGORA)

    expect(fila).toHaveLength(1)
    expect(fila[0].slides).toHaveLength(3)
    expect(fila[0].itemDePlanoId).toBeUndefined()
  })

  /**
   * `null` significa "este projeto não tem leva ativa". Mesmo assim nada é
   * apagado: o plano pode ter sido arquivado com trabalho em cima, e sumir com
   * o card seria indistinguível de perder dados.
   */
  it('sem plano ativo, os cards do plano viram locais em vez de sumir', () => {
    const fila = hidratarItens([local()], null, 7, AGORA)
    expect(fila).toHaveLength(1)
    expect(fila[0].itemDePlanoId).toBeUndefined()
  })

  /**
   * 🔴 O defeito real de 11/08/2026: apagar a leva no servidor e criar outra
   * deixava TODOS os cards antigos na tela — o ramo "não é assunto desta
   * hidratação" os mantinha para sempre, e cada propor-semana só ACRESCENTAVA
   * (três levas do Espeto empilhadas). Card de outra leva segue a regra do que
   * sumiu do plano: sem trabalho, sai; com trabalho, vira card local.
   */
  it('card sem trabalho de uma leva substituída SAI da fila', () => {
    const deOutraLeva = local({ id: 'outra', itemDePlanoId: 'item-z', planoId: 'plano-2' })
    const fila = hidratarItens([deOutraLeva], plano([doServidor()]), 7, AGORA)

    expect(fila).toHaveLength(1)
    expect(fila.find((i) => i.id === 'outra')).toBeUndefined()
  })

  it('card COM trabalho de uma leva substituída sobrevive como card local', () => {
    const pago = local({
      id: 'outra',
      itemDePlanoId: 'item-z',
      planoId: 'plano-2',
      status: 'gerando',
      generationId: 'gen-pago',
    })
    const fila = hidratarItens([pago], plano([doServidor()]), 7, AGORA)

    const sobrevivente = fila.find((i) => i.id === 'outra')!
    expect(sobrevivente).toBeDefined()
    expect(sobrevivente.itemDePlanoId).toBeUndefined() // perdeu o vínculo
    expect(sobrevivente.generationId).toBe('gen-pago') // o trabalho não some
  })

  it('card agendado de uma leva substituída também fica', () => {
    const agendado = local({ id: 'outra', itemDePlanoId: 'item-z', planoId: 'plano-2', status: 'agendado', postId: 'post-1' })
    const fila = hidratarItens([agendado], plano([doServidor()]), 7, AGORA)
    expect(fila.find((i) => i.id === 'outra')?.postId).toBe('post-1')
  })

  it('hidratar duas vezes com a mesma resposta não mexe na fila', () => {
    const primeira = hidratarItens([], plano([doServidor()]), 7, AGORA)
    const segunda = hidratarItens(primeira, plano([doServidor()]), 7, AGORA)
    expect(segunda).toBe(primeira)
  })

  it('copy alterada no servidor chega ao card sem recriar a fila inteira', () => {
    const primeira = hidratarItens([], plano([doServidor()]), 7, AGORA)
    const segunda = hidratarItens(
      primeira,
      plano([doServidor({ copyProposta: ['OUTRA HEADLINE'] })]),
      7,
      AGORA,
    )
    expect(segunda).not.toBe(primeira)
    expect(segunda[0].copy).toEqual(['OUTRA HEADLINE'])
  })
})

// ── Caminho de transição ────────────────────────────────────────────────────

describe('caminhoDeTransicao', () => {
  /**
   * Quem clica em "Gerar" num item proposto pula "na fila" na cabeça, mas o
   * vocabulário não permite o salto — a passagem pela fila é o que dá o ponto
   * de retentativa. O caminho é descoberto a partir da própria
   * `transicaoPermitida`, e não de uma cópia da tabela.
   */
  it('gerar a partir de proposto passa obrigatoriamente pela fila', () => {
    expect(caminhoDeTransicao('proposto', 'gerando')).toEqual(['na-fila', 'gerando'])
  })

  it('o passo direto é um passo só', () => {
    expect(caminhoDeTransicao('gerando', 'pronto')).toEqual(['pronto'])
    expect(caminhoDeTransicao('pronto', 'agendado')).toEqual(['agendado'])
  })

  it('estar no destino não gera requisição nenhuma', () => {
    expect(caminhoDeTransicao('gerando', 'gerando')).toEqual([])
  })

  /** `agendado` é terminal: não há caminho de volta, e o chamador não insiste. */
  it('de agendado não sai caminho para lugar nenhum', () => {
    expect(caminhoDeTransicao('agendado', 'pronto')).toEqual([])
    expect(caminhoDeTransicao('agendado', 'erro')).toEqual([])
  })

  it('o caminho até o erro existe a partir de qualquer ponto editável', () => {
    expect(caminhoDeTransicao('proposto', 'erro')).toEqual(['na-fila', 'erro'])
    expect(caminhoDeTransicao('gerando', 'erro')).toEqual(['erro'])
  })
})


describe('formatarQuandoBR', () => {
  it('monta o selo no padrão brasileiro', () => {
    const q = formatarQuandoBR('2026-08-11', '14:30')!
    expect(q.diaSemana).toBe('Ter.')
    expect(q.dia).toBe('11')
    expect(q.mes).toBe('ago.')
    expect(q.hora).toBe('14:30')
    expect(q.completo).toBe('Ter. 11 de ago. 14:30')
  })

  /**
   * 🔴 `new Date('2026-08-11')` é meia-noite UTC, que em Brasília é 21h do dia
   * 10 — o selo mostraria SEGUNDA numa terça. Por isso o dia da semana sai de
   * `Date.UTC` com os componentes, e este teste trava a regressão.
   */
  it('não escorrega um dia por causa de fuso', () => {
    expect(formatarQuandoBR('2026-08-11', '00:00')!.diaSemana).toBe('Ter.')
    expect(formatarQuandoBR('2026-08-17', '23:59')!.diaSemana).toBe('Seg.')
  })

  it('dia que não existe não vira o mês seguinte em silêncio', () => {
    expect(formatarQuandoBR('2026-02-31', '10:00')).toBeNull()
  })

  it('sem data não desenha selo', () => {
    expect(formatarQuandoBR(null, '10:00')).toBeNull()
    expect(formatarQuandoBR('', '10:00')).toBeNull()
    expect(formatarQuandoBR('11/08/2026', '10:00')).toBeNull()
  })

  it('sem hora ainda mostra o dia', () => {
    const q = formatarQuandoBR('2026-08-11', null)!
    expect(q.hora).toBe('')
    expect(q.completo).toBe('Ter. 11 de ago.')
  })
})


describe('fundirComOLocal — a direção editada sobrevive à hidratação', () => {
  /**
   * Direção adicional não tem coluna no ItemDePlano — a edição local não faz a
   * viagem pelo servidor. Sem esta regra, cada refetch devolvia o `pedido` ao
   * tema derivado e o que a pessoa escreveu no modal evaporava em segundos.
   */
  it('o pedido escrito pela pessoa vence o derivado do tema', () => {
    const meu = local({ pedido: 'clima de fim de tarde, sem gente na foto' })
    const doPlano = paraItemDaBancada(doServidor(), plano([]), AGORA)
    expect(fundirComOLocal(meu, doPlano, AGORA).pedido).toBe(
      'clima de fim de tarde, sem gente na foto',
    )
  })

  it('sem edição local, o derivado do servidor continua valendo', () => {
    const meu = local({ pedido: '' })
    const doPlano = paraItemDaBancada(doServidor(), plano([]), AGORA)
    expect(fundirComOLocal(meu, doPlano, AGORA).pedido).toBe(doPlano.pedido)
  })
})
