/**
 * #5 (24/10/2026) — X-01: paridade de pixel da PÍLULA DO ARQUÉTIPO (a camada que o compositor desenha,
 * `camadaDoAcento` com a receita do `minimal-fb-topo-centro@1`), no MESMO canvas de Node do `paridade-presets`: servidor
 * (CanvasRenderer → RenderEngine) × `Konva.Rect` REAL com as props do `ShapeNode` do editor para `rounded-rectangle`
 * (`cornerRadius = min(borderRadius || 24, min(w, h) / 2)`, conferidas na fonte pelo `paridade-presets`). Caixas do
 * preflight: 710×87 e 136×87 (corpo 30, Story), 710×77 (Feed) e 710×119 (corpo grande). Não prova o Konva do navegador.
 */
import { Rect } from 'konva/lib/shapes/Rect'
import { describe, expect, it } from 'vitest'
import { camadaDoAcento, receitasDoArquetipo } from '@/lib/compositor/arquetipos/acentos'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import type { Layer } from '@/types/template'
import { FUNDO } from './suporte/fixtures'
import { comparar, pixelsDoNoKonva, pixelsDoServidor } from './suporte/konva-no-node'

const receita = receitasDoArquetipo(verArquetipo('minimal-fb-topo-centro', 1)!).receitas[0]

/** As props do `ShapeNode` para `rounded-rectangle` (konva-layer-factory.tsx). */
function noDoEditor(camada: Layer) {
  const style = camada.style ?? {}
  const width = Math.max(10, camada.size.width)
  const height = Math.max(10, camada.size.height)
  const borderRadius = style.border?.radius ?? 0
  const strokeWidth = style.strokeWidth ?? style.border?.width ?? 0
  return new Rect({ x: camada.position.x, y: camada.position.y, width, height, cornerRadius: Math.min(borderRadius || 24, Math.min(width, height) / 2), fill: style.fill ?? '#2563eb', stroke: style.strokeColor, strokeWidth })
}

describe('#5 · a pílula do arquétipo: servidor × Konva.Rect real', () => {
  it.each([
    [710, 87],
    [136, 87],
    [710, 77],
    [710, 119],
  ])('%i×%i — 0 px de diferença, raio de meia altura, e desenha algo', async (w, h) => {
    const camada = { ...camadaDoAcento({ receita, rect: { x: 20, y: 20, width: w, height: h } }, { hex: '#1a3987', fonte: 'texto-do-papel' }, 'minimal-fb-topo-centro@1') }
    expect(camada.style).toMatchObject({ shapeType: 'rounded-rectangle', fill: 'transparent', strokeWidth: 2, border: { radius: 9999 } })
    const [largura, altura] = [w + 40, h + 40]
    const servidor = await pixelsDoServidor(largura, altura, FUNDO, [camada])
    const editor = pixelsDoNoKonva(largura, altura, FUNDO, () => noDoEditor(camada))
    const vazio = pixelsDoNoKonva(largura, altura, FUNDO, () => new Rect({ width: 0, height: 0 }))
    expect(comparar(servidor, editor)).toMatchObject({ diferentes: 0, maxDelta: 0 })
    expect(comparar(servidor, vazio).diferentes).toBeGreaterThan(0)
    // O raio efetivo é o clamp: meia altura (a pílula de pontas redondas, P-06).
    expect(noDoEditor(camada).cornerRadius()).toBe(h / 2)
  })
})
