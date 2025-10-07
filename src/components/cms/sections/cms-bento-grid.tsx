'use client'

import { LucideIcon } from 'lucide-react'
import * as Icons from 'lucide-react'

type Feature = {
  icon: string
  title: string
  description: string
  gridArea?: string
}

type BentoGridContent = {
  title?: string
  subtitle?: string
  features?: Feature[]
}

type CMSBentoGridProps = {
  content: BentoGridContent
}

export function CMSBentoGrid({ content }: CMSBentoGridProps) {
  const { title, subtitle, features } = content

  return (
    <section id="features" className="container mx-auto px-4 py-24">
      <div className="mx-auto max-w-2xl text-center mb-16">
        {title && (
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="mt-3 text-muted-foreground">{subtitle}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features?.map((feature, index) => {
          const IconComponent = (Icons as any)[feature.icon] as LucideIcon

          return (
            <div
              key={index}
              className="group relative overflow-hidden rounded-lg border bg-background p-6 hover:shadow-lg transition-shadow"
              style={feature.gridArea ? { gridArea: feature.gridArea } : undefined}
            >
              {IconComponent && (
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <IconComponent className="h-5 w-5 text-primary" />
                </div>
              )}
              <h3 className="mb-2 font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
