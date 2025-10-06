"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Loader2, X, Check } from 'lucide-react'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useToast } from '@/hooks/use-toast'

interface BrandColor {
  id: number
  name: string
  hexCode: string
  projectId: number
  uploadedBy: string
  createdAt: string
}

export function ColorsPanelContent() {
  const { projectId } = useTemplateEditor()
  const { toast } = useToast()

  const [colors, setColors] = React.useState<BrandColor[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isAdding, setIsAdding] = React.useState(false)
  const [showForm, setShowForm] = React.useState(false)
  const [newColorName, setNewColorName] = React.useState('')
  const [newColorHex, setNewColorHex] = React.useState('#000000')

  // Load colors from project
  const loadColors = React.useCallback(async () => {
    if (!projectId) {
      console.log('[ColorsPanel] No projectId, skipping load')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      console.log('[ColorsPanel] Loading colors for project:', projectId)
      const response = await fetch(`/api/projects/${projectId}/colors`)
      console.log('[ColorsPanel] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[ColorsPanel] API error:', errorText)
        throw new Error(`Falha ao carregar cores: ${response.status}`)
      }

      const data = await response.json()
      console.log('[ColorsPanel] Loaded colors:', data)
      setColors(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('[ColorsPanel] Failed to load colors', error)
      toast({
        title: 'Erro ao carregar cores',
        description: error instanceof Error ? error.message : 'Não foi possível carregar as cores do projeto.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [projectId, toast])

  // Load colors on mount
  React.useEffect(() => {
    loadColors()
  }, [loadColors])

  // Add new color
  const handleAddColor = React.useCallback(async () => {
    if (!projectId) return
    if (!newColorName.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Digite um nome para a cor.',
        variant: 'destructive',
      })
      return
    }

    setIsAdding(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/colors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newColorName.trim(),
          hexCode: newColorHex.toUpperCase(),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Falha ao adicionar cor')
      }

      const newColor = await response.json()
      setColors((prev) => [newColor, ...prev])

      // Reset form
      setNewColorName('')
      setNewColorHex('#000000')
      setShowForm(false)

      toast({
        title: 'Cor adicionada',
        description: 'A cor foi salva no projeto e está disponível para todos os templates.'
      })
    } catch (error) {
      console.error('[ColorsPanel] Failed to add color', error)
      toast({
        title: 'Erro ao adicionar cor',
        description: error instanceof Error ? error.message : 'Não foi possível adicionar a cor.',
        variant: 'destructive',
      })
    } finally {
      setIsAdding(false)
    }
  }, [projectId, newColorName, newColorHex, toast])

  // Remove color
  const handleRemoveColor = React.useCallback(async (colorId: number, colorName: string) => {
    if (!projectId) return
    if (!confirm(`Deseja remover a cor "${colorName}"?`)) return

    try {
      const response = await fetch(`/api/projects/${projectId}/colors/${colorId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Falha ao remover cor')
      }

      setColors((prev) => prev.filter((c) => c.id !== colorId))

      toast({
        title: 'Cor removida',
        description: 'A cor foi removida do projeto.'
      })
    } catch (error) {
      console.error('[ColorsPanel] Failed to remove color', error)
      toast({
        title: 'Erro ao remover cor',
        description: 'Não foi possível remover a cor.',
        variant: 'destructive',
      })
    }
  }, [projectId, toast])

  return (
    <div className="space-y-4">
      {/* Add Color Button */}
      {!showForm && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setShowForm(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova Cor da Marca
        </Button>
      )}

      {/* Add Color Form */}
      {showForm && (
        <div className="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-4">
          <div className="space-y-2">
            <Label htmlFor="colorName" className="text-xs">Nome da Cor</Label>
            <Input
              id="colorName"
              placeholder="Ex: Azul Principal"
              value={newColorName}
              onChange={(e) => setNewColorName(e.target.value)}
              disabled={isAdding}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="colorHex" className="text-xs">Código da Cor</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="colorHex"
                  placeholder="#000000"
                  value={newColorHex}
                  onChange={(e) => setNewColorHex(e.target.value)}
                  disabled={isAdding}
                  maxLength={7}
                  className="pr-10"
                />
                <div
                  className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 rounded border border-border"
                  style={{ backgroundColor: newColorHex }}
                />
              </div>
              <input
                type="color"
                value={newColorHex}
                onChange={(e) => setNewColorHex(e.target.value)}
                disabled={isAdding}
                className="h-10 w-10 cursor-pointer rounded border border-border"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowForm(false)
                setNewColorName('')
                setNewColorHex('#000000')
              }}
              disabled={isAdding}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={handleAddColor}
              disabled={isAdding}
            >
              {isAdding ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-3 w-3" />
                  Adicionar
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Colors List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : colors.length > 0 ? (
        <>
          <div className="border-t border-border/40 pt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cores da Marca
            </h3>
          </div>

          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {colors.map((color) => (
                <div
                  key={color.id}
                  className="group flex items-center gap-3 rounded-lg border border-border/40 bg-card p-3 transition hover:border-primary"
                >
                  <div
                    className="h-10 w-10 flex-shrink-0 rounded border border-border"
                    style={{ backgroundColor: color.hexCode }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{color.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{color.hexCode}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 flex-shrink-0 opacity-0 transition group-hover:opacity-100"
                    onClick={() => handleRemoveColor(color.id, color.name)}
                  >
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma cor cadastrada ainda.
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">
          <strong>Dica:</strong> As cores da marca ficam disponíveis em todos os templates do projeto e aparecem nos seletores de cor dos textos.
        </p>
      </div>
    </div>
  )
}
