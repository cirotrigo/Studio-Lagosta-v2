/**
 * CP-X2a — `lerCor`: contrato `{ hex, alfa } | 'transparente' | null`, sem DOM. A conferência com o
 * `CSS.supports` e o `getComputedStyle` do Chromium fica em tests/harness/cp-x2a.
 */
import { describe, expect, it } from 'vitest'
import { lerCor, NOMES_DE_COR, PALAVRAS_DE_CONTEXTO } from '../cor'
import { corDigitadaParaGravar } from '@/lib/shape-style'

const cor = (hex: string, alfa = 1) => ({ hex, alfa })

describe('lerCor — hex', () => {
  it.each([
    ['#abc', cor('#aabbcc')],
    ['#ABC', cor('#aabbcc')],
    ['#abcd', cor('#aabbcc', 0xdd / 255)],
    ['#1A2B3C', cor('#1a2b3c')],
    ['#1a2b3c80', cor('#1a2b3c', 0x80 / 255)],
    ['  #111  ', cor('#111111')],
  ])('%s', (entrada, esperado) => expect(lerCor(entrada)).toEqual(esperado))

  it.each(['#', '#12', '#12345', '#1234567', '#ggg', '# 111', '#111111111'])('recusa %s', (e) => expect(lerCor(e)).toBeNull())
})

describe('lerCor — rgb/rgba', () => {
  it.each([
    ['rgb(255, 0, 0)', cor('#ff0000')],
    ['rgba(17, 17, 17, 1)', cor('#111111')],
    ['rgba(26, 57, 135, 0.4)', cor('#1a3987', 0.4)],
    ['RGB(1,2,3)', cor('#010203')],
    ['rgb(1 2 3)', cor('#010203')],
    ['rgb(1 2 3 / 0.5)', cor('#010203', 0.5)],
    ['rgb(1 2 3 / 50%)', cor('#010203', 0.5)],
    ['rgba(1, 2, 3, 50%)', cor('#010203', 0.5)],
    ['rgb(100%, 0%, 0%)', cor('#ff0000')],
    ['rgb(100% 0 0)', cor('#ff0000')], // sintaxe de espaços aceita mistura
    ['rgb(300, -5, 0)', cor('#ff0000')], // limitado, como no CSS
    ['rgba(0, 0, 0, 2)', cor('#000000', 1)],
    ['rgb(0, 0, 0, 0)', cor('#000000', 0)],
    ['rgb(127.6, 0, 0)', cor('#800000')],
    ['rgb(.5, 0, 0)', cor('#010000')],
  ])('%s', (entrada, esperado) => expect(lerCor(entrada)).toEqual(esperado))

  it.each([
    'rgb(1, 2)',
    'rgb(1, 2, 3, 4, 5)',
    'rgb(1, 2%, 3)', // vírgulas exigem o mesmo tipo
    'rgb(1 2, 3)',
    'rgb(1, 2, 3 / 0.5)',
    'rgb(1 2 3 / 0.5 / 1)',
    'rgb(1 2 3 4)',
    'rgb(a, b, c)',
    'rgb(1e2, 0, 0)',
    'rgb(none 0 0)',
    'rgba(17, 17, 17, 1)827',
    'rgb(1, 2, 3,)',
  ])('recusa %s', (e) => expect(lerCor(e)).toBeNull())
})

describe('lerCor — hsl/hsla', () => {
  it.each([
    ['hsl(0, 100%, 50%)', cor('#ff0000')],
    ['hsl(120deg, 100%, 50%)', cor('#00ff00')],
    ['hsl(240 100% 50%)', cor('#0000ff')],
    ['hsla(10, 50%, 50%, 0.5)', cor('#bf5540', 0.5)],
    ['hsl(10 50% 50% / 50%)', cor('#bf5540', 0.5)],
    ['hsl(0.5turn, 100%, 50%)', cor('#00ffff')],
    ['hsl(3.14159265rad, 100%, 50%)', cor('#00ffff')],
    ['hsl(200grad, 100%, 50%)', cor('#00ffff')],
    ['hsl(-120, 100%, 50%)', cor('#0000ff')],
    ['hsl(480, 100%, 50%)', cor('#00ff00')],
    ['hsl(0, 0%, 100%)', cor('#ffffff')],
  ])('%s', (entrada, esperado) => expect(lerCor(entrada)).toEqual(esperado))

  it.each(['hsl(0, 100, 50)', 'hsl(0 100 50)', 'hsl(0deg, 100%)', 'hsl(red, 1%, 1%)', 'hsl(0, 100%, 50%, 1, 1)'])('recusa %s', (e) =>
    expect(lerCor(e)).toBeNull(),
  )

  it('overflow do matiz no parse (Infinity) e na conversão de unidade → null, nunca #NaN', () => {
    const enorme = '9'.repeat(400)
    expect(lerCor(`hsl(${enorme}turn, 100%, 50%)`)).toBeNull() // achado do Codex
    expect(lerCor(`hsl(${'9'.repeat(308)}turn, 100%, 50%)`)).toBeNull()
    expect(lerCor(`hsl(${enorme}, 100%, 50%)`)).toBeNull()
    expect(lerCor(`hsl(${enorme}deg 100% 50%)`)).toBeNull()
    expect(lerCor('hsl(1e306turn, 100%, 50%)')).toBeNull() // fora da gramática (notação e) — já recusado
    expect(lerCor(`hsl(${'9'.repeat(306)}turn, 100%, 50%)`)).toBeNull() // finito no parse, Infinity × 360
    expect(lerCor(`hsl(${'9'.repeat(300)}grad, 100%, 50%)`)).toEqual(expect.objectContaining({ alfa: 1 })) // finito: matiz módulo 360
  })
})

