/**
 * Shadow Effect Implementation for Konva Text
 * Applies configurable shadow to text
 */

import Konva from 'konva';
import type { ShadowEffectConfig } from './types';

export class ShadowEffect {
  /**
   * Apply shadow effect to a text node
   */
  static apply(textNode: Konva.Text, config: ShadowEffectConfig): void {
    if (!config.enabled) {
      this.remove(textNode);
      return;
    }

    textNode.shadowColor(config.shadowColor);
    textNode.shadowBlur(config.shadowBlur);
    textNode.shadowOffsetX(config.shadowOffsetX);
    textNode.shadowOffsetY(config.shadowOffsetY);
    textNode.shadowOpacity(config.shadowOpacity);

    // Force layer redraw
    textNode.getLayer()?.batchDraw();
  }

  /**
   * Remove shadow effect from a text node
   */
  static remove(textNode: Konva.Text): void {
    textNode.shadowColor(undefined);
    textNode.shadowBlur(0);
    textNode.shadowOffsetX(0);
    textNode.shadowOffsetY(0);
    textNode.shadowOpacity(1);

    // Force layer redraw
    textNode.getLayer()?.batchDraw();
  }

  /**
   * Update shadow color
   */
  static updateShadowColor(textNode: Konva.Text, color: string): void {
    textNode.shadowColor(color);
    textNode.getLayer()?.batchDraw();
  }

  /**
   * Update shadow blur
   */
  static updateShadowBlur(textNode: Konva.Text, blur: number): void {
    textNode.shadowBlur(blur);
    textNode.getLayer()?.batchDraw();
  }

  /**
   * Update shadow offset
   */
  static updateShadowOffset(textNode: Konva.Text, offsetX: number, offsetY: number): void {
    textNode.shadowOffsetX(offsetX);
    textNode.shadowOffsetY(offsetY);
    textNode.getLayer()?.batchDraw();
  }

  /**
   * Update shadow opacity
   */
  static updateShadowOpacity(textNode: Konva.Text, opacity: number): void {
    textNode.shadowOpacity(opacity);
    textNode.getLayer()?.batchDraw();
  }

  /**
   * Get current shadow configuration from a text node
   */
  static getConfig(textNode: Konva.Text): ShadowEffectConfig {
    const shadowColor = textNode.shadowColor();
    const shadowBlur = textNode.shadowBlur() || 0;

    return {
      enabled: !!shadowColor && shadowBlur > 0,
      shadowColor: shadowColor || '#000000',
      shadowBlur: shadowBlur,
      shadowOffsetX: textNode.shadowOffsetX() || 0,
      shadowOffsetY: textNode.shadowOffsetY() || 0,
      shadowOpacity: textNode.shadowOpacity() || 0.5,
    };
  }
}
