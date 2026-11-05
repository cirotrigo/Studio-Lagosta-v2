/**
 * F1 da direção por referência — a camada de serviço com o banco FINGIDO: aprovação (piso do projeto, versão
 * esperada, idempotência depois da validação, concorrência), o gate por cliente/formato (`resolucaoParaASpec`) e a
 * revogação que só vale para pedido novo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'
import { CreativeError } from '@/lib/creatives/errors'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import brunch from '../arquetipos/__tests__/suporte/emporio-ref02-brunch.json'
import congelada from '../arquetipos/__tests__/suporte/emporio-ref02-brunch-v1-congelada.json'

const db = {
  page: { findUnique: vi.fn(), findMany: vi.fn() },
  project: { findUnique: vi.fn() },
  referenciaDeLayout: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}
vi.mock('@/lib/db', () => ({ db }))
const assuntos = vi.fn()
const metadados = vi.fn()
vi.mock('@/lib/creatives/acervo', () => ({ assuntosEfetivosDoProjeto: assuntos }))
vi.mock('@/server/google-drive-service', () => ({ googleDriveService: { getFileMetadata: metadados } }))

const { aprovarReferencia, listarReferencias, resolucaoParaASpec, referenciasDoProjeto } = await import('../referencias')
const { impressaoDoArquetipo } = await import('../arquetipos/impressao')
const { compilarReferencia } = await import('../arquetipos/referencia')

type Pagina = { id: string; name: string; width: number; height: number; tags: string[]; layers: Layer[]; background?: string }
const PAGINA = brunch as unknown as Pagina
const pagina = { ...PAGINA, layers: JSON.stringify(PAGINA.layers), Template: { projectId: 12 } }
const pageVersion = versaoDaPagina({ width: PAGINA.width, height: PAGINA.height, background: PAGINA.background, layers: PAGINA.layers })!
const definicaoV1 = (() => {
  const r = compilarReferencia(PAGINA, { pageVersion, versao: 1 })
  if (!r.ok) throw new Error('fixture não compila')
  return r.definicao
})()
const linha = (definicao: typeof definicaoV1, extra: Record<string, unknown> = {}) => ({
  id: `r${definicao.versao}`, pageId: PAGINA.id, arquetipoId: definicao.id, versao: definicao.versao, formato: 'story', impressao: impressaoDoArquetipo(definicao), pageVersion, definicao, aprovadaEm: new Date('2026-11-01'), revogadaEm: null, ...extra,
})
const erro = async (f: () => Promise<unknown>) => {
  try {
    await f()
  } catch (e) {
    return e as CreativeError
  }
  throw new Error('não recusou')
}

beforeEach(() => {
  vi.clearAllMocks()
  db.page.findUnique.mockResolvedValue(pagina)
  db.project.findUnique.mockResolvedValue({ id: 12, assinatura: null })
  db.referenciaDeLayout.findMany.mockResolvedValue([])
  assuntos.mockReset().mockResolvedValue(new Map())
  metadados.mockReset().mockResolvedValue({ imageMediaMetadata: { width: 2000, height: 3000 } })
  db.referenciaDeLayout.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'nova', pageId: data.pageId, arquetipoId: data.arquetipoId, versao: data.versao, formato: data.formato, impressao: data.impressao, pageVersion: data.pageVersion, aprovadaEm: new Date(), revogadaEm: null }))
})

describe('aprovarReferencia · o assunto da foto (F2b)', () => {
  const ID = '1McWbzH94dsSMhZa5By-r2Q-ROvSOq17a'
  const CAIXA = { x0: 0.3, y0: 0.2, x1: 0.6, y1: 0.5 }
  const localizada = (caixa = CAIXA) => new Map([[ID, { caixa, origem: 'visao', estado: 'localizada' }]])
  const aprovar = () => aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: 'u1' })
  const gravada = () => db.referenciaDeLayout.create.mock.calls[0][0].data.definicao as typeof definicaoV1
  const comAssunto = async () => {
    assuntos.mockResolvedValue(localizada())
    await aprovar()
    const d = gravada()
    db.referenciaDeLayout.create.mockClear()
    return d
  }
  const comFoto = (url: string) => ({ ...pagina, layers: JSON.stringify(PAGINA.layers.map((c) => (c.id === 'foto-fundo' ? { ...c, fileUrl: url } : c))) })

  it('caixa + dimensões → a revisão grava o assunto; os campos pedidos ao Drive são os três', async () => {
    assuntos.mockResolvedValue(localizada())
    const r = await aprovar()
    expect(assuntos).toHaveBeenCalledWith(12, [ID])
    expect(metadados).toHaveBeenCalledWith(ID, 'imageMediaMetadata(width,height,rotation)')
    expect(gravada().formatos.story.assunto).toEqual(r.leitura.assunto)
    expect(r.leitura.assunto).toMatchObject({ visivel: 1 })
  })

  it('catálogo sem a foto (SEM_CATALOGO inclusive) → aprova com nao-analisada', async () => {
    const r = await aprovar()
    expect(r.leitura.assunto).toEqual({ ausente: 'nao-analisada' })
    expect(gravada().formatos.story).not.toHaveProperty('assunto')
    expect(metadados).not.toHaveBeenCalled()
  })

  it('negativa (humana ou da visão) → sem-assunto', async () => {
    assuntos.mockResolvedValue(new Map([[ID, { caixa: null, origem: 'humano', estado: 'sem-assunto' }]]))
    expect((await aprovar()).leitura.assunto).toEqual({ ausente: 'sem-assunto' })
  })

  it.each([
    ['catálogo ou tabela', () => assuntos.mockRejectedValue(new Error('fora do ar'))],
    ['Drive', () => { assuntos.mockResolvedValue(localizada()); metadados.mockRejectedValue(new Error('fora do ar')) }],
  ] as Array<[string, () => void]>)('%s lançando: com revisão vigente COM assunto recusa e nada grava; sem assunto, aprova dizendo', async (_nome, falhar) => {
    const v1 = await comAssunto()
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(v1)])
    falhar()
    expect(await erro(aprovar)).toMatchObject({ code: 'CATALOGO_INDISPONIVEL', status: 503 })
    expect(db.referenciaDeLayout.create).not.toHaveBeenCalled()

    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1)])
    expect((await aprovar()).leitura.assunto).toEqual({ ausente: 'catalogo-indisponivel' })
  })

  it('mesma página + mesma caixa → reaproveita; mesma página + caixa alterada → versão seguinte', async () => {
    const v1 = await comAssunto()
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(v1)])
    expect((await aprovar()).reaproveitada).toBe(true)
    expect(db.referenciaDeLayout.create).not.toHaveBeenCalled()

    assuntos.mockResolvedValue(localizada({ ...CAIXA, x1: 0.7 }))
    const r = await aprovar()
    expect(r.reaproveitada).toBe(false)
    expect(r.arquetipo.versao).toBe(2)
  })

  it('a concorrência decide pelo MESMO snapshot: nada é lido de novo', async () => {
    const v1 = await comAssunto()
    assuntos.mockClear()
    db.referenciaDeLayout.findMany.mockResolvedValueOnce([]).mockResolvedValue([linha(v1)])
    db.referenciaDeLayout.create.mockRejectedValueOnce(Object.assign(new Error('único'), { code: 'P2002' }))
    expect((await aprovar()).reaproveitada).toBe(true)
    expect(assuntos).toHaveBeenCalledTimes(1)
  })

  it('URL sem id do Drive → foto-sem-id; URL do proxy → fonte-nao-coerente; nada é lido', async () => {
    db.page.findUnique.mockResolvedValue(comFoto('https://x.public.blob.vercel-storage.com/foto.jpg'))
    expect((await aprovar()).leitura.assunto).toEqual({ ausente: 'foto-sem-id' })
    db.page.findUnique.mockResolvedValue(comFoto(`https://studio.test/api/google-drive/image/${ID}`))
    expect((await aprovar()).leitura.assunto).toEqual({ ausente: 'fonte-nao-coerente' })
    expect(assuntos).not.toHaveBeenCalled()
  })

  it('sem dimensões finitas e positivas → sem-dimensoes', async () => {
    assuntos.mockResolvedValue(localizada())
    for (const imageMediaMetadata of [undefined, { width: 0, height: 10 }, { width: 10 }]) {
      metadados.mockResolvedValue({ imageMediaMetadata })
      expect((await aprovar()).leitura.assunto).toEqual({ ausente: 'sem-dimensoes' })
    }
  })

  it.each([[1, true], [3, true], [2, false], [0, false], [undefined, false]])('rotation %s: troca os eixos? %s', async (rotation, troca) => {
    // Sem crop, em cover: a proporção decide a janela, e o assunto no quadro depende de quais são a largura e a altura.
    const semCrop = PAGINA.layers.map((c) => (c.id === 'foto-fundo' ? { ...c, style: { objectFit: 'cover', cropPosition: 'center-middle' } } : c))
    db.page.findUnique.mockResolvedValue({ ...pagina, layers: JSON.stringify(semCrop) })
    assuntos.mockResolvedValue(localizada({ x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.6 }))
    const leia = async (imageMediaMetadata: Record<string, unknown>) => {
      metadados.mockResolvedValue({ imageMediaMetadata })
      return (await aprovar()).leitura.assunto
    }
    const girada = await leia({ width: 4000, height: 1000, rotation })
    const em = troca ? { width: 1000, height: 4000 } : { width: 4000, height: 1000 }
    expect(girada).toEqual(await leia(em))
  })

  it('EXIF com pixels: JPEG 400×300 de orientação 6 → a projeção com `rotation: 1` cai sobre o quadrado da imagem RENDERIZADA (± 1 px)', async () => {
    const sharp = (await import('sharp')).default
    const quadrado = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#ff0000' } }).png().toBuffer()
    const jpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#ffffff' } }).composite([{ input: quadrado, left: 20, top: 30 }]).withMetadata({ orientation: 6 }).jpeg({ quality: 100 }).toBuffer()
    const renderizada = await sharp(jpeg).rotate().png().toBuffer()
    const lidas = await sharp(renderizada).metadata()
    expect([lidas.width, lidas.height]).toEqual([300, 400])
    const caixaVermelha = async (png: Buffer) => {
      const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1]
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 3
        if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1) }
      }
      return { x0, y0, x1, y1 }
    }
    const naFoto = await caixaVermelha(renderizada)
    const janela = { x: 0.4, y: 0, width: 0.6, height: 0.5 }
    db.page.findUnique.mockResolvedValue({ ...pagina, layers: JSON.stringify(PAGINA.layers.map((c) => (c.id === 'foto-fundo' ? { ...c, style: { objectFit: 'cover', crop: janela } } : c))) })
    assuntos.mockResolvedValue(localizada({ x0: naFoto.x0 / 300, y0: naFoto.y0 / 400, x1: naFoto.x1 / 300, y1: naFoto.y1 / 400 }))
    metadados.mockResolvedValue({ imageMediaMetadata: { width: 400, height: 300, rotation: 1 } })
    const { caixa } = (await aprovar()).leitura.assunto as { caixa: { x: number; y: number; w: number; h: number } }
    // A peça: a mesma janela, em 1080×1920. O quadrado desenhado é o que a caixa no quadro diz.
    const peca = await sharp(renderizada).extract({ left: 120, top: 0, width: 180, height: 200 }).resize(1080, 1920, { fit: 'fill', kernel: 'nearest' }).png().toBuffer()
    const noQuadro = await caixaVermelha(peca)
    const umPixelDaFoto = { x: 1080 / 180, y: 1920 / 200 }
    expect(Math.abs(caixa.x * 1080 - noQuadro.x0)).toBeLessThanOrEqual(umPixelDaFoto.x)
    expect(Math.abs(caixa.y * 1920 - noQuadro.y0)).toBeLessThanOrEqual(umPixelDaFoto.y)
    expect(Math.abs((caixa.x + caixa.w) * 1080 - noQuadro.x1)).toBeLessThanOrEqual(umPixelDaFoto.x)
    expect(Math.abs((caixa.y + caixa.h) * 1920 - noQuadro.y1)).toBeLessThanOrEqual(umPixelDaFoto.y)
  })

  it('listarReferencias lê o assunto da revisão persistida; null na antiga', async () => {
    const v1 = await comAssunto()
    db.page.findMany.mockResolvedValue([])
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(v1), linha(definicaoV1)])
    const [nova, antiga] = await listarReferencias(12)
    expect(nova.assunto).toEqual(v1.formatos.story.assunto)
    expect(antiga.assunto).toBeNull()
  })
})

describe('aprovarReferencia', () => {
  it('compila a página do Brunch contra o piso do projeto e grava a revisão 1 (definição inteira, impressão, versão da página)', async () => {
    const r = await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: 'u1' })
    expect(r.reaproveitada).toBe(false)
    expect(r.arquetipo).toEqual({ id: definicaoV1.id, versao: 1, impressao: impressaoDoArquetipo(definicaoV1) })
    const data = db.referenciaDeLayout.create.mock.calls[0][0].data
    expect(data).toMatchObject({ projectId: 12, pageId: PAGINA.id, formato: 'story', arquetipoId: definicaoV1.id, versao: 1, pageVersion, aprovadaPor: 'u1' })
    expect(data.definicao).toEqual(definicaoV1)
  })

  it('página de outro cliente é 404; o piso do PROJETO recusa a caixa que o invade (base 180 → apoio 18 px)', async () => {
    db.page.findUnique.mockResolvedValue({ ...pagina, Template: { projectId: 99 } })
    expect((await erro(() => aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null }))).code).toBe('PAGE_NOT_FOUND')
    db.page.findUnique.mockResolvedValue(pagina)
    db.project.findUnique.mockResolvedValue({ id: 12, assinatura: { geometria: { story: { safeRodape: 180 } } } })
    const e = await erro(() => aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null }))
    expect(e.code).toBe('REFERENCIA_FORA_DO_PISO')
    expect(e.message).toContain('apoio passa base 18 px')
    expect(db.referenciaDeLayout.create).not.toHaveBeenCalled()
  })

  it('versaoEsperada diferente da página atual recusa (409) — aprova-se o que foi conferido', async () => {
    const e = await erro(() => aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null, versaoEsperada: 'v1:outra' }))
    expect(e.code).toBe('REFERENCIA_PAGINA_MUDOU')
    expect(e.status).toBe(409)
    expect((await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null, versaoEsperada: pageVersion })).arquetipo.versao).toBe(1)
  })

  it('idempotente: a mesma página já vigente não grava; página mudada (ou revisão revogada) grava a versão seguinte', async () => {
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1)])
    const r = await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null })
    expect(r.reaproveitada).toBe(true)
    expect(r.arquetipo.versao).toBe(1)
    expect(db.referenciaDeLayout.create).not.toHaveBeenCalled()
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1, { revogadaEm: new Date() })])
    expect((await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null })).arquetipo.versao).toBe(2)
  })

  it('F2c: a revisão F1 CONGELADA vigente (sem corpos) + a MESMA página → o compilador novo grava a revisão 2 (com corpos, impressão nova); a 2 vigente reaproveita', async () => {
    const v1 = congelada.definicao as unknown as typeof definicaoV1
    expect(impressaoDoArquetipo(v1)).toBe(congelada.impressao)
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(v1)])
    const r = await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null })
    expect(r.reaproveitada).toBe(false)
    expect(r.arquetipo.versao).toBe(2)
    const data = db.referenciaDeLayout.create.mock.calls[0][0].data
    expect(data.definicao.formatos.story.corpos).toEqual({ headline: 85, apoio: 39 })
    expect(r.leitura.papeis.map((p) => p.corpo)).toEqual([85, 39])
    // A 2 vigente: a mesma página reaproveita (impressão igual à gravada, normalizada para a versão seguinte).
    db.referenciaDeLayout.create.mockClear()
    db.referenciaDeLayout.findMany.mockResolvedValue([linha({ ...definicaoV1, versao: 2 })])
    expect((await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null })).reaproveitada).toBe(true)
    expect(db.referenciaDeLayout.create).not.toHaveBeenCalled()
  })

  it('F2d: a revisão vigente SÓ com corpos (a @2 da F2c) + a mesma página → o compilador novo grava a seguinte com estilos; a equivalente reaproveita', async () => {
    const { estilos: _e, ...soCorpos } = definicaoV1.formatos.story
    const v2 = { ...definicaoV1, versao: 2, formatos: { story: soCorpos } } as typeof definicaoV1
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(v2)])
    const r = await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null })
    expect([r.reaproveitada, r.arquetipo.versao]).toEqual([false, 3])
    const data = db.referenciaDeLayout.create.mock.calls[0][0].data
    expect(data.definicao.formatos.story.estilos.headline).toMatchObject({ fontFamily: 'TrajanPro Regular', color: '#F8F8F8' })
    expect(r.leitura.papeis.map((p) => p.estilo.letterSpacing)).toEqual([0, 3])
    db.referenciaDeLayout.create.mockClear()
    db.referenciaDeLayout.findMany.mockResolvedValue([linha({ ...definicaoV1, versao: 3 })])
    expect((await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null })).reaproveitada).toBe(true)
    expect(db.referenciaDeLayout.create).not.toHaveBeenCalled()
  })

  it('a idempotência vem DEPOIS da validação: com o piso mudado, a mesma página é recusada em vez de reaproveitada', async () => {
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1)])
    db.project.findUnique.mockResolvedValue({ id: 12, assinatura: { geometria: { story: { safeRodape: 180 } } } })
    expect((await erro(() => aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null }))).code).toBe('REFERENCIA_FORA_DO_PISO')
  })

  it('concorrência: perde o índice único, relê e reaproveita a equivalente; diferente é REFERENCIA_CONCORRENTE', async () => {
    db.referenciaDeLayout.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
    db.referenciaDeLayout.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([linha(definicaoV1)])
    expect((await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null })).reaproveitada).toBe(true)
    db.referenciaDeLayout.create.mockClear()
    db.referenciaDeLayout.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
    db.referenciaDeLayout.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([linha(definicaoV1, { pageVersion: 'v1:outra-pagina' })])
    const e = await erro(() => aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null }))
    expect(e.code).toBe('REFERENCIA_CONCORRENTE')
    // A releitura decide SEM inserir: só a tentativa que perdeu o índice foi ao banco.
    expect(db.referenciaDeLayout.create).toHaveBeenCalledTimes(1)
  })
})

describe('resolucaoParaASpec — o gate por cliente/formato no servidor', () => {
  const v2 = { ...definicaoV1, versao: 2 }
  it('sem arquétipo na spec, não vai ao banco; no quadrado o catálogo não é bloqueado (a recusa certa é a do formato)', async () => {
    expect(await resolucaoParaASpec({ projectId: 12, formato: 'story' })).toEqual({})
    expect(db.referenciaDeLayout.findMany).not.toHaveBeenCalled()
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1)])
    expect(await resolucaoParaASpec({ projectId: 12, formato: 'quadrado', arquetipo: { id: 'minimal-fb-topo-esquerda' } })).toEqual({})
    expect(db.referenciaDeLayout.findMany).not.toHaveBeenCalled()
    expect((await resolucaoParaASpec({ projectId: 12, formato: 'quadrado', arquetipo: { id: definicaoV1.id } })).definicoes).toEqual([definicaoV1])
  })

  it('pedido novo: só as vigentes do cliente no formato; com referência, o catálogo fica bloqueado; sem, aberto', async () => {
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1)])
    const r = await resolucaoParaASpec({ projectId: 12, formato: 'story', arquetipo: { id: 'minimal-fb-topo-esquerda' } })
    expect(r.definicoes).toEqual([definicaoV1])
    expect(r.catalogoBloqueado?.motivo).toContain(`${definicaoV1.id}@1`)
    expect(db.referenciaDeLayout.findMany.mock.calls[0][0].where).toEqual({ projectId: 12, formato: 'story', revogadaEm: null })
    db.referenciaDeLayout.findMany.mockResolvedValue([])
    expect(await resolucaoParaASpec({ projectId: 12, formato: 'story', arquetipo: { id: 'minimal-fb-topo-esquerda' } })).toEqual({ definicoes: [] })
  })

  it('reprodução (worker, recomposição): com as revogadas e o catálogo aberto; id de catálogo não consulta o banco', async () => {
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1, { revogadaEm: new Date() }), linha(v2)])
    const r = await resolucaoParaASpec({ projectId: 12, formato: 'story', arquetipo: { id: definicaoV1.id, versao: 1 } }, { reproducao: true })
    expect(r.definicoes?.map((d) => d.versao)).toEqual([1, 2])
    expect(r.catalogoBloqueado).toBeUndefined()
    expect(db.referenciaDeLayout.findMany.mock.calls[0][0].where).toEqual({ projectId: 12 })
    expect(await resolucaoParaASpec({ projectId: 12, formato: 'story', arquetipo: { id: 'minimal-fb-topo-esquerda' } }, { reproducao: true })).toEqual({})
  })

  it('linha cuja impressão não bate com a definição gravada é REFERENCIA_CORROMPIDA, nunca pulada', async () => {
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1, { impressao: 'arq1-00000000000000' })])
    expect((await erro(() => referenciasDoProjeto(12))).code).toBe('REFERENCIA_CORROMPIDA')
  })
})
