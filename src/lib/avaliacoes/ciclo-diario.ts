/**
 * O ciclo diário das avaliações do Google: coletar → propor rascunho →
 * avisar a equipe. Roda às 09h BRT (cron), a hora em que alguém pode AGIR —
 * aviso de madrugada é aviso ignorado.
 *
 * Divisão de papéis (decisão do Ciro, 30/08/2026): a IA PROPÕE a resposta,
 * a equipe EDITA e ENVIA — nada é publicado sozinho. O rascunho fica em
 * `AvaliacaoGoogle.respostaSugerida` e as negativas chegam no grupo do
 * WhatsApp JÁ com o rascunho, prontas para copiar/ajustar/publicar.
 *
 * Travas herdadas da casa:
 * - UMA mensagem por rodada, nunca uma por avaliação (lei dos avisos de falha);
 * - `avisadaEm` só grava quando a mensagem SAI (precedente reminderSentAt);
 * - falha de rascunho ou de WhatsApp nunca derruba a coleta.
 */
import { db } from '@/lib/db'
import { isEvolutionConfigured, sendWhatsAppText } from '@/lib/notifications/evolution'
import { coletarAvaliacoesViaWindsor, type ResumoColetaAvaliacoes } from '@/lib/windsor/coleta-avaliacoes'
import { sugerirRespostaDeAvaliacao } from './sugerir-resposta'

/** Teto de rascunhos por rodada — primeira rodada num backlog grande não pode virar rajada. */
const MAX_RASCUNHOS_POR_RODADA = 30
/** Negativas por mensagem de aviso — mais que isso vira parede de texto. */
const MAX_NEGATIVAS_NA_MENSAGEM = 5
/** Positiva só ganha rascunho com texto de verdade (elogio curto se responde de cabeça). */
const MIN_TEXTO_POSITIVA = 60
const SETE_DIAS_MS = 7 * 24 * 3600_000

export interface ResumoCicloAvaliacoes {
  coleta: ResumoColetaAvaliacoes
  rascunhosGerados: number
  negativasAvisadas: number
  avisoEnviado: boolean
}

export async function cicloDiarioDeAvaliacoes(opts?: {
  sinceDays?: number
  /** Default true. False: coleta sem gerar rascunho (validação barata). */
  gerarRascunhos?: boolean
  /** Default true. False: monta e IMPRIME o aviso, sem enviar nem marcar
   * `avisadaEm` — é o modo do script de validação; envio é papel do cron. */
  enviarAviso?: boolean
}): Promise<ResumoCicloAvaliacoes> {
  const coleta = await coletarAvaliacoesViaWindsor({ sinceDays: opts?.sinceDays ?? 30 })
  const resumo: ResumoCicloAvaliacoes = { coleta, rascunhosGerados: 0, negativasAvisadas: 0, avisoEnviado: false }
  if (coleta.erro || !coleta.configurado) return resumo

  const nomes = new Map(
    (await db.project.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } })).map((p) => [
      p.id,
      p.name,
    ]),
  )

  // ---- Rascunhos: negativas sem resposta (qualquer idade) primeiro, depois
  // positivas com texto dos últimos 7 dias. Nunca regerar (sugestaoGeradaEm).
  const seteDiasAtras = new Date(Date.now() - SETE_DIAS_MS)
  const candidatas = await db.avaliacaoGoogle.findMany({
    where: {
      respondidaEm: null,
      sugestaoGeradaEm: null,
      OR: [
        { estrelas: { lte: 3 } },
        { estrelas: { gte: 4 }, criadaEm: { gte: seteDiasAtras }, texto: { not: null } },
      ],
    },
    orderBy: [{ estrelas: 'asc' }, { criadaEm: 'desc' }],
    take: MAX_RASCUNHOS_POR_RODADA,
  })

  for (const a of candidatas) {
    if (a.estrelas >= 4 && (a.texto?.length ?? 0) < MIN_TEXTO_POSITIVA) continue
    if (opts?.gerarRascunhos === false) continue
    const rascunho = await sugerirRespostaDeAvaliacao({
      projectId: a.projectId,
      nomeCliente: nomes.get(a.projectId) ?? 'o restaurante',
      autor: a.autor,
      estrelas: a.estrelas,
      texto: a.texto,
    })
    // Marca a tentativa MESMO sem rascunho: avaliação que quebra o gerador
    // não pode virar chamada paga repetida toda manhã (lei da foto bloqueada
    // do catálogo).
    await db.avaliacaoGoogle.update({
      where: { id: a.id },
      data: { sugestaoGeradaEm: new Date(), ...(rascunho ? { respostaSugerida: rascunho } : {}) },
    })
    if (rascunho) resumo.rascunhosGerados++
  }

  // ---- Aviso de negativas: sem resposta, nunca avisadas.
  const negativas = await db.avaliacaoGoogle.findMany({
    where: { estrelas: { lte: 3 }, respondidaEm: null, avisadaEm: null },
    orderBy: { criadaEm: 'desc' },
  })
  if (!negativas.length) return resumo

  const dtBRT = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
  const partes = [`🔴 *${negativas.length} avaliação(ões) negativa(s) no Google sem resposta*\n`]
  for (const a of negativas.slice(0, MAX_NEGATIVAS_NA_MENSAGEM)) {
    partes.push(
      `*${nomes.get(a.projectId) ?? `projeto ${a.projectId}`}* ${'★'.repeat(a.estrelas)} — ${a.autor ?? 'anônimo'} (${dtBRT.format(a.criadaEm)})`,
    )
    if (a.texto) partes.push(`"${a.texto.replace(/\s+/g, ' ').slice(0, 160)}"`)
    if (a.respostaSugerida) partes.push(`✍️ _Rascunho pronto:_ ${a.respostaSugerida}`)
    partes.push('')
  }
  if (negativas.length > MAX_NEGATIVAS_NA_MENSAGEM)
    partes.push(`…e mais ${negativas.length - MAX_NEGATIVAS_NA_MENSAGEM}.`)
  partes.push('_Edite o rascunho antes de publicar — a resposta sai pelo Farol da Lagosta, em nome do restaurante._')
  const mensagem = partes.join('\n')

  if (opts?.enviarAviso === false) {
    console.log('[avaliacoes] (preview, sem envio) aviso que o cron mandaria:\n\n' + mensagem)
    return resumo
  }
  if (!isEvolutionConfigured()) {
    console.warn('[avaliacoes] Evolution não configurada — negativas gravadas, aviso não enviado')
    return resumo
  }

  resumo.avisoEnviado = await sendWhatsAppText(mensagem)
  if (resumo.avisoEnviado) {
    await db.avaliacaoGoogle.updateMany({
      where: { id: { in: negativas.map((n) => n.id) } },
      data: { avisadaEm: new Date() },
    })
    resumo.negativasAvisadas = negativas.length
  }
  return resumo
}
