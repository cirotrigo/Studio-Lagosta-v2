/**
 * CP-X0 — guarda do push do desktop (contrato v3, 21/10/2026). O round-trip usa o NORMALIZADOR REAL do app desktop
 * (`normalizeForLocal` → `normalizeForWeb`), que só importa tipos: o que o desktop devolve de uma camada é o que ele
 * de fato devolve, não uma fixture otimista.
 */
import { describe, expect, it } from 'vitest'
import { normalizeForLocal, normalizeForWeb } from '../../../../desktop-app/electron/services/sync/template-normalizer'
import { RecusaDoPushDoDesktop, ehCamadaProtegida, exigirPaginaNovaSemGrade, idsDePaginaRepetidos, mesclarCamadasDoDesktop } from '../guarda-do-push-do-desktop'
import { conferirGrade } from '@/lib/grades/conferir'
import { BLOB, doisPorDois } from '@/lib/grades/__tests__/fixtures'

type Camada = Record<string, any>

const ETIQUETA = 'M0 0 H55 L100 45 L55 100 L0 55 Z M22 22 A8 8 0 1 0 22 38 A8 8 0 1 0 22 22 Z'
const vetor = (extra: Camada = {}): Camada => ({
  id: 'etq', type: 'shape', name: 'Etiqueta', visible: true, locked: false, order: 1,
  position: { x: 10, y: 20 }, size: { width: 300, height: 200 }, rotation: 15,
  style: { shapeType: 'svg-path', pathData: ETIQUETA, pathViewBox: [0, 0, 100, 100], pathFillRule: 'evenodd', fill: '#f97316', strokeColor: '#000000', strokeWidth: 12, flipH: true, manterProporcao: true },
  metadata: { compositor: { papel: 'acento' } },
  ...extra,
})
const fotoComMascara = (): Camada => ({
  id: 'foto', type: 'image', name: 'Foto', visible: true, locked: false, order: 0,
  position: { x: 0, y: 0 }, size: { width: 1080, height: 1080 }, fileUrl: 'https://exemplo.test/foto.jpg',
  style: { objectFit: 'cover', mask: { shapeId: 'heart', path: 'M50 92 L15 57 Z' } },
})
const texto = (id: string, extra: Camada = {}): Camada => ({
  id, type: 'text', name: id, visible: true, locked: false, order: 2, position: { x: 100, y: 300 }, size: { width: 800, height: 80 },
  content: 'Sexta é dia', style: { fontSize: 40, fontFamily: 'Montserrat', color: '#111111' }, metadata: { compositor: { papel: id } }, ...extra,
})
/** Texto sem compositor nem slot: a camada comum, que o desktop representa. */
const textoComum = (id: string, extra: Camada = {}): Camada => {
  const { metadata: _m, ...resto } = texto(id)
  return { ...resto, ...extra }
}

/** web → desktop (normalizador real) → edição no desktop → web (normalizador real). */
function idaEVolta(camadas: Camada[], editar: (local: Camada[]) => void = () => {}): Camada[] {
  const local = normalizeForLocal(
    { id: 77, name: 'Programação', type: 'STORY', updatedAt: '2026-10-21T12:00:00.000Z', designData: { canvas: { width: 1080, height: 1920 }, pages: [{ id: 'p1', name: 'Sexta', width: 1080, height: 1920, layers: camadas, background: '#ffffff', order: 0 }] } },
    8,
  )
  expect(local.success).toBe(true)
  editar(local.data.design.pages[0].layers as unknown as Camada[])
  const web = normalizeForWeb(local.data)
  expect(web.success).toBe(true)
  return web.data.designData.pages[0].layers as unknown as Camada[]
}
const mesclar = (base: Camada[], payload: unknown, casadaPorFallback = false): Camada[] =>
  JSON.parse(mesclarCamadasDoDesktop(JSON.stringify(base), payload, { paginaId: 'p1', casadaPorFallback }))
function recusa(fn: () => unknown): { codigo: string; camadaId?: string } {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(RecusaDoPushDoDesktop)
    const r = e as RecusaDoPushDoDesktop
    return { codigo: r.codigo, camadaId: r.camadaId }
  }
  throw new Error('esperava recusa')
}

