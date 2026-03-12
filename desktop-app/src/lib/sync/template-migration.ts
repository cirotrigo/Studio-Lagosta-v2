/**
 * Template Migration - Handles migration of old/incompatible template formats
 *
 * This module detects templates that need migration and provides utilities
 * for safely upgrading them to the current schema version.
 */

import type {
  KonvaTemplateDocument,
  Layer,
  KonvaPage,
  KonvaTextLayer,
} from '../../types/template'
import { validateLocalTemplate, validateLocalTemplatePartial } from './template-validator'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface MigrationResult {
  success: boolean
  migrated: boolean
  fromVersion: number | undefined
  toVersion: number
  changes: MigrationChange[]
  errors: string[]
  backup?: KonvaTemplateDocument
}

export interface MigrationChange {
  type: 'field_added' | 'field_renamed' | 'field_removed' | 'structure_changed' | 'value_updated'
  path: string
  description: string
  oldValue?: unknown
  newValue?: unknown
}

export interface MigrationOptions {
  createBackup: boolean
  dryRun: boolean
  force: boolean // Force migration even if already at current version
}

const DEFAULT_OPTIONS: MigrationOptions = {
  createBackup: true,
  dryRun: false,
  force: false,
}

const CURRENT_SCHEMA_VERSION = 2

// ─────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────

/**
 * Detect the schema version of a template
 */
export function detectSchemaVersion(template: unknown): number | undefined {
  if (!template || typeof template !== 'object') return undefined

  const obj = template as Record<string, unknown>

  // Check explicit schemaVersion field
  if (typeof obj.schemaVersion === 'number') {
    return obj.schemaVersion
  }

  // Heuristics for version detection
  // Version 2: has design.pages array with layers inside
  if (obj.design && typeof obj.design === 'object') {
    const design = obj.design as Record<string, unknown>
    if (Array.isArray(design.pages) && design.pages.length > 0) {
      const firstPage = design.pages[0] as Record<string, unknown>
      if (Array.isArray(firstPage.layers)) {
        return 2
      }
    }
  }

  // Version 1: has layers at root level or in design.layers
  if (Array.isArray(obj.layers)) {
    return 1
  }
  if (obj.design && typeof obj.design === 'object') {
    const design = obj.design as Record<string, unknown>
    if (Array.isArray(design.layers)) {
      return 1
    }
  }

  // Unknown or legacy format
  return undefined
}

/**
 * Check if a template needs migration
 */
export function needsMigration(template: unknown): boolean {
  const version = detectSchemaVersion(template)

  // Unknown version needs migration
  if (version === undefined) return true

  // Older versions need migration
  if (version < CURRENT_SCHEMA_VERSION) return true

  // Current version - check if it passes validation
  const validation = validateLocalTemplate(template)
  return !validation.valid
}

/**
 * Get migration requirements for a template
 */
export function getMigrationInfo(template: unknown): {
  currentVersion: number | undefined
  targetVersion: number
  requiresMigration: boolean
  validationErrors: string[]
} {
  const version = detectSchemaVersion(template)
  const validation = validateLocalTemplatePartial(template)

  return {
    currentVersion: version,
    targetVersion: CURRENT_SCHEMA_VERSION,
    requiresMigration: needsMigration(template),
    validationErrors: validation.errors,
  }
}

// ─────────────────────────────────────────────────────────────────
// Migration functions
// ─────────────────────────────────────────────────────────────────

/**
 * Migrate a layer from legacy format to current format
 */
