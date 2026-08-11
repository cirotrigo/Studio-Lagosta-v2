/**
 * As partes PURAS da dica de copy.
 *
 * O teste importa `dica-de-copy-contrato`, nunca o serviço: `dica-de-copy.ts`
 * puxa `@/lib/db`, que **lança no import** quando falta `DATABASE_URL`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ancoraDoPedido,
  aplicarGuardaDeDados,
  ecoDaDica,
  entradasValidasPara,
  montarPromptDeDica,
  reconciliarDicas,
  VERSAO_DA_DICA,
  type EntradaDaBase,
  type InsumosDaDica,
  type PedidoDeDica,
} from '../dica-de-copy-contrato'

const QUANDO = new Date('2026-08-14T22:00:00.000Z') // sexta, 19:00 em Brasília

function pedido(over: Partial<PedidoDeDica> = {}): PedidoDeDica {
  return { ref: 'slot-1', tema: 'happy hour', quando: QUANDO, formato: 'story', ...over }
}

function entrada(over: Partial<EntradaDaBase> = {}): EntradaDaBase {
  return {
    id: 'e1',
    titulo: 'Happy hour',
    categoria: 'CAMPANHAS',
    conteudo: 'Happy hour de segunda a sexta, das 18h às 20h. Chopp por R$ 12,90.',
    expiresAt: null,
    ...over,
  }
}

describe('ancoraDoPedido', () => {
  it('usa o tema e cai na observação', () => {
    expect(ancoraDoPedido(pedido())).toBe('happy hour')
    expect(ancoraDoPedido(pedido({ tema: null, observacao: 'puxa o rodízio' }))).toBe('puxa o rodízio')
  })

  /**
   * 🔴 No cold start — que hoje é o caso NORMAL, porque nenhum projeto tem
   * taxonomia aprovada — a âncora é a descrição legível do slot, nunca o `ref`.
   * Com "slot-1" na âncora, o gpt-4o-mini copiou a PRÓPRIA headline no eco e a
   * leva inteira do By Rock foi descartada (4 de 4, medido em 11/08/2026).
   */
  it('sem tema e sem observação, a âncora descreve o slot em português', () => {
    const cru = ancoraDoPedido(pedido({ tema: null, observacao: null }))
    expect(cru).toContain('story de sexta-feira')
    expect(cru).not.toBe('slot-1')
  })

  it('data ilegível cai no ref, que é o que sobra', () => {
    expect(ancoraDoPedido(pedido({ tema: null, observacao: null, quando: new Date('x') }))).toBe(
      'slot-1',
    )
  })

  /**
   * A âncora NÃO inclui o ref de propósito. Se incluísse, duas peças nunca
   * teriam âncora igual — e o caso "mesmo tema duas vezes na semana" deixaria
   * de existir, junto com a regra que o trata (ver o teste de textos idênticos).
   */
  it('duas peças com o mesmo tema têm a MESMA âncora', () => {
    const a = ancoraDoPedido(pedido({ ref: 'slot-1' }))
    const b = ancoraDoPedido(pedido({ ref: 'slot-2' }))
    expect(a).toBe(b)
  })
})

