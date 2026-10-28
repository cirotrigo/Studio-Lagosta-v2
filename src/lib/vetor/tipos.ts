/**
 * Tipos do vetor recolorível do catálogo de elementos (CP-V2b). Quem grava é o construtor da inserção (CP-V2c,
 * `src/lib/editor/camada-do-elemento.ts`). `asset` e `papeis` são só proveniência (nenhum renderer lê); `partes` e
 * `cores` (CP-V5) são o DESENHO multicor que os dois renderers leem pelo traçado único (`desenhar.ts`).
 *
 * - `CanalDeCor` é o canal FÍSICO da camada: `preenchimento` → `style.fill`, `contorno` → `style.strokeColor`. A
 *   `line` pinta com `style.fill` nos dois renderers (`konva-layer-factory.tsx`, `render-engine.ts`), então a cor dela
 *   é `preenchimento`.
 * - O papel é o da MARCA (`PapelDaMarca`, CP-V2a), não o `PapelDeCor` dos arquétipos, que tem 2 papéis e é contrato
 *   publicado.
 * - `VetorDaCamada` é a PROVENIÊNCIA que a inserção grava em `style.vetor` (`LayerStyle.vetor`, CP-V2c): de qual item
 *   e versão do catálogo a camada copiou o desenho, e de qual papel veio a cor de cada canal. Não é referência viva: o
 *   desenho fica congelado na camada (`pathData`, `fill`, `strokeColor`). Escolher a cor de um canal à mão apaga o
 *   papel DAQUELE canal (`escolhaExplicitaDaCor`). O gate da revisão classifica `style.vetor.*` como inerte
 *   (`gate-v4`, decisão D7a): continua valendo no CP-V5 porque o multicor só desenha com `pathData` presente, e o gate
 *   já recusa `style.pathData` (fail-closed).
 * - Multicor (CP-V5): `partes` em ordem de pintura, cada uma num `slot`; `cores[slot]` é a cor congelada (alfa próprio
 *   do slot; a opacidade da camada fica em `style.opacity` e o renderer a aplica uma vez). `pathData` + `fill` seguem
 *   presentes como SILHUETA para o leitor antigo. No multicor, `papeis` é por slot. O nome `slot` só existe aqui dentro:
 *   `metadata.slot` é a identidade semântica B1.
 */
import type { PapelDaMarca } from '@/lib/brand/papeis-de-cor'

export type CanalDeCor = 'preenchimento' | 'contorno'

/** Um canal de cor que o item do catálogo expõe, com o papel da marca que a inserção usa nele. */
export interface SlotDeCor {
  canal: CanalDeCor
  papelPadrao: PapelDaMarca
  rotulo: string
  /** Multicor: a chave do slot nas partes (`ParteDoVetor.slot`); `canal` diz só se ele pinta preenchimento ou contorno. */
  id?: string
}

/** Chave de uma cor da forma: o canal físico (monocolor) ou o slot das partes (multicor). */
export type ChaveDeCor = CanalDeCor | (string & {})

export interface ParteDoVetor {
  d: string
  slot: string
  alvo: 'fill' | 'stroke'
  fillRule?: 'nonzero' | 'evenodd'
}

export interface VetorDaCamada {
  asset: { id: string; versao: number }
  papeis?: Partial<Record<ChaveDeCor, PapelDaMarca>>
  partes?: ParteDoVetor[]
  cores?: Record<string, string>
}
