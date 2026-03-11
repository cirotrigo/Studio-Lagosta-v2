import type { ChangeEvent } from 'react'
import { selectCurrentPageState, useEditorStore } from '@/stores/editor.store'

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number | undefined
  onChange: (value: number) => void
  step?: number
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? 0}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
      />
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | undefined
  onChange: (value: string) => void
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">{label}</span>
      <input
        type="text"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
      />
    </label>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | undefined
  onChange: (value: string) => void
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">{label}</span>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-input px-3 py-2">
        <input type="color" value={value ?? '#000000'} onChange={(event) => onChange(event.target.value)} className="h-8 w-8 rounded border-0 bg-transparent p-0" />
        <input
          type="text"
          value={value ?? '#000000'}
          onChange={(event) => onChange(event.target.value)}
          className="flex-1 bg-transparent text-sm text-text focus:outline-none"
        />
      </div>
    </label>
  )
}

export function PropertiesPanel() {
  const currentPage = useEditorStore(selectCurrentPageState)
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const updateCurrentPage = useEditorStore((state) => state.updateCurrentPage)

  if (!currentPage) {
    return null
  }

  const selectedLayer =
    selectedLayerIds.length === 1
      ? currentPage.layers.find((layer) => layer.id === selectedLayerIds[0]) ?? null
      : null

  const updateSelectedLayerName = (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedLayer) {
      return
    }

    updateLayer(selectedLayer.id, (layer) => ({
      ...layer,
      name: event.target.value,
    }))
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card/60">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">Propriedades</h2>
        <p className="mt-1 text-xs text-text-muted">
          {selectedLayer ? 'Ajuste a layer selecionada.' : 'Sem layer selecionada: ajuste a página.'}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!selectedLayer ? (
          <>
            <TextField
              label="Nome da página"
              value={currentPage.name}
              onChange={(value) =>
                updateCurrentPage((page) => ({
                  ...page,
                  name: value,
                }))
              }
            />
            <ColorField
              label="Background"
              value={currentPage.background}
              onChange={(value) =>
                updateCurrentPage((page) => ({
                  ...page,
                  background: value,
                }))
              }
            />

            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Largura" value={currentPage.width} onChange={() => {}} />
              <NumberField label="Altura" value={currentPage.height} onChange={() => {}} />
            </div>
          </>
        ) : (
          <>
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">Nome da layer</span>
              <input
                type="text"
                value={selectedLayer.name ?? ''}
                onChange={updateSelectedLayerName}
                className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <NumberField label="X" value={selectedLayer.x} onChange={(value) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, x: value }))} />
              <NumberField label="Y" value={selectedLayer.y} onChange={(value) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, y: value }))} />
              <NumberField
                label="Largura"
                value={selectedLayer.width}
                onChange={(value) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, width: value }))}
              />
              <NumberField
                label="Altura"
                value={selectedLayer.height}
                onChange={(value) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, height: value }))}
              />
              <NumberField
                label="Rotação"
                value={selectedLayer.rotation}
                onChange={(value) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, rotation: value }))}
              />
              <NumberField
                label="Opacidade"
                value={selectedLayer.opacity ?? 1}
                step={0.05}
                onChange={(value) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, opacity: value }))}
              />
            </div>

            {(selectedLayer.type === 'text' || selectedLayer.type === 'rich-text') && (
              <>
                <label className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">Conteúdo</span>
                  <textarea
                    rows={5}
                    value={selectedLayer.text}
                    onChange={(event) =>
                      updateLayer(selectedLayer.id, (layer) =>
                        layer.type === 'text' || layer.type === 'rich-text'
                          ? { ...layer, text: event.target.value }
                          : layer,
                      )
                    }
                    className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Font size"
                    value={selectedLayer.textStyle?.fontSize}
                    onChange={(value) =>
                      updateLayer(selectedLayer.id, (layer) =>
                        layer.type === 'text' || layer.type === 'rich-text'
                          ? {
                              ...layer,
                              textStyle: {
                                ...layer.textStyle,
                                fontSize: value,
                              },
                            }
                          : layer,
                      )
                    }
                  />
                  <TextField
                    label="Font family"
                    value={selectedLayer.textStyle?.fontFamily}
                    onChange={(value) =>
                      updateLayer(selectedLayer.id, (layer) =>
                        layer.type === 'text' || layer.type === 'rich-text'
                          ? {
                              ...layer,
                              textStyle: {
                                ...layer.textStyle,
                                fontFamily: value,
                              },
                            }
                          : layer,
                      )
                    }
                  />
                </div>

                <ColorField
                  label="Cor do texto"
                  value={selectedLayer.textStyle?.fill}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) =>
                      layer.type === 'text' || layer.type === 'rich-text'
                        ? {
                            ...layer,
                            textStyle: {
                              ...layer.textStyle,
                              fill: value,
                            },
                          }
                        : layer,
                    )
                  }
                />
              </>
            )}

            {(selectedLayer.type === 'image' || selectedLayer.type === 'logo' || selectedLayer.type === 'icon') && (
              <>
                <TextField
                  label="URL da imagem"
                  value={selectedLayer.src}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) =>
                      layer.type === 'image' || layer.type === 'logo' || layer.type === 'icon'
                        ? { ...layer, src: value }
                        : layer,
                    )
                  }
                />
                {selectedLayer.type === 'image' ? (
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">Fit</span>
                    <select
                      value={selectedLayer.fit ?? 'cover'}
                      onChange={(event) =>
                        updateLayer(selectedLayer.id, (layer) =>
                          layer.type === 'image'
                            ? { ...layer, fit: event.target.value as 'cover' | 'contain' | 'fill' }
                            : layer,
                        )
                      }
                      className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                    >
                      <option value="cover">cover</option>
                      <option value="contain">contain</option>
                      <option value="fill">fill</option>
                    </select>
                  </label>
                ) : null}
              </>
            )}

            {selectedLayer.type === 'shape' && (
              <>
                <ColorField
                  label="Fill"
                  value={selectedLayer.fill}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) =>
                      layer.type === 'shape' ? { ...layer, fill: value } : layer,
                    )
                  }
                />
                <ColorField
                  label="Stroke"
                  value={selectedLayer.stroke}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) =>
                      layer.type === 'shape' ? { ...layer, stroke: value } : layer,
                    )
                  }
                />
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Stroke width"
                    value={selectedLayer.strokeWidth}
                    onChange={(value) =>
                      updateLayer(selectedLayer.id, (layer) =>
                        layer.type === 'shape' ? { ...layer, strokeWidth: value } : layer,
                      )
                    }
                  />
                  <NumberField
                    label="Radius"
                    value={selectedLayer.cornerRadius}
                    onChange={(value) =>
                      updateLayer(selectedLayer.id, (layer) =>
                        layer.type === 'shape' ? { ...layer, cornerRadius: value } : layer,
                      )
                    }
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
