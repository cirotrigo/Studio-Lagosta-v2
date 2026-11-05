/**
 * G4.3 · as operações genéricas do editor diante da grade, no PURO (o provider real está em
 * `operacoes-genericas-no-editor.test.ts`): excluir/esvaziar, cópia inteira × solta (inclusive o colar real de
 * `camada-copiada.ts`), duplicar, desagrupar = desvincular e a edição genérica de uma camada.
 */
import { describe, expect, it } from 'vitest'
import type { DesignData, Layer } from '@/types/template'
import { camadasColadasNoEditor } from '@/lib/copy-autoral/camada-copiada'
import { conferirGrade, metadadoDeGrade } from '../conferir'
import { BLOB, celula, doisPorDois } from './fixtures'
import {
  agruparTocaGrade,
  desagruparNoDesign,
  duplicarGradeNoDesign,
  edicaoDaCamada,
  gradesInteirasEm,
  removerNoDesign,
  semVinculoDeGrade,
} from '../no-editor'

const A = `${BLOB}/fotos/a.jpg`
const B = `${BLOB}/fotos/b.jpg`
const CROP = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 }
const texto = { id: 't', type: 'text', name: 'Título', visible: true, locked: false, order: 9, position: { x: 10, y: 10 }, size: { width: 300, height: 80 }, content: 'Oi', metadata: { groupId: 'combo' } } as Layer
const grade = () => {
  const c = doisPorDois([A, B, '', A])
  c[1] = { ...c[1], style: { ...c[1].style, crop: CROP, flipH: true } }
  return c
}
const design = (layers: Layer[]): DesignData => ({ canvas: { width: 1080, height: 1350, backgroundColor: '#fff' }, layers }) as DesignData
const IDS = ['d0', 'd1', 'd2', 'd3']

describe('excluir em lote (os ids são a seleção)', () => {
  it('grade inteira entre os ids: sai inteira, o resto fica', () => {
    const r = removerNoDesign(design([...grade(), texto]), IDS)!
    expect(r.removidas.sort()).toEqual(IDS)
    expect(r.layers.map((l) => l.id)).toEqual(['t'])
  })

  it('células parciais: esvaziam (fileUrl "" e sem recorte), sem furar a grade; texto sai junto, num resultado só', () => {
    const r = removerNoDesign(design([...grade(), texto]), ['d1', 'd0', 't'])!
    expect(r.removidas).toEqual(['t'])
    const d1 = r.layers.find((l) => l.id === 'd1')!
    expect([d1.fileUrl, d1.style!.crop, r.layers.find((l) => l.id === 'd0')!.fileUrl]).toEqual(['', undefined, ''])
    expect(d1.style).toMatchObject({ objectFit: 'cover', flipH: true })
    expect(conferirGrade(r.layers)).toEqual([])
  })

  it('só células já vazias ou ids que não existem: nada muda (null)', () => {
    expect(removerNoDesign(design(grade()), ['d2'])).toBeNull()
    expect(removerNoDesign(design(grade()), ['sumiu', 'd2'])).toBeNull()
    expect(removerNoDesign(design(grade()), [])).toBeNull()
  })
})

describe('copiar e colar (camadasColadasNoEditor real)', () => {
  let n = 0
  const novoId = () => `n${++n}`

  it('grade inteira no clipboard: grade NOVA, ids novos, UM deslocamento (posições e caixa), coerente', () => {
    n = 0
    const coladas = camadasColadasNoEditor([...grade(), texto], { novoId, paginaTemContrato: false })
    const celulas = coladas.filter((l) => metadadoDeGrade(l))
    expect(celulas).toHaveLength(4)
    const g = metadadoDeGrade(celulas[0])!.id
    expect(g).toMatch(/^grade-n/)
    expect(new Set(celulas.map((c) => metadadoDeGrade(c)!.id))).toEqual(new Set([g]))
    expect(celulas.every((c) => c.metadata!.groupId === g && !IDS.includes(c.id))).toBe(true)
    // um deslocamento só (o da 1ª célula: 24), sem arredondar, e a caixa junto
    grade().forEach((o, i) => expect(celulas[i].position).toEqual({ x: o.position!.x + 24, y: o.position!.y + 24 }))
    expect(metadadoDeGrade(celulas[0])!.caixa).toEqual({ x: 24, y: 24, w: 1080, h: 1350 })
    expect(celulas[1].style).toMatchObject({ crop: CROP, flipH: true })
    expect(conferirGrade([...grade(), ...coladas])).toEqual([])
    // o texto segue a cascata de sempre (índice 4) e mantém o grupo dele
    const t = coladas.find((l) => l.type === 'text')!
    expect(t.position).toEqual({ x: 10 + 24 + 4 * 12, y: 10 + 24 + 4 * 12 })
    expect(t.metadata!.groupId).toBe('combo')
  })

  it('célula sem as irmãs no clipboard: volta foto avulsa (sem grade e sem o groupId da grade), nunca grade fantasma', () => {
    n = 0
    const [c] = camadasColadasNoEditor([grade()[1]], { novoId, paginaTemContrato: false })
    expect(c.metadata?.grade).toBeUndefined()
    expect(c.metadata?.groupId).toBeUndefined()
    expect(c.style).toMatchObject({ crop: CROP, objectFit: 'cover' })
    expect(conferirGrade([...grade(), c])).toEqual([])
  })

  it('gradesInteirasEm: grade quebrada ou incompleta não é inteira', () => {
    expect(gradesInteirasEm(grade())).toEqual(new Set(['g2']))
    expect(gradesInteirasEm(grade().slice(0, 3))).toEqual(new Set())
    expect(gradesInteirasEm(grade().map((c, i) => (i === 0 ? { ...c, position: { x: 3, y: 0 } } : c)))).toEqual(new Set())
  })
})

