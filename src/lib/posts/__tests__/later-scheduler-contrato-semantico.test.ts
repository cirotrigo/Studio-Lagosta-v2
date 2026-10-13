/**
 * B1d — checkpoint c no `LaterPostScheduler`: a ADMISSÃO no `createPost` e a GUARDA de envio no `sendToLater`.
 *
 * - `createPost` com `_slots`/`_papeis` só grava depois de `admitirPedidoSemantico` (antes de qualquer efeito).
 * - `sendToLater` reserva com UM `UPDATE` condicional cujo WHERE também exige a ausência das chaves do
 *   contrato novo: post semântico nunca chega ao Zernio enquanto não existir prova do render (checkpoint e) —
 *   nem com `RENDERED` vindo de mídia fornecida. O legado reserva exatamente como antes.
 *
 * Banco e Zernio falsos: o predicado SQL em si é conferido à parte, num Postgres de verdade.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({
  pagina: null as any,
  post: null as any,
  /** Linhas afetadas pela reserva em SQL (o banco decide; aqui o teste decide). */
  reservadas: 1,
  /** O que o `RETURNING` da reserva devolve (a linha como o gate a viu). */
  linhaReservada: { mediaUrls: [] as string[], slotValues: null as unknown },
  sqlDaReserva: [] as string[],
  criados: [] as any[],
}))

