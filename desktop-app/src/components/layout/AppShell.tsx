import { ReactNode } from 'react'
import Sidebar from './Sidebar'
import TitleBar from './TitleBar'
import { PanelDivider } from '@/components/ui/PanelDivider'
import { GradientBackground } from '@/components/ui/GradientBackground'
import { useProjects } from '@/hooks/use-projects'

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  // Load projects on mount
  useProjects()

  return (
    <div className="relative flex h-screen flex-col">
      {/* Gradient Background */}
      <GradientBackground />

      {/* Title bar (macOS traffic lights area) */}
      <TitleBar />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar with glass effect */}
        <Sidebar />

        {/* Divider with falling beam effect */}
        <PanelDivider beamCount={2} />

        {/* Content area */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
