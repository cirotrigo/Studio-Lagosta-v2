/**
 * G1 · inserir grade no design (puro). As caixas esperadas são escritas à mão (comentários), e o enquadramento
 * convertido é conferido pela FÓRMULA de escala/centro, não pelo caminho do código.
 * Feed 1080×1350, 2x2, g=10: colunas [0,535]·[545,1080]; linhas [0,670]·[680,1350].
 * Story 1080×1920, 2x2, g=10: colunas iguais; linhas [0,955]·[965,1920].
 */
import { describe, expect, it } from 'vitest'
import type { DesignData, Layer } from '@/types/template'
import { resolveImageSourceRect } from '@/lib/image-fit'
import { COBERTURA_MINIMA_DA_FOTO } from '@/lib/compositor/arquetipos/da-pagina'
import { conferirGrade } from '../conferir'
import { COBERTURA_MINIMA_DO_FUNDO, fundoParaMedir, inserirGradeNoDesign, type MedidaDoFundo } from '../insercao'
import { BLOB } from './fixtures'

const FOTO = `${BLOB}/fotos/fundo.jpg`
const NAT = { width: 2672, height: 4000 }
const FEED = { width: 1080, height: 1350 }
const STORY = { width: 1080, height: 1920 }

function camada(id: string, type: Layer['type'], extra: Partial<Layer> = {}): Layer {
  return { id, type, name: id, visible: true, locked: false, order: 0, position: { x: 100, y: 100 }, size: { width: 200, height: 80 }, ...extra } as Layer
}
const fundo = (canvas: { width: number; height: number }, extra: Partial<Layer> = {}): Layer =>
  camada('bg-foto', 'image', {
    name: 'Foto de fundo',
    isDynamic: true,
    position: { x: 0, y: 0 },
    size: { width: canvas.width, height: canvas.height },
    rotation: 0,
    fileUrl: FOTO,
    style: { objectFit: 'cover', cropPosition: 'center-middle' },
    ...extra,
  })
const texto = camada('titulo', 'text', { content: 'Oi' })
const logo = camada('logo', 'logo')
const forma = camada('selo', 'shape')
const gradiente = camada('grad', 'gradient', { position: { x: 0, y: 0 }, size: { width: 1080, height: 1350 } })

function design(canvas: { width: number; height: number }, layers: Layer[], audio?: DesignData['audio']): DesignData {
  return { canvas: { ...canvas, backgroundColor: '#ffffff' }, layers: layers.map((l, i) => ({ ...l, order: i })), ...(audio !== undefined ? { audio } : {}) } as DesignData
}
const pedido = (layout: string, n: number) => ({ layout, idDaGrade: 'grade-nova', idsDasCelulas: Array.from({ length: n }, (_, i) => `cel-${i}`) })
/** A medida que o editor faria: o candidato que `fundoParaMedir` aponta + a dimensão conferida pela URL */
function medir(d: DesignData, natural: MedidaDoFundo['natural'] | null = NAT): MedidaDoFundo | null {
  const f = fundoParaMedir(d)
  return f ? { camadaId: f.camadaId, impressao: f.impressao, natural: natural ?? undefined } : null
}
const ok = <T extends { ok: boolean }>(r: T) => {
  expect(r.ok, JSON.stringify(r)).toBe(true)
  return r as Extract<T, { ok: true }>
}
const ids = (layers: Layer[]) => layers.map((l) => l.id)
const caixa = (l: Layer) => [l.position.x, l.position.y, l.size.width, l.size.height]

