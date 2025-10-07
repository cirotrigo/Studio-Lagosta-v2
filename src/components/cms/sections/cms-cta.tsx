'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

type CTAContent = {
  title?: string
  description?: string
  button?: { text: string; href: string }
}

type CMSCTAProps = {
  content: CTAContent
}

export function CMSCTA({ content }: CMSCTAProps) {
  const { title, description, button } = content

  return (
    <section className="container mx-auto px-4 py-24">
      <div className="mx-auto max-w-3xl rounded-2xl bg-primary/5 border p-12 text-center">
        {title && (
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
            {title}
          </h2>
        )}
        {description && (
          <p className="text-lg text-muted-foreground mb-8">{description}</p>
        )}
        {button?.text && button?.href && (
          <Button asChild size="lg">
            <Link href={button.href}>{button.text}</Link>
          </Button>
        )}
      </div>
    </section>
  )
}
