import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/admin-utils'
import { estimateUsdCost } from '@/lib/credits/cost-estimates'
import { getUsdBrlRate, type ExchangeRate } from '@/lib/exchange/usd-brl'
import { toPrismaOperationType, type FeatureKey } from '@/lib/credits/feature-config'

export const runtime = 'nodejs'

const TIMEZONE = 'America/Sao_Paulo'
const DEFAULT_RANGE_DAYS = 30
const MAX_RANGE_DAYS = 365

interface DayBucket {
  date: string // YYYY-MM-DD em America/Sao_Paulo
  usd: number
  calls: number
}

interface SpendingResponse {
  range: { start: string; end: string }
  totals: { usd: number; calls: number; fallbackRows: number }
  byDay: DayBucket[]
  exchangeRate: ExchangeRate
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId || !(await isAdmin(userId))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const { start, end } = parseRange(url.searchParams.get('start'), url.searchParams.get('end'))

    const [usageHistory, organizationUsage, exchangeRate] = await Promise.all([
      db.usageHistory.findMany({
        where: { timestamp: { gte: start, lte: end } },
        select: { operationType: true, creditsUsed: true, details: true, timestamp: true },
      }),
      db.organizationUsage.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          // Top-ups (credits added manually) gravam aqui com feature='manual_credit_adjustment'
          // e credits positivo, indistinguíveis de débito. Não são gasto, então excluímos.
          feature: { not: 'manual_credit_adjustment' },
        },
        select: { feature: true, credits: true, metadata: true, createdAt: true },
      }),
      getUsdBrlRate().catch((error) => {
        console.warn('[admin/spending] exchange rate failed, using hardcoded fallback:', error)
        return {
          brl: 5.0,
          fetchedAt: new Date().toISOString(),
          source: 'fallback' as const,
        }
      }),
    ])

    // Bucketing por dia em America/Sao_Paulo
    const buckets = new Map<string, DayBucket>()
    let totalUsd = 0
    let totalCalls = 0
    let fallbackRows = 0

    const addToBucket = (date: Date, usd: number) => {
      const key = formatDateInTimezone(date, TIMEZONE)
      const existing = buckets.get(key)
      if (existing) {
        existing.usd += usd
        existing.calls += 1
      } else {
        buckets.set(key, { date: key, usd, calls: 1 })
      }
    }

    for (const row of usageHistory) {
      const cost = estimateUsdCost({
        operationType: row.operationType,
        creditsUsed: row.creditsUsed,
        details: (row.details as Record<string, unknown> | null) ?? null,
      })
      if (cost.basis === 'fallback') fallbackRows += 1
      totalUsd += cost.usd
      totalCalls += 1
      addToBucket(row.timestamp, cost.usd)
    }

    for (const row of organizationUsage) {
      // OrganizationUsage.feature é string. Mapeia pra OperationType via feature-config.
      let operationType: string = row.feature
      try {
        operationType = toPrismaOperationType(row.feature as FeatureKey)
      } catch {
        // feature desconhecida — vai cair em fallback no estimate
      }
      const cost = estimateUsdCost({
        operationType,
        creditsUsed: row.credits,
        details: (row.metadata as Record<string, unknown> | null) ?? null,
      })
      if (cost.basis === 'fallback') fallbackRows += 1
      totalUsd += cost.usd
      totalCalls += 1
      addToBucket(row.createdAt, cost.usd)
    }

    // Preenche dias vazios entre start e end pra o gráfico não pular datas
    const allDays = enumerateDaysInTimezone(start, end, TIMEZONE)
    const byDay: DayBucket[] = allDays.map((date) => buckets.get(date) ?? { date, usd: 0, calls: 0 })

    const response: SpendingResponse = {
      range: { start: start.toISOString(), end: end.toISOString() },
      totals: {
        usd: round2(totalUsd),
        calls: totalCalls,
        fallbackRows,
      },
      byDay: byDay.map((d) => ({ ...d, usd: round2(d.usd) })),
      exchangeRate,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[admin/spending] error:', error)
    return NextResponse.json(
      {
        error: 'Erro ao calcular gastos',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

function parseRange(rawStart: string | null, rawEnd: string | null): { start: Date; end: Date } {
  const end = rawEnd ? new Date(rawEnd) : new Date()
  const start = rawStart
    ? new Date(rawStart)
    : new Date(Date.now() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000)

  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) {
    throw new Error('Datas inválidas')
  }

  // Limita range pra evitar consultas absurdas
  const diffMs = end.getTime() - start.getTime()
  const maxMs = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000
  if (diffMs > maxMs) {
    throw new Error(`Período máximo é de ${MAX_RANGE_DAYS} dias`)
  }
  if (diffMs < 0) {
    throw new Error('end deve ser >= start')
  }

  return { start, end }
}

/** Formata um Date como YYYY-MM-DD no timezone informado. */
function formatDateInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA produz YYYY-MM-DD nativamente
  return formatter.format(date)
}

/** Lista todos os dias entre start e end (inclusive) no timezone informado. */
function enumerateDaysInTimezone(start: Date, end: Date, timezone: string): string[] {
  const days: string[] = []
  const cursor = new Date(start)
  // Avança 1 dia por iteração até passar do end
  while (cursor.getTime() <= end.getTime()) {
    days.push(formatDateInTimezone(cursor, timezone))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  // Garante que o último dia (end) está incluído mesmo com diferença de timezone
  const endKey = formatDateInTimezone(end, timezone)
  if (days[days.length - 1] !== endKey) days.push(endKey)
  return Array.from(new Set(days))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
