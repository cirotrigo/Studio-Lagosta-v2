/** Piloto sintético — cada linha coberta da matriz 2.1 com um caso positivo e um negativo; as não cobertas saem como `viola: null`. */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { MATRIZ, PISO, camadasNaoTextoAcimaDeTexto, foraDaAreaSegura, foraDoPiso, julgar, logoSobreTexto, regrasCobertas } from './suporte/oraculos-do-piloto'
import { PECA_LIMPA } from './suporte/peca-limpa'

const CANVAS = { width: 1080, height: 1920 }
const texto = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Layer> = {}): Layer => ({ id, name: id, type: 'text', visible: true, locked: false, order: 3, content: 'Texto', position: { x, y }, size: { width: w, height: h }, style: { fontSize: 40, color: '#FFFFFF' }, ...extra }) as Layer
const logo = (id: string, x: number, y: number, w: number, h: number): Layer => ({ id, name: 'Logo', type: 'logo', visible: true, locked: false, order: 5, fileUrl: 'data:image/png;base64,', position: { x, y }, size: { width: w, height: h } }) as unknown as Layer
const forma = (id: string, x: number, y: number, w: number, h: number, order: number): Layer => ({ id, name: id, type: 'shape', visible: true, locked: false, order, position: { x, y }, size: { width: w, height: h } }) as unknown as Layer
const MARGENS = { topo: 250, rodape: 350, lateral: 96 }

describe('juízes de geometria (puros, reimplementados)', () => {
  it('piso: caixa que toca 188 ou 1696 reprova (folga 1 px); dentro passa; feed não se aplica', () => {
    expect(foraDoPiso([texto('t', 100, PISO.topo, 300, 60)], CANVAS)).toEqual(['t'])
    expect(foraDoPiso([texto('t', 100, PISO.topo + 1, 300, 60)], CANVAS)).toEqual([])
    expect(foraDoPiso([texto('t', 100, 1920 - PISO.rodape - 60, 300, 60)], CANVAS)).toEqual(['t'])
    expect(foraDoPiso([texto('t', 100, 1920 - PISO.rodape - 61, 300, 60)], CANVAS)).toEqual([])
    expect(foraDoPiso([logo('l', 100, 100, 100, 50)], CANVAS)).toEqual(['l'])
    expect(foraDoPiso([texto('t', 100, 10, 300, 60)], { width: 1080, height: 1350 })).toEqual([])
  })
  it('área segura: fora das margens do projeto reprova; dentro passa', () => {
    expect(foraDaAreaSegura([texto('t', 50, 400, 300, 60)], CANVAS, MARGENS)).toEqual(['t'])
    expect(foraDaAreaSegura([texto('t', 100, 400, 300, 60)], CANVAS, MARGENS)).toEqual([])
    expect(foraDaAreaSegura([texto('t', 100, 1600, 300, 60)], CANVAS, MARGENS)).toEqual(['t'])
  })
  it('logo sobre texto: interseção de caixas; camada não-texto acima de texto (decisão 2) só conta se intersecta e está acima na ordem', () => {
    expect(logoSobreTexto([texto('t', 100, 400, 300, 60), logo('l', 300, 420, 100, 50)])).toEqual(['t'])
    expect(logoSobreTexto([texto('t', 100, 400, 300, 60), logo('l', 500, 420, 100, 50)])).toEqual([])
    expect(camadasNaoTextoAcimaDeTexto([texto('t', 100, 400, 300, 60), forma('f', 150, 410, 50, 50, 9)], CANVAS)).toEqual(['f'])
    expect(camadasNaoTextoAcimaDeTexto([forma('f', 150, 410, 50, 50, 1), texto('t', 100, 400, 300, 60)], CANVAS)).toEqual([])
    expect(camadasNaoTextoAcimaDeTexto([texto('t', 100, 400, 300, 60), forma('f', 900, 900, 50, 50, 9)], CANVAS)).toEqual([])
  })
})

describe('juízes de pixel (CP0 sobre o render de produção) e a matriz', () => {
  it('a peça limpa (branco sobre preto) não viola leitura; texto preto sobre preto viola; o veredito traz as não cobertas como null', async () => {
    const limpa = await julgar({ layers: structuredClone(PECA_LIMPA.layers), canvas: CANVAS, background: PECA_LIMPA.background, formato: 'story', assuntoVerdade: null, margens: MARGENS })
    const v = (r: string) => limpa.vereditos.find((x) => x.regra === r)!
    expect(v('texto-sem-leitura').viola).toBe(false)
    expect(v('tratamento-piorou-leitura').viola).toBe(false)
    expect(v('logo-sem-leitura').viola).toBeNull()
    expect(v('texto-sobre-assunto').viola).toBeNull()
    expect(v('piso-de-interface').viola).toBe(false)
    expect(v('fora-da-area-segura').viola).toBe(false)
    expect(limpa.renders).toBe(2)
    for (const r of ['colisao', 'texto-cortado', 'tinta-fora-da-caixa', 'texto-pequeno', 'copy-completa', 'identidade', 'oclusao', 'fonte-nao-carregada'] as const) expect(v(r).viola, r).toBeNull()
    const ruim = await julgar({ layers: (structuredClone(PECA_LIMPA.layers) as Layer[]).map((l) => ({ ...l, style: { ...l.style, color: '#000000' } })), canvas: CANVAS, background: PECA_LIMPA.background, formato: 'story', assuntoVerdade: null, margens: MARGENS })
    expect(ruim.vereditos.find((x) => x.regra === 'texto-sem-leitura')!.viola).toBe(true)
    // Assunto: um texto dentro da caixa da verdade invade.
    const invade = await julgar({ layers: structuredClone(PECA_LIMPA.layers), canvas: CANVAS, background: PECA_LIMPA.background, formato: 'story', assuntoVerdade: { x: 0, y: 380, width: 1080, height: 300 }, margens: MARGENS })
    expect(invade.vereditos.find((x) => x.regra === 'texto-sobre-assunto')!.viola).toBe(true)
  }, 120_000)
  it('a matriz: "falso APTO = 0" só nas cobertas; as da régua são "mesma-medida"', () => {
    expect(regrasCobertas()).toEqual(expect.arrayContaining(['texto-sem-leitura', 'piso-de-interface', 'fora-da-area-segura', 'texto-sobre-assunto', 'logo-sobre-texto']))
    expect(regrasCobertas()).not.toContain('colisao')
    expect(MATRIZ.colisao.estado).toBe('mesma-medida')
    expect(MATRIZ['copy-completa'].estado).toBe('nao-coberta')
  })
})
