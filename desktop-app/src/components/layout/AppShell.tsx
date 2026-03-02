import { ReactNode } from 'react'
import Sidebar from './Sidebar'
import TitleBar from './TitleBar'
import { useProjects } from '@/hooks/use-projects'

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  // Load projects on mount
  useProjects()

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Title bar (macOS traffic lights area) */}
      <TitleBar />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Content area */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
