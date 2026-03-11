import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sparkles, Layers, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '@/lib/api-client'
import { useProjectStore } from '@/stores/project.store'
import { useGenerationStore, usePendingJobs, useReviewJobs, useCompletedJobs, ArtFormat, TextProcessingMode, GenerationParams, ReviewField, ReviewVariation, ReviewRenderContext } from '@/stores/generation.store'
import { useGenerateArt, GenerateArtResult } from '@/hooks/use-art-generation'
import { useArtTemplates, type ArtTemplate } from '@/hooks/use-art-templates'
import { useDesignSystem } from '@/hooks/use-design-system'
import { buildDraftLayout, resolveLayoutWithMeasurements } from '@/lib/layout-engine'
import { cn } from '@/lib/utils'
import { ReeditDraft } from '@/types/art-automation'
import {
  extractDesignSystemCssFromHtml,
  extractDesignSystemLogoFromHtml,
  extractDesignSystemLogoFromZip,
  extractDesignSystemCssFromZip,
  extractDesignSystemMetadataFromZip,
  extractInstagramPreviewTokensFromDesignSystemHtml,
  extractImportedDsTemplatesFromDesignSystemHtml,
  type ImportedDsTemplateSummary,
  type InstagramPreviewTokens,
} from '@/lib/instagram-ds/token-parser'
import { getTemplatePresetById } from '@/lib/instagram-ds/template-presets'
import { buildInstagramHtmlSnapshot } from '@/lib/instagram-ds/html-snapshot'
import { ApiError } from '@/lib/api-client'
import { Switch } from '@/components/project/shared/Switch'
import FormatSelector from '@/components/project/generate/FormatSelector'
import TemplateSelector from '@/components/project/generate/TemplateSelector'
import TextProcessingSelector from '@/components/project/generate/TextProcessingSelector'
import TextInput from '@/components/project/generate/TextInput'
import VariationSelector from '@/components/project/generate/VariationSelector'
import GenerationQueue from '@/components/project/generate/GenerationQueue'
import ResultImageCard from '@/components/project/generate/ResultImageCard'
import InstagramHtmlPreview from '@/components/project/generate/InstagramHtmlPreview'
import ProjectBadge from '@/components/layout/ProjectBadge'
import PhotoSelector from '@/components/project/generate/PhotoSelector'
import CompositionEditor from '@/components/project/generate/CompositionEditor'

const UPLOAD_URL = 'https://studio-lagosta-v2.vercel.app/api/upload'
const PREVIEW_FONT_STYLE_ID = 'lc-instagram-preview-fonts'
const PREVIEW_FONT_LINK_ID = 'lc-instagram-preview-fonts-link'
const DEFAULT_TEMPLATE_SOURCE_URL = 'https://studio-lagosta-v2.vercel.app'

function getFormatDimensions(format: ArtFormat): { width: number; height: number } {
  if (format === 'STORY') return { width: 1080, height: 1920 }
  if (format === 'SQUARE') return { width: 1080, height: 1080 }
  return { width: 1080, height: 1350 }
}

async function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const blob = new Blob([buffer], { type: mimeType })
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Falha ao converter imagem para data URL'))
    reader.readAsDataURL(blob)
  })
}

// Detect if template pipeline is available (Electron with new IPC channels)
// Use a function instead of module-level constant to avoid race conditions
// where the module loads before preload script sets up electronAPI
function checkTemplatePipeline(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.measureTextLayout
}

