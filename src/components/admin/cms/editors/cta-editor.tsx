'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type CTAEditorProps = {
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
}

export function CTAEditor({ content, onChange }: CTAEditorProps) {
  const button = (content.button as { text: string; href: string }) || { text: '', href: '' }

  const updateField = (field: string, value: unknown) => {
    onChange({ ...content, [field]: value })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Título</Label>
        <Input
          value={(content.title as string) || ''}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="Call to Action"
        />
      </div>

      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea
          value={(content.description as string) || ''}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Descrição do CTA"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>Botão</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Texto do botão"
            value={button.text || ''}
            onChange={(e) =>
              updateField('button', { ...button, text: e.target.value })
            }
          />
          <Input
            placeholder="Link do botão"
            value={button.href || ''}
            onChange={(e) =>
              updateField('button', { ...button, href: e.target.value })
            }
          />
        </div>
      </div>
    </div>
  )
}