describe('reconciliarDicas', () => {
  it('amarra cada proposta pelo eco, não pela ordem em que ela veio', () => {
    const pedidos = [
      pedido({ ref: 'a', tema: 'almoço executivo' }),
      pedido({ ref: 'b', tema: 'happy hour' }),
    ]
    const { brutas, semDica } = reconciliarDicas(pedidos, [
      { eco: 'happy hour', blocos: ['A NOITE COMEÇA AQUI'] },
      { eco: 'almoço executivo', blocos: ['O ALMOÇO QUE RESOLVE O DIA'] },
    ])

    expect(semDica).toEqual([])
    expect(brutas.find((b) => b.ref === 'b')?.blocos).toEqual(['A NOITE COMEÇA AQUI'])
    expect(brutas.find((b) => b.ref === 'a')?.blocos).toEqual(['O ALMOÇO QUE RESOLVE O DIA'])
  })

  /**
   * Eco que casa com MAIS DE UMA âncora diferente é resposta desalinhada: a
   * copy pode ir para a peça errada, e copy na peça errada é mentira com
   * aparência de trabalho pronto. As duas peças voltam sem dica.
   */
  it('eco ambíguo entre âncoras DIFERENTES vira semDica', () => {
    const pedidos = [
      pedido({ ref: 'a', tema: 'happy hour' }),
      pedido({ ref: 'b', tema: 'happy hour da sexta com música ao vivo' }),
    ]
    const { brutas, semDica, avisos } = reconciliarDicas(pedidos, [
      { eco: 'happy hour', blocos: ['CHEGOU A HORA'] },
    ])

    expect(brutas).toEqual([])
    expect(semDica).toEqual(['a', 'b'])
    expect(avisos.join(' ')).toContain('Descartei')
  })

  /**
   * 🔴 A correção herdada da F2: empate entre âncoras de texto IDÊNTICO não é
   * ambiguidade. Uma semana normal repete "happy hour" duas vezes; descartar as
   * duas custava 8 de 25 classificações num lote real do Wine Vix, e não
   * protegia nada — em qual das duas a resposta cai é indiferente.
   */
  it('duas peças com âncora IDÊNTICA não viram ambiguidade', () => {
    const pedidos = [
      pedido({ ref: 'a', tema: 'happy hour' }),
      pedido({ ref: 'b', tema: 'happy hour' }),
    ]
    const { brutas, semDica } = reconciliarDicas(pedidos, [
      { eco: 'happy hour', blocos: ['PRIMEIRA'] },
      { eco: 'happy hour', blocos: ['SEGUNDA'] },
    ])

    expect(semDica).toEqual([])
    expect(brutas.map((b) => b.ref).sort()).toEqual(['a', 'b'])
    expect(brutas.map((b) => b.blocos[0]).sort()).toEqual(['PRIMEIRA', 'SEGUNDA'])
  })

  /**
   * O eco que não casa com âncora NENHUMA costuma ser o modelo copiando a
   * própria headline — foi o que aconteceu com o By Rock inteiro. Ali o `ref`
   * é o único vínculo que sobrou, e descartar custa a leva sem proteger nada.
   * Diferente do índice do crivo: `ref` é token copiado, não posição na lista.
   */
  it('sem eco, ou com eco que não casa com nada, o ref copiado amarra', () => {
    const pedidos = [pedido({ ref: 'a', tema: 'almoço' }), pedido({ ref: 'b', tema: 'jantar' })]

    const semEco = reconciliarDicas(pedidos, [{ ref: 'b', blocos: ['NOITE'] }])
    expect(semEco.brutas).toEqual([{ ref: 'b', blocos: ['NOITE'], legenda: null }])

    const ecoQueEHeadline = reconciliarDicas(pedidos, [
      { eco: 'A NOITE COMEÇA AQUI', ref: 'b', blocos: ['NOITE'] },
    ])
    expect(ecoQueEHeadline.brutas.map((x) => x.ref)).toEqual(['b'])
  })

  /**
   * Mas eco AMBÍGUO é outra coisa: ali o modelo mirou duas peças diferentes, e
   * aceitar o `ref` seria carimbar a copy numa delas por sorteio.
   */
  it('eco ambíguo NÃO é salvo pelo ref', () => {
    const pedidos = [
      pedido({ ref: 'a', tema: 'happy hour' }),
      pedido({ ref: 'b', tema: 'happy hour da sexta com música' }),
    ]
    const r = reconciliarDicas(pedidos, [{ eco: 'happy hour', ref: 'b', blocos: ['CHOPP'] }])
    expect(r.brutas).toEqual([])
    expect(r.semDica).toEqual(['a', 'b'])
  })

  it('ref que não existe, ou já usado, não amarra nada', () => {
    const pedidos = [pedido({ ref: 'a', tema: 'almoço' }), pedido({ ref: 'b', tema: 'jantar' })]
    const r = reconciliarDicas(pedidos, [
      { ref: 'a', blocos: ['PRIMEIRA'] },
      { ref: 'a', blocos: ['REPETIDA'] },
      { ref: 'inexistente', blocos: ['PERDIDA'] },
    ])
    expect(r.brutas).toEqual([{ ref: 'a', blocos: ['PRIMEIRA'], legenda: null }])
    expect(r.semDica).toEqual(['b'])
  })

  it('peça que o modelo simplesmente não respondeu volta em semDica', () => {
    const pedidos = [pedido({ ref: 'a', tema: 'almoço' }), pedido({ ref: 'b', tema: 'jantar' })]
    const { semDica } = reconciliarDicas(pedidos, [{ eco: 'almoço', blocos: ['MEIO-DIA'] }])
    expect(semDica).toEqual(['b'])
  })

  it('resposta sem bloco nenhum e sem legenda é descartada', () => {
    const { brutas, semDica } = reconciliarDicas(
      [pedido({ ref: 'a', tema: 'almoço' })],
      [{ eco: 'almoço', blocos: ['   ', ''], legenda: '  ' }],
    )
    expect(brutas).toEqual([])
    expect(semDica).toEqual(['a'])
  })

  it('lista nula ou indefinida não quebra nada', () => {
    expect(reconciliarDicas([pedido()], null).semDica).toEqual(['slot-1'])
    expect(reconciliarDicas([pedido()], undefined).brutas).toEqual([])
    expect(reconciliarDicas([pedido()], [null, undefined]).semDica).toEqual(['slot-1'])
  })
})