describe('G1 · inserir grade sem fundo para converter', () => {
  it('Feed: 4 células vazias na página inteira, na BASE (abaixo de texto, logo e forma), antigas na mesma ordem', () => {
    const d = design(FEED, [texto, logo, forma])
    const r = ok(inserirGradeNoDesign(d, pedido('2x2', 4), null))
    expect(ids(r.layers)).toEqual(['cel-0', 'cel-1', 'cel-2', 'cel-3', 'titulo', 'logo', 'selo'])
    expect(r.layers.slice(0, 4).map(caixa)).toEqual([[0, 0, 535, 670], [545, 0, 535, 670], [0, 680, 535, 670], [545, 680, 535, 670]])
    expect(r.celulas).toEqual(['cel-0', 'cel-1', 'cel-2', 'cel-3'])
    expect(r.convertida).toBeUndefined()
    expect(r.aviso).toBeUndefined()
    expect(conferirGrade(r.layers)).toEqual([])
    // as antigas saem como entraram (mesmos objetos)
    expect(r.layers.slice(4)).toEqual(d.layers)
  })

  it('Story: caixas da página 1080×1920', () => {
    const r = ok(inserirGradeNoDesign(design(STORY, [texto]), pedido('2x2', 4), null))
    expect(r.layers.slice(0, 4).map(caixa)).toEqual([[0, 0, 535, 955], [545, 0, 535, 955], [0, 965, 535, 955], [545, 965, 535, 955]])
  })

  it('célula é imagem comum: nome, cover, rotação 0, sem clipe, sem máscara, sem border.width, ids nunca reservados', () => {
    const r = ok(inserirGradeNoDesign(design(FEED, []), pedido('2-1-2', 5), null))
    for (const [i, c] of r.layers.entries()) {
      expect(c.type).toBe('image')
      expect(c.name).toBe(`Grade · foto ${i + 1}`)
      expect(c.rotation).toBe(0)
      expect(c.fileUrl).toBe('')
      expect(c.style?.objectFit).toBe('cover')
      expect(c.style?.mask).toBeUndefined()
      expect((c.style?.border as { width?: number }).width).toBeUndefined()
      expect((c as { clipe?: unknown }).clipe).toBeUndefined()
      expect(c.metadata?.groupId).toBe('grade-nova')
      expect(['bg-foto', 'bg-img']).not.toContain(c.id)
    }
  })

  it('não muta o design de entrada', () => {
    const d = design(FEED, [fundo(FEED), texto])
    const antes = JSON.stringify(d)
    inserirGradeNoDesign(d, pedido('2x2', 4), medir(d))
    expect(JSON.stringify(d)).toBe(antes)
  })

  it('a régua de cobertura é a mesma da aba Layouts', () => {
    expect(COBERTURA_MINIMA_DO_FUNDO).toBe(COBERTURA_MINIMA_DA_FOTO)
  })
})

