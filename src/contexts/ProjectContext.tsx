"use client"

import * as React from 'react'
import { useToolsProjects, type ToolsProject } from '@/hooks/tools/useToolsProjects'

const STORAGE_KEY = 'tools.lastProjectId'

interface ProjectContextType {
  currentProject: ToolsProject | null
  setCurrentProject: (project: ToolsProject | null) => void
  projects: ToolsProject[]
  isLoading: boolean
}

const ProjectContext = React.createContext<ProjectContextType | null>(null)

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { data: projects = [], isLoading } = useToolsProjects()
  const [currentProject, setCurrentProjectState] = React.useState<ToolsProject | null>(null)
  const initializedRef = React.useRef(false)

  // Auto-select persisted project after projects load
  React.useEffect(() => {
    if (isLoading || initializedRef.current || projects.length === 0) return
    initializedRef.current = true

    try {
      const savedId = window.localStorage.getItem(STORAGE_KEY)
      if (savedId) {
        const found = projects.find((p) => String(p.id) === savedId)
        if (found) {
          setCurrentProjectState(found)
          return
        }
      }
    } catch {
      // localStorage unavailable
    }
  }, [isLoading, projects])

  const setCurrentProject = React.useCallback(
    (project: ToolsProject | null) => {
      setCurrentProjectState(project)
      try {
        if (project) {
          window.localStorage.setItem(STORAGE_KEY, String(project.id))
        } else {
          window.localStorage.removeItem(STORAGE_KEY)
        }
      } catch {
        // localStorage unavailable
      }
    },
    []
  )

  const value = React.useMemo(
    () => ({ currentProject, setCurrentProject, projects, isLoading }),
    [currentProject, setCurrentProject, projects, isLoading]
  )

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useToolsProject() {
  const context = React.useContext(ProjectContext)
  if (!context) {
    throw new Error('useToolsProject must be used within a ProjectProvider')
  }
  return context
}
