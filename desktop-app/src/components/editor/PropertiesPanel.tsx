import type { ChangeEvent } from 'react'
import { useMemo } from 'react'
import { useBrandAssets } from '@/hooks/use-brand-assets'
import { useProjectColors } from '@/hooks/use-project-colors'
import { useProjectLogos } from '@/hooks/use-project-logos'
import PhotoSelector from '@/components/project/generate/PhotoSelector'
import { normalizeTextSafeArea } from '@/lib/editor/text-layout'
import { selectCurrentPageState, useEditorStore } from '@/stores/editor.store'
import { useProjectStore } from '@/stores/project.store'
import type {
  KonvaTextLayer,
  SafeAreaHorizontal,
  SafeAreaVertical,
  TextOverflowBehavior,
  TextTransform,
} from '@/types/template'

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  disabled = false,
}: {
  label: string
  value: number | undefined
  onChange: (value: number) => void
  step?: number
  disabled?: boolean
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? 0}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-10 w-full rounded-xl border border-border bg-input px-3 text-sm text-text focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">{label}</span>
      <input
        type="text"
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-border bg-input px-3 text-sm text-text focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  )
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: Array<{ label: string; value: T }>
  disabled?: boolean
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-10 w-full rounded-xl border border-border bg-input px-3 text-sm text-text focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-2xl border border-border bg-background/40 px-3 py-3 text-left transition-colors hover:border-primary/40"
    >
      <div>
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      </div>
      <span
        className={`inline-flex h-6 w-11 items-center rounded-full px-1 transition-colors ${
          checked ? 'bg-primary' : 'bg-border'
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}

function ColorField({
  label,
  value,
  onChange,
  palette,
}: {
  label: string
  value: string | undefined
  onChange: (value: string) => void
  palette: string[]
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">{label}</span>
      {palette.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-border bg-background/30 p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-subtle">Paleta do projeto</p>
          <div className="flex flex-wrap gap-2">
            {palette.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onChange(color)}
                className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-105 ${
                  value === color ? 'border-primary' : 'border-white/20'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-xl border border-border bg-input px-3 py-2">
        <input
          type="color"
          value={value ?? '#000000'}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-8 rounded border-0 bg-transparent p-0"
        />
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

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1 rounded-2xl border border-border/70 bg-background/20 px-3 py-3">
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="text-xs text-text-muted">{description}</p>
    </div>
  )
}

function uniqueColors(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

interface PropertiesPanelProps {
  availableFontFamilies?: string[]
}

export function PropertiesPanel({ availableFontFamilies = [] }: PropertiesPanelProps) {
  const currentProject = useProjectStore((state) => state.currentProject)
  const document = useEditorStore((state) => state.document)
  const currentPage = useEditorStore(selectCurrentPageState)
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const updateCurrentPage = useEditorStore((state) => state.updateCurrentPage)

  const { data: brandAssets } = useBrandAssets(currentProject?.id)
  const { data: projectColors } = useProjectColors(currentProject?.id)
  const { data: projectLogos } = useProjectLogos(currentProject?.id)

  const projectPalette = useMemo(
    () =>
      uniqueColors([
        ...(projectColors?.map((color) => color.hexCode) ?? []),
        ...(brandAssets?.colors ?? []),
        ...(document?.identity.colors ?? []),
      ]),
    [brandAssets?.colors, document?.identity.colors, projectColors],
  )

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

  const updateTextLayer = (updater: (layer: KonvaTextLayer) => KonvaTextLayer) => {
    if (!selectedLayer || (selectedLayer.type !== 'text' && selectedLayer.type !== 'rich-text')) {
      return
    }

    updateLayer(selectedLayer.id, (layer) => {
      if (layer.type !== 'text' && layer.type !== 'rich-text') {
        return layer
      }

      return updater(layer)
    })
  }

  const selectedTextLayer =
    selectedLayer && (selectedLayer.type === 'text' || selectedLayer.type === 'rich-text')
      ? selectedLayer
      : null

  const selectedImageLayer = selectedLayer?.type === 'image' ? selectedLayer : null
  const selectedLogoLayer = selectedLayer?.type === 'logo' ? selectedLayer : null
  const logoOptions = useMemo(() => {
    const options = projectLogos?.map((logo) => ({
      label: logo.name,
      value: logo.fileUrl,
    })) ?? []

    if (selectedLogoLayer?.src && !options.some((option) => option.value === selectedLogoLayer.src)) {
      options.unshift({
        label: 'Logo atual',
        value: selectedLogoLayer.src,
      })
    }

    return [{ label: 'Selecionar logo...', value: '' }, ...options]
  }, [projectLogos, selectedLogoLayer?.src])
  const selectedImagePhoto = selectedImageLayer?.src
    ? {
        url: selectedImageLayer.src,
        source: 'upload',
      }
    : null

  const applyImageLayerToCanvas = (nextSrc?: string) => {
    if (!selectedImageLayer) {
      return
    }

    updateLayer(selectedImageLayer.id, (layer) =>
      layer.type === 'image'
        ? {
            ...layer,
            src: nextSrc ?? layer.src,
            x: 0,
            y: 0,
            width: currentPage.width,
            height: currentPage.height,
            fit: 'cover',
            role: 'background',
          }
        : layer,
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card/60">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">Propriedades</h2>
        <p className="mt-1 text-xs text-text-muted">
          {selectedLayer ? 'Ajuste a layer selecionada.' : 'Sem layer selecionada: ajuste a página.'}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!selectedLayer ? (
          <>
            <SectionTitle
              title="Página"
              description="Nome, cor de fundo e dimensões ativas do formato atual."
            />
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
              palette={projectPalette}
              onChange={(value) =>
                updateCurrentPage((page) => ({
                  ...page,
                  background: value,
                }))
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Largura" value={currentPage.width} disabled onChange={() => {}} />
              <NumberField label="Altura" value={currentPage.height} disabled onChange={() => {}} />
            </div>
          </>
        ) : (
          <>
            <SectionTitle
              title="Layer"
              description="Posição, dimensões e propriedades específicas do tipo selecionado."
            />

            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">Nome da layer</span>
              <input
                type="text"
                value={selectedLayer.name ?? ''}
                onChange={updateSelectedLayerName}
                className="h-10 w-full rounded-xl border border-border bg-input px-3 text-sm text-text focus:border-primary focus:outline-none"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="X"
                value={selectedLayer.x}
                onChange={(value) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, x: value }))}
              />
              <NumberField
                label="Y"
                value={selectedLayer.y}
                onChange={(value) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, y: value }))}
              />
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

            {selectedTextLayer ? (
              <>
                <SectionTitle
                  title="Texto"
                  description="Microtipografia persistida no JSON do template, com overflow e ancoragem de safe-area."
                />

                <label className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">Conteúdo</span>
                  <textarea
                    rows={5}
                    value={selectedTextLayer.text}
                    onChange={(event) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        text: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Font size"
                    value={selectedTextLayer.textStyle?.fontSize}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: {
                          ...layer.textStyle,
                          fontSize: value,
                          maxFontSize:
                            (layer.textStyle?.overflowBehavior ?? 'clip') === 'autoScale'
                              ? Math.max(value, layer.textStyle?.maxFontSize ?? value)
                              : layer.textStyle?.maxFontSize,
                        },
                      }))
                    }
                  />
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
                      Font family
                    </span>
                    <select
                      value={selectedTextLayer.textStyle?.fontFamily ?? ''}
                      onChange={(event) =>
                        updateTextLayer((layer) => ({
                          ...layer,
                          textStyle: {
                            ...layer.textStyle,
                            fontFamily: event.target.value,
                          },
                        }))
                      }
                      className="h-10 w-full rounded-xl border border-border bg-input px-3 text-sm text-text focus:border-primary focus:outline-none"
                    >
                      <option value="">Selecionar fonte...</option>
                      {availableFontFamilies.map((fontFamily) => (
                        <option key={fontFamily} value={fontFamily}>
                          {fontFamily}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-text-subtle">
                      {availableFontFamilies.length > 1
                        ? `${availableFontFamilies.length} fontes do projeto disponiveis.`
                        : 'Nenhuma fonte customizada encontrada.'}
                    </p>
                  </label>
                  <NumberField
                    label="Line height"
                    value={selectedTextLayer.textStyle?.lineHeight}
                    step={0.05}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: {
                          ...layer.textStyle,
                          lineHeight: value,
                        },
                      }))
                    }
                  />
                  <NumberField
                    label="Letter spacing"
                    value={selectedTextLayer.textStyle?.letterSpacing}
                    step={0.5}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: {
                          ...layer.textStyle,
                          letterSpacing: value,
                        },
                      }))
                    }
                  />
                </div>

                <ColorField
                  label="Cor do texto"
                  value={selectedTextLayer.textStyle?.fill}
                  palette={projectPalette}
                  onChange={(value) =>
                    updateTextLayer((layer) => ({
                      ...layer,
                      textStyle: {
                        ...layer.textStyle,
                        fill: value,
                      },
                    }))
                  }
                />

                <div className="grid grid-cols-2 gap-3">
                  <SelectField<TextTransform>
                    label="Text transform"
                    value={selectedTextLayer.textStyle?.textTransform ?? 'none'}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: {
                          ...layer.textStyle,
                          textTransform: value,
                        },
                      }))
                    }
                    options={[
                      { label: 'Nenhum', value: 'none' },
                      { label: 'UPPERCASE', value: 'uppercase' },
                      { label: 'lowercase', value: 'lowercase' },
                      { label: 'Capitalize', value: 'capitalize' },
                    ]}
                  />
                  <SelectField<TextOverflowBehavior>
                    label="Overflow"
                    value={selectedTextLayer.textStyle?.overflowBehavior ?? 'clip'}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: {
                          ...layer.textStyle,
                          overflowBehavior: value,
                        },
                      }))
                    }
                    options={[
                      { label: 'Clip', value: 'clip' },
                      { label: 'Ellipsis', value: 'ellipsis' },
                      { label: 'Auto-scale', value: 'autoScale' },
                    ]}
                  />
                  <NumberField
                    label="Max lines"
                    value={selectedTextLayer.textStyle?.maxLines}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: {
                          ...layer.textStyle,
                          maxLines: value,
                        },
                      }))
                    }
                  />
                  <NumberField
                    label="Min font"
                    value={selectedTextLayer.textStyle?.minFontSize}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: {
                          ...layer.textStyle,
                          minFontSize: value,
                        },
                      }))
                    }
                    disabled={(selectedTextLayer.textStyle?.overflowBehavior ?? 'clip') !== 'autoScale'}
                  />
                  <NumberField
                    label="Max font"
                    value={selectedTextLayer.textStyle?.maxFontSize}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: {
                          ...layer.textStyle,
                          maxFontSize: value,
                        },
                      }))
                    }
                    disabled={(selectedTextLayer.textStyle?.overflowBehavior ?? 'clip') !== 'autoScale'}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <SelectField<'left' | 'center' | 'right' | 'justify'>
                    label="Alinhamento horizontal"
                    value={selectedTextLayer.textStyle?.align ?? 'left'}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: {
                          ...layer.textStyle,
                          align: value,
                        },
                      }))
                    }
                    options={[
                      { label: 'Esquerda', value: 'left' },
                      { label: 'Centro', value: 'center' },
                      { label: 'Direita', value: 'right' },
                      { label: 'Justificado', value: 'justify' },
                    ]}
                  />
                  <SelectField<'top' | 'middle' | 'bottom'>
                    label="Alinhamento vertical"
                    value={selectedTextLayer.textStyle?.verticalAlign ?? 'top'}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: {
                          ...layer.textStyle,
                          verticalAlign: value,
                        },
                      }))
                    }
                    options={[
                      { label: 'Topo', value: 'top' },
                      { label: 'Centro', value: 'middle' },
                      { label: 'Base', value: 'bottom' },
                    ]}
                  />
                </div>

                <ToggleField
                  label="Ancorar na safe-area"
                  description="Mantém a caixa de texto presa ao topo, centro ou base da área segura da página."
                  checked={selectedTextLayer.textStyle?.safeArea?.enabled === true}
                  onChange={(checked) =>
                    updateTextLayer((layer) =>
                      normalizeTextSafeArea(
                        currentPage,
                        layer,
                        checked,
                        layer.textStyle?.safeArea?.vertical,
                        layer.textStyle?.safeArea?.horizontal,
                      ),
                    )
                  }
                />

                {selectedTextLayer.textStyle?.safeArea?.enabled ? (
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField<SafeAreaVertical>
                      label="Anchor vertical"
                      value={selectedTextLayer.textStyle?.safeArea?.vertical ?? 'top'}
                      onChange={(value) =>
                        updateTextLayer((layer) =>
                          normalizeTextSafeArea(
                            currentPage,
                            layer,
                            true,
                            value,
                            layer.textStyle?.safeArea?.horizontal,
                          ),
                        )
                      }
                      options={[
                        { label: 'Topo', value: 'top' },
                        { label: 'Centro', value: 'center' },
                        { label: 'Base', value: 'bottom' },
                      ]}
                    />
                    <SelectField<SafeAreaHorizontal>
                      label="Anchor horizontal"
                      value={selectedTextLayer.textStyle?.safeArea?.horizontal ?? 'left'}
                      onChange={(value) =>
                        updateTextLayer((layer) =>
                          normalizeTextSafeArea(
                            currentPage,
                            layer,
                            true,
                            layer.textStyle?.safeArea?.vertical,
                            value,
                          ),
                        )
                      }
                      options={[
                        { label: 'Esquerda', value: 'left' },
                        { label: 'Centro', value: 'center' },
                        { label: 'Direita', value: 'right' },
                      ]}
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            {(selectedLayer.type === 'image' || selectedLayer.type === 'logo' || selectedLayer.type === 'icon') ? (
              <>
                <SectionTitle
                  title="Imagem"
                  description="Fonte da layer, encaixe e troca rápida de assets do projeto."
                />

                {selectedLogoLayer ? (
                  <SelectField<string>
                    label="Logo do projeto"
                    value={selectedLogoLayer.src ?? ''}
                    onChange={(value) =>
                      updateLayer(selectedLogoLayer.id, (layer) =>
                        layer.type === 'logo'
                          ? { ...layer, src: value }
                          : layer,
                      )
                    }
                    options={logoOptions}
                  />
                ) : null}

                <TextField
                  label="URL da imagem"
                  value={selectedLayer.src}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) =>
                      layer.type === 'image'
                        ? {
                            ...layer,
                            src: value,
                            x: 0,
                            y: 0,
                            width: currentPage.width,
                            height: currentPage.height,
                            fit: 'cover',
                            role: 'background',
                          }
                        : layer.type === 'logo' || layer.type === 'icon'
                          ? { ...layer, src: value }
                        : layer,
                    )
                  }
                />

                {selectedLayer.type === 'image' ? (
                  <>
                    {currentProject ? (
                      <div className="rounded-2xl border border-border bg-background/30 p-3">
                        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
                          Substituir imagem
                        </p>
                        <PhotoSelector
                          projectId={currentProject.id}
                          selectedPhoto={selectedImagePhoto}
                          onPhotoChange={(photo) => {
                            if (!photo?.url) {
                              updateLayer(selectedLayer.id, (layer) =>
                                layer.type === 'image' ? { ...layer, src: '' } : layer,
                              )
                              return
                            }

                            applyImageLayerToCanvas(photo.url)
                          }}
                          allowedTabs={['drive', 'upload']}
                        />
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => applyImageLayerToCanvas()}
                        className="h-10 rounded-xl border border-border px-3 text-sm text-text transition-colors hover:border-primary/40"
                      >
                        Ajustar ao canvas
                      </button>
                      <SelectField<'cover' | 'contain' | 'fill'>
                        label="Fit"
                        value={selectedLayer.fit ?? 'cover'}
                        onChange={(value) =>
                          updateLayer(selectedLayer.id, (layer) =>
                            layer.type === 'image'
                              ? { ...layer, fit: value }
                              : layer,
                          )
                        }
                        options={[
                          { label: 'Cover', value: 'cover' },
                          { label: 'Contain', value: 'contain' },
                          { label: 'Fill', value: 'fill' },
                        ]}
                      />
                    </div>

                    <SelectField<'background' | 'content'>
                      label="Modo da imagem"
                      value={selectedLayer.role === 'background' ? 'background' : 'content'}
                      onChange={(value) =>
                        updateLayer(selectedLayer.id, (layer) =>
                          layer.type === 'image'
                            ? { ...layer, role: value === 'background' ? 'background' : 'content' }
                            : layer,
                        )
                      }
                      options={[
                        { label: 'Fundo do canvas', value: 'background' },
                        { label: 'Layer comum', value: 'content' },
                      ]}
                    />
                  </>
                ) : null}
              </>
            ) : null}

            {selectedLayer.type === 'shape' ? (
              <>
                <SectionTitle
                  title="Shape"
                  description="Fill, stroke e raio da forma."
                />
                <ColorField
                  label="Fill"
                  value={selectedLayer.fill}
                  palette={projectPalette}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) =>
                      layer.type === 'shape' ? { ...layer, fill: value } : layer,
                    )
                  }
                />
                <ColorField
                  label="Stroke"
                  value={selectedLayer.stroke}
                  palette={projectPalette}
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
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
