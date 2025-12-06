/**
 * Embeddings generation using OpenAI directly (OpenRouter doesn't support embeddings)
 * Uses text-embedding-3-small model for semantic search
 */

import { embed, embedMany } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

// Use OpenAI directly for embeddings (OpenRouter doesn't support this)
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const embeddingModel = openai.textEmbeddingModel('text-embedding-3-small')

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
    model: embeddingModel as any,
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
    model: embeddingModel as any,
    values: validTexts,
  })

  return embeddings
}
