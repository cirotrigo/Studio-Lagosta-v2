/**
 * Document chunking utilities for TXT and Markdown files
 * Splits content into overlapping chunks for better context preservation
 */

/**
 * Simple token estimation (4 chars ≈ 1 token)
 * For more accuracy, use tiktoken library, but this is sufficient for chunking
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface Chunk {
  ordinal: number
  content: string
  tokens: number
}

/**
 * Split text into chunks with overlap
 * @param content Text content to chunk
 * @param options Chunking configuration
 * @returns Array of chunks with ordinal numbers
 */
export function chunkText(
  content: string,
  options: {
    chunkSize?: number
    overlap?: number
  } = {}
): Chunk[] {
  const {
    chunkSize = parseInt(process.env.RAG_CHUNK_SIZE || '600', 10),
    overlap = parseInt(process.env.RAG_CHUNK_OVERLAP || '100', 10),
  } = options

  if (!content.trim()) {
    return []
  }

  // Clean and normalize content
  const normalized = content
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
    .trim()

  // Split by paragraphs first for better context boundaries
  const paragraphs = normalized.split(/\n\n+/)

  const chunks: Chunk[] = []
  let currentChunk = ''
  let currentTokens = 0
  let ordinal = 0

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph)

    // If single paragraph exceeds chunk size, split by sentences
    if (paragraphTokens > chunkSize) {
      // Save current chunk if exists
      if (currentChunk.trim()) {
        chunks.push({
          ordinal: ordinal++,
          content: currentChunk.trim(),
          tokens: currentTokens,
        })
        currentChunk = ''
        currentTokens = 0
      }

      // Split large paragraph by sentences
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph]

      for (const sentence of sentences) {
        const sentenceTokens = estimateTokens(sentence)

        if (currentTokens + sentenceTokens > chunkSize) {
          if (currentChunk.trim()) {
            chunks.push({
              ordinal: ordinal++,
              content: currentChunk.trim(),
              tokens: currentTokens,
            })

            // Add overlap from previous chunk
            const words = currentChunk.split(/\s+/)
            const overlapWords = words.slice(-Math.floor(overlap / 4))
            currentChunk = overlapWords.join(' ') + ' '
            currentTokens = estimateTokens(currentChunk)
          }
        }

        currentChunk += sentence + ' '
        currentTokens += sentenceTokens
      }

      continue
    }

    // Check if adding paragraph exceeds chunk size
    if (currentTokens + paragraphTokens > chunkSize) {
      // Save current chunk
      chunks.push({
        ordinal: ordinal++,
        content: currentChunk.trim(),
        tokens: currentTokens,
      })

      // Start new chunk with overlap
      const words = currentChunk.split(/\s+/)
      const overlapWords = words.slice(-Math.floor(overlap / 4))
      currentChunk = overlapWords.join(' ') + '\n\n' + paragraph + '\n\n'
      currentTokens = estimateTokens(currentChunk)
    } else {
      currentChunk += paragraph + '\n\n'
      currentTokens += paragraphTokens
    }
  }

  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push({
      ordinal: ordinal++,
      content: currentChunk.trim(),
      tokens: currentTokens,
    })
  }

  return chunks
}

/**
 * Parse TXT file content
 * @param content Raw file content
 * @returns Parsed text
 */
export function parseTxtContent(content: string): string {
  return content.trim()
}

/**
 * Parse Markdown file content
 * Preserves markdown structure but removes excessive formatting for better embeddings
 * @param content Raw markdown content
 * @returns Parsed text
 */
export function parseMarkdownContent(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '[code block]') // Replace code blocks
    .replace(/`([^`]+)`/g, '$1') // Remove inline code formatting
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[image: $1]') // Replace images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove link formatting, keep text
    .replace(/^#{1,6}\s+/gm, '') // Remove heading markers
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // Remove bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // Remove italic
    .replace(/~~(.*?)~~/g, '$1') // Remove strikethrough
    .trim()
}

/**
 * Determine file type and parse accordingly
 * @param filename File name with extension
 * @param content Raw file content
 * @returns Parsed text content
 */
export function parseFileContent(filename: string, content: string): string {
  const ext = filename.toLowerCase().split('.').pop()

  switch (ext) {
    case 'md':
    case 'markdown':
      return parseMarkdownContent(content)
    case 'txt':
    case 'text':
      return parseTxtContent(content)
    default:
      throw new Error(`Unsupported file type: ${ext}. Only TXT and MD files are supported.`)
  }
}
