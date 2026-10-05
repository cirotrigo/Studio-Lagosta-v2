/**
 * O contrato da copy autoral num ITEM DE PLANO (F1 de "Marca simples, copy
 * melhor", 12/09/2026). Módulo PURO: decide o que o item grava; quem grava é
 * `plano-service.ts`.
 *
 * Regras:
 *  - `ItemDePlano.copyAutoral` é a verdade; `copyProposta` é só o ESPELHO
 *    posicional dela durante a transição (um item por bloco com texto, linhas
 *    unidas por "\n") — é o que a bancada, `executar-plano` e as vias de
 *    template/IA continuam lendo até o PR 5.
 *  - Contrato que não passa no leitor é RECUSADO (nunca gravado pela metade),
 *    com a ORIENTAÇÃO do que fazer quando o problema é de limite
 *    (`orientacaoDosProblemas`: "quebre a linha").
 *  - Edição posicional num contrato com o histórico CHEIO propaga
 *    `HistoricoDaCopyCheio` (PR2-02): nada é gravado, e `plano-service` a
 *    devolve como 409 dizendo o que fazer — descartar o contrato em silêncio
 *    apagaria a autoria que o histórico guarda.
 *  - Edição SÓ da lista posicional num item que tem contrato vira REVISÃO do
 *    contrato quando dá para casar posição a posição (mesmo número de blocos
 *    com texto). Quando não dá, o contrato é DESCARTADO COM AVISO — manter um
 *    contrato que não descreve mais o texto seria mentir para a métrica.
 */

import {
  MAX_BLOCOS_NA_COPY,
  blocoAutoralSchema,
  blocosEmOrdem,
  lerCopyAutoral,
  orientacaoDosProblemas,
  orientacaoEmFrase,
  revisaoPosicional,
  type Autor,
  type BlocoAutoral,
  type CopyAutoral,
} from '@/lib/copy-autoral'

const LINHAS_DO_BLOCO = blocoAutoralSchema.shape.linhas
/**
 * 🔴 Os tetos do ESPELHO, lidos do PRÓPRIO contrato (PR3-R9-03 da revisão do
 * Codex sobre cd98cd6d, 20/09/2026). A API do item aceitava 12 strings de 2.000
 * caracteres — menos do que o contrato comporta —, então um item criado com um
 * `copyAutoral` VÁLIDO de 13 blocos (ou com um bloco de 7 linhas de 300) tinha
 * o espelho recusado com 400 assim que alguém editava um caractere no modal: a
 * edição de um contrato que o próprio sistema aceitou não chegava ao serviço.
 * Quem produz o espelho é `espelhoDoContrato`; quem o recebe usa estes tetos.
 * Nada de truncar para caber — é a transformação silenciosa que o contrato
 * existe para expor.
 */
export const MAX_ITENS_DO_ESPELHO = MAX_BLOCOS_NA_COPY
export const MAX_CARACTERES_DO_ESPELHO =
  (LINHAS_DO_BLOCO._def.maxLength?.value ?? 12) * ((LINHAS_DO_BLOCO.element.maxLength ?? 300) + 1) - 1

export interface CopyDoItem {
  /** O contrato a gravar; `null` = o item fica (ou passa a ficar) sem contrato. */
  copyAutoral: CopyAutoral | null
  /**
   * O espelho posicional (`ItemDePlano.copyProposta`), sem blocos vazios.
   * `undefined` (só no patch) = a lista fica como está: remover só o contrato
   * não apaga a copy (PR3-F07).
   */
  copyProposta?: string[]
  avisos: string[]
}

export class CopyAutoralInvalida extends Error {
  constructor(
    public readonly problemas: string[],
    /** O que fazer quando o problema é de limite ("quebre a linha") — pode vir vazio. */
    public readonly orientacao: string[] = [],
  ) {
    super(`a copy autoral não passou no contrato: ${problemas.join('; ')}${orientacaoEmFrase(orientacao)}`)
  }
}

function listaLimpa(lista: unknown): string[] {
  return (Array.isArray(lista) ? lista : [])
    .filter((b): b is string => typeof b === 'string')
    .map((b) => b.trim())
    .filter(Boolean)
}