describe('duplicar', () => {
  it('grade inteira: cópia +16 logo depois da última célula, coerente, com seleção nas novas', () => {
    let i = 0
    const r = duplicarGradeNoDesign(design([...grade(), texto]), 'g2', { idDaGrade: 'grade-x', idDaCelula: () => `x${i++}` })!
    expect(r.layers.map((l) => l.id)).toEqual([...IDS, 'x0', 'x1', 'x2', 'x3', 't'])
    expect(r.selecionar).toEqual(['x0', 'x1', 'x2', 'x3'])
    expect(metadadoDeGrade(r.layers[4])!.caixa).toEqual({ x: 16, y: 16, w: 1080, h: 1350 })
    expect(conferirGrade(r.layers)).toEqual([])
  })

  it('grade quebrada não duplica (null); a célula copiada sozinha perde o vínculo', () => {
    const quebrada = grade().map((c, i) => (i === 0 ? { ...c, position: { x: 3, y: 0 } } : c))
    expect(duplicarGradeNoDesign(design(quebrada), 'g2', { idDaGrade: 'g', idDaCelula: () => 'x' })).toBeNull()
    const solta = semVinculoDeGrade(grade()[0])
    expect(solta.metadata).toEqual({})
  })
})

describe('agrupar e desagrupar', () => {
  it('agrupar com célula na seleção é recusado; sem célula, não', () => {
    expect(agruparTocaGrade([...grade(), texto], ['d0', 't'])).toBe(true)
    expect(agruparTocaGrade([...grade(), texto], ['t'])).toBe(false)
  })

  it('desagrupar UMA célula desvincula a grade inteira (grade e groupId de todos); grupo comum perde o groupId', () => {
    const layers = desagruparNoDesign(design([...grade(), texto]), ['d2', 't'])!
    for (const l of layers) {
      expect(l.metadata?.grade).toBeUndefined()
      expect(l.metadata?.groupId).toBeUndefined()
    }
    expect(layers.find((l) => l.id === 'd1')!.style).toMatchObject({ crop: CROP, flipH: true })
    expect(conferirGrade(layers)).toEqual([])
    expect(desagruparNoDesign(design([celula('solta', { id: 'g9', layout: '2-colunas' }, 0, { x: 0, y: 0, w: 1, h: 1 }, { metadata: {} } as Partial<Layer>)]), ['solta'])).toBeNull()
  })
})

describe('edição genérica de UMA camada (updateLayer)', () => {
  const c = () => grade()[1]
  const recusada = (depois: Partial<Layer>) => edicaoDaCamada(c(), { ...c(), ...depois } as Layer, grade())

  it.each([
    ['posição', { position: { x: 600, y: 0 } }],
    ['tamanho', { size: { width: 500, height: 670 } }],
    ['rotação', { rotation: 5 }],
    ['cantos', { style: { ...grade()[1].style, border: { radius: 40 } } }],
    ['ajuste contain', { style: { ...grade()[1].style, objectFit: 'contain' } }],
    ['máscara', { style: { ...grade()[1].style, mask: { shapeId: 'heart', path: 'M0 0 Z' } } }],
    ['grupo', { metadata: { ...grade()[1].metadata, groupId: 'outro' } }],
    ['metadata.grade', { metadata: { groupId: 'g2' } }],
    ['foto de host alheio', { fileUrl: 'data:image/png;base64,aGVsbG8=' }],
  ])('célula: %s → recusada, com motivo', (_nome, depois) => {
    const r = recusada(depois as Partial<Layer>)
    expect(r.ok).toBe(false)
    expect((r as { motivo: string }).motivo.length).toBeGreaterThan(10)
  })

  it('célula: foto nova do Blob passa por preencherCelula (recorte limpo, cover); retirar a foto esvazia sem recorte', () => {
    const r = recusada({ fileUrl: `${BLOB}/fotos/nova.jpg` }) as { ok: true; camada: Layer }
    expect(r.ok).toBe(true)
    expect(r.camada.style!.crop).toBeUndefined()
    expect(r.camada.style).toMatchObject({ objectFit: 'cover', flipH: true })
    const v = recusada({ fileUrl: '' }) as { ok: true; camada: Layer }
    expect([v.camada.fileUrl, v.camada.style!.crop]).toEqual(['', undefined])
  })

  it('célula: opacidade, recorte da foto, espelho, nome e visibilidade seguem livres', () => {
    for (const depois of [
      { style: { ...c().style, opacity: 0.5 } },
      { style: { ...c().style, crop: { x: 0, y: 0, width: 1, height: 1 } } },
      { style: { ...c().style, flipV: true } },
      { name: 'Outra' },
      { visible: false },
    ]) {
      const r = recusada(depois as Partial<Layer>) as { ok: true; camada: Layer }
      expect(r.ok, JSON.stringify(depois)).toBe(true)
      expect(r.camada).toEqual({ ...c(), ...depois })
    }
  })

  it('foto avulsa e texto: livres como sempre; só não entram numa grade por edição genérica', () => {
    expect(edicaoDaCamada(texto, { ...texto, position: { x: 1, y: 2 } }, grade())).toMatchObject({ ok: true })
    expect(edicaoDaCamada(texto, { ...texto, metadata: { groupId: 'g2' } }, grade()).ok).toBe(false)
    expect(edicaoDaCamada(texto, { ...texto, metadata: { groupId: 'outro' } }, grade()).ok).toBe(true)
  })
})
