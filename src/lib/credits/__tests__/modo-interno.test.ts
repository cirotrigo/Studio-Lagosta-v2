/**
 * Modo interno (`CREDITOS_APLICADOS` desligado, o padrão): o saldo nunca
 * bloqueia nem é debitado, mas o consumo segue registrado e o gancho
 * `noMesmoCommit` segue no mesmo commit. Ligado, a cobrança de antes.
 *
 * Banco falso com `$transaction` que desfaz o que o callback mudou se ele lançar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface Estado {
  user: { id: string; clerkId: string } | null
  creditBalance: { id: string; userId: string; creditsRemaining: number } | null
  usageHistory: any[]
  org: { id: string; creditsPerMonth: number } | null
  orgBalance: { id: string; credits: number } | null
  orgUsage: any[]
}

let estado: Estado

const chamadas = vi.hoisted(() => ({
  getUserFromClerkId: vi.fn(),
  userCreate: vi.fn(),
  balanceUpdateMany: vi.fn(),
  balanceUpdate: vi.fn(),
  orgBalanceUpdateMany: vi.fn(),
  orgBalanceUpdate: vi.fn(),
  orgBalanceCreate: vi.fn(),
  orgFindUnique: vi.fn(),
  balanceFindUnique: vi.fn(),
}))

function fakeTx() {
  return {
    user: {
      findUnique: async ({ where }: any) => (estado.user && estado.user.clerkId === where.clerkId ? { ...estado.user } : null),
      create: async (args: any) => {
        chamadas.userCreate(args)
        estado.user = { id: 'u-novo', clerkId: args.data.clerkId }
        return { ...estado.user }
      },
    },
    creditBalance: {
      findUnique: async (args: any) => {
        chamadas.balanceFindUnique(args)
        return estado.creditBalance ? { ...estado.creditBalance } : null
      },
      create: async ({ data }: any) => {
        estado.creditBalance = { id: 'cb-novo', userId: data.userId, creditsRemaining: data.creditsRemaining }
        return { ...estado.creditBalance }
      },
      updateMany: async ({ where, data }: any) => {
        chamadas.balanceUpdateMany()
        const b = estado.creditBalance!
        if (b.creditsRemaining < where.creditsRemaining.gte) return { count: 0 }
        b.creditsRemaining -= data.creditsRemaining.decrement
        return { count: 1 }
      },
      update: async ({ data }: any) => {
        chamadas.balanceUpdate()
        estado.creditBalance!.creditsRemaining += data.creditsRemaining.increment
        return { ...estado.creditBalance! }
      },
    },
    usageHistory: { create: async ({ data }: any) => { estado.usageHistory.push(data); return data } },
    organization: {
      findUnique: async (args: any) => {
        chamadas.orgFindUnique(args)
        return estado.org ? { ...estado.org, creditBalance: estado.orgBalance ? { ...estado.orgBalance } : null } : null
      },
    },
    organizationCreditBalance: {
      create: async ({ data }: any) => {
        chamadas.orgBalanceCreate()
        estado.orgBalance = { id: 'ob-novo', credits: data.credits }
        return { ...estado.orgBalance }
      },
      updateMany: async ({ where, data }: any) => {
        chamadas.orgBalanceUpdateMany()
        if (estado.orgBalance!.credits < where.credits.gte) return { count: 0 }
        estado.orgBalance!.credits -= data.credits.decrement
        return { count: 1 }
      },
      update: async ({ data }: any) => {
        chamadas.orgBalanceUpdate()
        estado.orgBalance!.credits += data.credits.increment
        return { ...estado.orgBalance! }
      },
      findUnique: async () => (estado.orgBalance ? { ...estado.orgBalance } : null),
    },
    organizationUsage: { create: async ({ data }: any) => { estado.orgUsage.push(data); return data } },
  }
}

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const copia = structuredClone(estado)
      try {
        return await fn(fakeTx())
      } catch (e) {
        estado = copia
        throw e
      }
    },
    get user() { return fakeTx().user },
    get creditBalance() { return fakeTx().creditBalance },
    get organization() { return fakeTx().organization },
    get organizationCreditBalance() { return fakeTx().organizationCreditBalance },
  },
}))
vi.mock('@/lib/auth-utils', () => ({
  getUserFromClerkId: async (clerkId: string) => {
    chamadas.getUserFromClerkId(clerkId)
    return estado.user ?? { id: 'u-novo', clerkId }
  },
}))
vi.mock('@/lib/credits/settings', () => ({ getFeatureCost: async () => 10, getPlanCredits: async () => 100 }))

const { validateCreditsForFeature, deductCreditsForFeature, refundCreditsForFeature } = await import('@/lib/credits/deduct')
const { InsufficientCreditsError } = await import('@/lib/credits/errors')

beforeEach(() => {
  estado = {
    user: { id: 'u1', clerkId: 'user_1' },
    creditBalance: { id: 'cb1', userId: 'u1', creditsRemaining: 0 },
    usageHistory: [],
    org: { id: 'org1', creditsPerMonth: 100 },
    orgBalance: { id: 'ob1', credits: 0 },
    orgUsage: [],
  }
  for (const f of Object.values(chamadas)) f.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('modo interno (flag desligada, o padrão)', () => {
  beforeEach(() => {
    vi.stubEnv('CREDITOS_APLICADOS', '')
  })

  it('validate não consulta banco nem cria User (pessoal, organização, preço de tabela enorme)', async () => {
    await expect(validateCreditsForFeature('user_x', 'video_export')).resolves.toEqual({ available: Number.MAX_SAFE_INTEGER, needed: 0 })
    await expect(validateCreditsForFeature('user_x', 'video_export', 1, { organizationId: 'org_x' })).resolves.toBeDefined()
    await expect(validateCreditsForFeature('user_x', 'ai_image_generation', 1, { creditsTotal: 1e9 })).resolves.toBeDefined()
    expect(chamadas.getUserFromClerkId).not.toHaveBeenCalled()
    expect(chamadas.orgFindUnique).not.toHaveBeenCalled()
    expect(chamadas.balanceFindUnique).not.toHaveBeenCalled()
  })

  it('validate de usuário sem CreditBalance também passa', async () => {
    estado.creditBalance = null
    await expect(validateCreditsForFeature('user_1', 'video_export')).resolves.toBeDefined()
  })

  it.each([
    ['custo da feature', { quantity: 1 }, 10],
    ['quantity × custo', { quantity: 3 }, 30],
    ['creditsTotal', { creditsTotal: 30 }, 30],
  ])('deduct pessoal com saldo 0 (%s): resolve, registra o uso, não toca o saldo', async (_n, extra, esperado) => {
    const gancho = vi.fn(async () => {})
    await expect(
      deductCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export', noMesmoCommit: gancho, ...extra }),
    ).resolves.toEqual({ creditsRemaining: 0 })
    expect(chamadas.balanceUpdateMany).not.toHaveBeenCalled()
    expect(estado.creditBalance!.creditsRemaining).toBe(0)
    expect(estado.usageHistory).toEqual([expect.objectContaining({ userId: 'u1', creditBalanceId: 'cb1', creditsUsed: esperado })])
    expect(gancho).toHaveBeenCalledTimes(1)
    expect(gancho.mock.calls[0][0]).toHaveProperty('usageHistory')
    expect(chamadas.getUserFromClerkId).not.toHaveBeenCalled()
  })

  it('deduct pessoal sem CreditBalance: cria o saldo (FK do registro) e não debita', async () => {
    estado.creditBalance = null
    await deductCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export' })
    expect(estado.creditBalance!.creditsRemaining).toBe(100)
    expect(estado.usageHistory).toHaveLength(1)
    expect(chamadas.balanceUpdateMany).not.toHaveBeenCalled()
  })

  it('deduct sem User: não cria User nem registro, mas o gancho roda na transação', async () => {
    estado.user = null
    const gancho = vi.fn(async () => {})
    await expect(
      deductCreditsForFeature({ clerkUserId: 'user_fantasma', feature: 'video_export', noMesmoCommit: gancho }),
    ).resolves.toEqual({ creditsRemaining: 0 })
    expect(chamadas.userCreate).not.toHaveBeenCalled()
    expect(chamadas.getUserFromClerkId).not.toHaveBeenCalled()
    expect(estado.user).toBeNull()
    expect(estado.usageHistory).toHaveLength(0)
    expect(gancho).toHaveBeenCalledTimes(1)
  })

  it('o gancho que lança desfaz o registro de uso', async () => {
    const gancho = vi.fn(async () => {
      throw new Error('marca recusada')
    })
    await expect(
      deductCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export', noMesmoCommit: gancho }),
    ).rejects.toThrow('marca recusada')
    expect(estado.usageHistory).toHaveLength(0)
  })

  it('deduct de organização com saldo 0: registra o uso, não toca o saldo, gancho no commit', async () => {
    const gancho = vi.fn(async () => {})
    await expect(
      deductCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export', organizationId: 'org_x', projectId: 7, noMesmoCommit: gancho }),
    ).resolves.toEqual({ creditsRemaining: 0 })
    expect(chamadas.orgBalanceUpdateMany).not.toHaveBeenCalled()
    expect(estado.orgBalance!.credits).toBe(0)
    expect(estado.orgUsage).toEqual([
      expect.objectContaining({ organizationId: 'org1', userId: 'user_1', feature: 'video_export', credits: 10, projectId: 7 }),
    ])
    expect(gancho).toHaveBeenCalledTimes(1)
  })

  it('deduct de organização sem saldo: não cria o saldo', async () => {
    estado.orgBalance = null
    await expect(deductCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export', organizationId: 'org_x' })).resolves.toEqual({
      creditsRemaining: 0,
    })
    expect(chamadas.orgBalanceCreate).not.toHaveBeenCalled()
    expect(estado.orgUsage).toHaveLength(1)
  })

  it('o gancho que lança desfaz o registro da organização', async () => {
    await expect(
      deductCreditsForFeature({
        clerkUserId: 'user_1',
        feature: 'video_export',
        organizationId: 'org_x',
        noMesmoCommit: async () => {
          throw new Error('x')
        },
      }),
    ).rejects.toThrow('x')
    expect(estado.orgUsage).toHaveLength(0)
  })

  it('refund pessoal: linha negativa, sem devolver ao saldo', async () => {
    await expect(refundCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export', reason: 'falhou' })).resolves.toEqual({
      creditsRemaining: 0,
    })
    expect(estado.usageHistory).toEqual([expect.objectContaining({ creditsUsed: -10 })])
    expect(chamadas.balanceUpdate).not.toHaveBeenCalled()
    expect(chamadas.getUserFromClerkId).not.toHaveBeenCalled()
  })

  it('refund pessoal sem User: não cria User', async () => {
    estado.user = null
    await refundCreditsForFeature({ clerkUserId: 'user_fantasma', feature: 'video_export' })
    expect(chamadas.userCreate).not.toHaveBeenCalled()
    expect(chamadas.getUserFromClerkId).not.toHaveBeenCalled()
    expect(estado.usageHistory).toHaveLength(0)
  })

  it('refund de organização: linha negativa, sem devolver ao saldo', async () => {
    await refundCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export', organizationId: 'org_x' })
    expect(estado.orgUsage).toEqual([expect.objectContaining({ credits: -10 })])
    expect(chamadas.orgBalanceUpdate).not.toHaveBeenCalled()
    expect(estado.orgBalance!.credits).toBe(0)
  })
})

describe('flag ligada (CREDITOS_APLICADOS=true): a cobrança de antes', () => {
  beforeEach(() => {
    vi.stubEnv('CREDITOS_APLICADOS', 'true')
  })

  it('validate recusa saldo insuficiente (pessoal e organização)', async () => {
    await expect(validateCreditsForFeature('user_1', 'video_export')).rejects.toBeInstanceOf(InsufficientCreditsError)
    await expect(validateCreditsForFeature('user_1', 'video_export', 1, { organizationId: 'org_x' })).rejects.toBeInstanceOf(
      InsufficientCreditsError,
    )
    expect(chamadas.getUserFromClerkId).toHaveBeenCalled()
  })

  it('deduct pessoal com saldo 0 lança e desfaz o registro', async () => {
    await expect(deductCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export' })).rejects.toBeInstanceOf(
      InsufficientCreditsError,
    )
    expect(estado.usageHistory).toHaveLength(0)
  })

  it('deduct pessoal com saldo debita', async () => {
    estado.creditBalance!.creditsRemaining = 50
    await expect(deductCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export' })).resolves.toEqual({ creditsRemaining: 40 })
    expect(estado.usageHistory).toHaveLength(1)
  })

  it('deduct de organização com saldo 0 lança; com saldo debita', async () => {
    await expect(
      deductCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export', organizationId: 'org_x' }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError)
    expect(estado.orgUsage).toHaveLength(0)
    estado.orgBalance!.credits = 50
    await expect(
      deductCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export', organizationId: 'org_x' }),
    ).resolves.toEqual({ creditsRemaining: 40 })
  })

  it('refund devolve ao saldo (pessoal e organização)', async () => {
    await expect(refundCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export' })).resolves.toEqual({ creditsRemaining: 10 })
    await expect(
      refundCreditsForFeature({ clerkUserId: 'user_1', feature: 'video_export', organizationId: 'org_x' }),
    ).resolves.toEqual({ creditsRemaining: 10 })
  })
})