describe('ehCamadaProtegida', () => {
  it('svg-path, pathData, máscara e vetor são protegidos; texto e forma comum não', () => {
    expect(ehCamadaProtegida(vetor())).toBe(true)
    expect(ehCamadaProtegida({ type: 'shape', style: { shapeType: 'rectangle', pathData: 'M0 0' } })).toBe(true)
    expect(ehCamadaProtegida(fotoComMascara())).toBe(true)
    expect(ehCamadaProtegida({ type: 'shape', style: { vetor: { asset: 'x' } } })).toBe(true)
    expect(ehCamadaProtegida(textoComum('t'))).toBe(false)
    expect(ehCamadaProtegida({ type: 'shape', style: { shapeType: 'rectangle' } })).toBe(false)
    expect(ehCamadaProtegida(null)).toBe(false)
  })
})

describe('U1/U2 — round-trip real do desktop não perde o que ele não representa', () => {
  it('U1 svg-path: path, viewBox, fillRule, flipH, trava e metadata.compositor preservados; o fill do desktop aplicado', () => {
    const base = [vetor()]
    const payload = idaEVolta(base, (local) => {
      local[0].fill = '#00ff00'
      local[0].x = 50
    })
    // o que o normalizador real devolve não traz o path (por isso a guarda existe)
    expect(payload[0].style.pathData).toBeUndefined()
    const [c] = mesclar(base, payload)
    expect(c.style).toMatchObject({ shapeType: 'svg-path', pathData: ETIQUETA, pathViewBox: [0, 0, 100, 100], pathFillRule: 'evenodd', flipH: true, manterProporcao: true, fill: '#00ff00' })
    expect(c.position.x).toBe(50)
    expect(c.metadata.compositor).toEqual({ papel: 'acento' })
  })

  it('U2 imagem com máscara: a máscara volta inteira', () => {
    const base = [fotoComMascara()]
    const [c] = mesclar(base, idaEVolta(base))
    expect(c.style.mask).toEqual({ shapeId: 'heart', path: 'M50 92 L15 57 Z' })
    expect(c.fileUrl).toBe('https://exemplo.test/foto.jpg')
  })
})

describe('U3/U4 — a identidade do vetor vem da base', () => {
  it('U3 null ou ausente no payload NÃO apaga a identidade', () => {
    const [c] = mesclar([vetor()], [{ id: 'etq', position: { x: 1, y: 2 }, style: { shapeType: null, pathData: null, pathViewBox: null, pathFillRule: null, mask: null, fill: '#123456' } }])
    expect(c.type).toBe('shape')
    expect(c.style).toMatchObject({ shapeType: 'svg-path', pathData: ETIQUETA, pathViewBox: [0, 0, 100, 100], pathFillRule: 'evenodd', fill: '#123456' })
    expect(c.position).toEqual({ x: 1, y: 2 })
  })

  it('U3b máscara com null no payload também fica', () => {
    const [c] = mesclar([fotoComMascara()], [{ id: 'foto', type: 'image', style: { mask: null } }])
    expect(c.style.mask).toEqual({ shapeId: 'heart', path: 'M50 92 L15 57 Z' })
  })

  it('U4 shapeType de fallback (rectangle) numa svg-path → PUSH_ALTERA_VETOR', () => {
    expect(recusa(() => mesclar([vetor()], [{ id: 'etq', type: 'shape', style: { shapeType: 'rectangle', fill: '#fff' } }]))).toEqual({ codigo: 'PUSH_ALTERA_VETOR', camadaId: 'etq' })
  })

  it('U4b type diferente numa camada protegida → PUSH_ALTERA_VETOR', () => {
    expect(recusa(() => mesclar([vetor()], [{ id: 'etq', type: 'image', style: {} }])).codigo).toBe('PUSH_ALTERA_VETOR')
    expect(recusa(() => mesclar([fotoComMascara()], [{ id: 'foto', type: 'shape', style: {} }])).codigo).toBe('PUSH_ALTERA_VETOR')
  })
})

