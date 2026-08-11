'use client'

/**
 * Revisão ortográfica em SEGUNDO PLANO, enquanto a pessoa digita.
 *
 * O ponto de todo o desenho é que o clique em "adicionar"/"gerar" não espere
 * nada: a revisão dispara ~800ms depois da última tecla e, quando a pessoa
 * decide seguir, o resultado já está na tela. Verificação que adiciona espera
 * perceptível é a que o Ciro desligou três vezes em 10 e 11/08.
 *
 * Cache por CONTEÚDO: o texto entra na `queryKey`, com `staleTime: Infinity`.
 * O compositor re-renderiza a cada tecla e a cada foto escolhida — sem isso, o
 * mesmo texto seria revisado dezenas de vezes.
 *
 * Falha é SILÊNCIO: `retry: false` e erro devolve lista vazia. Nada de toast,
 * nada de mensagem vermelha embaixo do campo de quem está escrevendo.
 */

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import {
  MIN_CARACTERES_PARA_REVISAR,
  type RevisaoOrtografica,
  type Suspeita,
} from '@/lib/ai/revisao-ortografica-contrato'

/** Quanto tempo parado antes de conferir. */
const DEBOUNCE_MS = 800

const VAZIO: Suspeita[] = []

interface Args {
  projectId: number
  /** Blocos de copy da peça (uma linha por bloco). */
  blocos: string[]
  /** Legenda do post, quando o formato tiver uma. */
  legenda?: string | null
  /** Desligar a revisão sem desmontar o componente. */
  ativo?: boolean
}

export function useRevisaoOrtografica({ projectId, blocos, legenda, ativo = true }: Args): {
  suspeitas: Suspeita[]
  revisando: boolean
} {
  // Uma string só: é o que entra no debounce e na chave do cache. Blocos e
  // legenda viajam separados no corpo, mas identidade é o conteúdo inteiro.
  const assinatura = React.useMemo(
    () => JSON.stringify({ b: blocos.map((b) => b.trim()).filter(Boolean), l: legenda?.trim() || '' }),
    [blocos, legenda],
  )

  const [estavel, setEstavel] = React.useState(assinatura)
  React.useEffect(() => {
    const id = setTimeout(() => setEstavel(assinatura), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [assinatura])

  const pedido = React.useMemo(
    () => JSON.parse(estavel) as { b: string[]; l: string },
    [estavel],
  )
  const caracteres = [...pedido.b, pedido.l].join('\n').trim().length
  const habilitado = ativo && caracteres >= MIN_CARACTERES_PARA_REVISAR

  const { data, isFetching } = useQuery<RevisaoOrtografica>({
    queryKey: ['revisao-ortografica', projectId, estavel],
    queryFn: () =>
      api.post<RevisaoOrtografica>(`/api/projects/${projectId}/revisao-ortografica`, {
        blocos: pedido.b,
        legenda: pedido.l || null,
      }),
    enabled: habilitado,
    // Uma revisão por conteúdo. Sem retry (o silêncio é melhor que insistir na
    // cara de quem digita) e sem refetch por foco.
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  })

  return {
    suspeitas: habilitado ? (data?.suspeitas ?? VAZIO) : VAZIO,
    revisando: habilitado && isFetching,
  }
}
