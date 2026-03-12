import {
  COMMON_AVAILABLE_FONT_FAMILIES,
  EDITOR_FONT_FALLBACK_FAMILY,
  collectDocumentFontFamilies,
  mergeEditorFontSources,
  normalizeEditorFontFamily,
  type EditorFontSource,
} from './font-utils'
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

function buildFontLoadKey(font: EditorFontSource) {
  return `${normalizeEditorFontFamily(font.fontFamily)}::${font.fileUrl ?? 'local'}`
}

function toFontCheckString(fontFamily: string) {
  return `16px "${fontFamily.replace(/"/g, '\\"')}"`
}

function canUseDocumentFontsApi() {
  return typeof document !== 'undefined' && 'fonts' in document && Boolean(document.fonts)
}

async function ensureEditorFontLoaded(font: EditorFontSource): Promise<string | null> {
  const fontFamily = normalizeEditorFontFamily(font.fontFamily)
  if (!fontFamily || !canUseDocumentFontsApi() || !document.fonts) {
    return null
  }

  if (document.fonts.check(toFontCheckString(fontFamily))) {
    return null
  }

  if (!font.fileUrl) {
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

      const response = await window.electronAPI.downloadBlob(font.fileUrl as string)
      if (!response.ok || !response.buffer) {
        return `Falha ao baixar a fonte "${fontFamily}". Fallback controlado aplicado com ${EDITOR_FONT_FALLBACK_FAMILY}.`
      }

      const fontFace = new FontFace(fontFamily, response.buffer.slice(0))
      const loadedFontFace = await fontFace.load()
      document.fonts?.add(loadedFontFace)
      await document.fonts?.load(toFontCheckString(fontFamily))

      if (!document.fonts?.check(toFontCheckString(fontFamily))) {
        return `A fonte "${fontFamily}" nao ficou disponivel no editor. Fallback controlado aplicado com ${EDITOR_FONT_FALLBACK_FAMILY}.`
      }

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
