import { useEffect, useMemo, useState } from 'react'
import { useBrandAssets } from '@/hooks/use-brand-assets'
import {
  COMMON_AVAILABLE_FONT_FAMILIES,
  EDITOR_FONT_FALLBACK_FAMILY,
  collectDocumentFontFamilies,
  getProjectIdentityFonts,
  normalizeEditorFontFamily,
  type EditorFontSource,
} from '@/lib/editor/font-utils'
import type { KonvaTemplateDocument } from '@/types/template'

interface EditorFontsState {
  isLoading: boolean
  warnings: string[]
}

const fontLoadCache = new Map<string, Promise<string | null>>()

function buildFontLoadKey(font: EditorFontSource) {
  return `${normalizeEditorFontFamily(font.fontFamily)}::${font.fileUrl ?? 'local'}`
}

function toFontCheckString(fontFamily: string) {
  return `16px "${fontFamily.replace(/"/g, '\\"')}"`
}

async function ensureEditorFontLoaded(font: EditorFontSource): Promise<string | null> {
  const fontFamily = normalizeEditorFontFamily(font.fontFamily)
  if (!fontFamily || typeof document === 'undefined' || !('fonts' in document) || !document.fonts) {
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
      const response = await window.electronAPI.downloadBlob(font.fileUrl as string)
      if (!response.ok || !response.buffer) {
        return `Falha ao baixar a fonte "${fontFamily}". Fallback controlado aplicado com ${EDITOR_FONT_FALLBACK_FAMILY}.`
      }

      const fontFace = new FontFace(fontFamily, response.buffer.slice(0))
      const loadedFontFace = await fontFace.load()
      document.fonts.add(loadedFontFace)
      await document.fonts.load(toFontCheckString(fontFamily))

      if (!document.fonts.check(toFontCheckString(fontFamily))) {
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

export function useEditorProjectFonts(
  projectId: number | undefined,
  editorDocument: KonvaTemplateDocument | null,
) {
  const { data: brandAssets } = useBrandAssets(projectId)
  const [state, setState] = useState<EditorFontsState>({ isLoading: false, warnings: [] })

  const fontSources = useMemo(
    () => getProjectIdentityFonts(brandAssets, editorDocument),
    [brandAssets, editorDocument],
  )
  const usedFontFamilies = useMemo(
    () => collectDocumentFontFamilies(editorDocument),
    [editorDocument],
  )
  const fontSourceSignature = useMemo(
    () => fontSources.map((font) => `${font.fontFamily}:${font.fileUrl ?? ''}`).join('|'),
    [fontSources],
  )
  const stableFontSources = useMemo(() => fontSources, [fontSourceSignature])
  const usedFontSignature = useMemo(
    () => usedFontFamilies.join('|'),
    [usedFontFamilies],
  )
  const stableUsedFontFamilies = useMemo(() => usedFontFamilies, [usedFontSignature])
  const availableFontFamilies = useMemo(
    () =>
      Array.from(
        new Set([
          ...fontSources.map((font) => font.fontFamily),
          ...usedFontFamilies,
          EDITOR_FONT_FALLBACK_FAMILY,
        ].filter(Boolean)),
      ),
    [fontSources, usedFontFamilies],
  )

  useEffect(() => {
    if (!editorDocument) {
      setState({ isLoading: false, warnings: [] })
      return
    }

    let cancelled = false

    async function preloadFonts() {
      setState((current) => ({ ...current, isLoading: true }))

      const nextWarnings: string[] = []

      for (const font of stableFontSources) {
        const warning = await ensureEditorFontLoaded(font)
        if (warning) {
          nextWarnings.push(warning)
        }
      }

      if (typeof document !== 'undefined' && 'fonts' in document && document.fonts) {
        try {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => window.setTimeout(resolve, 1200)),
          ])
        } catch (_error) {
          // noop
        }
      }

      for (const fontFamily of stableUsedFontFamilies) {
        if (
          !fontFamily ||
          COMMON_AVAILABLE_FONT_FAMILIES.has(fontFamily) ||
          document.fonts.check(toFontCheckString(fontFamily))
        ) {
          continue
        }

        nextWarnings.push(
          `Fonte "${fontFamily}" nao foi localizada no editor. Fallback controlado aplicado com ${EDITOR_FONT_FALLBACK_FAMILY}.`,
        )
      }

      if (!cancelled) {
        setState({
          isLoading: false,
          warnings: Array.from(new Set(nextWarnings)),
        })
      }
    }

    void preloadFonts()

    return () => {
      cancelled = true
    }
  }, [editorDocument ? 'ready' : 'empty', fontSourceSignature, stableFontSources, stableUsedFontFamilies, usedFontSignature])

  return {
    availableFontFamilies,
    brandAssets,
    isLoadingFonts: state.isLoading,
    fontWarnings: state.warnings,
  }
}
