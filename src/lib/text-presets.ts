/**
 * Text Presets - Presets de texto profissionais para Konva.js
 *
 * Sistema de presets com múltiplos elementos tipográficos
 * para criar layouts de texto rapidamente
 */

export interface TextPresetElement {
  id: string
  label: string
  text: string
  x: number
  y: number
  fontSize: number
  fontFamily: string
  fontStyle?: 'normal' | 'italic' | 'bold'
  fontWeight?: string | number
  fill: string
  align: 'left' | 'center' | 'right'
  lineHeight: number
  letterSpacing: number
  width: number
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize'
  background?: {
    fill: string
    cornerRadius: number
    padding: number
  }
}

export interface TextPreset {
  id: string
  name: string
  description: string
  icon: string
  category: 'hero' | 'header' | 'section' | 'cta' | 'custom'
  elements: TextPresetElement[]
  spacing: number
  alignment: 'left' | 'center' | 'right'
  isCustom?: boolean
}

/**
 * Presets profissionais pré-definidos
 */
export const TEXT_PRESETS: Record<string, TextPreset> = {
  heroSection: {
    id: 'heroSection',
    name: 'Título e Subtítulo',
    description: 'Para seções hero e destaques principais',
    icon: '🎯',
    category: 'hero',
    elements: [
      {
        id: 'title',
        label: 'Título',
        text: 'Seu Título Impactante',
        x: 0,
        y: 0,
        fontSize: 72,
        fontFamily: 'Montserrat',
        fontWeight: 'bold',
        fill: '#FFFFFF',
        align: 'center',
        lineHeight: 1.2,
        letterSpacing: -1,
        width: 800,
      },
      {
        id: 'subtitle',
        label: 'Subtítulo',
        text: 'Um subtítulo elegante e descritivo',
        x: 0,
        y: 100,
        fontSize: 32,
        fontFamily: 'Montserrat',
        fontStyle: 'normal',
        fill: '#FFFFFF',
        align: 'center',
        lineHeight: 1.4,
        letterSpacing: 0,
        width: 800,
      },
    ],
    spacing: 20,
    alignment: 'center',
  },

  completeHeader: {
    id: 'completeHeader',
    name: 'Pré-título, Título e Descrição',
    description: 'Header completo com hierarquia visual',
    icon: '📰',
    category: 'header',
    elements: [
      {
        id: 'pretitle',
        label: 'Pré-título',
        text: 'PRÉ-TÍTULO',
        x: 0,
        y: 0,
        fontSize: 16,
        fontFamily: 'Montserrat',
        fontWeight: 'bold',
        fill: '#FFFFFF',
        align: 'left',
        lineHeight: 1.5,
        letterSpacing: 2,
        textTransform: 'uppercase',
        width: 700,
      },
      {
        id: 'title',
        label: 'Título',
        text: 'Título Principal da Seção',
        x: 0,
        y: 40,
        fontSize: 56,
        fontFamily: 'Montserrat',
        fontWeight: 'bold',
        fill: '#FFFFFF',
        align: 'left',
        lineHeight: 1.3,
        letterSpacing: -0.5,
        width: 700,
      },
      {
        id: 'description',
        label: 'Descrição',
        text: 'Uma descrição detalhada que complementa o título e fornece contexto adicional para o leitor.',
        x: 0,
        y: 160,
        fontSize: 20,
        fontFamily: 'Montserrat',
        fontStyle: 'normal',
        fill: '#FFFFFF',
        align: 'left',
        lineHeight: 1.6,
        letterSpacing: 0,
        width: 700,
      },
    ],
    spacing: 15,
    alignment: 'left',
  },

  simpleSection: {
    id: 'simpleSection',
    name: 'Título e Descrição',
    description: 'Para seções de conteúdo simples',
    icon: '📝',
    category: 'section',
    elements: [
      {
        id: 'title',
        label: 'Título',
        text: 'Título da Seção',
        x: 0,
        y: 0,
        fontSize: 48,
        fontFamily: 'Montserrat',
        fontWeight: 'bold',
        fill: '#FFFFFF',
        align: 'center',
        lineHeight: 1.3,
        letterSpacing: -0.5,
        width: 600,
      },
      {
        id: 'description',
        label: 'Descrição',
        text: 'Descrição clara e concisa que explica o conteúdo desta seção.',
        x: 0,
        y: 80,
        fontSize: 22,
        fontFamily: 'Montserrat',
        fontStyle: 'normal',
        fill: '#FFFFFF',
        align: 'center',
        lineHeight: 1.5,
        letterSpacing: 0,
        width: 600,
      },
    ],
    spacing: 20,
    alignment: 'center',
  },

  footerCTA: {
    id: 'footerCTA',
    name: 'Rodapé e CTA',
    description: 'Call to action com texto de rodapé',
    icon: '🚀',
    category: 'cta',
    elements: [
      {
        id: 'cta',
        label: 'Call to Action',
        text: 'Comece Agora Gratuitamente',
        x: 0,
        y: 0,
        fontSize: 42,
        fontFamily: 'Montserrat',
        fontWeight: 'bold',
        fill: '#ffffff',
        align: 'center',
        lineHeight: 1.2,
        letterSpacing: 0,
        width: 500,
        background: {
          fill: '#e74c3c',
          cornerRadius: 8,
          padding: 20,
        },
      },
      {
        id: 'footer',
        label: 'Rodapé',
        text: 'Sem cartão de crédito • Cancele quando quiser',
        x: 0,
        y: 100,
        fontSize: 16,
        fontFamily: 'Montserrat',
        fontStyle: 'normal',
        fill: '#FFFFFF',
        align: 'center',
        lineHeight: 1.4,
        letterSpacing: 0.5,
        width: 500,
      },
    ],
    spacing: 15,
    alignment: 'center',
  },
}

/**
 * Helper para calcular altura de texto
 */
export function calculateTextHeight(element: TextPresetElement): number {
  const lines = element.text.split('\n').length
  return element.fontSize * element.lineHeight * lines
}

/**
 * Helper para aplicar text transform
 */
export function applyTextTransform(text: string, transform?: string): string {
  if (!transform) return text

  switch (transform) {
    case 'uppercase':
      return text.toUpperCase()
    case 'lowercase':
      return text.toLowerCase()
    case 'capitalize':
      return text
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
    default:
      return text
  }
}

/**
 * Deep clone de preset
 */
export function clonePreset(preset: TextPreset): TextPreset {
  return JSON.parse(JSON.stringify(preset))
}
