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
 * O que `aplicarRevisao` ACRESCENTA sempre passa no leitor: a revisão aceita
 * até o dobro do teto de blocos em ids tocados (trocar 40 blocos por 40 novos
 * toca 80), e o histórico cheio é RECUSA explícita (`HistoricoDaCopyCheio`),
 * nunca uma 201ª revisão que faria o leitor rejeitar a copy inteira. A
 * validade dos blocos NOVOS continua sendo de quem os manda
 * (`validarCopyAutoral`).
 *
 * Módulo PURO.
 */

import { MAX_REVISOES_DA_COPY, type Autor, type BlocoAutoral, type CopyAutoral, type RevisaoDaCopy } from './contrato'
import type { ProblemaDaCopy } from './validar'

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
 * A mudança não cabe no histórico: a copy já tem `MAX_REVISOES_DA_COPY`
 * revisões (PR2-02 da revisão final do Codex, 13/09/2026). É RECUSA explícita
 * porque não há saída sem perda: o contrato é limitado, toda remoção precisa
 * ficar registrada com o que o bloco dizia, e revisão tem um autor só — não
 * existe compactação que preserve autoria e remoções. Apagar revisão antiga
 * descartaria exatamente o que o histórico guarda; registrar a 201ª produziria
 * uma copy que o leitor rejeita inteira. Quem chama decide (o editor, por
 * exemplo, grava as camadas e mantém o contrato como está, avisando).
 * `copy` é a original, intacta; `mudancas` é o que a revisão registraria.
 */
export class HistoricoDaCopyCheio extends Error {
  readonly problemas: ProblemaDaCopy[]
  constructor(
    readonly copy: CopyAutoral,
    readonly mudancas: MudancaDeBloco[],
  ) {
    super(
      `o histórico da copy está cheio (${copy.revisoes.length} de ${MAX_REVISOES_DA_COPY} revisões): a mudança em ${mudancas.map((m) => `"${m.id}"`).join(', ')} não foi registrada`,
    )
    this.name = 'HistoricoDaCopyCheio'
    this.problemas = [{ tipo: 'revisao', mensagem: this.message }]
  }
}

/** A copy já tem o máximo de revisões: a próxima mudança seria recusada. */
export function historicoCheio(copy: CopyAutoral): boolean {
  return copy.revisoes.length >= MAX_REVISOES_DA_COPY
}

/**
 * Aplica uma mudança de blocos como REVISÃO registrada. `blocosNovos` substitui
 * a lista inteira (é assim que o editor e o chat mandam a copy de volta); os
 * blocos tocados saem do diff. Sem mudança nenhuma, devolve a copy como está,
 * sem registrar revisão vazia. Com mudança e histórico cheio, LANÇA
 * `HistoricoDaCopyCheio` — nada é registrado nem descartado.
 */
export function aplicarRevisao(
  copy: CopyAutoral,
  blocosNovos: BlocoAutoral[],
  quem: { autor: Autor; motivo: string; em?: string; superficie?: string },
): { copy: CopyAutoral; mudancas: MudancaDeBloco[] } {
  const candidata: CopyAutoral = { ...copy, blocos: blocosNovos.map((b) => ({ ...b, linhas: [...b.linhas] })) }
  const mudancas = diferencasDeBlocos(copy, candidata)
  if (mudancas.length === 0) return { copy, mudancas }
  if (historicoCheio(copy)) throw new HistoricoDaCopyCheio(copy, mudancas)
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
