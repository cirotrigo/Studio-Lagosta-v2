import { useState, useCallback, useEffect } from 'react'
import { Upload, X, Loader2, Plus, Trash2, Image, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from '@/lib/constants'
import { useArtTemplates, useCreateArtTemplate, useDeleteArtTemplate, useAnalyzeArtTemplate } from '@/hooks/use-art-templates'
import type { ArtTemplate } from '@/hooks/use-art-templates'
import { ArtFormat } from '@/stores/generation.store'

const UPLOAD_URL = 'https://studio-lagosta-v2.vercel.app/api/upload'

interface ArtTemplatesSectionProps {
  projectId: number
}

const FORMAT_TABS: { value: ArtFormat; label: string }[] = [
  { value: 'STORY', label: 'Story' },
  { value: 'FEED_PORTRAIT', label: 'Feed' },
  { value: 'SQUARE', label: 'Quadrado' },
]

export default function ArtTemplatesSection({ projectId }: ArtTemplatesSectionProps) {
  const { data: templates, isLoading, isError } = useArtTemplates(projectId)
  const createTemplate = useCreateArtTemplate(projectId)
  const deleteTemplate = useDeleteArtTemplate(projectId)
  const analyzeTemplate = useAnalyzeArtTemplate()

  const [activeFormat, setActiveFormat] = useState<ArtFormat>('STORY')
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Defensive: ensure templates is always an array
  const safeTemplates = Array.isArray(templates) ? templates : []

  const filteredTemplates = safeTemplates.filter((t) => t.format === activeFormat)
  const formatCount = filteredTemplates.length

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-text">Templates de Arte</h3>
        <p className="mt-1 text-sm text-text-muted">
          Crie templates a partir de imagens de referencia para gerar artes consistentes.
        </p>
      </div>

      {/* Format Tabs */}
      <div className="flex gap-1 rounded-lg bg-input p-1">
        {FORMAT_TABS.map((tab) => {
          const count = safeTemplates.filter((t) => t.format === tab.value).length
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveFormat(tab.value)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200',
                activeFormat === tab.value
                  ? 'bg-card text-text shadow-sm'
                  : 'text-text-muted hover:text-text'
              )}
            >
              {tab.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-text-muted" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredTemplates.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              onDelete={() => {
                deleteTemplate.mutate(tpl.id, {
                  onSuccess: () => toast.success('Template removido'),
                  onError: (e: any) => toast.error(e.message || 'Erro ao remover template'),
                })
              }}
              isDeleting={deleteTemplate.isPending}
            />
          ))}

          {/* Add template button */}
          {formatCount < 5 && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/50 p-6 transition-all duration-200 hover:border-primary/50 hover:bg-card"
            >
              <Plus size={24} className="text-text-subtle" />
              <span className="text-xs text-text-muted">Criar template</span>
              <span className="text-[10px] text-text-subtle">{formatCount}/5</span>
            </button>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateTemplateModal
          projectId={projectId}
          format={activeFormat}
          onClose={() => setShowCreateModal(false)}
          onAnalyze={analyzeTemplate}
          onCreate={createTemplate}
        />
      )}
    </div>
  )
}

