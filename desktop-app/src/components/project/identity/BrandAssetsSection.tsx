import { Loader2 } from 'lucide-react'
import { useBrandAssets } from '@/hooks/use-brand-assets'

interface BrandAssetsSectionProps {
  projectId: number
}

export default function BrandAssetsSection({ projectId }: BrandAssetsSectionProps) {
  const { data: assets, isLoading, error } = useBrandAssets(projectId)

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

  return (
    <div className="space-y-4">
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
          <label className="text-sm font-medium text-text-muted">Fontes</label>
          {assets.fonts && assets.fonts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {assets.fonts.map((font, idx) => (
                <span
                  key={idx}
                  className="rounded-md bg-input px-2.5 py-1 font-mono text-sm text-text"
                >
                  {font}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-subtle">Nenhuma fonte definida</p>
          )}
        </div>
      </div>
    </div>
  )
}
