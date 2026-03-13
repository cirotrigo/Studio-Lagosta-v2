import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, Download, ImagePlus, Loader2, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from '@/lib/constants'
import { useBrandAssets } from '@/hooks/use-brand-assets'
import { useKonvaProjectCreativeExport } from '@/hooks/use-project-generations'
import { generateBackgroundAsset } from '@/lib/automation/background-service'
import {
  formatImageContextConfidence,
  summarizeImageContextAnalysis,
} from '@/lib/automation/image-context-analyzer'
import { buildKonvaExportFileName } from '@/lib/editor/export-file-name'
import { cloneKonvaDocument } from '@/lib/editor/document'
import { preloadKonvaDocumentFonts } from '@/lib/editor/font-preload'
import { renderPageToDataUrl } from '@/lib/editor/render-page'
import { exportVariations } from '@/lib/export/konva-exporter'
import {
  preparePromptBatch,
  renderPromptVariation,
  type PreparedPromptBatch,
} from '@/lib/automation/prompt-orchestrator'
import { cn } from '@/lib/utils'
import ProjectBadge from '@/components/layout/ProjectBadge'
import GenerationQueue from '@/components/project/generate/GenerationQueue'
import { ResultImageCard } from '@/components/project/generate/ResultImageCard'
import FormatSelector from '@/components/project/generate/FormatSelector'
import PhotoSelector from '@/components/project/generate/PhotoSelector'
import VariationSelector from '@/components/project/generate/VariationSelector'
import ObjectivePresets from '@/components/project/generate/ObjectivePresets'
import TonePresets from '@/components/project/generate/TonePresets'
import AdvancedOptionsDrawer from '@/components/project/generate/AdvancedOptionsDrawer'
import ProjectContextIndicator from '@/components/project/generate/ProjectContextIndicator'
import { useProjectStore } from '@/stores/project.store'
import { useTagsStore } from '@/stores/tags.store'
import {
  useGenerationStore,
  useQueuedJobs,
  useReadyJobs,
  useErroredJobs,
  type ArtFormat,
  type GenerationJob,
  type GenerationVariationJob,
  type GenerationParams,
  type BackgroundGenerationInfo,
  type ObjectivePreset,
  type TonePreset,
} from '@/stores/generation.store'
import type { ApprovedVariationEditorDraft, ReeditDraft } from '@/types/art-automation'
import type { KonvaTemplateDocument } from '@/types/template'

const UPLOAD_URL = 'https://studio-lagosta-v2.vercel.app/api/upload'

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

interface ReferenceUploaderProps {
  files: File[]
  onChange: (files: File[]) => void
}

function deriveJobStatus(job: GenerationJob): GenerationJob['status'] {
  if (job.variations.some((variation) => variation.status === 'processing')) {
    return 'processing'
  }

  if (job.variations.some((variation) => variation.status === 'queued')) {
    return 'queued'
  }

  if (job.variations.some((variation) => variation.status === 'ready')) {
    return 'ready'
  }

  return 'error'
}

function getVariationCurrentPage(document: KonvaTemplateDocument) {
  return (
    document.design.pages.find((page) => page.id === document.design.currentPageId) ??
    document.design.pages[0] ??
    null
  )
}

function buildApprovedVariationPageName(variation: GenerationVariationJob) {
  const pageName = variation.document ? getVariationCurrentPage(variation.document)?.name : null
  const baseName = variation.templateName || pageName || 'Criativo'
  return `${baseName} V${variation.index + 1}`
}

function createApprovedVariationEditorDraft(
  job: GenerationJob,
  variation: GenerationVariationJob,
): ApprovedVariationEditorDraft | null {
  if (!variation.document) {
    return null
  }

  const sourceDocument = cloneKonvaDocument(variation.document)
  const currentPage = getVariationCurrentPage(sourceDocument)
  if (!currentPage) {
    return null
  }

  const pageLayerIds = new Set(currentPage.layers.map((layer) => layer.id))
  const now = new Date().toISOString()
  const nextDocument: KonvaTemplateDocument = {
    ...sourceDocument,
    id: crypto.randomUUID(),
    projectId: job.params.projectId,
    source: 'local',
    name: buildApprovedVariationPageName(variation),
    design: {
      pages: [cloneKonvaDocument(currentPage)],
      currentPageId: currentPage.id,
    },
    slots: sourceDocument.slots.filter((slot) => pageLayerIds.has(slot.layerId)),
    meta: {
      ...sourceDocument.meta,
      createdAt: now,
      updatedAt: now,
      isDirty: true,
    },
  }

  return {
    jobId: job.id,
    variationId: variation.id,
    variationIndex: variation.index,
    prompt: job.params.text,
    sourceTemplateId: variation.templateId,
    sourceTemplateName: variation.templateName || sourceDocument.name,
    document: nextDocument,
  }
}

