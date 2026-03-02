import { create } from 'zustand'

export interface Project {
  id: number
  name: string
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
  logoUrl: string | null
  instagramAccountId: string | null
  instagramUsername: string | null
  postingProvider: string | null
  zapierWebhookUrl: string | null
}

interface ProjectState {
  currentProject: Project | null
  projects: Project[]
  isLoading: boolean

  // Actions
  setCurrentProject: (project: Project | null) => void
  setProjects: (projects: Project[]) => void
  setLoading: (isLoading: boolean) => void
  clearProject: () => void
}

// Key for localStorage persistence
const STORAGE_KEY = 'lagosta-tools-project-id'

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  projects: [],
  isLoading: false,

  setCurrentProject: (project) => {
    set({ currentProject: project })

    // Persist project ID to localStorage
    if (project) {
      localStorage.setItem(STORAGE_KEY, String(project.id))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  },

  setProjects: (projects) => {
    set({ projects })

    // Try to restore last selected project with full data
    const savedProjectId = localStorage.getItem(STORAGE_KEY)
    if (savedProjectId) {
      const savedProject = projects.find((p) => p.id === Number(savedProjectId))
      if (savedProject) {
        // Always update currentProject with fresh data from API
        set({ currentProject: savedProject })
      } else {
        // Project no longer exists or user doesn't have access
        set({ currentProject: null })
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  },

  setLoading: (isLoading) => set({ isLoading }),

  clearProject: () => {
    set({ currentProject: null })
    localStorage.removeItem(STORAGE_KEY)
  },
}))

// Selector for checking if a project is selected
export const useHasProject = () => useProjectStore((state) => state.currentProject !== null)
