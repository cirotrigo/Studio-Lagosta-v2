/**
 * G3 · ajustes da grade, puro: espaçamento, cantos, tamanho e layout pelo `refazerGrade` do G0 (medida por URL exata,
 * enquadramento pelo helper, recusa atômica); mover por translação pura; desvincular; modo da seleção. Story e Feed.
 * Caixas esperadas calculadas à mão nos comentários (nunca pelo algoritmo).
 */
import { describe, expect, it } from 'vitest'
import type { DesignData, Layer } from '@/types/template'
import {
  ajustarGradeNoDesign,
  caixaPeloTransformer,
  celulaVinculada,
  desvincularNoDesign,
  ladoMinimoNoEditor,
  modoDaSelecao,
  moverNoDesign,
  participantesDoArraste,
  planoDoAjuste,
  selecaoTocaGrade,
} from '../ajustes'
import { conferirGrade, metadadoDeGrade } from '../conferir'
import { criarGrade, preencherCelula } from '../operacoes'
import { BLOB, celula, doisPorDois, duasColunas } from './fixtures'

const A = `${BLOB}/fotos/a.jpg`
const B = `${BLOB}/fotos/b.jpg`
const C = `${BLOB}/fotos/c.jpg`
const D = `${BLOB}/fotos/d.jpg`
const NAT = { width: 1600, height: 1200 }
const GRADE = ['d0', 'd1', 'd2', 'd3']
const texto = { id: 'titulo', type: 'text', name: 'Título', visible: true, locked: false, order: 9, position: { x: 10, y: 10 }, size: { width: 300, height: 80 }, content: 'Oi' } as Layer
const feed = (layers: Layer[]): DesignData => ({ canvas: { width: 1080, height: 1350, backgroundColor: '#fff' }, layers }) as DesignData
const story = (layers: Layer[]): DesignData => ({ canvas: { width: 1080, height: 1920, backgroundColor: '#fff' }, layers }) as DesignData
const medidas = (...urls: string[]) => new Map(urls.map((u) => [u, NAT]))
const ids = (n: number, p = 'n') => Array.from({ length: n }, (_, i) => `${p}${i}`)
const de = (layers: Layer[], id: string) => layers.find((l) => l.id === id)!
const caixaDe = (l: Layer) => ({ x: l.position.x, y: l.position.y, w: l.size.width, h: l.size.height })

/** Plano + ajuste, como o editor faz (o plano antes da medida, o ajuste sobre o estado atual) */
function ajustar(d: DesignData, gradeId: string, mudanca: Parameters<typeof ajustarGradeNoDesign>[2], dims = medidas(A, B, C, D), novos: string[] = ids(6)) {
  const plano = planoDoAjuste(d, gradeId)
  if (plano.tipo !== 'grade') throw new Error(`plano recusado: ${plano.mensagem}`)
  return ajustarGradeNoDesign(d, plano.alvo, mudanca, dims, novos)
}

// Recorte do usuário fora do centro e com a proporção da célula 535×670 (foto 1600×1200): 640 px de largura
const ALTURA_DO_RECORTE = (0.4 * 1600 * 670) / 535 / 1200
const comRecorte = (l: Layer): Layer => ({ ...l, style: { ...l.style, crop: { x: 0.1, y: 0.05, width: 0.4, height: ALTURA_DO_RECORTE } } })

describe('G3 · plano do ajuste', () => {
  it('captura grade, assinatura de TODOS os membros e as URLs exatas sem repetição (vazia não precisa de medida)', () => {
    const p = planoDoAjuste(feed([...doisPorDois([A, B, A, '']), texto]), 'g2')
    expect(p).toMatchObject({ tipo: 'grade', alvo: { gradeId: 'g2', urls: [A, B] } })
    expect(p.tipo === 'grade' && p.alvo.assinatura.length).toBeGreaterThan(10)
  })

  it('sem grade, grade girada ou quebrada: recusa explicada antes de qualquer medida', () => {
    expect(planoDoAjuste(feed([texto]), 'g2')).toMatchObject({ tipo: 'recusa', codigo: 'SEM_GRADE' })
    const [d0, ...resto] = doisPorDois([A, '', '', ''])
    expect(planoDoAjuste(feed([{ ...d0, rotation: 5 }, ...resto]), 'g2')).toMatchObject({ tipo: 'recusa', codigo: 'GRADE_GIRADA', mensagem: expect.stringMatching(/desvincul/i) })
    expect(planoDoAjuste(feed([{ ...d0, position: { x: 3, y: 0 } }, ...resto]), 'g2')).toMatchObject({ tipo: 'recusa', codigo: 'GRADE_INCOERENTE' })
  })
})

