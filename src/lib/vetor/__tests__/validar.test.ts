import { describe, expect, it } from 'vitest'
import { PATH_DATA_MAX_BYTES, validarPathData } from '../validar'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'

const codigo = (d: unknown) => {
  const r = validarPathData(d)
  return 'codigo' in r ? r.codigo : 'ok' // com strict: false o TS não estreita por `ok`
}

describe('validarPathData', () => {
  it('aceita paths válidos, inclusive compactos e com arco de flags coladas', () => {
    expect(codigo('M10 10 L90 10 L90 90 Z')).toBe('ok')
    expect(codigo('M10-5L20,30l.5.5-1e1 2')).toBe('ok')
    expect(codigo('m10 10 h20 v20 h-20 z m30 0 l10 10')).toBe('ok')
    expect(codigo('M10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80 Q 10 10 20 20 T 40 40')).toBe('ok')
    expect(codigo('M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z')).toBe('ok')
    expect(codigo('M0 0a25 25 0 1 0 10 10')).toBe('ok')
    expect(codigo('M0 0a25,25,0,1,0,10,10')).toBe('ok')
    expect(codigo('M0 0 10 10')).toBe('ok') // M com par extra = L implícito
  })

  it('recusa vazio, não-texto e acima de 16 KB', () => {
    expect(codigo('')).toBe('VAZIO')
    expect(codigo('   ')).toBe('VAZIO')
    expect(codigo(undefined)).toBe('NAO_E_TEXTO')
    expect(codigo(42)).toBe('NAO_E_TEXTO')
    const grande = 'M0 0' + ' L1 1'.repeat(Math.ceil(PATH_DATA_MAX_BYTES / 5))
    expect(new TextEncoder().encode(grande).length).toBeGreaterThan(PATH_DATA_MAX_BYTES)
    expect(codigo(grande)).toBe('GRANDE_DEMAIS')
  })

  it('recusa comando inválido, início sem M, contagem errada e flag de arco inválida', () => {
    expect(codigo('hello')).toBe('NAO_COMECA_COM_M') // `h` é comando válido (lineto horizontal)
    expect(codigo('M0 0 hello')).toBe('ARGUMENTOS')
    expect(codigo('M10 10 X 5 5 L 20 20')).toBe('CARACTERE_INVALIDO')
    expect(codigo('M10 10 L20 20 <script>')).toBe('CARACTERE_INVALIDO')
    expect(codigo('L10 10 L20 20')).toBe('NAO_COMECA_COM_M')
    expect(codigo('M10 10 L20')).toBe('ARGUMENTOS')
    expect(codigo('M10 10 C1 2 3 4 5')).toBe('ARGUMENTOS')
    expect(codigo('M10 10 L')).toBe('ARGUMENTOS')
    expect(codigo('M0 0 A25 25 0 2 1 10 10')).toBe('ARCO_FLAG')
  })

  it('recusa o que o parser do Konva lê diferente do SVG (achados da revisão independente)', () => {
    expect(codigo('M0 0a25 25 0 1010 10')).toBe('ARCO_FLAG') // flags coladas: o Konva lê 1010 como um número
    expect(codigo('M0 0 L10.e5 3')).toBe('CARACTERE_INVALIDO') // o Konva lê 10 e 5
    expect(codigo('M0 0 L1e999 3')).toBe('CARACTERE_INVALIDO') // Infinity
    expect(codigo('M10 50 A-20 -20 0 0 1 90 50')).toBe('ARCO_RAIO')
    expect(codigo('M10 50 A0 20 0 0 1 90 50')).toBe('ARCO_RAIO')
    expect(codigo('M,10,10 L20 20')).toBe('CARACTERE_INVALIDO') // vírgula antes do 1º número
    expect(codigo('M10,,10 L20 20')).toBe('CARACTERE_INVALIDO') // vírgula dupla
    expect(codigo('M10 10, L20 20')).toBe('CARACTERE_INVALIDO') // vírgula sem número depois
  })

  it('recusa comando depois de Z sem M (o parser do Konva diverge do SVG aí) e path que não desenha', () => {
    expect(codigo('M10 10 L20 10 L20 20 Z l5 5')).toBe('APOS_Z_SEM_M')
    expect(codigo('M10 10 L20 10 L20 20 Z M5 5 L6 6')).toBe('ok')
    expect(codigo('M10 10')).toBe('SEM_DESENHO')
  })

  it('aceita todo svg-path da biblioteca de formas', () => {
    const paths = SHAPES_LIBRARY.filter((s) => s.shapeType === 'svg-path' && s.pathData)
    expect(paths.length).toBeGreaterThan(0)
    for (const s of paths) expect([s.id, codigo(s.pathData)]).toEqual([s.id, 'ok'])
  })
})