describe('U5/U7 — camada da base ausente do payload', () => {
  it('U5 protegida ausente → PUSH_APAGARIA_CAMADA', () => {
    expect(recusa(() => mesclar([texto('headline'), vetor()], [texto('headline')]))).toEqual({ codigo: 'PUSH_APAGARIA_CAMADA', camadaId: 'etq' })
  })

  it('U5b payload com a camada sem id não neutraliza: recusa por ilegível (nunca vira camada nova)', () => {
    expect(recusa(() => mesclar([vetor()], [{ type: 'shape', style: { shapeType: 'svg-path' } }])).codigo).toBe('PUSH_CAMADAS_ILEGIVEIS')
  })

  it('U7 não protegida ausente sai, como hoje (limite R8)', () => {
    const r = mesclar([textoComum('headline'), textoComum('apoio')], [textoComum('headline')])
    expect(r.map((c) => c.id)).toEqual(['headline'])
  })
})

describe('U6 — camada comum: o desktop vence no que manda, o resto é preservado', () => {
  it('chave desconhecida de topo e de style preservadas, metadata mesclado, null explícito vence', () => {
    const base = [texto('headline', { textboxConfig: { autoWrap: { lineHeight: 1.1 } }, effects: { stroke: { enabled: true } }, style: { fontSize: 40, color: '#111111', letterSpacing: 2 } })]
    const [c] = mesclar(base, [{ id: 'headline', type: 'text', content: 'Domingo também', style: { fontSize: 42, color: null }, metadata: { role: 'titulo' } }])
    expect(c.content).toBe('Domingo também')
    expect(c.style).toEqual({ fontSize: 42, color: null, letterSpacing: 2 })
    expect(c.textboxConfig).toEqual({ autoWrap: { lineHeight: 1.1 } })
    expect(c.effects).toEqual({ stroke: { enabled: true } })
    expect(c.metadata).toEqual({ compositor: { papel: 'headline' }, role: 'titulo' })
  })

  it('round-trip real de texto preserva o que o desktop não leva (metadata.compositor, textboxConfig)', () => {
    const base = [texto('headline', { textboxConfig: { autoWrap: { lineHeight: 1.1 } } })]
    const [c] = mesclar(base, idaEVolta(base, (local) => { local[0].text = 'Novo' }))
    expect(c.content).toBe('Novo')
    expect(c.metadata.compositor).toEqual({ papel: 'headline' })
    expect(c.textboxConfig).toEqual({ autoWrap: { lineHeight: 1.1 } })
  })

  it('type diferente numa camada comum: vale o payload inteiro', () => {
    const [c] = mesclar([textoComum('x', { extra: 1 })], [{ id: 'x', type: 'image', fileUrl: 'u' }])
    expect(c).toEqual({ id: 'x', type: 'image', fileUrl: 'u' })
  })

  it('camada nova do desktop entra como veio, na ordem do payload', () => {
    const r = mesclar([texto('a')], [texto('b'), texto('a')])
    expect(r.map((c) => c.id)).toEqual(['b', 'a'])
  })
})

