import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Search, Loader2 } from 'lucide-react'
import { useProjectStore, Project } from '@/stores/project.store'
import { cn, getInitials, getProjectLogo } from '@/lib/utils'

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
    <div ref={containerRef} className="relative z-50">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl p-2.5',
          'transition-all duration-300 relative overflow-hidden',
          currentProject
            ? 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
            : 'bg-white/5 border border-orange-500/50 animate-pulse-amber shadow-[0_0_15px_rgba(234,88,12,0.2)]'
        )}
      >
        {isLoading ? (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/40">
              <Loader2 size={16} className="animate-spin text-white/50" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-white/50">Carregando...</p>
            </div>
          </>
        ) : currentProject ? (
          <>
            {getProjectLogo(currentProject) ? (
              <img
                src={getProjectLogo(currentProject)!}
                alt={currentProject.name}
                className="h-10 w-10 rounded-lg object-cover shadow-md"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 shadow-md">
                <span className="text-sm font-bold text-white shadow-sm">
                  {getInitials(currentProject.name)}
                </span>
              </div>
            )}
            <div className="flex-1 text-left truncate">
              <p className="text-sm font-semibold tracking-tight text-white/90 truncate">{currentProject.name}</p>
              {currentProject.instagramUsername && (
                <p className="text-xs text-white/50 truncate font-medium">
                  @{currentProject.instagramUsername}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 border border-white/10">
              <span className="text-lg text-white/40 font-bold">?</span>
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-orange-400">Selecione um projeto</p>
            </div>
          </>
        )}
        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-white/5 border border-white/10 ml-auto">
          <ChevronDown
            size={14}
            className={cn(
              'text-white/60 transition-transform duration-300',
              isOpen && 'rotate-180 text-white'
            )}
          />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[240px] rounded-xl border border-white/10 bg-[#121212]/95 backdrop-blur-xl shadow-2xl animate-fade-slide-in overflow-hidden">
          {/* Search */}
          <div className="border-b border-white/10 p-3 bg-white/5">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar projeto..."
                className={cn(
                  'w-full rounded-lg border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-sm text-white',
                  'placeholder:text-white/30',
                  'focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/20 transition-all duration-300'
                )}
              />
            </div>
          </div>

          {/* Project list */}
          <div className="max-h-60 overflow-y-auto p-2 scrollbar-hide">
            {filteredProjects.length === 0 ? (
              <div className="py-8 text-center text-xs font-medium tracking-wide uppercase text-white/40">
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
                      'transition-all duration-200 group',
                      'hover:bg-white/10',
                      currentProject?.id === project.id ? 'bg-orange-500/10 border border-orange-500/20' : 'border border-transparent'
                    )}
                  >
                    {getProjectLogo(project) ? (
                      <img
                        src={getProjectLogo(project)!}
                        alt={project.name}
                        className="h-8 w-8 rounded-md object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      />
                    ) : (
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-md font-bold text-xs shadow-inner",
                        currentProject?.id === project.id ? "bg-gradient-to-br from-orange-400 to-orange-600 text-white" : "bg-white/10 text-white/60 group-hover:text-white group-hover:bg-white/20 transition-all"
                      )}>
                          {getInitials(project.name)}
                      </div>
                    )}
                    <div className="flex-1 truncate">
                      <p className={cn(
                        "text-sm font-semibold tracking-tight truncate",
                        currentProject?.id === project.id ? "text-orange-400" : "text-white/80 group-hover:text-white transition-colors"
                      )}>
                        {project.name}
                      </p>
                    </div>
                    {currentProject?.id === project.id && (
                      <Check size={16} className="text-orange-500 ml-auto flex-shrink-0 drop-shadow-[0_0_8px_rgba(234,88,12,0.8)]" />
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
