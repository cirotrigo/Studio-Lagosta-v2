"use client"

import * as React from 'react'
import { createPortal } from 'react-dom'
import { TemplateEditorProvider, TemplateResource, useTemplateEditor } from '@/contexts/template-editor-context'
import { MultiPageProvider, useMultiPage } from '@/contexts/multi-page-context'
import type { TemplateDto } from '@/hooks/use-template'
import { useUpdateTemplateWithThumbnail } from '@/hooks/use-template'
import { useToast } from '@/hooks/use-toast'
import { usePageConfig } from '@/hooks/use-page-config'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Save, Download, Maximize2, Minimize2, FileText, Image as ImageIcon, Type as TypeIcon, Square, Upload, Layers2, Award, Palette, Sparkles, Settings, Copy, Trash2, Plus, ChevronLeft, ChevronRight, Wand2, ChevronDown, ChevronUp, FileImage } from 'lucide-react'
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
import { AIImagesPanel } from './sidebar/ai-images-panel'
import { CreativesPanel } from './panels/creatives-panel'
import { getFontManager } from '@/lib/font-manager'
import { useCreatePage, useDuplicatePage, useDeletePage } from '@/hooks/use-pages'
import { PageSyncWrapper } from './page-sync-wrapper'

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
        console.log(`🔤 [TemplateEditorShell] Pré-carregando fontes do projeto ${template.projectId}...`)

        // 1. Carregar fontes do localStorage (filtradas por projeto)
        const localFonts = fontManager.getCustomFonts(template.projectId)
        console.log(`📦 ${localFonts.length} fontes no localStorage para projeto ${template.projectId}`)

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

        // 3. Verificar todas as fontes usadas no template e garantir que estão carregadas (filtradas por projeto)
        const allFonts = fontManager.getCustomFonts(template.projectId)
        console.log(`✅ Total de ${allFonts.length} fontes disponíveis para projeto ${template.projectId}`)

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
    <MultiPageProvider templateId={template.id}>
      <TemplateEditorProvider template={resource}>
        <PageSyncWrapper>
          <TemplateEditorContent />
        </PageSyncWrapper>
      </TemplateEditorProvider>
    </MultiPageProvider>
  )
}

type SidePanel = 'templates' | 'text' | 'images' | 'elements' | 'logo' | 'colors' | 'gradients' | 'properties' | 'layers' | 'ai-images' | 'creatives' | null

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
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [isPagesBarCollapsed, setIsPagesBarCollapsed] = React.useState(false)

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

      console.log('[TemplateEditor] Salvando template com design:', JSON.stringify(design, null, 2))

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
        title: 'Criativo salvo com sucesso!',
        description: 'O criativo foi salvo e está disponível na biblioteca.',
      })
    } catch (error) {
      console.error('Export failed:', error)
      toast({
        title: 'Erro ao salvar criativo',
        description: error instanceof Error ? error.message : 'Não foi possível salvar o criativo.',
        variant: 'destructive',
      })
    }
  }, [exportDesign, toast])

  const togglePanel = React.useCallback((panel: SidePanel) => {
    setActivePanel((current) => (current === panel ? null : panel))
  }, [])

  const toggleFullscreen = React.useCallback(() => {
    setIsFullscreen((prev) => !prev)
    if (!isFullscreen) {
      setActivePanel(null) // Fechar painel lateral ao entrar em fullscreen
    }
  }, [isFullscreen])

  // Efeito para esconder body scroll quando em fullscreen
  React.useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  }, [isFullscreen])

  const editorContent = (
    <div className={`polotno-editor flex overflow-hidden bg-background ${isFullscreen ? 'h-screen w-screen' : 'h-[calc(100vh-4rem)]'} flex-col`}>
      {/* Top Toolbar - Polotno Style */}
      <header className={`flex h-14 flex-shrink-0 items-center justify-between border-b border-border/40 bg-card px-4 shadow-sm ${isFullscreen ? 'hidden' : ''}`}>
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
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Salvando...' : dirty ? 'Salvar Template' : 'Salvo'}
          </Button>
          <Button size="sm" onClick={handleExport} disabled={isExporting}>
            <Save className="mr-2 h-4 w-4" />
            {isExporting ? 'Salvando...' : 'Salvar Criativo'}
          </Button>
          <Button size="sm" variant="outline" onClick={toggleFullscreen}>
            <Maximize2 className="mr-2 h-4 w-4" />
            Tela Cheia
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
          <ToolbarButton
            icon={<Wand2 className="h-5 w-5" />}
            label="IA ✨"
            active={activePanel === 'ai-images'}
            onClick={() => togglePanel('ai-images')}
          />
          <ToolbarButton
            icon={<FileImage className="h-5 w-5" />}
            label="Criativos"
            active={activePanel === 'creatives'}
            onClick={() => togglePanel('creatives')}
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
                {activePanel === 'ai-images' && 'Imagens IA ✨'}
                {activePanel === 'creatives' && 'Criativos'}
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
              {activePanel === 'ai-images' && <AIImagesPanel />}
              {activePanel === 'creatives' && <CreativesPanel templateId={templateId} />}
              {activePanel === 'properties' && <PropertiesPanel />}
              {activePanel === 'layers' && <LayersPanelAdvanced />}
            </div>
          </aside>
        )}

        {/* Canvas Area */}
        <main className="flex flex-1 flex-col relative h-full">
          {/* Fullscreen Exit Button */}
          {isFullscreen && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleFullscreen}
              className="absolute top-4 right-4 z-50 shadow-lg"
            >
              <Minimize2 className="mr-2 h-4 w-4" />
              Sair da Tela Cheia
            </Button>
          )}

          <div className="flex-1 h-full overflow-hidden">
            <EditorCanvas />
          </div>

          {/* Bottom Pages Bar - Polotno Style */}
          <PagesBar isCollapsed={isPagesBarCollapsed} onToggleCollapse={() => setIsPagesBarCollapsed(!isPagesBarCollapsed)} />
        </main>
      </div>
    </div>
  )

  // Se estiver em fullscreen, renderizar em portal direto no body
  if (isFullscreen && typeof window !== 'undefined') {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-background">
        {editorContent}
      </div>,
      document.body
    )
  }

  return editorContent
}

