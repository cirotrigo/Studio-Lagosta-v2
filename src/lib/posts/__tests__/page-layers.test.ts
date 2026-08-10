import { describe, it, expect } from 'vitest'
import { lerCamadas, normalizeLayersString, parsePageLayers, textosDaPagina } from '../page-layers'

const CAMADAS = [
  { id: 'l1', name: 'titulo', type: 'text', content: 'HAPPY HOUR' },
  { id: 'l2', name: 'foto', type: 'image', fileUrl: 'https://x/y.jpg' },
]

describe('lerCamadas', () => {
  it('lê o array nativo', () => {
    expect(lerCamadas(CAMADAS)).toEqual({ camadas: CAMADAS, legivel: true })
  })

  it('lê a string JSON', () => {
    expect(lerCamadas(JSON.stringify(CAMADAS)).camadas).toEqual(CAMADAS)
  })

  // A armadilha central: `parseLayers` da arte-rápida devolve [] aqui, e o
  // diff de copy passaria a dizer "o usuário não editou nada".
  it('lê a string DUPLA-CODIFICADA (o legado do PageSync)', () => {
    const duplo = JSON.stringify(JSON.stringify(CAMADAS))
    const r = lerCamadas(duplo)
    expect(r.legivel).toBe(true)
    expect(r.camadas).toEqual(CAMADAS)
  })

  it('distingue "sem camadas" de "ilegível"', () => {
    expect(lerCamadas([])).toEqual({ camadas: [], legivel: true })
    expect(lerCamadas('isto não é json').legivel).toBe(false)
    expect(lerCamadas(null).legivel).toBe(false)
    expect(lerCamadas(undefined).legivel).toBe(false)
    // JSON válido que não é lista de camadas também é ilegível para nós.
    expect(lerCamadas('{"a":1}').legivel).toBe(false)
  })

  it('desiste depois de 3 níveis, em vez de girar', () => {
    const quadruplo = JSON.stringify(JSON.stringify(JSON.stringify(JSON.stringify(CAMADAS))))
    expect(lerCamadas(quadruplo).legivel).toBe(false)
  })
})

describe('parsePageLayers', () => {
  it('devolve [] no ilegível (quem precisa distinguir usa lerCamadas)', () => {
    expect(parsePageLayers('nada disso')).toEqual([])
    expect(parsePageLayers(JSON.stringify(JSON.stringify(CAMADAS)))).toEqual(CAMADAS)
  })
})

describe('normalizeLayersString', () => {
  it('as três codificações produzem a MESMA string canônica', () => {
    const doArray = normalizeLayersString(CAMADAS)
    expect(normalizeLayersString(JSON.stringify(CAMADAS))).toBe(doArray)
    expect(normalizeLayersString(JSON.stringify(JSON.stringify(CAMADAS)))).toBe(doArray)
  })

  it('null quando ilegível — é o que impede invalidação por engano', () => {
    expect(normalizeLayersString('quebrado')).toBeNull()
  })
})

describe('textosDaPagina', () => {
  it('só texto, com o nome da camada como chave', () => {
    expect(textosDaPagina(CAMADAS)).toEqual({ titulo: 'HAPPY HOUR' })
  })

  it('atravessa a dupla codificação (antes devolvia {} em silêncio)', () => {
    expect(textosDaPagina(JSON.stringify(JSON.stringify(CAMADAS)))).toEqual({ titulo: 'HAPPY HOUR' })
  })

  it('ignora texto vazio e cai no id quando a camada não tem nome', () => {
    const camadas = [
      { id: 'l1', name: 'titulo', type: 'text', content: '   ' },
      { id: 'l9', type: 'text', content: 'Sem nome' },
    ]
    expect(textosDaPagina(camadas)).toEqual({ l9: 'Sem nome' })
  })

  it('nomes repetidos não se apagam', () => {
    const camadas = [
      { id: 'a', name: 'linha', type: 'text', content: 'primeira' },
      { id: 'b', name: 'linha', type: 'text', content: 'segunda' },
    ]
    expect(textosDaPagina(camadas)).toEqual({ linha: 'primeira', 'linha#2': 'segunda' })
  })
})