function migrateLayer(layer: unknown, changes: MigrationChange[]): Layer {
  const raw = layer as Record<string, unknown>

  // Handle position conversion
  let x = 0
  let y = 0
  if (raw.position && typeof raw.position === 'object') {
    const pos = raw.position as { x?: number; y?: number }
    x = pos.x ?? 0
    y = pos.y ?? 0
    changes.push({
      type: 'structure_changed',
      path: `layer[${raw.id}].position`,
      description: 'Converted position object to x/y properties',
      oldValue: raw.position,
      newValue: { x, y },
    })
  } else {
    x = (raw.x as number) ?? 0
    y = (raw.y as number) ?? 0
  }

  // Handle size conversion
  let width = 100
  let height = 100
  if (raw.size && typeof raw.size === 'object') {
    const size = raw.size as { width?: number; height?: number }
    width = size.width ?? 100
    height = size.height ?? 100
    changes.push({
      type: 'structure_changed',
      path: `layer[${raw.id}].size`,
      description: 'Converted size object to width/height properties',
      oldValue: raw.size,
      newValue: { width, height },
    })
  } else {
    width = (raw.width as number) ?? 100
    height = (raw.height as number) ?? 100
  }

  // Handle order/zIndex
  const zIndex = (raw.zIndex as number) ?? (raw.order as number) ?? 0
  if (raw.order !== undefined && raw.zIndex === undefined) {
    changes.push({
      type: 'field_renamed',
      path: `layer[${raw.id}].order`,
      description: 'Renamed order to zIndex',
      oldValue: raw.order,
      newValue: zIndex,
    })
  }

  const baseLayer = {
    id: (raw.id as string) || crypto.randomUUID(),
    type: (raw.type as string) || 'element',
    name: raw.name as string,
    x,
    y,
    width,
    height,
    rotation: raw.rotation as number,
    opacity: raw.opacity as number,
    visible: raw.visible !== false,
    locked: (raw.locked as boolean) ?? false,
    zIndex,
  }

  // Type-specific migration
  const layerType = raw.type as string

  if (layerType === 'text' || layerType === 'rich-text') {
    // Handle text content
    const text = (raw.text as string) ?? (raw.content as string) ?? ''
    if (raw.content !== undefined && raw.text === undefined) {
      changes.push({
        type: 'field_renamed',
        path: `layer[${raw.id}].content`,
        description: 'Renamed content to text',
        oldValue: raw.content,
        newValue: text,
      })
    }

    // Handle style to textStyle conversion
    let textStyle: KonvaTextLayer['textStyle'] = {}
    if (raw.textStyle && typeof raw.textStyle === 'object') {
      textStyle = raw.textStyle as KonvaTextLayer['textStyle']
    } else if (raw.style && typeof raw.style === 'object') {
      const style = raw.style as Record<string, unknown>
      textStyle = {
        fontFamily: style.fontFamily as string,
        fontSize: style.fontSize as number,
        fontWeight: style.fontWeight as string,
        fontStyle: style.fontStyle as 'normal' | 'italic',
        lineHeight: style.lineHeight as number,
        letterSpacing: style.letterSpacing as number,
        textTransform: style.textTransform as 'none' | 'uppercase' | 'lowercase' | 'capitalize',
        align: style.textAlign as 'left' | 'center' | 'right' | 'justify',
        fill: (style.color as string) ?? (style.fill as string),
      }
      changes.push({
        type: 'structure_changed',
        path: `layer[${raw.id}].style`,
        description: 'Converted style object to textStyle',
      })

      // Handle color → fill rename
      if (style.color && !style.fill) {
        changes.push({
          type: 'field_renamed',
          path: `layer[${raw.id}].style.color`,
          description: 'Renamed color to fill in textStyle',
          oldValue: style.color,
          newValue: style.color,
        })
      }
    }

    return {
      ...baseLayer,
      type: layerType as 'text' | 'rich-text',
      text,
      textStyle,
    }
  }

  if (layerType === 'image') {
    const src = (raw.src as string) ?? (raw.fileUrl as string) ?? ''
    if (raw.fileUrl !== undefined && raw.src === undefined) {
      changes.push({
        type: 'field_renamed',
        path: `layer[${raw.id}].fileUrl`,
        description: 'Renamed fileUrl to src',
        oldValue: raw.fileUrl,
        newValue: src,
      })
    }

    return {
      ...baseLayer,
      type: 'image',
      src,
      fit: (raw.fit as 'cover' | 'contain' | 'fill') ?? (raw.style as Record<string, unknown>)?.objectFit,
      crop: raw.crop as { x: number; y: number; width: number; height: number },
    }
  }

  if (layerType === 'gradient' || layerType === 'gradient2') {
    let colors = raw.colors as string[]
    let stops = raw.stops as number[]
    let angle = raw.angle as number

    // Extract from style if not at root
    if (!colors && raw.style) {
      const style = raw.style as Record<string, unknown>
      const gradientStops = style.gradientStops as Array<{ color: string; position: number }>
      if (gradientStops) {
        colors = gradientStops.map((s) => s.color)
        stops = gradientStops.map((s) => s.position)
        angle = style.gradientAngle as number
        changes.push({
          type: 'structure_changed',
          path: `layer[${raw.id}].style.gradientStops`,
          description: 'Extracted colors/stops from style.gradientStops',
        })
      }
    }

    return {
      ...baseLayer,
      type: layerType as 'gradient' | 'gradient2',
      colors: colors ?? ['#ffffff', '#000000'],
      stops,
      angle,
    }
  }

  if (layerType === 'shape') {
    const shape = (raw.shape as string) ?? (raw.style as Record<string, unknown>)?.shapeType ?? 'rectangle'
    const style = (raw.style as Record<string, unknown>) ?? {}

    return {
      ...baseLayer,
      type: 'shape',
      shape: shape as 'rectangle' | 'rounded-rectangle' | 'circle' | 'triangle' | 'star' | 'arrow' | 'line',
      fill: (raw.fill as string) ?? (style.fill as string),
      stroke: (raw.stroke as string) ?? (style.strokeColor as string),
      strokeWidth: (raw.strokeWidth as number) ?? (style.strokeWidth as number),
      cornerRadius: raw.cornerRadius as number,
      points: raw.points as number[],
    }
  }

  if (layerType === 'logo') {
    return {
      ...baseLayer,
      type: 'logo',
      src: (raw.src as string) ?? (raw.fileUrl as string) ?? '',
      preserveAspectRatio: raw.preserveAspectRatio as boolean,
    }
  }

  if (layerType === 'icon') {
    return {
      ...baseLayer,
      type: 'icon',
      iconName: raw.iconName as string,
      src: (raw.src as string) ?? (raw.fileUrl as string),
      fill: (raw.fill as string) ?? (raw.style as Record<string, unknown>)?.fill,
    }
  }

  if (layerType === 'video') {
    return {
      ...baseLayer,
      type: 'video',
      src: (raw.src as string) ?? (raw.fileUrl as string) ?? '',
      poster: raw.poster as string,
      muted: raw.muted as boolean,
      loop: raw.loop as boolean,
    }
  }

  // Default to element type
  return {
    ...baseLayer,
    type: 'element',
    elementKey: layerType,
    props: raw.props as Record<string, unknown>,
  }
}

