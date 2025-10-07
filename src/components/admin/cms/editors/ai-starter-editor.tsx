'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type AIStarterEditorProps = {
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
}

export function AIStarterEditor({ content, onChange }: AIStarterEditorProps) {
  const updateField = (field: string, value: unknown) => {
    onChange({ ...content, [field]: value })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Badge</Label>
        <Input
          value={(content.badge as string) || ''}
          onChange={(e) => updateField('badge', e.target.value)}
          placeholder="Ex: Compatível com IA"
        />
      </div>

      <div className="space-y-2">
        <Label>Título</Label>
        <Input
          value={(content.title as string) || ''}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="Título da seção"
        />
      </div>

      <div className="space-y-2">
        <Label>Subtítulo</Label>
        <Textarea
          value={(content.subtitle as string) || ''}
          onChange={(e) => updateField('subtitle', e.target.value)}
          placeholder="Subtítulo da seção"
          rows={2}
        />
      </div>

      <div className="rounded-lg border p-4 bg-muted/50">
        <p className="text-sm text-muted-foreground">
          As ferramentas e cards são gerenciados através de um editor JSON
          avançado. Configure os logos e descrições no modo avançado.
        </p>
      </div>
    </div>
  )
}
