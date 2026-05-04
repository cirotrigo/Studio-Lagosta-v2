// Mapping entre o tipo do template do criativo e os tamanhos da OpenAI gpt-image-2.
// Mantém a proporção do original (STORY 9:16, FEED_PORTRAIT 4:5, SQUARE 1:1).
// Documentação: https://developers.openai.com/api/docs/guides/image-generation
// Constraints do gpt-image-2: múltiplos de 16, max 3840px, ratio max 3:1, total px 655k–8.3M.

export type ImprovementFormat = 'STORY' | 'SQUARE' | 'FEED_PORTRAIT'

export const OPENAI_INPUT_SIZE: Record<ImprovementFormat, string> = {
  // 9:16 (~0.571), múltiplo de 16. 4K (2160x3840) era ideal mas demorava
  // >100s no quality 'high', estourava o timeout. 1024x1792 mantém qualidade
  // pro upscale leve até 1080x1920.
  STORY: '1024x1792',
  // 1:1 — preço listado da OpenAI ($0.211 high), tempo previsível.
  SQUARE: '1024x1024',
  // 4:5 exato, múltiplo de 16. Upscale leve pra 1080x1350 no Sharp.
  FEED_PORTRAIT: '1024x1280',
}

export const FINAL_OUTPUT_SIZE: Record<ImprovementFormat, { width: number; height: number }> = {
  STORY: { width: 1080, height: 1920 },
  SQUARE: { width: 1080, height: 1080 },
  FEED_PORTRAIT: { width: 1080, height: 1350 },
}

interface TemplateLike {
  type?: string | null
  dimensions?: string | null
}

/**
 * Determina o formato do criativo a partir do template.
 * Prioridade: type explícito > parsing das dimensões > fallback STORY.
 */
export function inferFormatFromTemplate(template?: TemplateLike | null): ImprovementFormat {
  if (template?.type === 'STORY') return 'STORY'
  if (template?.type === 'SQUARE') return 'SQUARE'
  if (template?.type === 'FEED') return 'FEED_PORTRAIT'

  if (template?.dimensions) {
    const match = template.dimensions.match(/^(\d+)\s*x\s*(\d+)$/i)
    if (match) {
      const w = Number(match[1])
      const h = Number(match[2])
      if (w > 0 && h > 0) {
        const ratio = w / h
        if (ratio < 0.7) return 'STORY' // 9:16 ≈ 0.5625
        if (ratio > 0.95 && ratio < 1.05) return 'SQUARE'
        return 'FEED_PORTRAIT' // 4:5 = 0.8
      }
    }
  }

  return 'STORY'
}