/**
 * Migrate a template from v1 (or unknown) to v2
 */
function migrateToV2(
  template: Record<string, unknown>,
  changes: MigrationChange[]
): KonvaTemplateDocument {
  const now = new Date().toISOString()

  // Extract or create pages
  let pages: KonvaPage[] = []

  // Check for existing pages array
  if (template.design && typeof template.design === 'object') {
    const design = template.design as Record<string, unknown>

    if (Array.isArray(design.pages)) {
      // Has pages, migrate each page's layers
      pages = design.pages.map((page, index) => {
        const pageObj = page as Record<string, unknown>
        const layers = Array.isArray(pageObj.layers)
          ? pageObj.layers.map((l) => migrateLayer(l, changes))
          : []

        return {
          id: (pageObj.id as string) || crypto.randomUUID(),
          name: (pageObj.name as string) || `Pagina ${index + 1}`,
          width: (pageObj.width as number) || 1080,
          height: (pageObj.height as number) || 1920,
          background: pageObj.background as string,
          order: (pageObj.order as number) ?? index,
          layers,
          thumbnailPath: pageObj.thumbnailPath as string,
        }
      })
    } else if (Array.isArray(design.layers)) {
      // V1 format: layers at design level
      const layers = design.layers.map((l) => migrateLayer(l, changes))
      const canvas = (design.canvas as Record<string, unknown>) ?? {}

      pages = [
        {
          id: crypto.randomUUID(),
          name: 'Pagina 1',
          width: (canvas.width as number) || 1080,
          height: (canvas.height as number) || 1920,
          background: canvas.backgroundColor as string,
          order: 0,
          layers,
        },
      ]

      changes.push({
        type: 'structure_changed',
        path: 'design.layers',
        description: 'Moved layers from design.layers to design.pages[0].layers',
      })
    }
  } else if (Array.isArray(template.layers)) {
    // V0 format: layers at root
    const layers = template.layers.map((l) => migrateLayer(l, changes))

    pages = [
      {
        id: crypto.randomUUID(),
        name: 'Pagina 1',
        width: 1080,
        height: 1920,
        background: '#ffffff',
        order: 0,
        layers,
      },
    ]

    changes.push({
      type: 'structure_changed',
      path: 'layers',
      description: 'Moved layers from root to design.pages[0].layers',
    })
  }

  // Ensure at least one page exists
  if (pages.length === 0) {
    pages = [
      {
        id: crypto.randomUUID(),
        name: 'Pagina 1',
        width: 1080,
        height: 1920,
        background: '#ffffff',
        order: 0,
        layers: [],
      },
    ]

    changes.push({
      type: 'field_added',
      path: 'design.pages',
      description: 'Created default empty page',
    })
  }

  // Determine format from dimensions
  const firstPage = pages[0]
  let format: 'STORY' | 'FEED_PORTRAIT' | 'SQUARE' = 'STORY'
  const ratio = firstPage.width / firstPage.height
  if (Math.abs(ratio - 1) < 0.1) {
    format = 'SQUARE'
  } else if (ratio < 1 && firstPage.height / firstPage.width < 1.5) {
    format = 'FEED_PORTRAIT'
  }

  // Handle format conversion from web format
  const rawFormat = template.format ?? template.type
  if (rawFormat === 'FEED') {
    format = 'FEED_PORTRAIT'
    changes.push({
      type: 'value_updated',
      path: 'format',
      description: 'Converted format FEED to FEED_PORTRAIT',
      oldValue: 'FEED',
      newValue: 'FEED_PORTRAIT',
    })
  }

  const migrated: KonvaTemplateDocument = {
    schemaVersion: 2,
    id: (template.id as string) || (template.localId as string) || crypto.randomUUID(),
    projectId: (template.projectId as number) || 0,
    engine: 'KONVA',
    name: (template.name as string) || 'Template migrado',
    format,
    source: (template.source as 'local' | 'synced') || 'local',
    design: {
      pages,
      currentPageId: pages[0].id,
    },
    identity: (template.identity as KonvaTemplateDocument['identity']) || {
      colors: [],
      fonts: [],
    },
    slots: Array.isArray(template.slots) ? template.slots : [],
    meta: {
      createdAt: (template.createdAt as string) || now,
      updatedAt: now,
      syncedAt: template.syncedAt as string,
      isDirty: true,
      thumbnailPath: template.thumbnailPath as string,
      remoteId: template.remoteId as number,
    },
  }

  if (!template.schemaVersion) {
    changes.push({
      type: 'field_added',
      path: 'schemaVersion',
      description: 'Added schemaVersion field',
      newValue: 2,
    })
  }

  return migrated
}

