/**
 * G2 · preencher células (puro). Grades escritas à mão em `fixtures.ts`; a ordem do ARRAY de camadas é embaralhada de
 * propósito onde a ordem de leitura importa (ela sai da geometria, não da pilha nem do índice).
 */
import { describe, expect, it } from 'vitest'
import type { DesignData, Layer } from '@/types/template'
import { conferirGrade } from '../conferir'
import {
  LIMITE_DO_LOTE,
  assinaturaDaGrade,
  gradeDaSelecao,
  mapearRespostaDoDrive,
  fotoAvulsaLimpa,
  mensagemDoDesfecho,
  motivoDaUrl,
  planoDePreenchimento,
  preencherNoDesign,
  vaziasEmLeitura,
  type AlvoDePreenchimento,
} from '../preenchimento'
import { BLOB, celula, doisPorDois, duasColunas } from './fixtures'

const A = `${BLOB}/fotos/a.jpg`
const B = `${BLOB}/fotos/b.jpg`
const C = `${BLOB}/fotos/c.jpg`
const NAT = { width: 1600, height: 1200 }
const texto = { id: 'titulo', type: 'text', name: 'Título', visible: true, locked: false, order: 9, position: { x: 10, y: 10 }, size: { width: 300, height: 80 }, content: 'Oi' } as Layer
const design = (layers: Layer[], audio?: DesignData['audio']): DesignData =>
  ({ canvas: { width: 1080, height: 1350, backgroundColor: '#fff' }, layers, ...(audio ? { audio } : {}) }) as DesignData
const musica = { source: 'library', musicId: 9, startTime: 0, endTime: 12 } as DesignData['audio']
/** 2×2 com d0 cheia; o array começa pela de baixo à direita */
const embaralhada = () => {
  const [d0, d1, d2, d3] = doisPorDois([A, '', '', ''])
  return [d3, texto, d1, d0, d2]
}
const ids = (ls: Layer[]) => ls.map((l) => l.id)
const congelar = <T>(x: T): T => {
  if (x && typeof x === 'object') {
    Object.values(x).forEach(congelar)
    Object.freeze(x)
  }
  return x
}

describe('G2 · a grade que a seleção aponta', () => {
  const g = embaralhada()
  it('grade inteira (todas as células, em qualquer ordem, e nada mais)', () => {
    expect(gradeDaSelecao(g, ['d2', 'd0', 'd3', 'd1'])).toEqual({ gradeId: 'g2' })
  })
  it('uma célula só', () => {
    expect(gradeDaSelecao(g, ['d1'])).toEqual({ gradeId: 'g2', celulaId: 'd1' })
  })
  it('parte da grade, grade + outra camada, camada comum ou nada: sem alvo de grade', () => {
    expect(gradeDaSelecao(g, ['d0', 'd1'])).toBeNull()
    expect(gradeDaSelecao(g, ['d0', 'd1', 'd2', 'd3', 'titulo'])).toBeNull()
    expect(gradeDaSelecao(g, ['titulo'])).toBeNull()
    expect(gradeDaSelecao(g, [])).toBeNull()
    expect(gradeDaSelecao(g, ['sumiu'])).toBeNull()
  })
  it('células vazias em ORDEM DE LEITURA (pela geometria, não pela pilha)', () => {
    expect(vaziasEmLeitura(g, 'g2')).toEqual(['d1', 'd2', 'd3'])
  })
})

