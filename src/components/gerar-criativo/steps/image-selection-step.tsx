'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useGerarCriativo } from '../gerar-criativo-context'
import { useStepper } from '../stepper'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronLeft, ChevronRight, X, Sparkles, Upload, FolderOpen, ImageIcon, Loader2 } from 'lucide-react'
import { GenerateImageModal } from '../components/generate-image-modal'
import { ImageGalleryTab } from '../components/image-gallery-tab'
import { ImageUploadTab } from '../components/image-upload-tab'
import { GoogleDriveTab } from '@/components/ai-creative-generator/tabs/google-drive-tab'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'
import {
  useGerarCriativoQuickGenerate,
  type QuickGenerateResponse,
} from '@/hooks/use-gerar-criativo-quick-generate'
import { toast } from 'sonner'

export function ImageSelectionStep() {
  const {
    selectedProjectId,
    selectedModelPageId,
    layers,
    imageValues,
    textValues,
    setImageValue,
    setImageValuesBulk,
    setTextValuesBulk,
  } = useGerarCriativo()
  const stepper = useStepper()
  const queryClient = useQueryClient()
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false)
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null)
  const [copyPrompt, setCopyPrompt] = useState('')
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(true)
  const [analyzeImageForContext, setAnalyzeImageForContext] = useState(true)
  const [tone, setTone] = useState<'casual' | 'profissional' | 'urgente' | 'inspirador' | 'none'>('none')
  const [objective, setObjective] = useState<'promocao' | 'institucional' | 'agenda' | 'oferta' | 'none'>('none')
  const [lastQuickGenerateResult, setLastQuickGenerateResult] = useState<QuickGenerateResponse | null>(null)
  const quickGenerate = useGerarCriativoQuickGenerate()

  const dynamicImageLayers = layers.filter(
    (layer) => layer.type === 'image' && layer.isDynamic === true
  )
  const dynamicTextLayers = layers.filter(
    (layer) => (layer.type === 'text' || layer.type === 'rich-text') && layer.isDynamic === true
  )

  const allLayersHaveImages = dynamicImageLayers.every((layer) => imageValues[layer.id])
  const firstSelectedImageUrl = Object.values(imageValues)[0]?.url
  const hasPrefilledTexts = dynamicTextLayers.some((layer) => Boolean(textValues[layer.id]?.trim()))

  const handleGenerateComplete = async (aiImage: { id: string; fileUrl: string }) => {
    await queryClient.invalidateQueries({
      queryKey: ['project-images', selectedProjectId],
    })

    if (activeLayerId) {
      setImageValue(activeLayerId, {
        type: 'ai-gallery',
        url: aiImage.fileUrl,
        aiImageId: aiImage.id,
      })
    }

    setIsGenerateModalOpen(false)
    setActiveLayerId(null)
  }

  const handleImageSelected = (layerId: string, imageSource: ImageSource) => {
    setImageValue(layerId, imageSource)
  }

  const handleQuickGenerateCreative = async () => {
    if (!selectedModelPageId) {
      toast.error('Selecione uma pagina modelo antes de gerar a arte')
      return
    }

    if (!copyPrompt.trim()) {
      toast.error('Digite um brief para gerar a arte')
      return
    }

    if (analyzeImageForContext && !firstSelectedImageUrl) {
      toast.info('Nenhuma imagem selecionada ainda. A copy sera gerada sem analise visual contextual.')
    }

    try {
      const result = await quickGenerate.mutateAsync({
        modelPageId: selectedModelPageId,
        prompt: copyPrompt.trim(),
        useKnowledgeBase,
        analyzeImageForContext: analyzeImageForContext && Boolean(firstSelectedImageUrl),
        photoUrl: analyzeImageForContext ? firstSelectedImageUrl : undefined,
        tone: tone === 'none' ? null : tone,
        objective: objective === 'none' ? null : objective,
      })
      setLastQuickGenerateResult(result)

      if (Object.keys(result.textValues).length > 0) {
        setTextValuesBulk(result.textValues)
      }

      if (Object.keys(result.imageValues).length > 0) {
        setImageValuesBulk(result.imageValues)
      }

      if (result.generatedImage && selectedProjectId) {
        await queryClient.invalidateQueries({
          queryKey: ['project-images', selectedProjectId],
        })
      }

      const mergedImageValues = {
        ...imageValues,
        ...result.imageValues,
      }
      const quickGenerateWarnings = [...result.warnings]
      const copyWarnings = 'warnings' in result.copyResult ? result.copyResult.warnings : []
      const warningMessages = [...quickGenerateWarnings, ...copyWarnings]

      const allImagesReadyAfterQuickGenerate = dynamicImageLayers.every(
        (layer) => Boolean(mergedImageValues[layer.id]),
      )

      if (warningMessages.length > 0) {
        toast.success('Arte preenchida com avisos. Revise em Ajustes.')
        if (allImagesReadyAfterQuickGenerate) {
          stepper.next()
        }
        return
      }

      toast.success(
        result.generatedImage
          ? 'Arte rapida preenchida com copy e imagem.'
          : 'Copy preenchida automaticamente no template.',
      )

      if (allImagesReadyAfterQuickGenerate) {
        stepper.next()
      }
    } catch (error) {
      console.error('[ImageSelectionStep] Quick generate error:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar arte rapida')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => stepper.prev()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Escolha as Imagens</h2>
            <p className="text-sm text-muted-foreground">
              Selecione ou gere imagens para cada campo dinamico
            </p>
          </div>
        </div>
        <Button onClick={() => stepper.next()} disabled={!allLayersHaveImages} size="sm">
          Continuar
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {dynamicTextLayers.length > 0 && (
        <Card className="p-4 space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Preencher textos com IA</h3>
            <p className="text-sm text-muted-foreground">
              Gere uma primeira versao da copy e uma imagem IA para o template. Depois voce revisa tudo em Ajustes.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-copy-prompt">Brief da arte</Label>
            <Textarea
              id="quick-copy-prompt"
              value={copyPrompt}
              onChange={(event) => setCopyPrompt(event.target.value)}
              placeholder="Ex: destaque o hamburguer artesanal com cheddar e uma chamada para pedir hoje"
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-1 pr-4">
                <p className="text-sm font-medium">Usar base de conhecimento</p>
                <p className="text-xs text-muted-foreground">
                  Busca contexto do projeto antes de escrever a copy.
                </p>
              </div>
              <Switch checked={useKnowledgeBase} onCheckedChange={setUseKnowledgeBase} />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-1 pr-4">
                <p className="text-sm font-medium">Analisar imagem para contexto</p>
                <p className="text-xs text-muted-foreground">
                  Usa a primeira imagem selecionada para enriquecer a copy quando disponivel.
                </p>
              </div>
              <Switch checked={analyzeImageForContext} onCheckedChange={setAnalyzeImageForContext} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tom</Label>
              <Select value={tone} onValueChange={(value) => setTone(value as typeof tone)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar tom" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem preferencia</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="profissional">Profissional</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="inspirador">Inspirador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Objetivo</Label>
              <Select value={objective} onValueChange={(value) => setObjective(value as typeof objective)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar objetivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem preferencia</SelectItem>
                  <SelectItem value="promocao">Promocao</SelectItem>
                  <SelectItem value="institucional">Institucional</SelectItem>
                  <SelectItem value="agenda">Agenda</SelectItem>
                  <SelectItem value="oferta">Oferta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {lastQuickGenerateResult && 'variacoes' in lastQuickGenerateResult.copyResult && (
            <details className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
              <summary className="cursor-pointer font-medium">Ver dados usados</summary>
              <div className="mt-3 space-y-3 text-xs text-muted-foreground">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Prompt</p>
                  <p>{copyPrompt || '-'}</p>
                </div>

                <div className="space-y-1">
                  <p className="font-medium text-foreground">Analise da imagem</p>
                  <p>Ativada: {lastQuickGenerateResult.copyResult.imageAnalysis.requested ? 'sim' : 'nao'}</p>
                  <p>Aplicada: {lastQuickGenerateResult.copyResult.imageAnalysis.applied ? 'sim' : 'nao'}</p>
                  <p>Imagem usada: {lastQuickGenerateResult.copyResult.imageAnalysis.sourceImageUrl || 'nenhuma'}</p>
                  <p>Descricao da imagem: {lastQuickGenerateResult.copyResult.imageAnalysis.summary || 'sem descricao'}</p>
                  <p>Cena: {lastQuickGenerateResult.copyResult.imageAnalysis.sceneType || 'nao identificada'}</p>
                  <p>Familia da bebida/produto: {lastQuickGenerateResult.copyResult.imageAnalysis.beverageFamily || 'nao identificada'}</p>
                  <p>Rotulo visivel: {lastQuickGenerateResult.copyResult.imageAnalysis.labelTextHints.join(', ') || 'nenhum'}</p>
                  <p>Pistas do produto: {lastQuickGenerateResult.copyResult.imageAnalysis.productClues.join(', ') || 'nenhuma'}</p>
                  <p>Confianca: {lastQuickGenerateResult.copyResult.imageAnalysis.confidence}</p>
                  {lastQuickGenerateResult.copyResult.imageAnalysis.warnings.length > 0 && (
                    <p>Avisos: {lastQuickGenerateResult.copyResult.imageAnalysis.warnings.join(' | ')}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="font-medium text-foreground">Base de conhecimento</p>
                  <p>Aplicada: {lastQuickGenerateResult.copyResult.knowledge.applied ? 'sim' : 'nao'}</p>
                  <p>Entradas usadas: {lastQuickGenerateResult.copyResult.knowledge.hits.length}</p>
                </div>
              </div>
            </details>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {hasPrefilledTexts
                ? 'Ha textos preenchidos no template. Uma nova geracao ira sobrescrever os campos mapeados.'
                : `A IA vai preencher ${dynamicTextLayers.length} campo(s) de texto dinamico(s).`}
            </div>
            <Button
              onClick={handleQuickGenerateCreative}
              disabled={quickGenerate.isPending || !copyPrompt.trim()}
            >
              {quickGenerate.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando arte...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar arte rapida
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-6">
        {dynamicImageLayers.map((layer) => (
          <Card key={layer.id} className="p-4">
            <div className="flex items-center justify-between mb-4">
              <Label className="font-medium">{layer.name}</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveLayerId(layer.id)
                  setIsGenerateModalOpen(true)
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Gerar com IA
              </Button>
            </div>

            <Tabs defaultValue="gallery" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="gallery">
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Galeria
                </TabsTrigger>
                <TabsTrigger value="drive">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Drive
                </TabsTrigger>
                <TabsTrigger value="upload">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </TabsTrigger>
              </TabsList>

              <TabsContent value="gallery" className="mt-4">
                <ImageGalleryTab
                  projectId={selectedProjectId!}
                  onImageSelected={(url, aiImageId) =>
                    handleImageSelected(layer.id, {
                      type: 'ai-gallery',
                      url,
                      aiImageId,
                    })
                  }
                />
              </TabsContent>

              <TabsContent value="drive" className="mt-4">
                <GoogleDriveTab
                  projectId={selectedProjectId!}
                  onImageSelected={(imageSource) =>
                    handleImageSelected(layer.id, imageSource)
                  }
                />
              </TabsContent>

              <TabsContent value="upload" className="mt-4">
                <ImageUploadTab
                  projectId={selectedProjectId!}
                  onImageSelected={(url, pathname) =>
                    handleImageSelected(layer.id, {
                      type: 'local-upload',
                      url,
                      pathname,
                    })
                  }
                />
              </TabsContent>
            </Tabs>

            {imageValues[layer.id] && (
              <div className="mt-4 flex items-center gap-3 p-2 bg-muted rounded">
                <img
                  src={imageValues[layer.id].url}
                  alt="Preview"
                  className="w-16 h-16 rounded object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">Imagem selecionada</p>
                  <p className="text-xs text-muted-foreground">
                    {imageValues[layer.id].type === 'ai-gallery'
                      ? 'Da galeria'
                      : imageValues[layer.id].type === 'local-upload'
                        ? 'Upload'
                        : 'Google Drive'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setImageValue(layer.id, null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={() => stepper.next()} disabled={!allLayersHaveImages}>
          Continuar
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      <GenerateImageModal
        open={isGenerateModalOpen}
        onOpenChange={setIsGenerateModalOpen}
        projectId={selectedProjectId!}
        onComplete={handleGenerateComplete}
      />
    </div>
  )
}
