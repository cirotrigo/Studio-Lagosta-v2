'use client'

import { LucideIcon } from 'lucide-react'
import * as Icons from 'lucide-react'
import { GlowingEffect } from '@/components/ui/glowing-effect'

type Card = {
  id: string
  icon: string
  iconColor?: string
  title: string
  description: string
}

type AIStarterContent = {
  badge?: { text: string; icon?: string }
  title?: string
  subtitle?: string
  tools?: (string | { name: string; logo?: string })[]
  cards?: Card[]
}

type CMSAIStarterProps = {
  content: AIStarterContent
}

export function CMSAIStarter({ content }: CMSAIStarterProps) {
  const { badge, title, subtitle, tools, cards } = content

  return (
    <section id="ai-starter" className="relative mt-28">
      {/* Background gradient */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[520px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(50%_50%_at_50%_0%,hsl(var(--primary)/0.15)_0%,transparent_70%)] blur-2xl" />
      </div>

      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          {badge && (
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              {badge.icon && (() => {
                const BadgeIcon = (Icons as any)[badge.icon] as LucideIcon
                return BadgeIcon ? <BadgeIcon className="h-3.5 w-3.5 text-primary" /> : null
              })()}
              {badge.text}
            </span>
          )}
          {title && (
            <h2 className="mt-4 bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-3xl font-semibold tracking-tight text-transparent md:text-4xl">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="mt-3 text-base text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>

        <div className="mx-auto mt-10 max-w-6xl">
          {/* Cards Grid */}
          {cards && cards.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {cards.map((card) => {
                const IconComponent = (Icons as any)[card.icon] as LucideIcon

                return (
                  <div
                    key={card.id}
                    className="group relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3"
                  >
                    <GlowingEffect
                      spread={40}
                      glow
                      disabled={false}
                      proximity={64}
                      inactiveZone={0.01}
                      borderWidth={3}
                    />
                    <div className="relative flex h-full flex-col justify-between gap-4 overflow-hidden rounded-xl border-[0.75px] bg-background p-6 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)] transition-all duration-300">
                      {IconComponent && (
                        <span className="inline-flex size-8 items-center justify-center rounded-lg border-[0.75px] border-border bg-muted">
                          <IconComponent className={`h-4 w-4 ${card.iconColor || 'text-primary'}`} />
                        </span>
                      )}
                      <div className="space-y-2">
                        <h3 className="text-base font-semibold">{card.title}</h3>
                        <p className="text-sm text-muted-foreground">{card.description}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Tools row styled like bento */}
          {tools && tools.length > 0 && (
            <div className="mt-6">
              <div className="group relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
                <GlowingEffect
                  spread={40}
                  glow
                  disabled={false}
                  proximity={64}
                  inactiveZone={0.01}
                  borderWidth={3}
                />
                <div className="relative overflow-hidden rounded-xl border-[0.75px] bg-background p-4 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)] transition-all duration-300">
                  <div className="flex flex-wrap items-center gap-2">
                    {tools.map((tool, index) => {
                      // Handle both string and object formats
                      const toolName = typeof tool === 'string' ? tool : tool.name || 'Tool'

                      return (
                        <span
                          key={index}
                          className="px-3 py-1.5 text-xs rounded-md bg-black/5 text-gray-700 backdrop-blur-sm transition-all duration-200 hover:bg-black/10 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/20"
                        >
                          {toolName}
                        </span>
                      )
                    })}
                    <span key="more" className="px-3 py-1.5 text-xs rounded-md bg-black/5 text-gray-700 backdrop-blur-sm transition-all duration-200 hover:bg-black/10 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/20">
                      e mais…
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
