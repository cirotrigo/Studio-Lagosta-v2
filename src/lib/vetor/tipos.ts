/**
 * Tipos do vetor recolorível do catálogo de elementos (CP-V2b). Só tipos: ainda não há leitor nem gravador.
 *
 * - `CanalDeCor` é o canal FÍSICO da camada: `preenchimento` → `style.fill`, `contorno` → `style.strokeColor`. A
 *   `line` pinta com `style.fill` nos dois renderers (`konva-layer-factory.tsx`, `render-engine.ts`), então a cor dela
 *   é `preenchimento`.
 * - O papel é o da MARCA (`PapelDaMarca`, CP-V2a), não o `PapelDeCor` dos arquétipos, que tem 2 papéis e é contrato
 *   publicado.
 * - `VetorDaCamada` é a PROVENIÊNCIA que a inserção do V2c vai gravar em `style.vetor`: de qual item e versão do
 *   catálogo a camada copiou o desenho, e de qual papel veio a cor de cada canal. Não é referência viva: o desenho fica
 *   congelado na camada (`pathData`, `fill`, `strokeColor`). `LayerStyle.vetor` ainda NÃO é declarado: o gate da
 *   revisão exige classificação para toda chave declarada (decisão D7, no V2c). As partes do multiparte são do CP-V5.
 */
import type { PapelDaMarca } from '@/lib/brand/papeis-de-cor'

export type CanalDeCor = 'preenchimento' | 'contorno'

/** Um canal de cor que o item do catálogo expõe, com o papel da marca que a inserção usa nele. */
export interface SlotDeCor {
  canal: CanalDeCor
  papelPadrao: PapelDaMarca
  rotulo: string
}

export interface VetorDaCamada {
  asset: { id: string; versao: number }
  papeis?: Partial<Record<CanalDeCor, PapelDaMarca>>
}
