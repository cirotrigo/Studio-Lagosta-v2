import { describe, expect, it } from 'vitest'
import {
  alvoValido,
  atualizadorDoReaplicar,
  classificarPaleta,
  coresNestaPagina,
  criarGeracaoDaCarga,
  eloDoCanal,
  papelDoCanal,
  podeReaplicar,
  reaplicarCoresDaMarca,
  reaplicarNaCamada,
  resumoDoReaplicar,
  rotuloDoCanal,
  swatchAtivo,
  type AlvoDoReaplicar,
  type SituacaoDoEditor,
} from '../cores-da-forma'
import { lerCor } from '@/lib/vetor/cor'
import { canonicalizeLayersForPersistence } from '@/lib/shape-style'
import { problemasDoVetor } from '@/lib/vetor/validar-camada'
import type { DadosDaMarca } from '@/lib/brand/papeis-de-cor'
import type { Layer, LayerStyle } from '@/types/template'

// destaque = assinatura.destaque.fill; escuro/texto = a cor de nome escuro
const MARCA: DadosDaMarca = {
  paleta: [{ name: 'Preto', hexCode: '#0b0b0b' }, { name: 'Laranja', hexCode: '#fa5701' }],
  assinaturaCrua: { destaque: { fill: '#fa5701' } },
}
const MARCA_NOVA: DadosDaMarca = {
  paleta: [{ name: 'Preto', hexCode: '#0b0b0b' }, { name: 'Teal', hexCode: '#0f766e' }],
  assinaturaCrua: { destaque: { fill: '#0f766e' } },
}

const camada = (style: LayerStyle, id = 'f'): Layer =>
  ({ id, type: 'shape', name: id, visible: true, locked: false, order: 1, position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, style }) as unknown as Layer

const VETOR_DESTAQUE = { asset: { id: 'spark-4', versao: 1 }, papeis: { preenchimento: 'destaque' as const } }
const alfa = (cor: unknown) => {
  const l = lerCor(cor)
  if (!l || l === 'transparente') throw new Error(`cor ilegível: ${String(cor)}`)
  return l
}

describe('papelDoCanal / eloDoCanal / podeReaplicar', () => {
  it('papel conhecido é vinculado; desconhecido é marcado; ausente é null', () => {
    const style = { vetor: { asset: { id: 'x', versao: 1 }, papeis: { preenchimento: 'destaque', contorno: 'primario' } } } as unknown as LayerStyle
    expect(papelDoCanal(style, 'preenchimento')).toEqual({ tipo: 'vinculado', papel: 'destaque' })
    expect(papelDoCanal(style, 'contorno')).toEqual({ tipo: 'desconhecido', valor: 'primario' })
    expect(papelDoCanal({ vetor: VETOR_DESTAQUE }, 'contorno')).toBeNull()
    expect(papelDoCanal({}, 'preenchimento')).toBeNull()
    expect(papelDoCanal(undefined, 'preenchimento')).toBeNull()
    expect(eloDoCanal(style, 'preenchimento')).toBe('Acompanha a marca: Destaque')
    expect(eloDoCanal(style, 'contorno')).toBe('Papel desconhecido (não é reaplicado)')
    expect(eloDoCanal({ vetor: VETOR_DESTAQUE }, 'contorno')).toBeNull()
  })

  it('chave estranha e herdada nunca é papel (Object.hasOwn)', () => {
    const papeis = JSON.parse('{"__proto__":"destaque","constructor":"texto","sombra":"escuro"}')
    const style = { vetor: { asset: { id: 'x', versao: 1 }, papeis } } as unknown as LayerStyle
    expect(papelDoCanal(style, 'preenchimento')).toBeNull()
    expect(papelDoCanal(style, 'contorno')).toBeNull()
    expect(podeReaplicar(style)).toBe(false)
    const herdado = { vetor: { asset: { id: 'x', versao: 1 }, papeis: Object.create({ preenchimento: 'destaque' }) } } as unknown as LayerStyle
    expect(papelDoCanal(herdado, 'preenchimento')).toBeNull()
    // valor que é nome de membro herdado não vira papel
    const membro = { vetor: { asset: { id: 'x', versao: 1 }, papeis: { preenchimento: 'toString' } } } as unknown as LayerStyle
    expect(papelDoCanal(membro, 'preenchimento')).toEqual({ tipo: 'desconhecido', valor: 'toString' })
  })

  it('podeReaplicar só com canal vinculado; legado sem vetor não pode', () => {
    expect(podeReaplicar({ vetor: VETOR_DESTAQUE })).toBe(true)
    expect(podeReaplicar({ vetor: { asset: { id: 'spark-4', versao: 1 } } })).toBe(false)
    expect(podeReaplicar({ fill: '#fa5701' })).toBe(false)
  })
})

