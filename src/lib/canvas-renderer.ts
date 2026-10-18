// src/lib/canvas-renderer.ts
// Backend Canvas Renderer using @napi-rs/canvas

import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import { createCanvas, loadImage, GlobalFonts, Path2D as NapiPath2D } from '@napi-rs/canvas'
import type { Canvas, SKRSContext2D, Image } from '@napi-rs/canvas'
import { RenderEngine } from './render-engine'
import { FONT_CONFIG } from './font-config'
import { marcarFontesPadrao } from './fontes-padrao-estado'
import type { DesignData, FieldValues } from '@/types/template'
import type { FontValidationResult } from './render-engine'

/** Família genérica que recebe cada peso da Montserrat empacotada (ver registerDefaultFonts). */
export const FAMILIA_GENERICA_DO_FALLBACK = 'sans-serif'

export interface EstadoDasFontesPadrao {
  /** Pesos da Montserrat empacotada que o processo precisa ter (FONT_CONFIG.BUNDLED_MONTSERRAT_WEIGHTS). */
  esperados: number
  /** Pesos registrados de verdade como `Montserrat` (retorno verdadeiro de registerFromPath). */
  montserrat: number
  /** Pesos registrados de verdade sob a família genérica do fallback. */
  generica: number
  /** Só verdadeiro com TODOS os pesos nas duas famílias; parcial ou zero é incompleto e tenta de novo. */
  completo: boolean
}

/** Chaves `família|peso` já registradas com sucesso: a nova tentativa refaz só o que faltou (sem duplicar typeface). */
const registrosFeitos = new Set<string>()
let fontesPadraoCompletas = false

/**
 * Montserrat empacotada (por peso) + o fallback das famílias genéricas + fontes do sistema, uma vez por processo (o
 * registro do @napi-rs/canvas é global). Quem desenha texto com `createCanvas` direto, fora do CanvasRenderer, chama
 * isto antes — senão, na 1.0.x, família genérica ou desconhecida sai sem acento (ver registerDefaultFonts).
 *
 * Só dá o processo por pronto quando TODOS os registros necessários foram confirmados: `null`/`false`/exceção ou
 * registro parcial deixam o estado incompleto, avisam alto e a próxima chamada tenta de novo (nunca sucesso silencioso).
 */
export function garantirFontesPadrao(): EstadoDasFontesPadrao {
  if (fontesPadraoCompletas) {
    const n = FONT_CONFIG.BUNDLED_MONTSERRAT_WEIGHTS.length
    return { esperados: n, montserrat: n, generica: n, completo: true }
  }
  const estado = CanvasRenderer.registerDefaultFonts()
  marcarFontesPadrao(estado.completo)
  if (estado.completo) fontesPadraoCompletas = true
  else
    console.error(
      `[CanvasRenderer] fontes padrão INCOMPLETAS: Montserrat ${estado.montserrat}/${estado.esperados}, ${FAMILIA_GENERICA_DO_FALLBACK} ${estado.generica}/${estado.esperados} — família genérica pode sair sem acento ou no peso errado; a próxima chamada tenta de novo`,
    )
  return estado
}

export class CanvasRenderer {
  private canvas: Canvas
  private ctx: SKRSContext2D
  private width: number
  private height: number
  private imageCache: Map<string, Image>

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.canvas = createCanvas(width, height)
    this.ctx = this.canvas.getContext('2d') as SKRSContext2D
    this.imageCache = new Map()

