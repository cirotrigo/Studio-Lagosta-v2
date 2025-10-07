'use client'

import { LucideIcon } from 'lucide-react'
import * as Icons from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlowingEffect } from '@/components/ui/glowing-effect'

type Feature = {
  id: string
  icon: string
  iconColor?: string
  title: string
  description: string
  gridArea?: string
}

type BentoGridContent = {
  title?: string
  subtitle?: string
  items?: Feature[]
}

type CMSBentoGridProps = {
  content: BentoGridContent
}

export function CMSBentoGrid({ content }: CMSBentoGridProps) {
  const { title, subtitle, items } = content

  return (
    <section id="features" className="container mx-auto px-4 py-24">
      {(title || subtitle) && (
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
      )}

      <ul className="grid grid-cols-1 grid-rows-none gap-4 md:grid-cols-3 md:grid-rows-4 lg:gap-4">
        {items?.map((item) => {
          const IconComponent = (Icons as any)[item.icon] as LucideIcon

          return (
            <li
              key={item.id}
              className={cn("min-h-[14rem] list-none", item.gridArea)}
              style={item.gridArea ? { gridArea: item.gridArea } : undefined}
            >
              <div className="group relative h-full rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
                <GlowingEffect
                  spread={40}
                  glow={true}
                  disabled={false}
                  proximity={64}
                  inactiveZone={0.01}
                  borderWidth={3}
                />
                <div className="relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-xl border-[0.75px] bg-background p-6 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)] md:p-6 transition-all duration-300">
                  <div className="relative flex flex-1 flex-col justify-between gap-3">
                    <div className="w-fit rounded-lg border-[0.75px] border-border bg-muted p-2">
                      {IconComponent && (
                        <IconComponent className={cn("h-4 w-4", item.iconColor || "text-primary")} />
                      )}
                    </div>
                    <div className="space-y-3">
                      <h3 className="pt-0.5 text-xl leading-[1.375rem] font-semibold font-sans tracking-[-0.04em] md:text-2xl md:leading-[1.875rem] text-balance text-foreground">
                        {item.title}
                      </h3>
                      <p className="[&_b]:md:font-semibold [&_strong]:md:font-semibold font-sans text-sm leading-[1.125rem] md:text-base md:leading-[1.375rem] text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
