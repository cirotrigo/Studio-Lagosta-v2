import { Shield, Zap, CreditCard, Cog, BarChart2, Lock } from "lucide-react"

const features = [
  {
    title: "Autenticação",
    description: "Autenticação com tecnologia Clerk com login, inscrição e sessões prontas para uso.",
    icon: Lock,
  },
  {
    title: "Sistema de Créditos",
    description: "Chaves de recursos tipadas com auxiliares de validação e dedução.",
    icon: CreditCard,
  },
  {
    title: "API e Banco de Dados",
    description: "Rotas validadas por Zod e Prisma com migrações prontas para uso.",
    icon: Shield,
  },
  {
    title: "Desempenho",
    description: "Next.js App Router, pronto para edge e padrões sensatos.",
    icon: Zap,
  },
  {
    title: "Analytics",
    description: "Conecte suas análises, registros e monitoramento preferidos.",
    icon: BarChart2,
  },
  {
    title: "Configurável",
    description: "Pastas claras, documentos úteis e padrões para iteração rápida.",
    icon: Cog,
  },
]

export function Features() {
  return (
    <section id="features" className="container mx-auto px-4 mt-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Tudo que você precisa para começar</h2>
        <p className="mt-3 text-muted-foreground">Padrões amigáveis para produção, padrões extensíveis e uma interface de usuário limpa.</p>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="group relative rounded-xl border bg-card/60 p-6 backdrop-blur-md">
            <div className="flex size-10 items-center justify-center rounded-md border bg-white/40 dark:bg-white/10">
              <f.icon className="size-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

