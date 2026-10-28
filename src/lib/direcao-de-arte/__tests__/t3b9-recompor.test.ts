/**
 * #9 `minimal-divisao-cor-topo-arco@1` por FIXTURE — a RECOMPOSIÇÃO REAL da Generation (`recomporPaginaDefasada`),
 * compositor real e a Montserrat do repo. Prova o que a máscara congela e o que a protege:
 * - MK-12/MK-17: texto editado → o MESMO arco (o path GRAVADO), o mesmo corte; o assunto do replay medido no arco;
 * - IF-09: um `@2` dublê com outro raio → a `@1` recompõe igual ao gravado; receita auto-coerente de outro raio → recusa;
 * - MK-16/IF-02: receita ausente, ilegível ou incoerente → `ARQUETIPO_ESCOLHA_ILEGIVEL` com ZERO consultas novas (acervo,
 *   uso de foto, fetch da foto, medidor, `put`, render) e nada escrito;
 * - IF-07: máscara mexida à mão (#9 e legado) → re-render como está, camadas intactas, sem ler a receita; máscara igual
 *   (chaves noutra ordem) → o comportamento de antes;
 * - IF-08/MK-14: caixa mexida à mão → re-render como está sem ler a receita; troca de foto → corte novo, mesmo arco.
 * Dublados como no t3b8-recompor: banco em memória (não é Postgres), Blob (`put` captura), fila, render da página.
 * "Legado" = a peça do caminho do #8 (foto em caixa SEM máscara no arquétipo): a mesma fixture sem `mascaraDaFoto`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
  entradas: [] as Array<Record<string, any>>,
  pngs: [] as Buffer[],
  rerenders: [] as Array<Record<string, any>>,
  sql: [] as unknown[][],
  posts: new Map<string, Record<string, any>>(),
  /** IF-09: uma `@2` dublê ao lado (o catálogo vivo alterado). */
  v2: null as Record<string, any> | null,
  /** Legado: a fixture sem a máscara (o caminho do #8). */
  semMascara: false,
  /** Espiões das consultas que a recomposição faz DEPOIS de decidir (IF-02). */
  consultas: { acervo: 0, usoDeFoto: 0, fetch: 0, medidor: 0, render: 0 },
}))

