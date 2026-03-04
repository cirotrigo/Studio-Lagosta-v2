import { useState, useEffect } from 'react'
import { Loader2, Check, ChevronDown } from 'lucide-react'
import { useBrandAssets, useUpdateArtPreferences, type TextColorPreferences } from '@/hooks/use-brand-assets'
import { toast } from 'sonner'

interface BrandAssetsSectionProps {
  projectId: number
}

const COLOR_ROLE_LABELS: Record<keyof TextColorPreferences, string> = {
  titleColor: 'Cor do Título',
  subtitleColor: 'Cor do Subtítulo',
  infoColor: 'Cor de Informações',
  ctaColor: 'Cor do CTA',
}

function ColorSelector({
  label,
  value,
  brandColors,
  onChange,
}: {
  label: string
  value: string
  brandColors: string[]
  onChange: (color: string) => void
}) {
  // Always include white as an option
  const options = [...new Set([...brandColors, '#FFFFFF'])]

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      <div className="flex items-center gap-2">
        {options.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`h-7 w-7 rounded-full border-2 transition-all hover:scale-110 ${
              value.toLowerCase() === color.toLowerCase()
                ? 'border-primary ring-2 ring-primary/30'
                : 'border-border'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value
            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v)
          }}
          className="w-20 rounded-md border border-border bg-input px-2 py-1 font-mono text-xs text-text focus:border-primary focus:outline-none"
          placeholder="#FFFFFF"
        />
      </div>
    </div>
  )
}

export default function BrandAssetsSection({ projectId }: BrandAssetsSectionProps) {
  const { data: assets, isLoading, error } = useBrandAssets(projectId)
  const updatePreferences = useUpdateArtPreferences(projectId)
  
  const [titleFont, setTitleFont] = useState<string | null>(null)
  const [bodyFont, setBodyFont] = useState<string | null>(null)
  const [textColors, setTextColors] = useState<TextColorPreferences | null>(null)
  const [overlayStyle, setOverlayStyle] = useState<'gradient' | 'solid'>('gradient')
  const [hasChanges, setHasChanges] = useState(false)

  // Sync local state with server data
  useEffect(() => {
    if (assets) {
      setTitleFont(assets.titleFontFamily)
      setBodyFont(assets.bodyFontFamily)
      setTextColors(assets.textColorPreferences)
      setOverlayStyle(assets.overlayStyle ?? 'gradient')
    }
  }, [assets])

  // Track changes
  useEffect(() => {
    if (assets) {
      const fontChanged = titleFont !== assets.titleFontFamily || bodyFont !== assets.bodyFontFamily
      const colorChanged = JSON.stringify(textColors) !== JSON.stringify(assets.textColorPreferences)
      const overlayChanged = overlayStyle !== (assets.overlayStyle ?? 'gradient')
      setHasChanges(fontChanged || colorChanged || overlayChanged)
    }
  }, [titleFont, bodyFont, textColors, overlayStyle, assets])

  const handleSave = async () => {
    try {
      await updatePreferences.mutateAsync({
        titleFontFamily: titleFont,
        bodyFontFamily: bodyFont,
        textColorPreferences: textColors,
        overlayStyle,
      })
      toast.success('Preferências salvas!')
    } catch (e) {
      toast.error('Erro ao salvar preferências')
    }
  }

  const handleColorChange = (key: keyof TextColorPreferences, color: string) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      // Allow partial typing
      setTextColors((prev) => prev ? { ...prev, [key]: color } : { titleColor: '#FFFFFF', subtitleColor: '#FFFFFF', infoColor: '#FFFFFF', ctaColor: '#FFFFFF', [key]: color })
      return
    }
    setTextColors((prev) => {
      const base = prev ?? { titleColor: '#FFFFFF', subtitleColor: '#FFFFFF', infoColor: '#FFFFFF', ctaColor: '#FFFFFF' }
      return { ...base, [key]: color }
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Assets da Marca</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </div>
    )
  }

  if (error || !assets) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-text">Assets da Marca</h2>
        <p className="text-sm text-text-muted">Erro ao carregar assets</p>
      </div>
    )
  }

  const fontOptions = [
    { value: null, label: 'Padrão (Inter)' },
    ...assets.fonts.map((f) => ({ value: f.fontFamily, label: f.name })),
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Assets da Marca</h2>
        <span className="text-xs text-text-subtle">
          Para alterar, edite no Studio Lagosta web
        </span>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {/* Logo */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-muted">Logo</label>
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
            {assets.logo?.url ? (
              <img
                src={assets.logo.url}
                alt="Logo"
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/10 text-2xl font-bold text-primary">
                {assets.name?.charAt(0) || '?'}
              </div>
            )}
          </div>
        </div>

        {/* Colors */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-muted">Cores</label>
          {assets.colors && assets.colors.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {assets.colors.map((color, idx) => (
                <div
                  key={idx}
                  className="group relative h-8 w-8 rounded-full border-2 border-border shadow-sm transition-transform hover:scale-110"
                  style={{ backgroundColor: color }}
                  title={color}
                >
                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-card px-1.5 py-0.5 text-[10px] text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
                    {color}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-subtle">Nenhuma cor definida</p>
          )}
        </div>

        {/* Fonts */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-muted">Fontes Disponíveis</label>
          {assets.fonts && assets.fonts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {assets.fonts.map((font, idx) => (
                <span
                  key={idx}
                  className="rounded-md bg-input px-2.5 py-1 font-mono text-sm text-text"
                >
                  {font.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-subtle">Nenhuma fonte definida</p>
          )}
        </div>
      </div>

      {/* Art Generation Preferences */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text">Preferências para Geração de Arte</h3>
            <p className="text-xs text-text-subtle">Defina fontes, cores e estilo de overlay para as artes</p>
          </div>
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={updatePreferences.isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {updatePreferences.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Salvar
            </button>
          )}
        </div>

        {/* Font Preferences */}
        {assets.fonts && assets.fonts.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Title Font */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-muted">Fonte do Título</label>
              <div className="relative">
                <select
                  value={titleFont ?? ''}
                  onChange={(e) => setTitleFont(e.target.value || null)}
                  className="w-full appearance-none rounded-md border border-border bg-input px-3 py-2 pr-8 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {fontOptions.map((opt) => (
                    <option key={opt.label} value={opt.value ?? ''}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
              </div>
            </div>

            {/* Body Font */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-muted">Fonte do Corpo/Descrição</label>
              <div className="relative">
                <select
                  value={bodyFont ?? ''}
                  onChange={(e) => setBodyFont(e.target.value || null)}
                  className="w-full appearance-none rounded-md border border-border bg-input px-3 py-2 pr-8 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {fontOptions.map((opt) => (
                    <option key={opt.label} value={opt.value ?? ''}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
              </div>
            </div>
          </div>
        )}

        {/* Text Color Preferences */}
        {assets.colors && assets.colors.length > 0 && (
          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <h4 className="text-xs font-semibold text-text">Cores de Texto</h4>
              <p className="text-[11px] text-text-subtle">Defina as cores fixas para cada tipo de texto nas artes</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['titleColor', 'subtitleColor', 'infoColor', 'ctaColor'] as const).map((key) => (
                <ColorSelector
                  key={key}
                  label={COLOR_ROLE_LABELS[key]}
                  value={textColors?.[key] ?? '#FFFFFF'}
                  brandColors={assets.colors}
                  onChange={(color) => handleColorChange(key, color)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Overlay Style */}
        <div className="space-y-2 border-t border-border pt-4">
          <div>
            <h4 className="text-xs font-semibold text-text">Estilo de Overlay</h4>
            <p className="text-[11px] text-text-subtle">Como o fundo escuro atrás do texto é aplicado</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setOverlayStyle('gradient')}
              className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                overlayStyle === 'gradient'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-input text-text-muted hover:text-text'
              }`}
            >
              Gradiente
              <span className="mt-0.5 block text-[10px] font-normal opacity-70">
                Preto para transparente
              </span>
            </button>
            <button
              onClick={() => setOverlayStyle('solid')}
              className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                overlayStyle === 'solid'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-input text-text-muted hover:text-text'
              }`}
            >
              Sólido
              <span className="mt-0.5 block text-[10px] font-normal opacity-70">
                Cor uniforme semi-transparente
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
