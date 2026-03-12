/**
 * Template Validator - Basic validation for template structures
 *
 * Provides validation for web payloads before sending to server.
 */

import type { WebTemplatePayload } from './template-normalizer'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate a web template payload
 */
export function validateWebPayload(payload: unknown): ValidationResult {
  const errors: string[] = []

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload is not an object'] }
  }

  const p = payload as Record<string, unknown>

  // Required fields
  if (typeof p.name !== 'string' || p.name.length === 0) {
    errors.push('name: must be a non-empty string')
  }

  if (!['STORY', 'FEED', 'SQUARE'].includes(p.type as string)) {
    errors.push('type: must be STORY, FEED, or SQUARE')
  }

  if (typeof p.dimensions !== 'string' || !/^\d+x\d+$/.test(p.dimensions)) {
    errors.push('dimensions: must be in format WIDTHxHEIGHT')
  }

  if (typeof p.localId !== 'string' || p.localId.length === 0) {
    errors.push('localId: must be a non-empty string')
  }

  if (typeof p.projectId !== 'number' || p.projectId <= 0) {
    errors.push('projectId: must be a positive number')
  }

  // Validate designData
  const designData = p.designData as Record<string, unknown> | undefined
  if (!designData || typeof designData !== 'object') {
    errors.push('designData: must be an object')
  } else {
    // Validate canvas
    const canvas = designData.canvas as Record<string, unknown> | undefined
    if (!canvas || typeof canvas !== 'object') {
      errors.push('designData.canvas: must be an object')
    } else {
      if (typeof canvas.width !== 'number' || canvas.width <= 0) {
        errors.push('designData.canvas.width: must be a positive number')
      }
      if (typeof canvas.height !== 'number' || canvas.height <= 0) {
        errors.push('designData.canvas.height: must be a positive number')
      }
    }

    // Validate pages
    if (!Array.isArray(designData.pages)) {
      errors.push('designData.pages: must be an array')
    } else if (designData.pages.length === 0) {
      errors.push('designData.pages: must have at least one page')
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Type guard for WebTemplatePayload
 */
export function isValidWebPayload(value: unknown): value is WebTemplatePayload {
  return validateWebPayload(value).valid
}

/**
 * Get a human-readable summary of validation errors
 */
export function formatValidationErrors(errors: string[]): string {
  if (errors.length === 0) return 'No errors'
  if (errors.length === 1) return errors[0]
  return `${errors.length} validation errors:\n${errors.map((e) => `  - ${e}`).join('\n')}`
}
