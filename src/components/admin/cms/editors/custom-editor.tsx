'use client'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type CustomEditorProps = {
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
}

export function CustomEditor({ content, onChange }: CustomEditorProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>HTML/Conteúdo Personalizado</Label>
        <Textarea
          value={(content.html as string) || ''}
          onChange={(e) => onChange({ ...content, html: e.target.value })}
          placeholder="Digite o HTML ou conteúdo personalizado"
          rows={15}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Suporta HTML, Markdown ou qualquer conteúdo personalizado
        </p>
      </div>
    </div>
  )
}
