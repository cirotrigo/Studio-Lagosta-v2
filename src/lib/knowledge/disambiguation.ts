/**
 * Disambiguation handler for training mode
 * Handles user selection when multiple similar entries are found
 */

import type { TrainingPreview, MatchType } from './training-pipeline'
import type { SimilarEntryMatch } from './find-similar-entries'

export interface DisambiguationState {
  operation: TrainingPreview['operation']
  category: TrainingPreview['category']
  title: string
  content: string
  tags: string[]
  metadata?: Record<string, unknown>
  matches: SimilarEntryMatch[]
}

/**
 * Detecta se a mensagem do usuário é uma resposta de disambiguação
 * @param userMessage - Mensagem do usuário
 * @returns true se for uma resposta de disambiguação válida
 */
export function isDisambiguationResponse(userMessage: string): boolean {
  const trimmed = userMessage.trim().toLowerCase()

  // Aceita números de 1 a 9
  if (/^[1-9]$/.test(trimmed)) {
    return true
  }

  // Aceita variações de "cancelar"
  const cancelPatterns = ['cancelar', 'cancelar.', 'cancela', 'cancel', 'sair', 'voltar', 'não', 'nao']
  return cancelPatterns.some(pattern => trimmed.startsWith(pattern))
}

/**
 * Processa a resposta de disambiguação do usuário
 * @param userMessage - Mensagem do usuário (ex: "1", "2", "cancelar")
 * @param state - Estado de disambiguação armazenado
 * @returns Preview completo ou null (se cancelado)
 */
export function handleDisambiguationChoice(
  userMessage: string,
  state: DisambiguationState
): TrainingPreview | null {
  const trimmed = userMessage.trim().toLowerCase()

  // Verificar se é cancelamento
  const cancelPatterns = ['cancelar', 'cancelar.', 'cancela', 'cancel', 'sair', 'voltar', 'não', 'nao']
  if (cancelPatterns.some(pattern => trimmed.startsWith(pattern))) {
    return null // Usuário cancelou
  }

  // Parsear escolha numérica
  const choice = parseInt(trimmed, 10)

  if (isNaN(choice) || choice < 1 || choice > state.matches.length) {
    throw new Error(`Escolha inválida. Digite um número entre 1 e ${state.matches.length}, ou "cancelar".`)
  }

  // Selecionar a entrada correspondente
  const selectedMatch = state.matches[choice - 1]

  if (!selectedMatch) {
    throw new Error('Opção não encontrada.')
  }

  // Retornar preview completo com targetEntryId
  return {
    operation: state.operation,
    category: state.category,
    title: state.title,
    content: state.content,
    tags: state.tags,
    metadata: state.metadata,
    targetEntryId: selectedMatch.entryId,
    matchType: 'single', // Agora é single porque usuário escolheu
    matches: [selectedMatch],
  }
}

/**
 * Formata a mensagem de disambiguação para múltiplos matches
 * @param preview - Preview com múltiplos matches
 * @returns Mensagem formatada para o usuário
 */
export function formatDisambiguationMessage(preview: TrainingPreview): string {
  if (!preview.matches || preview.matches.length === 0) {
    return ''
  }

  const operationEmojis: Record<TrainingPreview['operation'], string> = {
    CREATE: '📝',
    UPDATE: '✏️',
    REPLACE: '🔄',
    DELETE: '🗑️',
  }

  const emoji = operationEmojis[preview.operation]

  let message = `⚠️ **Múltiplas entradas similares encontradas**\n\n`
  message += `Para qual delas você quer aplicar a operação **${emoji} ${preview.operation}**?\n\n`

  preview.matches.forEach((match, index) => {
    const scorePercent = Math.round(match.score * 100)
    message += `**${index + 1}.** ${match.title} _(${scorePercent}% similar)_\n`
    message += `   ${match.content.substring(0, 100)}${match.content.length > 100 ? '...' : ''}\n\n`
  })

  message += `\n💬 Digite o **número da opção** (1-${preview.matches.length}) ou **"cancelar"**.`

  return message
}

/**
 * Armazena o estado de disambiguação na conversa
 * Usa o metadata da última mensagem do assistente
 */
export function createDisambiguationState(preview: TrainingPreview): DisambiguationState {
  if (!preview.matches || preview.matches.length === 0) {
    throw new Error('Preview must have matches to create disambiguation state')
  }

  return {
    operation: preview.operation,
    category: preview.category,
    title: preview.title,
    content: preview.content,
    tags: preview.tags,
    metadata: preview.metadata,
    matches: preview.matches,
  }
}

/**
 * Extrai o estado de disambiguação de uma mensagem anterior
 * @param lastAssistantMessage - Última mensagem do assistente
 * @returns Estado de disambiguação ou null
 */
export function extractDisambiguationState(
  metadata: Record<string, unknown> | undefined
): DisambiguationState | null {
  if (!metadata || !metadata.disambiguationState) {
    return null
  }

  const state = metadata.disambiguationState as DisambiguationState

  // Validar estrutura
  if (!state.matches || !Array.isArray(state.matches) || state.matches.length === 0) {
    return null
  }

  return state
}
