'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Stepper, type Step } from './stepper'
import { TemplateSelector } from './template-selector'
import { ImageSourceTabs } from './image-source-tabs'
import { DynamicTextFieldsForm } from './dynamic-text-fields-form'
import { useCreateFromTemplate } from '@/hooks/use-create-from-template'
import { useAutoSaveLayer } from '@/hooks/use-auto-save-layer'
import { useMultiPage } from '@/contexts/multi-page-context'
import { useIsCreativePage } from '@/hooks/use-is-creative-page'
import { Button } from '@/components/ui/button'
import { Loader2, ChevronLeft, Check, Sparkles } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type {
  ImageSource,
} from '@/lib/ai-creative-generator/layout-types'

interface CreativeGeneratorPanelProps {
  projectId: number
  templateId: number
  onLayerUpdate?: (layerId: string, updates: any) => void
}

const STEPS: Step[] = [
  { id: 1, title: 'Modelo', description: 'Escolha o modelo' },
  { id: 2, title: 'Imagem', description: 'Selecione a foto' },
  { id: 3, title: 'Edição', description: 'Personalize em tempo real' },
]

export function CreativeGeneratorPanel({
  projectId,
  templateId,
  onLayerUpdate,
}: CreativeGeneratorPanelProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { currentPageId, currentPage, setCurrentPageId } = useMultiPage()
  const { data: creativePageData } = useIsCreativePage(currentPageId)

  // Estados do formulário
  const [selectedTemplatePageId, setSelectedTemplatePageId] = useState<string | null>(null)
  const [selectedTemplatePage, setSelectedTemplatePage] = useState<any>(null)
  const [selectedImage, setSelectedImage] = useState<ImageSource | null>(null)
  const [texts, setTexts] = useState<Record<string, string>>({})

  // Estado de edição ativa
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [layerBindings, setLayerBindings] = useState<Record<string, string>>({})

  // Estado de navegação
  const [currentStep, setCurrentStep] = useState(0)
  const [isCreatingPage, setIsCreatingPage] = useState(false)
  const [wizardActive, setWizardActive] = useState(false) // Flag para controlar se wizard foi iniciado

  const createFromTemplate = useCreateFromTemplate(templateId)
  const autoSave = useAutoSaveLayer(editingPageId)

  const isEditing = !!editingPageId
  const isCreativePage = creativePageData?.isCreative ?? false

  // Validação de etapas
  const canGoToStep2 = !!selectedTemplatePageId && !!selectedTemplatePage
  const canGoToStep3 = !!selectedImage

  // Ao trocar de página, detectar se é criativa e carregar textos
  useEffect(() => {
    console.log('[CreativeGenerator] Effect triggered:', {
      currentPageId: currentPage?.id,
      isCreativePage,
      hasBindings: !!creativePageData?.bindings,
      bindingsCount: creativePageData?.bindings?.length,
      isCreatingPage,
    })

    // Se estamos criando página, aguardar o currentPage ficar disponível
    if (isCreatingPage) {
      console.log('[CreativeGenerator] Page creation in progress, waiting...')
      return
    }

    if (!currentPage || !isCreativePage || !creativePageData?.bindings) {
      // Se não é página criativa, resetar estado
      if (!isCreativePage && editingPageId) {
        console.log('[CreativeGenerator] Resetting state - not a creative page')
        setEditingPageId(null)
        setLayerBindings({})
        setTexts({})
        setCurrentStep(0)
        setWizardActive(false)
      }
      return
    }

    console.log('[CreativeGenerator] Página criativa detectada:', currentPage.id)

    const bindingsMap: Record<string, string> = {}
    const loadedTexts: Record<string, string> = {}

    // Mapear bindings
    creativePageData.bindings.forEach((binding: any) => {
      bindingsMap[binding.fieldName] = binding.layerId

      // Buscar layer correspondente
      const layer = currentPage.layers.find((l: any) => l.id === binding.layerId)
      if (layer && (layer as any).content) {
        loadedTexts[binding.fieldName] = (layer as any).content
      }
    })

    setLayerBindings(bindingsMap)
    setTexts(loadedTexts)
    setEditingPageId(currentPage.id)

    // Ir direto para Step 3 (edição) em páginas criativas
    setCurrentStep(2)
    setWizardActive(false) // Não está no wizard de criação, está editando

    console.log('[CreativeGenerator] Textos carregados:', loadedTexts)
  }, [currentPage?.id, isCreativePage, creativePageData, isCreatingPage])

  async function handleCreatePageAndAdvance() {
    if (!selectedImage || !selectedTemplatePage || !selectedTemplatePageId) return

    console.log('[CreativeGenerator] Starting page creation from template...')
    setIsCreatingPage(true)

    try {
      // Usar o novo endpoint para criar página a partir do modelo
      const result = await createFromTemplate.mutateAsync({
        templatePageId: selectedTemplatePageId,
        imageSource: selectedImage,
        texts,
      })

      console.log('[CreativeGenerator] Page created:', result.page)
      console.log('[CreativeGenerator] Page has', result.page.layers.length, 'layers')

      // Log image layer
      const imageLayer = result.page.layers.find((layer: any) => layer.type === 'image')
      if (imageLayer) {
        console.log('[CreativeGenerator] Image layer:', imageLayer.id, 'fileUrl:', imageLayer.fileUrl)
      } else {
        console.warn('[CreativeGenerator] No image layer found in created page!')
      }

      // Ativar modo de edição
      setEditingPageId(result.page.id)

      // Criar mapeamento de layer IDs para texts
      const textLayers = result.page.layers.filter((layer: any) => layer.type === 'text')
      const bindingsMap: Record<string, string> = {}

      textLayers.forEach((layer: any) => {
        bindingsMap[layer.id] = layer.id
      })

      setLayerBindings(bindingsMap)

      // Avançar para etapa 3 e desativar wizard (agora está em modo edição)
      setCurrentStep(2)
      setWizardActive(false)

      // Aguardar o refetch das páginas completar
      console.log('[CreativeGenerator] Refetching pages...')
      await queryClient.refetchQueries({
        queryKey: ['pages', templateId],
      })

      // Navegar para a página criada
      console.log('[CreativeGenerator] Navigating to page:', result.page.id)
      setCurrentPageId(result.page.id)

      toast({
        description: '✨ Criativo gerado! Edite os textos abaixo e veja em tempo real no canvas.',
      })
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

  function handleTextChange(field: string, value: string) {
    setTexts((prev) => ({ ...prev, [field]: value }))

    // Atualizar layer em tempo real (apenas se estiver editando)
    if (isEditing && layerBindings[field]) {
      onLayerUpdate?.(layerBindings[field], { content: value })
      autoSave(layerBindings[field], { content: value })
    }
  }

  function handleImageChange(newImageSource: ImageSource) {
    setSelectedImage(newImageSource)

    // Atualizar background layer em tempo real (apenas se estiver editando)
    if (isEditing && layerBindings.background) {
      onLayerUpdate?.(layerBindings.background, { fileUrl: newImageSource.url })
      autoSave(layerBindings.background, { fileUrl: newImageSource.url })
    }
  }

  function handleFinalize() {
    setEditingPageId(null)
    setLayerBindings({})
    setTexts({})
    setSelectedImage(null)
    setCurrentStep(0)
    setWizardActive(false)

    toast({
      description: '✅ Criativo finalizado! Crie um novo quando quiser.',
    })
  }

  function handlePrevious() {
    if (currentStep > 0 && !isEditing) {
      setCurrentStep(currentStep - 1)
    }
  }

  async function handleNext() {
    if (currentStep === 0 && canGoToStep2) {
      setCurrentStep(1)
    } else if (currentStep === 1 && canGoToStep3) {
      // Ao avançar da etapa 2 para 3, criar a página automaticamente
      await handleCreatePageAndAdvance()
    }
  }

  function handleStepClick(stepIndex: number) {
    // Não permitir navegação quando está editando ou criando
    if (isEditing || isCreatingPage) return

    // Permitir navegar apenas para etapas anteriores
    if (stepIndex < currentStep) {
      setCurrentStep(stepIndex)
    } else if (stepIndex === 1 && canGoToStep2) {
      setCurrentStep(1)
    }
  }

  // Função para iniciar criação de nova página
  function handleStartCreation() {
    setWizardActive(true) // Ativar wizard
    setCurrentStep(0) // Começar no Step 1 (escolha de modelo)
    setEditingPageId(null)
    setLayerBindings({})
    setTexts({})
    setSelectedImage(null)
    setSelectedTemplatePageId(null)
    setSelectedTemplatePage(null)
  }

  // Se a página atual não é criativa e não está editando e não iniciou o wizard, mostrar botão
  if (!isCreativePage && !editingPageId && !isCreatingPage && !wizardActive) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <Sparkles className="h-16 w-16 text-primary/50 mb-4" />
        <h3 className="text-lg font-semibold mb-2">Gerador de Criativos IA</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          Crie páginas profissionais em 3 passos: escolha layout, selecione imagem e personalize textos em tempo real.
        </p>
        <Button type="button" onClick={handleStartCreation} size="lg" className="gap-2">
          <Sparkles className="h-5 w-5" />
          Criar Nova Página Criativa
        </Button>
        <p className="text-xs text-muted-foreground mt-6 max-w-xs">
          Esta página não foi criada pelo gerador. Para editar páginas criativas, selecione-as no preview acima.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold mb-1">
          {isEditing ? 'Editando Criativo ✨' : 'Gerador de Criativo ✨'}
        </h2>
        <p className="text-xs text-muted-foreground">
          {isEditing
            ? `Página #${editingPageId?.slice(0, 8)} • Auto-save ativo`
            : 'Crie criativos profissionais em 3 passos'}
        </p>
      </div>

      {/* Stepper */}
      <div className="p-4 border-b bg-muted/30">
        <Stepper
          steps={STEPS}
          currentStep={currentStep}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Conteúdo das etapas */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Etapa 1: Layout */}
        {currentStep === 0 && !isEditing && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div>
              <h3 className="text-sm font-semibold mb-1">Escolha o Modelo</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Selecione um modelo para personalizar
              </p>
            </div>
            <TemplateSelector
              templateId={templateId}
              selectedPageId={selectedTemplatePageId}
              onSelect={(pageId, page) => {
                setSelectedTemplatePageId(pageId)
                setSelectedTemplatePage(page)
              }}
            />
          </div>
        )}

        {/* Etapa 2: Imagem */}
        {currentStep === 1 && !isEditing && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div>
              <h3 className="text-sm font-semibold mb-1">Escolha a Imagem</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Gere com IA, selecione do Drive ou use da galeria
              </p>
            </div>
            <ImageSourceTabs
              projectId={projectId}
              onImageSelected={handleImageChange}
            />
            {selectedImage && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-xs text-green-700 dark:text-green-400 font-medium">
                  ✓ Imagem selecionada
                </p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                  Clique em "Próximo" para criar o criativo e editar em tempo real
                </p>
              </div>
            )}
          </div>
        )}

        {/* Etapa 3: Edição em Tempo Real */}
        {currentStep === 2 && isEditing && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <div className="flex items-start gap-2">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-primary">
                    Modo de edição ativo
                  </p>
                  <p className="text-xs text-primary/80 mt-0.5">
                    Preencha os campos abaixo e veja as mudanças no canvas em
                    tempo real. Auto-save a cada 2 segundos.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">
                Personalize os Textos
              </h3>
              <DynamicTextFieldsForm
                layers={selectedTemplatePage?.layers || currentPage?.layers || []}
                textValues={texts}
                onTextChange={(layerId, value) => {
                  setTexts(prev => ({ ...prev, [layerId]: value }))
                  handleTextChange(layerId, value)
                }}
                onLayerUpdate={onLayerUpdate}
              />
            </div>

            <div className="pt-2">
              <h3 className="text-sm font-semibold mb-3">Trocar Imagem</h3>
              <ImageSourceTabs
                projectId={projectId}
                onImageSelected={handleImageChange}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer com navegação */}
      <div className="p-4 border-t bg-background">
        {!isEditing ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              {/* Botão Voltar */}
              {currentStep > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrevious}
                  className="flex-1"
                  disabled={isCreatingPage}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Voltar
                </Button>
              )}

              {/* Botão Próximo */}
              <Button
                type="button"
                onClick={handleNext}
                disabled={
                  (currentStep === 0 && !canGoToStep2) ||
                  (currentStep === 1 && !canGoToStep3) ||
                  isCreatingPage
                }
                className="flex-1"
              >
                {isCreatingPage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando página...
                  </>
                ) : currentStep === 1 ? (
                  <>
                    Criar e Editar
                    <Sparkles className="ml-1 h-4 w-4" />
                  </>
                ) : (
                  'Próximo'
                )}
              </Button>
            </div>

            {/* Mensagens de validação */}
            {currentStep === 0 && !canGoToStep2 && (
              <p className="text-xs text-muted-foreground text-center">
                Selecione um layout para continuar
              </p>
            )}
            {currentStep === 1 && !canGoToStep3 && (
              <p className="text-xs text-muted-foreground text-center">
                Selecione uma imagem para continuar
              </p>
            )}
          </div>
        ) : (
          <Button
            type="button"
            onClick={handleFinalize}
            className="w-full"
            variant="default"
          >
            <Check className="mr-2 h-4 w-4" />
            Finalizar e Criar Novo
          </Button>
        )}
      </div>
    </div>
  )
}
