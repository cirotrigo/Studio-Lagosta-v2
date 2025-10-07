'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

type HeroContent = {
  badge?: { text: string; link: string }
  title?: { lines: (string | { text: string; gradient: boolean })[] }
  description?: string
  ctas?: Array<{ text: string; href: string; variant: string }>
  backgroundImage?: { light: string; dark: string }
  centerImage?: { src: string; alt: string; width: number; height: number }
  clients?: { title: string; logos: Array<{ src: string; alt: string }> }
}

type CMSHeroProps = {
  content: HeroContent
}

export function CMSHero({ content }: CMSHeroProps) {
  const { badge, title, description, ctas, backgroundImage, centerImage, clients } = content

  return (
    <section className="relative overflow-hidden">
      {/* Background Grid */}
      {backgroundImage && (
        <>
          <div className="absolute inset-0 -z-10 dark:hidden">
            <Image
              src={backgroundImage.light}
              alt=""
              fill
              className="object-cover opacity-50"
              priority
            />
          </div>
          <div className="absolute inset-0 -z-10 hidden dark:block">
            <Image
              src={backgroundImage.dark}
              alt=""
              fill
              className="object-cover opacity-50"
              priority
            />
          </div>
        </>
      )}

      <div className="container mx-auto px-4 pt-24 md:pt-36 pb-16">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          {badge?.text && (
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border bg-background/60 px-4 py-1.5 text-sm backdrop-blur-sm">
              {badge.link ? (
                <Link href={badge.link} className="flex items-center gap-2 hover:opacity-80">
                  <span>{badge.text}</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ) : (
                <span>{badge.text}</span>
              )}
            </div>
          )}

          {/* Title */}
          {title?.lines && (
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl md:text-7xl mb-6">
              {title.lines.map((line, index) => {
                const text = typeof line === 'string' ? line : line.text
                const isGradient = typeof line !== 'string' && line.gradient

                return (
                  <div key={index}>
                    {isGradient ? (
                      <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        {text}
                      </span>
                    ) : (
                      text
                    )}
                  </div>
                )
              })}
            </h1>
          )}

          {/* Description */}
          {description && (
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground mb-8">
              {description}
            </p>
          )}

          {/* CTAs */}
          {ctas && ctas.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
              {ctas.map((cta, index) => (
                <Button
                  key={index}
                  asChild
                  variant={cta.variant === 'outline' ? 'outline' : 'default'}
                  size="lg"
                >
                  <Link href={cta.href}>{cta.text}</Link>
                </Button>
              ))}
            </div>
          )}

          {/* Center Image */}
          {centerImage?.src && (
            <div className="relative mx-auto max-w-5xl">
              <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
                <Image
                  src={centerImage.src}
                  alt={centerImage.alt || ''}
                  width={centerImage.width || 1200}
                  height={centerImage.height || 675}
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          )}
        </div>

        {/* Clients Section */}
        {clients?.logos && clients.logos.length > 0 && (
          <div className="mt-16 text-center">
            {clients.title && (
              <p className="text-sm text-muted-foreground mb-8">{clients.title}</p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-8 opacity-60 grayscale">
              {clients.logos.map((logo, index) => (
                <div key={index} className="relative h-8 w-24">
                  <Image
                    src={logo.src}
                    alt={logo.alt}
                    fill
                    className="object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
