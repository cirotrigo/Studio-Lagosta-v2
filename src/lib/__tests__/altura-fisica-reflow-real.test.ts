/**
 * A altura física (ceil da altura natural) com o medidor REAL do servidor — @napi-rs/canvas + RenderEngine, sem mock
 * de medida. Fonte de fallback (nenhuma registrada): o número absoluto depende dela; o contrato testado não.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { reflowLayersAfterFill } from '@/lib/combo-stack-reflow'
import { createServerTextBoxMeasurer, createServerTextMeasurer } from '@/lib/creatives/server-text-measurer'

// lineHeight 1.11 × 33 px × 2 linhas + padding 12 = 85,26: ceil 86 ≠ round 85 — o caso distingue a regressão de 1 px.
const texto = (id: string, y: number, content: string, height: number): Layer =>
  ({ id, name: id, type: 'text', content, position: { x: 0, y }, size: { width: 320, height }, style: { fontSize: 33, lineHeight: 1.11, fontFamily: 'Arial' }, textboxConfig: { textMode: 'auto-wrap-fixed' }, metadata: { groupId: 'g' } }) as unknown as Layer

describe('altura física no reflow com o medidor real do servidor', () => {
  it('duas linhas fracionárias: caixa ceil da altura natural, sem truncar', async () => {
    const medir = await createServerTextBoxMeasurer()
    const m = medir(texto('t', 0, 'Primeira linha\nsegunda linha', 10))!
    expect(m.lineCount).toBe(2)
    expect(m.naturalHeight).toBeCloseTo(85.26, 6)
    expect([m.height, Math.round(m.naturalHeight)]).toEqual([86, 85])
    // Sem truncamento: a caixa cobre a altura natural inteira e não sobra pixel inteiro.
    expect(m.height - m.naturalHeight).toBeGreaterThan(0)
    expect(m.height - m.naturalHeight).toBeLessThan(1)
  })

  it('reflowLayersAfterFill com createServerTextMeasurer: altura ceil e offset do vizinho pelo delta físico', async () => {
    const altura = await createServerTextMeasurer()
    const caixa = await createServerTextBoxMeasurer()
    const topo = texto('topo', 100, 'Primeira linha\nsegunda linha', 40)
    const abaixo = texto('abaixo', 150, 'Rodapé', 40)
    const fisica = caixa(topo)!.height
    expect(altura(topo)).toBe(fisica)
    const [t, a] = reflowLayersAfterFill([topo, abaixo], ['topo'], altura)
    expect(fisica).toBe(86)
    expect(t.size.height).toBe(86)
    expect(t.position.y).toBe(100)
    expect(a.position.y).toBe(196)
    // A pilha física fecha sem sobreposição: o vizinho começa no mesmo vão de antes (10 px) abaixo da caixa ceil.
    expect(a.position.y - (t.position.y + t.size.height)).toBe(10)
  })
})
