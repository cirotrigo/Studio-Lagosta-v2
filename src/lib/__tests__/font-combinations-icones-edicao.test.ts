import { describe, expect, it } from 'vitest'
import type { FontComboElement } from '../font-combinations'
import { buildComboLayers } from '../font-combinations-layers'
import { capturarCombinacao } from '../font-combinations-capture'
import { caixaDoIconeTrocado, ehIconeDeTexto, iconeNovoParaTexto } from '../font-combinations-icones'

const pair = { title: 'Branley GC', body: 'StageGrotesk Regular' }
const ALFINETE = 'https://exemplo.com/icone-alfinete.png'
const RELOGIO = 'https://exemplo.com/icone-relogio.png'

// As duas linhas de serviço da combinação da Real, num story
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
const horario: FontComboElement = {
  ...local,
  id: 'horario',
  label: 'Horário',
  text: 'Shopping Vitória - 11h às 22h',
  y: 1726 / 1920,
  icon: undefined,
}

const aplicar = (elements: FontComboElement[]) =>
  buildComboLayers({ elements, pair, canvasWidth: 1080, canvasHeight: 1920, comboId: 'c1', comboName: 'Local e horário' })

const capturar = (layers: ReturnType<typeof aplicar>) =>
  capturarCombinacao({ layers, canvasWidth: 1080, canvasHeight: 1920, pair })

describe('ícones na edição da combinação', () => {
  it('reconhece a camada que acompanha um texto', () => {
    const [texto, icone] = aplicar([local])
    expect(ehIconeDeTexto(icone)).toBe(true)
    expect(ehIconeDeTexto(texto)).toBe(false)
    expect(ehIconeDeTexto({ metadata: {} })).toBe(false)
  })

  it('trocar o alfinete pelo relógio mantém o centro e o peso visual, na proporção do relógio', () => {
    const alfinete = { position: { x: 111, y: 1683 }, size: { width: 23, height: 34 } }
    expect(caixaDoIconeTrocado(alfinete, { width: 512, height: 512 })).toEqual({
      position: { x: 109, y: 1686 },
      size: { width: 28, height: 28 },
    })
    // Sem o tamanho do arquivo, a caixa fica como estava
    expect(caixaDoIconeTrocado(alfinete, null)).toEqual(alfinete)
  })

  it('a troca feita no canvas é o que vai para a combinação ao salvar', () => {
    const [texto, icone] = aplicar([local])
    const trocado = { ...icone, fileUrl: RELOGIO, ...caixaDoIconeTrocado(
      { position: icone.position!, size: icone.size! },
      { width: 512, height: 512 },
    ) }
    const [elemento] = capturar([texto, trocado])
    expect(elemento.icon).toEqual({ url: RELOGIO, width: 28, height: 28, offsetX: -41, offsetY: 10 })
  })

  it('ícone novo sem referência: à esquerda do texto, centrado na primeira linha, no grupo dele', () => {
    const [texto] = aplicar([horario])
    const novo = iconeNovoParaTexto({ texto, url: RELOGIO, natural: { width: 512, height: 512 } })
    expect(novo.type).toBe('image')
    expect(novo.size).toEqual({ width: 29, height: 29 })
    expect(novo.position).toEqual({ x: 107, y: 1729 })
    expect(novo.metadata?.groupId).toBe(texto.metadata?.groupId)
    expect(novo.metadata?.stackOrder).toBe(texto.metadata?.stackOrder)
    expect(novo.metadata?.iconeDe).toBe('horario')
    expect(ehIconeDeTexto(novo)).toBe(true)
  })

  it('ícone novo copia tamanho, vão e altura de um ícone que já existe na combinação', () => {
    const [textoLocal, iconeLocal, textoHorario] = aplicar([local, horario])
    const novo = iconeNovoParaTexto({
      texto: textoHorario,
      url: RELOGIO,
      natural: { width: 512, height: 512 },
      referencia: { icone: iconeLocal, texto: textoLocal },
    })
    // Mesmo vão (16px) e mesmo centro (24px abaixo do topo do texto) do alfinete
    expect(novo.size).toEqual({ width: 28, height: 28 })
    expect(novo.position).toEqual({ x: 106, y: 1736 })
    expect(novo.metadata?.stackOrder).toBe(1)

    const elementos = capturar([textoLocal, iconeLocal, textoHorario, novo])
    expect(elementos.find((e) => e.id === 'horario')?.icon).toEqual({
      url: RELOGIO,
      width: 28,
      height: 28,
      offsetX: -44,
      offsetY: 10,
    })
    expect(elementos.find((e) => e.id === 'local')?.icon).toEqual(local.icon)
  })
})
