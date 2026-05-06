/**
 * Auditoria do gasto de um dia em /admin/spending.
 *
 * Reproduz a lógica do endpoint mas adiciona quebras por:
 * - operationType (count, créditos, USD precise vs fallback)
 * - userId/orgId (top 10 por USD)
 * - hora do dia (detectar pico curto vs distribuído)
 * - sample de 5 linhas por operationType com details preview
 *
 * Read-only. Não modifica nada.
 *
 * Uso:
 *   DAY=2026-05-04 npx tsx scripts/audit-spending-day.ts
 */

import { db } from '../src/lib/db'
import { estimateUsdCost } from '../src/lib/credits/cost-estimates'
import { toPrismaOperationType, type FeatureKey } from '../src/lib/credits/feature-config'

const TIMEZONE = 'America/Sao_Paulo'
const FALLBACK_RATE = 5.5 // pra preview em BRL — script offline, não chama API

const DAY = process.env.DAY ?? '2026-05-04'

function startOfDayInSP(dayYYYYMMDD: string): Date {
  // 00:00:00 em America/Sao_Paulo (UTC-3) = 03:00:00 UTC
  return new Date(`${dayYYYYMMDD}T03:00:00.000Z`)
}

function endOfDayInSP(dayYYYYMMDD: string): Date {
  const next = new Date(startOfDayInSP(dayYYYYMMDD))
  next.setUTCDate(next.getUTCDate() + 1)
  return next
}

