import { create } from 'zustand'
import type { DriveFolderType } from '@/types/drive'

interface DriveStore {
  selectedFileIds: Set<string>
  activeProject: number | null
  activeFolderType: DriveFolderType
  currentFolderId: string | null
  selectFile: (id: string) => void
  deselectFile: (id: string) => void
  toggleFile: (id: string) => void
  clearSelection: () => void
  selectAll: (ids: string[]) => void
  setActiveProject: (id: number | null) => void
  setActiveFolderType: (type: DriveFolderType) => void
  setCurrentFolderId: (id: string | null) => void
}

export const useDriveStore = create<DriveStore>((set) => ({
  selectedFileIds: new Set<string>(),
  activeProject: null,
  activeFolderType: 'images',
  currentFolderId: null,
  selectFile: (id) =>
    set((state) => {
      if (state.selectedFileIds.has(id)) return state
      const next = new Set(state.selectedFileIds)
      next.add(id)
      return { selectedFileIds: next }
    }),
  deselectFile: (id) =>
    set((state) => {
      if (!state.selectedFileIds.has(id)) return state
      const next = new Set(state.selectedFileIds)
      next.delete(id)
      return { selectedFileIds: next }
    }),
  toggleFile: (id) =>
    set((state) => {
      const next = new Set(state.selectedFileIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedFileIds: next }
    }),
  clearSelection: () => set({ selectedFileIds: new Set<string>() }),
  selectAll: (ids) =>
    set(() => ({
      selectedFileIds: new Set(ids),
    })),
  setActiveProject: (id) =>
    set({
      activeProject: id,
      selectedFileIds: new Set<string>(),
    }),
  setActiveFolderType: (type) =>
    set({
      activeFolderType: type,
      selectedFileIds: new Set<string>(),
    }),
  setCurrentFolderId: (id) => set({ currentFolderId: id }),
}))
