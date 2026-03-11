import { useEffect, useMemo, useState } from 'react'
import BrandAssetsSection from '@/components/project/identity/BrandAssetsSection'
import StyleAnalysisSection from '@/components/project/identity/StyleAnalysisSection'
import DesignSystemImportSection from '@/components/project/identity/DesignSystemImportSection'
import ArtTemplatesSection from '@/components/project/identity/ArtTemplatesSection'
import DesignerGuideSection from '@/components/project/identity/DesignerGuideSection'
import { useBrandAssets } from '@/hooks/use-brand-assets'
import { useDesignSystem } from '@/hooks/use-design-system'
import { useArtTemplates } from '@/hooks/use-art-templates'
import type { ImportedDsTemplateSummary, InstagramPreviewTokens } from '@/lib/instagram-ds/token-parser'
import {
  extractDesignSystemCssFromHtml,
  extractDesignSystemCssFromZip,
  extractDesignSystemLogoFromHtml,
  extractDesignSystemLogoFromZip,
  extractDesignSystemMetadataFromZip,
  extractImportedDsTemplatesFromDesignSystemHtml,
  extractInstagramPreviewTokensFromDesignSystemHtml,
} from '@/lib/instagram-ds/token-parser'

interface IdentityTabProps {
  projectId: number
}

export default function IdentityTab({ projectId }: IdentityTabProps) {
  const { data: brandAssets } = useBrandAssets(projectId)
  const { data: templates } = useArtTemplates(projectId)
  const { data: designSystemData } = useDesignSystem(projectId)

  const [designSystemTokenOverrides, setDesignSystemTokenOverrides] = useState<Partial<InstagramPreviewTokens>>({})
  const [designSystemPreviewCss, setDesignSystemPreviewCss] = useState('')
  const [designSystemLogoUrl, setDesignSystemLogoUrl] = useState<string | null>(null)
  const [importedDsTemplates, setImportedDsTemplates] = useState<ImportedDsTemplateSummary[]>([])
  const [previewTokenSourceLabel, setPreviewTokenSourceLabel] = useState('Fallback interno do app')

  useEffect(() => {
    let cancelled = false

    const imported = designSystemData?.designSystemImport
    if (!imported || (imported.sourceType !== 'html' && imported.sourceType !== 'zip')) {
      setDesignSystemTokenOverrides({})
      setDesignSystemPreviewCss('')
      setDesignSystemLogoUrl(null)
      setImportedDsTemplates([])
      setPreviewTokenSourceLabel('Fallback interno do app')
      return () => {
        cancelled = true
      }
    }

    const loadDesignSystemPreviewContext = async () => {
      try {
        const downloaded = await window.electronAPI.downloadBlob(imported.fileUrl)
        if (!downloaded.ok || !downloaded.buffer) {
          if (!cancelled) {
            setDesignSystemTokenOverrides({})
            setDesignSystemPreviewCss('')
            setDesignSystemLogoUrl(null)
            setImportedDsTemplates([])
            setPreviewTokenSourceLabel('Falha ao baixar DS importado')
          }
          return
        }

        let extractedTokens: Partial<InstagramPreviewTokens> = {}
        let extractedCss = ''
        let extractedLogo: string | null = null
        let detectedTemplates: ImportedDsTemplateSummary[] = []

        if (imported.sourceType === 'html') {
          const html = new TextDecoder('utf-8').decode(new Uint8Array(downloaded.buffer))
          extractedTokens = extractInstagramPreviewTokensFromDesignSystemHtml(html)
          detectedTemplates = extractImportedDsTemplatesFromDesignSystemHtml(html)
          extractedCss = extractDesignSystemCssFromHtml(html)
          extractedLogo = extractDesignSystemLogoFromHtml(html)
        } else {
          const metadata = await extractDesignSystemMetadataFromZip(downloaded.buffer)
          extractedTokens = metadata.tokens
          detectedTemplates = metadata.templates
          extractedCss = await extractDesignSystemCssFromZip(downloaded.buffer)
          extractedLogo = await extractDesignSystemLogoFromZip(downloaded.buffer)
        }

        if (!cancelled) {
          setDesignSystemTokenOverrides(extractedTokens)
          setDesignSystemPreviewCss(extractedCss)
          setDesignSystemLogoUrl(extractedLogo)
          setImportedDsTemplates(detectedTemplates)
          if (Object.keys(extractedTokens).length > 0) {
            setPreviewTokenSourceLabel(
              imported.sourceType === 'zip'
                ? 'Design System importado (ZIP)'
                : 'Design System importado (HTML)',
            )
          } else {
            setPreviewTokenSourceLabel('Design System importado (sem tokens BRAND_*)')
          }
        }
      } catch (error) {
        console.warn('[identity] Failed to load design system preview context:', error)
        if (!cancelled) {
          setDesignSystemTokenOverrides({})
          setDesignSystemPreviewCss('')
          setDesignSystemLogoUrl(null)
          setImportedDsTemplates([])
          setPreviewTokenSourceLabel('Falha ao ler DS importado')
        }
      }
    }

    void loadDesignSystemPreviewContext()

    return () => {
      cancelled = true
    }
  }, [designSystemData?.designSystemImport?.fileUrl, designSystemData?.designSystemImport?.sourceType])

  const previewTokens = useMemo<Partial<InstagramPreviewTokens>>(() => {
    const primaryColor = brandAssets?.colors?.[0] || '#f97316'
    const secondaryColor = brandAssets?.colors?.[1] || '#ea580c'
    const textColor = brandAssets?.textColorPreferences?.titleColor || '#ffffff'
    const fontHeading = brandAssets?.titleFontFamily || brandAssets?.fonts?.[0]?.fontFamily || 'Montserrat'
    const fontBody = brandAssets?.bodyFontFamily || brandAssets?.fonts?.[0]?.fontFamily || 'Montserrat'

    return {
      primaryColor,
      secondaryColor,
      textColor,
      bgColor: '#09090b',
      fontHeading,
      fontBody,
      ...designSystemTokenOverrides,
    }
  }, [brandAssets, designSystemTokenOverrides])

  const identityLogoUrl = useMemo(() => {
    return designSystemLogoUrl || brandAssets?.logo?.url || undefined
  }, [brandAssets?.logo?.url, designSystemLogoUrl])

  const safeTemplates = Array.isArray(templates) ? templates : []

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-6">
        <div className="rounded-2xl border border-border bg-card/40 p-4">
          <h1 className="text-lg font-semibold text-text">Identidade e Design System</h1>
          <p className="mt-1 text-sm text-text-muted">
            Configure a base visual do projeto, mantenha consistencia com o DS e valide templates antes da geracao em lote.
          </p>
        </div>

        <DesignerGuideSection
          brandName={brandAssets?.name}
          previewTokens={previewTokens}
          tokenSourceLabel={previewTokenSourceLabel}
          createdTemplates={safeTemplates}
          importedTemplates={importedDsTemplates}
        />

        <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-6">
            <BrandAssetsSection projectId={projectId} />
            <StyleAnalysisSection projectId={projectId} />
          </div>

          <div className="space-y-6">
            <DesignSystemImportSection projectId={projectId} />
            <ArtTemplatesSection
              projectId={projectId}
              previewTokens={previewTokens}
              previewCss={designSystemPreviewCss}
              logoUrl={identityLogoUrl}
              importedTemplates={importedDsTemplates}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
