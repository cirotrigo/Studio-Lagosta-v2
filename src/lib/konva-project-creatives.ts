import { TemplateType } from '@/lib/prisma-types'

export const KONVA_PROJECT_EXPORT_CATEGORY = '__system_konva_export__'

export type KonvaProjectCreativeFormat = 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'

interface KonvaProjectTemplateConfig {
  templateType: TemplateType
  dimensions: string
  templateName: string
}

export function getKonvaProjectTemplateConfig(
  format: KonvaProjectCreativeFormat,
): KonvaProjectTemplateConfig {
  switch (format) {
    case 'SQUARE':
      return {
        templateType: TemplateType.SQUARE,
        dimensions: '1080x1080',
        templateName: '__KONVA_EXPORT_SQUARE__',
      }
    case 'FEED_PORTRAIT':
      return {
        templateType: TemplateType.FEED,
        dimensions: '1080x1350',
        templateName: '__KONVA_EXPORT_FEED__',
      }
    case 'STORY':
    default:
      return {
        templateType: TemplateType.STORY,
        dimensions: '1080x1920',
        templateName: '__KONVA_EXPORT_STORY__',
      }
  }
}
