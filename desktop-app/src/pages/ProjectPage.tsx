import { Component, ReactNode } from 'react'
import { Wand2, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useProjectStore } from '@/stores/project.store'
import { useProjectTags } from '@/hooks/use-project-tags'
import GenerateArtTab from '@/components/project/tabs/GenerateArtTab'
import ProjectBadge from '@/components/layout/ProjectBadge'

// ErrorBoundary to prevent full app crash when a tab fails to render
interface ErrorBoundaryProps {
  children: ReactNode
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class TabErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[TabErrorBoundary] Erro ao renderizar aba:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle size={28} className="text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Erro ao carregar</h3>
          <p className="mt-2 max-w-md text-center text-sm text-white/50">
            {this.state.error?.message || 'Ocorreu um erro inesperado'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              this.props.onReset?.()
            }}
            className="btn-primary mt-4"
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function ProjectPage() {
  const { currentProject } = useProjectStore()

  // Sync project tags to store when project changes
  useProjectTags(currentProject?.id)

  if (!currentProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Wand2 size={32} className="text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-white">Selecione um projeto</h2>
          <p className="mt-2 text-white/50">
            Escolha um projeto na barra lateral para acessar as ferramentas de criacao
          </p>
          <Link
            to="/scheduler"
            className="mt-4 inline-flex items-center gap-2 text-primary hover:underline"
          >
            Voltar para o agendador
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
        <h1 className="text-xl font-semibold text-white">Arte Rapida</h1>
        <ProjectBadge project={currentProject} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <TabErrorBoundary onReset={() => window.location.reload()}>
          <GenerateArtTab projectId={currentProject.id} />
        </TabErrorBoundary>
      </div>
    </div>
  )
}
