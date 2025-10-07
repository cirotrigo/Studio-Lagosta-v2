'use client'

import Image from 'next/image'
import { LucideIcon } from 'lucide-react'
import * as Icons from 'lucide-react'

type Tool = {
  name: string
  logo: string
}

type Card = {
  icon: string
  title: string
  description: string
}

type AIStarterContent = {
  badge?: string
  title?: string
  subtitle?: string
  tools?: Tool[]
  cards?: Card[]
}

type CMSAIStarterProps = {
  content: AIStarterContent
}

export function CMSAIStarter({ content }: CMSAIStarterProps) {
  const { badge, title, subtitle, tools, cards } = content

  return (
    <section className="container mx-auto px-4 py-24 bg-muted/30">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-16">
          {badge && (
            <div className="inline-block px-4 py-1 rounded-full bg-primary/10 text-primary text-sm mb-4">
              {badge}
            </div>
          )}
          {title && (
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="mt-3 text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {/* Tools Logos */}
        {tools && tools.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-8 mb-16 opacity-60 grayscale hover:grayscale-0 transition-all">
            {tools.map((tool, index) => (
              <div key={index} className="relative h-8 w-24">
                <Image
                  src={tool.logo}
                  alt={tool.name}
                  fill
                  className="object-contain"
                />
              </div>
            ))}
          </div>
        )}

        {/* Cards */}
        {cards && cards.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {cards.map((card, index) => {
              const IconComponent = (Icons as any)[card.icon] as LucideIcon

              return (
                <div
                  key={index}
                  className="rounded-lg border bg-background p-6 text-center"
                >
                  {IconComponent && (
                    <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <IconComponent className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  <h3 className="mb-2 font-semibold">{card.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {card.description}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
