import { app, net } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

const FONTS_DIR = path.join(app.getPath('userData'), 'fonts')

// Ensure cache directory exists
function ensureCacheDir(): void {
  if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true })
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-').toLowerCase()
}

function getCachePath(fontFamily: string): string {
  return path.join(FONTS_DIR, `${sanitizeName(fontFamily)}.ttf`)
}

/**
 * Ensure a font is available locally. Downloads if not cached.
 * Returns the absolute path to the .ttf file.
 */
export async function ensureFont(fontFamily: string, fontUrl?: string): Promise<string> {
  ensureCacheDir()

  // Sanitize: Vision sometimes returns descriptions like "bold, serif"
  const cleanFamily = sanitizeFontFamily(fontFamily)
  const cachePath = getCachePath(cleanFamily)

  // Already cached
  if (fs.existsSync(cachePath)) {
    return cachePath
  }

  if (fontUrl) {
    // Direct download from Vercel Blob or other URL
    console.log(`[font-cache] Downloading custom font: ${cleanFamily} from URL`)
    const response = await net.fetch(fontUrl)
    if (!response.ok) throw new Error(`Failed to download font from ${fontUrl}: ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(cachePath, buffer)
    return cachePath
  }

  // Try Google Fonts API
  console.log(`[font-cache] Downloading Google Font: ${cleanFamily}`)
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(cleanFamily)}&display=swap`
  const cssResponse = await net.fetch(cssUrl, {
    headers: {
      // Chrome user-agent to get .ttf format
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })

  if (!cssResponse.ok) {
    // Fallback: if Google Fonts doesn't recognize this name, use Inter
    console.warn(`[font-cache] Google Fonts rejected "${cleanFamily}" (${cssResponse.status}), falling back to Inter`)
    return ensureFont('Inter')
  }

  const cssText = await cssResponse.text()

  // Extract first .ttf URL from the CSS
  const urlMatch = cssText.match(/src:\s*url\(([^)]+\.ttf[^)]*)\)/)
    || cssText.match(/src:\s*url\(([^)]+)\)\s*format\(['"]truetype['"]\)/)
    || cssText.match(/src:\s*url\(([^)]+)\)/)

  if (!urlMatch?.[1]) {
    console.warn(`[font-cache] No font URL in CSS for "${cleanFamily}", falling back to Inter`)
    return ensureFont('Inter')
  }

  const fontDownloadUrl = urlMatch[1]
  console.log(`[font-cache] Downloading font file from: ${fontDownloadUrl.substring(0, 80)}...`)
  const fontResponse = await net.fetch(fontDownloadUrl)
  if (!fontResponse.ok) throw new Error(`Failed to download font file: ${fontResponse.status}`)

  const fontBuffer = Buffer.from(await fontResponse.arrayBuffer())
  fs.writeFileSync(cachePath, fontBuffer)
  console.log(`[font-cache] Font cached: ${cachePath} (${fontBuffer.length} bytes)`)

  return cachePath
}

// Maps generic Vision font descriptions to real Google Font families
const GENERIC_FONT_MAP: Record<string, string> = {
  'serif': 'Playfair Display',
  'sans-serif': 'Inter',
  'sans serif': 'Inter',
  'sans': 'Inter',
  'monospace': 'JetBrains Mono',
  'mono': 'JetBrains Mono',
  'display': 'Oswald',
  'handwriting': 'Dancing Script',
  'cursive': 'Dancing Script',
  'script': 'Dancing Script',
  'slab': 'Roboto Slab',
  'slab serif': 'Roboto Slab',
  'condensed': 'Roboto Condensed',
}

const WEIGHT_WORDS = /\b(thin|extra-?light|light|regular|medium|semi-?bold|bold|extra-?bold|black|heavy|italic)\b/gi

function sanitizeFontFamily(raw: string): string {
  if (!raw || typeof raw !== 'string') return 'Inter'
  const trimmed = raw.trim()

  // Normalize: remove commas, collapse spaces
  const lower = trimmed.toLowerCase().replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim()

  // Strip weight/style descriptors
  const stripped = lower.replace(WEIGHT_WORDS, '').replace(/\s+/g, ' ').trim()

  // Check generic map
  if (GENERIC_FONT_MAP[stripped]) return GENERIC_FONT_MAP[stripped]
  if (GENERIC_FONT_MAP[lower]) return GENERIC_FONT_MAP[lower]

  // Very short generic-looking → fallback
  if (stripped.length <= 3) return 'Inter'

  // Return original casing (it might be a real font name like "Montserrat")
  return trimmed
}

/**
 * Read a font file and return its content as base64.
 */
export async function getFontBase64(fontPath: string): Promise<string> {
  const buffer = fs.readFileSync(fontPath)
  return buffer.toString('base64')
}

/**
 * Clear all cached fonts.
 */
export async function clearFontCache(): Promise<void> {
  if (fs.existsSync(FONTS_DIR)) {
    const files = fs.readdirSync(FONTS_DIR)
    for (const file of files) {
      fs.unlinkSync(path.join(FONTS_DIR, file))
    }
    console.log(`[font-cache] Cleared ${files.length} cached fonts`)
  }
}