describe('U8/U9 — duplicidade e JSON ilegível não neutralizam a guarda', () => {
  it('U8 ids repetidos no payload → PUSH_CAMADAS_DUPLICADAS', () => {
    expect(recusa(() => mesclar([texto('a')], [texto('a'), texto('a')])).codigo).toBe('PUSH_CAMADAS_DUPLICADAS')
  })

  it('U8b ids repetidos na base de página protegida → PUSH_CAMADAS_DUPLICADAS; em página comum, não', () => {
    expect(recusa(() => mesclar([vetor(), vetor()], [vetor()])).codigo).toBe('PUSH_CAMADAS_DUPLICADAS')
    expect(mesclar([textoComum('a'), textoComum('a')], [textoComum('a')]).map((c) => c.id)).toEqual(['a'])
  })

  it('U9 payload ilegível → PUSH_CAMADAS_ILEGIVEIS (JSON quebrado, não-array, item não-objeto)', () => {
    for (const ruim of ['{quebrado', '{"a":1}', [1], [null], ['x']]) {
      expect(recusa(() => mesclarCamadasDoDesktop(JSON.stringify([texto('a')]), ruim, { paginaId: 'p1', casadaPorFallback: false })).codigo, JSON.stringify(ruim)).toBe('PUSH_CAMADAS_ILEGIVEIS')
    }
  })

  it('U9 id ausente/vazio/não-string e style/metadata não-objeto no payload → PUSH_CAMADAS_ILEGIVEIS', () => {
    const casos: unknown[] = [
      [{ type: 'text' }],
      [{ id: '', type: 'text' }],
      [{ id: 7, type: 'text' }],
      [{ id: 'a', type: 'text', style: [] }],
      [{ id: 'a', type: 'text', style: 'svg-path' }],
      [{ id: 'a', type: 'text', metadata: 3 }],
      [{ id: 'a', type: 'text', metadata: [] }],
      [[{ id: 'a' }]],
    ]
    for (const ruim of casos) {
      expect(recusa(() => mesclarCamadasDoDesktop(JSON.stringify([texto('a')]), ruim, { paginaId: 'p1', casadaPorFallback: false })).codigo, JSON.stringify(ruim)).toBe('PUSH_CAMADAS_ILEGIVEIS')
    }
  })

  it('U9b base ilegível → PUSH_BASE_ILEGIVEL (JSON quebrado, item sem id, style não-objeto)', () => {
    for (const base of ['{quebrado', '{"a":1}', JSON.stringify([{ type: 'shape', style: { shapeType: 'svg-path' } }]), JSON.stringify([{ id: 'etq', style: [] }]), JSON.stringify([null])]) {
      expect(recusa(() => mesclarCamadasDoDesktop(base, [texto('a')], { paginaId: 'p1', casadaPorFallback: false })).codigo, base).toBe('PUSH_BASE_ILEGIVEL')
    }
  })

  it('o payload pode vir como string JSON (o desktop manda array; a rota aceita os dois)', () => {
    expect(JSON.parse(mesclarCamadasDoDesktop(JSON.stringify([texto('a')]), JSON.stringify([texto('a')]), { paginaId: 'p1', casadaPorFallback: false })).map((c: Camada) => c.id)).toEqual(['a'])
  })
})

describe('U10 — casamento por ordem/nome', () => {
  it('página protegida casada por ordem/nome → PUSH_PAGINA_INCERTA', () => {
    expect(recusa(() => mesclar([vetor()], [vetor()], true)).codigo).toBe('PUSH_PAGINA_INCERTA')
  })

  it('página sem proteção casada por ordem/nome segue a mescla', () => {
    expect(mesclar([textoComum('a')], [textoComum('a', { content: 'B' })], true)[0].content).toBe('B')
  })
})

describe('U11 — camada protegida só por metadata.compositor ou metadata.slot', () => {
  const doCompositor = () => texto('headline')
  const doSlot = () => ({ ...texto('servico'), metadata: { slot: 'servico' } })

  it('é protegida', () => {
    expect(ehCamadaProtegida(doCompositor())).toBe(true)
    expect(ehCamadaProtegida(doSlot())).toBe(true)
    expect(ehCamadaProtegida({ ...texto('x'), metadata: {} })).toBe(false)
  })

  it('ausente do payload → PUSH_APAGARIA_CAMADA', () => {
    expect(recusa(() => mesclar([doCompositor()], [])).codigo).toBe('PUSH_APAGARIA_CAMADA')
    expect(recusa(() => mesclar([doSlot()], [])).codigo).toBe('PUSH_APAGARIA_CAMADA')
  })

  it('casada: compositor e slot ficam mesmo com null no payload', () => {
    const [a] = mesclar([doCompositor()], [{ id: 'headline', type: 'text', content: 'X', metadata: { compositor: null, role: 'r' } }])
    expect(a.metadata).toEqual({ compositor: { papel: 'headline' }, role: 'r' })
    const [b] = mesclar([doSlot()], [{ id: 'servico', type: 'text', metadata: { slot: null } }])
    expect(b.metadata.slot).toBe('servico')
  })

  it('type diferente → PUSH_ALTERA_VETOR (a identidade inclui o type)', () => {
    expect(recusa(() => mesclar([doCompositor()], [{ id: 'headline', type: 'image' }])).codigo).toBe('PUSH_ALTERA_VETOR')
  })
})

