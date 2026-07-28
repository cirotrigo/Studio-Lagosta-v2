import Konva from 'konva'
import { Factory } from 'konva/lib/Factory'
import { applyHighlightsShadows } from './apply'

/**
 * Custom Konva Filter: Highlights and Shadows
 *
 * Wrapper Konva sobre o pixel loop compartilhado em `apply.ts` — o render
 * server-side aplica o MESMO loop na arte agendada.
 *
 * @param imageData - Canvas ImageData object
 */
export function HighlightsShadowsFilter(this: any, imageData: ImageData) {
  const highlights = typeof this.highlights === 'function' ? this.highlights() : 0 // -100 to 100
  const shadows = typeof this.shadows === 'function' ? this.shadows() : 0 // -100 to 100
  applyHighlightsShadows(imageData.data, highlights, shadows)
}

// Register custom attributes with Konva.Factory
// @ts-expect-error - Adding custom attribute
Factory.addGetterSetter(Konva.Image, 'highlights', 0)
// @ts-expect-error - Adding custom attribute
Factory.addGetterSetter(Konva.Image, 'shadows', 0)

// Register the filter with Konva
// @ts-expect-error - Extending Konva.Filters
Konva.Filters.HighlightsShadows = HighlightsShadowsFilter
