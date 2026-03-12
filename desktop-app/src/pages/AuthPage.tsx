import { Loader2, AlertTriangle, Terminal } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { cn } from '@/lib/utils'

export default function AuthPage() {
  const { login, isLoading, error, setError, bridgeAvailable } = useAuthStore()

  const handleLogin = async () => {
    setError(null)
    await login()
  }

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Title bar drag region */}
      <div className="titlebar-drag h-[38px] w-full flex-shrink-0" />

      {/* Content */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center">
              <img src="/icon.png" alt="Lagosta" className="h-16 w-16 rounded-2xl object-cover" />
            </div>
            <img src="/logo.png" alt="Lagosta Tools" className="mx-auto mb-2 h-7 object-contain" />
            <p className="mt-2 text-text-muted">
              Faça login com sua conta Studio Lagosta
            </p>
          </div>

          {/* Login button */}
          <div className="space-y-6">
            {/* Bridge missing diagnostic */}
            {!bridgeAvailable && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                <div className="mb-2 flex items-center gap-2 text-warning">
                  <AlertTriangle size={18} />
                  <span className="font-medium">Modo web detectado</span>
                </div>
                <p className="mb-3 text-sm text-text-muted">
                  A bridge Electron não está disponível. Este app deve ser executado via Electron, não no navegador.
                </p>
                <div className="flex items-center gap-2 rounded bg-bg-tertiary px-3 py-2 font-mono text-xs text-text">
                  <Terminal size={14} className="text-text-muted" />
                  <code>npm --prefix desktop-app run dev:electron</code>
                </div>
              </div>
            )}

            {/* Error message */}
            {error && bridgeAvailable && (
              <div className="rounded-lg border border-error/20 bg-error/10 p-3 text-sm text-error">
                {error}
              </div>
            )}

            {/* Login button */}
            <button
              onClick={handleLogin}
              disabled={isLoading || !bridgeAvailable}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium',
                'bg-primary text-primary-foreground',
                'hover:bg-primary-hover',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'transition-all duration-200'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Aguardando login...
                </>
              ) : !bridgeAvailable ? (
                'Login indisponível'
              ) : (
                'Entrar com Studio Lagosta'
              )}
            </button>
          </div>

          {/* Help text */}
          <div className="mt-8 text-center">
            <p className="text-sm text-text-muted">
              Uma janela de login será aberta para você autenticar com sua conta.
            </p>
          </div>

          {/* Security note */}
          <div className="mt-8 rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-medium text-text">
              Segurança
            </h3>
            <p className="text-sm text-text-muted">
              Suas credenciais são armazenadas de forma segura no Keychain do macOS. 
              O login é feito diretamente através do Clerk, nosso provedor de autenticação.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
