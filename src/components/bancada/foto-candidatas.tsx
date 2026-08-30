'use client'

/**
 * F4 — as candidatas de foto no card da bancada: trocar custa 1 toque.
 *
 * O item de plano chega com até 3 candidatas da emissão (`fotoCandidatas`,
 * lidas em `para-bancada.ts`): a escolhida é a primeira, e as outras são
 * alternativas da MESMA busca — trocar entre elas não abre o seletor. O
 * seletor completo continua existindo atrás do "ver mais" (o modal de edição
 * do card, como hoje).
 *
 * O que este componente registra, e o que ele nunca faz:
 *
 *  - Tocar numa candidata NÃO ativa troca a foto (via `onTrocar`, a MESMA via
 *    da edição do card — store + PATCH do item) e posta o desfecho no formato
 *    do seletor completo (`arte-ia-image-picker`): levar o topo é
 *    `aceita-como-veio`, levar outra é `trocada`, com `posicao` (F4) dizendo
 *    qual das mostradas foi a levada. Sem `sugestaoId`, nada é postado.
 *  - Tocar na já ativa é no-op — nenhum sinal, nenhuma troca.
 *  - Nada é postado na montagem.
 *  - Depois de uma troca aparece a linha de chips de motivo — **nunca
 *    obrigatória, nunca bloqueia** (pedágio se paga sem ler): some sozinha em
 *    ~15s, no X, ou na próxima ação. O chip tocado só ANOTA o motivo no sinal
 *    já postado (ramo `{ sugestaoId, motivoDaTroca }` da rota de desfecho).
 *
 * Falha de captura é silêncio absoluto — mesmo contrato de `use-aprendizado`.
 */

import * as React from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api-client'
import { useAprendizado } from '@/hooks/use-aprendizado'
import type { CandidataDeFoto } from '@/lib/planos/proposta-de-semana'
import {
  MOTIVOS_DE_TROCA_DE_FOTO,
  type MotivoDeTrocaDeFoto,
} from '@/lib/aprendizado/vocabulario'

/** Rótulos humanos dos motivos — os VALORES são o vocabulário fechado. */
const ROTULO_DO_MOTIVO: Record<MotivoDeTrocaDeFoto, string> = {
  escura: 'escura',
  'prato-antigo': 'prato antigo',
  'nao-e-o-assunto': 'não é o assunto',
  repetida: 'repetida',
  outro: 'outro',
}

