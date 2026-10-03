/**
 * O gancho da cobrança do vídeo com banco falso: o débito e a marca
 * "já cobrado" do job saem no MESMO commit, e a repetição do job (a marca já
 * gravada) desfaz o próprio débito — um débito só, nas duas ramificações
 * (usuário e organização).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Estado {
  creditBalance: { id: string; userId: string; creditsRemaining: number } | null
  usageHistory: unknown[]
  orgBalance: { id: string; credits: number }
  orgUsage: unknown[]
  job: { id: string; status: string; startedAt: Date; creditsDeducted: boolean }
}

let estado: Estado
const inicio = new Date('2026-10-03T12:00:00Z')

function fakeTx() {
  return {
    creditBalance: {
      findUnique: async () => (estado.creditBalance ? { ...estado.creditBalance } : null),
      create: async () => { throw new Error('não esperado') },
      updateMany: async ({ where, data }: any) => {
        const b = estado.creditBalance!
        if (b.creditsRemaining < where.creditsRemaining.gte) return { count: 0 }
        b.creditsRemaining -= data.creditsRemaining.decrement
        return { count: 1 }
      },
    },
    usageHistory: { create: async ({ data }: any) => { estado.usageHistory.push(data); return data } },
    organization: {
      findUnique: async () => ({ id: 'org1', creditsPerMonth: 100, creditBalance: { ...estado.orgBalance } }),
    },
    organizationCreditBalance: {
      create: async () => { throw new Error('não esperado') },
      updateMany: async ({ where, data }: any) => {
        if (estado.orgBalance.credits < where.credits.gte) return { count: 0 }
        estado.orgBalance.credits -= data.credits.decrement
        return { count: 1 }
      },
      findUnique: async () => ({ ...estado.orgBalance }),
    },
    organizationUsage: { create: async ({ data }: any) => { estado.orgUsage.push(data); return data } },
    videoProcessingJob: {
      updateMany: async ({ where, data }: any) => {
        const j = estado.job
        const casa = j.id === where.id && j.status === where.status && j.startedAt.getTime() === where.startedAt.getTime() && j.creditsDeducted === where.creditsDeducted
        if (!casa) return { count: 0 }
        Object.assign(j, data)
        return { count: 1 }
      },
    },
  }
}

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      // Transação de verdade no falso: o que o callback mudou volta se ele lançar.
      const copia = structuredClone(estado)
      try {
        return await fn(fakeTx())
      } catch (e) {
        estado = copia
        throw e
      }
    },
  },
}))
vi.mock('@/lib/auth-utils', () => ({ getUserFromClerkId: async () => ({ id: 'u1' }) }))
vi.mock('@/lib/credits/settings', () => ({ getFeatureCost: async () => 10, getPlanCredits: async () => 100 }))

const { deductCreditsForFeature } = await import('@/lib/credits/deduct')
const { marcarCobrancaNoMesmoCommit, CobrancaRecusada, CobrancaIncerta, cobrarUmaVez } = await import(
  '@/lib/video/cobranca-do-video'
)
const { InsufficientCreditsError } = await import('@/lib/credits/errors')

beforeEach(() => {
  estado = {
    creditBalance: { id: 'cb1', userId: 'u1', creditsRemaining: 50 },
    usageHistory: [],
    orgBalance: { id: 'ob1', credits: 50 },
    orgUsage: [],
    job: { id: 'j1', status: 'PROCESSING', startedAt: inicio, creditsDeducted: false },
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe.each([
  ['usuário', undefined],
  ['organização', 'org_x'],
])('cobrança do vídeo (%s)', (_nome, organizationId) => {
  const saldo = () => (organizationId ? estado.orgBalance.credits : estado.creditBalance!.creditsRemaining)
  const usos = () => (organizationId ? estado.orgUsage : estado.usageHistory).length
  const cobrar = () =>
    deductCreditsForFeature({
      clerkUserId: 'user_1',
      feature: 'video_export',
      organizationId,
      noMesmoCommit: marcarCobrancaNoMesmoCommit('j1', inicio),
    })

  it('debita e grava a marca no mesmo commit', async () => {
    await cobrar()
    expect(saldo()).toBe(40)
    expect(usos()).toBe(1)
    expect(estado.job.creditsDeducted).toBe(true)
  })

  it('repetição com a marca já gravada desfaz o próprio débito — um débito só', async () => {
    await cobrar()
    await expect(cobrar()).rejects.toBeInstanceOf(CobrancaRecusada)
    expect(saldo()).toBe(40)
    expect(usos()).toBe(1)
  })

  it('arrendamento de outra execução não cobra', async () => {
    estado.job.startedAt = new Date(inicio.getTime() + 1000)
    await expect(cobrar()).rejects.toBeInstanceOf(CobrancaRecusada)
    expect(saldo()).toBe(50)
    expect(usos()).toBe(0)
    expect(estado.job.creditsDeducted).toBe(false)
  })
})

/**
 * O erro do débito é AMBÍGUO: a conexão pode cair DEPOIS do commit. Quem decide
 * é a marca relida — ela nasce no mesmo commit do débito (o gancho acima).
 */
