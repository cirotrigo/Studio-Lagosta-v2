/**
 * Escopo de aprendizado de um post — vocabulário compartilhado.
 *
 * O aprendizado por uso precisa separar três coisas que hoje moram juntas na
 * agenda:
 *
 * - ROTINA    — o post normal do cliente. Forma cadência e repertório.
 * - CAMPANHA  — vale para a PRÓXIMA edição daquela campanha, não para a
 *               rotina. Sem essa marca, um festival de duas semanas vira
 *               "cadência" e o sistema passa a sugerir festival toda terça.
 * - PONTUAL   — não ensina nada (aviso de feriado, mudança de horário, post
 *               de emergência).
 *
 * A regra do desenho é CAPTURAR SEMPRE, MARCAR POR ITEM, FILTRAR NA
 * AGREGAÇÃO. Um interruptor global de captura falha nos dois sentidos —
 * esquecido desligado perde sinal, que é irreversível; esquecido ligado
 * contamina — e uma leva normal mistura os três tipos, então a marca tem de
 * ser do item.
 *
 * Este módulo NÃO importa Prisma nem `@/lib/db` de propósito: ele é lido pelo
 * compositor da bancada, que é client (mesma razão de `art-direction.ts` e
 * `approval-checklist.ts`).
 */

/** Como o escopo é gravado no banco (enum `LearningScope`). */
export type EscopoAprendizado = 'ROTINA' | 'CAMPANHA' | 'PONTUAL'

/**
 * Como a decisão nasceu. Texto e não enum de banco porque o vocabulário ainda
 * se move na fase de captura (F1), quando a sugestão vira entidade.
 */
export type OrigemDecisao = 'sugerido-aceito' | 'sugerido-editado' | 'escolha-propria'

export const ESCOPO_PADRAO: EscopoAprendizado = 'ROTINA'

/** Vocabulário de gente ↔ enum do banco. Nas telas e no chat, só o de gente. */
export const ESCOPOS: Array<{
  valor: EscopoAprendizado
  rotulo: string
  ajuda: string
}> = [
  {
    valor: 'ROTINA',
    rotulo: 'Rotina',
    ajuda: 'Post normal do cliente — entra no que o sistema aprende sobre cadência e repertório.',
  },
  {
    valor: 'CAMPANHA',
    rotulo: 'Campanha',
    ajuda: 'Faz parte de uma campanha com começo e fim — aprende para a próxima edição dela, não para a rotina.',
  },
  {
    valor: 'PONTUAL',
    rotulo: 'Pontual',
    ajuda: 'Caso isolado (aviso, recado, emergência) — não deve virar padrão nem sugestão futura.',
  },
]

/** 'rotina' | 'campanha' | 'pontual' — o que aparece para a pessoa. */
export function escopoEmPortugues(escopo: EscopoAprendizado): string {
  return escopo.toLowerCase()
}

/**
 * Aceita o vocabulário de gente ("campanha") e o do banco ("CAMPANHA"), com
 * ou sem acento/caixa. Devolve `undefined` para valor desconhecido — quem
 * chama decide entre cair no padrão e recusar; nunca inventa um escopo.
 */
export function normalizarEscopo(valor: unknown): EscopoAprendizado | undefined {
  if (typeof valor !== 'string') return undefined
  const limpo = valor
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (limpo === 'ROTINA' || limpo === 'CAMPANHA' || limpo === 'PONTUAL') return limpo
  return undefined
}

/** Frase curta para o chat explicar o que a marca faz, sem jargão de banco. */
export function descricaoDoEscopo(escopo: EscopoAprendizado): string {
  return ESCOPOS.find((e) => e.valor === escopo)?.ajuda ?? ''
}
