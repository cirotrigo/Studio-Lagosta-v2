import Konva from 'konva'
import { Factory } from 'konva/lib/Factory'
import { applyVignette } from './apply'

/**
 * Custom Konva Filter: Vignette
 *
 * Wrapper Konva sobre o pixel loop compartilhado em `apply.ts` — o render
 * server-side aplica o MESMO loop na arte agendada.
 *
 * @param imageData - Canvas ImageData object
 */
export function VignetteFilter(this: any, imageData: ImageData) {
  const vignette = typeof this.vignette === 'function' ? this.vignette() : 0 // 0 to 1
  applyVignette(imageData.data, imageData.width, imageData.height, vignette)
}

// Register custom attribute with Konva.Factory
// @ts-expect-error - Adding custom attribute
Factory.addGetterSetter(Konva.Image, 'vignette', 0)

// Register the filter with Konva
// @ts-expect-error - Extending Konva.Filters
Konva.Filters.Vignette = VignetteFilter
