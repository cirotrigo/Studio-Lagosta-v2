const testimonials = [
  {
    name: "Avery L.",
    role: "Fundador, PixelForge",
    quote: "Nós enviamos nosso MVP em dias, não em semanas. O sistema de créditos e autenticação economizou muito tempo.",
  },
  {
    name: "Jordan P.",
    role: "CTO, FlowLabs",
    quote: "Padrões limpos para APIs e banco de dados tornaram a integração de novos desenvolvedores indolor.",
  },
  {
    name: "Sam R.",
    role: "Indie Hacker",
    quote: "Exatamente o que eu precisava para ir da ideia a usuários pagantes rapidamente.",
  },
]

export function Testimonials() {
  return (
    <section className="container mx-auto px-4 mt-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Amado pelos construtores</h2>
        <p className="mt-3 text-muted-foreground">Junte-se a equipes que enviam com confiança e velocidade.</p>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {testimonials.map((t) => (
          <figure
            key={t.name}
            className="group relative overflow-hidden rounded-xl border border-gray-100/80 bg-white p-6 transition-all duration-300 will-change-transform hover:-translate-y-0.5 hover:shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-black"
          >
            <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[length:4px_4px] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_1px,transparent_1px)]" />
            </div>
            <blockquote className="relative text-sm leading-relaxed">“{t.quote}”</blockquote>
            <figcaption className="relative mt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{t.name}</span> · {t.role}
            </figcaption>
            <div className="absolute inset-0 -z-10 rounded-xl p-px opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-br from-transparent via-gray-100/50 to-transparent dark:via-white/10" />
          </figure>
        ))}
      </div>
    </section>
  )
}
