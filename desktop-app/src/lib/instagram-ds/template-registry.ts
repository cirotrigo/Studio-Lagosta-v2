import { ArtFormat } from '@/stores/generation.store'

export type DsTemplateId =
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'S5'
  | 'S6'
  | 'F1'
  | 'F2'
  | 'F3'

export interface DsTemplateSpec {
  id: DsTemplateId
  format: ArtFormat
  title: string
  overlay: 'top' | 'bottom' | 'left' | 'right' | 'double'
  notes: string
}

const TEMPLATE_SPECS: Record<DsTemplateId, DsTemplateSpec> = {
  S1: {
    id: 'S1',
    format: 'STORY',
    title: 'Promotion / Event',
    overlay: 'bottom',
    notes: 'Centered title and CTA, high impact block',
  },
  S2: {
    id: 'S2',
    format: 'STORY',
    title: 'Editorial / Experience',
    overlay: 'left',
    notes: 'Asymmetric story with left-aligned text',
  },
  S3: {
    id: 'S3',
    format: 'STORY',
    title: 'Info / List',
    overlay: 'bottom',
    notes: 'List-first layout with footer details',
  },
  S4: {
    id: 'S4',
    format: 'STORY',
    title: 'Backstage / Tip',
    overlay: 'bottom',
    notes: 'Badge + compact title + short copy',
  },
  S5: {
    id: 'S5',
    format: 'STORY',
    title: 'Production Setup',
    overlay: 'bottom',
    notes: 'Status badge + operational details',
  },
  S6: {
    id: 'S6',
    format: 'STORY',
    title: 'Result Promo',
    overlay: 'double',
    notes: 'Top and bottom overlay for hero CTA',
  },
  F1: {
    id: 'F1',
    format: 'FEED_PORTRAIT',
    title: 'Product / Promo',
    overlay: 'bottom',
    notes: 'Price/value highlight',
  },
  F2: {
    id: 'F2',
    format: 'FEED_PORTRAIT',
    title: 'Lifestyle / Quote',
    overlay: 'left',
    notes: 'Phrase-led with lateral contrast',
  },
  F3: {
    id: 'F3',
    format: 'SQUARE',
    title: 'Clean / Tag',
    overlay: 'bottom',
    notes: 'Photo-first, minimal tag',
  },
}

export function getDsTemplateSpec(templateId: DsTemplateId): DsTemplateSpec {
  return TEMPLATE_SPECS[templateId]
}

export function listDsTemplatesForFormat(format: ArtFormat): DsTemplateSpec[] {
  return Object.values(TEMPLATE_SPECS).filter((template) => template.format === format)
}
