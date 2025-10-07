'use client'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Plus, X } from 'lucide-react'

type HeroContent = {
  badge?: { text: string; link: string }
  title?: { lines: (string | { text: string; gradient: boolean })[] }
  description?: string
  ctas?: Array<{ text: string; href: string; variant: string }>
  backgroundImage?: { light: string; dark: string }
  centerImage?: { src: string; alt: string; width: number; height: number }
  clients?: { title: string; logos: Array<{ src: string; alt: string }> }
}

type HeroEditorProps = {
  content: Record<string, unknown>
  onChange: (content: Record<string, unknown>) => void
}

export function HeroEditor({ content, onChange }: HeroEditorProps) {
  const data = content as HeroContent

  const updateField = (field: string, value: unknown) => {
    onChange({ ...content, [field]: value })
  }

  const addCTA = () => {
    const ctas = data.ctas || []
    updateField('ctas', [...ctas, { text: 'Novo Botão', href: '#', variant: 'default' }])
  }

  const updateCTA = (index: number, field: string, value: string) => {
    const ctas = [...(data.ctas || [])]
    ctas[index] = { ...ctas[index], [field]: value }
    updateField('ctas', ctas)
  }

  const removeCTA = (index: number) => {
    const ctas = (data.ctas || []).filter((_, i) => i !== index)
    updateField('ctas', ctas)
  }

  return (
    <div className="space-y-6">
      {/* Badge */}
      <div className="space-y-2">
        <Label>Badge</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Texto do badge"
            value={data.badge?.text || ''}
            onChange={(e) =>
              updateField('badge', { ...data.badge, text: e.target.value })
            }
          />
          <Input
            placeholder="Link do badge"
            value={data.badge?.link || ''}
            onChange={(e) =>
              updateField('badge', { ...data.badge, link: e.target.value })
            }
          />
        </div>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <Label>Título</Label>
        <Textarea
          placeholder="Digite o título (uma linha por linha do título)"
          value={
            data.title?.lines
              ?.map((line) =>
                typeof line === 'string' ? line : line.text
              )
              .join('\n') || ''
          }
          onChange={(e) => {
            const lines = e.target.value.split('\n').map((line) => line.trim())
            updateField('title', { lines })
          }}
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Cada linha será renderizada separadamente
        </p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea
          placeholder="Descrição do hero"
          value={data.description || ''}
          onChange={(e) => updateField('description', e.target.value)}
          rows={3}
        />
      </div>

      {/* CTAs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Botões (CTAs)</Label>
          <Button type="button" size="sm" variant="outline" onClick={addCTA}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3">
          {(data.ctas || []).map((cta, index) => (
            <div
              key={index}
              className="flex gap-2 items-start p-3 border rounded-lg"
            >
              <div className="flex-1 space-y-2">
                <Input
                  placeholder="Texto do botão"
                  value={cta.text}
                  onChange={(e) => updateCTA(index, 'text', e.target.value)}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Link"
                    value={cta.href}
                    onChange={(e) => updateCTA(index, 'href', e.target.value)}
                  />
                  <Input
                    placeholder="Variant (default/outline)"
                    value={cta.variant}
                    onChange={(e) =>
                      updateCTA(index, 'variant', e.target.value)
                    }
                  />
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeCTA(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {(!data.ctas || data.ctas.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum botão adicionado
            </p>
          )}
        </div>
      </div>

      {/* Background Image */}
      <div className="space-y-2">
        <Label>Imagem de Fundo</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="URL (tema claro)"
            value={data.backgroundImage?.light || ''}
            onChange={(e) =>
              updateField('backgroundImage', {
                ...data.backgroundImage,
                light: e.target.value,
              })
            }
          />
          <Input
            placeholder="URL (tema escuro)"
            value={data.backgroundImage?.dark || ''}
            onChange={(e) =>
              updateField('backgroundImage', {
                ...data.backgroundImage,
                dark: e.target.value,
              })
            }
          />
        </div>
      </div>

      {/* Center Image */}
      <div className="space-y-2">
        <Label>Imagem Central</Label>
        <div className="space-y-2">
          <Input
            placeholder="URL da imagem"
            value={data.centerImage?.src || ''}
            onChange={(e) =>
              updateField('centerImage', {
                ...data.centerImage,
                src: e.target.value,
              })
            }
          />
          <Input
            placeholder="Texto alternativo"
            value={data.centerImage?.alt || ''}
            onChange={(e) =>
              updateField('centerImage', {
                ...data.centerImage,
                alt: e.target.value,
              })
            }
          />
        </div>
      </div>

      {/* Clients */}
      <div className="space-y-2">
        <Label>Clientes</Label>
        <Input
          placeholder="Título da seção de clientes"
          value={data.clients?.title || ''}
          onChange={(e) =>
            updateField('clients', { ...data.clients, title: e.target.value })
          }
        />
        <p className="text-xs text-muted-foreground">
          Configure os logos dos clientes através do editor JSON avançado
        </p>
      </div>
    </div>
  )
}
