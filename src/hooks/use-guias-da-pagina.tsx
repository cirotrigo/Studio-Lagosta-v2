'use client'

import * as React from 'react'

import { acrescentarGuias, chaveDasGuias, GUIAS_VAZIAS, lerGuias, novoIdDeGuia, type Guia, type GuiasDaPagina } from '@/lib/guias-manuais'

/**
 * As guias manuais da página aberta, por PESSOA (localStorage, try/catch) — v1 da D4, sem campo em `Page`. Trocar de
 * página relê a chave dela; a mesma pessoa reencontra as guias em outra aba e no dia seguinte, a equipe não.
 */
export function useGuiasDaPagina(pageId: string | null, pessoaId: string | null) {
  // Sem página ou sem pessoa identificada nada é gravado (uma chave compartilhada misturaria páginas e contas)
  const chave = pageId && pessoaId ? chaveDasGuias(pessoaId, pageId) : null
  const [estado, setEstado] = React.useState<GuiasDaPagina>(() => ler(chave))
  // Troca de página: relê (o estado inicial só vale para a primeira)
  const chaveLida = React.useRef(chave)
  React.useEffect(() => {
    if (chaveLida.current === chave) return
    chaveLida.current = chave
    setEstado(ler(chave))
  }, [chave])

  const mudar = React.useCallback(
    (f: (atual: GuiasDaPagina) => GuiasDaPagina) => {
      setEstado((atual) => {
        const novo = f(atual)
        try {
          if (chave) window.localStorage.setItem(chave, JSON.stringify(novo))
        } catch {
          // localStorage indisponível (modo privado): as guias valem só na sessão
        }
        return novo
      })
    },
    [chave],
  )

  const adicionar = React.useCallback(
    (orientacao: Guia['orientacao'], posicao: number): string => {
      const id = novoIdDeGuia()
      mudar((a) => ({ ...a, guias: [...a.guias, { id, orientacao, posicao: Math.round(posicao) }] }))
      return id
    },
    [mudar],
  )
  const mover = React.useCallback((id: string, posicao: number) => mudar((a) => ({ ...a, guias: a.guias.map((g) => (g.id === id ? { ...g, posicao: Math.round(posicao) } : g)) })), [mudar])
  const remover = React.useCallback((id: string) => mudar((a) => ({ ...a, guias: a.guias.filter((g) => g.id !== id) })), [mudar])
  const acrescentar = React.useCallback((guias: Guia[]) => mudar((a) => ({ ...a, guias: acrescentarGuias(a.guias, guias) })), [mudar])
  const limpar = React.useCallback(() => mudar((a) => ({ ...a, guias: [] })), [mudar])
  const setOcultas = React.useCallback((ocultas: boolean) => mudar((a) => ({ ...a, ocultas })), [mudar])
  const setTravadas = React.useCallback((travadas: boolean) => mudar((a) => ({ ...a, travadas })), [mudar])

  return React.useMemo(() => ({ estado, adicionar, mover, remover, acrescentar, limpar, setOcultas, setTravadas }), [estado, adicionar, mover, remover, acrescentar, limpar, setOcultas, setTravadas])
}

export type GuiasApi = ReturnType<typeof useGuiasDaPagina>

function ler(chave: string | null): GuiasDaPagina {
  if (typeof window === 'undefined' || !chave) return { ...GUIAS_VAZIAS, guias: [] }
  try {
    return lerGuias(window.localStorage.getItem(chave))
  } catch {
    return { ...GUIAS_VAZIAS, guias: [] }
  }
}
