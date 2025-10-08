"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getFontManager } from '@/lib/font-manager'
import type { TextPreset, TextPresetElement } from '@/lib/text-presets'
import { clonePreset } from '@/lib/text-presets'
import { useTextPresets } from '@/hooks/use-text-presets'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Save, Sparkles } from 'lucide-react'

/**
 * CustomizePresetDialog - Modal para customizar preset antes de aplicar
 *
 * Funcionalidades:
 * - Editar propriedades de cada elemento
 * - Alterar texto, fonte, tamanho, cor
 * - Preview em tempo real
 * - Salvar como novo preset customizado
 * - Aplicar diretamente
 *
 * @component
 */

interface CustomizePresetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  presetId: string | null
}

export function CustomizePresetDialog({ open, onOpenChange, presetId }: CustomizePresetDialogProps) {
  const { getPresetById, applyPreset, saveCustomPreset, projectId } = useTextPresets()
  const { toast } = useToast()
  const fontManager = React.useMemo(() => getFontManager(), [])

  const [customizedPreset, setCustomizedPreset] = React.useState<TextPreset | null>(null)
  const [presetName, setPresetName] = React.useState('')
  const [isApplying, setIsApplying] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)

  // Carregar preset quando modal abrir
  React.useEffect(() => {
    if (open && presetId) {
      const preset = getPresetById(presetId)
      if (preset) {
        setCustomizedPreset(clonePreset(preset))
        setPresetName(`${preset.name} (Customizado)`)
      }
    }
  }, [open, presetId, getPresetById])

  // Limpar ao fechar
  React.useEffect(() => {
    if (!open) {
      setCustomizedPreset(null)
      setPresetName('')
    }
  }, [open])

  /**
   * Atualizar propriedade de um elemento
   */
  const updateElement = React.useCallback(
    (elementId: string, property: keyof TextPresetElement, value: any) => {
      if (!customizedPreset) return

      setCustomizedPreset((prev) => {
        if (!prev) return null

        return {
          ...prev,
          elements: prev.elements.map((el) =>
            el.id === elementId ? { ...el, [property]: value } : el,
          ),
        }
      })
    },
    [customizedPreset],
  )

  /**
   * Aplicar preset customizado
   */
  const handleApplyCustomized = React.useCallback(async () => {
    if (!customizedPreset) return

    setIsApplying(true)

    try {
      // Criar customizações
      const customizations: Record<string, Partial<TextPresetElement>> = {}
      const originalPreset = getPresetById(customizedPreset.id)

      if (originalPreset) {
        customizedPreset.elements.forEach((element, idx) => {
          customizations[element.id] = element
        })
      }

      await applyPreset(customizedPreset.id, {
        customizations,
        centerOnCanvas: true,
      })

      toast({
        title: '✅ Preset aplicado!',
        description: 'O preset customizado foi adicionado ao canvas.',
      })

      onOpenChange(false)
    } catch (error) {
      console.error('[CustomizePresetDialog] Erro ao aplicar:', error)

      toast({
        title: '❌ Erro ao aplicar',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      })
    } finally {
      setIsApplying(false)
    }
  }, [customizedPreset, getPresetById, applyPreset, toast, onOpenChange])

  /**
   * Salvar como novo preset customizado
   */
  const handleSaveAsCustom = React.useCallback(async () => {
    if (!customizedPreset || !presetName.trim()) {
      toast({
        title: '⚠️ Nome obrigatório',
        description: 'Por favor, digite um nome para o preset.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)

    try {
      const newPresetId = saveCustomPreset(presetName.trim(), {
        name: presetName.trim(),
        description: customizedPreset.description,
        icon: customizedPreset.icon,
        category: 'custom',
        elements: customizedPreset.elements,
        spacing: customizedPreset.spacing,
        alignment: customizedPreset.alignment,
      })

      toast({
        title: '✅ Preset salvo!',
        description: `Preset "${presetName}" foi salvo em "Meus Presets".`,
      })

      onOpenChange(false)
    } catch (error) {
      console.error('[CustomizePresetDialog] Erro ao salvar:', error)

      toast({
        title: '❌ Erro ao salvar',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }, [customizedPreset, presetName, saveCustomPreset, toast, onOpenChange])

  if (!customizedPreset) return null

  const availableFonts = fontManager.getAvailableFonts(projectId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {customizedPreset.icon} Customizar Preset
          </DialogTitle>
          <DialogDescription>
            Personalize os elementos do preset antes de aplicar ou salvar como novo preset.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={customizedPreset.elements[0]?.id} className="w-full">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${customizedPreset.elements.length}, 1fr)` }}>
            {customizedPreset.elements.map((element) => (
              <TabsTrigger key={element.id} value={element.id} className="text-xs">
                {element.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <ScrollArea className="h-[400px] mt-4">
            {customizedPreset.elements.map((element) => (
              <TabsContent key={element.id} value={element.id} className="space-y-4 pr-3">
                {/* Texto */}
                <div className="space-y-2">
                  <Label htmlFor={`text-${element.id}`}>Texto</Label>
                  <Input
                    id={`text-${element.id}`}
                    value={element.text}
                    onChange={(e) => updateElement(element.id, 'text', e.target.value)}
                  />
                </div>

                <Separator />

                {/* Fonte e Tamanho */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`font-${element.id}`}>Fonte</Label>
                    <Select
                      value={element.fontFamily}
                      onValueChange={(value) => updateElement(element.id, 'fontFamily', value)}
                    >
                      <SelectTrigger id={`font-${element.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">
                          Sistema
                        </div>
                        {availableFonts.system.map((font) => (
                          <SelectItem key={font} value={font}>
                            <span style={{ fontFamily: font }}>{font}</span>
                          </SelectItem>
                        ))}
                        {availableFonts.custom.length > 0 && (
                          <>
                            <div className="mt-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">
                              ✨ Minhas Fontes
                            </div>
                            {availableFonts.custom.map((font) => (
                              <SelectItem key={font} value={font}>
                                <span style={{ fontFamily: font }}>{font}</span>
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`size-${element.id}`}>Tamanho</Label>
                    <Input
                      id={`size-${element.id}`}
                      type="number"
                      min={8}
                      max={200}
                      value={element.fontSize}
                      onChange={(e) => updateElement(element.id, 'fontSize', Number(e.target.value))}
                    />
                  </div>
                </div>

                {/* Peso e Estilo */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`weight-${element.id}`}>Peso</Label>
                    <Select
                      value={String(element.fontWeight || 'normal')}
                      onValueChange={(value) => updateElement(element.id, 'fontWeight', value)}
                    >
                      <SelectTrigger id={`weight-${element.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="300">Light (300)</SelectItem>
                        <SelectItem value="normal">Regular (400)</SelectItem>
                        <SelectItem value="500">Medium (500)</SelectItem>
                        <SelectItem value="600">Semi Bold (600)</SelectItem>
                        <SelectItem value="bold">Bold (700)</SelectItem>
                        <SelectItem value="800">Extra Bold (800)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`align-${element.id}`}>Alinhamento</Label>
                    <Select
                      value={element.align}
                      onValueChange={(value) => updateElement(element.id, 'align', value as 'left' | 'center' | 'right')}
                    >
                      <SelectTrigger id={`align-${element.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Esquerda</SelectItem>
                        <SelectItem value="center">Centro</SelectItem>
                        <SelectItem value="right">Direita</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Cor */}
                <div className="space-y-2">
                  <Label htmlFor={`color-${element.id}`}>Cor</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`color-${element.id}`}
                      type="color"
                      value={element.fill}
                      onChange={(e) => updateElement(element.id, 'fill', e.target.value)}
                      className="w-20 h-10 cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={element.fill}
                      onChange={(e) => updateElement(element.id, 'fill', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>

                {/* Line Height e Letter Spacing */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`lineHeight-${element.id}`}>Altura da Linha</Label>
                    <Input
                      id={`lineHeight-${element.id}`}
                      type="number"
                      min={0.5}
                      max={3}
                      step={0.1}
                      value={element.lineHeight}
                      onChange={(e) => updateElement(element.id, 'lineHeight', Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`letterSpacing-${element.id}`}>Espaçamento</Label>
                    <Input
                      id={`letterSpacing-${element.id}`}
                      type="number"
                      min={-10}
                      max={50}
                      value={element.letterSpacing}
                      onChange={(e) => updateElement(element.id, 'letterSpacing', Number(e.target.value))}
                    />
                  </div>
                </div>

                {/* Preview */}
                <div className="mt-4 rounded-md bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                  <div
                    style={{
                      fontFamily: element.fontFamily,
                      fontSize: `${Math.min(element.fontSize / 2, 32)}px`,
                      fontWeight: element.fontWeight,
                      color: element.fill,
                      textAlign: element.align,
                      lineHeight: element.lineHeight,
                      letterSpacing: `${element.letterSpacing}px`,
                    }}
                  >
                    {element.text}
                  </div>
                </div>
              </TabsContent>
            ))}
          </ScrollArea>
        </Tabs>

        <Separator />

        {/* Campo para salvar como novo preset */}
        <div className="space-y-2">
          <Label htmlFor="preset-name">Nome do Preset (para salvar)</Label>
          <Input
            id="preset-name"
            placeholder="Ex: Meu Hero Customizado"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApplying || isSaving}>
            Cancelar
          </Button>

          <Button
            variant="secondary"
            onClick={handleSaveAsCustom}
            disabled={isApplying || isSaving || !presetName.trim()}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar como Preset
              </>
            )}
          </Button>

          <Button onClick={handleApplyCustomized} disabled={isApplying || isSaving}>
            {isApplying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Aplicando...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Aplicar Agora
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
