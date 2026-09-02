/**
 * Sugestão de posts pela CADÊNCIA HISTÓRICA do cliente.
 *
 * Nada de configuração nova: o ritmo é lido do que o cliente efetivamente
 * PUBLICOU nas últimas semanas — dia da semana × horário, em fuso de Brasília.
 * Os buracos dos próximos dias viram sugestões, cada uma com o motivo ("costuma
 * postar domingo por volta das 11:30"), o modelo do cliente tagueado para
 * aquele dia (quando existe) e as campanhas da base que citam o dia ("Quinta do
 * Vinho — toda quinta").
 *
 * Quem escreve a copy é o assistente na conversa; aqui é só o esqueleto de
 * quando/o quê — determinístico e barato.
 *
 * ── O QUE MUDOU NA F2 ─────────────────────────────────────────────────────
 * O cálculo saiu daqui e virou `src/lib/posts/cadencia.ts`, módulo PURO com
 * peso por recência, desconto de auto-reforço e a regra "campanha confirma,
 * nunca cria". Sobrou aqui o que é desta camada: buscar no banco, resolver a
 * vigência das campanhas, achar os buracos e registrar a emissão. A separação
 * é o que permite comparar antes/depois contra os dados reais de produção sem
 * escrever nada (`scripts/validar-cadencia-f2.ts`).
 *
 * Duas mudanças de consulta valem menção:
 *
 *  - **O histórico conta só POSTED.** SCHEDULED continua sendo lido, mas apenas
 *    para saber que o horário está ocupado — que é outra pergunta e já era
 *    outra query. No histórico, ele fazia o que ainda não aconteceu virar prova
 *    de hábito; e como a sugestão aceita vira SCHEDULED, o sistema se citava.
 *  - **Post de campanha ENCERRADA sai do histórico.** A campanha descrevia um
 *    período, e o período acabou.
 *
 * Cada slot devolvido é também uma SUGESTÃO REGISTRADA (F1): a linha nasce no
 * momento da emissão, não quando alguém aceita — sem isso a proposta ignorada
 * some e a taxa de aceitação vira 100% por construção. Ver `sugestaoId` em
 * `SugestaoSlot` e a nota sobre volume em `chaveDoSlot`.
 */
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { formatarBRT } from '@/lib/posts/agenda-acoes'
import { DIAS_SEMANA, escolherModeloDoDia, normalizar } from '@/lib/posts/dia-semana'
import { vigenteEm, estaVigente } from '@/lib/knowledge/vigencia'
import { calcularCadencia, type PostDoHistorico } from '@/lib/posts/cadencia'
import { registrarSugestoes, sugestoesJaEmitidas } from '@/lib/aprendizado/captura'
import { chaveDeSugestao } from '@/lib/aprendizado/chaves'
import { fundirGradeComCadencia, lerGradeDasEntradas, VERSAO_DA_GRADE } from '@/lib/posts/grade-da-base'

const JANELA_HISTORICO_DIAS = 56

/**
 * Versão da heurística de cadência. Entra na chave de idempotência: mudou a
 * regra, a safra nova não pode herdar o desfecho de uma proposta que era outra.
 *
 * `v2` (F2) = peso por recência com meia-vida de 21 dias, histórico só com
 * POSTED, campanha encerrada fora, campanha em curso e auto-reforço com
 * desconto, `postsPorSemana` sobre semanas com atividade.
 */
const VERSAO_DA_CADENCIA = 'cadencia-v2'
const SERVICO = 'sugerir-posts'

/**
 * A proposta é "este cliente, neste horário" — não "esta chamada".
 *
 * `sugerirPosts` é consultado pela bancada (que refaz a consulta ao voltar
 * para a aba), pela rota `/slots` e pela tool do MCP, e devolve até ~15 slots
 * por chamada. Sem chave, uma semana de uso normal gravaria milhares de linhas
 * para as mesmas dezenas de propostas, e o denominador do KPI viraria ficção.
 * Com ela, recarregar a tela não cria nada: o mesmo slot devolve o mesmo id, e
 * o desfecho continua sendo um só.
 */
