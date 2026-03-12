import { describe, test, expect } from 'vitest'
import { buildDraftLayout, resolveLayoutWithMeasurements } from '../../lib/layout-engine'
import type { MeasuredLayout, FontSources } from '../../lib/layout-engine'
import inputFixture from './fixtures/wine-vix-story-input.json'

function mockMeasurements(
  draft: ReturnType<typeof buildDraftLayout>,
  measuredHeights: Record<string, number>,
): MeasuredLayout {
  return {
    slots: draft.elements.map(el => ({
      slotName: el.slotName,
      measuredHeight: measuredHeights[el.slotName] ?? el.estimatedHeight,
      adjustedFontSize: el.sizePx,
      lines: [el.text], // Simplified: one line per slot for golden test
      overflow: false,
      fontFallbackUsed: false,
    })),
  }
}

describe('Wine Vix Story - Golden Layout', () => {
  test('buildDraftLayout is deterministic', () => {
    const draft1 = buildDraftLayout(
      inputFixture.slots,
      inputFixture.template as any,
      inputFixture.format,
      inputFixture.fontSources as FontSources,
      false,
    )
    const draft2 = buildDraftLayout(
      inputFixture.slots,
      inputFixture.template as any,
      inputFixture.format,
      inputFixture.fontSources as FontSources,
      false,
    )

    // C22 invariant 1: determinism
    expect(draft1.elements.length).toBe(draft2.elements.length)
    for (let i = 0; i < draft1.elements.length; i++) {
      expect(draft1.elements[i].slotName).toBe(draft2.elements[i].slotName)
      expect(draft1.elements[i].y_draft).toBe(draft2.elements[i].y_draft)
      expect(draft1.elements[i].sizePx).toBe(draft2.elements[i].sizePx)
      expect(draft1.elements[i].x).toBe(draft2.elements[i].x)
    }
  })

  test('resolveLayoutWithMeasurements produces valid final layout', () => {
    const draft = buildDraftLayout(
      inputFixture.slots,
      inputFixture.template as any,
      inputFixture.format,
      inputFixture.fontSources as FontSources,
      false,
    )

    const measurements = mockMeasurements(draft, inputFixture.measuredHeights)
    const finalLayout = resolveLayoutWithMeasurements(draft, measurements)

    // All 5 slots should be present
    expect(finalLayout.elements.length).toBe(5)

    // Slot names should be in correct order
    const slotNames = finalLayout.elements.map(el => el.slotName)
    expect(slotNames).toContain('eyebrow')
    expect(slotNames).toContain('title')
    expect(slotNames).toContain('description')
    expect(slotNames).toContain('cta')
    expect(slotNames).toContain('footer')

    // Positions should be within canvas bounds
    for (const el of finalLayout.elements) {
      expect(el.y_final).toBeGreaterThanOrEqual(0)
      expect(el.y_final).toBeLessThan(draft.canvas.height)
    }

    // Top group: eyebrow should be above title, title above description
    const eyebrow = finalLayout.elements.find(e => e.slotName === 'eyebrow')!
    const title = finalLayout.elements.find(e => e.slotName === 'title')!
    const description = finalLayout.elements.find(e => e.slotName === 'description')!
    expect(eyebrow.y_final).toBeLessThan(title.y_final)
    expect(title.y_final).toBeLessThan(description.y_final)

    // Bottom group: cta should be above footer
    const footer = finalLayout.elements.find(e => e.slotName === 'footer')!
    const cta = finalLayout.elements.find(e => e.slotName === 'cta')!
    expect(cta.y_final).toBeLessThan(footer.y_final)
  })

  test('layout engine does not depend on LLM (C22 invariant 3)', () => {
    // Engine should work with pure data — no external calls
    const draft = buildDraftLayout(
      inputFixture.slots,
      inputFixture.template as any,
      inputFixture.format,
      inputFixture.fontSources as FontSources,
      false,
    )

    expect(draft.elements.length).toBeGreaterThan(0)
    expect(draft.canvas.width).toBe(1080)
    expect(draft.canvas.height).toBe(1920)
  })

  test('strictMode throws on overflow', () => {
    const draft = buildDraftLayout(
      inputFixture.slots,
      inputFixture.template as any,
      inputFixture.format,
      inputFixture.fontSources as FontSources,
      true,
    )

    // Simulate overflow in one slot
    const measurements: MeasuredLayout = {
      slots: draft.elements.map(el => ({
        slotName: el.slotName,
        measuredHeight: el.slotName === 'title' ? 9999 : inputFixture.measuredHeights[el.slotName as keyof typeof inputFixture.measuredHeights] ?? el.estimatedHeight,
        adjustedFontSize: el.sizePx,
        lines: [el.text],
        overflow: el.slotName === 'title', // title overflows
        fontFallbackUsed: false,
      })),
    }

    expect(() => {
      resolveLayoutWithMeasurements(draft, measurements, { strictMode: true })
    }).toThrow()
  })
})
