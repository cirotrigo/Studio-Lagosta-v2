/**
 * Qual clipe da linha do tempo está na tela AGORA, por página. Fora do React,
 * como o relógio: o motor da página publica a cada quadro (só EMITE quando o
 * id muda — a UI re-renderiza na fronteira entre clipes, nunca por quadro), e
 * o `KonvaLayerFactory` assina para esconder os clipes inativos.
 */

import { useSyncExternalStore } from 'react'

const ativos = new Map<string, string | null>()
const ouvintes = new Map<string, Set<() => void>>()
const CHAVE = (chave: string | null | undefined) => chave || 'pagina'

export function publicarClipeAtivo(chave: string | null | undefined, id: string | null): void {
  const k = CHAVE(chave)
  if (ativos.get(k) === id) return
  ativos.set(k, id)
  ouvintes.get(k)?.forEach((o) => o())
}

/** `undefined` = ninguém publicou ainda (o chamador decide o padrão). */
export function clipeAtivoPublicado(chave: string | null | undefined): string | null | undefined {
  return ativos.get(CHAVE(chave))
}

function subscribe(chave: string | null | undefined, ouvinte: () => void): () => void {
  const k = CHAVE(chave)
  let set = ouvintes.get(k)
  if (!set) {
    set = new Set()
    ouvintes.set(k, set)
  }
  set.add(ouvinte)
  return () => {
    set!.delete(ouvinte)
  }
}

export function useClipeAtivo(chave: string | null | undefined): string | null | undefined {
  return useSyncExternalStore(
    (o) => subscribe(chave, o),
    () => clipeAtivoPublicado(chave),
    () => undefined,
  )
}
