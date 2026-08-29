/**
 * Relatório semanal da carteira — o relógio do ciclo contínuo.
 *
 * Toda segunda de manhã, para cada cliente ativo: alcance e engajamento
 * medianos da semana que fechou contra as 8 anteriores, os melhores e piores
 * posts, aderência à cadência padrão (3 stories/dia + 3 carrosséis/semana,
 * decisão de 29/08/2026) e o resumo dos sinais de aprendizado. Grava em
 * `InstagramWeeklyReport` — a tabela existia desde a era dos webhooks
 * externos, vazia, e foi REAPROVEITADA aqui sem migration — e manda UM resumo
 * da carteira inteira no grupo do WhatsApp (nunca uma mensagem por cliente:
 * regra da casa desde os avisos de falha).
 *
 * Fontes: `InstagramFeed` (feed real da conta, inclusive posts publicados fora
 * do Studio — alimentada pelo cron diário de 28/08/2026) e
 * `SocialPost.analytics*` para stories. Cliente sem token do Instagram sai com
 * a marca "sem métricas" em vez de números falsos.
 */

import { db } from '@/lib/db'
import { isEvolutionConfigured, sendWhatsAppText } from '@/lib/notifications/evolution'

const FUSO_OFFSET_MS = 3 * 3600_000 // BRT = UTC-3, fixo (sem horário de verão desde 2019)
const SEMANA_MS = 7 * 24 * 3600_000
const META_STORIES = 21
const META_FEEDS = 3
const SEMANAS_DE_BASE = 8

export interface JanelaDaSemana {
  /** Segunda 00:00 BRT (instante UTC). */
  inicio: Date
  /** Segunda seguinte 00:00 BRT (exclusivo). */
  fim: Date
  rotulo: string
  ano: number
  numeroDaSemana: number
}

/** A última semana COMPLETA (seg–dom, em BRT) antes da referência. */
export function janelaDaSemanaAnterior(referencia: Date): JanelaDaSemana {
  const brt = new Date(referencia.getTime() - FUSO_OFFSET_MS)
  // Dia da semana em BRT, com segunda = 0
  const diaDaSemana = (brt.getUTCDay() + 6) % 7
  const meiaNoiteBrt = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate())
  const segundaDestaSemanaUtc = meiaNoiteBrt - diaDaSemana * 24 * 3600_000 + FUSO_OFFSET_MS
  const inicio = new Date(segundaDestaSemanaUtc - SEMANA_MS)
  const fim = new Date(segundaDestaSemanaUtc)

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(d)
  const ultimoDia = new Date(fim.getTime() - 24 * 3600_000)

  return {
    inicio,
    fim,
    rotulo: `${fmt(inicio)} a ${fmt(ultimoDia)}`,
    ano: numeroIso(inicio).ano,
    numeroDaSemana: numeroIso(inicio).semana,
  }
}

