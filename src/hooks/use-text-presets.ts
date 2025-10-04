/**
 * useTextPresets - Hook para gerenciamento de presets de texto
 *
 * Funcionalidades:
 * - Aplicar presets no canvas Konva
 * - Customizar presets antes de aplicar
 * - Salvar presets personalizados
 * - Carregar fontes necessárias
 * - Gerenciar grupos de texto
 */

import * as React from 'react'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { getFontManager } from '@/lib/font-manager'
import {
  TEXT_PRESETS,
  type TextPreset,
  type TextPresetElement,
  calculateTextHeight,
  applyTextTransform,
  clonePreset,
} from '@/lib/text-presets'
import type { Layer } from '@/types/template'

export interface ApplyPresetOptions {
  position?: { x: number; y: number }
  customizations?: Record<string, Partial<TextPresetElement>>
  centerOnCanvas?: boolean
}

export function useTextPresets() {
  const { addLayer, design } = useTemplateEditor()
  const fontManager = React.useMemo(() => getFontManager(), [])
  const [customPresets, setCustomPresets] = React.useState<Record<string, TextPreset>>({})
  const [isApplying, setIsApplying] = React.useState(false)

  // Carregar presets customizados do localStorage ao montar
  React.useEffect(() => {
    loadCustomPresets()
  }, [])

  /**
   * Carregar presets customizados do localStorage
   */
  const loadCustomPresets = React.useCallback(() => {
    try {
      const saved = localStorage.getItem('customTextPresets')
      if (saved) {
        const parsed = JSON.parse(saved)
        setCustomPresets(parsed)
      }
    } catch (error) {
      console.error('[useTextPresets] Erro ao carregar presets:', error)
    }
  }, [])

  /**
   * Salvar presets customizados no localStorage
   */
  const saveCustomPresetsToStorage = React.useCallback((presets: Record<string, TextPreset>) => {
    try {
      localStorage.setItem('customTextPresets', JSON.stringify(presets))
    } catch (error) {
      console.error('[useTextPresets] Erro ao salvar presets:', error)
    }
  }, [])

  /**
   * Obter todos os presets (built-in + custom)
   */
  const getAllPresets = React.useCallback((): TextPreset[] => {
    return [...Object.values(TEXT_PRESETS), ...Object.values(customPresets)]
  }, [customPresets])

  /**
   * Obter preset por ID
   */
  const getPresetById = React.useCallback(
    (presetId: string): TextPreset | null => {
      // Tentar buscar nos built-in
      if (TEXT_PRESETS[presetId]) {
        return TEXT_PRESETS[presetId]
      }

      // Tentar buscar nos custom
      if (customPresets[presetId]) {
        return customPresets[presetId]
      }

      // Buscar por ID alternativo (caso tenha hífen)
      const allPresets = { ...TEXT_PRESETS, ...customPresets }
      const found = Object.values(allPresets).find((p) => p.id === presetId)

      return found || null
    },
    [customPresets],
  )

  /**
   * Aplicar preset no canvas
   */
  const applyPreset = React.useCallback(
    async (presetId: string, options: ApplyPresetOptions = {}) => {
      const preset = getPresetById(presetId)
      if (!preset) {
        throw new Error(`Preset "${presetId}" não encontrado`)
      }

      setIsApplying(true)

      try {
        // Clonar preset para não modificar o original
        const workingPreset = clonePreset(preset)

        // Aplicar customizações se fornecidas
        if (options.customizations) {
          workingPreset.elements.forEach((element) => {
            const custom = options.customizations![element.id]
            if (custom) {
              Object.assign(element, custom)
            }
          })
        }

        // Garantir que todas as fontes estão carregadas
        const fontLoadPromises = workingPreset.elements
          .filter((el) => fontManager.isCustomFont(el.fontFamily))
          .map((el) => fontManager.loadFont(el.fontFamily))

        await Promise.all(fontLoadPromises)

        // Calcular posição inicial
        let baseX = options.position?.x ?? 100
        let baseY = options.position?.y ?? 100

        // Centralizar no canvas se solicitado
        if (options.centerOnCanvas) {
          const canvasWidth = design.canvas.width
          const canvasHeight = design.canvas.height

          // Calcular largura máxima do preset
          const maxWidth = Math.max(...workingPreset.elements.map((el) => el.width))

          // Calcular altura total do preset
          const totalHeight = workingPreset.elements.reduce((sum, el, idx) => {
            const height = calculateTextHeight(el)
            return sum + height + (idx > 0 ? workingPreset.spacing : 0)
          }, 0)

          baseX = (canvasWidth - maxWidth) / 2
          baseY = (canvasHeight - totalHeight) / 2
        }

        // Criar camadas para cada elemento do preset
        const layers: Layer[] = []
        let currentY = baseY

        for (const element of workingPreset.elements) {
          // Calcular posição baseada no alinhamento
          let elementX = baseX

          if (workingPreset.alignment === 'center') {
            const maxWidth = Math.max(...workingPreset.elements.map((el) => el.width))
            elementX = baseX + (maxWidth - element.width) / 2
          } else if (workingPreset.alignment === 'right') {
            const maxWidth = Math.max(...workingPreset.elements.map((el) => el.width))
            elementX = baseX + (maxWidth - element.width)
          }

          // Aplicar text transform se necessário
          const processedText = applyTextTransform(element.text, element.textTransform)

          // Criar camada de texto
          const textLayer = createDefaultLayer('text')
          const layer: Layer = {
            ...textLayer,
            name: `${preset.name} - ${element.label}`,
            content: processedText,
            position: {
              x: elementX,
              y: currentY,
            },
            size: {
              width: element.width,
              height: calculateTextHeight(element),
            },
            style: {
              fontSize: element.fontSize,
              fontFamily: element.fontFamily,
              fontWeight: element.fontWeight || 'normal',
              fontStyle: element.fontStyle || 'normal',
              color: element.fill,
              textAlign: element.align,
              lineHeight: element.lineHeight,
              letterSpacing: element.letterSpacing,
            },
            // Metadados do preset
            metadata: {
              presetId: preset.id,
              presetName: preset.name,
              elementId: element.id,
              elementLabel: element.label,
            },
          }

          layers.push(layer)

          // Atualizar posição Y para próximo elemento
          currentY += calculateTextHeight(element) + workingPreset.spacing
        }

        // Adicionar todas as camadas ao canvas
        layers.forEach((layer) => addLayer(layer))

        console.log(`✅ Preset "${preset.name}" aplicado com ${layers.length} elementos`)
        return layers
      } catch (error) {
        console.error('[useTextPresets] Erro ao aplicar preset:', error)
        throw error
      } finally {
        setIsApplying(false)
      }
    },
    [getPresetById, fontManager, design.canvas, addLayer],
  )

  /**
   * Salvar preset customizado
   */
  const saveCustomPreset = React.useCallback(
    (name: string, preset: Omit<TextPreset, 'id' | 'isCustom'>) => {
      const customPresetId = `custom-${Date.now()}`
      const newPreset: TextPreset = {
        ...preset,
        id: customPresetId,
        name,
        isCustom: true,
      }

      const updatedPresets = {
        ...customPresets,
        [customPresetId]: newPreset,
      }

      setCustomPresets(updatedPresets)
      saveCustomPresetsToStorage(updatedPresets)

      console.log(`✅ Preset customizado "${name}" salvo com ID ${customPresetId}`)
      return customPresetId
    },
    [customPresets, saveCustomPresetsToStorage],
  )

  /**
   * Remover preset customizado
   */
  const removeCustomPreset = React.useCallback(
    (presetId: string) => {
      const { [presetId]: removed, ...remaining } = customPresets
      setCustomPresets(remaining)
      saveCustomPresetsToStorage(remaining)

      console.log(`🗑️ Preset customizado ${presetId} removido`)
    },
    [customPresets, saveCustomPresetsToStorage],
  )

  /**
   * Customizar preset (criar uma cópia modificada)
   */
  const customizePreset = React.useCallback(
    (presetId: string, customizations: Record<string, Partial<TextPresetElement>>): TextPreset => {
      const preset = getPresetById(presetId)
      if (!preset) {
        throw new Error(`Preset "${presetId}" não encontrado`)
      }

      const customized = clonePreset(preset)

      customized.elements.forEach((element) => {
        const custom = customizations[element.id]
        if (custom) {
          Object.assign(element, custom)
        }
      })

      return customized
    },
    [getPresetById],
  )

  return {
    // Presets
    builtInPresets: Object.values(TEXT_PRESETS),
    customPresets: Object.values(customPresets),
    allPresets: getAllPresets(),

    // Métodos
    getPresetById,
    applyPreset,
    customizePreset,
    saveCustomPreset,
    removeCustomPreset,

    // Estado
    isApplying,
  }
}
