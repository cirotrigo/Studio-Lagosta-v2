/**
 * Ida e volta EXATA do contrato: o JSON gravado (em `Page`, `ItemDePlano`,
 * `Generation.fieldValues`) volta idêntico — nenhuma linha normalizada, nenhum
 * campo `undefined` inventado como `null`.
 *
 * `lerCopyAutoral` valida ao ler: registro que não passa volta com os
 * problemas, e quem lê decide (o legado tem os próprios adaptadores).
 *
 * Módulo PURO.
 */

import type { CopyAutoral } from './contrato'
import { validarCopyAutoral, type ProblemaDaCopy } from './validar'

/** JSON estável (chaves em ordem de declaração; `undefined` não é gravado). */
export function serializarCopyAutoral(copy: CopyAutoral): string {
  return JSON.stringify(copy)
}

export function lerCopyAutoral(gravado: unknown): { copy: CopyAutoral | null; problemas: ProblemaDaCopy[] } {
  let objeto: unknown = gravado
  if (typeof gravado === 'string') {
    try {
      objeto = JSON.parse(gravado)
    } catch {
      return { copy: null, problemas: [{ tipo: 'schema', mensagem: 'JSON ilegível' }] }
    }
  }
  return validarCopyAutoral(objeto)
}

/** Duas copies são a MESMA copy (mesmos blocos, mesmas linhas exatas, mesma ordem)? Revisões e lacunas não entram. */
export function mesmaCopy(a: CopyAutoral, b: CopyAutoral): boolean {
  const norm = (c: CopyAutoral) =>
    JSON.stringify(
      [...c.blocos]
        .sort((x, y) => x.ordem - y.ordem)
        .map((x) => [x.id, x.funcao, x.grupoDeLeitura ?? null, x.ordem, x.linhas, x.estilo ?? null]),
    )
  return norm(a) === norm(b)
}
