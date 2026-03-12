import { create } from 'zustand'
import { api } from '@/lib/api-client'

// Mensagem de erro amigável quando a bridge não está disponível
const BRIDGE_MISSING_ERROR = 'Bridge Electron indisponível. Execute o app com: npm --prefix desktop-app run dev:electron'

// Verifica se a bridge Electron está disponível
export function isElectronBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.login
}

// Log discreto de diagnóstico no bootstrap
if (typeof window !== 'undefined') {
  if (!window.electronAPI) {
    console.warn('[Auth] window.electronAPI não encontrada. Certifique-se de rodar via Electron.')
  } else if (!window.electronAPI.login) {
    console.warn('[Auth] window.electronAPI.login não disponível. Bridge incompleta.')
  }
}

interface AuthState {
  cookies: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  bridgeAvailable: boolean

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
  bridgeAvailable: isElectronBridgeAvailable(),

  initialize: async () => {
    set({ isLoading: true, error: null })

    // Guard: verificar se bridge está disponível
    if (!window.electronAPI?.getCookies) {
      set({ isLoading: false, error: BRIDGE_MISSING_ERROR, bridgeAvailable: false })
      return
    }

    try {
      // Try to get stored cookies from Electron
      const storedCookies = await window.electronAPI.getCookies()

      if (storedCookies) {
        // Validate cookies by making a test request
        set({ cookies: storedCookies })
        let isValid = await get().validateCookies()
        if (!isValid) {
          // Avoid false negatives right after session refresh/rotation
          await new Promise((resolve) => setTimeout(resolve, 700))
          isValid = await get().validateCookies()
        }

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

    // Guard: verificar se bridge está disponível
    if (!window.electronAPI?.login) {
      set({ isLoading: false, error: BRIDGE_MISSING_ERROR, bridgeAvailable: false })
      return false
    }

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

      let isValid = await get().validateCookies()
      if (!isValid) {
        // Clerk cookies can settle asynchronously right after login
        await new Promise((resolve) => setTimeout(resolve, 900))
        isValid = await get().validateCookies()
      }

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
    // Guard: verificar se bridge está disponível
    if (!window.electronAPI?.logout) {
      set({ cookies: null, isAuthenticated: false, error: null })
      return
    }

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
      await api.get('/api/projects')
      return true
    } catch {
      return false
    }
  },
}))