describe('U12 — shape de topo coerente com style.shapeType', () => {
  it('shape de topo diferente numa svg-path → PUSH_ALTERA_VETOR', () => {
    expect(recusa(() => mesclar([vetor()], [{ id: 'etq', type: 'shape', shape: 'rectangle', style: {} }])).codigo).toBe('PUSH_ALTERA_VETOR')
  })

  it('shape de topo igual é aceito, sem criar chave que a base não tinha', () => {
    const [c] = mesclar([vetor()], [{ id: 'etq', type: 'shape', shape: 'svg-path', style: { shapeType: 'svg-path' } }])
    expect('shape' in c).toBe(false)
    expect(c.style.shapeType).toBe('svg-path')
  })

  it('base com shape de topo: ele fica, mesmo com o payload sem ele', () => {
    const [c] = mesclar([vetor({ shape: 'svg-path' })], [{ id: 'etq', type: 'shape', style: { fill: '#000' } }])
    expect(c.shape).toBe('svg-path')
  })
})

describe('idsDePaginaRepetidos (R4)', () => {
  it('acha ids repetidos e ignora páginas sem id', () => {
    expect(idsDePaginaRepetidos([{ id: 'p1' }, { id: 'p2' }, { id: 'p1' }, {}, { id: undefined }])).toEqual(['p1'])
    expect(idsDePaginaRepetidos([{ id: 'p1' }, { id: 'p2' }])).toEqual([])
  })
})

/**
 * G4.1 (27/10/2026) — grade de fotos no push do desktop. O desktop não conhece grade: o round-trip REAL devolve só
 * posição/tamanho/src/fit/opacidade da célula e perde `style.crop`, `border` e `metadata`. A mescla preserva o que
 * falta, mas aceitava geometria, URL e estilo do payload; a guarda confere o RESULTADO mesclado de todos os membros.
 */
