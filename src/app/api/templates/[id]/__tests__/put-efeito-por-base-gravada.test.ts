/**
 * PR3-R9-01 (revisão do Codex sobre cd98cd6d, 20/09/2026): o PUT do template
 * decidia "o visual mudou?" comparando o payload com a leitura do COMEÇO do
 * handler, enquanto `gravarCamadasComRevisao` relê a página e grava sobre a
 * versão concorrente.
 *
 * Intercalação: o PUT lê X; um PATCH concorrente grava Y; o helper relê Y e
 * grava X por compare-and-set. A página foi de Y para X — mas a comparação
 * contra a leitura inicial (também X) dizia "nada mudou", e aquela gravação
 * ficava fora de `paginasAlteradas`: sem invalidar a imagem única e sem pedir
 * a recomposição do slide de carrossel. É a MESMA lição do REV-01 da 3ª
 * rodada, que o PATCH da página já aprendeu.
 *
 * O handler real, o banco em memória, com a invalidação e a recomposição
 * observadas (e não só simuladas).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as any,
  relogio: 1_000,
  /** Roda uma vez ANTES da N-ésima leitura da página pelo helper. */
  antesDaLeitura: {} as Record<number, () => void>,
  leituras: 0,
  /** Posts já entregues ao publicador (a consulta de congelados do handler). */
  armados: [] as Array<{ id: string }>,
}))

const invalidados = vi.hoisted(() => [] as string[][])
const recompostos = vi.hoisted(() => [] as string[][])
/** O `after()` do Next: aqui a callback roda, para o pedido de recomposição ser observável. */
const depois = vi.hoisted(() => [] as Array<() => Promise<void> | void>)

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) },
  after: (fn: () => Promise<void> | void) => {
    depois.push(fn)
  },
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_equipe', orgId: null }) }))
vi.mock('@/lib/projects/access', () => ({ hasProjectReadAccess: () => true, hasProjectWriteAccess: () => true, withProjectOwner: async (p: unknown) => p }))
vi.mock('@/lib/templates/miniatura', () => ({ guardarMiniatura: async (u: string) => u }))
vi.mock('@/lib/posts/invalidate-renders', async () => ({
  invalidateScheduledRenders: vi.fn(async (_tx: unknown, args: { pageIds: string[] }) => {
    invalidados.push([...args.pageIds])
    return { invalidados: args.pageIds.length, congelados: [] as string[] }
  }),
  normalizeLayersString: (await import('@/lib/posts/page-layers')).normalizeLayersString,
}))
vi.mock('@/lib/compositor/recompor', () => ({
  pedirRecomposicaoDaArteCongelada: vi.fn(async (pageIds: string[]) => {
    recompostos.push([...pageIds])
    return []
  }),
}))
vi.mock('@/lib/db', () => {
  const copia = () => structuredClone(banco.pagina)
  const db: Record<string, any> = {
    template: {
      findFirst: async () => ({ id: 77, Project: { id: 8, organizationProjects: [] } }),
      update: async () => ({ id: 77, name: 'Programação' }),
    },
    page: {
      findUnique: async () => {
        const n = ++banco.leituras
        const fn = banco.antesDaLeitura[n]
        delete banco.antesDaLeitura[n]
        fn?.()
        return copia()
      },
      findMany: async ({ where }: { where: Record<string, any> }) => (where.templateId === 77 ? [copia()] : []),
      updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date }; data: Record<string, unknown> }) => {
        if (where.updatedAt && where.updatedAt.getTime() !== banco.pagina.updatedAt.getTime()) return { count: 0 }
        banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
        return { count: 1 }
      },
      create: async () => {
        throw new Error('não esperava página nova')
      },
      deleteMany: async () => ({ count: 0 }),
    },
    socialPost: { findMany: async () => banco.armados.map((p) => ({ ...p })) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { db }
})

import { PUT as putDoTemplate } from '../route'
import { VERSAO_DO_CONTRATO, revisaoDaPaginaComCamadas, type CopyAutoral } from '@/lib/copy-autoral'
import { normalizeLayersString } from '@/lib/posts/page-layers'

type Camada = Record<string, any>
function texto(id: string, y: number, content: string): Camada {
  return { id, name: id, type: 'text', content, visible: true, locked: false, order: y, position: { x: 100, y }, size: { width: 800, height: 60 }, style: { fontSize: 40 }, metadata: { compositor: { papel: id } } }
}
const contrato: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake'] },
    { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Sexta é dia'] },
  ],
  revisoes: [],
}
/** X: o que o editor tem aberto e vai salvar. */
const camadasX = [texto('headline', 200, 'Milk-shake'), texto('apoio', 400, 'Sexta é dia')]
/** Y: o que outro caminho (autosave de camada, outra aba) grava no meio. */
const camadasY = [texto('headline', 200, 'Milk-shake'), texto('apoio', 400, 'Domingo também')]

