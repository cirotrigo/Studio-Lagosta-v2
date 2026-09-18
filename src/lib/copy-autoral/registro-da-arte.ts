/**
 * O registro da copy de uma ARTE (`Generation.fieldValues.copyAutoral =
 * { original, efetiva, comparavel, lacunas? }`) acompanha o PNG — módulo PURO.
 *
 * PR3-F02 (revisão FINAL do Codex sobre abac9b34, 18/09/2026): a arte
 * re-renderizada (a página ajustada à mão, a recuperação forçada) trocava o
 * PNG e deixava `efetiva` da versão anterior; a recomposição que não
 * conseguia ler o contrato fazia o mesmo. `ver-geracao` apresentava o texto
 * antigo como `desenhada`, com `comparavel: true`, para a imagem nova. Quem
 * troca o PNG de uma arte que carrega o registro grava o registro de novo:
 * a efetiva medida nas camadas desenhadas, ou — quando não dá para medir —
 * `efetiva: null`, `comparavel: false` e o motivo em `lacunas`. Nunca a
 * efetiva antiga como se fosse a atual. O `original` fica.
 */

import type { Layer } from '@/types/template'
import { lerCamadas } from '@/lib/posts/page-layers'
import type { CopyAutoral } from './contrato'
import { tentarCopyEfetivaDasCamadas } from './efetiva'
import { lerCopyAutoral } from './serializar'

export interface RegistroDaCopyDaArte {
  original: CopyAutoral
  efetiva: CopyAutoral | null
  comparavel: boolean
  lacunas?: string[]
}

function registroAnterior(anterior: unknown): Record<string, unknown> | null {
  return anterior && typeof anterior === 'object' && !Array.isArray(anterior) ? (anterior as Record<string, unknown>) : null
}

/** O registro de quem NÃO conseguiu medir a copy desta imagem; `null` quando a arte não carregava registro nenhum. */
export function copyDaArteIndisponivel(anterior: unknown, motivo: string): RegistroDaCopyDaArte | null {
  const ant = registroAnterior(anterior)
  const original = ant ? lerCopyAutoral(ant.original).copy : null
  if (!original) return null
  return { original, efetiva: null, comparavel: false, lacunas: [`a copy desenhada nesta imagem não pôde ser medida: ${motivo}`] }
}

/**
 * O registro para o PNG que desenha `camadas`. A base da leitura é o contrato
 * da página (o que ela mostra, com as revisões da equipe); sem ele, a efetiva
 * anterior da arte. `null` quando a arte não carregava registro (não se inventa um).
 */
export function registroDaCopyDaArte(args: { anterior: unknown; contratoDaPagina: unknown; camadas: unknown; superficie: string }): { registro: RegistroDaCopyDaArte | null; aviso: string | null } {
  const ant = registroAnterior(args.anterior)
  const original = ant ? lerCopyAutoral(ant.original).copy : null
  if (!original) return { registro: null, aviso: null }
  const indisponivel = (motivo: string) => ({ registro: copyDaArteIndisponivel(args.anterior, motivo), aviso: `A copy desenhada na imagem nova não pôde ser medida (${motivo}); a arte ficou marcada como não comparável.` })
  const base = (args.contratoDaPagina == null ? null : lerCopyAutoral(args.contratoDaPagina).copy) ?? lerCopyAutoral(ant!.efetiva).copy ?? original
  const lidas = lerCamadas(args.camadas)
  if (!lidas.legivel) return indisponivel('camadas da página ilegíveis')
  const leitura = tentarCopyEfetivaDasCamadas(base, lidas.camadas as unknown as Layer[], { superficie: args.superficie })
  if (leitura.ok === false) return indisponivel(leitura.aviso)
  const { efetiva, lacunas } = leitura.leitura
  return { registro: { original, efetiva, comparavel: original.origem.autor !== 'desconhecido', ...(lacunas.length ? { lacunas } : {}) }, aviso: null }
}