// A trava da agenda do projeto (H4) roda a criação numa transação; aqui ela só repassa o banco falso.
vi.mock('@/lib/trava-por-chave', async () => {
  const { db } = await import('@/lib/db')
  return { chaveDaAgenda: (id: number) => `agenda-slot:${id}`, comTravaPorChave: async (_chave: string, fazer: (tx: unknown) => unknown) => fazer(db) }
})
vi.mock('@/lib/db', () => ({
  db: {
    page: { findUnique: vi.fn(async () => banco.pagina) },
    generation: { findUnique: vi.fn(async () => null) },
    socialPost: {
      create: vi.fn(async ({ data }: any) => {
        banco.criados.push(data)
        return { id: 'novo', ...data }
      }),
      update: vi.fn(async ({ data }: any) => ({ id: 'novo', postType: 'STORY', ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => banco.post),
    },
    postLog: { create: vi.fn(async () => ({})) },
    // O SQL com os fragmentos (Prisma.sql) expandidos: é o texto que o banco recebe.
    $queryRaw: vi.fn(async (partes: TemplateStringsArray, ...valores: any[]) => {
      banco.sqlDaReserva.push(partes.map((p, i) => p + (i < valores.length ? (valores[i]?.sql ?? '?') : '')).join(''))
      return banco.reservadas ? [banco.linhaReservada] : []
    }),
  },
}))
vi.mock('@/lib/credits/deduct', () => ({ deductCreditsForFeature: vi.fn() }))
vi.mock('@vercel/blob', () => ({ put: vi.fn() }))
vi.mock('@/lib/posts/verification/tag-generator', () => ({ generateVerificationTag: () => 'TAG' }))
const zernio = vi.hoisted(() => ({ createPost: vi.fn(), uploadMedia: vi.fn() }))
vi.mock('@/lib/later', () => ({ getLaterClient: () => zernio }))
vi.mock('@/lib/images/auto-crop', () => ({ cropToInstagramFeed: vi.fn() }))
vi.mock('../failure-handler', () => ({ handlePublishFailure: vi.fn() }))
vi.mock('../ensure-post-generation', () => ({ ensurePostGeneration: vi.fn(async () => null) }))

import { LaterPostScheduler } from '../later-scheduler'
import { ErroAdmissaoSemantica } from '../admitir-pedido-semantico'
import { db } from '@/lib/db'

const camadas = [{ id: 't-h', name: 'Título', type: 'text', content: 'modelo', visible: true, metadata: { slot: { id: 'manchete' } } }]
const paginaModelo = { id: 'p1', isTemplate: true, layers: camadas, audio: null, Template: { projectId: 8 } }
const pedido = (extra: Record<string, unknown> = {}) =>
  ({ projectId: 8, userId: 'u1', postType: 'STORY', caption: 'c', mediaUrls: [], scheduleType: 'SCHEDULED', scheduledDatetime: '2026-10-20T15:00:00.000Z', pageId: 'p1', slotValues: { _slots: { manchete: 'Noite do vinho' } }, ...extra }) as any

beforeEach(() => {
  vi.clearAllMocks()
  banco.pagina = paginaModelo
  banco.post = null
  banco.reservadas = 1
  banco.linhaReservada = { mediaUrls: [], slotValues: null }
  banco.sqlDaReserva = []
  banco.criados = []
})

describe('createPost: admissão do contrato novo antes do insert', () => {
  it('A. STORY semântico válido em página modelo, sem mídia: grava PENDING com o pedido', async () => {
    await new LaterPostScheduler().createPost(pedido())
    expect(banco.criados).toHaveLength(1)
    expect(banco.criados[0]).toMatchObject({ renderStatus: 'PENDING', mediaUrls: [], slotValues: { _slots: { manchete: 'Noite do vinho' } } })
  })

  it('B. `_slots: null`: recusa antes do insert', async () => {
    await expect(new LaterPostScheduler().createPost(pedido({ slotValues: { _slots: null } }))).rejects.toBeInstanceOf(ErroAdmissaoSemantica)
    expect(db.socialPost.create).not.toHaveBeenCalled()
  })

  it('C–E. slot inexistente, página de conteúdo, sem pageId: recusa antes do insert', async () => {
    const s = new LaterPostScheduler()
    await expect(s.createPost(pedido({ slotValues: { _slots: { inexistente: 'X' } } }))).rejects.toMatchObject({ codigo: 'CONTRATO_INVALIDO' })
    banco.pagina = { ...paginaModelo, isTemplate: false }
    await expect(s.createPost(pedido())).rejects.toMatchObject({ codigo: 'CONTRATO_EM_PAGINA_DE_CONTEUDO' })
    banco.pagina = paginaModelo
    await expect(s.createPost(pedido({ pageId: undefined }))).rejects.toMatchObject({ codigo: 'CONTRATO_SEM_PAGINA' })
    expect(db.socialPost.create).not.toHaveBeenCalled()
  })

  it('F. contrato novo + mídia pronta: recusa, e nunca nasce RENDERED', async () => {
    await expect(new LaterPostScheduler().createPost(pedido({ mediaUrls: ['https://cliente.jpg'] }))).rejects.toMatchObject({ codigo: 'CONTRATO_COM_MIDIA_PRONTA' })
    expect(db.socialPost.create).not.toHaveBeenCalled()
  })

  it('legado com mídia pronta: segue nascendo RENDERED, como hoje', async () => {
    await new LaterPostScheduler().createPost(pedido({ slotValues: { 't-h': 'X' }, mediaUrls: ['https://editor.jpg'] }))
    expect(banco.criados[0]).toMatchObject({ renderStatus: 'RENDERED' })
  })
})

describe('sendToLater: o contrato novo não chega ao Zernio sem prova do render', () => {
  it('a reserva é UM UPDATE condicional que exige, no próprio WHERE, a ausência das chaves do contrato', async () => {
    banco.reservadas = 0
    banco.post = { id: 'p', laterPostId: null, status: 'SCHEDULED', slotValues: null }
    await new LaterPostScheduler().sendToLater('p')
    const sql = banco.sqlDaReserva[0]
    expect(sql).toMatch(/UPDATE "SocialPost"/)
    expect(sql).toMatch(/"laterPostId" IS NULL/)
    expect(sql).toMatch(/NOT IN \('POSTING'::"PostStatus", 'POSTED'::"PostStatus"\)/)
    expect(sql).toMatch(/jsonb_typeof\("SocialPost"\."slotValues"\) IS DISTINCT FROM 'object'/)
    expect(sql).toMatch(/NOT jsonb_exists\("SocialPost"\."slotValues", '_slots'\)/)
    expect(sql).toMatch(/NOT jsonb_exists\("SocialPost"\."slotValues", '_papeis'\)/)
    expect(db.socialPost.updateMany).not.toHaveBeenCalled()
  })

  it.each([
    ['I. PENDING + mídia antiga', 'PENDING'],
    ['J. RENDER_FAILED + mídia antiga', 'RENDER_FAILED'],
    ['K. RENDERED só porque a mídia foi fornecida', 'RENDERED'],
  ])('%s: não reserva, não chama o Zernio, devolve o bloqueio', async (_n, renderStatus) => {
    banco.reservadas = 0 // o WHERE recusou: as chaves estão lá
    banco.post = { id: 'p', laterPostId: null, status: 'SCHEDULED', renderStatus, mediaUrls: ['https://antiga.png'], slotValues: { _slots: { manchete: 'X' } } }
    const r = await new LaterPostScheduler().sendToLater('p')
    expect(r).toMatchObject({ success: false, skipped: true, bloqueado: 'CONTRATO_SEM_PROVA_DE_RENDER' })
    expect(zernio.createPost).not.toHaveBeenCalled()
    expect(db.socialPost.update).not.toHaveBeenCalled()
  })

  it('L. legado: reservado segue o caminho de envio de hoje (lê o post completo para enviar)', async () => {
    banco.reservadas = 1
    banco.post = null // depois da reserva, o envio relê o post; sem ele, o fluxo de hoje falha adiante
    await new LaterPostScheduler().sendToLater('p').catch(() => undefined)
    expect(db.socialPost.findUnique).toHaveBeenCalledWith(expect.objectContaining({ include: expect.anything() }))
  })

  it('M. outra execução já reservou (legado): skipped de duplicata, sem bloqueio semântico', async () => {
    banco.reservadas = 0
    banco.post = { id: 'p', laterPostId: null, status: 'POSTING', slotValues: { 't-h': 'X' } }
    const r = await new LaterPostScheduler().sendToLater('p')
    expect(r).toEqual({ success: true, skipped: true })
    expect(zernio.createPost).not.toHaveBeenCalled()
  })
})

describe('checkpoint e: o contrato semântico vai ao Zernio SÓ com a mídia renderizada e PROVADA (gate atômico)', () => {
  it('a reserva exige, no MESMO UPDATE, RENDERED + uma mídia = renderedImageUrl + prova DESTE post para ESSA URL (text[], não JSON)', async () => {
    banco.reservadas = 0
    banco.post = { id: 'p', laterPostId: null, status: 'SCHEDULED', slotValues: null }
    await new LaterPostScheduler().sendToLater('p')
    const sql = banco.sqlDaReserva[0]
    expect(sql).toMatch(/UPDATE "SocialPost"/)
    expect(sql).toMatch(/"SocialPost"\."renderStatus" = 'RENDERED'::"RenderStatus"/)
    expect(sql).toMatch(/cardinality\("SocialPost"\."mediaUrls"\) = 1/)
    expect(sql).toMatch(/"SocialPost"\."mediaUrls"\[1\] = "SocialPost"\."renderedImageUrl"/)
    expect(sql).toMatch(/EXISTS \(\s*SELECT 1 FROM "PostRenderProof" AS prova[\s\S]*prova\."postId" = "SocialPost"\."id"[\s\S]*prova\."mediaUrl" = "SocialPost"\."renderedImageUrl"[\s\S]*prova\."proofVersion" = \?[\s\S]*jsonb_typeof\(prova\."layersSnapshot"\) = 'array'/)
    expect(sql).toMatch(/RETURNING "mediaUrls", "slotValues"/)
  })

  const releitura = (slotValues: unknown) =>
    ({
      id: 'p', projectId: 8, userId: 'u1', status: 'POSTING', postType: 'STORY', caption: 'c', slotValues,
      mediaUrls: ['https://blob.test/OUTRA.png'], // o que a releitura depois da reserva veria
      Project: { id: 8, name: 'P', laterAccountId: null, organizationProjects: [] },
    }) as never
  /** A mídia que o envio usa: o log "Media URLs:" (o fluxo para logo depois, sem conta no Zernio). */
  async function midiaDoEnvio() {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await new LaterPostScheduler().sendToLater('p').catch(() => undefined)
    const chamada = log.mock.calls.find((c) => c[0] === '[Later Scheduler] Media URLs:')
    log.mockRestore()
    return chamada?.[1]
  }

  it('I. semântico reservado: envia EXATAMENTE a mídia que o gate provou (a do RETURNING), não a da releitura', async () => {
    banco.linhaReservada = { mediaUrls: ['https://blob.test/provada.png'], slotValues: { _slots: { manchete: 'X' } } }
    vi.mocked(db.socialPost.findUnique).mockResolvedValueOnce(releitura({ _slots: { manchete: 'X' } }))
    expect(await midiaDoEnvio()).toEqual(['https://blob.test/provada.png'])
  })

  it('N. legado reservado: envia a mídia da releitura, como hoje', async () => {
    banco.linhaReservada = { mediaUrls: ['https://blob.test/provada.png'], slotValues: { 't-h': 'X' } }
    vi.mocked(db.socialPost.findUnique).mockResolvedValueOnce(releitura({ 't-h': 'X' }))
    expect(await midiaDoEnvio()).toEqual(['https://blob.test/OUTRA.png'])
  })
})