describe('G2 · plano de UMA foto (decidido antes de qualquer API)', () => {
  it('grade inteira selecionada ⇒ próxima célula vazia em ordem de leitura', () => {
    const layers = embaralhada()
    const p = planoDePreenchimento(design(layers), ['d0', 'd1', 'd2', 'd3'], 'uma')
    expect(p).toMatchObject({ tipo: 'grade', modo: 'proxima', alvo: { gradeId: 'g2', celulas: ['d1'] } })
    expect(p.tipo === 'grade' && p.alvo.assinatura).toBe(assinaturaDaGrade(layers, 'g2'))
  })
  it('célula selecionada ⇒ substitui a foto dela, mesmo cheia', () => {
    expect(planoDePreenchimento(design(embaralhada()), ['d0'], 'uma')).toMatchObject({ tipo: 'grade', modo: 'substituir', alvo: { celulas: ['d0'] } })
  })
  it('grade cheia ⇒ avulsa COM aviso e marcada `gradeCheia` (sem clipe); sem grade selecionada ⇒ avulsa sem aviso nem marca (legado)', () => {
    const cheia = design(doisPorDois([A, B, C, A]))
    const p = planoDePreenchimento(cheia, ['d0', 'd1', 'd2', 'd3'], 'uma')
    expect(p).toMatchObject({ tipo: 'avulsa', gradeCheia: true })
    expect(p.tipo === 'avulsa' && p.aviso).toMatch(/cheia/i)
    expect(planoDePreenchimento(design(embaralhada()), ['titulo'], 'uma')).toEqual({ tipo: 'avulsa' })
    expect(planoDePreenchimento(design(embaralhada()), [], 'uma')).toEqual({ tipo: 'avulsa' })
  })
  it('página de vídeo com grade selecionada: recusa com motivo (nada em célula, nada avulso); sem grade, avulsa de sempre', () => {
    expect(planoDePreenchimento(design(embaralhada(), musica), ['d1'], 'uma')).toMatchObject({ tipo: 'recusa', codigo: 'PAGINA_DE_VIDEO' })
    expect(planoDePreenchimento(design(embaralhada(), musica), ['titulo'], 'uma')).toEqual({ tipo: 'avulsa' })
  })
  it('célula girada ⇒ GRADE_GIRADA; grade incoerente (célula deslocada) ⇒ GRADE_INCOERENTE', () => {
    const [d0, d1, d2, d3] = doisPorDois(['', '', '', ''])
    const girada = design([d0, { ...d1, rotation: 5 }, d2, d3])
    expect(planoDePreenchimento(girada, ['d0'], 'uma')).toMatchObject({ tipo: 'recusa', codigo: 'GRADE_GIRADA' })
    const torta = design([d0, { ...d1, position: { x: 548, y: 0 } }, d2, d3])
    const r = planoDePreenchimento(torta, ['d0', 'd1', 'd2', 'd3'], 'uma')
    expect(r).toMatchObject({ tipo: 'recusa', codigo: 'GRADE_INCOERENTE' })
    expect(r.tipo === 'recusa' && r.mensagem).toBeTruthy()
  })
})

describe('G2 · plano do LOTE (só a grade inteira)', () => {
  const grade = ['d0', 'd1', 'd2', 'd3']
  it('as células vazias em ordem de leitura, quantas forem as fotos', () => {
    expect(planoDePreenchimento(design(embaralhada()), grade, 3)).toMatchObject({ tipo: 'grade', modo: 'lote', alvo: { celulas: ['d1', 'd2', 'd3'] } })
    expect(planoDePreenchimento(design(embaralhada()), grade, 2)).toMatchObject({ tipo: 'grade', alvo: { celulas: ['d1', 'd2'] } })
  })
  it('mais fotos que células vazias, zero, acima do limite ou não inteiro: recusa sem tocar nada', () => {
    expect(planoDePreenchimento(design(embaralhada()), grade, 4)).toMatchObject({ tipo: 'recusa', codigo: 'LOTE_INVALIDO' })
    expect(planoDePreenchimento(design(embaralhada()), grade, 0)).toMatchObject({ tipo: 'recusa', codigo: 'LOTE_INVALIDO' })
    expect(planoDePreenchimento(design(embaralhada()), grade, 1.5)).toMatchObject({ tipo: 'recusa', codigo: 'LOTE_INVALIDO' })
    expect(planoDePreenchimento(design(embaralhada()), grade, LIMITE_DO_LOTE + 1)).toMatchObject({ tipo: 'recusa', codigo: 'LOTE_INVALIDO' })
    expect(LIMITE_DO_LOTE).toBe(6)
  })
  it('grade cheia, célula só, sem grade ou página de vídeo: recusa (o lote nunca vira avulsa)', () => {
    expect(planoDePreenchimento(design(doisPorDois([A, B, C, A])), grade, 1)).toMatchObject({ tipo: 'recusa', codigo: 'GRADE_CHEIA' })
    expect(planoDePreenchimento(design(embaralhada()), ['d1'], 1)).toMatchObject({ tipo: 'recusa', codigo: 'SEM_GRADE' })
    expect(planoDePreenchimento(design(embaralhada()), ['titulo'], 1)).toMatchObject({ tipo: 'recusa', codigo: 'SEM_GRADE' })
    expect(planoDePreenchimento(design(embaralhada(), musica), grade, 1)).toMatchObject({ tipo: 'recusa', codigo: 'PAGINA_DE_VIDEO' })
  })
})

