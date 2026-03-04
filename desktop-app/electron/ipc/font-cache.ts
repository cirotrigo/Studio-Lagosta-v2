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
  const cachePath = getCachePath(fontFamily)

  // Already cached
  if (fs.existsSync(cachePath)) {
    return cachePath
  }

  if (fontUrl) {
    // Direct download from Vercel Blob or other URL
    console.log(`[font-cache] Downloading custom font: ${fontFamily} from URL`)
    const response = await net.fetch(fontUrl)
    if (!response.ok) throw new Error(`Failed to download font from ${fontUrl}: ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(cachePath, buffer)
    return cachePath
  }

  // Try Google Fonts API
  console.log(`[font-cache] Downloading Google Font: ${fontFamily}`)
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}&display=swap`
  const cssResponse = await net.fetch(cssUrl, {
    headers: {
      // Chrome user-agent to get .ttf format
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })

  if (!cssResponse.ok) {
    throw new Error(`Failed to fetch Google Fonts CSS for "${fontFamily}": ${cssResponse.status}`)
  }

  const cssText = await cssResponse.text()

  // Extract first .ttf URL from the CSS
  const urlMatch = cssText.match(/src:\s*url\(([^)]+\.ttf[^)]*)\)/)
    || cssText.match(/src:\s*url\(([^)]+)\)\s*format\(['"]truetype['"]\)/)
    || cssText.match(/src:\s*url\(([^)]+)\)/)

  if (!urlMatch?.[1]) {
    throw new Error(`No font URL found in Google Fonts CSS for "${fontFamily}"`)
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
