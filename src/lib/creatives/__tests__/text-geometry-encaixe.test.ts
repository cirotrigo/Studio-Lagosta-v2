import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'

import { checkTextGeometry } from '../text-geometry'

/** Régua falsa: a altura medida é a da caixa, uma linha. */
const medir = (layer: Layer) => ({ height: layer.size.height, maxLineWidth: 100, lineCount: 1 })

const texto = (id: string, y: number, altura: number, fontSize: number, metadata: Record<string, unknown>): Layer =>
  ({
    id,
    name: id,
    type: 'text',
    visible: true,
    locked: false,
    order: 0,
    rotation: 0,
    content: id,
    position: { x: 100, y },
    size: { width: 600, height: altura },
    style: { fontFamily: 'DomaniCP', fontSize, lineHeight: 1 },
    textboxConfig: { autoWrap: { autoExpand: true } },
    metadata,
  }) as unknown as Layer

const canvas = { width: 1080, height: 1920 }
const colide = (layers: Layer[]) => checkTextGeometry(layers, canvas, medir).issues.some((i) => i.tipo === 'colisao')

describe('encaixe de desenho entre as vozes da manchete', () => {
  // "Almoço" (88) com "executivo" (148, script) entrando 28 px na tinta de cima
  const almoco = texto('headline', 1400, 100, 88, { groupId: 'g' })

  it('sem marca, a sobreposição é colisão', () => {
    expect(colide([almoco, texto('headline2', 1460, 160, 148, { groupId: 'g' })])).toBe(true)
  })

  it('com o encaixe marcado pelo compositor, no mesmo grupo, não é', () => {
    expect(colide([almoco, texto('headline2', 1460, 160, 148, { groupId: 'g', compositor: { papel: 'headline2', encaixe: 40 } })])).toBe(false)
  })

  it('o encaixe não vale entre grupos diferentes', () => {
    expect(colide([almoco, texto('apoio', 1460, 160, 148, { groupId: 'outro', compositor: { encaixe: 40 } })])).toBe(true)
  })
})
