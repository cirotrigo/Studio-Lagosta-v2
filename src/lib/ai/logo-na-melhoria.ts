/**
 * A LOGO na melhoria: o modelo não desenha, o código repõe.
 *
 * 🔴 Medido na bancada da carteira (02/09/2026): com o arquivo oficial da Wine
 * Vix como referência, o gpt-image ainda devolveu o selo redondo com letras
 * aproximadas — marca circular de traço fino é o que o modelo mais erra, e o
 * Ciro reprovou ("a logo da Wine Vix não está correta"). Instrução não
 * resolve; casar a marca desenhada por correlação de bordas também não achou
 * o selo (0,12 no lugar certo — o modelo o desenha com outra polaridade e
 * outras proporções). O que resolve é o `compor` da trilha arte: o prompt
 * reserva o canto e o PNG oficial é colado por código.
 *
 * Vale para os projetos em `compor` (`logoModePadraoPara`), como na geração:
 * mesma decisão, mesma lista.
 */
import type { ImprovementFormat } from './creative-improvement-format'
import {
  comporLogo,
  instrucaoAreaReservada,
  logoModePadraoPara,
  type LogoCorner,
  type LogoCompositionResult,
} from './logo-compositor'

/** O canto reservado no prompt da melhoria. */
export const CANTO_DA_MELHORIA: LogoCorner = 'bottom-right'

export function melhoriaCompoeLogo(projectId: number): boolean {
  return logoModePadraoPara(projectId) === 'compor'
}

/** A seção do prompt: não desenhe a marca, reserve o canto. */
export function instrucaoLogoNaMelhoria(): string {
  return instrucaoAreaReservada(CANTO_DA_MELHORIA)
}

function formatoDe(format: ImprovementFormat): 'story' | 'feed' | 'quadrado' {
  return format === 'STORY' ? 'story' : format === 'SQUARE' ? 'quadrado' : 'feed'
}

export interface LogoNaMelhoriaInfo {
  modo: 'compor'
  canto: LogoCorner
  contraste: number | null
  versao: LogoCompositionResult['versao']
}

/** Cola o PNG oficial na arte melhorada, no canto mais calmo com contraste. */
export async function finalizarLogoDaMelhoria(
  arteBuffer: Buffer,
  logoBuffer: Buffer,
  format: ImprovementFormat,
): Promise<{ buffer: Buffer; info: LogoNaMelhoriaInfo }> {
  const r = await comporLogo(arteBuffer, logoBuffer, {
    formato: formatoDe(format),
    cornerReservado: CANTO_DA_MELHORIA,
  })
  return { buffer: r.buffer, info: { modo: 'compor', canto: r.corner, contraste: r.contraste, versao: r.versao } }
}