describe('rotuloDoCanal', () => {
  it('item conhecido e mesma versão usa o rótulo do slot; o outro canal fica no padrão', () => {
    const fio = camada({ shapeType: 'line', vetor: { asset: { id: 'fio-fino', versao: 1 }, papeis: { preenchimento: 'texto' } } })
    expect(rotuloDoCanal(fio, 'preenchimento')).toBe('Cor da linha')
    expect(rotuloDoCanal(fio, 'contorno')).toBe('Cor da borda')
    const moldura = camada({ shapeType: 'rectangle', vetor: { asset: { id: 'moldura-fina', versao: 1 } } })
    expect(rotuloDoCanal(moldura, 'contorno')).toBe('Contorno')
    expect(rotuloDoCanal(moldura, 'preenchimento')).toBe('Preenchimento')
  })
  it('desconhecido, versão diferente e legado usam o padrão (a line diz "Cor da linha")', () => {
    expect(rotuloDoCanal(camada({ shapeType: 'svg-path', vetor: { asset: { id: 'nao-existe', versao: 1 } } }), 'contorno')).toBe('Cor da borda')
    expect(rotuloDoCanal(camada({ shapeType: 'rectangle', vetor: { asset: { id: 'moldura-fina', versao: 2 } } }), 'contorno')).toBe('Cor da borda')
    expect(rotuloDoCanal(camada({ shapeType: 'line' }), 'preenchimento')).toBe('Cor da linha')
    expect(rotuloDoCanal(camada({ shapeType: 'circle' }), 'preenchimento')).toBe('Preenchimento')
    expect(rotuloDoCanal(camada({ shapeType: 'svg-path', vetor: { asset: { id: 'constructor', versao: 1 } } }), 'contorno')).toBe('Cor da borda')
  })
})

describe('classificarPaleta / swatchAtivo (C1)', () => {
  it('só hex válido (pelo hexValido, que aceita espaço externo) é aplicável, e sai canônico', () => {
    const r = classificarPaleta([
      { id: 1, name: 'Laranja', hexCode: '#FA5701' },
      { id: 2, name: 'Branco curto', hexCode: '#FFF' },
      { id: 3, name: 'Com espaço', hexCode: '  #0F766E ' },
      { id: 4, name: 'Transparente', hexCode: 'transparent' },
      { id: 5, name: 'Contexto', hexCode: 'currentcolor' },
      { id: 6, name: 'Nome', hexCode: 'red' },
      { id: 7, name: 'Cinco', hexCode: '#12345' },
      { id: 8, name: 'Com alfa', hexCode: '#fa570180' },
      { id: 9, name: 'Espaço dentro', hexCode: '#fa 5701' },
    ])
    expect(r.aplicaveis.map((c) => [c.id, c.hex])).toEqual([[1, '#fa5701'], [2, '#ffffff'], [3, '#0f766e']])
    expect(r.aplicaveis.map((c) => c.rotulo)).toEqual(['Laranja (#FA5701)', 'Branco curto (#FFF)', 'Com espaço (#0F766E)'])
    expect(r.ignoradas).toBe(6)
  })

  it('ativo compara os canais pelo lerCor; alfa não importa; sem cor nada acende', () => {
    expect(swatchAtivo('rgba(250, 87, 1, 1)', '#fa5701')).toBe(true)
    expect(swatchAtivo('rgba(250, 87, 1, 0.3)', '#fa5701')).toBe(true)
    expect(swatchAtivo('#FFF', '#ffffff')).toBe(true)
    expect(swatchAtivo('#fa570180', '#fa5701')).toBe(true)
    expect(swatchAtivo('transparent', '#2563eb')).toBe(false)
    expect(swatchAtivo('rgba(37, 99, 235, 0)', '#2563eb')).toBe(true) // canais azuis, alfa 0: é a cor salva
    expect(swatchAtivo(undefined, '#2563eb')).toBe(false)
    expect(swatchAtivo('currentcolor', '#2563eb')).toBe(false)
    expect(swatchAtivo('banana', '#2563eb')).toBe(false)
  })
})

