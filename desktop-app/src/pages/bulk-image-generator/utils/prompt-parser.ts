import { QUEUE_CONSTANTS } from '@/lib/queue/types'

/**
 * Represents a variable found in a prompt
 */
export interface PromptVariable {
  raw: string        // "{gato, cachorro}"
  options: string[]  // ["gato", "cachorro"]
  position: number   // Index in the original string
}

/**
 * Result of parsing a prompt with variables
 */
export interface ParsedPrompt {
  hasVariables: boolean
  variables: PromptVariable[]
  expandedPrompts: string[]
  combinations: number
  exceedsLimit: boolean
}

/**
 * Generate all combinations of variable options
 */
function generateCombinations(prompt: string, variables: PromptVariable[]): string[] {
  if (variables.length === 0) {
    return [prompt]
  }

  // Generate cartesian product of all variable options
  const optionSets = variables.map((v) => v.options)
  const cartesian = optionSets.reduce<string[][]>(
    (acc, options) =>
      acc.flatMap((combo) => options.map((option) => [...combo, option])),
    [[]]
  )

  // Replace variables in prompt for each combination
  return cartesian.map((combination) => {
    let result = prompt
    variables.forEach((variable, index) => {
      result = result.replace(variable.raw, combination[index])
    })
    return result
  })
}

/**
 * Parse a prompt string for variables in {option1, option2} format
 *
 * @example
 * parsePromptVariables("Um {gato, cachorro} cyberpunk em {neon, pastel}")
 * // Returns 4 expanded prompts:
 * // - "Um gato cyberpunk em neon"
 * // - "Um gato cyberpunk em pastel"
 * // - "Um cachorro cyberpunk em neon"
 * // - "Um cachorro cyberpunk em pastel"
 */
export function parsePromptVariables(prompt: string): ParsedPrompt {
  const variableRegex = /\{([^}]+)\}/g
  const variables: PromptVariable[] = []

  let match
  while ((match = variableRegex.exec(prompt)) !== null) {
    const options = match[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    // Only consider as variable if there are multiple options
    if (options.length > 1) {
      variables.push({
        raw: match[0],
        options,
        position: match.index,
      })
    }
  }

  if (variables.length === 0) {
    return {
      hasVariables: false,
      variables: [],
      expandedPrompts: [prompt],
      combinations: 1,
      exceedsLimit: false,
    }
  }

  // Calculate total combinations
  const totalCombinations = variables.reduce(
    (acc, v) => acc * v.options.length,
    1
  )

  // Check if exceeds limit
  const exceedsLimit = totalCombinations > QUEUE_CONSTANTS.MAX_COMBINATIONS

  // Generate expanded prompts (limit to MAX_COMBINATIONS)
  const expandedPrompts = exceedsLimit
    ? generateCombinations(prompt, variables).slice(0, QUEUE_CONSTANTS.MAX_COMBINATIONS)
    : generateCombinations(prompt, variables)

  return {
    hasVariables: true,
    variables,
    expandedPrompts,
    combinations: totalCombinations,
    exceedsLimit,
  }
}

/**
 * Extract variables from a prompt without expanding
 * Useful for preview UI
 */
export function extractVariables(prompt: string): PromptVariable[] {
  const variableRegex = /\{([^}]+)\}/g
  const variables: PromptVariable[] = []

  let match
  while ((match = variableRegex.exec(prompt)) !== null) {
    const options = match[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    if (options.length > 1) {
      variables.push({
        raw: match[0],
        options,
        position: match.index,
      })
    }
  }

  return variables
}

/**
 * Count the total number of combinations for a prompt
 */
export function countCombinations(prompt: string): number {
  const variables = extractVariables(prompt)
  if (variables.length === 0) return 1
  return variables.reduce((acc, v) => acc * v.options.length, 1)
}

/**
 * Validate a prompt with variables
 */
export function validatePromptVariables(prompt: string): {
  isValid: boolean
  error?: string
} {
  const combinations = countCombinations(prompt)

  if (combinations > QUEUE_CONSTANTS.MAX_COMBINATIONS) {
    return {
      isValid: false,
      error: `Maximo de ${QUEUE_CONSTANTS.MAX_COMBINATIONS} variacoes. Reduza as opcoes.`,
    }
  }

  // Check for nested braces
  if (prompt.includes('{{') || prompt.includes('}}')) {
    return {
      isValid: false,
      error: 'Chaves aninhadas nao sao suportadas.',
    }
  }

  // Check for unclosed braces
  const openCount = (prompt.match(/\{/g) || []).length
  const closeCount = (prompt.match(/\}/g) || []).length
  if (openCount !== closeCount) {
    return {
      isValid: false,
      error: 'Chaves nao balanceadas. Verifique a sintaxe.',
    }
  }

  return { isValid: true }
}

/**
 * Generate a batch name from a prompt with variables
 */
export function generateBatchName(prompt: string): string {
  const variables = extractVariables(prompt)
  if (variables.length === 0) {
    // Truncate prompt for single item
    return prompt.length > 40 ? `${prompt.slice(0, 40)}...` : prompt
  }

  // Create a descriptive name
  const firstVariableOptions = variables[0].options.slice(0, 3)
  const optionsSummary = firstVariableOptions.join(', ')
  const suffix = variables[0].options.length > 3 ? '...' : ''

  return `Variacoes: ${optionsSummary}${suffix}`
}
