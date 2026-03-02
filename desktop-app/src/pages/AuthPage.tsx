import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { cn } from '@/lib/utils'

export default function AuthPage() {
  const { login, isLoading, error, setError } = useAuthStore()

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
            {/* Error message */}
            {error && (
              <div className="rounded-lg border border-error/20 bg-error/10 p-3 text-sm text-error">
                {error}
              </div>
            )}

            {/* Login button */}
            <button
              onClick={handleLogin}
              disabled={isLoading}
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