describe('G4.1 — grade de fotos: o resultado mesclado de cada membro não muda', () => {
  const A = `${BLOB}/fotos/a.jpg`
  const B = `${BLOB}/fotos/b.jpg`
  const C = `${BLOB}/fotos/c.jpg`
  /** 2×2 do Feed com recorte manual na d1, raio 24 e a d2 vazia; mais um texto comum e uma foto avulsa */
  const comGrade = (): Camada[] => {
    const celulas = doisPorDois([A, B, '', C]).map((c) => ({ ...c, style: { ...c.style, border: { radius: 24 } }, metadata: { ...c.metadata, grade: { ...(c.metadata as any).grade, raio: 24 } } })) as Camada[]
    celulas[1].style.crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 }
    return [textoComum('headline'), ...celulas, { id: 'avulsa', type: 'image', name: 'Avulsa', visible: true, locked: false, order: 9, position: { x: 10, y: 10 }, size: { width: 200, height: 100 }, fileUrl: A, style: { objectFit: 'cover' } }]
  }
  const idx = (camadas: Camada[], id: string) => camadas.findIndex((c) => c.id === id)

  it('round-trip real sem mexer na grade (texto e foto avulsa editados): passa e cada membro sai IGUAL à base', () => {
    const base = comGrade()
    expect(conferirGrade(base as any)).toEqual([])
    const r = mesclar(base, idaEVolta(base, (local) => {
      local[idx(local, 'headline')].text = 'Domingo também'
      local[idx(local, 'avulsa')].x = 40
    }))
    for (const id of ['d0', 'd1', 'd2', 'd3']) {
      const c = r.find((x) => x.id === id)!
      const b = base.find((x) => x.id === id)!
      expect([c.position, c.size, c.fileUrl ?? '', c.style, c.metadata], id).toEqual([b.position, b.size, b.fileUrl ?? '', b.style, b.metadata])
    }
    expect(r.find((x) => x.id === 'd1')!.style.crop).toEqual({ x: 0.1, y: 0.2, width: 0.5, height: 0.6 })
    expect(r.find((x) => x.id === 'headline')!.content).toBe('Domingo também')
    expect(r.find((x) => x.id === 'avulsa')!.position.x).toBe(40)
    expect(conferirGrade(r as any)).toEqual([])
  })

  it.each([
    ['célula movida 10 px', (l: Camada[]) => { l[idx(l, 'd1')].x += 10 }, 'd1'],
    ['célula redimensionada 10 px', (l: Camada[]) => { l[idx(l, 'd3')].width -= 10 }, 'd3'],
    ['foto trocada', (l: Camada[]) => { l[idx(l, 'd0')].src = C }, 'd0'],
    ['célula vazia recebe foto', (l: Camada[]) => { l[idx(l, 'd2')].src = A }, 'd2'],
    ['célula girada', (l: Camada[]) => { l[idx(l, 'd0')].rotation = 5 }, 'd0'],
    ['opacidade da célula', (l: Camada[]) => { l[idx(l, 'd0')].opacity = 0.5 }, 'd0'],
    ['ajuste de foto (fit contain)', (l: Camada[]) => { l[idx(l, 'd1')].fit = 'contain' }, 'd1'],
    ['recorte do desktop (crop de topo)', (l: Camada[]) => { l[idx(l, 'd1')].crop = { x: 0, y: 0, width: 10, height: 10 } }, 'd1'],
    ['célula escondida', (l: Camada[]) => { l[idx(l, 'd3')].visible = false }, 'd3'],
  ])('round-trip real com %s → PUSH_ALTERA_GRADE na célula', (_nome, editar, camadaId) => {
    const base = comGrade()
    expect(recusa(() => mesclar(base, idaEVolta(base, editar)))).toEqual({ codigo: 'PUSH_ALTERA_GRADE', camadaId })
  })

  it('round-trip real com a célula apagada no desktop → PUSH_ALTERA_GRADE (a célula não é camada comum que some)', () => {
    const base = comGrade()
    expect(recusa(() => mesclar(base, idaEVolta(base, (l) => { l.splice(idx(l, 'd2'), 1) })))).toEqual({ codigo: 'PUSH_ALTERA_GRADE', camadaId: 'd2' })
  })

  it('payload forjado: recorte, cantos, metadata da grade e groupId mudados ou retirados → recusa', () => {
    const base = comGrade()
    const com = (id: string, extra: Camada) => base.map((c) => (c.id === id ? { ...c, ...extra } : c))
    expect(recusa(() => mesclar(base, com('d1', { style: { crop: { x: 0, y: 0, width: 1, height: 1 } } }))).camadaId).toBe('d1')
    expect(recusa(() => mesclar(base, com('d0', { style: { border: { radius: 0 } } }))).camadaId).toBe('d0')
    expect(recusa(() => mesclar(base, com('d0', { metadata: { grade: null } }))).camadaId).toBe('d0')
    expect(recusa(() => mesclar(base, com('d3', { metadata: { groupId: 'outro' } }))).camadaId).toBe('d3')
    expect(recusa(() => mesclar(base, com('d0', { style: { mask: { shapeId: 'heart', path: 'M0 0 Z' } } }))).codigo).toBe('PUSH_ALTERA_GRADE')
  })

  it('camada de fora entrando na grade (groupId da grade) ou camada nova com metadata.grade → recusa', () => {
    const base = comGrade()
    const entra = base.map((c) => (c.id === 'avulsa' ? { ...c, metadata: { groupId: 'g2' } } : c))
    expect(recusa(() => mesclar(base, entra))).toEqual({ codigo: 'PUSH_ALTERA_GRADE', camadaId: 'avulsa' })
    const nova = [...base, { ...base[1], id: 'intrusa' }]
    expect(recusa(() => mesclar(base, nova))).toEqual({ codigo: 'PUSH_ALTERA_GRADE', camadaId: 'intrusa' })
  })

  it('grade já quebrada na base e intocada pelo push: passa (a guarda não piora nem conserta); mexida, recusa', () => {
    const quebrada = comGrade().map((c) => (c.id === 'd0' ? { ...c, position: { x: 3, y: 0 } } : c))
    expect(conferirGrade(quebrada as any).length).toBeGreaterThan(0)
    const ok = mesclar(quebrada, idaEVolta(quebrada, (l) => { l[idx(l, 'headline')].text = 'X' }))
    expect(ok.find((c) => c.id === 'd0')!.position).toEqual({ x: 3, y: 0 })
    expect(recusa(() => mesclar(quebrada, idaEVolta(quebrada, (l) => { l[idx(l, 'd0')].x = 0 }))).camadaId).toBe('d0')
  })

  it('página nova (sem base) do desktop: sem grade passa; com metadata de grade, recusa', () => {
    expect(() => exigirPaginaNovaSemGrade(JSON.stringify([textoComum('a')]), 'nova')).not.toThrow()
    try {
      exigirPaginaNovaSemGrade(JSON.stringify(comGrade()), 'nova')
      throw new Error('esperava recusa')
    } catch (e) {
      expect(e).toBeInstanceOf(RecusaDoPushDoDesktop)
      expect((e as RecusaDoPushDoDesktop).codigo).toBe('PUSH_ALTERA_GRADE')
    }
  })
})