function chaveDoSlot(projectId: number, scheduledDatetime: string, versao = VERSAO_DA_CADENCIA): string {
  return chaveDeSugestao('slot', versao, projectId, scheduledDatetime)
}

/**
 * Slot vindo da GRADE da base é outra heurística — outra versão, outra chave.
 * O mesmo horário proposto pela cadência semana passada e pela grade hoje são
 * propostas diferentes; herdar o desfecho de uma na outra mediria a errada.
 */
function versaoDoSlot(s: Pick<SugestaoSlot, 'origem'>): string {
  return s.origem === 'grade' ? VERSAO_DA_GRADE : VERSAO_DA_CADENCIA
}
/** Slot ocupado se já existe post a menos de 45min dele. */
const TOLERANCIA_SLOT_MIN = 45

export interface SugestaoSlot {
  data: string
  diaSemana: string
  hora: string
  quandoBRT: string
  /** "YYYY-MM-DD HH:mm" pronto para colocar-na-agenda. */
  scheduledDatetime: string
  motivo: string
  /**
   * De onde veio o horário: `grade` = slot fixo da entrada "Padrões de
   * Postagem" da base (o COMBINADO com o cliente); `cadencia` = o que o
   * histórico mostra que ele FAZ. Onde há grade, ela substitui a cadência.
   */
  origem?: 'grade' | 'cadencia'
  /** O tema que a grade declara para este horário, quando declara. */
  temaDaGrade?: string
  /** `curinga` = veio da reserva genérica (modelo sem dia declarado), não é do dia. */
  modeloSugerido?: {
    pageId: string
    nome: string
    template: string
    temas: string[]
    curinga: boolean
  }
  campanhasDoDia?: string[]
  /**
   * Id do sinal desta proposta. Devolva-o em `colocar-na-agenda` / `POST
   * /agendar`: é o que liga o post à sugestão que o originou e permite dizer
   * se o horário foi aceito como veio ou andou. Ausente só quando a captura
   * falhou — e falha de captura nunca derruba a sugestão.
   */
  sugestaoId?: string
}

export interface SugerirPostsResult {
  diasAnalisados: number
  postsNoHistorico: number
  cadencia: Array<{ diaSemana: string; horariosTipicos: string[]; postsPorSemana: number }>
  jaNaAgenda: number
  sugestoes: SugestaoSlot[]
  avisos: string[]
}

