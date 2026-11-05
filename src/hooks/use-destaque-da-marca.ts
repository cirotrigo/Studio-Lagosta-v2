"use client"

import * as React from 'react'
import type { Layer } from '@/types/template'
import { destaqueDoPapel, type DestaquePadraoDaMarca, type EstiloDeDestaque } from '@/lib/compositor/destaques'
import { resolverCorDaMarca } from '@/lib/brand/papeis-de-cor'
import { getFontManager } from '@/lib/font-manager'
import { useBrandColors } from './use-brand-colors'
import { useProject } from './use-project'

/**
 * O destaque da MARCA para uma camada `text` do editor — o que a caixa grava
 * em `layer.destaque` na primeira vez que o texto ganha [colchetes], e o
 * valor inicial do campo "Destaque" da barra. A mesma regra do compositor
 * (`destaqueDoPapel`): cor de `Project.assinatura.destaque`, senão a cor de
 * destaque da paleta (`resolverCorDaMarca`); família mais pesada da família
 * da camada entre as fontes do projeto quando `pesado`. Sem assinatura e sem
 * paleta, fica só o peso; sem peso, null.
 */
export function useDestaqueDaMarca(projectId: number | null | undefined) {
  const id = typeof projectId === 'number' && projectId > 0 ? projectId : null
  const { data: projeto } = useProject(id)
  const { data: paleta = [] } = useBrandColors(id)
  const assinaturaCrua = projeto?.assinatura ?? null

  return React.useCallback(
    (layer: Layer): EstiloDeDestaque | null => {
      const gravado = (assinaturaCrua as { destaque?: Record<string, unknown> } | null)?.destaque ?? {}
      const dados = { paleta, assinaturaCrua }
      const cor = resolverCorDaMarca('destaque', dados)
      const alternativa = resolverCorDaMarca('destaque2', dados)
      const padrao: DestaquePadraoDaMarca = {
        ...(cor.fonte !== 'padrao' ? { fill: cor.hex } : {}),
        ...(typeof gravado.fontFamily === 'string' ? { fontFamily: gravado.fontFamily } : {}),
        pesado: typeof gravado.pesado === 'boolean' ? gravado.pesado : true,
        ...(alternativa.fonte !== 'padrao' && alternativa.hex !== cor.hex ? { alternativa: alternativa.hex } : {}),
      }
      return destaqueDoPapel({
        padrao,
        corDoPapel: String(layer.style?.color ?? ''),
        familiaDoPapel: String(layer.style?.fontFamily ?? ''),
        familias: getFontManager().getAvailableFonts(id ?? undefined).all,
      })
    },
    [assinaturaCrua, paleta, id],
  )
}
