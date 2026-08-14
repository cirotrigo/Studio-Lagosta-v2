/**
 * Caixa dos TÍTULOS nas artes geradas por IA.
 *
 * Até 14/08/2026 o TYPOGRAPHY LOCK (`buildTypographyLock`) e o Brand Reference
 * Card cravavam "caixa alta" para TODO projeto — e o lock vence até a copy
 * verbatim, porque a conferência de texto normaliza para uppercase antes de
 * comparar e não enxerga a troca de caixa. Marca cujo DNA pede Title Case
 * (Real Gelateria) saía sempre em caps, com o DNA dizendo o contrário.
 *
 * A escolha vive na coluna `Project.titleTextCase` — TEXT e não enum do
 * Postgres (precedente de `LearningSignal.tipo` e `SocialPost.origem`); a
 * validação mora aqui. Módulo SEM dependências porque o painel da aba Marca é
 * client — mesma razão de `art-direction.ts` e `learning-scope.ts`.
 */

export const TITLE_TEXT_CASES = ['caixa-alta', 'title-case', 'como-escrito'] as const

export type TitleTextCase = (typeof TITLE_TEXT_CASES)[number]

/** Nulo e valor desconhecido caem aqui — o comportamento histórico de todo projeto. */
export const DEFAULT_TITLE_TEXT_CASE: TitleTextCase = 'caixa-alta'

export function normalizeTitleTextCase(value: string | null | undefined): TitleTextCase {
  return (TITLE_TEXT_CASES as readonly string[]).includes(value ?? '')
    ? (value as TitleTextCase)
    : DEFAULT_TITLE_TEXT_CASE
}

/** Rótulos da UI — vocabulário de quem cuida do Instagram, nunca o valor cru. */
export const TITLE_TEXT_CASE_LABELS: Record<TitleTextCase, string> = {
  'caixa-alta': 'Caixa alta (padrão)',
  'title-case': 'Iniciais maiúsculas (Title Case)',
  'como-escrito': 'Como a copy foi escrita',
}

export const TITLE_TEXT_CASE_DESCRIPTIONS: Record<TitleTextCase, string> = {
  'caixa-alta': 'Todo título sai em maiúsculas, como sempre foi.',
  'title-case': 'Cada palavra principal com inicial maiúscula — nunca o título inteiro em maiúsculas.',
  'como-escrito': 'A arte respeita a caixa exata em que o título foi digitado.',
}
