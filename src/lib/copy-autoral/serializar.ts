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
import { canonico } from './revisao'
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
  // Canônico: a ordem em que as propriedades do estilo (ou dos fatos) foram
  // montadas não é diferença de copy.
  const norm = (c: CopyAutoral) =>
    canonico([...c.blocos].sort((x, y) => x.ordem - y.ordem).map((x) => ({ id: x.id, funcao: x.funcao, grupo: x.grupoDeLeitura ?? null, ordem: x.ordem, linhas: x.linhas, estilo: x.estilo ?? null, fatos: x.fatos ?? null })))
  return norm(a) === norm(b)
}
