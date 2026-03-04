import { useState, useCallback } from 'react'
import { Sparkles, Layers } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useProjectStore } from '@/stores/project.store'
import { useGenerationStore, usePendingJobs, useCompletedJobs, ArtFormat } from '@/stores/generation.store'
import { useGenerateArt, GenerateArtResult } from '@/hooks/use-art-generation'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/project/shared/Switch'
import FormatSelector from '@/components/project/generate/FormatSelector'
import TextInput from '@/components/project/generate/TextInput'
import VariationSelector from '@/components/project/generate/VariationSelector'
import GenerationQueue from '@/components/project/generate/GenerationQueue'
import ResultImageCard from '@/components/project/generate/ResultImageCard'
import ProjectBadge from '@/components/layout/ProjectBadge'
import PhotoSelector from '@/components/project/generate/PhotoSelector'
import CompositionEditor from '@/components/project/generate/CompositionEditor'

const UPLOAD_URL = 'https://studio-lagosta-v2.vercel.app/api/upload'

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
  const [compositionEnabled, setCompositionEnabled] = useState(false)
  const [compositionPrompt, setCompositionPrompt] = useState('')
  const [compositionReferenceImages, setCompositionReferenceImages] = useState<File[]>([])
  const [variations, setVariations] = useState<1 | 2 | 4>(1)

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

  const processResultImages = useCallback(async (result: GenerateArtResult): Promise<string[]> => {
    const processedUrls: string[] = []

    // Debug: log fonts received from API
    console.log('[generate-art] Fonts from API:', JSON.stringify(result.fonts))
    console.log('[generate-art] FontUrls from API:', JSON.stringify(result.fontUrls))

    for (const img of result.images) {
      // 1. Download da imagem do Ideogram
      const downloaded = await window.electronAPI.downloadBlob(img.imageUrl)
      if (!downloaded.ok || !downloaded.buffer) {
        processedUrls.push(img.imageUrl) // Fallback: URL original
        continue
      }

      // 2. Se tem textLayout, renderizar texto + logo localmente
      if (img.textLayout && result.fonts && window.electronAPI.renderText) {
        try {
          console.log('[generate-art] Calling renderText with fonts:', result.fonts, 'fontUrls:', result.fontUrls)
          const rendered = await window.electronAPI.renderText({
            imageBuffer: downloaded.buffer,
            textLayout: img.textLayout,
            fonts: result.fonts,
            fontUrls: result.fontUrls,
            logoUrl: includeLogo ? result.logo?.url : undefined,
            logoPosition: result.logo?.position,
            logoSizePct: result.logo?.sizePct,
          })
          if (rendered.ok && rendered.buffer) {
            const blob = new Blob([rendered.buffer], { type: 'image/jpeg' })
            processedUrls.push(URL.createObjectURL(blob))
            continue
          }
        } catch (e) {
          console.error('[render-text] Failed, using original:', e)
        }
      }

      // 3. Fallback: criar blob da imagem sem texto
      const blob = new Blob([downloaded.buffer], { type: downloaded.contentType || 'image/jpeg' })
      processedUrls.push(URL.createObjectURL(blob))
    }

    return processedUrls
  }, [includeLogo])

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) {
      toast.error('Digite o texto que aparecera na arte')
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

    const params = {
      format,
      text: text.trim(),
      variations,
      includeLogo,
      usePhoto,
      photoUrl: usePhoto ? selectedPhoto?.url : undefined,
      compositionEnabled,
      compositionPrompt: compositionEnabled ? compositionPrompt : undefined,
      compositionReferenceUrls,
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
      compositionEnabled: params.compositionEnabled,
      compositionPrompt: params.compositionPrompt,
      compositionReferenceUrls: params.compositionReferenceUrls,
    }).then(async (result) => {
      try {
        const processedUrls = await processResultImages(result)
        updateJob(jobId, { status: 'done', images: processedUrls })
        toast.success(`${processedUrls.length} arte(s) gerada(s) com sucesso!`)
      } catch (e) {
        // Fallback: use raw URLs if processing fails
        const imageUrls = result.images.map((img) => img.imageUrl)
        updateJob(jobId, { status: 'done', images: imageUrls })
        toast.success(`${imageUrls.length} arte(s) gerada(s) com sucesso!`)
      }
    }).catch((error) => {
      updateJob(jobId, { status: 'error', error: error.message || 'Erro ao gerar arte' })
      toast.error(error.message || 'Erro ao gerar arte')
    })

    toast.info('Gerando arte... Voce pode continuar usando o app')
  }, [format, text, variations, includeLogo, usePhoto, selectedPhoto, compositionEnabled, compositionPrompt, compositionReferenceImages, projectId, addJob, updateJob, generateArt, uploadReferenceImages, processResultImages])

  const handleSchedule = useCallback((imageUrl: string) => {
    navigate('/new-post', { state: { imageUrl } })
  }, [navigate])

  const handleDownload = useCallback(async (imageUrl: string) => {
    try {
      if (imageUrl.startsWith('blob:')) {
        // Imagem já processada localmente
        const a = document.createElement('a')
        a.href = imageUrl
        a.download = `arte-${Date.now()}.jpg`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        toast.success('Imagem baixada!')
        return
      }

      // Fallback: download remoto
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
              <span className="flex items-center gap-1.5 text-sm text-text">
                <Layers size={16} />
                Composição com IA
              </span>
              <Switch checked={compositionEnabled} onChange={setCompositionEnabled} />
            </div>
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