const req = (body: unknown) => ({ json: async () => structuredClone(body) }) as unknown as Request
const salvar = (layers: Camada[], extra: Record<string, unknown> = {}) =>
  putDoTemplate(
    req({ designData: { canvas: { width: 1080, height: 1920 }, pages: [{ id: 'p1', name: 'Sexta', width: 1080, height: 1920, layers, background: '#ffffff', order: 0, ...extra }] } }),
    { params: Promise.resolve({ id: '77' }) },
  )
const camadasNoBanco = (): Camada[] => (typeof banco.pagina.layers === 'string' ? JSON.parse(banco.pagina.layers) : banco.pagina.layers)
async function rodarOsDepois() {
  const fila = depois.splice(0)
  for (const fn of fila) await fn()
}

/** O PATCH concorrente: grava Y com o contrato revisado, como o autosave de camada faz. */
function outraEscritaGravaY() {
  const revisao = revisaoDaPaginaComCamadas(banco.pagina.copyAutoral, camadasY, { autor: 'equipe', motivo: 'edição de camada no editor', superficie: 'editor' })
  banco.pagina = { ...banco.pagina, layers: JSON.stringify(camadasY), copyAutoral: revisao.copy ?? banco.pagina.copyAutoral, updatedAt: new Date(++banco.relogio) }
}

beforeEach(() => {
  banco.pagina = { id: 'p1', templateId: 77, name: 'Sexta', order: 0, isTemplate: false, tags: [], width: 1080, height: 1920, background: '#ffffff', layers: JSON.stringify(camadasX), copyAutoral: contrato, updatedAt: new Date(banco.relogio) }
  banco.antesDaLeitura = {}
  banco.leituras = 0
  banco.armados = []
  invalidados.length = 0
  recompostos.length = 0
  depois.length = 0
})

describe('o efeito colateral do PUT sai da base EFETIVAMENTE substituída (PR3-R9-01)', () => {
  it('escrita concorrente entre a leitura inicial e a gravação: as camadas voltam a X, a imagem única é invalidada e o slide é recomposto', async () => {
    banco.antesDaLeitura[1] = outraEscritaGravaY

    const r = await salvar(camadasX)
    expect(r.status).toBe(200)

    // o que ficou gravado é X (último a gravar vence, como sempre foi)
    expect(camadasNoBanco().map((c) => c.content)).toEqual(['Milk-shake', 'Sexta é dia'])
    // e o contrato acompanha a volta, porque a revisão foi medida contra Y
    expect(banco.pagina.copyAutoral.blocos.find((b: any) => b.id === 'apoio').linhas).toEqual(['Sexta é dia'])

    // 🔴 o efeito colateral: a página MUDOU (de Y para X)
    expect(invalidados).toEqual([['p1']])
    await rodarOsDepois()
    expect(recompostos).toEqual([['p1']])
  })

  it('o mesmo, com a concorrente mudando só o FUNDO: dimensões e background entram na comparação protegida', async () => {
    banco.antesDaLeitura[1] = () => {
      banco.pagina = { ...banco.pagina, background: '#101010', updatedAt: new Date(++banco.relogio) }
    }

    await salvar(camadasX)
    expect(banco.pagina.background).toBe('#ffffff')
    expect(invalidados).toEqual([['p1']])
    await rodarOsDepois()
    expect(recompostos).toEqual([['p1']])
  })

  it('post já entregue ao publicador é reportado e NÃO é desfeito pela invalidação', async () => {
    banco.armados = [{ id: 'post-armado' }]
    banco.antesDaLeitura[1] = outraEscritaGravaY

    const r = await salvar(camadasX)
    expect((r as unknown as { body: Record<string, unknown> }).body.postsCongelados).toEqual(['post-armado'])
    expect(invalidados).toEqual([['p1']])
  })

  it('controle: sem escrita concorrente, salvar camadas idênticas não invalida nem recompõe', async () => {
    await salvar(camadasX)
    expect(normalizeLayersString(banco.pagina.layers)).toBe(normalizeLayersString(camadasX))
    expect(invalidados).toEqual([])
    await rodarOsDepois()
    expect(recompostos).toEqual([])
  })

  it('controle: salvar texto novo (sem concorrência) invalida e recompõe, como antes', async () => {
    await salvar(camadasY)
    expect(camadasNoBanco()[1].content).toBe('Domingo também')
    expect(invalidados).toEqual([['p1']])
    await rodarOsDepois()
    expect(recompostos).toEqual([['p1']])
  })
})
