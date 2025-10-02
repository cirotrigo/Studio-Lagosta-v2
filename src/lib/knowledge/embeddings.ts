/**
 * Embeddings generation using OpenRouter via Vercel AI SDK
 * Uses text-embedding-3-small model for semantic search
 */

import { embed, embedMany } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

// OpenRouter client configured like the chat route
const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

/**
 * Generate a single embedding vector
 * @param text Text to embed
 * @returns 1536-dimensional embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text.trim()) {
    throw new Error('Text cannot be empty for embedding generation')
  }

  const { embedding } = await embed({
    model: openrouter.embedding('openai/text-embedding-3-small'),
    value: text,
  })

  return embedding
}

/**
 * Generate multiple embeddings in batch
 * More efficient than calling generateEmbedding in a loop
 * @param texts Array of texts to embed
 * @returns Array of 1536-dimensional embedding vectors
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return []
  }

  const validTexts = texts.filter(t => t.trim())
  if (validTexts.length === 0) {
    throw new Error('At least one non-empty text is required')
  }

  const { embeddings } = await embedMany({
    model: openrouter.embedding('openai/text-embedding-3-small'),
    values: validTexts,
  })

  return embeddings
}
