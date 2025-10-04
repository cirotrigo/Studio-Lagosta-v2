/**
 * Stroke Effect Implementation for Konva Text
 * Applies stroke (outline) to text
 */

import Konva from 'konva';
import type { StrokeEffectConfig } from './types';

export class StrokeEffect {
  /**
   * Apply stroke effect to a text node
   */
  static apply(textNode: Konva.Text, config: StrokeEffectConfig): void {
    if (!config.enabled) {
      this.remove(textNode);
      return;
    }

    textNode.stroke(config.strokeColor);
    textNode.strokeWidth(config.strokeWidth);

    // Force layer redraw
    textNode.getLayer()?.batchDraw();
  }

  /**
   * Remove stroke effect from a text node
   */
  static remove(textNode: Konva.Text): void {
    textNode.stroke(undefined);
    textNode.strokeWidth(0);

    // Force layer redraw
    textNode.getLayer()?.batchDraw();
  }

  /**
   * Update stroke color
   */
  static updateStrokeColor(textNode: Konva.Text, color: string): void {
    textNode.stroke(color);
    textNode.getLayer()?.batchDraw();
  }

  /**
   * Update stroke width
   */
  static updateStrokeWidth(textNode: Konva.Text, width: number): void {
    textNode.strokeWidth(width);
    textNode.getLayer()?.batchDraw();
  }

  /**
   * Get current stroke configuration from a text node
   */
  static getConfig(textNode: Konva.Text): StrokeEffectConfig {
    const stroke = textNode.stroke();
    const strokeWidth = textNode.strokeWidth() || 0;

    return {
      enabled: !!stroke && strokeWidth > 0,
      strokeColor: typeof stroke === 'string' ? stroke : '#000000',
      strokeWidth: strokeWidth,
    };
  }
}