describe('coresNestaPagina (C4)', () => {
  it('lê forma, texto, ícone e o fundo; sem repetir, sem a paleta, sem transparente/ilegível; teto 8', () => {
    const layers = [
      camada({ fill: 'rgba(250, 87, 1, 1)', strokeColor: '#111827', border: { width: 1, color: 'RED', radius: 0 } } as LayerStyle, 'a'),
      { id: 't', type: 'text', style: { color: '#0F766E' } },
      { id: 'i', type: 'icon', style: { fill: 'transparent' } },
      camada({ fill: 'currentcolor', strokeColor: 'rgba(17, 24, 39, 0.4)' }, 'b'),
      null,
      'lixo',
      { id: 'g', type: 'gradient', style: { color: '#123456' } },
    ] as unknown as Layer[]
    expect(coresNestaPagina({ layers, canvas: { width: 1, height: 1, backgroundColor: '#ABCDEF' } }, ['#fa5701'])).toEqual(['#111827', '#ff0000', '#0f766e', '#abcdef'])
    const muitas = Array.from({ length: 12 }, (_, i) => camada({ fill: `rgb(${i}, 0, 0)` }, `c${i}`))
    expect(coresNestaPagina({ layers: muitas, canvas: { width: 1, height: 1 } }, [])).toHaveLength(8)
  })
})

