import { create } from 'zustand'

interface PagesState {
  thumbnails: Record<string, string>
  setThumbnail: (pageId: string, dataUrl: string) => void
  removeThumbnail: (pageId: string) => void
  reset: () => void
}

export const usePagesStore = create<PagesState>((set) => ({
  thumbnails: {},
  setThumbnail: (pageId, dataUrl) =>
    set((state) => ({
      thumbnails: {
        ...state.thumbnails,
        [pageId]: dataUrl,
      },
    })),
  removeThumbnail: (pageId) =>
    set((state) => {
      const next = { ...state.thumbnails }
      delete next[pageId]
      return { thumbnails: next }
    }),
  reset: () => set({ thumbnails: {} }),
}))
