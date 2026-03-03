import { useState, useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useProjectStore } from '@/stores/project.store'
import { useGenerationStore, usePendingJobs, useCompletedJobs, ArtFormat } from '@/stores/generation.store'
import { useGenerateArt } from '@/hooks/use-art-generation'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/project/shared/Switch'
import FormatSelector from '@/components/project/generate/FormatSelector'
import TextInput from '@/components/project/generate/TextInput'
import VariationSelector from '@/components/project/generate/VariationSelector'
import GenerationQueue from '@/components/project/generate/GenerationQueue'
import ResultImageCard from '@/components/project/generate/ResultImageCard'
import ProjectBadge from '@/components/layout/ProjectBadge'
import PhotoSelector from '@/components/project/generate/PhotoSelector'
import PoseEditor from '@/components/project/generate/PoseEditor'

interface GenerateArtTabProps {
  projectId: number
}

export default function GenerateArtTab({ projectId }: GenerateArtTabProps) {
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()
  const addJob = useGenerationStore((s) => s.addJob)
  const updateJob = useGenerationStore((s) => s.updateJob)
  const pendingJobs = usePendingJobs()
  const completedJobs = useCompletedJobs()
  const generateArt = useGenerateArt()

  // Form state
  const [format, setFormat] = useState<ArtFormat>('FEED_PORTRAIT')
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; source: string } | null>(null)
  const [text, setText] = useState('')
  const [includeLogo, setIncludeLogo] = useState(true)
  const [usePhoto, setUsePhoto] = useState(true)
  const [changePose, setChangePose] = useState(false)
  const [poseDescription, setPoseDescription] = useState('')
  const [poseReferenceImages, setPoseReferenceImages] = useState<File[]>([])
  const [variations, setVariations] = useState<1 | 2 | 4>(1)

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) {
      toast.error('Digite o texto que aparecera na arte')
      return
    }

    const params = {
      format,
      text: text.trim(),
      variations,
      includeLogo,
      usePhoto,
      photoUrl: usePhoto ? selectedPhoto?.url : undefined,
      changePose,
      poseDescription: changePose ? poseDescription : undefined,
    }

    const jobId = addJob(params)
    updateJob(jobId, { status: 'generating' })

    // Generate art asynchronously - don't await
    generateArt.mutateAsync({
      projectId,
      text: params.text,
      format: params.format,
      includeLogo: params.includeLogo,
      usePhoto: params.usePhoto,
      photoUrl: params.photoUrl,
      variations: params.variations,
    }).then((result) => {
      const imageUrls = result.images.map((img) => img.imageUrl)
      updateJob(jobId, { status: 'done', images: imageUrls })
      toast.success(`${imageUrls.length} arte(s) gerada(s) com sucesso!`)
    }).catch((error) => {
      updateJob(jobId, { status: 'error', error: error.message || 'Erro ao gerar arte' })
      toast.error(error.message || 'Erro ao gerar arte')
    })

    toast.info('Gerando arte... Voce pode continuar usando o app')
  }, [format, text, variations, includeLogo, usePhoto, selectedPhoto, changePose, poseDescription, projectId, addJob, updateJob, generateArt])

  const handleSchedule = useCallback((imageUrl: string) => {
    navigate('/new-post', { state: { imageUrl } })
  }, [navigate])

  const handleDownload = useCallback(async (imageUrl: string) => {
    try {
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
              <span className="text-sm text-text">Mudar pose com IA</span>
              <Switch checked={changePose} onChange={setChangePose} disabled={!usePhoto} />
            </div>
          </div>

          {/* Pose Editor (conditional) */}
          {changePose && usePhoto && (
            <PoseEditor
              description={poseDescription}
              onDescriptionChange={setPoseDescription}
              referenceImages={poseReferenceImages}
              onReferenceImagesChange={setPoseReferenceImages}
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
            disabled={!text.trim()}
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
        {pendingJobs.length === 0 && completedJobs.length === 0 ? (
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
                          // Remove only this image from the job
                          const newImages = job.images.filter((_, i) => i !== idx)
                          if (newImages.length === 0) {
                            useGenerationStore.getState().removeJob(job.id)
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
