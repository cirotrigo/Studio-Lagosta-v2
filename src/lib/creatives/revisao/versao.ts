/**
 * A VERSÃO de uma página, pelo CONTEÚDO visual.
 *
 * O revisor calcula ajustes sobre uma página; se ela mudou antes de o ajuste
 * chegar (a equipe editou, outro ajuste já entrou), aplicar os deltas às
 * cegas moveria as camadas erradas. Por isso o ajuste leva a versão da
 * revisão e o executor a confere.
 *
 * Nem `updatedAt` nem a URL da arte servem de versão: `updatedAt` muda em
 * qualquer escrita (um `update` de `order` em 30 páginas apagou o sinal de uma
 * vez em 04/09/2026 — ver `defasagem.ts`), e a mesma URL pode ter sido
 * refeita. A versão é o hash das dimensões, do fundo e das camadas, com as
 * chaves ordenadas (a ordem das chaves no JSON do banco não é estável) e sem
 * os campos `undefined` (que o JSON do banco nunca guarda).
 *
 * Módulo PURO.
 */

import { createHash } from 'node:crypto'
import { lerCamadas } from '@/lib/posts/page-layers'

function estavel(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(estavel)
  if (valor && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(objeto)
        .filter((k) => objeto[k] !== undefined)
        .sort()
        .map((k) => [k, estavel(objeto[k])]),
    )
  }
  return valor
}

/** `null` quando as camadas são ilegíveis — ilegível nunca vira "a mesma versão". */
export function versaoDaPagina(pagina: {
  width: number
  height: number
  background?: string | null
  layers: unknown
}): string | null {
  const { camadas, legivel } = lerCamadas(pagina.layers)
  if (!legivel) return null
  const texto = JSON.stringify(
    estavel({ w: pagina.width, h: pagina.height, bg: pagina.background ?? null, camadas }),
  )
  return `v1:${createHash('sha256').update(texto).digest('hex').slice(0, 20)}`
}
