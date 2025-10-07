'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type PricingEditorProps = {
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
}

export function PricingEditor({ content, onChange }: PricingEditorProps) {
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
          placeholder="Planos e Preços"
        />
      </div>

      <div className="space-y-2">
        <Label>Subtítulo</Label>
        <Textarea
          value={(content.subtitle as string) || ''}
          onChange={(e) => updateField('subtitle', e.target.value)}
          placeholder="Escolha o melhor plano"
          rows={2}
        />
      </div>

      <div className="rounded-lg border p-4 bg-muted/50">
        <p className="text-sm font-medium mb-2">Modo de Exibição</p>
        <p className="text-sm text-muted-foreground">
          Esta seção exibe os planos cadastrados no banco de dados
          automaticamente. Configure os planos em{' '}
          <span className="font-medium">Admin → Configurações → Planos de
          Assinatura</span>
          .
        </p>
      </div>
    </div>
  )
}
