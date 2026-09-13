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
 * INVARIANTE: o que `aplicarRevisao` devolve o leitor ACEITA, com o conteúdo
 * idêntico ao que foi passado — os blocos novos como vieram, e autor, data,
 * motivo e superfície como vieram. Quando não dá, a recusa é EXPLÍCITA e a
 * original fica intacta: `HistoricoDaCopyCheio` (200 revisões) ou
 * `RevisaoDaCopyInvalida` (metadados fora do teto — motivo vazio ou acima de
 * 300, `em`/`superficie` vazios ou acima de 40 — ou blocos novos que o
 * contrato não comporta). Nada é truncado, e metadado vazio não é omitido em
 * silêncio. O resultado inteiro passa por `validarCopyAutoral` antes de voltar:
 * conferir campo a campo deixou escapar um teto por rodada de revisão (PR2-02,
 * PR2-03 da revisão final do Codex, 13/09/2026). `tentarAplicarRevisao` é a
 * mesma decisão sem exceção, para quem prefere descartar a lançar.
 *
 * Módulo PURO.
 */

import { MAX_REVISOES_DA_COPY, revisaoDaCopySchema, type Autor, type BlocoAutoral, type CopyAutoral, type RevisaoDaCopy } from './contrato'
import { validarCopyAutoral, type ProblemaDaCopy } from './validar'

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

/** Quem revisa, e por quê. Os tetos são os da revisão gravada (`revisaoDaCopySchema`). */
export interface QuemRevisa {
  autor: Autor
  motivo: string
  /** ISO 8601; ausente = agora. Vazio é recusado, nunca trocado por "agora". */
  em?: string
  /** Ausente = sem superfície. Vazio é recusado, nunca omitido em silêncio. */
  superficie?: string
}

/**
 * A revisão não foi aplicada porque o resultado não passaria no leitor:
 * metadados fora do teto, ou blocos novos que o contrato não comporta (ou a
 * copy recebida já era inválida). `copy` é a original, intacta; `mudancas`, o
 * que a revisão registraria; `problemas`, TODOS os motivos — os dos metadados
 * começam por "revisão nova:". Nada foi cortado nem registrado.
 */
export class RevisaoDaCopyInvalida extends Error {
  constructor(
    readonly copy: CopyAutoral,
    readonly mudancas: MudancaDeBloco[],
    readonly problemas: ProblemaDaCopy[],
  ) {
    super(`a revisão da copy não foi aplicada — o resultado não passaria no leitor (nada foi cortado nem registrado): ${problemas.map((p) => p.mensagem).join('; ')}`)
    this.name = 'RevisaoDaCopyInvalida'
  }
}

export interface ResultadoDaRevisao {
  /** A copy revisada (ou a original, sem mudança); `null` quando recusada. */
  copy: CopyAutoral | null
  mudancas: MudancaDeBloco[]
  problemas: ProblemaDaCopy[]
  /** A copy recebida, intacta. */
  original: CopyAutoral
  /** A recusa é o histórico cheio (`aplicarRevisao` lança `HistoricoDaCopyCheio`). */
  historicoCheio: boolean
}

const metadadosDaRevisaoSchema = revisaoDaCopySchema.pick({ em: true, autor: true, motivo: true, superficie: true })

function blocosComForma(lista: unknown): lista is BlocoAutoral[] {
  return Array.isArray(lista) && lista.every((b) => b !== null && typeof b === 'object' && !Array.isArray(b) && Array.isArray((b as { linhas?: unknown }).linhas))
}

/** Metadados sabidamente válidos, para conferir o RESTO da revisão sem repetir os problemas dos metadados. */
const METADADOS_NEUTROS = { em: '-', autor: 'sistema', motivo: '-' } as const

/**
 * A decisão de `aplicarRevisao`, sem exceção: devolve a copy revisada, ou
 * `copy: null` com todos os problemas e a original intacta.
 */
