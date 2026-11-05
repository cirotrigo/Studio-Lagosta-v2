/**
 * B1d — checkpoint f: a edição da PÁGINA recupera uma falha SEMÂNTICA de render — e só ela.
 *
 * Reabre (RENDER_FAILED → PENDING) somente com: envelope semântico (`lerErroRenderSemantico`), contrato presente,
 * `laterPostId` nulo, DRAFT ou SCHEDULED com horário > agora, sem vídeo, mídia coberta pelo render da página, sem
 * retry de publicação ativo, e o pedido validado contra a página ATUAL (`admitirPedidoSemantico`, com mediaUrls []).
 * Erro comum, legado, entregue, vencido e FAILED continuam como estão. A prova do render nunca é tocada.
 *
 * O banco falso aplica os filtros que a função usa — o teste prova o predicado, não a forma da chamada.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { invalidateScheduledRenders } from '../invalidate-renders'
import { ErroRenderSemantico } from '../erro-render-semantico'

const AGORA = Date.now()
const futuro = new Date(AGORA + 3_600_000)
const passado = new Date(AGORA - 60_000)
const envelope = new ErroRenderSemantico('CONTRATO_INVALIDO', 'p1', [{ codigo: 'ALVO_NAO_RESOLVIDO' } as never]).paraRenderError()
const contrato = { _slots: { manchete: 'Noite do vinho' } }
const camadasValidas = [{ id: 't-h', name: 'Título', type: 'text', content: 'modelo', visible: true, metadata: { slot: { id: 'manchete' } } }]
const camadasSemOSlot = [{ id: 't-h', name: 'Título', type: 'text', content: 'modelo', visible: true }]

type Linha = Record<string, any>
const estado = { posts: [] as Linha[], paginas: {} as Record<string, Linha>, retries: [] as Linha[], antesDoUpdate: null as null | (() => void) }

function casa(linha: Linha, where: Linha): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Linha[]).some((c) => casa(linha, c))
    if (k === 'retries') return !estado.retries.some((r) => r.postId === linha.id && (cond.none.status.in as string[]).includes(r.status))
    const v = linha[k]
    if (cond === null) return v === null || v === undefined
    if (cond instanceof Date) return v instanceof Date && v.getTime() === cond.getTime()
    if (typeof cond !== 'object') return v === cond
    if ('in' in cond) return cond.in.includes(v)
    if ('not' in cond) return cond.not === null ? v !== null && v !== undefined : v !== cond.not
    if ('startsWith' in cond) return typeof v === 'string' && v.startsWith(cond.startsWith)
    if ('gt' in cond) return v instanceof Date && v.getTime() > cond.gt.getTime()
    if ('equals' in cond) return JSON.stringify(v) === JSON.stringify(cond.equals)
    throw new Error(`filtro não suportado no banco falso: ${k} ${JSON.stringify(cond)}`)
  })
}
const projetar = (l: Linha, select?: Linha) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, l[k]])) : l)
const cliente: any = {
  socialPost: {
    findMany: async ({ where, select }: Linha) => estado.posts.filter((p) => casa(p, where)).map((p) => projetar(p, select)),
    updateMany: async ({ where, data }: Linha) => {
      estado.antesDoUpdate?.()
      estado.antesDoUpdate = null
      let count = 0
      estado.posts = estado.posts.map((p) => (casa(p, where) ? (count++, { ...p, ...data, updatedAt: new Date(AGORA + 1) }) : p))
      return { count }
    },
  },
  page: {
    findUnique: async ({ where }: Linha) => {
      const p = estado.paginas[where.id]
      return p ? { isTemplate: p.isTemplate, layers: p.layers, Template: { projectId: p.projectId } } : null
    },
  },
}

const falha = (extra: Linha = {}): Linha => ({
  id: 'post-1', projectId: 8, postType: 'STORY', pageId: 'p1', templateId: 7, status: 'DRAFT', scheduledDatetime: null, laterPostId: null,
  renderStatus: 'RENDER_FAILED', renderError: envelope, renderAttempts: 1, nextRenderAt: null, slotValues: contrato,
  mediaUrls: [], renderedImageUrl: null, renderedAt: null, videoDaPagina: false, updatedAt: new Date(AGORA - 5_000), ...extra,
})
const editarPagina = () => invalidateScheduledRenders(cliente, { pageIds: ['p1'] })
const post = () => estado.posts.find((p) => p.id === 'post-1')!

beforeEach(() => {
  estado.paginas = { p1: { isTemplate: true, layers: camadasValidas, projectId: 8 } }
  estado.retries = []
  estado.antesDoUpdate = null
})

describe('reabre: falha semântica + página que agora aceita o pedido', () => {
  it('A. DRAFT → PENDING com exatamente a transição de recuperação', async () => {
    estado.posts = [falha({ mediaUrls: ['https://blob.test/antiga.png'], renderedImageUrl: 'https://blob.test/antiga.png', renderedAt: new Date(AGORA - 9_000) })]
    const r = await editarPagina()
    expect(r.reabertos).toBe(1)
    expect(post()).toMatchObject({ renderStatus: 'PENDING', renderAttempts: 0, renderError: null, renderedImageUrl: null, renderedAt: null, mediaUrls: [] })
    expect(post().nextRenderAt).toBeInstanceOf(Date)
    expect(post()).toMatchObject({ slotValues: contrato, pageId: 'p1', status: 'DRAFT' }) // pedido, página e status intocados
  })

  it('B. SCHEDULED futuro → PENDING; `_papeis` também', async () => {
    estado.paginas.p1.layers = [{ ...camadasValidas[0], metadata: { compositor: { papel: 'headline' }, slot: { id: 'manchete' } } }]
    estado.posts = [falha({ status: 'SCHEDULED', scheduledDatetime: futuro }), falha({ id: 'post-2', slotValues: { _papeis: { headline: 'X' } } })]
    expect((await editarPagina()).reabertos).toBe(2)
  })

  it('o envelope de OUTRA página não impede: vale a página atual do post', async () => {
    estado.posts = [falha({ renderError: new ErroRenderSemantico('PAGINA_DE_CONTEUDO', 'p-antiga').paraRenderError() })]
    expect((await editarPagina()).reabertos).toBe(1)
  })
})

describe('não reabre', () => {
  it.each([
    ['C. página ainda não aceita o pedido', () => { estado.paginas.p1.layers = camadasSemOSlot }, {}],
    ['C. página ainda é de conteúdo', () => { estado.paginas.p1.isTemplate = false }, {}],
    ['D. erro comum', () => {}, { renderError: 'Blob upload failed: 503' }],
    ['D. envelope corrompido', () => {}, { renderError: envelope.slice(0, 40) }],
    ['D. envelope com motivo desconhecido', () => {}, { renderError: envelope.replace('CONTRATO_INVALIDO', 'OUTRO') }],
    ['E. legado (sem contrato) com envelope', () => {}, { slotValues: { 't-h': 'X' } }],
    ['F. já entregue (laterPostId)', () => {}, { laterPostId: 'z1' }],
    ['G. POSTING', () => {}, { status: 'POSTING' }],
    ['G. POSTED', () => {}, { status: 'POSTED' }],
    ['H. SCHEDULED vencido', () => {}, { status: 'SCHEDULED', scheduledDatetime: passado }],
    ['H. SCHEDULED sem horário', () => {}, { status: 'SCHEDULED', scheduledDatetime: null }],
    ['I. PostStatus FAILED', () => {}, { status: 'FAILED' }],
    ['S. vídeo da página (marca, mídia já limpa)', () => {}, { videoDaPagina: true }],
    ['S. vídeo pela mídia', () => {}, { mediaUrls: ['https://blob.test/v.mp4'] }],
    ['S. carrossel', () => {}, { mediaUrls: ['https://a.png', 'https://b.png'] }],
    ['retry de publicação ativo', () => { estado.retries = [{ postId: 'post-1', status: 'PENDING' }] }, {}],
    ['retry de publicação em processamento', () => { estado.retries = [{ postId: 'post-1', status: 'PROCESSING' }] }, {}],
  ])('%s', async (_n, preparar, extra) => {
    preparar()
    estado.posts = [falha(extra)]
    const antes = { ...post() }
    expect((await editarPagina()).reabertos).toBe(0)
    expect(post()).toEqual(antes)
  })

  it('retry histórico (FAILED/SUCCESS) não bloqueia', async () => {
    estado.retries = [{ postId: 'post-1', status: 'FAILED' }, { postId: 'post-1', status: 'SUCCESS' }]
    estado.posts = [falha()]
    expect((await editarPagina()).reabertos).toBe(1)
  })
})

describe('T. concorrência: a escrita é CAS sobre a linha lida', () => {
  it.each([
    ['ganhou laterPostId', { laterPostId: 'z1' }],
    ['virou POSTING', { status: 'POSTING' }],
    ['o envelope mudou (nova falha)', { renderError: new ErroRenderSemantico('PAGINA_DE_CONTEUDO', 'p1').paraRenderError() }],
    ['o pedido mudou (updatedAt)', { updatedAt: new Date(AGORA) }],
  ])('%s entre a leitura e a escrita → não reabre', async (_n, mudanca) => {
    estado.posts = [falha()]
    estado.antesDoUpdate = () => {
      estado.posts = estado.posts.map((p) => ({ ...p, ...mudanca }))
    }
    expect((await editarPagina()).reabertos).toBe(0)
    expect(post().renderStatus).toBe('RENDER_FAILED')
  })

  it('duas edições seguidas: reabre uma vez só', async () => {
    estado.posts = [falha()]
    expect((await editarPagina()).reabertos).toBe(1)
    expect((await editarPagina()).reabertos).toBe(0)
  })
})

describe('a invalidação de sempre não muda', () => {
  it('RENDERED legado continua sendo devolvido à fila (invalidados), e não conta como reaberto', async () => {
    estado.posts = [falha({ renderStatus: 'RENDERED', renderError: null, slotValues: { 't-h': 'X' }, mediaUrls: ['https://a.png'] })]
    const r = await editarPagina()
    expect(r).toMatchObject({ invalidados: 1, reabertos: 0 })
  })
})