vi.mock('@/lib/db', async () => {
  const base = (await import('./suporte/compositor')).mockDoBanco().db as Record<string, any>
  const db: Record<string, any> = {
    ...base,
    project: {
      findUnique: async (args: unknown) => ({ ...(await base.project.findUnique(args)), id: 9009, instagramAccountId: null, titleFontFamily: 'Montserrat', bodyFontFamily: 'Montserrat', subtitleFontFamily: null }),
    },
    page: {
      ...base.page,
      findUnique: async ({ where }: { where: { id: string } }) =>
        banco.pagina && where.id === banco.pagina.id ? { ...banco.pagina, Template: { id: 77, name: 'Programação', projectId: 9009 } } : null,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { ...banco.pagina, ...data }
        return { count: 1 }
      },
    },
    fontCombination: { findMany: async () => [] },
    generation: {
      findMany: async () => [...banco.generations].reverse(),
      findFirst: async () => banco.generations.at(-1) ?? null,
    },
    socialPost: {
      findMany: async () => [...banco.posts.values()].map((p) => ({ ...p })),
      findUnique: async ({ where }: { where: { id: string } }) => (banco.posts.has(where.id) ? { ...banco.posts.get(where.id) } : null),
      updateMany: async ({ where, data }: { where: { id: string; mediaUrls?: { equals: string[] } }; data: Record<string, unknown> }) => {
        const p = banco.posts.get(where.id)
        if (!p || (where.mediaUrls && JSON.stringify(where.mediaUrls.equals) !== JSON.stringify(p.mediaUrls))) return { count: 0 }
        banco.posts.set(where.id, { ...p, ...data })
        return { count: 1 }
      },
    },
    postLog: { create: async ({ data }: { data: unknown }) => data },
    $executeRaw: async (_p: TemplateStringsArray, ...valores: unknown[]) => {
      banco.sql.push(valores)
      return 1
    },
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (_caminho: string, png: Buffer) => {
    banco.pngs.push(png)
    return { url: `https://blob.test/arte-rapida/9009/p9-${banco.pngs.length}.png` }
  }),
  del: vi.fn(),
}))
vi.mock('@/lib/creatives/persist', async () => ({
  ...(await import('./suporte/compositor')).mockDaPersistencia(),
  getPublicAppUrl: () => 'https://studio.test',
  persistAndRenderCreative: async (e: Record<string, any>) => {
    banco.entradas.push(e)
    return { generationId: 'gen-9', pageId: 'p9', url: 'https://blob.test/arte-9.png' }
  },
  renderPageAndRegister: async (e: Record<string, any>) => {
    banco.rerenders.push(e)
    return { generationId: e.generationId, url: 'https://blob.test/re-render.png' }
  },
}))
vi.mock('@/lib/ai/generation-queue', () => ({ marcarForcaAtendida: vi.fn(), marcarForcaEmExecucao: vi.fn(), marcarRenderComoEsta: vi.fn(), pedirNovaTentativa: vi.fn() }))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))
vi.mock('@/lib/compositor/pastas', () => ({ garantirPasta: async () => ({ id: 77, name: 'Semana' }), ordemNaPasta: async () => ({ ordem: 1, repeticao: 0 }) }))
vi.mock('@/lib/brand/voz-service', () => ({ carimboDaVozAgora: async () => null }))
vi.mock('@/lib/posts/register-project-fonts', async () => {
  const m = (await import('./suporte/compositor')).mockDasFontes()
  return { ...m, fetchBuffer: async (...a: unknown[]) => (banco.consultas.fetch++, (m.fetchBuffer as (...x: unknown[]) => Promise<Buffer>)(...a)) }
})
vi.mock('@/lib/creatives/server-text-measurer', async () => {
  const { cenario: c } = await import('./suporte/compositor')
  return { createServerTextBoxMeasurer: async () => (layer: never) => (banco.consultas.medidor++, c.atual!.medidor(layer)) }
})
vi.mock('@/lib/creatives/text-autofix', async () => (await import('./suporte/compositor')).mockDoAutofix())
vi.mock('@/lib/creatives/uso-de-foto', () => ({ registrarUsoDeFoto: async () => void banco.consultas.usoDeFoto++ }))
vi.mock('@/lib/creatives/acervo', async () => {
  const m = (await import('./suporte/compositor')).mockDoAcervo()
  return { lerCatalogoDoProjeto: async () => (banco.consultas.acervo++, m.lerCatalogoDoProjeto()) }
})
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('./suporte/compositor')).gradientesDoCenario,
}))
vi.mock('@/lib/compositor/arquetipos/catalogo', async (original) => {
  const f = await import('@/lib/compositor/arquetipos/__tests__/suporte/arquetipo-arco-9')
  const semMascara = () => {
    const a = JSON.parse(JSON.stringify(f.ARQUETIPO_ARCO_9))
    delete a.formatos.story.mascaraDaFoto
    delete a.formatos.feed.mascaraDaFoto
    return a
  }
  return f.catalogoComOArco(original as never, () => (banco.v2 ? [banco.v2 as never] : []), () => (banco.semMascara ? semMascara() : f.ARQUETIPO_ARCO_9))
})

import type { Layer } from '@/types/template'
import { CanvasRenderer } from '@/lib/canvas-renderer'
import { comporPeca } from '@/lib/compositor/compor'
import { recomporPaginaDefasada } from '@/lib/compositor/recompor'
import { medirDefasagem } from '@/lib/compositor/defasagem'
import { pathDoArcoJanela, receitaDoArcoJanela } from '@/lib/compositor/arquetipos/mascara'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
import { lerCopyAutoral } from '@/lib/copy-autoral'
import { cenario } from './suporte/compositor'
import { ID_ARCO, cenario9, dataUrlJpeg, fotoDoRepo, medidorComAsFontesDoRepo, spec9 } from './suporte/cenario-9'
import sharp from 'sharp'

const CAIXA = { w: 1080, h: 1114 }
const PATH_062 = pathDoArcoJanela(CAIXA, 0.62)
/** O assunto catalogado no centro (os três cortes o mostram inteiro: o central vence o empate). */
const ASSUNTO_CENTRAL = { x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.6 }
/** No corte central, esse fica no canto de cima que o arco esconde (no retângulo, 100%). */
const ASSUNTO_NO_CANTO = { x0: 0, y0: 0.2, x1: 0.1, y1: 0.26 }

