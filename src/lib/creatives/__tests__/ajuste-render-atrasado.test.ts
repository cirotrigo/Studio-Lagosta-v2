/**
 * REV-FINAL-01 (revisão FINAL do Codex sobre 618e45f7, 12/09/2026): o render
 * de um ajuste que termina DEPOIS do ajuste seguinte não pode publicar.
 *
 * O caminho real de `ajustarArte` e de `agendarPost`, com o banco em memória
 * e o Blob/render falsos. A intercalação é a do achado: numa página SEM posts,
 * o ajuste A grava V1 e fica parado com o PNG na mão (antes da publicação); o
 * ajuste B lê V1, grava V2, renderiza e publica; A é liberado por último. A
 * página tem de terminar em V2 com a miniatura e a Generation mais recente de
 * B, e o primeiro agendamento pela página tem de nascer com a arte de B.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  // `any`: a página em memória tem o formato do Prisma (width, height, layers…) e é lida por `versaoDaPagina`.
  pagina: null as any,
  relogio: 1_000,
  generations: [] as Array<Record<string, any>>,
  posts: [] as Array<Record<string, any>>,
  putSeq: 0,
  apagados: [] as string[],
  /** Quando armado, o 1º `put` avisa que chegou e espera ser liberado. */
  segurarPrimeiroPut: null as null | { chegou: () => void; liberado: Promise<void> },
}))

vi.mock('@/lib/db', () => {
  const comTemplate = () => ({ ...banco.pagina, Template: { id: 77, name: 'Arte Rápida', projectId: 8 } })
  // Como o Prisma com `@updatedAt`: toda escrita na página move o carimbo.
  const tocar = (data: Record<string, unknown>) => {
    banco.pagina = { ...banco.pagina, ...data, updatedAt: new Date(++banco.relogio) }
  }
  const db: Record<string, any> = {
    project: {
      findUnique: async () => ({ id: 8, name: 'Lagosta Criativa', userId: 'dono-interno', instagramAccountId: null }),
    },
    page: {
      findUnique: async ({ where }: { where: { id: string } }) => (banco.pagina && where.id === banco.pagina.id ? comTemplate() : null),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (!banco.pagina || where.id !== banco.pagina.id) throw new Error('page not found')
        tocar(data)
        return comTemplate()
      },
      updateMany: async ({ where, data }: { where: { id: string; updatedAt?: Date }; data: Record<string, unknown> }) => {
        if (!banco.pagina || where.id !== banco.pagina.id) return { count: 0 }
        if (where.updatedAt && where.updatedAt.getTime() !== banco.pagina.updatedAt.getTime()) return { count: 0 }
        tocar(data)
        return { count: 1 }
      },
    },
    generation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `gen-${banco.generations.length + 1}`
        banco.generations.push({ id, createdAt: new Date(++banco.relogio), ...data })
        return { id }
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        banco.generations
          .filter((g) => (where.id ? g.id === where.id : true) && (where.resultUrl ? g.resultUrl === where.resultUrl : true) && (where.projectId ? g.projectId === where.projectId : true))
          .at(-1) ?? null,
    },
    socialPost: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const post = { id: `post-${banco.posts.length + 1}`, ...data }
        banco.posts.push(post)
        return post
      },
    },
    knowledgeBaseEntry: { findFirst: async () => null },
    $queryRaw: async () => [],
    $executeRaw: async () => 1,
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[])),
  }
  return { db }
})
// O client gerado mora em prisma/generated (tsconfig `paths`); o vitest não lê paths.
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (caminho: string) => {
    const n = ++banco.putSeq
    const url = `https://blob.test/${caminho}?n=${n}`
    if (n === 1 && banco.segurarPrimeiroPut) {
      banco.segurarPrimeiroPut.chegou()
      await banco.segurarPrimeiroPut.liberado
    }
    return { url }
  }),
  del: vi.fn(async (url: string | string[]) => {
    banco.apagados.push(...(Array.isArray(url) ? url : [url]))
  }),
}))
vi.mock('@/lib/canvas-renderer', () => ({
  CanvasRenderer: class {
    async renderDesign() {
      return Buffer.from('png-falso')
    }
  },
}))
vi.mock('@/lib/posts/register-project-fonts', () => ({ registerProjectFonts: async () => undefined, fetchBuffer: vi.fn() }))
vi.mock('@/lib/creatives/server-text-measurer', () => ({
  createServerTextMeasurer: async () => () => 100,
  createServerTextBoxMeasurer: async () => () => ({ width: 100, height: 100, maxLineWidth: 100, lineCount: 1 }),
}))
vi.mock('@/lib/creatives/text-autofix', () => ({
  aplicarAutofixOuFalhar: async (args: { layers: unknown[] }) => ({ layers: args.layers, autocorrecao: { aplicada: false }, avisos: [] }),
}))
vi.mock('@/lib/posts/invalidate-renders', () => ({ invalidateScheduledRenders: async () => ({ invalidados: 0, congelados: [] }) }))
vi.mock('@/lib/compositor/recompor', () => ({
  travarRecomposicaoDaArte: vi.fn(async () => undefined),
  pedirRecomposicaoDaArteCongelada: vi.fn(async () => null),
}))
vi.mock('@/lib/creatives/ingerir-midia', () => ({ ingerirMidiaExterna: async (urls: string[]) => ({ urls, falhas: [] }) }))
vi.mock('@/lib/aprendizado/sinal-de-agendamento', () => ({
  registrarSlotDoPost: async () => null,
  registrarCopyDoPost: async () => null,
  fecharSugestaoDeSlot: async () => null,
}))
vi.mock('@/lib/aprendizado/sinal-de-legenda', () => ({ registrarLegendaDoPost: async () => null }))
vi.mock('@/lib/posts/artes-do-post', () => ({ registrarArtesDoPost: async () => ({ artes: [] }) }))
vi.mock('@/lib/compositor/pastas', () => ({ moverPaginaParaSemana: async () => undefined }))

