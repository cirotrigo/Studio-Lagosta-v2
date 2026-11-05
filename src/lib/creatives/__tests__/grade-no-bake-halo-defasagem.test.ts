/**
 * G4.5 · página com grade de fotos no bake, no halo e na defasagem — quem escolhe "a primeira foto" não pode reduzir,
 * perder ou fingir paridade com as outras. A foto avulsa (página de uma foto só) segue como antes. O gate tem arquivo
 * próprio (`revisao/__tests__/gate-grade-de-fotos.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const leituras = vi.hoisted(() => ({ fotos: [] as string[] }))
vi.mock('@/lib/db', () => ({ db: { brandColor: { findMany: async () => [] } } }))
vi.mock('@/lib/posts/register-project-fonts', () => ({
  fetchBuffer: async (url: string) => {
    leituras.fotos.push(url)
    throw new Error('sem rede no teste')
  },
}))

import type { Layer } from '@/types/template'
import { bakeLayers } from '../bake-layers'
import { CreativeError } from '../errors'
import { aplicarHaloNaArte } from '../halo/integracao-arte-rapida'
import { medirDefasagem, paginaMudouDesde, precisaRefazer } from '@/lib/compositor/defasagem'
import { conferirGrade } from '@/lib/grades/conferir'

const BLOB = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com'
const CROP = { x: 0.1, y: 0, width: 0.5, height: 1 }
const g = { id: 'g1', layout: '2-colunas', versao: 1, espacamento: 10, raio: 0, caixa: { x: 0, y: 820, w: 1080, h: 1100 } }
const cel = (id: string, i: number, fileUrl: string, extra: Record<string, unknown> = {}) =>
  ({
    id, name: `Grade · foto ${i + 1}`, type: 'image', visible: true, locked: false, order: i, rotation: 0,
    position: { x: i === 0 ? 0 : 545, y: 820 }, size: { width: 535, height: 1100 }, fileUrl,
    style: { objectFit: 'cover', border: { radius: 0 }, crop: CROP }, metadata: { grade: { ...g, celula: i }, groupId: 'g1' }, ...extra,
  }) as unknown as Layer
const fundo = (extra: Record<string, unknown> = {}) =>
  ({ id: 'bg-foto', name: 'Fundo', type: 'image', visible: true, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: `${BLOB}/fundo.jpg`, style: { objectFit: 'cover' }, ...extra }) as unknown as Layer
const veu = { id: 'veu', name: 'Véu', type: 'gradient', visible: true, order: 3, position: { x: 0, y: 0 }, size: { width: 1080, height: 800 } } as unknown as Layer
const texto = (content = 'Almoço') => ({ id: 'headline', name: 'headline', type: 'text', content, visible: true, order: 4, position: { x: 100, y: 200 }, size: { width: 880, height: 120 }, metadata: { compositor: { papel: 'headline' } } }) as unknown as Layer
const pagina = () => [fundo(), cel('c0', 0, `${BLOB}/a.jpg`), cel('c1', 1, `${BLOB}/b.jpg`), veu, texto()]

beforeEach(() => {
  leituras.fotos.length = 0
})

describe('bake: a foto pedida entra na célula só por preencherCelula; a genérica nunca vira "a" foto da grade', () => {
  it('fileUrl explícito do Blob próprio numa célula: recorte da foto anterior limpo, cover; a outra célula intacta', () => {
    const r = bakeLayers(pagina(), { c1: { fileUrl: `${BLOB}/nova.jpg` } }, null)
    const c1 = r.layers.find((l) => l.id === 'c1')
    expect(c1.fileUrl).toBe(`${BLOB}/nova.jpg`)
    expect(c1.style.crop).toBeUndefined()
    expect(c1.style.objectFit).toBe('cover')
    expect(r.layers.find((l) => l.id === 'c0').style.crop).toEqual(CROP)
    expect(r.explicitFileUrlIds).toEqual(['c1'])
    expect(conferirGrade(r.layers)).toEqual([])
  })

  it('fileUrl explícito de host alheio numa célula: recusa 422 (nunca descartado em silêncio); "" esvazia sem recorte', () => {
    for (const ruim of ['https://blob.test/de-fora.jpg', 'data:image/png;base64,aGVsbG8=', 'https://lh3.googleusercontent.com/x']) {
      let erro: unknown
      try {
        bakeLayers(pagina(), { c0: { fileUrl: ruim } }, null)
      } catch (e) {
        erro = e
      }
      expect(erro, ruim).toBeInstanceOf(CreativeError)
      expect((erro as CreativeError).code).toBe('FOTO_DA_GRADE_RECUSADA')
      expect((erro as CreativeError).status).toBe(422)
    }
    const vazia = bakeLayers(pagina(), { c0: { fileUrl: '' } }, null).layers.find((l) => l.id === 'c0')
    expect([vazia.fileUrl, vazia.style.crop]).toEqual(['', undefined])
  })

  it('foto genérica com a célula marcada como dinâmica: vai para o bg-img/vaga comum, nunca para a célula', () => {
    const camadas = [cel('c0', 0, '', { isDynamic: true }), cel('c1', 1, `${BLOB}/b.jpg`, { isDynamic: true }), { ...fundo(), id: 'bg-img', fileUrl: '' }]
    const r = bakeLayers(camadas, {}, `${BLOB}/generica.jpg`)
    expect(r.imageApplied).toBe(true)
    expect(r.layers.find((l) => l.id === 'bg-img').fileUrl).toBe(`${BLOB}/generica.jpg`)
    expect([r.layers[0].fileUrl, r.layers[1].fileUrl]).toEqual(['', `${BLOB}/b.jpg`])
  })

  it('só células como vaga (vazia ou cheia): imageApplied false — nenhuma foto da grade é trocada nem perdida', () => {
    const r = bakeLayers([cel('c0', 0, '', { isDynamic: true }), cel('c1', 1, `${BLOB}/b.jpg`, { isDynamic: true })], {}, `${BLOB}/generica.jpg`)
    expect(r.imageApplied).toBe(false)
    expect([r.layers[0].fileUrl, r.layers[1].fileUrl]).toEqual(['', `${BLOB}/b.jpg`])
  })

  it('foto avulsa como antes: explícita sem conferência de host e genérica na vaga dinâmica', () => {
    const avulsa = { ...fundo(), id: 'foto', isDynamic: true, fileUrl: '' }
    expect(bakeLayers([avulsa], { foto: { fileUrl: 'https://blob.test/qualquer.jpg' } }, null).layers[0].fileUrl).toBe('https://blob.test/qualquer.jpg')
    const r = bakeLayers([avulsa], {}, 'https://blob.test/generica.jpg')
    expect([r.imageApplied, r.layers[0].fileUrl]).toEqual([true, 'https://blob.test/generica.jpg'])
  })
})

describe('halo: calibra por UMA foto — com grade, fica o véu, sem ler a foto', () => {
  it('família de halo com grade: aplicado false, aviso da grade, camadas intactas e nenhuma foto lida', async () => {
    const layers = pagina()
    const r = await aplicarHaloNaArte({ projectId: 8, layers, canvas: { width: 1080, height: 1920 }, templateTags: ['gerado'], fotoLida: null })
    expect(r.aplicado).toBe(false)
    expect(r.avisos.join(' ')).toMatch(/grade de fotos/)
    expect(r.layers).toBe(layers)
    expect(leituras.fotos).toEqual([])
  })

  it('controle (foto avulsa): o halo segue tentando ler a foto de fundo, como antes', async () => {
    const r = await aplicarHaloNaArte({ projectId: 8, layers: [fundo(), veu, texto()], canvas: { width: 1080, height: 1920 }, templateTags: ['gerado'], fotoLida: null })
    expect(leituras.fotos).toEqual([`${BLOB}/fundo.jpg`])
    expect(r.avisos.join(' ')).toMatch(/não deu para ler a foto de fundo/)
  })
})

describe('defasagem: troca só na SEGUNDA foto conta; grade nunca é recomposta como foto única', () => {
  const comFotoC1 = (url: string) => pagina().map((l) => (l.id === 'c1' ? { ...l, fileUrl: url } : l))

  it('a foto da 2ª célula trocada (1ª foto e texto iguais): defasada, foto trocada, refazer — e NÃO recompor', () => {
    const d = medirDefasagem(comFotoC1(`${BLOB}/outra.jpg`), pagina())
    expect(d).toMatchObject({ ilegivel: false, defasada: true, fotoTrocada: true, soTexto: false })
    expect(d.mexidoNaMao).toEqual(['a foto da célula "c1" da grade foi trocada'])
    expect(precisaRefazer(d, [{ postId: 'post', indice: 0, total: 5, urlAntiga: 'https://blob.test/arte.png' }], 'https://blob.test/arte.png')).toBe(true)
    expect(paginaMudouDesde(pagina(), comFotoC1(`${BLOB}/outra.jpg`))).toBe(true)
    // célula esvaziada também é troca ('' e ausente são a mesma vazia)
    expect(medirDefasagem(comFotoC1(''), pagina()).fotoTrocada).toBe(true)
  })

  it('só o texto mudou numa página com grade: defasada, mas soTexto false (re-render como está, nunca recompor)', () => {
    const agora = pagina().map((l) => (l.id === 'headline' ? { ...l, content: 'Jantar' } : l))
    const d = medirDefasagem(agora, pagina())
    expect(d).toMatchObject({ defasada: true, fotoTrocada: false, soTexto: false, mexidoNaMao: [] })
  })

  it('nada mudou numa página com grade: em dia (sem mudança fantasma)', () => {
    const d = medirDefasagem(pagina(), pagina())
    expect(d).toMatchObject({ defasada: false, mexidoNaMao: [] })
    expect(paginaMudouDesde(pagina(), pagina())).toBe(false)
    expect(precisaRefazer(d, [{ postId: 'post', indice: 0, total: 5, urlAntiga: 'u' }], 'u')).toBe(false)
  })

  it('controle (foto avulsa): só texto mudou → soTexto true, como antes', () => {
    const antes = [fundo(), texto()]
    const d = medirDefasagem([fundo(), texto('Jantar')], antes)
    expect(d).toMatchObject({ defasada: true, soTexto: true })
  })
})
