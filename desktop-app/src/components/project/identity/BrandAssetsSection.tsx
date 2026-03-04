import { useState, useEffect } from 'react'
import { Loader2, Check, ChevronDown } from 'lucide-react'
import { useBrandAssets, useUpdateFontPreferences } from '@/hooks/use-brand-assets'
import { toast } from 'sonner'

interface BrandAssetsSectionProps {
  projectId: number
}

export default function BrandAssetsSection({ projectId }: BrandAssetsSectionProps) {
  const { data: assets, isLoading, error } = useBrandAssets(projectId)
  const updatePreferences = useUpdateFontPreferences(projectId)
  
  const [titleFont, setTitleFont] = useState<string | null>(null)
  const [bodyFont, setBodyFont] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  // Sync local state with server data
  useEffect(() => {
    if (assets) {
      setTitleFont(assets.titleFontFamily)
      setBodyFont(assets.bodyFontFamily)
    }
  }, [assets])

  // Track changes
  useEffect(() => {
    if (assets) {
      const changed = titleFont !== assets.titleFontFamily || bodyFont !== assets.bodyFontFamily
      setHasChanges(changed)
    }
  }, [titleFont, bodyFont, assets])

  const handleSave = async () => {
    try {
      await updatePreferences.mutateAsync({
        titleFontFamily: titleFont,
        bodyFontFamily: bodyFont,
      })
      toast.success('Preferências de fontes salvas!')
    } catch (e) {
      toast.error('Erro ao salvar preferências')
    }
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

      {/* Font Preferences for Art Generation */}
      {assets.fonts && assets.fonts.length > 0 && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text">Preferências para Geração de Arte</h3>
              <p className="text-xs text-text-subtle">Defina quais fontes serão usadas nas artes geradas</p>
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
        </div>
      )}
    </div>
  )
}
