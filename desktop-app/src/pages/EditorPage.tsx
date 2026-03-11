import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FilePlus2, Layers3 } from 'lucide-react'
import { toast } from 'sonner'
import { EditorShell } from '@/components/editor/EditorShell'
import { createStarterDocument, cloneKonvaDocument } from '@/lib/editor/document'
import { useProjectStore } from '@/stores/project.store'
import { useEditorStore } from '@/stores/editor.store'
import { usePagesStore } from '@/stores/pages.store'
import type { KonvaTemplateDocument } from '@/types/template'

export default function EditorPage() {
  const currentProject = useProjectStore((state) => state.currentProject)
  const document = useEditorStore((state) => state.document)
  const setDocument = useEditorStore((state) => state.setDocument)
  const setDocumentName = useEditorStore((state) => state.setDocumentName)
  const replaceDocumentWithoutHistory = useEditorStore((state) => state.replaceDocumentWithoutHistory)
  const resetPagesState = usePagesStore((state) => state.reset)

  const [templates, setTemplates] = useState<KonvaTemplateDocument[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentTemplateOption = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  )

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
  }, [currentProject, setDocument, resetPagesState])

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
    } catch (selectError) {
      console.error('[EditorPage] Falha ao abrir template:', selectError)
      toast.error('Não foi possível abrir o template selecionado.')
    }
  }

  const handleCreateTemplate = () => {
    const starter = createStarterDocument(currentProject, document?.format ?? 'STORY')
    resetPagesState()
    setDocument(starter)
    setSelectedTemplateId(starter.id)
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
      toast.success('Template salvo no storage local.')
    } catch (saveError) {
      console.error('[EditorPage] Falha ao salvar template:', saveError)
      toast.error('Falha ao salvar template Konva.')
    } finally {
      setIsSaving(false)
    }
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
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-4">
        <div>
          <h1 className="text-xl font-semibold text-text">Editor Konva</h1>
          <p className="mt-1 text-sm text-text-muted">
            Stage real com JSON v2, propriedades, layers e persistência local via IPC.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={currentTemplateOption?.id ?? selectedTemplateId}
            onChange={(event) => void handleTemplateSelect(event.target.value)}
            className="min-w-72 rounded-xl border border-border bg-input px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
          >
            {(templates.length ? templates : document ? [document] : []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleCreateTemplate}
            className="rounded-xl border border-border px-3 py-2 text-sm text-text hover:border-primary/40"
          >
            <span className="inline-flex items-center gap-2">
              <FilePlus2 size={16} />
              Novo template
            </span>
          </button>
        </div>
      </div>

      {document ? (
        <>
          <div className="rounded-2xl border border-border bg-card/60 px-4 py-3">
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">Nome do documento</span>
              <input
                type="text"
                value={document.name}
                onChange={(event) => setDocumentName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </label>
          </div>

          <EditorShell onSave={handleSave} isSaving={isSaving} />
        </>
      ) : null}
    </div>
  )
}
