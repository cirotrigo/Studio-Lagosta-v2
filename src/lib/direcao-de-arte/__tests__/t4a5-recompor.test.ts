/**
 * #5 `minimal-fb-topo-centro@1` — a RECOMPOSIÇÃO REAL da Generation (`recomporPaginaDefasada`), compositor real e fontes
 * reais. Prova que a pílula é desenhada pela RECEITA CONGELADA (`composicao.arquetipo.acentos`) e pela definição
 * versionada — nunca pelo asset vivo — e as recusas do replay (D7/D11 do preflight), todas antes de qualquer escrita:
 * - R-05/R-15: o asset `pilula-contorno` dublado com outro traço e outro raio não muda a peça; o raio gravado volta;
 * - R-06: a paleta (o estilo do serviço na assinatura) muda depois — o texto segue a assinatura viva, a pílula não repinta;
 * - R-07: copy nova — a pílula reabraça o serviço novo; R-08: foto trocada — busca nova e a pílula segue o serviço;
 * - R-09: posição congelada que não comporta a copy nova → ARQUETIPO_POSICAO_CONGELADA_NAO_CABE;
 * - R-10: peça #5 gravada sem a pílula → ARQUETIPO_ESCOLHA_ILEGIVEL (guarda D7);
 * - R-11: versão/impressão ausentes ou divergentes recusam;
 * - R-13: congelado com o id e o tipo da pílula preso à MANCHETE → ARQUETIPO_ESCOLHA_ILEGIVEL (guarda D11), sem TypeError;
 * - R-16: congelado legível com traço 16 → recusa pela conferência CURVA (ARQUETIPO_ELEMENTO_NAO_CABE);
 * - L-06: a variante gravada da logo é reproduzida, sem cantoDaLogo.
 * Dublados como no t4a4-recompor: banco em memória (não é Postgres), Blob (`put` captura), fila, render da página. Marca,
 * fotos e logo SINTÉTICAS (`cenario-5.ts`).
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
  /** Rodada 1: quantas vezes o compor chegou ao banco (`project.findUnique`) — a guarda D7/D11 recusa antes. */
  consultasDoProjeto: 0,
}))

vi.mock('@/lib/db', async () => {
  const base = (await import('./suporte/compositor')).mockDoBanco().db as Record<string, any>
  const db: Record<string, any> = {
    ...base,
    project: {
      findUnique: async (args: unknown) => (banco.consultasDoProjeto++, { ...(await base.project.findUnique(args)), id: 9005, instagramAccountId: null, titleFontFamily: 'Georgia', bodyFontFamily: 'Montserrat', subtitleFontFamily: null }),
    },
    page: {
      ...base.page,
      findUnique: async ({ where }: { where: { id: string } }) =>
        banco.pagina && where.id === banco.pagina.id ? { ...banco.pagina, Template: { id: 77, name: 'Programação', projectId: 9005 } } : null,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        banco.pagina = { ...banco.pagina, ...data }
        return { count: 1 }
      },
    },
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
    fontCombination: { findMany: async () => [] },
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
    return { url: `https://blob.test/arte-rapida/9005/p5-${banco.pngs.length}.png` }
  }),
  del: vi.fn(),
}))
vi.mock('@/lib/creatives/persist', async () => ({
  ...(await import('./suporte/compositor')).mockDaPersistencia(),
  getPublicAppUrl: () => 'https://studio.test',
  persistAndRenderCreative: async (e: Record<string, any>) => {
    banco.entradas.push(e)
    return { generationId: 'gen-5', pageId: 'p5', url: 'https://blob.test/arte-5.png' }
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
vi.mock('@/lib/posts/register-project-fonts', async () => (await import('./suporte/compositor')).mockDasFontes())
vi.mock('@/lib/creatives/server-text-measurer', async () => (await import('./suporte/compositor')).mockDoMedidor())
vi.mock('@/lib/creatives/text-autofix', async () => (await import('./suporte/compositor')).mockDoAutofix())
vi.mock('@/lib/creatives/uso-de-foto', async () => (await import('./suporte/compositor')).mockDoUsoDeFoto())
vi.mock('@/lib/creatives/acervo', async () => (await import('./suporte/compositor')).mockDoAcervo())
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('./suporte/compositor')).gradientesDoCenario,
}))

