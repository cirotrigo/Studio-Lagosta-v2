import { describe, it, expect } from 'vitest'
import { mapZernioStatusToLocal, extractZernioErrorMessage } from '../status-mapping'

describe('mapZernioStatusToLocal', () => {
  it('maps "published" → POSTED', () => {
    expect(mapZernioStatusToLocal('published')).toBe('POSTED')
  })

  it('maps "failed" → FAILED', () => {
    expect(mapZernioStatusToLocal('failed')).toBe('FAILED')
  })

  // The bug fix: "partial" used to fall through to POSTING, leaving carousels stuck
  // when one platform succeeded and another failed.
  it('maps "partial" → FAILED (regression: previously fell to POSTING)', () => {
    expect(mapZernioStatusToLocal('partial')).toBe('FAILED')
  })

  it('maps "scheduled" → SCHEDULED', () => {
    expect(mapZernioStatusToLocal('scheduled')).toBe('SCHEDULED')
  })

  it('maps "publishing" → POSTING', () => {
    expect(mapZernioStatusToLocal('publishing')).toBe('POSTING')
  })

  it('maps "draft" → DRAFT', () => {
    expect(mapZernioStatusToLocal('draft')).toBe('DRAFT')
  })

  it('maps unknown / undefined → POSTING (we have a laterPostId, await the next sync)', () => {
    expect(mapZernioStatusToLocal('unknown_future_status')).toBe('POSTING')
    expect(mapZernioStatusToLocal(undefined)).toBe('POSTING')
    expect(mapZernioStatusToLocal(null)).toBe('POSTING')
    expect(mapZernioStatusToLocal('')).toBe('POSTING')
  })
})

describe('extractZernioErrorMessage', () => {
  it('reads top-level "error" string', () => {
    expect(extractZernioErrorMessage({ error: 'Instagram rejected the carousel' })).toBe(
      'Instagram rejected the carousel'
    )
  })

  it('joins "errors" array of strings', () => {
    expect(
      extractZernioErrorMessage({ errors: ['Image 1 invalid', 'Image 5 too large'] })
    ).toBe('Image 1 invalid | Image 5 too large')
  })

  it('prefers "error" over "errors" when both exist', () => {
    expect(
      extractZernioErrorMessage({ error: 'main reason', errors: ['detail a', 'detail b'] })
    ).toBe('main reason')
  })

  it('filters non-string entries from errors array', () => {
    expect(
      extractZernioErrorMessage({ errors: ['valid error', 42, null, { nested: 'object' }] })
    ).toBe('valid error')
  })

  it('returns null when neither field is present or both are empty', () => {
    expect(extractZernioErrorMessage({})).toBeNull()
    expect(extractZernioErrorMessage({ error: '', errors: [] })).toBeNull()
    expect(extractZernioErrorMessage({ error: '   ', errors: [42, null] })).toBeNull()
  })

  it('returns null for non-object payloads', () => {
    expect(extractZernioErrorMessage(null)).toBeNull()
    expect(extractZernioErrorMessage(undefined)).toBeNull()
    expect(extractZernioErrorMessage('string payload')).toBeNull()
    expect(extractZernioErrorMessage(42)).toBeNull()
  })
})
