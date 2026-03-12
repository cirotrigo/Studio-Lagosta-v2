import {
  COMMON_AVAILABLE_FONT_FAMILIES,
  EDITOR_FONT_FALLBACK_FAMILY,
  collectDocumentFontFamilies,
  mergeEditorFontSources,
  normalizeEditorFontFamily,
  type EditorFontSource,
} from './font-utils'
import { API_BASE_URL } from '@/lib/constants'
import type { KonvaTemplateDocument } from '@/types/template'

interface PreloadEditorFontSourcesOptions {
  timeoutMs?: number
}

interface PreloadKonvaDocumentFontsOptions extends PreloadEditorFontSourcesOptions {
  document: KonvaTemplateDocument | null
  brandFonts?: Array<EditorFontSource | null | undefined>
}

export interface PreloadEditorFontsResult {
  warnings: string[]
}

const fontLoadCache = new Map<string, Promise<string | null>>()
const googleStylesheetCache = new Map<string, Promise<boolean>>()

function buildFontLoadKey(font: EditorFontSource) {
  return `${normalizeEditorFontFamily(font.fontFamily)}::${font.fileUrl ?? 'local'}`
}

function toFontCheckString(fontFamily: string) {
  return `16px "${fontFamily.replace(/"/g, '\\"')}"`
}

function canUseDocumentFontsApi() {
  return typeof document !== 'undefined' && 'fonts' in document && Boolean(document.fonts)
}

function resolveFontUrl(fileUrl: string) {
  const trimmed = fileUrl.trim()
  if (!trimmed) {
    return ''
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`
  }

  if (trimmed.startsWith('/')) {
    return `${API_BASE_URL}${trimmed}`
  }

  return `${API_BASE_URL}/${trimmed.replace(/^\/+/, '')}`
}

function bufferLooksLikeHtml(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer.slice(0, 20))
  const head = Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join('')
    .toLowerCase()
  return head.includes('<!do') || head.includes('<html') || head.includes('<!doctype')
}

function buildGoogleFontsHref(fontFamily: string) {
  const queryFamily = encodeURIComponent(fontFamily.trim()).replace(/%20/g, '+')
  return `https://fonts.googleapis.com/css2?family=${queryFamily}&display=swap`
}

async function ensureGoogleFontStylesheet(fontFamily: string): Promise<boolean> {
  if (typeof document === 'undefined') {
    return false
  }

  const normalized = normalizeEditorFontFamily(fontFamily)
  if (!normalized) {
    return false
  }

  const cached = googleStylesheetCache.get(normalized)
  if (cached) {
    return await cached
  }

  const pending = (async () => {
    const href = buildGoogleFontsHref(normalized)

    const existing = document.querySelector<HTMLLinkElement>(
      `link[data-editor-google-font="${normalized}"]`,
    )
    if (existing) {
      return true
    }

    return await new Promise<boolean>((resolve) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      link.setAttribute('data-editor-google-font', normalized)

      const timeoutId = window.setTimeout(() => resolve(false), 3500)
      link.onload = () => {
        window.clearTimeout(timeoutId)
        resolve(true)
      }
      link.onerror = () => {
        window.clearTimeout(timeoutId)
        resolve(false)
      }

      document.head.appendChild(link)
    })
  })()

  googleStylesheetCache.set(normalized, pending)
  return await pending
}

