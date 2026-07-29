"use client"

import * as React from 'react'
import type { Page } from '@/types/template'

interface PagePreviewProps {
  page: Page
  /** Dimensões do slot em px de tela (página × zoom) */
  width: number
  height: number
  /**
   * DataURL capturado do stage quando a página deixou de ser a ativa —
   * mais nítido e mais fresco que o thumbnail persistido (150px).
   */
  capturedUrl?: string
  /** Índice da página (placeholder numerado quando não há imagem) */
  index: number
}

/**
 * Preview de página inativa no workspace contínuo (fase 1: imagem).
 * A melhor fonte disponível: captura em memória > Page.thumbnail > placeholder.
 * Clique/ativação são responsabilidade do slot no ContinuousWorkspace.
 */
export function PagePreview({ page, width, height, capturedUrl, index }: PagePreviewProps) {
  const src = capturedUrl ?? page.thumbnail

  return (
    <div
      className="h-full w-full cursor-pointer overflow-hidden rounded-md shadow-2xl ring-1 ring-border/20"
      style={{ width, height, backgroundColor: page.background || '#ffffff' }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- dataURL/thumbnail local, sem otimização do next/image
        <img
          src={src}
          alt={page.name}
          width={width}
          height={height}
          className="h-full w-full select-none object-cover"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="select-none text-5xl font-semibold text-muted-foreground/40">{index + 1}</span>
        </div>
      )}
    </div>
  )
}