describe('lerCor — contrato de saída sob números extremos', () => {
  const enorme = '9'.repeat(400)
  const extremos = [
    `rgb(${enorme}, 0, 0)`,
    `rgb(-${enorme}, 0, 0)`,
    `rgb(${enorme}% 0% 0%)`,
    `rgba(0, 0, 0, ${enorme})`,
    `rgb(0 0 0 / ${enorme}%)`,
    `hsl(0, ${enorme}%, ${enorme}%)`,
    `hsl(${enorme}turn, 100%, 50%)`,
    `hsl(-${enorme}rad, 100%, 50%)`,
    `hsl(0 100% 50% / -${enorme})`,
  ]
  it.each(extremos)('%s → #rrggbb com alfa finito em [0,1], ou null', (e) => {
    const r = lerCor(e)
    if (r === null || r === 'transparente') return
    expect(r.hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(Number.isFinite(r.alfa) && r.alfa >= 0 && r.alfa <= 1).toBe(true)
  })

  it('canais e alfa que estouram são limitados (como o CSS), sem NaN', () => {
    expect(lerCor(`rgb(${enorme}, 0, 0)`)).toEqual(cor('#ff0000'))
    expect(lerCor(`rgba(0, 0, 0, ${enorme})`)).toEqual(cor('#000000', 1))
  })
})

describe('lerCor — nomes e palavras', () => {
  it('lê os 148 nomes do CSS Color 4 com alfa 1', () => {
    expect(NOMES_DE_COR).toHaveLength(148)
    for (const n of NOMES_DE_COR) expect([n, lerCor(n)]).toEqual([n, expect.objectContaining({ alfa: 1 })])
    expect(lerCor('Red')).toEqual(cor('#ff0000'))
    expect(lerCor('rebeccapurple')).toEqual(cor('#663399'))
  })

  it("transparent → 'transparente'", () => {
    expect(lerCor('transparent')).toBe('transparente')
    expect(lerCor(' Transparent ')).toBe('transparente')
  })

  it.each([...PALAVRAS_DE_CONTEXTO, 'CurrentColor'])('%s → null (depende do contexto)', (p) => expect(lerCor(p)).toBeNull())

  it.each(['banana', 'none', 'lab(50% 0 0)', 'oklch(0.5 0.1 120)', 'hwb(0 0% 0%)', 'color(srgb 1 0 0)', '', '   '])('recusa %s', (e) =>
    expect(lerCor(e)).toBeNull(),
  )

  it.each([123, null, undefined, {}, [], true])('não-texto %s → null, sem lançar', (e) => expect(lerCor(e)).toBeNull())
})

describe('lerCor × o que a UI grava (corDigitadaParaGravar)', () => {
  // ehCorCss de teste = a própria gramática do lerCor + as palavras de contexto que o CSS.supports aceita
  const ehCorCssSimulado = (c: string) => lerCor(c) !== null || (PALAVRAS_DE_CONTEXTO as readonly string[]).includes(c.toLowerCase())
  const digitados = ['#111', '#111827', '#11182780', 'rgb(1 2 3)', 'rgba(1, 2, 3, .5)', 'hsl(10 50% 50% / .5)', 'hsla(10, 50%, 50%, 0.5)', 'red', 'transparent', 'currentcolor', 'inherit']

  it('toda saída gravada pela UI é lida pelo lerCor, exceto as palavras de contexto', () => {
    for (const t of digitados) {
      const gravado = corDigitadaParaGravar(t, 0.6, '#2563eb', ehCorCssSimulado)
      if (gravado === null) continue
      const ehContexto = (PALAVRAS_DE_CONTEXTO as readonly string[]).includes(gravado.toLowerCase())
      expect([t, gravado, lerCor(gravado) !== null]).toEqual([t, gravado, !ehContexto])
    }
  })
})
