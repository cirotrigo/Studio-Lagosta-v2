/**
 * REVISÕES da copy autoral: toda mudança depois da origem tem autor, data,
 * motivo e a lista dos blocos tocados. Quem registra é quem escreve — o chat
 * (`claude`), o editor e a bancada (`equipe`), o revisor da arte e a
 * recomposição (`sistema`). O contrato nunca deduz autor.
 *
 * `aplicarRevisao` devolve uma copy NOVA (a original não é mutada) e calcula
 * sozinha quais blocos mudaram, comparando linha a linha EXATAMENTE — caixa,
 * acento, quebra e colchetes contam. É por isso que a correção de acento e a
 * mudança de caixa aparecem como revisão, e não somem.
 *
 * Módulo PURO.
 */

import type { Autor, BlocoAutoral, CopyAutoral, RevisaoDaCopy } from './contrato'

export interface MudancaDeBloco {
  id: string
  tipo: 'alterado' | 'acrescentado' | 'removido'
  /** Os campos autorais que mudaram num bloco alterado (`linhas`, `ordem`, `funcao`, `grupoDeLeitura`, `estilo`, `fatos`). */
  campos?: CampoAutoral[]
  antes?: string[]
  depois?: string[]
}

export const CAMPOS_AUTORAIS = ['linhas', 'funcao', 'grupoDeLeitura', 'ordem', 'estilo', 'fatos'] as const
export type CampoAutoral = (typeof CAMPOS_AUTORAIS)[number]

/** JSON canônico (chaves ordenadas, `undefined` fora): a ordem em que o objeto foi montado não é diferença. */
export function canonico(valor: unknown): string {
  const estavel = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(estavel)
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      return Object.fromEntries(Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => [k, estavel(o[k])]))
    }
    return v
  }
  return JSON.stringify(estavel(valor) ?? null)
}

/** Os campos autorais em que dois blocos de MESMO id diferem. */
export function camposDiferentes(a: BlocoAutoral, b: BlocoAutoral): CampoAutoral[] {
  return CAMPOS_AUTORAIS.filter((campo) => canonico(a[campo]) !== canonico(b[campo]))
}

/**
 * Os blocos que diferem entre duas copies, por id — em QUALQUER campo autoral
 * (as linhas exatas, e também ordem, função, grupo de leitura, estilo e fatos:
 * trocar a segunda voz ou a ordem de leitura é decisão do autor tanto quanto
 * trocar uma palavra).
 */
export function diferencasDeBlocos(antes: CopyAutoral, depois: CopyAutoral): MudancaDeBloco[] {
  const porIdAntes = new Map(antes.blocos.map((b) => [b.id, b]))
  const porIdDepois = new Map(depois.blocos.map((b) => [b.id, b]))
  const mudancas: MudancaDeBloco[] = []
  for (const [id, b] of porIdDepois) {
    const a = porIdAntes.get(id)
    if (!a) mudancas.push({ id, tipo: 'acrescentado', depois: [...b.linhas] })
    else {
      const campos = camposDiferentes(a, b)
      if (campos.length > 0) mudancas.push({ id, tipo: 'alterado', campos, antes: [...a.linhas], depois: [...b.linhas] })
    }
  }
  for (const [id, a] of porIdAntes) if (!porIdDepois.has(id)) mudancas.push({ id, tipo: 'removido', antes: [...a.linhas] })
  return mudancas
}

/**
 * Aplica uma mudança de blocos como REVISÃO registrada. `blocosNovos` substitui
 * a lista inteira (é assim que o editor e o chat mandam a copy de volta); os
 * blocos tocados saem do diff. Sem mudança nenhuma, devolve a copy como está,
 * sem registrar revisão vazia.
 */
export function aplicarRevisao(
  copy: CopyAutoral,
  blocosNovos: BlocoAutoral[],
  quem: { autor: Autor; motivo: string; em?: string; superficie?: string },
): { copy: CopyAutoral; mudancas: MudancaDeBloco[] } {
  const candidata: CopyAutoral = { ...copy, blocos: blocosNovos.map((b) => ({ ...b, linhas: [...b.linhas] })) }
  const mudancas = diferencasDeBlocos(copy, candidata)
  if (mudancas.length === 0) return { copy, mudancas }
  const porIdAntes = new Map(copy.blocos.map((b) => [b.id, b]))
  const removidos = mudancas
    .filter((m) => m.tipo === 'removido')
    .map((m) => {
      const b = porIdAntes.get(m.id)!
      return { id: b.id, funcao: b.funcao, linhas: [...b.linhas] }
    })
  const campos = Object.fromEntries(mudancas.filter((m) => m.tipo === 'alterado' && m.campos?.length).map((m) => [m.id, m.campos!]))
  const revisao: RevisaoDaCopy = {
    em: quem.em ?? new Date().toISOString(),
    autor: quem.autor,
    motivo: quem.motivo,
    blocos: mudancas.map((m) => m.id),
    ...(removidos.length ? { removidos } : {}),
    ...(Object.keys(campos).length ? { campos } : {}),
    ...(quem.superficie ? { superficie: quem.superficie } : {}),
  }
  return { copy: { ...candidata, revisoes: [...copy.revisoes, revisao] }, mudancas }
}

/** A última revisão de um bloco (ou a origem, quando ele nunca mudou). Bloco removido devolve a revisão que o removeu. */
export function autorDoBloco(copy: CopyAutoral, id: string): { autor: Autor; em?: string; motivo?: string } {
  for (let i = copy.revisoes.length - 1; i >= 0; i--) {
    const r = copy.revisoes[i]
    if (r.blocos.includes(id)) return { autor: r.autor, em: r.em, motivo: r.motivo }
  }
  return { autor: copy.origem.autor, ...(copy.origem.em ? { em: copy.origem.em } : {}) }
}

/**
 * A copy é COMPARÁVEL quando se sabe quem a escreveu: legado com autoria
 * desconhecida entra na métrica como "não comparável", nunca como fidelidade
 * comprovada (regra do PR 3).
 */
export function copyComparavel(copy: CopyAutoral): boolean {
  return copy.origem.autor !== 'desconhecido'
}