describe.each([
  ['usuário', undefined],
  ['organização', 'org_x'],
])('cobrarUmaVez (%s)', (_nome, organizationId) => {
  const saldo = () => (organizationId ? estado.orgBalance.credits : estado.creditBalance!.creditsRemaining)
  const usos = () => (organizationId ? estado.orgUsage : estado.usageHistory).length
  const debitar = () =>
    deductCreditsForFeature({
      clerkUserId: 'user_1',
      feature: 'video_export',
      organizationId,
      noMesmoCommit: marcarCobrancaNoMesmoCommit('j1', inicio),
    })
  const umaVez = (cobrar: () => Promise<unknown>, reler: () => Promise<any> = async () => ({ ...estado.job })) =>
    cobrarUmaVez({ cobrar, reler, startedAt: inicio, definitivo: (e) => e instanceof InsufficientCreditsError })

  it('débito commitado e a resposta perdida: é cobrado, e a repetição não debita de novo', async () => {
    await expect(
      umaVez(async () => {
        await debitar()
        throw new Error('a conexão caiu depois do commit')
      }),
    ).resolves.toBe('cobrado')
    expect(saldo()).toBe(40)
    expect(usos()).toBe(1)

    // A recuperação refaz o job: o débito real recusa a marca já gravada.
    await expect(umaVez(debitar)).resolves.toBe('cobrado')
    expect(saldo()).toBe(40)
    expect(usos()).toBe(1)
  })

  it('erro sem a marca gravada é INCERTO, nunca falha definitiva: o job volta para a fila', async () => {
    await expect(
      umaVez(async () => {
        throw new Error('timeout antes do commit')
      }),
    ).rejects.toBeInstanceOf(CobrancaIncerta)
    expect(saldo()).toBe(50)
    expect(estado.job.creditsDeducted).toBe(false)
  })

  it('a releitura que falha não prova nada: incerto', async () => {
    await expect(
      umaVez(
        async () => {
          throw new Error('conexão caiu')
        },
        async () => {
          throw new Error('a releitura também caiu')
        },
      ),
    ).rejects.toBeInstanceOf(CobrancaIncerta)
  })

  it('o job de outra execução: arrendamento perdido, sem afirmar cobrança', async () => {
    await expect(
      umaVez(
        async () => {
          throw new Error('x')
        },
        async () => ({ ...estado.job, startedAt: new Date(inicio.getTime() + 1000), creditsDeducted: true }),
      ),
    ).resolves.toBe('arrendamento-perdido')
  })

  it('saldo insuficiente é definitivo: sobe como está, sem débito', async () => {
    if (organizationId) estado.orgBalance.credits = 5
    else estado.creditBalance!.creditsRemaining = 5
    await expect(umaVez(debitar)).rejects.toBeInstanceOf(InsufficientCreditsError)
    expect(usos()).toBe(0)
    expect(estado.job.creditsDeducted).toBe(false)
  })
})