describe('G2 · assinatura: TODOS os membros, inteiros, menos a order', () => {
  const base = embaralhada()
  const ass = assinaturaDaGrade(base, 'g2')
  const trocar = (id: string, f: (l: Layer) => Layer) => base.map((l) => (l.id === id ? f(l) : l))
  it('não muda com a order, nem com outra camada', () => {
    expect(assinaturaDaGrade(base.map((l, i) => ({ ...l, order: 100 - i })), 'g2')).toBe(ass)
    expect(assinaturaDaGrade(trocar('titulo', (l) => ({ ...l, content: 'Outro' })), 'g2')).toBe(ass)
  })
  it.each([
    ['recorte de um membro', (l: Layer) => ({ ...l, style: { ...l.style, crop: { x: 0.1, y: 0, width: 0.5, height: 0.5 } } })],
    ['posição', (l: Layer) => ({ ...l, position: { x: 1, y: 0 } })],
    ['tamanho', (l: Layer) => ({ ...l, size: { width: 534, height: 670 } })],
    ['rotação', (l: Layer) => ({ ...l, rotation: 1 })],
    ['foto', (l: Layer) => ({ ...l, fileUrl: B })],
    ['metadata.grade', (l: Layer) => ({ ...l, metadata: { ...l.metadata, grade: { ...(l.metadata!.grade as object), layout: '2-colunas' } } })],
    ['groupId', (l: Layer) => ({ ...l, metadata: { ...l.metadata, groupId: 'outro' } })],
    ['máscara', (l: Layer) => ({ ...l, style: { ...l.style, mask: { shapeId: 'x', path: 'M0 0' } } as Layer['style'] })],
  ])('muda com %s de um membro NÃO alvo', (_n, f) => {
    expect(assinaturaDaGrade(trocar('d3', f), 'g2')).not.toBe(ass)
  })
  it('muda quando um membro some', () => {
    expect(assinaturaDaGrade(base.filter((l) => l.id !== 'd2'), 'g2')).not.toBe(ass)
  })
})

/** O plano do lote sobre `layers` (a assinatura do instante) */
function alvoDe(layers: Layer[], celulas: string[]): AlvoDePreenchimento {
  return { gradeId: layers.find((l) => l.id === celulas[0])!.metadata!.groupId as string, celulas, assinatura: assinaturaDaGrade(layers, (layers.find((l) => l.id === celulas[0])!.metadata!.groupId as string)) }
}

