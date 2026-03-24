import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, Layers3, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { EditorGenerateArtModal } from '@/components/editor/EditorGenerateArtModal'
import { EditorGenerationQueue } from '@/components/editor/EditorGenerationQueue'
import { EditorShell } from '@/components/editor/EditorShell'
import { QuickScheduleModal } from '@/components/project/generate/QuickScheduleModal'
import { ScheduledPostsBanner } from '@/components/editor/ScheduledPostsBanner'
import { EditorTemplateCarousel } from '@/components/editor/EditorTemplateCarousel'
import { TemplateTagsModal } from '@/components/editor/TemplateTagsModal'
import { ProjectTagsManager } from '@/components/editor/ProjectTagsManager'
import { createStarterDocument, cloneKonvaDocument, sortPages } from '@/lib/editor/document'
import { mergeEditorFontSources } from '@/lib/editor/font-utils'
import { normalizeKonvaTextValue } from '@/lib/editor/text-normalization'
import { useEditorGenerationQueue } from '@/hooks/use-editor-generation-queue'
import { useBrandAssets, type BrandAssets } from '@/hooks/use-brand-assets'
import { useProjectTags } from '@/hooks/use-project-tags'
import { useSyncStatus } from '@/hooks/use-sync-status'
import { useProjectStore } from '@/stores/project.store'
import { useEditorStore } from '@/stores/editor.store'
import { useEditorGenerationStore } from '@/stores/editor-generation.store'
import { usePagesStore } from '@/stores/pages.store'
import type { EditorPageLocationState } from '@/types/art-automation'
import type { KonvaTemplateDocument } from '@/types/template'
import type { Design } from '@/hooks/use-project-designs'

function normalizeDraftDocumentText(document: KonvaTemplateDocument) {
  const nextDocument = cloneKonvaDocument(document)

  nextDocument.design.pages = nextDocument.design.pages.map((page) => ({
    ...page,
    layers: page.layers.map((layer) =>
      layer.type === 'text' || layer.type === 'rich-text'
        ? {
            ...layer,
            text: normalizeKonvaTextValue(layer.text),
          }
        : layer,
    ),
  }))

  return nextDocument
}

function mergeDraftIdentity(
  document: KonvaTemplateDocument,
  project: ReturnType<typeof useProjectStore.getState>['currentProject'],
  brandAssets: BrandAssets | undefined,
) {
  const normalizedDocument = normalizeDraftDocumentText(document)

  return {
    ...normalizedDocument,
    identity: {
      ...normalizedDocument.identity,
      brandName:
        brandAssets?.name ||
        project?.name ||
        normalizedDocument.identity.brandName,
      logoUrl:
        brandAssets?.logo?.url ||
        project?.logoUrl ||
        normalizedDocument.identity.logoUrl,
      colors:
        brandAssets?.colors && brandAssets.colors.length > 0
          ? brandAssets.colors
          : normalizedDocument.identity.colors,
      fonts: mergeEditorFontSources(brandAssets?.fonts, normalizedDocument.identity.fonts).map((font) => ({
        name: font.name || font.fontFamily,
        fontFamily: font.fontFamily,
        fileUrl: font.fileUrl,
      })),
    },
  }
}

