"use client"

import * as React from 'react'
import { TemplateEditorProvider, TemplateResource, useTemplateEditor } from '@/contexts/template-editor-context'
import type { TemplateDto } from '@/hooks/use-template'
import { useUpdateTemplateWithThumbnail } from '@/hooks/use-template'
import { useToast } from '@/hooks/use-toast'
import { usePageConfig } from '@/hooks/use-page-config'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Save, Download, Maximize2, FileText, Image as ImageIcon, Type as TypeIcon, Square, Upload, Layers2, Award, Palette, Sparkles, Settings } from 'lucide-react'
import { EditorCanvas } from './editor-canvas'
import { PropertiesPanel } from './properties-panel'
import { CanvasPreview } from './canvas-preview'
import { EditorSidebar } from './sidebar/editor-sidebar'
import { TextToolsPanel } from './panels/text-panel'
import { ImagesPanelContent } from './panels/images-panel'
import { ElementsPanelContent } from './panels/elements-panel'
import { LogoPanelContent } from './panels/logo-panel'
import { ColorsPanelContent } from './panels/colors-panel'
import { LayersPanelAdvanced } from './layers-panel-advanced'
import { GradientsPanel } from './sidebar/gradients-panel'
import { getFontManager } from '@/lib/font-manager'

interface TemplateEditorShellProps {
  template: TemplateDto
}

export function TemplateEditorShell({ template }: TemplateEditorShellProps) {
  const [fontsLoaded, setFontsLoaded] = React.useState(false)
  const fontManager = React.useMemo(() => getFontManager(), [])

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

  // Carregar todas as fontes customizadas ANTES de renderizar o editor
  React.useEffect(() => {
    async function preloadFonts() {
      try {
        console.log('🔤 [TemplateEditorShell] Pré-carregando fontes do projeto...')

        // 1. Carregar fontes do localStorage
        const localFonts = fontManager.getCustomFonts()
        console.log(`📦 ${localFonts.length} fontes no localStorage`)

        // 2. Buscar e carregar fontes do banco de dados
        if (template.projectId) {
          const response = await fetch(`/api/projects/${template.projectId}/fonts`)
          if (response.ok) {
            const dbFonts = await response.json()
            console.log(`📦 ${dbFonts.length} fontes no banco de dados`)

            // Carregar fontes do banco no font-manager
            await fontManager.loadDatabaseFonts(dbFonts)
          }
        }

        // 3. Verificar todas as fontes usadas no template e garantir que estão carregadas
        const allFonts = fontManager.getCustomFonts()
        console.log(`✅ Total de ${allFonts.length} fontes disponíveis`)

        // 4. Para cada fonte, forçar document.fonts.load() para garantir disponibilidade no Konva
        for (const font of allFonts) {
          if (typeof document !== 'undefined' && 'fonts' in document) {
            try {
              await document.fonts.load(`16px '${font.family}'`)
              console.log(`✅ Fonte "${font.family}" pronta para uso no Konva`)
            } catch (error) {
              console.warn(`⚠️ Erro ao pré-carregar fonte "${font.family}":`, error)
            }
          }
        }

        // 5. Aguardar um frame adicional para garantir que tudo foi processado
        await new Promise(resolve => requestAnimationFrame(resolve))

        console.log('✅ [TemplateEditorShell] Todas as fontes pré-carregadas!')
        setFontsLoaded(true)
      } catch (error) {
        console.error('❌ [TemplateEditorShell] Erro ao pré-carregar fontes:', error)
        // Continuar mesmo se houver erro
        setFontsLoaded(true)
      }
    }

    preloadFonts()
  }, [fontManager, template.projectId])

  // Mostrar loading enquanto fontes carregam
  if (!fontsLoaded) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="text-sm text-muted-foreground">Carregando fontes customizadas...</p>
        </div>
      </div>
    )
  }

  return (
    <TemplateEditorProvider template={resource}>
      <TemplateEditorContent />
    </TemplateEditorProvider>
  )
}

type SidePanel = 'templates' | 'text' | 'images' | 'elements' | 'logo' | 'colors' | 'gradients' | 'properties' | 'layers' | null