let medir: Awaited<ReturnType<typeof medidorComAsFontesDoRepo>> | null = null
async function montar(assunto: typeof ASSUNTO_CENTRAL = ASSUNTO_CENTRAL) {
  medir ??= await medidorComAsFontesDoRepo(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  cenario.atual = await cenario9('claro', medir, { catalogo: { driveFileId: 'drive-9', assunto } })
}

const porId = (layers: Layer[], id: string) => layers.find((l) => l.id === id)!
const trocarApoio = (l: Layer): Layer => (l.id === 'apoio' ? { ...l, content: 'Menu degustação' } : l)
const specRecompor = () => spec9('story', 'claro', { foto: { driveFileId: 'drive-9' } })
const geometria = (l: Layer) => ({ x: l.position.x, y: l.position.y, w: l.size.width, h: l.size.height, corte: (l.style as any)?.cropPosition ?? null, mask: (l.style as any)?.mask ?? null })
const postDaArte = () => new Map([['post-9', { id: 'post-9', projectId: 9009, status: 'DRAFT', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: ['https://blob.test/capa.png', 'https://blob.test/arte-9.png'], laterPostId: null }]])
const renderOriginal = CanvasRenderer.prototype.renderDesign
const zerarConsultas = () => Object.assign(banco.consultas, { acervo: 0, usoDeFoto: 0, fetch: 0, medidor: 0, render: 0 })

/** Compõe a peça (persistência capturada), grava a página como o persist gravaria e aplica a edição pedida. */
async function nascerEEditar(editar: (l: Layer) => Layer = trocarApoio, fieldValues: (fv: Record<string, any>) => Record<string, any> = (fv) => fv) {
  banco.entradas = []
  await comporPeca(specRecompor(), { autor: 'u-fixture' })
  const entrada = banco.entradas.at(-1)!
  const editadas = (entrada.layers as Layer[]).map(editar)
  const revisao = revisaoDaPaginaComCamadas(lerCopyAutoral(entrada.copyAutoral).copy!, editadas, { autor: 'equipe', motivo: 'edição', superficie: 'editor' })
  banco.pagina = { id: 'p9', name: 'Arco', width: 1080, height: 1920, background: entrada.background, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: revisao.copy }
  banco.generations = [{ id: 'gen-9', projectId: 9009, resultUrl: 'https://blob.test/arte-9.png', authorName: 'compositor', sourcePageId: null, fieldValues: fieldValues(structuredClone({ ...entrada.fieldValues, pageId: 'p9' })) }]
  banco.posts = postDaArte()
  banco.pngs = []
  banco.rerenders = []
  banco.sql = []
  zerarConsultas()
  return entrada
}
async function recusa(promessa: Promise<unknown>): Promise<{ code: string; status?: number; message: string; details?: Record<string, any> }> {
  try {
    await promessa
  } catch (e) {
    return e as { code: string; status?: number; message: string; details?: Record<string, any> }
  }
  throw new Error('esperava recusa')
}
/** Recusa com ZERO consultas novas e SEM escrever: nem PNG, nem Page, nem Generation, nem SQL, nem re-render. */
async function recusaSemConsultarNemEscrever(promessa: Promise<unknown>) {
  const [pagina, generations] = [structuredClone(banco.pagina), structuredClone(banco.generations)]
  const e = await recusa(promessa)
  expect(banco.consultas, 'nenhuma consulta nova antes da recusa').toEqual({ acervo: 0, usoDeFoto: 0, fetch: 0, medidor: 0, render: 0 })
  expect(banco.pngs).toHaveLength(0)
  expect(banco.rerenders).toHaveLength(0)
  expect(banco.pagina).toEqual(pagina)
  expect(banco.generations).toEqual(generations)
  expect(banco.sql).toEqual([])
  return e
}
const comMascara = (mascara: unknown) => (fv: Record<string, any>) => {
  if (mascara === undefined) delete fv.composicao.arquetipo.foto
  else fv.composicao.arquetipo.foto = { mascara }
  return fv
}

beforeEach(() => {
  banco.pngs = []
  banco.rerenders = []
  banco.sql = []
  banco.v2 = null
  banco.semMascara = false
  banco.posts = postDaArte()
  zerarConsultas()
  vi.spyOn(CanvasRenderer.prototype, 'renderDesign').mockImplementation(function (this: CanvasRenderer, ...a: Parameters<CanvasRenderer['renderDesign']>) {
    banco.consultas.render++
    return renderOriginal.apply(this, a)
  })
})

describe('#9 · a defasagem compara a máscara por VALOR (IF-07, puro)', () => {
  const bg = (style: Record<string, unknown>): Layer => ({ id: 'bg-foto', name: 'Foto', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 806 }, size: { width: 1080, height: 1114 }, fileUrl: 'https://f.test/a.jpg', style } as Layer)
  const base = { objectFit: 'cover', cropPosition: 'center-middle' }
  const motivos = (antes: Record<string, unknown>, depois: Record<string, unknown>) => medirDefasagem([bg(depois)], [bg(antes)]).mexidoNaMao
  const AJUSTE = ['o enquadramento da imagem "bg-foto" foi ajustado à mão']
  it('igual (inclusive com as chaves da máscara e do estilo noutra ordem) → nenhum motivo; ausente dos dois lados → nenhum', () => {
    expect(motivos({ ...base, mask: { shapeId: 'arco-janela', path: PATH_062 } }, { mask: { path: PATH_062, shapeId: 'arco-janela' }, cropPosition: 'center-middle', objectFit: 'cover' })).toEqual([])
    expect(motivos(base, { ...base })).toEqual([])
  })
  it('adição, remoção, troca de shapeId ou de path → ajuste manual (o SVG não é validado nem normalizado)', () => {
    const m = { shapeId: 'arco-janela', path: PATH_062 }
    expect(motivos(base, { ...base, mask: { shapeId: 'circle', path: 'M50 0 Z' } })).toEqual(AJUSTE)
    expect(motivos({ ...base, mask: m }, base)).toEqual(AJUSTE)
    expect(motivos({ ...base, mask: m }, { ...base, mask: { ...m, shapeId: 'circle' } })).toEqual(AJUSTE)
    expect(motivos({ ...base, mask: m }, { ...base, mask: { ...m, path: `${PATH_062} ` } })).toEqual(AJUSTE)
  })
})

