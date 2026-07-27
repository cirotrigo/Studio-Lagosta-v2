"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Pencil, Plus, Check, X, Trash2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useBrandFonts, useUpdateBrandFonts } from '@/hooks/use-brand-fonts'
import {
  useFontCombinations,
  useCreateFontCombination,
  useUpdateFontCombination,
  useDeleteFontCombination,
  type FontCombination,
} from '@/hooks/use-font-combinations'
import { capturarCombinacao } from '@/lib/font-combinations-capture'
import { getFontManager } from '@/lib/font-manager'
import { FONT_CONFIG } from '@/lib/font-config'
import {
  COMBO_BASE_CANVAS_WIDTH,
  estimateComboElementHeight,
  resolveComboFontFamily,
  type FontComboElement,
  type FontComboPair,
} from '@/lib/font-combinations'
import type { Layer } from '@/types/template'

/**
 * Painel de texto: adicionar textos avulsos, definir o par de fontes da marca
 * e aplicar/editar/criar combinações tipográficas do projeto.
 */
export function FontCombinationsPanel() {
  const { projectId, design, selectedLayerIds, addLayer, selectLayers, focusTextMode, setFocusTextMode } =
    useTemplateEditor()
  const { data: brand } = useBrandFonts(projectId)
  const updateBrand = useUpdateBrandFonts(projectId)
  const { data: combinacoes, isLoading } = useFontCombinations(projectId)
  const criar = useCreateFontCombination(projectId)
  const atualizar = useUpdateFontCombination(projectId)
  const remover = useDeleteFontCombination(projectId)

  const fontManager = React.useMemo(() => getFontManager(), [])
  const [aplicando, setAplicando] = React.useState(false)
  const [editando, setEditando] = React.useState<{ id: string; nome: string; layerIds: string[] } | null>(null)
  const [nomeNovo, setNomeNovo] = React.useState('')
  const [criandoNova, setCriandoNova] = React.useState(false)

  const customFamilies = React.useMemo(
    () => [...new Set((brand?.fonts ?? []).map((f) => f.fontFamily))],
    [brand?.fonts],
  )
  const families = React.useMemo(
    () => [...new Set([FONT_CONFIG.DEFAULT_FONT, ...customFamilies])],
    [customFamilies],
  )

  const pair: FontComboPair = React.useMemo(
    () => ({
      title: brand?.titleFontFamily ?? customFamilies[0] ?? FONT_CONFIG.DEFAULT_FONT,
      body: brand?.bodyFontFamily ?? FONT_CONFIG.DEFAULT_FONT,
    }),
    [brand?.titleFontFamily, brand?.bodyFontFamily, customFamilies],
  )

  const layersSelecionadas = React.useMemo(
    () => design.layers.filter((l) => selectedLayerIds.includes(l.id) && l.type === 'text'),
    [design.layers, selectedLayerIds],
  )

  const garantirFontes = React.useCallback(async () => {
    await Promise.all(
      [pair.title, pair.body]
        .filter((family) => fontManager.isCustomFont(family))
        .map((family) => fontManager.loadFont(family)),
    )
  }, [pair, fontManager])

  /** Cria as layers de uma combinação no canvas e as deixa selecionadas */
  const aplicar = React.useCallback(
    async (combo: Pick<FontCombination, 'id' | 'name' | 'elements'>) => {
      if (aplicando) return []
      setAplicando(true)
      try {
        await garantirFontes()

        const canvasWidth = design.canvas.width
        const canvasHeight = design.canvas.height
        const escala = canvasWidth / COMBO_BASE_CANVAS_WIDTH
        const groupId = `combo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

        const criadas: Layer[] = combo.elements.map((element: FontComboElement) => {
          const base = createDefaultLayer('text')
          return {
            ...base,
            name: `${combo.name} - ${element.label}`,
            content: element.text,
            position: {
              x: Math.round(element.x * canvasWidth),
              y: Math.round(element.y * canvasHeight),
            },
            size: {
              width: Math.round(element.width * canvasWidth),
              height: element.height
                ? Math.round(element.height * canvasHeight)
                : estimateComboElementHeight(element, escala),
            },
            style: {
              ...base.style,
              fontSize: Math.round(element.fontSize * escala),
              fontFamily: resolveComboFontFamily(element.role, pair),
              fontWeight: element.fontWeight,
              fontStyle: element.fontStyle ?? 'normal',
              color: element.color ?? '#FFFFFF',
              textAlign: element.textAlign ?? 'center',
              lineHeight: element.lineHeight,
              letterSpacing: element.letterSpacing
                ? Math.round(element.letterSpacing * escala)
                : undefined,
              textTransform: element.textTransform ?? 'none',
            },
            ...(element.effects ? { effects: element.effects } : {}),
            metadata: {
              presetId: combo.id,
              presetName: combo.name,
              elementId: element.id,
              elementLabel: element.label,
              groupId,
            },
          }
        })

        criadas.forEach((layer) => addLayer(layer))
        selectLayers(criadas.map((l) => l.id))
        return criadas
      } finally {
        setAplicando(false)
      }
    },
    [aplicando, garantirFontes, design.canvas, pair, addLayer, selectLayers],
  )

  /** Entra em modo de edição: aplica no canvas para ajustar com as ferramentas normais */
  const iniciarEdicao = React.useCallback(
    async (combo: FontCombination) => {
      const criadas = await aplicar(combo)
      // Guarda os ids: durante a edição o usuário clica em cada texto, e
      // depender da seleção no momento de salvar perderia o conjunto
      setEditando({ id: combo.id, nome: combo.name, layerIds: criadas.map((l) => l.id) })
      toast.info(`Editando "${combo.name}"`, {
        description: 'Ajuste no canvas e clique em Salvar alterações.',
      })
    },
    [aplicar],
  )

  const capturarPorIds = React.useCallback(
    (ids: string[]): FontComboElement[] =>
      capturarCombinacao({
        layers: design.layers.filter((l) => ids.includes(l.id)),
        canvasWidth: design.canvas.width,
        canvasHeight: design.canvas.height,
        pair,
      }),
    [design.layers, design.canvas, pair],
  )

  const capturarSelecao = React.useCallback((): FontComboElement[] => {
    return capturarCombinacao({
      layers: layersSelecionadas,
      canvasWidth: design.canvas.width,
      canvasHeight: design.canvas.height,
      pair,
    })
  }, [layersSelecionadas, design.canvas, pair])

  const salvarEdicao = React.useCallback(async () => {
    if (!editando) return
    const elements = capturarPorIds(editando.layerIds)
    if (elements.length === 0) {
      toast.error('Os textos desta combinação não estão mais no canvas')
      return
    }
    try {
      await atualizar.mutateAsync({ id: editando.id, elements })
      toast.success(`"${editando.nome}" atualizada`, {
        description: `${elements.length} elementos salvos`,
      })
      setEditando(null)
    } catch {
      toast.error('Erro ao salvar alterações')
    }
  }, [editando, capturarPorIds, atualizar])

  const salvarNova = React.useCallback(async () => {
    const nome = nomeNovo.trim()
    if (!nome) return
    const elements = capturarSelecao()
    if (elements.length === 0) {
      toast.error('Selecione ao menos um texto no canvas')
      return
    }
    try {
      await criar.mutateAsync({ name: nome, elements })
      toast.success(`"${nome}" criada`, { description: `${elements.length} elementos` })
      setNomeNovo('')
      setCriandoNova(false)
    } catch {
      toast.error('Erro ao criar combinação')
    }
  }, [nomeNovo, capturarSelecao, criar])

  const adicionarTexto = React.useCallback(
    (tipo: 'titulo' | 'subtitulo' | 'corpo') => {
      const tamanhos = { titulo: 72, subtitulo: 36, corpo: 24 }
      const pesos = { titulo: '700', subtitulo: '500', corpo: '400' }
      const rotulos = { titulo: 'Título', subtitulo: 'Subtítulo', corpo: 'Texto do corpo' }

      const canvasWidth = design.canvas.width
      const canvasHeight = design.canvas.height
      const escala = canvasWidth / COMBO_BASE_CANVAS_WIDTH
      const fontSize = Math.round(tamanhos[tipo] * escala)
      const width = Math.round(canvasWidth * 0.8)
      const height = Math.round(fontSize * 1.2 * 2)

      const base = createDefaultLayer('text')
      addLayer({
        ...base,
        name: `Texto - ${rotulos[tipo]}`,
        content: rotulos[tipo],
        position: {
          x: Math.round((canvasWidth - width) / 2),
          y: Math.round((canvasHeight - height) / 2),
        },
        size: { width, height },
        style: {
          ...base.style,
          fontSize,
          fontWeight: pesos[tipo],
          fontFamily: tipo === 'titulo' ? pair.title : pair.body,
          color: '#FFFFFF',
          textAlign: 'center',
        },
      })
    },
    [design.canvas, pair, addLayer],
  )

  return (
    <div className="space-y-4">
      {/* Adicionar texto avulso */}
      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-wide">Adicionar texto</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {(['titulo', 'subtitulo', 'corpo'] as const).map((tipo) => (
            <Button
              key={tipo}
              variant="outline"
              size="sm"
              className="h-8 text-[11px] capitalize"
              onClick={() => adicionarTexto(tipo)}
            >
              {tipo}
            </Button>
          ))}
        </div>
      </div>

      {/* Par de fontes da marca */}
      <div className="space-y-2 rounded-md border border-border/40 bg-muted/30 p-2.5">
        <Label className="text-[11px] uppercase tracking-wide">Fontes da marca</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['title', 'body'] as const).map((papel) => (
            <div key={papel} className="space-y-1">
              <span className="text-[10px] text-muted-foreground">
                {papel === 'title' ? 'Título' : 'Corpo'}
              </span>
              <Select
                value={pair[papel]}
                onValueChange={(value) =>
                  updateBrand.mutate(
                    papel === 'title' ? { titleFontFamily: value } : { bodyFontFamily: value },
                  )
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {families.map((family) => (
                    <SelectItem key={family} value={family} className="text-xs">
                      <span style={{ fontFamily: family }}>{family}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {/* Barra de edição em andamento */}
      {editando && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">Editando “{editando.nome}”</p>
            <p className="text-[10px] text-muted-foreground">
              {editando.layerIds.length} texto(s) — ajuste no canvas e salve
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" className="h-7 px-2 text-[11px]" onClick={salvarEdicao} disabled={atualizar.isPending}>
              <Check className="mr-1 h-3 w-3" />
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => setEditando(null)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Criar nova a partir da seleção */}
      {criandoNova ? (
        <div className="space-y-2 rounded-md border border-border/40 bg-card p-2.5">
          <Input
            autoFocus
            placeholder="Nome da combinação"
            value={nomeNovo}
            onChange={(e) => setNomeNovo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && salvarNova()}
            className="h-8 text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Serão salvos os {layersSelecionadas.length} texto(s) selecionado(s), com posição, cor e
            efeitos.
          </p>
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setCriandoNova(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7 text-[11px]"
              onClick={salvarNova}
              disabled={criar.isPending || !nomeNovo.trim() || layersSelecionadas.length === 0}
            >
              Salvar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full text-[11px]"
          onClick={() => setCriandoNova(true)}
          disabled={layersSelecionadas.length === 0}
          title={
            layersSelecionadas.length === 0
              ? 'Selecione textos no canvas para salvar como combinação'
              : undefined
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Salvar seleção como combinação
        </Button>
      )}

      {/* Focar textos: avalia a tipografia sem a foto distraindo */}
      <Button
        variant={focusTextMode ? 'default' : 'outline'}
        size="sm"
        className="h-8 w-full text-[11px]"
        onClick={() => setFocusTextMode(!focusTextMode)}
      >
        {focusTextMode ? (
          <EyeOff className="mr-1 h-3.5 w-3.5" />
        ) : (
          <Eye className="mr-1 h-3.5 w-3.5" />
        )}
        {focusTextMode ? 'Mostrar imagens' : 'Focar textos'}
      </Button>

      {/* Galeria */}
      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-wide">Combinações</Label>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(combinacoes ?? []).map((combo) => (
              <ComboCard
                key={combo.id}
                combo={combo}
                pair={pair}
                onApply={() => aplicar(combo)}
                onEdit={() => iniciarEdicao(combo)}
                onDelete={
                  combo.isDefault
                    ? undefined
                    : async () => {
                        await remover.mutateAsync(combo.id)
                        toast.success(`"${combo.name}" removida`)
                      }
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const PREVIEW_SCALE = 0.19

function ComboCard({
  combo,
  pair,
  onApply,
  onEdit,
  onDelete,
}: {
  combo: FontCombination
  pair: FontComboPair
  onApply: () => void
  onEdit: () => void
  onDelete?: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onApply}
        title={combo.name}
        className="flex min-h-[110px] w-full flex-col items-center justify-center gap-1 rounded-md border border-border/40 bg-card p-3 text-center transition hover:border-primary/60 hover:bg-muted/40"
      >
        {combo.elements.map((element) => (
          <span
            key={element.id}
            className="block max-w-full text-foreground"
            style={{
              fontFamily: resolveComboFontFamily(element.role, pair),
              fontSize: Math.max(8, Math.round(element.fontSize * PREVIEW_SCALE)),
              fontWeight: Number(element.fontWeight) || 400,
              fontStyle: element.fontStyle ?? 'normal',
              letterSpacing: element.letterSpacing ? element.letterSpacing * PREVIEW_SCALE : undefined,
              lineHeight: element.lineHeight,
              textTransform: element.textTransform === 'uppercase' ? 'uppercase' : 'none',
              whiteSpace: 'pre-line',
            }}
          >
            {element.text}
          </span>
        ))}
      </button>

      {/* Ações discretas, só no hover */}
      <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          title="Editar combinação"
          className="rounded bg-background/90 p-1 text-muted-foreground shadow-sm hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Remover combinação"
            className="rounded bg-background/90 p-1 text-muted-foreground shadow-sm hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
