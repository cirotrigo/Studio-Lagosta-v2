/**
 * G0 · operações puras: criarGrade (fábrica com ids injetados), preencherCelula (único caminho de foto) e
 * refazerGrade (atômica: ou tudo, ou diagnóstico). Recortes esperados calculados à mão nos comentários.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { resolveImageSourceRect } from '@/lib/image-fit'
import { conferirGrade } from '../conferir'
import { HOSTS_DO_BLOB_PROPRIO, criarGrade, preencherCelula, refazerGrade, urlDeBlobProprio } from '../operacoes'
import { BLOB, FEED, doisPorDois, duasColunas } from './fixtures'

const A = `${BLOB}/a.jpg`
const B = `${BLOB}/b.jpg`
const C = `${BLOB}/c.jpg`
const DIM = new Map([
  [A, { width: 1000, height: 1000 }],
  [B, { width: 2000, height: 1000 }],
  [C, { width: 800, height: 1200 }],
])

function ok<T>(r: { ok: boolean; valor?: T; diagnosticos?: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.diagnosticos))
  return r.valor
}
function falha(r: { ok: boolean; diagnosticos?: Array<{ codigo: string }> }) {
  expect(r.ok).toBe(false)
  expect(r).not.toHaveProperty('valor')
  return r.diagnosticos!.map((d) => d.codigo)
}
const grade = (c: Layer) => (c.metadata as { grade?: Record<string, unknown> } | undefined)?.grade

/**
 * Oráculo: o recorte EFETIVO (o que editor e servidor desenham, por `resolveImageSourceRect`, com o piso de 0,01 do
 * recorte manual) tem a proporção da caixa, ± 0,5 px na largura. Medir só as frações cruas não pega o piso.
 */
function semDeformar(c: Layer, dims: Map<string, { width: number; height: number }>) {
  const nat = dims.get(c.fileUrl as string)!
  const fonte = resolveImageSourceRect(nat, c.size, c.style)!
  expect(fonte).toBeDefined()
  expect(Math.abs((fonte.cropWidth / fonte.cropHeight) * c.size.height - c.size.width)).toBeLessThanOrEqual(0.5)
}

