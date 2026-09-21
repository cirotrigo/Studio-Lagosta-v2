'use client'

import Link from 'next/link'
import { AlertTriangle, BookOpen, CalendarClock, Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useFatosDaCasa } from '@/hooks/use-aba-marca'

const NOME: Record<string, string> = {
  ESTABELECIMENTO_INFO: 'Estabelecimento',
  HORARIOS: 'Horários',
  CARDAPIO: 'Cardápio',
  DELIVERY: 'Delivery',
  POLITICAS: 'Políticas',
  CAMPANHAS: 'Campanhas',
  DIFERENCIAIS: 'Diferenciais',
  FAQ: 'Perguntas frequentes',
  TOM_DE_VOZ: 'Tom de voz (legado)',
}

const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

/**
 * "Fatos da casa" — a terceira área da aba Marca: o RESUMO da base (o que
 * existe por categoria, o que vence, quando foi mexida) e os atalhos para
 * editar LÁ. Nada é copiado para cá: preço, horário e promoção têm uma casa
 * só, com vigência, e é ela que a copy consulta na data da peça.
 */
export function FatosDaCasa({ projectId }: { projectId: number }) {
  const { data, isLoading, isError, error, refetch } = useFatosDaCasa(projectId)
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Fatos da casa</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Horário, cardápio, preço, campanha: moram na base, com prazo, e a copy os lê na data em que a peça vai ao ar. Aqui é o resumo — editar é lá.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm"><Link href={`/projects/${projectId}/base`}>Corrigir na base</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/knowledge?projectId=${projectId}`}>Ver tudo</Link></Button>
        </div>
      </div>
      {isError ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 p-3 text-sm">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Não consegui ler a base: {(error as Error)?.message || 'erro ao consultar'}. Isto NÃO quer dizer que ela está vazia.</span>
          <Button size="sm" variant="outline" onClick={() => void refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Tentar de novo</Button>
        </div>
      ) : isLoading || !data ? (
        <div className="mt-4 flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lendo a base…</div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {data.porCategoria.length === 0 && <span className="text-sm text-muted-foreground">A base deste cliente está vazia.</span>}
            {data.porCategoria.map((c) => (
              <Link key={c.categoria} href={`/knowledge?projectId=${projectId}&category=${c.categoria}`}>
                <Badge variant="outline" className="gap-1 py-1">
                  {NOME[c.categoria] ?? c.categoria} <span className="font-semibold">{c.total}</span>
                </Badge>
              </Link>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            {data.total} entrada{data.total === 1 ? '' : 's'} ativa{data.total === 1 ? '' : 's'}
            {data.ultimaAtualizacao && <> · última mexida em {dia(data.ultimaAtualizacao)}</>}
          </div>
          {(data.vencidas.length > 0 || data.vencendo.length > 0) && (
            <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium"><CalendarClock className="h-4 w-4" /> Prazos</div>
              {data.vencidas.map((e) => (
                <div key={e.id}>Vencida em {dia(e.validaAte)}: <strong>{e.titulo}</strong> ({NOME[e.categoria] ?? e.categoria}) — o cron arquiva; até lá a copy não a usa fora do prazo.</div>
              ))}
              {data.vencendo.map((e) => (
                <div key={e.id}>Vence em {dia(e.validaAte)}: <strong>{e.titulo}</strong> ({NOME[e.categoria] ?? e.categoria})</div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