describe('reaplicarCoresDaMarca — função pura (C5, C11)', () => {
  const style = (extra: Partial<LayerStyle> = {}): LayerStyle => ({
    shapeType: 'svg-path', pathData: 'M0 0 L10 10', pathFillRule: 'evenodd', flipH: true, manterProporcao: true, tracoPontas: 'round',
    fill: 'rgba(250, 87, 1, 0.5)', strokeColor: 'rgba(11, 11, 11, 1)', strokeWidth: 3, opacity: 0.5, fillOpacity: 0.8, strokeOpacity: 0.7,
    border: { width: 0, color: 'transparent', radius: 9999 }, vetor: { asset: { id: 'spark-4', versao: 1 }, papeis: { preenchimento: 'destaque', contorno: 'texto' } },
    ...extra,
  })

  it('grava só os canais vinculados, com o alfa EXATO da cor; não toca multiplicadores nem o resto', () => {
    const antes = style()
    const r = reaplicarCoresDaMarca(antes, MARCA_NOVA)
    expect(r.style).not.toBe(antes)
    expect(r.style.fill).toBe('rgba(15, 118, 110, 0.5)')
    expect(r.style.strokeColor).toBe('rgba(11, 11, 11, 1)') // texto = escuro = #0b0b0b: sem mudança
    const { fill: _f, ...restoDepois } = r.style
    const { fill: _a, ...restoAntes } = antes
    expect(restoDepois).toEqual(restoAntes)
    expect(r.style.vetor).toBe(antes.vetor)
    expect(r.canais).toEqual([
      { canal: 'preenchimento', motivo: 'reaplicado', papel: 'destaque' },
      { canal: 'contorno', motivo: 'sem-mudanca', papel: 'texto' },
    ])
  })

  it('hex de 8 dígitos preserva 170/255 exato; alfa 0 é preservado', () => {
    expect(alfa(reaplicarCoresDaMarca(style({ fill: '#fa5701aa' }), MARCA_NOVA).style.fill).alfa).toBe(170 / 255)
    expect(reaplicarCoresDaMarca(style({ fill: 'rgba(250, 87, 1, 0)' }), MARCA_NOVA).style.fill).toBe('rgba(15, 118, 110, 0)')
  })

  it('sem mudança em canal nenhum devolve o MESMO objeto (inclusive não canônico)', () => {
    const igual = style({ fill: 'rgba(250, 87, 1, 0.5)' })
    const r = reaplicarCoresDaMarca(igual, MARCA)
    expect(r.style).toBe(igual)
    expect(r.canais.map((c) => c.motivo)).toEqual(['sem-mudanca', 'sem-mudanca'])
    const legado = { fill: '#fa5701' }
    expect(reaplicarCoresDaMarca(legado, MARCA_NOVA).style).toBe(legado)
  })

  it('pula sem papel, papel desconhecido, transparente, ausente e ilegível, e lista o motivo', () => {
    const r = reaplicarCoresDaMarca(style({ fill: 'transparent', strokeColor: 'banana', vetor: { asset: { id: 'x', versao: 1 }, papeis: { preenchimento: 'destaque', contorno: 'texto' } } }), MARCA_NOVA)
    expect(r.canais.map((c) => c.motivo)).toEqual(['sem-cor', 'cor-ilegivel'])
    const s = style({ strokeColor: undefined, vetor: { asset: { id: 'x', versao: 1 }, papeis: { contorno: 'texto' } } })
    const r2 = reaplicarCoresDaMarca(s, MARCA_NOVA)
    expect(r2.style).toBe(s)
    expect(r2.canais).toEqual([{ canal: 'preenchimento', motivo: 'sem-papel' }, { canal: 'contorno', motivo: 'sem-cor', papel: 'texto' }])
    const desconhecido = style({ vetor: { asset: { id: 'x', versao: 1 }, papeis: { preenchimento: 'primario' } } as unknown as LayerStyle['vetor'] })
    expect(reaplicarCoresDaMarca(desconhecido, MARCA_NOVA).canais[0]).toEqual({ canal: 'preenchimento', motivo: 'papel-desconhecido' })
    expect(resumoDoReaplicar(r.canais)).toBe('Nada mudou. Preenchimento: sem cor. Cor da borda: cor ilegível.')
  })
})

describe('reaplicarNaCamada — pipeline real com a canonização (C5, C6, C8)', () => {
  const vinc = { asset: { id: 'spark-4', versao: 1 }, papeis: { preenchimento: 'destaque' as const } }
  it('camada canônica rgba 0,5 → 0,5', () => {
    const d = reaplicarNaCamada(camada({ fill: 'rgba(250, 87, 1, 0.5)', opacity: 1, fillOpacity: 1, strokeOpacity: 1, vetor: vinc }), MARCA_NOVA)
    expect(alfa(d.style?.fill)).toEqual({ hex: '#0f766e', alfa: 0.5 })
  })
  it('opacity 0,5 + rgba 0,5 → 0,25 (não 0,125); o outro canal recebe a opacity da camada', () => {
    const d = reaplicarNaCamada(camada({ fill: 'rgba(250, 87, 1, 0.5)', strokeColor: 'rgba(17, 24, 39, 1)', opacity: 0.5, vetor: vinc }), MARCA_NOVA)
    expect(alfa(d.style?.fill)).toEqual({ hex: '#0f766e', alfa: 0.25 })
    expect(alfa(d.style?.strokeColor).alfa).toBe(0.5)
    expect([d.style?.opacity, d.style?.fillOpacity, d.style?.strokeOpacity]).toEqual([1, 1, 1])
  })
  it('fillOpacity 0,5 + rgba 1 → 0,5; #…aa → 170/255', () => {
    expect(alfa(reaplicarNaCamada(camada({ fill: 'rgba(250, 87, 1, 1)', fillOpacity: 0.5, vetor: vinc }), MARCA_NOVA).style?.fill).alfa).toBe(0.5)
    expect(alfa(reaplicarNaCamada(camada({ fill: '#fa5701aa', vetor: vinc }), MARCA_NOVA).style?.fill).alfa).toBe(170 / 255)
  })
  it('no-op em camada NÃO canônica devolve a própria camada, sem normalizar', () => {
    const c = camada({ fill: '#fa5701', opacity: 0.5, fillOpacity: 0.8, vetor: vinc })
    expect(reaplicarNaCamada(c, MARCA)).toBe(c)
  })
  it('o resultado é estável na canonização do PATCH e passa na validação da porta', () => {
    const d = reaplicarNaCamada(camada({ shapeType: 'svg-path', pathData: 'M0 0 L10 10', fill: 'rgba(250, 87, 1, 0.5)', vetor: vinc }), MARCA_NOVA)
    expect(canonicalizeLayersForPersistence([d])).toEqual([d])
    expect(problemasDoVetor(d)).toEqual([])
    expect(d.style?.vetor).toEqual(vinc)
  })
})

