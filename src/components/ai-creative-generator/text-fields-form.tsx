'use client'

import { Input } from '@/components/ui/input'
import type { TextsData, LayoutId, TextFieldName } from '@/lib/ai-creative-generator/layout-types'

interface TextFieldsFormProps {
  values: TextsData
  onChange: (field: TextFieldName, value: string) => void
  layout: LayoutId
}

const FIELD_LABELS: Record<TextFieldName, string> = {
  title: 'Título',
  subtitle: 'Subtítulo',
  description: 'Descrição',
  hours: 'Horário',
  cta: 'Call-to-Action',
  address: 'Endereço',
}

// Campos disponíveis por layout
const LAYOUT_FIELDS: Record<LayoutId, TextFieldName[]> = {
  'story-promo': ['title', 'subtitle', 'description', 'hours', 'cta'],
  'story-default': ['title', 'subtitle', 'description', 'hours', 'address'],
  'story-minimal': ['title', 'cta'],
}

export function TextFieldsForm({ values, onChange, layout }: TextFieldsFormProps) {
  const fields = LAYOUT_FIELDS[layout]

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium">Textos (Opcionais)</label>
      {fields.map((field) => (
        <div key={field} className="space-y-1">
          <label className="text-xs text-muted-foreground">{FIELD_LABELS[field]}</label>
          <Input
            value={values[field] || ''}
            onChange={(e) => onChange(field, e.target.value)}
            placeholder={`Digite o ${FIELD_LABELS[field].toLowerCase()}`}
          />
        </div>
      ))}
    </div>
  )
}