export async function sugerirPosts(params: {
  projectId: number
  /** Quantos dias à frente olhar (default 7, teto 14). */
  dias?: number
}): Promise<SugerirPostsResult> {
  const { projectId } = params
  const dias = Math.min(Math.max(params.dias ?? 7, 1), 14)
  const avisos: string[] = []

  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
  }

  const agora = new Date()
  const inicioHistorico = new Date(agora.getTime() - JANELA_HISTORICO_DIAS * 24 * 3600_000)
  const fimJanela = new Date(agora.getTime() + dias * 24 * 3600_000)

  const [historico, futuros] = await Promise.all([
    db.socialPost.findMany({
      where: {
        projectId,
        // Só o que FOI PUBLICADO ensina cadência. SCHEDULED saiu daqui na F2:
        // ele é intenção, não hábito — e, como a sugestão aceita vira
        // SCHEDULED, mantê-lo fazia o sistema confirmar a própria proposta. A
        // checagem de horário ocupado continua vendo SCHEDULED, na query ao
        // lado, que é outra pergunta.
        status: 'POSTED',
        scheduledDatetime: { gte: inicioHistorico, lte: agora },
        // Post marcado como PONTUAL não ensina cadência: um aviso de feriado
        // às 9h de uma terça não pode virar "o cliente costuma postar terça
        // às 9h". CAMPANHA continua sendo lido — mas com desconto, e sem poder
        // criar horário típico sozinho (ver `cadencia.ts`).
        learningScope: { not: 'PONTUAL' },
      },
      select: {
        scheduledDatetime: true,
        origem: true,
        learningScope: true,
        campaignId: true,
      },
    }),
    db.socialPost.findMany({
      where: {
        projectId,
        status: { in: ['DRAFT', 'SCHEDULED'] },
        scheduledDatetime: { gte: agora, lte: fimJanela },
        // Sem filtro de escopo: um post pontual OCUPA o horário do mesmo
        // jeito, e sugerir em cima dele empilharia dois posts.
      },
      select: { scheduledDatetime: true },
    }),
  ])

  // ── Cadência por dia da semana ────────────────────────────────────────────
  //
  // A campanha ENCERRADA é resolvida aqui, e não dentro do módulo puro: quem
  // sabe se a campanha acabou é a base de conhecimento, e `cadencia.ts` não
  // fala com o banco de propósito.
  const encerradas = await campanhasEncerradas(
    projectId,
    historico.map((p) => p.campaignId),
    agora,
  )

  const paraCadencia: PostDoHistorico[] = historico
    .filter((p) => p.scheduledDatetime)
    .map((p) => ({
      quando: p.scheduledDatetime!,
      origem: p.origem as PostDoHistorico['origem'],
      escopo: p.learningScope,
      campaignId: p.campaignId,
      campanhaEncerrada: !!p.campaignId && encerradas.has(p.campaignId),
    }))

  const resultado = calcularCadencia(paraCadencia, { agora })
  const { slotsPorDia, cadencia } = resultado

  if (historico.length < 5) {
    avisos.push(
      `Histórico curto (${historico.length} publicações nas últimas ${Math.round(JANELA_HISTORICO_DIAS / 7)} semanas) — as sugestões ficam melhores conforme o cliente publica.`,
    )
  }
  if (resultado.descartadosPorCampanha > 0) {
    avisos.push(
      `${resultado.descartadosPorCampanha} publicação(ões) de campanha já encerrada ficaram fora da conta de cadência.`,
    )
  }

  // ── Modelos por dia e campanhas que citam o dia ──────────────────────────
  const [modelos, campanhas, entradasDaGrade] = await Promise.all([
    db.page.findMany({
      where: { isTemplate: true, Template: { projectId } },
      select: { id: true, name: true, tags: true, Template: { select: { name: true, tags: true } } },
      /**
       * Ordem determinística com RODÍZIO — o menos usado primeiro, `name` só
       * para desempatar. A consulta não tinha `orderBy`, então "o primeiro que
       * casa" dependia da ordem que o Postgres devolvesse: com dois modelos do
       * mesmo dia (o By Rock tem dois de sábado e dois de terça) a escolha era
       * arbitrária e podia mudar entre chamadas. O curinga amplia o alcance
       * disso de um dia para todos os que não têm específico, então o desempate
       * deixou de ser detalhe.
       *
       * `usedCount` é `Int @default(0)`, não-nulo — a armadilha do `ASC` ser
       * NULLS LAST em Postgres não se aplica aqui (ela vale para `lastUsedAt`).
       */
      orderBy: [{ usedCount: 'asc' }, { name: 'asc' }],
    }),
    db.knowledgeBaseEntry.findMany({
      // Campanha já vencida nunca é tema de post novo. O corte fino é por
      // slot, logo abaixo — aqui só se poda o que já morreu.
      where: { projectId, status: 'ACTIVE', category: 'CAMPANHAS', ...vigenteEm(agora) },
      select: { title: true, content: true, expiresAt: true },
    }),
    /**
     * A GRADE APROVADA do cliente (01/09/2026): a entrada "Padrões de
     * Postagem" (ou qualquer POLITICAS/HORARIOS com tag `grade`/`cadencia`).
     * Até aqui ninguém a lia — a sugestão propunha o hábito do histórico por
     * cima do combinado. Falha nesta leitura degrada para a cadência, nunca
     * derruba a sugestão.
     */
    db.knowledgeBaseEntry
      .findMany({
        where: {
          projectId,
          status: 'ACTIVE',
          category: { in: ['POLITICAS', 'HORARIOS'] },
          OR: [
            { title: { contains: 'Padrões de Postagem', mode: 'insensitive' } },
            { tags: { hasSome: ['grade', 'cadencia'] } },
          ],
        },
        select: { title: true, content: true },
      })
      .catch((erro: unknown) => {
        console.error('[sugerir-posts] não deu para ler a grade da base (seguindo pela cadência):', erro)
        return [] as Array<{ title: string; content: string }>
      }),
  ])

  /**
   * Onde a grade cobre o dia, os slots fixos SUBSTITUEM os horários típicos
   * do histórico; onde não cobre, a cadência continua. `fundirGradeComCadencia`
   * é puro e com grade vazia é a identidade — um caminho só.
   */
  const grade = lerGradeDasEntradas(entradasDaGrade)
  const slotsFinais = fundirGradeComCadencia(slotsPorDia, grade)
  if (grade.length > 0) {
    const diasCobertos = new Set(grade.flatMap((s) => s.dias)).size
    avisos.push(
      `Grade aprovada do cliente encontrada na base (${grade.length} horário(s) fixo(s), ${diasCobertos} dia(s) da semana) — ela substitui a cadência do histórico nos dias que cobre.`,
    )
  }

  const modeloDoDia = (dia: number) => {
    const achado = escolherModeloDoDia(
      modelos,
      (m) => [m.name, m.Template.name, ...(m.tags ?? []), ...(m.Template.tags ?? [])],
      dia,
    )
    if (!achado) return undefined
    const { modelo, curinga } = achado
    return {
      pageId: modelo.id,
      nome: modelo.name,
      template: modelo.Template.name,
      temas: Array.from(new Set([...(modelo.tags ?? []), ...(modelo.Template.tags ?? [])])),
      /**
       * O modelo veio da reserva genérica, não é do dia. Quem monta a proposta
       * precisa saber: dizer "o modelo de sábado" sobre um layout de base é
       * mentira, e a escolha de assunto não pode se apoiar nele.
       */
      curinga,
    }
  }

  /**
   * A referência é a DATA DO SLOT, não "agora": o planejamento mira dia
   * futuro, e campanha que vence antes do slot não pode entrar na copy
   * daquele slot — é exatamente o erro que se vê quando a sugestão de sexta
   * cita um festival que acaba na quarta.
   */
  const campanhasDoDia = (dia: number, quandoUTC: number) => {
    const alvo = normalizar(DIAS_SEMANA[dia])
    const quando = new Date(quandoUTC)
    const titulos = campanhas
      .filter((c) => estaVigente(c.expiresAt, quando))
      .filter((c) => normalizar(`${c.title} ${c.content}`).includes(alvo))
      .map((c) => c.title)
    return titulos.length > 0 ? titulos : undefined
  }

  // ── Buracos nos próximos dias ────────────────────────────────────────────
  const ocupados = futuros
    .filter((p) => p.scheduledDatetime)
    .map((p) => p.scheduledDatetime!.getTime())

  const sugestoes: SugestaoSlot[] = []
  for (let offset = 0; offset < dias; offset++) {
    // Meia-noite BRT do dia alvo, reconstruída em UTC
    const base = new Date(agora.getTime() + offset * 24 * 3600_000)
    const brtBase = new Date(base.getTime() - 3 * 3600_000)
    const dataISO = brtBase.toISOString().slice(0, 10)
    const dia = brtBase.getUTCDay()
    const tipicos = slotsFinais.get(dia)
    if (!tipicos) continue

    for (const slot of tipicos) {
      const quandoUTC = new Date(`${dataISO}T00:00:00-03:00`).getTime() + slot.minutosDoDia * 60_000
      if (quandoUTC <= agora.getTime() + 30 * 60_000) continue // já passou (ou colado)
      const ocupado = ocupados.some(
        (t) => Math.abs(t - quandoUTC) <= TOLERANCIA_SLOT_MIN * 60_000,
      )
      if (ocupado) continue

      const campanhasDoSlot = campanhasDoDia(dia, quandoUTC)

      sugestoes.push({
        data: dataISO,
        diaSemana: DIAS_SEMANA[dia],
        hora: slot.hora,
        quandoBRT: formatarBRT(new Date(quandoUTC)),
        scheduledDatetime: `${dataISO} ${slot.hora}`,
        // O motivo é escrito por `cadencia.ts`, que é quem sabe se o horário é
        // rotina antiga ou novidade das últimas duas semanas — a distinção que
        // a bancada precisa mostrar para a pessoa não confundir uma coisa com a
        // outra.
        motivo: slot.motivo,
        origem: slot.origem,
        ...(slot.tema ? { temaDaGrade: slot.tema } : {}),
        ...(modeloDoDia(dia) ? { modeloSugerido: modeloDoDia(dia) } : {}),
        ...(campanhasDoSlot ? { campanhasDoDia: campanhasDoSlot } : {}),
      })
    }
  }

  await registrarEmissao(projectId, sugestoes)

  return {
    diasAnalisados: JANELA_HISTORICO_DIAS,
    postsNoHistorico: historico.length,
    cadencia,
    jaNaAgenda: futuros.length,
    sugestoes,
    avisos,
  }
}

