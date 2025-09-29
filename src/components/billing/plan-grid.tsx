"use client"

import { CheckoutButton } from '@clerk/clerk-react/experimental'
import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs'
import { PlanDisplay, PlanPricingSection, buildPlanTiers } from '@/components/plans'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PlanGridProps = {
  plans: PlanDisplay[]
}

export function PlanGrid({ plans }: PlanGridProps) {
  const tiers = buildPlanTiers(plans)

  if (!tiers.length) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhum plano ativo disponível no momento.
      </div>
    )
  }

  return (
    <PlanPricingSection
      layout="compact"
      tiers={tiers}
      title=""
      subtitle=""
      renderAction={({ tier, billingPeriod, resolvedPeriod, defaultButtonClassName, cta }) => {
        if (cta.type === 'contact') {
          if (!cta.url) {
            return (
              <Button disabled className={cn('w-full', defaultButtonClassName)}>
                {cta.label}
              </Button>
            )
          }
          const isExternal = /^https?:/i.test(cta.url)
          return (
            <Button asChild className={cn('w-full relative transition-all duration-300', defaultButtonClassName)}>
              <a
                href={cta.url}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noreferrer' : undefined}
                className="relative z-10 flex items-center justify-center gap-2"
              >
                {cta.label}
              </a>
            </Button>
          )
        }

        const effectivePeriod = resolvedPeriod ?? null
        const hasPrice = effectivePeriod === 'yearly'
          ? tier.plan.priceYearlyCents != null
          : effectivePeriod === 'monthly'
            ? tier.plan.priceMonthlyCents != null
            : false

        if (!hasPrice || !effectivePeriod) {
          return (
            <Button disabled className={cn('w-full', defaultButtonClassName)}>
              {cta.label}
            </Button>
          )
        }

        const planPeriod = effectivePeriod === 'yearly' ? 'annual' : 'month'
        const periodLabel = effectivePeriod === 'yearly' ? 'anual' : 'mensal'
        const toggledDifferent = billingPeriod !== effectivePeriod
        const buttonLabel = toggledDifferent
          ? `${cta.label} (${periodLabel} disponível)`
          : `${cta.label} (${periodLabel})`

        if (!tier.plan.clerkId) {
          return (
            <Button disabled className={cn('w-full', defaultButtonClassName)}>
              Indisponível
            </Button>
          )
        }

        return (
          <>
            <SignedIn>
              <CheckoutButton
                planId={tier.plan.clerkId}
                planPeriod={planPeriod}
                newSubscriptionRedirectUrl="/dashboard"
                checkoutProps={{
                  appearance: {
                    elements: {
                      drawerRoot: {
                        marginTop: '100px'
                      }
                    }
                  }
                }}
              >
                <Button className={cn('w-full relative transition-all duration-300', defaultButtonClassName)}>
                  {buttonLabel}
                </Button>
              </CheckoutButton>
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal" redirectUrl="/subscribe">
                <Button className={cn('w-full relative transition-all duration-300', defaultButtonClassName)}>
                  Entre para assinar
                </Button>
              </SignInButton>
            </SignedOut>
          </>
        )
      }}
    />
  )
}
