// src/lib/canvas-renderer.ts
// Backend Canvas Renderer using @napi-rs/canvas

import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import type { Canvas, SKRSContext2D, Image } from '@napi-rs/canvas'
import { RenderEngine } from './render-engine'
import { FONT_CONFIG } from './font-config'
import type { DesignData, FieldValues } from '@/types/template'
import type { FontValidationResult } from './render-engine'

export class CanvasRenderer {
  private canvas: Canvas
  private ctx: SKRSContext2D
  private width: number
  private height: number
  private imageCache: Map<string, Image>
  private fontsRegistered = false

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.canvas = createCanvas(width, height)
    this.ctx = this.canvas.getContext('2d') as SKRSContext2D
    this.imageCache = new Map()

    // Registrar fontes padrão na primeira instância
    if (!this.fontsRegistered) {
      this.registerDefaultFonts()
    }
  }

  /**
   * Registra fontes padrão do sistema
   */
  private registerDefaultFonts(): void {
    // Montserrat vem empacotada no repositório, um arquivo por peso — o
    // matcher do napi-rs escolhe o arquivo certo pelo peso pedido.
    // (fs/path ficam aqui, e não em font-config, que também roda no client)
    const baseDir = nodePath.join(process.cwd(), FONT_CONFIG.BUNDLED_MONTSERRAT_DIR)
    let montserratCount = 0
    for (const weight of FONT_CONFIG.BUNDLED_MONTSERRAT_WEIGHTS) {
      const filePath = nodePath.join(baseDir, `Montserrat-${weight}.ttf`)
      if (!nodeFs.existsSync(filePath)) continue
      try {
        GlobalFonts.registerFromPath(filePath, 'Montserrat')
        montserratCount++
      } catch (error) {
        console.warn(`[CanvasRenderer] Failed to register Montserrat ${weight}:`, error)
      }
    }
    if (montserratCount > 0) {
      console.log(`[CanvasRenderer] Montserrat registered (${montserratCount} weights)`)
    } else {
      console.warn('[CanvasRenderer] Montserrat files not found — falling back to system font')
    }

    const fontPaths = FONT_CONFIG.getSystemFontPaths()
    const registeredFamilies = new Set<string>()

    for (const [name, path] of Object.entries(fontPaths)) {
      try {
        // Evitar registrar a mesma família múltiplas vezes
        if (registeredFamilies.has(name)) continue

        GlobalFonts.registerFromPath(path, name)
        registeredFamilies.add(name)
        console.log(`[CanvasRenderer] Font registered: ${name}`)
      } catch (error) {
        console.warn(`[CanvasRenderer] Failed to register font ${name} from ${path}:`, error)
      }
    }

    this.fontsRegistered = true
  }

  /**
   * Registra uma fonte customizada
   */
  registerCustomFont(path: string, family: string): boolean {
    try {
      GlobalFonts.registerFromPath(path, family)
      console.log(`[CanvasRenderer] Custom font registered: ${family}`)
      return true
    } catch (error) {
      console.error(`[CanvasRenderer] Failed to register custom font ${family}:`, error)
      return false
    }
  }

  /**
   * Renderiza um design completo
   */
  async renderDesign(design: DesignData, fieldValues: FieldValues = {}): Promise<Buffer> {
    // Usar RenderEngine para renderizar
    await RenderEngine.renderDesign(
      this.ctx as unknown as CanvasRenderingContext2D,
      design,
      fieldValues,
      {
        scaleFactor: 1, // Sistema 1:1
        imageLoader: this.nodeImageLoader.bind(this),
        imageCache: this.imageCache as unknown as Map<string, CanvasImageSource>,
        fontChecker: this.nodeFontChecker.bind(this),
      },
    )

    // Retornar buffer PNG
    return this.canvas.encode('png')
  }

  /**
   * Image loader para Node.js
   * Suporta URLs http/https, paths locais e Google Drive
   */
  private async nodeImageLoader(url: string): Promise<Image> {
    try {
      // HTTP/HTTPS URLs
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // Converter URLs do Google Drive para download direto
        if (url.includes('drive.google.com')) {
          url = this.convertGoogleDriveUrl(url)
        }

        return await loadImage(url)
      }

      // Paths locais
      if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
        return await loadImage(url)
      }

      // Fallback: tentar como URL
      return await loadImage(url)
    } catch (error) {
      console.error('[CanvasRenderer] Failed to load image:', url, error)
      throw new Error(`Failed to load image: ${url}`)
    }
  }

  /**
   * Converte URL do Google Drive para download direto
   */
  private convertGoogleDriveUrl(url: string): string {
    // Formato: https://drive.google.com/file/d/{FILE_ID}/view
    // Para: https://drive.google.com/uc?export=download&id={FILE_ID}
    const fileIdMatch = url.match(/\/d\/([^\/]+)/)
    if (fileIdMatch) {
      const fileId = fileIdMatch[1]
      return `https://drive.google.com/uc?export=download&id=${fileId}`
    }

    // Se já estiver no formato de download, retornar como está
    if (url.includes('drive.google.com/uc')) {
      return url
    }

    // Fallback: retornar URL original
    return url
  }

  /**
   * Font checker para Node.js
   * Verifica se a fonte está registrada no GlobalFonts
   */
  private async nodeFontChecker(fontName: string): Promise<FontValidationResult> {
    // Obter lista de fontes registradas
    const registeredFonts = GlobalFonts.families

    // Verificar se a fonte está registrada (case-insensitive)
    const isValid = registeredFonts.some(
      (family) => family.family.toLowerCase() === fontName.toLowerCase(),
    )

    if (isValid) {
      return {
        isValid: true,
        fallbackUsed: false,
        confidence: 1.0,
      }
    }

    // Fonte não encontrada, usar fallback
    const fallback = FONT_CONFIG.getFontWithFallback(fontName)

    return {
      isValid: false,
      fallbackUsed: true,
      fallbackFont: fallback,
      confidence: 0.5,
    }
  }

  /**
   * Limpa o cache de imagens
   */
  clearImageCache(): void {
    this.imageCache.clear()
  }

  /**
   * Obtém informações sobre fontes registradas
   */
  getRegisteredFonts() {
    return GlobalFonts.families
  }
}
