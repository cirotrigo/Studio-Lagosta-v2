'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TemplateSelector } from './template-selector'
import { DynamicImageFieldsForm } from './dynamic-image-fields-form'
import { DynamicTextFieldsForm } from './dynamic-text-fields-form'
import { useCreateFromTemplate } from '@/hooks/use-create-from-template'
import { useAutoSaveLayer } from '@/hooks/use-auto-save-layer'
import { useMultiPage } from '@/contexts/multi-page-context'
import { useIsCreativePage } from '@/hooks/use-is-creative-page'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, Sparkles, Check, Image, Type } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import type {
  ImageSource,
} from '@/lib/ai-creative-generator/layout-types'

interface CreativeGeneratorPanelProps {
  projectId: number
  templateId: number
  onLayerUpdate?: (layerId: string, updates: any) => void
}

export function CreativeGeneratorPanel({
  projectId,
  templateId,
  onLayerUpdate,
}: CreativeGeneratorPanelProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { currentPageId, currentPage, setCurrentPageId, savePageLayers } = useMultiPage()
  const { data: creativePageData } = useIsCreativePage(currentPageId)

  // Estados do formulário
  const [selectedTemplatePageId, setSelectedTemplatePageId] = useState<string | null>(null)
  const [selectedTemplatePage, setSelectedTemplatePage] = useState<any>(null)
  const [selectedImages, setSelectedImages] = useState<Record<string, ImageSource>>({})
  const [texts, setTexts] = useState<Record<string, string>>({})

  // Estado de edição ativa
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [layerBindings, setLayerBindings] = useState<Record<string, string>>({})
  const [isCreatingPage, setIsCreatingPage] = useState(false)
  const [isStartingCreation, setIsStartingCreation] = useState(false)

  const createFromTemplate = useCreateFromTemplate(templateId)
  const autoSave = useAutoSaveLayer(editingPageId)

  const isEditing = !!editingPageId
  const isCreativePage = creativePageData?.isCreative ?? false
  const hasLayers = currentPage && currentPage.layers && currentPage.layers.length > 0
  const hasTextLayers = currentPage?.layers?.some((l: any) => l.type === 'text') ?? false

  // Ao trocar de página, detectar se tem conteúdo e carregar textos
  useEffect(() => {
    console.log('[CreativeGenerator] Effect triggered:', {
      currentPageId: currentPage?.id,
      hasLayers,
      hasTextLayers,
      isCreativePage,
      isCreatingPage,
    })

    if (isCreatingPage) {
      console.log('[CreativeGenerator] Page creation in progress, waiting...')
      return
    }

    // Se não há página atual, resetar estado
    if (!currentPage) {
      if (editingPageId || isStartingCreation) {
        console.log('[CreativeGenerator] No current page - resetting state')
        setEditingPageId(null)
        setLayerBindings({})
        setTexts({})
        setSelectedImages({})
        setIsStartingCreation(false)
      }
      return
    }

    // Se página não tem camadas, resetar estado
    if (!hasLayers) {
      if (editingPageId) {
        console.log('[CreativeGenerator] Page has no layers - resetting state')
        setEditingPageId(null)
        setLayerBindings({})
        setTexts({})
        setSelectedImages({})
      }
      // Não resetar isStartingCreation aqui, pois pode estar criando
      return
    }

    // Se página tem camadas, resetar modo de criação
    if (isStartingCreation) {
      console.log('[CreativeGenerator] Page has layers - exiting creation mode')
      setIsStartingCreation(false)
    }

    console.log('[CreativeGenerator] Página com conteúdo detectada:', currentPage.id)

    const bindingsMap: Record<string, string> = {}
    const loadedTexts: Record<string, string> = {}

    // Se for página criativa com bindings, usar os bindings
    if (isCreativePage && creativePageData?.bindings) {
      creativePageData.bindings.forEach((binding: any) => {
        bindingsMap[binding.fieldName] = binding.layerId

        const layer = currentPage.layers.find((l: any) => l.id === binding.layerId)
        if (layer && (layer as any).content) {
          loadedTexts[binding.fieldName] = (layer as any).content
        }
      })
    } else {
      // Caso contrário, mapear todas as camadas de texto E imagem diretamente
      currentPage.layers.forEach((layer: any) => {
        if (layer.type === 'text') {
          bindingsMap[layer.id] = layer.id
          if (layer.content || layer.text) {
            loadedTexts[layer.id] = layer.content || layer.text || ''
          }
        } else if (layer.type === 'image') {
          // Incluir imagens no mapeamento para permitir atualização em tempo real
          bindingsMap[layer.id] = layer.id
        }
      })
    }

    console.log('[CreativeGenerator] Bindings criados:', Object.keys(bindingsMap).length)
    setLayerBindings(bindingsMap)
    setTexts(loadedTexts)
    setEditingPageId(currentPage.id)

    console.log('[CreativeGenerator] Textos carregados:', loadedTexts)
  }, [currentPage?.id, hasLayers, isCreativePage, creativePageData, isCreatingPage])

  async function handleCreatePage() {
    if (!selectedTemplatePage || !selectedTemplatePageId) {
      toast({
        variant: 'destructive',
        description: 'Selecione um template para continuar',
      })
      return
    }

    console.log('[CreativeGenerator] Starting page creation from template...')
    setIsCreatingPage(true)

    try {
      // Se há uma página atual, aplicar template nela ao invés de criar nova
      if (currentPage && currentPageId) {
        console.log('[CreativeGenerator] Applying template to existing page:', currentPageId)

        // Buscar as layers do template
        const templateLayers = selectedTemplatePage.layers || []

        // Aplicar modificações (substituir imagens e textos)
        const modifiedLayers = templateLayers.map((layer: any) => {
          const newLayer = { ...layer }

          // Atualizar textos se fornecidos
          if (layer.type === 'text' && texts[layer.id]) {
            newLayer.content = texts[layer.id]
            newLayer.text = texts[layer.id]
          }

          // Aplicar imagens APENAS em layers dinâmicas
          if (layer.type === 'image' && layer.isDynamic && selectedImages[layer.id]) {
            newLayer.fileUrl = selectedImages[layer.id].url
          }

          return newLayer
        })

        // Aplicar as layers na página atual
        await savePageLayers(currentPageId, modifiedLayers)

        // Ativar modo de edição
        setEditingPageId(currentPageId)

        // Criar mapeamento de layer IDs para TODOS os tipos (texto E imagem)
        const bindingsMap: Record<string, string> = {}
        modifiedLayers.forEach((layer: any) => {
          if (layer.type === 'text' || layer.type === 'image') {
            bindingsMap[layer.id] = layer.id
          }
        })

        console.log('[CreativeGenerator] Created bindings for layers:', Object.keys(bindingsMap).length)
        setLayerBindings(bindingsMap)

        // Recarregar páginas
        await queryClient.refetchQueries({
          queryKey: ['pages', templateId],
        })

        // Resetar modo de criação
        setIsStartingCreation(false)

        toast({
          description: '✨ Template aplicado! Edite os campos abaixo e veja em tempo real no canvas.',
        })
      } else {
        // Criar nova página
        const result = await createFromTemplate.mutateAsync({
          templatePageId: selectedTemplatePageId,
          images: selectedImages,
          texts,
        })

        console.log('[CreativeGenerator] Page created:', result.page)
        console.log('[CreativeGenerator] Page has', result.page.layers.length, 'layers')

        // Ativar modo de edição
        setEditingPageId(result.page.id)

        // Criar mapeamento de layer IDs para TODOS os tipos (texto E imagem)
        const bindingsMap: Record<string, string> = {}

        result.page.layers.forEach((layer: any) => {
          // Mapear textos e imagens
          if (layer.type === 'text' || layer.type === 'image') {
            bindingsMap[layer.id] = layer.id
          }
        })

        console.log('[CreativeGenerator] Created bindings for layers:', Object.keys(bindingsMap).length)
        setLayerBindings(bindingsMap)

        // Aguardar o refetch das páginas completar
        console.log('[CreativeGenerator] Refetching pages...')
        await queryClient.refetchQueries({
          queryKey: ['pages', templateId],
        })

        // Navegar para a página criada
        console.log('[CreativeGenerator] Navigating to page:', result.page.id)
        setCurrentPageId(result.page.id)

        // Resetar modo de criação
        setIsStartingCreation(false)

        toast({
          description: '✨ Criativo gerado! Edite os campos abaixo e veja em tempo real no canvas.',
        })
      }
    } catch (error) {
      console.error('[CreativeGenerator] Erro ao criar página:', error)
      toast({
        variant: 'destructive',
        description: 'Erro ao criar criativo. Tente novamente.',
      })
    } finally {
      setIsCreatingPage(false)
    }
  }

  function handleTextChange(layerId: string, value: string) {
    setTexts((prev) => ({ ...prev, [layerId]: value }))

    // Atualizar layer em tempo real (apenas se estiver editando)
    if (isEditing && layerBindings[layerId]) {
      onLayerUpdate?.(layerBindings[layerId], { content: value })
      autoSave(layerBindings[layerId], { content: value })
    }
  }

  function handleImageChange(layerId: string, imageSource: ImageSource) {
    console.log('[CreativeGenerator] Image changed:', { layerId, url: imageSource.url, isEditing, hasBinding: !!layerBindings[layerId] })
    setSelectedImages((prev) => ({ ...prev, [layerId]: imageSource }))

    // Atualizar layer em tempo real (apenas se estiver editando)
    if (isEditing && layerBindings[layerId]) {
      console.log('[CreativeGenerator] Updating image layer in real-time:', layerBindings[layerId])
      onLayerUpdate?.(layerBindings[layerId], { fileUrl: imageSource.url })
      autoSave(layerBindings[layerId], { fileUrl: imageSource.url })
    } else {
      console.log('[CreativeGenerator] Not updating - isEditing:', isEditing, 'hasBinding:', !!layerBindings[layerId])
    }
  }

  function handleFinalize() {
    console.log('[CreativeGenerator] Finalizing and resetting')
    setEditingPageId(null)
    setLayerBindings({})
    setTexts({})
    setSelectedImages({})
    setSelectedTemplatePageId(null)
    setSelectedTemplatePage(null)
    setIsStartingCreation(false) // Reseta modo de criação

    toast({
      description: '✅ Criativo finalizado! Crie um novo quando quiser.',
    })
  }

  function handleStartCreation() {
    console.log('[CreativeGenerator] Starting creation mode')
    setEditingPageId(null)
    setLayerBindings({})
    setTexts({})
    setSelectedImages({})
    setSelectedTemplatePageId(null)
    setSelectedTemplatePage(null)
    setIsStartingCreation(true) // Ativa modo de criação
  }

  // Se não está editando e não tem página com camadas e não iniciou criação, mostrar botão inicial
  if (!isEditing && !hasLayers && !selectedTemplatePageId && !isStartingCreation) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <Sparkles className="h-16 w-16 text-primary/50 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Editor</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          Crie páginas profissionais em poucos cliques: escolha template, personalize imagens e textos.
        </p>
        <Button type="button" onClick={handleStartCreation} size="lg" className="gap-2">
          <Sparkles className="h-5 w-5" />
          Criar Criativo
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold mb-1">
          {isEditing ? 'Editando Criativo ✨' : 'Novo Criativo ✨'}
        </h2>
        <p className="text-xs text-muted-foreground">
          {isEditing
            ? `Página #${editingPageId?.slice(0, 8)} • Auto-save ativo`
            : 'Preencha os campos abaixo para gerar seu criativo'}
        </p>
      </div>

      {/* Conteúdo principal */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Seleção de Template - Apenas quando criando novo (página vazia OU iniciou criação) */}
        {!isEditing && (isStartingCreation || !hasLayers) && (
          <Card className="p-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">1. Escolha o Template</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Selecione o layout base para seu criativo
                </p>
              </div>
              <TemplateSelector
                templateId={templateId}
                selectedPageId={selectedTemplatePageId}
                onSelect={(pageId, page) => {
                  console.log('[CreativeGenerator] Template selected:', pageId)
                  setSelectedTemplatePageId(pageId)
                  setSelectedTemplatePage(page)
                  setSelectedImages({}) // Reset images when changing template
                  setTexts({}) // Reset texts when changing template
                }}
              />
            </div>
          </Card>
        )}

        {/* Campos de Imagens e Textos organizados com Accordion */}
        {(isEditing || selectedTemplatePage) && (
          <Accordion type="multiple" defaultValue={['texts']} className="space-y-4">
            {/* Seção de Imagens */}
            <AccordionItem value="images" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Image className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Imagens</h3>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <DynamicImageFieldsForm
                  layers={isEditing && currentPage ? currentPage.layers : (selectedTemplatePage?.layers || [])}
                  projectId={projectId}
                  imageValues={selectedImages}
                  onImageChange={handleImageChange}
                />
              </AccordionContent>
            </AccordionItem>

            {/* Seção de Textos */}
            <AccordionItem value="texts" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Type className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Textos</h3>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {isEditing
                      ? 'Edite os textos da página. Todas as alterações são salvas automaticamente.'
                      : 'Personalize os textos. Se deixar vazio, o texto original do template será mantido.'}
                  </p>
                  <DynamicTextFieldsForm
                    layers={isEditing && currentPage ? currentPage.layers : (selectedTemplatePage?.layers || [])}
                    textValues={texts}
                    onTextChange={handleTextChange}
                    onLayerUpdate={onLayerUpdate}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Info de edição em tempo real */}
        {isEditing && (
          <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
            <div className="flex items-start gap-2">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium text-primary">
                  Modo de edição ativo
                </p>
                <p className="text-xs text-primary/80 mt-0.5">
                  Todas as alterações são salvas automaticamente a cada 2 segundos.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer com ações */}
      <div className="p-4 border-t bg-background">
        {!isEditing ? (
          <Button
            type="button"
            onClick={handleCreatePage}
            disabled={!selectedTemplatePageId || isCreatingPage}
            className="w-full"
            size="lg"
          >
            {isCreatingPage ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Criando criativo...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Gerar Criativo
              </>
            )}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleFinalize}
            className="w-full"
            variant="default"
            size="lg"
          >
            <Check className="mr-2 h-5 w-5" />
            Finalizar e Criar Novo
          </Button>
        )}
      </div>
    </div>
  )
}
