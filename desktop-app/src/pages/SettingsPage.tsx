import { useState } from 'react'
import { LogOut, ExternalLink, Info, RefreshCw, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { useProjectStore } from '@/stores/project.store'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const { logout } = useAuthStore()
  const currentProject = useProjectStore((state) => state.currentProject)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [isResyncingTemplates, setIsResyncingTemplates] = useState(false)
  const [isMigratingGradients, setIsMigratingGradients] = useState(false)

  // Get app version on mount
  useState(() => {
    window.electronAPI.getVersion().then(setAppVersion)
  })

  const handleForceResyncTemplates = async () => {
    if (!currentProject) {
      toast.error('Selecione um projeto primeiro')
      return
    }

    const confirmed = window.confirm(
      `Isso vai deletar TODOS os templates locais do projeto "${currentProject.name}" e baixar novamente do servidor.\n\nDeseja continuar?`
    )
    if (!confirmed) return

    setIsResyncingTemplates(true)
    try {
      // Step 1: Delete all local templates
      const deleteResult = await window.electronAPI.konvaTemplates.deleteAll(currentProject.id)
      toast.info(`${deleteResult.deleted} templates deletados localmente`)

      // Step 2: Pull from server
      const pullResult = await window.electronAPI.konvaSync.pull(currentProject.id)

      if (pullResult.ok) {
        toast.success(`Re-sync completo! ${pullResult.pulled} templates baixados`)
      } else {
        toast.error(`Erro no pull: ${pullResult.error}`)
      }
    } catch (error) {
      console.error('[Settings] Force resync failed:', error)
      toast.error('Erro ao forçar re-sincronização')
    } finally {
      setIsResyncingTemplates(false)
    }
  }

  const handleMigrateGradients = async () => {
    if (!currentProject) {
      toast.error('Selecione um projeto primeiro')
      return
    }

    setIsMigratingGradients(true)
    try {
      const result = await window.electronAPI.konvaTemplates.migrateGradients(currentProject.id)

      if (result.migrated > 0) {
        toast.success(`${result.migrated} de ${result.total} templates corrigidos`)
      } else {
        toast.info('Nenhum template precisou de correção')
      }
    } catch (error) {
      console.error('[Settings] Migration failed:', error)
      toast.error('Erro ao migrar templates')
    } finally {
      setIsMigratingGradients(false)
    }
  }

  const handleLogout = async () => {
    await logout()
  }

  const handleOpenStudioLagosta = () => {
    window.electronAPI.openExternal('https://studio-lagosta-v2.vercel.app')
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.06] p-4">
        <h1 className="text-xl font-semibold text-white">Configurações</h1>
        <p className="text-sm text-white/50">
          Gerencie suas preferências do aplicativo
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Account Section */}
          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-6">
            <h2 className="mb-4 text-lg font-medium text-white">Conta</h2>

            <div className="space-y-4">
              <button
                onClick={handleOpenStudioLagosta}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4',
                  'hover:border-primary/50 hover:bg-white/10',
                  'transition-all duration-200'
                )}
              >
                <div className="flex items-center gap-3">
                  <ExternalLink size={20} className="text-white/60" />
                  <div className="text-left">
                    <p className="font-medium text-white">Abrir Studio Lagosta</p>
                    <p className="text-sm text-white/50">
                      Acessar a versão web completa
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={handleLogout}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border border-red-500/20 bg-red-500/5 p-4',
                  'hover:border-red-500/50 hover:bg-red-500/10',
                  'transition-all duration-200'
                )}
              >
                <div className="flex items-center gap-3">
                  <LogOut size={20} className="text-red-400" />
                  <div className="text-left">
                    <p className="font-medium text-red-400">Desconectar</p>
                    <p className="text-sm text-white/50">
                      Sair da sua conta neste dispositivo
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </section>

          {/* Maintenance Section */}
          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-6">
            <h2 className="mb-4 text-lg font-medium text-white">Manutenção de Templates</h2>
            <p className="mb-4 text-sm text-white/50">
              {currentProject
                ? `Projeto atual: ${currentProject.name}`
                : 'Selecione um projeto para usar estas opções'}
            </p>

            <div className="space-y-4">
              <button
                onClick={handleForceResyncTemplates}
                disabled={!currentProject || isResyncingTemplates}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4',
                  'hover:border-primary/50 hover:bg-white/10',
                  'transition-all duration-200',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <div className="flex items-center gap-3">
                  <RefreshCw size={20} className={cn('text-white/60', isResyncingTemplates && 'animate-spin')} />
                  <div className="text-left">
                    <p className="font-medium text-white">Forçar Re-Sincronização</p>
                    <p className="text-sm text-white/50">
                      Deleta templates locais e baixa novamente do servidor
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={handleMigrateGradients}
                disabled={!currentProject || isMigratingGradients}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4',
                  'hover:border-primary/50 hover:bg-white/10',
                  'transition-all duration-200',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <div className="flex items-center gap-3">
                  <Wrench size={20} className={cn('text-white/60', isMigratingGradients && 'animate-spin')} />
                  <div className="text-left">
                    <p className="font-medium text-white">Corrigir Gradientes</p>
                    <p className="text-sm text-white/50">
                      Migra templates com gradientes inválidos
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </section>

          {/* About Section */}
          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-6">
            <h2 className="mb-4 text-lg font-medium text-white">Sobre</h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white/50">Versão do App</span>
                <span className="text-white">{appVersion || '...'}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-white/50">Plataforma</span>
                <span className="text-white">macOS</span>
              </div>
            </div>
          </section>

          {/* Info Section */}
          <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex gap-3">
              <Info size={20} className="flex-shrink-0 text-primary" />
              <div>
                <p className="text-sm text-white/80">
                  Este aplicativo desktop permite agendar posts para o Instagram
                  de forma rápida e offline. O processamento de imagens é feito
                  localmente no seu computador.
                </p>
                <p className="mt-2 text-sm text-white/50">
                  Desenvolvido por Studio Lagosta
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
