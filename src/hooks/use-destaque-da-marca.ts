"use client"

import * as React from 'react'
import type { Layer } from '@/types/template'
import { destaqueDoPapel, type EstiloDeDestaque } from '@/lib/compositor/destaques'
import { destaquePadraoDaAssinatura } from '@/lib/compositor/assinatura'
import { getFontManager } from '@/lib/font-manager'
import { useProject } from './use-project'

/**
 * O destaque da MARCA para uma camada `text` do editor — o que a caixa grava
 * em `layer.destaque` na primeira vez que o texto ganha [colchetes], o valor
 * inicial do campo "Destaque" da barra e o que "Voltar ao da marca" grava.
 * A MESMA regra do compositor, e só ela (`destaquePadraoDaAssinatura` +
 * `destaqueDoPapel`): cor de `Project.assinatura.destaque.fill`; família mais
 * pesada da família da camada entre as fontes do projeto quando `pesado`.
 * Sem cor e sem peso, null — o compositor também não pinta.
 */
export function useDestaqueDaMarca(projectId: number | null | undefined) {
  const id = typeof projectId === 'number' && projectId > 0 ? projectId : null
  const { data: projeto } = useProject(id)
  const assinaturaCrua = projeto?.assinatura ?? null

  return React.useCallback(
    (layer: Layer): EstiloDeDestaque | null =>
      destaqueDoPapel({
        padrao: destaquePadraoDaAssinatura(assinaturaCrua),
        corDoPapel: String(layer.style?.color ?? ''),
        familiaDoPapel: String(layer.style?.fontFamily ?? ''),
        familias: getFontManager().getAvailableFonts(id ?? undefined).all,
      }),
    [assinaturaCrua, id],
  )
}
