import { create } from 'zustand'
import type { ProjectTag } from '@/types/template'

interface TagsState {
  tags: ProjectTag[]
  isLoading: boolean
  error: string | null

  // Actions
  setTags: (tags: ProjectTag[]) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useTagsStore = create<TagsState>((set) => ({
  tags: [],
  isLoading: false,
  error: null,

  setTags: (tags) => set({ tags, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set({ tags: [], isLoading: false, error: null }),
}))

// Helper to find a tag by name (case-insensitive)
export function findTagByName(tags: ProjectTag[], name: string): ProjectTag | undefined {
  return tags.find((t) => t.name.toLowerCase() === name.toLowerCase())
}

// Predefined color palette (same as API)
export const TAG_COLORS = [
  '#F59E0B', // amber
  '#10B981', // emerald
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#EF4444', // red
  '#06B6D4', // cyan
  '#84CC16', // lime
] as const
