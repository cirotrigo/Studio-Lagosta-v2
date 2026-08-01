/**
 * Medidor de altura de texto para o reflow no servidor.
 *
 * Usa o MESMO cálculo do render das artes agendadas
 * (RenderEngine.measureTextLayerHeight). As fontes do projeto PRECISAM estar
 * registradas antes (registerProjectFonts) — medir com a fonte de fallback dá
 * altura errada e o layout desanda.
 *
 * Import dinâmico do @napi-rs/canvas para não entrar no bundle do cliente
 * (mesmo padrão do register-project-fonts).
 */
import type { MeasureLayerHeight } from '@/lib/combo-stack-reflow'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import { RenderEngine } from '@/lib/render-engine'

export async function createServerTextMeasurer(): Promise<MeasureLayerHeight> {
  const { createCanvas } = await import('@napi-rs/canvas')
  const ctx = createCanvas(1, 1).getContext('2d')
  return (layer) =>
    RenderEngine.measureTextLayerHeight(ctx as unknown as CanvasRenderingContext2D, layer)
}

/** Variante com a caixa completa (altura + largura de linha), para a validação geométrica. */
export async function createServerTextBoxMeasurer(): Promise<MeasureTextBox> {
  const { createCanvas } = await import('@napi-rs/canvas')
  const ctx = createCanvas(1, 1).getContext('2d')
  return (layer) =>
    RenderEngine.measureTextLayerBox(ctx as unknown as CanvasRenderingContext2D, layer)
}
