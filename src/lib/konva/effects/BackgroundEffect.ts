/**
 * Background Effect Implementation for Konva Text
 * Creates a background rectangle behind text with configurable padding
 */

import Konva from 'konva';
import type { BackgroundEffectConfig } from './types';

export class BackgroundEffect {
  private static BACKGROUND_SUFFIX = '-bg';

  /**
   * Apply background effect to a text node
   */
  static apply(textNode: Konva.Text, config: BackgroundEffectConfig): void {
    if (!config.enabled) {
      this.remove(textNode);
      return;
    }

    const layer = textNode.getLayer();
    if (!layer) return;

    // Remove existing background if any
    this.remove(textNode);

    // Calculate background dimensions based on text size + padding
    const textWidth = textNode.width();
    const textHeight = textNode.height();
    const x = textNode.x() - config.padding;
    const y = textNode.y() - config.padding;
    const width = textWidth + config.padding * 2;
    const height = textHeight + config.padding * 2;

    // Create background rectangle
    const bgRect = new Konva.Rect({
      id: this.getBackgroundId(textNode),
      x: x,
      y: y,
      width: width,
      height: height,
      fill: config.backgroundColor,
      name: 'text-background',
    });

    // Store reference to text node in background
    bgRect.setAttr('linkedTextId', textNode.id());

    // Add background below text
    const textIndex = textNode.getZIndex();
    layer.add(bgRect);
    bgRect.setZIndex(textIndex);
    textNode.setZIndex(textIndex + 1);

    // Force layer redraw
    layer.batchDraw();

    // Sync transformations from text to background
    this.syncTransform(textNode, bgRect, config.padding);
  }

  /**
   * Remove background effect from a text node
   */
  static remove(textNode: Konva.Text): void {
    const layer = textNode.getLayer();
    if (!layer) return;

    const bgId = this.getBackgroundId(textNode);
    const existingBg = layer.findOne(`#${bgId}`);

    if (existingBg) {
      existingBg.destroy();
      layer.batchDraw();
    }
  }

  /**
   * Update background color
   */
  static updateBackgroundColor(textNode: Konva.Text, color: string): void {
    const layer = textNode.getLayer();
    if (!layer) return;

    const bgId = this.getBackgroundId(textNode);
    const bg = layer.findOne(`#${bgId}`) as Konva.Rect;

    if (bg) {
      bg.fill(color);
      layer.batchDraw();
    }
  }

  /**
   * Update background padding
   */
  static updatePadding(textNode: Konva.Text, padding: number): void {
    const layer = textNode.getLayer();
    if (!layer) return;

    const bgId = this.getBackgroundId(textNode);
    const bg = layer.findOne(`#${bgId}`) as Konva.Rect;

    if (bg) {
      const textWidth = textNode.width();
      const textHeight = textNode.height();

      bg.x(textNode.x() - padding);
      bg.y(textNode.y() - padding);
      bg.width(textWidth + padding * 2);
      bg.height(textHeight + padding * 2);

      layer.batchDraw();
    }
  }

  /**
   * Sync background transform with text node
   * Call this when text is moved, rotated, or scaled
   */
  static syncTransform(textNode: Konva.Text, bgRect?: Konva.Rect, padding: number = 10): void {
    const layer = textNode.getLayer();
    if (!layer) return;

    const bg = bgRect || (layer.findOne(`#${this.getBackgroundId(textNode)}`) as Konva.Rect);
    if (!bg) return;

    // Update position
    bg.x(textNode.x() - padding);
    bg.y(textNode.y() - padding);

    // Update size
    const textWidth = textNode.width();
    const textHeight = textNode.height();
    bg.width(textWidth + padding * 2);
    bg.height(textHeight + padding * 2);

    // Sync rotation
    bg.rotation(textNode.rotation());

    // Sync scale
    bg.scaleX(textNode.scaleX());
    bg.scaleY(textNode.scaleY());

    layer.batchDraw();
  }

  /**
   * Get background configuration from a text node
   */
  static getConfig(textNode: Konva.Text): BackgroundEffectConfig {
    const layer = textNode.getLayer();
    if (!layer) {
      return { enabled: false, backgroundColor: '#ffffff', padding: 10 };
    }

    const bgId = this.getBackgroundId(textNode);
    const bg = layer.findOne(`#${bgId}`) as Konva.Rect;

    if (!bg) {
      return { enabled: false, backgroundColor: '#ffffff', padding: 10 };
    }

    // Calculate padding from background and text dimensions
    const padding = (bg.width() - textNode.width()) / 2;

    return {
      enabled: true,
      backgroundColor: bg.fill() as string,
      padding: Math.max(0, padding),
    };
  }

  /**
   * Get background ID for a text node
   */
  private static getBackgroundId(textNode: Konva.Text): string {
    return `${textNode.id()}${this.BACKGROUND_SUFFIX}`;
  }

  /**
   * Get background rect for a text node
   */
  static getBackground(textNode: Konva.Text): Konva.Rect | null {
    const layer = textNode.getLayer();
    if (!layer) return null;

    return layer.findOne(`#${this.getBackgroundId(textNode)}`) as Konva.Rect;
  }
}
