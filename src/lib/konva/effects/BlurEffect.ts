/**
 * Blur Effect Implementation for Konva Text
 * Uses Konva.Filters.Blur to apply blur effect
 */

import Konva from 'konva';
import type { BlurEffectConfig } from './types';

export class BlurEffect {
  /**
   * Apply blur effect to a text node
   */
  static apply(textNode: Konva.Text, config: BlurEffectConfig): void {
    if (!config.enabled) {
      this.remove(textNode);
      return;
    }

    // Cache the node if not already cached (required for filters)
    if (!textNode.isCached()) {
      textNode.cache();
    }

    // Apply blur filter
    textNode.filters([Konva.Filters.Blur]);
    textNode.blurRadius(config.blurRadius);

    // Re-cache to apply the filter
    textNode.cache();

    // Force layer redraw
    textNode.getLayer()?.batchDraw();
  }

  /**
   * Remove blur effect from a text node
   */
  static remove(textNode: Konva.Text): void {
    // Clear cache and remove filters
    if (textNode.isCached()) {
      textNode.clearCache();
    }

    textNode.filters([]);
    textNode.blurRadius(0);

    // Force layer redraw
    textNode.getLayer()?.batchDraw();
  }

  /**
   * Update blur radius on an already-blurred text node
   */
  static updateBlurRadius(textNode: Konva.Text, blurRadius: number): void {
    if (textNode.isCached()) {
      textNode.clearCache();
    }

    textNode.blurRadius(blurRadius);
    textNode.cache();

    textNode.getLayer()?.batchDraw();
  }

  /**
   * Get current blur configuration from a text node
   */
  static getConfig(textNode: Konva.Text): BlurEffectConfig {
    const filters = textNode.filters() || [];
    const hasBlur = filters.includes(Konva.Filters.Blur);

    return {
      enabled: hasBlur,
      blurRadius: textNode.blurRadius() || 5,
    };
  }
}
