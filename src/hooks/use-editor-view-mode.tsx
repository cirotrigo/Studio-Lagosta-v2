"use client"

import * as React from 'react'

/**
 * Modo de visualização do editor:
 * - 'continuous': todas as páginas empilhadas no workspace, navegação por
 *   scroll (estilo Polotno). Padrão no desktop, com a PagesBar recolhida.
 * - 'single': uma página por vez (modo clássico), com a PagesBar expandida.
 *
 * Mobile (≤768px) ignora o modo salvo e usa sempre 'single' — a decisão é do
 * consumidor (EditorCanvas), o hook só guarda a preferência.
 */
export type EditorViewMode = 'continuous' | 'single'

const VIEW_MODE_KEY = 'lagosta:editor:view-mode'
const PAGES_BAR_KEY = 'lagosta:editor:pages-bar'

function readStoredViewMode(): EditorViewMode {
  if (typeof window === 'undefined') return 'continuous'
  const stored = window.localStorage.getItem(VIEW_MODE_KEY)
  return stored === 'single' || stored === 'continuous' ? stored : 'continuous'
}

function readStoredPagesBarCollapsed(viewMode: EditorViewMode): boolean {
  if (typeof window === 'undefined') return true
  const stored = window.localStorage.getItem(PAGES_BAR_KEY)
  if (stored === 'collapsed') return true
  if (stored === 'expanded') return false
  // Sem preferência salva: contínuo recolhe; clássico segue a regra antiga
  // (recolhida só em telas baixas)
  return viewMode === 'continuous' ? true : window.innerHeight < 640
}

interface EditorViewModeContextValue {
  viewMode: EditorViewMode
  setViewMode: (mode: EditorViewMode) => void
  isPagesBarCollapsed: boolean
  setPagesBarCollapsed: (collapsed: boolean) => void
}

const EditorViewModeContext = React.createContext<EditorViewModeContextValue | null>(null)

export function EditorViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewModeState] = React.useState<EditorViewMode>(() => readStoredViewMode())
  const [isPagesBarCollapsed, setPagesBarCollapsedState] = React.useState<boolean>(() =>
    readStoredPagesBarCollapsed(readStoredViewMode()),
  )

  const setViewMode = React.useCallback((mode: EditorViewMode) => {
    setViewModeState(mode)
    // Trocar de modo reaplica o par padrão (contínuo+recolhida / clássico+expandida);
    // o usuário pode reabrir/recolher em seguida e essa escolha persiste por cima
    const collapsed = mode === 'continuous'
    setPagesBarCollapsedState(collapsed)
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, mode)
      window.localStorage.setItem(PAGES_BAR_KEY, collapsed ? 'collapsed' : 'expanded')
    } catch {
      // localStorage indisponível (modo privado) — preferência vale só na sessão
    }
  }, [])

  const setPagesBarCollapsed = React.useCallback((collapsed: boolean) => {
    setPagesBarCollapsedState(collapsed)
    try {
      window.localStorage.setItem(PAGES_BAR_KEY, collapsed ? 'collapsed' : 'expanded')
    } catch {
      // idem acima
    }
  }, [])

  const value = React.useMemo<EditorViewModeContextValue>(
    () => ({ viewMode, setViewMode, isPagesBarCollapsed, setPagesBarCollapsed }),
    [viewMode, setViewMode, isPagesBarCollapsed, setPagesBarCollapsed],
  )

  return <EditorViewModeContext.Provider value={value}>{children}</EditorViewModeContext.Provider>
}

export function useEditorViewMode() {
  const ctx = React.useContext(EditorViewModeContext)
  if (!ctx) {
    throw new Error('useEditorViewMode must be used within an EditorViewModeProvider')
  }
  return ctx
}
