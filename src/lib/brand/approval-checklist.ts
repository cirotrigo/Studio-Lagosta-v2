/**
 * Crivo de aprovação: leitura do texto do DNA em itens.
 *
 * Módulo SEM dependências de propósito — quem consome é a bancada, que é
 * client. `brand-context.ts` importa o Prisma no topo, então uma função
 * utilitária morando lá arrastaria o banco inteiro para o bundle do navegador.
 * Mesma razão pela qual `art-direction.ts` é um módulo à parte.
 */

/**
 * Quebra o crivo em itens. Uma pergunta por linha; numeração de origem
 * ("1. ", "- ") é removida para a UI numerar sozinha.
 *
 * A polaridade do texto de origem é MISTA — no By Rock convivem "O layout é
 * igual ao da peça anterior?" (reprova no SIM) e "A foto acontece dentro do
 * salão real da casa?" (reprova no NÃO). Quem normaliza isso é a avaliação
 * (`crivo-avaliacao.ts`), que reescreve as perguntas do olho humano de modo
 * que MARCAR signifique sempre "está conforme". O texto do DNA fica intocado.
 */
export function parseApprovalChecklist(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter((line) => line.length > 0)
}

/**
 * O veredito de uma pergunta do crivo.
 *
 * `preciso-de-olho` NÃO é "o sistema falhou": é a resposta correta para tudo
 * que só se decide olhando a peça (foto, layout, cor, legibilidade) e para
 * tudo que as evidências não cobrem. Inventar `conforme` ali seria o mesmo
 * pedágio de hoje, só que carimbado pela máquina.
 */
export type VereditoCrivo = 'conforme' | 'reprova' | 'preciso-de-olho'

export interface ItemDoCrivo {
  /** Posição da pergunta no crivo do DNA (0-based). É a identidade do item. */
  indice: number
  /** A pergunta como está no DNA, palavra por palavra. */
  pergunta: string
  veredito: VereditoCrivo
  /**
   * Uma frase citando o DADO que sustenta o veredito ("agendado para terça
   * 17:00, dentro de 10h–22h"). Em `preciso-de-olho`, diz o que olhar.
   */
  evidencia: string
  /**
   * Só em `preciso-de-olho`: a mesma pergunta com a polaridade normalizada,
   * de modo que marcar a caixa signifique "está conforme".
   *
   * É o conserto do defeito central do crivo antigo, onde o quadradinho
   * significava "eu li" e metade das perguntas reprovava justamente no "sim".
   */
  perguntaNormalizada?: string
}

export interface AvaliacaoDoCrivo {
  itens: ItemDoCrivo[]
  /**
   * `true` quando a conferência automática não pôde rodar. A UI cai no crivo
   * manual de sempre — serviço fora do ar NUNCA bloqueia o agendamento.
   */
  degradado: boolean
  /** Por que degradou, para o log e para a frase honesta na tela. */
  motivo?: string
  avaliadoEm: string
}

/**
 * A peça que vai ser conferida, na forma que a bancada consegue descrever.
 *
 * Sem a imagem de propósito: a conferência automática responde só o que se
 * decide por DADO (horário, copy, base de conhecimento). O que exige ver a
 * arte é devolvido para o olho humano.
 */
export interface PecaParaCrivo {
  /** Blocos de copy da peça, na ordem em que aparecem. */
  copy: string[]
  /** Legenda do post, quando houver. */
  legenda?: string | null
  /** Horário planejado, "YYYY-MM-DD HH:mm" em horário de Brasília. */
  quando?: string | null
  /** Story, feed, quadrado, carrossel — como a bancada chama. */
  formato?: string | null
  generationId?: string | null
  pageId?: string | null
}

/**
 * O crivo de leitura manual: tudo volta para o olho humano, com as perguntas
 * ORIGINAIS do DNA (sem normalizar polaridade — normalizar exige o modelo, e
 * é justamente ele que não respondeu).
 *
 * É o piso de degradação de toda a feature. Ele existe como função pura, e
 * não como ramo dentro do serviço, para a UI conseguir montá-lo sozinha
 * quando nem a rota responde.
 */
