/**
 * F2d da direção por referência (02/11/2026): o ESTILO do texto desenhado na página de referência — família, peso,
 * entrelinha, espaçamento, caixa, cor e sombra — vestido sobre o estilo-base efetivo do bloco (o do arranjo ou o da
 * assinatura). A referência vence campo a campo, INCLUSIVE as ausências: sem peso declarado limpa o 700 herdado; `none`
 * limpa a caixa alta herdada. O que a referência não cobre fica da base: `fontSize` (é `corpos`, F2c: a base da escada),
 * `prefixo`, `larguraMaxima`, `destaque` e a sombra quando a referência não tem (`null` da base = sem sombra; `undefined`
 * = default da casa — nunca espalhados).
 *
 * O espaçamento é um CONTRATO em px NO CORPO DESENHADO (`espacamentoDaReferencia`): `camadaDoPapel` o resolve DEPOIS de
 * arredondar o corpo (`round2(S × fontSize / R)`), em qualquer degrau que materialize o mesmo corpo — o `letterSpacing`
 * contínuo fica como reserva para quem não lê o contrato. A segunda voz (`headline2`) toma SÓ a cor (é outra voz por
 * contrato: família, peso e entrelinha são do arranjo/assinatura).
 *
 * Módulo PURO.
 */
import type { EstiloDePapel } from '../assinatura'
import type { ArquetipoDeLayout, EstiloDaReferencia, FormatoDoArquetipo, PapelDeTexto } from './tipos'
import type { Papel } from '../spec'

export type OrigemDoCampo = 'referencia' | 'assinatura' | 'arranjo'
export type CampoDoEstilo = 'fontFamily' | 'fontWeight' | 'lineHeight' | 'letterSpacing' | 'textTransform' | 'color' | 'sombra'
export const CAMPOS_DO_ESTILO: readonly CampoDoEstilo[] = ['fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'color', 'sombra']

export interface EstiloVestido {
  estilo: EstiloDePapel
  origem: Record<CampoDoEstilo, OrigemDoCampo>
}

export function vestirEstiloDaReferencia(args: {
  base: EstiloDePapel
  origemDaBase: 'assinatura' | 'arranjo'
  estilo: EstiloDaReferencia
  /** O corpo desenhado (`corpos[papel]`, px): a régua do espaçamento. */
  corpo: number
  /** A segunda voz: só a cor da referência; o resto fica da base. */
  apenasCor?: boolean
}): EstiloVestido {
  const { base, estilo: ref, corpo } = args
  const daBase = args.origemDaBase
  if (args.apenasCor) {
    const { espacamentoDaReferencia: _c, ...semContrato } = base
    return {
      estilo: { ...semContrato, color: ref.color },
      origem: { fontFamily: daBase, fontWeight: daBase, lineHeight: daBase, letterSpacing: daBase, textTransform: daBase, color: 'referencia', sombra: daBase },
    }
  }
  const { fontWeight: _peso, textTransform: _caixa, ...resto } = base
  const estilo: EstiloDePapel = {
    ...resto,
    fontFamily: ref.fontFamily,
    ...(ref.fontWeight !== null ? { fontWeight: ref.fontWeight } : {}),
    lineHeight: ref.lineHeight,
    // Reserva contínua (quem não lê o contrato): `S × base / R` sai `S × efetivo / R` depois de `× escala`.
    letterSpacing: corpo > 0 ? (ref.letterSpacing * base.fontSize) / corpo : ref.letterSpacing,
    espacamentoDaReferencia: { spacing: ref.letterSpacing, corpo },
    ...(ref.textTransform !== 'none' ? { textTransform: ref.textTransform } : {}),
    color: ref.color,
    ...(ref.sombra ? { sombra: ref.sombra } : {}),
  }
  return {
    estilo,
    origem: { fontFamily: 'referencia', fontWeight: 'referencia', lineHeight: 'referencia', letterSpacing: 'referencia', textTransform: 'referencia', color: 'referencia', sombra: ref.sombra ? 'referencia' : daBase },
  }
}

/**
 * O estilo desenhado de cada papel (com o corpo desenhado, a régua do espaçamento) a partir da definição — `null` quando a
 * definição não tem `estilos` (catálogo, revisões de antes da F2d): a peça veste a assinatura, como sempre. A segunda voz
 * pergunta pelo papel geométrico (`headline`).
 */
export function estiloDoPapelDaReferencia(definicao: ArquetipoDeLayout, formato: FormatoDoArquetipo): ((papel: Papel) => { estilo: EstiloDaReferencia; corpo: number } | undefined) | null {
  const g = definicao.formatos[formato]
  const estilos = g?.estilos
  if (!estilos) return null
  return (papel: Papel) => {
    const geometrico = (papel === 'headline2' ? 'headline' : papel) as PapelDeTexto
    const estilo = estilos[geometrico]
    const corpo = g.corpos?.[geometrico]
    return estilo && corpo !== undefined ? { estilo, corpo } : undefined
  }
}
