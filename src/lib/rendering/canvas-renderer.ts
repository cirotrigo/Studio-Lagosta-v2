import { createCanvas, GlobalFonts, loadImage, Path2D as NapiPath2D } from '@napi-rs/canvas'
import type { DesignData, FieldValues } from '@/types/template'
import { RenderEngine } from '@/lib/render-engine'

export interface RegisteredFont {
  family: string
  path: string
}

export interface CanvasRendererOptions {
  scaleFactor?: number
  backgroundColor?: string
  fonts?: RegisteredFont[]
  imageCache?: Map<string, CanvasImageSource>
}

export interface CanvasRenderResult {
  buffer: Buffer
  width: number
  height: number
  mimeType: 'image/png'
}

export async function renderDesignToPNG(
  design: DesignData,
  fieldValues: FieldValues = {},
  options: CanvasRendererOptions = {},
): Promise<CanvasRenderResult> {
  const scaleFactor = options.scaleFactor ?? 1
  const width = Math.round(design.canvas.width * scaleFactor)
  const height = Math.round(design.canvas.height * scaleFactor)
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  await registerFonts(options.fonts ?? [])

  await RenderEngine.renderDesign(ctx as unknown as CanvasRenderingContext2D, design, fieldValues, {
    scaleFactor,
    imageLoader: async (source) => (await loadImage(source)) as unknown as CanvasImageSource,
    imageCache: options.imageCache,
    backgroundColor: options.backgroundColor,
    // Mesmas injeções do caminho story-renderer (lib/canvas-renderer.ts):
    // máscara/svg-path precisam de Path2D e os filtros de imagem/blur de
    // texto precisam de canvas offscreen — sem isso este caminho
    // (generate-creatives) divergiria do outro
    createPath2D: (d: string) => new NapiPath2D(d) as unknown as Path2D,
    createCanvas: (w: number, h: number) => createCanvas(w, h) as unknown as HTMLCanvasElement,
  })

  const buffer = canvas.toBuffer('image/png')
  return { buffer, width, height, mimeType: 'image/png' }
}

async function registerFonts(fonts: RegisteredFont[]): Promise<void> {
  if (!fonts.length) return

  const families = new Set<string>((GlobalFonts as unknown as { families?: string[] }).families ?? [])

  for (const font of fonts) {
    if (families.has(font.family)) continue
    try {
      GlobalFonts.registerFromPath(font.path, font.family)
      families.add(font.family)
    } catch (error) {
      console.warn(`[canvas-renderer] Failed to register font ${font.family}:`, error)
    }
  }
}
