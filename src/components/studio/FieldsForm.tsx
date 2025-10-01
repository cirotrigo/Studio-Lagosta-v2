"use client"

import * as React from 'react'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { TemplateDto } from '@/hooks/use-template'
import type { DynamicField, Layer } from '@/types/template'

export type FieldType = 'text' | 'image' | 'color' | 'fontSize'

export interface FieldDefinition {
  key: string
  layerId: string
  label: string
  fieldType: FieldType
  placeholder?: string
  required?: boolean
  initialValue?: unknown
}

function mapDynamicField(field: DynamicField): FieldDefinition {
  const baseLabel = field.label || 'Campo'
  if (field.fieldType === 'color') {
    return {
      key: `${field.layerId}_color`,
      layerId: field.layerId,
      label: baseLabel,
      fieldType: 'color',
      placeholder: field.placeholder,
      required: field.required,
      initialValue: field.defaultValue,
    }
  }
  if (field.fieldType === 'fontSize') {
    return {
      key: `${field.layerId}_fontSize`,
      layerId: field.layerId,
      label: baseLabel,
      fieldType: 'fontSize',
      placeholder: field.placeholder,
      required: field.required,
      initialValue: field.defaultValue,
    }
  }
  return {
    key: field.layerId,
    layerId: field.layerId,
    label: baseLabel,
    fieldType: field.fieldType === 'image' ? 'image' : 'text',
    placeholder: field.placeholder,
    required: field.required,
    initialValue: field.defaultValue,
  }
}

function fallbackFieldFromLayer(layer: Layer): FieldDefinition {
  const label = layer.name || `Layer ${layer.id.slice(0, 4)}`
  if (layer.type === 'image' || layer.type === 'logo' || layer.type === 'element') {
    return {
      key: layer.id,
      layerId: layer.id,
      label,
      fieldType: 'image',
      initialValue: layer.fileUrl,
    }
  }
  return {
    key: layer.id,
    layerId: layer.id,
    label,
    fieldType: 'text',
    initialValue: layer.content,
  }
}

export function getDynamicFieldDefinitions(template: TemplateDto): FieldDefinition[] {
  if (template.dynamicFields && template.dynamicFields.length > 0) {
    return template.dynamicFields.map(mapDynamicField)
  }

  // fallback: identify layers marked as dynamic
  const design = template.designData
  if (!design?.layers) return []
  return design.layers
    .filter((layer) => layer.isDynamic)
    .map(fallbackFieldFromLayer)
}

interface FieldsFormProps {
  template: TemplateDto
  values: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}

export function FieldsForm({ template, values, onChange }: FieldsFormProps) {
  const fields = React.useMemo(() => getDynamicFieldDefinitions(template), [template])

  const handleChange = React.useCallback(
    (key: string, value: unknown) => {
      onChange({ ...values, [key]: value })
    },
    [onChange, values],
  )

  const handleReset = React.useCallback(() => {
    const next: Record<string, unknown> = {}
    fields.forEach((field) => {
      next[field.key] = field.initialValue ?? ''
    })
    onChange(next)
  }, [fields, onChange])

  if (fields.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 p-4 text-sm text-muted-foreground">
        Este template não possui campos dinâmicos configurados.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Campos dinâmicos</h3>
          <p className="text-xs text-muted-foreground">
            Personalize o conteúdo que será aplicado ao template antes da geração.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleReset}>
          Restaurar padrões
        </Button>
      </div>

      <div className="space-y-4">
        {fields.map((field) => {
          const value = values[field.key] ?? ''
          return (
            <div key={field.key} className="space-y-2">
              <Label className="text-xs font-medium" htmlFor={`field-${field.key}`}>
                {field.label}
                {field.required && <span className="ml-1 text-destructive">*</span>}
              </Label>
              {field.fieldType === 'text' ? (
                <Textarea
                  id={`field-${field.key}`}
                  rows={3}
                  value={String(value ?? '')}
                  onChange={(event) => handleChange(field.key, event.target.value)}
                  placeholder={field.placeholder || 'Digite o texto...'}
                />
              ) : field.fieldType === 'image' ? (
                <div className="space-y-2">
                  <Input
                    id={`field-${field.key}`}
                    value={String(value ?? '')}
                    onChange={(event) => handleChange(field.key, event.target.value)}
                    placeholder={field.placeholder || 'https://exemplo.com/imagem.png'}
                  />
                  {typeof value === 'string' && value && (
                    <div className="relative h-32 overflow-hidden rounded-md border border-border/40">
                      <Image
                        src={value}
                        alt={field.label}
                        fill
                        sizes="200px"
                        className="object-cover"
                      />
                    </div>
                  )}
                </div>
              ) : field.fieldType === 'color' ? (
                <div className="flex items-center gap-2">
                  <Input
                    id={`field-${field.key}`}
                    value={String(value ?? '#000000')}
                    onChange={(event) => handleChange(field.key, event.target.value)}
                    placeholder={field.placeholder || '#000000'}
                  />
                  <input
                    type="color"
                    aria-label={`Selecionar cor para ${field.label}`}
                    className="h-10 w-10 rounded-md border border-border/50"
                    value={typeof value === 'string' ? value : '#000000'}
                    onChange={(event) => handleChange(field.key, event.target.value)}
                  />
                </div>
              ) : (
                <Input
                  id={`field-${field.key}`}
                  type="number"
                  value={value === '' ? '' : Number(value)}
                  onChange={(event) => handleChange(field.key, Number(event.target.value))}
                  placeholder={field.placeholder || 'Tamanho da fonte'}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
