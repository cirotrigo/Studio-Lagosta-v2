/**
 * Banco (Prisma) e índice de vetores (Upstash) FALSOS, em memória, para exercitar o indexador, o arrendamento e o
 * registrador da migração REAIS (PR13-40/41). Só o que esses serviços usam: compare-and-set por `updatedAt` e por
 * caminho do `metadata`, exclusão de chunks condicionada à entrada, unicidade (entryId, ordinal).
 */
import { vi } from 'vitest'

export type LinhaFalsa = {
  id: string
  projectId: number
  title: string
  content: string
  category: string
  status: string
  tags: string[]
  expiresAt: Date | null
  metadata: unknown
  updatedAt: Date
  createdBy: string
  userId: string | null
}
export type ChunkFalso = { id: string; entryId: string; ordinal: number; content: string; tokens: number | null; vectorId: string }
export type VetorFalso = { id: string; vector: number[]; metadata: Record<string, unknown> }
type FiltroDeCaminho = { path: string[]; equals: unknown } | undefined

const clonar = <T>(v: T): T => structuredClone(v)

function noCaminho(meta: unknown, caminho: string[]): unknown {
  let v: unknown = meta
  for (const k of caminho) {
    if (!v || typeof v !== 'object') return undefined
    v = (v as Record<string, unknown>)[k]
  }
  return v
}
const casaMetadata = (meta: unknown, filtro: FiltroDeCaminho) => !filtro || noCaminho(meta, filtro.path) === filtro.equals
const carimbo = (anterior: Date | undefined, pedido?: Date) => (pedido ? new Date(pedido) : new Date(Math.max(Date.now(), (anterior?.getTime() ?? 0) + 1)))

export const base = {
  entradas: new Map<string, LinhaFalsa>(),
  chunks: [] as ChunkFalso[],
  vetores: new Map<string, VetorFalso>(),
  seq: 0,
  /** Roda dentro de `index.query`, DEPOIS de calcular os ids e ANTES de devolvê-los (a barreira do teste). */
  aoConsultar: undefined as undefined | ((entryId: string | undefined) => Promise<void>),
  /** Roda dentro de `index.upsert`, antes de gravar. */
  aoSubir: undefined as undefined | (() => Promise<void>),
  chamadas: { query: 0, delete: [] as string[][], upsert: 0 },
  reset() {
    this.entradas.clear()
    this.chunks = []
    this.vetores.clear()
    this.seq = 0
    this.aoConsultar = undefined
    this.aoSubir = undefined
    this.chamadas = { query: 0, delete: [], upsert: 0 }
  },
  linha(id: string): LinhaFalsa {
    const l = this.entradas.get(id)
    if (!l) throw new Error(`linha ${id} não existe no banco falso`)
    return l
  },
  meta(id: string): Record<string, unknown> {
    return this.linha(id).metadata as Record<string, unknown>
  },
  /** Semeia uma entrada já indexada (chunks e vetores de um ciclo anterior). */
  semear(linha: Partial<LinhaFalsa> & { id: string; content: string }, ordinais = [0]): LinhaFalsa {
    const l: LinhaFalsa = { projectId: 6, title: 't', category: 'ESTABELECIMENTO_INFO', status: 'ACTIVE', tags: [], expiresAt: null, metadata: null, updatedAt: new Date(Date.now() - 60_000), createdBy: 'u', userId: 'u', ...linha }
    this.entradas.set(l.id, l)
    for (const ordinal of ordinais) {
      this.chunks.push({ id: `c-antigo-${l.id}-${ordinal}`, entryId: l.id, ordinal, content: 'antigo', tokens: 1, vectorId: `${l.id}:${ordinal}` })
      this.vetores.set(`${l.id}:${ordinal}`, { id: `${l.id}:${ordinal}`, vector: [9, 9], metadata: { entryId: l.id, ordinal, projectId: l.projectId, ciclo: 'antigo' } })
    }
    return l
  },
}

function projetar(l: LinhaFalsa, select?: Record<string, boolean>): Record<string, unknown> {
  const c = clonar(l) as unknown as Record<string, unknown>
  if (!select) return c
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, c[k]]))
}
function aplicar(l: LinhaFalsa, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) if (k !== 'updatedAt') (l as unknown as Record<string, unknown>)[k] = clonar(v)
  l.updatedAt = carimbo(l.updatedAt, data.updatedAt as Date | undefined)
}

