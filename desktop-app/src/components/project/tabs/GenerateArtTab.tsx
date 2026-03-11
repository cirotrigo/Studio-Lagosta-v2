import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock3, Database, ImagePlus, Loader2, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from '@/lib/constants'
import { useBrandAssets } from '@/hooks/use-brand-assets'
import {
  preparePromptBatch,
  renderPromptVariation,
  type PreparedPromptBatch,
} from '@/lib/automation/prompt-orchestrator'
import { cn } from '@/lib/utils'
import ProjectBadge from '@/components/layout/ProjectBadge'
import GenerationQueue from '@/components/project/generate/GenerationQueue'
import FormatSelector from '@/components/project/generate/FormatSelector'
import PhotoSelector from '@/components/project/generate/PhotoSelector'
import VariationSelector from '@/components/project/generate/VariationSelector'
import { useProjectStore } from '@/stores/project.store'
import {
  useGenerationStore,
  useQueuedJobs,
  useReadyJobs,
  useErroredJobs,
  type ArtFormat,
  type GenerationJob,
  type GenerationVariationJob,
  type GenerationParams,
} from '@/stores/generation.store'
import type { ReeditDraft } from '@/types/art-automation'
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

function getAspectClass(format: ArtFormat) {
  switch (format) {
    case 'STORY':
      return 'aspect-[9/16]'
    case 'SQUARE':
      return 'aspect-square'
    default:
      return 'aspect-[4/5]'
  }
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
    onChange([...files, ...selectedFiles].slice(0, 5))
    event.target.value = ''
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
      <div>
        <p className="text-sm font-medium text-text">Referencias visuais</p>
        <p className="mt-1 text-xs text-text-muted">
          Ate 5 imagens. Nesta fase elas entram apenas na orquestracao do pipeline.
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
  const currentProject = useProjectStore((state) => state.currentProject)
  const { data: brandAssets } = useBrandAssets(projectId)
  const jobs = useGenerationStore((state) => state.jobs)
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

  const availableTemplates = useMemo(
    () => templates.filter((template) => template.format === format),
    [format, templates],
  )

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

      updateJob(jobId, {
        templateSelection: preparedBatch.templateSelection,
        knowledge: preparedBatch.knowledge,
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

        try {
          const renderedVariation = await renderPromptVariation(
            orchestratorInput,
            preparedBatch.selectedTemplate,
            preparedVariation,
          )

          updateVariation(jobId, targetVariation.id, {
            status: 'ready',
            imageUrl: renderedVariation.imageUrl,
            document: renderedVariation.document,
            fields: renderedVariation.fields,
            warnings: [
              ...preparedBatch.warnings,
              ...preparedBatch.conflicts,
              ...renderedVariation.warnings,
            ],
            templateId: renderedVariation.templateId,
            templateName: renderedVariation.templateName,
            error: undefined,
          })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Falha ao renderizar a variacao Konva.'

          updateVariation(jobId, targetVariation.id, {
            status: 'error',
            error: message,
            warnings: [...preparedBatch.warnings, ...preparedBatch.conflicts],
            templateId: preparedVariation.templateId,
            templateName: preparedVariation.templateName,
          })
        }
      }

      const completedJob = useGenerationStore.getState().jobs.find((entry) => entry.id === jobId)
      if (!completedJob) return

      const nextStatus = deriveJobStatus(completedJob)
      updateJob(jobId, {
        status: nextStatus,
        images: completedJob.variations
          .filter((variation) => variation.status === 'ready' && variation.imageUrl)
          .map((variation) => variation.imageUrl as string),
        error:
          nextStatus === 'error'
            ? 'Nenhuma variacao ficou pronta. Ajuste o prompt ou troque o template.'
            : undefined,
      })

      const readyCount = completedJob.variations.filter((variation) => variation.status === 'ready').length
      if (readyCount > 0) {
        toast.success(`${readyCount} variacao(oes) pronta(s) no modo rapido.`)
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
  }, [brandAssets, currentProject, templates, updateJob, updateVariation])

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
    selectedPhoto?.url,
    uploadReferenceImages,
    variations,
  ])

  const canGenerate = prompt.trim().length > 0

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="w-[460px] flex-shrink-0 overflow-y-auto border-r border-border p-6">
        <div className="space-y-6">
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
              1 prompt, 1 clique e contexto automatico da base do projeto quando existir.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-text">Prompt unico</label>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder='Ex: crie variacoes sobre happy hour com essa foto'
              rows={4}
              className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-xs text-text-subtle">
              O pipeline prioriza o pedido do usuario e completa horario, campanha e cardapio via base quando houver contexto.
            </p>
          </div>

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

          <div className="space-y-2">
            <label className="block text-sm font-medium text-text">Variacoes</label>
            <VariationSelector value={variations} onChange={setVariations} />
          </div>

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
            <div className="rounded-lg border border-border bg-card/60 px-3 py-2 text-xs text-text-muted">
              {isLoadingTemplates
                ? 'Carregando templates Konva locais...'
                : availableTemplates.length > 0
                  ? `${availableTemplates.length} template(s) local(is) disponivel(is) para ${format}.`
                  : 'Nenhum template local neste formato. O app usa o fallback interno do modo rapido.'}
            </div>
            {templatesError ? (
              <p className="text-xs text-error">{templatesError}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition-colors',
              canGenerate
                ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
                : 'cursor-not-allowed bg-input text-text-subtle',
            )}
          >
            <Sparkles size={18} />
            Gerar Artes
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
              O pipeline recupera contexto da base do projeto, escolhe um template, aplica os slots e renderiza cada variacao sem travar o formulario.
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
                    </div>
                    <p className="mt-2 text-sm font-medium text-text">"{job.params.text}"</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {job.params.format} • {job.params.variations} variacao(oes) • fundo{' '}
                      {job.params.backgroundMode === 'photo' ? 'foto' : 'IA (fallback visual nesta fase)'}
                    </p>
                    {job.templateSelection ? (
                      <p className="mt-1 text-xs text-text-muted">
                        Template usado: {job.templateSelection.templateName}
                      </p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeJob(job.id)}
                    className="flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm text-text-muted transition-colors hover:border-error/40 hover:text-error"
                  >
                    <Trash2 size={14} />
                    Remover job
                  </button>
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

                <div className="grid gap-4 xl:grid-cols-2">
                  {job.variations.map((variation) => (
                    <VariationCard
                      key={variation.id}
                      job={job}
                      variation={variation}
                      onDownload={handleDownload}
                      onSchedule={handleSchedule}
                      onRemove={() => removeVariation(job.id, variation.id)}
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

function VariationCard({
  job,
  variation,
  onDownload,
  onSchedule,
  onRemove,
}: {
  job: GenerationJob
  variation: GenerationVariationJob
  onDownload: (imageUrl: string) => void
  onSchedule: (imageUrl: string) => void
  onRemove: () => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className={cn('relative overflow-hidden border-b border-border bg-[#0c111d]', getAspectClass(job.params.format))}>
        {variation.status === 'ready' && variation.imageUrl ? (
          <img
            src={variation.imageUrl}
            alt={`Variacao ${variation.index + 1}`}
            className="h-full w-full object-contain"
          />
        ) : variation.status === 'error' ? (
          <div className="flex h-full min-h-[220px] items-center justify-center p-6 text-center">
            <div>
              <TriangleAlert size={20} className="mx-auto text-error" />
              <p className="mt-2 text-sm font-medium text-text">Falha nesta variacao</p>
              <p className="mt-1 text-xs text-text-muted">{variation.error || 'Sem detalhes adicionais.'}</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[220px] items-center justify-center">
            <div className="text-center">
              {variation.status === 'processing' ? (
                <Loader2 size={20} className="mx-auto animate-spin text-primary" />
              ) : (
                <Clock3 size={20} className="mx-auto text-text-muted" />
              )}
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-text-subtle">
                {variation.status === 'processing' ? 'Processando' : 'Na fila'}
              </p>
            </div>
          </div>
        )}

        <div className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white">
          Variacao {variation.index + 1}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em]',
              variation.status === 'ready'
                ? 'bg-emerald-500/10 text-emerald-300'
                : variation.status === 'error'
                  ? 'bg-error/10 text-error'
                  : variation.status === 'processing'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-input text-text-muted',
            )}
          >
            {variation.status}
          </span>
          {variation.templateName ? (
            <span className="rounded-full bg-input px-2.5 py-1 text-[10px] font-medium text-text-muted">
              {variation.templateName}
            </span>
          ) : null}
        </div>

        {variation.fields.length > 0 ? (
          <div className="space-y-2">
            {variation.fields.map((field) => (
              <div key={`${variation.id}-${field.key}`} className="rounded-lg border border-border bg-background/30 px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-subtle">
                  {field.label}
                </p>
                <p className="mt-1 text-sm text-text">{field.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {variation.warnings.length > 0 ? (
          <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-subtle">
              Observacoes
            </p>
            <div className="mt-1 space-y-1">
              {variation.warnings.map((warning) => (
                <p key={`${variation.id}-${warning}`} className="text-xs text-text-muted">
                  {warning}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={!variation.imageUrl}
            onClick={() => variation.imageUrl && onDownload(variation.imageUrl)}
            className="rounded-lg border border-border bg-input/60 px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-input disabled:cursor-not-allowed disabled:opacity-50"
          >
            Baixar
          </button>
          <button
            type="button"
            disabled={!variation.imageUrl}
            onClick={() => variation.imageUrl && onSchedule(variation.imageUrl)}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Agendar
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:border-error/40 hover:text-error"
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  )
}
