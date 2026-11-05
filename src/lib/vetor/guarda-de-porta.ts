/**
 * CP-X2b — a guarda vetorial das portas de escrita de camadas (preflight X2 v2.1 §4.4). Puro, sem `@/lib/db`.
 *
 * - `exigirVetoresValidos` lança `VetorInvalido`, o ÚNICO erro que as portas mapeiam para 422 `VETOR_INVALIDO`;
 *   qualquer outro erro segue o mapeamento que a porta já tinha.
 * - Aceita a lista crua (array) ou `Page.layers` em texto (as três codificações de `lerCamadas`). Texto ilegível
 *   não tem candidato a validar: a porta segue gravando como antes, e a varredura (gate G) conta essa fonte.
 */
import { lerCamadas } from '@/lib/posts/page-layers'
import { problemasDosVetores, VetorInvalido, type VetorComProblemas } from './validar-camada'

/** Camada recusada; `paginaId` nas portas que gravam mais de uma página (P4 desktop, P5). */
export type CamadaRecusada = VetorComProblemas & { paginaId?: string }

export function exigirVetoresValidos(camadas: unknown, onde: { paginaId?: string } = {}): void {
  const lista = typeof camadas === 'string' ? lerCamadas(camadas).camadas : camadas
  const problemas = problemasDosVetores(lista)
  if (problemas.length === 0) return
  const recusadas: CamadaRecusada[] = onde.paginaId ? problemas.map((p) => ({ ...p, paginaId: onde.paginaId })) : problemas
  throw new VetorInvalido(recusadas)
}

/** O corpo do 422. O `error` é legível sozinho: o cliente do editor só recebe esse texto (ver `api-client.ts`). */
export function corpoDoVetorInvalido(erro: VetorInvalido) {
  const resumo = erro.camadas
    .map((c) => `${c.id}: ${c.motivos.map((m) => m.codigo).join(', ')}`)
    .join('; ')
  return {
    error: `Forma vetorial inválida — nada foi gravado (${resumo}).`,
    codigo: erro.codigo,
    camadas: erro.camadas as CamadaRecusada[],
  }
}
