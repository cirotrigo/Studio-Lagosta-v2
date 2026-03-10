import { ArtFormat } from '@/stores/generation.store'

interface TemplatePreset {
  id: string
  name: string
  format: ArtFormat
  fingerprint: string
  analysisConfidence: number
  templateData: Record<string, unknown>
}

type SlotType = 'headline' | 'label' | 'paragraph' | 'call_to_action' | 'footer_info'

interface SlotOptions {
  type: SlotType
  anchor: string
  fontSize: 'sm' | 'md' | 'lg' | 'xl'
  maxWords: number
  maxLines: number
  maxCharsPerLine: number
  weight?: number
  uppercase?: boolean
  marginTop?: number
  marginBottom?: number
  anchorOffset?: number
}

function buildSlot(options: SlotOptions): Record<string, unknown> {
  return {
    type: options.type,
    anchor: options.anchor,
    font_size: options.fontSize,
    max_words: options.maxWords,
    max_lines: options.maxLines,
    max_characters_per_line: options.maxCharsPerLine,
    weight: options.weight ?? (options.type === 'headline' ? 800 : options.type === 'label' ? 700 : 500),
    uppercase: options.uppercase ?? (options.type === 'headline' || options.type === 'label' || options.type === 'call_to_action'),
    line_break_strategy: options.type === 'headline' ? 'balanced' : 'natural',
    allow_auto_scale: true,
    ...(options.marginTop !== undefined ? { margin_top: options.marginTop } : {}),
    ...(options.marginBottom !== undefined ? { margin_bottom: options.marginBottom } : {}),
    ...(options.anchorOffset !== undefined ? { anchor_offset: options.anchorOffset } : {}),
  }
}

