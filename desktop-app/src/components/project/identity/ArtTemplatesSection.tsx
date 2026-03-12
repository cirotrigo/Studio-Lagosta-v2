import { useState, useCallback, useEffect, useMemo } from 'react'
import { Upload, X, Loader2, Plus, Trash2, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from '@/lib/constants'
import { useArtTemplates, useCreateArtTemplate, useDeleteArtTemplate, useAnalyzeArtTemplate } from '@/hooks/use-art-templates'
import type { ArtTemplate } from '@/hooks/use-art-templates'
import { ArtFormat, ReviewField } from '@/stores/generation.store'
import type { ImportedDsTemplateSummary, InstagramPreviewTokens } from '@/lib/instagram-ds/token-parser'
import InstagramHtmlPreview from '@/components/project/generate/InstagramHtmlPreview'

const UPLOAD_URL = 'https://studio-lagosta-v2.vercel.app/api/upload'

interface ArtTemplatesSectionProps {
  projectId: number
  previewTokens?: Partial<InstagramPreviewTokens>
  previewCss?: string
  logoUrl?: string
  importedTemplates?: ImportedDsTemplateSummary[]
}

const FORMAT_TABS: { value: ArtFormat; label: string }[] = [
  { value: 'STORY', label: 'Story' },
  { value: 'FEED_PORTRAIT', label: 'Feed' },
  { value: 'SQUARE', label: 'Quadrado' },
]

const PREVIEW_FIELDS_BY_TEMPLATE: Record<string, ReviewField[]> = {
  S1: [
    { key: 'pre_title', label: 'Pre title', value: 'PROMOCAO EXCLUSIVA' },
    { key: 'title', label: 'Title', value: 'RESERVE<br>HOJE MESMO' },
    { key: 'cta', label: 'CTA', value: 'GARANTIR MESA' },
  ],
  S2: [
    { key: 'pre_title', label: 'Pre title', value: 'EXPERIENCIA' },
    { key: 'title', label: 'Title', value: 'SABOR<br>QUE NAO<br>SE ESQUECE' },
    { key: 'description', label: 'Description', value: 'Visual editorial com contraste e foco no produto.' },
  ],
  S3: [
    { key: 'title', label: 'Title', value: 'O QUE TEM<br>HOJE' },
    { key: 'description', label: 'Description', value: 'Aberto ate 23h|Dose dupla de chopp|Estacionamento gratis' },
    { key: 'footer_info_1', label: 'Footer 1', value: 'Rua Exemplo, 123' },
    { key: 'footer_info_2', label: 'Footer 2', value: '(27) 99999-9999' },
  ],
  S4: [
    { key: 'badge', label: 'Badge', value: 'BASTIDORES' },
    { key: 'title', label: 'Title', value: 'A LUZ QUE<br>VENDE MAIS' },
    { key: 'description', label: 'Description', value: 'Producao audiovisual para restaurante.' },
    { key: 'cta', label: 'CTA', value: 'VER PORTFOLIO' },
  ],
  S5: [
    { key: 'badge', label: 'Badge', value: 'EM GRAVACAO' },
    { key: 'title', label: 'Title', value: 'FOTOGRAFIA<br>GASTRONOMICA' },
    { key: 'footer_info_1', label: 'Footer 1', value: 'Vitoria, ES' },
    { key: 'footer_info_2', label: 'Footer 2', value: 'Sessao das 14h as 18h' },
  ],
  S6: [
    { key: 'badge', label: 'Badge', value: 'QUALIDADE' },
    { key: 'title', label: 'Title', value: 'CONTEUDO<br>QUE DA FOME' },
    { key: 'cta', label: 'CTA', value: 'AGENDE SUA SESSAO' },
  ],
  F1: [
    { key: 'pre_title', label: 'Pre title', value: 'APENAS HOJE' },
    { key: 'badge', label: 'Badge', value: 'R$ 49,90' },
  ],
  F2: [
    { key: 'title', label: 'Title', value: 'A ARTE<br>DE COMER BEM' },
    { key: 'description', label: 'Description', value: 'Lifestyle visual com foco em atmosfera e textura.' },
  ],
  F3: [
    { key: 'badge', label: 'Badge', value: '#GASTRONOMIA' },
  ],
}

function toArtFormat(format: string): ArtFormat {
  if (format === 'STORY' || format === 'SQUARE' || format === 'FEED_PORTRAIT') return format
  if (format === 'FEED') return 'FEED_PORTRAIT'
  return 'STORY'
}

function previewAspectClass(format: ArtFormat): string {
  if (format === 'STORY') return 'aspect-[9/16]'
  if (format === 'SQUARE') return 'aspect-square'
  return 'aspect-[4/5]'
}

function extractTemplateCode(input?: string): string | null {
  if (!input) return null
  const match = input.toUpperCase().match(/\b(S[1-6]|F[1-3])\b/)
  return match?.[1] ?? null
}

function inferTemplateCode(template: ArtTemplate): string {
  const candidates = [
    template.name,
    template.fingerprint,
    typeof template.templateData?.template_id === 'string' ? template.templateData.template_id : undefined,
    typeof template.templateData?.templateId === 'string' ? template.templateData.templateId : undefined,
  ]

  for (const candidate of candidates) {
    const code = extractTemplateCode(candidate)
    if (code) return code
  }

  const normalizedFormat = toArtFormat(template.format)
  if (normalizedFormat === 'SQUARE') return 'F3'
  if (normalizedFormat === 'FEED_PORTRAIT') return 'F2'
  return 'S1'
}

function sampleValueForSlotKey(slotKey: string): string {
  const key = slotKey.toLowerCase()
  if (key.includes('pre') || key.includes('eyebrow')) return 'PROMOCAO EXCLUSIVA'
  if (key.includes('title') || key.includes('headline')) return 'SABOR<br>QUE CONQUISTA'
  if (key.includes('description') || key.includes('desc') || key.includes('paragraph')) return 'Texto de apoio com foco em conversao.'
  if (key.includes('cta') || key.includes('action') || key.includes('call')) return 'RESERVE AGORA'
  if (key.includes('badge') || key.includes('tag') || key.includes('price')) return 'OFERTA ESPECIAL'
  if (key.includes('footer') || key.includes('info') || key.includes('address')) return 'Vitoria - ES'
  return 'CONTEUDO'
}

function buildPreviewFields(template: ArtTemplate, templateCode: string): ReviewField[] {
  const contentSlots = template.templateData?.content_slots
  if (contentSlots && typeof contentSlots === 'object') {
    const slotKeys = Object.keys(contentSlots)
    if (slotKeys.length > 0) {
      return slotKeys.map((slotKey) => ({
        key: slotKey,
        label: slotKey,
        value: sampleValueForSlotKey(slotKey),
      }))
    }
  }
  return PREVIEW_FIELDS_BY_TEMPLATE[templateCode] || PREVIEW_FIELDS_BY_TEMPLATE.S1
}

export default function ArtTemplatesSection({
  projectId,
  previewTokens,
  previewCss,
  logoUrl,
  importedTemplates,
}: ArtTemplatesSectionProps) {
  const { data: templates, isLoading, isError: _isError } = useArtTemplates(projectId)
  const createTemplate = useCreateArtTemplate(projectId)
  const deleteTemplate = useDeleteArtTemplate(projectId)
  const analyzeTemplate = useAnalyzeArtTemplate()

  const [activeFormat, setActiveFormat] = useState<ArtFormat>('STORY')
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Defensive: ensure templates is always an array
  const safeTemplates = Array.isArray(templates) ? templates : []

  const filteredTemplates = safeTemplates.filter((t) => t.format === activeFormat)
  const formatCount = filteredTemplates.length
  const filteredImportedTemplates = useMemo(() => {
    if (!Array.isArray(importedTemplates)) return []
    return importedTemplates.filter((template) => template.format === activeFormat)
  }, [importedTemplates, activeFormat])
  const fallbackPreviewImage = filteredTemplates[0]?.sourceImageUrl

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-text">Templates de Arte</h3>
        <p className="mt-1 text-sm text-text-muted">
          Crie templates a partir de imagens de referencia e visualize o resultado real em HTML/CSS.
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
        <div className="space-y-3">
          {filteredTemplates.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredTemplates.map((tpl) => {
                const templateCode = inferTemplateCode(tpl)
                return (
                  <TemplateCard
                    key={tpl.id}
                    template={tpl}
                    templateCode={templateCode}
                    previewFields={buildPreviewFields(tpl, templateCode)}
                    previewTokens={previewTokens}
                    previewCss={previewCss}
                    logoUrl={logoUrl}
                    onDelete={() => {
                      deleteTemplate.mutate(tpl.id, {
                        onSuccess: () => toast.success('Template removido'),
                        onError: (e: any) => toast.error(e.message || 'Erro ao remover template'),
                      })
                    }}
                    isDeleting={deleteTemplate.isPending}
                  />
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center">
              <p className="text-xs text-text-muted">Nenhum template criado para este formato.</p>
              <p className="mt-1 text-[10px] text-text-subtle">
                Clique em "Criar template" para cadastrar o primeiro.
              </p>
            </div>
          )}

          {/* Add template button */}
          {formatCount < 5 && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/50 p-4 transition-all duration-200 hover:border-primary/50 hover:bg-card"
            >
              <Plus size={20} className="text-text-subtle" />
              <span className="text-xs text-text-muted">Criar template</span>
              <span className="rounded bg-input px-1.5 py-0.5 text-[10px] text-text-subtle">{formatCount}/5</span>
            </button>
          )}

          {filteredImportedTemplates.length > 0 && (
            <div className="rounded-xl border border-border bg-card/40 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-text">
                <Sparkles size={12} className="text-primary" />
                Templates detectados no Design System importado
              </div>
              <div className="grid grid-cols-2 gap-2">
                {filteredImportedTemplates.map((template) => (
                  <ImportedTemplateCard
                    key={template.id}
                    template={template}
                    sourceImageUrl={fallbackPreviewImage}
                    logoUrl={logoUrl}
                    previewTokens={previewTokens}
                    previewCss={previewCss}
                  />
                ))}
              </div>
            </div>
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
  templateCode,
  previewFields,
  previewTokens,
  previewCss,
  logoUrl,
  onDelete,
  isDeleting,
}: {
  template: ArtTemplate
  templateCode: string
  previewFields: ReviewField[]
  previewTokens?: Partial<InstagramPreviewTokens>
  previewCss?: string
  logoUrl?: string
  onDelete: () => void
  isDeleting: boolean
}) {
  const format = toArtFormat(template.format)
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card">
      <div className={cn('relative overflow-hidden border-b border-border bg-input', previewAspectClass(format))}>
        <InstagramHtmlPreview
          format={format}
          fields={previewFields}
          sourceImageUrl={template.sourceImageUrl}
          logoUrl={logoUrl}
          includeLogo={Boolean(logoUrl)}
          templateName={templateCode}
          tokens={previewTokens}
          customCss={previewCss}
          className="h-full w-full"
        />

        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
        >
          {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>

      <div className="space-y-1.5 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-medium text-text">{template.name}</p>
          <span className="rounded bg-input px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
            {templateCode}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
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
          <span className="text-[10px] text-text-subtle">
            {new Date(template.createdAt).toLocaleDateString('pt-BR')}
          </span>
        </div>
      </div>
    </div>
  )
}

function ImportedTemplateCard({
  template,
  sourceImageUrl,
  logoUrl,
  previewTokens,
  previewCss,
}: {
  template: ImportedDsTemplateSummary
  sourceImageUrl?: string
  logoUrl?: string
  previewTokens?: Partial<InstagramPreviewTokens>
  previewCss?: string
}) {
  const format = toArtFormat(template.format)
  const sampleFields = PREVIEW_FIELDS_BY_TEMPLATE[template.id] || PREVIEW_FIELDS_BY_TEMPLATE.S1

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card/60">
      <div className={cn('overflow-hidden bg-input', previewAspectClass(format))}>
        <InstagramHtmlPreview
          format={format}
          fields={sampleFields}
          sourceImageUrl={sourceImageUrl}
          logoUrl={logoUrl}
          includeLogo={Boolean(logoUrl)}
          templateName={template.id}
          tokens={previewTokens}
          customCss={previewCss}
          className="h-full w-full"
        />
      </div>
      <div className="truncate px-2 py-1.5 text-[10px] text-text-muted">
        <span className="font-semibold text-text">{template.id}</span>{' '}
        {template.name.replace(`${template.id} — `, '')}
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
