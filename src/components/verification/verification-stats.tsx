'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldCheck, ShieldAlert, Clock, ShieldOff, Activity } from 'lucide-react'
import { useVerificationStats } from '@/hooks/use-verification'
import { Skeleton } from '@/components/ui/skeleton'

interface VerificationStatsProps {
  projectId?: number
}

export function VerificationStats({ projectId }: VerificationStatsProps) {
  const { data: stats, isLoading, error } = useVerificationStats(projectId)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Estatísticas de Verificação</CardTitle>
          <CardDescription>Carregando estatísticas...</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Estatísticas de Verificação</CardTitle>
          <CardDescription className="text-red-500">Erro ao carregar estatísticas</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!stats) {
    return null
  }

  const verificationRate = stats.total > 0 ? ((stats.verified / stats.total) * 100).toFixed(1) : '0.0'
  const fallbackRate =
    stats.verified > 0 ? ((stats.verifiedByFallback / stats.verified) * 100).toFixed(1) : '0.0'

  const statItems = [
    {
      label: 'Total Stories',
      value: stats.total,
      icon: Activity,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Verificados',
      value: stats.verified,
      icon: ShieldCheck,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      subtitle: `${verificationRate}% do total`,
    },
    {
      label: 'Pendentes',
      value: stats.pending,
      icon: Clock,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
    {
      label: 'Falhados',
      value: stats.failed,
      icon: ShieldAlert,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
    {
      label: 'Ignorados',
      value: stats.skipped,
      icon: ShieldOff,
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/10',
    },
    {
      label: 'Via Fallback',
      value: stats.verifiedByFallback,
      icon: ShieldCheck,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      subtitle: `${fallbackRate}% dos verificados`,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estatísticas de Verificação</CardTitle>
        <CardDescription>
          Resumo de verificação de stories{projectId ? ' deste projeto' : ' de todos os projetos'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statItems.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className={`p-4 rounded-lg border ${stat.bgColor}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-sm text-muted-foreground">{stat.label}</span>
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
              {stat.subtitle && <div className="text-xs text-muted-foreground mt-1">{stat.subtitle}</div>}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