describe('ecoDaDica', () => {
  it('normaliza acento, pontuação e caixa', () => {
    expect(ecoDaDica('Happy Hour: Chopp & Petisco!')).toBe('happy hour chopp petisco')
  })
})

describe('aplicarGuardaDeDados', () => {
  it('deixa passar o bloco sem preço, horário, data ou promoção — e não inventa fonte', () => {
    const r = aplicarGuardaDeDados({ blocos: ['A NOITE COMEÇA AQUI'] }, [entrada()])
    expect(r.blocos).toEqual(['A NOITE COMEÇA AQUI'])
    expect(r.fontes).toEqual([])
    expect(r.avisos).toEqual([])
  })

  /**
   * 🔴 O caso que o módulo existe para impedir. Preço que não está na base é
   * preço inventado, e ele não pode chegar a lugar nenhum — nem "aproximado".
   */
  it('bloco com preço que NÃO está na base é removido e vira aviso', () => {
    const r = aplicarGuardaDeDados(
      { blocos: ['A NOITE COMEÇA AQUI', 'CHOPP POR R$ 9,90'] },
      [entrada()],
    )
    expect(r.blocos).toEqual(['A NOITE COMEÇA AQUI'])
    expect(r.fontes).toEqual([])
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toContain('preço')
  })

  it('bloco com preço que ESTÁ na base sobrevive e popula fontes', () => {
    const r = aplicarGuardaDeDados({ blocos: ['CHOPP POR R$ 12,90'] }, [entrada()])
    expect(r.blocos).toEqual(['CHOPP POR R$ 12,90'])
    expect(r.fontes).toEqual(['Happy hour'])
    expect(r.avisos).toEqual([])
  })

  it('o horário também precisa de lastro, e o lastro pode estar em outra entrada', () => {
    const base = [
      entrada({ id: 'e1', titulo: 'Cardápio', conteudo: 'Chopp por R$ 12,90.' }),
      entrada({ id: 'e2', titulo: 'Horários', conteudo: 'Abrimos das 18h às 23h.' }),
    ]
    const ok = aplicarGuardaDeDados({ blocos: ['DAS 18H ÀS 23H'] }, base)
    expect(ok.blocos).toEqual(['DAS 18H ÀS 23H'])
    expect(ok.fontes).toEqual(['Horários'])

    const nao = aplicarGuardaDeDados({ blocos: ['DAS 17H ÀS 23H'] }, base)
    expect(nao.blocos).toEqual([])
    expect(nao.avisos[0]).toContain('horário')
  })

  it('sem entrada nenhuma, todo dado sensível cai', () => {
    const r = aplicarGuardaDeDados({ blocos: ['SÓ HOJE, 20% OFF'] }, [])
    expect(r.blocos).toEqual([])
    expect(r.avisos[0]).toContain('nenhuma entrada disponível')
  })

  it('a legenda passa pela mesma trava', () => {
    const r = aplicarGuardaDeDados(
      { blocos: ['A NOITE COMEÇA AQUI'], legenda: 'Chopp a R$ 5,00 hoje.' },
      [entrada()],
    )
    expect(r.blocos).toEqual(['A NOITE COMEÇA AQUI'])
    expect(r.legenda).toBeNull()
    expect(r.avisos[0]).toContain('legenda')
  })

  /**
   * A comparação tolera a diagramação ("R$12,90" × "R$ 12,90"), porque quem
   * normaliza os dois lados é `normalizeForComparison`. O VALOR continua
   * protegido: vírgula ou dígito trocado ainda derruba.
   */
  it('espaço depois do R$ não muda o veredito; dígito trocado muda', () => {
    const base = [entrada({ conteudo: 'Chopp por R$12,90 na happy hour.' })]
    expect(aplicarGuardaDeDados({ blocos: ['CHOPP POR R$ 12,90'] }, base).blocos).toHaveLength(1)
    expect(aplicarGuardaDeDados({ blocos: ['CHOPP POR R$ 12,80'] }, base).blocos).toHaveLength(0)
  })
})