import type { Layer } from '@/types/template'
import { comporPeca } from '@/lib/compositor/compor'
import { recomporPaginaDefasada } from '@/lib/compositor/recompor'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
import { lerCopyAutoral } from '@/lib/copy-autoral'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { logoSintetica } from './suporte/sinteticos'
import { DIMENSOES, ID_TOPO_CENTRO, LOGO_CLARA, LOGO_ESCURA, cenario5, copy5, fontesNoDisco, fotoDoCenario5, medidorComFontesReais, paginaDoCenario5, spec5 } from './suporte/cenario-5'

/** Alto claro (210) com tinta escura: a desenhada CLARA não lê e a escura autorizada entra — a variante gravada é a escura. */
async function montar(opcoes: { topo?: number; base?: number; logo?: string; catalogo?: { x0: number; y0: number; x1: number; y1: number } | null } = {}) {
  const { medir } = await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  const foto = await fotoDoCenario5(DIMENSOES.story, { topo: opcoes.topo ?? 210, base: opcoes.base ?? 210 })
  const pagina = await paginaDoCenario5('p5-recompor', { tinta: '#1E1E1E', logo: opcoes.logo ?? LOGO_CLARA })
  const catalogo = opcoes.catalogo ? { driveFileId: 'drive-5', assunto: opcoes.catalogo } : null
  cenario.atual = await cenario5(pagina, medir, { foto, catalogo })
}

const porId = (layers: Layer[], id: string) => layers.find((l) => l.id === id)!
const trocarServico = (texto = 'Sábado, 15/11 · 21h') => (l: Layer): Layer => (l.id === 'servico' ? { ...l, content: texto } : l)
const specRecompor = (extra: Record<string, unknown> = {}) => spec5('p5-recompor', { copyAutoral: copy5({ servico: ['Sexta, 14/11 · 20h'] }), ...extra })

