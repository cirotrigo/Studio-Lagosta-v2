/**
 * CP-V0 — paridade de pixel do `svg-path` no MESMO canvas de Node (@napi-rs/canvas):
 * servidor (CanvasRenderer → RenderEngine) × adaptador do editor (Konva real, ver
 * suporte/konva-no-node.ts). Fixture sintética (suporte/fixtures.ts).
 *
 * Prova a lógica e a consistência dos adaptadores NESTE ambiente. Não prova a
 * equivalência com o Konva do navegador (outro rasterizador, devicePixelRatio).
 *
 * Com CPV0_SAIDA=<dir>, grava os PNGs (antes/depois, editor/servidor) e as medidas.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateThumbnail } from '@/lib/render-engine'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { CASOS, FUNDO, camadaDo, casosDaBiblioteca, configKonvaAntes, configKonvaDepois, type Caso } from './suporte/fixtures'
import { comparar, escuro, maiorCorrida, pixelsDePng, pixelsDoKonva, pixelsDoServidor, pixelsDoServidorAntes, pngDe, type Pixels } from './suporte/konva-no-node'

const caso = (id: string) => CASOS.find((c) => c.id === id) as Caso

/** O editor de antes podia LANÇAR (ex.: arco de raio negativo): registra e devolve o fundo liso. */
const lancamentos: Record<string, string> = {}
function editorAntes(c: Caso): Pixels {
  try {
    return pixelsDoKonva(c.canvas.largura, c.canvas.altura, FUNDO, configKonvaAntes(c))
  } catch (e) {
    lancamentos[c.id] = String((e as Error).message ?? e)
    return pixelsDoKonva(c.canvas.largura, c.canvas.altura, FUNDO, { width: 0, height: 0 })
  }
}

async function quatro(c: Caso) {
  const { largura, altura } = c.canvas
  return {
    servidor: await pixelsDoServidor(largura, altura, FUNDO, [camadaDo(c)]),
    editor: pixelsDoKonva(largura, altura, FUNDO, configKonvaDepois(c)),
    servidorAntes: pixelsDoServidorAntes(c),
    editorAntes: editorAntes(c),
  }
}

const saida = process.env.CPV0_SAIDA
const medidas: Record<string, unknown> = {}

function guardar(id: string, imagens: Record<string, Pixels>, extra: Record<string, unknown>) {
  medidas[id] = extra
  if (!saida) return
  mkdirSync(saida, { recursive: true })
  for (const [nome, p] of Object.entries(imagens)) writeFileSync(join(saida, `${id}.${nome}.png`), pngDe(p))
  writeFileSync(join(saida, 'medidas.json'), JSON.stringify(medidas, null, 2))
}

