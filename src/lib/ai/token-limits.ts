/**
 * Token limits configuration for AI providers
 * Helps control costs and prevent excessive usage
 *
 * NOTE: Latest OpenAI models (GPT-4.1, GPT-5.x series) support up to 1,000,000 context tokens
 * The defaults below are conservative for cost control. Increase via environment variables if needed:
 * - MAX_TOKENS_OPENAI: Max output tokens (default: 4096)
 * - MAX_CONTEXT_TOKENS_OPENAI: Max input/context tokens (default: 16000)
 *
 * Model capabilities (December 2025):
 * - GPT-5.2, GPT-5.1, GPT-5, GPT-4.1 series: 1M context tokens
 * - GPT-4o, GPT-4o-mini: 128K context tokens
 * - o1, o3, o4-mini (reasoning): Variable context based on model
 */

export const TOKEN_LIMITS = {
  // Maximum output tokens per request by provider
  maxOutputTokens: {
    openrouter: parseInt(process.env.MAX_TOKENS_OPENROUTER || '2048', 10),
    openai: parseInt(process.env.MAX_TOKENS_OPENAI || '4096', 10),
    anthropic: parseInt(process.env.MAX_TOKENS_ANTHROPIC || '4096', 10),
    google: parseInt(process.env.MAX_TOKENS_GOOGLE || '8192', 10),
    mistral: parseInt(process.env.MAX_TOKENS_MISTRAL || '4096', 10),
  },

  // Maximum context (input) tokens per request
  maxContextTokens: {
    openrouter: parseInt(process.env.MAX_CONTEXT_TOKENS_OPENROUTER || '8000', 10),
    openai: parseInt(process.env.MAX_CONTEXT_TOKENS_OPENAI || '16000', 10),
    anthropic: parseInt(process.env.MAX_CONTEXT_TOKENS_ANTHROPIC || '32000', 10),
    google: parseInt(process.env.MAX_CONTEXT_TOKENS_GOOGLE || '32000', 10),
    mistral: parseInt(process.env.MAX_CONTEXT_TOKENS_MISTRAL || '16000', 10),
  },

  // RAG context limits
  rag: {
    maxTokens: parseInt(process.env.RAG_MAX_TOKENS || '2000', 10),
    topK: parseInt(process.env.RAG_TOP_K || '5', 10),
    minScore: parseFloat(process.env.RAG_MIN_SCORE || '0.7'),
  },
} as const

export type AIProvider = keyof typeof TOKEN_LIMITS.maxOutputTokens

/**
 * Get max output tokens for a provider
 */
export function getMaxOutputTokens(provider: AIProvider): number {
  return TOKEN_LIMITS.maxOutputTokens[provider]
}

/**
 * Get max context tokens for a provider
 */
export function getMaxContextTokens(provider: AIProvider): number {
  return TOKEN_LIMITS.maxContextTokens[provider]
}

/**
 * Estimate token count (rough approximation: 4 chars ≈ 1 token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Truncate text to fit within token limit
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokens(text)

  if (estimatedTokens <= maxTokens) {
    return text
  }

  // Truncate to approximate character count
  const maxChars = maxTokens * 4
  return text.substring(0, maxChars) + '...[truncated]'
}

/**
 * Calculate total context tokens from messages
 */
export function calculateContextTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((total, msg) => total + estimateTokens(msg.content), 0)
}