function TemplateEditorContent() {
  const { toast } = useToast()
  const { mutateAsync: updateTemplate, isPending: isSaving } = useUpdateTemplateWithThumbnail()
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
    generateThumbnail,
    exportDesign,
    isExporting,
    projectId,
  } = useTemplateEditor()

  const [activePanel, setActivePanel] = React.useState<SidePanel>(null)

  usePageConfig(
    `${name || 'Editor de Template'}`,
    'Monte e ajuste o layout visual do template com preview em tempo real.',
    [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projetos', href: '/projects' },
      { label: `Projeto`, href: `/projects/${projectId}` },
      { label: name || 'Editor' },
    ],
  )

  const handleSave = React.useCallback(async () => {
    // Mostrar feedback de que está gerando thumbnail
    const loadingToast = toast({
      title: 'Salvando template...',
      description: 'Gerando thumbnail e salvando alterações.',
    })

    try {
      // Gerar thumbnail do canvas atual
      const thumbnailUrl = await generateThumbnail(300)

      const payload = {
        id: templateId,
        data: {
          name,
          designData: design,
          dynamicFields,
          thumbnailUrl: thumbnailUrl || undefined,
        },
      }
      const saved = await updateTemplate(payload)
      markSaved(saved)

      // Remover toast de loading
      loadingToast.dismiss?.()

      toast({
        title: 'Template salvo com sucesso!',
        description: thumbnailUrl
          ? 'Thumbnail gerado e alterações aplicadas.'
          : 'Alterações aplicadas (thumbnail não pôde ser gerado).',
      })
    } catch (error) {
      console.error('[TemplateEditor] Falha ao salvar template', error)

      // Remover toast de loading
      loadingToast.dismiss?.()

      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o template. Tente novamente.',
        variant: 'destructive',
      })
    }
  }, [templateId, name, design, dynamicFields, generateThumbnail, updateTemplate, markSaved, toast])

  const handleExport = React.useCallback(async () => {
    try {
      await exportDesign('jpeg')
      toast({
        title: 'Exportação concluída!',
        description: 'O arquivo JPEG foi baixado com sucesso.',
      })
    } catch (error) {
      console.error('Export failed:', error)
      toast({
        title: 'Erro ao exportar',
        description: error instanceof Error ? error.message : 'Não foi possível exportar o design.',
        variant: 'destructive',
      })
    }
  }, [exportDesign, toast])

  const togglePanel = React.useCallback((panel: SidePanel) => {
    setActivePanel((current) => (current === panel ? null : panel))
  }, [])

  return (
    <div className="polotno-editor flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-background">
      {/* Top Toolbar - Polotno Style */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border/40 bg-card px-4 shadow-sm">
        {/* Left: Logo + Template Name */}
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <Input
            className="h-8 w-64 border-0 bg-transparent text-sm font-medium focus-visible:ring-0"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome do template"
          />
          {dirty && <span className="text-xs text-orange-500">● Não salvo</span>}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleSave} disabled={isSaving || !dirty}>
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button size="sm" onClick={handleExport} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          <Button size="sm" variant="outline">
            <Maximize2 className="mr-2 h-4 w-4" />
            Resize
          </Button>
        </div>
      </header>

      {/* Main Area: Vertical Toolbar + Side Panel + Canvas */}
      <div className="flex flex-1 overflow-hidden">
        {/* Vertical Icon Toolbar - Always Visible */}
        <aside className="flex w-16 flex-shrink-0 flex-col border-r border-border/40 bg-card">
          <ToolbarButton
            icon={<Layers2 className="h-5 w-5" />}
            label="Layers"
            active={activePanel === 'layers'}
            onClick={() => togglePanel('layers')}
          />
          <ToolbarButton
            icon={<TypeIcon className="h-5 w-5" />}
            label="Texto"
            active={activePanel === 'text'}
            onClick={() => togglePanel('text')}
          />
          <ToolbarButton
            icon={<ImageIcon className="h-5 w-5" />}
            label="Imagens"
            active={activePanel === 'images'}
            onClick={() => togglePanel('images')}
          />
          <ToolbarButton
            icon={<Square className="h-5 w-5" />}
            label="Elementos"
            active={activePanel === 'elements'}
            onClick={() => togglePanel('elements')}
          />
          <ToolbarButton
            icon={<Award className="h-5 w-5" />}
            label="Logo"
            active={activePanel === 'logo'}
            onClick={() => togglePanel('logo')}
          />
          <ToolbarButton
            icon={<Palette className="h-5 w-5" />}
            label="Cores"
            active={activePanel === 'colors'}
            onClick={() => togglePanel('colors')}
          />
          <ToolbarButton
            icon={<Sparkles className="h-5 w-5" />}
            label="Gradientes"
            active={activePanel === 'gradients'}
            onClick={() => togglePanel('gradients')}
          />
          <div className="flex-1" />
          <ToolbarButton
            icon={<FileText className="h-5 w-5" />}
            label="Templates"
            active={activePanel === 'templates'}
            onClick={() => togglePanel('templates')}
          />
          <ToolbarButton
            icon={<Settings className="h-5 w-5" />}
            label="Propriedades"
            active={activePanel === 'properties'}
            onClick={() => togglePanel('properties')}
          />
        </aside>

        {/* Expandable Side Panel */}
        {activePanel && (
          <aside className={`flex flex-shrink-0 flex-col border-r border-border/40 bg-card shadow-lg ${
            activePanel === 'layers' ? 'w-[420px]' : 'w-80'
          }`}>
            <div className="border-b border-border/40 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {activePanel === 'templates' && 'Templates'}
                {activePanel === 'text' && 'Texto & Fontes'}
                {activePanel === 'images' && 'Imagens'}
                {activePanel === 'elements' && 'Elementos'}
                {activePanel === 'logo' && 'Logo da Marca'}
                {activePanel === 'colors' && 'Cores da Marca'}
                {activePanel === 'gradients' && 'Gradientes'}
                {activePanel === 'properties' && 'Propriedades'}
                {activePanel === 'layers' && 'Camadas'}
              </h2>
            </div>
            <div className={`flex-1 overflow-hidden ${activePanel === 'layers' || activePanel === 'properties' ? '' : 'overflow-y-auto p-4'}`}>
              {activePanel === 'templates' && <EditorSidebar />}
              {activePanel === 'text' && <TextToolsPanel />}
              {activePanel === 'images' && <ImagesPanelContent />}
              {activePanel === 'elements' && <ElementsPanelContent />}
              {activePanel === 'logo' && <LogoPanelContent />}
              {activePanel === 'colors' && <ColorsPanelContent />}
              {activePanel === 'gradients' && <GradientsPanel />}
              {activePanel === 'properties' && <PropertiesPanel />}
              {activePanel === 'layers' && <LayersPanelAdvanced />}
            </div>
          </aside>
        )}

        {/* Canvas Area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <EditorCanvas />
          </div>

          {/* Bottom Pages Bar - Polotno Style */}
          <div className="flex h-24 flex-shrink-0 items-center gap-2 border-t border-border/40 bg-card px-4">
            <div className="flex flex-1 items-center gap-2 overflow-x-auto">
              <div className="flex h-16 w-16 flex-shrink-0 cursor-pointer items-center justify-center rounded border-2 border-primary bg-primary/10">
                <span className="text-xs font-semibold">1</span>
              </div>
              <button className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded border border-dashed border-border/60 hover:border-primary hover:bg-muted/50">
                <span className="text-2xl text-muted-foreground">+</span>
              </button>
            </div>
            <CanvasPreview />
          </div>
        </main>
      </div>
    </div>
  )
}

interface ToolbarButtonProps {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}

function ToolbarButton({ icon, label, active, onClick }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex h-16 w-full flex-col items-center justify-center gap-1 border-b border-border/40 transition-colors ${
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      }`}
      title={label}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
      {active && <div className="absolute left-0 top-0 h-full w-1 bg-primary" />}
    </button>
  )
}
