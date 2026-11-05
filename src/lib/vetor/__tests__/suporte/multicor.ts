/**
 * CP-V5 — a fixture COMUM do multicor (testes de Node e harness do navegador): 3 slots, ordem/sobreposição, `evenodd`,
 * contorno, alfa próprio e "meet". viewBox 200 × 100 numa caixa 300 × 100: o desenho ocupa 200 × 100 centrado
 * (sobra 50 px de cada lado), então pintura fora disso prova o "meet".
 *
 * - `fundo` (fill, #1e3a8a): faixa de baixo, y 50–100 — é também a silhueta;
 * - `anel` (fill evenodd, #f97316 a 60%): anel de centro (150, 50), raios 40/20, os DOIS subpaths no mesmo sentido —
 *   com `nonzero` o furo encheria;
 * - `traco` (stroke, #10b981): fio horizontal em y = 10, espessura 6 px da camada.
 */
import type { Layer, LayerStyle } from '@/types/template'

export const FUNDO_DA_TELA = '#ffffff'
export const CANVAS_MC = { largura: 320, altura: 220 }
export const CAIXA_MC = { x: 10, y: 50, largura: 300, altura: 100 }
export const VIEWBOX_MC: [number, number, number, number] = [0, 0, 200, 100]

export const D_FAIXA = 'M0 50 L200 50 L200 100 L0 100 Z'
export const D_ANEL = 'M110 50 A40 40 0 1 0 190 50 A40 40 0 1 0 110 50 Z M130 50 A20 20 0 1 0 170 50 A20 20 0 1 0 130 50 Z'
export const D_TRACO = 'M10 10 L190 10'

export const CORES_MC = { fundo: '#1e3a8a', anel: 'rgba(249, 115, 22, 0.6)', traco: '#10b981' }

export function estiloMulticor(extra: Partial<LayerStyle> = {}): LayerStyle {
  return {
    shapeType: 'svg-path',
    pathData: D_FAIXA,
    pathViewBox: VIEWBOX_MC,
    fill: CORES_MC.fundo,
    strokeWidth: 6,
    opacity: 1,
    vetor: {
      asset: { id: 'fixture-3-slots', versao: 1 },
      papeis: { fundo: 'escuro', anel: 'destaque', traco: 'texto' },
      partes: [
        { d: D_FAIXA, slot: 'fundo', alvo: 'fill' },
        { d: D_ANEL, slot: 'anel', alvo: 'fill', fillRule: 'evenodd' },
        { d: D_TRACO, slot: 'traco', alvo: 'stroke' },
      ],
      cores: { ...CORES_MC },
    },
    ...extra,
  }
}

export function camadaMulticor(extra: Partial<LayerStyle> = {}, id = 'mc'): Layer {
  return {
    id,
    type: 'shape',
    name: 'Multicor',
    visible: true,
    locked: false,
    order: 0,
    position: { x: CAIXA_MC.x, y: CAIXA_MC.y },
    size: { width: CAIXA_MC.largura, height: CAIXA_MC.altura },
    style: estiloMulticor(extra),
  } as Layer
}

/** Ponto do viewBox → pixel do canvas (meet: escala 1, deslocamento 50 em x dentro da caixa). */
export const noCanvas = (vx: number, vy: number, espelhoH = false) => {
  const local = 50 + vx
  return { x: CAIXA_MC.x + (espelhoH ? CAIXA_MC.largura - local : local), y: CAIXA_MC.y + vy }
}

/** As amostras (no viewBox) e o que cada uma pinta. */
export const AMOSTRAS_MC = {
  faixa: [20, 90],
  anelSobreFaixa: [150, 85],
  furoSobreFaixa: [150, 60],
  anelSobreBranco: [150, 15],
  traco: [100, 10],
  vazioDoMeio: [60, 30],
} as const
