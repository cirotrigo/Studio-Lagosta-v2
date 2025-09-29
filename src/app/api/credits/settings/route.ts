import { NextResponse } from 'next/server'
import { getEffectiveFeatureCosts, getEffectivePlanCredits } from '@/lib/credits/settings'

export async function GET() {
  const featureCosts = await getEffectiveFeatureCosts()
  const planCredits = await getEffectivePlanCredits()
  return NextResponse.json({ featureCosts, planCredits })
}

