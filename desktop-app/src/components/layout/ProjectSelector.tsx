import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Search, Loader2 } from 'lucide-react'
import { useProjectStore, Project } from '@/stores/project.store'
import { cn, getInitials } from '@/lib/utils'

export default function ProjectSelector() {
  const { currentProject, projects, isLoading, setCurrentProject } = useProjectStore()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter projects by search query
  const filteredProjects = Array.isArray(projects) 
    ? projects.filter((project) =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const handleSelect = (project: Project) => {
    setCurrentProject(project)
    setIsOpen(false)
    setSearchQuery('')
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg border p-2',
          'transition-all duration-200',
          currentProject
            ? 'border-primary/30 bg-primary/5'
            : 'border-border bg-input animate-pulse-amber',
          'hover:border-primary/50'
        )}
      >
        {isLoading ? (
          <>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-card">
              <Loader2 size={16} className="animate-spin text-text-muted" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm text-text-muted">Carregando...</p>
            </div>
          </>
        ) : currentProject ? (
          <>
            {currentProject.logoUrl ? (
              <img
                src={currentProject.logoUrl}
                alt={currentProject.name}
                className="h-8 w-8 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <span className="text-xs font-medium text-primary">
                  {getInitials(currentProject.name)}
                </span>
              </div>
            )}
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-text">{currentProject.name}</p>
              {currentProject.instagramUsername && (
                <p className="text-xs text-text-muted">
                  @{currentProject.instagramUsername}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-card">
              <span className="text-lg text-text-muted">?</span>
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm text-primary">Selecione um projeto</p>
            </div>
          </>
        )}
        <ChevronDown
          size={16}
          className={cn(
            'text-text-muted transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-full rounded-lg border border-border bg-card shadow-xl">
          {/* Search */}
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar projeto..."
                className={cn(
                  'w-full rounded-md border border-border bg-input py-2 pl-9 pr-3 text-sm',
                  'placeholder:text-text-subtle',
                  'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20'
                )}
              />
            </div>
          </div>

          {/* Project list */}
          <div className="max-h-60 overflow-auto p-2">
            {filteredProjects.length === 0 ? (
              <div className="py-4 text-center text-sm text-text-muted">
                Nenhum projeto encontrado
              </div>
            ) : (
              <div className="space-y-1">
                {filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleSelect(project)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg p-2 text-left',
                      'transition-all duration-200',
                      'hover:bg-input',
                      currentProject?.id === project.id && 'bg-primary/10'
                    )}
                  >
                    {project.logoUrl ? (
                      <img
                        src={project.logoUrl}
                        alt={project.name}
                        className="h-8 w-8 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                        <span className="text-xs font-medium text-primary">
                          {getInitials(project.name)}
                        </span>
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text">{project.name}</p>
                      {project.instagramUsername && (
                        <p className="text-xs text-text-muted">
                          @{project.instagramUsername}
                        </p>
                      )}
                    </div>
                    {currentProject?.id === project.id && (
                      <Check size={16} className="text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