function formatHourSP(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).format(date)
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`
}
function fmtBrl(n: number): string {
  return `R$ ${n.toFixed(2)}`
}
function pad(s: string | undefined | null, n: number): string {
  const str = String(s ?? '')
  return str.length >= n ? str : str + ' '.repeat(n - str.length)
}

interface Row {
  source: 'usageHistory' | 'organizationUsage'
  operationType: string
  creditsUsed: number
  details: Record<string, unknown> | null
  timestamp: Date
  userId: string | number | null
  organizationId: string | null
}

async function main() {
  const start = startOfDayInSP(DAY)
  const end = endOfDayInSP(DAY)

  console.log(`\n📅 Auditando gastos em ${DAY} (00:00 → 24:00 ${TIMEZONE})`)
  console.log(`   UTC range: ${start.toISOString()} → ${end.toISOString()}\n`)

  // Neon cold-start retry helper
  async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 5): Promise<T> {
    let lastErr: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (e: any) {
        lastErr = e
        const msg = e?.message ?? String(e)
        if (!/Can't reach database|Timed out|connection pool/.test(msg)) throw e
        const wait = 2000 * attempt
        console.warn(`  ⚠ ${label} attempt ${attempt}/${maxAttempts} failed (${msg.slice(0, 80)}), retrying in ${wait}ms…`)
        await new Promise((r) => setTimeout(r, wait))
      }
    }
    throw lastErr
  }

  const usageHistory = await withRetry(
    () =>
      db.usageHistory.findMany({
        where: { timestamp: { gte: start, lt: end } },
        select: {
          operationType: true,
          creditsUsed: true,
          details: true,
          timestamp: true,
          userId: true,
        },
      }),
    'usageHistory.findMany',
  )
  const includeTopUps = process.env.INCLUDE_TOP_UPS === '1'
  const organizationUsage = await withRetry(
    () =>
      db.organizationUsage.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          ...(includeTopUps ? {} : { feature: { not: 'manual_credit_adjustment' } }),
        },
        select: {
          feature: true,
          credits: true,
          metadata: true,
          createdAt: true,
          userId: true,
          organizationId: true,
        },
      }),
    'organizationUsage.findMany',
  )
  if (!includeTopUps) {
    console.log('   (filtro: manual_credit_adjustment excluído. Use INCLUDE_TOP_UPS=1 para incluir.)')
  }

  console.log(`   UsageHistory rows:      ${usageHistory.length}`)
  console.log(`   OrganizationUsage rows: ${organizationUsage.length}`)
  console.log(`   Total rows:             ${usageHistory.length + organizationUsage.length}\n`)

  const rows: Row[] = []
  for (const u of usageHistory) {
    rows.push({
      source: 'usageHistory',
      operationType: u.operationType,
      creditsUsed: u.creditsUsed,
      details: (u.details as Record<string, unknown> | null) ?? null,
      timestamp: u.timestamp,
      userId: u.userId,
      organizationId: null,
    })
  }
  for (const o of organizationUsage) {
    let opType: string = o.feature
    try {
      opType = toPrismaOperationType(o.feature as FeatureKey)
    } catch {
      // unknown feature → keep original
    }
    rows.push({
      source: 'organizationUsage',
      operationType: opType,
      creditsUsed: o.credits,
      details: (o.metadata as Record<string, unknown> | null) ?? null,
      timestamp: o.createdAt,
      userId: o.userId,
      organizationId: o.organizationId,
    })
  }

  // ============================================================
  // 1) BREAKDOWN POR operationType
  // ============================================================
  console.log('━'.repeat(90))
  console.log('1) BREAKDOWN POR OPERATION TYPE')
  console.log('━'.repeat(90))

  interface OpStat {
    count: number
    credits: number
    usd: number
    usdPrecise: number
    usdFallback: number
    countPrecise: number
    countFallback: number
    refundCount: number
  }

  const byOp = new Map<string, OpStat>()
  let totalUsd = 0
  let totalCalls = 0
  let totalFallback = 0
  let totalPrecise = 0

  for (const row of rows) {
    const cost = estimateUsdCost({
      operationType: row.operationType,
      creditsUsed: Math.abs(row.creditsUsed), // refunds são negativos, mas o custo unit é o mesmo
      details: row.details ?? null,
    })

    const isRefund = row.creditsUsed < 0
    const signedUsd = isRefund ? -cost.usd : cost.usd

    totalUsd += signedUsd
    totalCalls += 1
    if (cost.basis === 'fallback') totalFallback += 1
    else totalPrecise += 1

    const stat = byOp.get(row.operationType) ?? {
      count: 0,
      credits: 0,
      usd: 0,
      usdPrecise: 0,
      usdFallback: 0,
      countPrecise: 0,
      countFallback: 0,
      refundCount: 0,
    }
    stat.count += 1
    stat.credits += row.creditsUsed
    stat.usd += signedUsd
    if (cost.basis === 'precise') {
      stat.usdPrecise += signedUsd
      stat.countPrecise += 1
    } else {
      stat.usdFallback += signedUsd
      stat.countFallback += 1
    }
    if (isRefund) stat.refundCount += 1
    byOp.set(row.operationType, stat)
  }

  const sorted = [...byOp.entries()].sort((a, b) => b[1].usd - a[1].usd)
  console.log(
    pad('OperationType', 28) +
      pad('Calls', 8) +
      pad('Refunds', 9) +
      pad('Credits', 10) +
      pad('USD', 12) +
      pad('Precise', 12) +
      pad('Fallback', 12),
  )
  console.log('-'.repeat(90))
  for (const [op, s] of sorted) {
    console.log(
      pad(op, 28) +
        pad(String(s.count), 8) +
        pad(String(s.refundCount), 9) +
        pad(String(s.credits), 10) +
        pad(fmtUsd(s.usd), 12) +
        pad(`${fmtUsd(s.usdPrecise)} (${s.countPrecise})`, 12) +
        pad(`${fmtUsd(s.usdFallback)} (${s.countFallback})`, 12),
    )
  }
  console.log('-'.repeat(90))
  console.log(
    pad('TOTAL', 28) +
      pad(String(totalCalls), 8) +
      pad('-', 9) +
      pad('-', 10) +
      pad(fmtUsd(totalUsd), 12) +
      pad(`(${totalPrecise} precise)`, 12) +
      pad(`(${totalFallback} fallback)`, 12),
  )
  console.log(
    `\n💰 Total USD estimado: ${fmtUsd(totalUsd)} ≈ ${fmtBrl(totalUsd * FALLBACK_RATE)} (a R$ ${FALLBACK_RATE.toFixed(2)}/USD ref.)`,
  )

  // ============================================================
  // 2) TOP USERS / ORGS
  // ============================================================
  console.log('\n' + '━'.repeat(90))
  console.log('2) TOP 10 GASTADORES (userId / orgId)')
  console.log('━'.repeat(90))

  interface UserStat {
    calls: number
    usd: number
    ops: Map<string, number>
  }
  const byUser = new Map<string, UserStat>()
  for (const row of rows) {
    const cost = estimateUsdCost({
      operationType: row.operationType,
      creditsUsed: Math.abs(row.creditsUsed),
      details: row.details ?? null,
    })
    const signedUsd = row.creditsUsed < 0 ? -cost.usd : cost.usd
    const key = row.organizationId
      ? `org:${row.organizationId}|user:${row.userId ?? '?'}`
      : `user:${row.userId ?? '?'}`
    const stat = byUser.get(key) ?? { calls: 0, usd: 0, ops: new Map() }
    stat.calls += 1
    stat.usd += signedUsd
    stat.ops.set(row.operationType, (stat.ops.get(row.operationType) ?? 0) + 1)
    byUser.set(key, stat)
  }

  const topUsers = [...byUser.entries()].sort((a, b) => b[1].usd - a[1].usd).slice(0, 10)
  for (const [key, stat] of topUsers) {
    const opsBreakdown = [...stat.ops.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([op, c]) => `${(op || '<empty>').replace('AI_', '')}=${c}`)
      .join(', ')
    console.log(`  ${fmtUsd(stat.usd).padStart(10)} | ${stat.calls.toString().padStart(4)} calls | ${pad(key, 50)} | ${opsBreakdown}`)
  }

  // ============================================================
  // 3) DISTRIBUIÇÃO POR HORA
  // ============================================================
  console.log('\n' + '━'.repeat(90))
  console.log('3) DISTRIBUIÇÃO POR HORA (America/Sao_Paulo)')
  console.log('━'.repeat(90))

  const byHour = new Map<string, { calls: number; usd: number }>()
  for (const row of rows) {
    const cost = estimateUsdCost({
      operationType: row.operationType,
      creditsUsed: Math.abs(row.creditsUsed),
      details: row.details ?? null,
    })
    const signedUsd = row.creditsUsed < 0 ? -cost.usd : cost.usd
    const hour = formatHourSP(row.timestamp)
    const stat = byHour.get(hour) ?? { calls: 0, usd: 0 }
    stat.calls += 1
    stat.usd += signedUsd
    byHour.set(hour, stat)
  }

  const sortedHours = [...byHour.entries()].sort(([a], [b]) => a.localeCompare(b))
  const maxUsd = Math.max(...sortedHours.map(([, s]) => s.usd))
  for (const [hour, stat] of sortedHours) {
    const barLen = maxUsd > 0 ? Math.round((stat.usd / maxUsd) * 40) : 0
    const bar = '█'.repeat(barLen) + '·'.repeat(Math.max(0, 40 - barLen))
    console.log(
      `  ${hour}h | ${bar} | ${fmtUsd(stat.usd).padStart(10)} | ${stat.calls.toString().padStart(4)} calls`,
    )
  }

  // ============================================================
  // 4) SAMPLE DE LINHAS POR operationType
  // ============================================================
  console.log('\n' + '━'.repeat(90))
  console.log('4) SAMPLE (5 LINHAS POR OPERATION) — para validar metadados')
  console.log('━'.repeat(90))

  for (const [op] of sorted) {
    const samples = rows.filter((r) => r.operationType === op).slice(0, 5)
    console.log(`\n  ${op}:`)
    for (const s of samples) {
      const detailsStr = s.details ? JSON.stringify(s.details).slice(0, 120) : 'null'
      console.log(
        `    [${s.timestamp.toISOString()}] credits=${s.creditsUsed} src=${s.source} userId=${s.userId} details=${detailsStr}`,
      )
    }
  }

  // ============================================================
  // 5) DETECÇÃO DE BURST PATTERN (H2 - bug refund)
  // ============================================================
  console.log('\n' + '━'.repeat(90))
  console.log('5) DETECÇÃO DE BURST (chamadas em sub-10s do mesmo userId+op — possível H2)')
  console.log('━'.repeat(90))

  const grouped = new Map<string, Row[]>()
  for (const row of rows) {
    if (row.creditsUsed < 0) continue // ignora refunds
    const key = `${row.userId}|${row.operationType}`
    const arr = grouped.get(key) ?? []
    arr.push(row)
    grouped.set(key, arr)
  }

  const bursts: { key: string; count: number; spanSec: number; usd: number }[] = []
  for (const [key, arr] of grouped) {
    if (arr.length < 5) continue
    arr.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    // Detecta janela em que >= 5 chamadas aconteceram em < 60s
    for (let i = 0; i + 5 <= arr.length; i++) {
      const window = arr.slice(i, i + 5)
      const spanMs = window[4].timestamp.getTime() - window[0].timestamp.getTime()
      if (spanMs < 60_000) {
        const usd = window.reduce((sum, r) => {
          const c = estimateUsdCost({
            operationType: r.operationType,
            creditsUsed: r.creditsUsed,
            details: r.details ?? null,
          })
          return sum + c.usd
        }, 0)
        bursts.push({ key, count: arr.length, spanSec: spanMs / 1000, usd })
        break
      }
    }
  }

  if (bursts.length === 0) {
    console.log('  Nenhum burst detectado (5+ chamadas em <60s do mesmo user+op).')
  } else {
    console.log(`  ${bursts.length} burst(s) detectado(s):`)
    for (const b of bursts.slice(0, 20)) {
      console.log(
        `    ${pad(b.key, 60)} | ${b.count} calls (${b.spanSec.toFixed(1)}s 1ª janela) | ${fmtUsd(b.usd)}`,
      )
    }
  }

  console.log('\n✅ Auditoria concluída.\n')
}

main()
  .catch((err) => {
    console.error('❌ Erro:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
