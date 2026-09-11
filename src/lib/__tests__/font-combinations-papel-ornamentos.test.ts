import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { caixaDoOrnamento, type FontComboElement } from '../font-combinations'
import { buildComboLayers } from '../font-combinations-layers'
import { associarOrnamentos, capturarCombinacao, papelDoTexto } from '../font-combinations-capture'

const pair = { title: 'DomaniCP', body: 'Barlow' }
const FILETE = 'https://exemplo.com/filete.png'
const SELO = 'https://exemplo.com/selo.png'

const manchete: FontComboElement = {
  id: 'manchete',
  label: 'Título',
  role: 'title',
  papel: 'headline',
  text: 'Almoço [executivo]',
  fontSize: 96,
  fontWeight: '400',
  lineHeight: 1,
  textAlign: 'center',
  color: '#F5F0E8',
  x: 0.1,
  y: 0.6,
  width: 0.8,
  height: 0.05,
  destaque: { fill: '#547737' },
  ornamentos: [{ url: FILETE, width: 200, height: 6, lado: 'abaixo', eixo: 'centro', offsetX: 0, offsetY: 18 }],
  alturaDeBase: 1920,
}

const apoio: FontComboElement = {
  id: 'apoio',
  label: 'Apoio',
  role: 'body',
  papel: 'apoio',
  text: 'De terça a sexta',
  fontSize: 36,
  fontWeight: '400',
  lineHeight: 1.2,
  textAlign: 'center',
  color: '#F5F0E8',
  x: 0.1,
  y: 0.68,
  width: 0.8,
  height: 0.025,
  alturaDeBase: 1920,
}

const aplicar = (elements: FontComboElement[], textOverrides?: Record<string, string>) =>
  buildComboLayers({ elements, pair, canvasWidth: 1080, canvasHeight: 1920, comboId: 'c1', comboName: 'Almoço', textOverrides })

const camada = (parcial: Partial<Layer> & Pick<Layer, 'type'>): Layer =>
  ({ id: Math.random().toString(36).slice(2), name: '', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, ...parcial }) as Layer

describe('combinação com papel, elementos e destaque', () => {
  it('palavra entre [colchetes] vira trecho de rich text no estilo de destaque, sem os colchetes', () => {
    const [texto] = aplicar([manchete])
    expect(texto.type).toBe('rich-text')
    expect(texto.content).toBe('Almoço executivo')
    expect(texto.richTextStyles).toEqual([{ start: 7, end: 16, fill: '#547737' }])
  })

  it('sem estilo de destaque, os colchetes só saem e o texto fica simples', () => {
    const [texto] = aplicar([{ ...manchete, destaque: undefined, ornamentos: undefined }])
    expect(texto.type).toBe('text')
    expect(texto.content).toBe('Almoço executivo')
  })

  it('o filete abaixo da manchete nasce preso à base da caixa e centrado nela', () => {
    const [texto, filete] = aplicar([manchete])
    expect(texto.position).toEqual({ x: 108, y: 1152 })
    expect(texto.size).toEqual({ width: 864, height: 96 })
    expect(filete.type).toBe('image')
    expect(filete.fileUrl).toBe(FILETE)
    expect(filete.position).toEqual({ x: 440, y: 1266 })
    expect(filete.size).toEqual({ width: 200, height: 6 })
    expect(filete.metadata?.groupId).toBe(texto.metadata?.groupId)
    expect(filete.metadata?.stackOrder).toBe(texto.metadata?.stackOrder)
    expect(filete.metadata?.ornamentoDe).toBe('manchete')
  })

  it('aceita o texto pelo papel e grava o papel na camada', () => {
    const camadas = aplicar([manchete, apoio], { apoio: 'Só hoje' })
    const doApoio = camadas.find((l) => l.metadata?.elementId === 'apoio')!
    expect(doApoio.content).toBe('Só hoje')
    expect(doApoio.metadata?.compositor).toEqual({ papel: 'apoio' })
  })

  it('salvar de volta preserva papel, elementos, destaque e a altura de base', () => {
    const [capturada, capturadoApoio] = capturarCombinacao({ layers: aplicar([manchete, apoio]), canvasWidth: 1080, canvasHeight: 1920, pair })
    expect(capturada.papel).toBe('headline')
    expect(capturada.text).toBe('Almoço [executivo]')
    expect(capturada.destaque).toEqual({ fill: '#547737' })
    expect(capturada.ornamentos).toEqual(manchete.ornamentos)
    expect(capturada.icon).toBeUndefined()
    expect(capturada.alturaDeBase).toBe(1920)
    expect(capturadoApoio.papel).toBe('apoio')
    expect(capturadoApoio.ornamentos).toBeUndefined()
  })

  it('pela geometria: sublinhado colado fica com o texto de cima, filete entre dois textos vai para o de baixo, selo à direita é "depois"', () => {
    const headline = camada({ type: 'text', content: 'Manchete', position: { x: 100, y: 1000 }, size: { width: 880, height: 100 } })
    const sublinhado = camada({ type: 'image', fileUrl: FILETE, position: { x: 300, y: 1106 }, size: { width: 480, height: 4 } })
    const apoioT = camada({ type: 'text', content: 'Apoio', position: { x: 100, y: 1200 }, size: { width: 880, height: 50 } })
    const filete = camada({ type: 'image', fileUrl: FILETE, position: { x: 100, y: 1280 }, size: { width: 300, height: 4 } })
    const cta = camada({ type: 'text', content: 'Reserve', style: { textAlign: 'left' }, position: { x: 100, y: 1310 }, size: { width: 500, height: 50 } })
    const selo = camada({ type: 'image', fileUrl: SELO, position: { x: 900, y: 1310 }, size: { width: 60, height: 50 } })

    const mapa = associarOrnamentos([headline, apoioT, cta], [sublinhado, filete, selo])
    expect(mapa.get(headline.id)?.map((o) => [o.imagem.id, o.lado, o.eixo])).toEqual([[sublinhado.id, 'abaixo', 'centro']])
    expect(mapa.get(apoioT.id)).toBeUndefined()
    expect(mapa.get(cta.id)?.map((o) => [o.imagem.id, o.lado, o.eixo])).toEqual([
      [filete.id, 'acima', 'inicio'],
      [selo.id, 'depois', undefined],
    ])
  })

  it('o papel vem do painel, do nome da camada ou do rótulo da aplicação', () => {
    expect(papelDoTexto({ name: 'headline' })).toBe('headline')
    expect(papelDoTexto({ name: 'Almoço - Título' })).toBe('headline')
    expect(papelDoTexto({ name: 'Texto 1', metadata: { elementLabel: 'Pré-título' } })).toBe('pre')
    expect(papelDoTexto({ name: 'headline', metadata: { compositor: { papel: 'servico' } } })).toBe('servico')
    expect(papelDoTexto({ name: 'Texto 1' })).toBeNull()
  })

  it('elemento preso à borda final acompanha o texto em outra escala', () => {
    const caixa = caixaDoOrnamento(
      { url: SELO, width: 50, height: 10, lado: 'acima', eixo: 'fim', offsetX: -10, offsetY: -30 },
      { x: 100, y: 500, width: 400, height: 80 },
      0.5,
    )
    expect(caixa).toEqual({ x: 470, y: 485, width: 25, height: 5 })
  })
})
