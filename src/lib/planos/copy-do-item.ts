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
  aplicarRevisao,
  blocosEmOrdem,
  espelhoPosicional,
  lerCopyAutoral,
  orientacaoDosProblemas,
  orientacaoEmFrase,
  validarCopyAutoral,
  type Autor,
  type BlocoAutoral,
  type CopyAutoral,
} from '@/lib/copy-autoral'

export interface CopyDoItem {
  /** O contrato a gravar; `null` = o item fica (ou passa a ficar) sem contrato. */
  copyAutoral: CopyAutoral | null
  /** O espelho posicional (`ItemDePlano.copyProposta`), sem blocos vazios. */
  copyProposta: string[]
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

/** O espelho posicional que o item grava: bloco vazio fica de fora (o contrato o guarda). */
export function espelhoDoContrato(copy: CopyAutoral): string[] {
  return espelhoPosicional(copy).map((s) => s.trim()).filter(Boolean)
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
      copyProposta: listaLimpa(patch.copyProposta),
      avisos: ['O contrato da copy do item foi removido a pedido; a copy passa a valer só pela lista posicional.'],
    }
  }
  if (patch.copyAutoral !== undefined) {
    const copy = contratoLido(patch.copyAutoral)
    return { copyAutoral: copy, copyProposta: espelhoDoContrato(copy), avisos: [] }
  }

  // Só a lista posicional mudou.
  const lista = listaLimpa(patch.copyProposta)
  const contrato = atual == null ? null : lerCopyAutoral(atual).copy
  if (!contrato) return { copyAutoral: null, copyProposta: lista, avisos: [] }

  const emOrdem = blocosEmOrdem(contrato)
  const comTexto = emOrdem.filter((b) => b.linhas.length > 0)
  const descartado = (motivo: string): CopyDoItem => ({
    copyAutoral: null,
    copyProposta: lista,
    avisos: [`O contrato da copy do item foi descartado: ${motivo}. A copy passa a valer só pela lista posicional; mande copyAutoral para o item voltar a ter contrato.`],
  })
  if (comTexto.length !== lista.length) {
    return descartado(`a edição posicional mudou o número de blocos com texto (${comTexto.length} → ${lista.length}) e não há como saber qual bloco é qual`)
  }
  const novos: BlocoAutoral[] = emOrdem.map((b) => {
    if (b.linhas.length === 0) return b
    const linhas = lista[comTexto.indexOf(b)].split('\n')
    // A segunda voz aponta para linhas por índice; linha que sumiu leva o índice junto.
    const { estilo: estiloAntigo, ...semEstilo } = b
    const voz2 = estiloAntigo?.linhasNaVoz2?.filter((i) => i < linhas.length) ?? []
    const { linhasNaVoz2: _fora, ...restoDoEstilo } = estiloAntigo ?? {}
    const estilo = { ...restoDoEstilo, ...(voz2.length > 0 ? { linhasNaVoz2: voz2 } : {}) }
    return { ...semEstilo, linhas, ...(Object.keys(estilo).length > 0 ? { estilo } : {}) }
  })
  const { copy } = aplicarRevisao(contrato, novos, {
    autor: quem.autor,
    motivo: 'edição posicional do texto do item',
    superficie: quem.superficie,
    ...(quem.em ? { em: quem.em } : {}),
  })
  const conferida = validarCopyAutoral(copy)
  if (!conferida.copy) return descartado(`a edição posicional deixou o contrato inválido (${conferida.problemas.map((p) => p.mensagem).join('; ')})${orientacaoEmFrase(orientacaoDosProblemas(conferida.problemas)).replace(/\.$/, '')}`)
  return { copyAutoral: conferida.copy, copyProposta: espelhoDoContrato(conferida.copy), avisos: [] }
}
