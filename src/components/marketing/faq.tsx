const faqs = [
  {
    q: "O que está incluído?",
    a: "Autenticação Clerk, Prisma, validação Zod, sistema de créditos e uma base de UI limpa com Tailwind.",
  },
  {
    q: "Posso usar minha própria autenticação ou cobrança?",
    a: "Sim. O template é modular - troque por seus provedores preferidos conforme necessário.",
  },
  {
    q: "Existe um esquema de banco de dados?",
    a: "Sim, o esquema e os scripts do Prisma estão incluídos. Execute as migrações com os scripts npm fornecidos.",
  },
  {
    q: "Como funcionam os créditos?",
    a: "Defina os custos dos recursos em uma única configuração e use auxiliares para validar e deduzir por solicitação.",
  },
]

export function FAQ() {
  return (
    <section id="faq" className="container mx-auto px-4 mt-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Perguntas frequentes</h2>
        <p className="mt-3 text-muted-foreground">Respostas para perguntas comuns sobre o template.</p>
      </div>
      <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-6">
        {faqs.map((f) => (
          <div
            key={f.q}
            className="group relative overflow-hidden rounded-xl border border-gray-100/80 bg-white p-6 transition-all duration-300 will-change-transform hover:-translate-y-0.5 hover:shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-black"
          >
            <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[length:4px_4px] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_1px,transparent_1px)]" />
            </div>
            <h3 className="relative text-base font-semibold">{f.q}</h3>
            <p className="relative mt-2 text-sm text-muted-foreground">{f.a}</p>
            <div className="absolute inset-0 -z-10 rounded-xl p-px opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-br from-transparent via-gray-100/50 to-transparent dark:via-white/10" />
          </div>
        ))}
      </div>
    </section>
  )
}
