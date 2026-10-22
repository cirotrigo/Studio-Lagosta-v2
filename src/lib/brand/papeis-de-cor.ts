/**
 * A cor de cada PAPEL da marca para um vetor do catálogo de elementos (CP-V2a). Módulo PURO, sem `@/lib/db`: roda
 * no cliente (a inserção pelo painel, no V2c) e nos testes sem env.
 *
 * Só para vetores. O halo e o compositor têm resolvedores próprios, com outra precedência (`corEscuraDaMarca`,
 * `corDaManchaDoProjeto`, `destaqueDoPapel`), e eles não mudam. Unificar é o CP-V7, só com fixtures reais.
 *
 * - Entradas: a paleta (`BrandColor`) e o JSON CRU de `Project.assinatura`. Cru porque `mesclarNumeros` completa o
 *   ausente com `#0B0B0B` (`NUMEROS_PADRAO`), e "só se gravado" deixaria de existir.
 * - Saída sempre por `hexValido` (`#rrggbb` minúsculo) e com a fonte. Nunca a cor de vitrine de um item do catálogo:
 *   ela nem é entrada.
 * - Independe da ordem da paleta (DESC no cliente, ASC no servidor): o desempate é pelo hex.
 * - Cadeia (preflight do CP-V2, §7; D1 e D2 aprovadas pelo owner em 22/10/2026):
 *   - escuro: `fundo` → `mancha` → nome escuro → menor luz → `#111111`
 *   - claro: nome claro → maior luz → `#ffffff`
 *   - destaque: `destaque.fill` → a mais viva da paleta, fora do escuro e do claro → escuro
 *   - destaque2: `destaque.alternativa` → destaque
 *   - texto: escuro (D1: no editor não há texto ao qual o vetor esteja preso)
 */
import { hexValido } from '@/lib/creatives/halo/fundo-de-texto'
import { luzDaCor } from '@/lib/creatives/halo/halo'

export const PAPEIS_DA_MARCA = ['escuro', 'claro', 'destaque', 'destaque2', 'texto'] as const
export type PapelDaMarca = (typeof PAPEIS_DA_MARCA)[number]

export type FonteDaCor =
  | 'assinatura.fundo'
  | 'assinatura.mancha'
  | 'assinatura.destaque.fill'
  | 'assinatura.destaque.alternativa'
  | 'paleta.nome'
  | 'paleta.luz'
  | 'paleta.viva'
  | 'padrao'

export interface CorDoPapel {
  hex: string
  fonte: FonteDaCor
}

export interface DadosDaMarca {
  /** As `BrandColor` do projeto, em qualquer ordem. Item sem hex válido é ignorado. */
  paleta: ReadonlyArray<{ name?: unknown; hexCode?: unknown }>
  /** O JSON de `Project.assinatura` como veio do banco (`null` quando nunca foi gravado). */
  assinaturaCrua: unknown
}

const ESCURO_PADRAO = '#111111'
const CLARO_PADRAO = '#ffffff'
/** A faixa de luz de uma cor "viva" (a mesma de `corDeDestaque`, `manual-de-marca.ts`): fora dela, quase-preto e quase-branco. */
const LUZ_VIVA = { min: 40, max: 200 }
/**
 * Regex próprios, não o do halo (`fundo-de-texto.ts:361`): lá "fundo" e "background" contam como escuro, e
 * "Fundo claro" vira escuro. Nome que casa os dois não decide nada.
 */
const NOME_ESCURO = /escur|\bdark|pret[oa]|black/i
const NOME_CLARO = /clar[oa]|\blight|creme|cream|branc|white|marfim|ivory/i // `\b`: "Highlight" não é claro

interface CorDaPaleta {
  hex: string
  nome: string
}

const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function paletaValida(paleta: DadosDaMarca['paleta']): CorDaPaleta[] {
  const cores: CorDaPaleta[] = []
  for (const c of paleta ?? []) {
    const hex = hexValido(objeto(c)?.hexCode)
    if (hex) cores.push({ hex, nome: typeof c.name === 'string' ? c.name : '' })
  }
  return cores.sort((a, b) => a.hex.localeCompare(b.hex) || a.nome.localeCompare(b.nome))
}

/** A cor de menor (ou maior) luz; empate fica com o menor hex, porque a lista já vem ordenada. */
function porLuz(cores: CorDaPaleta[], quer: 'menor' | 'maior'): CorDaPaleta | undefined {
  return cores.reduce<CorDaPaleta | undefined>((melhor, c) => {
    if (!melhor) return c
    const d = luzDaCor(c.hex) - luzDaCor(melhor.hex)
    return (quer === 'menor' ? d < 0 : d > 0) ? c : melhor
  }, undefined)
}

/** Croma (máx − mín dos canais): ao contrário da saturação HSV, não dá nota máxima a um quase-preto como `#240000`. */
function croma(hex: string): number {
  const canais = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return Math.max(...canais) - Math.min(...canais)
}

export function resolverCorDaMarca(papel: PapelDaMarca, dados: DadosDaMarca): CorDoPapel {
  const paleta = paletaValida(dados.paleta)
  const assinatura = objeto(dados.assinaturaCrua)
  const destaqueGravado = objeto(assinatura?.destaque)

  const escuro = (): CorDoPapel => {
    const fundo = hexValido(assinatura?.fundo)
    if (fundo) return { hex: fundo, fonte: 'assinatura.fundo' }
    const mancha = hexValido(assinatura?.mancha)
    if (mancha) return { hex: mancha, fonte: 'assinatura.mancha' }
    const nomeado = porLuz(paleta.filter((c) => NOME_ESCURO.test(c.nome) && !NOME_CLARO.test(c.nome)), 'menor')
    if (nomeado) return { hex: nomeado.hex, fonte: 'paleta.nome' }
    const menor = porLuz(paleta, 'menor')
    return menor ? { hex: menor.hex, fonte: 'paleta.luz' } : { hex: ESCURO_PADRAO, fonte: 'padrao' }
  }

  const claro = (): CorDoPapel => {
    const nomeado = porLuz(paleta.filter((c) => NOME_CLARO.test(c.nome) && !NOME_ESCURO.test(c.nome)), 'maior')
    if (nomeado) return { hex: nomeado.hex, fonte: 'paleta.nome' }
    const maior = porLuz(paleta, 'maior')
    return maior ? { hex: maior.hex, fonte: 'paleta.luz' } : { hex: CLARO_PADRAO, fonte: 'padrao' }
  }

  const destaque = (): CorDoPapel => {
    const gravado = hexValido(destaqueGravado?.fill)
    if (gravado) return { hex: gravado, fonte: 'assinatura.destaque.fill' }
    const fora = new Set([escuro().hex, claro().hex])
    const viva = paleta
      .filter((c) => !fora.has(c.hex) && luzDaCor(c.hex) >= LUZ_VIVA.min && luzDaCor(c.hex) <= LUZ_VIVA.max)
      .reduce<CorDaPaleta | undefined>((melhor, c) => (!melhor || croma(c.hex) > croma(melhor.hex) ? c : melhor), undefined)
    return viva ? { hex: viva.hex, fonte: 'paleta.viva' } : escuro()
  }

  if (papel === 'claro') return claro()
  if (papel === 'destaque') return destaque()
  if (papel === 'destaque2') {
    const alternativa = hexValido(destaqueGravado?.alternativa)
    return alternativa ? { hex: alternativa, fonte: 'assinatura.destaque.alternativa' } : destaque()
  }
  return escuro() // 'escuro' e 'texto' (D1)
}
