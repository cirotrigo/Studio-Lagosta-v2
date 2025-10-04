"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useTextPresets } from '@/hooks/use-text-presets'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Sparkles, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TextPreset } from '@/lib/text-presets'

/**
 * TextPresetsPanel - Painel de presets de texto profissionais
 *
 * Funcionalidades:
 * - Grid de cards com presets built-in
 * - Aplicação com 1 clique
 * - Preview visual com ícone
 * - Categorias (Hero, Header, Section, CTA)
 * - Suporte a presets customizados
 *
 * @component
 */

export function TextPresetsPanel() {
  const { builtInPresets, customPresets, applyPreset, removeCustomPreset, isApplying } =
    useTextPresets()
  const { toast } = useToast()
  const [applyingPresetId, setApplyingPresetId] = React.useState<string | null>(null)

  /**
   * Handler de aplicação de preset
   */
  const handleApplyPreset = React.useCallback(
    async (presetId: string) => {
      setApplyingPresetId(presetId)

      try {
        await applyPreset(presetId, {
          centerOnCanvas: true, // Centralizar no canvas
        })

        toast({
          title: '✅ Preset aplicado!',
          description: 'Os elementos de texto foram adicionados ao canvas.',
        })
      } catch (error) {
        console.error('[TextPresetsPanel] Erro ao aplicar preset:', error)

        toast({
          title: '❌ Erro ao aplicar preset',
          description: error instanceof Error ? error.message : 'Erro desconhecido',
          variant: 'destructive',
        })
      } finally {
        setApplyingPresetId(null)
      }
    },
    [applyPreset, toast],
  )

  /**
   * Handler de remoção de preset customizado
   */
  const handleRemoveCustomPreset = React.useCallback(
    (presetId: string, presetName: string) => {
      if (!confirm(`Deseja remover o preset "${presetName}"?`)) return

      removeCustomPreset(presetId)

      toast({
        title: '🗑️ Preset removido',
        description: `Preset "${presetName}" foi removido com sucesso.`,
      })
    },
    [removeCustomPreset, toast],
  )

  return (
    <div className="space-y-6">
      {/* Presets Built-in */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Presets Profissionais</h3>
          <p className="text-xs text-muted-foreground">
            Layouts de texto prontos para uso
          </p>
        </div>

        <ScrollArea className="h-[500px] pr-3">
          <div className="grid gap-3">
            {builtInPresets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                onApply={handleApplyPreset}
                isApplying={applyingPresetId === preset.id}
                disabled={isApplying}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Presets Customizados */}
      {customPresets.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Meus Presets</h3>
          </div>

          <ScrollArea className="max-h-[300px] pr-3">
            <div className="grid gap-3">
              {customPresets.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  onApply={handleApplyPreset}
                  onRemove={() => handleRemoveCustomPreset(preset.id, preset.name)}
                  isApplying={applyingPresetId === preset.id}
                  disabled={isApplying}
                  isCustom
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

/**
 * PresetCard - Card individual de preset
 */
interface PresetCardProps {
  preset: TextPreset
  onApply: (presetId: string) => void
  onRemove?: () => void
  isApplying: boolean
  disabled: boolean
  isCustom?: boolean
}

function PresetCard({ preset, onApply, onRemove, isApplying, disabled, isCustom }: PresetCardProps) {
  return (
    <div
      className={cn(
        'group relative rounded-lg border border-border/40 bg-card p-4 shadow-sm transition-all',
        'hover:border-primary/40 hover:shadow-md',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      {/* Header com ícone e badge */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-2xl">
            {preset.icon}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm">{preset.name}</h4>
              {isCustom && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Custom
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
          </div>
        </div>

        {/* Botão remover (apenas custom) */}
        {isCustom && onRemove && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={onRemove}
            title="Remover preset"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Preview dos elementos */}
      <div className="mb-3 space-y-1.5 rounded-md bg-muted/30 p-3">
        {preset.elements.map((element, idx) => (
          <div
            key={element.id}
            className="truncate text-xs"
            style={{
              fontFamily: element.fontFamily,
              fontWeight: element.fontWeight,
              fontSize: `${Math.min(element.fontSize / 4, 14)}px`,
              color: element.fill,
              textAlign: element.align,
              opacity: 0.7,
            }}
          >
            {element.text}
          </div>
        ))}
      </div>

      {/* Info badges */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {preset.elements.length} elementos
        </Badge>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
          {preset.category}
        </Badge>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
          {preset.alignment}
        </Badge>
      </div>

      {/* Botão Aplicar */}
      <Button
        size="sm"
        className="w-full"
        onClick={() => onApply(preset.id)}
        disabled={disabled || isApplying}
      >
        {isApplying ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Aplicando...
          </>
        ) : (
          'Aplicar Preset'
        )}
      </Button>
    </div>
  )
}