function ReferenceUploader({ files, onChange }: ReferenceUploaderProps) {
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file))
    setPreviewUrls(urls)
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [files])

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []).filter(
      (file) => ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE,
    )
    const nextFiles = [...files, ...selectedFiles]
    if (nextFiles.length > 5) {
      toast.error('Voce pode enviar ate 5 referencias visuais.')
    }
    onChange(nextFiles.slice(0, 5))
    event.target.value = ''
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
      <div>
        <p className="text-sm font-medium text-text">Referencias visuais</p>
        <p className="mt-1 text-xs text-text-muted">
          Ate 5 imagens. O fundo IA usa essas referencias diretamente e salva o resultado em Geradas com IA.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {previewUrls.map((url, index) => (
          <div key={`${url}-${index}`} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-card">
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(files.filter((_file, fileIndex) => fileIndex !== index))}
              className="absolute right-1 top-1 hidden rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white group-hover:block"
            >
              x
            </button>
          </div>
        ))}

        {files.length < 5 && (
          <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border bg-input text-text-muted transition-colors hover:border-primary/40 hover:text-primary">
            <input
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
            <ImagePlus size={18} />
          </label>
        )}
      </div>
    </div>
  )
}

export default function GenerateArtTab({ projectId, draft, onDraftConsumed }: GenerateArtTabProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentProject = useProjectStore((state) => state.currentProject)
  const { data: brandAssets } = useBrandAssets(projectId)
  const exportCreative = useKonvaProjectCreativeExport(projectId)
  const jobs = useGenerationStore((state) => state.jobs)
  const analyzeImageForContext = useGenerationStore((state) => state.analyzeImageForContext)
  const setAnalyzeImageForContext = useGenerationStore((state) => state.setAnalyzeImageForContext)
  const addJob = useGenerationStore((state) => state.addJob)
  const updateJob = useGenerationStore((state) => state.updateJob)
  const updateVariation = useGenerationStore((state) => state.updateVariation)
  const removeJob = useGenerationStore((state) => state.removeJob)
  const removeVariation = useGenerationStore((state) => state.removeVariation)
  const queuedJobs = useQueuedJobs()
  const readyJobs = useReadyJobs()
  const erroredJobs = useErroredJobs()
  const isQueueRunningRef = useRef(false)

  const [format, setFormat] = useState<ArtFormat>('STORY')
  const [prompt, setPrompt] = useState('')
  const [backgroundMode, setBackgroundMode] = useState<'photo' | 'ai'>('photo')
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhotoRef | null>(null)
  const [referenceFiles, setReferenceFiles] = useState<File[]>([])
  const [variations, setVariations] = useState<1 | 2 | 4>(1)
  const [manualTemplateId, setManualTemplateId] = useState('')
  const [templates, setTemplates] = useState<KonvaTemplateDocument[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [exportingJobId, setExportingJobId] = useState<string | null>(null)
  const [objective, setObjective] = useState<ObjectivePreset>(null)
  const [tone, setTone] = useState<TonePreset>(null)
  const [selectedTagFilter, setSelectedTagFilter] = useState('')

  const projectTags = useTagsStore((state) => state.tags)

  // Filter templates by format and pages by selected tag
  const availableTemplates = useMemo(() => {
    const formatFiltered = templates.filter((template) => template.format === format)

    // If no tag filter or no tags available, return all templates
    if (!selectedTagFilter || projectTags.length === 0) {
      return formatFiltered
    }

    // Filter templates that have at least one page with the selected tag
    return formatFiltered.filter((template) =>
      template.design.pages.some((page) =>
        page.tags?.some((t) => t.toLowerCase() === selectedTagFilter.toLowerCase()),
      ),
    )
  }, [format, templates, selectedTagFilter, projectTags.length])

  useEffect(() => {
    let cancelled = false

    async function loadTemplates() {
      try {
        setIsLoadingTemplates(true)
        setTemplatesError(null)
        const localTemplates = await window.electronAPI.konvaTemplates.list(projectId)
        if (cancelled) return
        setTemplates(localTemplates)
      } catch (error) {
        console.error('[GenerateArtTab] Falha ao carregar templates locais:', error)
        if (!cancelled) {
          setTemplatesError(
            error instanceof Error ? error.message : 'Falha ao carregar templates Konva locais.',
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTemplates(false)
        }
      }
    }

    void loadTemplates()

    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    setManualTemplateId('')
  }, [format])

  useEffect(() => {
    if (!draft) return

    setFormat(draft.format)
    setPrompt(draft.prompt || '')

    if (draft.photoUrl) {
      setBackgroundMode('photo')
      setSelectedPhoto({
        url: draft.photoUrl,
        source: draft.photoSource || 'history',
      })
    }

    onDraftConsumed?.()
  }, [draft, onDraftConsumed])

  const uploadReferenceImages = useCallback(async (files: File[]): Promise<string[]> => {
    const urls: string[] = []

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer()
      const response = await window.electronAPI.uploadFile(
        UPLOAD_URL,
        { name: file.name, type: file.type, buffer: arrayBuffer },
        { type: 'reference' },
      )

      const data = response.data as { url?: string } | undefined
      if (!response.ok || !data?.url) {
        throw new Error(`Erro ao enviar referencia: ${file.name}`)
      }

      urls.push(data.url)
    }

    return urls
  }, [])

  const handleDownload = useCallback(async (imageUrl: string) => {
    try {
      if (imageUrl.startsWith('blob:')) {
        const link = document.createElement('a')
        link.href = imageUrl
        link.download = `arte-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        return
      }

      const response = await window.electronAPI.downloadBlob(imageUrl)
      if (!response.ok || !response.buffer) {
        throw new Error('Erro ao baixar a variacao')
      }

      const blob = new Blob([response.buffer], { type: response.contentType || 'image/png' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `arte-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao baixar a variacao.')
    }
  }, [])

  const handleSchedule = useCallback((imageUrl: string) => {
    navigate('/new-post', { state: { imageUrl } })
  }, [navigate])

  const handleOpenArts = useCallback(() => {
    navigate('/arts')
  }, [navigate])

  const handleExportBatch = useCallback(async (job: GenerationJob) => {
    const readyVariations = job.variations.filter(
      (v) => v.status === 'ready' && v.document,
    )

    if (readyVariations.length === 0) {
      toast.error('Nenhuma variacao pronta para exportar.')
      return
    }

    if (!window.electronAPI?.exportBatch) {
      toast.error('Export batch requer ambiente Electron.')
      return
    }

    setExportingJobId(job.id)
    try {
      const projectSlug = currentProject?.name || 'arte'
      const result = await exportVariations({
        variations: readyVariations.map((v) => ({
          document: v.document!,
          variationIndex: v.index,
        })),
        projectFonts: brandAssets?.fonts,
        projectSlug,
        mimeType: 'image/jpeg',
        quality: 92,
      })

      toast.success(
        `${result.files.length} arquivo(s) exportado(s) para ${result.outputDir}`,
      )
    } catch (error) {
      console.error('[Export Batch] Falha:', error)
      toast.error(error instanceof Error ? error.message : 'Falha ao exportar batch')
    } finally {
      setExportingJobId(null)
    }
  }, [brandAssets, currentProject])

  const handleOpenVariationInEditor = useCallback((job: GenerationJob, variation: GenerationVariationJob) => {
    const draftPayload = createApprovedVariationEditorDraft(job, variation)
    if (!draftPayload) {
      toast.error('Nao foi possivel abrir a variacao no editor.')
      return
    }

    navigate('/editor', {
      state: {
        approvedVariationDraft: draftPayload,
      },
    })
  }, [navigate])

  const handleApproveVariation = useCallback(async (job: GenerationJob, variation: GenerationVariationJob) => {
    if (!variation.document || !variation.imageUrl) {
      toast.error('A variacao ainda nao esta pronta para aprovacao.')
      return
    }

    const currentPage = getVariationCurrentPage(variation.document)
    if (!currentPage) {
      toast.error('Documento Konva sem pagina valida para aprovacao.')
      return
    }

    updateVariation(job.id, variation.id, {
      approvalStatus: 'syncing',
      approvalError: undefined,
    })

    try {
      const preloadResult = await preloadKonvaDocumentFonts({
        document: variation.document,
        brandFonts: brandAssets?.fonts,
      })
      if (preloadResult.warnings.length > 0) {
        console.warn('[GenerateArtTab] Font preload warnings before approval:', preloadResult.warnings)
      }

      const dataUrl = await renderPageToDataUrl(currentPage, {
        mimeType: 'image/jpeg',
        quality: 0.94,
        preferBlobDownload: true,
      })

      if (!dataUrl) {
        throw new Error('Falha ao renderizar a variacao para aprovacao.')
      }

      const pageName = buildApprovedVariationPageName(variation)
      const response = await exportCreative.mutateAsync({
        format: job.params.format,
        dataUrl,
        fileName: buildKonvaExportFileName(variation.document.id, currentPage.id, pageName, `v${variation.index + 1}`),
        pageId: currentPage.id,
        pageName,
        documentId: variation.document.id,
        width: currentPage.width,
        height: currentPage.height,
      })

      updateVariation(job.id, variation.id, {
        approvalStatus: 'approved',
        approvedAt: Date.now(),
        approvedGenerationId: response.generation.id,
        approvedResultUrl: response.generation.resultUrl,
        approvalError: undefined,
      })

      toast.success(`Variacao ${variation.index + 1} aprovada e salva em Artes.`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao enviar a variacao aprovada para o projeto.'

      updateVariation(job.id, variation.id, {
        approvalStatus: 'error',
        approvalError: message,
      })

      toast.error(message)
    }
  }, [brandAssets, exportCreative, updateVariation])

  const processQueuedJob = useCallback(async (jobId: string) => {
    const job = useGenerationStore.getState().jobs.find((entry) => entry.id === jobId)
    if (!job) return

    updateJob(jobId, { status: 'processing', error: undefined, warnings: [], conflicts: [] })

    const orchestratorInput = {
      projectId: job.params.projectId,
      prompt: job.params.text,
      format: job.params.format,
      variations: job.params.variations,
      backgroundMode: job.params.backgroundMode,
      photoUrl: job.params.photoUrl,
      referenceUrls: job.params.referenceUrls,
      manualTemplateId: job.params.manualTemplateId,
      analyzeImageForContext: job.params.analyzeImageForContext,
      objective: job.params.objective,
      tone: job.params.tone,
      templates,
      project: currentProject ?? undefined,
      brandAssets: brandAssets
        ? {
            name: brandAssets.name,
            colors: brandAssets.colors,
            fonts: brandAssets.fonts,
            logo: brandAssets.logo,
            titleFontFamily: brandAssets.titleFontFamily,
            bodyFontFamily: brandAssets.bodyFontFamily,
          }
        : undefined,
    } as const

    try {
      const preparedBatch: PreparedPromptBatch = await preparePromptBatch(orchestratorInput)
      const backgroundPipelineWarnings: string[] = []
      let shouldInvalidateAiGallery = false

      updateJob(jobId, {
        templateSelection: preparedBatch.templateSelection,
        knowledge: preparedBatch.knowledge,
        imageAnalysis: preparedBatch.imageAnalysis,
        warnings: preparedBatch.warnings,
        conflicts: preparedBatch.conflicts,
      })

      for (const preparedVariation of preparedBatch.variations) {
        const liveJob = useGenerationStore.getState().jobs.find((entry) => entry.id === jobId)
        const targetVariation = liveJob?.variations[preparedVariation.index]
        if (!targetVariation) {
          continue
        }

        updateVariation(jobId, targetVariation.id, {
          status: 'processing',
          fields: preparedVariation.fields,
          warnings: preparedVariation.warnings,
          templateId: preparedVariation.templateId,
          templateName: preparedVariation.templateName,
          error: undefined,
        })

        let currentStage: 'background' | 'render' =
          job.params.backgroundMode === 'ai' ? 'background' : 'render'

        try {
          let backgroundImageUrl: string | undefined
          let backgroundWarnings: string[] = []
          let background: BackgroundGenerationInfo | undefined

          if (job.params.backgroundMode === 'ai') {
            const generatedBackground = await generateBackgroundAsset({
              projectId: job.params.projectId,
              prompt: job.params.text,
              format: job.params.format,
              variationIndex: preparedVariation.index,
              fields: preparedVariation.fields,
              referenceUrls: job.params.referenceUrls,
            })

            backgroundImageUrl = generatedBackground.imageUrl
            backgroundWarnings = generatedBackground.warnings
            background = {
              mode: 'ai',
              provider: generatedBackground.provider,
              model: generatedBackground.modelUsed,
              modelLabel: generatedBackground.modelLabel,
              fallbackModel: generatedBackground.fallbackModel,
              fallbackLabel: generatedBackground.fallbackLabel,
              fallbackUsed: generatedBackground.fallbackUsed,
              persisted: generatedBackground.persisted,
              persistedImageUrl: generatedBackground.persistedImageUrl,
              referenceCount: generatedBackground.referenceCount,
            }

            backgroundPipelineWarnings.push(...backgroundWarnings)
            shouldInvalidateAiGallery =
              shouldInvalidateAiGallery || generatedBackground.persisted === true
            currentStage = 'render'
          } else if (job.params.photoUrl) {
            background = {
              mode: 'photo',
              persisted: false,
            }
          }

          const renderedVariation = await renderPromptVariation(
            orchestratorInput,
            preparedBatch.selectedTemplate,
            preparedVariation,
            { backgroundImageUrl },
          )

          updateVariation(jobId, targetVariation.id, {
            status: 'ready',
            imageUrl: renderedVariation.imageUrl,
            document: renderedVariation.document,
            fields: renderedVariation.fields,
            warnings: [
              ...preparedBatch.warnings,
              ...preparedBatch.conflicts,
              ...backgroundWarnings,
              ...renderedVariation.warnings,
            ],
            templateId: renderedVariation.templateId,
            templateName: renderedVariation.templateName,
            background,
            error: undefined,
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : currentStage === 'background'
                ? 'Falha ao gerar o fundo com IA.'
                : 'Falha ao renderizar a variacao Konva.'

          updateVariation(jobId, targetVariation.id, {
            status: 'error',
            error: message,
            warnings: [...preparedBatch.warnings, ...preparedBatch.conflicts],
            templateId: preparedVariation.templateId,
            templateName: preparedVariation.templateName,
          })
        }
      }

      if (shouldInvalidateAiGallery) {
        await queryClient.invalidateQueries({
          queryKey: ['ai-images', job.params.projectId],
        })
      }

      const completedJob = useGenerationStore.getState().jobs.find((entry) => entry.id === jobId)
      if (!completedJob) return

      const nextStatus = deriveJobStatus(completedJob)
      updateJob(jobId, {
        status: nextStatus,
        warnings: Array.from(
          new Set([
            ...preparedBatch.warnings,
            ...preparedBatch.conflicts,
            ...backgroundPipelineWarnings,
          ]),
        ),
        images: completedJob.variations
          .filter((variation) => variation.status === 'ready' && variation.imageUrl)
          .map((variation) => variation.imageUrl as string),
        error:
          nextStatus === 'error'
            ? 'Nenhuma variacao ficou pronta. Ajuste o prompt ou troque o template.'
            : undefined,
      })

      const readyCount = completedJob.variations.filter((variation) => variation.status === 'ready').length
      const fallbackCount = completedJob.variations.filter((variation) => variation.background?.fallbackUsed).length
      if (readyCount > 0) {
        toast.success(`${readyCount} variacao(oes) pronta(s) no modo rapido.`)
        if (fallbackCount > 0) {
          toast.info(`${fallbackCount} variacao(oes) usaram fallback automatico do Nano Banana 2.`)
        }
      } else {
        toast.error('A fila terminou sem variacoes validas.')
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao preparar o pipeline prompt-only.'

      const failedJob = useGenerationStore.getState().jobs.find((entry) => entry.id === jobId)
      for (const variation of failedJob?.variations ?? []) {
        updateVariation(jobId, variation.id, {
          status: 'error',
          error: message,
        })
      }

      updateJob(jobId, {
        status: 'error',
        error: message,
      })
      toast.error(message)
    }
  }, [brandAssets, currentProject, queryClient, templates, updateJob, updateVariation])

  const runQueue = useCallback(async () => {
    if (isQueueRunningRef.current) return

    isQueueRunningRef.current = true
    try {
      while (true) {
        const state = useGenerationStore.getState()
        const hasProcessing = state.jobs.some((job) => job.status === 'processing')
        if (hasProcessing) {
          break
        }

        const nextJob = state.jobs.find((job) => job.status === 'queued')
        if (!nextJob) {
          break
        }

        await processQueuedJob(nextJob.id)
      }
    } finally {
      isQueueRunningRef.current = false
    }
  }, [processQueuedJob])

  useEffect(() => {
    if (jobs.some((job) => job.status === 'queued')) {
      void runQueue()
    }
  }, [jobs, runQueue])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error('Digite o prompt da arte antes de gerar.')
      return
    }

    if (backgroundMode === 'photo' && !selectedPhoto?.url) {
      toast.error('Selecione uma foto para o fundo.')
      return
    }

    if (backgroundMode === 'ai' && analyzeImageForContext && referenceFiles.length === 0) {
      toast.info('Sem referencia visual para analisar. O job segue sem contexto de imagem.')
    }

    let referenceUrls: string[] | undefined
    if (backgroundMode === 'ai' && referenceFiles.length > 0) {
      try {
        referenceUrls = await uploadReferenceImages(referenceFiles)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Falha ao enviar referencias.')
        return
      }
    }

    const params: GenerationParams = {
      projectId,
      format,
      text: prompt.trim(),
      variations,
      backgroundMode,
      photoUrl: backgroundMode === 'photo' ? selectedPhoto?.url : undefined,
      referenceUrls,
      manualTemplateId: manualTemplateId || undefined,
      analyzeImageForContext,
      objective,
      tone,
    }

    addJob(params)
    void runQueue()

    toast.info('Fila iniciada. O formulario continua editavel durante o processamento.')
  }, [
    addJob,
    backgroundMode,
    format,
    manualTemplateId,
    projectId,
    prompt,
    referenceFiles,
    runQueue,
    analyzeImageForContext,
    selectedPhoto?.url,
    uploadReferenceImages,
    variations,
  ])

  const canGenerate = prompt.trim().length > 0

  const handlePromptSuggestion = useCallback((suggestion: string) => {
    if (!prompt.trim()) {
      setPrompt(suggestion + ' ')
    }
  }, [prompt])

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="w-[460px] flex-shrink-0 overflow-y-auto border-r border-border p-6">
        <div className="space-y-5">
          {currentProject && (
            <div className="rounded-xl border border-border bg-card p-4">
              <ProjectBadge project={currentProject} size="lg" />
            </div>
          )}

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles size={18} />
              <span className="text-sm font-semibold">Modo Rapido</span>
            </div>
            <p className="mt-2 text-sm text-text-muted">
              1 prompt, 1 clique e contexto automatico. Arte pronta em menos de 60 segundos.
            </p>
          </div>

          <ObjectivePresets
            value={objective}
            onChange={setObjective}
            onPromptSuggestion={handlePromptSuggestion}
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-text">Prompt</label>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder='Ex: crie variacoes sobre happy hour com essa foto'
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <TonePresets value={tone} onChange={setTone} />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-text">Formato</label>
            <FormatSelector value={format} onChange={setFormat} />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-text">Fundo</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setBackgroundMode('photo')}
                className={cn(
                  'rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors',
                  backgroundMode === 'photo'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-text-muted hover:border-primary/30',
                )}
              >
                Usar foto
              </button>
              <button
                type="button"
                onClick={() => setBackgroundMode('ai')}
                className={cn(
                  'rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors',
                  backgroundMode === 'ai'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-text-muted hover:border-primary/30',
                )}
              >
                Gerar com IA
              </button>
            </div>
          </div>

          {backgroundMode === 'photo' ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text">Foto base</label>
              <PhotoSelector
                projectId={projectId}
                selectedPhoto={selectedPhoto}
                onPhotoChange={setSelectedPhoto}
              />
            </div>
          ) : (
            <ReferenceUploader files={referenceFiles} onChange={setReferenceFiles} />
          )}

          <ProjectContextIndicator
            projectId={projectId}
            projectName={currentProject?.name}
            knowledgeCount={brandAssets ? 1 : 0}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ['brand-assets', projectId] })
            }}
          />

          <AdvancedOptionsDrawer>
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-text">Analisar imagem para contexto</p>
                  <p className="mt-1 text-xs text-text-muted">
                    Cruza a foto com cardapio e campanhas do projeto.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={analyzeImageForContext}
                  onClick={() => setAnalyzeImageForContext(!analyzeImageForContext)}
                  className={cn(
                    'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
                    analyzeImageForContext ? 'bg-primary' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-5 w-5 rounded-full bg-white transition-transform',
                      analyzeImageForContext ? 'translate-x-6' : 'translate-x-1',
                    )}
                  />
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-text">Variacoes</label>
                <VariationSelector value={variations} onChange={setVariations} />
              </div>

              {projectTags.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-text">Filtrar por tag</label>
                  <select
                    value={selectedTagFilter}
                    onChange={(event) => setSelectedTagFilter(event.target.value)}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Todas as paginas</option>
                    {projectTags.map((tag) => (
                      <option key={tag.id} value={tag.name}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-text-subtle">
                    Apenas paginas com esta tag serao usadas para geracao.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-text">Template</label>
                <select
                  value={manualTemplateId}
                  onChange={(event) => setManualTemplateId(event.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Automatico</option>
                  {availableTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-text-muted">
                  {isLoadingTemplates
                    ? 'Carregando templates...'
                    : availableTemplates.length > 0
                      ? `${availableTemplates.length} template(s) para ${format}${selectedTagFilter ? ` (tag: ${selectedTagFilter})` : ''}`
                      : 'Usando fallback interno'}
                </div>
                {templatesError ? (
                  <p className="text-xs text-error">{templatesError}</p>
                ) : null}
              </div>
            </div>
          </AdvancedOptionsDrawer>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-4 text-base font-semibold transition-colors',
              canGenerate
                ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
                : 'cursor-not-allowed bg-input text-text-subtle',
            )}
          >
            <Sparkles size={20} />
            Gerar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {queuedJobs.length === 0 && readyJobs.length === 0 && erroredJobs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Sparkles size={30} className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-text">As variacoes Konva aparecerao aqui</h3>
            <p className="mt-2 max-w-lg text-sm text-text-muted">
              O pipeline recupera contexto da base do projeto, escolhe um template, gera o fundo quando necessario e renderiza cada variacao sem travar o formulario.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {queuedJobs.length > 0 ? <GenerationQueue jobs={queuedJobs} /> : null}

            {[...readyJobs, ...erroredJobs].map((job) => (
              <div key={job.id} className="space-y-4 rounded-2xl border border-border bg-card/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        {job.templateSelection?.mode === 'manual' ? 'Template manual' : 'Template automatico'}
                      </span>
                      {job.knowledge?.applied ? (
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                          Contexto do projeto aplicado
                        </span>
                      ) : (
                        <span className="rounded-full bg-input px-3 py-1 text-xs font-medium text-text-muted">
                          Sem contexto relevante
                        </span>
                      )}
                      {job.imageAnalysis?.applied ? (
                        <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-200">
                          Analise de imagem aplicada
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm font-medium text-text">"{job.params.text}"</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {job.params.format} • {job.params.variations} variacao(oes) • fundo{' '}
                      {job.params.backgroundMode === 'photo' ? 'foto' : 'IA (Nano Banana 2 + fallback automatico)'}
                    </p>
                    {job.templateSelection ? (
                      <p className="mt-1 text-xs text-text-muted">
                        Template usado: {job.templateSelection.templateName}
                      </p>
                    ) : null}
                    {job.imageAnalysis?.applied ? (
                      <p className="mt-1 text-xs text-text-muted">
                        {summarizeImageContextAnalysis(job.imageAnalysis) || job.imageAnalysis.summary}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={exportingJobId === job.id || job.variations.every((v) => v.status !== 'ready')}
                      onClick={() => void handleExportBatch(job)}
                      className="flex h-10 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {exportingJobId === job.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      {exportingJobId === job.id ? 'Exportando...' : 'Exportar todas'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeJob(job.id)}
                      className="flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm text-text-muted transition-colors hover:border-error/40 hover:text-error"
                    >
                      <Trash2 size={14} />
                      Remover job
                    </button>
                  </div>
                </div>

                {job.conflicts.length > 0 ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                    <div className="flex items-start gap-2">
                      <TriangleAlert size={16} className="mt-0.5 flex-shrink-0" />
                      <div className="space-y-1">
                        {job.conflicts.map((conflict) => (
                          <p key={conflict}>{conflict}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {job.warnings.length > 0 ? (
                  <div className="rounded-xl border border-border bg-background/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-subtle">
                      Avisos do pipeline
                    </p>
                    <div className="mt-2 space-y-1">
                      {job.warnings.map((warning) => (
                        <p key={warning} className="text-sm text-text-muted">
                          {warning}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}

                {job.knowledge?.hits?.length ? (
                  <details className="rounded-xl border border-border bg-background/30 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-text">
                      Ver dados usados ({job.knowledge.hits.length})
                    </summary>
                    <div className="mt-3 space-y-3">
                      {job.knowledge.hits.map((hit) => (
                        <div key={`${hit.entryId}-${hit.category}`} className="rounded-lg border border-border bg-card/70 p-3">
                          <div className="flex items-center gap-2">
                            <Database size={14} className="text-primary" />
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                              {hit.category}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-text">{hit.title}</p>
                          <p className="mt-1 text-sm text-text-muted">{hit.content}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}

                {job.imageAnalysis?.applied ? (
                  <details className="rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-3">
                    <summary className="cursor-pointer text-sm font-medium text-text">
                      Ver analise de imagem
                    </summary>
                    <div className="mt-3 space-y-2 text-sm text-text-muted">
                      <p>{job.imageAnalysis.summary || 'Sem resumo adicional.'}</p>
                      <p>
                        Confianca: {formatImageContextConfidence(job.imageAnalysis.confidence)}
                        {job.imageAnalysis.sceneType ? ` • Cena: ${job.imageAnalysis.sceneType}` : ''}
                      </p>
                      {job.imageAnalysis.dishNameCandidates.length > 0 ? (
                        <p>Candidatos: {job.imageAnalysis.dishNameCandidates.join(', ')}</p>
                      ) : null}
                      {job.imageAnalysis.ingredientsHints.length > 0 ? (
                        <p>Pistas visuais: {job.imageAnalysis.ingredientsHints.join(', ')}</p>
                      ) : null}
                      {job.imageAnalysis.matchedKnowledge ? (
                        <p>
                          Match na base: [{job.imageAnalysis.matchedKnowledge.category}] {job.imageAnalysis.matchedKnowledge.title}
                        </p>
                      ) : (
                        <p>Sem match confiavel na base. A copy ficou contextual sem inventar prato.</p>
                      )}
                    </div>
                  </details>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-2">
                  {job.variations.map((variation) => (
                    <ResultImageCard
                      key={variation.id}
                      format={job.params.format}
                      variation={variation}
                      projectSlug={currentProject?.name}
                      projectFonts={brandAssets?.fonts}
                      onDownload={() => variation.imageUrl && handleDownload(variation.imageUrl)}
                      onSchedule={() => variation.imageUrl && handleSchedule(variation.imageUrl)}
                      onRemove={() => removeVariation(job.id, variation.id)}
                      onApprove={() => void handleApproveVariation(job, variation)}
                      onOpenInEditor={() => handleOpenVariationInEditor(job, variation)}
                      onOpenArts={handleOpenArts}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
