import { useState, Component, ReactNode } from 'react'
import { Palette, Sparkles, History, Wand2, AlertTriangle, LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useProjectStore } from '@/stores/project.store'
import { cn } from '@/lib/utils'
import { ReeditDraft } from '@/types/art-automation'
import IdentityTab from '@/components/project/tabs/IdentityTab'
import GenerateArtTab from '@/components/project/tabs/GenerateArtTab'
import HistoryTab from '@/components/project/tabs/HistoryTab'
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
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error/10">
            <AlertTriangle size={28} className="text-error" />
          </div>
          <h3 className="text-lg font-semibold text-text">Erro ao carregar</h3>
          <p className="mt-2 max-w-md text-center text-sm text-text-muted">
            {this.state.error?.message || 'Ocorreu um erro inesperado'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              this.props.onReset?.()
            }}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

type TabId = 'identity' | 'generate' | 'history'

interface Tab {
  id: TabId
  label: string
  icon: LucideIcon
}

const TABS: Tab[] = [
  { id: 'identity', label: 'Identidade', icon: Palette },
  { id: 'generate', label: 'Gerar Arte', icon: Sparkles },
  { id: 'history', label: 'Historico', icon: History },
]

export default function ProjectPage() {
  const { currentProject } = useProjectStore()
  const [activeTab, setActiveTab] = useState<TabId>('identity')
  const [errorKey, setErrorKey] = useState(0)
  const [reeditDraft, setReeditDraft] = useState<ReeditDraft | null>(null)

  if (!currentProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Wand2 size={32} className="text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-text">Selecione um projeto</h2>
          <p className="mt-2 text-text-muted">
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
      <div className="flex items-center justify-between border-b border-border p-4">
        <h1 className="text-xl font-semibold text-text">Projeto</h1>
        <ProjectBadge project={currentProject} />
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-border bg-sidebar px-4 py-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
              activeTab === tab.id
                ? 'bg-card text-text'
                : 'text-text-muted hover:text-text'
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <TabErrorBoundary key={`${activeTab}-${errorKey}`} onReset={() => setErrorKey((k) => k + 1)}>
          {activeTab === 'identity' && <IdentityTab projectId={currentProject.id} />}
          {activeTab === 'generate' && (
            <GenerateArtTab
              projectId={currentProject.id}
              draft={reeditDraft}
              onDraftConsumed={() => setReeditDraft(null)}
            />
          )}
          {activeTab === 'history' && (
            <HistoryTab
              projectId={currentProject.id}
              onReedit={(draft) => {
                setReeditDraft(draft)
                setActiveTab('generate')
              }}
            />
          )}
        </TabErrorBoundary>
      </div>
    </div>
  )
}