/**
 * Quais das campanhas citadas já terminaram na data de referência.
 *
 * Leitura DEFENSIVA, no mesmo espírito de `campanha-vigencia.ts`: campanha que
 * não existe mais, campanha sem prazo e erro de consulta produzem o mesmo
 * resultado — conjunto vazio, ou seja, nenhum post descartado. O pior erro
 * possível aqui seria jogar fora histórico legítimo por causa de um metadado
 * ausente.
 */
async function campanhasEncerradas(
  projectId: number,
  ids: Array<string | null>,
  referencia: Date,
): Promise<Set<string>> {
  const alvos = Array.from(new Set(ids.filter((id): id is string => !!id)))
  if (alvos.length === 0) return new Set()
  try {
    const entradas = await db.knowledgeBaseEntry.findMany({
      where: { id: { in: alvos }, projectId, expiresAt: { not: null, lt: referencia } },
      select: { id: true },
    })
    return new Set(entradas.map((e) => e.id))
  } catch (erro) {
    console.error('[sugerir-posts] não deu para conferir a vigência das campanhas:', erro)
    return new Set()
  }
}

/**
 * Grava as propostas emitidas e carimba cada slot com o seu `sugestaoId`.
 *
 * Muta `sugestoes` de propósito — é a mesma lista que vai na resposta, e
 * copiá-la só para acrescentar um campo esconderia que o id é da linha que
 * acabou de ser gravada.
 *
 * Duas idas ao banco no melhor caso (leitura + nada a escrever) e nunca lança:
 * sugestão sem sinal continua sendo uma sugestão útil.
 */