describe('G2 · aplicar no design (dentro do updater do editor)', () => {
  it('substituir: foto nova, cover escrito, recorte LIMPO; o resto intocado; entrada não mutada', () => {
    const [d0, d1, d2, d3] = doisPorDois([A, '', '', ''])
    const layers = congelar([texto, { ...d0, style: { ...d0.style, crop: { x: 0.2, y: 0.1, width: 0.5, height: 0.6 } } }, d1, d2, d3])
    const antes = JSON.stringify(layers)
    const r = preencherNoDesign(design(layers), alvoDe(layers, ['d0']), [{ celulaId: 'd0', nome: 'b.jpg', url: B, natural: NAT }])
    expect(JSON.stringify(layers)).toBe(antes)
    expect(r).toMatchObject({ ok: true, aplicadas: ['d0'], falhas: [] })
    const nova = r.layers!.find((l) => l.id === 'd0')!
    expect(nova.fileUrl).toBe(B)
    expect(nova.style?.objectFit).toBe('cover')
    expect(nova.style?.crop).toBeUndefined()
    expect(nova.metadata).toEqual(d0.metadata)
    for (const l of r.layers!.filter((l) => l.id !== 'd0')) expect(l).toBe(layers.find((x) => x.id === l.id))
    expect(ids(r.layers!)).toEqual(ids(layers))
    expect(conferirGrade(r.layers!)).toEqual([])
  })

  it('lote parcial: aplica as validadas nas células PREVISTAS; a que falhou fica como estava e vai para a lista, na ordem do alvo', () => {
    const layers = doisPorDois(['', '', '', ''])
    const alvo = alvoDe(layers, ['d0', 'd1', 'd2'])
    const r = preencherNoDesign(design(layers), alvo, [
      { celulaId: 'd2', nome: 'c.jpg', url: C, natural: NAT },
      { celulaId: 'd0', nome: 'a.jpg', url: A, natural: NAT },
    ], [{ celulaId: 'd1', nome: 'b.jpg', motivo: 'não veio do Drive' }])
    expect(r).toMatchObject({ ok: true, aplicadas: ['d0', 'd2'] })
    expect(r.falhas).toEqual([{ celulaId: 'd1', nome: 'b.jpg', motivo: 'não veio do Drive' }])
    expect(r.layers!.map((l) => l.fileUrl)).toEqual([A, '', C, ''])
  })

  it('célula do alvo sem foto e sem falha declarada também é falha (nunca some em silêncio)', () => {
    const layers = doisPorDois(['', '', '', ''])
    const r = preencherNoDesign(design(layers), alvoDe(layers, ['d0', 'd1']), [{ celulaId: 'd0', nome: 'a.jpg', url: A, natural: NAT }])
    expect(r.ok).toBe(true)
    expect(r.falhas.map((f) => f.celulaId)).toEqual(['d1'])
  })

  it.each([
    ['data:', 'data:image/png;base64,AAAA'],
    ['blob:', 'blob:https://app/123'],
    ['lh3 do Drive', 'https://lh3.googleusercontent.com/abc'],
    ['outro host', 'https://exemplo.com/a.jpg'],
    ['http', A.replace('https:', 'http:')],
  ])('URL %s: a célula fica como estava e a falha é listada', (_n, url) => {
    const layers = doisPorDois(['', '', '', ''])
    const r = preencherNoDesign(design(layers), alvoDe(layers, ['d0', 'd1']), [
      { celulaId: 'd0', nome: 'ruim.jpg', url, natural: NAT },
      { celulaId: 'd1', nome: 'b.jpg', url: B, natural: NAT },
    ])
    expect(r).toMatchObject({ ok: true, aplicadas: ['d1'] })
    expect(r.falhas.map((f) => [f.celulaId, f.nome])).toEqual([['d0', 'ruim.jpg']])
    expect(r.layers!.find((l) => l.id === 'd0')!.fileUrl).toBe('')
  })

  it('sem dimensão natural conferida: falha, nada aplicado; zero sucessos ⇒ NADA_APLICADO sem camadas', () => {
    const layers = doisPorDois([A, '', '', ''])
    const r = preencherNoDesign(design(layers), alvoDe(layers, ['d0']), [{ celulaId: 'd0', nome: 'b.jpg', url: B, natural: { width: 0, height: 10 } }])
    expect(r).toMatchObject({ ok: false, codigo: 'NADA_APLICADO' })
    expect(r.layers).toBeUndefined()
    expect(r.falhas.map((f) => f.celulaId)).toEqual(['d0'])
  })

  it('membro NÃO alvo mudou (recorte), grade removida ou página virou vídeo: nada aplicado, falhas preservadas', () => {
    const layers = doisPorDois([A, '', '', ''])
    const alvo = alvoDe(layers, ['d1'])
    const foto = [{ celulaId: 'd1', nome: 'b.jpg', url: B, natural: NAT }]
    const falha = [{ celulaId: 'x', nome: 'z.jpg', motivo: 'm' }]
    const recortada = layers.map((l) => (l.id === 'd0' ? { ...l, style: { ...l.style, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } } } : l))
    expect(preencherNoDesign(design(recortada), alvo, foto, falha)).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU', falhas: falha })
    expect(preencherNoDesign(design([texto]), alvo, foto)).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
    expect(preencherNoDesign(design(layers, musica), alvo, foto)).toMatchObject({ ok: false, codigo: 'PAGINA_DE_VIDEO' })
  })

  it('foto para célula fora do alvo ou repetida: LOTE_INVALIDO, nada aplicado', () => {
    const layers = doisPorDois(['', '', '', ''])
    const alvo = alvoDe(layers, ['d0'])
    expect(preencherNoDesign(design(layers), alvo, [{ celulaId: 'd3', nome: 'a', url: A, natural: NAT }])).toMatchObject({ ok: false, codigo: 'LOTE_INVALIDO' })
    expect(
      preencherNoDesign(design(layers), alvo, [
        { celulaId: 'd0', nome: 'a', url: A, natural: NAT },
        { celulaId: 'd0', nome: 'b', url: B, natural: NAT },
      ]),
    ).toMatchObject({ ok: false, codigo: 'LOTE_INVALIDO' })
  })
})

