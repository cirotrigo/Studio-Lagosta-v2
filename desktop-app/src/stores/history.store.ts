import { create } from 'zustand'
import type { KonvaTemplateDocument } from '@/types/template'
import { cloneKonvaDocument } from '@/lib/editor/document'

const HISTORY_LIMIT = 100

interface HistoryState {
  past: KonvaTemplateDocument[]
  future: KonvaTemplateDocument[]
  reset: (document: KonvaTemplateDocument | null) => void
  record: (document: KonvaTemplateDocument) => void
  undo: (current: KonvaTemplateDocument) => KonvaTemplateDocument | null
  redo: (current: KonvaTemplateDocument) => KonvaTemplateDocument | null
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],

  reset: () => set({ past: [], future: [] }),

  record: (document) =>
    set((state) => ({
      past: [...state.past, cloneKonvaDocument(document)].slice(-HISTORY_LIMIT),
      future: [],
    })),

  undo: (current) => {
    const { past, future } = get()
    const previous = past[past.length - 1]
    if (!previous) {
      return null
    }

    set({
      past: past.slice(0, -1),
      future: [cloneKonvaDocument(current), ...future].slice(0, HISTORY_LIMIT),
    })

    return cloneKonvaDocument(previous)
  },

  redo: (current) => {
    const { past, future } = get()
    const next = future[0]
    if (!next) {
      return null
    }

    set({
      past: [...past, cloneKonvaDocument(current)].slice(-HISTORY_LIMIT),
      future: future.slice(1),
    })

    return cloneKonvaDocument(next)
  },
}))