describe('criarGrade', () => {
  it('2/1/2 no Feed com ids injetados: células vazias, cover, nomes, groupId, coerente', () => {
    const camadas = ok(
      criarGrade({ layout: '2-1-2', caixa: FEED, espacamento: 100, raio: 0, idDaGrade: 'g', idsDasCelulas: ['a', 'b', 'c', 'd', 'e'] }),
    )
    expect(camadas.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(camadas.map((c) => c.name)).toEqual(['Grade · foto 1', 'Grade · foto 2', 'Grade · foto 3', 'Grade · foto 4', 'Grade · foto 5'])
    expect(camadas[2].position).toEqual({ x: 0, y: 500 })
    expect(camadas[2].size).toEqual({ width: 1080, height: 350 })
    for (const c of camadas) {
      expect(c.type).toBe('image')
      expect(c.fileUrl).toBe('')
      expect(c.rotation).toBe(0)
      expect(c.style).toEqual({ objectFit: 'cover', border: { radius: 0 } })
      expect((c.metadata as Record<string, unknown>).groupId).toBe('g')
    }
    expect(grade(camadas[2])).toEqual({ id: 'g', layout: '2-1-2', versao: 1, celula: 2, espacamento: 100, raio: 0, caixa: FEED })
    expect(conferirGrade(camadas)).toEqual([])
  })

  it('padrão: espaçamento 10, raio 0; raio alto vira cápsula por célula', () => {
    const camadas = ok(criarGrade({ layout: '2-colunas', caixa: FEED, raio: 9999, idDaGrade: 'g', idsDasCelulas: ['a', 'b'] }))
    expect(grade(camadas[0])!.espacamento).toBe(10)
    expect(camadas[0].style!.border!.radius).toBe(535 / 2)
    expect(conferirGrade(camadas)).toEqual([])
  })

  it.each([
    ['id reservado bg-foto', { idsDasCelulas: ['bg-foto', 'b'] }, 'ENTRADA_INVALIDA'],
    ['id reservado bg-img', { idsDasCelulas: ['a', 'bg-img'] }, 'ENTRADA_INVALIDA'],
    ['ids repetidos', { idsDasCelulas: ['a', 'a'] }, 'ENTRADA_INVALIDA'],
    ['ids a menos', { idsDasCelulas: ['a'] }, 'ENTRADA_INVALIDA'],
    ['id vazio', { idsDasCelulas: ['a', ''] }, 'ENTRADA_INVALIDA'],
    ['id da grade vazio', { idDaGrade: '' }, 'ENTRADA_INVALIDA'],
    ['layout desconhecido', { layout: 'mosaico' }, 'GRADE_DESCONHECIDA'],
    ['raio NaN', { raio: Number.NaN }, 'ENTRADA_INVALIDA'],
    ['caixa pequena demais', { caixa: { x: 0, y: 0, w: 10, h: 10 } }, 'GRADE_PEQUENA_DEMAIS'],
  ])('%s: recusa', (_n, troca, codigo) => {
    const r = criarGrade({ layout: '2-colunas', caixa: FEED, idDaGrade: 'g', idsDasCelulas: ['a', 'b'], ...troca })
    expect(falha(r)).toContain(codigo)
  })
})

describe('urlDeBlobProprio e preencherCelula', () => {
  it.each([
    [`${BLOB}/a.jpg`, true],
    ['https://outro123.public.blob.vercel-storage.com/x.png', false],
    ['https://2RHSGFLEOZGL5JBM.public.blob.vercel-storage.com/a.jpg', true],
    ['https://x.2rhsgfleozgl5jbm.public.blob.vercel-storage.com/a.jpg', false],
    ['http://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/a.jpg', false],
    ['https://public.blob.vercel-storage.com/a.jpg', false],
    ['https://lh3.googleusercontent.com/d/abc', false],
    ['https://evil.com/?x=.public.blob.vercel-storage.com', false],
    ['https://evil.com/a.public.blob.vercel-storage.com', false],
    ['https://user:pw@2rhsgfleozgl5jbm.public.blob.vercel-storage.com/a.jpg', false],
    ['https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com:8443/a.jpg', false],
    ['data:image/png;base64,AAAA', false],
    ['blob:https://studio/abc', false],
    ['https://exemplo.com/a.jpg', false],
    ['', false],
    ['nao é url', false],
  ])('%s → %s', (url, esperado) => {
    expect(urlDeBlobProprio(url)).toBe(esperado)
  })

  it('grava fileUrl, cover e LIMPA o crop, sem mutar a entrada', () => {
    const [c0] = duasColunas([A, ''])
    c0.style = { ...c0.style, objectFit: 'fill', crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, cropPosition: 'left-top' }
    const copia = structuredClone(c0)
    const r = ok(preencherCelula(c0, B))
    expect(r.fileUrl).toBe(B)
    expect(r.style!.objectFit).toBe('cover')
    expect(r.style).not.toHaveProperty('crop')
    expect(r.style!.border).toEqual({ radius: 0 })
    expect(r.metadata).toEqual(c0.metadata)
    expect(c0).toEqual(copia)
    expect(Object.isFrozen(c0)).toBe(false)
    expect(r.style).not.toBe(c0.style)
  })

  it.each(['data:image/png;base64,AAAA', 'blob:https://x/y', 'https://lh3.googleusercontent.com/d/x', 'https://exemplo.com/a.jpg', ''])(
    'recusa URL %s com URL_INVALIDA',
    (url) => {
      const [c0] = duasColunas()
      expect(falha(preencherCelula(c0, url))).toContain('URL_INVALIDA')
    },
  )

  it('lista explícita de hosts substitui o padrão (igualdade exata, sem sufixo); data:/blob:/http/lh3 seguem recusados', () => {
    const [c0] = duasColunas()
    const outra = 'loja-teste.public.blob.vercel-storage.com'
    const lista = { hostsProprios: [outra] }
    expect(ok(preencherCelula(c0, `https://${outra}/a.jpg`, lista)).fileUrl).toBe(`https://${outra}/a.jpg`)
    // a lista substitui o padrão: o host padrão deixa de valer
    expect(falha(preencherCelula(c0, A, lista))).toContain('URL_INVALIDA')
    // lista vazia não aceita nada
    expect(falha(preencherCelula(c0, A, { hostsProprios: [] }))).toContain('URL_INVALIDA')
    const comLh3 = { hostsProprios: ['lh3.googleusercontent.com', outra] }
    for (const u of ['data:image/png;base64,AA', 'blob:https://x/y', 'https://lh3.googleusercontent.com/d/x', `http://${outra}/a.jpg`]) {
      expect(falha(preencherCelula(c0, u, comLh3))).toContain('URL_INVALIDA')
    }
    expect(urlDeBlobProprio(`https://${outra}/a.jpg`)).toBe(false)
    expect(HOSTS_DO_BLOB_PROPRIO).toEqual(['2rhsgfleozgl5jbm.public.blob.vercel-storage.com'])
  })

  it('célula girada: GRADE_GIRADA; camada sem grade: recusa', () => {
    const [c0] = duasColunas()
    expect(falha(preencherCelula({ ...c0, rotation: 30 }, A))).toContain('GRADE_GIRADA')
    const solta = { ...c0, metadata: {} }
    expect(falha(preencherCelula(solta, A))).toContain('CELULA_FORA_DE_GRADE')
  })
})

describe('refazerGrade', () => {
  function base() {
    const c = duasColunas([A, B])
    // B com recorte do usuário na proporção da caixa 535×1350: largura = (535/1350)·1000/2000 = 535/2700
    c[1].style = { ...c[1].style, crop: { x: 0.4, y: 0, width: 535 / 2700, height: 1 } }
    return c
  }

  it('espaçamento 10 → 20: caixas novas, fotos e ids preservados, enquadramento pela escala congelada', () => {
    const entrada = base()
    const copia = structuredClone(entrada)
    const v = ok(refazerGrade(entrada, { espacamento: 20 }, DIM))
    expect(v.avulsas).toEqual([])
    expect(v.celulas.map((c) => [c.id, c.fileUrl])).toEqual([['c0', A], ['c1', B]])
    // colunas de 540 com g=20: [0, 530] · [550, 1080]
    expect(v.celulas[0].position).toEqual({ x: 0, y: 0 })
    expect(v.celulas[0].size).toEqual({ width: 530, height: 1350 })
    expect(v.celulas[1].position).toEqual({ x: 550, y: 0 })
    // A 1000×1000 em 535×1350 (cover): fonte 396,296×1000, escala 1,35. Caixa 530 ⇒ fonte 392,593 centrada em 500
    // ⇒ x = (500 − 196,296)/1000 = 0,303704; largura 0,392593
    const ca = v.celulas[0].style!.crop!
    expect(ca.x).toBeCloseTo(0.303703704, 8)
    expect(ca.width).toBeCloseTo(0.392592593, 8)
    expect(ca.y).toBeCloseTo(0, 9)
    expect(ca.height).toBeCloseTo(1, 9)
    // B 2000×1000, fonte 396,296 px a partir de 800, centro 998,148 ⇒ nova fonte 392,593 ⇒ x = 801,852/2000
    // efetivo literal: A mostra 392,593 × 1000 px da foto
    const efA = resolveImageSourceRect({ width: 1000, height: 1000 }, v.celulas[0].size, v.celulas[0].style)!
    expect(efA.cropWidth).toBeCloseTo(392.592593, 5)
    expect(efA.cropHeight).toBeCloseTo(1000, 9)
    const cb = v.celulas[1].style!.crop!
    expect(cb.x).toBeCloseTo(0.400925926, 8)
    expect(cb.width).toBeCloseTo(0.196296296, 8)
    for (const c of v.celulas) {
      expect(grade(c)!.espacamento).toBe(20)
      expect(c.style!.objectFit).toBe('cover')
      semDeformar(c, DIM)
    }
    expect(conferirGrade(v.celulas)).toEqual([])
    expect(entrada).toEqual(copia)
    expect(Object.isFrozen(entrada[0])).toBe(false)
  })

  it('raio alto: cápsula por célula; caixa reduzida ao Feed/2: nada deforma', () => {
    const r1 = ok(refazerGrade(base(), { raio: 5000 }, DIM))
    expect(r1.celulas[0].style!.border!.radius).toBe(535 / 2)
    expect(grade(r1.celulas[0])!.raio).toBe(5000)
    expect(conferirGrade(r1.celulas)).toEqual([])
    const r2 = ok(refazerGrade(base(), { caixa: { x: 270, y: 337.5, w: 540, h: 675 } }, DIM))
    for (const c of r2.celulas) semDeformar(c, DIM)
    expect(conferirGrade(r2.celulas)).toEqual([])
  })

  it('mover a caixa sem mudar tamanho: só posição muda, recorte idêntico', () => {
    const v = ok(refazerGrade(base(), { caixa: { x: 100, y: 50, w: 1080, h: 1350 } }, DIM))
    expect(v.celulas[0].position).toEqual({ x: 100, y: 50 })
    expect(v.celulas[1].position).toEqual({ x: 645, y: 50 })
    expect(v.celulas[1].style!.crop).toEqual({ x: 0.4, y: 0, width: 535 / 2700, height: 1 })
    expect(v.celulas[0].style).not.toHaveProperty('crop')
  })

  it('trocar 2×2 → 2 colunas: fotos compactadas em ordem de leitura, sobra sai avulsa, nenhuma foto apagada', () => {
    const entrada = doisPorDois([A, '', B, C])
    const v = ok(refazerGrade(entrada, { layout: '2-colunas' }, DIM))
    expect(v.celulas.map((c) => [c.id, c.fileUrl])).toEqual([['d0', A], ['d2', B]])
    expect(v.avulsas.map((c) => [c.id, c.fileUrl])).toEqual([['d3', C]])
    const avulsa = v.avulsas[0]
    expect(avulsa.metadata).not.toHaveProperty('grade')
    expect(avulsa.metadata).not.toHaveProperty('groupId')
    expect(avulsa.position).toEqual({ x: 545, y: 680 })
    expect(avulsa.size).toEqual({ width: 535, height: 670 })
    for (const c of v.celulas) semDeformar(c, DIM)
    expect(conferirGrade([...v.celulas, ...v.avulsas])).toEqual([])
  })

  it('trocar para layout maior exige ids novos injetados', () => {
    expect(falha(refazerGrade(base(), { layout: '2-1-2' }, DIM))).toContain('ENTRADA_INVALIDA')
    expect(falha(refazerGrade(base(), { layout: '2-1-2' }, DIM, { idsNovos: ['n1', 'c0', 'n3'] }))).toContain('ENTRADA_INVALIDA')
    expect(falha(refazerGrade(base(), { layout: '2-1-2' }, DIM, { idsNovos: ['n1', 'bg-foto', 'n3'] }))).toContain('ENTRADA_INVALIDA')
    const v = ok(refazerGrade(base(), { layout: '2-1-2' }, DIM, { idsNovos: ['n1', 'n2', 'n3'] }))
    expect(v.celulas.map((c) => [c.id, c.fileUrl])).toEqual([
      ['c0', A], ['c1', B], ['n1', ''], ['n2', ''], ['n3', ''],
    ])
    expect(v.celulas.map((c) => c.name)).toEqual(['Grade · foto 1', 'Grade · foto 2', 'Grade · foto 3', 'Grade · foto 4', 'Grade · foto 5'])
    expect(conferirGrade(v.celulas)).toEqual([])
  })

  it('célula vazia (fileUrl "" ou ausente) não exige dimensão', () => {
    const c = duasColunas([A, undefined])
    delete c[1].fileUrl
    const v = ok(refazerGrade(c, { espacamento: 0 }, new Map([[A, { width: 1000, height: 1000 }]])))
    expect(v.celulas[1].style).not.toHaveProperty('crop')
  })

  it.each([
    ['foto sem dimensão', new Map([[A, { width: 1000, height: 1000 }]])],
    ['dimensão de outra URL (query diferente)', new Map([[A, { width: 1000, height: 1000 }], [`${B}?v=2`, { width: 2000, height: 1000 }]])],
    ['dimensão NaN', new Map([[A, { width: 1000, height: 1000 }], [B, { width: Number.NaN, height: 1000 }]])],
    ['dimensão 0', new Map([[A, { width: 1000, height: 1000 }], [B, { width: 0, height: 1000 }]])],
  ])('%s: FOTO_SEM_MEDIDA, sem retorno parcial', (_n, dims) => {
    expect(falha(refazerGrade(base(), { espacamento: 20 }, dims))).toContain('FOTO_SEM_MEDIDA')
  })

  it('recorte degenerado (x=1 ⇒ fonte de largura 0): RECORTE_DEGENERADO, nunca apaga nem estica', () => {
    const c = base()
    c[1].style = { ...c[1].style, crop: { x: 1, y: 0, width: 0.5, height: 1 } }
    expect(falha(refazerGrade(c, { espacamento: 20 }, DIM))).toContain('RECORTE_DEGENERADO')
    // mesmo sem mudar o tamanho da célula
    expect(falha(refazerGrade(c, { caixa: { x: 10, y: 0, w: 1080, h: 1350 } }, DIM))).toContain('RECORTE_DEGENERADO')
    const d = base()
    d[0].style = { ...d[0].style, crop: { x: 0, y: 0, width: Number.NaN, height: 1 } }
    expect(falha(refazerGrade(d, { raio: 4 }, DIM))).toContain('RECORTE_DEGENERADO')
  })

  it('Story 1 célula, foto 1000², caixa 8×16: o piso de 0,01 esticaria ⇒ RECORTE_NAO_REPRESENTAVEL (regressão P2-1)', () => {
    const [vazia] = ok(criarGrade({ layout: '1-celula', caixa: { x: 0, y: 0, w: 1080, h: 1920 }, idDaGrade: 'g', idsDasCelulas: ['s'] }))
    const cheia = ok(preencherCelula(vazia, A))
    const r = refazerGrade([cheia], { caixa: { x: 0, y: 0, w: 8, h: 16 } }, DIM)
    expect(falha(r)).toContain('RECORTE_NAO_REPRESENTAVEL')
  })

  it('Story 1 célula, foto 1000², caixa 8×8: proporção certa mas o piso de 0,01 troca escala e centro ⇒ RECORTE_NAO_REPRESENTAVEL (residual P2-1)', () => {
    // pedido pelo cropForResizedBox: fonte 4,1667×4,1667 px centrada em 500; o resolver desenharia 10×10 centrada em 502,9167
    const [vazia] = ok(criarGrade({ layout: '1-celula', caixa: { x: 0, y: 0, w: 1080, h: 1920 }, idDaGrade: 'g', idsDasCelulas: ['s'] }))
    const cheia = ok(preencherCelula(vazia, A))
    expect(falha(refazerGrade([cheia], { caixa: { x: 0, y: 0, w: 8, h: 8 } }, DIM))).toContain('RECORTE_NAO_REPRESENTAVEL')
  })

  it('na borda direita/inferior a fonte abaixo de 1% é desenhada como pedida (limite 1−x): aceita, sem regra ingênua de largura', () => {
    // 1 célula 8×8 mostrando o canto 995..1000 de A (5×5 px). Caixa 10×8: escala 1,6 ⇒ fonte 6,25×5; centro x 997,5 empurrado
    // para a borda: x = 1000 − 6,25 = 993,75; y = 997,5 − 2,5 = 995. O resolver desenha 993,75/995/6,25/5: o piso de 0,01
    // não age porque 1 − x já é menor que ele.
    const [vazia] = ok(criarGrade({ layout: '1-celula', caixa: { x: 0, y: 0, w: 8, h: 8 }, idDaGrade: 'g', idsDasCelulas: ['s'] }))
    const cheia = ok(preencherCelula(vazia, A))
    cheia.style = { ...cheia.style, crop: { x: 0.995, y: 0.995, width: 0.005, height: 0.005 } }
    const v = ok(refazerGrade([cheia], { caixa: { x: 0, y: 0, w: 10, h: 8 } }, DIM))
    const crop = v.celulas[0].style!.crop!
    expect(crop.x).toBeCloseTo(0.99375, 9)
    expect(crop.y).toBeCloseTo(0.995, 9)
    expect(crop.width).toBeCloseTo(0.00625, 9)
    expect(crop.height).toBeCloseTo(0.005, 9)
    const ef = resolveImageSourceRect({ width: 1000, height: 1000 }, v.celulas[0].size, v.celulas[0].style)!
    expect(ef.cropX).toBeCloseTo(993.75, 6)
    expect(ef.cropY).toBeCloseTo(995, 6)
    expect(ef.cropWidth).toBeCloseTo(6.25, 6)
    expect(ef.cropHeight).toBeCloseTo(5, 6)
  })

  it.each([
    ['só o raio', { raio: 4 }],
    ['só a posição', { caixa: { x: 10, y: 0, w: 1080, h: 1350 } }],
    ['espaçamento', { espacamento: 20 }],
  ])('recorte manual já fora da proporção da caixa, mudando %s: RECORTE_NAO_REPRESENTAVEL (regressão P2-1)', (_n, mudanca) => {
    const c = base()
    // 0,3 × 2000 = 600 px de largura para 1000 de altura numa caixa 535×1350: estica
    c[1].style = { ...c[1].style, crop: { x: 0.4, y: 0, width: 0.3, height: 1 } }
    expect(falha(refazerGrade(c, mudanca, DIM))).toContain('RECORTE_NAO_REPRESENTAVEL')
  })

  it('ids repetidos entre células: recusa antes de medir, sem saída parcial (regressão P2-2)', () => {
    const c = base()
    c[1].id = c[0].id
    expect(falha(refazerGrade(c, { espacamento: 20 }, DIM))).toContain('GRADE_INCOERENTE')
  })

  it('preencher célula de id reservado ou vazio: recusa (regressão P2-2)', () => {
    const [c0] = duasColunas()
    expect(falha(preencherCelula({ ...c0, id: 'bg-foto' }, A))).toContain('GRADE_INCOERENTE')
    expect(falha(preencherCelula({ ...c0, id: '' }, A))).toContain('GRADE_INCOERENTE')
  })

  it('grade girada: GRADE_GIRADA', () => {
    const c = base()
    c[0].rotation = 10
    expect(falha(refazerGrade(c, { espacamento: 20 }, DIM))).toContain('GRADE_GIRADA')
  })

  it('grade incoerente na entrada é recusada, não consertada', () => {
    const c = base()
    c[1].position = { x: 546, y: 0 }
    expect(falha(refazerGrade(c, { espacamento: 20 }, DIM))).toContain('GRADE_INCOERENTE')
  })

  it.each([
    ['espaçamento NaN', { espacamento: Number.NaN }, 'ENTRADA_INVALIDA'],
    ['raio Infinity', { raio: Number.POSITIVE_INFINITY }, 'ENTRADA_INVALIDA'],
    ['caixa NaN', { caixa: { x: 0, y: Number.NaN, w: 10, h: 10 } }, 'ENTRADA_INVALIDA'],
    ['chave desconhecida', { girar: 10 }, 'ENTRADA_INVALIDA'],
    ['layout desconhecido', { layout: 'mosaico' }, 'GRADE_DESCONHECIDA'],
    ['caixa pequena demais', { caixa: { x: 0, y: 0, w: 12, h: 12 } }, 'GRADE_PEQUENA_DEMAIS'],
  ])('%s: recusa', (_n, mudanca, codigo) => {
    expect(falha(refazerGrade(base(), mudanca as never, DIM))).toContain(codigo)
  })

  it('entrada que não é exatamente uma grade: recusa', () => {
    expect(falha(refazerGrade([], { espacamento: 20 }, DIM))).toContain('ENTRADA_INVALIDA')
    expect(falha(refazerGrade([...base(), ...doisPorDois(['', '', '', ''])], { espacamento: 20 }, DIM))).toContain('ENTRADA_INVALIDA')
    const texto = { id: 't', type: 'text', name: 'T', visible: true, locked: false, order: 9, position: { x: 0, y: 0 }, size: { width: 1, height: 1 } } as Layer
    expect(falha(refazerGrade([...base(), texto], { espacamento: 20 }, DIM))).toContain('ENTRADA_INVALIDA')
  })

  it('entrada congelada em profundidade funciona sem ser mutada (preencher, refazer, conferir)', () => {
    const congelar = <T,>(o: T): T => {
      if (o && typeof o === 'object') {
        for (const v of Object.values(o)) congelar(v)
        Object.freeze(o)
      }
      return o
    }
    const e = congelar(doisPorDois([A, '', B, C]))
    const copia = structuredClone(e)
    expect(conferirGrade(e)).toEqual([])
    expect(ok(preencherCelula(e[1], B)).fileUrl).toBe(B)
    const v = ok(refazerGrade(e, { layout: '2-colunas', espacamento: 30 }, DIM))
    expect(v.avulsas.map((c) => c.id)).toEqual(['d3'])
    expect(Object.isFrozen(v.celulas[0])).toBe(false)
    expect(e).toEqual(copia)
  })

  it('determinístico: a mesma entrada dá o mesmo resultado', () => {
    const e = doisPorDois([A, '', B, C])
    expect(refazerGrade(e, { layout: '2-colunas' }, DIM)).toEqual(refazerGrade(e, { layout: '2-colunas' }, DIM))
  })
})
