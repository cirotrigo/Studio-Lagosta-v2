/**
 * CP-X2c (P6) — a guarda vetorial dos ornamentos das combinações de texto. Puro, sem `@/lib/db`.
 *
 * `elements[].ornamentos[].camada` é um objeto Layer cru (`z.record(z.unknown())` no schema) que o compositor e a
 * `criar-arte` materializam por spread na peça (`font-combinations.ts`). Candidato = o mesmo das outras portas:
 * `type === 'shape'` e `style.shapeType === 'svg-path'`; um objeto com `shapeType` na RAIZ não é candidato.
 * Lança `VetorInvalido` (422 `VETOR_INVALIDO` nas rotas), com o elemento e o índice do ornamento de cada camada.
 */
import { problemasDosVetores, VetorInvalido, type VetorComProblemas } from './validar-camada'

export type OrnamentoRecusado = VetorComProblemas & { elemento: string | number; ornamento: number }

export function exigirOrnamentosValidos(elementos: unknown): void {
  if (!Array.isArray(elementos)) return
  const recusados: OrnamentoRecusado[] = []
  elementos.forEach((elemento, e) => {
    const ornamentos = (elemento as { ornamentos?: unknown } | null)?.ornamentos
    if (!Array.isArray(ornamentos)) return
    const idDoElemento = typeof (elemento as { id?: unknown }).id === 'string' ? (elemento as { id: string }).id : e
    ornamentos.forEach((ornamento, i) => {
      const camada = (ornamento as { camada?: unknown } | null)?.camada
      for (const p of problemasDosVetores([camada])) {
        const id = p.id === '#0' ? `elemento ${idDoElemento}, ornamento ${i}` : p.id
        recusados.push({ ...p, id, elemento: idDoElemento, ornamento: i })
      }
    })
  })
  if (recusados.length > 0) throw new VetorInvalido(recusados)
}