describe('entradasValidasPara', () => {
  /**
   * A vigência é conferida contra a data DO SLOT, nunca contra `new Date()`:
   * planejamento mira data futura, e campanha que vence antes do slot não pode
   * entrar na copy daquele slot.
   */
  it('descarta a campanha que vence antes do dia da peça', () => {
    const base = [
      entrada({ id: 'vale', titulo: 'Sempre', expiresAt: null }),
      entrada({ id: 'vence', titulo: 'Festival', expiresAt: new Date('2026-08-10T00:00:00Z') }),
    ]
    const cedo = entradasValidasPara(pedido({ quando: new Date('2026-08-09T12:00:00Z') }), base)
    const tarde = entradasValidasPara(pedido({ quando: new Date('2026-08-11T12:00:00Z') }), base)

    expect(cedo.map((e) => e.titulo)).toEqual(['Sempre', 'Festival'])
    expect(tarde.map((e) => e.titulo)).toEqual(['Sempre'])
  })
})

describe('montarPromptDeDica', () => {
  const insumos: InsumosDaDica = {
    nomeDaMarca: 'By Rock',
    tomDeVoz: 'Direto, sem frescura.',
    regrasDeConteudo: 'Uma oferta por peça.',
    perguntasDoCrivo: ['Tem emoji dentro da arte?', 'A foto acontece no salão real?'],
    perfil: 'O QUE O SISTEMA APRENDEU COM O USO DESTE CLIENTE\n- rodízio',
  }

  it('carrega marca, crivo, perfil, base e as peças', () => {
    const prompt = montarPromptDeDica(insumos, [pedido({ ref: 'slot-1' })], [entrada()])

    expect(prompt).toContain('=== MARCA: By Rock ===')
    expect(prompt).toContain('Direto, sem frescura.')
    expect(prompt).toContain('Uma oferta por peça.')
    expect(prompt).toContain('Tem emoji dentro da arte?')
    expect(prompt).toContain('O QUE O SISTEMA APRENDEU COM O USO DESTE CLIENTE')
    expect(prompt).toContain('[1] (CAMPANHAS) Happy hour')
    expect(prompt).toContain('ref: slot-1')
    expect(prompt).toContain('âncora: happy hour')
  })

  /**
   * As perguntas do crivo entram como PERGUNTAS. A polaridade da lista é MISTA
   * ("Tem emoji?" reprova no sim; "A foto acontece no salão real?" reprova no
   * não) — apresentá-las como afirmações ensinaria o oposto em metade delas.
   */
  it('apresenta o crivo como pergunta, nunca como regra', () => {
    const prompt = montarPromptDeDica(insumos, [pedido()], [])
    expect(prompt).toContain('São PERGUNTAS, não afirmações')
  })

  /**
   * O dia da semana ganha linha própria porque é a informação que o modelo
   * mais deixa passar num prompt longo — e a que mais estraga a peça: anunciar
   * no domingo o executivo que é de segunda a sexta, ou convidar para uma casa
   * que fecha aos domingos (os dois casos foram medidos no By Rock e no Wine
   * Vix em 11/08/2026, e sumiram quando a linha subiu).
   */
  it('escreve a data do slot em Brasília e destaca o dia da semana', () => {
    const prompt = montarPromptDeDica(insumos, [pedido({ quando: QUANDO })], [])
    expect(prompt).toContain('DIA DA SEMANA: sexta-feira')
    expect(prompt).toContain('14/08/2026')
    expect(prompt).toContain('19:00')
    expect(prompt).toContain('NÃO escreva esta hora na copy')
  })

  it('lista, por peça, quais entradas da base valem naquele dia', () => {
    const base = [
      entrada({ id: 'a', titulo: 'Sempre', expiresAt: null }),
      entrada({ id: 'b', titulo: 'Festival', expiresAt: new Date('2026-08-10T00:00:00Z') }),
    ]
    const antes = montarPromptDeDica(
      insumos,
      [pedido({ quando: new Date('2026-08-09T12:00:00Z') })],
      base,
    )
    const depois = montarPromptDeDica(
      insumos,
      [pedido({ quando: new Date('2026-08-11T12:00:00Z') })],
      base,
    )

    expect(antes).toContain('entradas da base liberadas para esta data: 1, 2')
    expect(depois).toContain('entradas da base liberadas para esta data: 1')
  })

  it('sem base, manda escrever sem preço, horário, data e promoção', () => {
    const prompt = montarPromptDeDica(insumos, [pedido()], [])
    expect(prompt).toContain('Nenhuma entrada disponível')
  })

  it('a leva inteira vai numa chamada só, e o prompt diz por quê', () => {
    const prompt = montarPromptDeDica(insumos, [pedido({ ref: 'a' }), pedido({ ref: 'b' })], [])
    expect(prompt).toContain('PEÇA 1')
    expect(prompt).toContain('PEÇA 2')
    expect(prompt).toContain('A LEVA INTEIRA É SUA')
  })
})

