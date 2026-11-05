"use client"

import * as React from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LIMITE_DO_LOTE } from '@/lib/grades/preenchimento'

/** A busca do acervo de onde a foto saiu, presa no toque: o sinal (se a foto for aplicada) vai para ELA */
export interface ContextoDaBusca {
  sugestaoId: string
  propostaTopo: string | null
  /** 1 = topo da lista */
  posicao?: number
}

/** Uma foto escolhida para o lote, na ordem do toque; nada sobe nem baixa antes de "Preencher" */
export type EscolhaDoLote =
  | { chave: string; tipo: 'drive'; id: string; nome: string; busca?: ContextoDaBusca }
  | { chave: string; tipo: 'arquivo'; arquivo: File; nome: string }

/** Toque acrescenta no fim (até o limite); tocar de novo tira, e as outras mantêm a ordem */
export function alternarNoLote(lote: EscolhaDoLote[], escolha: EscolhaDoLote, limite: number): EscolhaDoLote[] {
  if (lote.some((e) => e.chave === escolha.chave)) return lote.filter((e) => e.chave !== escolha.chave)
  return lote.length >= limite ? lote : [...lote, escolha]
}

export type SelecaoDaGrade = { tipo: 'grade'; vagas: number } | { tipo: 'celula' } | null

/**
 * G2 · barra do painel Imagens quando a seleção é uma grade: diz onde a próxima foto entra e abre o LOTE — fotos do
 * Drive, do acervo e do computador escolhidas em ordem, aplicadas numa operação só ao clicar "Preencher". UI mínima:
 * a barra de ajustes da grade é o G3.
 */
export function BarraDoLote({
  selecao,
  video,
  lote,
  emVoo,
  onAbrir,
  onRemover,
  onArquivos,
  onPreencher,
  onCancelar,
}: {
  selecao: SelecaoDaGrade
  video: boolean
  lote: EscolhaDoLote[] | null
  emVoo: boolean
  onAbrir: () => void
  onRemover: (chave: string) => void
  onArquivos: (arquivos: File[]) => void
  onPreencher: () => void
  onCancelar: () => void
}) {
  const entrada = React.useRef<HTMLInputElement>(null)
  if (!selecao && lote === null && !emVoo) return null
  const vagas = selecao?.tipo === 'grade' ? selecao.vagas : 0
  const limite = Math.min(LIMITE_DO_LOTE, vagas)
  const texto = !selecao
    ? 'Selecione a grade inteira (um clique nela) para preencher.'
    : video
      ? 'Página de vídeo: fotos não entram em célula de grade.'
      : selecao.tipo === 'celula'
        ? 'Célula selecionada: a próxima foto substitui a desta célula.'
        : vagas > 0
          ? `Grade selecionada: a próxima foto entra na primeira célula vazia (${vagas} ${vagas === 1 ? 'vazia' : 'vazias'}).`
          : 'Grade cheia: a próxima foto entra avulsa. Para trocar uma foto, selecione a célula (segundo clique).'

  return (
    <div data-barra="lote-da-grade" className="mb-2 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
      <p className="text-muted-foreground">{texto}</p>
      {lote === null ? (
        selecao?.tipo === 'grade' && (
          <Button type="button" size="sm" className="h-7 w-full text-xs" aria-label="Preencher com várias fotos" disabled={video || vagas === 0 || emVoo} onClick={onAbrir}>
            Preencher com várias fotos
          </Button>
        )
      ) : (
        <>
          <p>Toque nas fotos na ordem em que devem entrar (até {limite}).</p>
          {lote.length > 0 && (
            <ol className="space-y-1">
              {lote.map((e, i) => (
                <li key={e.chave} data-escolha={i + 1} className="flex items-center gap-1.5">
                  <span className="font-semibold">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate" title={e.nome}>
                    {e.nome}
                  </span>
                  <button type="button" aria-label={`Tirar ${e.nome}`} disabled={emVoo} onClick={() => onRemover(e.chave)} className="text-muted-foreground hover:text-foreground disabled:opacity-50">
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ol>
          )}
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(ev) => {
              onArquivos(Array.from(ev.target.files ?? []))
              ev.target.value = ''
            }}
          />
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-7 flex-1 px-2 text-xs" disabled={emVoo || lote.length >= limite} onClick={() => entrada.current?.click()}>
              <Upload className="mr-1 h-3 w-3" />
              Do computador
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 flex-1 px-2 text-xs"
              aria-label="Preencher as células"
              disabled={emVoo || video || selecao?.tipo !== 'grade' || lote.length === 0 || lote.length > limite}
              onClick={onPreencher}
            >
              Preencher {lote.length} {lote.length === 1 ? 'célula' : 'células'}
            </Button>
          </div>
        </>
      )}
      {emVoo && (
        <p className="flex items-center gap-1.5 font-medium">
          <Loader2 className="h-3 w-3 animate-spin" />
          Aplicando as fotos…
        </p>
      )}
      {(lote !== null || emVoo) && (
        <Button type="button" size="sm" variant="ghost" className="h-7 w-full text-xs" aria-label="Cancelar" onClick={onCancelar}>
          {emVoo ? 'Cancelar o envio' : 'Cancelar'}
        </Button>
      )}
    </div>
  )
}

/** G2 · enquanto uma foto de entrada única (IA) é medida e aplicada na grade: o estado e o Cancelar daquela instância */
export function AplicandoNaGrade({ emVoo, onCancelar }: { emVoo: boolean; onCancelar: () => void }) {
  if (!emVoo) return null
  return (
    <div data-aplicando="grade" className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span className="flex-1 font-medium">Aplicando na grade…</span>
      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" aria-label="Cancelar aplicação na grade" onClick={onCancelar}>
        Cancelar
      </Button>
    </div>
  )
}
