/**
 * Types and interfaces for Konva text effects system
 */

export interface BlurEffectConfig {
  enabled: boolean;
  blurRadius: number; // 0-20
}

export interface StrokeEffectConfig {
  enabled: boolean;
  strokeColor: string;
  strokeWidth: number; // 0-10
}

export interface ShadowEffectConfig {
  enabled: boolean;
  shadowColor: string;
  shadowBlur: number; // 0-20
  shadowOffsetX: number; // -50 to 50
  shadowOffsetY: number; // -50 to 50
  shadowOpacity: number; // 0-1
}

export interface BackgroundEffectConfig {
  enabled: boolean;
  backgroundColor: string;
  padding: number; // 0-20
}

export interface CurvedTextEffectConfig {
  enabled: boolean;
  curvature: number; // -180 to 180 degrees
}

export interface TextEffectsConfig {
  blur?: BlurEffectConfig;
  stroke?: StrokeEffectConfig;
  shadow?: ShadowEffectConfig;
  background?: BackgroundEffectConfig;
  curved?: CurvedTextEffectConfig;
}

export const DEFAULT_EFFECTS_CONFIG: TextEffectsConfig = {
  blur: {
    enabled: false,
    blurRadius: 5,
  },
  stroke: {
    enabled: false,
    strokeColor: '#000000',
    strokeWidth: 2,
  },
  shadow: {
    enabled: false,
    shadowColor: '#000000',
    shadowBlur: 10,
    shadowOffsetX: 5,
    shadowOffsetY: 5,
    shadowOpacity: 0.5,
  },
  background: {
    enabled: false,
    backgroundColor: '#ffffff',
    padding: 10,
  },
  curved: {
    enabled: false,
    curvature: 45,
  },
};