import { ajustarArte } from '../arte-rapida'
import { agendarPost } from '../agendar'
import { CreativeError } from '../errors'
import { versaoDaPagina } from '../revisao/versao'

function paginaInicial() {
  return {
    id: 'p1',
    name: 'Peça sem post',
    width: 1080,
    height: 1920,
    background: '#101010',
    isTemplate: false,
    templateId: 77,
    thumbnail: 'https://blob.test/render-da-composicao.png',
    updatedAt: new Date(banco.relogio),
    layers: [
      { id: 't1', name: 'headline', type: 'text', content: 'Almoço executivo', visible: true, order: 1, position: { x: 100, y: 1500 }, size: { width: 880, height: 120 }, style: { fontSize: 80, fontFamily: 'Montserrat', fill: '#ffffff' } },
      { id: 't2', name: 'servico', type: 'text', content: 'Até 15h', visible: true, order: 2, position: { x: 100, y: 1650 }, size: { width: 880, height: 60 }, style: { fontSize: 40, fontFamily: 'Montserrat', fill: '#ffffff' } },
    ],
  }
}

const yDaManchete = () => (banco.pagina!.layers as Array<Record<string, any>>).find((l) => l.id === 't1')!.position.y

/** Arma o 1º `put` para parar; devolve quando ele chegou e como liberá-lo. */
function segurarOPrimeiroRender() {
  let chegou!: () => void
  let liberar!: () => void
  const chegouLa = new Promise<void>((pronto) => (chegou = pronto))
  banco.segurarPrimeiroPut = { chegou: () => chegou(), liberado: new Promise<void>((pronto) => (liberar = pronto)) }
  return { chegouLa, liberar: () => liberar() }
}

beforeEach(() => {
  banco.relogio = 1_000
  banco.pagina = paginaInicial()
  banco.generations = []
  banco.posts = []
  banco.putSeq = 0
  banco.apagados = []
  banco.segurarPrimeiroPut = null
})

