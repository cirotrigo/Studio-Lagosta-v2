/**
 * O CARIMBO DA VOZ NA ESCRITA (PR 15 de "Marca simples, copy melhor", 12/09/2026).
 *
 * Nada registrava QUAL identidade de texto estava em vigor quando a copy de uma
 * peça foi escrita — e sem isso "a semana seguinte já reflete a voz nova" (o
 * critério de pronto da F5) não tem como ser medido: a voz muda de versão, o
 * cliente migra do DNA legado para a voz compacta, e a peça não diz de qual
 * lado nasceu.
 *
 * O carimbo mora em `Generation.fieldValues.vozNaEscrita`, FORA do contrato
 * estrito da copy (`copyAutoralSchema` é `.strict()` — uma chave a mais
 * recusaria a copy inteira na leitura). Quem grava é quem produz a peça: o
 * compositor (`compor-arte`, `compor-leva`, a via `compor` do plano) e
 * `startArtGeneration` (as vias de IA). Gravar é best-effort: falhar ao ler a
 * voz NUNCA derruba a peça — ela sai sem carimbo, e o relatório conta "sem
 * carimbo".
 *
 * 🔴 **A copy do item de plano foi escrita ANTES da produção** (no `criar-plano`,
 * que não tem onde guardar o carimbo: `ItemDePlano` não tem `fieldValues`, e o
 * PR 15 é sem migration). Por isso quem produz passa `escritaEm` (o `createdAt`
 * do item) e o carimbo NÃO INVENTA: se a voz migrou ou mudou de versão depois
 * da escrita, a fonte e/ou a versão daquele instante são desconhecidas e saem
 * `null`, com o motivo em `incerto`. Sem `escritaEm`, a copy chegou na mesma
 * chamada que produz (compor-arte pelo chat, a bancada) e o carimbo vale.
 *
 * Módulo PURO.
 */

export type FonteDaVoz = 'voz' | 'legado' | 'nenhuma'

export interface CarimboDaVoz {
  /** De onde vinha a identidade de texto quando a copy foi escrita. `null` = desconhecido (ver `incerto`). */
  fonte: FonteDaVoz | null
  /** Versão do CONTEÚDO da voz naquele instante (só quando `fonte: 'voz'`). `null` = legado, nenhuma ou desconhecida. */
  versao: number | null
  /** Quando o carimbo foi lido (ISO). */
  lidoEm: string
  /** Quando a copy foi escrita, quando isso é anterior à produção (ISO). Ausente = mesma chamada. */
  escritaEm?: string
  /** Por que fonte ou versão ficaram desconhecidas. */
  incerto?: string
}

export interface EstadoDaVozAgora {
  fonte: FonteDaVoz
  versao: number | null
  /** Quando a voz passou a valer (`BrandVoice.migradaEm`). */
  migradaEm?: Date | string | null
  /** Última gravação da voz (`BrandVoice.updatedAt`). */
  atualizadaEm?: Date | string | null
}

const iso = (d: Date | string | null | undefined): string | null => {
  if (d == null) return null
  const t = d instanceof Date ? d.getTime() : Date.parse(d)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}
const ms = (d: Date | string | null | undefined): number | null => {
  const s = iso(d)
  return s ? Date.parse(s) : null
}

/**
 * O carimbo a partir do estado da voz AGORA e, quando a copy foi escrita
 * antes, do instante da escrita. Estado ausente (`null`) = sem carimbo.
 */
export function carimboDaVoz(agora: EstadoDaVozAgora | null, opcoes: { lidoEm?: Date; escritaEm?: Date | string | null } = {}): CarimboDaVoz | null {
  if (!agora) return null
  const lidoEm = (opcoes.lidoEm ?? new Date()).toISOString()
  const escritaEm = iso(opcoes.escritaEm)
  const base: CarimboDaVoz = { fonte: agora.fonte, versao: agora.fonte === 'voz' ? agora.versao : null, lidoEm, ...(escritaEm ? { escritaEm } : {}) }
  const tEscrita = escritaEm ? Date.parse(escritaEm) : null
  if (tEscrita == null) return base

  const tMigrada = ms(agora.migradaEm)
  if (agora.fonte === 'voz' && tMigrada != null && tMigrada > tEscrita) {
    // A precedência trocou depois da escrita: naquele instante mandava o DNA
    // legado OU nada — e o DNA daquele dia não está guardado. Não se chuta.
    return { ...base, fonte: null, versao: null, incerto: 'a voz passou a valer depois que a copy foi escrita' }
  }
  const tAtualizada = ms(agora.atualizadaEm)
  if (agora.fonte === 'voz' && tAtualizada != null && tAtualizada > tEscrita) {
    return { ...base, versao: null, incerto: 'a voz mudou de versão depois que a copy foi escrita' }
  }
  return base
}

/** Lê o carimbo gravado, tolerante: forma inesperada vira `null` (conta como "sem carimbo"). */
export function lerCarimboDaVoz(gravado: unknown): CarimboDaVoz | null {
  if (!gravado || typeof gravado !== 'object' || Array.isArray(gravado)) return null
  const g = gravado as Record<string, unknown>
  const fonte = g.fonte === 'voz' || g.fonte === 'legado' || g.fonte === 'nenhuma' ? g.fonte : g.fonte === null ? null : undefined
  if (fonte === undefined) return null
  if (typeof g.lidoEm !== 'string') return null
  const versao = typeof g.versao === 'number' && Number.isInteger(g.versao) ? g.versao : null
  return {
    fonte,
    versao: fonte === 'voz' ? versao : null,
    lidoEm: g.lidoEm,
    ...(typeof g.escritaEm === 'string' ? { escritaEm: g.escritaEm } : {}),
    ...(typeof g.incerto === 'string' ? { incerto: g.incerto } : {}),
  }
}