describe('G1 · fundo → célula 1 (conversão atômica)', () => {
  for (const [nome, canvas, c0] of [
    ['Feed', FEED, { width: 535, height: 670 }],
    ['Story', STORY, { width: 535, height: 955 }],
  ] as const) {
    it(`${nome}: o bg-foto sai e a célula 1 entra NO LUGAR dele, com a foto e o mesmo centro/escala`, () => {
      const d = design(canvas, [fundo(canvas), gradiente, texto, logo])
      const r = ok(inserirGradeNoDesign(d, pedido('2x2', 4), medir(d)))
      expect(r.convertida).toBe('bg-foto')
      expect(ids(r.layers)).toEqual(['cel-0', 'cel-1', 'cel-2', 'cel-3', 'grad', 'titulo', 'logo'])
      expect(r.aviso).toBeUndefined()
      expect(conferirGrade(r.layers)).toEqual([])

      const cel = r.layers[0]
      expect(cel.fileUrl).toBe(FOTO)
      expect(r.layers.slice(1, 4).every((c) => c.fileUrl === '')).toBe(true)
      // nada da identidade do fundo
      expect(cel.id).toBe('cel-0')
      expect(cel.isDynamic).toBeUndefined()
      expect(Object.keys(cel.metadata ?? {}).sort()).toEqual(['grade', 'groupId'])
      expect(cel.style?.mask).toBeUndefined()

      // enquadramento: o fundo cover usa a MAIOR escala dos dois eixos (Feed: 1080/2672, limitado pela largura;
      // Story: 1920/4000, pela altura) e o centro da foto (1336, 2000); a célula, a MESMA escala e o MESMO centro
      const escala = Math.max(canvas.width / NAT.width, canvas.height / NAT.height)
      const fonte = resolveImageSourceRect(NAT, c0, cel.style)!
      expect(fonte.cropWidth).toBeCloseTo(c0.width / escala, 6)
      expect(fonte.cropHeight).toBeCloseTo(c0.height / escala, 6)
      expect(fonte.cropX + fonte.cropWidth / 2).toBeCloseTo(1336, 6)
      expect(fonte.cropY + fonte.cropHeight / 2).toBeCloseTo(2000, 6)
    })
  }

  it.each([
    ['logo', logo],
    ['elemento (forma)', forma],
  ])('fundo ACIMA do texto ([texto, fundo, %s]): converte e o bloco vai para baixo do texto, nunca no índice antigo', (_n, protegida) => {
    const d = design(FEED, [texto, fundo(FEED), protegida])
    const r = ok(inserirGradeNoDesign(d, pedido('2-colunas', 2), medir(d)))
    expect(r.convertida).toBe('bg-foto')
    expect(ids(r.layers)).toEqual(['cel-0', 'cel-1', 'titulo', protegida.id])
  })

  it('camada OCULTA também fica acima do bloco (ao reaparecer, não está atrás da grade): forma oculta', () => {
    const oculta = camada('oculta', 'shape', { visible: false })
    const d = design(FEED, [oculta, fundo(FEED), texto])
    expect(ids(ok(inserirGradeNoDesign(d, pedido('2-colunas', 2), medir(d))).layers)).toEqual(['cel-0', 'cel-1', 'oculta', 'titulo'])
  })

  it('[título oculto, bg-foto, logo]: o bloco vai para baixo do título oculto', () => {
    const d = design(FEED, [{ ...texto, visible: false }, fundo(FEED), logo])
    const r = ok(inserirGradeNoDesign(d, pedido('2-colunas', 2), medir(d)))
    expect(r.convertida).toBe('bg-foto')
    expect(ids(r.layers)).toEqual(['cel-0', 'cel-1', 'titulo', 'logo'])
  })

  it('sem conversão, título oculto abaixo do fundo também fica acima do bloco', () => {
    const d = design(FEED, [{ ...texto, visible: false }, fundo(FEED, { locked: true }), logo])
    const r = ok(inserirGradeNoDesign(d, pedido('2-colunas', 2), null))
    expect(r.aviso?.motivo).toBe('TRAVADO')
    expect(ids(r.layers)).toEqual(['cel-0', 'cel-1', 'titulo', 'bg-foto', 'logo'])
  })

  it('leva os ajustes visuais da foto (opacidade, espelho, filtros) e nada da borda neutra', () => {
    const d = design(FEED, [fundo(FEED, { style: { objectFit: 'cover', opacity: 0.8, flipH: true, contrast: 12, border: { width: 0, color: '#000', radius: 0 } } }), texto])
    const cel = ok(inserirGradeNoDesign(d, pedido('2-colunas', 2), medir(d))).layers[0]
    expect(cel.style).toMatchObject({ opacity: 0.8, flipH: true, contrast: 12, objectFit: 'cover', border: { radius: 0 } })
    expect((cel.style?.border as { width?: number }).width).toBeUndefined()
  })

  it('imagem comum (não bg-foto) que cobre ≥ 90% também converte; sem cover, só se a foto não estiver esticada', () => {
    const naturalIgual = { width: 2160, height: 2700 } // mesma proporção da página: desenho sem esticar
    const d = design(FEED, [camada('foto', 'image', { position: { x: 0, y: 0 }, size: { width: 1080, height: 1350 }, fileUrl: FOTO, style: {} }), texto])
    const r = ok(inserirGradeNoDesign(d, pedido('1-celula', 1), medir(d, naturalIgual)))
    expect(r.convertida).toBe('foto')
    expect(resolveImageSourceRect(naturalIgual, { width: 1080, height: 1350 }, r.layers[0].style)).toMatchObject({ cropX: 0, cropY: 0, cropWidth: 2160, cropHeight: 2700 })
  })

  it('foto já ESTICADA (sem cover, proporção diferente) não é normalizada: fica intacta, grade vazia acima e aviso', () => {
    const d = design(FEED, [fundo(FEED, { style: {} }), texto])
    const r = ok(inserirGradeNoDesign(d, pedido('2x2', 4), medir(d)))
    expect(r.convertida).toBeUndefined()
    expect(r.aviso?.motivo).toBe('RECORTE')
    expect(ids(r.layers)).toEqual(['bg-foto', 'cel-0', 'cel-1', 'cel-2', 'cel-3', 'titulo'])
    expect(r.layers[0]).toEqual(d.layers[0])
    expect(r.layers.slice(1, 5).every((c) => c.fileUrl === '')).toBe(true)
  })

  it('sem medida conferida (URL não confere ou falhou): fundo intacto + grade vazia + aviso SEM_MEDIDA', () => {
    const d = design(FEED, [fundo(FEED), texto])
    const r = ok(inserirGradeNoDesign(d, pedido('2x2', 4), medir(d, null)))
    expect(r.aviso?.motivo).toBe('SEM_MEDIDA')
    expect(ids(r.layers)).toEqual(['bg-foto', 'cel-0', 'cel-1', 'cel-2', 'cel-3', 'titulo'])
    expect(r.layers[0]).toEqual(d.layers[0])
  })
})

