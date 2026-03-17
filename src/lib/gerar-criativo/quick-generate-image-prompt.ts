import type { ExtractedTemplateContext, TemplateFormat } from '@/lib/gerar-criativo/template-context'

interface BuildQuickGenerateImagePromptParams {
  brief: string
  format: TemplateFormat
  templateContext: ExtractedTemplateContext
  objective?: string | null
  tone?: string | null
}

function getFormatAspectRatio(format: TemplateFormat): string {
  switch (format) {
    case 'SQUARE':
      return '1:1'
    case 'FEED_PORTRAIT':
      return '4:5'
    case 'STORY':
    default:
      return '9:16'
  }
}

function getFormatGuidance(format: TemplateFormat): string {
  switch (format) {
    case 'SQUARE':
      return 'balanced square composition with clean margins for headline overlays'
    case 'FEED_PORTRAIT':
      return 'portrait feed composition with strong center subject and readable breathing room'
    case 'STORY':
    default:
      return 'vertical story composition with subject anchored in the middle-lower area and headroom for text'
  }
}

function getToneGuidance(tone?: string | null): string {
  switch (tone) {
    case 'casual':
      return 'casual, approachable, spontaneous commercial mood'
    case 'profissional':
      return 'professional, polished advertising mood'
    case 'urgente':
      return 'high-energy, conversion-focused mood with stronger contrast'
    case 'inspirador':
      return 'aspirational, emotionally engaging mood with refined lighting'
    default:
      return 'commercial social media advertising mood'
  }
}

function getObjectiveGuidance(objective?: string | null): string {
  switch (objective) {
    case 'promocao':
      return 'promotional creative that feels desirable and attention-grabbing'
    case 'institucional':
      return 'brand-led creative with credibility and clean presentation'
    case 'agenda':
      return 'event-oriented creative with clear focal hierarchy and extra negative space'
    case 'oferta':
      return 'offer-driven creative with product emphasis and simple supporting environment'
    default:
      return 'versatile social media creative'
  }
}

function getLayoutGuidance(templateContext: ExtractedTemplateContext): string {
  switch (templateContext.visualHierarchy.layoutStyle) {
    case 'hero-title':
      return 'Preserve a calm, uncluttered zone for the main headline and keep the hero subject away from that title area.'
    case 'info-dense':
      return 'Keep the scene simple and organized, with smooth surfaces and low clutter so multiple text blocks remain readable.'
    case 'minimal':
      return 'Use one strong hero subject with a clean backdrop and generous negative space.'
    case 'balanced':
    default:
      return 'Balance subject presence with clear background areas for text overlays.'
  }
}

export function buildQuickGenerateImagePrompt(
  params: BuildQuickGenerateImagePromptParams,
): string {
  const aspectRatio = getFormatAspectRatio(params.format)
  const primarySlot = params.templateContext.visualHierarchy.primarySlot
  const slotCount = params.templateContext.stats.totalSlots

  return [
    `Create a photorealistic social media image in ${aspectRatio} aspect ratio.`,
    `Brief: ${params.brief.trim()}.`,
    `Mood: ${getToneGuidance(params.tone)}.`,
    `Objective: ${getObjectiveGuidance(params.objective)}.`,
    `Composition: ${getFormatGuidance(params.format)}.`,
    `${getLayoutGuidance(params.templateContext)}`,
    `The selected template has ${slotCount} text field(s)${primarySlot ? ` with primary emphasis on ${primarySlot}` : ''}. Leave clean negative space for text overlays.`,
    'Food/product advertising style, professional art direction, realistic materials and appetizing lighting, highly detailed, commercial photography.',
    'Do not add any text, letters, labels, logo marks, pricing badges or UI elements inside the generated image.',
  ].join(' ')
}
