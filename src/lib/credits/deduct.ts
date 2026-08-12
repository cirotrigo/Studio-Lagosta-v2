import { db } from '@/lib/db'
import { getUserFromClerkId } from '@/lib/auth-utils'
import { FeatureKey, toPrismaOperationType } from './feature-config'
import { getFeatureCost, getPlanCredits } from '@/lib/credits/settings'
import { InsufficientCreditsError } from './errors'

type JsonValue = string | number | boolean | null | JsonObject | JsonArray
interface JsonObject { [key: string]: JsonValue }
type JsonArray = Array<JsonValue>

interface DeductParams {
  clerkUserId: string
  feature: FeatureKey
  details?: JsonValue
  quantity?: number
  organizationId?: string
  projectId?: number
  /** Ver `creditosADebitar`. */
  creditsTotal?: number
}

interface CreditContextOptions {
  organizationId?: string
  /** Ver `creditosADebitar`. */
  creditsTotal?: number
}

/**
 * Quantos créditos debitar.
 *
 * `quantity` é MULTIPLICADOR do custo da feature — a semântica original, certa
 * para feature de preço fixo (3 downloads = 3 × o custo do download).
 *
 * `creditsTotal` é a saída para feature cujo preço vem de TABELA, como geração
 * de imagem, onde quem manda são o modelo e a resolução
 * (`calculateCreditsForModel`). Quando presente, ele É o total e o custo da
 * feature não entra na conta.
 *
 * 🔴 Existe porque os três caminhos de imagem passavam o total em `quantity` e
 * ele era multiplicado pelo custo da feature: `ai_image_generation` custa 5, e
 * os 30 créditos do 4K viravam **150**. Medido na `UsageHistory` em
 * 12/08/2026 — 12 linhas a 150 e 31 a 50. A trilha `arte` escapava por
 * acidente (passa `quantity: 1` e o custo da feature já é 25), que é por que
 * ninguém tinha percebido.
 */
async function creditosADebitar(
  feature: FeatureKey,
  quantity: number,
  creditsTotal?: number,
): Promise<number> {
  if (typeof creditsTotal === 'number' && Number.isFinite(creditsTotal) && creditsTotal > 0) {
    return Math.ceil(creditsTotal)
  }
  return (await getFeatureCost(feature)) * Math.max(1, quantity)
}

async function ensureOrganizationWithBalance(clerkOrgId: string) {
  const organization = await db.organization.findUnique({
    where: { clerkOrgId },
    include: { creditBalance: true },
  })

  if (!organization) {
    throw new Error(`Organização ${clerkOrgId} não encontrada`)
  }

  if (organization.creditBalance) {
    return {
      organization,
      balance: organization.creditBalance,
    }
  }

  const balance = await db.organizationCreditBalance.create({
    data: {
      organizationId: organization.id,
      credits: organization.creditsPerMonth,
      refillAmount: organization.creditsPerMonth,
    },
  })

  return { organization, balance }
}

async function deductOrganizationCredits({
  clerkUserId,
  feature,
  details,
  quantity = 1,
  organizationId,
  projectId,
  creditsTotal,
}: DeductParams) {
  const creditsToUse = await creditosADebitar(feature, quantity, creditsTotal)

  return db.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({
      where: { clerkOrgId: organizationId! },
      include: { creditBalance: true },
    })

    if (!organization) {
      throw new Error(`Organização ${organizationId} não encontrada`)
    }

    let balance = organization.creditBalance
    if (!balance) {
      balance = await tx.organizationCreditBalance.create({
        data: {
          organizationId: organization.id,
          credits: organization.creditsPerMonth,
          refillAmount: organization.creditsPerMonth,
        },
      })
    }

    const updated = await tx.organizationCreditBalance.updateMany({
      where: { id: balance.id, credits: { gte: creditsToUse } },
      data: { credits: { decrement: creditsToUse } },
    })

    if (updated.count === 0) {
      throw new InsufficientCreditsError(creditsToUse, balance.credits)
    }

    await tx.organizationUsage.create({
      data: {
        organizationId: organization.id,
        userId: clerkUserId,
        feature,
        credits: creditsToUse,
        metadata: details ?? undefined,
        projectId: projectId ?? undefined,
      },
    })

    const after = await tx.organizationCreditBalance.findUnique({
      where: { id: balance.id },
    })

    return { creditsRemaining: after?.credits ?? 0 }
  })
}

async function refundOrganizationCredits({
  clerkUserId,
  feature,
  quantity = 1,
  reason,
  details,
  organizationId,
  projectId,
}: {
  clerkUserId: string
  feature: FeatureKey
  quantity?: number
  reason?: string
  details?: JsonValue
  organizationId: string
  projectId?: number
}) {
  const refundAmount = (await getFeatureCost(feature)) * Math.max(1, quantity)

  return db.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({
      where: { clerkOrgId: organizationId },
      include: { creditBalance: true },
    })

    if (!organization) {
      throw new Error(`Organização ${organizationId} não encontrada`)
    }

    let balance = organization.creditBalance
    if (!balance) {
      balance = await tx.organizationCreditBalance.create({
        data: {
          organizationId: organization.id,
          credits: organization.creditsPerMonth,
          refillAmount: organization.creditsPerMonth,
        },
      })
    }

    await tx.organizationUsage.create({
      data: {
        organizationId: organization.id,
        userId: clerkUserId,
        feature,
        credits: -refundAmount,
        metadata: {
          ...(details as JsonObject | null ?? {}),
          refund: true,
          reason,
        },
        projectId: projectId ?? undefined,
      },
    })

    const updated = await tx.organizationCreditBalance.update({
      where: { id: balance.id },
      data: { credits: { increment: refundAmount } },
    })

    return { creditsRemaining: updated.credits }
  })
}

