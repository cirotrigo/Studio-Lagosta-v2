'use client'

import { useEffect, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface TextLayer {
  id: string
  type: string
  name: string
  text: string
  fontSize?: number
  [key: string]: any
}

interface DynamicTextFieldsFormProps {
  layers: any[]
  textValues: Record<string, string>
  onTextChange: (layerId: string, value: string) => void
  onLayerUpdate?: (layerId: string, updates: any) => void
}

export function DynamicTextFieldsForm({
  layers,
  textValues,
  onTextChange,
  onLayerUpdate,
}: DynamicTextFieldsFormProps) {
  // Filtrar apenas layers de tipo texto
  const textLayers = useMemo(() => {
    return layers.filter((layer) => layer.type === 'text') as TextLayer[]
  }, [layers])

  // Inicializar valores de texto se não existirem
  useEffect(() => {
    textLayers.forEach((layer) => {
      if (textValues[layer.id] === undefined && layer.text) {
        onTextChange(layer.id, layer.text)
      }
    })
  }, [textLayers])

  const handleTextChange = (layerId: string, value: string) => {
    onTextChange(layerId, value)

    // Se houver callback para atualizar a layer, chamar
    if (onLayerUpdate) {
      onLayerUpdate(layerId, { text: value })
    }
  }

  if (textLayers.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-700">
          Este modelo não possui campos de texto editáveis.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Textos do Criativo</h3>
      <div className="space-y-4">
        {textLayers.map((layer) => {
          const value = textValues[layer.id] || layer.text || ''
          const isLongText = layer.fontSize && layer.fontSize < 20 ||
                           layer.name?.toLowerCase().includes('descrição') ||
                           layer.name?.toLowerCase().includes('description') ||
                           layer.name?.toLowerCase().includes('texto') ||
                           value.length > 100

          return (
            <div key={layer.id} className="space-y-2">
              <Label htmlFor={`text-${layer.id}`}>
                {layer.name || `Texto ${textLayers.indexOf(layer) + 1}`}
              </Label>

              {isLongText ? (
                <Textarea
                  id={`text-${layer.id}`}
                  value={value}
                  onChange={(e) => handleTextChange(layer.id, e.target.value)}
                  placeholder={`Digite o ${layer.name?.toLowerCase() || 'texto'}...`}
                  rows={3}
                  className="resize-none"
                />
              ) : (
                <Input
                  id={`text-${layer.id}`}
                  type="text"
                  value={value}
                  onChange={(e) => handleTextChange(layer.id, e.target.value)}
                  placeholder={`Digite o ${layer.name?.toLowerCase() || 'texto'}...`}
                />
              )}

              {/* Indicador de tamanho máximo recomendado */}
              {value.length > 0 && (
                <p className="text-xs text-gray-500">
                  {value.length} caracteres
                  {layer.name?.toLowerCase().includes('título') && value.length > 50 && (
                    <span className="ml-1 text-amber-600">
                      (recomendado: máximo 50)
                    </span>
                  )}
                  {layer.name?.toLowerCase().includes('subtítulo') && value.length > 80 && (
                    <span className="ml-1 text-amber-600">
                      (recomendado: máximo 80)
                    </span>
                  )}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}