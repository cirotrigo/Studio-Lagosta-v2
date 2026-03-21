import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth.store'
import AuthPage from './pages/AuthPage'
import SchedulerPage from './pages/SchedulerPage'
import NewPostPage from './pages/NewPostPage'
import EditPostPage from './pages/EditPostPage'
import SettingsPage from './pages/SettingsPage'
import ProjectPage from './pages/ProjectPage'
import AppShell from './components/layout/AppShell'
import EditorPage from './pages/EditorPage'
import ArtsPage from './pages/ArtsPage'
import BulkImageGeneratorPage from './pages/bulk-image-generator'
import ConflictResolutionDialog from './components/sync/ConflictResolutionDialog'

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
          <Route path="/project" element={<ProjectPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/arts" element={<ArtsPage />} />
          <Route path="/bulk-generator" element={<BulkImageGeneratorPage />} />
          <Route path="/new-post" element={<NewPostPage />} />
          <Route path="/edit-post/:postId" element={<EditPostPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/scheduler" replace />} />
        </Routes>
      </AppShell>
      <ConflictResolutionDialog />
    </BrowserRouter>
  )
}

export default App
