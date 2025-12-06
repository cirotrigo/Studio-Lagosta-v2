import Konva from 'konva'
import { Factory } from 'konva/lib/Factory'

/**
 * Custom Konva Filter: Highlights and Shadows
 *
 * Adjusts bright and dark tones separately based on luminance.
 * Similar to Lightroom/Photoshop highlights and shadows controls.
 *
 * @param imageData - Canvas ImageData object
 */
export function HighlightsShadowsFilter(this: any, imageData: ImageData) {
  const data = imageData.data
  const highlights = typeof this.highlights === 'function' ? this.highlights() : 0 // -100 to 100
  const shadows = typeof this.shadows === 'function' ? this.shadows() : 0 // -100 to 100

  // Convert to 0-1 range
  const highlightsAmount = highlights / 100
  const shadowsAmount = shadows / 100

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    // Calculate luminance (perceived brightness)
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    const normalizedLuminance = luminance / 255

    // Apply highlights adjustment to bright areas (luminance > 0.5)
    if (normalizedLuminance > 0.5 && highlights !== 0) {
      // Weight increases for brighter pixels
      const weight = (normalizedLuminance - 0.5) * 2
      const adjustment = highlightsAmount * weight * 50

      data[i] = Math.max(0, Math.min(255, r + adjustment))
      data[i + 1] = Math.max(0, Math.min(255, g + adjustment))
      data[i + 2] = Math.max(0, Math.min(255, b + adjustment))
    }

    // Apply shadows adjustment to dark areas (luminance < 0.5)
    if (normalizedLuminance < 0.5 && shadows !== 0) {
      // Weight increases for darker pixels
      const weight = (0.5 - normalizedLuminance) * 2
      const adjustment = shadowsAmount * weight * 50

      data[i] = Math.max(0, Math.min(255, r + adjustment))
      data[i + 1] = Math.max(0, Math.min(255, g + adjustment))
      data[i + 2] = Math.max(0, Math.min(255, b + adjustment))
    }
  }
}

// Register custom attributes with Konva.Factory
// @ts-ignore - Adding custom attribute
Factory.addGetterSetter(Konva.Image, 'highlights', 0)
// @ts-ignore - Adding custom attribute
Factory.addGetterSetter(Konva.Image, 'shadows', 0)

// Register the filter with Konva
// @ts-ignore - Extending Konva.Filters
Konva.Filters.HighlightsShadows = HighlightsShadowsFilter