export function tentarAplicarRevisao(copy: CopyAutoral, blocosNovos: BlocoAutoral[], quem: QuemRevisa): ResultadoDaRevisao {
  // Bloco sem forma de bloco (não é objeto, `linhas` que não é lista) não tem
  // diff possível: é recusa com os problemas do leitor, nunca TypeError no
  // meio do caminho (achado pela varredura de fronteira, 13/09/2026).
  if (!blocosComForma(copy?.blocos) || !Array.isArray(copy?.revisoes) || !blocosComForma(blocosNovos)) {
    return { copy: null, mudancas: [], problemas: validarCopyAutoral({ ...copy, blocos: blocosNovos }).problemas, original: copy, historicoCheio: false }
  }
  const candidata: CopyAutoral = { ...copy, blocos: blocosNovos.map((b) => ({ ...b, linhas: [...b.linhas] })) }
  const mudancas = diferencasDeBlocos(copy, candidata)
  const recusa = (problemas: ProblemaDaCopy[], cheio = false): ResultadoDaRevisao => ({ copy: null, mudancas, problemas, original: copy, historicoCheio: cheio })

  if (mudancas.length > 0 && historicoCheio(copy)) return recusa(new HistoricoDaCopyCheio(copy, mudancas).problemas, true)

  // Os metadados entram EXATAMENTE como vieram: vazio não vira "agora" nem
  // some; acima do teto não é cortado. Conferidos sempre — com ou sem
  // mudança —, para a mesma chamada não passar ou falhar conforme o diff.
  const metadados = {
    em: quem.em ?? new Date().toISOString(),
    autor: quem.autor,
    motivo: quem.motivo,
    ...(quem.superficie !== undefined ? { superficie: quem.superficie } : {}),
  }
  const lidos = metadadosDaRevisaoSchema.safeParse(metadados)
  const problemasDosMetadados: ProblemaDaCopy[] = lidos.success
    ? []
    : lidos.error.issues.map((i) => ({ tipo: 'revisao', mensagem: `revisão nova: ${i.path.join('.') || '(raiz)'}: ${i.message}` }))

  if (mudancas.length === 0) {
    // Nada a registrar: devolve a original — desde que o leitor a aceite com os
    // blocos recebidos (bloco com chave desconhecida, ou copy já inválida, não
    // passa como "sem mudança").
    const problemas = [...problemasDosMetadados, ...validarCopyAutoral(candidata).problemas]
    return problemas.length > 0 ? recusa(problemas) : { copy, mudancas, problemas: [], original: copy, historicoCheio: false }
  }

  const porIdAntes = new Map(copy.blocos.map((b) => [b.id, b]))
  const removidos = mudancas
    .filter((m) => m.tipo === 'removido')
    .map((m) => {
      const b = porIdAntes.get(m.id)!
      return { id: b.id, funcao: b.funcao, linhas: [...b.linhas] }
    })
  const campos = Object.fromEntries(mudancas.filter((m) => m.tipo === 'alterado' && m.campos?.length).map((m) => [m.id, m.campos!]))
  const estrutura = {
    blocos: mudancas.map((m) => m.id),
    ...(removidos.length ? { removidos } : {}),
    ...(Object.keys(campos).length ? { campos } : {}),
  }
  // Mesma ordem de chaves de sempre (em, autor, motivo, blocos, removidos, campos, superficie): o JSON serializado não muda.
  const { superficie: _superficie, ...semSuperficie } = metadados as typeof metadados & { superficie?: string }
  const revisao = { ...semSuperficie, ...estrutura, ...(quem.superficie !== undefined ? { superficie: quem.superficie } : {}) } as RevisaoDaCopy
  const resultado: CopyAutoral = { ...candidata, revisoes: [...copy.revisoes, revisao] }

  // O RESULTADO inteiro passa pelo leitor. Com metadados recusados, o resto é
  // conferido com metadados neutros: todos os problemas voltam de uma vez, sem
  // repetir os dos metadados.
  const conferir = problemasDosMetadados.length === 0 ? resultado : { ...candidata, revisoes: [...copy.revisoes, { ...METADADOS_NEUTROS, ...estrutura }] }
  const problemas = [...problemasDosMetadados, ...validarCopyAutoral(conferir).problemas]
  if (problemas.length > 0) return recusa(problemas)
  return { copy: resultado, mudancas, problemas: [], original: copy, historicoCheio: false }
}

/**
 * Aplica uma mudança de blocos como REVISÃO registrada. `blocosNovos` substitui
 * a lista inteira (é assim que o editor e o chat mandam a copy de volta); os
 * blocos tocados saem do diff. Sem mudança nenhuma, devolve a copy como está,
 * sem registrar revisão vazia. Com mudança e histórico cheio, LANÇA
 * `HistoricoDaCopyCheio`; com metadados fora do teto ou resultado que o leitor
 * recusaria, LANÇA `RevisaoDaCopyInvalida` — nada é registrado nem descartado.
 */
export function aplicarRevisao(copy: CopyAutoral, blocosNovos: BlocoAutoral[], quem: QuemRevisa): { copy: CopyAutoral; mudancas: MudancaDeBloco[] } {
  const r = tentarAplicarRevisao(copy, blocosNovos, quem)
  if (r.copy) return { copy: r.copy, mudancas: r.mudancas }
  if (r.historicoCheio) throw new HistoricoDaCopyCheio(copy, r.mudancas)
  throw new RevisaoDaCopyInvalida(copy, r.mudancas, r.problemas)
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