// ─────────────────────────────────────────────────────────────────
// Main migration function
// ─────────────────────────────────────────────────────────────────

/**
 * Migrate a template to the current schema version
 */
export function migrateTemplate(
  template: unknown,
  options: Partial<MigrationOptions> = {}
): MigrationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const changes: MigrationChange[] = []

  if (!template || typeof template !== 'object') {
    return {
      success: false,
      migrated: false,
      fromVersion: undefined,
      toVersion: CURRENT_SCHEMA_VERSION,
      changes: [],
      errors: ['Template is not a valid object'],
    }
  }

  const currentVersion = detectSchemaVersion(template)
  const raw = template as Record<string, unknown>

  // Check if migration is needed
  if (!opts.force && currentVersion === CURRENT_SCHEMA_VERSION) {
    const validation = validateLocalTemplate(template)
    if (validation.valid) {
      return {
        success: true,
        migrated: false,
        fromVersion: currentVersion,
        toVersion: CURRENT_SCHEMA_VERSION,
        changes: [],
        errors: [],
      }
    }
  }

  // Create backup if requested
  const backup = opts.createBackup ? (JSON.parse(JSON.stringify(template)) as KonvaTemplateDocument) : undefined

  try {
    // Dry run - just analyze without modifying
    if (opts.dryRun) {
      const testChanges: MigrationChange[] = []
      migrateToV2(raw, testChanges)

      return {
        success: true,
        migrated: false,
        fromVersion: currentVersion,
        toVersion: CURRENT_SCHEMA_VERSION,
        changes: testChanges,
        errors: [],
        backup: undefined,
      }
    }

    // Perform migration
    const migrated = migrateToV2(raw, changes)

    // Validate result
    const validation = validateLocalTemplate(migrated)
    if (!validation.valid) {
      return {
        success: false,
        migrated: false,
        fromVersion: currentVersion,
        toVersion: CURRENT_SCHEMA_VERSION,
        changes,
        errors: validation.errors.map((e) => `Validation failed: ${e}`),
        backup,
      }
    }

    return {
      success: true,
      migrated: true,
      fromVersion: currentVersion,
      toVersion: CURRENT_SCHEMA_VERSION,
      changes,
      errors: [],
      backup,
    }
  } catch (error) {
    return {
      success: false,
      migrated: false,
      fromVersion: currentVersion,
      toVersion: CURRENT_SCHEMA_VERSION,
      changes,
      errors: [error instanceof Error ? error.message : 'Unknown migration error'],
      backup,
    }
  }
}

/**
 * Get a migrated template document
 */
export function getMigratedTemplate(
  template: unknown,
  options: Partial<MigrationOptions> = {}
): KonvaTemplateDocument | null {
  if (!template || typeof template !== 'object') return null

  const result = migrateTemplate(template, { ...options, dryRun: false })

  if (!result.success) {
    console.error('[TemplateMigration] Migration failed:', result.errors)
    return null
  }

  if (!result.migrated) {
    // Already valid, return as-is
    return template as KonvaTemplateDocument
  }

  // Return migrated template
  const raw = template as Record<string, unknown>
  const changes: MigrationChange[] = []
  return migrateToV2(raw, changes)
}

/**
 * Log migration changes in a readable format
 */
export function logMigrationChanges(result: MigrationResult): void {
  if (result.changes.length === 0) {
    console.log('[TemplateMigration] No changes needed')
    return
  }

  console.log(
    `[TemplateMigration] Migration v${result.fromVersion ?? '?'} → v${result.toVersion}: ${result.changes.length} changes`
  )

  for (const change of result.changes) {
    console.log(`  [${change.type}] ${change.path}: ${change.description}`)
  }

  if (result.errors.length > 0) {
    console.error('[TemplateMigration] Errors:')
    for (const error of result.errors) {
      console.error(`  - ${error}`)
    }
  }
}