/**
 * G4.1 · rodada 1 do Codex (27/10): o RenderEngine desenha também o que fica na RAIZ da camada (`effects.shadow`,
 * `movimento`…). Comparação conservadora: o membro inteiro, menos a lista explícita do que o normalizador do desktop
 * renormaliza sem mudar o desenho (nome, `order`, `fit` de topo; `visible`/`locked` como booleanos).
 */
describe('G4.1 rodada 1 — campos de raiz da célula também não mudam pelo push', () => {
  const BLOB_R1 = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com'
  const sombra = { enabled: true, shadowColor: '#000000', shadowBlur: 30, shadowOffsetX: 0, shadowOffsetY: 12, shadowOpacity: 0.6 }
  const base = () => [textoComum('headline'), ...(doisPorDois([`${BLOB_R1}/a.jpg`, `${BLOB_R1}/b.jpg`, '', `${BLOB_R1}/c.jpg`]) as Camada[])]
  const com = (camadas: Camada[], id: string, extra: Camada) => camadas.map((c) => (c.id === id ? { ...c, ...extra } : c))

  it.each([
    ['sombra nova (effects.shadow)', { effects: { shadow: sombra } }],
    ['desfoque novo (effects.blur)', { effects: { blur: { enabled: true, blurRadius: 12 } } }],
    ['movimento novo (foto animada)', { movimento: { tipo: 'aproximar', duracao: 5 } }],
    ['camada travada', { locked: true }],
  ])('payload com %s numa célula → PUSH_ALTERA_GRADE', (_nome, extra) => {
    const b = base()
    expect(recusa(() => mesclar(b, com(b, 'd1', extra as Camada)))).toEqual({ codigo: 'PUSH_ALTERA_GRADE', camadaId: 'd1' })
  })

  it('célula que JÁ tem sombra e movimento: o round-trip real (que não os leva) passa e eles ficam', () => {
    const b = com(base(), 'd0', { effects: { shadow: sombra }, movimento: { tipo: 'aproximar', duracao: 5 } })
    const r = mesclar(b, idaEVolta(b, (l) => { l[0].text = 'Outro' }))
    expect(r.find((c) => c.id === 'd0')).toMatchObject({ effects: { shadow: sombra }, movimento: { tipo: 'aproximar', duracao: 5 } })
  })

  it('a mesma sombra num texto comum (fora da grade) passa, como antes', () => {
    const b = base()
    expect(mesclar(b, com(b, 'headline', { effects: { shadow: sombra } })).find((c) => c.id === 'headline')!.effects).toEqual({ shadow: sombra })
  })
})