describe('G3 · espaçamento, cantos e tamanho (refazerGrade do G0)', () => {
  it('Feed 2×2, espaçamento 10 → 40 px: calhas fixas em px, URLs nas mesmas células, recorte do usuário com o MESMO centro e a MESMA escala', () => {
    const [d0, d1, d2, d3] = doisPorDois([A, B, C, D])
    const d = feed([comRecorte(d0), d1, d2, d3, texto])
    const r = ajustar(d, 'g2', { espacamento: 40 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // colunas [0, 520] · [560, 1080]; linhas [0, 655] · [695, 1350]
    expect(GRADE.map((id) => caixaDe(de(r.layers, id)))).toEqual([
      { x: 0, y: 0, w: 520, h: 655 },
      { x: 560, y: 0, w: 520, h: 655 },
      { x: 0, y: 695, w: 520, h: 655 },
      { x: 560, y: 695, w: 520, h: 655 },
    ])
    expect(GRADE.map((id) => de(r.layers, id).fileUrl)).toEqual([A, B, C, D])
    expect(conferirGrade(r.layers)).toEqual([])
    expect(metadadoDeGrade(de(r.layers, 'd0'))!.espacamento).toBe(40)
    // centro do recorte: (0,1·1600 + 640/2, 0,05·1200 + (640·670/535)/2) = (480, 460,7477) px da foto; escala 535/640
    const crop = de(r.layers, 'd0').style!.crop!
    expect(crop.x * 1600 + (crop.width * 1600) / 2).toBeCloseTo(480, 6)
    expect(crop.y * 1200 + (crop.height * 1200) / 2).toBeCloseTo(60 + (640 * 670) / 535 / 2, 6)
    expect(520 / (crop.width * 1600)).toBeCloseTo(535 / 640, 9)
    expect(de(r.layers, 'titulo')).toBe(texto)
    expect(r.selecionar).toEqual(GRADE)
  })

  it('cantos: raio 30 em todas; raio enorme vira cápsula por célula (metade do menor lado)', () => {
    const d = feed(doisPorDois([A, '', '', '']))
    const r = ajustar(d, 'g2', { raio: 30 })
    expect(r.ok && GRADE.map((id) => de(r.layers, id).style!.border!.radius)).toEqual([30, 30, 30, 30])
    const cap = ajustar(d, 'g2', { raio: 1000 })
    expect(cap.ok && GRADE.map((id) => de(cap.layers, id).style!.border!.radius)).toEqual([267.5, 267.5, 267.5, 267.5])
    expect(cap.ok && conferirGrade(cap.layers)).toEqual([])
    expect(cap.ok && de(cap.layers, 'd0').style!.border!.width).toBeUndefined()
  })

  it('Story 2/1/2 redimensionado de 1080×1920 para 900×1600 em (90, 160): calha de 10 px fixa, nenhuma foto perdida', () => {
    const g = criarGrade({ layout: '2-1-2', caixa: { x: 0, y: 0, w: 1080, h: 1920 }, idDaGrade: 'gs', idsDasCelulas: ['s0', 's1', 's2', 's3', 's4'] })
    if (!g.ok) throw new Error('fixture')
    // linhas de 640: (0,0,535,635) (545,0,535,635) (0,645,1080,630) (0,1285,535,635) (545,1285,535,635)
    expect(g.valor.map(caixaDe)).toEqual([
      { x: 0, y: 0, w: 535, h: 635 },
      { x: 545, y: 0, w: 535, h: 635 },
      { x: 0, y: 645, w: 1080, h: 630 },
      { x: 0, y: 1285, w: 535, h: 635 },
      { x: 545, y: 1285, w: 535, h: 635 },
    ])
    const cheias = g.valor.map((c, i) => (i < 3 ? (preencherCelula(c, [A, B, C][i]) as { valor: Layer }).valor : c))
    const r = ajustar(story(cheias), 'gs', { caixa: { x: 90, y: 160, w: 900, h: 1600 } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // linhas de 533,33: a célula larga vai de 160+533,33+5 a 160+1066,67−5
    const larga = caixaDe(de(r.layers, 's2'))
    expect(larga.x).toBe(90)
    expect(larga.w).toBe(900)
    expect(larga.y).toBeCloseTo(160 + 1600 / 3 + 5, 9)
    expect(larga.h).toBeCloseTo(1600 / 3 - 10, 9)
    expect(de(r.layers, 's1').position.x - (de(r.layers, 's0').position.x + de(r.layers, 's0').size.width)).toBeCloseTo(10, 9)
    expect(['s0', 's1', 's2', 's3', 's4'].map((id) => de(r.layers, id).fileUrl)).toEqual([A, B, C, '', ''])
    expect(conferirGrade(r.layers)).toEqual([])
  })

  it('200×200 com 2×3 e 100 px: espaçamento limitado a 58 e linha do meio ≥ 8 px (piso MIN_CELULA)', () => {
    const g = criarGrade({ layout: '2x3', caixa: { x: 0, y: 0, w: 1080, h: 1350 }, idDaGrade: 'g6', idsDasCelulas: ids(6, 'e') })
    if (!g.ok) throw new Error('fixture')
    const r = ajustar(feed(g.valor), 'g6', { caixa: { x: 0, y: 0, w: 200, h: 200 }, espacamento: 100 }, new Map())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(metadadoDeGrade(r.layers[0])!.espacamento).toBe(58)
    expect(Math.min(...r.layers.map((l) => Math.min(l.size.width, l.size.height)))).toBeGreaterThanOrEqual(8)
    expect(de(r.layers, 'e2').size.height).toBeCloseTo(200 / 3 - 58, 9)
    expect(conferirGrade(r.layers)).toEqual([])
  })

  it('recusas atômicas com motivo: foto sem medida (inclusive medida só de OUTRA URL), recorte esticado, caixa pequena demais, grade mudou depois do plano, nada a mudar', () => {
    const d = feed(doisPorDois([A, B, '', '']))
    expect(ajustar(d, 'g2', { espacamento: 30 }, medidas(A))).toMatchObject({ ok: false, codigo: 'FOTO_SEM_MEDIDA', mensagem: expect.stringMatching(/medir/i) })
    expect(ajustar(d, 'g2', { espacamento: 30 }, medidas(C, D))).toMatchObject({ ok: false, codigo: 'FOTO_SEM_MEDIDA' })

    const [d0, ...resto] = doisPorDois([A, '', '', ''])
    const esticada = feed([{ ...d0, style: { ...d0.style, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } } }, ...resto])
    expect(ajustar(esticada, 'g2', { espacamento: 30 })).toMatchObject({ ok: false, codigo: 'RECORTE_NAO_REPRESENTAVEL', mensagem: expect.stringMatching(/enquadramento/i) })

    expect(ajustar(d, 'g2', { caixa: { x: 0, y: 0, w: 14, h: 14 } })).toMatchObject({ ok: false, codigo: 'GRADE_PEQUENA_DEMAIS', mensagem: expect.stringMatching(/8 px/) })

    const plano = planoDoAjuste(d, 'g2')
    if (plano.tipo !== 'grade') throw new Error('plano')
    const recortada = feed(d.layers.map((l) => (l.id === 'd1' ? comRecorte(l) : l)))
    expect(ajustarGradeNoDesign(recortada, plano.alvo, { espacamento: 30 }, medidas(A, B), [])).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
    expect(ajustarGradeNoDesign(feed([texto]), plano.alvo, { espacamento: 30 }, medidas(A, B), [])).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })

    expect(ajustar(d, 'g2', { espacamento: 10 })).toMatchObject({ ok: false, codigo: 'SEM_MUDANCA' })
  })
})

describe('G3 · trocar layout', () => {
  it('2×2 com 4 fotos → 2 colunas: duas fotos em ordem de leitura nas células, as outras duas AVULSAS (sem grade nem groupId, no mesmo lugar), selecionadas e com aviso', () => {
    const d = feed([...doisPorDois([A, B, C, D]), texto])
    const r = ajustar(d, 'g2', { layout: '2-colunas' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect([de(r.layers, 'd0'), de(r.layers, 'd1')].map((l) => [l.fileUrl, metadadoDeGrade(l)!.celula, caixaDe(l)])).toEqual([
      [A, 0, { x: 0, y: 0, w: 535, h: 1350 }],
      [B, 1, { x: 545, y: 0, w: 535, h: 1350 }],
    ])
    for (const [id, url, pos] of [['d2', C, { x: 0, y: 680 }], ['d3', D, { x: 545, y: 680 }]] as const) {
      const solta = de(r.layers, id)
      expect(solta.fileUrl).toBe(url)
      expect(solta.position).toEqual(pos)
      expect(solta.metadata?.grade).toBeUndefined()
      expect(solta.metadata?.groupId).toBeUndefined()
    }
    expect(r.layers.map((l) => l.fileUrl).filter(Boolean).sort()).toEqual([A, B, C, D])
    expect(r.selecionar).toEqual(['d2', 'd3'])
    expect(r.aviso).toMatch(/2 fotos/)
    expect(conferirGrade(r.layers)).toEqual([])
  })

  it('2 colunas → 2×3: as fotos ficam, 4 células vazias novas entram logo depois da grade na pilha, todas selecionadas', () => {
    const d = feed([...duasColunas([A, B]), texto])
    const r = ajustar(d, 'g1', { layout: '2x3' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.layers.map((l) => l.id)).toEqual(['c0', 'c1', 'n0', 'n1', 'n2', 'n3', 'titulo'])
    expect(r.layers.slice(0, 6).map((l) => l.fileUrl)).toEqual([A, B, '', '', '', ''])
    expect(r.selecionar).toEqual(['c0', 'c1', 'n0', 'n1', 'n2', 'n3'])
    expect(r.aviso).toBeUndefined()
    expect(conferirGrade(r.layers)).toEqual([])
  })
})

describe('G3 · mover (translação pura, sem medir)', () => {
  it('grade inteira + texto: caixa e todas as células andam o mesmo delta, recortes e tamanhos intactos, texto arredondado como o moveLayer', () => {
    const [d0, d1, d2, d3] = doisPorDois([A, B, '', ''])
    const d = feed([comRecorte(d0), d1, d2, d3, { ...texto, position: { x: 10.4, y: 10 } }])
    const r = moverNoDesign(d, [...GRADE, 'titulo'], 15, -7)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(GRADE.map((id) => de(r.layers, id).position)).toEqual([{ x: 15, y: -7 }, { x: 560, y: -7 }, { x: 15, y: 673 }, { x: 560, y: 673 }])
    expect(metadadoDeGrade(de(r.layers, 'd0'))!.caixa).toEqual({ x: 15, y: -7, w: 1080, h: 1350 })
    expect(de(r.layers, 'd0').style).toEqual(comRecorte(d0).style)
    expect(GRADE.map((id) => de(r.layers, id).size)).toEqual(GRADE.map((id) => de(d.layers, id).size))
    expect(de(r.layers, 'titulo').position).toEqual({ x: 25, y: 3 })
    expect(conferirGrade(r.layers)).toEqual([])
  })

  it('uma célula (ou subconjunto) selecionada move a grade INTEIRA, nunca só o membro; geometria fracionária não é arredondada', () => {
    const g = criarGrade({ layout: '1-grande-4-pequenas', caixa: { x: 0, y: 0, w: 1080, h: 1350 }, idDaGrade: 'gq', idsDasCelulas: ids(5, 'q') })
    if (!g.ok) throw new Error('fixture')
    const antes = g.valor.map((l) => l.position.y)
    expect(antes.some((y) => !Number.isInteger(y))).toBe(true) // linhas de 337,5
    const r = moverNoDesign(feed(g.valor), ['q3'], 0, 4)
    expect(r.ok && r.layers.map((l) => l.position.y)).toEqual(antes.map((y) => y + 4))
    expect(r.ok && conferirGrade(r.layers)).toEqual([])
  })

  it('recusa com motivo: célula travada, grade girada ou quebrada; delta zero é "nada a mudar"', () => {
    const [d0, ...resto] = doisPorDois([A, '', '', ''])
    expect(moverNoDesign(feed([{ ...d0, locked: true }, ...resto]), ['d1'], 5, 0)).toMatchObject({ ok: false, codigo: 'CELULA_TRAVADA', mensagem: expect.stringMatching(/travada/i) })
    expect(moverNoDesign(feed([{ ...d0, rotation: 3 }, ...resto]), GRADE, 5, 0)).toMatchObject({ ok: false, codigo: 'GRADE_GIRADA' })
    expect(moverNoDesign(feed([{ ...d0, size: { width: 500, height: 670 } }, ...resto]), GRADE, 5, 0)).toMatchObject({ ok: false, codigo: 'GRADE_INCOERENTE' })
    expect(moverNoDesign(feed(doisPorDois([A, '', '', ''])), GRADE, 0, 0)).toMatchObject({ ok: false, codigo: 'SEM_MUDANCA' })
  })
})

describe('G3 · desvincular', () => {
  it('tira grade e groupId de TODOS os membros (e do groupId dela fora da grade), mantém foto, recorte, cantos e cover; grupo alheio fica', () => {
    const [d0, d1, d2, d3] = doisPorDois([A, B, '', ''])
    const absorvida = { ...d3, metadata: { ...d3.metadata, groupId: 'grupo-x' } }
    const orfa = { ...texto, id: 'orfa', metadata: { groupId: 'g2' } } as Layer
    const comCantos = comRecorte({ ...d0, style: { ...d0.style, border: { radius: 12 } } } as Layer)
    const d = feed([comCantos, d1, d2, absorvida, orfa])
    const r = desvincularNoDesign(d, 'g2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (const l of r.layers) expect(l.metadata?.grade).toBeUndefined()
    expect(r.layers.map((l) => l.metadata?.groupId)).toEqual([undefined, undefined, undefined, 'grupo-x', undefined])
    expect(de(r.layers, 'd0').style).toEqual(comCantos.style)
    expect(r.layers.map((l) => [l.fileUrl, l.position, l.size])).toEqual(d.layers.map((l) => [l.fileUrl, l.position, l.size]))
    expect(r.selecionar).toEqual(GRADE)
    expect(desvincularNoDesign(feed([texto]), 'g2')).toMatchObject({ ok: false, codigo: 'SEM_GRADE' })
  })

  it('serve de saída para grade girada ou quebrada (não exige coerência)', () => {
    const [d0, ...resto] = doisPorDois([A, '', '', ''])
    expect(desvincularNoDesign(feed([{ ...d0, rotation: 9 }, ...resto]), 'g2').ok).toBe(true)
  })
})

describe('G3 · seleção, arraste e Transformer', () => {
  it('modo da seleção: nenhuma, grade inteira (inclusive a de 1 célula) ou parcial (célula, subconjunto, mista)', () => {
    const layers = [...doisPorDois(['', '', '', '']), texto, celula('u0', { id: 'gu', layout: '1-celula' }, 0, { x: 0, y: 0, w: 1080, h: 1350 })]
    expect(modoDaSelecao(layers, [])).toEqual({ modo: 'nenhuma' })
    expect(modoDaSelecao(layers, ['titulo'])).toEqual({ modo: 'nenhuma' })
    expect(modoDaSelecao(layers, GRADE)).toEqual({ modo: 'inteira', gradeId: 'g2' })
    expect(modoDaSelecao(layers, ['u0'])).toEqual({ modo: 'inteira', gradeId: 'gu' })
    expect(modoDaSelecao(layers, ['d0'])).toEqual({ modo: 'parcial', gradeId: 'g2' })
    expect(modoDaSelecao(layers, ['d0', 'd1'])).toMatchObject({ modo: 'parcial' })
    expect(modoDaSelecao(layers, [...GRADE, 'titulo'])).toMatchObject({ modo: 'parcial' })
    expect(selecaoTocaGrade(layers, ['titulo', 'd2'])).toBe(true)
    expect(selecaoTocaGrade(layers, ['titulo'])).toBe(false)
  })

  it('participantes do arraste: a seleção com as grades INTEIRAS que ela toca (célula arrastada leva as irmãs)', () => {
    const layers = [...doisPorDois(['', '', '', '']), texto]
    expect(participantesDoArraste(layers, ['d2'])).toEqual(GRADE)
    expect(participantesDoArraste(layers, ['titulo', 'd0'])).toEqual([...GRADE, 'titulo'])
    expect(participantesDoArraste(layers, ['titulo'])).toEqual(['titulo'])
  })

  it('nó do editor: célula vinculada tem piso de 8 px e não grava geometria sozinha; foto avulsa segue nos 20 px', () => {
    const [d0] = doisPorDois([A, '', '', ''])
    expect([ladoMinimoNoEditor(d0), celulaVinculada(d0)]).toEqual([8, true])
    expect([ladoMinimoNoEditor(texto), celulaVinculada(texto)]).toEqual([20, false])
  })

  it('caixa nova pelo Transformer: menor x/y dos nós e escala aplicada à caixa; escala inválida não gera caixa', () => {
    const caixa = { x: 0, y: 0, w: 1080, h: 1350 }
    expect(caixaPeloTransformer(caixa, [{ x: 372.5, y: 50, scaleX: 0.5, scaleY: 0.5 }, { x: 100, y: 50, scaleX: 0.5, scaleY: 0.5 }])).toEqual({ x: 100, y: 50, w: 540, h: 675 })
    expect(caixaPeloTransformer(caixa, [])).toBeUndefined()
    expect(caixaPeloTransformer(caixa, [{ x: 0, y: 0, scaleX: 0, scaleY: 1 }])).toBeUndefined()
  })

  it('Q2 · caixa pelo Transformer com margem entre caixa e nós (quadradas): a margem escala junto; grade colada igual a antes', () => {
    // Story 4×7 calha 0 na caixa (20, 30): nós começam em (20, 45) e (830, 1665)
    const caixa = { x: 20, y: 30, w: 1080, h: 1920 }
    const antes = [{ x: 20, y: 45 }, { x: 830, y: 1665 }]
    const gesto = (sx: number, sy: number, ax: number, ay: number, dx = 0, dy = 0) =>
      antes.map((p) => ({ x: ax + sx * (p.x - ax) + dx, y: ay + sy * (p.y - ay) + dy, scaleX: sx, scaleY: sy, antes: p }))
    expect(caixaPeloTransformer(caixa, gesto(1, 1, 20, 45))).toEqual(caixa)
    expect(caixaPeloTransformer(caixa, gesto(1, 1, 20, 45, 7, -3))).toEqual({ x: 27, y: 27, w: 1080, h: 1920 })
    // âncora no canto de baixo à direita dos nós (1100, 1935): a caixa inteira sofre a mesma afim
    expect(caixaPeloTransformer(caixa, gesto(0.5, 0.75, 1100, 1935))).toEqual({ x: 560, y: 506, w: 540, h: 1440 })
    // grade que preenche a caixa: o nó do canto está nela, com ou sem `antes` dá o mesmo
    const cheia = { x: 0, y: 0, w: 1080, h: 1350 }
    const nos = [{ x: 372.5, y: 50, scaleX: 0.5, scaleY: 0.5, antes: { x: 545, y: 0 } }, { x: 100, y: 50, scaleX: 0.5, scaleY: 0.5, antes: { x: 0, y: 0 } }]
    expect(caixaPeloTransformer(cheia, nos)).toEqual({ x: 100, y: 50, w: 540, h: 675 })
  })
})
