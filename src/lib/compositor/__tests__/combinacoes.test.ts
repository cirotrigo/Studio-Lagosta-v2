import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'
import { caixaVisivel, type FontComboElement } from '@/lib/font-combinations'

import {
  arranjoDaCombinacao,
  arranjoDasCamadas,
  camadasDosElementos,
  distribuirLinhas,
  escolherArranjo,
  extensoesDosElementos,
  type ArranjoDeGrupo,
} from '../combinacoes'

/** Régua falsa: 0,55 × fontSize por caractere, uma linha por \n, altura = linhas × fontSize × lineHeight. */
const medirFalso = (layer: Layer) => {
  const fontSize = Number(layer.style?.fontSize ?? 16)
  const linhas = (layer.content ?? '').split('\n')
  const larguraDaLinha = (l: string) => l.length * fontSize * 0.55
  const box = layer.size.width - 12
  return {
    height: linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1),
    maxLineWidth: Math.min(box, Math.max(...linhas.map(larguraDaLinha))),
    lineCount: linhas.length,
  }
}

const camada = (parcial: Partial<Layer> & Pick<Layer, 'id' | 'type'>): Layer =>
  ({ name: parcial.id, visible: true, locked: false, order: 0, rotation: 0, position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, ...parcial }) as Layer

const CLARO = '#F5F0E8'
const RELOGIO = 'https://exemplo.com/icone-relogio.png'
const PIN = 'https://exemplo.com/icone-pin.png'
const FILETE = 'https://exemplo.com/filete.png'
const LOGO = 'https://exemplo.com/logo.png'

