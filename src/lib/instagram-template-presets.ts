type ArtFormat = 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'

export interface InstagramTemplatePreset {
  id: string
  name: string
  format: ArtFormat
  schemaVersion: number
  engineVersion: number
  templateVersion: number
  fingerprint: string
  analysisConfidence: number
  sourceImageUrl: string
  createdAt: string
  templateData: Record<string, unknown>
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function canvasByFormat(format: ArtFormat): Record<string, unknown> {
  if (format === 'STORY') {
    return {
      format: 'instagram_story',
      ratio: '9:16',
      safe_margin: 80,
      safe_area: { top: 120, bottom: 180 },
    }
  }
  if (format === 'SQUARE') {
    return {
      format: 'instagram_square',
      ratio: '1:1',
      safe_margin: 64,
      safe_area: { top: 40, bottom: 40 },
    }
  }
  return {
    format: 'instagram_feed_portrait',
    ratio: '4:5',
    safe_margin: 64,
    safe_area: { top: 40, bottom: 56 },
  }
}

function baseTemplateData(
  format: ArtFormat,
  options: {
    textZone: { x: number; width: number }
    alignment: 'left' | 'center' | 'right'
    overlayPosition: 'top' | 'bottom' | 'full'
    overlayDirection: 'top_to_bottom' | 'bottom_to_top' | 'left_to_right' | 'right_to_left'
    slotPriority: string[]
    slotDropOrder: string[]
    slots: Record<string, Record<string, unknown>>
    density?: { ideal: number; max: number }
  },
): Record<string, unknown> {
  return {
    canvas: canvasByFormat(format),
    zones: {
      text_zone: options.textZone,
    },
    layout: {
      text_alignment: options.alignment,
      visual_balance: options.alignment === 'center' ? 'balanced' : 'left_heavy',
    },
    overlay: {
      type: 'gradient',
      direction: options.overlayDirection,
      position: options.overlayPosition,
      start_color: '#000000',
      end_color: '#000000',
      opacity: 0.62,
      end_opacity: 0,
    },
    typography: {
      title_font: 'Montserrat',
      body_font: 'Montserrat',
      font_fallbacks: ['Inter', 'sans-serif'],
      scale: { xs: 18, sm: 24, md: 32, lg: 48, xl: 72 },
    },
    text_density: {
      ideal_words: options.density?.ideal ?? 20,
      max_words: options.density?.max ?? 34,
    },
    colors: {
      pre_title: '#f97316',
      title: '#ffffff',
      description: '#ffffff',
      cta: '#f97316',
      badge: '#ffffff',
      footer_info_1: '#ffffff',
      footer_info_2: '#ffffff',
    },
    default_content: {
      cta: 'SAIBA MAIS',
    },
    slot_priority: options.slotPriority,
    slot_drop_order: options.slotDropOrder,
    content_slots: options.slots,
    logo: {
      placement: 'top_center',
      anchor_offset: 16,
      min_margin: 48,
      max_size_ratio: 0.12,
    },
  }
}

function storyPreset(
  id: string,
  name: string,
  templateData: Record<string, unknown>,
): InstagramTemplatePreset {
  return {
    id,
    name,
    format: 'STORY',
    schemaVersion: 1,
    engineVersion: 1,
    templateVersion: 1,
    fingerprint: `preset-${id.toLowerCase()}-v1`,
    analysisConfidence: 0.99,
    sourceImageUrl: '',
    createdAt: '2026-03-09T00:00:00.000Z',
    templateData,
  }
}

function feedPreset(
  id: string,
  name: string,
  format: 'FEED_PORTRAIT' | 'SQUARE',
  templateData: Record<string, unknown>,
): InstagramTemplatePreset {
  return {
    id,
    name,
    format,
    schemaVersion: 1,
    engineVersion: 1,
    templateVersion: 1,
    fingerprint: `preset-${id.toLowerCase()}-v1`,
    analysisConfidence: 0.99,
    sourceImageUrl: '',
    createdAt: '2026-03-09T00:00:00.000Z',
    templateData,
  }
}

const PRESETS: Record<string, InstagramTemplatePreset> = {
  S1: storyPreset(
    'S1',
    'S1 - Centered Focus',
    baseTemplateData('STORY', {
      textZone: { x: 10, width: 80 },
      alignment: 'center',
      overlayPosition: 'bottom',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['title', 'cta', 'pre_title'],
      slotDropOrder: ['pre_title'],
      slots: {
        cta: {
          type: 'call_to_action',
          anchor: 'bottom_fixed',
          anchor_offset: 90,
          max_words: 6,
          max_lines: 2,
          max_characters_per_line: 22,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'md',
          weight: 800,
          uppercase: true,
        },
        title: {
          type: 'headline',
          anchor: 'before:cta',
          margin_bottom: 24,
          max_words: 9,
          max_lines: 3,
          max_characters_per_line: 18,
          line_break_strategy: 'balanced',
          allow_auto_scale: true,
          font_size: 'xl',
          weight: 800,
          uppercase: true,
        },
        pre_title: {
          type: 'label',
          anchor: 'before:title',
          margin_bottom: 10,
          max_words: 5,
          max_lines: 2,
          max_characters_per_line: 18,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 700,
          uppercase: true,
        },
      },
    }),
  ),
  S2: storyPreset(
    'S2',
    'S2 - Editorial Asymmetric',
    baseTemplateData('STORY', {
      textZone: { x: 8, width: 66 },
      alignment: 'left',
      overlayPosition: 'full',
      overlayDirection: 'left_to_right',
      slotPriority: ['title', 'description', 'pre_title'],
      slotDropOrder: ['pre_title', 'description'],
      slots: {
        description: {
          type: 'paragraph',
          anchor: 'bottom_fixed',
          anchor_offset: 130,
          max_words: 30,
          max_lines: 4,
          max_characters_per_line: 32,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'md',
          weight: 500,
          uppercase: false,
        },
        title: {
          type: 'headline',
          anchor: 'before:description',
          margin_bottom: 18,
          max_words: 11,
          max_lines: 4,
          max_characters_per_line: 20,
          line_break_strategy: 'balanced',
          allow_auto_scale: true,
          font_size: 'xl',
          weight: 800,
          uppercase: true,
        },
        pre_title: {
          type: 'label',
          anchor: 'before:title',
          margin_bottom: 10,
          max_words: 5,
          max_lines: 2,
          max_characters_per_line: 18,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 700,
          uppercase: true,
        },
      },
    }),
  ),
  S3: storyPreset(
    'S3',
    'S3 - Info List',
    baseTemplateData('STORY', {
      textZone: { x: 8, width: 84 },
      alignment: 'left',
      overlayPosition: 'bottom',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['title', 'description', 'footer_info_1', 'footer_info_2'],
      slotDropOrder: ['footer_info_2', 'footer_info_1', 'description'],
      slots: {
        footer_info_2: {
          type: 'footer_info',
          anchor: 'bottom_fixed',
          anchor_offset: 80,
          max_words: 10,
          max_lines: 2,
          max_characters_per_line: 30,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 500,
          uppercase: false,
        },
        footer_info_1: {
          type: 'footer_info',
          anchor: 'before:footer_info_2',
          margin_bottom: 6,
          max_words: 10,
          max_lines: 2,
          max_characters_per_line: 30,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 500,
          uppercase: false,
        },
        description: {
          type: 'paragraph',
          anchor: 'before:footer_info_1',
          margin_bottom: 16,
          max_words: 26,
          max_lines: 4,
          max_characters_per_line: 34,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 500,
          uppercase: false,
        },
        title: {
          type: 'headline',
          anchor: 'before:description',
          margin_bottom: 14,
          max_words: 9,
          max_lines: 3,
          max_characters_per_line: 18,
          line_break_strategy: 'balanced',
          allow_auto_scale: true,
          font_size: 'xl',
          weight: 800,
          uppercase: true,
        },
      },
    }),
  ),
  S4: storyPreset(
    'S4',
    'S4 - Production Tip',
    baseTemplateData('STORY', {
      textZone: { x: 8, width: 84 },
      alignment: 'left',
      overlayPosition: 'bottom',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['title', 'cta', 'description', 'badge'],
      slotDropOrder: ['badge', 'description'],
      slots: {
        cta: {
          type: 'call_to_action',
          anchor: 'bottom_fixed',
          anchor_offset: 90,
          max_words: 6,
          max_lines: 2,
          max_characters_per_line: 24,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'md',
          weight: 800,
          uppercase: true,
        },
        description: {
          type: 'paragraph',
          anchor: 'before:cta',
          margin_bottom: 14,
          max_words: 20,
          max_lines: 3,
          max_characters_per_line: 30,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 500,
          uppercase: false,
        },
        title: {
          type: 'headline',
          anchor: 'before:description',
          margin_bottom: 14,
          max_words: 10,
          max_lines: 3,
          max_characters_per_line: 20,
          line_break_strategy: 'balanced',
          allow_auto_scale: true,
          font_size: 'xl',
          weight: 800,
          uppercase: true,
        },
        badge: {
          type: 'label',
          anchor: 'before:title',
          margin_bottom: 10,
          max_words: 4,
          max_lines: 2,
          max_characters_per_line: 18,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 700,
          uppercase: true,
        },
      },
    }),
  ),
  S5: storyPreset(
    'S5',
    'S5 - Production Setup',
    baseTemplateData('STORY', {
      textZone: { x: 8, width: 84 },
      alignment: 'left',
      overlayPosition: 'bottom',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['title', 'badge', 'footer_info_1', 'footer_info_2'],
      slotDropOrder: ['footer_info_2', 'footer_info_1', 'badge'],
      slots: {
        footer_info_2: {
          type: 'footer_info',
          anchor: 'bottom_fixed',
          anchor_offset: 84,
          max_words: 10,
          max_lines: 2,
          max_characters_per_line: 30,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 500,
          uppercase: false,
        },
        footer_info_1: {
          type: 'footer_info',
          anchor: 'before:footer_info_2',
          margin_bottom: 6,
          max_words: 10,
          max_lines: 2,
          max_characters_per_line: 30,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 500,
          uppercase: false,
        },
        title: {
          type: 'headline',
          anchor: 'before:footer_info_1',
          margin_bottom: 14,
          max_words: 10,
          max_lines: 3,
          max_characters_per_line: 20,
          line_break_strategy: 'balanced',
          allow_auto_scale: true,
          font_size: 'xl',
          weight: 800,
          uppercase: true,
        },
        badge: {
          type: 'label',
          anchor: 'before:title',
          margin_bottom: 8,
          max_words: 4,
          max_lines: 2,
          max_characters_per_line: 20,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 700,
          uppercase: true,
        },
      },
    }),
  ),
  S6: storyPreset(
    'S6',
    'S6 - Final Result Promo',
    baseTemplateData('STORY', {
      textZone: { x: 10, width: 80 },
      alignment: 'center',
      overlayPosition: 'full',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['title', 'cta', 'badge'],
      slotDropOrder: ['badge'],
      slots: {
        cta: {
          type: 'call_to_action',
          anchor: 'bottom_fixed',
          anchor_offset: 86,
          max_words: 6,
          max_lines: 2,
          max_characters_per_line: 24,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'md',
          weight: 800,
          uppercase: true,
        },
        title: {
          type: 'headline',
          anchor: 'before:cta',
          margin_bottom: 18,
          max_words: 10,
          max_lines: 3,
          max_characters_per_line: 20,
          line_break_strategy: 'balanced',
          allow_auto_scale: true,
          font_size: 'xl',
          weight: 800,
          uppercase: true,
        },
        badge: {
          type: 'label',
          anchor: 'top_fixed',
          anchor_offset: 18,
          max_words: 4,
          max_lines: 2,
          max_characters_per_line: 18,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 700,
          uppercase: true,
        },
      },
    }),
  ),
  F1: feedPreset(
    'F1',
    'F1 - Product Promo',
    'FEED_PORTRAIT',
    baseTemplateData('FEED_PORTRAIT', {
      textZone: { x: 10, width: 80 },
      alignment: 'left',
      overlayPosition: 'bottom',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['badge', 'pre_title'],
      slotDropOrder: ['pre_title'],
      slots: {
        badge: {
          type: 'headline',
          anchor: 'bottom_fixed',
          anchor_offset: 86,
          max_words: 6,
          max_lines: 2,
          max_characters_per_line: 22,
          line_break_strategy: 'balanced',
          allow_auto_scale: true,
          font_size: 'xl',
          weight: 800,
          uppercase: true,
        },
        pre_title: {
          type: 'label',
          anchor: 'before:badge',
          margin_bottom: 10,
          max_words: 5,
          max_lines: 2,
          max_characters_per_line: 20,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 700,
          uppercase: true,
        },
      },
      density: { ideal: 12, max: 20 },
    }),
  ),
  F2: feedPreset(
    'F2',
    'F2 - Lifestyle Editorial',
    'FEED_PORTRAIT',
    baseTemplateData('FEED_PORTRAIT', {
      textZone: { x: 8, width: 66 },
      alignment: 'left',
      overlayPosition: 'full',
      overlayDirection: 'left_to_right',
      slotPriority: ['title', 'description'],
      slotDropOrder: ['description'],
      slots: {
        description: {
          type: 'paragraph',
          anchor: 'bottom_fixed',
          anchor_offset: 102,
          max_words: 24,
          max_lines: 3,
          max_characters_per_line: 30,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'sm',
          weight: 500,
          uppercase: false,
        },
        title: {
          type: 'headline',
          anchor: 'before:description',
          margin_bottom: 14,
          max_words: 11,
          max_lines: 3,
          max_characters_per_line: 20,
          line_break_strategy: 'balanced',
          allow_auto_scale: true,
          font_size: 'xl',
          weight: 800,
          uppercase: true,
        },
      },
      density: { ideal: 18, max: 28 },
    }),
  ),
  F3: feedPreset(
    'F3',
    'F3 - Square Minimal',
    'SQUARE',
    baseTemplateData('SQUARE', {
      textZone: { x: 12, width: 76 },
      alignment: 'left',
      overlayPosition: 'bottom',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['badge'],
      slotDropOrder: ['badge'],
      slots: {
        badge: {
          type: 'label',
          anchor: 'bottom_fixed',
          anchor_offset: 64,
          max_words: 5,
          max_lines: 2,
          max_characters_per_line: 24,
          line_break_strategy: 'natural',
          allow_auto_scale: true,
          font_size: 'md',
          weight: 700,
          uppercase: true,
        },
      },
      density: { ideal: 8, max: 14 },
    }),
  ),
}

export function getInstagramTemplatePreset(
  templateId: string,
  format?: ArtFormat | null,
): InstagramTemplatePreset | undefined {
  const normalized = templateId.trim().toUpperCase()
  const preset = PRESETS[normalized]
  if (!preset) return undefined
  if (format && preset.format !== format) return undefined
  return deepClone(preset)
}

export function listInstagramTemplatePresetsForFormat(
  format: ArtFormat,
): InstagramTemplatePreset[] {
  return Object.values(PRESETS)
    .filter((preset) => preset.format === format)
    .map((preset) => deepClone(preset))
}

