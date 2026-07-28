"use client"

import * as React from 'react'
import { cn } from '@/lib/utils'
import { TemplateEditorContext } from '@/contexts/template-editor-context'
import { useBrandColors } from '@/hooks/use-brand-colors'

interface BrandColorSwatchesProps {
  /** Cor atual do controle, para marcar o swatch ativo */
  value?: string
  onSelect: (hexCode: string) => void
  disabled?: boolean
  className?: string
  /** Sem provider do editor (ex.: telas de projeto), informe o projeto aqui */
  projectId?: number
}

/**
 * Paleta de cores cadastradas do projeto, para acompanhar qualquer seletor
 * de cor do editor. Clicar num swatch aplica um hex sempre válido — foi um
 * hex colado com espaços num input de texto que derrubou o canvas inteiro
 * (template 160), então quanto menos digitação de cor, melhor.
 */
export function BrandColorSwatches({ value, onSelect, disabled, className, projectId: projectIdProp }: BrandColorSwatchesProps) {
  const context = React.useContext(TemplateEditorContext)
  const projectId = projectIdProp ?? context?.projectId
  const { data: colors = [] } = useBrandColors(projectId ?? null)

  if (colors.length === 0) return null

  const normalized = value?.trim().toUpperCase()

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {colors.map((color) => {
        const hex = color.hexCode.trim()
        const isActive = normalized === hex.toUpperCase()
        return (
          <button
            key={color.id}
            type="button"
            onClick={() => onSelect(hex)}
            disabled={disabled}
            className="relative h-5 w-5 shrink-0 rounded border border-border transition hover:scale-110 hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: hex }}
            title={`${color.name} (${hex})`}
            aria-label={`Aplicar cor ${color.name}`}
          >
            {isActive && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="h-1.5 w-1.5 rounded-full bg-white shadow-sm ring-1 ring-black/20" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
