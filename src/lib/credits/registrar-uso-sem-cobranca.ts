/**
 * Registro de uso SEM cobrança (17/11/2026).
 *
 * O Studio deixou de ser SaaS: funcionalidade nova não tem preço em créditos.
 * O uso continua registrado, com o custo real em dólar nos `details`, para
 * acompanhar o gasto. `creditsUsed` é 0 e o saldo não é lido nem debitado,
 * esteja `CREDITOS_APLICADOS` ligado ou não.
 *
 * Nunca cria `User` (leitura por `findUnique`: é assim que nascem os Users
 * fantasma) e nunca lança: registro que falha não derruba o trabalho feito.
 */

import { db } from '@/lib/db'
import { toPrismaOperationType, type FeatureKey } from './feature-config'

export async function registrarUsoSemCobranca(p: { clerkUserId: string; feature: FeatureKey; details: Record<string, unknown> }): Promise<boolean> {
  try {
    const user = await db.user.findUnique({ where: { clerkId: p.clerkUserId }, select: { id: true } })
    const saldo = user ? await db.creditBalance.findUnique({ where: { userId: user.id }, select: { id: true } }) : null
    if (!user || !saldo) {
      console.warn('[uso-sem-cobranca] autor sem cadastro de saldo: o uso não foi registrado', { feature: p.feature })
      return false
    }
    await db.usageHistory.create({
      data: { userId: user.id, creditBalanceId: saldo.id, operationType: toPrismaOperationType(p.feature), creditsUsed: 0, details: p.details as never },
    })
    return true
  } catch (erro) {
    console.warn('[uso-sem-cobranca] falha ao registrar o uso:', erro instanceof Error ? erro.message : erro)
    return false
  }
}
