/**
 * Central Effects Manager for Konva Text Effects
 * Coordinates all text effects and manages their state
 */

import Konva from 'konva';
import { BlurEffect } from './BlurEffect';
import { StrokeEffect } from './StrokeEffect';
import { ShadowEffect } from './ShadowEffect';
import { BackgroundEffect } from './BackgroundEffect';
import { CurvedTextEffect } from './CurvedTextEffect';
import type { TextEffectsConfig } from './types';

export class EffectsManager {
  /**
   * Apply all effects to a text node based on configuration
   */
  static applyEffects(
    node: Konva.Text | Konva.TextPath,
    config: TextEffectsConfig,
    layer: Konva.Layer
  ): Konva.Text | Konva.TextPath {
    let currentNode = node;

    // Apply curved text first (converts Text to TextPath)
    if (config.curved) {
      if (config.curved.enabled) {
        if (currentNode instanceof Konva.TextPath) {
          // Already a TextPath, just update curvature
          CurvedTextEffect.updateCurvature(currentNode, config.curved.curvature, layer);
        } else if (currentNode instanceof Konva.Text) {
          // Convert Text to TextPath
          currentNode = CurvedTextEffect.apply(currentNode, config.curved, layer);
        }
      } else if (!config.curved.enabled && currentNode instanceof Konva.TextPath) {
        // Convert TextPath back to Text
        currentNode = CurvedTextEffect.remove(currentNode, layer);
      }
    }

    // Apply other effects (only on Text nodes, not TextPath)
    if (currentNode instanceof Konva.Text && !(currentNode instanceof Konva.TextPath)) {
      if (config.blur) {
        BlurEffect.apply(currentNode, config.blur);
      }

      if (config.stroke) {
        StrokeEffect.apply(currentNode, config.stroke);
      }

      if (config.shadow) {
        ShadowEffect.apply(currentNode, config.shadow);
      }

      if (config.background) {
        BackgroundEffect.apply(currentNode, config.background);
      }
    }

    // Store effects configuration in node
    currentNode.setAttr('effects', config);

    return currentNode;
  }

  /**
   * Get current effects configuration from a node
   */
  static getEffects(node: Konva.Text | Konva.TextPath): TextEffectsConfig {
    // Try to get stored effects config first
    const storedConfig = node.getAttr('effects');
    if (storedConfig) {
      return storedConfig;
    }

    // Otherwise, extract from node properties
    const config: TextEffectsConfig = {};

    if (node instanceof Konva.Text && !(node instanceof Konva.TextPath)) {
      config.blur = BlurEffect.getConfig(node);
      config.stroke = StrokeEffect.getConfig(node);
      config.shadow = ShadowEffect.getConfig(node);
      config.background = BackgroundEffect.getConfig(node);
    }

    config.curved = CurvedTextEffect.getConfig(node);

    return config;
  }

  /**
   * Remove all effects from a node
   */
  static removeAllEffects(node: Konva.Text | Konva.TextPath, layer: Konva.Layer): Konva.Text {
    let currentNode = node;

    // Remove curved text first
    if (currentNode instanceof Konva.TextPath) {
      currentNode = CurvedTextEffect.remove(currentNode, layer);
    }

    // Remove other effects
    if (currentNode instanceof Konva.Text) {
      BlurEffect.remove(currentNode);
      StrokeEffect.remove(currentNode);
      ShadowEffect.remove(currentNode);
      BackgroundEffect.remove(currentNode);
    }

    // Clear effects config
    currentNode.setAttr('effects', {});

    return currentNode;
  }

  /**
   * Update a specific effect on a node
   */
  static updateEffect(
    node: Konva.Text | Konva.TextPath,
    effectType: keyof TextEffectsConfig,
    effectConfig: any,
    layer: Konva.Layer
  ): Konva.Text | Konva.TextPath {
    const currentConfig = this.getEffects(node);
    const newConfig = {
      ...currentConfig,
      [effectType]: effectConfig,
    };

    return this.applyEffects(node, newConfig, layer);
  }

  /**
   * Sync background transform with text node
   * Call this when text is transformed (move, rotate, scale)
   */
  static syncBackgroundTransform(node: Konva.Text): void {
    const config = this.getEffects(node);
    if (config.background?.enabled) {
      BackgroundEffect.syncTransform(node, undefined, config.background.padding);
    }
  }

  /**
   * Clone effects from one node to another
   */
  static cloneEffects(
    sourceNode: Konva.Text | Konva.TextPath,
    targetNode: Konva.Text | Konva.TextPath,
    layer: Konva.Layer
  ): Konva.Text | Konva.TextPath {
    const effectsConfig = this.getEffects(sourceNode);
    return this.applyEffects(targetNode, effectsConfig, layer);
  }

  /**
   * Serialize effects configuration to JSON
   */
  static serializeEffects(node: Konva.Text | Konva.TextPath): string {
    const config = this.getEffects(node);
    return JSON.stringify(config);
  }

  /**
   * Deserialize effects configuration from JSON
   */
  static deserializeEffects(
    node: Konva.Text | Konva.TextPath,
    json: string,
    layer: Konva.Layer
  ): Konva.Text | Konva.TextPath {
    try {
      const config = JSON.parse(json) as TextEffectsConfig;
      return this.applyEffects(node, config, layer);
    } catch (error) {
      console.error('Failed to deserialize effects:', error);
      return node;
    }
  }
}
