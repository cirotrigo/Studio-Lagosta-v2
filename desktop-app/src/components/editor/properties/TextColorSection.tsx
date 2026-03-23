import { cn } from '@/lib/utils'

interface TextColorSectionProps {
  value: string
  palette: string[]
  onChange: (color: string) => void
}

export function TextColorSection({ value, palette, onChange }: TextColorSectionProps) {
  return (
    <div className="space-y-3">
      {/* Project palette swatches */}
      {palette.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
            Cores do projeto
          </span>
          <div className="flex flex-wrap gap-1.5">
            {palette.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onChange(color)}
                className={cn(
                  'h-7 w-7 rounded-lg border-2 transition-all hover:scale-110',
                  value === color
                    ? 'border-orange-500 ring-2 ring-orange-500/30'
                    : 'border-white/15 hover:border-white/30',
                )}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}

      {/* Color picker + hex input */}
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 cursor-pointer rounded-md border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent text-xs text-white/90 focus:outline-none font-mono"
          placeholder="#000000"
        />
      </div>
    </div>
  )
}