describe('REV-FINAL-01 — o render atrasado de um ajuste não publica a versão obsoleta', () => {
  it('A grava V1 e para com o PNG; B lê V1, grava V2 e publica; A liberado por último é DESCARTADO — página, miniatura, Generation e o 1º agendamento ficam com V2', async () => {
    const { chegouLa, liberar } = segurarOPrimeiroRender()
    const v0 = versaoDaPagina(banco.pagina!)!

    const a = ajustarArte({ projectId: 8, pageId: 'p1', versaoEsperada: v0, ajustes: [{ tipo: 'mover', camadas: ['t1'], dy: -10 }] }).then(
      (resultado) => ({ resultado, erro: null as unknown }),
      (erro: unknown) => ({ resultado: null, erro }),
    )
    await chegouLa
    // A gravou V1 (thumbnail invalidada na mesma escrita) e está com o PNG de V1 na mão, antes de publicar.
    expect(yDaManchete()).toBe(1490)
    expect(banco.pagina!.thumbnail).toBeNull()
    const urlDeA = `https://blob.test/arte-rapida/8/p1-`
    const v1 = versaoDaPagina(banco.pagina!)!
    expect(v1).not.toBe(v0)

    const b = await ajustarArte({ projectId: 8, pageId: 'p1', versaoEsperada: v1, ajustes: [{ tipo: 'mover', camadas: ['t1'], dy: -20 }] })
    liberar()
    const fimDeA = await a

    // A: o ajuste foi gravado, a arte da versão dele foi descartada — com código e sem fingir sucesso.
    expect(fimDeA.resultado).toBeNull()
    expect(fimDeA.erro).toBeInstanceOf(CreativeError)
    expect((fimDeA.erro as CreativeError).code).toBe('PAGINA_MUDOU_DURANTE')
    expect((fimDeA.erro as CreativeError).status).toBe(409)
    expect((fimDeA.erro as CreativeError).details).toMatchObject({ ajusteGravado: true })

    // A página está em V2 (os dois ajustes), e a versão que B devolveu é a dela.
    expect(yDaManchete()).toBe(1470)
    expect(versaoDaPagina(banco.pagina!)).toBe(b.versao)

    // A miniatura é a de B, nunca a de A.
    expect(banco.pagina!.thumbnail).toBe(b.url)
    expect(b.url).toContain('?n=2')

    // A Generation mais recente — e a única criada — é a de B; o PNG de A foi apagado do Blob.
    expect(banco.generations).toHaveLength(1)
    expect(banco.generations.at(-1)).toMatchObject({ id: b.generationId, resultUrl: b.url })
    expect(banco.generations.some((g) => String(g.resultUrl).endsWith('?n=1'))).toBe(false)
    expect(banco.apagados).toEqual([expect.stringMatching(/\?n=1$/)])
    expect(banco.apagados[0].startsWith(urlDeA)).toBe(true)

    // O primeiro agendamento pela página reutiliza a miniatura de B como mídia RENDERED, vinculada à Generation de B.
    await agendarPost({ projectId: 8, pageId: 'p1', postType: 'STORY', scheduledDatetime: '2026-10-01 10:00', situacao: 'rascunho' })
    expect(banco.posts).toHaveLength(1)
    expect(banco.posts[0]).toMatchObject({ mediaUrls: [b.url], renderStatus: 'RENDERED', renderedImageUrl: b.url, generationId: b.generationId, pageId: 'p1' })
  })

  it('sem concorrência o ajuste publica como sempre: miniatura, Generation e agendamento com a arte dele', async () => {
    const v0 = versaoDaPagina(banco.pagina!)!
    const r = await ajustarArte({ projectId: 8, pageId: 'p1', versaoEsperada: v0, ajustes: [{ tipo: 'mover', camadas: ['t1'], dy: -10 }] })
    expect(banco.pagina!.thumbnail).toBe(r.url)
    expect(banco.generations).toHaveLength(1)
    expect(banco.generations[0]).toMatchObject({ id: r.generationId, resultUrl: r.url })
    expect(banco.apagados).toEqual([])
    await agendarPost({ projectId: 8, pageId: 'p1', postType: 'STORY', scheduledDatetime: '2026-10-01 10:00', situacao: 'rascunho' })
    expect(banco.posts[0]).toMatchObject({ mediaUrls: [r.url], renderStatus: 'RENDERED' })
  })

  it('a versão é do CONTEÚDO: o autosave que só troca a miniatura no meio do render não descarta a arte', async () => {
    const { chegouLa, liberar } = segurarOPrimeiroRender()
    const v0 = versaoDaPagina(banco.pagina!)!
    const a = ajustarArte({ projectId: 8, pageId: 'p1', versaoEsperada: v0, ajustes: [{ tipo: 'mover', camadas: ['t1'], dy: -10 }] })
    await chegouLa
    // O PageSync grava só o JPEG base64 da miniatura: `updatedAt` muda, o que a arte desenha não.
    banco.pagina = { ...banco.pagina, thumbnail: 'data:image/jpeg;base64,AAAA', updatedAt: new Date(++banco.relogio) }
    liberar()
    const r = await a
    expect(banco.pagina!.thumbnail).toBe(r.url)
    expect(banco.generations).toHaveLength(1)
    expect(banco.apagados).toEqual([])
  })
})