describe('G1 · fundo que fica como está (com aviso)', () => {
  const casos: Array<[string, Layer[], string]> = [
    ['ambíguo: duas imagens cobrindo a página', [fundo(FEED), camada('textura', 'image', { position: { x: 0, y: 0 }, size: { width: 1080, height: 1350 }, fileUrl: FOTO, style: { objectFit: 'cover' } }), texto], 'AMBIGUO'],
    ['máscara', [fundo(FEED, { style: { objectFit: 'cover', mask: { shapeId: 'quadrado-1-1', path: 'M0 0 L100 0 L100 100 L0 100 Z' } } }), texto], 'MASCARA'],
    ['elemento da Marca (image, nome "Elemento - …", sem metadata)', [camada('el', 'image', { name: 'Elemento - Selo', position: { x: 0, y: 0 }, size: { width: 1080, height: 1350 }, fileUrl: FOTO, style: { objectFit: 'cover' } }), texto], 'ESPECIAL'],
    ['nome de logo', [fundo(FEED, { name: 'Logo branco' }), texto], 'ESPECIAL'],
    ['nome de sombra', [fundo(FEED, { name: 'Sombra do rodapé' }), texto], 'ESPECIAL'],
    ['logoId', [fundo(FEED, { logoId: 3 }), texto], 'ESPECIAL'],
    ['elementId', [fundo(FEED, { elementId: 7 }), texto], 'ESPECIAL'],
    ['metadata de preset', [fundo(FEED, { metadata: { presetId: 'p1' } }), texto], 'ESPECIAL'],
    ['papel semântico (metadata.compositor)', [fundo(FEED, { metadata: { compositor: { papel: 'logo' } } }), texto], 'ESPECIAL'],
    ['slot B1', [fundo(FEED, { metadata: { slot: { id: 'foto' } } }), texto], 'ESPECIAL'],
    ['proveniência de asset (style.vetor)', [fundo(FEED, { style: { objectFit: 'cover', vetor: { asset: { id: 'x', versao: 1 }, papeis: {} } } }), texto], 'ESPECIAL'],
    ['clipe da linha do tempo', [fundo(FEED, { clipe: { duracao: 3 } } as Partial<Layer>), texto], 'ESPECIAL'],
    // foto única com movimento e sem música não é página-vídeo: converter perderia o movimento
    ['movimento da foto', [fundo(FEED, { movimento: 'aproximar' }), texto], 'ESPECIAL'],
    ['quadro de movimento anotado na raiz (transitório)', [fundo(FEED, { __quadroDoMovimento: { escala: 1.1 } } as Partial<Layer>), texto], 'ESPECIAL'],
    ['célula de outra grade', [fundo(FEED, { id: 'cx', metadata: { grade: { id: 'g0' }, groupId: 'g0' } }), texto], 'ESPECIAL'],
    ['girada', [fundo(FEED, { rotation: 3 }), texto], 'GIRADO'],
    ['travada', [fundo(FEED, { locked: true }), texto], 'TRAVADO'],
    ['borda visível', [fundo(FEED, { style: { objectFit: 'cover', border: { width: 4, color: '#fff', radius: 0 } } }), texto], 'ESTILO'],
    ['cantos arredondados', [fundo(FEED, { style: { objectFit: 'cover', border: { width: 0, color: '#fff', radius: 24 } } }), texto], 'ESTILO'],
    ['sombra', [fundo(FEED, { style: { objectFit: 'cover', shadow: { offsetX: 0, offsetY: 4, blur: 8, color: '#000' } } }), texto], 'ESTILO'],
    ['efeito ligado', [fundo(FEED, { effects: { blur: { enabled: true, blurRadius: 4 } } }), texto], 'ESTILO'],
    ['estilo desconhecido', [fundo(FEED, { style: { objectFit: 'cover', fontSize: 40 } }), texto], 'ESTILO'],
    ['URL fora do Blob próprio (lh3)', [fundo(FEED, { fileUrl: 'https://lh3.googleusercontent.com/abc' }), texto], 'URL'],
    ['URL data:', [fundo(FEED, { fileUrl: 'data:image/png;base64,AAAA' }), texto], 'URL'],
    ['bg-foto que não cobre a página (foto em caixa)', [fundo(FEED, { size: { width: 1080, height: 700 } }), texto], 'NAO_COBRE'],
  ]
  for (const [nome, layers, motivo] of casos) {
    it(`${nome} ⇒ ${motivo}: nada medido, original intacto, grade vazia acima dele e abaixo do texto`, () => {
      const d = design(FEED, layers)
      expect(fundoParaMedir(d)).toBeNull()
      const r = ok(inserirGradeNoDesign(d, pedido('2x2', 4), null))
      expect(r.convertida).toBeUndefined()
      expect(r.aviso?.motivo).toBe(motivo)
      expect(r.aviso?.mensagem).toMatch(/\S/)
      const antigas = r.layers.filter((l) => !r.celulas.includes(l.id))
      expect(antigas).toEqual(d.layers)
      expect(r.layers.slice(-1)[0].id).toBe('titulo')
      expect(r.layers.every((l) => !r.celulas.includes(l.id) || l.fileUrl === '')).toBe(true)
    })
  }

  it('moldura que cobre a página ACIMA do texto: ambígua, fica acima; a grade entra entre o fundo e o texto', () => {
    const moldura = camada('moldura', 'image', { position: { x: 0, y: 0 }, size: { width: 1080, height: 1350 }, fileUrl: FOTO, style: { objectFit: 'cover' } })
    const r = ok(inserirGradeNoDesign(design(FEED, [fundo(FEED), texto, moldura]), pedido('2-colunas', 2), null))
    expect(ids(r.layers)).toEqual(['bg-foto', 'cel-0', 'cel-1', 'titulo', 'moldura'])
    expect(r.aviso?.motivo).toBe('AMBIGUO')
  })

  it('imagem oculta que cobre a página não é fundo: não conta para ambiguidade nem converte', () => {
    const oculta = camada('oculta', 'image', { visible: false, position: { x: 0, y: 0 }, size: { width: 1080, height: 1350 }, fileUrl: FOTO, style: { objectFit: 'cover' } })
    const d = design(FEED, [oculta, fundo(FEED), texto])
    expect(fundoParaMedir(d)?.camadaId).toBe('bg-foto')
  })
})

