import { Hero } from "@/components/marketing/hero"
import { Pricing } from "@/components/marketing/pricing"
import { getActivePlansSorted } from '@/lib/queries/plans'
import { FAQ } from "@/components/marketing/faq"
import { BentoGrid } from "@/components/marketing/bento-grid"
import { AIStarter } from "@/components/marketing/ai-starter"

export default async function LandingPage() {
  const plans = await getActivePlansSorted()
  return (
    <div className="min-h-screen">
      <Hero />
      <section id="features" className="container mx-auto px-4 mt-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Tudo que você precisa para começar</h2>
          <p className="mt-3 text-muted-foreground">Padrões amigáveis para produção, padrões extensíveis e uma interface de usuário limpa.</p>
        </div>
        <div className="mt-10">
          <BentoGrid />
        </div>
      </section>
      <AIStarter />
      <Pricing
        plans={plans.map((p) => ({
          id: p.id,
          clerkId: p.clerkId ?? null,
          name: p.name,
          credits: p.credits,
          currency: p.currency ?? null,
          priceMonthlyCents: p.priceMonthlyCents ?? null,
          priceYearlyCents: p.priceYearlyCents ?? null,
          description: p.description ?? null,
          features: Array.isArray(p.features) ? p.features.map((f: unknown) => ({
            name: (f as { name?: string }).name || '',
            description: (f as { description?: string }).description || null,
            included: (f as { included?: boolean }).included ?? true
          })) : null,
          badge: p.badge ?? null,
          highlight: p.highlight ?? false,
          ctaType: (p.ctaType === 'checkout' || p.ctaType === 'contact') ? p.ctaType : null,
          ctaLabel: p.ctaLabel ?? null,
          ctaUrl: p.ctaUrl ?? null,
          billingSource: p.billingSource as 'clerk' | 'manual' | null,
        }))}
      />
      <FAQ />
    </div>
  )
}
