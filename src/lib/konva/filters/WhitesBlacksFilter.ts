import Konva from 'konva'
import { Factory } from 'konva/lib/Factory'

/**
 * Custom Konva Filter: Whites and Blacks
 *
 * Adjusts the white and black points of the image.
 * Controls extreme luminosity values similar to levels adjustment.
 *
 * @param imageData - Canvas ImageData object
 */
export function WhitesBlacksFilter(this: any, imageData: ImageData) {
  const data = imageData.data
  const whites = typeof this.whites === 'function' ? this.whites() : 0 // -100 to 100
  const blacks = typeof this.blacks === 'function' ? this.blacks() : 0 // -100 to 100

  // Convert to 0-1 range
  const whitesAmount = whites / 100
  const blacksAmount = blacks / 100

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    // Calculate luminance (perceived brightness)
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    const normalizedLuminance = luminance / 255

    // Apply whites adjustment to very bright areas (luminance > 0.7)
    if (normalizedLuminance > 0.7 && whites !== 0) {
      // Weight increases exponentially for brightest pixels
      const weight = Math.pow((normalizedLuminance - 0.7) / 0.3, 2)
      const adjustment = whitesAmount * weight * 60

      data[i] = Math.max(0, Math.min(255, r + adjustment))
      data[i + 1] = Math.max(0, Math.min(255, g + adjustment))
      data[i + 2] = Math.max(0, Math.min(255, b + adjustment))
    }

    // Apply blacks adjustment to very dark areas (luminance < 0.3)
    if (normalizedLuminance < 0.3 && blacks !== 0) {
      // Weight increases exponentially for darkest pixels
      const weight = Math.pow((0.3 - normalizedLuminance) / 0.3, 2)
      const adjustment = blacksAmount * weight * 60

      data[i] = Math.max(0, Math.min(255, r + adjustment))
      data[i + 1] = Math.max(0, Math.min(255, g + adjustment))
      data[i + 2] = Math.max(0, Math.min(255, b + adjustment))
    }
  }
}

// Register custom attributes with Konva.Factory
// @ts-ignore - Adding custom attribute
Factory.addGetterSetter(Konva.Image, 'whites', 0)
// @ts-ignore - Adding custom attribute
Factory.addGetterSetter(Konva.Image, 'blacks', 0)

// Register the filter with Konva
// @ts-ignore - Extending Konva.Filters
Konva.Filters.WhitesBlacks = WhitesBlacksFilter