describe('#9 · recomposição real da Generation', () => {
  it('MK-12: edição só de texto → o MESMO arco (path gravado), o mesmo corte, a mesma caixa; a receita levada adiante', async () => {
    await montar()
    const entrada = await nascerEEditar()
    expect(entrada.fieldValues.composicao.arquetipo.foto.mascara).toEqual(receitaDoArcoJanela(CAIXA, 0.62))
    const nascida = porId(entrada.layers as Layer[], 'bg-foto')
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect([r.recomposta, banco.pngs.length]).toEqual([true, 1])
    const layers = banco.pagina!.layers as Layer[]
    expect(porId(layers, 'apoio').content).toBe('Menu degustação')
    expect(geometria(porId(layers, 'bg-foto'))).toEqual(geometria(nascida))
    expect(geometria(porId(layers, 'bg-foto')).mask).toEqual({ shapeId: 'arco-janela', path: PATH_062 })
  }, 180_000)

  it('IF-09: uma @2 dublê com OUTRO raio publicada → a @1 recompõe IGUAL ao gravado; a peça nova sem versão pega a @2', async () => {
    await montar()
    await nascerEEditar()
    const v1 = verArquetipo(ID_ARCO, 1)!
    banco.v2 = { ...structuredClone(v1), versao: 2, formatos: { story: { ...v1.formatos.story, mascaraDaFoto: { tipo: 'arco-janela', raio: 0.7 } }, feed: v1.formatos.feed } }
    expect(verArquetipo(ID_ARCO)!.versao).toBe(2)
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(r.recomposta).toBe(true)
    expect(geometria(porId(banco.pagina!.layers as Layer[], 'bg-foto')).mask).toEqual({ shapeId: 'arco-janela', path: PATH_062 })
    banco.entradas = []
    await comporPeca({ ...specRecompor(), arquetipo: { id: ID_ARCO } }, { autor: 'u-fixture' })
    expect((porId(banco.entradas.at(-1)!.layers as Layer[], 'bg-foto').style as any).mask.path).toBe(pathDoArcoJanela(CAIXA, 0.7))
  }, 180_000)

  const negativos: Array<[string, unknown, RegExp]> = [
    ['ausente (o arquétipo declara máscara)', undefined, /não guardou a máscara/],
    ['não objeto', 'arco-janela', /não é um objeto/],
    ['chave a mais', { ...receitaDoArcoJanela(CAIXA, 0.62), extra: 1 }, /chaves/],
    ['versão desconhecida', { ...receitaDoArcoJanela(CAIXA, 0.62), versao: 2 }, /versão/],
    ['raio alterado sobre o path antigo', { ...receitaDoArcoJanela(CAIXA, 0.62), raio: 0.7 }, /v1 do próprio raio/],
    ['path válido de outro desenho (retângulo)', { ...receitaDoArcoJanela(CAIXA, 0.62), path: 'M0 0 L100 0 L100 100 L0 100 Z' }, /v1 do próprio raio/],
    ['caixa de outra peça (coerente com ela)', receitaDoArcoJanela({ w: 1080, h: 1000 }, 0.62), /caixa/],
    ['auto-coerente de OUTRO raio (IF-09)', receitaDoArcoJanela(CAIXA, 0.7), /raio/],
  ]
  for (const [nome, mascara, motivo] of negativos) {
    it(`MK-16/IF-02/IF-09: receita ${nome} → ARQUETIPO_ESCOLHA_ILEGIVEL com 0 consultas novas e nada escrito`, async () => {
      await montar()
      await nascerEEditar(trocarApoio, comMascara(mascara))
      const e = await recusaSemConsultarNemEscrever(recomporPaginaDefasada({ pageId: 'p9' }))
      expect([e.code, e.status], e.message).toEqual(['ARQUETIPO_ESCOLHA_ILEGIVEL', 422])
      expect(e.details!.problema).toMatch(motivo)
    }, 180_000)
  }

  it('MK-17: o assunto catalogado muda para o canto que o ARCO esconde no corte congelado (no retângulo seria 100%) → ARQUETIPO_CORTE_CONGELADO_PERDE_O_ASSUNTO, nada escrito', async () => {
    await montar()
    await nascerEEditar()
    cenario.atual = { ...cenario.atual!, catalogo: { driveFileId: 'drive-9', assunto: ASSUNTO_NO_CANTO } }
    const pagina = structuredClone(banco.pagina)
    const e = await recusa(recomporPaginaDefasada({ pageId: 'p9' }))
    expect([e.code, e.status, e.details!.escolha.corte], e.message).toEqual(['ARQUETIPO_CORTE_CONGELADO_PERDE_O_ASSUNTO', 422, 'center-middle'])
    expect(e.details!.assuntoVisivel).toBeLessThan(0.75)
    expect([banco.pngs.length, banco.rerenders.length, banco.sql]).toEqual([0, 0, []])
    expect(banco.pagina).toEqual(pagina)
  }, 180_000)

  it('IF-08: a caixa da foto mexida à mão → re-render como está, sem recompor e SEM ler a receita (corrompida aqui: lê-la recusaria)', async () => {
    await montar()
    await nascerEEditar((l) => (l.id === 'bg-foto' ? { ...l, size: { width: 1080, height: 1000 } } : trocarApoio(l)), comMascara('corrompida'))
    const antes = structuredClone(banco.pagina!.layers)
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect([r.recomposta, banco.rerenders.length, banco.entradas.length]).toEqual([false, 1, 1])
    expect(r.avisos.join(' ')).toMatch(/ajustada à mão/)
    expect(banco.pagina!.layers).toEqual(antes)
  }, 180_000)

  it('MK-14: foto trocada no editor → corte escolhido de novo, o MESMO arco (a receita da caixa)', async () => {
    await montar()
    const nova = await sharp(fotoDoRepo()).flop().jpeg().toBuffer()
    await nascerEEditar((l) => (l.id === 'bg-foto' ? { ...l, fileUrl: dataUrlJpeg(nova) } : trocarApoio(l)))
    cenario.atual = { ...cenario.atual!, foto: { url: dataUrlJpeg(nova), bytes: nova } }
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(r.recomposta).toBe(true)
    const bg = porId(banco.pagina!.layers as Layer[], 'bg-foto')
    expect(geometria(bg)).toMatchObject({ y: 806.4, w: 1080, h: 1114, mask: { shapeId: 'arco-janela', path: PATH_062 } })
  }, 180_000)

  for (const [nome, mexer] of [
    ['removida', (s: Record<string, any>) => ({ objectFit: s.objectFit, cropPosition: s.cropPosition })],
    ['shapeId trocado', (s: Record<string, any>) => ({ ...s, mask: { ...s.mask, shapeId: 'circle' } })],
    ['path trocado', (s: Record<string, any>) => ({ ...s, mask: { ...s.mask, path: 'M50 0 L100 100 L0 100 Z' } })],
  ] as const) {
    it(`IF-07 #9: máscara ${nome} à mão + texto editado → re-render como está, camadas intactas, sem ler a receita (corrompida)`, async () => {
      await montar()
      await nascerEEditar((l) => (l.id === 'bg-foto' ? { ...l, style: mexer(l.style as Record<string, any>) } : trocarApoio(l)), comMascara('corrompida'))
      const antes = structuredClone(banco.pagina!.layers)
      const r = await recomporPaginaDefasada({ pageId: 'p9' })
      expect([r.recomposta, banco.rerenders.length, banco.pngs.length]).toEqual([false, 1, 0])
      expect(r.avisos.join(' ')).toMatch(/ajustada à mão/)
      expect(banco.pagina!.layers).toEqual(antes)
    }, 180_000)
  }

  it('IF-07 legado: máscara ACRESCENTADA à mão numa peça sem máscara + texto editado → re-render como está, camadas intactas', async () => {
    await montar()
    banco.semMascara = true
    await nascerEEditar((l) => (l.id === 'bg-foto' ? { ...l, style: { ...l.style, mask: { shapeId: 'circle', path: 'M50 0 A50 50 0 1 1 49.9 0 Z' } } } : trocarApoio(l)))
    expect(banco.generations[0].fieldValues.composicao.arquetipo.foto).toBeUndefined()
    const antes = structuredClone(banco.pagina!.layers)
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect([r.recomposta, banco.rerenders.length]).toEqual([false, 1])
    expect(banco.pagina!.layers).toEqual(antes)
  }, 180_000)

  it('IF-07 legado: máscara manual INALTERADA (gravada na arte; chaves noutra ordem na página) + texto → recompõe como antes (sem receita)', async () => {
    await montar()
    banco.semMascara = true
    const manual = { shapeId: 'circle', path: 'M50 0 A50 50 0 1 1 49.9 0 Z' }
    const entrada = await nascerEEditar((l) => (l.id === 'bg-foto' ? { ...l, style: { mask: { path: manual.path, shapeId: manual.shapeId }, cropPosition: (l.style as any).cropPosition, objectFit: 'cover' } } : trocarApoio(l)))
    // A arte foi gravada COM a máscara manual (uma re-renderização como está anterior), na ordem de sempre.
    banco.generations[0].fieldValues.layersSnapshot = (entrada.fieldValues.layersSnapshot as Layer[]).map((l) => (l.id === 'bg-foto' ? { ...l, style: { ...l.style, mask: manual } } : l))
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect([r.recomposta, banco.rerenders.length, banco.pngs.length]).toEqual([true, 0, 1])
    expect(porId(banco.pagina!.layers as Layer[], 'apoio').content).toBe('Menu degustação')
  }, 180_000)

  it('legado sem máscara no arquétipo e sem receita → recompõe como antes (null, nenhuma recusa)', async () => {
    await montar()
    banco.semMascara = true
    await nascerEEditar()
    const r = await recomporPaginaDefasada({ pageId: 'p9' })
    expect(r.recomposta).toBe(true)
    expect((porId(banco.pagina!.layers as Layer[], 'bg-foto').style as any).mask).toBeUndefined()
  }, 180_000)

  it('receita presente numa peça cujo arquétipo NÃO declara máscara → ilegível, 0 consultas', async () => {
    await montar()
    banco.semMascara = true
    await nascerEEditar(trocarApoio, comMascara(receitaDoArcoJanela(CAIXA, 0.62)))
    const e = await recusaSemConsultarNemEscrever(recomporPaginaDefasada({ pageId: 'p9' }))
    expect([e.code, e.details!.problema]).toEqual(['ARQUETIPO_ESCOLHA_ILEGIVEL', expect.stringMatching(/não declara máscara/)])
  }, 180_000)
})