function canvasForFormat(format: ArtFormat): Record<string, unknown> {
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

function buildTemplateData(
  format: ArtFormat,
  options: {
    textZone: { x: number; width: number }
    alignment: 'left' | 'center' | 'right'
    overlayPosition: 'top' | 'bottom' | 'full'
    overlayDirection: 'top_to_bottom' | 'bottom_to_top' | 'left_to_right' | 'right_to_left'
    slotPriority: string[]
    slotDropOrder: string[]
    slots: Record<string, Record<string, unknown>>
    idealWords?: number
    maxWords?: number
  },
): Record<string, unknown> {
  return {
    canvas: canvasForFormat(format),
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
      ideal_words: options.idealWords ?? 20,
      max_words: options.maxWords ?? 34,
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

const PRESETS: Record<string, TemplatePreset> = {
  S1: {
    id: 'S1',
    name: 'S1 - Centered Focus',
    format: 'STORY',
    fingerprint: 'ds-preset-s1-v1',
    analysisConfidence: 0.99,
    templateData: buildTemplateData('STORY', {
      textZone: { x: 10, width: 80 },
      alignment: 'center',
      overlayPosition: 'bottom',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['title', 'cta', 'pre_title'],
      slotDropOrder: ['pre_title'],
      slots: {
        pre_title: buildSlot({
          type: 'label',
          anchor: 'top_fixed',
          anchorOffset: 18,
          fontSize: 'sm',
          maxWords: 5,
          maxLines: 2,
          maxCharsPerLine: 20,
        }),
        title: buildSlot({
          type: 'headline',
          anchor: 'after:pre_title',
          marginTop: 10,
          fontSize: 'xl',
          maxWords: 10,
          maxLines: 3,
          maxCharsPerLine: 20,
        }),
        cta: buildSlot({
          type: 'call_to_action',
          anchor: 'after:title',
          marginTop: 16,
          fontSize: 'md',
          maxWords: 6,
          maxLines: 2,
          maxCharsPerLine: 24,
        }),
      },
    }),
  },
  S2: {
    id: 'S2',
    name: 'S2 - Editorial Asymmetric',
    format: 'STORY',
    fingerprint: 'ds-preset-s2-v1',
    analysisConfidence: 0.99,
    templateData: buildTemplateData('STORY', {
      textZone: { x: 8, width: 66 },
      alignment: 'left',
      overlayPosition: 'full',
      overlayDirection: 'left_to_right',
      slotPriority: ['title', 'description', 'pre_title'],
      slotDropOrder: ['pre_title', 'description'],
      slots: {
        pre_title: buildSlot({
          type: 'label',
          anchor: 'top_fixed',
          anchorOffset: 18,
          fontSize: 'sm',
          maxWords: 5,
          maxLines: 2,
          maxCharsPerLine: 20,
        }),
        title: buildSlot({
          type: 'headline',
          anchor: 'after:pre_title',
          marginTop: 10,
          fontSize: 'xl',
          maxWords: 12,
          maxLines: 4,
          maxCharsPerLine: 22,
        }),
        description: buildSlot({
          type: 'paragraph',
          anchor: 'after:title',
          marginTop: 12,
          fontSize: 'md',
          maxWords: 28,
          maxLines: 4,
          maxCharsPerLine: 34,
          uppercase: false,
        }),
      },
    }),
  },
  S3: {
    id: 'S3',
    name: 'S3 - Info List',
    format: 'STORY',
    fingerprint: 'ds-preset-s3-v1',
    analysisConfidence: 0.99,
    templateData: buildTemplateData('STORY', {
      textZone: { x: 8, width: 84 },
      alignment: 'left',
      overlayPosition: 'bottom',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['title', 'description', 'footer_info_1', 'footer_info_2'],
      slotDropOrder: ['footer_info_2', 'footer_info_1', 'description'],
      slots: {
        title: buildSlot({
          type: 'headline',
          anchor: 'top_fixed',
          anchorOffset: 22,
          fontSize: 'xl',
          maxWords: 10,
          maxLines: 3,
          maxCharsPerLine: 20,
        }),
        description: buildSlot({
          type: 'paragraph',
          anchor: 'after:title',
          marginTop: 12,
          fontSize: 'sm',
          maxWords: 30,
          maxLines: 4,
          maxCharsPerLine: 34,
          uppercase: false,
        }),
        footer_info_1: buildSlot({
          type: 'footer_info',
          anchor: 'after:description',
          marginTop: 12,
          fontSize: 'sm',
          maxWords: 10,
          maxLines: 2,
          maxCharsPerLine: 30,
          uppercase: false,
        }),
        footer_info_2: buildSlot({
          type: 'footer_info',
          anchor: 'after:footer_info_1',
          marginTop: 6,
          fontSize: 'sm',
          maxWords: 10,
          maxLines: 2,
          maxCharsPerLine: 30,
          uppercase: false,
        }),
      },
    }),
  },
  S4: {
    id: 'S4',
    name: 'S4 - Production Tip',
    format: 'STORY',
    fingerprint: 'ds-preset-s4-v1',
    analysisConfidence: 0.99,
    templateData: buildTemplateData('STORY', {
      textZone: { x: 8, width: 84 },
      alignment: 'left',
      overlayPosition: 'bottom',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['title', 'cta', 'description', 'badge'],
      slotDropOrder: ['badge', 'description'],
      slots: {
        badge: buildSlot({
          type: 'label',
          anchor: 'top_fixed',
          anchorOffset: 18,
          fontSize: 'sm',
          maxWords: 4,
          maxLines: 2,
          maxCharsPerLine: 20,
        }),
        title: buildSlot({
          type: 'headline',
          anchor: 'after:badge',
          marginTop: 10,
          fontSize: 'xl',
          maxWords: 11,
          maxLines: 3,
          maxCharsPerLine: 22,
        }),
        description: buildSlot({
          type: 'paragraph',
          anchor: 'after:title',
          marginTop: 12,
          fontSize: 'sm',
          maxWords: 24,
          maxLines: 3,
          maxCharsPerLine: 32,
          uppercase: false,
        }),
        cta: buildSlot({
          type: 'call_to_action',
          anchor: 'after:description',
          marginTop: 14,
          fontSize: 'md',
          maxWords: 6,
          maxLines: 2,
          maxCharsPerLine: 24,
        }),
      },
    }),
  },
  S5: {
    id: 'S5',
    name: 'S5 - Production Setup',
    format: 'STORY',
    fingerprint: 'ds-preset-s5-v1',
    analysisConfidence: 0.99,
    templateData: buildTemplateData('STORY', {
      textZone: { x: 8, width: 84 },
      alignment: 'left',
      overlayPosition: 'bottom',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['title', 'badge', 'footer_info_1', 'footer_info_2'],
      slotDropOrder: ['footer_info_2', 'footer_info_1', 'badge'],
      slots: {
        badge: buildSlot({
          type: 'label',
          anchor: 'top_fixed',
          anchorOffset: 18,
          fontSize: 'sm',
          maxWords: 4,
          maxLines: 2,
          maxCharsPerLine: 20,
        }),
        title: buildSlot({
          type: 'headline',
          anchor: 'after:badge',
          marginTop: 10,
          fontSize: 'xl',
          maxWords: 11,
          maxLines: 3,
          maxCharsPerLine: 22,
        }),
        footer_info_1: buildSlot({
          type: 'footer_info',
          anchor: 'after:title',
          marginTop: 12,
          fontSize: 'sm',
          maxWords: 10,
          maxLines: 2,
          maxCharsPerLine: 30,
          uppercase: false,
        }),
        footer_info_2: buildSlot({
          type: 'footer_info',
          anchor: 'after:footer_info_1',
          marginTop: 6,
          fontSize: 'sm',
          maxWords: 10,
          maxLines: 2,
          maxCharsPerLine: 30,
          uppercase: false,
        }),
      },
    }),
  },
  S6: {
    id: 'S6',
    name: 'S6 - Final Result Promo',
    format: 'STORY',
    fingerprint: 'ds-preset-s6-v1',
    analysisConfidence: 0.99,
    templateData: buildTemplateData('STORY', {
      textZone: { x: 10, width: 80 },
      alignment: 'center',
      overlayPosition: 'full',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['title', 'cta', 'badge'],
      slotDropOrder: ['badge'],
      slots: {
        badge: buildSlot({
          type: 'label',
          anchor: 'top_fixed',
          anchorOffset: 16,
          fontSize: 'sm',
          maxWords: 4,
          maxLines: 2,
          maxCharsPerLine: 18,
        }),
        title: buildSlot({
          type: 'headline',
          anchor: 'after:badge',
          marginTop: 10,
          fontSize: 'xl',
          maxWords: 11,
          maxLines: 3,
          maxCharsPerLine: 22,
        }),
        cta: buildSlot({
          type: 'call_to_action',
          anchor: 'after:title',
          marginTop: 16,
          fontSize: 'md',
          maxWords: 6,
          maxLines: 2,
          maxCharsPerLine: 24,
        }),
      },
    }),
  },
  F1: {
    id: 'F1',
    name: 'F1 - Product Promo',
    format: 'FEED_PORTRAIT',
    fingerprint: 'ds-preset-f1-v1',
    analysisConfidence: 0.99,
    templateData: buildTemplateData('FEED_PORTRAIT', {
      textZone: { x: 10, width: 80 },
      alignment: 'left',
      overlayPosition: 'bottom',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['badge', 'pre_title'],
      slotDropOrder: ['pre_title'],
      slots: {
        pre_title: buildSlot({
          type: 'label',
          anchor: 'top_fixed',
          anchorOffset: 16,
          fontSize: 'sm',
          maxWords: 5,
          maxLines: 2,
          maxCharsPerLine: 20,
        }),
        badge: buildSlot({
          type: 'headline',
          anchor: 'after:pre_title',
          marginTop: 10,
          fontSize: 'xl',
          maxWords: 8,
          maxLines: 3,
          maxCharsPerLine: 20,
        }),
      },
      idealWords: 12,
      maxWords: 20,
    }),
  },
  F2: {
    id: 'F2',
    name: 'F2 - Lifestyle Editorial',
    format: 'FEED_PORTRAIT',
    fingerprint: 'ds-preset-f2-v1',
    analysisConfidence: 0.99,
    templateData: buildTemplateData('FEED_PORTRAIT', {
      textZone: { x: 8, width: 68 },
      alignment: 'left',
      overlayPosition: 'full',
      overlayDirection: 'left_to_right',
      slotPriority: ['title', 'description'],
      slotDropOrder: ['description'],
      slots: {
        title: buildSlot({
          type: 'headline',
          anchor: 'top_fixed',
          anchorOffset: 16,
          fontSize: 'xl',
          maxWords: 11,
          maxLines: 3,
          maxCharsPerLine: 22,
        }),
        description: buildSlot({
          type: 'paragraph',
          anchor: 'after:title',
          marginTop: 12,
          fontSize: 'sm',
          maxWords: 24,
          maxLines: 3,
          maxCharsPerLine: 30,
          uppercase: false,
        }),
      },
      idealWords: 18,
      maxWords: 28,
    }),
  },
  F3: {
    id: 'F3',
    name: 'F3 - Square Minimal',
    format: 'SQUARE',
    fingerprint: 'ds-preset-f3-v1',
    analysisConfidence: 0.99,
    templateData: buildTemplateData('SQUARE', {
      textZone: { x: 12, width: 76 },
      alignment: 'left',
      overlayPosition: 'bottom',
      overlayDirection: 'bottom_to_top',
      slotPriority: ['badge'],
      slotDropOrder: ['badge'],
      slots: {
        badge: buildSlot({
          type: 'label',
          anchor: 'top_fixed',
          anchorOffset: 14,
          fontSize: 'md',
          maxWords: 6,
          maxLines: 2,
          maxCharsPerLine: 24,
        }),
      },
      idealWords: 8,
      maxWords: 14,
    }),
  },
}

export function getTemplatePresetById(
  templateId: string,
  format?: ArtFormat,
): TemplatePreset | null {
  const normalized = templateId.trim().toUpperCase()
  const preset = PRESETS[normalized]
  if (!preset) return null
  if (format && preset.format !== format) return null
  return JSON.parse(JSON.stringify(preset)) as TemplatePreset
}