// Um grupo da página de assinatura: manchete centrada com filete embaixo, e duas
// linhas de serviço alinhadas à esquerda, cada uma com o seu ícone
const grupo: Layer[] = [
  camada({ id: 'headline', type: 'text', content: 'Almoço executivo', style: { fontFamily: 'DomaniCP', fontSize: 80, lineHeight: 1, color: CLARO, textAlign: 'center' }, position: { x: 100, y: 1350 }, size: { width: 880, height: 80 }, metadata: { groupId: 'g1' } }),
  camada({ id: 'filete', type: 'image', fileUrl: FILETE, position: { x: 440, y: 1450 }, size: { width: 200, height: 4 }, metadata: { groupId: 'g1' } }),
  camada({ id: 'servico', type: 'text', content: 'das 11h às 15h', style: { fontFamily: 'Barlow', fontSize: 30, lineHeight: 1.2, color: CLARO, textAlign: 'left' }, position: { x: 160, y: 1500 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g1' } }),
  camada({ id: 'relogio', type: 'image', fileUrl: RELOGIO, position: { x: 120, y: 1504 }, size: { width: 26, height: 26 }, metadata: { groupId: 'g1' } }),
  camada({ id: 'servico-2', type: 'text', name: 'servico', content: 'Rua Aleixo Netto, 1158', style: { fontFamily: 'Barlow', fontSize: 30, lineHeight: 1.2, color: CLARO, textAlign: 'left' }, position: { x: 160, y: 1550 }, size: { width: 700, height: 40 }, metadata: { groupId: 'g1' } }),
  camada({ id: 'pin', type: 'image', fileUrl: PIN, position: { x: 122, y: 1552 }, size: { width: 22, height: 30 }, metadata: { groupId: 'g1' } }),
]

const arranjoDoGrupo = () => arranjoDasCamadas({ id: 'p1:g1', nome: 'Almoço', origem: 'pagina', camadas: grupo, medir: medirFalso })!

describe('arranjo de um grupo', () => {
  it('lê os papéis na ordem, o vão entre os textos e os elementos presos à tinta de cada um', () => {
    const a = arranjoDoGrupo()
    expect(a.papeis).toEqual(['headline', 'servico'])
    expect(a.textos.map((t) => t.papel)).toEqual(['headline', 'servico', 'servico'])
    // Tinta da manchete: 16 caracteres × 80 × 0,55 = 704, centrada na caixa → começa em 188
    expect(a.textos[0].elementos).toEqual([{ url: FILETE, width: 200, height: 4, lado: 'abaixo', eixo: 'centro', offsetX: 0, offsetY: 20 }])
    expect(a.textos[0].vaoAntes).toBeNull()
    expect(a.textos[1].vaoAntes).toBe(70)
    // O relógio fica 46px antes da tinta do horário (a caixa começa em 160, a tinta em 166)
    expect(a.textos[1].elementos).toEqual([{ url: RELOGIO, width: 26, height: 26, lado: 'antes', offsetX: -46, offsetY: 4 }])
    expect(a.textos[1].tipo).toBe('horario')
    expect(a.textos[2].tipo).toBe('endereco')
    expect(a.alinhamento).toBe('centro')
    expect(a.temLogo).toBe(false)
  })

  it('texto sem papel e os elementos dele ficam de fora', () => {
    const semPapel = grupo.map((c) => (c.id === 'headline' ? { ...c, id: 'titulo-x', name: 'Texto qualquer' } : c))
    const a = arranjoDasCamadas({ id: 'p1:g1', nome: 'x', origem: 'pagina', camadas: semPapel, medir: medirFalso })!
    expect(a.papeis).toEqual(['servico'])
  })

  it('o filete que é FORMA do editor, girado, e a logo ao lado do serviço entram como elementos', () => {
    const servico = camada({ id: 'servico', type: 'text', content: 'Sábado, das 11h às 00h', style: { fontFamily: 'Acumin', fontSize: 30, lineHeight: 1.6, color: CLARO, textAlign: 'left' }, position: { x: 453, y: 1651 }, size: { width: 560, height: 54 }, metadata: { groupId: 'r' } })
    const divisor = camada({ id: 'divisor', type: 'shape', style: { shapeType: 'line', fill: CLARO, strokeWidth: 2 }, rotation: 90, position: { x: 391.5, y: 1664 }, size: { width: 84, height: 10 }, metadata: { groupId: 'r' } })
    const logo = camada({ id: 'logo', type: 'logo', fileUrl: LOGO, position: { x: 92, y: 1671 }, size: { width: 259, height: 68.7 }, metadata: { groupId: 'r' } })
    const a = arranjoDasCamadas({ id: 'p:r', nome: 'Rodapé', origem: 'pagina', camadas: [servico, divisor, logo], medir: medirFalso })!
    expect(a.temLogo).toBe(true)
    const [elementoDoDivisor, elementoDaLogo] = [...a.textos[0].elementos].sort((x, y) => (x.logo ? 1 : 0) - (y.logo ? 1 : 0))
    expect(elementoDoDivisor.camada).toMatchObject({ type: 'shape', rotation: 90, style: { shapeType: 'line' } })
    expect(elementoDoDivisor.lado).toBe('antes')
    // A caixa visível do divisor girado 90° é 10 × 84, começando 10px antes da posição
    expect(elementoDoDivisor).toMatchObject({ width: 10, height: 84, tamanhoDaCamada: { width: 84, height: 10 }, ajuste: { x: 10, y: 0 } })
    expect(elementoDaLogo).toMatchObject({ logo: true, url: LOGO, lado: 'antes' })

    // Na peça, a forma volta girada, no mesmo lugar em relação à tinta final
    const final = camada({ id: 'servico', type: 'text', position: { x: 453, y: 1651 }, size: { width: 560, height: 54 } })
    const [primeira, segunda] = camadasDosElementos(final, a.textos[0].elementos, 1)
    const forma = [primeira, segunda].find((l) => l.type === 'shape')!
    expect(forma.rotation).toBe(90)
    expect(caixaVisivel(forma)).toMatchObject({ width: 10, height: 84 })
    expect(Math.abs(forma.position.x - 391.5)).toBeLessThanOrEqual(1)
    expect([primeira, segunda].find((l) => l.type === 'logo')?.id).toBe('logo')
  })

  it('grava o recuo das linhas ao lado dos ícones e a faixa da tinta do grupo (Real, segunda)', () => {
    const servico = { fontFamily: 'StageGrotesk', fontSize: 34, lineHeight: 1.2, color: CLARO, textAlign: 'left' as const }
    const rodape: Layer[] = [
      camada({ id: 'servico', type: 'text', content: 'Funcionamento', style: { ...servico, fontSize: 50, color: '#B78566' }, position: { x: 70, y: 1518 }, size: { width: 600, height: 60 }, metadata: { groupId: 'r' } }),
      camada({ id: 'servico-2', type: 'text', name: 'servico', content: 'Shopping Vitória - 11h às 22h', style: servico, position: { x: 160, y: 1639 }, size: { width: 760, height: 42 }, metadata: { groupId: 'r' } }),
      camada({ id: 'sacola', type: 'image', fileUrl: 'https://exemplo.com/icone-sacola.png', position: { x: 74, y: 1627 }, size: { width: 72, height: 72 }, metadata: { groupId: 'r' } }),
      camada({ id: 'servico-3', type: 'text', name: 'servico', content: 'Praia do Canto - Fechado', style: servico, position: { x: 160, y: 1739 }, size: { width: 760, height: 42 }, metadata: { groupId: 'r' } }),
      camada({ id: 'praia', type: 'image', fileUrl: 'https://exemplo.com/icone-praia.png', position: { x: 74, y: 1725 }, size: { width: 72, height: 72 }, metadata: { groupId: 'r' } }),
    ]
    const a = arranjoDasCamadas({ id: 'p:r', nome: 'Rodapé', origem: 'pagina', camadas: rodape, medir: medirFalso })!
    expect(a.alinhamento).toBe('esquerda')
    expect(a.textos.map((t) => t.recuo ?? 0)).toEqual([0, 90, 90])
    // Da primeira linha (1518) à base da última: 1739 + 34 × 1,2
    expect(a.faixaDaTinta).toEqual({ topo: 1518, base: 1739 + Math.ceil(34 * 1.2) })
  })

  it('o recuo que abriga um elemento SOLTO da página não vale: a peça não desenha o relógio fora do grupo (Real, assinatura antiga)', () => {
    const texto = { fontFamily: 'StageGrotesk', fontSize: 34, lineHeight: 1.2, color: CLARO, textAlign: 'left' as const }
    const apoio = camada({ id: 'apoio', type: 'text', content: 'Sabor por sabor', style: { ...texto, fontSize: 40 }, position: { x: 70, y: 1591 }, size: { width: 767, height: 80 }, metadata: { groupId: 'r' } })
    const servico = camada({ id: 'servico', type: 'text', content: 'Todos os dias, das 12h às 22h', style: texto, position: { x: 117, y: 1741 }, size: { width: 680, height: 52 }, metadata: { groupId: 'r' } })
    const relogioSolto = camada({ id: 'relogio', type: 'image', fileUrl: RELOGIO, position: { x: 78, y: 1750 }, size: { width: 34, height: 34 } })
    const rodape = [apoio, servico]
    const semSolto = arranjoDasCamadas({ id: 'p:r', nome: 'r', origem: 'pagina', camadas: rodape, todas: rodape, medir: medirFalso })!
    expect(semSolto.textos.map((t) => t.recuo ?? 0)).toEqual([0, 47])
    const comSolto = arranjoDasCamadas({ id: 'p:r', nome: 'r', origem: 'pagina', camadas: rodape, todas: [...rodape, relogioSolto], medir: medirFalso })!
    expect(comSolto.textos.map((t) => t.recuo ?? 0)).toEqual([0, 0])
  })

  it('texto 2 px fora do alinhamento não vira recuo; grupo centrado não tem recuo', () => {
    expect(arranjoDoGrupo().textos.every((t) => t.recuo === undefined)).toBe(true)
    const torto: Layer[] = [
      camada({ id: 'headline', type: 'text', content: 'Terça Pede', style: { fontFamily: 'Branley', fontSize: 142, lineHeight: 1, color: CLARO, textAlign: 'left' }, position: { x: 74, y: 1309 }, size: { width: 860, height: 142 }, metadata: { groupId: 'p' } }),
      camada({ id: 'apoio', type: 'text', content: 'Doçura e Aconchego', style: { fontFamily: 'StageGrotesk', fontSize: 50, lineHeight: 1.2, color: CLARO, textAlign: 'left' }, position: { x: 76, y: 1458 }, size: { width: 760, height: 60 }, metadata: { groupId: 'p' } }),
    ]
    const a = arranjoDasCamadas({ id: 'p:p', nome: 'Principal', origem: 'pagina', camadas: torto, medir: medirFalso })!
    expect(a.textos.every((t) => t.recuo === undefined)).toBe(true)
    // 7 px já é desenho: o apoio para dentro da manchete serifada (Feriado do TERO)
    const otico = torto.map((c) => (c.id === 'apoio' ? { ...c, position: { x: 81, y: 1458 } } : c))
    const b = arranjoDasCamadas({ id: 'p:p', nome: 'Principal', origem: 'pagina', camadas: otico, medir: medirFalso })!
    expect(b.textos.map((t) => t.recuo ?? 0)).toEqual([0, 7])
  })
})

describe('linhas da copy nos textos', () => {
  it('casa horário com o texto do relógio e endereço com o do pin, qualquer que seja a ordem da copy', () => {
    const r = distribuirLinhas(arranjoDoGrupo(), [
      { papel: 'headline', linhas: ['Almoço [executivo]'] },
      { papel: 'servico', linhas: ['Rua Aleixo Netto, 1158', 'das 11h às 15h'] },
    ])
    expect(r.map((p) => [p.indice, p.linhas])).toEqual([
      [0, ['Almoço [executivo]']],
      [1, ['das 11h às 15h']],
      [2, ['Rua Aleixo Netto, 1158']],
    ])
  })

  it('linha que sobra entra no último texto usado; texto sem linha some', () => {
    const tres = distribuirLinhas(arranjoDoGrupo(), [{ papel: 'servico', linhas: ['das 11h às 15h', 'Rua Aleixo Netto, 1158', 'Reserve pelo direct'] }])
    expect(tres.map((p) => [p.indice, p.linhas])).toEqual([
      [1, ['das 11h às 15h']],
      [2, ['Rua Aleixo Netto, 1158', 'Reserve pelo direct']],
    ])
    const uma = distribuirLinhas(arranjoDoGrupo(), [{ papel: 'servico', linhas: ['das 11h às 15h'] }])
    expect(uma.map((p) => p.indice)).toEqual([1])
  })
})

describe('escolha do arranjo', () => {
  const fake = (id: string, nome: string, papeis: ArranjoDeGrupo['papeis'], origem: ArranjoDeGrupo['origem'] = 'combinacao'): ArranjoDeGrupo => ({ id, nome, origem, papeis, textos: [], alinhamento: null, temLogo: false })
  const pagina = fake('p1:g1', 'Story', ['headline', 'servico'], 'pagina')
  const comCta = fake('combinacao:a', 'Rodapé com chamada', ['headline', 'servico', 'cta'])
  const doTema = fake('combinacao:b', 'Almoço executivo', ['headline', 'servico'])
  const semServico = fake('combinacao:c', 'Só manchete', ['headline'])

  it('só entra quem cobre os papéis; o tema no nome vence, e papel sem copy pesa contra', () => {
    const r = escolherArranjo([pagina, comCta, doTema, semServico], { papeis: ['headline', 'servico'], tema: 'almoço executivo', chave: 'k' })
    expect(r?.arranjo.id).toBe('combinacao:b')
    expect(escolherArranjo([semServico], { papeis: ['headline', 'servico'], chave: 'k' })).toBeNull()
  })

  it('o arranjo gravado na spec é mantido na recomposição', () => {
    const r = escolherArranjo([pagina, comCta, doTema], { papeis: ['headline', 'servico'], tema: 'almoço executivo', chave: 'k', preferidos: ['combinacao:a'] })
    expect(r?.arranjo.id).toBe('combinacao:a')
  })

  it('empate vira rodízio determinístico entre a página e as combinações', () => {
    const escolhidos = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const r = escolherArranjo([pagina, doTema], { papeis: ['headline', 'servico'], chave: `peca-${i}` })!
      expect(escolherArranjo([pagina, doTema], { papeis: ['headline', 'servico'], chave: `peca-${i}` })!.arranjo.id).toBe(r.arranjo.id)
      escolhidos.add(r.arranjo.id)
    }
    expect(escolhidos).toEqual(new Set(['p1:g1', 'combinacao:b']))
  })
})

describe('combinação salva como arranjo', () => {
  const manchete: FontComboElement = {
    id: 'manchete', label: 'Título', role: 'title', papel: 'headline', text: 'Almoço [executivo]', fontSize: 96, fontWeight: '400', lineHeight: 1,
    textAlign: 'center', color: CLARO, x: 0.1, y: 0.6, width: 0.8, height: 0.05, destaque: { fill: '#547737' },
    ornamentos: [{ url: FILETE, width: 200, height: 6, lado: 'abaixo', eixo: 'centro', offsetX: 0, offsetY: 18 }], alturaDeBase: 1920,
  }
  const pair = { title: 'DomaniCP', body: 'Barlow' }

  it('só serve à usina quando todo texto tem papel', () => {
    expect(arranjoDaCombinacao({ combinacao: { id: 'c1', name: 'x', elements: [{ ...manchete, papel: undefined }] }, pair, medir: medirFalso })).toBeNull()
    const a = arranjoDaCombinacao({ combinacao: { id: 'c1', name: 'Almoço', elements: [manchete] }, pair, medir: medirFalso })!
    expect(a.id).toBe('combinacao:c1')
    expect(a.textos[0].estilo.fontFamily).toBe('DomaniCP')
    expect(a.textos[0].estilo.destaque).toEqual({ fill: '#547737' })
    expect(a.textos[0].elementos).toEqual(manchete.ornamentos)
  })

  it('o estilo de destaque vem do elemento mesmo sem [colchetes] no texto de exemplo', () => {
    const a = arranjoDaCombinacao({ combinacao: { id: 'c2', name: 'Almoço', elements: [{ ...manchete, text: 'Almoço executivo' }] }, pair, medir: medirFalso })!
    expect(a.textos[0].estilo.destaque).toEqual({ fill: '#547737' })
  })
})

describe('elementos na peça', () => {
  it('as extensões dizem quanto os elementos passam da tinta', () => {
    const e = extensoesDosElementos(
      [
        { url: RELOGIO, width: 26, height: 26, lado: 'antes', offsetX: -46, offsetY: 4 },
        { url: FILETE, width: 400, height: 4, lado: 'abaixo', eixo: 'centro', offsetX: 0, offsetY: 20 },
      ],
      { width: 300, height: 36 },
      1,
    )
    expect(e).toEqual({ esquerda: 50, direita: 50, topo: 0, base: 24 })
  })

  it('o elemento nasce preso à tinta FINAL do texto, no grupo dele', () => {
    const texto = camada({ id: 'servico', type: 'text', position: { x: 100, y: 1600 }, size: { width: 300, height: 36 }, metadata: { groupId: 'g' } })
    const [relogio] = camadasDosElementos(texto, [{ url: RELOGIO, width: 26, height: 26, lado: 'antes', offsetX: -46, offsetY: 4 }], 1)
    expect(relogio.position).toEqual({ x: 60, y: 1604 })
    expect(relogio.size).toEqual({ width: 26, height: 26 })
    expect(relogio.metadata?.groupId).toBe('g')
    expect(relogio.fileUrl).toBe(RELOGIO)
  })

  it('o ícone da segunda linha some quando a peça só tem uma', () => {
    const texto = camada({ id: 'servico', type: 'text', position: { x: 100, y: 1600 }, size: { width: 300, height: 48 } })
    const elementos = [
      { url: RELOGIO, width: 22, height: 22, lado: 'antes' as const, offsetX: -30, offsetY: 13 },
      { url: PIN, width: 16, height: 22, lado: 'antes' as const, offsetX: -28, offsetY: 61 },
    ]
    expect(camadasDosElementos(texto, elementos, 1).map((l) => l.fileUrl)).toEqual([RELOGIO])
    expect(extensoesDosElementos(elementos, { width: 286, height: 48 }, 1).base).toBe(0)
  })
})
