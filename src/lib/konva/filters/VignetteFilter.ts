import Konva from 'konva'
import { Factory } from 'konva/lib/Factory'

/**
 * Custom Konva Filter: Vignette
 *
 * Darkens the edges of the image creating a professional vignette effect.
 * Uses radial gradient from center to edges.
 *
 * @param imageData - Canvas ImageData object
 */
export function VignetteFilter(this: any, imageData: ImageData) {
  const data = imageData.data
  const vignette = typeof this.vignette === 'function' ? this.vignette() : 0 // 0 to 1
  const width = imageData.width
  const height = imageData.height

  if (vignette === 0) return

  // Center point
  const centerX = width / 2
  const centerY = height / 2

  // Maximum distance from center (diagonal)
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY)

  // Vignette parameters
  const vignetteIntensity = vignette * 1.2 // Max darkening amount (increased for more aggressive effect)
  const vignetteSize = 0.5 // Start point (0.5 = 50% from center, starts earlier)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4

      // Calculate distance from center
      const dx = x - centerX
      const dy = y - centerY
      const distance = Math.sqrt(dx * dx + dy * dy)

      // Normalize distance (0 at center, 1 at edges)
      const normalizedDistance = distance / maxDistance

      // Calculate vignette factor (smooth transition)
      let vignetteFactor = 1
      if (normalizedDistance > vignetteSize) {
        // Smooth curve using cubic function for more aggressive darkening
        const t = (normalizedDistance - vignetteSize) / (1 - vignetteSize)
        vignetteFactor = 1 - (vignetteIntensity * Math.pow(t, 1.5))
      }

      // Apply darkening
      data[index] = Math.max(0, Math.round(data[index] * vignetteFactor))
      data[index + 1] = Math.max(0, Math.round(data[index + 1] * vignetteFactor))
      data[index + 2] = Math.max(0, Math.round(data[index + 2] * vignetteFactor))
      // Alpha channel (index + 3) remains unchanged
    }
  }
}

// Register custom attribute with Konva.Factory
// @ts-ignore - Adding custom attribute
Factory.addGetterSetter(Konva.Image, 'vignette', 0)

// Register the filter with Konva
// @ts-ignore - Extending Konva.Filters
Konva.Filters.Vignette = VignetteFilter
