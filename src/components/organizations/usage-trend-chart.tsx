'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface UsageTrendChartProps {
  data: Array<{
    date: string
    imageGenerations: number
    videoGenerations: number
    chatInteractions: number
    creditsUsed: number
  }>
  period: string
  isLoading?: boolean
}

export function UsageTrendChart({ data, period, isLoading }: UsageTrendChartProps) {
  const formattedData = useMemo(() => {
    return data.map((item) => ({
      ...item,
      dateFormatted: format(new Date(item.date), 'dd MMM', { locale: ptBR }),
      totalCreatives: item.imageGenerations + item.videoGenerations + item.chatInteractions,
    }))
  }, [data])

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-muted-foreground">Carregando gráfico...</div>
        </div>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-6">
        <div className="h-[400px] flex flex-col items-center justify-center">
          <div className="text-muted-foreground mb-2">Nenhum dado disponível</div>
          <div className="text-sm text-muted-foreground">
            Não há atividade registrada para o período selecionado
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Tendência de Uso</h3>
        <p className="text-sm text-muted-foreground">
          Atividade da equipe nos últimos{' '}
          {period === '7d' ? '7 dias' : period === '30d' ? '30 dias' : '90 dias'}
        </p>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={formattedData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="dateFormatted"
            className="text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis
            className="text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              padding: '12px',
            }}
            labelStyle={{
              color: 'hsl(var(--foreground))',
              fontWeight: 600,
              marginBottom: '8px',
            }}
          />
          <Legend
            wrapperStyle={{
              paddingTop: '20px',
            }}
          />
          <Line
            type="monotone"
            dataKey="totalCreatives"
            name="Criativos"
            stroke="hsl(280 100% 70%)"
            strokeWidth={3}
            dot={{ fill: 'hsl(280 100% 70%)', r: 5 }}
            activeDot={{ r: 7 }}
          />
          <Line
            type="monotone"
            dataKey="imageGenerations"
            name="Imagens IA"
            stroke="hsl(217 91% 60%)"
            strokeWidth={2}
            dot={{ fill: 'hsl(217 91% 60%)', r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="videoGenerations"
            name="Vídeos"
            stroke="hsl(271 81% 56%)"
            strokeWidth={2}
            dot={{ fill: 'hsl(271 81% 56%)', r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="chatInteractions"
            name="Chat"
            stroke="hsl(142 76% 36%)"
            strokeWidth={2}
            dot={{ fill: 'hsl(142 76% 36%)', r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="creditsUsed"
            name="Créditos"
            stroke="hsl(38 92% 50%)"
            strokeWidth={2}
            dot={{ fill: 'hsl(38 92% 50%)', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}
