'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DateRangePicker } from '@/components/analytics/date-range-picker'
import { useAdminSpending, type SpendingDay, type SpendingExchangeRate } from '@/hooks/admin/use-admin-spending'

type Currency = 'USD' | 'BRL'

const STORAGE_KEY = 'admin.spending.currency'
const DEFAULT_RANGE_DAYS = 30

export default function AdminSpendingPage() {
  const [range, setRange] = React.useState<DateRange | undefined>(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - DEFAULT_RANGE_DAYS)
    return { from: start, to: end }
  })

  const [currency, setCurrency] = React.useState<Currency>('USD')

  // Hidrata moeda do localStorage só no client (evita mismatch SSR)
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === 'USD' || saved === 'BRL') setCurrency(saved)
  }, [])

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, currency)
    }
  }, [currency])

  const queryEnabled = Boolean(range?.from && range?.to)
  const start = range?.from ?? new Date()
  const end = range?.to ?? new Date()

  const { data, isLoading, isError } = useAdminSpending({ start, end })

  const rate = data?.exchangeRate.brl ?? 1
  const toDisplay = React.useCallback(
    (usd: number) => (currency === 'USD' ? usd : usd * rate),
    [currency, rate]
  )

  const formatCurrency = React.useCallback(
    (value: number) =>
      currency === 'USD'
        ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
        : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }),
    [currency]
  )

  const totalsDisplay = data ? toDisplay(data.totals.usd) : 0
  const exchangeLabel = data ? buildExchangeLabel(data.exchangeRate, currency) : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gastos & Uso</h1>
          <p className="text-muted-foreground mt-2">
            Custo estimado de chamadas a APIs externas no período selecionado.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <KPICompact
            label="Total no período"
            value={isLoading ? '—' : formatCurrency(totalsDisplay)}
            highlight
          />
          <KPICompact
            label="Chamadas"
            value={isLoading ? '—' : (data?.totals.calls ?? 0).toLocaleString('pt-BR')}
          />
          <Tabs value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
            <TabsList>
              <TabsTrigger value="USD">USD ($)</TabsTrigger>
              <TabsTrigger value="BRL">BRL (R$)</TabsTrigger>
            </TabsList>
          </Tabs>
          <DateRangePicker value={range} onChange={setRange} disabled={!queryEnabled} />
        </div>
      </div>

      {/* Sub-label da cotação (só em modo BRL) */}
      {currency === 'BRL' && exchangeLabel && (
        <p className="text-xs text-muted-foreground">{exchangeLabel}</p>
      )}

      {/* Card único: gráfico */}
      <Card className="p-6">
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : isError ? (
          <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
            Não foi possível carregar os gastos. Tente novamente.
          </div>
        ) : data && data.byDay.length > 0 ? (
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.byDay.map((d) => ({ ...d, display: toDisplay(d.usd) }))}
                margin={{ top: 12, right: 24, left: 12, bottom: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxisLabel}
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v: number) => formatCurrency(v)}
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  width={90}
                />
                <Tooltip
                  content={(props) => (
                    <CustomTooltip
                      active={props.active}
                      payload={props.payload as TooltipPayload[] | undefined}
                      label={props.label as string | undefined}
                      formatCurrency={formatCurrency}
                    />
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="display"
                  stroke="hsl(280 100% 70%)"
                  strokeWidth={3}
                  dot={{ fill: 'hsl(280 100% 70%)', r: 4 }}
                  activeDot={{ r: 6, fill: 'hsl(280 100% 70%)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
            Sem chamadas no período selecionado.
          </div>
        )}
      </Card>

      {/* Honestidade sobre fallback */}
      {data && data.totals.calls > 0 && data.totals.fallbackRows > 0 && (
        <p className="text-xs text-muted-foreground">
          {data.totals.fallbackRows} de {data.totals.calls} chamada
          {data.totals.calls === 1 ? '' : 's'} usaram estimativa fallback (provider/model não
          identificado nos metadados).
        </p>
      )}
    </div>
  )
}

interface KPICompactProps {
  label: string
  value: string
  highlight?: boolean
}

function KPICompact({ label, value, highlight }: KPICompactProps) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className={
          highlight
            ? 'text-2xl font-semibold text-foreground tabular-nums'
            : 'text-lg font-medium text-foreground tabular-nums'
        }
      >
        {value}
      </span>
    </div>
  )
}

interface TooltipPayload {
  payload: SpendingDay & { display: number }
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
  formatCurrency: (value: number) => string
}

function CustomTooltip({ active, payload, label, formatCurrency }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) return null
  const day = payload[0].payload
  return (
    <div className="rounded-md border border-border/60 bg-background/95 p-3 text-sm shadow-md backdrop-blur">
      <p className="font-medium text-foreground">{formatTooltipDate(label)}</p>
      <p className="mt-1 text-muted-foreground">
        Gasto:{' '}
        <span className="font-semibold text-foreground">
          {formatCurrency(day.display)}
        </span>
      </p>
      <p className="text-muted-foreground">
        Chamadas:{' '}
        <span className="font-semibold text-foreground tabular-nums">
          {day.calls.toLocaleString('pt-BR')}
        </span>
      </p>
    </div>
  )
}

function formatXAxisLabel(value: string): string {
  // value é YYYY-MM-DD; converter pra dd/MM
  const [, month, day] = value.split('-')
  if (!month || !day) return value
  return `${day}/${month}`
}

function formatTooltipDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  const date = new Date(year, month - 1, day)
  return format(date, "dd 'de' MMMM, yyyy", { locale: ptBR })
}

function buildExchangeLabel(rate: SpendingExchangeRate, currency: Currency): string | null {
  if (currency !== 'BRL') return null
  if (rate.source === 'fallback') {
    return `Cotação indisponível, usando R$ ${rate.brl.toFixed(2)} como referência.`
  }
  const fetchedDate = new Date(rate.fetchedAt)
  const time = format(fetchedDate, "HH'h'mm", { locale: ptBR })
  const sourceLabel = rate.source === 'cache' ? 'cache local' : 'awesomeapi'
  return `BRL @ R$ ${rate.brl.toFixed(2)} — atualizado às ${time} (${sourceLabel}).`
}