function TemplateCard({
  template,
  onDelete,
  isDeleting,
}: {
  template: ArtTemplate
  onDelete: () => void
  isDeleting: boolean
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card">
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-input">
        {template.sourceImageUrl ? (
          <img
            src={template.sourceImageUrl}
            alt={template.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Image size={32} className="text-text-subtle" />
          </div>
        )}
        {/* Delete button */}
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
        >
          {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>
      {/* Info */}
      <div className="p-2.5">
        <p className="truncate text-xs font-medium text-text">{template.name}</p>
        <div className="mt-1 flex items-center gap-1.5">
          {template.analysisConfidence >= 0.7 ? (
            <span className="flex items-center gap-0.5 text-[10px] text-emerald-500">
              <CheckCircle2 size={10} />
              Confiavel
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
              <AlertTriangle size={10} />
              Revisao sugerida
            </span>
          )}
          <span className="text-[10px] text-text-subtle">v{template.templateVersion}</span>
        </div>
      </div>
    </div>
  )
}

function CreateTemplateModal({
  projectId,
  format,
  onClose,
  onAnalyze,
  onCreate,
}: {
  projectId: number
  format: ArtFormat
  onClose: () => void
  onAnalyze: ReturnType<typeof useAnalyzeArtTemplate>
  onCreate: ReturnType<typeof useCreateArtTemplate>
}) {
  const [name, setName] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<any>(null)
  const [step, setStep] = useState<'upload' | 'analyzing' | 'preview' | 'saving'>('upload')

  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [imageFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Formato de imagem nao suportado')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Imagem muito grande (max 20MB)')
      return
    }
    setImageFile(file)
    e.target.value = ''
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!imageFile || !name.trim()) {
      toast.error('Preencha o nome e selecione uma imagem')
      return
    }

    setStep('analyzing')

    try {
      // Upload image first
      const arrayBuffer = await imageFile.arrayBuffer()
      const response = await window.electronAPI.uploadFile(
        UPLOAD_URL,
        { name: imageFile.name, type: imageFile.type, buffer: arrayBuffer },
        { type: 'reference' }
      )
      if (!response.ok || !response.data?.url) {
        throw new Error('Erro ao enviar imagem')
      }
      setUploadedUrl(response.data.url)

      // Analyze with Vision
      const result = await onAnalyze.mutateAsync({
        projectId,
        imageUrl: response.data.url,
        format,
        templateName: name.trim(),
      })

      setAnalysisResult(result)
      setStep('preview')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao analisar imagem')
      setStep('upload')
    }
  }, [imageFile, name, projectId, format, onAnalyze])

  const handleSave = useCallback(async () => {
    if (!analysisResult || !uploadedUrl) return

    setStep('saving')

    try {
      await onCreate.mutateAsync({
        name: name.trim(),
        format,
        sourceImageUrl: uploadedUrl,
        templateData: analysisResult.templateData,
        fingerprint: analysisResult.fingerprint,
        analysisConfidence: analysisResult.analysisConfidence,
      })
      toast.success('Template criado com sucesso!')
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar template')
      setStep('preview')
    }
  }, [analysisResult, uploadedUrl, name, format, onCreate, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">Criar template de arte</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-text-muted hover:bg-input hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        {step === 'upload' && (
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-muted">Nome do template</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Wine Vix Story v1"
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Image upload */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-muted">Imagem de referencia</label>
              {previewUrl ? (
                <div className="relative">
                  <img
                    src={previewUrl}
                    alt="Referencia"
                    className="max-h-60 w-full rounded-lg border border-border object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setPreviewUrl(null) }}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-red-600"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-input p-8 transition-all hover:border-primary/50">
                  <input
                    type="file"
                    accept={ACCEPTED_IMAGE_TYPES.join(',')}
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Upload size={24} className="text-text-subtle" />
                  <span className="text-xs text-text-muted">Arraste ou clique para selecionar</span>
                </label>
              )}
            </div>

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!imageFile || !name.trim()}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium',
                'bg-primary text-primary-foreground',
                'hover:bg-primary-hover',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'transition-all duration-200'
              )}
            >
              Analisar com IA
            </button>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm text-text-muted">Analisando imagem com GPT-4o Vision...</p>
            <p className="text-xs text-text-subtle">Isso pode levar ate 30 segundos</p>
          </div>
        )}

        {step === 'preview' && analysisResult && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-input p-3">
              <p className="mb-2 text-xs font-medium text-text">Resultado da analise</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Confianca</span>
                  <span className={cn(
                    'font-medium',
                    analysisResult.analysisConfidence >= 0.7 ? 'text-emerald-500' : 'text-amber-500'
                  )}>
                    {Math.round(analysisResult.analysisConfidence * 100)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Slots detectados</span>
                  <span className="text-text">
                    {Object.keys(analysisResult.templateData?.content_slots ?? {}).length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Alinhamento</span>
                  <span className="text-text">
                    {analysisResult.templateData?.layout?.text_alignment ?? '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">Overlay</span>
                  <span className="text-text">
                    {analysisResult.templateData?.overlay?.direction ?? analysisResult.templateData?.overlay?.type ?? '-'}
                  </span>
                </div>
              </div>
            </div>

            {analysisResult.analysisConfidence < 0.7 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
                <p className="text-xs text-amber-200">
                  A confianca da analise esta abaixo de 70%. O template pode precisar de ajustes manuais.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text hover:bg-input transition-all duration-200"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleSave}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary-hover',
                  'transition-all duration-200'
                )}
              >
                Salvar template
              </button>
            </div>
          </div>
        )}

        {step === 'saving' && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm text-text-muted">Salvando template...</p>
          </div>
        )}
      </div>
    </div>
  )
}