async function ensureEditorFontLoaded(font: EditorFontSource): Promise<string | null> {
  const fontFamily = normalizeEditorFontFamily(font.fontFamily)

  if (!fontFamily || !canUseDocumentFontsApi() || !document.fonts) {
    return null
  }

  // IMPORTANTE: Não confiar em document.fonts.check() para fontes com fileUrl
  // O check() retorna true mesmo quando a fonte não está carregada (usa fallback)
  // Para fontes com fileUrl, sempre verificamos o cache e tentamos carregar
  if (!font.fileUrl && document.fonts.check(toFontCheckString(fontFamily))) {
    return null
  }

  if (!font.fileUrl) {
    if (!COMMON_AVAILABLE_FONT_FAMILIES.has(fontFamily)) {
      await ensureGoogleFontStylesheet(fontFamily)
    }

    try {
      await document.fonts.load(toFontCheckString(fontFamily))
      if (document.fonts.check(toFontCheckString(fontFamily))) {
        return null
      }
    } catch (_error) {
      return null
    }

    if (COMMON_AVAILABLE_FONT_FAMILIES.has(fontFamily)) {
      return null
    }

    return `Fonte "${fontFamily}" indisponivel no draft. Fallback controlado aplicado com ${EDITOR_FONT_FALLBACK_FAMILY}.`
  }

  // Verificar se a fonte realmente existe no document.fonts (não apenas o check)
  let fontExistsInDocumentFonts = false
  document.fonts.forEach((f) => {
    if (f.family === fontFamily) {
      fontExistsInDocumentFonts = true
    }
  })

  if (fontExistsInDocumentFonts) {
    return null
  }

  const cacheKey = buildFontLoadKey(font)
  const cached = fontLoadCache.get(cacheKey)
  if (cached) {
    return await cached
  }

  const pendingLoad = (async () => {
    try {
      if (!window.electronAPI?.downloadBlob) {
        return `Falha ao baixar a fonte "${fontFamily}". Fallback controlado aplicado com ${EDITOR_FONT_FALLBACK_FAMILY}.`
      }

      const resolvedUrl = resolveFontUrl(font.fileUrl as string)
      if (!resolvedUrl) {
        return `URL da fonte "${fontFamily}" esta vazia. Fallback controlado aplicado com ${EDITOR_FONT_FALLBACK_FAMILY}.`
      }

      const response = await window.electronAPI.downloadBlob(resolvedUrl)

      if (!response.ok || !response.buffer) {
        return `Falha ao baixar a fonte "${fontFamily}" (${resolvedUrl}). Fallback controlado aplicado com ${EDITOR_FONT_FALLBACK_FAMILY}.`
      }

      if (
        bufferLooksLikeHtml(response.buffer) ||
        (response.contentType && response.contentType.includes('text/html'))
      ) {
        return `Fonte "${fontFamily}" retornou HTML em vez de arquivo de fonte (${resolvedUrl}). Fallback controlado aplicado com ${EDITOR_FONT_FALLBACK_FAMILY}.`
      }

      const fontFace = new FontFace(fontFamily, response.buffer.slice(0))
      const loadedFontFace = await fontFace.load()
      document.fonts?.add(loadedFontFace)
      await document.fonts?.load(toFontCheckString(fontFamily))

      return null
    } catch (_error) {
      return `Erro ao carregar a fonte "${fontFamily}". Fallback controlado aplicado com ${EDITOR_FONT_FALLBACK_FAMILY}.`
    }
  })()

  fontLoadCache.set(cacheKey, pendingLoad)
  return await pendingLoad
}

export function collectKonvaDocumentFontSources(
  document: KonvaTemplateDocument | null,
  brandFonts?: Array<EditorFontSource | null | undefined>,
) {
  return mergeEditorFontSources(
    brandFonts,
    document?.identity.fonts,
    collectDocumentFontFamilies(document).map((fontFamily) => ({ fontFamily })),
  )
}

export async function preloadEditorFontSources(
  fontSources: EditorFontSource[],
  usedFontFamilies: string[],
  options: PreloadEditorFontSourcesOptions = {},
): Promise<PreloadEditorFontsResult> {
  if (!canUseDocumentFontsApi() || !document.fonts) {
    return { warnings: [] }
  }

  const timeoutMs = options.timeoutMs ?? 1200
  const warnings: string[] = []

  for (const font of fontSources) {
    const warning = await ensureEditorFontLoaded(font)
    if (warning) {
      warnings.push(warning)
    }
  }

  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => window.setTimeout(resolve, timeoutMs)),
    ])
  } catch (_error) {
    // noop
  }

  for (const fontFamily of usedFontFamilies) {
    if (
      !fontFamily ||
      COMMON_AVAILABLE_FONT_FAMILIES.has(fontFamily) ||
      document.fonts.check(toFontCheckString(fontFamily))
    ) {
      continue
    }

    warnings.push(
      `Fonte "${fontFamily}" nao foi localizada no editor. Fallback controlado aplicado com ${EDITOR_FONT_FALLBACK_FAMILY}.`,
    )
  }

  return { warnings: Array.from(new Set(warnings)) }
}

export async function preloadKonvaDocumentFonts(
  options: PreloadKonvaDocumentFontsOptions,
): Promise<PreloadEditorFontsResult> {
  const usedFontFamilies = collectDocumentFontFamilies(options.document)
  const fontSources = collectKonvaDocumentFontSources(options.document, options.brandFonts)
  return preloadEditorFontSources(fontSources, usedFontFamilies, {
    timeoutMs: options.timeoutMs,
  })
}
