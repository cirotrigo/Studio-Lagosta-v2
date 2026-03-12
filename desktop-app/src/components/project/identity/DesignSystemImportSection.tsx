import { useMemo, useState } from 'react'
import { Upload, Loader2, CheckCircle2, Trash2, FileArchive, FileText, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import {
  useDeleteDesignSystem,
  useDesignSystem,
  useSaveDesignSystem,
} from '@/hooks/use-design-system'

interface DesignSystemImportSectionProps {
  projectId: number
}

const UPLOAD_URL = 'https://studio-lagosta-v2.vercel.app/api/upload'
const LEGACY_ELEMENTS_UPLOAD_BASE = 'https://studio-lagosta-v2.vercel.app/api/projects'

function inferSourceType(fileName: string): 'html' | 'zip' {
  const lower = fileName.toLowerCase()
  return lower.endsWith('.zip') ? 'zip' : 'html'
}

function formatFileSize(size?: number): string {
  if (!size || size <= 0) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

export default function DesignSystemImportSection({ projectId }: DesignSystemImportSectionProps) {
  const { data, isLoading, refetch } = useDesignSystem(projectId)
  const saveDesignSystem = useSaveDesignSystem(projectId)
  const deleteDesignSystem = useDeleteDesignSystem(projectId)

  const [isUploading, setIsUploading] = useState(false)
  const [notes, setNotes] = useState('')

  const imported = data?.designSystemImport ?? null
  const storageMode = data?.storageMode ?? 'design_system'

  const accept = useMemo(
    () => '.html,.htm,.zip,text/html,application/zip,application/x-zip-compressed',
    [],
  )

  const handleUpload = async (file: File) => {
    const lowerName = file.name.toLowerCase()
    const valid = lowerName.endsWith('.html') || lowerName.endsWith('.htm') || lowerName.endsWith('.zip')
    if (!valid) {
      toast.error('Envie um arquivo HTML ou ZIP')
      return
    }

    setIsUploading(true)
    try {
      const buffer = await file.arrayBuffer()
      const primaryUpload = await window.electronAPI.uploadFile(
        UPLOAD_URL,
        { name: file.name, type: file.type || 'application/octet-stream', buffer },
        { type: 'design_system' },
      )

      let uploadedUrl = (primaryUpload.data as { url?: string } | undefined)?.url
      let uploadedViaLegacyElements = false

      if (!primaryUpload.ok || !uploadedUrl) {
        const fallbackUpload = await window.electronAPI.uploadFile(
          `${LEGACY_ELEMENTS_UPLOAD_BASE}/${projectId}/elements`,
          { name: file.name, type: file.type || 'application/octet-stream', buffer },
          { name: file.name, category: 'design_system' },
        )
        if (!fallbackUpload.ok) {
          const uploadError = fallbackUpload.data as { error?: string; details?: string } | undefined
          throw new Error(uploadError?.details || uploadError?.error || 'Falha no upload do Design System')
        }
        uploadedUrl = (fallbackUpload.data as { fileUrl?: string; url?: string } | undefined)?.fileUrl
          ?? (fallbackUpload.data as { fileUrl?: string; url?: string } | undefined)?.url
        if (!uploadedUrl) {
          throw new Error('Upload concluído sem URL retornada')
        }
        uploadedViaLegacyElements = true
      }

      if (!uploadedViaLegacyElements) {
        await saveDesignSystem.mutateAsync({
          fileUrl: uploadedUrl,
          fileName: file.name,
          sourceType: inferSourceType(file.name),
          sizeBytes: file.size,
          notes: notes.trim() || undefined,
        })
      } else {
        await refetch()
      }

      setNotes('')
      toast.success('Design System importado com sucesso')
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        toast.error((error.data as { error?: string; details?: string } | undefined)?.details || error.message)
        return
      }
      const message = error instanceof Error ? error.message : 'Erro ao importar Design System'
      toast.error(message)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteDesignSystem.mutateAsync()
      toast.success('Design System removido')
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        toast.error((error.data as { error?: string; details?: string } | undefined)?.details || error.message)
        return
      }
      const message = error instanceof Error ? error.message : 'Erro ao remover Design System'
      toast.error(message)
    } finally {
      // no-op
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    void handleUpload(file)
    event.target.value = ''
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text">Importar Design System</h2>
        <p className="mt-1 text-sm text-text-muted">
          Envie o DS oficial para padronizar templates HTML/CSS. Aceita HTML e ZIP.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <label className="block text-xs font-medium text-text-muted">Observações (opcional)</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Ex: DS v3 completo com assets locais"
          className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm text-text placeholder:text-text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-input px-4 py-3 text-sm text-text-muted transition-colors hover:border-primary/50 hover:text-text">
          {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {isUploading ? 'Enviando Design System...' : 'Selecionar HTML ou ZIP'}
          <input
            type="file"
            accept={accept}
            className="hidden"
            disabled={isUploading || saveDesignSystem.isPending}
            onChange={handleFileChange}
          />
        </label>

        <p className="text-[11px] text-text-subtle">
          Recomendado: ZIP com `HTML + assets`. HTML isolado funciona, mas pode perder fidelidade visual.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-text-muted">
          <Loader2 size={16} className="animate-spin" />
          Carregando Design System importado...
        </div>
      ) : imported ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <CheckCircle2 size={16} className="text-emerald-500" />
                DS importado
              </div>
              <p className="text-xs text-text-muted">{imported.fileName}</p>
            </div>
            <div className="rounded bg-input px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-subtle">
              {imported.sourceType}
            </div>
          </div>

          {storageMode === 'legacy_elements' && (
            <div className="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
              Modo de compatibilidade ativo: DS salvo em `elements` neste ambiente.
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs text-text-muted">
            <div className="rounded bg-input px-2 py-1">Tamanho: {formatFileSize(imported.sizeBytes)}</div>
            <div className="rounded bg-input px-2 py-1">
              Importado em: {new Date(imported.uploadedAt).toLocaleString('pt-BR')}
            </div>
          </div>

          {imported.notes && (
            <div className="rounded bg-input px-2 py-1 text-xs text-text-muted">{imported.notes}</div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.electronAPI.openExternal(imported.fileUrl)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-text-muted hover:bg-input hover:text-text"
            >
              <ExternalLink size={12} />
              Abrir arquivo
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteDesignSystem.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              {deleteDesignSystem.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Remover
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-text-subtle">
            {imported.sourceType === 'zip' ? <FileArchive size={12} /> : <FileText size={12} />}
            {imported.sourceType === 'zip'
              ? 'Pacote ZIP detectado: ideal para manter CSS/JS/Fontes consistentes.'
              : 'HTML único detectado: útil para testes rápidos e ajustes pontuais.'}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-sm text-text-muted">
          Nenhum Design System importado para este projeto.
        </div>
      )}
    </div>
  )
}
