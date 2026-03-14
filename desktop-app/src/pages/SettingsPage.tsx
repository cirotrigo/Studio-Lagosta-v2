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
