import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import type { FontComboElement } from '../font-combinations'
import { buildComboLayers } from '../font-combinations-layers'
import { capturarCombinacao } from '../font-combinations-capture'

const pair = { title: 'Branley GC', body: 'StageGrotesk Regular' }
const ALFINETE = 'https://exemplo.com/icone-alfinete.png'

// A linha de local da Real: texto em (150, 1676) e alfinete em (111, 1683) num story
const local: FontComboElement = {
  id: 'local',
  label: 'Local',
  role: 'body',
  text: 'Praia do Canto - Fechado',
  fontSize: 32,
  fontWeight: '400',
  lineHeight: 1.1,
  textAlign: 'left',
  color: '#F1E4CE',
  x: 150 / 1080,
  y: 1676 / 1920,
  width: 620 / 1080,
  height: 45 / 1920,
  icon: { url: ALFINETE, width: 23, height: 34, offsetX: -39, offsetY: 7 },
}

const aplicar = (elements: FontComboElement[], largura = 1080, altura = 1920) =>
  buildComboLayers({ elements, pair, canvasWidth: largura, canvasHeight: altura, comboId: 'c1', comboName: 'Local e horário' })

describe('ícone nas combinações de texto', () => {
  it('aplica o texto e o ícone ao lado, no mesmo grupo e na mesma posição da pilha', () => {
    const [texto, icone] = aplicar([local])
    expect(texto.type).toBe('text')
    expect(icone.type).toBe('image')
    expect(icone.fileUrl).toBe(ALFINETE)
    expect(icone.position).toEqual({ x: 111, y: 1683 })
    expect(icone.size).toEqual({ width: 23, height: 34 })
    expect(icone.metadata?.groupId).toBe(texto.metadata?.groupId)
    expect(icone.metadata?.stackOrder).toBe(texto.metadata?.stackOrder)
    expect(icone.metadata?.iconeDe).toBe('local')
  })

  it('escala o ícone junto com o texto em outro formato', () => {
    const [texto, icone] = aplicar([local], 720, 1280)
    expect(icone.size).toEqual({ width: 15, height: 23 })
    expect(icone.position!.x).toBe(Math.round(texto.position!.x + -39 * (720 / 1080)))
  })

  it('elemento sem ícone continua gerando só o texto', () => {
    const semIcone = { ...local, icon: undefined }
    expect(aplicar([semIcone]).map((l) => l.type)).toEqual(['text'])
  })

  it('salvar de volta preserva o ícone (ida e volta)', () => {
    const [elemento] = capturarCombinacao({ layers: aplicar([local]), canvasWidth: 1080, canvasHeight: 1920, pair })
    expect(elemento.icon).toEqual(local.icon)
  })

  it('reconhece um ícone solto pela posição, sem a marca da aplicação', () => {
    const texto = { ...aplicar([{ ...local, icon: undefined }])[0], metadata: {} } as Layer
    const imagemSolta = {
      id: 'img',
      type: 'image',
      name: 'Elemento - relógio',
      visible: true,
      locked: false,
      order: 1,
      fileUrl: ALFINETE,
      position: { x: 111, y: 1683 },
      size: { width: 23, height: 34 },
    } as Layer
    const longe = { ...imagemSolta, id: 'longe', position: { x: 900, y: 300 } } as Layer
    const [elemento] = capturarCombinacao({ layers: [texto, imagemSolta, longe], canvasWidth: 1080, canvasHeight: 1920, pair })
    expect(elemento.icon).toEqual({ url: ALFINETE, width: 23, height: 34, offsetX: -39, offsetY: 7 })
  })
})
