import type { BrandAssets } from '@/hooks/use-brand-assets'
import type { KonvaTemplateDocument } from '@/types/template'

export interface EditorFontSource {
  name?: string
  fontFamily: string
  fileUrl?: string
}

export const EDITOR_FONT_FALLBACK_FAMILY = 'Inter'

export const COMMON_AVAILABLE_FONT_FAMILIES = new Set([
  'Arial',
  'Courier New',
  'Georgia',
  'Helvetica',
  'Inter',
  'Montserrat',
  'sans-serif',
  'serif',
  'system-ui',
  'Times New Roman',
])

function stripQuotes(value: string) {
  return value.replace(/^['"]+|['"]+$/g, '')
}

export function normalizeEditorFontFamily(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  return stripQuotes(value.trim())
}

function quoteFontFamily(value: string) {
  return /[\s,]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

export function serializeFontFamilyStack(
  primaryFamily: string | null | undefined,
  fallbackFamily = EDITOR_FONT_FALLBACK_FAMILY,
) {
  const primary = normalizeEditorFontFamily(primaryFamily)
  const fallback = normalizeEditorFontFamily(fallbackFamily) || EDITOR_FONT_FALLBACK_FAMILY

  const families = [primary, fallback, 'Arial', 'sans-serif'].filter(Boolean)
  return Array.from(new Set(families)).map(quoteFontFamily).join(', ')
}

export function collectDocumentFontFamilies(document: KonvaTemplateDocument | null) {
  if (!document) {
    return []
  }

  return Array.from(
    new Set(
      document.design.pages.flatMap((page) =>
        page.layers.flatMap((layer) =>
          layer.type === 'text' || layer.type === 'rich-text'
            ? [normalizeEditorFontFamily(layer.textStyle?.fontFamily)]
            : [],
        ),
      ).filter(Boolean),
    ),
  )
}

export function mergeEditorFontSources(
  ...fontLists: Array<Array<EditorFontSource | null | undefined> | null | undefined>
) {
  const merged = new Map<string, EditorFontSource>()

  for (const fontList of fontLists) {
    for (const font of fontList ?? []) {
      if (!font?.fontFamily) {
        continue
      }

      const family = normalizeEditorFontFamily(font.fontFamily)
      if (!family) {
        continue
      }

      const current = merged.get(family)
      if (!current || (!current.fileUrl && font.fileUrl)) {
        merged.set(family, {
          name: font.name,
          fontFamily: family,
          fileUrl: font.fileUrl,
        })
      }
    }
  }

  return Array.from(merged.values())
}

export function getProjectIdentityFonts(
  brandAssets: BrandAssets | undefined,
  document: KonvaTemplateDocument | null,
) {
  const preferredFonts = [
    brandAssets?.titleFontFamily,
    brandAssets?.bodyFontFamily,
  ]
    .map((fontFamily) => normalizeEditorFontFamily(fontFamily))
    .filter(Boolean)
    .map((fontFamily) => ({ fontFamily }))

  return mergeEditorFontSources(
    brandAssets?.fonts,
    preferredFonts,
    document?.identity.fonts,
    collectDocumentFontFamilies(document).map((fontFamily) => ({ fontFamily })),
  )
}
