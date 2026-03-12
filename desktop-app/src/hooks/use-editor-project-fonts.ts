import { useEffect, useMemo, useState } from 'react'
import { useBrandAssets } from '@/hooks/use-brand-assets'
import {
  EDITOR_FONT_FALLBACK_FAMILY,
  collectDocumentFontFamilies,
  getProjectIdentityFonts,
} from '@/lib/editor/font-utils'
import { preloadEditorFontSources } from '@/lib/editor/font-preload'
import type { KonvaTemplateDocument } from '@/types/template'

interface EditorFontsState {
  isLoading: boolean
  warnings: string[]
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
      const preloadResult = await preloadEditorFontSources(
        stableFontSources,
        stableUsedFontFamilies,
      )
      const nextWarnings: string[] = [...preloadResult.warnings]

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