export async function validateCreditsForFeature(
  clerkUserId: string,
  feature: FeatureKey,
  quantity: number = 1,
  options: CreditContextOptions = {}
) {
  try {
    if (options.organizationId) {
      const { balance } = await ensureOrganizationWithBalance(options.organizationId)
      const needed = await creditosADebitar(feature, quantity, options.creditsTotal)
      const available = balance.credits
      if (available < needed) {
        throw new InsufficientCreditsError(needed, available)
      }
      return { available, needed }
    }

    const user = await getUserFromClerkId(clerkUserId)
    const balance = await db.creditBalance.findUnique({ where: { userId: user.id } })
    const needed = await creditosADebitar(feature, quantity, options.creditsTotal)
    const available = balance?.creditsRemaining ?? (await getPlanCredits('free'))
    if (available < needed) {
      throw new InsufficientCreditsError(needed, available)
    }
    return { available, needed }
  } catch (error) {
    console.error('Erro ao validar créditos:', error)
    throw error
  }
}

export async function deductCreditsForFeature({
  clerkUserId,
  feature,
  details,
  quantity = 1,
  organizationId,
  projectId,
  creditsTotal,
}: DeductParams): Promise<{ creditsRemaining: number }> {
  try {
    console.log('[DEDUCT] Starting credit deduction for:', { clerkUserId, feature, quantity, creditsTotal })

    if (organizationId) {
      return deductOrganizationCredits({
        clerkUserId,
        feature,
        details,
        quantity,
        organizationId,
        projectId,
        creditsTotal,
      })
    }

    const user = await getUserFromClerkId(clerkUserId)
    console.log('[DEDUCT] User found:', user.id)
    const creditsToUse = await creditosADebitar(feature, quantity, creditsTotal)
    console.log('[DEDUCT] Credits to use:', creditsToUse)
    const op = toPrismaOperationType(feature)
    console.log('[DEDUCT] Operation type:', op)

    const result = await db.$transaction(async (tx) => {
      try {
        let creditBalance = await tx.creditBalance.findUnique({ where: { userId: user.id } })
        if (!creditBalance) {
          try {
            creditBalance = await tx.creditBalance.create({
              data: {
                userId: user.id,
                clerkUserId,
                creditsRemaining: await getPlanCredits('free'),
              },
            })
          } catch (error) {
            console.error('Erro ao criar saldo de créditos:', error)
            throw error
          }
        }

        try {
          await tx.usageHistory.create({
            data: {
              userId: user.id,
              creditBalanceId: creditBalance.id,
              operationType: op,
              creditsUsed: creditsToUse,
              details: details ?? undefined,
            },
          })
        } catch (error) {
          console.error('Erro ao criar histórico de uso:', error)
          throw error
        }

        try {
          const updated = await tx.creditBalance.updateMany({
            where: { id: creditBalance.id, creditsRemaining: { gte: creditsToUse } },
            data: {
              creditsRemaining: { decrement: creditsToUse },
              lastSyncedAt: new Date(),
            },
          })
          if (updated.count === 0) {
            throw new InsufficientCreditsError(creditsToUse, creditBalance.creditsRemaining)
          }
        } catch (error) {
          console.error('Erro ao atualizar saldo de créditos:', error)
          throw error
        }

        const after = await tx.creditBalance.findUnique({ where: { id: creditBalance.id } })
        return { creditsRemaining: after!.creditsRemaining }
      } catch (error) {
        console.error('Erro na transação:', error)
        throw error
      }
    })

    return result
  } catch (error) {
    console.error('Erro ao deduzir créditos:', error)
    throw error
  }
}

export async function refundCreditsForFeature({
  clerkUserId,
  feature,
  quantity = 1,
  reason,
  details,
  organizationId,
  projectId,
}: {
  clerkUserId: string
  feature: FeatureKey
  quantity?: number
  reason?: string
  details?: JsonValue
  organizationId?: string
  projectId?: number
}): Promise<{ creditsRemaining: number } | null> {
  try {
    if (organizationId) {
      return refundOrganizationCredits({
        clerkUserId,
        feature,
        quantity,
        reason,
        details,
        organizationId,
        projectId,
      })
    }

    const user = await getUserFromClerkId(clerkUserId)
    const refundAmount = (await getFeatureCost(feature)) * Math.max(1, quantity)
    const op = toPrismaOperationType(feature)

    const result = await db.$transaction(async (tx) => {
      let creditBalance = await tx.creditBalance.findUnique({ where: { userId: user.id } })
      if (!creditBalance) {
        creditBalance = await tx.creditBalance.create({
          data: {
            userId: user.id,
            clerkUserId,
            creditsRemaining: await getPlanCredits('free'),
          },
        })
      }

      await tx.usageHistory.create({
        data: {
          userId: user.id,
          creditBalanceId: creditBalance.id,
          operationType: op,
          creditsUsed: -refundAmount,
          details: { ...(details as JsonObject | null ?? {}), refund: true, reason },
        },
      })

      const updated = await tx.creditBalance.update({
        where: { id: creditBalance.id },
        data: {
          creditsRemaining: { increment: refundAmount },
          lastSyncedAt: new Date(),
        },
      })

      return { creditsRemaining: updated.creditsRemaining }
    })

    return result
  } catch (error) {
    console.error('Erro ao reembolsar créditos:', error)
    return null
  }
}
