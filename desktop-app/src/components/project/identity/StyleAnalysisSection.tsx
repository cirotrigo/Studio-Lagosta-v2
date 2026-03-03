import { useState, useCallback, useEffect } from 'react'
import { Upload, X, Loader2, Sparkles, Save, Layout, Type, Palette, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { useBrandStyle, useUpdateBrandStyle, useAnalyzeStyle, StyleAnalysisResult } from '@/hooks/use-brand-style'
import { cn } from '@/lib/utils'
import { ACCEPTED_IMAGE_TYPES, MAX_FILE_SIZE } from '@/lib/constants'

interface StyleAnalysisSectionProps {
  projectId: number
}

export default function StyleAnalysisSection({ projectId }: StyleAnalysisSectionProps) {
  const { data: styleData } = useBrandStyle(projectId)
  const updateStyle = useUpdateBrandStyle(projectId)
  const analyzeStyle = useAnalyzeStyle()

  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [analysisResult, setAnalysisResult] = useState<StyleAnalysisResult | null>(null)
  const [editedSummary, setEditedSummary] = useState('')

  // Initialize edited summary from analysis result
  useEffect(() => {
    if (analysisResult) {
      setEditedSummary(analysisResult.summary)
    } else if (styleData?.styleDescription) {
      setEditedSummary(styleData.styleDescription)
    }
  }, [analysisResult, styleData])

  // Generate preview URLs for selected files
  useEffect(() => {
    const urls = referenceImages.map((file) => URL.createObjectURL(file))
    setPreviewUrls(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [referenceImages])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files).filter(
      (file) => ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE
    )

    if (referenceImages.length + files.length > 20) {
      toast.error('Maximo de 20 imagens de referencia')
      return
    }

    if (referenceImages.length + files.length < 5 && referenceImages.length + files.length > 0) {
      // Allow adding but warn
    }

    setReferenceImages((prev) => [...prev, ...files].slice(0, 20))
  }, [referenceImages])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (file) => ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE
    )

    if (referenceImages.length + files.length > 20) {
      toast.error('Maximo de 20 imagens de referencia')
      return
    }

    setReferenceImages((prev) => [...prev, ...files].slice(0, 20))
    e.target.value = ''
  }, [referenceImages])

  const handleRemoveImage = useCallback((index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (referenceImages.length < 5) {
      toast.error('Adicione pelo menos 5 imagens de referencia')
      return
    }

    setIsUploading(true)
    setUploadProgress({ current: 0, total: referenceImages.length })

    try {
      // Upload images and get URLs
      const uploadedUrls: string[] = []

      for (let i = 0; i < referenceImages.length; i++) {
        setUploadProgress({ current: i + 1, total: referenceImages.length })

        const file = referenceImages[i]
        const arrayBuffer = await file.arrayBuffer()

        const response = await window.electronAPI.uploadFile(
          'https://studio-lagosta-v2.vercel.app/api/upload',
          {
            name: file.name,
            type: file.type,
            buffer: arrayBuffer,
          },
          { type: 'reference' }
        )

        if (!response.ok) {
          throw new Error(`Erro ao fazer upload: ${file.name}`)
        }

        const data = response.data as { url: string }
        uploadedUrls.push(data.url)
      }

      // Analyze style with uploaded URLs (max 4 for API)
      const urlsToAnalyze = uploadedUrls.slice(0, 4)
      const result = await analyzeStyle.mutateAsync({
        projectId,
        imageUrls: urlsToAnalyze,
      })

      setAnalysisResult(result)
      toast.success('Analise concluida!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao analisar estilo')
    } finally {
      setIsUploading(false)
      setUploadProgress({ current: 0, total: 0 })
    }
  }, [referenceImages, projectId, analyzeStyle])

  const handleSave = useCallback(async () => {
    try {
      await updateStyle.mutateAsync({
        styleDescription: editedSummary,
        visualElements: analysisResult?.detectedElements ? {
          layouts: analysisResult.detectedElements.layouts,
          typography: analysisResult.detectedElements.typography,
          patterns: analysisResult.detectedElements.patterns,
        } : undefined,
      })
      toast.success('Estilo salvo com sucesso!')
    } catch (error) {
      toast.error('Erro ao salvar estilo')
    }
  }, [editedSummary, analysisResult, updateStyle])

  const canAnalyze = referenceImages.length >= 5 && referenceImages.length <= 20

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text">Estilo Visual</h2>
        <p className="mt-1 text-sm text-text-muted">
          Adicione 5-20 imagens de referencia para analisar o estilo visual
        </p>
      </div>

      {/* Existing reference images from API */}
      {styleData?.referenceImageUrls && styleData.referenceImageUrls.length > 0 && referenceImages.length === 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-muted">Imagens salvas</label>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {styleData.referenceImageUrls.map((url, idx) => (
              <div
                key={idx}
                className="aspect-square overflow-hidden rounded-lg border border-border bg-card"
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dropzone */}
      <div className="space-y-3">
        {/* Preview Grid */}
        {previewUrls.length > 0 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {previewUrls.map((url, idx) => (
              <div
                key={idx}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card"
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => handleRemoveImage(idx)}
                  className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Dropzone Area */}
        <label
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed',
            'transition-all duration-200',
            isDragging
              ? 'border-primary bg-primary/10'
              : 'border-border bg-input hover:border-primary/50',
            isUploading && 'pointer-events-none opacity-50'
          )}
        >
          <input
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            multiple
            onChange={handleFileInput}
            disabled={isUploading}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <Upload size={24} className="text-text-muted" />
            <div>
              <p className="text-sm font-medium text-text">
                Arraste imagens ou clique para selecionar
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {referenceImages.length}/20 imagens • Minimo 5
              </p>
            </div>
          </div>
        </label>
      </div>

      {/* Analyze Button */}
      <button
        onClick={handleAnalyze}
        disabled={!canAnalyze || isUploading || analyzeStyle.isPending}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium',
          'bg-primary text-primary-foreground',
          'hover:bg-primary-hover',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-all duration-200'
        )}
      >
        {isUploading || analyzeStyle.isPending ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            {isUploading
              ? `Enviando imagem ${uploadProgress.current} de ${uploadProgress.total}...`
              : 'Analisando estilo...'}
          </>
        ) : (
          <>
            <Sparkles size={20} />
            Analisar Estilo
          </>
        )}
      </button>

      {/* Analysis Result */}
      {(analysisResult || styleData?.styleDescription) && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-text">Resultado da Analise</h3>

          {/* Result Cards */}
          {analysisResult && (
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Layout Card */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Layout size={16} className="text-primary" />
                  <span className="text-sm font-medium text-text">Layout</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {analysisResult.detectedElements.layouts.map((item, idx) => (
                    <span key={idx} className="rounded bg-input px-2 py-0.5 text-xs text-text-muted">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* Typography Card */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Type size={16} className="text-primary" />
                  <span className="text-sm font-medium text-text">Tipografia</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {analysisResult.detectedElements.typography.map((item, idx) => (
                    <span key={idx} className="rounded bg-input px-2 py-0.5 text-xs text-text-muted">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* Colors Card */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Palette size={16} className="text-primary" />
                  <span className="text-sm font-medium text-text">Tom Visual</span>
                </div>
                <p className="text-xs text-text-muted">{analysisResult.detectedElements.mood}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {analysisResult.detectedElements.colorTones.map((item, idx) => (
                    <span key={idx} className="rounded bg-input px-2 py-0.5 text-xs text-text-muted">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* Patterns Card */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Layers size={16} className="text-primary" />
                  <span className="text-sm font-medium text-text">Elementos</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {analysisResult.detectedElements.patterns.map((item, idx) => (
                    <span key={idx} className="rounded bg-input px-2 py-0.5 text-xs text-text-muted">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Editable Summary */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-muted">Resumo (editavel)</label>
            <textarea
              value={editedSummary}
              onChange={(e) => setEditedSummary(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Descreva o estilo visual do projeto..."
            />
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={updateStyle.isPending}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-text',
              'hover:bg-input',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-all duration-200'
            )}
          >
            {updateStyle.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Salvar Estilo
          </button>
        </div>
      )}
    </div>
  )
}