describe('VERSAO_DA_DICA', () => {
  it('é a safra que B2 grava junto com a proposta', () => {
    expect(VERSAO_DA_DICA).toBe('dica-copy-v1')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// O serviço, com o banco e o modelo trocados por dublês.
//
// `@/lib/db` LANÇA no import quando falta `DATABASE_URL` — é por isso que o
// serviço não pode ser importado cru num teste, e por isso a parte pura mora
// noutro módulo. Aqui o que se mede é a promessa que não cabe na parte pura:
// **`montarDicasDeCopy` nunca lança**.
// ─────────────────────────────────────────────────────────────────────────────

const dubles = vi.hoisted(() => ({
  generateObject: vi.fn(),
  loadBrandContext: vi.fn(),
  montarPerfil: vi.fn(),
  searchKnowledgeBase: vi.fn(),
  revisarOrtografia: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock('ai', () => ({ generateObject: dubles.generateObject }))
vi.mock('@ai-sdk/openai', () => ({ openai: (nome: string) => nome }))
vi.mock('@/lib/db', () => ({ db: { knowledgeBaseEntry: { findMany: dubles.findMany } } }))
vi.mock('@/lib/brand/brand-context', () => ({ loadBrandContext: dubles.loadBrandContext }))
vi.mock('@/lib/aprendizado/perfil', () => ({
  montarPerfil: dubles.montarPerfil,
  perfilParaPrompt: () => null,
}))
vi.mock('@/lib/knowledge/search', () => ({ searchKnowledgeBase: dubles.searchKnowledgeBase }))
vi.mock('@/lib/ai/revisao-ortografica', () => ({ revisarOrtografia: dubles.revisarOrtografia }))

const { montarDicasDeCopy } = await import('../dica-de-copy')

const CONTEXTO = {
  projectName: 'By Rock',
  dna: {
    toneOfVoice: 'Direto.',
    contentRules: 'Uma oferta por peça.',
    approvalChecklist: 'Tem emoji dentro da arte?',
  },
}

describe('montarDicasDeCopy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dubles.loadBrandContext.mockResolvedValue(CONTEXTO)
    dubles.montarPerfil.mockResolvedValue({})
    dubles.searchKnowledgeBase.mockResolvedValue([])
    dubles.revisarOrtografia.mockResolvedValue({ suspeitas: [], indisponivel: false })
    dubles.findMany.mockResolvedValue([
      {
        id: 'e1',
        title: 'Happy hour',
        category: 'CAMPANHAS',
        content: 'Chopp por R$ 12,90, das 18h às 20h.',
        expiresAt: null,
        updatedAt: new Date('2026-08-01T00:00:00Z'),
      },
    ])
  })

  /** A promessa central: nada espera, nada bloqueia, e falhar é "sem dica". */
  it('modelo indisponível devolve indisponivel: true sem lançar', async () => {
    dubles.generateObject.mockRejectedValue(new Error('timeout'))

    const r = await montarDicasDeCopy({
      projectId: 1,
      pedidos: [pedido({ ref: 'a' }), pedido({ ref: 'b' })],
    })

    expect(r.indisponivel).toBe(true)
    expect(r.dicas).toEqual([])
    expect(r.semDica).toEqual(['a', 'b'])
    expect(r.avisos.join(' ')).toContain('timeout')
    expect(r.versao).toBe(VERSAO_DA_DICA)
  })

  it('marca sem identidade legível também degrada para sem dica', async () => {
    dubles.loadBrandContext.mockResolvedValue(null)
    const r = await montarDicasDeCopy({ projectId: 1, pedidos: [pedido({ ref: 'a' })] })
    expect(r.indisponivel).toBe(true)
    expect(r.semDica).toEqual(['a'])
    expect(dubles.generateObject).not.toHaveBeenCalled()
  })

  it('base de conhecimento fora do ar não derruba a dica — só tira o que tem dado', async () => {
    dubles.findMany.mockRejectedValue(new Error('sem banco'))
    dubles.generateObject.mockResolvedValue({
      object: { dicas: [{ eco: 'happy hour', blocos: ['A NOITE COMEÇA AQUI', 'CHOPP A R$ 9,90'] }] },
    })

    const r = await montarDicasDeCopy({ projectId: 1, pedidos: [pedido({ ref: 'a' })] })

    expect(r.indisponivel).toBe(false)
    expect(r.dicas[0].blocos).toEqual(['A NOITE COMEÇA AQUI'])
    expect(r.avisos.join(' ')).toContain('base de conhecimento')
  })

  it('monta a dica, apaga o preço sem lastro e roda a revisão ortográfica', async () => {
    dubles.revisarOrtografia.mockResolvedValue({
      suspeitas: [{ trecho: 'DISPONIVEL', sugestao: 'DISPONÍVEL', motivo: 'falta o acento' }],
      indisponivel: false,
    })
    dubles.generateObject.mockResolvedValue({
      object: {
        dicas: [
          {
            eco: 'happy hour',
            blocos: ['CHOPP POR R$ 12,90', 'PORÇÃO POR R$ 3,00'],
            legenda: 'Uma legenda que o story não usa.',
          },
        ],
      },
    })

    const r = await montarDicasDeCopy({ projectId: 1, pedidos: [pedido({ ref: 'a' })] })

    expect(r.dicas).toHaveLength(1)
    // O preço que está na base sobrevive; o inventado cai.
    expect(r.dicas[0].blocos).toEqual(['CHOPP POR R$ 12,90'])
    expect(r.dicas[0].fontes).toEqual(['Happy hour'])
    // Story não tem legenda — o prompt pede, o código garante.
    expect(r.dicas[0].legenda).toBeNull()
    expect(r.dicas[0].suspeitas).toHaveLength(1)
    expect(dubles.revisarOrtografia).toHaveBeenCalledTimes(1)
  })

  it('peça sem identificador ou sem data legível não derruba a leva', async () => {
    dubles.generateObject.mockResolvedValue({
      object: { dicas: [{ eco: 'happy hour', blocos: ['A NOITE COMEÇA AQUI'] }] },
    })

    const r = await montarDicasDeCopy({
      projectId: 1,
      pedidos: [
        pedido({ ref: 'a' }),
        pedido({ ref: 'sem-data', quando: new Date('não é data') }),
        { ...pedido(), ref: '' },
      ],
    })

    expect(r.indisponivel).toBe(false)
    expect(r.dicas.map((d) => d.ref)).toEqual(['a'])
    expect(r.avisos.join(' ')).toContain('sem dica por não ter identificador ou data legível')
  })

  it('leva vazia é resposta vazia, sem chamar modelo nenhum', async () => {
    const r = await montarDicasDeCopy({ projectId: 1, pedidos: [] })
    expect(r).toEqual({
      versao: VERSAO_DA_DICA,
      dicas: [],
      semDica: [],
      avisos: [],
      indisponivel: false,
    })
    expect(dubles.generateObject).not.toHaveBeenCalled()
  })
})
