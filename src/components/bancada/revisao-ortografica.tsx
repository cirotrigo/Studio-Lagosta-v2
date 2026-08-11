'use client'

/**
 * O que a revisão ortográfica mostra na bancada.
 *
 * Duas peças, e nada além disso:
 *
 * - `AvisoDeRevisao`: UMA linha discreta embaixo do campo, enquanto a pessoa
 *   escreve. Clicar na sugestão CORRIGE o texto — é o usuário aceitando, não o
 *   sistema reescrevendo a copy do cliente. Cada item também pode ser
 *   dispensado, e o dispensado some para sempre naquela peça.
 * - `ConfirmacaoDeRevisao`: o pedido de confirmação na saída, curto e com
 *   "seguir" como ação padrão à direita. **Nunca bloqueia** — é o mesmo
 *   contrato de "avisa, nunca veta" do QA de arte e da campanha vencida.
 *
 * Sem suspeita pendente nenhuma das duas aparece: quem escreveu certo não
 * ganha passo extra nenhum.
 */

import * as React from 'react'
import { X } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Suspeita } from '@/lib/ai/revisao-ortografica-contrato'

export function AvisoDeRevisao({
  suspeitas,
  onCorrigir,
  onDispensar,
}: {
  suspeitas: Suspeita[]
  onCorrigir: (suspeita: Suspeita) => void
  onDispensar: (suspeita: Suspeita) => void
}) {
  if (suspeitas.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-amber-600 dark:text-amber-500">
      <span>
        {suspeitas.length === 1 ? '1 possível erro:' : `${suspeitas.length} possíveis erros:`}
      </span>
      {suspeitas.map((s) => (
        <span key={s.trecho} className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => onCorrigir(s)}
            title={`Trocar por "${s.sugestao}" — ${s.motivo}`}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-amber-500/10"
          >
            <span className="line-through opacity-70">{s.trecho}</span>
            <span aria-hidden>→</span>
            <strong className="font-semibold">{s.sugestao}</strong>
          </button>
          <button
            type="button"
            onClick={() => onDispensar(s)}
            title={`Ignorar "${s.trecho}"`}
            className="rounded p-0.5 opacity-60 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  )
}

export function ConfirmacaoDeRevisao({
  suspeitas,
  aberta,
  onOpenChange,
  onSeguir,
  rotuloSeguir,
}: {
  suspeitas: Suspeita[]
  aberta: boolean
  onOpenChange: (aberta: boolean) => void
  onSeguir: () => void
  /** O que o botão da direita diz — o mesmo verbo do botão que abriu isto. */
  rotuloSeguir: string
}) {
  return (
    <AlertDialog open={aberta} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {suspeitas.length === 1
              ? 'Um possível erro na copy'
              : `${suspeitas.length} possíveis erros na copy`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <ul className="space-y-1">
                {suspeitas.map((s) => (
                  <li key={s.trecho}>
                    <span className="line-through opacity-70">{s.trecho}</span>{' '}
                    <span aria-hidden>→</span>{' '}
                    <strong className="font-semibold text-foreground">{s.sugestao}</strong>{' '}
                    <span className="opacity-70">({s.motivo})</span>
                  </li>
                ))}
              </ul>
              <p>A arte reproduz a copy letra por letra — o erro sai impresso.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar e corrigir</AlertDialogCancel>
          <AlertDialogAction onClick={onSeguir}>{rotuloSeguir}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
