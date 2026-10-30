'use client'

import * as React from 'react'

import type { MargensDoEditor } from '@/lib/canvas-margin'
import { margensDaPagina } from '@/lib/margens-no-editor'
import { useProject } from './use-project'

/**
 * As margens da página aberta no editor (L1 das linhas-guia, 29/10/2026): a faixa da interface e a margem da MARCA,
 * lidas de `Project.assinatura` pelo hook do projeto que o editor já carrega. Enquanto o projeto não chegou (ou não
 * tem assinatura) vale o padrão da casa — `origem` diz qual dos dois está valendo. O formato sai do tamanho do canvas.
 */
export function useMargensDoEditor(projectId: number | null, canvas: { width: number; height: number }): MargensDoEditor {
  const { data: projeto } = useProject(projectId)
  const assinatura = projeto?.assinatura ?? null
  const { width, height } = canvas
  return React.useMemo(() => margensDaPagina(assinatura, { width, height }), [assinatura, width, height])
}
