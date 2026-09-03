/**
 * A PASTA onde uma peça composta mora na aba de templates (03/09/2026).
 *
 * Regra combinada com o Ciro: a peça vai para o template da SEMANA a que ela
 * pertence — pela data prevista de publicação, não pela leva que a criou.
 * Pedido de uma arte só, só a sexta, ou a semana inteira caem no mesmo lugar.
 * Sem data, a peça vai para "Avulsas · <mês>", e ao ganhar data no
 * agendamento é movida para a semana (`moverPaginaParaSemana`).
 *
 * Módulo PURO: datas em BRT, nomes em português. Semana começa na segunda.
 */

import type { Formato } from './spec'

export const CATEGORIA_PROGRAMACAO = 'programacao'
export const CATEGORIA_AVULSAS = 'avulsas'

const FUSO = 'America/Sao_Paulo'
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Partes da data em BRT. */
export function emBrasilia(data: Date): { ano: number; mes: number; dia: number; diaDaSemana: number; hora: number; minuto: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short' })
  const p = Object.fromEntries(f.formatToParts(data).map((x) => [x.type, x.value]))
  const semana = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday as string] ?? 0
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), diaDaSemana: semana, hora: Number(p.hour) % 24, minuto: Number(p.minute) }
}

export interface Semana {
  /** `AAAA-MM-DD` da segunda-feira, em BRT — a chave estável. */
  chave: string
  /** "Semana 8 a 14/09" — o nome do template. */
  nome: string
  inicio: { ano: number; mes: number; dia: number }
  fim: { ano: number; mes: number; dia: number }
}

function somarDias(ano: number, mes: number, dia: number, n: number) {
  const d = new Date(Date.UTC(ano, mes - 1, dia + n))
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() }
}

const dd = (n: number) => String(n).padStart(2, '0')

/** A semana (segunda a domingo, BRT) de uma data. */
export function semanaDe(data: Date): Semana {
  const b = emBrasilia(data)
  const recuo = (b.diaDaSemana + 6) % 7 // segunda = 0
  const inicio = somarDias(b.ano, b.mes, b.dia, -recuo)
  const fim = somarDias(inicio.ano, inicio.mes, inicio.dia, 6)
  const nome =
    inicio.mes === fim.mes
      ? `Semana ${inicio.dia} a ${fim.dia}/${dd(fim.mes)}`
      : `Semana ${inicio.dia}/${dd(inicio.mes)} a ${fim.dia}/${dd(fim.mes)}`
  return { chave: `${inicio.ano}-${dd(inicio.mes)}-${dd(inicio.dia)}`, nome, inicio, fim }
}

export interface PastaDaPeca {
  categoria: typeof CATEGORIA_PROGRAMACAO | typeof CATEGORIA_AVULSAS
  nome: string
  /** Tag que identifica a pasta de forma estável (a chave da semana ou do mês). */
  chave: string
  tags: string[]
}

/** Lê `quando` (ISO ou Date). Inválido = sem data. */
export function dataDe(quando: string | Date | null | undefined): Date | null {
  if (!quando) return null
  const d = quando instanceof Date ? quando : new Date(quando)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Onde a peça mora: a semana da data, ou as avulsas do mês. */
export function pastaDaPeca(quando: string | Date | null | undefined, agora: Date = new Date()): PastaDaPeca {
  const data = dataDe(quando)
  if (data) {
    const s = semanaDe(data)
    return { categoria: CATEGORIA_PROGRAMACAO, nome: s.nome, chave: `semana:${s.chave}`, tags: [CATEGORIA_PROGRAMACAO, `semana:${s.chave}`] }
  }
  const b = emBrasilia(agora)
  const chave = `mes:${b.ano}-${dd(b.mes)}`
  return { categoria: CATEGORIA_AVULSAS, nome: `Avulsas · ${MESES[b.mes - 1]}`, chave, tags: [CATEGORIA_AVULSAS, chave] }
}

const ROTULO_DO_FORMATO: Record<Formato, string> = { story: 'story', feed: 'feed', quadrado: 'quadrado' }

/** "Ter 09:00 · story · Happy hour" — o nome da página dentro da pasta. */
export function nomeDaPagina(args: { quando?: string | Date | null; formato: Formato; tema?: string | null; nome?: string | null }): string {
  const data = dataDe(args.quando)
  const partes: string[] = []
  if (data) {
    const b = emBrasilia(data)
    partes.push(`${DIAS[b.diaDaSemana]} ${dd(b.hora)}:${dd(b.minuto)}`)
  }
  partes.push(ROTULO_DO_FORMATO[args.formato])
  const assunto = (args.tema ?? args.nome ?? '').trim()
  if (assunto) partes.push(assunto.slice(0, 60))
  return partes.join(' · ')
}