describe('G1 · recusas sem mudar nada', () => {
  it.each([
    ['vídeo visível', [camada('v', 'video', { fileUrl: `${BLOB}/v.mp4` }), texto], undefined],
    ['sequência de 2 clipes de foto', [fundo(FEED, { id: 'a', clipe: { duracao: 3 } } as Partial<Layer>), fundo(FEED, { id: 'b', clipe: { duracao: 3 } } as Partial<Layer>)], undefined],
    ['música', [fundo(FEED), texto], { source: 'library', musicId: 9, startTime: 0, endTime: 12 }],
  ] as const)('página de vídeo (%s) ⇒ PAGINA_DE_VIDEO, nada medido', (_n, layers, audio) => {
    const d = design(FEED, layers as unknown as Layer[], audio as DesignData['audio'])
    expect(fundoParaMedir(d)).toBeNull()
    const r = inserirGradeNoDesign(d, pedido('2x2', 4), null)
    expect(r).toMatchObject({ ok: false, codigo: 'PAGINA_DE_VIDEO' })
  })

  it('layout fora do catálogo ⇒ GRADE_DESCONHECIDA', () => {
    expect(inserirGradeNoDesign(design(FEED, []), pedido('9x9', 81), null)).toMatchObject({ ok: false, codigo: 'GRADE_DESCONHECIDA' })
  })

  it.each([
    ['id de camada existente', { idsDasCelulas: ['titulo', 'x1', 'x2', 'x3'] }],
    ['groupId existente como id da grade', { idDaGrade: 'grupo-1' }],
    ['id de grade existente', { idDaGrade: 'g-velha' }],
    ['id reservado', { idsDasCelulas: ['bg-foto', 'x1', 'x2', 'x3'] }],
    ['ids repetidos', { idsDasCelulas: ['x', 'x', 'y', 'z'] }],
    ['faltando id', { idsDasCelulas: ['x', 'y'] }],
  ])('ids conferidos contra a página: %s ⇒ IDS_INVALIDOS', (_n, troca) => {
    const agrupado = camada('agrupado', 'text', { metadata: { groupId: 'grupo-1' } })
    const velha = camada('cv', 'image', { metadata: { grade: { id: 'g-velha' }, groupId: 'g-velha' } })
    const r = inserirGradeNoDesign(design(FEED, [texto, agrupado, velha]), { ...pedido('2x2', 4), ...troca }, null)
    expect(r).toMatchObject({ ok: false, codigo: 'IDS_INVALIDOS' })
  })

  it('página pequena demais para o layout ⇒ GRADE_PEQUENA_DEMAIS', () => {
    expect(inserirGradeNoDesign(design({ width: 20, height: 20 }, []), pedido('2x3', 6), null)).toMatchObject({ ok: false, codigo: 'GRADE_PEQUENA_DEMAIS' })
  })
})

