/**
 * Template Validator - Zod schemas for validating template structures
 *
 * Provides validation for both local Konva format and web format to ensure
 * data integrity before and after normalization.
 */

import { z } from 'zod'
import type { KonvaTemplateDocument } from '../../types/template'
import type { WebTemplatePayload, WebDesignData } from './template-normalizer'

// ─────────────────────────────────────────────────────────────────
// Shared schemas
// ─────────────────────────────────────────────────────────────────

const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const SizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
})

// ─────────────────────────────────────────────────────────────────
// Local (Konva) schemas
// ─────────────────────────────────────────────────────────────────

const KonvaLayerTypeSchema = z.enum([
  'text',
  'rich-text',
  'image',
  'gradient',
  'gradient2',
  'shape',
  'icon',
  'logo',
  'element',
  'video',
])

const KonvaTextStyleSchema = z
  .object({
    fontFamily: z.string().optional(),
    fontSize: z.number().positive().optional(),
    fontWeight: z.string().optional(),
    fontStyle: z.enum(['normal', 'italic']).optional(),
    lineHeight: z.number().positive().optional(),
    letterSpacing: z.number().optional(),
    textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
    maxLines: z.number().int().positive().optional(),
    overflowBehavior: z.enum(['clip', 'ellipsis', 'autoScale']).optional(),
    minFontSize: z.number().positive().optional(),
    maxFontSize: z.number().positive().optional(),
    align: z.enum(['left', 'center', 'right', 'justify']).optional(),
    verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
    safeArea: z
      .object({
        enabled: z.boolean().optional(),
        vertical: z.enum(['top', 'center', 'bottom']),
        horizontal: z.enum(['left', 'center', 'right']),
      })
      .optional(),
    fill: z.string().optional(),
  })
  .optional()

const KonvaLayerBaseSchema = z.object({
  id: z.string().min(1),
  type: KonvaLayerTypeSchema,
  name: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  rotation: z.number().optional(),
  scaleX: z.number().optional(),
  scaleY: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  draggable: z.boolean().optional(),
  zIndex: z.number().int().optional(),
  role: z.enum(['background', 'content']).optional(),
})

const KonvaTextLayerSchema = KonvaLayerBaseSchema.extend({
  type: z.enum(['text', 'rich-text']),
  text: z.string(),
  textStyle: KonvaTextStyleSchema,
})

const KonvaImageLayerSchema = KonvaLayerBaseSchema.extend({
  type: z.literal('image'),
  src: z.string(),
  fit: z.enum(['cover', 'contain', 'fill']).optional(),
  crop: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
})

const KonvaGradientLayerSchema = KonvaLayerBaseSchema.extend({
  type: z.enum(['gradient', 'gradient2']),
  colors: z.array(z.string()).min(2),
  stops: z.array(z.number()).optional(),
  opacities: z.array(z.number().min(0).max(1)).optional(),
  angle: z.number().optional(),
  gradientType: z.enum(['linear', 'radial']).optional(),
})

const KonvaShapeLayerSchema = KonvaLayerBaseSchema.extend({
  type: z.literal('shape'),
  shape: z.enum(['rectangle', 'rounded-rectangle', 'circle', 'triangle', 'star', 'arrow', 'line']),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  cornerRadius: z.number().optional(),
  points: z.array(z.number()).optional(),
})

const KonvaIconLayerSchema = KonvaLayerBaseSchema.extend({
  type: z.literal('icon'),
  iconName: z.string().optional(),
  src: z.string().optional(),
  fill: z.string().optional(),
})

const KonvaLogoLayerSchema = KonvaLayerBaseSchema.extend({
  type: z.literal('logo'),
  src: z.string(),
  preserveAspectRatio: z.boolean().optional(),
})

const KonvaElementLayerSchema = KonvaLayerBaseSchema.extend({
  type: z.literal('element'),
  elementKey: z.string(),
  props: z.record(z.unknown()).optional(),
})

const KonvaVideoLayerSchema = KonvaLayerBaseSchema.extend({
  type: z.literal('video'),
  src: z.string(),
  poster: z.string().optional(),
  muted: z.boolean().optional(),
  loop: z.boolean().optional(),
})

// Layer schema for strict validation (exported for potential reuse)
// KonvaPageSchema uses z.any() for flexibility with legacy formats
export const KonvaLayerSchema = z.discriminatedUnion('type', [
  KonvaTextLayerSchema,
  KonvaImageLayerSchema,
  KonvaGradientLayerSchema,
  KonvaShapeLayerSchema,
  KonvaIconLayerSchema,
  KonvaLogoLayerSchema,
  KonvaElementLayerSchema,
  KonvaVideoLayerSchema,
])

const KonvaPageSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  background: z.string().optional(),
  order: z.number().int(),
  layers: z.array(z.any()), // Allow any layer format for flexibility
  thumbnailPath: z.string().optional(),
})

const SlotBindingSchema = z.object({
  id: z.string(),
  layerId: z.string(),
  fieldKey: z.enum([
    'pre_title',
    'title',
    'description',
    'cta',
    'badge',
    'footer_info_1',
    'footer_info_2',
  ]),
  label: z.string(),
  constraints: z
    .object({
      maxLines: z.number().int().positive().optional(),
      maxCharsPerLine: z.number().int().positive().optional(),
      minFontSize: z.number().positive().optional(),
      maxFontSize: z.number().positive().optional(),
      overflowBehavior: z.enum(['scale-down', 'ellipsis', 'clip']).optional(),
    })
    .optional(),
})

