'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ProjectSelectionState {
  lastProjectId: number | null
  setLastProjectId: (id: number | null) => void
  hasHydrated: boolean
  setHasHydrated: (hydrated: boolean) => void
}

export const useProjectSelectionStore = create(
  persist<ProjectSelectionState>(
    (set) => ({
      lastProjectId: null,
      hasHydrated: false,
      setLastProjectId: (id) => set({ lastProjectId: id }),
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
    }),
    {
      name: 'lagosta.project-selection',
      partialize: (state) => ({
        lastProjectId: state.lastProjectId
      } as any),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[project-selection] Erro ao reidratar seleção de projeto', error)
        }
        state?.setHasHydrated(true)
      },
    }
  )
)