/**
 * O bloco entra no espelho posicional? Só quando tem texto — o bloco vazio (e o
 * de linhas só em branco) fica de fora, como a bancada já filtra
 * (`para-bancada.ts`); o contrato o guarda intacto.
 */
function temTexto(b: BlocoAutoral): boolean {
  return b.linhas.join('\n').trim() !== ''
}

/**
 * O espelho posicional que o item grava: um item por bloco COM TEXTO, as
 * strings EXATAS do contrato (linhas unidas por "\n", sem `trim`). Aparar
 * aqui mudava o texto: a bancada reenviava o espelho ao salvar outro campo e a
 * normalização do sistema virava edição da equipe (PR3-F06 da revisão FINAL
 * do Codex sobre abac9b34, 18/09/2026).
 */
export function espelhoDoContrato(copy: CopyAutoral): string[] {
  return blocosEmOrdem(copy).filter(temTexto).map((b) => b.linhas.join('\n'))
}

/** A lista posicional num item COM contrato: as strings como vieram (só o vazio sai, como no espelho). */
function listaExata(lista: unknown): string[] {
  return (Array.isArray(lista) ? lista : []).filter((b): b is string => typeof b === 'string' && b.trim() !== '')
}

function contratoLido(entrada: unknown): CopyAutoral {
  const { copy, problemas } = lerCopyAutoral(entrada)
  if (!copy) throw new CopyAutoralInvalida(problemas.map((p) => (p.bloco ? `${p.bloco}: ${p.mensagem}` : p.mensagem)), orientacaoDosProblemas(problemas))
  return copy
}

/** Item NOVO: o contrato, quando vem, manda — a lista posicional é só o espelho dele. */
export function copyDoItemNovo(entrada: { copyAutoral?: unknown; copyProposta?: unknown }): CopyDoItem {
  if (entrada.copyAutoral != null) {
    const copy = contratoLido(entrada.copyAutoral)
    return { copyAutoral: copy, copyProposta: espelhoDoContrato(copy), avisos: [] }
  }
  return { copyAutoral: null, copyProposta: listaLimpa(entrada.copyProposta), avisos: [] }
}

/**
 * Item EXISTENTE: o que o patch faz com o contrato que o item já tem.
 * Devolve `null` quando o patch não toca na copy.
 */
export function copyDoItemNoPatch(
  atual: unknown,
  patch: { copyAutoral?: unknown; copyProposta?: unknown },
  quem: { autor: Autor; superficie: string; em?: string },
): CopyDoItem | null {
  if (patch.copyAutoral === undefined && patch.copyProposta === undefined) return null
  if (patch.copyAutoral === null) {
    return {
      copyAutoral: null,
      // Só o contrato foi removido: a lista fica como está, a não ser que venha junto (PR3-F07).
      ...(patch.copyProposta !== undefined ? { copyProposta: listaLimpa(patch.copyProposta) } : {}),
      avisos: ['O contrato da copy do item foi removido a pedido; a copy passa a valer só pela lista posicional.'],
    }
  }
  if (patch.copyAutoral !== undefined) {
    const copy = contratoLido(patch.copyAutoral)
    return { copyAutoral: copy, copyProposta: espelhoDoContrato(copy), avisos: [] }
  }

  // Só a lista posicional mudou.
  const contrato = atual == null ? null : lerCopyAutoral(atual).copy
  if (!contrato) return { copyAutoral: null, copyProposta: listaLimpa(patch.copyProposta), avisos: [] }
  const lista = listaExata(patch.copyProposta)

  const descartado = (motivo: string): CopyDoItem => ({
    copyAutoral: null,
    copyProposta: lista,
    avisos: [`O contrato da copy do item foi descartado: ${motivo}. A copy passa a valer só pela lista posicional; mande copyAutoral para o item voltar a ter contrato.`],
  })
  // A regra mora em `revisaoPosicional` (copy-autoral): é a mesma do pedido de
  // refino da melhoria — casou posição a posição, é revisão; não casou, descarta.
  const r = revisaoPosicional(contrato, lista, quem, 'edição posicional do texto do item')
  if ('descartado' in r) return descartado(r.descartado)
  return { copyAutoral: r.copy, copyProposta: espelhoDoContrato(r.copy), avisos: [] }
}
