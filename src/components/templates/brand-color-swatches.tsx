"use client"

import * as React from 'react'
import { cn } from '@/lib/utils'
import { TemplateEditorContext } from '@/contexts/template-editor-context'
import { useBrandColors } from '@/hooks/use-brand-colors'
import type { CorAplicavel } from '@/lib/editor/cores-da-forma'

interface BrandColorSwatchesProps {
  /** Cor atual do controle, para marcar o swatch ativo */
  value?: string
  onSelect: (hexCode: string) => void
  disabled?: boolean
  className?: string
  /** Sem provider do editor (ex.: telas de projeto), informe o projeto aqui */
  projectId?: number
  /**
   * CP-V3, só a forma: a paleta ESTRITA já classificada (`classificarPaleta`) e o critério de ativo (`swatchAtivo`).
   * Com ela, o componente não busca nada e o clique entrega o hex canônico. Sem ela, é o comportamento de sempre.
   */
  cores?: CorAplicavel[]
  ativo?: (hex: string) => boolean
}

/**
 * Paleta de cores cadastradas do projeto, para acompanhar qualquer seletor
 * de cor do editor. Clicar num swatch aplica um hex sempre válido — foi um
 * hex colado com espaços num input de texto que derrubou o canvas inteiro
 * (template 160), então quanto menos digitação de cor, melhor.
 */
export function BrandColorSwatches({ value, onSelect, disabled, className, projectId: projectIdProp, cores, ativo }: BrandColorSwatchesProps) {
  const context = React.useContext(TemplateEditorContext)
  const projectId = projectIdProp ?? context?.projectId
  const { data: colors = [] } = useBrandColors(cores ? null : projectId ?? null)

  const normalized = value?.trim().toUpperCase()
  const itens = cores ?? colors.map((color) => {
    const hex = color.hexCode.trim()
    return { id: color.id, name: color.name, hex, rotulo: `${color.name} (${hex})`, ativo: normalized === hex.toUpperCase() }
  })

  if (itens.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {itens.map((color) => {
        const hex = color.hex
        const isActive = 'ativo' in color ? color.ativo : ativo?.(hex) === true
        return (
          <button
            key={String(color.id)}
            type="button"
            onClick={() => onSelect(hex)}
            disabled={disabled}
            className="relative h-5 w-5 shrink-0 rounded border border-border transition hover:scale-110 hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: hex }}
            title={color.rotulo}
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