describe('G1 · medida atrasada só vale para o MESMO fundo', () => {
  const base = () => design(FEED, [fundo(FEED), texto])

  it('fundo com recorte alterado depois da medida ⇒ ALVO_MUDOU', () => {
    const d = base()
    const m = medir(d)
    const depois = { ...d, layers: d.layers.map((l) => (l.id === 'bg-foto' ? { ...l, style: { ...l.style, crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } } } : l)) }
    expect(inserirGradeNoDesign(depois, pedido('2x2', 4), m)).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
  })

  it('fundo trocado de foto ⇒ ALVO_MUDOU', () => {
    const d = base()
    const m = medir(d)
    const depois = { ...d, layers: d.layers.map((l) => (l.id === 'bg-foto' ? { ...l, fileUrl: `${BLOB}/fotos/outra.jpg` } : l)) }
    expect(inserirGradeNoDesign(depois, pedido('2x2', 4), m)).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
  })

  it('canvas mudou ⇒ ALVO_MUDOU', () => {
    const d = base()
    const m = medir(d)
    expect(inserirGradeNoDesign({ ...d, canvas: { ...d.canvas, height: 1920 } }, pedido('2x2', 4), m)).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
  })

  it('fundo removido (ou outro apareceu e ficou ambíguo) ⇒ ALVO_MUDOU', () => {
    const d = base()
    const m = medir(d)
    expect(inserirGradeNoDesign({ ...d, layers: [texto] }, pedido('2x2', 4), m)).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
    const outro = camada('outra', 'image', { position: { x: 0, y: 0 }, size: { width: 1080, height: 1350 }, fileUrl: FOTO, style: { objectFit: 'cover' } })
    expect(inserirGradeNoDesign({ ...d, layers: [...d.layers, outro] }, pedido('2x2', 4), m)).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
  })

  it('fundo convertível apareceu sem ter sido medido ⇒ ALVO_MUDOU (nunca converte sem medida)', () => {
    expect(inserirGradeNoDesign(base(), pedido('2x2', 4), null)).toMatchObject({ ok: false, codigo: 'ALVO_MUDOU' })
  })

  it('outra camada editada durante a medida não impede: a edição concorrente fica', () => {
    const d = base()
    const m = medir(d)
    const depois = { ...d, layers: d.layers.map((l) => (l.id === 'titulo' ? { ...l, content: 'Editado' } : l)) }
    const r = ok(inserirGradeNoDesign(depois, pedido('2x2', 4), m))
    expect(r.convertida).toBe('bg-foto')
    expect(r.layers.find((l) => l.id === 'titulo')?.content).toBe('Editado')
  })
})