export default function EditorPage() {
  const location = useLocation()
  const currentProject = useProjectStore((state) => state.currentProject)
  const { data: brandAssets } = useBrandAssets(currentProject?.id)

  // Sync project tags to store
  useProjectTags(currentProject?.id)

  // Sync status for auto-syncing templates
  const { pull: syncPull, push: syncPush } = useSyncStatus()

  const document = useEditorStore((state) => state.document)
  const setDocument = useEditorStore((state) => state.setDocument)
  const setDocumentName = useEditorStore((state) => state.setDocumentName)
  const replaceDocumentWithoutHistory = useEditorStore((state) => state.replaceDocumentWithoutHistory)
  const thumbnails = usePagesStore((state) => state.thumbnails)
  const resetPagesState = usePagesStore((state) => state.reset)
  const addGenerationJobs = useEditorGenerationStore((state) => state.addJobs)

  const [templates, setTemplates] = useState<KonvaTemplateDocument[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [isAutoSyncing, setIsAutoSyncing] = useState(false)
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false)
  const [selectedDesignForTags, setSelectedDesignForTags] = useState<Design | null>(null)
  const [isProjectTagsOpen, setIsProjectTagsOpen] = useState(false)
  const [approvedVariationDraft, setApprovedVariationDraft] = useState(
    (() => {
      const state = (location.state as EditorPageLocationState | null) ?? null
      return state?.approvedVariationDraft ?? null
    })(),
  )

  useEditorGenerationQueue(currentProject?.id)

  const incomingApprovedVariationDraft =
    ((location.state as EditorPageLocationState | null) ?? null)?.approvedVariationDraft ?? null
  const preparedApprovedVariationDraft = useMemo(() => {
    if (!incomingApprovedVariationDraft) {
      return null
    }

    return {
      ...incomingApprovedVariationDraft,
      document: mergeDraftIdentity(
        incomingApprovedVariationDraft.document,
        currentProject,
        brandAssets,
      ),
    }
  }, [brandAssets, currentProject, incomingApprovedVariationDraft])

  const orderedPages = useMemo(
    () => (document ? sortPages(document.design.pages) : []),
    [document],
  )

  useEffect(() => {
    setApprovedVariationDraft(preparedApprovedVariationDraft)
  }, [preparedApprovedVariationDraft])

  useEffect(() => {
    let cancelled = false

    async function loadTemplates() {
      if (!currentProject) {
        setTemplates([])
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)
        const list = await window.electronAPI.konvaTemplates.list(currentProject.id)
        if (cancelled) {
          return
        }

        setTemplates(list)

        if (
          preparedApprovedVariationDraft &&
          preparedApprovedVariationDraft.document.projectId === currentProject.id
        ) {
          resetPagesState()
          setDocument(preparedApprovedVariationDraft.document)
          setSelectedTemplateId(preparedApprovedVariationDraft.document.id)
          return
        }

        if (!list.length) {
          const starter = createStarterDocument(currentProject)
          resetPagesState()
          setDocument(starter)
          setSelectedTemplateId(starter.id)
          return
        }

        const firstTemplate = list[0]
        const nextTemplate =
          (selectedTemplateId &&
            list.find((item: KonvaTemplateDocument) => item.id === selectedTemplateId)) ??
          firstTemplate
        resetPagesState()
        setDocument(nextTemplate)
        setSelectedTemplateId(nextTemplate.id)
      } catch (loadError) {
        console.error('[EditorPage] Falha ao carregar templates Konva:', loadError)
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar templates locais.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadTemplates()

    return () => {
      cancelled = true
    }
  }, [
    currentProject,
    preparedApprovedVariationDraft,
    resetPagesState,
    setDocument,
  ])

  // Helper to find and load a template for a design
  const loadTemplateForDesign = (templateList: KonvaTemplateDocument[], design: Design) => {
    console.log(`[EditorPage] Looking for design: id="${design.id}", name="${design.name}", templateId=${design.templateId}`)

    // Strategy 1: Match by exact page ID
    for (const template of templateList) {
      const page = template.design.pages.find((p) => p.id === design.id)
      if (page) {
        console.log(`[EditorPage] Matched by exact page ID: "${page.id}" in template "${template.name}"`)
        const templateWithCurrentPage: KonvaTemplateDocument = {
          ...template,
          design: {
            ...template.design,
            currentPageId: page.id,
          },
        }
        resetPagesState()
        setDocument(templateWithCurrentPage)
        setSelectedTemplateId(template.id)
        setApprovedVariationDraft(null)
        return true
      }
    }

    // Strategy 2: Match by templateId (meta.remoteId) and page name
    // This handles cases where local page IDs differ from server page IDs
    for (const template of templateList) {
      // Compare as strings to handle number/string mismatch
      const remoteIdMatch = String(template.meta.remoteId) === String(design.templateId)
      if (remoteIdMatch) {
        // Find by exact name match first
        const pageByName = template.design.pages.find((p) => p.name === design.name)
        if (pageByName) {
          console.log(`[EditorPage] Matched by templateId=${design.templateId} and page name="${pageByName.name}"`)
          const templateWithCurrentPage: KonvaTemplateDocument = {
            ...template,
            design: {
              ...template.design,
              currentPageId: pageByName.id,
            },
          }
          resetPagesState()
          setDocument(templateWithCurrentPage)
          setSelectedTemplateId(template.id)
          setApprovedVariationDraft(null)
          return true
        }

        // If no name match and template has multiple pages, log warning and don't auto-select
        if (template.design.pages.length > 1) {
          console.warn(`[EditorPage] Template "${template.name}" has ${template.design.pages.length} pages but no name match for "${design.name}"`)
          // List available pages for debugging
          console.log('[EditorPage] Available pages:', template.design.pages.map(p => p.name).join(', '))
        }

        // Fallback to first page only if template has single page
        if (template.design.pages.length === 1) {
          const page = template.design.pages[0]
          console.log(`[EditorPage] Single-page template, using page="${page.name}"`)
          const templateWithCurrentPage: KonvaTemplateDocument = {
            ...template,
            design: {
              ...template.design,
              currentPageId: page.id,
            },
          }
          resetPagesState()
          setDocument(templateWithCurrentPage)
          setSelectedTemplateId(template.id)
          setApprovedVariationDraft(null)
          return true
        }
      }
    }

    console.log('[EditorPage] No match found in local templates')
    return false
  }

  const handleDesignSelect = async (design: Design) => {
    if (!currentProject) return

    // First, try to find in current templates state
    if (loadTemplateForDesign(templates, design)) {
      return
    }

    // If not found, try to load fresh from local storage
    try {
      const localTemplates: KonvaTemplateDocument[] = await window.electronAPI.konvaTemplates.list(currentProject.id)
      if (loadTemplateForDesign(localTemplates, design)) {
        setTemplates(localTemplates)
        return
      }

      // Not found locally - auto-sync from remote
      setIsAutoSyncing(true)
      toast.info('Sincronizando templates...', { id: 'auto-sync' })

      try {
        await syncPull()

        // After sync, reload templates and try again
        const syncedTemplates: KonvaTemplateDocument[] = await window.electronAPI.konvaTemplates.list(currentProject.id)
        setTemplates(syncedTemplates)

        if (loadTemplateForDesign(syncedTemplates, design)) {
          toast.success('Template sincronizado!', { id: 'auto-sync' })
          return
        }

        toast.error('Design não encontrado.', { id: 'auto-sync' })
      } catch (syncError) {
        console.error('[EditorPage] Falha na sincronização:', syncError)
        toast.error('Falha ao sincronizar.', { id: 'auto-sync' })
      } finally {
        setIsAutoSyncing(false)
      }
    } catch (err) {
      console.error('[EditorPage] Falha ao buscar design:', err)
      toast.error('Falha ao abrir o design.')
    }
  }

  const handleDeleteDesign = async (design: Design) => {
    if (!currentProject) return

    const confirmDelete = window.confirm(`Excluir o template "${design.name}"? Esta ação não pode ser desfeita.`)
    if (!confirmDelete) return

    try {
      // Find the template that contains this design
      for (const template of templates) {
        const pageIndex = template.design.pages.findIndex((p) => p.id === design.id)
        if (pageIndex !== -1) {
          // If template has only one page, delete the entire template
          if (template.design.pages.length === 1) {
            await window.electronAPI.konvaTemplates.delete(currentProject.id, template.id)
            toast.success('Template excluído.')
          } else {
            // Remove just this page from the template
            const updatedTemplate = cloneKonvaDocument(template)
            updatedTemplate.design.pages.splice(pageIndex, 1)
            await window.electronAPI.konvaTemplates.save(currentProject.id, updatedTemplate)
            toast.success('Página excluída do template.')
          }

          // Reload templates
          const list = await window.electronAPI.konvaTemplates.list(currentProject.id)
          setTemplates(list)

          // If the deleted design was selected, load another one
          if (selectedTemplateId === template.id) {
            if (list.length > 0) {
              resetPagesState()
              setDocument(list[0])
              setSelectedTemplateId(list[0].id)
            } else {
              const starter = createStarterDocument(currentProject)
              resetPagesState()
              setDocument(starter)
              setSelectedTemplateId(starter.id)
            }
          }
          return
        }
      }
      toast.error('Design não encontrado.')
    } catch (err) {
      console.error('[EditorPage] Falha ao excluir:', err)
      toast.error('Falha ao excluir o template.')
    }
  }

  const handleManageTags = (design: Design) => {
    setSelectedDesignForTags(design)
    setIsTagsModalOpen(true)
  }

  const handleCreateTemplate = () => {
    const starter = createStarterDocument(currentProject, document?.format ?? 'STORY')
    resetPagesState()
    setDocument(starter)
    setSelectedTemplateId(starter.id)
    setApprovedVariationDraft(null)
    toast.success('Novo documento Konva criado localmente.')
  }

  const handleSave = async () => {
    if (!currentProject || !document) {
      return
    }

    try {
      setIsSaving(true)
      const payload = cloneKonvaDocument(document)
      payload.projectId = currentProject.id
      payload.meta.updatedAt = new Date().toISOString()
      payload.meta.isDirty = false

      await window.electronAPI.konvaTemplates.save(currentProject.id, payload)
      replaceDocumentWithoutHistory(payload)

      const list = await window.electronAPI.konvaTemplates.list(currentProject.id)
      setTemplates(list)
      setSelectedTemplateId(payload.id)
      setApprovedVariationDraft(null)

      // Auto-sync to server after local save
      try {
        await syncPush()
        toast.success(
          approvedVariationDraft
            ? 'Novo template salvo e sincronizado.'
            : 'Template salvo e sincronizado com o servidor.',
        )
      } catch (syncError) {
        console.warn('[EditorPage] Sync failed after save:', syncError)
        toast.success(
          approvedVariationDraft
            ? 'Novo template salvo localmente. Sincronize manualmente.'
            : 'Template salvo localmente. Sincronize manualmente.',
        )
      }
    } catch (saveError) {
      console.error('[EditorPage] Falha ao salvar template:', saveError)
      toast.error('Falha ao salvar template Konva.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleQueueGeneration = (selectedPageIds: string[]) => {
    if (!document) {
      return
    }

    const selectedPages = orderedPages.filter((page) => selectedPageIds.includes(page.id))
    if (!selectedPages.length) {
      toast.error('Selecione pelo menos uma página para gerar.')
      return
    }

    addGenerationJobs(
      selectedPages.map((page) => ({
        documentId: document.id,
        pageId: page.id,
        pageName: page.name,
        format: document.format,
        width: page.width,
        height: page.height,
        pageSnapshot: cloneKonvaDocument(page),
      })),
    )

    toast.info(`${selectedPages.length} página(s) adicionada(s) à fila de exportação.`)
  }

  if (!currentProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Layers3 size={30} className="text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-white">Selecione um projeto para abrir o editor</h2>
        <p className="mt-2 text-center text-white/50">
          O editor Konva usa o projeto atual como contexto para templates locais.
        </p>
        <Link to="/project" className="mt-4 text-primary hover:underline">
          Voltar para Projeto
        </Link>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="flex min-h-full min-w-[1260px] flex-col gap-4 p-4">
        {/* Error message */}
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-white/5 backdrop-blur-sm p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-red-400">
              <AlertTriangle size={18} />
              <span className="text-sm font-medium">{error}</span>
            </div>
          </div>
        )}

        {/* Template Carousel */}
        <div className="relative">
          {(isAutoSyncing || isLoading) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#0a0a0a]/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm font-medium text-white">
                  {isAutoSyncing ? 'Sincronizando...' : 'Carregando...'}
                </p>
              </div>
            </div>
          )}
          <EditorTemplateCarousel
            projectId={currentProject?.id}
            selectedDesignId={document?.design?.currentPageId ?? null}
            onSelectDesign={handleDesignSelect}
            onCreateNew={handleCreateTemplate}
            onDeleteDesign={handleDeleteDesign}
            onManageTags={handleManageTags}
            onManageProjectTags={() => setIsProjectTagsOpen(true)}
          />
        </div>

        {document ? (
          <>
            {approvedVariationDraft ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                      <Sparkles size={16} />
                      Variacao carregada do modo rapido
                    </div>
                    <p className="mt-2 text-sm text-white/80">
                      Ajuste a arte e salve como novo template local quando terminar.
                    </p>
                    <p className="mt-1 text-xs text-white/50">
                      Origem: {approvedVariationDraft.sourceTemplateName || 'Template Konva'} •
                      variacao {approvedVariationDraft.variationIndex + 1}
                    </p>
                    <p className="mt-1 text-xs text-white/50">
                      Prompt: "{approvedVariationDraft.prompt}"
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm px-4 py-3">
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">Nome do documento</span>
                <input
                  type="text"
                  value={document.name}
                  onChange={(event) => setDocumentName(event.target.value)}
                  className="input-field mt-1 h-10"
                />
              </label>
            </div>

            <ScheduledPostsBanner templateId={document.meta.remoteId ?? undefined} />

            <EditorShell
              onSave={handleSave}
              onOpenGenerateArt={() => setIsGenerateModalOpen(true)}
              onSchedule={() => setIsScheduleModalOpen(true)}
              isSaving={isSaving}
              saveLabel={approvedVariationDraft ? 'Salvar como novo template' : 'Salvar template'}
              canSchedule={document.format === 'STORY' && !!document.meta.remoteId}
            />
            <EditorGenerationQueue />
          </>
        ) : null}
      </div>

      {document && currentProject ? (
        <EditorGenerateArtModal
          open={isGenerateModalOpen}
          onClose={() => setIsGenerateModalOpen(false)}
          pages={orderedPages}
          currentPageId={document.design.currentPageId}
          thumbnails={thumbnails}
          onGenerate={handleQueueGeneration}
        />
      ) : null}

      {isScheduleModalOpen && document && currentProject && (
        <QuickScheduleModal
          imageUrl={thumbnails[document.design.currentPageId] ?? ''}
          format={document.format as 'STORY'}
          projectId={currentProject.id}
          onClose={() => setIsScheduleModalOpen(false)}
          pageId={document.design.currentPageId}
          templateId={document.meta.remoteId ?? undefined}
        />
      )}

      <TemplateTagsModal
        isOpen={isTagsModalOpen}
        onClose={() => {
          setIsTagsModalOpen(false)
          setSelectedDesignForTags(null)
        }}
        design={selectedDesignForTags}
        projectId={currentProject?.id}
      />

      {currentProject && (
        <ProjectTagsManager
          projectId={currentProject.id}
          isOpen={isProjectTagsOpen}
          onClose={() => setIsProjectTagsOpen(false)}
        />
      )}
    </div>
  )
}