    garantirFontesPadrao()
  }

  /**
   * Registra fontes padrão do sistema
   */
  static registerDefaultFonts(): EstadoDasFontesPadrao {
    // Montserrat vem empacotada no repositório, um arquivo por peso — o
    // matcher do napi-rs escolhe o arquivo certo pelo peso pedido.
    // (fs/path ficam aqui, e não em font-config, que também roda no client)
    //
    // Cada arquivo também é registrado sob a família genérica: desde o @napi-rs/canvas 1.0.x, família genérica ou
    // desconhecida (`sans-serif`, `serif`, nome fora do registro) cai numa fonte padrão SEM Ç/à/ã (tofu). Registrar os
    // ARQUIVOS (e não um alias, que só aponta para a face regular) mantém o peso pedido: medido em processo isolado, a
    // 1.0.11 desenha `400/700 sans-serif` pixel a pixel igual a `400/700 Montserrat` (docs/regras/render-e-texto.md,
    // "Workers do vitest morrendo no skia"). O retorno é conferido: `null` (1.0.x), `false` (0.1.x) ou exceção não contam.
    const baseDir = nodePath.join(process.cwd(), FONT_CONFIG.BUNDLED_MONTSERRAT_DIR)
    const pesos = FONT_CONFIG.BUNDLED_MONTSERRAT_WEIGHTS
    const registrar = (filePath: string, familia: string, peso: string): boolean => {
      const chave = `${familia}|${peso}`
      if (registrosFeitos.has(chave)) return true
      try {
        if (!GlobalFonts.registerFromPath(filePath, familia)) {
          console.warn(`[CanvasRenderer] Montserrat ${peso} NÃO registrada como ${familia} (registerFromPath recusou)`)
          return false
        }
        registrosFeitos.add(chave)
        return true
      } catch (error) {
        console.warn(`[CanvasRenderer] Failed to register Montserrat ${peso} as ${familia}:`, error)
        return false
      }
    }
    let montserrat = 0
    let generica = 0
    for (const weight of pesos) {
      const filePath = nodePath.join(baseDir, `Montserrat-${weight}.ttf`)
      if (!nodeFs.existsSync(filePath)) {
        console.warn(`[CanvasRenderer] Montserrat ${weight} não encontrada em ${filePath}`)
        continue
      }
      if (registrar(filePath, 'Montserrat', weight)) montserrat++
      if (registrar(filePath, FAMILIA_GENERICA_DO_FALLBACK, weight)) generica++
    }
    const estado: EstadoDasFontesPadrao = {
      esperados: pesos.length,
      montserrat,
      generica,
      completo: pesos.length > 0 && montserrat === pesos.length && generica === pesos.length,
    }
    if (montserrat > 0) console.log(`[CanvasRenderer] Montserrat registered (${montserrat}/${pesos.length} weights)`)
    else console.warn('[CanvasRenderer] Montserrat files not found — falling back to system font')

    const fontPaths = FONT_CONFIG.getSystemFontPaths()

    for (const [name, path] of Object.entries(fontPaths)) {
      try {
        // Evitar registrar a mesma família múltiplas vezes (também entre tentativas, com o estado incompleto)
        const chave = `sistema|${name}`
        if (registrosFeitos.has(chave)) continue

        if (!GlobalFonts.registerFromPath(path, name)) continue
        registrosFeitos.add(chave)
        console.log(`[CanvasRenderer] Font registered: ${name}`)
      } catch (error) {
        console.warn(`[CanvasRenderer] Failed to register font ${name} from ${path}:`, error)
      }
    }
    return estado
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
        // Máscaras, formas svg-path e ícones precisam de Path2D — no Node é o
        // do @napi-rs/canvas (não existe global)
        createPath2D: (d: string) => new NapiPath2D(d) as unknown as Path2D,
        // Filtros de imagem e blur de texto rodam num canvas offscreen —
        // injetado pelo mesmo motivo do Path2D
        createCanvas: (w: number, h: number) => createCanvas(w, h) as unknown as HTMLCanvasElement,
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

  /** Famílias já reclamadas neste processo — um aviso por fonte, não por camada */
  private static warnedMissingFonts = new Set<string>()

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

    // Fonte não encontrada, usar fallback — e RECLAMAR alto: fallback
    // silencioso foi o que deixou artes divergindo do editor por meses.
    // O aviso aparece no log do cron render-stories e do generate-creatives.
    const fallback = FONT_CONFIG.getFontWithFallback(fontName)
    const key = fontName.toLowerCase()
    if (!CanvasRenderer.warnedMissingFonts.has(key)) {
      CanvasRenderer.warnedMissingFonts.add(key)
      console.warn(
        `[CanvasRenderer] ⚠️ Fonte "${fontName}" NÃO está registrada no servidor — ` +
          `renderizando com fallback "${fallback}". A arte publicada vai divergir do editor. ` +
          `Envie o arquivo .ttf/.otf da fonte nas configurações de fontes do projeto.`,
      )
    }

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
