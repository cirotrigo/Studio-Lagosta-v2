import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, ChevronDown, ExternalLink, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KnowledgeEntry {
  id: number
  title: string
  category: string
}

interface ProjectContextIndicatorProps {
  projectId: number
  projectName?: string
  knowledgeCount?: number
  topEntries?: KnowledgeEntry[]
  isLoading?: boolean
  onRefresh?: () => void
}

export default function ProjectContextIndicator({
  projectId,
  projectName,
  knowledgeCount = 0,
  topEntries = [],
  isLoading,
  onRefresh,
}: ProjectContextIndicatorProps) {
  const navigate = useNavigate()
  const [isExpanded, setIsExpanded] = useState(false)

  const hasContext = knowledgeCount > 0

  const handleEditData = () => {
    navigate(`/project/${projectId}/knowledge`)
  }

  const handleUpdateBase = () => {
    onRefresh?.()
  }

  return (
    <div className="rounded-xl border border-border bg-card/50">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <Database
            size={16}
            className={cn(
              hasContext ? 'text-emerald-400' : 'text-text-muted',
            )}
          />
          <span className="text-sm font-medium text-text">
            {hasContext ? 'Contexto aplicado' : 'Sem contexto'}
          </span>
          {hasContext && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
              {knowledgeCount} entrada{knowledgeCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={cn(
            'text-text-muted transition-transform',
            isExpanded && 'rotate-180',
          )}
        />
      </button>

      {isExpanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {hasContext ? (
            <div className="space-y-3">
              <p className="text-xs text-text-muted">
                A IA usara automaticamente dados da base de conhecimento de{' '}
                <span className="font-medium text-text">{projectName}</span> para
                enriquecer a copy.
              </p>

              {topEntries.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-subtle">
                    Categorias disponiveis
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(new Set(topEntries.map((e) => e.category))).map(
                      (category) => (
                        <span
                          key={category}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                        >
                          {category}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-muted">
              Adicione informacoes na Base de Conhecimento para que a IA use
              automaticamente dados como horarios, cardapio e campanhas.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleEditData}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-primary/30 hover:text-primary"
            >
              <ExternalLink size={12} />
              Editar dados
            </button>
            <button
              type="button"
              onClick={handleUpdateBase}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={12} className={cn(isLoading && 'animate-spin')} />
              Atualizar base
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
