import Konva from 'konva'

/**
 * Reaplica um SVG path (atributo `d`) no contexto do Konva — a mesma
 * reprodução do Konva.Path._sceneFunc, para usar dentro de `clipFunc`
 * (máscara de forma em imagem). O render server-side faz o equivalente com
 * `Path2D` do @napi-rs/canvas; os dois lados consomem o MESMO path congelado
 * em `layer.style.mask.path` (viewBox 0 0 100 100).
 */
export function traceSvgPath(ctx: Konva.Context, d: string): void {
  const segments = Konva.Path.parsePathData(d)

  for (const segment of segments) {
    const p = segment.points
    switch (segment.command) {
      case 'L':
        ctx.lineTo(p[0], p[1])
        break
      case 'M':
        ctx.moveTo(p[0], p[1])
        break
      case 'C':
        ctx.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5])
        break
      case 'Q':
        ctx.quadraticCurveTo(p[0], p[1], p[2], p[3])
        break
      case 'A': {
        // parsePathData converte o arco de endpoint para center parameterization
        const cx = p[0]
        const cy = p[1]
        const rx = p[2]
        const ry = p[3]
        const theta = p[4]
        const dTheta = p[5]
        const psi = p[6]
        const fs = p[7]
        const r = rx > ry ? rx : ry
        const scaleX = rx > ry ? 1 : rx / ry
        const scaleY = rx > ry ? ry / rx : 1
        ctx.translate(cx, cy)
        ctx.rotate(psi)
        ctx.scale(scaleX, scaleY)
        ctx.arc(0, 0, r, theta, theta + dTheta, 1 - fs > 0)
        ctx.scale(1 / scaleX, 1 / scaleY)
        ctx.rotate(-psi)
        ctx.translate(-cx, -cy)
        break
      }
      case 'z':
        ctx.closePath()
        break
      default:
        break
    }
  }
}
