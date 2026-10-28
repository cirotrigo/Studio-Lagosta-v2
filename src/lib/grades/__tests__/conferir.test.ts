/**
 * G0 · conferirGrade: a grade inteira é coerente ou é recusada — nunca consertada em silêncio.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { conferirGrade } from '../conferir'
import { BLOB, celula, doisPorDois, duasColunas } from './fixtures'

const codigos = (camadas: Layer[]) => conferirGrade(camadas).map((d) => d.codigo)
const meta = (c: Layer) => (c.metadata as { grade: Record<string, unknown> }).grade

describe('conferirGrade — grade coerente', () => {
  it('2 colunas e 2×2 escritas à mão passam sem diagnóstico', () => {
    expect(conferirGrade(duasColunas())).toEqual([])
    expect(conferirGrade(doisPorDois([`${BLOB}/a.jpg`, '', `${BLOB}/c.jpg`, '']))).toEqual([])
  })

  it('fileUrl ausente (roundtrip do layerSchema) conta como célula vazia', () => {
    const c = duasColunas()
    delete c[0].fileUrl
    c[1].fileUrl = undefined
    expect(conferirGrade(c)).toEqual([])
  })

  it('camadas fora de grade são ignoradas; rotation ausente vale 0', () => {
    const c = duasColunas()
    delete c[0].rotation
    const texto = { id: 't', type: 'text', name: 'T', visible: true, locked: false, order: 9, position: { x: 0, y: 0 }, size: { width: 1, height: 1 } } as Layer
    expect(conferirGrade([texto, ...c])).toEqual([])
  })

  it('tolerância de 1e-6 px: 5e-7 passa, 2e-6 é acusado', () => {
    const a = duasColunas()
    a[1].position = { x: 545 + 5e-7, y: 0 }
    expect(conferirGrade(a)).toEqual([])
    const b = duasColunas()
    b[1].position = { x: 545 + 2e-6, y: 0 }
    expect(codigos(b)).toContain('GRADE_INCOERENTE')
    const c = duasColunas()
    c[0].size = { width: 535, height: 1350 - 2e-6 }
    expect(codigos(c)).toContain('GRADE_INCOERENTE')
  })

  it('não muta nem congela a entrada', () => {
    const c = duasColunas([`${BLOB}/a.jpg`, ''])
    const copia = structuredClone(c)
    conferirGrade(c)
    expect(c).toEqual(copia)
    expect(Object.isFrozen(c[0])).toBe(false)
    expect(Object.isFrozen(c[0].style)).toBe(false)
  })
})

describe('conferirGrade — grade quebrada é acusada', () => {
  const casos: Array<[string, (c: Layer[]) => void, string]> = [
    ['célula com máscara', (c) => { c[0].style = { ...c[0].style, mask: { shapeId: 'x', path: 'M0 0' } } }, 'GRADE_INCOERENTE'],
    ['célula com border.width', (c) => { c[0].style = { ...c[0].style, border: { radius: 0, width: 2 } as never } }, 'GRADE_INCOERENTE'],
    ['célula sem objectFit cover', (c) => { c[0].style = { border: { radius: 0 } } as never }, 'GRADE_INCOERENTE'],
    ['raio da borda diferente do efetivo', (c) => { c[0].style = { objectFit: 'cover', border: { radius: 4 } } as never }, 'GRADE_INCOERENTE'],
    ['célula girada', (c) => { c[1].rotation = 15 }, 'GRADE_GIRADA'],
    ['índice faltando', (c) => { c.pop() }, 'GRADE_INCOERENTE'],
    ['índice repetido', (c) => { meta(c[1]).celula = 0 }, 'GRADE_INCOERENTE'],
    ['índice fora do layout', (c) => { meta(c[1]).celula = 7 }, 'GRADE_INCOERENTE'],
    ['espaçamento diferente entre células', (c) => { meta(c[1]).espacamento = 12 }, 'GRADE_INCOERENTE'],
    ['espaçamento não inteiro', (c) => { meta(c[0]).espacamento = 10.5; meta(c[1]).espacamento = 10.5 }, 'GRADE_INCOERENTE'],
    ['caixa diferente entre células', (c) => { meta(c[1]).caixa = { x: 1, y: 0, w: 1080, h: 1350 } }, 'GRADE_INCOERENTE'],
    ['groupId diferente do id da grade', (c) => { (c[0].metadata as Record<string, unknown>).groupId = 'outro' }, 'GRADE_INCOERENTE'],
    ['layout desconhecido', (c) => { meta(c[0]).layout = 'mosaico'; meta(c[1]).layout = 'mosaico' }, 'GRADE_DESCONHECIDA'],
    ['versão desconhecida', (c) => { meta(c[0]).versao = 2; meta(c[1]).versao = 2 }, 'GRADE_DESCONHECIDA'],
    ['célula que não é image', (c) => { (c[0] as { type: string }).type = 'shape' }, 'GRADE_INCOERENTE'],
    ['caixa com NaN', (c) => { meta(c[0]).caixa = { x: Number.NaN, y: 0, w: 1080, h: 1350 }; meta(c[1]).caixa = meta(c[0]).caixa }, 'GRADE_INCOERENTE'],
    ['URL data: na célula', (c) => { c[0].fileUrl = 'data:image/png;base64,AAAA' }, 'URL_INVALIDA'],
    ['URL de outra loja da Vercel', (c) => { c[0].fileUrl = 'https://outra.public.blob.vercel-storage.com/a.jpg' }, 'URL_INVALIDA'],
    ['URL lh3 na célula', (c) => { c[0].fileUrl = 'https://lh3.googleusercontent.com/d/x' }, 'URL_INVALIDA'],
    ['nome vazio', (c) => { c[0].name = '' }, 'GRADE_INCOERENTE'],
  ]

  it.each(casos)('%s', (_n, quebrar, codigo) => {
    const c = duasColunas()
    quebrar(c)
    expect(codigos(c)).toContain(codigo)
  })

  it.each([
    ['id repetido entre células', (c: Layer[]) => { c[1].id = c[0].id }],
    ['id vazio', (c: Layer[]) => { c[0].id = '' }],
    ['id reservado bg-foto', (c: Layer[]) => { c[0].id = 'bg-foto' }],
    ['id reservado bg-img', (c: Layer[]) => { c[1].id = 'bg-img' }],
  ])('%s: GRADE_INCOERENTE (regressão P2-2)', (_n, quebrar) => {
    const c = duasColunas()
    quebrar(c)
    expect(codigos(c)).toContain('GRADE_INCOERENTE')
  })

  it('id de célula repetido por outra camada da lista: GRADE_INCOERENTE (regressão P2-2)', () => {
    const c = duasColunas()
    const texto = { id: 'c1', type: 'text', name: 'T', visible: true, locked: false, order: 9, position: { x: 0, y: 0 }, size: { width: 1, height: 1 } } as Layer
    expect(codigos([...c, texto])).toContain('GRADE_INCOERENTE')
  })

  it('camada estranha com o groupId da grade e sem metadata.grade é acusada', () => {
    const c = duasColunas()
    const intrusa = { id: 'x', type: 'image', name: 'X', visible: true, locked: false, order: 3, position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, metadata: { groupId: 'g1' } } as Layer
    expect(codigos([...c, intrusa])).toContain('GRADE_INCOERENTE')
  })

  it('metadado coerente com geometria de outro layout é grade quebrada', () => {
    // células de 2 colunas declarando 2-linhas
    const g = { id: 'g9', layout: '2-linhas' }
    const c = [
      celula('a', g, 0, { x: 0, y: 0, w: 535, h: 1350 }),
      celula('b', g, 1, { x: 545, y: 0, w: 535, h: 1350 }),
    ]
    expect(codigos(c)).toContain('GRADE_INCOERENTE')
  })

  it('duas grades: só a quebrada aparece no diagnóstico', () => {
    const boa = duasColunas()
    const ruim = doisPorDois(['', '', '', ''])
    ruim[3].rotation = 90
    const d = conferirGrade([...boa, ...ruim])
    expect(d.length).toBeGreaterThan(0)
    expect(d.every((x) => x.gradeId === 'g2')).toBe(true)
  })
})
