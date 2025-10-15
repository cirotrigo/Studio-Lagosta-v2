'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card } from '@/components/ui/card'

interface FeatureBreakdownChartProps {
  data: Array<{
    feature: string
    operations: number
    creditsUsed: number
  }>
  isLoading?: boolean
}

const FEATURE_COLORS: Record<string, string> = {
  'AI_IMAGE_GENERATION': 'hsl(217 91% 60%)',
  'VIDEO_EXPORT': 'hsl(271 81% 56%)',
  'AI_TEXT_CHAT': 'hsl(142 76% 36%)',
  'CREATIVE_DOWNLOAD': 'hsl(38 92% 50%)',
}

const FEATURE_LABELS: Record<string, string> = {
  'AI_IMAGE_GENERATION': 'Geração de Imagens',
  'VIDEO_EXPORT': 'Exportação de Vídeos',
  'AI_TEXT_CHAT': 'Chat AI',
  'CREATIVE_DOWNLOAD': 'Download de Criativos',
}

function getFeatureColor(feature: string): string {
  return FEATURE_COLORS[feature] || 'hsl(var(--primary))'
}

function getFeatureLabel(feature: string): string {
  return FEATURE_LABELS[feature] || feature
}

export function FeatureBreakdownChart({ data, isLoading }: FeatureBreakdownChartProps) {
  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="h-[350px] flex items-center justify-center">
          <div className="text-muted-foreground">Carregando gráfico...</div>
        </div>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-6">
        <div className="h-[350px] flex flex-col items-center justify-center">
          <div className="text-muted-foreground mb-2">Nenhum dado disponível</div>
          <div className="text-sm text-muted-foreground">
            Não há atividade registrada para o período selecionado
          </div>
        </div>
      </Card>
    )
  }

  const formattedData = data.map((item) => ({
    ...item,
    featureLabel: getFeatureLabel(item.feature),
  }))

  // Sort by creditsUsed descending
  const sortedData = [...formattedData].sort((a, b) => b.creditsUsed - a.creditsUsed)

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Uso por Feature</h3>
        <p className="text-sm text-muted-foreground">
          Créditos gastos por tipo de funcionalidade
        </p>
      </div>

      <ResponsiveContainer width="100%" height={350}>
        <BarChart
          data={sortedData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 60,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="featureLabel"
            className="text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            className="text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            label={{
              value: 'Créditos',
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'hsl(var(--muted-foreground))' },
            }}
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
            formatter={(value: number, name: string) => {
              if (name === 'creditsUsed') return [value.toLocaleString(), 'Créditos']
              if (name === 'operations') return [value.toLocaleString(), 'Operações']
              return [value, name]
            }}
          />
          <Legend
            wrapperStyle={{
              paddingTop: '10px',
            }}
            formatter={(value) => {
              if (value === 'creditsUsed') return 'Créditos Gastos'
              if (value === 'operations') return 'Total de Operações'
              return value
            }}
          />
          <Bar
            dataKey="creditsUsed"
            name="creditsUsed"
            radius={[8, 8, 0, 0]}
          >
            {sortedData.map((entry) => (
              <Cell
                key={entry.feature}
                fill={getFeatureColor(entry.feature)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Summary Table */}
      <div className="mt-6 space-y-2">
        {sortedData.map((item) => (
          <div
            key={item.feature}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getFeatureColor(item.feature) }}
              />
              <span className="text-sm font-medium">{item.featureLabel}</span>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="text-right">
                <div className="font-semibold">{item.operations.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">operações</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-amber-600">
                  {item.creditsUsed.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">créditos</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
