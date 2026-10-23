/**
 * CP-V2b — paridade de pixel dos `svg-path` do catálogo CANDIDATO (o `spark-4` e os 6 novos), no MESMO canvas de
 * Node do CP-V0: servidor (RenderEngine) × adaptador do editor (Konva real). Desde a ativação (CP-V2c) o inventário
 * do V0 (`paridade-pixel.test.ts`) também os percorre, com a vitrine; este teste segue com a cor de teste no canal de
 * cada slot.
 *
 * Cor de teste no canal de cada slot (a vitrine do catálogo nunca vai para a camada); item só de contorno com fill
 * transparente. Com CPV2B_SAIDA=<dir>, grava os PNGs (servidor e editor) e as medidas.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ELEMENTOS_CANDIDATOS } from '@/lib/assets/shapes-library'
import { FUNDO, camadaDo, casosDaBiblioteca, configKonvaDepois } from './suporte/fixtures'
import { comparar, pixelsDoKonva, pixelsDoServidor, pngDe } from './suporte/konva-no-node'

const COR_DE_TESTE = '#1a3987'

const comCorDeTeste = ELEMENTOS_CANDIDATOS.filter((e) => e.shapeType === 'svg-path').map((e) => {
  const canais = e.slots.map((s) => s.canal)
  return {
    ...e,
    fill: canais.includes('preenchimento') ? COR_DE_TESTE : 'transparent',
    strokeColor: canais.includes('contorno') ? COR_DE_TESTE : undefined,
  }
})

// o mesmo casosDaBiblioteca do V0, item a item, com as pontas do traço do próprio item
const casos = comCorDeTeste.flatMap((e) => casosDaBiblioteca([e]).map((c) => ({ ...c, tracoPontas: e.tracoPontas })))

const saida = process.env.CPV2B_SAIDA
const medidas: Record<string, unknown> = {}

describe('CP-V2b: candidatos svg-path, servidor × editor no mesmo canvas de Node', () => {
  it('são o spark-4 e os 6 svg-path novos, 2 casos cada (vitrine 200×200 e contorno 4 px em 300×100)', () => {
    expect(comCorDeTeste.map((e) => e.id)).toEqual(['spark-4', 'onda-suave', 'sublinhado-suave', 'pontos', 'moldura-aberta', 'cantoneiras', 'colchete'])
    expect(casos).toHaveLength(14)
    expect(casos.map((c) => [c.id, c.caixa.largura, c.caixa.altura])).toContainEqual(['lib-onda-suave-contorno', 300, 100])
  })

  it.each(casos.map((c) => [c.id, c] as const))('%s — servidor e editor desenham os mesmos pixels, e desenham algo', async (id, c) => {
    const { largura, altura } = c.canvas
    const servidor = await pixelsDoServidor(largura, altura, FUNDO, [camadaDo(c)])
    const editor = pixelsDoKonva(largura, altura, FUNDO, configKonvaDepois(c))
    const vazio = pixelsDoKonva(largura, altura, FUNDO, { width: 0, height: 0 })
    const depois = comparar(servidor, editor)
    const desenhado = comparar(servidor, vazio).diferentes
    medidas[id] = { descricao: c.descricao, depois, pixelsDesenhados: desenhado }
    if (saida) {
      mkdirSync(saida, { recursive: true })
      writeFileSync(join(saida, `${id}.servidor.png`), pngDe(servidor))
      writeFileSync(join(saida, `${id}.editor.png`), pngDe(editor))
      writeFileSync(join(saida, 'medidas.json'), JSON.stringify(medidas, null, 2))
    }
    // tolerância declarada: zero, como no V0 (as mesmas operações no mesmo rasterizador)
    expect(depois).toEqual({ diferentes: 0, maxDelta: 0, total: largura * altura })
    // um caso que não desenha nada passaria a comparação acima sozinho
    expect(desenhado).toBeGreaterThan(0)
  })
})