/** Compõe a peça (persistência capturada), grava a página como o persist gravaria e aplica a edição pedida. */
async function nascerEEditar(editar: (l: Layer) => Layer = trocarServico(), spec: Record<string, unknown> = specRecompor()) {
  banco.entradas = []
  await comporPeca(spec, { autor: 'u-fixture' })
  const entrada = banco.entradas.at(-1)!
  const editadas = (entrada.layers as Layer[]).map(editar)
  const revisao = revisaoDaPaginaComCamadas(lerCopyAutoral(entrada.copyAutoral).copy!, editadas, { autor: 'equipe', motivo: 'edição', superficie: 'editor' })
  banco.pagina = { id: 'p5', name: 'Topo centrado', width: 1080, height: 1920, background: entrada.background, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: revisao.copy }
  banco.generations = [{ id: 'gen-5', projectId: 9005, resultUrl: 'https://blob.test/arte-5.png', authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p5' } }]
  banco.posts = postDaArte()
  banco.pngs = []
  banco.rerenders = []
  banco.sql = []
  return entrada
}
const geometria = (l: Layer) => ({ x: l.position.x, y: l.position.y, w: l.size.width, h: l.size.height })
async function recusa(promessa: Promise<unknown>): Promise<{ code: string; status?: number; message: string; details?: Record<string, any> }> {
  try {
    await promessa
  } catch (e) {
    return e as { code: string; status?: number; message: string; details?: Record<string, any> }
  }
  throw new Error('esperava recusa')
}
/** Recusa SEM escrever: nem PNG no Blob dublê, nem Page, nem Generation, nem SQL, nem re-render. */
async function recusaSemEscrever(promessa: Promise<unknown>) {
  const [pagina, generations] = [structuredClone(banco.pagina), structuredClone(banco.generations)]
  const e = await recusa(promessa)
  expect(e).not.toBeInstanceOf(TypeError)
  expect(banco.pngs).toHaveLength(0)
  expect(banco.rerenders).toHaveLength(0)
  expect(banco.pagina).toEqual(pagina)
  expect(banco.generations).toEqual(generations)
  expect(banco.sql).toEqual([])
  return e
}
const postDaArte = () => new Map([['post-5', { id: 'post-5', projectId: 9005, status: 'DRAFT', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: ['https://blob.test/capa.png', 'https://blob.test/arte-5.png'], laterPostId: null }]])
const gravados = () => banco.generations.at(-1)!.fieldValues.composicao.arquetipo
const comAcentos = (acentos: unknown) => {
  const fv = banco.generations[0].fieldValues
  banco.generations[0].fieldValues = { ...fv, composicao: { ...fv.composicao, arquetipo: { ...fv.composicao.arquetipo, acentos } } }
}
const pilulaDe = (layers: Layer[]) => porId(layers, 'acento-pilula')
const urlDa = async (tinta: string) => dataUrl(await logoSintetica(tinta))

beforeEach(() => {
  banco.pngs = []
  banco.rerenders = []
  banco.sql = []
  banco.posts = postDaArte()
})

describe.skipIf(!fontesNoDisco())('#5 · recomposição real da Generation', () => {
  it('R-05/R-07/L-06: o asset vivo dublado (traço 6, raio 20) não muda a peça; a copy nova reabraça o serviço com a receita congelada; a variante gravada da logo volta', async () => {
    await montar()
    const entrada = await nascerEEditar(trocarServico('Sábado, 15/11 · 21h · Centro'))
    const nascida = pilulaDe(entrada.layers as Layer[])
    const escolha = gravados().buscaEspacial.escolha
    expect(escolha.logo).toEqual({ origem: 'projeto', url: await urlDa(LOGO_ESCURA) })
    expect('cantoDaLogo' in escolha).toBe(false)
    const asset = SHAPES_LIBRARY.find((a) => a.id === 'pilula-contorno')!
    const [traco, raio] = [asset.strokeWidth, asset.raio]
    asset.strokeWidth = 6
    asset.raio = 20
    try {
      const r = await recomporPaginaDefasada({ pageId: 'p5' })
      expect([r.recomposta, banco.pngs.length]).toEqual([true, 1])
    } finally {
      asset.strokeWidth = traco
      asset.raio = raio
    }
    const layers = banco.pagina!.layers as Layer[]
    const p = pilulaDe(layers)
    expect(porId(layers, 'servico').content).toBe('Sábado, 15/11 · 21h · Centro')
    // A receita congelada: traço 2, raio 9999, a cor congelada.
    expect(p.style).toMatchObject({ shapeType: 'rounded-rectangle', strokeWidth: 2, border: { radius: 9999 }, strokeColor: nascida.style?.strokeColor })
    // R-07: a pílula reabraça o serviço novo (mais largo), centrada, com a mesma folga.
    expect(p.size.width).toBeGreaterThan(nascida.size.width)
    const s = porId(layers, 'servico')
    expect(Math.abs(p.position.x - (s.position.x - 31))).toBeLessThanOrEqual(1)
    expect(Math.abs(p.size.width - (s.size.width + 62))).toBeLessThanOrEqual(1)
    // A arte regravada guarda a MESMA receita e a mesma escolha.
    expect(gravados().acentos.map(({ camada: _c, rect: _r, ...x }: any) => x)).toEqual(entrada.fieldValues.composicao.arquetipo.acentos.map(({ camada: _c, rect: _r, ...x }: any) => x))
    expect(gravados().buscaEspacial.escolha).toMatchObject({ corte: escolha.corte, deslocamentos: escolha.deslocamentos, logo: escolha.logo })
    expect(porId(layers, 'logo').fileUrl).toBe(await urlDa(LOGO_ESCURA))
  }, 120_000)

  it('R-15: o raio GRAVADO (120) volta na camada recomposta, mesmo com o asset vivo de raio 9999', async () => {
    await montar()
    await nascerEEditar()
    comAcentos(gravados().acentos.map((a: any) => ({ ...a, desenho: { ...a.desenho, raio: 120 } })))
    const r = await recomporPaginaDefasada({ pageId: 'p5' })
    expect(r.recomposta).toBe(true)
    expect((pilulaDe(banco.pagina!.layers as Layer[]).style as any).border.radius).toBe(120)
    expect(gravados().acentos[0].desenho.raio).toBe(120)
  }, 120_000)

  it('R-06: o estilo do serviço muda na assinatura depois — o texto segue a assinatura viva, a pílula NÃO repinta', async () => {
    await montar()
    const entrada = await nascerEEditar()
    const corNascida = pilulaDe(entrada.layers as Layer[]).style?.strokeColor
    const pagina = cenario.atual!.paginasDeAssinatura[0]
    pagina.layers = pagina.layers.map((l) => (l.id === 'servico-pagina' ? { ...l, style: { ...l.style, color: '#9C4A1A' } } : l))
    const r = await recomporPaginaDefasada({ pageId: 'p5' })
    expect(r.recomposta).toBe(true)
    const layers = banco.pagina!.layers as Layer[]
    expect((porId(layers, 'servico').style as any).color).toBe('#9C4A1A')
    expect(pilulaDe(layers).style?.strokeColor).toBe(corNascida)
    expect(gravados().acentos[0].cor).toBe(entrada.fieldValues.composicao.arquetipo.acentos[0].cor)
  }, 120_000)

  it('R-08: foto trocada → busca nova (dita); a pílula segue o serviço na posição nova', async () => {
    await montar()
    const nova = await fotoDoCenario5(DIMENSOES.story, { topo: 40, base: 40 })
    await nascerEEditar((l) => (l.id === 'bg-foto' ? { ...l, fileUrl: dataUrl(nova) } : trocarServico()(l)))
    cenario.atual = { ...cenario.atual!, foto: { url: dataUrl(nova), bytes: nova } }
    const r = await recomporPaginaDefasada({ pageId: 'p5' })
    expect(r.recomposta).toBe(true)
    expect(r.avisos.join(' ')).toMatch(/A foto da peça mudou/)
    const layers = banco.pagina!.layers as Layer[]
    const [p, s] = [pilulaDe(layers), porId(layers, 'servico')]
    expect(Math.abs(p.position.y - (s.position.y - 18))).toBeLessThanOrEqual(1)
    expect(Math.abs(p.position.x + p.size.width / 2 - (s.position.x + s.size.width / 2))).toBeLessThanOrEqual(1)
  }, 120_000)

  it('R-09: a copy editada que não cabe na posição congelada → ARQUETIPO_POSICAO_CONGELADA_NAO_CABE; nada movido nem escrito', async () => {
    // A peça nasce com o serviço CURTO ("20h", x ≈ 504–577) ao lado de uma região anotada (x 230–470, na altura do
    // serviço); o serviço editado para a linha longa (x ≈ 295–785) cobriria mais de 25% dela NA POSIÇÃO CONGELADA — a
    // recomposição não o move.
    await montar({ topo: 40, base: 40, catalogo: { x0: 230 / 1080, y0: 1560 / 1920, x1: 470 / 1080, y1: 1660 / 1920 } })
    await nascerEEditar(trocarServico('Sexta, 14/11 · 20h · Centro'), spec5('p5-recompor', { foto: { driveFileId: 'drive-5' }, copyAutoral: copy5({ servico: ['20h'] }) }))
    const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p5' }))
    expect([e.code, e.status], e.message).toEqual(['ARQUETIPO_POSICAO_CONGELADA_NAO_CABE', 422])
    expect(e.message).toMatch(/servico/)
  }, 120_000)

  it('R-10: peça #5 gravada sem a pílula (lista vazia ou campo ausente) → ARQUETIPO_ESCOLHA_ILEGIVEL antes de qualquer escrita', async () => {
    await montar()
    for (const acentos of [[], undefined]) {
      await nascerEEditar()
      comAcentos(acentos)
      const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p5' }))
      expect([e.code, e.status]).toEqual(['ARQUETIPO_ESCOLHA_ILEGIVEL', 422])
      expect(e.message).toMatch(/não gravou o acento obrigatório "pilula"/)
    }
  }, 120_000)

  it('R-13: congelado com o id e o tipo da pílula preso à MANCHETE → ARQUETIPO_ESCOLHA_ILEGIVEL (D11) antes de medir; sem TypeError, nada escrito', async () => {
    await montar()
    await nascerEEditar()
    comAcentos(gravados().acentos.map((a: any) => ({ ...a, presoA: 'headline' })))
    const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p5' }))
    expect([e.code, e.status]).toEqual(['ARQUETIPO_ESCOLHA_ILEGIVEL', 422])
    expect(e.message).toMatch(/preso a headline\) não é o elemento declarado/)
  }, 120_000)

  it('R-13b (rodada 1): receita de TIPO ANTIGO legível no id da pílula → ARQUETIPO_ESCOLHA_ILEGIVEL antes do banco e da medição; nada escrito, sem TypeError', async () => {
    await montar()
    await nascerEEditar()
    const antiga = { elemento: 'pilula', tipo: 'fio-fino', presoA: 'servico', corPorPapel: 'texto', canal: 'contorno', asset: { id: 'fio-fino', versao: 1 }, desenho: { shapeType: 'line', strokeWidth: 2, ajuste: 'livre' } }
    comAcentos(gravados().acentos.map((a: any) => ({ ...antiga, cor: a.cor, fonteDaCor: a.fonteDaCor })))
    const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p5' }))
    expect([e.code, e.status]).toEqual(['ARQUETIPO_ESCOLHA_ILEGIVEL', 422])
    expect(e.message).toMatch(/"pilula" \(fio-fino, preso a servico\) não é o elemento declarado/)
    // O compor direto com a mesma receita: a recusa vem ANTES de o compor tocar o banco (e, portanto, de medir).
    const antes = banco.consultasDoProjeto
    const direto = await recusa(comporPeca(specRecompor(), { autor: 'u', acentosCongelados: [{ ...antiga, cor: '#1E1E1E', fonteDaCor: 'texto-do-papel' }] as never }))
    expect(direto).not.toBeInstanceOf(TypeError)
    expect([direto.code, banco.consultasDoProjeto - antes]).toEqual(['ARQUETIPO_ESCOLHA_ILEGIVEL', 0])
  }, 120_000)

  it('R-02 (rep): receita adulterada (forma, raio, canal) → ARQUETIPO_ESCOLHA_ILEGIVEL na leitura, nada escrito', async () => {
    await montar()
    for (const mudar of [(a: any) => ({ ...a, desenho: { ...a.desenho, shapeType: 'svg-path', pathData: 'M0 0 L100 100' } }), (a: any) => ({ ...a, desenho: { ...a.desenho, raio: 0 } }), (a: any) => ({ ...a, canal: 'preenchimento' })]) {
      await nascerEEditar()
      comAcentos(gravados().acentos.map(mudar))
      const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p5' }))
      expect(e.code).toBe('ARQUETIPO_ESCOLHA_ILEGIVEL')
    }
  }, 120_000)

  it('R-16: congelado LEGÍVEL com traço 16 → recusa pela conferência curva (ARQUETIPO_ELEMENTO_NAO_CABE), nada escrito', async () => {
    await montar()
    await nascerEEditar()
    comAcentos(gravados().acentos.map((a: any) => ({ ...a, desenho: { ...a.desenho, strokeWidth: 16 } })))
    const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p5' }))
    expect([e.code, e.status]).toEqual(['ARQUETIPO_ELEMENTO_NAO_CABE', 422])
    expect(e.message).toMatch(/encostaria no contorno arredondado/)
  }, 120_000)

  it('R-11: versão ausente, impressão ausente e impressão divergente recusam antes de compor; nada escrito', async () => {
    await montar()
    for (const [arquetipo, codigo] of [
      [{ id: ID_TOPO_CENTRO }, 'ARQUETIPO_VERSAO_AUSENTE'],
      [{ id: ID_TOPO_CENTRO, versao: 1 }, 'ARQUETIPO_IMPRESSAO_AUSENTE'],
      [{ id: ID_TOPO_CENTRO, versao: 1, impressao: 'arq1-00000000000000' }, 'ARQUETIPO_IMPRESSAO_DIVERGENTE'],
    ] as const) {
      const entrada = await nascerEEditar()
      expect(entrada.fieldValues.spec.arquetipo).toEqual({ id: ID_TOPO_CENTRO, versao: 1, impressao: impressaoDoArquetipo(verArquetipo(ID_TOPO_CENTRO, 1)!) })
      banco.generations[0].fieldValues = { ...banco.generations[0].fieldValues, spec: { ...banco.generations[0].fieldValues.spec, arquetipo } }
      const e = await recusaSemEscrever(recomporPaginaDefasada({ pageId: 'p5' }))
      expect(e.code).toBe(codigo)
    }
  }, 120_000)

  it('controle: a recomposição sem adulteração reproduz a pílula na MESMA geometria (só texto, mesmo comprimento)', async () => {
    await montar()
    const entrada = await nascerEEditar(trocarServico('Sábado, 15/11 · 20h'))
    const r = await recomporPaginaDefasada({ pageId: 'p5' })
    expect(r.recomposta).toBe(true)
    const layers = banco.pagina!.layers as Layer[]
    for (const id of ['bg-foto', 'headline', 'logo']) expect(geometria(porId(layers, id)), id).toEqual(geometria(porId(entrada.layers as Layer[], id)))
    expect(Math.abs(pilulaDe(layers).position.y - pilulaDe(entrada.layers as Layer[]).position.y)).toBeLessThanOrEqual(1)
    expect(LOGO_CLARA).not.toBe(LOGO_ESCURA)
  }, 120_000)
})
