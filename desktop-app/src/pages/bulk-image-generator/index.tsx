import { useState, useCallback, useMemo } from 'react'
import { Plus, ListOrdered, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/project.store'
import ProjectBadge from '@/components/layout/ProjectBadge'
import type {
  AIImageModel,
  AspectRatio,
  ImageResolution,
  ReferenceImage,
} from '@/lib/queue/types'
import { calculateCredits } from '@/lib/queue/types'
import { parsePromptVariables, validatePromptVariables } from './utils/prompt-parser'
import { useImageQueue } from './hooks/useImageQueue'
import { useQueueProcessor } from './hooks/useQueueProcessor'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import PromptInput from './components/PromptInput'
import ReferenceImagesSection from './components/ReferenceImagesSection'
import AdvancedSettings from './components/AdvancedSettings'
import QueueDrawer from './components/QueueDrawer'
import ProcessingIndicator from './components/ProcessingIndicator'
import OfflineBanner from './components/OfflineBanner'

export default function BulkImageGeneratorPage() {
  const currentProject = useProjectStore((s) => s.currentProject)

  // Form state
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<AIImageModel>('nano-banana-2')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16')
  const [resolution, setResolution] = useState<ImageResolution>('2K')
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([])

  // Queue
  const {
    stats,
    isPaused,
    pauseReason,
    addToQueue,
    toggleDrawer,
    isDrawerOpen,
    startProcessing,
  } = useImageQueue()

  // Processor
  useQueueProcessor({
    enabled: true,
    onComplete: () => {
      // Imagem gerada com sucesso - ja tem toast no processor
    },
    onBatchComplete: () => {
      // Lote concluido - ja tem toast no processor
    },
  })

  // Network
  const { isOnline } = useNetworkStatus()

  // Computed
  const parsed = useMemo(() => parsePromptVariables(prompt), [prompt])
  const validation = useMemo(() => validatePromptVariables(prompt), [prompt])
  const creditsPerImage = useMemo(
    () => calculateCredits(model, resolution),
    [model, resolution]
  )
  const totalCredits = creditsPerImage * parsed.combinations

  const canSubmit =
    prompt.trim().length > 0 && validation.isValid && currentProject?.id

  // Handlers
  const handleAddToQueue = useCallback(() => {
    if (!canSubmit || !currentProject?.id) return

    addToQueue({
      prompt,
      model,
      aspectRatio,
      resolution,
      referenceImages,
    })

    // Clear form
    setPrompt('')
    setReferenceImages([])

    // Start processing if not already
    startProcessing()

    const count = parsed.combinations
    toast.success(
      count > 1
        ? `${count} variacoes adicionadas a fila`
        : 'Imagem adicionada a fila'
    )
  }, [
    canSubmit,
    currentProject?.id,
    prompt,
    model,
    aspectRatio,
    resolution,
    referenceImages,
    parsed.combinations,
    addToQueue,
    startProcessing,
  ])

  if (!currentProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <ImageIcon size={32} className="text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-white">Selecione um projeto</h2>
          <p className="mt-2 text-white/50">
            Escolha um projeto na barra lateral para gerar imagens.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Offline Banner */}
      <OfflineBanner isOnline={isOnline} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Geracao em Massa</h1>
          <p className="text-sm text-white/50">
            Crie multiplas imagens com IA de forma eficiente
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ProcessingIndicator
            pending={stats.pending}
            processing={stats.processing}
            isPaused={isPaused}
            pauseReason={pauseReason}
            onClick={toggleDrawer}
          />
          <ProjectBadge project={currentProject} />
          <button
            type="button"
            onClick={toggleDrawer}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-xl transition-all',
              'bg-white/[0.03] border border-white/[0.08]',
              'text-white/70 hover:text-white hover:bg-white/[0.06]',
              isDrawerOpen && 'bg-primary/20 border-primary/30 text-primary'
            )}
          >
            <ListOrdered size={18} />
            <span className="text-sm font-medium">Fila</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Prompt Input */}
          <section>
            <PromptInput
              value={prompt}
              onChange={setPrompt}
              model={model}
              resolution={resolution}
            />
          </section>

          {/* Reference Images */}
          <section className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <ReferenceImagesSection
              images={referenceImages}
              onChange={setReferenceImages}
              model={model}
              projectId={currentProject.id}
            />
          </section>

          {/* Advanced Settings */}
          <section>
            <AdvancedSettings
              model={model}
              onModelChange={setModel}
              aspectRatio={aspectRatio}
              onAspectRatioChange={setAspectRatio}
              resolution={resolution}
              onResolutionChange={setResolution}
            />
          </section>

          {/* Credits Info */}
          <div className="text-center text-sm text-white/50">
            Creditos estimados:{' '}
            <span className="font-medium text-white">
              ~{totalCredits} {parsed.combinations > 1 ? `(${creditsPerImage} x ${parsed.combinations})` : ''}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <motion.button
              type="button"
              onClick={handleAddToQueue}
              disabled={!canSubmit}
              whileHover={{ scale: canSubmit ? 1.02 : 1 }}
              whileTap={{ scale: canSubmit ? 0.98 : 1 }}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl',
                'font-medium transition-all',
                canSubmit
                  ? 'bg-primary hover:bg-primary/90 text-white'
                  : 'bg-white/[0.06] text-white/40 cursor-not-allowed'
              )}
            >
              <Plus size={18} />
              <span>
                {parsed.combinations > 1
                  ? `Adicionar ${parsed.combinations} Variacoes`
                  : 'Adicionar a Fila'}
              </span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Queue Drawer */}
      <QueueDrawer />
    </div>
  )
}
