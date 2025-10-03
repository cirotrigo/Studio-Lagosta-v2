"use client"

import * as React from 'react'
import { TemplateEditorProvider, TemplateResource, useTemplateEditor } from '@/contexts/template-editor-context'
import type { TemplateDto } from '@/hooks/use-template'
import { useUpdateTemplate } from '@/hooks/use-template'
import { useToast } from '@/hooks/use-toast'
import { usePageConfig } from '@/hooks/use-page-config'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EditorToolbar } from './editor-toolbar'
import { EditorCanvas } from './editor-canvas'
import { PropertiesPanel } from './properties-panel'
import { CanvasPreview } from './canvas-preview'
import { EditorSidebar } from './sidebar/editor-sidebar'
import { LayersDock } from './layers-dock'
import { Separator } from '@/components/ui/separator'

interface TemplateEditorShellProps {
  template: TemplateDto
}

export function TemplateEditorShell({ template }: TemplateEditorShellProps) {
  const resource: TemplateResource = {
    id: template.id,
    name: template.name,
    type: template.type,
    dimensions: template.dimensions,
    designData: template.designData,
    dynamicFields: template.dynamicFields,
    projectId: template.projectId,
    updatedAt: template.updatedAt,
  }

  return (
    <TemplateEditorProvider template={resource}>
      <TemplateEditorContent />
    </TemplateEditorProvider>
  )
}

function TemplateEditorContent() {
  const { toast } = useToast()
  const { mutateAsync: updateTemplate, isPending: isSaving } = useUpdateTemplate()
  const {
    templateId,
    name,
    setName,
    type,
    dimensions,
    design,
    dynamicFields,
    markSaved,
    dirty,
  } = useTemplateEditor()

  usePageConfig(
    `${name || 'Editor de Template'}`,
    'Monte e ajuste o layout visual do template com preview em tempo real.',
    [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Templates', href: '/dashboard?tab=templates' },
      { label: name || 'Editor' },
    ],
  )

  const handleSave = React.useCallback(async () => {
    try {
      const payload = {
        id: templateId,
        data: {
          name,
          designData: design,
          dynamicFields,
        },
      }
      const saved = await updateTemplate(payload)
      markSaved(saved)
      toast({
        title: 'Template salvo',
        description: 'As alterações foram aplicadas com sucesso.',
      })
    } catch (error) {
      console.error('[TemplateEditor] Falha ao salvar template', error)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o template. Tente novamente.',
        variant: 'destructive',
      })
    }
  }, [templateId, name, design, dynamicFields, updateTemplate, markSaved, toast])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="max-w-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome do template"
            />
            <Badge variant="secondary">{type}</Badge>
            <Badge variant="outline">{dimensions}</Badge>
            {dirty && <Badge variant="destructive">Alterações não salvas</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Ajuste o layout, propriedades e hierarquia das camadas. Utilize o preview para garantir consistência com a renderização final.
          </p>
        </div>
      </div>

      <EditorToolbar onSave={handleSave} saving={isSaving} />

      <div className="grid gap-4 2xl:grid-cols-[320px_minmax(0,1fr)_340px] xl:grid-cols-[300px_minmax(0,1fr)_320px] lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <EditorSidebar />
        <div className="flex min-h-[600px] flex-col gap-4">
          <EditorCanvas />
          <CanvasPreview />
          <LayersDock />
        </div>
        <PropertiesPanel />
      </div>

      <Separator />
      <div className="rounded-lg border border-border/40 bg-muted/30 p-4 text-xs text-muted-foreground">
        <p>
          <strong>Dica:</strong> salve as alterações com frequência. O preview utiliza o mesmo motor de renderização do backend
          garantindo consistência entre o que você vê e o que será gerado.
        </p>
      </div>
    </div>
  )
}
