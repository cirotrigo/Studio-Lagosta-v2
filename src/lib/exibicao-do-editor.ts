/**
 * O que o editor EXIBE por cima da arte (L2 das linhas-guia, 29/10/2026) — módulo puro: a preferência por pessoa
 * (margens da marca R, faixa/máscara da interface M, bordas da página C, encaixe) e a leitura das teclas.
 *
 * Nada daqui vai para `Page.layers` nem para o render: é só como a pessoa vê o canvas. A preferência mora no
 * localStorage (`CHAVE_DA_EXIBICAO`), no padrão de `use-editor-view-mode.tsx`, e sobrevive à troca de página no modo
 * contínuo (antes cada página montava o stage com `useState` e tudo voltava ao padrão).
 */

export interface ExibicaoDoEditor {
  /** As linhas azuis da margem da marca (R). */
  margens: boolean
  /** A faixa hachurada e a máscara da interface do Instagram, só no Story (M). */
  interface: boolean
  /** As bordas amarelas da página (C). */
  bordas: boolean
  /** O encaixe ao arrastar e redimensionar; segurar Alt desliga enquanto a tecla está presa. */
  encaixe: boolean
}

export const EXIBICAO_PADRAO: ExibicaoDoEditor = { margens: true, interface: true, bordas: false, encaixe: true }

export const CHAVE_DA_EXIBICAO = 'lagosta:editor:exibicao'

const CHAVES = Object.keys(EXIBICAO_PADRAO) as Array<keyof ExibicaoDoEditor>

/** O JSON gravado → a preferência; chave ausente ou lixo cai no padrão daquela chave, nunca derruba o resto. */
export function lerExibicao(json: string | null | undefined): ExibicaoDoEditor {
  if (!json) return { ...EXIBICAO_PADRAO }
  let lido: unknown
  try {
    lido = JSON.parse(json)
  } catch {
    return { ...EXIBICAO_PADRAO }
  }
  if (!lido || typeof lido !== 'object') return { ...EXIBICAO_PADRAO }
  const o = lido as Record<string, unknown>
  const r = { ...EXIBICAO_PADRAO }
  for (const k of CHAVES) if (typeof o[k] === 'boolean') r[k] = o[k] as boolean
  return r
}

export type AcaoDaTecla = 'margens' | 'interface' | 'bordas' | 'centrar-h' | 'centrar-v'

/**
 * A ação de uma tecla do canvas (quem chama já descartou campos de texto e o modo de recorte):
 * - `R`, `M`, `C` SOZINHAS alternam margens, interface e bordas — com Ctrl/Cmd, Alt ou Shift não (no Windows,
 *   Shift+Alt+C chegava como `c` e ligava as bordas);
 * - `Shift+Alt+C` / `Shift+Alt+M` centralizam a seleção no canvas (H / V) — pelo `code`, porque no Mac Alt+C
 *   produz `ç` em `key`. Eram atalhos anunciados nos rótulos sem handler nenhum.
 */
export function acaoDaTecla(e: { key: string; code?: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }): AcaoDaTecla | null {
  if (e.metaKey || e.ctrlKey) return null
  if (e.shiftKey && e.altKey) {
    if (e.code === 'KeyC') return 'centrar-h'
    if (e.code === 'KeyM') return 'centrar-v'
    return null
  }
  if (e.altKey || e.shiftKey) return null
  const k = e.key.toLowerCase()
  if (k === 'r') return 'margens'
  if (k === 'm') return 'interface'
  if (k === 'c') return 'bordas'
  return null
}
