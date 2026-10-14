/**
 * T1a — a RECOMPOSIÇÃO de peça com arquétipo: a spec gravada (id + versão +
 * impressão) recompõe na MESMA definição, sem âncora/alinhamento legados (o
 * arquétipo já congela a geometria — duas fontes de posição seriam o defeito),
 * nunca resolve "a mais recente" (nem quando o catálogo publica uma versão
 * nova) e recusa impressão divergente ANTES de qualquer escrita.
 *
 * Harness de `recompor-servico-repartido.test.ts`: banco falso, `comporPeca`
 * falso que valida a spec com o `validarSpec` real; e um catálogo que já
 * publicou a v2 do topo-esquerda (a v1 continua lá, imutável).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
  posts: new Map<string, Record<string, any>>(),
  specsRecebidas: [] as unknown[],
  composta: [] as Array<Record<string, any>>,
  sql: [] as unknown[][],
  puts: 0,
}))

vi.mock('@/lib/db', () => {
  const db: Record<string, any> = {
    project: { findUnique: async () => ({ id: 8, name: 'Lagosta Criativa', userId: 'dono-interno', instagramAccountId: null }) },
    page: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        banco.pagina && where.id === banco.pagina.id ? { ...banco.pagina, Template: { id: 77, name: 'Programação', projectId: 8 } } : null,
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
    postLog: { create: async ({ data }: { data: unknown }) => data },
    $executeRaw: async (_partes: TemplateStringsArray, ...valores: unknown[]) => {
      banco.sql.push(valores)
      return 1
    },
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async () => {
    banco.puts++
    return { url: 'https://blob.test/arte-rapida/8/p9-nova.png' }
  }),
  del: vi.fn(),
}))
vi.mock('@/lib/creatives/persist', () => ({
  getPublicAppUrl: () => 'https://studio.test',
  renderPageAndRegister: async () => {
    throw new Error('a recomposição desta prova não re-renderiza')
  },
}))
vi.mock('@/lib/compositor/compor', async () => {
  const { validarSpec } = await import('../spec')
  const { CreativeError } = await import('@/lib/creatives/errors')
  return {
    comporPeca: vi.fn(async (entrada: unknown) => {
      banco.specsRecebidas.push(entrada)
      const v = validarSpec(entrada)
      if (!v.spec) throw new CreativeError('SPEC_INVALIDA', `Spec inválida — ${v.problemas.join('; ')}`, 400)
      return { layers: banco.composta, prova: Buffer.from('png'), diagnostico: { avisos: [] } }
    }),
  }
})
vi.mock('@/lib/ai/generation-queue', () => ({
  marcarForcaAtendida: vi.fn(),
  marcarForcaEmExecucao: vi.fn(),
  marcarRenderComoEsta: vi.fn(),
  pedirNovaTentativa: vi.fn(),
}))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))
// 24: o catálogo já publicou a v2 do topo-esquerda (a v1 fica, imutável). "A mais recente" passa a ser a v2.
vi.mock('@/lib/compositor/arquetipos/catalogo', async (original) => {
  const real = await original<typeof import('@/lib/compositor/arquetipos/catalogo')>()
  const v1 = real.verArquetipo('minimal-fb-topo-esquerda', 1)!
  const v2 = { ...v1, versao: 2, nome: `${v1.nome} (v2)` }
  const lista = () => [...real.listarArquetipos(), JSON.parse(JSON.stringify(v2))]
  return {
    ...real,
    listarArquetipos: lista,
    verArquetipo: (id: string, versao?: number) => {
      const achado = real.resolverArquetipo(lista(), id, versao)
      return achado ? JSON.parse(JSON.stringify(achado)) : null
    },
  }
})

import { recomporPaginaDefasada } from '@/lib/compositor/recompor'
import { entradaDePersistencia } from '@/lib/compositor/persistencia'
import { resolverArquetipo } from '@/lib/compositor/arquetipos/na-spec'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
import { VERSAO_DO_CONTRATO, lerCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'
import { CreativeError } from '@/lib/creatives/errors'
import type { SpecDePeca } from '@/lib/compositor/spec'
import type { Layer } from '@/types/template'

const TOPO = 'minimal-fb-topo-esquerda'
const V1 = { id: TOPO, versao: 1, impressao: impressaoDoArquetipo(verArquetipo(TOPO, 1)!) }

function texto(id: string, papel: string, y: number, content: string) {
  return { id, name: id, type: 'text', content, visible: true, order: y, position: { x: 92, y }, size: { width: 700, height: 100 }, style: { fontSize: 40 }, metadata: { compositor: { papel } } }
}

const original: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-10-14T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Almoço de domingo'] },
    { id: 'servico', funcao: 'servico', ordem: 1, linhas: ['Dom · 12h às 16h'] },
  ],
  revisoes: [],
}
const specGravada = (arquetipo?: Record<string, unknown>) =>
  ({
    projectId: 8,
    formato: 'story',
    copyAutoral: original,
    blocos: [
      { papel: 'headline', linhas: ['Almoço de domingo'] },
      { papel: 'servico', linhas: ['Dom · 12h às 16h'] },
    ],
    foto: { url: 'https://blob.test/foto.png' },
    ...(arquetipo ? { arquetipo } : {}),
  }) as unknown as SpecDePeca
const camadas = (manchete: string) => [texto('headline', 'headline', 298, manchete), texto('servico', 'servico', 1555, 'Dom · 12h às 16h')]
/** O diagnóstico gravado: a posição da composição original e a página de assinatura com que a peça nasceu. */
const diagnostico = { posicao: { ancora: 'topo', alinha: 'esquerda', crop: 'center-middle' }, assinatura: { pageId: 'pagina-da-assinatura' } }