export function FotoCandidatas({
  projectId,
  candidatas,
  ativaDriveFileId,
  onTrocar,
  onVerMais,
}: {
  projectId: number
  candidatas: CandidataDeFoto[]
  /** O `driveFileId` da cena atual do card — é ela que ganha o anel. */
  ativaDriveFileId: string | null
  /** Troca a foto do item pela via existente (store + PATCH do plano). */
  onTrocar: (candidata: CandidataDeFoto) => void
  /** Abre o seletor completo, como hoje (o modal de edição do card). */
  onVerMais: () => void
}) {
  const { registrarDesfecho } = useAprendizado(projectId)

  /** O sinal cuja troca acabou de acontecer — é nele que o chip anota. */
  const [motivoPara, setMotivoPara] = React.useState<string | null>(null)
  const [anotado, setAnotado] = React.useState(false)

  // A linha de chips é transitória: some sozinha depois de ~15s.
  React.useEffect(() => {
    if (!motivoPara) return
    const timer = window.setTimeout(() => setMotivoPara(null), 15_000)
    return () => window.clearTimeout(timer)
  }, [motivoPara])

  // O "Anotado" é um agradecimento curto, não um estado.
  React.useEffect(() => {
    if (!anotado) return
    const timer = window.setTimeout(() => setAnotado(false), 2_000)
    return () => window.clearTimeout(timer)
  }, [anotado])

  const tocar = (candidata: CandidataDeFoto, indice: number) => {
    // Tocar na já ativa é no-op: nada troca e NENHUM sinal é postado.
    if (candidata.driveFileId === ativaDriveFileId) return
    onTrocar(candidata)
    setAnotado(false)

    if (!candidata.sugestaoId) {
      setMotivoPara(null)
      return
    }
    // Mesmo formato do seletor completo (arte-ia-image-picker): levar o topo
    // é aceitar a proposta, levar outra é trocá-la. `posicao` é a novidade da
    // F4 — escolher a 2ª MOSTRADA é preferência precisa.
    registrarDesfecho({
      sugestaoId: candidata.sugestaoId,
      desfecho: indice === 0 ? 'aceita-como-veio' : 'trocada',
      escolhido: { driveFileId: candidata.driveFileId, posicao: indice + 1 },
    })
    // O chip pergunta por que a PROPOSTA (a 1ª) foi trocada — voltar para ela
    // é aceitação, e aí não há o que perguntar.
    setMotivoPara(indice > 0 ? candidata.sugestaoId : null)
  }

  const anotarMotivo = (motivo: MotivoDeTrocaDeFoto) => {
    if (!motivoPara) return
    // Ramo de SÓ-anotação da rota de desfecho: `{ sugestaoId, motivoDaTroca }`
    // sem `desfecho`. Fire-and-forget, mesmo contrato de `use-aprendizado`
    // (que não cobre este ramo porque `registrarDesfecho` exige desfecho).
    void api
      .post(`/api/projects/${projectId}/aprendizado/desfecho`, {
        sugestaoId: motivoPara,
        motivoDaTroca: motivo,
      })
      .catch((erro) => {
        console.warn('[aprendizado] motivo da troca não registrado (seguindo sem ele):', erro)
      })
    setMotivoPara(null)
    setAnotado(true)
  }

  return (
    <div className="space-y-1.5 pt-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {candidatas.slice(0, 3).map((candidata, indice) => {
          const ativa = candidata.driveFileId === ativaDriveFileId
          return (
            <button
              key={candidata.driveFileId}
              type="button"
              aria-pressed={ativa}
              onClick={() => tocar(candidata, indice)}
              title={
                ativa
                  ? `Foto desta arte${candidata.fileName ? ` — ${candidata.fileName}` : ''}`
                  : `Usar esta foto${candidata.fileName ? ` — ${candidata.fileName}` : ''}`
              }
              className={cn(
                'relative h-14 w-11 flex-shrink-0 overflow-hidden rounded border bg-muted/30',
                ativa
                  ? 'border-primary ring-2 ring-primary'
                  : 'border-border/50 hover:ring-2 hover:ring-primary/50',
              )}
            >
              <Image
                src={`/api/drive/thumbnail/${candidata.driveFileId}?size=160`}
                alt={candidata.fileName ?? ''}
                fill
                sizes="44px"
                className="object-cover"
                unoptimized
              />
              {/* A vaga de exploração: foto nova/nunca-proposta — o selo diz
                  por que ela está aqui sem transformá-la em recomendação. */}
              {candidata.vaga === 'exploracao' && (
                <span className="absolute left-0 top-0 bg-background/80 px-1 text-[9px] font-medium text-primary">
                  Nova
                </span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => {
            setMotivoPara(null)
            onVerMais()
          }}
          className="flex h-14 items-center rounded border border-dashed border-border/60 px-2 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
        >
          ver mais
        </button>
      </div>

      {motivoPara && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Por que trocou?</span>
          {MOTIVOS_DE_TROCA_DE_FOTO.map((motivo) => (
            <button
              key={motivo}
              type="button"
              onClick={() => anotarMotivo(motivo)}
              className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {ROTULO_DO_MOTIVO[motivo]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMotivoPara(null)}
            title="Dispensar"
            className="rounded-full border border-border/60 p-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {anotado && <p className="text-[11px] text-muted-foreground">Anotado ✓</p>}
    </div>
  )
}