const KonvaTemplateMetaSchema = z.object({
  fingerprint: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  syncedAt: z.string().optional(),
  isDirty: z.boolean(),
  thumbnailPath: z.string().optional(),
  remoteId: z.number().optional(),
})

const KonvaIdentitySchema = z.object({
  brandName: z.string().optional(),
  logoUrl: z.string().optional(),
  colors: z.array(z.string()),
  fonts: z.array(
    z.object({
      name: z.string(),
      fontFamily: z.string(),
      fileUrl: z.string().optional(),
    })
  ),
  textColorPreferences: z
    .object({
      titleColor: z.string().optional(),
      subtitleColor: z.string().optional(),
      infoColor: z.string().optional(),
      ctaColor: z.string().optional(),
    })
    .optional(),
})

export const KonvaTemplateDocumentSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  projectId: z.number().int().positive(),
  engine: z.literal('KONVA'),
  name: z.string().min(1),
  format: z.enum(['STORY', 'FEED_PORTRAIT', 'SQUARE']),
  source: z.enum(['local', 'synced']),
  design: z.object({
    pages: z.array(KonvaPageSchema).min(1),
    currentPageId: z.string(),
  }),
  identity: KonvaIdentitySchema,
  slots: z.array(SlotBindingSchema),
  meta: KonvaTemplateMetaSchema,
})

// ─────────────────────────────────────────────────────────────────
// Web schemas
// ─────────────────────────────────────────────────────────────────

const WebLayerStyleSchema = z
  .object({
    fontSize: z.number().positive().optional(),
    fontFamily: z.string().optional(),
    fontWeight: z.union([z.string(), z.number()]).optional(),
    fontStyle: z.enum(['normal', 'italic']).optional(),
    color: z.string().optional(),
    fill: z.string().optional(),
    textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
    textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.number().optional(),
    gradientType: z.enum(['linear', 'radial']).optional(),
    gradientAngle: z.number().optional(),
    gradientStops: z
      .array(
        z.object({
          id: z.string(),
          color: z.string(),
          position: z.number(),
          opacity: z.number(),
        })
      )
      .optional(),
    objectFit: z.enum(['contain', 'cover', 'fill']).optional(),
    opacity: z.number().min(0).max(1).optional(),
    strokeColor: z.string().optional(),
    strokeWidth: z.number().optional(),
    shapeType: z.string().optional(),
  })
  .passthrough()

const WebLayerSchema = z
  .object({
    id: z.string().min(1),
    type: z.string(),
    name: z.string(),
    visible: z.boolean(),
    locked: z.boolean(),
    order: z.number().int(),
    position: PositionSchema,
    size: SizeSchema,
    rotation: z.number().optional(),
    content: z.string().optional(),
    style: WebLayerStyleSchema.optional(),
    fileUrl: z.string().optional(),
    isDynamic: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough()

const WebPageSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  layers: z.array(WebLayerSchema),
  background: z.string().optional(),
  order: z.number().int(),
  thumbnail: z.string().optional(),
})

const WebCanvasSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  backgroundColor: z.string().optional(),
})

export const WebDesignDataSchema = z.object({
  canvas: WebCanvasSchema,
  pages: z.array(WebPageSchema),
  layers: z.array(WebLayerSchema).optional(), // Legacy single-page format
})

export const WebTemplatePayloadSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['STORY', 'FEED', 'SQUARE']),
  dimensions: z.string().regex(/^\d+x\d+$/),
  designData: WebDesignDataSchema,
  localId: z.string().min(1),
  projectId: z.number().int().positive(),
  thumbnailUrl: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

// ─────────────────────────────────────────────────────────────────
// Validation functions
// ─────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate a local Konva template document
 */
export function validateLocalTemplate(template: unknown): ValidationResult {
  const result = KonvaTemplateDocumentSchema.safeParse(template)

  if (result.success) {
    return { valid: true, errors: [] }
  }

  return {
    valid: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  }
}

/**
 * Validate a web template payload
 */
export function validateWebPayload(payload: unknown): ValidationResult {
  const result = WebTemplatePayloadSchema.safeParse(payload)

  if (result.success) {
    return { valid: true, errors: [] }
  }

  return {
    valid: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  }
}

/**
 * Validate web design data structure
 */
export function validateWebDesignData(data: unknown): ValidationResult {
  const result = WebDesignDataSchema.safeParse(data)

  if (result.success) {
    return { valid: true, errors: [] }
  }

  return {
    valid: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  }
}

/**
 * Partial validation for local templates - allows missing optional fields
 * Useful for validating templates during migration
 */
export function validateLocalTemplatePartial(template: unknown): ValidationResult {
  const PartialSchema = KonvaTemplateDocumentSchema.partial({
    identity: true,
    slots: true,
    meta: true,
  })

  const result = PartialSchema.safeParse(template)

  if (result.success) {
    return { valid: true, errors: [] }
  }

  return {
    valid: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  }
}

/**
 * Type guard for KonvaTemplateDocument
 */
export function isValidKonvaTemplate(value: unknown): value is KonvaTemplateDocument {
  return validateLocalTemplate(value).valid
}

/**
 * Type guard for WebTemplatePayload
 */
export function isValidWebPayload(value: unknown): value is WebTemplatePayload {
  return validateWebPayload(value).valid
}

/**
 * Type guard for WebDesignData
 */
export function isValidWebDesignData(value: unknown): value is WebDesignData {
  return validateWebDesignData(value).valid
}

/**
 * Get a human-readable summary of validation errors
 */
export function formatValidationErrors(errors: string[]): string {
  if (errors.length === 0) return 'No errors'
  if (errors.length === 1) return errors[0]
  return `${errors.length} validation errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`
}
