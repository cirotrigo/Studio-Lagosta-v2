/**
 * Blur do vetor MULTICOR (CP-V5, rodada 1): o stack blur da casa (`applyStackBlur`, o mesmo kernel do Konva) sobre cor
 * PRÉ-MULTIPLICADA pelo alfa. Puro e isomórfico (editor como filtro Konva, servidor no offscreen do `renderShapeBlurred`).
 *
 * O `applyStackBlur` divide o RGB pelo alfa borrado nas DUAS passadas, como se a entrada já fosse pré-multiplicada — e o
 * `getImageData` não é: a cor semitransparente satura (laranja a 60% virava amarelo). Aqui a primitiva fica INTACTA (o
 * halo e os outros efeitos seguem nela): a cor pré-multiplicada vai com alfa 255 (a divisão vira ×1) e o alfa é borrado
 * num buffer próprio, com o MESMO kernel; no fim, cor ÷ alfa.
 */
import { applyStackBlur } from '@/lib/konva/filters/apply'

export function borrarPreMultiplicado(dados: Uint8ClampedArray, largura: number, altura: number, raio: number): void {
  if (Math.round(raio) <= 0) return
  const cor = new Uint8ClampedArray(dados.length)
  const alfa = new Uint8ClampedArray(dados.length)
  for (let i = 0; i < dados.length; i += 4) {
    const a = dados[i + 3]
    cor[i] = (dados[i] * a) / 255
    cor[i + 1] = (dados[i + 1] * a) / 255
    cor[i + 2] = (dados[i + 2] * a) / 255
    cor[i + 3] = 255
    alfa[i] = a
    alfa[i + 3] = 255
  }
  applyStackBlur(cor, largura, altura, raio)
  applyStackBlur(alfa, largura, altura, raio)
  for (let i = 0; i < dados.length; i += 4) {
    const a = alfa[i]
    dados[i + 3] = a
    dados[i] = a ? (cor[i] * 255) / a : 0
    dados[i + 1] = a ? (cor[i + 1] * 255) / a : 0
    dados[i + 2] = a ? (cor[i + 2] * 255) / a : 0
  }
}

/**
 * O mesmo blur como filtro do Konva (`this` é o nó; o raio é o `blurRadius` já no buffer do cache). Lido por `getAttr`:
 * o getter `blurRadius()` só existe quando o módulo do Blur do Konva foi carregado.
 */
export function FiltroBlurDoMulticor(this: { getAttr(chave: string): unknown }, imagem: ImageData): void {
  borrarPreMultiplicado(imagem.data, imagem.width, imagem.height, Number(this.getAttr('blurRadius')) || 0)
}
