"use client"

import * as React from 'react'
import { GRADIENTS_LIBRARY } from '@/lib/assets/gradients-library'
import { useTemplateEditor, createDefaultLayer } from '@/contexts/template-editor-context'
import { useBrandColors } from '@/hooks/use-brand-colors'
import { corEscuraDaMarca, presetHalo } from '@/lib/creatives/halo/fundo-de-texto'
import { GradientEditor } from '@/components/templates/gradient-editor'
import { FundoDeTextoControls } from '@/components/templates/fundo-de-texto-controls'
import { Button } from '@/components/ui/button'

export function GradientsPanel() {
  const { addLayer, design, selectedLayerId, selectedLayerIds, updateLayer, projectId } = useTemplateEditor()
  const { data: cores = [] } = useBrandColors(projectId ?? null)

  // Verifica se há uma layer de gradiente selecionada
  const selectedLayer = React.useMemo(
    () => design.layers.find((layer) => layer.id === selectedLayerId && (layer.type === 'gradient' || layer.type === 'gradient2')),
    [design.layers, selectedLayerId]
  )

  // O halo é efeito de TEXTO: com um texto selecionado, os controles dele
  // aparecem aqui (o mesmo componente do painel Efeitos); sem seleção, o
  // botão aplica o preset a todos os textos visíveis — uma seleção de vários
  // textos limita a eles.
  const textosSelecionados = React.useMemo(
    () => design.layers.filter((layer) => layer.type === 'text' && selectedLayerIds.includes(layer.id)),
    [design.layers, selectedLayerIds],
  )
  const textosVisiveis = React.useMemo(
    () => design.layers.filter((layer) => layer.type === 'text' && layer.visible !== false),
    [design.layers],
  )
  const alvosDoHalo = textosSelecionados.length > 0 ? textosSelecionados : textosVisiveis
  const textoSelecionado = textosSelecionados.length === 1 ? textosSelecionados[0] : null
  // Vários textos selecionados sem um grupo em comum: cada um ganharia a
  // própria mancha, e manchas vizinhas se sobrepõem. Agrupar (Cmd+G) faz o
  // bloco-de-fundo desenhar uma só.
  const semGrupoComum =
    textosSelecionados.length > 1 &&
    new Set(textosSelecionados.map((l) => (typeof l.metadata?.groupId === 'string' ? l.metadata.groupId : ''))).size !== 1

  const aplicarHaloEmLote = React.useCallback(() => {
    if (alvosDoHalo.length === 0) return
    const cor = corEscuraDaMarca(cores, design.layers)
    // Um gesto = um passo de undo, mesmo tocando N camadas
    const coalesceKey = `halo-em-lote:${Date.now()}`
    for (const layer of alvosDoHalo) {
      updateLayer(
        layer.id,
        (l) => ({ ...l, effects: { ...l.effects, background: presetHalo(cor, l.effects?.background) } }),
        { coalesceKey },
      )
    }
  }, [alvosDoHalo, cores, design.layers, updateLayer])

  const handleAddGradient = React.useCallback(
    (gradientId: string) => {
      const definition = GRADIENTS_LIBRARY.find((item) => item.id === gradientId)
      if (!definition) return

      const base = createDefaultLayer('gradient')
      addLayer({
        ...base,
        name: `Gradiente - ${definition.label}`,
        position: { x: 0, y: 0 },
        size: { width: design.canvas.width, height: design.canvas.height },
        style: {
          ...base.style,
          gradientType: definition.gradientType,
          gradientAngle: definition.gradientAngle,
          gradientStops: definition.gradientStops,
        },
      })
    },
    [addLayer, design.canvas.width, design.canvas.height],
  )

  return (
    <div className="space-y-4">
      {/* Halo nos textos: a mancha desfocada atrás da tinta, sem véu */}
      <div className="space-y-3 rounded-lg border border-border/40 bg-muted/20 p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Halo nos textos</h3>
          <p className="text-xs text-muted-foreground">
            Uma mancha escura e desfocada só atrás das letras — a foto continua nítida por baixo.
            {textosSelecionados.length > 1
              ? ` Aplica aos ${textosSelecionados.length} textos selecionados.`
              : textoSelecionado
                ? ' Aplica ao texto selecionado.'
                : textosVisiveis.length > 0
                  ? ` Aplica aos ${textosVisiveis.length} textos da página.`
                  : ' A página ainda não tem texto.'}
          </p>
        </div>
        <Button type="button" size="sm" onClick={aplicarHaloEmLote} disabled={alvosDoHalo.length === 0}>
          Aplicar halo
        </Button>
        {semGrupoComum && (
          <p className="text-[10px] leading-snug text-muted-foreground">
            Textos agrupados (Cmd+G) dividem uma mancha só — sem grupo, cada um ganha a sua, e manchas vizinhas se sobrepõem.
          </p>
        )}
        {textoSelecionado && <FundoDeTextoControls layer={textoSelecionado} />}
      </div>

      {/* Controles de edição (se houver gradiente selecionado) */}
      {selectedLayer && (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-primary">Editar Gradiente Selecionado</h3>
            <p className="text-xs text-muted-foreground">Ajuste as propriedades do gradiente</p>
          </div>
          <GradientEditor layerId={selectedLayer.id} />
        </div>
      )}

      {/* Templates pré-definidos */}
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Templates de Gradientes</h3>
          <p className="text-xs text-muted-foreground">Clique para adicionar ao canvas (tamanho completo)</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {GRADIENTS_LIBRARY.map((gradient) => (
            <button
              key={gradient.id}
              type="button"
              onClick={() => handleAddGradient(gradient.id)}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border/40 bg-muted/40 p-3 transition hover:border-primary hover:shadow-md"
            >
              <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded bg-white">
                <GradientPreview gradient={gradient} />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{gradient.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface GradientPreviewProps {
  gradient: typeof GRADIENTS_LIBRARY[0]
}

function GradientPreview({ gradient }: GradientPreviewProps) {
  const stops = [...gradient.gradientStops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => {
      const r = parseInt(stop.color.slice(1, 3), 16)
      const g = parseInt(stop.color.slice(3, 5), 16)
      const b = parseInt(stop.color.slice(5, 7), 16)
      return `rgba(${r}, ${g}, ${b}, ${stop.opacity}) ${stop.position * 100}%`
    })
    .join(', ')

  const gradientStyle =
    gradient.gradientType === 'linear'
      ? `linear-gradient(${gradient.gradientAngle}deg, ${stops})`
      : `radial-gradient(circle, ${stops})`

  return (
    <div
      className="h-full w-full"
      style={{
        background: gradientStyle,
      }}
    />
  )
}
