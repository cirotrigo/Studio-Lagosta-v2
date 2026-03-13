import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, FilePlus2, Layers3, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { EditorGenerateArtModal } from '@/components/editor/EditorGenerateArtModal'
import { EditorGenerationQueue } from '@/components/editor/EditorGenerationQueue'
import { EditorShell } from '@/components/editor/EditorShell'
import { TagFilterBar } from '@/components/editor/TagFilterBar'
import { FilteredPagesGallery } from '@/components/editor/FilteredPagesGallery'
import { DesignsGallery } from '@/components/editor/DesignsGallery'
import { TemplateTagsModal } from '@/components/editor/TemplateTagsModal'
import { ProjectTagsManager } from '@/components/editor/ProjectTagsManager'
import { createStarterDocument, cloneKonvaDocument, sortPages } from '@/lib/editor/document'
import { mergeEditorFontSources } from '@/lib/editor/font-utils'
import { normalizeKonvaTextValue } from '@/lib/editor/text-normalization'
import { useEditorGenerationQueue } from '@/hooks/use-editor-generation-queue'
import { useBrandAssets, type BrandAssets } from '@/hooks/use-brand-assets'
import { useProjectTags } from '@/hooks/use-project-tags'
import { useProjectStore } from '@/stores/project.store'
import { useEditorStore } from '@/stores/editor.store'
import { useEditorGenerationStore } from '@/stores/editor-generation.store'
import { usePagesStore } from '@/stores/pages.store'
import type { EditorPageLocationState } from '@/types/art-automation'
import type { KonvaPage, KonvaTemplateDocument } from '@/types/template'
import type { Design, DesignFormat } from '@/hooks/use-project-designs'

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

  // Sync project tags to store when project changes
  useProjectTags(currentProject?.id)
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
  const [isTagsManagerOpen, setIsTagsManagerOpen] = useState(false)
  const [isDesignTagsModalOpen, setIsDesignTagsModalOpen] = useState(false)
  const [selectedDesignForTags, setSelectedDesignForTags] = useState<Design | null>(null)
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>(['Template'])
  const [selectedFormat, setSelectedFormat] = useState<DesignFormat | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState('')
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

  const templateOptions = useMemo(() => {
    const seen = new Set<string>()
    const options: KonvaTemplateDocument[] = []

    if (document && !seen.has(document.id)) {
      seen.add(document.id)
      options.push(document)
    }

    for (const template of templates) {
      if (!seen.has(template.id)) {
        seen.add(template.id)
        options.push(template)
      }
    }

    return options
  }, [document, templates])
  const currentTemplateOption = useMemo(
    () => templateOptions.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templateOptions],
  )
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

  const handleTemplateSelect = async (templateId: string) => {
    if (!currentProject) {
      return
    }

    if (!templateId) {
      return
    }

    try {
      const template = await window.electronAPI.konvaTemplates.get(currentProject.id, templateId)
      if (!template) {
        toast.error('Template não encontrado no storage local.')
        return
      }

      resetPagesState()
      setDocument(template)
      setSelectedTemplateId(template.id)
      setApprovedVariationDraft(null)
    } catch (selectError) {
      console.error('[EditorPage] Falha ao abrir template:', selectError)
      toast.error('Não foi possível abrir o template selecionado.')
    }
  }

  const handlePageSelectFromGallery = (template: KonvaTemplateDocument, page: KonvaPage) => {
    // Set the template and navigate to the specific page
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
  }

  const handleDesignSelect = async (design: Design) => {
    if (!currentProject) return

    // Find the local template that contains this design (page)
    // Design.id is the page ID, we need to find it in local templates
    for (const template of templates) {
      const page = template.design.pages.find((p) => p.id === design.id)
      if (page) {
        handlePageSelectFromGallery(template, page)
        return
      }
    }

    // If not found in local templates, try to load from storage using templateId
    try {
      const localTemplates: KonvaTemplateDocument[] = await window.electronAPI.konvaTemplates.list(currentProject.id)
      for (const template of localTemplates) {
        const page = template.design.pages.find((p: KonvaPage) => p.id === design.id)
        if (page) {
          handlePageSelectFromGallery(template, page)
          setTemplates(localTemplates)
          return
        }
      }
      toast.error('Design nao encontrado no storage local. Sincronize os templates.')
    } catch (err) {
      console.error('[EditorPage] Falha ao buscar design:', err)
      toast.error('Falha ao abrir o design selecionado.')
    }
  }

  const handleDesignManageTags = (design: Design) => {
    setSelectedDesignForTags(design)
    setIsDesignTagsModalOpen(true)
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
      toast.success(
        approvedVariationDraft
          ? 'Novo template salvo a partir da variacao do modo rapido.'
          : 'Template salvo no storage local.',
      )
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
        <h2 className="text-xl font-semibold text-text">Selecione um projeto para abrir o editor</h2>
        <p className="mt-2 text-center text-text-muted">
          O editor Konva usa o projeto atual como contexto para templates locais.
        </p>
        <Link to="/project" className="mt-4 text-primary hover:underline">
          Voltar para Projeto
        </Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-text-muted">Carregando editor Konva...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg rounded-2xl border border-error/30 bg-card/80 p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
            <AlertTriangle size={22} className="text-error" />
          </div>
          <h2 className="text-lg font-semibold text-text">Falha ao carregar o editor</h2>
          <p className="mt-2 text-sm text-text-muted">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="flex min-h-full min-w-[1260px] flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card/60 px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold text-text">Editor Konva</h1>
            <p className="mt-1 text-sm text-text-muted">
              Stage real com JSON v2, propriedades, layers e persistência local via IPC.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={currentTemplateOption?.id ?? selectedTemplateId}
              onChange={(event) => void handleTemplateSelect(event.target.value)}
              className="h-10 min-w-[260px] rounded-xl border border-border bg-input px-3 text-sm text-text focus:border-primary focus:outline-none"
            >
              {templateOptions.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleCreateTemplate}
              className="h-10 shrink-0 rounded-xl border border-border px-3 text-sm text-text transition-colors hover:border-primary/40"
            >
              <span className="inline-flex items-center gap-2">
                <FilePlus2 size={16} />
                Novo template
              </span>
            </button>
          </div>
        </div>

        {/* Tag Filter Bar */}
        <TagFilterBar
          selectedTags={selectedFilterTags}
          onTagsChange={setSelectedFilterTags}
          selectedFormat={selectedFormat}
          onFormatChange={setSelectedFormat}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onManageTags={() => setIsTagsManagerOpen(true)}
          showFormatFilter
          showSearch
        />

        {/* Designs Gallery (API) */}
        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">
              Designs {selectedFilterTags.length > 0 ? `(${selectedFilterTags.join(', ')})` : '(Todos)'}
            </h2>
            <p className="text-xs text-text-muted">
              Clique em um design para abrir no editor
            </p>
          </div>
          <DesignsGallery
            projectId={currentProject?.id}
            selectedTags={selectedFilterTags}
            format={selectedFormat}
            search={searchQuery}
            onDesignSelect={handleDesignSelect}
            onDesignEdit={handleDesignSelect}
            onDesignManageTags={handleDesignManageTags}
          />
        </div>

        {/* Local Templates Gallery (legacy - filtro por tags local) */}
        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">
              Templates Locais {selectedFilterTags.length > 0 ? `(${selectedFilterTags.join(', ')})` : '(Todos)'}
            </h2>
            <p className="text-xs text-text-muted">
              Paginas do storage local do Electron
            </p>
          </div>
          <FilteredPagesGallery
            templates={templates}
            selectedTags={selectedFilterTags}
            onPageSelect={handlePageSelectFromGallery}
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
                    <p className="mt-2 text-sm text-text">
                      Ajuste a arte e salve como novo template local quando terminar.
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Origem: {approvedVariationDraft.sourceTemplateName || 'Template Konva'} •
                      variacao {approvedVariationDraft.variationIndex + 1}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Prompt: "{approvedVariationDraft.prompt}"
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="shrink-0 rounded-2xl border border-border bg-card/60 px-4 py-3">
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">Nome do documento</span>
                <input
                  type="text"
                  value={document.name}
                  onChange={(event) => setDocumentName(event.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-input px-3 text-sm text-text focus:border-primary focus:outline-none"
                />
              </label>
            </div>

            <EditorShell
              onSave={handleSave}
              onOpenGenerateArt={() => setIsGenerateModalOpen(true)}
              isSaving={isSaving}
              saveLabel={approvedVariationDraft ? 'Salvar como novo template' : 'Salvar template'}
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

      {currentProject ? (
        <ProjectTagsManager
          projectId={currentProject.id}
          isOpen={isTagsManagerOpen}
          onClose={() => setIsTagsManagerOpen(false)}
        />
      ) : null}

      <TemplateTagsModal
        isOpen={isDesignTagsModalOpen}
        onClose={() => {
          setIsDesignTagsModalOpen(false)
          setSelectedDesignForTags(null)
        }}
        design={selectedDesignForTags}
        projectId={currentProject?.id}
      />
    </div>
  )
}