export function crivoManual(perguntas: string[], motivo?: string): AvaliacaoDoCrivo {
  return {
    itens: perguntas.map((pergunta, indice) => ({
      indice,
      pergunta,
      veredito: 'preciso-de-olho' as const,
      evidencia: '',
      perguntaNormalizada: pergunta,
    })),
    degradado: true,
    motivo,
    avaliadoEm: new Date().toISOString(),
  }
}

/** O agendamento em horário de Brasília, quebrado no que a conferência usa. */
export interface AgendamentoEmBrasilia {
  /** DD/MM/AAAA — como se lê, não como se guarda. */
  data: string
  hora: string
  /** "terça-feira", "domingo" — em português, minúsculo. */
  diaDaSemana: string
}

/**
 * Lê "YYYY-MM-DD HH:mm" (que a bancada monta a partir dos campos de data e
 * hora, JÁ em horário de Brasília) e diz que dia da semana é aquilo.
 *
 * 🔴 Não passa por `new Date(texto)`. Uma string sem fuso é lida como UTC pelo
 * `Date`, e na Vercel — que roda em UTC — o cálculo do dia da semana viraria
 * outro dia para toda peça noturna. É exatamente o erro que este crivo existe
 * para pegar ("peça noturna não pode cair no domingo"), então ele não pode
 * morar dentro do próprio conferidor.
 *
 * A conta é feita com `Date.UTC` e lida de volta em UTC: aritmética de
 * calendário pura, com o fuso do servidor fora da conta nos dois sentidos.
 */
export function agendamentoEmBrasilia(
  quando: string | null | undefined,
): AgendamentoEmBrasilia | null {
  if (!quando) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(quando.trim())
  if (!m) return null
  const [, ano, mes, dia, hora, minuto] = m

  const instante = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)))
  if (Number.isNaN(instante.getTime())) return null
  // Data impossível (31/02) é normalizada em silêncio pelo `Date.UTC`, e um
  // dia da semana inventado é pior que nenhum.
  if (instante.getUTCMonth() !== Number(mes) - 1 || instante.getUTCDate() !== Number(dia)) {
    return null
  }
  if (Number(hora) > 23 || Number(minuto) > 59) return null

  const diaDaSemana = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(instante)

  return { data: `${dia}/${mes}/${ano}`, hora: `${hora}:${minuto}`, diaDaSemana }
}

/** O texto que a caixa de marcar deve mostrar: normalizada quando existe. */
export function textoDoItem(item: ItemDoCrivo): string {
  const normalizada = item.perguntaNormalizada?.trim()
  return normalizada && normalizada.length > 0 ? normalizada : item.pergunta
}

