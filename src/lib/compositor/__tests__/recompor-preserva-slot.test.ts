/**
 * PR B0: a recomposição mantém a MESMA ocorrência lógica de cada camada, então
 * o `metadata.slot` da página atravessa o `comporPeca` (que desenha do zero) —
 * pela reconciliação conservadora de `transportarSlots`. O mesmo array
 * reconciliado vai para `Page.layers`, para a versão e para o `layersSnapshot`.
 *
 * Mesmo percurso real de `recompor-servico-repartido.test.ts` (o `comporPeca`
 * falso valida a spec pelo `validarSpec` real).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as Record<string, any> | null,
  generations: [] as Array<Record<string, any>>,
  posts: new Map<string, Record<string, any>>(),
  specsRecebidas: [] as unknown[],
  composta: [] as Array<Record<string, any>>,
  sql: [] as unknown[][],
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
vi.mock('@vercel/blob', () => ({ put: vi.fn(async () => ({ url: 'https://blob.test/arte-rapida/8/p9-nova.png' })), del: vi.fn() }))
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

import { recomporPaginaDefasada } from '@/lib/compositor/recompor'
import { entradaDePersistencia } from '@/lib/compositor/persistencia'
import { revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
import { VERSAO_DO_CONTRATO, lerCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'
import { validarSpec, type SpecDePeca } from '@/lib/compositor/spec'
import type { Layer } from '@/types/template'
import { prepararCamadasParaGravar } from '@/lib/creatives/layer-contract'

function texto(id: string, papel: string, y: number, content: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    type: 'text',
    content,
    visible: true,
    order: y,
    position: { x: 100, y },
    size: { width: 880, height: 60 },
    style: { fontSize: 40 },
    metadata: { compositor: { papel }, ...extra },
  }
}

const original: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Almoço executivo'] },
    { id: 'servico', funcao: 'servico', ordem: 1, linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] },
  ],
  revisoes: [],
}
const spec = { projectId: 8, formato: 'story', copyAutoral: original, blocos: [{ papel: 'headline', linhas: ['Almoço executivo'] }, { papel: 'servico', linhas: ['Das 11h às 15h', 'Rua Aleixo Netto, 1158'] }], foto: { url: 'https://blob.test/foto.png' } } as unknown as SpecDePeca

/** O que o compositor desenha (sem slot nenhum — ele não conhece slots). */
const composta = (manchete: string) => [texto('headline', 'headline', 300, manchete), texto('servico', 'servico', 1600, 'Das 11h às 15h'), texto('servico-2', 'servico', 1680, 'Rua Aleixo Netto, 1158')]

const CAPA = 'https://blob.test/capa.png'
const URL_ANTIGA = 'https://blob.test/arte-rapida/8/p9-antiga.png'

/** O último merge da arte (a recomposição grava `fieldValues` por `$executeRaw`). */
function patchDaArte(): Record<string, any> {
  const patches = banco.sql.map((v) => { try { return JSON.parse(String(v[0])) } catch { return null } }).filter((p) => p && p.layersSnapshot)
  expect(patches.length).toBeGreaterThan(0)
  return patches.at(-1)!
}

const slotDe = (l: Record<string, any>) => l.metadata?.slot

/** Monta a página editada (só a manchete mudou) e roda a recomposição. */
async function recomporCom(paginaEditada: Array<Record<string, any>>) {
  const entrada = entradaDePersistencia({ spec, opcoes: {}, projeto: { id: 8, name: 'Lagosta', userId: 'dono-interno' }, pasta: { id: 77, name: 'Programação' }, nome: 'Sexta', ordem: 0, canvas: { width: 1080, height: 1920 }, layers: composta('Almoço executivo') as unknown as Layer[], fundo: '#000', diagnostico: {}, fotoUrl: 'https://blob.test/foto.png' })
  const daPagina = lerCopyAutoral(entrada.copyAutoral).copy!
  const revisao = revisaoDaPaginaComCamadas(daPagina, paginaEditada, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
  expect(revisao.estado).toBe('registrada')
  banco.pagina = { id: 'p9', name: 'Sexta', width: 1080, height: 1920, background: null, isTemplate: false, templateId: 77, updatedAt: new Date(5_000), layers: paginaEditada, copyAutoral: revisao.copy }
  banco.generations = [{ id: 'gen-antiga', projectId: 8, resultUrl: URL_ANTIGA, authorName: 'compositor', sourcePageId: null, fieldValues: { ...entrada.fieldValues, pageId: 'p9' } }]
  banco.composta = composta('Almoço de sexta')
  return recomporPaginaDefasada({ pageId: 'p9' })
}

beforeEach(() => {
  banco.sql = []
  banco.specsRecebidas = []
  banco.posts = new Map([['post-carrossel', { id: 'post-carrossel', projectId: 8, status: 'DRAFT', pageId: null, renderStatus: 'NOT_NEEDED', mediaUrls: [CAPA, URL_ANTIGA], laterPostId: null }]])
})

describe('recomposição preserva metadata.slot (PR B0)', () => {
  const editadaComSlots = () => {
    const c = composta('Almoço de sexta') as Array<Record<string, any>>
    c[1] = { ...c[1], metadata: { ...c[1].metadata, slot: { id: 'servico-horario' } } }
    c[2] = { ...c[2], metadata: { ...c[2].metadata, slot: { id: 'servico-endereco' } } }
    return c
  }

  it('edição só textual recompõe e o slot fica em Page.layers', async () => {
    const r = await recomporCom(editadaComSlots())
    expect(r.recomposta).toBe(true)
    const gravadas = banco.pagina!.layers as Array<Record<string, any>>
    expect(gravadas.map(slotDe)).toEqual([undefined, { id: 'servico-horario' }, { id: 'servico-endereco' }])
  })

  it('o MESMO array reconciliado vai para o layersSnapshot', async () => {
    await recomporCom(editadaComSlots())
    expect(patchDaArte().layersSnapshot).toEqual(banco.pagina!.layers)
  })

  it('metadata.compositor é o da composição nova, e a copy autoral segue correta', async () => {
    await recomporCom(editadaComSlots())
    const gravadas = banco.pagina!.layers as Array<Record<string, any>>
    expect(gravadas.map((l) => l.metadata.compositor)).toEqual(composta('x').map((l) => l.metadata.compositor))
    const final = lerCopyAutoral(banco.pagina!.copyAutoral).copy!
    expect(final.blocos.find((b) => b.funcao === 'headline')!.linhas).toEqual(['Almoço de sexta'])
    expect(final.blocos.filter((b) => b.funcao === 'servico')).toHaveLength(1)
  })

  it('página SEM slot: a gravação é exatamente a de antes (as camadas da composição normalizadas)', async () => {
    await recomporCom(composta('Almoço de sexta'))
    expect(banco.pagina!.layers).toEqual(prepararCamadasParaGravar(composta('Almoço de sexta')).camadas)
    expect(patchDaArte().layersSnapshot).toEqual(banco.pagina!.layers)
  })
})
