'use client'

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

type BentoGridEditorProps = {
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
}

export function BentoGridEditor({ content, onChange }: BentoGridEditorProps) {
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
          placeholder="Título da grade"
        />
      </div>

      <div className="space-y-2">
        <Label>Subtítulo</Label>
        <Textarea
          value={(content.subtitle as string) || ''}
          onChange={(e) => updateField('subtitle', e.target.value)}
          placeholder="Subtítulo da grade"
          rows={2}
        />
      </div>

      <div className="rounded-lg border p-4 bg-muted/50 space-y-3">
        <p className="text-sm font-medium">
          Gerenciamento de Cards
        </p>
        <p className="text-sm text-muted-foreground">
          Os cards do Grid de Recursos são gerenciados em uma seção dedicada do painel admin.
          Clique no botão abaixo para gerenciar os itens do grid.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/content/feature-grid" target="_blank">
            <ExternalLink className="mr-2 h-4 w-4" />
            Gerenciar Grid de Recursos
          </Link>
        </Button>
      </div>
    </div>
  )
}