/** Forma de comparação de pergunta: sem acento, sem pontuação, minúscula. */
function normalizarPergunta(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Quantos caracteres do eco bastam para identificar a pergunta. */
const TAMANHO_DO_ECO = 30

/** A frase nega alguma coisa? ("não" solto, já normalizado.) */
function temNegacao(texto: string): boolean {
  return normalizarPergunta(texto).split(' ').includes('nao')
}

/**
 * A inversão é aceitável, ou é a pergunta original com um "não" enfiado?
 *
 * 🔴 Inverter por NEGAÇÃO é o modo de falha medido em 11/08/2026: pedida a
 * reescrita, o gpt-4o-mini devolveu "A gramática NÃO está impecável?", "A foto
 * não acontece dentro do salão real?" e "Se o texto não está dentro da área
 * segura?" — frases que fazem a pessoa marcar exatamente o oposto do que quis
 * dizer, e que numa lista de 15 passam despercebidas.
 *
 * Inversão de verdade REESCREVE em positivo: "Tem emoji dentro da arte?" →
 * "A arte está sem emoji?"; "Existe mais de uma oferta?" → "A peça tem uma
 * oferta só?"; "O layout é igual ao da anterior?" → "O layout é diferente…".
 *
 * Por isso a regra é dura: **negação nova, reescrita recusada**. Ela derruba
 * junto algumas inversões negativas que seriam válidas ("A arte não tem
 * emoji?"), e isso é aceitável — o que sobra é a pergunta do DNA, que é segura,
 * porque na tela marcar já significa "está conforme". Perder uma reescrita
 * desajeitada custa nada; aceitar uma invertida errada custa a confiança na
 * tela inteira.
 */
export function inversaoAceitavel(original: string, invertida: string): boolean {
  const limpa = invertida.trim()
  if (limpa.length === 0) return false
  if (normalizarPergunta(limpa) === normalizarPergunta(original)) return false
  return !(temNegacao(limpa) && !temNegacao(original))
}

/**
 * Onde esta resposta pertence de verdade.
 *
 * 🔴 O ÍNDICE DECLARADO PELO MODELO NÃO É CONFIÁVEL. Medido em 11/08/2026 no
 * By Rock: o modelo devolveu a lista inteira deslocada em uma posição —
 * respondia a pergunta N e carimbava o número N-1. O efeito era um ✅ verde em
 * "Existe mais de uma oferta na mesma peça?" com evidência sobre CORES, que é
 * o pior defeito possível numa tela cujo propósito é dizer o que foi conferido.
 *
 * Por isso a resposta é amarrada à pergunta pelo TEXTO que o modelo copiou
 * (o eco), e o número serve só quando não há eco. Eco que não casa com
 * pergunta nenhuma — ou que casa com várias — é DESCARTADO: a pergunta volta
 * para o olho humano, que é o lado seguro do erro.
 */
function indiceDaResposta(
  perguntasNormalizadas: string[],
  resposta: { indice?: number | null; eco?: string | null },
): number | null {
  const eco = normalizarPergunta(resposta.eco ?? '').slice(0, TAMANHO_DO_ECO)

  if (eco.length >= 8) {
    const casam: number[] = []
    for (let i = 0; i < perguntasNormalizadas.length; i++) {
      if (perguntasNormalizadas[i].startsWith(eco)) casam.push(i)
    }
    // Perguntas de um mesmo crivo às vezes começam igual ("Se é peça de…") —
    // com mais de uma candidata o eco não identifica nada, e o número do
    // modelo desempata só se estiver entre elas.
    if (casam.length === 1) return casam[0]
    if (casam.length > 1 && typeof resposta.indice === 'number') {
      return casam.includes(resposta.indice) ? resposta.indice : null
    }
    return null
  }

  return typeof resposta.indice === 'number' ? resposta.indice : null
}

/**
 * Reconcilia o que o modelo devolveu com as perguntas REAIS do DNA.
 *
 * O DNA é a autoridade sobre quais perguntas existem: o modelo pode pular
 * item, deslocar a lista inteira, repetir índice ou inventar um que não
 * existe. Pergunta sem resposta válida vira `preciso-de-olho` com o texto
 * original — o lado seguro do erro, porque manda a dúvida para a pessoa em vez
 * de carimbar "conforme".
 *
 * Função pura para ser testável sem banco nem chamada de modelo.
 */
export function reconciliarVeredito(
  perguntas: string[],
  respostas: Array<{
    indice?: number | null
    /**
     * As primeiras palavras da pergunta, copiadas pelo modelo. É por ELE que a
     * resposta é amarrada à pergunta — o índice declarado já veio deslocado em
     * produção.
     */
    eco?: string | null
    /**
     * O modelo declarando que a pergunta só se responde OLHANDO a arte. Quando
     * `true`, o veredito é forçado a `preciso-de-olho` — ele não recebeu
     * imagem nenhuma, então qualquer "conforme"/"reprova" ali é invenção.
     */
    dependeDeVerAImagem?: boolean | null
    veredito?: string | null
    evidencia?: string | null
    /**
     * O que significa responder SIM à pergunta como ela está no DNA: a peça
     * fica `'certa'` ou `'errada'`. Só `'errada'` autoriza a inversão —
     * qualquer outro valor, inclusive ausente, mantém o texto do DNA.
     */
    simSignifica?: string | null
    /** A inversão, usada SÓ quando `simSignifica` é `'errada'`. */
    perguntaInvertida?: string | null
  }>,
): ItemDoCrivo[] {
  // Tudo opcional de propósito: isto recebe a saída de um modelo, e o schema
  // do SDK garante o FORMATO, não o preenchimento. Campo faltando é caso
  // esperado, não erro de tipo a silenciar com `as`.
  const normalizadas = perguntas.map(normalizarPergunta)
  const porIndice = new Map<number, (typeof respostas)[number]>()
  for (const resposta of respostas) {
    if (!resposta) continue
    const indice = indiceDaResposta(normalizadas, resposta)
    if (indice === null || indice < 0 || indice >= perguntas.length) continue
    // A PRIMEIRA resposta de cada pergunta vence: resposta repetida é ruído do
    // modelo, e trocar de veredito no meio da lista não tem como ser melhor.
    if (!porIndice.has(indice)) porIndice.set(indice, resposta)
  }

  return perguntas.map((pergunta, indice) => {
    const resposta = porIndice.get(indice)
    const veredito = resposta?.veredito
    if (veredito !== 'conforme' && veredito !== 'reprova' && veredito !== 'preciso-de-olho') {
      return {
        indice,
        pergunta,
        veredito: 'preciso-de-olho' as const,
        evidencia: '',
        perguntaNormalizada: pergunta,
      }
    }

    const evidencia = (resposta?.evidencia ?? '').trim()

    // 🔴 TRAVA DO OLHO. Nenhuma imagem é enviada na avaliação, então pergunta
    // que o próprio modelo classificou como visual NÃO pode sair com veredito
    // — mesmo que ele tenha escrito um logo abaixo.
    //
    // Isto não é redundância do prompt: medido em 11/08/2026, o modelo
    // respondeu "a arte contém emoji, o que é proibido" e "o vermelho ocupa
    // mais que um acento pequeno" sobre uma arte que nunca viu, com evidência
    // de aparência perfeitamente plausível. Regra que depende de o modelo
    // lembrar dela no meio de outras três tarefas não é regra; é torcida.
    const visual = resposta?.dependeDeVerAImagem === true

    if (visual || veredito === 'preciso-de-olho') {
      // 🔴 MANTER o texto do DNA é o default, e inverter é o caso explícito.
      //
      // O contrário já foi tentado e falhou em produção: pedir "reescreva para
      // que marcar signifique conforme" fez o modelo inverter perguntas que
      // JÁ estavam certas — "Gramática impecável?" virou "A gramática NÃO está
      // impecável?", e marcar aquilo passaria a significar o oposto do que a
      // pessoa quis dizer. Polaridade trocada é pior que o crivo antigo, então
      // ela só muda quando o modelo declara a inversão de propósito E entrega
      // o texto novo.
      const invertida = (resposta?.perguntaInvertida ?? '').trim()
      const inverteu = resposta?.simSignifica === 'errada' && inversaoAceitavel(pergunta, invertida)
      return {
        indice,
        pergunta,
        veredito: 'preciso-de-olho' as const,
        // A justificativa de um veredito que a trava acabou de derrubar fala
        // de coisas que o modelo não viu — mostrá-la seria repetir a invenção
        // com outra roupa.
        evidencia: veredito === 'preciso-de-olho' ? evidencia : '',
        perguntaNormalizada: inverteu ? invertida : pergunta,
      }
    }

    // `conforme`/`reprova` sem evidência citável é veredito sem lastro — e o
    // contrato desta tela é mostrar o dado. Sem ele, devolve para o olho.
    if (evidencia.length === 0) {
      return {
        indice,
        pergunta,
        veredito: 'preciso-de-olho' as const,
        evidencia: '',
        perguntaNormalizada: pergunta,
      }
    }

    return { indice, pergunta, veredito, evidencia }
  })
}
