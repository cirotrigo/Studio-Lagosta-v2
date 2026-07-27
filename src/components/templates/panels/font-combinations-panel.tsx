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
import { Pencil, Plus, Check, X, Trash2 } from 'lucide-react'
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

  // Sem fonte configurada cai no padrão do sistema, e não na primeira fonte
  // enviada: adivinhar fazia uma fonte qualquer virar o título da marca sem
  // ninguém escolher, e as combinações nasciam com essa escolha invisível
  const marcaConfigurada = Boolean(brand?.titleFontFamily && brand?.bodyFontFamily)
  const pair: FontComboPair = React.useMemo(
    () => ({
      title: brand?.titleFontFamily ?? FONT_CONFIG.DEFAULT_FONT,
      body: brand?.bodyFontFamily ?? FONT_CONFIG.DEFAULT_FONT,
    }),
    [brand?.titleFontFamily, brand?.bodyFontFamily],
  )

  const layersSelecionadas = React.useMemo(
    () => design.layers.filter((l) => selectedLayerIds.includes(l.id) && l.type === 'text'),
    [design.layers, selectedLayerIds],
  )

  // Se o usuário trocar de painel no meio da edição, o modo não pode ficar preso
  React.useEffect(() => () => setFocusTextMode(false), [setFocusTextMode])

  /**
   * Carrega as fontes necessárias antes de criar as layers. Inclui as famílias
   * gravadas na própria combinação: sem isso, uma combinação com fonte própria
   * seria desenhada com a fonte de fallback do Konva.
   */
  const garantirFontes = React.useCallback(
    async (elements: FontComboElement[] = []) => {
      const familias = new Set<string>([
        pair.title,
        pair.body,
        ...elements.map((e) => e.fontFamily).filter((f): f is string => !!f),
      ])
      await Promise.all(
        [...familias]
          .filter((family) => fontManager.isCustomFont(family))
          .map((family) => fontManager.loadFont(family)),
      )
    },
    [pair, fontManager],
  )

  /** Cria as layers de uma combinação no canvas e as deixa selecionadas */
  const aplicar = React.useCallback(
    async (combo: Pick<FontCombination, 'id' | 'name' | 'elements'>) => {
      if (aplicando) return []
      setAplicando(true)
      try {
        await garantirFontes(combo.elements)

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
              fontFamily: element.fontFamily ?? resolveComboFontFamily(element.role, pair),
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
            ...(element.rotation ? { rotation: element.rotation } : {}),
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
      // Só durante a edição: miniaturas e export leem o stage ao vivo, então
      // deixar o escurecimento ligado sujaria a arte exportada
      setFocusTextMode(true)
      toast.info(`Editando "${combo.name}"`, {
        description: 'Ajuste no canvas e clique em Salvar alterações.',
      })
    },
    [aplicar, setFocusTextMode],
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
      setFocusTextMode(false)
    } catch {
      toast.error('Erro ao salvar alterações')
    }
  }, [editando, capturarPorIds, atualizar, setFocusTextMode])

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
      const rotulos = { titulo: 'Título', subtitulo: 'Subtítulo', corpo: 'Texto do corpo' }

      const canvasWidth = design.canvas.width
      const canvasHeight = design.canvas.height
      const escala = canvasWidth / COMBO_BASE_CANVAS_WIDTH
      const fontSize = Math.round(tamanhos[tipo] * escala)
      const width = Math.round(canvasWidth * 0.8)

      // Peso e entrelinha vêm do padrão do editor (regular, 1.0); o que muda
      // entre título, subtítulo e corpo é só o tamanho e a família
      const base = createDefaultLayer('text')
      const height = Math.round(fontSize * (base.style?.lineHeight ?? 1) * 2)

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
        {!marcaConfigurada && (
          <p className="text-[10px] leading-snug text-amber-500">
            Defina as duas fontes acima. Enquanto isso, as combinações usam{' '}
            {FONT_CONFIG.DEFAULT_FONT} em vez da identidade da marca.
          </p>
        )}
        {customFamilies.length === 0 && !isLoading && (
          <p className="text-[10px] leading-snug text-muted-foreground">
            Envie fontes na aba <strong>Fontes</strong> para usá-las aqui.
          </p>
        )}
      </div>

      {/* Barra de edição em andamento */}
      {editando && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">Editando “{editando.nome}”</p>
            <p className="text-[10px] text-muted-foreground">
              {editando.layerIds.length} texto(s) — imagens escurecidas durante o ajuste
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
              onClick={() => {
                setEditando(null)
                setFocusTextMode(false)
              }}
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
                canvasWidth={design.canvas.width}
                canvasHeight={design.canvas.height}
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

/**
 * Miniatura fiel da combinação: reproduz o canvas em escala, com cada texto na
 * sua posição, tamanho, cor e inclinação reais. Antes o card empilhava os
 * textos, o que escondia justamente o que a edição de posicionamento define.
 *
 * As medidas usam `cqw` (1% da largura do container), então a miniatura
 * acompanha qualquer largura de card sem recalcular nada em JS.
 */
function ComboCard({
  combo,
  pair,
  canvasWidth,
  canvasHeight,
  onApply,
  onEdit,
  onDelete,
}: {
  combo: FontCombination
  pair: FontComboPair
  canvasWidth: number
  canvasHeight: number
  onApply: () => void
  onEdit: () => void
  onDelete?: () => void
}) {
  // fontSize está em px na base 1080 de largura → vira % da largura do canvas
  const emCqw = (px: number) => `${(px / COMBO_BASE_CANVAS_WIDTH) * 100}cqw`

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onApply}
        title={combo.name}
        className="block w-full overflow-hidden rounded-md border border-border/40 transition hover:border-primary/60"
      >
        <div
          className="relative w-full"
          style={{
            containerType: 'inline-size',
            aspectRatio: `${canvasWidth} / ${canvasHeight}`,
            // inline: a classe arbitrária do Tailwind não estava sendo gerada,
            // e sem fundo escuro o texto branco some no card
            backgroundColor: '#141414',
          }}
        >
          {combo.elements.map((element) => (
            <span
              key={element.id}
              className="absolute block"
              style={{
                left: `${element.x * 100}%`,
                top: `${element.y * 100}%`,
                width: `${element.width * 100}%`,
                fontFamily: element.fontFamily ?? resolveComboFontFamily(element.role, pair),
                fontSize: emCqw(element.fontSize),
                fontWeight: Number(element.fontWeight) || 400,
                fontStyle: element.fontStyle ?? 'normal',
                color: element.color ?? '#FFFFFF',
                textAlign: element.textAlign ?? 'center',
                lineHeight: element.lineHeight,
                letterSpacing: element.letterSpacing ? emCqw(element.letterSpacing) : undefined,
                textTransform: element.textTransform === 'uppercase' ? 'uppercase' : 'none',
                transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                transformOrigin: 'top left',
                whiteSpace: 'pre-line',
              }}
            >
              {element.text}
            </span>
          ))}
        </div>
        <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">{combo.name}</p>
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
