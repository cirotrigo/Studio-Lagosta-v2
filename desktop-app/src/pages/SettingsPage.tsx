import { useState } from 'react'
import { LogOut, ExternalLink, Info } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const { logout } = useAuthStore()
  const [appVersion, setAppVersion] = useState<string | null>(null)

  // Get app version on mount
  useState(() => {
    window.electronAPI.getVersion().then(setAppVersion)
  })

  const handleLogout = async () => {
    await logout()
  }

  const handleOpenStudioLagosta = () => {
    window.electronAPI.openExternal('https://studio-lagosta-v2.vercel.app')
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border p-4">
        <h1 className="text-xl font-semibold text-text">Configurações</h1>
        <p className="text-sm text-text-muted">
          Gerencie suas preferências do aplicativo
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Account Section */}
          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-medium text-text">Conta</h2>

            <div className="space-y-4">
              <button
                onClick={handleOpenStudioLagosta}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border border-border bg-input p-4',
                  'hover:border-primary/50 hover:bg-input/80',
                  'transition-all duration-200'
                )}
              >
                <div className="flex items-center gap-3">
                  <ExternalLink size={20} className="text-text-muted" />
                  <div className="text-left">
                    <p className="font-medium text-text">Abrir Studio Lagosta</p>
                    <p className="text-sm text-text-muted">
                      Acessar a versão web completa
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={handleLogout}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border border-error/20 bg-error/5 p-4',
                  'hover:border-error/50 hover:bg-error/10',
                  'transition-all duration-200'
                )}
              >
                <div className="flex items-center gap-3">
                  <LogOut size={20} className="text-error" />
                  <div className="text-left">
                    <p className="font-medium text-error">Desconectar</p>
                    <p className="text-sm text-text-muted">
                      Sair da sua conta neste dispositivo
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </section>

          {/* About Section */}
          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-medium text-text">Sobre</h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Versão do App</span>
                <span className="text-text">{appVersion || '...'}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-text-muted">Plataforma</span>
                <span className="text-text">macOS</span>
              </div>
            </div>
          </section>

          {/* Info Section */}
          <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex gap-3">
              <Info size={20} className="flex-shrink-0 text-primary" />
              <div>
                <p className="text-sm text-text">
                  Este aplicativo desktop permite agendar posts para o Instagram
                  de forma rápida e offline. O processamento de imagens é feito
                  localmente no seu computador.
                </p>
                <p className="mt-2 text-sm text-text-muted">
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
