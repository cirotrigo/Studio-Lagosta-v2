import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isAdmin } from '@/lib/admin-utils'
import { fetchCommercePlans } from '@/lib/clerk/commerce-plans'

export async function GET() {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const plans = await fetchCommercePlans()
    return NextResponse.json({ plans })
  } catch (error) {
    const message = (error as Error)?.message || 'Falha ao obter planos do Clerk'
    const lower = message.toLowerCase()
    const status = lower.includes('not configured') || lower.includes('não configurado') ? 501 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