const CAPA = 'https://blob.test/capa.png'
const URL_ANTIGA = 'https://blob.test/arte-rapida/8/p9-antiga.png'

/** Persiste a peça (o contrato que a página grava), a equipe edita a manchete, e o slide fica pronto para recompor. */
function prepararPeca(spec: SpecDePeca) {
  const entrada = entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono-interno' }, pasta: { id: 77, name: 'Programação' }, nome: 'Domingo', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: camadas('Almoço de domingo') as unknown as Layer[], fundo: '#000', diagnostico, fotoUrl: 'https://blob.test/foto.png' })
  const editadas = camadas('Almoço de sábado')
  const revisao = revisaoDaPaginaComCamadas(lerCopyAutoral(entrada.copyAutoral).copy!, editadas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
  banco.pagina = { id: 'p9', name: 'Domingo', width: 1080, height: 1920, background: null, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: editadas, copyAutoral: revisao.copy }
  banco.generations = [{ id: 'gen-antiga', projectId: 8, resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p9' } }]
  banco.composta = camadas('Almoço de sábado')
  return entrada
}

/** A spec do último merge da arte (a recomposição grava por `$executeRaw`). */
function specDaArteGravada(): Record<string, any> | null {
  const patches = banco.sql.map((v) => { try { return JSON.parse(String(v[0])) } catch { return null } }).filter((p) => p && p.spec)
  return patches.at(-1)?.spec ?? null
}

beforeEach(() => {
  banco.sql = []
  banco.specsRecebidas = []
  banco.puts = 0
  banco.posts = new Map([['post-carrossel', { id: 'post-carrossel', projectId: 8, status: 'DRAFT', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: [CAPA, URL_ANTIGA], laterPostId: null }]])
})

describe('T1a · recomposição de peça com arquétipo', () => {
  it('24. o catálogo publicou a v2: a mais recente é outra, mas a peça gravada em v1 continua na v1', () => {
    expect(resolverArquetipo({ id: TOPO }).resolvido.versao).toBe(2)
    expect(resolverArquetipo(V1, { persistida: true }).resolvido).toEqual(V1)
  })

  it('22 + 23. recompõe no MESMO id@versao+impressão, sem âncora/alinhamento legados (a variante continua fixada)', async () => {
    const entrada = prepararPeca(specGravada(V1))
    expect((entrada.fieldValues as { spec: { arquetipo?: unknown } }).spec.arquetipo).toEqual(V1)
    await recomporPaginaDefasada({ pageId: 'p9' })
    const recebida = banco.specsRecebidas.at(-1) as SpecDePeca
    expect(recebida.arquetipo).toEqual(V1)
    expect(recebida.preferencias?.ancora).toBeUndefined()
    expect(recebida.preferencias?.alinha).toBeUndefined()
    expect(recebida.preferencias?.varianteOriginal).toBe('pagina-da-assinatura')
    expect(recebida.blocos?.[0]).toEqual({ papel: 'headline', linhas: ['Almoço de sábado'] })
    // A arte regravada guarda a MESMA definição — a próxima recomposição também não resolve "a mais recente".
    expect(specDaArteGravada()!.arquetipo).toEqual(V1)
    expect(banco.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, 'https://blob.test/arte-rapida/8/p9-nova.png'])
  })

  it('controle sem arquétipo: a recomposição congela âncora e alinhamento como sempre', async () => {
    prepararPeca(specGravada())
    await recomporPaginaDefasada({ pageId: 'p9' })
    const recebida = banco.specsRecebidas.at(-1) as SpecDePeca
    expect(recebida.arquetipo).toBeUndefined()
    expect(recebida.preferencias).toMatchObject({ ancora: 'topo', alinha: 'esquerda', varianteOriginal: 'pagina-da-assinatura' })
  })

  it('5. impressão divergente: recusa ANTES de compor, de subir PNG ou de tocar no post — sem fingir equivalência', async () => {
    prepararPeca(specGravada({ ...V1, impressao: 'arq1-00000000000000' }))
    const erro = await recomporPaginaDefasada({ pageId: 'p9' }).then(
      () => null,
      (e) => e,
    )
    expect(erro).toBeInstanceOf(CreativeError)
    expect((erro as CreativeError).code).toBe('ARQUETIPO_IMPRESSAO_DIVERGENTE')
    expect(banco.specsRecebidas).toEqual([])
    expect(banco.puts).toBe(0)
    expect(banco.posts.get('post-carrossel')!.mediaUrls).toEqual([CAPA, URL_ANTIGA])
  })

  it('peça gravada sem a impressão é recusada (a equivalência nunca é presumida)', async () => {
    prepararPeca(specGravada({ id: TOPO, versao: 1 }))
    const erro = await recomporPaginaDefasada({ pageId: 'p9' }).then(
      () => null,
      (e) => e,
    )
    expect((erro as CreativeError).code).toBe('ARQUETIPO_IMPRESSAO_AUSENTE')
    expect(banco.specsRecebidas).toEqual([])
  })

  it('peça gravada sem versão é recusada na recomposição (nunca resolve a mais recente)', async () => {
    prepararPeca(specGravada({ id: TOPO }))
    const erro = await recomporPaginaDefasada({ pageId: 'p9' }).then(
      () => null,
      (e) => e,
    )
    expect((erro as CreativeError).code).toBe('ARQUETIPO_VERSAO_AUSENTE')
    expect(banco.specsRecebidas).toEqual([])
  })
})
