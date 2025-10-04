/**
 * Curved Text Effect Implementation for Konva Text
 * Converts text to TextPath to create curved/arc text effect
 */

import Konva from 'konva';
import type { CurvedTextEffectConfig } from './types';

export class CurvedTextEffect {
  private static TEXTPATH_SUFFIX = '-curved';

  /**
   * Apply curved text effect by converting Text to TextPath
   */
  static apply(
    textNode: Konva.Text,
    config: CurvedTextEffectConfig,
    layer: Konva.Layer
  ): Konva.TextPath | Konva.Text {
    if (!config.enabled) {
      return this.remove(textNode, layer);
    }

    // Get text properties to preserve
    const text = textNode.text();
    const fontSize = textNode.fontSize();
    const fontFamily = textNode.fontFamily();
    const fill = textNode.fill();
    const x = textNode.x();
    const y = textNode.y();
    const rotation = textNode.rotation();
    const scaleX = textNode.scaleX();
    const scaleY = textNode.scaleY();
    const id = textNode.id();
    const draggable = textNode.draggable();
    const opacity = textNode.opacity();
    const listening = textNode.listening();

    // Calculate text width to determine appropriate radius
    const textWidth = textNode.width();
    const textLength = text.length;

    // Adjust radius based on text width and curvature
    // Larger curvature = smaller radius for tighter curves
    const baseRadius = Math.max(100, textWidth * 0.8);
    const curvatureFactor = Math.abs(config.curvature) / 180;
    const radius = baseRadius * (1 - curvatureFactor * 0.5);

    // Create SVG arc path
    const pathData = this.createArcPath(radius, config.curvature, textWidth);

    console.log('[CurvedText] Creating TextPath:', {
      text,
      curvature: config.curvature,
      radius,
      pathData,
    });

    // Create TextPath
    const textPath = new Konva.TextPath({
      id: id,
      x: x,
      y: y,
      text: text,
      fontSize: fontSize,
      fontFamily: fontFamily,
      fill: fill,
      rotation: rotation,
      scaleX: scaleX,
      scaleY: scaleY,
      draggable: draggable,
      opacity: opacity,
      listening: listening,
      data: pathData,
      name: 'curved-text',
    });

    console.log('[CurvedText] TextPath created:', {
      id,
      text,
      fontSize,
      x,
      y,
      hasPath: !!pathData,
      className: textPath.getClassName(),
    });

    // Store ALL original text node attrs for restoration
    const allAttrs = textNode.getAttrs();
    textPath.setAttr('originalTextAttrs', {
      ...allAttrs,
      id,
      text,
      fontSize,
      fontFamily,
      fill,
      x,
      y,
      rotation,
      scaleX,
      scaleY,
      draggable,
      opacity,
      listening,
    });

    // Store curvature value
    textPath.setAttr('curvature', config.curvature);

    // Replace text node with textPath
    const textIndex = textNode.getZIndex();
    textNode.destroy();
    layer.add(textPath);
    textPath.setZIndex(textIndex);

    layer.batchDraw();

    return textPath;
  }

  /**
   * Remove curved text effect by converting TextPath back to Text
   */
  static remove(node: Konva.Text | Konva.TextPath, layer: Konva.Layer): Konva.Text {
    // If already a regular Text node, return as-is
    if (node instanceof Konva.Text && !(node instanceof Konva.TextPath)) {
      return node;
    }

    // Get stored original attributes or current attributes
    const originalAttrs = node.getAttr('originalTextAttrs') || {
      text: node.text(),
      fontSize: node.fontSize(),
      fontFamily: node.fontFamily(),
      fill: node.fill(),
      x: node.x(),
      y: node.y(),
      rotation: node.rotation(),
      scaleX: node.scaleX(),
      scaleY: node.scaleY(),
      id: node.id(),
      draggable: node.draggable(),
    };

    // Create regular Text node
    const textNode = new Konva.Text({
      id: originalAttrs.id,
      x: originalAttrs.x,
      y: originalAttrs.y,
      text: originalAttrs.text,
      fontSize: originalAttrs.fontSize,
      fontFamily: originalAttrs.fontFamily,
      fill: originalAttrs.fill,
      rotation: originalAttrs.rotation,
      scaleX: originalAttrs.scaleX,
      scaleY: originalAttrs.scaleY,
      draggable: originalAttrs.draggable,
    });

    // Replace textPath with text node
    const nodeIndex = node.getZIndex();
    node.destroy();
    layer.add(textNode);
    textNode.setZIndex(nodeIndex);

    layer.batchDraw();

    return textNode;
  }

