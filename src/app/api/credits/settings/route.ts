import { NextResponse } from 'next/server'
import { getEffectiveFeatureCosts, getEffectivePlanCredits } from '@/lib/credits/settings'
import { creditosAplicados } from '@/lib/credits/aplicados'

export async function GET() {
  const featureCosts = await getEffectiveFeatureCosts()
  const planCredits = await getEffectivePlanCredits()
  // O navegador não lê a env (é só do servidor): a interface decide por aqui se o saldo bloqueia.
  return NextResponse.json({ featureCosts, planCredits, creditosAplicados: creditosAplicados() })
}