export const dbFalso = {
  knowledgeBaseEntry: {
    create: vi.fn(async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const id = `e-nova-${++base.seq}`
      const l: LinhaFalsa = {
        id, projectId: data.projectId as number, title: data.title as string, content: data.content as string, category: data.category as string,
        status: (data.status as string) ?? 'ACTIVE', tags: (data.tags as string[]) ?? [], expiresAt: (data.expiresAt as Date) ?? null,
        metadata: clonar(data.metadata ?? null), updatedAt: carimbo(undefined), createdBy: data.createdBy as string, userId: (data.userId as string) ?? null,
      }
      base.entradas.set(id, l)
      return projetar(l, select)
    }),
    findUnique: vi.fn(async ({ where, select, include }: { where: { id: string }; select?: Record<string, boolean>; include?: { chunks?: boolean } }) => {
      const l = base.entradas.get(where.id)
      if (!l) return null
      const r = projetar(l, select)
      if (include?.chunks) r.chunks = base.chunks.filter((c) => c.entryId === l.id).map(clonar)
      return r
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const l = base.linha(where.id)
      aplicar(l, data)
      return clonar(l)
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; updatedAt?: Date; metadata?: FiltroDeCaminho }; data: Record<string, unknown> }) => {
      const l = base.entradas.get(where.id)
      if (!l) return { count: 0 }
      if (where.updatedAt && l.updatedAt.getTime() !== new Date(where.updatedAt).getTime()) return { count: 0 }
      if (!casaMetadata(l.metadata, where.metadata)) return { count: 0 }
      aplicar(l, data)
      return { count: 1 }
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      base.entradas.delete(where.id)
      base.chunks = base.chunks.filter((c) => c.entryId !== where.id)
      return {}
    }),
  },
  knowledgeChunk: {
    deleteMany: vi.fn(async ({ where }: { where: { entryId: string; entry?: { metadata?: FiltroDeCaminho } } }) => {
      const l = base.entradas.get(where.entryId)
      if (where.entry && (!l || !casaMetadata(l.metadata, where.entry.metadata))) return { count: 0 }
      const antes = base.chunks.length
      base.chunks = base.chunks.filter((c) => c.entryId !== where.entryId)
      return { count: antes - base.chunks.length }
    }),
    create: vi.fn(async ({ data }: { data: Omit<ChunkFalso, 'id'> }) => {
      if (base.chunks.some((c) => c.entryId === data.entryId && c.ordinal === data.ordinal)) throw new Error('Unique constraint failed on (entryId, ordinal)')
      const c: ChunkFalso = { id: `c-${++base.seq}`, ...data, tokens: data.tokens ?? null }
      base.chunks.push(c)
      return clonar(c)
    }),
  },
}

export class IndiceFalso {
  constructor(readonly config?: { signal?: AbortSignal }) {}
  async query({ filter }: { filter: string }) {
    base.chamadas.query++
    const entryId = /entryId = '([^']+)'/.exec(filter)?.[1]
    const r = [...base.vetores.values()].filter((v) => v.metadata.entryId === entryId).map((v) => ({ id: v.id, score: 0, metadata: clonar(v.metadata) }))
    await base.aoConsultar?.(entryId)
    return r
  }
  async delete(ids: string[]) {
    base.chamadas.delete.push([...ids])
    for (const id of ids) base.vetores.delete(id)
    return { deleted: ids.length }
  }
  async upsert(vetores: VetorFalso[]) {
    base.chamadas.upsert++
    await base.aoSubir?.()
    for (const v of vetores) base.vetores.set(v.id, clonar(v))
    return 'Success'
  }
}

/** Uma barreira: `chegou` resolve quando alguém para nela; `liberar()` a solta. */
export function barreira() {
  let chegar!: () => void
  let soltar!: () => void
  const chegou = new Promise<void>((r) => { chegar = r })
  const solta = new Promise<void>((r) => { soltar = r })
  return { chegou, liberar: () => soltar(), parar: async () => { chegar(); await solta } }
}
