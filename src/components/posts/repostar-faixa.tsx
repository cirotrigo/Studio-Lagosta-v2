'use client'

import { useState } from 'react'
import Image from 'next/image'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRepostar } from '@/hooks/use-repostar'
import { DIAS_CURTOS, rotuloDeIdade, rotuloDeUso } from '@/lib/posts/repostar'
import type { ItemDeRepost } from '@/lib/posts/repostar-service'

interface RepostarFaixaProps {
  projectId: number
  quando: Date
  /** Editando um post: ele mesmo não é candidato a repost de si. */
  postIdEmEdicao?: string
  onEscolher: (item: ItemDeRepost) => void
}

const MOSTRAR_DE_INICIO = 8
const DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

function periodoDoDia(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'de manhã'
  if (h < 15) return 'no almoço'
  if (h < 18) return 'à tarde'
  return 'à noite'
}

/**
 * A faixa "Repostar" no topo do seletor de mídia: as artes que já foram ao ar
 * e valem voltar neste slot, ranqueadas por dia da semana + faixa + idade.
 *
 * Só aparece em STORY e com data escolhida (a repost de feed ficaria
 * duplicada no perfil — a equipe não faz isso: 10 casos em 8.649 posts).
 * Card cuja imagem não carrega se esconde: card quebrado na primeira tela é a
 * pior estreia possível para uma sugestão.
 */
export function RepostarFaixa({ projectId, quando, postIdEmEdicao, onEscolher }: RepostarFaixaProps) {
  const { data, isLoading } = useRepostar(projectId, quando, { excluirPostId: postIdEmEdicao })
  const [verTodos, setVerTodos] = useState(false)
  const [quebradas, setQuebradas] = useState<Set<string>>(() => new Set())

  const itens = (data?.itens ?? []).filter((i) => !quebradas.has(i.chave))
  if (!isLoading && itens.length === 0) return null

  const visiveis = verTodos ? itens : itens.slice(0, MOSTRAR_DE_INICIO)

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">
            Repostar
            <span className="ml-1 font-normal text-muted-foreground">
              — o que já foi ao ar {DIAS_LONGOS[quando.getDay()] === 'sábado' || DIAS_LONGOS[quando.getDay()] === 'domingo' ? 'no' : 'na'}{' '}
              {DIAS_LONGOS[quando.getDay()]} {periodoDoDia(quando)}
            </span>
          </p>
        </div>
        {itens.length > MOSTRAR_DE_INICIO && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setVerTodos((v) => !v)}>
            {verTodos ? 'ver menos' : `ver mais (${itens.length - MOSTRAR_DE_INICIO})`}
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">procurando o que já funcionou nesse horário…</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {visiveis.map((item) => (
            <RepostarCard
              key={item.chave}
              item={item}
              onEscolher={() => onEscolher(item)}
              onQuebrada={() => setQuebradas((s) => new Set(s).add(item.chave))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const COR_SEMAFORO = {
  verde: 'bg-emerald-500',
  ambar: 'bg-amber-500',
  vermelho: 'bg-red-500',
} as const

function RepostarCard({ item, onEscolher, onQuebrada }: { item: ItemDeRepost; onEscolher: () => void; onQuebrada: () => void }) {
  const horaCurta = item.hora.endsWith(':00') ? `${Number(item.hora.slice(0, 2))}h` : item.hora
  return (
    <div className="w-[7.5rem] shrink-0">
      <button
        type="button"
        onClick={onEscolher}
        className="group relative block w-full overflow-hidden rounded-md border bg-muted transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
        style={{ aspectRatio: '9 / 16' }}
        title="Usar esta arte"
      >
        <Image
          src={item.url}
          alt={item.templateName ?? 'Arte já publicada'}
          fill
          sizes="120px"
          className="object-cover"
          unoptimized
          onError={onQuebrada}
        />
        <span
          className={cn('absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white/80', COR_SEMAFORO[item.semaforo])}
          title={item.semaforo === 'verde' ? 'Mais de 14 dias — bom para repostar' : item.semaforo === 'ambar' ? 'Entre 7 e 13 dias' : 'Menos de 7 dias'}
        />
        <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-1 text-left text-[10px] leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100">
          Usar esta
        </span>
      </button>
      <p className="mt-1 truncate text-[11px] leading-tight text-foreground" title={`${DIAS_CURTOS[item.diaDaSemana]} ${item.hora} · ${rotuloDeIdade(item.diasDesde)}`}>
        {DIAS_CURTOS[item.diaDaSemana]} {horaCurta} · {rotuloDeIdade(item.diasDesde)}
      </p>
      <p className={cn('truncate text-[11px] leading-tight', item.semaforo === 'vermelho' ? 'text-red-600' : 'text-muted-foreground')}>
        {item.semaforo === 'vermelho' ? `foi ao ar ${rotuloDeIdade(item.diasDesde)}` : rotuloDeUso(item.vezesUsada)}
        {item.alcance != null ? ` · ${item.alcance >= 1000 ? `${(item.alcance / 1000).toFixed(1)} mil` : item.alcance} de alcance` : ''}
      </p>
      {item.avisoDePrazo && (
        <p className="truncate text-[11px] leading-tight text-amber-600" title={item.avisoDePrazo}>
          ⚠️ {item.avisoDePrazo}
        </p>
      )}
    </div>
  )
}