describe('G2 · resposta do Drive: por file.id, nunca pela posição', () => {
  const pedidos = [
    { celulaId: 'c1', driveId: 'A', nome: 'a.jpg' },
    { celulaId: 'c2', driveId: 'B', nome: 'b.jpg' },
    { celulaId: 'c3', driveId: 'C', nome: 'c.jpg' },
  ]
  it('[A,B,C] pedidos, resposta 200 parcial [C,A]: A→c1, C→c3, B falha', () => {
    const m = mapearRespostaDoDrive(pedidos, { files: [{ id: 'C', url: C }, { id: 'A', url: A }], uploaded: 2 })
    expect(m.get('c1')).toEqual({ url: A })
    expect(m.get('c3')).toEqual({ url: C })
    expect(m.get('c2')).toMatchObject({ motivo: expect.any(String) })
  })
  it('id desconhecido ou ausente é ignorado; url que não é texto e id repetido viram falha da célula', () => {
    const m = mapearRespostaDoDrive(pedidos, {
      files: [{ id: 'Z', url: B }, { url: B }, { id: 'A', url: 42 }, { id: 'C', url: C }, { id: 'C', url: B }, { id: 'B', url: B }],
    })
    expect(m.get('c1')).toMatchObject({ motivo: expect.any(String) })
    expect(m.get('c2')).toEqual({ url: B })
    expect(m.get('c3')).toMatchObject({ motivo: expect.any(String) })
  })
  it.each([null, 'x', {}, { files: 'x' }, { files: [null] }])('resposta sem lista de arquivos (%j): todas falham', (resposta) => {
    const m = mapearRespostaDoDrive(pedidos, resposta)
    expect([...m.values()].every((v) => 'motivo' in v)).toBe(true)
    expect(m.size).toBe(3)
  })
  it('a URL é validada à parte, igual para toda origem', () => {
    expect(motivoDaUrl(A)).toBeUndefined()
    for (const u of ['data:image/png;base64,AA', 'blob:https://x/1', 'https://lh3.googleusercontent.com/a', 'https://exemplo.com/a.jpg', '', 7]) {
      expect(motivoDaUrl(u)).toBeTruthy()
    }
  })
})

describe('G2 · mensagem para a pessoa', () => {
  it('sucesso parcial lista as falhas pelo NOME; recusa usa a mensagem', () => {
    const t = mensagemDoDesfecho({ ok: true, aplicadas: ['d0', 'd2'], falhas: [{ celulaId: 'd1', nome: 'b.jpg', motivo: 'não veio do Drive' }], layers: [] })
    expect(t.texto).toMatch(/2 fotos/)
    expect(t.texto).toContain('b.jpg')
    expect(t.erro).toBe(false)
    const ruim = mensagemDoDesfecho({ ok: false, codigo: 'ALVO_MUDOU', mensagem: 'mudou', falhas: [] })
    expect(ruim).toEqual({ texto: 'mudou', erro: true })
  })
})

describe('G2 · grades de duas colunas também', () => {
  it('próxima vazia numa grade só com a segunda vazia', () => {
    const layers = duasColunas([A, ''])
    expect(planoDePreenchimento(design(layers), ['c0', 'c1'], 'uma')).toMatchObject({ tipo: 'grade', alvo: { celulas: ['c1'] } })
    const outra = celula('x0', { id: 'gx', layout: '2-colunas' }, 0, { x: 0, y: 0, w: 535, h: 1350 })
    expect(gradeDaSelecao([...layers, outra], ['c0', 'c1'])).toEqual({ gradeId: 'g1' })
  })
})

describe('G2 · foto avulsa da grade cheia', () => {
  it('não herda metadado, grupo nem clipe; o resto da camada fica', () => {
    const suja = { ...celula('x', { id: 'g2', layout: '2x2' }, 0, { x: 0, y: 0, w: 10, h: 10 }), fileUrl: A, clipe: { duracao: 3 } } as Layer
    const limpa = fotoAvulsaLimpa(suja)
    expect(limpa.metadata).toBeUndefined()
    expect((limpa as { clipe?: unknown }).clipe).toBeUndefined()
    expect(limpa).toMatchObject({ id: 'x', type: 'image', fileUrl: A, size: { width: 10, height: 10 } })
    expect(suja.metadata?.groupId).toBe('g2') // entrada não mutada
  })
})
