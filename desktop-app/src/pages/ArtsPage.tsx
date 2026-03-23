import { useMemo, useState } from 'react'
import {
  Download,
  Loader2,
  Send,
  Trash2,
  Image as ImageIcon,
  Sparkles,
  Search,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/lib/constants'
import { useProjectStore } from '@/stores/project.store'
import ProjectBadge from '@/components/layout/ProjectBadge'
import {
  useDeleteGeneration,
  useProjectGenerations,
  type ProjectGenerationRecord,
} from '@/hooks/use-project-generations'
import {
  useAIImages,
  useDeleteAIImage,
  type AIImage,
} from '@/hooks/use-art-generation'
import { cn } from '@/lib/utils'

type TabId = 'artes' | 'fotos-ia'

// ─── Helpers ────────────────────────────────────────────────────────

function resolveGenerationLabel(generation: ProjectGenerationRecord) {
  const pageName =
    typeof generation.fieldValues?.pageName === 'string'
      ? generation.fieldValues.pageName
      : null

  return pageName || generation.templateName || generation.Template?.name || 'Criativo'
}

function resolveGenerationFormat(generation: ProjectGenerationRecord) {
  const fieldFormat =
    typeof generation.fieldValues?.format === 'string' ? generation.fieldValues.format : null

  if (fieldFormat === 'STORY' || fieldFormat === 'FEED_PORTRAIT' || fieldFormat === 'SQUARE') {
    return fieldFormat
  }

  switch (generation.Template?.dimensions) {
    case '1080x1920':
      return 'STORY'
    case '1080x1080':
      return 'SQUARE'
    case '1080x1350':
    default:
      return 'FEED_PORTRAIT'
  }
}

function getAspectClass(format: 'STORY' | 'FEED_PORTRAIT' | 'SQUARE') {
  switch (format) {
    case 'STORY':
      return 'aspect-[9/16]'
    case 'SQUARE':
      return 'aspect-square'
    case 'FEED_PORTRAIT':
    default:
      return 'aspect-[4/5]'
  }
}

function getAIAspectClass(aspectRatio?: string) {
  switch (aspectRatio) {
    case '9:16':
      return 'aspect-[9/16]'
    case '1:1':
      return 'aspect-square'
    case '16:9':
      return 'aspect-[16/9]'
    case '4:5':
      return 'aspect-[4/5]'
    default:
      return 'aspect-square'
  }
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Artes Tab (existing) ───────────────────────────────────────────

function ArtesTab({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const generationsQuery = useProjectGenerations(projectId)
  const deleteGeneration = useDeleteGeneration(projectId)

  const generations = useMemo(
    () =>
      (generationsQuery.data?.generations ?? []).filter(
        (generation) => generation.status === 'COMPLETED' && generation.resultUrl,
      ),
    [generationsQuery.data?.generations],
  )

  if (generationsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-primary" />
          <p className="text-sm text-white/50">Carregando artes...</p>
        </div>
      </div>
    )
  }

  if (generationsQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-2xl border border-red-500/30 bg-white/5 backdrop-blur-sm p-6 text-center">
          <p className="text-sm text-red-400">
            {generationsQuery.error instanceof Error
              ? generationsQuery.error.message
              : 'Erro ao carregar artes.'}
          </p>
        </div>
      </div>
    )
  }

  if (generations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
            <ImageIcon size={32} className="text-white/50" />
          </div>
          <h3 className="text-lg font-medium text-white">Nenhuma arte gerada ainda</h3>
          <p className="mt-2 text-white/50">
            Gere criativos no editor para que aparecam aqui.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {generations.map((generation) => {
        const label = resolveGenerationLabel(generation)
        const imageUrl = generation.resultUrl
        const format = resolveGenerationFormat(generation)

        return (
          <div
            key={generation.id}
            className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm"
          >
            <div
              className={cn(
                'flex items-center justify-center overflow-hidden bg-[#080808] p-3',
                getAspectClass(format),
              )}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={label}
                  className="max-h-full max-w-full rounded-lg object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <ImageIcon size={28} className="text-white/50" />
                </div>
              )}
            </div>

            <div className="space-y-3 p-4">
              <div>
                <p className="truncate text-sm font-semibold text-white">{label}</p>
                <p className="mt-1 text-xs text-white/50">
                  {formatDateTime(generation.createdAt)}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!generation.id) return

                    try {
                      const response = await window.electronAPI.downloadBlob(
                        `${API_BASE_URL}/api/generations/${generation.id}/download`,
                      )

                      if (!response.ok || !response.buffer) {
                        throw new Error(response.error || 'Falha ao baixar arte')
                      }

                      const blob = new Blob([response.buffer], {
                        type: response.contentType || 'image/jpeg',
                      })
                      const objectUrl = URL.createObjectURL(blob)
                      const link = document.createElement('a')
                      link.href = objectUrl
                      link.download = generation.fileName || `${label}.jpg`
                      document.body.appendChild(link)
                      link.click()
                      document.body.removeChild(link)
                      URL.revokeObjectURL(objectUrl)
                      toast.success('Arte baixada com sucesso.')
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : 'Erro ao baixar arte.',
                      )
                    }
                  }}
                  className="flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-all duration-150 hover:bg-white/10 hover:border-primary/40 hover:text-white"
                  title="Baixar"
                >
                  <Download size={16} />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    navigate('/new-post', {
                      state: {
                        imageUrl,
                        postType: 'STORY',
                      },
                    })}
                  className="flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-all duration-150 hover:bg-white/10 hover:border-primary/40 hover:text-white"
                  title="Postar"
                >
                  <Send size={16} />
                </button>

                <button
                  type="button"
                  disabled={deleteGeneration.isPending}
                  onClick={async () => {
                    try {
                      await deleteGeneration.mutateAsync(generation.id)
                      toast.success('Arte excluida com sucesso.')
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : 'Erro ao excluir arte.',
                      )
                    }
                  }}
                  className="flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-all duration-150 hover:bg-white/10 hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                  title="Excluir"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Fotos IA Tab (new) ─────────────────────────────────────────────