/** Número ISO da semana (para as colunas year/weekNumber do relatório). */
function numeroIso(data: Date): { ano: number; semana: number } {
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()))
  const dia = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dia)
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const semana = Math.ceil(((d.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7)
  return { ano: d.getUTCFullYear(), semana }
}

export function mediana(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const meio = Math.floor(s.length / 2)
  return s.length % 2 ? s[meio] : Math.round((s[meio - 1] + s[meio]) / 2)
}

function abreviar(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`
  return String(n)
}

function nota(completude: number): string {
  if (completude >= 0.95) return 'A'
  if (completude >= 0.8) return 'B'
  if (completude >= 0.6) return 'C'
  if (completude >= 0.35) return 'D'
  return 'E'
}

interface LinhaDoCliente {
  projectId: number
  nome: string
  temMetricas: boolean
  storiesPublicados: number
  feedsPublicados: number
  completude: number
  score: string
  alcanceMedianoFeed: number | null
  variacaoVsBase: number | null // fração: -0.3 = caiu 30%
  alcanceMedianoStory: number | null
  engajamentoTotalFeed: number
  melhorFeed: { mediaId: string; trecho: string; engagement: number; reach: number } | null
  piorFeed: { trecho: string; engagement: number } | null
  diasSemPost: number
  sinais: { emitidos: number; aceitos: number; editados: number; recusados: number }
  alertas: string[]
}

async function montarLinhaDoCliente(
  projeto: { id: number; name: string; instagramUsername: string | null; instagramAccessToken: string | null },
  janela: JanelaDaSemana,
): Promise<LinhaDoCliente | null> {
  const { inicio, fim } = janela
  const inicioBase = new Date(inicio.getTime() - SEMANAS_DE_BASE * SEMANA_MS)

  const [feeds, feedsBase, stories, feedsStudioSemMetrica] = await Promise.all([
    db.instagramFeed.findMany({
      where: { projectId: projeto.id, publishedAt: { gte: inicio, lt: fim } },
      select: { mediaId: true, caption: true, engagement: true, reach: true, publishedAt: true },
      orderBy: { engagement: 'desc' },
    }),
    db.instagramFeed.findMany({
      where: { projectId: projeto.id, publishedAt: { gte: inicioBase, lt: inicio } },
      select: { reach: true, engagement: true },
    }),
    db.socialPost.findMany({
      where: { projectId: projeto.id, postType: 'STORY', status: 'POSTED', sentAt: { gte: inicio, lt: fim } },
      select: { sentAt: true, analyticsReach: true },
    }),
    // Sem token, a InstagramFeed não enxerga a conta — o publicado pelo
    // Studio ainda conta volume (sem métricas).
    db.socialPost.findMany({
      where: {
        projectId: projeto.id,
        postType: { in: ['POST', 'CAROUSEL', 'REEL'] },
        status: 'POSTED',
        sentAt: { gte: inicio, lt: fim },
      },
      select: { sentAt: true },
    }),
  ])

  const temMetricas = !!projeto.instagramAccessToken
  const feedsPublicados = temMetricas ? feeds.length : feedsStudioSemMetrica.length
  const storiesPublicados = stories.length

  // Cliente sem atividade nenhuma na janela nem na base fica fora do relatório
  if (feedsPublicados === 0 && storiesPublicados === 0 && feedsBase.length === 0) return null

  const alcancesFeed = feeds.map((f) => f.reach).filter((r) => r > 0)
  const alcanceMedianoFeed = alcancesFeed.length ? mediana(alcancesFeed) : null
  const baseAlcances = feedsBase.map((f) => f.reach).filter((r) => r > 0)
  const alcanceBase = baseAlcances.length >= 2 ? mediana(baseAlcances) : null
  const variacaoVsBase =
    alcanceMedianoFeed !== null && alcanceBase ? (alcanceMedianoFeed - alcanceBase) / alcanceBase : null

  const alcancesStory = stories.map((s) => s.analyticsReach ?? 0).filter((r) => r > 0)
  const alcanceMedianoStory = alcancesStory.length >= 3 ? mediana(alcancesStory) : null

  const trecho = (c: string | null) => (c ?? '(sem legenda)').replace(/\s+/g, ' ').slice(0, 60)
  const melhor = temMetricas && feeds.length ? feeds[0] : null
  const pior = temMetricas && feeds.length > 1 ? feeds[feeds.length - 1] : null

  // Dias da semana (BRT) sem NENHUMA publicação
  const diasComPost = new Set<string>()
  const diaBrt = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(d)
      : null
  for (const s of stories) if (s.sentAt) diasComPost.add(diaBrt(s.sentAt)!)
  for (const f of feeds) diasComPost.add(diaBrt(f.publishedAt)!)
  for (const f of feedsStudioSemMetrica) if (f.sentAt) diasComPost.add(diaBrt(f.sentAt)!)
  const diasSemPost = Math.max(0, 7 - diasComPost.size)

  // Sinais de aprendizado: sugestões emitidas na semana e como terminaram
  const sinaisEmitidos = await db.learningSignal.findMany({
    where: { projectId: projeto.id, sugeridoEm: { gte: inicio, lt: fim } },
    select: { desfecho: true },
  })
  const sinais = {
    emitidos: sinaisEmitidos.length,
    aceitos: sinaisEmitidos.filter((s) => s.desfecho === 'aceita-como-veio').length,
    editados: sinaisEmitidos.filter((s) => s.desfecho === 'editada' || s.desfecho === 'trocada').length,
    recusados: sinaisEmitidos.filter((s) => s.desfecho === 'descartada').length,
  }

  const completude = (Math.min(storiesPublicados / META_STORIES, 1) + Math.min(feedsPublicados / META_FEEDS, 1)) / 2

  const alertas: string[] = []
  if (!temMetricas) alertas.push('sem token do Instagram — números da conta invisíveis')
  if (variacaoVsBase !== null && variacaoVsBase <= -0.3)
    alertas.push(`alcance de feed caiu ${Math.round(-variacaoVsBase * 100)}% vs as 8 semanas anteriores`)
  if (feedsPublicados < META_FEEDS) alertas.push(`feed abaixo da cadência (${feedsPublicados}/${META_FEEDS})`)
  if (storiesPublicados < 15) alertas.push(`stories bem abaixo da cadência (${storiesPublicados}/${META_STORIES})`)
  if (diasSemPost > 0) alertas.push(`${diasSemPost} dia(s) sem publicação nenhuma`)

  return {
    projectId: projeto.id,
    nome: projeto.name,
    temMetricas,
    storiesPublicados,
    feedsPublicados,
    completude,
    score: nota(completude),
    alcanceMedianoFeed,
    variacaoVsBase,
    alcanceMedianoStory,
    engajamentoTotalFeed: feeds.reduce((t, f) => t + f.engagement, 0),
    melhorFeed: melhor
      ? { mediaId: melhor.mediaId, trecho: trecho(melhor.caption), engagement: melhor.engagement, reach: melhor.reach }
      : null,
    piorFeed: pior ? { trecho: trecho(pior.caption), engagement: pior.engagement } : null,
    diasSemPost,
    sinais,
    alertas,
  }
}

function mensagemDaCarteira(janela: JanelaDaSemana, linhas: LinhaDoCliente[]): string {
  const partes: string[] = [`📊 *Semana ${janela.rotulo}* — relatório da carteira\n`]

  for (const l of linhas) {
    const alcance =
      l.alcanceMedianoFeed !== null
        ? `alcance feed ${abreviar(l.alcanceMedianoFeed)}${
            l.variacaoVsBase !== null
              ? ` (${l.variacaoVsBase >= 0 ? '▲' : '▼'}${Math.round(Math.abs(l.variacaoVsBase) * 100)}%)`
              : ''
          }`
        : l.temMetricas
          ? 'sem alcance medido'
          : 'sem métricas (sem token)'
    partes.push(
      `*${l.nome}* [${l.score}] — ${l.storiesPublicados}/${META_STORIES} stories · ${l.feedsPublicados}/${META_FEEDS} feed · ${alcance}`,
    )
    if (l.melhorFeed) partes.push(`  melhor: "${l.melhorFeed.trecho}" (${l.melhorFeed.engagement})`)
    for (const a of l.alertas.filter((x) => !x.startsWith('sem token'))) partes.push(`  ⚠️ ${a}`)
  }

  const semToken = linhas.filter((l) => !l.temMetricas).map((l) => l.nome)
  if (semToken.length) partes.push(`\n⚠️ Sem métricas da conta: ${semToken.join(', ')} — cadastrar o token do Instagram.`)
  partes.push('\n_Números coletados na segunda de manhã; posts do fim de semana ainda acumulam alcance._')

  return partes.join('\n')
}

export interface ResultadoRelatorio {
  semana: string
  clientes: number
  gravados: number
  enviado: boolean
  mensagem: string
}

/** Gera o relatório da última semana completa, grava e (opcionalmente) avisa. */
export async function gerarRelatorioSemanal(opts?: {
  referencia?: Date
  enviarWhatsApp?: boolean
}): Promise<ResultadoRelatorio> {
  const janela = janelaDaSemanaAnterior(opts?.referencia ?? new Date())

  const projetos = await db.project.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, instagramUsername: true, instagramAccessToken: true },
    orderBy: { id: 'asc' },
  })
  const orgs = await db.organizationProject.findMany({
    where: { projectId: { in: projetos.map((p) => p.id) } },
    select: { projectId: true, organizationId: true },
  })
  const orgDe = new Map(orgs.map((o) => [o.projectId, o.organizationId]))

  const linhas: LinhaDoCliente[] = []
  for (const p of projetos) {
    const linha = await montarLinhaDoCliente(p, janela)
    if (linha) linhas.push(linha)
  }

  let gravados = 0
  for (const l of linhas) {
    const projeto = projetos.find((p) => p.id === l.projectId)!
    try {
      await db.instagramWeeklyReport.upsert({
        where: { projectId_weekStart: { projectId: l.projectId, weekStart: janela.inicio } },
        create: {
          projectId: l.projectId,
          organizationId: orgDe.get(l.projectId) ?? null,
          username: projeto.instagramUsername ?? '',
          weekStart: janela.inicio,
          weekEnd: new Date(janela.fim.getTime() - 24 * 3600_000),
          year: janela.ano,
          weekNumber: janela.numeroDaSemana,
          feedsGoal: META_FEEDS,
          storiesGoal: META_STORIES,
          feedsPublished: l.feedsPublicados,
          storiesPublished: l.storiesPublicados,
          feedsCompletionRate: Math.min(l.feedsPublicados / META_FEEDS, 1),
          storiesCompletionRate: Math.min(l.storiesPublicados / META_STORIES, 1),
          overallCompletionRate: l.completude,
          score: l.score,
          daysWithoutPost: l.diasSemPost,
          bestPerformingFeedId: l.melhorFeed?.mediaId ?? null,
          totalEngagement: l.engajamentoTotalFeed,
          metricsJson: linhaParaJson(l),
          alerts: l.alertas.length ? l.alertas : undefined,
          generatedAt: new Date(),
        },
        update: {
          feedsPublished: l.feedsPublicados,
          storiesPublished: l.storiesPublicados,
          feedsCompletionRate: Math.min(l.feedsPublicados / META_FEEDS, 1),
          storiesCompletionRate: Math.min(l.storiesPublicados / META_STORIES, 1),
          overallCompletionRate: l.completude,
          score: l.score,
          daysWithoutPost: l.diasSemPost,
          bestPerformingFeedId: l.melhorFeed?.mediaId ?? null,
          totalEngagement: l.engajamentoTotalFeed,
          metricsJson: linhaParaJson(l),
          alerts: l.alertas.length ? l.alertas : [],
          generatedAt: new Date(),
        },
      })
      gravados++
    } catch (erro) {
      console.error(`[relatorio-semanal] falha ao gravar projeto ${l.projectId}:`, erro)
    }
  }

  const mensagem = mensagemDaCarteira(janela, linhas)
  let enviado = false
  if (opts?.enviarWhatsApp && linhas.length > 0) {
    if (isEvolutionConfigured()) {
      enviado = await sendWhatsAppText(mensagem)
    } else {
      console.warn('[relatorio-semanal] Evolution não configurada — relatório gravado, aviso não enviado')
    }
  }

  return { semana: janela.rotulo, clientes: linhas.length, gravados, enviado, mensagem }
}

function linhaParaJson(l: LinhaDoCliente) {
  return {
    temMetricas: l.temMetricas,
    alcanceMedianoFeed: l.alcanceMedianoFeed,
    variacaoVsBase: l.variacaoVsBase,
    alcanceMedianoStory: l.alcanceMedianoStory,
    melhorFeed: l.melhorFeed,
    piorFeed: l.piorFeed,
    sinais: l.sinais,
    // Honestidade da medição: colhido na segunda de manhã, o fim de semana
    // ainda acumula alcance — comparar sempre com a mesma defasagem.
    colhidoEm: new Date().toISOString(),
  }
}