describe('CP-V0: servidor × editor no mesmo canvas de Node', () => {
  it.each(CASOS.map((c) => [c.id, c] as const))('%s — servidor e editor desenham os mesmos pixels', async (id, c) => {
    const q = await quatro(c)
    const depois = comparar(q.servidor, q.editor)
    const antes = comparar(q.servidorAntes, q.editorAntes)
    const servidorMudou = comparar(q.servidorAntes, q.servidor)
    const editorMudou = comparar(q.editorAntes, q.editor)
    guardar(id, q, { descricao: c.descricao, depois, antes, servidorMudou, editorMudou, editorAntesLancou: lancamentos[id] })
    // tolerância declarada: zero — os dois lados emitem as mesmas operações no mesmo rasterizador
    expect(depois).toEqual({ diferentes: 0, maxDelta: 0, total: c.canvas.largura * c.canvas.altura })
  })

  it('inventário da biblioteca (todo svg-path × 2): depois, servidor = editor; antes × depois registrado', async () => {
    const casos = casosDaBiblioteca(SHAPES_LIBRARY)
    const comPath = SHAPES_LIBRARY.filter((s) => s.shapeType === 'svg-path' && s.pathData).length
    expect(comPath).toBeGreaterThanOrEqual(26) // a biblioteca tinha 26 svg-path na base edb46935
    expect(casos).toHaveLength(comPath * 2)
    for (const c of casos) {
      const q = await quatro(c)
      const depois = comparar(q.servidor, q.editor)
      guardar(c.id, q, {
        descricao: c.descricao,
        depois,
        antes: comparar(q.servidorAntes, q.editorAntes),
        servidorMudou: comparar(q.servidorAntes, q.servidor),
        editorMudou: comparar(q.editorAntes, q.editor),
      })
      expect([c.id, depois.diferentes]).toEqual([c.id, 0])
    }
  }, 120_000)

  it('fillRule: evenodd vaza o furo nos dois lados; antes, o editor o preenchia', async () => {
    const anel = await quatro(caso('anel-evenodd'))
    expect(escuro(anel.servidor, 120, 120)).toBe(false)
    expect(escuro(anel.editor, 120, 120)).toBe(false)
    expect(escuro(anel.editor, 120, 30)).toBe(true) // o aro
    expect(escuro(anel.editorAntes, 120, 120)).toBe(true) // o defeito que o CP-V0 corrige
    expect(escuro(anel.servidorAntes, 120, 120)).toBe(false)

    const nonzero = await quatro(caso('anel-nonzero'))
    expect(escuro(nonzero.servidor, 120, 120)).toBe(true)
    expect(escuro(nonzero.editor, 120, 120)).toBe(true)

    const estrela = await quatro(caso('estrela-evenodd'))
    expect(escuro(estrela.servidor, 120, 130)).toBe(false)
    expect(escuro(estrela.editor, 120, 130)).toBe(false)
    expect(escuro(estrela.editorAntes, 120, 130)).toBe(true)
  })

  it('contorno de 8 px tem 8 px nos dois eixos, em caixa 300×100 e 100×300 (antes o servidor dava 4 e 12)', async () => {
    const largo = await quatro(caso('contorno-8px-300x100'))
    // caixa em (20,20); o quadro vai de 10 a 90 do viewBox: topo em y=30, lado esquerdo em x=50
    for (const p of [largo.servidor, largo.editor, largo.editorAntes]) {
      expect(maiorCorrida(p, 'y', 170, 20, 70)).toBe(8) // espessura do lado de cima
      expect(maiorCorrida(p, 'x', 70, 20, 120)).toBe(8) // espessura do lado esquerdo
    }
    expect(maiorCorrida(largo.servidorAntes, 'y', 170, 20, 70)).toBe(4)
    expect(maiorCorrida(largo.servidorAntes, 'x', 70, 20, 120)).toBe(12)

    const alto = await quatro(caso('contorno-8px-100x300'))
    for (const p of [alto.servidor, alto.editor]) {
      expect(maiorCorrida(p, 'y', 70, 20, 120)).toBe(8)
      expect(maiorCorrida(p, 'x', 170, 20, 70)).toBe(8)
    }
  })

  it('preenchimento sem contorno: retângulo idêntico ao servidor de antes; curvas dentro da tolerância declarada', async () => {
    const quadro = await quatro(caso('quadro-so-preenchimento'))
    expect(comparar(quadro.servidorAntes, quadro.servidor).diferentes).toBe(0)
    const gota = await quatro(caso('gota-so-preenchimento'))
    const d = comparar(gota.servidorAntes, gota.servidor)
    // troca de parser (Path2D do Skia → Konva + arc): só antisserrilhado da borda
    expect(d.diferentes / d.total).toBeLessThan(0.01)
  })

  it('a miniatura avulsa (generateThumbnail, sem Path2D injetado) agora desenha o svg-path', async () => {
    const c = caso('anel-evenodd')
    const png = await generateThumbnail(
      { canvas: { width: 240, height: 240, backgroundColor: FUNDO }, layers: [camadaDo(c)] } as never,
      {},
      { width: 240, height: 240 },
    )
    const p = await pixelsDePng(png)
    expect(escuro(p, 120, 30)).toBe(true)
    expect(escuro(p, 120, 120)).toBe(false)
    guardar('miniatura-anel-evenodd', { miniatura: p }, { miniaturaIgualAoServidor: comparar(p, (await quatro(c)).servidor) })
  })
})
