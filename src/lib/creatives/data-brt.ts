/**
 * Datas da agenda em horário de Brasília — módulo PURO (só `CreativeError`),
 * para o contrato do agendamento por lote (`src/lib/lotes/agendamento.ts`)
 * poder normalizar o horário sem arrastar o Prisma. `agendar.ts` re-exporta
 * `parseBRT` de onde sempre esteve.
 */

import { CreativeError } from './errors'

/**
 * Aceita "YYYY-MM-DD HH:mm" em horário de Brasília (o jeito que a agenda é
 * pensada no dia a dia) ou um ISO com fuso explícito.
 */
export function parseBRT(input: string): Date {
  if (input.includes('T') && (input.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(input))) {
    return new Date(input)
  }
  const semFuso = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/.exec(input)
  if (semFuso) {
    // BRT (UTC-3) → UTC
    return new Date(`${semFuso[1]}T${semFuso[2]}:00.000-03:00`)
  }
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) {
    throw new CreativeError('DATA_INVALIDA', `Data não reconhecida: "${input}". Use "YYYY-MM-DD HH:mm" (BRT).`, 400)
  }
  return d
}

/** "dd/mm/aaaa hh:mm" em Brasília — a forma que as respostas da agenda mostram. */
export function formatarBRT(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}
