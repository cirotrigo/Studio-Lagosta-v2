import { Hero } from "@/components/marketing/hero"
import { Pricing } from "@/components/marketing/pricing"
import { getActivePlansSorted } from '@/lib/queries/plans'
import { FAQ } from "@/components/marketing/faq"
import { BentoGrid } from "@/components/marketing/bento-grid"
import { AIStarter } from "@/components/marketing/ai-starter"

type RawPlanFeature =
  | string
  | null
  | undefined
  | {
      name?: string | null
      description?: string | null
      included?: boolean | null
    }

function normalizeFeatures(features: unknown): {
  name: string
  description: string | null
  included: boolean
}[] | null {
  if (!Array.isArray(features)) {
    return null
  }

  const normalized = features
    .map((raw: RawPlanFeature) => {
      if (!raw) return null

      if (typeof raw === 'string') {
        const label = raw.trim()
        if (!label) return null
        return {
          name: label,
          description: null,
          included: true,
        }
      }

      const label = raw.name?.trim() ?? ''
      if (!label) return null

      return {
        name: label,
        description: raw.description?.toString().trim() || null,
        included: raw.included ?? true,
      }
    })
    .filter(Boolean) as Array<{
      name: string
      description: string | null
      included: boolean
    }>

  return normalized.length > 0 ? normalized : null
}

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
          features: normalizeFeatures(p.features),
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
