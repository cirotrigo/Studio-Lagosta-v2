import type {
  ArtFormat,
  KonvaPage,
  KonvaTemplateDocument,
  Layer,
  KonvaShapeLayer,
  KonvaTextLayer,
} from '@/types/template'

export interface ArtFormatPreset {
  format: ArtFormat
  label: string
  width: number
  height: number
}

export const ART_FORMAT_PRESETS: Record<ArtFormat, ArtFormatPreset> = {
  STORY: {
    format: 'STORY',
    label: 'Story',
    width: 1080,
    height: 1920,
  },
  FEED_PORTRAIT: {
    format: 'FEED_PORTRAIT',
    label: 'Feed Portrait',
    width: 1080,
    height: 1350,
  },
  SQUARE: {
    format: 'SQUARE',
    label: 'Square',
    width: 1080,
    height: 1080,
  },
}

export function getArtFormatPreset(format: ArtFormat): ArtFormatPreset {
  return ART_FORMAT_PRESETS[format]
}

function scalePoints(points: number[] | undefined, scaleX: number, scaleY: number): number[] | undefined {
  if (!points?.length) {
    return points
  }

  return points.map((point, index) => (index % 2 === 0 ? point * scaleX : point * scaleY))
}

export function resizeLayerForFormat(layer: Layer, scaleX: number, scaleY: number): Layer {
  const resized: Layer = {
    ...layer,
    x: Math.round(layer.x * scaleX),
    y: Math.round(layer.y * scaleY),
    width: layer.width !== undefined ? Math.round(layer.width * scaleX) : layer.width,
    height: layer.height !== undefined ? Math.round(layer.height * scaleY) : layer.height,
  }

  if (layer.type === 'text' || layer.type === 'rich-text') {
    const textLayer = layer as KonvaTextLayer
    return {
      ...(resized as KonvaTextLayer),
      textStyle: textLayer.textStyle
        ? {
            ...textLayer.textStyle,
            fontSize: textLayer.textStyle.fontSize
              ? Math.max(10, Math.round(textLayer.textStyle.fontSize * Math.min(scaleX, scaleY)))
              : textLayer.textStyle.fontSize,
            minFontSize: textLayer.textStyle.minFontSize
              ? Math.max(8, Math.round(textLayer.textStyle.minFontSize * Math.min(scaleX, scaleY)))
              : textLayer.textStyle.minFontSize,
            maxFontSize: textLayer.textStyle.maxFontSize
              ? Math.max(8, Math.round(textLayer.textStyle.maxFontSize * Math.min(scaleX, scaleY)))
              : textLayer.textStyle.maxFontSize,
            letterSpacing: textLayer.textStyle.letterSpacing
              ? Math.round(textLayer.textStyle.letterSpacing * scaleX * 100) / 100
              : textLayer.textStyle.letterSpacing,
          }
        : textLayer.textStyle,
    } as KonvaTextLayer
  }

  if (layer.type === 'shape') {
    const shapeLayer = layer as KonvaShapeLayer
    return {
      ...(resized as KonvaShapeLayer),
      strokeWidth: shapeLayer.strokeWidth
        ? Math.max(1, Math.round(shapeLayer.strokeWidth * Math.min(scaleX, scaleY)))
        : shapeLayer.strokeWidth,
      cornerRadius: shapeLayer.cornerRadius
        ? Math.round(shapeLayer.cornerRadius * Math.min(scaleX, scaleY))
        : shapeLayer.cornerRadius,
      points: scalePoints(shapeLayer.points, scaleX, scaleY),
    } as KonvaShapeLayer
  }

  return resized
}

export function resizePageToFormat(page: KonvaPage, format: ArtFormat, order = page.order): KonvaPage {
  const preset = getArtFormatPreset(format)
  const scaleX = page.width > 0 ? preset.width / page.width : 1
  const scaleY = page.height > 0 ? preset.height / page.height : 1

  return {
    ...page,
    width: preset.width,
    height: preset.height,
    order,
    layers: page.layers.map((layer) => resizeLayerForFormat(layer, scaleX, scaleY)),
  }
}

export function applyFormatToDocument(doc: KonvaTemplateDocument, format: ArtFormat): KonvaTemplateDocument {
  return {
    ...doc,
    format,
    design: {
      ...doc.design,
      pages: doc.design.pages
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((page, index) => resizePageToFormat(page, format, index)),
    },
  }
}
