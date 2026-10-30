'use client'

import * as React from 'react'

import { CHAVE_DA_EXIBICAO, EXIBICAO_PADRAO, lerExibicao, type ExibicaoDoEditor } from '@/lib/exibicao-do-editor'

interface Valor {
  exibicao: ExibicaoDoEditor
  alternar: (chave: keyof ExibicaoDoEditor) => void
  definir: (chave: keyof ExibicaoDoEditor, valor: boolean) => void
}

const Contexto = React.createContext<Valor | null>(null)

function lerGravada(): ExibicaoDoEditor {
  if (typeof window === 'undefined') return { ...EXIBICAO_PADRAO }
  try {
    return lerExibicao(window.localStorage.getItem(CHAVE_DA_EXIBICAO))
  } catch {
    return { ...EXIBICAO_PADRAO }
  }
}

/**
 * A preferência de exibição do editor (margens R, interface M, bordas C, encaixe), por pessoa, no localStorage —
 * o padrão de `use-editor-view-mode.tsx`. Mora no shell, acima das páginas: no modo contínuo cada página monta o
 * stage de novo, e com `useState` ali tudo voltava ao padrão a cada troca (L2 das linhas-guia, 29/10/2026).
 */
export function ExibicaoDoEditorProvider({ children }: { children: React.ReactNode }) {
  const [exibicao, setExibicao] = React.useState<ExibicaoDoEditor>(lerGravada)
  const definir = React.useCallback((chave: keyof ExibicaoDoEditor, valor: boolean) => {
    setExibicao((atual) => {
      const nova = { ...atual, [chave]: valor }
      try {
        window.localStorage.setItem(CHAVE_DA_EXIBICAO, JSON.stringify(nova))
      } catch {
        // localStorage indisponível (modo privado) — a preferência vale só na sessão
      }
      return nova
    })
  }, [])
  const alternar = React.useCallback((chave: keyof ExibicaoDoEditor) => {
    setExibicao((atual) => {
      const nova = { ...atual, [chave]: !atual[chave] }
      try {
        window.localStorage.setItem(CHAVE_DA_EXIBICAO, JSON.stringify(nova))
      } catch {
        // idem
      }
      return nova
    })
  }, [])
  const valor = React.useMemo(() => ({ exibicao, alternar, definir }), [exibicao, alternar, definir])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** Sem o provider (stage montado solto, como em testes) vale um estado local, sem persistência. */
export function useExibicaoDoEditor(): Valor {
  const ctx = React.useContext(Contexto)
  const [local, setLocal] = React.useState<ExibicaoDoEditor>(() => ({ ...EXIBICAO_PADRAO }))
  const alternarLocal = React.useCallback((chave: keyof ExibicaoDoEditor) => setLocal((a) => ({ ...a, [chave]: !a[chave] })), [])
  const definirLocal = React.useCallback((chave: keyof ExibicaoDoEditor, valor: boolean) => setLocal((a) => ({ ...a, [chave]: valor })), [])
  const semProvider = React.useMemo(() => ({ exibicao: local, alternar: alternarLocal, definir: definirLocal }), [local, alternarLocal, definirLocal])
  return ctx ?? semProvider
}
