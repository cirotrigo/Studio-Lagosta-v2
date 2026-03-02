import { create } from 'zustand'
import { api } from '@/lib/api-client'

interface AuthState {
  cookies: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  initialize: () => Promise<void>
  login: () => Promise<boolean>
  logout: () => Promise<void>
  setError: (error: string | null) => void
  validateCookies: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  cookies: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null })

    try {
      // Try to get stored cookies from Electron
      const storedCookies = await window.electronAPI.getCookies()

      if (storedCookies) {
        // Validate cookies by making a test request
        set({ cookies: storedCookies })
        const isValid = await get().validateCookies()

        if (isValid) {
          set({ isAuthenticated: true, isLoading: false })
          return
        }

        // Cookies are invalid, clear them
        await window.electronAPI.logout()
      }

      set({ cookies: null, isAuthenticated: false, isLoading: false })
    } catch (error) {
      console.error('Error initializing auth:', error)
      set({ cookies: null, isAuthenticated: false, isLoading: false })
    }
  },

  login: async () => {
    set({ isLoading: true, error: null })

    try {
      // Open Clerk login window
      const result = await window.electronAPI.login()

      if (!result.success) {
        set({
          cookies: null,
          isAuthenticated: false,
          isLoading: false,
          error: result.error || 'Login cancelado',
        })
        return false
      }

      // Cookies were saved by the main process, now validate them
      const storedCookies = await window.electronAPI.getCookies()
      set({ cookies: storedCookies })

      const isValid = await get().validateCookies()

      if (!isValid) {
        set({
          cookies: null,
          isAuthenticated: false,
          isLoading: false,
          error: 'Sessão inválida ou expirada',
        })
        await window.electronAPI.logout()
        return false
      }

      set({ isAuthenticated: true, isLoading: false })
      return true
    } catch (error) {
      console.error('Error logging in:', error)
      set({
        cookies: null,
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Erro ao fazer login',
      })
      return false
    }
  },

  logout: async () => {
    try {
      await window.electronAPI.logout()
    } catch (error) {
      console.error('Error during logout:', error)
    }

    set({ cookies: null, isAuthenticated: false, error: null })
  },

  setError: (error) => set({ error }),

  // Internal validation function
  validateCookies: async () => {
    try {
      // Try to fetch projects - if it works, cookies are valid
      await api.get('/api/tools/projects')
      return true
    } catch {
      return false
    }
  },
}))