// Componente de barra de páginas
interface PagesBarProps {
  isCollapsed: boolean
  onToggleCollapse: () => void
}

function PagesBar({ isCollapsed, onToggleCollapse }: PagesBarProps) {
  const { toast } = useToast()
  const { templateId, design } = useTemplateEditor()
  const { pages, currentPageId, setCurrentPageId } = useMultiPage()
  const createPageMutation = useCreatePage()
  const duplicatePageMutation = useDuplicatePage()
  const deletePageMutation = useDeletePage()

  // Ordenar páginas por order
  const sortedPages = React.useMemo(() => {
    return [...pages].sort((a, b) => a.order - b.order)
  }, [pages])

  const handleAddPage = React.useCallback(async () => {
    try {
      console.log('[PagesBar] Criando nova página...', {
        templateId,
        pagesCount: pages.length,
        canvasWidth: design.canvas.width,
        canvasHeight: design.canvas.height,
      })

      const pageData = {
        name: `Página ${pages.length + 1}`,
        width: design.canvas.width || 1080,
        height: design.canvas.height || 1920,
        layers: [],
        background: design.canvas.backgroundColor || '#ffffff',
        order: pages.length,
      }

      console.log('[PagesBar] Dados da página:', pageData)

      const newPage = await createPageMutation.mutateAsync({
        templateId,
        data: pageData,
      })

      console.log('[PagesBar] Página criada com sucesso:', newPage)

      // Selecionar nova página
      if (newPage && typeof newPage === 'object' && 'id' in newPage) {
        setCurrentPageId(newPage.id as string)
      }

      toast({
        title: 'Página criada!',
        description: 'Nova página adicionada ao template.',
      })
    } catch (error) {
      console.error('[PagesBar] Erro ao criar página:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
      toast({
        title: 'Erro ao criar página',
        description: errorMessage,
        variant: 'destructive',
      })
    }
  }, [templateId, pages.length, design, createPageMutation, setCurrentPageId, toast])

  const handleDuplicatePage = React.useCallback(
    async (pageId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await duplicatePageMutation.mutateAsync({ templateId, pageId })
        toast({
          title: 'Página duplicada!',
          description: 'A página foi duplicada com sucesso.',
        })
      } catch (error) {
        console.error('Error duplicating page:', error)
        toast({
          title: 'Erro ao duplicar',
          description: 'Não foi possível duplicar a página.',
          variant: 'destructive',
        })
      }
    },
    [templateId, duplicatePageMutation, toast]
  )

  const handleDeletePage = React.useCallback(
    async (pageId: string, e: React.MouseEvent) => {
      e.stopPropagation()

      if (pages.length <= 1) {
        toast({
          title: 'Ação não permitida',
          description: 'Não é possível deletar a última página.',
          variant: 'destructive',
        })
        return
      }

      try {
        await deletePageMutation.mutateAsync({ templateId, pageId })

        // Se deletou a página atual, navegar para a primeira
        if (pageId === currentPageId && sortedPages.length > 0) {
          const nextPage = sortedPages[0].id === pageId ? sortedPages[1] : sortedPages[0]
          if (nextPage) {
            setCurrentPageId(nextPage.id)
          }
        }

        toast({
          title: 'Página deletada!',
          description: 'A página foi removida com sucesso.',
        })
      } catch (error) {
        console.error('Error deleting page:', error)
        toast({
          title: 'Erro ao deletar',
          description: 'Não foi possível deletar a página.',
          variant: 'destructive',
        })
      }
    },
    [templateId, pages.length, currentPageId, sortedPages, deletePageMutation, setCurrentPageId, toast]
  )

  // Atalhos de teclado para navegação
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+PageUp - Página anterior
      if (e.ctrlKey && e.key === 'PageUp') {
        e.preventDefault()
        const currentIndex = sortedPages.findIndex((p) => p.id === currentPageId)
        if (currentIndex > 0) {
          setCurrentPageId(sortedPages[currentIndex - 1].id)
        }
      }

      // Ctrl+PageDown - Próxima página
      if (e.ctrlKey && e.key === 'PageDown') {
        e.preventDefault()
        const currentIndex = sortedPages.findIndex((p) => p.id === currentPageId)
        if (currentIndex < sortedPages.length - 1) {
          setCurrentPageId(sortedPages[currentIndex + 1].id)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sortedPages, currentPageId, setCurrentPageId])

  return (
    <div className={`flex flex-shrink-0 flex-col border-t border-border/40 bg-card transition-all ${
      isCollapsed ? 'h-10' : 'h-32'
    }`}>
      {/* Estado colapsado - apenas contador e botão de expandir */}
      {isCollapsed ? (
        <div className="flex h-10 items-center justify-between px-4">
          <span className="text-xs text-muted-foreground">
            Página {sortedPages.findIndex((p) => p.id === currentPageId) + 1} de {sortedPages.length}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleCollapse}
            className="h-7 w-7 p-0"
            title="Expandir barra de páginas"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          {/* Controles de navegação e ações */}
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
            <div className="flex items-center gap-2">
              {/* Navegação anterior/próxima */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const currentIndex = sortedPages.findIndex((p) => p.id === currentPageId)
                  if (currentIndex > 0) {
                    setCurrentPageId(sortedPages[currentIndex - 1].id)
                  }
                }}
                disabled={sortedPages.findIndex((p) => p.id === currentPageId) === 0}
                className="h-8 w-8 p-0"
                title="Página anterior (Ctrl+PageUp)"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <span className="text-xs text-muted-foreground">
                {sortedPages.findIndex((p) => p.id === currentPageId) + 1} / {sortedPages.length}
              </span>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const currentIndex = sortedPages.findIndex((p) => p.id === currentPageId)
                  if (currentIndex < sortedPages.length - 1) {
                    setCurrentPageId(sortedPages[currentIndex + 1].id)
                  }
                }}
                disabled={sortedPages.findIndex((p) => p.id === currentPageId) === sortedPages.length - 1}
                className="h-8 w-8 p-0"
                title="Próxima página (Ctrl+PageDown)"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

              {/* Botão de colapsar */}
              <Button
                size="sm"
                variant="ghost"
                onClick={onToggleCollapse}
                className="ml-2 h-8 w-8 p-0"
                title="Ocultar barra de páginas"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

            {/* Ações da página atual */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  if (currentPageId) {
                    handleDuplicatePage(currentPageId, e)
                  }
                }}
                className="h-8"
                title="Duplicar página"
              >
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicar
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  if (currentPageId) {
                    handleDeletePage(currentPageId, e)
                  }
                }}
                disabled={pages.length <= 1}
                className="h-8"
                title="Deletar página"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Deletar
              </Button>

              <Button
                size="sm"
                variant="default"
                onClick={handleAddPage}
                className="h-8"
                title="Adicionar nova página"
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Nova Página
              </Button>
            </div>
          </div>

          {/* Miniaturas das páginas */}
          <div className="flex flex-1 items-center gap-3 overflow-x-auto px-4 py-2">
            {sortedPages.map((page, index) => (
              <div
                key={page.id}
                onClick={() => setCurrentPageId(page.id)}
                className={`group relative flex flex-shrink-0 cursor-pointer flex-col items-center gap-1 transition-all ${
                  currentPageId === page.id ? 'scale-105' : 'hover:scale-102'
                }`}
              >
                {/* Miniatura */}
                <div
                  className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded border-2 transition-all ${
                    currentPageId === page.id
                      ? 'border-primary shadow-md'
                      : 'border-border/60 hover:border-primary/60'
                  }`}
                >
                  {page.thumbnail ? (
                    <img src={page.thumbnail} alt={page.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted/50">
                      <span className="text-xs font-semibold text-muted-foreground">{index + 1}</span>
                    </div>
                  )}
                </div>

                {/* Label */}
                <span
                  className={`text-[10px] transition-colors ${
                    currentPageId === page.id ? 'font-semibold text-primary' : 'text-muted-foreground'
                  }`}
                >
                  Pág. {index + 1}
                </span>
              </div>
            ))}

            {/* Botão para adicionar página */}
            <button
              onClick={handleAddPage}
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded border-2 border-dashed border-border/60 transition-all hover:border-primary hover:bg-primary/5"
              title="Adicionar nova página"
            >
              <Plus className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </>
      )}
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
