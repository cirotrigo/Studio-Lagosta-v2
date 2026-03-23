import type { ChangeEvent } from 'react'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Type, Move, Image as ImageIcon, Paintbrush, Layout, Settings2, Palette, Sparkles } from 'lucide-react'
import { useBrandAssets } from '@/hooks/use-brand-assets'
import { useProjectColors } from '@/hooks/use-project-colors'
import { useProjectLogos } from '@/hooks/use-project-logos'
import PhotoSelector from '@/components/project/generate/PhotoSelector'
import { EffectsPanel } from './properties/EffectsPanel'
import { ShapeStylePanel } from './properties/ShapeStylePanel'
import { TextTypographySection } from './properties/TextTypographySection'
import { TextColorSection } from './properties/TextColorSection'
import { normalizeTextSafeArea } from '@/lib/editor/text-layout'
import { selectCurrentPageState, useEditorStore } from '@/stores/editor.store'
import { useProjectStore } from '@/stores/project.store'
import type {
  KonvaShapeLayer,
  KonvaTextLayer,
  LayerEffects,
  SafeAreaHorizontal,
  SafeAreaVertical,
  TextOverflowBehavior,
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
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? 0}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="input-field h-10 disabled:cursor-not-allowed disabled:opacity-50"
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
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">{label}</span>
      <input
        type="text"
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="input-field h-10 disabled:cursor-not-allowed disabled:opacity-50"
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
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className="input-field h-10 disabled:cursor-not-allowed disabled:opacity-50"
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
      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left transition-all duration-150 hover:bg-white/10 hover:border-primary/40"
    >
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-1 text-xs text-white/50">{description}</p>
      </div>
      <span
        className={`inline-flex h-6 w-11 items-center rounded-full px-1 transition-colors ${
          checked ? 'bg-primary' : 'bg-white/20'
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
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">{label}</span>
      {palette.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">Paleta do projeto</p>
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

      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
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
          className="flex-1 bg-transparent text-sm text-white focus:outline-none"
        />
      </div>
    </label>
  )
}

function PanelGroup({ title, icon: Icon, defaultOpen = true, children }: { title: string, icon?: React.ElementType, defaultOpen?: boolean, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  
  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3 py-3 hover:bg-white/5 transition-colors focus:outline-none"
      >
        <div className="flex items-center gap-2.5">
          {Icon && <Icon size={14} className="text-orange-500/80" />}
          <span className="text-sm font-semibold text-white/90 tracking-wide">{title}</span>
        </div>
        <div className="text-white/40">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
}: {
  label: string
  value: number | undefined
  min: number
  max: number
  step?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const safeValue = value ?? 0
  return (
    <label className="space-y-2 block">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full h-1.5 rounded-full appearance-none outline-none disabled:opacity-50 cursor-pointer bg-white/10 accent-orange-500"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-16 h-7 text-xs text-center bg-black/50 border border-white/10 rounded-md text-white/90 focus:border-orange-500/50 outline-none shadow-inner"
        />
      </div>
    </label>
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
    <div className="panel-glass flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Propriedades</h2>
        <p className="mt-1 text-xs text-white/50">
          {selectedLayer ? 'Ajuste a layer selecionada.' : 'Sem layer selecionada: ajuste a pagina.'}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!selectedLayer ? (
          <PanelGroup title="Configurações da Página" icon={Layout}>
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
          </PanelGroup>
        ) : (
          <>
            {selectedTextLayer ? (
              <>
                {/* Typography (Figma-style) - first section for text layers */}
                <PanelGroup title="Tipografia" icon={Type}>
                  <TextTypographySection
                    layer={selectedTextLayer}
                    availableFontFamilies={availableFontFamilies}
                    onUpdate={updateTextLayer}
                  />
                </PanelGroup>

                {/* Color */}
                <PanelGroup title="Cor" icon={Palette}>
                  <TextColorSection
                    value={selectedTextLayer.textStyle?.fill ?? '#111827'}
                    palette={projectPalette}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: { ...layer.textStyle, fill: value },
                      }))
                    }
                  />
                </PanelGroup>

                {/* Effects */}
                <PanelGroup title="Efeitos" icon={Sparkles}>
                  <EffectsPanel
                    layer={selectedTextLayer}
                    onUpdateEffects={(effects) =>
                      updateLayer(selectedTextLayer.id, (layer) => ({
                        ...layer,
                        effects,
                      }))
                    }
                  />
                </PanelGroup>

                {/* Advanced (collapsed) - includes layout/position + overflow + safe area */}
                <PanelGroup title="Avancado" icon={Settings2} defaultOpen={false}>
                  {/* Layout & Position */}
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Nome da layer</span>
                    <input
                      type="text"
                      value={selectedLayer.name ?? ''}
                      onChange={updateSelectedLayerName}
                      className="input-field h-9 text-sm w-full"
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
                  </div>

                  <SliderField
                    label="Rotacao (Graus)"
                    value={selectedLayer.rotation}
                    min={0}
                    max={360}
                    step={1}
                    onChange={(value) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, rotation: value }))}
                  />
                  <SliderField
                    label="Opacidade (%)"
                    value={Math.round((selectedLayer.opacity ?? 1) * 100)}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(value) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, opacity: value / 100 }))}
                  />

                  <div className="border-t border-white/5 pt-3 mt-2" />

                  <SelectField<TextOverflowBehavior>
                    label="Overflow"
                    value={selectedTextLayer.textStyle?.overflowBehavior ?? 'clip'}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: { ...layer.textStyle, overflowBehavior: value },
                      }))
                    }
                    options={[
                      { label: 'Cortar', value: 'clip' },
                      { label: 'Reticencias (...)', value: 'ellipsis' },
                      { label: 'Auto-escala', value: 'autoScale' },
                    ]}
                  />

                  <SliderField
                    label="Max linhas (0 = ilimitado)"
                    value={selectedTextLayer.textStyle?.maxLines ?? 0}
                    min={0}
                    max={20}
                    step={1}
                    onChange={(value) =>
                      updateTextLayer((layer) => ({
                        ...layer,
                        textStyle: { ...layer.textStyle, maxLines: value > 0 ? value : undefined },
                      }))
                    }
                  />

                  {selectedTextLayer.textStyle?.overflowBehavior === 'autoScale' && (
                    <div className="grid grid-cols-2 gap-3 mt-2 border-t border-white/5 pt-3">
                      <NumberField
                        label="Min font"
                        value={selectedTextLayer.textStyle?.minFontSize ?? 12}
                        onChange={(value) =>
                          updateTextLayer((layer) => ({
                            ...layer,
                            textStyle: { ...layer.textStyle, minFontSize: value },
                          }))
                        }
                      />
                      <NumberField
                        label="Max font"
                        value={selectedTextLayer.textStyle?.maxFontSize ?? 100}
                        onChange={(value) =>
                          updateTextLayer((layer) => ({
                            ...layer,
                            textStyle: { ...layer.textStyle, maxFontSize: value },
                          }))
                        }
                      />
                    </div>
                  )}

                  <ToggleField
                    label="Safe Area"
                    description="Ancora o texto na zona segura."
                    checked={selectedTextLayer.textStyle?.safeArea?.enabled === true}
                    onChange={(checked) =>
                      updateTextLayer((layer) =>
                        normalizeTextSafeArea(
                          currentPage, layer, checked,
                          layer.textStyle?.safeArea?.vertical,
                          layer.textStyle?.safeArea?.horizontal,
                        ),
                      )
                    }
                  />

                  {selectedTextLayer.textStyle?.safeArea?.enabled ? (
                    <div className="grid grid-cols-2 gap-3">
                      <SelectField<SafeAreaVertical>
                        label="Ancora V"
                        value={selectedTextLayer.textStyle?.safeArea?.vertical ?? 'top'}
                        onChange={(value) =>
                          updateTextLayer((layer) =>
                            normalizeTextSafeArea(currentPage, layer, true, value, layer.textStyle?.safeArea?.horizontal),
                          )
                        }
                        options={[
                          { label: 'Topo', value: 'top' },
                          { label: 'Centro', value: 'center' },
                          { label: 'Base', value: 'bottom' },
                        ]}
                      />
                      <SelectField<SafeAreaHorizontal>
                        label="Ancora H"
                        value={selectedTextLayer.textStyle?.safeArea?.horizontal ?? 'left'}
                        onChange={(value) =>
                          updateTextLayer((layer) =>
                            normalizeTextSafeArea(currentPage, layer, true, layer.textStyle?.safeArea?.vertical, value),
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
                </PanelGroup>
              </>
            ) : (
              /* Non-text layers: show Layout & Position at top level */
              <>
                <PanelGroup title="Layout & Posicao" icon={Move}>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Nome da layer</span>
                    <input
                      type="text"
                      value={selectedLayer.name ?? ''}
                      onChange={updateSelectedLayerName}
                      className="input-field h-9 text-sm w-full"
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
                  </div>

                  <SliderField
                    label="Rotacao (Graus)"
                    value={selectedLayer.rotation}
                    min={0}
                    max={360}
                    step={1}
                    onChange={(value) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, rotation: value }))}
                  />
                  <SliderField
                    label="Opacidade (%)"
                    value={Math.round((selectedLayer.opacity ?? 1) * 100)}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(value) => updateLayer(selectedLayer.id, (layer) => ({ ...layer, opacity: value / 100 }))}
                  />
                </PanelGroup>
              </>
            )}

            {(selectedLayer.type === 'image' || selectedLayer.type === 'logo' || selectedLayer.type === 'icon') ? (
              <PanelGroup title="Configurações de Imagem/Logo" icon={ImageIcon}>

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
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-white/40">
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
                        className="btn-secondary h-10"
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
              </PanelGroup>
            ) : null}

            {selectedLayer.type === 'shape' ? (
              <ShapeStylePanel
                layer={selectedLayer as KonvaShapeLayer}
                palette={projectPalette}
                onUpdate={(updates) =>
                  updateLayer(selectedLayer.id, (layer) =>
                    layer.type === 'shape' ? { ...layer, ...updates } : layer,
                  )
                }
              />
            ) : null}

            {(selectedLayer.type === 'gradient' || selectedLayer.type === 'gradient2') ? (
              <PanelGroup title="Gradiente e Cores" icon={Paintbrush}>
                <SelectField<'linear' | 'radial'>
                  label="Tipo"
                  value={selectedLayer.gradientType ?? 'linear'}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, (layer) =>
                      layer.type === 'gradient' || layer.type === 'gradient2'
                        ? { ...layer, gradientType: value }
                        : layer,
                    )
                  }
                  options={[
                    { label: 'Linear', value: 'linear' },
                    { label: 'Radial', value: 'radial' },
                  ]}
                />
                {(selectedLayer.gradientType ?? 'linear') === 'linear' ? (
                  <NumberField
                    label="Ângulo"
                    value={selectedLayer.angle ?? 180}
                    onChange={(value) =>
                      updateLayer(selectedLayer.id, (layer) =>
                        layer.type === 'gradient' || layer.type === 'gradient2'
                          ? { ...layer, angle: value }
                          : layer,
                      )
                    }
                  />
                ) : null}
                <div className="space-y-3">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">
                    Color Stops
                  </span>
                  {(selectedLayer.colors ?? ['#ffffff', '#000000']).map((color, index) => (
                    <div key={index} className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/50">Stop {index + 1}</span>
                        {(selectedLayer.colors ?? []).length > 2 ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateLayer(selectedLayer.id, (layer) => {
                                if (layer.type !== 'gradient' && layer.type !== 'gradient2') return layer
                                const currentColors = layer.colors ?? ['#ffffff', '#000000']
                                const newColors = [...currentColors]
                                const newStops = [...(layer.stops ?? [])]
                                const newOpacities = [...(layer.opacities ?? [])]
                                newColors.splice(index, 1)
                                newStops.splice(index, 1)
                                newOpacities.splice(index, 1)
                                return { ...layer, colors: newColors, stops: newStops, opacities: newOpacities }
                              })
                            }
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remover
                          </button>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={color}
                          onChange={(event) =>
                            updateLayer(selectedLayer.id, (layer) => {
                              if (layer.type !== 'gradient' && layer.type !== 'gradient2') return layer
                              const newColors = [...(layer.colors ?? ['#ffffff', '#000000'])]
                              newColors[index] = event.target.value
                              return { ...layer, colors: newColors }
                            })
                          }
                          className="h-8 w-8 rounded border-0 bg-transparent p-0"
                        />
                        <input
                          type="text"
                          value={color}
                          onChange={(event) =>
                            updateLayer(selectedLayer.id, (layer) => {
                              if (layer.type !== 'gradient' && layer.type !== 'gradient2') return layer
                              const newColors = [...(layer.colors ?? ['#ffffff', '#000000'])]
                              newColors[index] = event.target.value
                              return { ...layer, colors: newColors }
                            })
                          }
                          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-[10px] text-white/40">Posição (%)</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={Math.round((selectedLayer.stops?.[index] ?? index / Math.max((selectedLayer.colors ?? []).length - 1, 1)) * 100)}
                            onChange={(event) =>
                              updateLayer(selectedLayer.id, (layer) => {
                                if (layer.type !== 'gradient' && layer.type !== 'gradient2') return layer
                                const currentColors = layer.colors ?? ['#ffffff', '#000000']
                                const newStops = layer.stops?.length === currentColors.length
                                  ? [...layer.stops]
                                  : currentColors.map((_, i) => i / Math.max(currentColors.length - 1, 1))
                                newStops[index] = Math.min(100, Math.max(0, Number(event.target.value))) / 100
                                return { ...layer, stops: newStops }
                              })
                            }
                            className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[10px] text-white/40">Opacidade (%)</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={Math.round((selectedLayer.opacities?.[index] ?? 1) * 100)}
                            onChange={(event) =>
                              updateLayer(selectedLayer.id, (layer) => {
                                if (layer.type !== 'gradient' && layer.type !== 'gradient2') return layer
                                const currentColors = layer.colors ?? ['#ffffff', '#000000']
                                const newOpacities = layer.opacities?.length === currentColors.length
                                  ? [...layer.opacities]
                                  : currentColors.map(() => 1)
                                newOpacities[index] = Math.min(100, Math.max(0, Number(event.target.value))) / 100
                                return { ...layer, opacities: newOpacities }
                              })
                            }
                            className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  {(selectedLayer.colors ?? []).length < 6 ? (
                    <button
                      type="button"
                      onClick={() =>
                        updateLayer(selectedLayer.id, (layer) => {
                          if (layer.type !== 'gradient' && layer.type !== 'gradient2') return layer
                          const currentColors = layer.colors ?? ['#ffffff', '#000000']
                          const newColors = [...currentColors, '#888888']
                          const newStops = layer.stops?.length === currentColors.length
                            ? [...layer.stops, 1]
                            : newColors.map((_, i) => i / Math.max(newColors.length - 1, 1))
                          const newOpacities = layer.opacities?.length === currentColors.length
                            ? [...layer.opacities, 1]
                            : newColors.map(() => 1)
                          return { ...layer, colors: newColors, stops: newStops, opacities: newOpacities }
                        })
                      }
                      className="w-full rounded-xl border border-dashed border-white/20 py-2 text-xs text-white/50 hover:border-primary/50 hover:text-white transition-colors"
                    >
                      + Adicionar cor
                    </button>
                  ) : null}
                </div>
              </PanelGroup>
            ) : null}

            {/* Painel de Efeitos - apenas para layers nao-texto (texto ja tem dentro da sua secao) */}
            {!selectedTextLayer && (
              <PanelGroup title="Efeitos" icon={Sparkles} defaultOpen={false}>
                <EffectsPanel
                  layer={selectedLayer}
                  onUpdateEffects={(effects: LayerEffects) =>
                    updateLayer(selectedLayer.id, (layer) => ({ ...layer, effects }))
                  }
                />
              </PanelGroup>
            )}
          </>
        )}
      </div>
    </div>
  )
}