  /**
   * Update curvature of an existing curved text
   */
  static updateCurvature(
    textPath: Konva.TextPath,
    curvature: number,
    layer: Konva.Layer
  ): void {
    // Get text width for path calculation
    const text = textPath.text();
    const fontSize = textPath.fontSize();

    // Estimate text width (rough approximation)
    const textWidth = text.length * fontSize * 0.6;

    // Calculate radius
    const baseRadius = Math.max(100, textWidth * 0.8);
    const curvatureFactor = Math.abs(curvature) / 180;
    const radius = baseRadius * (1 - curvatureFactor * 0.5);

    const pathData = this.createArcPath(radius, curvature, textWidth);

    textPath.data(pathData);
    textPath.setAttr('curvature', curvature);

    layer.batchDraw();
  }

  /**
   * Convert polar coordinates to Cartesian coordinates
   * Standard helper function for SVG arc paths
   */
  private static polarToCartesian(
    centerX: number,
    centerY: number,
    radius: number,
    angleInDegrees: number
  ): { x: number; y: number } {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;

    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  }

  /**
   * Create SVG arc path using standard describeArc pattern
   * Based on Stack Overflow solution and Konva documentation
   *
   * @param x - Center X coordinate
   * @param y - Center Y coordinate
   * @param radius - Radius of the arc
   * @param startAngle - Start angle in degrees
   * @param endAngle - End angle in degrees
   */
  private static describeArc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ): string {
    const start = this.polarToCartesian(x, y, radius, endAngle);
    const end = this.polarToCartesian(x, y, radius, startAngle);

    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    const d = [
      'M',
      start.x,
      start.y,
      'A',
      radius,
      radius,
      0,
      largeArcFlag,
      0,
      end.x,
      end.y,
    ].join(' ');

    return d;
  }

  /**
   * Create SVG arc path for curved text
   * Creates a smooth arc that starts at (0,0) and curves up or down
   *
   * @param radius - The radius of the arc (not used, we calculate from curvature)
   * @param curvature - Curvature in degrees (-180 to 180)
   * @param textWidth - Width of the text to determine arc length
   */
  private static createArcPath(radius: number, curvature: number, textWidth: number): string {
    // If curvature is 0, return a straight horizontal line
    if (curvature === 0) {
      return `M 0,0 L ${textWidth},0`;
    }

    // Calcular a altura do arco baseado diretamente na curvatura
    // Quanto maior a curvatura, maior a altura do arco
    // Usar uma escala mais agressiva para arcos visíveis
    // curvature vai de -180 a 180, normalizar para 0-1
    const curvatureNormalized = Math.abs(curvature) / 180;

    // A altura do arco deve ser proporcional tanto à curvatura quanto à largura do texto
    // Fórmula: altura = largura × fator_curvatura
    // Para curvatura de 45° (0.25 normalizado), queremos ~25% da largura
    // Para curvatura de 90° (0.5 normalizado), queremos ~50% da largura
    // Para curvatura de 180° (1.0 normalizado), queremos ~100% da largura
    const arcHeight = textWidth * curvatureNormalized;

    // Usar quadratic curve (Q) que é mais simples e previsível
    // Q: control_x control_y, end_x end_y
    // O ponto de controle fica no meio horizontalmente e desloca verticalmente
    const controlX = textWidth / 2;
    const controlY = curvature > 0 ? -arcHeight : arcHeight;

    const path = `M 0,0 Q ${controlX},${controlY} ${textWidth},0`;

    console.log('[CurvedText] Path created:', {
      curvature,
      textWidth,
      curvatureNormalized: curvatureNormalized.toFixed(3),
      arcHeight: arcHeight.toFixed(2),
      controlX,
      controlY: controlY.toFixed(2),
      path,
    });

    return path;
  }

  /**
   * Get current curved text configuration
   */
  static getConfig(node: Konva.Text | Konva.TextPath): CurvedTextEffectConfig {
    const isCurved = node instanceof Konva.TextPath;

    return {
      enabled: isCurved,
      curvature: isCurved ? node.getAttr('curvature') || 45 : 45,
    };
  }

  /**
   * Check if a node is a curved text
   */
  static isCurvedText(node: Konva.Node): node is Konva.TextPath {
    return node instanceof Konva.TextPath;
  }
}
