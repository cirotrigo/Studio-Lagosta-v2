/**
 * CP-X0 — guarda do push do desktop (contrato v3, 21/10/2026). O round-trip usa o NORMALIZADOR REAL do app desktop
 * (`normalizeForLocal` → `normalizeForWeb`), que só importa tipos: o que o desktop devolve de uma camada é o que ele
 * de fato devolve, não uma fixture otimista.
 */
import { describe, expect, it } from 'vitest'
import { normalizeForLocal, normalizeForWeb } from '../../../../desktop-app/electron/services/sync/template-normalizer'
import { RecusaDoPushDoDesktop, ehCamadaProtegida, idsDePaginaRepetidos, mesclarCamadasDoDesktop } from '../guarda-do-push-do-desktop'

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
