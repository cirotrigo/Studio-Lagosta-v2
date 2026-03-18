import { Loader2, AlertTriangle, Terminal, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { cn } from '@/lib/utils'

export default function AuthPage() {
  const { login, isLoading, error, setError, bridgeAvailable } = useAuthStore()

  const handleLogin = async () => {
    setError(null)
    await login()
  }

  return (
    <div className="flex h-screen flex-col bg-bg relative overflow-hidden text-white font-sans antialiased">
      {/* Background gradients similar to Lumina */}
      <div className="fixed z-0 top-0 right-0 bottom-0 left-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/90 via-[#050505] to-[#050505]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-orange-900/10 via-[#050505]/0 to-[#050505]/0"></div>
      </div>

      {/* Title bar drag region */}
      <div className="titlebar-drag h-[38px] w-full flex-shrink-0 z-10" />

      {/* Content */}
      <div className="flex flex-1 items-center justify-center p-8 z-10">
        <div className="w-full max-w-md animate-fade-slide-in">
          {/* Logo */}
          <div className="mb-10 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center relative group perspective-1000">
              <div className="absolute -inset-4 bg-orange-500/20 blur-xl -z-10 opacity-50 transition-opacity duration-700"></div>
              <img src="./icon.png" alt="Lagosta" className="h-full w-full rounded-2xl object-cover shadow-2xl border border-white/5" />
            </div>
            <h1 className="text-4xl md:text-5xl leading-[1.05] tracking-tight text-white font-medium mb-3">
              Studio{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-300 via-orange-500 to-orange-600">
                Lagosta
              </span>
            </h1>
            <p className="text-lg font-medium text-white/60">
              Faça login com sua conta
            </p>
          </div>

          {/* Login container */}
          <div className="space-y-6">
            {/* Bridge missing diagnostic */}
            {!bridgeAvailable && (
              <div className="surface-card p-4 border-warning/30 bg-warning/10">
                <div className="mb-2 flex items-center gap-2 text-warning">
                  <AlertTriangle size={18} />
                  <span className="font-medium text-sm">Modo web detectado</span>
                </div>
                <p className="mb-3 text-xs text-white/60">
                  A bridge Electron não está disponível. Este app deve ser executado via Electron, não no navegador.
                </p>
                <div className="flex items-center gap-2 rounded bg-black/40 px-3 py-2 font-mono text-[10px] text-white/80 border border-white/5">
                  <Terminal size={12} className="text-white/40" />
                  <code>npm --prefix desktop-app run dev:electron</code>
                </div>
              </div>
            )}

            {/* Error message */}
            {error && bridgeAvailable && (
              <div className="surface-card p-3 text-sm text-error border-error/20 bg-error/10">
                {error}
              </div>
            )}

            {/* Login button - using the updated .btn-primary */}
            <button
              onClick={handleLogin}
              disabled={isLoading || !bridgeAvailable}
              className={cn(
                'btn-primary w-full py-4 text-base font-semibold group',
                isLoading && 'cursor-wait',
                !bridgeAvailable && 'cursor-not-allowed opacity-50'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin mr-2" />
                  Aguardando login...
                </>
              ) : !bridgeAvailable ? (
                'Login indisponível'
              ) : (
                <>
                  <Sparkles size={18} className="mr-2 opacity-70 group-hover:opacity-100 transition-opacity" />
                  Entrar com Studio Lagosta
                </>
              )}
            </button>
          </div>

          {/* Help text */}
          <div className="mt-8 text-center text-xs font-medium tracking-wide uppercase text-white/40">
            Uma janela de login será aberta
          </div>

          {/* Security note */}
          <div className="mt-8 surface-card p-5">
            <h3 className="mb-2 text-xs font-bold tracking-widest uppercase text-white/50">
              Segurança
            </h3>
            <p className="text-sm leading-relaxed text-white/60 font-medium">
              Suas credenciais são armazenadas de forma segura no Keychain do macOS. 
              O login é feito diretamente através do Clerk.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
