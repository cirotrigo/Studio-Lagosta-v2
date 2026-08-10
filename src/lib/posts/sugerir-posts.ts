/**
 * Sugestão de posts pela CADÊNCIA HISTÓRICA do cliente.
 *
 * Nada de configuração nova: o ritmo é lido do que o cliente efetivamente
 * publica (POSTED) ou armou (SCHEDULED) nas últimas semanas — dia da semana ×
 * horário, em fuso de Brasília. Os buracos dos próximos dias viram sugestões,
 * cada uma com o motivo ("você costuma postar domingo ~11:30 — 3 das últimas
 * 4 semanas"), o modelo do cliente tagueado para aquele dia (quando existe) e
 * as campanhas da base que citam o dia ("Quinta do Vinho — toda quinta").
 *
 * Quem escreve a copy é o assistente na conversa; aqui é só o esqueleto de
 * quando/o quê — determinístico e barato.
 */
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { formatarBRT } from '@/lib/posts/agenda-acoes'
import { DIAS_SEMANA, casaComDia, normalizar } from '@/lib/posts/dia-semana'
import { vigenteEm, estaVigente } from '@/lib/knowledge/vigencia'

const JANELA_HISTORICO_DIAS = 56
/** Slot ocupado se já existe post a menos de 45min dele. */
const TOLERANCIA_SLOT_MIN = 45
/** Horários agregados em blocos de 30min para achar o padrão. */
const BLOCO_MIN = 30

interface SlotTipico {
  minutosDoDia: number
  hora: string
  ocorrencias: number
  semanasObservadas: number
}

export interface SugestaoSlot {
  data: string
  diaSemana: string
  hora: string
  quandoBRT: string
  /** "YYYY-MM-DD HH:mm" pronto para colocar-na-agenda. */
  scheduledDatetime: string
  motivo: string
  modeloSugerido?: { pageId: string; nome: string; template: string; temas: string[] }
  campanhasDoDia?: string[]
}

export interface SugerirPostsResult {
  diasAnalisados: number
  postsNoHistorico: number
  cadencia: Array<{ diaSemana: string; horariosTipicos: string[]; postsPorSemana: number }>
  jaNaAgenda: number
  sugestoes: SugestaoSlot[]
  avisos: string[]
}

/** Date → componentes em BRT (UTC-3, sem DST desde 2019). */
function emBRT(d: Date): { dia: number; minutos: number; dataISO: string } {
  const brt = new Date(d.getTime() - 3 * 3600_000)
  return {
    dia: brt.getUTCDay(),
    minutos: brt.getUTCHours() * 60 + brt.getUTCMinutes(),
    dataISO: brt.toISOString().slice(0, 10),
  }
}

function horaLabel(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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
        status: { in: ['POSTED', 'SCHEDULED'] },
        scheduledDatetime: { gte: inicioHistorico, lte: agora },
        // Post marcado como PONTUAL não ensina cadência: um aviso de feriado
        // às 9h de uma terça não pode virar "o cliente costuma postar terça
        // às 9h". CAMPANHA continua contando aqui — separar o sub-perfil da
        // campanha é da fase de destilação.
        learningScope: { not: 'PONTUAL' },
      },
      select: { scheduledDatetime: true },
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
  const porDia = new Map<number, { blocos: Map<number, number>; datas: Set<string> }>()
  for (const post of historico) {
    if (!post.scheduledDatetime) continue
    const { dia, minutos, dataISO } = emBRT(post.scheduledDatetime)
    const cur = porDia.get(dia) ?? { blocos: new Map(), datas: new Set() }
    const bloco = Math.round(minutos / BLOCO_MIN) * BLOCO_MIN
    cur.blocos.set(bloco, (cur.blocos.get(bloco) ?? 0) + 1)
    cur.datas.add(dataISO)
    porDia.set(dia, cur)
  }

  const semanasNaJanela = Math.max(1, Math.round(JANELA_HISTORICO_DIAS / 7))
  const slotsPorDia = new Map<number, SlotTipico[]>()
  const cadencia: SugerirPostsResult['cadencia'] = []
  for (let dia = 0; dia < 7; dia++) {
    const info = porDia.get(dia)
    if (!info || info.datas.size === 0) continue
    const postsPorSemana = info.datas.size === 0 ? 0 : Math.round(([...info.blocos.values()].reduce((a, b) => a + b, 0) / semanasNaJanela) * 10) / 10
    // Slot típico: apareceu em pelo menos 2 semanas distintas (ou metade delas)
    const minimo = Math.max(2, Math.ceil(info.datas.size / 2))
    const tipicos = [...info.blocos.entries()]
      .filter(([, n]) => n >= minimo)
      .sort((a, b) => a[0] - b[0])
      .map(([minutos, n]) => ({
        minutosDoDia: minutos,
        hora: horaLabel(minutos),
        ocorrencias: n,
        semanasObservadas: info.datas.size,
      }))
    if (tipicos.length > 0) {
      slotsPorDia.set(dia, tipicos)
      cadencia.push({
        diaSemana: DIAS_SEMANA[dia],
        horariosTipicos: tipicos.map((t) => t.hora),
        postsPorSemana,
      })
    }
  }

  if (historico.length < 5) {
    avisos.push(
      `Histórico curto (${historico.length} posts nas últimas ${semanasNaJanela} semanas) — as sugestões ficam melhores conforme o cliente publica.`,
    )
  }

  // ── Modelos por dia e campanhas que citam o dia ──────────────────────────
  const [modelos, campanhas] = await Promise.all([
    db.page.findMany({
      where: { isTemplate: true, Template: { projectId } },
      select: { id: true, name: true, tags: true, Template: { select: { name: true, tags: true } } },
    }),
    db.knowledgeBaseEntry.findMany({
      // Campanha já vencida nunca é tema de post novo. O corte fino é por
      // slot, logo abaixo — aqui só se poda o que já morreu.
      where: { projectId, status: 'ACTIVE', category: 'CAMPANHAS', ...vigenteEm(agora) },
      select: { title: true, content: true, expiresAt: true },
    }),
  ])

  const modeloDoDia = (dia: number) => {
    const achado = modelos.find((m) =>
      casaComDia([m.name, m.Template.name, ...(m.tags ?? []), ...(m.Template.tags ?? [])], dia),
    )
    return achado
      ? {
          pageId: achado.id,
          nome: achado.name,
          template: achado.Template.name,
          temas: Array.from(new Set([...(achado.tags ?? []), ...(achado.Template.tags ?? [])])),
        }
      : undefined
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
    const tipicos = slotsPorDia.get(dia)
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
        motivo: `costuma postar ${DIAS_SEMANA[dia]} por volta das ${slot.hora} (${slot.ocorrencias}x nas últimas ${slot.semanasObservadas} ${slot.semanasObservadas === 1 ? 'ocasião' : 'ocasiões'})`,
        ...(modeloDoDia(dia) ? { modeloSugerido: modeloDoDia(dia) } : {}),
        ...(campanhasDoSlot ? { campanhasDoDia: campanhasDoSlot } : {}),
      })
    }
  }

  return {
    diasAnalisados: JANELA_HISTORICO_DIAS,
    postsNoHistorico: historico.length,
    cadencia,
    jaNaAgenda: futuros.length,
    sugestoes,
    avisos,
  }
}
