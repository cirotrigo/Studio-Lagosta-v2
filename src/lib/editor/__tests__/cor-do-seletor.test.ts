import { describe, expect, it } from 'vitest'
import { NOMES_DE_COR, PALAVRAS_DE_CONTEXTO } from '@/lib/vetor/cor'
import { corParaSeletor } from '../cor-do-seletor'

/** Os dois fallbacks reais do painel da forma (pré-condição: hex de 6 dígitos literal). */
const PREENCHIMENTO = '#2563eb'
const BORDA = '#1e3a8a'

describe('corParaSeletor — o que o seletor nativo e a paleta mostram', () => {
  it.each([
    ['rgba(15, 118, 110, 1)', BORDA, '#0f766e'],
    ['rgba(17, 24, 39, 1)', BORDA, '#111827'],
    ['rgba(249, 115, 22, 1)', PREENCHIMENTO, '#f97316'],
    ['#11182780', BORDA, '#111827'],
    ['#ABC', PREENCHIMENTO, '#aabbcc'],
    ['#abcd', PREENCHIMENTO, '#aabbcc'],
    ['#0F766E', BORDA, '#0f766e'],
    ['hsl(120, 100%, 25%)', PREENCHIMENTO, '#008000'],
    ['hsla(120, 100%, 25%, 0.4)', PREENCHIMENTO, '#008000'],
    ['hsl(120 100% 25% / 0.4)', PREENCHIMENTO, '#008000'],
    ['red', PREENCHIMENTO, '#ff0000'],
    ['RED', PREENCHIMENTO, '#ff0000'],
    ['  rgb(1 2 3 / 50%)  ', BORDA, '#010203'],
    ['RGBA(15, 118, 110, 1)', BORDA, '#0f766e'],
  ])('%s (fallback %s) → %s', (valor, fallback, esperado) => {
    expect(corParaSeletor(valor, fallback)).toBe(esperado)
  })

  it('canais iguais com alfas diferentes — inclusive 0 — dão o mesmo hex (o alfa fica no style e no slider)', () => {
    for (const alfa of ['1', '0.5', '0', '50%']) {
      expect(corParaSeletor(`rgba(17, 24, 39, ${alfa})`, BORDA)).toBe('#111827')
    }
    expect(corParaSeletor('rgb(17 24 39 / 0)', BORDA)).toBe('#111827')
    expect(corParaSeletor('#11182700', BORDA)).toBe('#111827')
  })

  it('o literal transparent (sem canais) mostra o fallback, diferente de rgba(…, 0)', () => {
    expect(corParaSeletor('transparent', BORDA)).toBe(BORDA)
    expect(corParaSeletor('Transparent', PREENCHIMENTO)).toBe(PREENCHIMENTO)
    expect(corParaSeletor('rgba(0, 0, 0, 0)', BORDA)).toBe('#000000')
  })

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['espaços', '   '],
    ['ilegível', 'banana'],
    ['legado colado do smoke CP-V1', 'rgba(17, 17, 17, 1)827'],
    ['hex de 5 dígitos', '#12345'],
    ['matiz que estoura', `hsl(${'9'.repeat(400)}turn, 100%, 50%)`],
    ['currentcolor', 'currentcolor'],
    ['inherit', 'inherit'],
    ['unset', 'unset'],
  ])('%s → fallback', (_nome, valor) => {
    expect(corParaSeletor(valor, BORDA)).toBe(BORDA)
    expect(corParaSeletor(valor, PREENCHIMENTO)).toBe(PREENCHIMENTO)
  })

  it('a saída é sempre #rrggbb — nas entradas da tabela do harness cp-x2a, com os dois fallbacks reais', () => {
    const enorme = '9'.repeat(400)
    // Mesma lista de tests/harness/cp-x2a/cores.spec.ts (ENTRADAS), que não é exportada.
    const entradas: string[] = [
      '#abc', '#ABC', '#abcd', '#1a2b3c', '#1a2b3c80', '  #111  ', '#12345', '#ggg',
      'rgb(255, 0, 0)', 'rgba(17, 17, 17, 1)', 'rgba(26, 57, 135, 0.4)', 'RGB(1,2,3)', 'rgb(1 2 3)', 'rgb(1 2 3 / 0.5)', 'rgb(1 2 3 / 50%)',
      'rgba(1, 2, 3, 50%)', 'rgb(100%, 0%, 0%)', 'rgb(100% 0 0)', 'rgb(300, -5, 0)', 'rgba(0, 0, 0, 2)', 'rgb(0, 0, 0, 0)', 'rgb(127.6, 0, 0)', 'rgb(.5, 0, 0)',
      'rgb(1, 2)', 'rgb(1, 2%, 3)', 'rgb(1 2, 3)', 'rgb(1 2 3 4)', 'rgba(17, 17, 17, 1)827', 'rgb(1, 2, 3,)',
      'hsl(0, 100%, 50%)', 'hsl(120deg, 100%, 50%)', 'hsl(240 100% 50%)', 'hsla(10, 50%, 50%, 0.5)', 'hsl(10 50% 50% / 50%)', 'hsl(0.5turn, 100%, 50%)',
      'hsl(3.14159265rad, 100%, 50%)', 'hsl(200grad, 100%, 50%)', 'hsl(-120, 100%, 50%)', 'hsl(480, 100%, 50%)', 'hsl(0, 0%, 100%)', 'hsl(0deg, 100%)',
      'transparent', 'Transparent', ...PALAVRAS_DE_CONTEXTO, 'CurrentColor', 'banana', '',
      'none', 'rgb(none 0 0)', 'rgb(1e2, 0, 0)', 'hsl(0 100 50)', 'hsl(0, 100, 50)', 'lab(50% 0 0)', 'oklch(0.5 0.1 120)', 'hwb(0 0% 0%)', 'color(srgb 1 0 0)',
      `hsl(${enorme}turn, 100%, 50%)`, `hsl(${'9'.repeat(308)}turn, 100%, 50%)`, `hsl(${'9'.repeat(306)}turn, 100%, 50%)`, `hsl(${enorme}, 100%, 50%)`,
      `rgb(${enorme}, 0, 0)`, `rgba(0, 0, 0, ${enorme})`,
      ...NOMES_DE_COR,
    ]
    expect(entradas.length).toBeGreaterThan(200)
    for (const fallback of [PREENCHIMENTO, BORDA]) {
      for (const e of entradas) expect(corParaSeletor(e, fallback), e).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
