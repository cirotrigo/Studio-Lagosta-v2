import { useEffect, useMemo, useState } from 'react'
import { useBrandAssets } from '@/hooks/use-brand-assets'
import {
  EDITOR_FONT_FALLBACK_FAMILY,
  collectDocumentFontFamilies,
  mergeEditorFontSources,
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
  // useBrandAssets already fetches and merges fonts from both
  // /api/projects/${projectId}/brand-assets AND /api/projects/${projectId}/fonts
  const { data: brandAssets } = useBrandAssets(projectId)
  const [state, setState] = useState<EditorFontsState>({ isLoading: false, warnings: [] })

  const fontSources = useMemo(
    () =>
      mergeEditorFontSources(
        brandAssets?.fonts,
        [brandAssets?.titleFontFamily, brandAssets?.bodyFontFamily]
          .filter((fontFamily): fontFamily is string => typeof fontFamily === 'string' && fontFamily.trim().length > 0)
          .map((fontFamily) => ({ fontFamily }))
          .filter((font) => Boolean(font.fontFamily)),
        editorDocument?.identity.fonts,
        collectDocumentFontFamilies(editorDocument).map((fontFamily) => ({ fontFamily })),
      ),
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

      if (
        (fontSources.length ?? 0) === 0 &&
        !brandAssets?.titleFontFamily &&
        !brandAssets?.bodyFontFamily
      ) {
        nextWarnings.push(
          'Nenhuma fonte de projeto foi encontrada nos assets. O editor usara fallback (Inter).',
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
  }, [
    brandAssets?.bodyFontFamily,
    brandAssets?.fonts,
    brandAssets?.titleFontFamily,
    editorDocument ? 'ready' : 'empty',
    fontSourceSignature,
    projectId,
    stableFontSources,
    stableUsedFontFamilies,
    usedFontSignature,
  ])

  return {
    availableFontFamilies,
    brandAssets,
    isLoadingFonts: state.isLoading,
    fontWarnings: state.warnings,
  }
}