describe('guarda do alvo (C10) — antes e DENTRO do atualizador', () => {
  const alvo: AlvoDoReaplicar = { token: 3, projectId: 8, templateId: 538, pageId: null, geracao: 2, layerId: 'f' }
  const ok: SituacaoDoEditor = { token: 3, montado: true, projectId: 8, templateId: 538, pageId: null, geracao: 2, selecao: ['f'] }
  it('vale só com tudo igual e a seleção exatamente [layerId]', () => {
    expect(alvoValido(alvo, ok)).toBe(true)
    const casos: Array<[string, Partial<SituacaoDoEditor>]> = [
      ['token', { token: 4 }], ['montado', { montado: false }], ['projeto', { projectId: 9 }], ['template', { templateId: 539 }],
      ['página', { pageId: 'p2' }], ['carga', { geracao: 3 }], ['seleção vazia', { selecao: [] }], ['outra seleção', { selecao: ['g'] }],
      ['seleção múltipla', { selecao: ['f', 'g'] }],
    ]
    for (const [nome, mudanca] of casos) expect(alvoValido(alvo, { ...ok, ...mudanca }), nome).toBe(false)
  })
  it('o atualizador relê a situação na hora: mudou depois da conferência, devolve a camada intacta', () => {
    let situacao = ok
    const atualizar = atualizadorDoReaplicar(alvo, () => situacao, MARCA_NOVA)
    const c = camada({ fill: 'rgba(250, 87, 1, 1)', vetor: VETOR_DESTAQUE })
    situacao = { ...ok, geracao: 3 }
    expect(atualizar(c)).toBe(c)
    situacao = { ...ok, selecao: ['g'] }
    expect(atualizar(c)).toBe(c)
    situacao = ok
    expect(alfa(atualizar(c).style?.fill).hex).toBe('#0f766e')
    // camada de outro id (colisão impossível pelo updateLayer, mas o atualizador recusa)
    const outra = camada({ fill: 'rgba(250, 87, 1, 1)', vetor: VETOR_DESTAQUE }, 'g')
    expect(atualizar(outra)).toBe(outra)
  })
  it('a escolha manual feita durante a espera é mantida: o canal sem papel não é reaplicado', () => {
    const atualizar = atualizadorDoReaplicar(alvo, () => ok, MARCA_NOVA)
    const manual = camada({ fill: 'rgba(255, 0, 0, 1)', strokeColor: 'rgba(250, 87, 1, 1)', vetor: { asset: { id: 'x', versao: 1 }, papeis: { contorno: 'destaque' } } })
    const d = atualizar(manual)
    expect(d.style?.fill).toBe('rgba(255, 0, 0, 1)')
    expect(alfa(d.style?.strokeColor).hex).toBe('#0f766e')
  })
})

describe('criarGeracaoDaCarga (U6)', () => {
  it('sobe em toda carga e na troca de documento; não sobe com o mesmo documento', () => {
    const g = criarGeracaoDaCarga('538:8')
    expect(g.valor()).toBe(0)
    g.documento('538:8')
    expect(g.valor()).toBe(0)
    g.carregou()
    expect(g.valor()).toBe(1)
    g.documento('539:9')
    expect(g.valor()).toBe(2)
    g.documento('539:9')
    expect(g.valor()).toBe(2)
  })
})
