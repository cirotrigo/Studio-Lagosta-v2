/**
 * Dois vídeos pedidos ao mesmo tempo para substituir o MESMO post: com o post
 * TRAVADO (`SELECT … FOR UPDATE`) no commit do pedido, o segundo espera o
 * primeiro e o enxerga como predecessor — a cadeia termina no mais novo em
 * qualquer ordem. Sem a trava, os dois liam o banco antes de qualquer commit e
 * saíam sem predecessora.
 *
 * O banco falso faz o que importa do Postgres em READ COMMITTED: a transação
 * vê só o que já foi commitado (mais o que ela mesma escreveu), e a trava de
 * linha só é solta no fim dela. A barreira põe as duas transações na leitura
 * dos pedidos anteriores ao mesmo tempo quando nada as separa.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Gen {
  id: string
  projectId: number
  status: string
  createdAt: Date
  fieldValues: any
}

let comitado: { generations: Gen[]; jobs: unknown[]; posts: any[] }
let seq = 0
const travas = new Map<string, Promise<void>>()
let chegarNaLeitura: () => Promise<void> = async () => {}

function barreira(n: number, prazoMs: number) {
  let chegaram = 0
  let abrir!: () => void
  const aberta = new Promise<void>((r) => {
    abrir = r
  })
  return async () => {
    chegaram += 1
    if (chegaram >= n) abrir()
    await Promise.race([aberta, new Promise((r) => setTimeout(r, prazoMs))])
  }
}

async function transacao(fazer: (tx: unknown) => Promise<unknown>) {
  const meu = { generations: [] as Gen[], jobs: [] as unknown[], soltar: [] as Array<() => void> }
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray, ...valores: unknown[]) => {
      if (sql.join('?').includes('FOR UPDATE')) {
        const id = String(valores[0])
        while (travas.has(id)) await travas.get(id)
        let soltar!: () => void
        travas.set(
          id,
          new Promise<void>((r) => {
            soltar = () => {
              travas.delete(id)
              r()
            }
          }),
        )
        meu.soltar.push(soltar)
      }
      return []
    },
    socialPost: {
      findUnique: async ({ where }: any) => {
        const p = comitado.posts.find((x) => x.id === where.id)
        return p ? { ...p } : null
      },
    },
    generation: {
      findMany: async ({ where }: any) => {
        await chegarNaLeitura()
        return [...comitado.generations, ...meu.generations]
          .filter(
            (g) =>
              g.projectId === where.projectId &&
              g.status !== 'FAILED' &&
              g.createdAt >= where.createdAt.gte &&
              g.fieldValues?.videoDaPagina?.destino?.postId === where.fieldValues.equals,
          )
          .map((g) => ({ id: g.id, fieldValues: g.fieldValues }))
      },
      create: async ({ data }: any) => {
        const g: Gen = {
          id: `g${++seq}`,
          projectId: data.projectId,
          status: data.status,
          createdAt: new Date(),
          fieldValues: data.fieldValues,
        }
        meu.generations.push(g)
        return g
      },
      update: async ({ where, data }: any) => {
        const g = meu.generations.find((x) => x.id === where.id)!
        g.fieldValues = data.fieldValues
        return g
      },
    },
    videoProcessingJob: {
      create: async ({ data }: any) => {
        const j = { id: `j${++seq}`, ...data }
        meu.jobs.push(j)
        return j
      },
    },
  }
  try {
    const r = await fazer(tx)
    comitado.generations.push(...meu.generations)
    comitado.jobs.push(...meu.jobs)
    return r
  } finally {
    for (const soltar of meu.soltar) soltar()
  }
}

vi.mock('@/lib/db', () => ({ db: { $transaction: (fazer: any) => transacao(fazer) } }))

const { criarJobDeVideo } = await import('@/lib/video/enfileirar-video')
const { CreativeError } = await import('@/lib/creatives/errors')

const criado = new Date('2026-10-01T12:00:00Z')

function pedido(n: number) {
  return {
    user: { id: 'u1' },
    clerkUserId: 'user_1',
    orgId: null,
    project: { id: 7, name: 'Cliente' },
    templateId: 1,
    videoName: `video ${n}`,
    videoDuration: 5,
    videoWidth: 1080,
    videoHeight: 1920,
    webmBlobUrl: `https://blob.test/v${n}.webm`,
    webmFileSize: 10,
    thumbnailUrl: null,
    designData: {},
    audioConfig: null,
    videoDaPagina: {
      pageId: 'p1',
      versao: 'v1',
      divergiuNaGravacao: false,
      destino: { tipo: 'substituir' as const, postId: 'post1' },
    },
  }
}

beforeEach(() => {
  seq = 0
  travas.clear()
  chegarNaLeitura = async () => {}
  comitado = {
    generations: [],
    jobs: [],
    posts: [
      {
        id: 'post1',
        projectId: 7,
        pageId: 'p1',
        status: 'SCHEDULED',
        laterPostId: null,
        updatedAt: new Date('2026-10-02T12:00:00Z'),
        createdAt: criado,
        mediaUrls: ['https://blob.test/antigo.mp4'],
        videoDaPagina: true,
      },
    ],
  }
})

describe('criarJobDeVideo — substituição concorrente', () => {
  it('dois pedidos ao mesmo tempo: o segundo enxerga o primeiro como predecessor', async () => {
    chegarNaLeitura = barreira(2, 50)
    const [a, b] = await Promise.all([criarJobDeVideo(pedido(1)), criarJobDeVideo(pedido(2))])
    const pa = a.videoDaPagina!.predecessoras ?? []
    const pb = b.videoDaPagina!.predecessoras ?? []
    // Exatamente um viu o outro: a cadeia tem um elo, e ele aponta para quem commitou antes.
    expect([...pa, ...pb]).toHaveLength(1)
    expect(pa.includes(b.generationId) !== pb.includes(a.generationId)).toBe(true)
    // O que cada um registrou como "o post como estava" é o post de verdade.
    expect(a.videoDaPagina!.esperado).toEqual({
      revisao: '2026-10-02T12:00:00.000Z',
      mediaUrls: ['https://blob.test/antigo.mp4'],
      pageId: 'p1',
    })
  })

  it('o pedido que chega depois de um que terminou o lista como predecessor', async () => {
    const primeiro = await criarJobDeVideo(pedido(1))
    const segundo = await criarJobDeVideo(pedido(2))
    expect(primeiro.videoDaPagina!.predecessoras).toEqual([])
    expect(segundo.videoDaPagina!.predecessoras).toEqual([primeiro.generationId])
  })

  it('post que já foi entregue é recusado com o post travado, sem criar nada', async () => {
    comitado.posts[0].laterPostId = 'zernio-1'
    const erro = await criarJobDeVideo(pedido(1)).catch((e) => e)
    expect(erro).toBeInstanceOf(CreativeError)
    expect(erro).toMatchObject({ code: 'SUBSTITUICAO_RECUSADA', status: 409 })
    expect(comitado.generations).toHaveLength(0)
    expect(comitado.jobs).toHaveLength(0)
  })
})