function extractPrimaryFontFamily(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/["']/g, '')
    .split(',')[0]
    .trim()
}

function normalizeFontLookup(value: string | null | undefined): string {
  return extractPrimaryFontFamily(value).toLowerCase()
}

function normalizeFontQueryName(value: string): string {
  return extractPrimaryFontFamily(value)
}

function isGenericFontFamily(value: string): boolean {
  const normalized = normalizeFontLookup(value)
  return (
    normalized === 'sans-serif'
    || normalized === 'serif'
    || normalized === 'monospace'
    || normalized === 'system-ui'
    || normalized === 'ui-sans-serif'
    || normalized === 'ui-serif'
    || normalized === 'ui-monospace'
  )
}

function shouldSkipGoogleFont(value: string): boolean {
  return (
    isGenericFontFamily(value)
    || normalizeFontLookup(value) === 'inter'
  )
}

interface GenerateArtTabProps {
  projectId: number
  draft?: ReeditDraft | null
  onDraftConsumed?: () => void
}

interface SelectedPhotoRef {
  url: string
  source: string
  format?: ArtFormat
  aspectRatio?: string
  width?: number
  height?: number
}

interface PreparedReviewVariation {
  imageUrl: string
  fields: ReviewField[]
  renderContext?: ReviewRenderContext
}

interface StructuredCopyVariation {
  pre_title: string
  title: string
  description: string
  cta: string
  badge: string
  footer_info_1: string
  footer_info_2: string
}

type CopyFieldCategory = 'pre_title' | 'title' | 'description' | 'cta' | 'badge' | 'footer' | null

function normalizeFieldKey(fieldKey: string): string {
  return fieldKey
    .toLowerCase()
    .replace(/[\s.-]+/g, '_')
}

function detectCopyFieldCategory(fieldKey: string): CopyFieldCategory {
  const key = normalizeFieldKey(fieldKey)

  if (/(^|_)(cta|call_to_action|action|botao|button|btn)($|_)/.test(key)) return 'cta'
  if (/(^|_)(badge|tag|label|sticker|seal|price|offer|valor|chip)($|_)/.test(key)) return 'badge'
  if (/(^|_)(pre|pre_title|pretitle|eyebrow|kicker|supertitle)($|_)/.test(key)) return 'pre_title'
  if (/(^|_)(title|headline|hero_title|main_title|h1|titulo)($|_)/.test(key)) return 'title'
  if (/(^|_)(footer|rodape|info|location|address|phone|contact|contato|whatsapp)($|_)/.test(key)) return 'footer'
  if (/(^|_)(description|desc|body|paragraph|texto|text|content|copy|subheadline)($|_)/.test(key)) return 'description'

  return null
}

function applyStructuredCopyToFields(
  fields: ReviewField[],
  copy?: StructuredCopyVariation,
): ReviewField[] {
  if (!copy) return fields

  let footerCursor = 0
  return fields.map((field) => {
    const category = detectCopyFieldCategory(field.key)
    if (!category) return field

    if (category === 'footer') {
      const footerValues = [copy.footer_info_1, copy.footer_info_2]
      const value = footerValues[Math.min(footerCursor, footerValues.length - 1)] ?? ''
      footerCursor += 1
      return { ...field, value }
    }

    const value = copy[category]
    if (typeof value !== 'string') return field

    // Keep previous value when structured copy returns empty critical fields.
    if ((category === 'title' || category === 'cta') && value.trim().length === 0) {
      return field
    }

    return { ...field, value }
  })
}

export default function GenerateArtTab({ projectId, draft, onDraftConsumed }: GenerateArtTabProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentProject } = useProjectStore()
  const addJob = useGenerationStore((s) => s.addJob)
  const removeJob = useGenerationStore((s) => s.removeJob)
  const updateJob = useGenerationStore((s) => s.updateJob)
  const jobs = useGenerationStore((s) => s.jobs)
  const pendingJobs = usePendingJobs()
  const reviewJobs = useReviewJobs()
  const completedJobs = useCompletedJobs()
  const generateArt = useGenerateArt()
  const isQueueRunningRef = useRef(false)

  // Art templates query
  const { data: artTemplates, isLoading: templatesLoading } = useArtTemplates(projectId)
  const { data: designSystemData } = useDesignSystem(projectId)
  const hasImportedDesignSystem = Boolean(
    designSystemData?.designSystemImport
      && (designSystemData.designSystemImport.sourceType === 'html' || designSystemData.designSystemImport.sourceType === 'zip')
  )

  // Form state
  const [format, setFormat] = useState<ArtFormat>('STORY')
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhotoRef | null>(null)
  const [text, setText] = useState('')
  const [includeLogo, setIncludeLogo] = useState(true)
  const [usePhoto, setUsePhoto] = useState(true)
  const [compositionEnabled, setCompositionEnabled] = useState(false)
  const [compositionPrompt, setCompositionPrompt] = useState('')
  const [compositionReferenceImages, setCompositionReferenceImages] = useState<File[]>([])
  const [variations, setVariations] = useState<1 | 2 | 4>(1)

  // Template state
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])
  const [textProcessingMode, setTextProcessingMode] = useState<TextProcessingMode>('faithful')
  const [textProcessingCustomPrompt, setTextProcessingCustomPrompt] = useState('')
  const [strictTemplateMode, setStrictTemplateMode] = useState(false)
  const [activeEditor, setActiveEditor] = useState<{ jobId: string; variationId: string } | null>(null)
  const previewDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [designSystemTokenOverrides, setDesignSystemTokenOverrides] = useState<Partial<InstagramPreviewTokens>>({})
  const [designSystemPreviewCss, setDesignSystemPreviewCss] = useState<string>('')
  const [designSystemLogoUrl, setDesignSystemLogoUrl] = useState<string | null>(null)
  const [importedDsTemplates, setImportedDsTemplates] = useState<ImportedDsTemplateSummary[]>([])
  const [previewTokenSourceLabel, setPreviewTokenSourceLabel] = useState('Design System (fallback interno)')

  // Reset template selection when format changes
  useEffect(() => {
    setSelectedTemplateIds([])
  }, [format])

  // Apply re-edit draft when coming from History tab
  useEffect(() => {
    if (!draft) return

    setFormat(draft.format)
    setText(draft.prompt || '')
    if (draft.photoUrl) {
      setUsePhoto(true)
      setSelectedPhoto({ url: draft.photoUrl, source: draft.photoSource || 'history' })
    }
    onDraftConsumed?.()
  }, [draft, onDraftConsumed])

  useEffect(() => {
    if (!activeEditor) return
    const job = jobs.find((j) => j.id === activeEditor.jobId)
    const variationExists = !!job?.reviewItems.find((v) => v.id === activeEditor.variationId)
    if (!variationExists) {
      setActiveEditor(null)
    }
  }, [activeEditor, jobs])

  useEffect(() => {
    let cancelled = false

    const imported = designSystemData?.designSystemImport
    if (!imported || (imported.sourceType !== 'html' && imported.sourceType !== 'zip')) {
      setDesignSystemTokenOverrides({})
      setDesignSystemPreviewCss('')
      setDesignSystemLogoUrl(null)
      setImportedDsTemplates([])
      setPreviewTokenSourceLabel('Design System (fallback interno)')
      return () => {
        cancelled = true
      }
    }

    const loadDesignSystemTokens = async () => {
      try {
        const downloaded = await window.electronAPI.downloadBlob(imported.fileUrl)
        if (!downloaded.ok || !downloaded.buffer) {
          if (!cancelled) {
            setDesignSystemTokenOverrides({})
            setDesignSystemPreviewCss('')
            setDesignSystemLogoUrl(null)
            setImportedDsTemplates([])
            setPreviewTokenSourceLabel('Design System (falha ao baixar import)')
          }
          return
        }

        let extracted: Partial<InstagramPreviewTokens> = {}
        let detectedTemplates: ImportedDsTemplateSummary[] = []
        let extractedCss = ''
        let extractedLogo: string | null = null
        if (imported.sourceType === 'html') {
          const html = new TextDecoder('utf-8').decode(new Uint8Array(downloaded.buffer))
          extracted = extractInstagramPreviewTokensFromDesignSystemHtml(html)
          detectedTemplates = extractImportedDsTemplatesFromDesignSystemHtml(html)
          extractedCss = extractDesignSystemCssFromHtml(html)
          extractedLogo = extractDesignSystemLogoFromHtml(html)
        } else {
          const metadata = await extractDesignSystemMetadataFromZip(downloaded.buffer)
          extracted = metadata.tokens
          detectedTemplates = metadata.templates
          extractedCss = await extractDesignSystemCssFromZip(downloaded.buffer)
          extractedLogo = await extractDesignSystemLogoFromZip(downloaded.buffer)
        }

        if (!cancelled) {
          setDesignSystemTokenOverrides(extracted)
          setDesignSystemPreviewCss(extractedCss)
          setDesignSystemLogoUrl(extractedLogo)
          setImportedDsTemplates(detectedTemplates)
          if (Object.keys(extracted).length > 0) {
            setPreviewTokenSourceLabel(imported.sourceType === 'zip' ? 'Design System importado (ZIP)' : 'Design System importado (HTML)')
          } else {
            setPreviewTokenSourceLabel('Design System importado (sem tokens BRAND_*)')
          }
        }
      } catch (error) {
        console.warn('[design-system] Failed to load preview tokens from imported design system:', error)
        if (!cancelled) {
          setDesignSystemTokenOverrides({})
          setDesignSystemPreviewCss('')
          setDesignSystemLogoUrl(null)
          setImportedDsTemplates([])
          setPreviewTokenSourceLabel('Design System (falha ao ler import)')
        }
      }
    }

    void loadDesignSystemTokens()

    return () => {
      cancelled = true
    }
  }, [designSystemData?.designSystemImport?.fileUrl, designSystemData?.designSystemImport?.sourceType])

  const previewTokens = useMemo<Partial<InstagramPreviewTokens>>(() => {
    const baseTokens: Partial<InstagramPreviewTokens> = {
      primaryColor: '#f97316',
      secondaryColor: '#ea580c',
      textColor: '#ffffff',
      bgColor: '#09090b',
      fontHeading: 'Montserrat',
      fontBody: 'Montserrat',
    }

    return {
      ...baseTokens,
      ...designSystemTokenOverrides,
    }
  }, [designSystemTokenOverrides])

  const identityLogoUrl = useMemo(() => {
    if (hasImportedDesignSystem) return designSystemLogoUrl || undefined
    return undefined
  }, [hasImportedDesignSystem, designSystemLogoUrl])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const desiredFonts = Array.from(
      new Set(
        [previewTokens.fontHeading, previewTokens.fontBody]
          .map((font) => (font || '').trim())
          .filter(Boolean)
      )
    )

    const localFontFaces: string[] = []
    const unresolvedFonts = new Set<string>()

    for (const font of desiredFonts) {
      if (!shouldSkipGoogleFont(font)) {
        unresolvedFonts.add(normalizeFontQueryName(font))
      }
    }

    let styleElement = document.getElementById(PREVIEW_FONT_STYLE_ID) as HTMLStyleElement | null
    if (!styleElement) {
      styleElement = document.createElement('style')
      styleElement.id = PREVIEW_FONT_STYLE_ID
      document.head.appendChild(styleElement)
    }
    styleElement.textContent = localFontFaces.join('\n')

    const googleFamilies = Array.from(unresolvedFonts).filter(Boolean)
    const currentLink = document.getElementById(PREVIEW_FONT_LINK_ID) as HTMLLinkElement | null
    if (googleFamilies.length === 0) {
      if (currentLink) currentLink.remove()
      return
    }

    const familyQuery = googleFamilies
      .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;500;600;700;800`)
      .join('&')
    const href = `https://fonts.googleapis.com/css2?${familyQuery}&display=swap`

    if (currentLink) {
      if (currentLink.href !== href) currentLink.href = href
      return
    }

    const link = document.createElement('link')
    link.id = PREVIEW_FONT_LINK_ID
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }, [previewTokens.fontHeading, previewTokens.fontBody])

  const hasTemplatePipeline = checkTemplatePipeline()
  const isTemplateMode = hasTemplatePipeline && selectedTemplateIds.length > 0

  const uploadReferenceImages = useCallback(async (files: File[]): Promise<string[]> => {
    const urls: string[] = []
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer()
      const response = await window.electronAPI.uploadFile(
        UPLOAD_URL,
        { name: file.name, type: file.type, buffer: arrayBuffer },
        { type: 'reference' }
      )
      if (!response.ok || !response.data?.url) {
        throw new Error(`Erro ao enviar imagem de referência: ${file.name}`)
      }
      urls.push(response.data.url)
    }
    return urls
  }, [])

  const formatFieldLabel = useCallback((raw: string): string => (
    raw
      .replace(/^el_/, 'texto ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  ), [])

  // 4-pass template pipeline orchestration (frontend)
  const processResultWithTemplate = useCallback(async (
    result: GenerateArtResult,
    includeLogoOnRender: boolean,
    copyVariations?: StructuredCopyVariation[],
    preferredSourceImageUrl?: string,
    templateCodeMap?: Record<string, string>,
  ): Promise<PreparedReviewVariation[]> => {
    const prepared: PreparedReviewVariation[] = []

    if (!result.imageUrl || !result.templates || !result.slots) {
      throw new Error('Dados de template incompletos na resposta')
    }

    const normalizedFormat: ArtFormat = result.format === 'STORY' || result.format === 'SQUARE'
      ? result.format
      : 'FEED_PORTRAIT'

    // Download source image for template background once.
    // Prefer the user's selected photo (clean source) over legacy-rendered output.
    const initialSourceUrl = preferredSourceImageUrl || result.imageUrl
    console.log('[template-render] Source image selected for preview:', {
      preferred: Boolean(preferredSourceImageUrl),
      initialIsDataUrl: initialSourceUrl.startsWith('data:image/'),
    })
    let downloaded = await window.electronAPI.downloadBlob(initialSourceUrl)
    if ((!downloaded.ok || !downloaded.buffer) && initialSourceUrl !== result.imageUrl) {
      downloaded = await window.electronAPI.downloadBlob(result.imageUrl)
    }
    if (!downloaded.ok || !downloaded.buffer) {
      throw new Error('Erro ao baixar imagem base')
    }
    const imageBuffer = downloaded.buffer
    const sourceImageDataUrl = await arrayBufferToDataUrl(
      imageBuffer,
      downloaded.contentType && downloaded.contentType.startsWith('image/')
        ? downloaded.contentType
        : 'image/jpeg'
    )
    const previewSourceImageUrl = preferredSourceImageUrl || sourceImageDataUrl

    const fieldsFromSlots: ReviewField[] = Object.entries(result.slots).map(([key, value]) => ({
      key,
      label: formatFieldLabel(key),
      value: String(value ?? ''),
    }))

    const targetCount = Math.max(
      result.templates.length,
      copyVariations?.length || 0,
      result.variations || 0,
      1,
    )

    for (let idx = 0; idx < targetCount; idx++) {
      const tpl = result.templates[idx % result.templates.length]
      if (!tpl) continue
      const templateNameForPreview = templateCodeMap?.[tpl.templateId] || tpl.templateId
      try {
        const selectedCopy = copyVariations && copyVariations.length > 0
          ? copyVariations[Math.min(idx, copyVariations.length - 1)]
          : undefined
        const finalFields = applyStructuredCopyToFields(
          fieldsFromSlots.map((f) => ({ ...f })),
          selectedCopy,
        )
        const slots = Object.fromEntries(finalFields.map((f) => [f.key, f.value]))
        const draft = buildDraftLayout(
          slots,
          tpl.templateData,
          normalizedFormat,
          tpl.fontSources,
          result.strictTemplateMode ?? false,
        )

        const measurements = await window.electronAPI.measureTextLayout(draft)
        const finalLayout = resolveLayoutWithMeasurements(draft, measurements, {
          strictMode: result.strictTemplateMode ?? false,
        })

        const rendered = await window.electronAPI.renderFinalLayout(
          finalLayout,
          imageBuffer,
          undefined,
        )

        let imageUrl = result.imageUrl
        if (rendered.ok && rendered.buffer) {
          const blob = new Blob([rendered.buffer], { type: 'image/jpeg' })
          imageUrl = URL.createObjectURL(blob)
        }

        prepared.push({
          imageUrl,
          fields: finalFields,
          renderContext: {
            kind: 'template',
            sourceImageUrl: previewSourceImageUrl,
            templateId: templateNameForPreview,
            templateData: tpl.templateData,
            fontSources: tpl.fontSources,
            strictTemplateMode: result.strictTemplateMode ?? false,
            logo: undefined,
            includeLogo: includeLogoOnRender,
          },
        })
      } catch (e: any) {
        console.error(`[template-render] Failed for template ${tpl.templateId}:`, e)
        if (result.strictTemplateMode) throw e
        const selectedCopy = copyVariations && copyVariations.length > 0
          ? copyVariations[Math.min(idx, copyVariations.length - 1)]
          : undefined
        const finalFields = applyStructuredCopyToFields(
          fieldsFromSlots.map((f) => ({ ...f })),
          selectedCopy,
        )

        prepared.push({
          imageUrl: result.imageUrl,
          fields: finalFields,
          renderContext: {
            kind: 'template',
            sourceImageUrl: previewSourceImageUrl,
            templateId: templateNameForPreview,
            templateData: tpl.templateData,
            fontSources: tpl.fontSources,
            strictTemplateMode: result.strictTemplateMode ?? false,
            logo: undefined,
            includeLogo: includeLogoOnRender,
          },
        })
      }
    }

    return prepared
  }, [formatFieldLabel])

  // Legacy: process result images without template (existing flow)
  const processResultImagesLegacy = useCallback(async (
    result: GenerateArtResult,
    includeLogoOnRender: boolean,
  ): Promise<PreparedReviewVariation[]> => {
    const prepared: PreparedReviewVariation[] = []

    for (const img of result.images) {
      const fields: ReviewField[] = (img.textLayout?.elements ?? []).map((el: any, idx: number) => ({
        key: `el_${idx}`,
        label: formatFieldLabel(el.type || `texto_${idx + 1}`),
        value: String(el.text ?? ''),
      }))

      const downloaded = await window.electronAPI.downloadBlob(img.imageUrl)
      if (!downloaded.ok || !downloaded.buffer) {
        prepared.push({
          imageUrl: img.imageUrl,
          fields,
        })
        continue
      }

      let imageUrl = img.imageUrl
      if (img.textLayout && result.fonts && window.electronAPI.renderText) {
        try {
          const legacyLogo = includeLogoOnRender && identityLogoUrl
            ? {
              url: identityLogoUrl,
              position: 'bottom-right',
              sizePct: 12,
            }
            : undefined

          const rendered = await window.electronAPI.renderText({
            imageBuffer: downloaded.buffer,
            textLayout: img.textLayout,
            fonts: result.fonts,
            fontUrls: result.fontUrls,
            logoUrl: legacyLogo?.url,
            logoPosition: legacyLogo?.position,
            logoSizePct: legacyLogo?.sizePct,
          })
          if (rendered.ok && rendered.buffer) {
            const blob = new Blob([rendered.buffer], { type: 'image/jpeg' })
            imageUrl = URL.createObjectURL(blob)
          }
        } catch (e) {
          console.error('[render-text] Failed, using original:', e)
        }
      } else {
        const blob = new Blob([downloaded.buffer], { type: downloaded.contentType || 'image/jpeg' })
        imageUrl = URL.createObjectURL(blob)
      }

      prepared.push({
        imageUrl,
        fields,
        renderContext: img.textLayout && result.fonts ? {
          kind: 'legacy',
          sourceImageUrl: img.imageUrl,
          textLayout: img.textLayout,
          fonts: result.fonts,
          fontUrls: result.fontUrls,
          logo: includeLogoOnRender && identityLogoUrl
            ? {
              url: identityLogoUrl,
              position: 'bottom-right',
              sizePct: 12,
            }
            : undefined,
          includeLogo: includeLogoOnRender,
        } : undefined,
      })
    }

    return prepared
  }, [formatFieldLabel, identityLogoUrl])

  const processResultImages = useCallback(async (
    result: GenerateArtResult,
    includeLogoOnRender: boolean,
    copyVariations?: StructuredCopyVariation[],
    preferredSourceImageUrl?: string,
    templateCodeMap?: Record<string, string>,
  ): Promise<PreparedReviewVariation[]> => {
    const pipelineAvailable = checkTemplatePipeline()
    if (result.templatePath && pipelineAvailable) {
      return processResultWithTemplate(
        result,
        includeLogoOnRender,
        copyVariations,
        preferredSourceImageUrl,
        templateCodeMap,
      )
    } else if (result.templatePath && !pipelineAvailable) {
      throw new Error('Templates requerem o app desktop')
    }
    return processResultImagesLegacy(result, includeLogoOnRender)
  }, [processResultWithTemplate, processResultImagesLegacy])

  const findTemplateInList = useCallback((list: ArtTemplate[], requestedId: string, formatHint?: ArtFormat) => {
    const normalized = requestedId.trim().toUpperCase()
    const direct = list.find((tpl) => tpl.id === requestedId)
    if (direct) return direct

    const byIdInName = list.find((tpl) => {
      if (formatHint && tpl.format !== formatHint) return false
      return tpl.name.toUpperCase().startsWith(`${normalized} -`)
    })
    if (byIdInName) return byIdInName

    const preset = getTemplatePresetById(normalized, formatHint)
    if (!preset) return null
    return list.find((tpl) => tpl.fingerprint === preset.fingerprint && tpl.format === preset.format) || null
  }, [])

  const ensureTemplateIdsForGeneration = useCallback(async (
    requestedIds: string[],
    formatHint: ArtFormat,
  ): Promise<string[]> => {
    if (requestedIds.length === 0) return []

    let latestTemplates: ArtTemplate[] = Array.isArray(artTemplates) ? [...artTemplates] : []
    const resolvedIds: string[] = []
    let didCreate = false

    for (const requestedId of requestedIds) {
      const found = findTemplateInList(latestTemplates, requestedId, formatHint)
      if (found?.id) {
        resolvedIds.push(found.id)
        continue
      }

      const preset = getTemplatePresetById(requestedId, formatHint)
      if (!preset) {
        throw new Error(`Template ${requestedId} nao encontrado neste ambiente.`)
      }

      const sourceImageUrl = selectedPhoto?.url || DEFAULT_TEMPLATE_SOURCE_URL
      try {
        const created = await api.post<{ template?: ArtTemplate; id?: string }>(
          `/api/projects/${projectId}/art-templates`,
          {
            name: preset.name,
            format: preset.format,
            sourceImageUrl,
            templateData: preset.templateData,
            fingerprint: preset.fingerprint,
            analysisConfidence: preset.analysisConfidence,
          },
        )

        const createdTemplate = created?.template
        if (createdTemplate?.id) {
          resolvedIds.push(createdTemplate.id)
          latestTemplates = [...latestTemplates, createdTemplate]
          didCreate = true
          continue
        }

        const createdId = typeof created?.id === 'string' ? created.id : null
        if (createdId) {
          resolvedIds.push(createdId)
          didCreate = true
          continue
        }
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) {
          const message = error instanceof Error ? error.message : 'Falha ao preparar templates importados'
          throw new Error(message)
        }
      }

      const refreshed = await api.get<ArtTemplate[]>(`/api/projects/${projectId}/art-templates`)
      latestTemplates = refreshed
      const resolvedAfterRefresh = findTemplateInList(latestTemplates, requestedId, formatHint)
      if (!resolvedAfterRefresh?.id) {
        throw new Error(`Template ${requestedId} nao foi encontrado apos sincronizacao.`)
      }
      resolvedIds.push(resolvedAfterRefresh.id)
    }

    if (didCreate) {
      await queryClient.invalidateQueries({ queryKey: ['art-templates', projectId] })
    }

    return resolvedIds
  }, [artTemplates, findTemplateInList, projectId, queryClient, selectedPhoto?.url])

  const persistApprovedArts = useCallback(async (items: ReviewVariation[], params: {
    projectId: number
    text: string
    format: ArtFormat
  }): Promise<string[]> => {
    const persistedUrls: string[] = []

    const toEmbeddableImageUrl = async (url: string | undefined): Promise<string | undefined> => {
      if (!url) return undefined
      if (url.startsWith('data:image/')) return url

      const downloaded = await window.electronAPI.downloadBlob(url)
      if (!downloaded.ok || !downloaded.buffer) {
        if (url.startsWith('blob:')) {
          throw new Error('Nao foi possivel preparar a imagem local para aprovacao')
        }
        return url
      }

      const downloadedType = (downloaded.contentType || '').toLowerCase()
      if (downloadedType && !downloadedType.startsWith('image/')) {
        if (url.startsWith('blob:')) {
          throw new Error('Imagem local invalida para aprovacao')
        }
        return url
      }

      const inferredType = downloaded.contentType
        || (url.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')
      return arrayBufferToDataUrl(downloaded.buffer, inferredType)
    }

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx]
      if (!item) continue

      let imageUrl = item.imageUrl
      const usedHtmlSnapshot = item.renderContext?.kind === 'template'
      console.log('[Approval] Persisting variation', idx + 1, {
        contextKind: item.renderContext?.kind || 'none',
        format: params.format,
      })
      if (item.renderContext?.kind === 'template') {
        const embeddedSourceImageUrl = await toEmbeddableImageUrl(item.renderContext.sourceImageUrl)
        const embeddedLogoUrl = item.renderContext.includeLogo
          ? await toEmbeddableImageUrl(identityLogoUrl)
          : undefined

        console.log('[Approval] Rendering HTML snapshot for template', {
          templateId: item.renderContext.templateId,
          hasEmbeddedSource: Boolean(embeddedSourceImageUrl),
          hasEmbeddedLogo: Boolean(embeddedLogoUrl),
        })
        const snapshot = buildInstagramHtmlSnapshot({
          format: params.format,
          fields: item.fields,
          sourceImageUrl: embeddedSourceImageUrl,
          logoUrl: embeddedLogoUrl,
          includeLogo: item.renderContext.includeLogo,
          templateName: item.renderContext.templateId,
          tokens: previewTokens,
          customCss: designSystemPreviewCss,
          showTemplateBadge: false,
        })
        const dimensions = getFormatDimensions(params.format)
        const rendered = await window.electronAPI.renderHtmlSnapshot({
          html: snapshot.html,
          width: dimensions.width,
          height: dimensions.height,
          mimeType: 'image/jpeg',
          quality: 92,
        })

        if (!rendered.ok || !rendered.buffer) {
          throw new Error('Falha ao renderizar snapshot HTML da variacao aprovada')
        }
        console.log('[Approval] HTML snapshot rendered buffer:', rendered.buffer.byteLength, 'bytes')

        const uploadResponse = await window.electronAPI.uploadFile(
          UPLOAD_URL,
          {
            name: `approved-art-${Date.now()}-${idx + 1}.jpg`,
            type: rendered.mimeType || 'image/jpeg',
            buffer: rendered.buffer,
          },
          { type: 'approved_art' }
        )

        const uploadedUrl = (uploadResponse.data as { url?: string } | undefined)?.url
        if (!uploadResponse.ok || !uploadedUrl) {
          throw new Error('Falha no upload da arte aprovada para o site')
        }
        imageUrl = uploadedUrl
      }

      let finalWebUrl = imageUrl

      const isRemoteHttp = imageUrl.startsWith('http://') || imageUrl.startsWith('https://')
      const shouldUploadToWeb = !isRemoteHttp

      if (shouldUploadToWeb) {
        const response = await fetch(imageUrl)
        if (!response.ok) {
          throw new Error('Falha ao ler imagem local para persistência')
        }

        const imageBuffer = await response.arrayBuffer()
        const contentType = response.headers.get('content-type') || 'image/jpeg'
        const uploadResponse = await window.electronAPI.uploadFile(
          UPLOAD_URL,
          {
            name: `approved-art-${Date.now()}-${idx + 1}.jpg`,
            type: contentType,
            buffer: imageBuffer,
          },
          { type: 'approved_art' }
        )

        const uploadedUrl = (uploadResponse.data as { url?: string } | undefined)?.url
        if (!uploadResponse.ok || !uploadedUrl) {
          throw new Error('Falha no upload da arte aprovada para o site')
        }
        finalWebUrl = uploadedUrl
      }

      const created = await api.post<{ fileUrl: string }>(
        `/api/projects/${params.projectId}/ai-images`,
        {
          fileUrl: finalWebUrl,
          prompt: params.text,
          format: params.format,
          name: `Arte aprovada ${idx + 1}`,
          provider: 'lagosta-html-renderer',
          model: usedHtmlSnapshot ? 'html-css-renderer-v2-capturepage' : 'html-css-renderer-v1',
        }
      )

      persistedUrls.push(created.fileUrl || finalWebUrl)
    }

    return persistedUrls
  }, [designSystemPreviewCss, identityLogoUrl, previewTokens])

  const processQueuedJob = useCallback(async (jobId: string, params: GenerationParams) => {
    updateJob(jobId, { status: 'generating', error: undefined })

    try {
      let copyVariations: StructuredCopyVariation[] | undefined
      const shouldGenerateStructuredCopy = !!params.templateIds && params.templateIds.length > 0
      const promptForCopy = params.text.trim() || params.textProcessingCustomPrompt?.trim() || ''

      if (shouldGenerateStructuredCopy && promptForCopy) {
        try {
          const copyResponse = await window.electronAPI.generateAIText({
            projectId: params.projectId,
            prompt: promptForCopy,
            format: params.format,
            variations: params.variations,
            templateIds: params.templateIds,
            includeLogo: params.includeLogo,
            usePhoto: params.usePhoto,
            photoUrl: params.photoUrl,
            compositionEnabled: params.compositionEnabled,
            compositionPrompt: params.compositionPrompt,
            compositionReferenceUrls: params.compositionReferenceUrls,
          })
          if (Array.isArray(copyResponse?.variacoes) && copyResponse.variacoes.length > 0) {
            copyVariations = copyResponse.variacoes
          }
        } catch (copyError) {
          console.warn('[generate-art] Structured copy failed, keeping fallback flow:', copyError)
          toast.warning('Nao foi possivel gerar copy estruturada. Usando fallback do template.')
        }
      }

      const result = await generateArt.mutateAsync({
        projectId: params.projectId,
        text: params.text,
        format: params.format,
        includeLogo: params.includeLogo,
        usePhoto: params.usePhoto,
        photoUrl: params.photoUrl,
        variations: params.variations,
        compositionEnabled: params.compositionEnabled,
        compositionPrompt: params.compositionPrompt,
        compositionReferenceUrls: params.compositionReferenceUrls,
        templateIds: params.templateIds,
        textProcessingMode: params.textProcessingMode,
        textProcessingCustomPrompt: params.textProcessingCustomPrompt,
        strictTemplateMode: params.strictTemplateMode,
      })

      try {
        const preparedVariations = await processResultImages(
          result,
          params.includeLogo,
          copyVariations,
          params.photoUrl,
          params.templateCodeMap,
        )
        if (preparedVariations.length === 0) {
          throw new Error('Nenhuma arte foi gerada')
        }
        const reviewItems: ReviewVariation[] = preparedVariations.map((variation, idx) => ({
          id: `${jobId}-${Date.now()}-${idx}`,
          imageUrl: variation.imageUrl,
          status: 'review',
          fields: variation.fields,
          renderContext: variation.renderContext,
          isUpdatingPreview: false,
        }))
        updateJob(jobId, {
          status: 'review',
          images: [],
          reviewItems,
          error: undefined,
        })
        toast.info(`${reviewItems.length} variacao(oes) pronta(s) para aprovacao`)
      } catch (error: any) {
        const message = result.templatePath
          ? (error?.message || 'Erro no pipeline de template')
          : (error?.message || 'Erro ao processar/salvar artes')
        updateJob(jobId, { status: 'error', error: message })
        toast.error(message)
      }
    } catch (error: any) {
      const message = error?.message || 'Erro ao gerar arte'
      updateJob(jobId, { status: 'error', error: message })
      toast.error(message)
    }
  }, [updateJob, generateArt, processResultImages])

  const runQueue = useCallback(async () => {
    if (isQueueRunningRef.current) return

    isQueueRunningRef.current = true
    try {
      while (true) {
        const state = useGenerationStore.getState()
        const hasGenerating = state.jobs.some((job) => job.status === 'generating')
        if (hasGenerating) break

        const nextJob = state.jobs.find((job) => job.status === 'pending')
        if (!nextJob) break

        await processQueuedJob(nextJob.id, nextJob.params)
      }
    } finally {
      isQueueRunningRef.current = false
    }
  }, [processQueuedJob])

  useEffect(() => {
    const hasPending = jobs.some((job) => job.status === 'pending')
    if (hasPending) {
      void runQueue()
    }
  }, [jobs, runQueue])

  const handleGenerate = useCallback(async () => {
    // Validation: text required except for generate_copy mode
    if (!text.trim() && textProcessingMode !== 'generate_copy') {
      toast.error('Digite o texto que aparecera na arte')
      return
    }
    if (textProcessingMode === 'generate_copy' && !textProcessingCustomPrompt.trim()) {
      toast.error('Preencha o prompt para geracao de copy')
      return
    }

    // Upload composition reference images if needed
    let compositionReferenceUrls: string[] | undefined
    if (compositionEnabled && compositionReferenceImages.length > 0) {
      try {
        compositionReferenceUrls = await uploadReferenceImages(compositionReferenceImages)
      } catch (error: any) {
        toast.error(error.message || 'Erro ao enviar imagens de referência')
        return
      }
    }

    let templateIdsForGeneration: string[] | undefined
    let templateCodeMapForGeneration: Record<string, string> | undefined
    if (isTemplateMode) {
      try {
        templateIdsForGeneration = await ensureTemplateIdsForGeneration(selectedTemplateIds, format)
        templateCodeMapForGeneration = templateIdsForGeneration.reduce<Record<string, string>>((acc, resolvedId, index) => {
          const dsTemplateCode = selectedTemplateIds[index] || selectedTemplateIds[0]
          if (resolvedId && dsTemplateCode) {
            acc[resolvedId] = dsTemplateCode
          }
          return acc
        }, {})
      } catch (error: any) {
        toast.error(error?.message || 'Erro ao preparar templates para geracao')
        return
      }
    }

    const params: GenerationParams = {
      projectId,
      format,
      text: text.trim(),
      variations,
      includeLogo,
      usePhoto,
      photoUrl: usePhoto ? selectedPhoto?.url : undefined,
      compositionEnabled,
      compositionPrompt: compositionEnabled ? compositionPrompt : undefined,
      compositionReferenceUrls,
      ...(isTemplateMode && {
        templateIds: templateIdsForGeneration,
        templateCodeMap: templateCodeMapForGeneration,
        textProcessingMode,
        textProcessingCustomPrompt: textProcessingMode === 'generate_copy' ? textProcessingCustomPrompt : undefined,
        strictTemplateMode,
      }),
    }

    addJob(params)
    void runQueue()

    const queueSize = useGenerationStore
      .getState()
      .jobs
      .filter((job) => job.status === 'pending' || job.status === 'generating')
      .length

    if (queueSize > 1) {
      toast.info(`Arte adicionada na fila (${queueSize} jobs aguardando/processando)`)
    } else {
      toast.info('Geracao iniciada. Voce pode continuar usando o app')
    }
  }, [format, text, variations, includeLogo, usePhoto, selectedPhoto, compositionEnabled, compositionPrompt, compositionReferenceImages, uploadReferenceImages, isTemplateMode, selectedTemplateIds, textProcessingMode, textProcessingCustomPrompt, strictTemplateMode, addJob, runQueue, ensureTemplateIdsForGeneration])

  const renderVariationPreview = useCallback(async (jobId: string, variationId: string): Promise<string | null> => {
    const job = useGenerationStore.getState().jobs.find((j) => j.id === jobId)
    if (!job) return null
    const variation = job.reviewItems.find((item) => item.id === variationId)
    if (!variation?.renderContext) return null

    const context = variation.renderContext
    const source = await window.electronAPI.downloadBlob(context.sourceImageUrl)
    if (!source.ok || !source.buffer) return null

    if (context.kind === 'legacy') {
      if (!context.fonts || !window.electronAPI.renderText) return null
      const nextLayout = JSON.parse(JSON.stringify(context.textLayout || {}))
      if (Array.isArray(nextLayout.elements)) {
        for (const field of variation.fields) {
          const idx = Number(field.key.replace('el_', ''))
          if (!Number.isNaN(idx) && nextLayout.elements[idx]) {
            nextLayout.elements[idx].text = field.value
          }
        }
      }

      const rendered = await window.electronAPI.renderText({
        imageBuffer: source.buffer,
        textLayout: nextLayout,
        fonts: context.fonts,
        fontUrls: context.fontUrls,
        logoUrl: context.includeLogo ? context.logo?.url : undefined,
        logoPosition: context.logo?.position,
        logoSizePct: context.logo?.sizePct,
      })

      if (!rendered.ok || !rendered.buffer) return null
      return URL.createObjectURL(new Blob([rendered.buffer], { type: 'image/jpeg' }))
    }

    const slots = Object.fromEntries(variation.fields.map((field) => [field.key, field.value]))
    const draft = buildDraftLayout(
      slots,
      context.templateData,
      job.params.format,
      context.fontSources,
      context.strictTemplateMode,
    )
    const measurements = await window.electronAPI.measureTextLayout(draft)
    const finalLayout = resolveLayoutWithMeasurements(draft, measurements, {
      strictMode: context.strictTemplateMode,
    })
    const rendered = await window.electronAPI.renderFinalLayout(
      finalLayout,
      source.buffer,
      context.includeLogo ? context.logo : undefined,
    )
    if (!rendered.ok || !rendered.buffer) return null
    return URL.createObjectURL(new Blob([rendered.buffer], { type: 'image/jpeg' }))
  }, [])

  const scheduleVariationPreviewRerender = useCallback((jobId: string, variationId: string) => {
    const timerKey = `${jobId}:${variationId}`
    const activeTimer = previewDebounceRef.current[timerKey]
    if (activeTimer) clearTimeout(activeTimer)

    previewDebounceRef.current[timerKey] = setTimeout(async () => {
      const before = useGenerationStore.getState().jobs.find((j) => j.id === jobId)
      const beforeItem = before?.reviewItems.find((item) => item.id === variationId)
      if (!before || !beforeItem) return

      updateJob(jobId, {
        reviewItems: before.reviewItems.map((item) =>
          item.id === variationId ? { ...item, isUpdatingPreview: true } : item
        ),
      })

      try {
        const nextPreviewUrl = await renderVariationPreview(jobId, variationId)
        const latestJob = useGenerationStore.getState().jobs.find((j) => j.id === jobId)
        const latestItem = latestJob?.reviewItems.find((item) => item.id === variationId)
        if (!latestJob || !latestItem) return

        updateJob(jobId, {
          reviewItems: latestJob.reviewItems.map((item) => {
            if (item.id !== variationId) return item
            if (nextPreviewUrl && item.imageUrl.startsWith('blob:') && item.imageUrl !== nextPreviewUrl) {
              URL.revokeObjectURL(item.imageUrl)
            }
            return {
              ...item,
              imageUrl: nextPreviewUrl || item.imageUrl,
              isUpdatingPreview: false,
            }
          }),
        })
      } catch (error) {
        const latestJob = useGenerationStore.getState().jobs.find((j) => j.id === jobId)
        if (!latestJob) return
        updateJob(jobId, {
          reviewItems: latestJob.reviewItems.map((item) =>
            item.id === variationId ? { ...item, isUpdatingPreview: false } : item
          ),
        })
      } finally {
        delete previewDebounceRef.current[timerKey]
      }
    }, 220)
  }, [renderVariationPreview, updateJob])

  const updateVariationField = useCallback((jobId: string, variationId: string, fieldKey: string, value: string) => {
    const job = useGenerationStore.getState().jobs.find((j) => j.id === jobId)
    if (!job) return

    let shouldRerender = false
    const updatedItems = job.reviewItems.map((item) => {
      if (item.id !== variationId) return item
      shouldRerender = item.renderContext?.kind === 'legacy'
      return {
        ...item,
        status: item.status === 'approved' || item.status === 'rejected' ? 'review' : item.status,
        approvedUrl: undefined,
        fields: item.fields.map((field) =>
          field.key === fieldKey ? { ...field, value } : field
        ),
      }
    })

    updateJob(jobId, {
      status: 'review',
      error: undefined,
      reviewItems: updatedItems,
    })

    if (shouldRerender) {
      scheduleVariationPreviewRerender(jobId, variationId)
    }
  }, [updateJob, scheduleVariationPreviewRerender])

  useEffect(() => () => {
    Object.values(previewDebounceRef.current).forEach((timer) => clearTimeout(timer))
  }, [])

  const finalizeReviewJobIfComplete = useCallback(async (jobId: string) => {
    const job = useGenerationStore.getState().jobs.find((j) => j.id === jobId)
    if (!job) return

    const stillInReview = job.reviewItems.some((item) => item.status === 'review')
    if (stillInReview) return

    const approvedItems = job.reviewItems.filter((item) => item.status === 'approved')

    if (approvedItems.length === 0) {
      removeJob(jobId)
      toast.info('Nenhuma variacao aprovada. Job encerrado.')
      return
    }

    updateJob(jobId, { status: 'saving', error: undefined })
    try {
      const persistedUrls = await persistApprovedArts(
        approvedItems,
        {
          projectId: job.params.projectId,
          text: job.params.text,
          format: job.params.format,
        }
      )

      updateJob(jobId, {
        status: 'done',
        images: persistedUrls,
        reviewItems: [],
        error: undefined,
      })
      await queryClient.invalidateQueries({ queryKey: ['ai-images', job.params.projectId] })
      toast.success(`${persistedUrls.length} variacao(oes) aprovada(s) e salva(s) no web`)
    } catch (error: any) {
      updateJob(jobId, {
        status: 'review',
        error: error?.message || 'Falha ao salvar variacoes aprovadas',
      })
      toast.error(error?.message || 'Falha ao salvar variacoes aprovadas')
    }
  }, [removeJob, updateJob, queryClient, persistApprovedArts])

  const approveVariation = useCallback(async (jobId: string, variationId: string) => {
    const job = useGenerationStore.getState().jobs.find((j) => j.id === jobId)
    if (!job) return

    const target = job.reviewItems.find((item) => item.id === variationId)
    if (!target || target.status !== 'review') return

    const updatedItems = job.reviewItems.map((item) =>
      item.id === variationId
        ? { ...item, status: 'approved' as const, approvedUrl: undefined }
        : item
    )

    updateJob(jobId, {
      status: 'review',
      reviewItems: updatedItems,
      error: undefined,
    })
    await finalizeReviewJobIfComplete(jobId)
  }, [updateJob, finalizeReviewJobIfComplete])

  const rejectVariation = useCallback((jobId: string, variationId: string) => {
    const job = useGenerationStore.getState().jobs.find((j) => j.id === jobId)
    if (!job) return

    const updatedItems = job.reviewItems.map((item) =>
      item.id === variationId && item.status === 'review'
        ? { ...item, status: 'rejected' as const }
        : item
    )

    updateJob(jobId, {
      status: 'review',
      reviewItems: updatedItems,
      error: undefined,
    })
    void finalizeReviewJobIfComplete(jobId)
  }, [updateJob, finalizeReviewJobIfComplete])

  const approveAllVariations = useCallback(async (jobId: string) => {
    const job = useGenerationStore.getState().jobs.find((j) => j.id === jobId)
    if (!job) return

    const pendingItems = job.reviewItems.filter((item) => item.status === 'review')
    if (pendingItems.length === 0) return

    const updatedItems = job.reviewItems.map((item) =>
      item.status === 'review'
        ? { ...item, status: 'approved' as const, approvedUrl: undefined }
        : item
    )

    updateJob(jobId, {
      status: 'review',
      reviewItems: updatedItems,
      error: undefined,
    })
    await finalizeReviewJobIfComplete(jobId)
  }, [updateJob, finalizeReviewJobIfComplete])

  const handleSchedule = useCallback((imageUrl: string) => {
    navigate('/new-post', { state: { imageUrl } })
  }, [navigate])

  const handleDownload = useCallback(async (imageUrl: string) => {
    try {
      if (imageUrl.startsWith('blob:')) {
        const a = document.createElement('a')
        a.href = imageUrl
        a.download = `arte-${Date.now()}.jpg`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        toast.success('Imagem baixada!')
        return
      }

      const response = await window.electronAPI.downloadBlob(imageUrl)
      if (!response.ok || !response.buffer) {
        throw new Error('Erro ao baixar imagem')
      }

      const blob = new Blob([response.buffer], { type: response.contentType || 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `arte-${Date.now()}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Imagem baixada!')
    } catch (error) {
      toast.error('Erro ao baixar imagem')
    }
  }, [])

  const canGenerate = textProcessingMode === 'generate_copy'
    ? textProcessingCustomPrompt.trim().length > 0
    : text.trim().length > 0

  const getAspectClass = (targetFormat: ArtFormat) => {
    switch (targetFormat) {
      case 'STORY':
        return 'aspect-[9/16]'
      case 'SQUARE':
        return 'aspect-square'
      default:
        return 'aspect-[4/5]'
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Left Column - Form */}
      <div className="w-[440px] flex-shrink-0 overflow-y-auto border-r border-border p-6">
        <div className="space-y-6">
          {/* Project Badge */}
          {currentProject && (
            <div className="rounded-xl border border-border bg-card p-4">
              <ProjectBadge project={currentProject} size="lg" />
            </div>
          )}

          {/* Format Selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text">Formato</label>
            <FormatSelector value={format} onChange={setFormat} />
          </div>

          {/* Template Selector (only in Electron with template pipeline) */}
          {hasTemplatePipeline && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text">Template</label>
              <TemplateSelector
                templates={artTemplates}
                importedTemplates={importedDsTemplates}
                previewTokens={previewTokens}
                previewCss={designSystemPreviewCss}
                referenceImageUrl={selectedPhoto?.url}
                logoUrl={identityLogoUrl}
                format={format}
                selectedIds={selectedTemplateIds}
                onChange={setSelectedTemplateIds}
                isLoading={templatesLoading}
              />
              <div className="rounded-lg border border-border bg-card/60 px-3 py-2 text-[10px] text-text-muted">
                <span className="font-medium text-text">Tokens ativos no preview:</span> {previewTokenSourceLabel}
              </div>
            </div>
          )}

          {/* Photo Selector (conditional) */}
          {usePhoto && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text">Foto</label>
              <PhotoSelector
                projectId={projectId}
                selectedPhoto={selectedPhoto}
                onPhotoChange={setSelectedPhoto}
              />
            </div>
          )}

          {/* Text Input */}
          <TextInput value={text} onChange={setText} />

          {/* Text Processing Selector (only when template selected) */}
          {isTemplateMode && (
            <TextProcessingSelector
              mode={textProcessingMode}
              onModeChange={setTextProcessingMode}
              customPrompt={textProcessingCustomPrompt}
              onCustomPromptChange={setTextProcessingCustomPrompt}
            />
          )}

          {/* Toggles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text">Incluir logo</span>
              <Switch checked={includeLogo} onChange={setIncludeLogo} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text">Usar foto</span>
              <Switch checked={usePhoto} onChange={setUsePhoto} />
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-text">
                <Layers size={16} />
                Composição com IA
              </span>
              <Switch checked={compositionEnabled} onChange={setCompositionEnabled} />
            </div>
            {/* Strict mode toggle (only when template selected) */}
            {isTemplateMode && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-text">
                  <ShieldCheck size={16} />
                  Modo estrito
                </span>
                <Switch checked={strictTemplateMode} onChange={setStrictTemplateMode} />
              </div>
            )}
          </div>

          {/* Composition Editor (conditional) */}
          {compositionEnabled && (
            <CompositionEditor
              compositionPrompt={compositionPrompt}
              onCompositionPromptChange={setCompositionPrompt}
              referenceImages={compositionReferenceImages}
              onReferenceImagesChange={setCompositionReferenceImages}
            />
          )}

          {/* Variation Selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text">Variacoes</label>
            <VariationSelector value={variations} onChange={setVariations} />
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary-hover',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-all duration-200'
            )}
          >
            <Sparkles size={20} />
            Gerar Artes
          </button>
        </div>
      </div>

      {/* Right Column - Results */}
      <div className="flex-1 overflow-y-auto p-6">
        {pendingJobs.length === 0 && reviewJobs.length === 0 && completedJobs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Sparkles size={32} className="text-primary" />
            </div>
            <h3 className="text-lg font-medium text-text">Suas artes aparecerao aqui</h3>
            <p className="mt-2 text-sm text-text-muted">
              Preencha o formulario e clique em "Gerar Artes"
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pending Jobs */}
            {pendingJobs.length > 0 && (
              <GenerationQueue jobs={pendingJobs} />
            )}

            {/* Review Jobs (gate de aprovacao por variacao) */}
            {reviewJobs.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-text-muted">Em revisao</h3>
                {reviewJobs.map((job) => {
                  const pendingCount = job.reviewItems.filter((item) => item.status === 'review').length
                  const approvedCount = job.reviewItems.filter((item) => item.status === 'approved').length
                  const rejectedCount = job.reviewItems.filter((item) => item.status === 'rejected').length
                  const activeVariation = activeEditor?.jobId === job.id
                    ? job.reviewItems.find((item) => item.id === activeEditor.variationId) || null
                    : null

                  return (
                    <div key={job.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-text-muted">
                          {approvedCount} aprovada(s) • {rejectedCount} rejeitada(s) • {pendingCount} pendente(s)
                        </div>
                        <button
                          onClick={() => approveAllVariations(job.id)}
                          disabled={pendingCount === 0 || job.status === 'saving'}
                          className={cn(
                            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                            pendingCount === 0 || job.status === 'saving'
                              ? 'cursor-not-allowed bg-input text-text-subtle'
                              : 'bg-primary text-primary-foreground hover:bg-primary-hover'
                          )}
                        >
                          {job.status === 'saving' ? 'Salvando...' : 'Aprovar todas pendentes'}
                        </button>
                      </div>

                      {job.error && (
                        <p className="text-xs text-error">{job.error}</p>
                      )}

                      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                        {job.reviewItems.map((item) => (
                          <div
                            key={item.id}
                            className={cn(
                              'overflow-hidden rounded-xl border bg-card',
                              item.status === 'approved'
                                ? 'border-success/40'
                                : item.status === 'rejected'
                                  ? 'border-error/40'
                                : 'border-border'
                            )}
                          >
                            <div className={cn('relative', getAspectClass(job.params.format))}>
                              {item.renderContext?.kind === 'template' ? (
                                <InstagramHtmlPreview
                                  format={job.params.format}
                                  fields={item.fields}
                                  sourceImageUrl={item.renderContext.sourceImageUrl}
                                  logoUrl={identityLogoUrl}
                                  includeLogo={item.renderContext.includeLogo}
                                  templateName={item.renderContext.templateId}
                                  tokens={previewTokens}
                                  customCss={designSystemPreviewCss}
                                  className="h-full w-full"
                                />
                              ) : (
                                <img
                                  src={item.imageUrl}
                                  alt="Variacao em revisao"
                                  className="h-full w-full object-contain bg-zinc-950"
                                />
                              )}
                            </div>

                            <div className="space-y-2 border-t border-border/70 bg-card/95 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <div className="inline-flex w-fit rounded bg-black/70 px-2 py-0.5 text-[10px] text-white">
                                    {item.status === 'approved' ? 'Aprovada' : item.status === 'rejected' ? 'Rejeitada' : 'Em revisao'}
                                  </div>
                                  {item.renderContext?.kind === 'template' && (
                                    <div className="inline-flex w-fit rounded bg-primary/85 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                      Template path ativo{item.renderContext.templateId ? ` • ${item.renderContext.templateId}` : ''}
                                    </div>
                                  )}
                                </div>
                                {item.isUpdatingPreview && (
                                  <div className="inline-flex w-fit rounded bg-black/75 px-2 py-0.5 text-[10px] text-white">
                                    Atualizando...
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={() => setActiveEditor({ jobId: job.id, variationId: item.id })}
                                className="w-full rounded-lg border border-border bg-input/60 px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-input"
                              >
                                Editar texto
                              </button>

                              {item.status === 'review' && (
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    onClick={() => approveVariation(job.id, item.id)}
                                    disabled={job.status === 'saving'}
                                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Aprovar
                                  </button>
                                  <button
                                    onClick={() => rejectVariation(job.id, item.id)}
                                    disabled={job.status === 'saving'}
                                    className="rounded-lg bg-error/80 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-error disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Rejeitar
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {activeVariation && (
                        <div className="space-y-3 rounded-xl border border-border bg-input/40 p-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-text">Editor WYSIWYG</h4>
                            <button
                              onClick={() => setActiveEditor(null)}
                              className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-text-muted hover:bg-input"
                            >
                              Fechar
                            </button>
                          </div>

                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className={cn('relative overflow-hidden rounded-xl border border-border bg-card', getAspectClass(job.params.format))}>
                              {activeVariation.renderContext?.kind === 'template' ? (
                                <InstagramHtmlPreview
                                  format={job.params.format}
                                  fields={activeVariation.fields}
                                  sourceImageUrl={activeVariation.renderContext.sourceImageUrl}
                                  logoUrl={identityLogoUrl}
                                  includeLogo={activeVariation.renderContext.includeLogo}
                                  templateName={activeVariation.renderContext.templateId}
                                  tokens={previewTokens}
                                  customCss={designSystemPreviewCss}
                                  editable
                                  onFieldChange={(fieldKey, value) =>
                                    updateVariationField(job.id, activeVariation.id, fieldKey, value)
                                  }
                                  className="h-full w-full"
                                />
                              ) : (
                                <>
                                  <img
                                    src={activeVariation.imageUrl}
                                    alt="Preview em edicao"
                                    className="h-full w-full object-contain bg-zinc-950"
                                  />
                                  {activeVariation.fields.length > 0 && (
                                    <div className="pointer-events-none absolute inset-0 flex items-end p-3">
                                      <div className="pointer-events-auto w-full space-y-1 rounded-lg bg-black/45 p-2 backdrop-blur">
                                        {activeVariation.fields.map((field) => (
                                          <div
                                            key={`editable-${activeVariation.id}-${field.key}-${field.value}`}
                                            contentEditable
                                            suppressContentEditableWarning
                                            onInput={(event) => {
                                              const content = event.currentTarget.textContent ?? ''
                                              updateVariationField(job.id, activeVariation.id, field.key, content)
                                            }}
                                            className="rounded border border-white/20 bg-black/20 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/60"
                                          >
                                            {field.value}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>

                            <div className="space-y-3">
                              {activeVariation.fields.length === 0 ? (
                                <p className="text-xs text-text-muted">
                                  Esta variacao nao possui campos textuais editaveis.
                                </p>
                              ) : (
                                activeVariation.fields.map((field) => (
                                  <label key={`input-${activeVariation.id}-${field.key}`} className="block space-y-1">
                                    <span className="text-xs text-text-muted">{field.label}</span>
                                    <textarea
                                      value={field.value}
                                      onChange={(event) => updateVariationField(job.id, activeVariation.id, field.key, event.target.value)}
                                      rows={2}
                                      className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                  </label>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Completed Jobs */}
            {completedJobs.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-text-muted">Artes geradas</h3>
                <div className="grid grid-cols-2 gap-4">
                  {completedJobs.flatMap((job) =>
                    job.images.map((imageUrl, idx) => (
                      <ResultImageCard
                        key={`${job.id}-${idx}`}
                        imageUrl={imageUrl}
                        format={job.params.format}
                        onDownload={() => handleDownload(imageUrl)}
                        onSchedule={() => handleSchedule(imageUrl)}
                        onDiscard={() => {
                          const newImages = job.images.filter((_, i) => i !== idx)
                          if (newImages.length === 0) {
                            removeJob(job.id)
                          } else {
                            updateJob(job.id, { images: newImages })
                          }
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