async function registrarEmissao(projectId: number, sugestoes: SugestaoSlot[]): Promise<void> {
  if (sugestoes.length === 0) return

  const chaves = sugestoes.map((s) => chaveDoSlot(projectId, s.scheduledDatetime, versaoDoSlot(s)))
  const jaEmitidas = await sugestoesJaEmitidas(chaves)

  const novas: number[] = []
  sugestoes.forEach((s, i) => {
    const id = jaEmitidas.get(chaves[i])
    if (id) s.sugestaoId = id
    else novas.push(i)
  })
  if (novas.length === 0) return

  const ids = await registrarSugestoes(
    novas.map((i) => {
      const s = sugestoes[i]
      return {
        projectId,
        tipo: 'slot' as const,
        servico: SERVICO,
        versao: versaoDoSlot(s),
        chave: chaves[i],
        // O modelo do dia é parte da proposta: quem aceita o slot costuma
        // aceitar o modelo junto, e é isso que a F2 vai querer separar.
        pageId: s.modeloSugerido?.pageId ?? null,
        sugerido: {
          scheduledDatetime: s.scheduledDatetime,
          data: s.data,
          hora: s.hora,
          diaSemana: s.diaSemana,
          motivo: s.motivo,
          ...(s.origem ? { origem: s.origem } : {}),
          ...(s.temaDaGrade ? { temaDaGrade: s.temaDaGrade } : {}),
          ...(s.modeloSugerido ? { modeloSugerido: s.modeloSugerido } : {}),
          ...(s.campanhasDoDia ? { campanhasDoDia: s.campanhasDoDia } : {}),
        },
      }
    }),
  )
  novas.forEach((indice, n) => {
    const id = ids[n]
    if (id) sugestoes[indice].sugestaoId = id
  })
}
