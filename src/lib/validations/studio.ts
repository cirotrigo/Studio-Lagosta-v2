import { z } from 'zod'

export const canvasConfigSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  backgroundColor: z.string().optional(),
})

export const layerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['text', 'image', 'gradient', 'gradient2', 'logo', 'element', 'shape', 'icon']),
  name: z.string().min(1),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  order: z.number().int(),
  position: z.object({ x: z.number(), y: z.number() }),
  size: z.object({ width: z.number().nonnegative(), height: z.number().nonnegative() }),
  rotation: z.number().optional(),
  content: z.string().optional(),
  style: z.record(z.string(), z.any()).optional(),
  isDynamic: z.boolean().optional(),
  textboxConfig: z.record(z.string(), z.any()).optional(),
  logoId: z.number().optional(),
  elementId: z.number().optional(),
  fileUrl: z.string().url().optional(),
  parentId: z.string().nullable().optional(),
  effects: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

export const designDataSchema = z.object({
  canvas: canvasConfigSchema,
  layers: z.array(layerSchema),
})

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório'),
  description: z.string().trim().max(5000).optional(),
  logoUrl: z.string().url().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
})

export const updateProjectSchema = createProjectSchema.partial()

export const updateProjectSettingsSchema = z
  .object({
    googleDriveFolderId: z.string().trim().min(1).nullable().optional(),
    googleDriveFolderName: z.string().trim().min(1).nullable().optional(),
  })
  .refine((data) => {
    const hasId = Object.prototype.hasOwnProperty.call(data, 'googleDriveFolderId')
    const hasName = Object.prototype.hasOwnProperty.call(data, 'googleDriveFolderName')

    if (!hasId && !hasName) {
      return false
    }

    if (hasId !== hasName) {
      return false
    }

    if (data.googleDriveFolderId === null && data.googleDriveFolderName === null) {
      return true
    }

    return typeof data.googleDriveFolderId === 'string' && typeof data.googleDriveFolderName === 'string'
  }, {
    message: 'googleDriveFolderId e googleDriveFolderName devem ser enviados juntos',
  })

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório'),
  type: z.enum(['STORY', 'FEED', 'SQUARE']),
  dimensions: z.string().regex(/^\d+x\d+$/, 'Formato inválido'),
})

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  designData: designDataSchema.optional(),
  dynamicFields: z.array(z.record(z.string(), z.any())).optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
})

export const createGenerationSchema = z.object({
  templateId: z.number().int().positive(),
  fieldValues: z.record(z.string(), z.any()),
})

export const createCarouselSchema = z.object({
  templateId: z.number().int().positive(),
  slides: z
    .array(
      z.object({
        fieldValues: z.record(z.string(), z.any()),
      }),
    )
    .min(2, 'Carrossel deve ter pelo menos 2 slides')
    .max(10, 'Carrossel pode ter no máximo 10 slides'),
})
