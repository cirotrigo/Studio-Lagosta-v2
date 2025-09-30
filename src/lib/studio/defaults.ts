import type { DesignData, Layer } from '@/types/template'

export type TemplateKind = 'STORY' | 'FEED' | 'SQUARE'

const DIMENSIONS: Record<TemplateKind, { width: number; height: number }> = {
  STORY: { width: 1080, height: 1920 },
  FEED: { width: 1080, height: 1350 },
  SQUARE: { width: 1080, height: 1080 },
}

export function getDefaultCanvas(kind: TemplateKind) {
  const { width, height } = DIMENSIONS[kind]
  return {
    width,
    height,
    backgroundColor: '#FFFFFF',
  }
}

export function getDefaultLayersForType(kind: TemplateKind): Layer[] {
  const canvas = DIMENSIONS[kind]
  const baseLayer: Layer = {
    id: 'background',
    type: 'gradient',
    name: 'Background',
    visible: true,
    locked: false,
    order: 0,
    position: { x: 0, y: 0 },
    size: { width: canvas.width, height: canvas.height },
    style: {
      gradientType: 'linear',
      gradientAngle: 90,
      gradientStops: [
        { color: '#F5F5F5', position: 0 },
        { color: '#FFFFFF', position: 1 },
      ],
    },
  }

  return [baseLayer]
}

export function createBlankDesign(kind: TemplateKind): DesignData {
  return {
    canvas: getDefaultCanvas(kind),
    layers: getDefaultLayersForType(kind),
  }
}
