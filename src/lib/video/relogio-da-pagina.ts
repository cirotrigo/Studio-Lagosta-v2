/**
 * O relógio da página: UM tempo por página, em segundos, que todo `<video>` e o
 * `<audio>` da música seguem (decisão 6 do plano de 02/10/2026). Fora do React,
 * como o `rich-text-edit-store`: quem desenha (o tique do Konva, o laço do
 * export) lê `agora()`; quem mostra botão assina por `useRelogioDaPagina`.
 *
 * - `previa`: o tempo anda pelo relógio de parede enquanto `tocando`; a
 *   duração NÃO mora aqui — quem dá a volta é o motor da página, lendo o
 *   design a cada quadro (desfazer, trim e ocultar valem na hora).
 * - `gravacao`: exclusivo do export. `tocar`/`pausar`/`ir` são recusados; só
 *   o laço do export avança (`avancarGravacao`), e `encerrarGravacao` devolve
 *   0, parado, `previa` — no `finally`, com erro ou sem.
 *
 * Página abre PARADA em 0: o relógio nasce assim e é zerado quando a página
 * deixa de ser a aberta.
 */

import { useSyncExternalStore } from 'react'

export type ModoDoRelogio = 'previa' | 'gravacao'

export type EstadoDoRelogioDaPagina = {
  /** O tempo no instante do último evento (tocar/pausar/ir). Com `tocando`, some `agora()`. */
  t: number
  tocando: boolean
  modo: ModoDoRelogio
}

export type RelogioDaPagina = {
  /** Snapshot estável: só muda em evento, nunca a cada quadro. */
  estado: () => EstadoDoRelogioDaPagina
  /** O tempo da página NESTE instante (relógio de parede quando tocando). */
  agora: () => number
  tocar: () => void
  pausar: () => void
  ir: (t: number) => void
  zerar: () => void
  alternar: () => void
  iniciarGravacao: () => void
  avancarGravacao: (t: number) => void
  encerrarGravacao: () => void
  subscribe: (ouvinte: () => void) => () => void
}

const PARADO: EstadoDoRelogioDaPagina = { t: 0, tocando: false, modo: 'previa' }

function criarRelogio(): RelogioDaPagina {
  let estado = PARADO
  /** performance.now() em que `estado.t` foi fixado (só com tocando). */
  let desde = 0
  const ouvintes = new Set<() => void>()
  const emitir = () => ouvintes.forEach((o) => o())
  const agora = () => (estado.tocando ? estado.t + (performance.now() - desde) / 1000 : estado.t)
  const mudar = (proximo: EstadoDoRelogioDaPagina) => {
    estado = proximo
    desde = performance.now()
    emitir()
  }

  const relogio: RelogioDaPagina = {
    estado: () => estado,
    agora,
    tocar() {
      if (estado.modo === 'gravacao' || estado.tocando) return
      mudar({ ...estado, tocando: true })
    },
    pausar() {
      if (estado.modo === 'gravacao' || !estado.tocando) return
      mudar({ ...estado, t: agora(), tocando: false })
    },
    ir(t) {
      if (estado.modo === 'gravacao' || !Number.isFinite(t)) return
      mudar({ ...estado, t: Math.max(0, t) })
    },
    zerar() {
      if (estado.modo === 'gravacao') return
      if (estado.t === 0 && !estado.tocando) return
      mudar(PARADO)
    },
    alternar() {
      if (estado.tocando) relogio.pausar()
      else relogio.tocar()
    },
    iniciarGravacao() {
      mudar({ t: 0, tocando: false, modo: 'gravacao' })
    },
    avancarGravacao(t) {
      if (estado.modo !== 'gravacao') return
      // Sem emitir: é um por quadro, e ninguém da UI precisa re-renderizar
      estado = { ...estado, t: Math.max(0, t) }
    },
    encerrarGravacao() {
      mudar(PARADO)
    },
    subscribe(ouvinte) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },
  }
  return relogio
}

const relogios = new Map<string, RelogioDaPagina>()

/** A chave de quem está fora de um editor multipágina (ou da validação). */
export const CHAVE_DA_PAGINA_UNICA = 'pagina'

export function relogioDaPagina(chave: string | null | undefined): RelogioDaPagina {
  const id = chave || CHAVE_DA_PAGINA_UNICA
  let relogio = relogios.get(id)
  if (!relogio) {
    relogio = criarRelogio()
    relogios.set(id, relogio)
  }
  return relogio
}

/** Assina o relógio de uma página: re-renderiza só em evento, nunca por quadro. */
export function useRelogioDaPagina(chave: string | null | undefined): {
  relogio: RelogioDaPagina
  estado: EstadoDoRelogioDaPagina
} {
  const relogio = relogioDaPagina(chave)
  const estado = useSyncExternalStore(relogio.subscribe, relogio.estado, () => PARADO)
  return { relogio, estado }
}
