import Konva from 'konva'
import { Factory } from 'konva/lib/Factory'
import { applyWhitesBlacks } from './apply'

/**
 * Custom Konva Filter: Whites and Blacks
 *
 * Wrapper Konva sobre o pixel loop compartilhado em `apply.ts` — o render
 * server-side aplica o MESMO loop na arte agendada.
 *
 * @param imageData - Canvas ImageData object
 */
export function WhitesBlacksFilter(this: any, imageData: ImageData) {
  const whites = typeof this.whites === 'function' ? this.whites() : 0 // -100 to 100
  const blacks = typeof this.blacks === 'function' ? this.blacks() : 0 // -100 to 100
  applyWhitesBlacks(imageData.data, whites, blacks)
}

// Register custom attributes with Konva.Factory
// @ts-expect-error - Adding custom attribute
Factory.addGetterSetter(Konva.Image, 'whites', 0)
// @ts-expect-error - Adding custom attribute
Factory.addGetterSetter(Konva.Image, 'blacks', 0)

// Register the filter with Konva
// @ts-expect-error - Extending Konva.Filters
Konva.Filters.WhitesBlacks = WhitesBlacksFilter
