import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth.store'
import AuthPage from './pages/AuthPage'
import SchedulerPage from './pages/SchedulerPage'
import NewPostPage from './pages/NewPostPage'
import SettingsPage from './pages/SettingsPage'
import AppShell from './components/layout/AppShell'

function App() {
  const { isAuthenticated, isLoading, initialize } = useAuthStore()
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    const init = async () => {
      await initialize()
      setIsInitializing(false)
    }
    init()
  }, [initialize])

  // Show loading state while initializing
  if (isInitializing || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-text-muted">Carregando...</p>
        </div>
      </div>
    )
  }

  // Show auth page if not authenticated
  if (!isAuthenticated) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<AuthPage />} />
        </Routes>
      </BrowserRouter>
    )
  }

  // Show main app if authenticated
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/scheduler" replace />} />
          <Route path="/scheduler" element={<SchedulerPage />} />
          <Route path="/new-post" element={<NewPostPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/scheduler" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}

export default App