function FotosIATab({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const aiImagesQuery = useAIImages(projectId)
  const deleteAIImage = useDeleteAIImage(projectId)
  const [search, setSearch] = useState('')

  const images = useMemo(() => {
    const all = aiImagesQuery.data ?? []
    if (!search) return all
    const q = search.toLowerCase()
    return all.filter(
      (img) =>
        img.name?.toLowerCase().includes(q) ||
        img.prompt?.toLowerCase().includes(q),
    )
  }, [aiImagesQuery.data, search])

  if (aiImagesQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-primary" />
          <p className="text-sm text-white/50">Carregando fotos IA...</p>
        </div>
      </div>
    )
  }

  if (aiImagesQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-2xl border border-red-500/30 bg-white/5 backdrop-blur-sm p-6 text-center">
          <p className="text-sm text-red-400">
            {aiImagesQuery.error instanceof Error
              ? aiImagesQuery.error.message
              : 'Erro ao carregar fotos IA.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por prompt ou nome..."
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-2.5 pl-9 pr-3 text-sm text-white placeholder-white/40 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
        />
      </div>

      {images.length === 0 ? (
        <div className="flex h-[400px] flex-col items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
              <Sparkles size={32} className="text-white/50" />
            </div>
            <h3 className="text-lg font-medium text-white">
              {search ? 'Nenhuma foto encontrada' : 'Nenhuma foto IA gerada ainda'}
            </h3>
            <p className="mt-2 text-white/50">
              {search
                ? 'Tente um termo de busca diferente.'
                : 'Gere imagens com IA em massa para que aparecam aqui.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {images.map((image) => (
            <AIImageCard
              key={image.id}
              image={image}
              onDelete={async () => {
                try {
                  await deleteAIImage.mutateAsync(image.id)
                  toast.success('Foto IA excluida com sucesso.')
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : 'Erro ao excluir foto IA.',
                  )
                }
              }}
              onPost={() =>
                navigate('/new-post', {
                  state: {
                    imageUrl: image.fileUrl,
                    postType: 'STORY',
                  },
                })
              }
              isDeleting={deleteAIImage.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AIImageCard({
  image,
  onDelete,
  onPost,
  isDeleting,
}: {
  image: AIImage
  onDelete: () => void
  onPost: () => void
  isDeleting: boolean
}) {
  return (
    <div className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
      {/* Image */}
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden bg-[#080808] p-3',
          getAIAspectClass(image.aspectRatio),
        )}
      >
        <img
          src={image.fileUrl}
          alt={image.name || image.prompt}
          className="max-h-full max-w-full rounded-lg object-contain"
        />

        {/* Prompt overlay on hover */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="line-clamp-3 text-xs text-white/90">{image.prompt}</p>
        </div>
      </div>

      {/* Info + actions */}
      <div className="space-y-3 p-4">
        <div>
          <p className="truncate text-sm font-semibold text-white">
            {image.name || 'Foto IA'}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-white/50">
              {formatDateTime(image.createdAt)}
            </span>
            {image.model && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {image.model}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {/* Download */}
          <button
            type="button"
            onClick={async () => {
              try {
                const response = await window.electronAPI.downloadBlob(image.fileUrl)
                if (!response.ok || !response.buffer) {
                  throw new Error(response.error || 'Falha ao baixar foto')
                }

                const ext = image.fileUrl.split('.').pop()?.split('?')[0] || 'png'
                const blob = new Blob([response.buffer], {
                  type: response.contentType || 'image/png',
                })
                const objectUrl = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = objectUrl
                link.download = `${image.name || 'foto-ia'}.${ext}`
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                URL.revokeObjectURL(objectUrl)
                toast.success('Foto baixada com sucesso.')
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : 'Erro ao baixar foto.',
                )
              }
            }}
            className="flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-all duration-150 hover:bg-white/10 hover:border-primary/40 hover:text-white"
            title="Baixar"
          >
            <Download size={16} />
          </button>

          {/* Post */}
          <button
            type="button"
            onClick={onPost}
            className="flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-all duration-150 hover:bg-white/10 hover:border-primary/40 hover:text-white"
            title="Postar"
          >
            <Send size={16} />
          </button>

          {/* Delete */}
          <button
            type="button"
            disabled={isDeleting}
            onClick={onDelete}
            className="flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-all duration-150 hover:bg-white/10 hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
            title="Excluir"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function ArtsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('artes')
  const currentProject = useProjectStore((state) => state.currentProject)

  if (!currentProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <ImageIcon size={32} className="text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-white">Selecione um projeto</h2>
          <p className="mt-2 text-white/50">
            Escolha um projeto na barra lateral para ver as artes geradas.
          </p>
        </div>
      </div>
    )
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'artes', label: 'Artes', icon: <ImageIcon size={16} /> },
    { id: 'fotos-ia', label: 'Fotos IA', icon: <Sparkles size={16} /> },
  ]

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Artes</h1>
            <p className="text-sm text-white/50">
              Criativos e fotos IA do projeto.
            </p>
          </div>
        </div>

        <ProjectBadge project={currentProject} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all',
              activeTab === tab.id
                ? 'border-primary text-white'
                : 'border-transparent text-white/50 hover:text-white/70 hover:border-white/20',
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'artes' && <ArtesTab projectId={currentProject.id} />}
        {activeTab === 'fotos-ia' && <FotosIATab projectId={currentProject.id} />}
      </div>
    </div>
  )
}
