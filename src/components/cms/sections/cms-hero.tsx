'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnimatedGroup } from '@/components/ui/animated-group'

type HeroContent = {
  badge?: { text: string; link: string }
  title?: string | { lines: (string | { text: string; gradient: boolean })[] }
  description?: string
  ctas?: Array<{ text: string; href: string; variant: string }>
  backgroundImage?: { light: string; dark: string }
  centerImage?: { src: string; alt: string; width: number; height: number }
  demoImage?: { light: string; dark: string; alt: string }
  clients?: { title: string; logos: Array<{ src: string; alt: string; width?: number; height?: number }> }
  showLogos?: boolean
  logos?: Array<{ src: string; alt: string; width?: number; height?: number }>
}

type CMSHeroProps = {
  content: HeroContent
}

const transitionVariants = {
  item: {
    hidden: {
      opacity: 0,
      filter: 'blur(12px)',
      y: 12,
    },
    visible: {
      opacity: 1,
      filter: 'blur(0px)',
      y: 0,
      transition: {
        type: 'spring' as const,
        bounce: 0.3,
        duration: 1.5,
      },
    },
  },
} as const

export function CMSHero({ content }: CMSHeroProps) {
  const { badge, title, description, ctas, backgroundImage, centerImage, demoImage, clients, showLogos, logos } = content

  return (
    <main className="overflow-hidden">
      {/* Decorative background elements */}
      <div
        aria-hidden
        className="z-[2] absolute inset-0 pointer-events-none isolate opacity-50 contain-strict hidden lg:block">
        <div className="w-[35rem] h-[80rem] -translate-y-[350px] absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
        <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
        <div className="h-[80rem] -translate-y-[350px] absolute left-0 top-0 w-56 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]" />
      </div>

      <section>
        <div className="relative pt-24 md:pt-36">
          {/* Background Image with Animation */}
          <AnimatedGroup
            variants={{
              container: {
                visible: {
                  transition: {
                    delayChildren: 1,
                  },
                },
              },
              item: {
                hidden: {
                  opacity: 0,
                  y: 20,
                },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: {
                    type: 'spring' as const,
                    bounce: 0.3,
                    duration: 2,
                  },
                },
              },
            }}
            className="absolute inset-0 -z-20">
            {demoImage?.dark && (
              <Image
                src={demoImage.dark}
                alt="background"
                className="absolute inset-x-0 top-56 -z-20 hidden lg:top-32 dark:block"
                width={3276}
                height={4095}
                priority
              />
            )}
            {demoImage?.light && (
              <Image
                src={demoImage.light}
                alt="background"
                className="absolute inset-x-0 top-56 -z-20 lg:top-32 dark:hidden"
                width={3276}
                height={4095}
                priority
              />
            )}
          </AnimatedGroup>

          <div aria-hidden className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--background)_75%)]" />

          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
              <AnimatedGroup variants={transitionVariants}>
                {/* Badge */}
                {badge?.text && (
                  <Link
                    href={badge.link || '#'}
                    className="hover:bg-background dark:hover:border-t-border bg-muted group mx-auto flex w-fit items-center gap-4 rounded-full border p-1 pl-4 shadow-md shadow-black/5 transition-all duration-300 dark:border-t-white/5 dark:shadow-zinc-950">
                    <span className="text-foreground text-sm">{badge.text}</span>
                    <span className="dark:border-background block h-4 w-0.5 border-l bg-white dark:bg-zinc-700"></span>
                    <div className="bg-background group-hover:bg-muted size-6 overflow-hidden rounded-full duration-500">
                      <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3" />
                        </span>
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                )}

                {/* Title */}
                {title && (
                  <h1 className="mt-8 max-w-4xl mx-auto text-balance text-6xl md:text-7xl lg:mt-16 xl:text-[5.25rem]">
                    {typeof title === 'string' ? title : (
                      <>
                        {title.lines?.map((line, index) => {
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
                      </>
                    )}
                  </h1>
                )}

                {/* Description */}
                {description && (
                  <p className="mx-auto mt-8 max-w-2xl text-balance text-lg">
                    {description}
                  </p>
                )}
              </AnimatedGroup>

              {/* CTAs with Animation */}
              <AnimatedGroup
                variants={{
                  container: {
                    visible: {
                      transition: {
                        staggerChildren: 0.05,
                        delayChildren: 0.75,
                      },
                    },
                  },
                  ...transitionVariants,
                }}
                className="mt-12 flex flex-col items-center justify-center gap-2 md:flex-row">
                {ctas?.map((cta, index) => (
                  <div
                    key={index}
                    className={cta.variant === 'default' ? 'bg-foreground/10 rounded-[14px] border p-0.5' : ''}>
                    <Button
                      asChild
                      size="lg"
                      variant={cta.variant === 'outline' || cta.variant === 'ghost' ? (cta.variant as any) : 'default'}
                      className={cta.variant === 'default' ? 'rounded-xl px-5 text-base' : 'h-10.5 rounded-xl px-5'}>
                      <Link href={cta.href}>
                        <span className="text-nowrap">{cta.text}</span>
                      </Link>
                    </Button>
                  </div>
                ))}
              </AnimatedGroup>
            </div>
          </div>

          {/* Center Image / Demo Image */}
          {(centerImage?.src || demoImage) && (
            <AnimatedGroup
              variants={{
                container: {
                  visible: {
                    transition: {
                      staggerChildren: 0.05,
                      delayChildren: 0.25,
                    },
                  },
                },
                item: {
                  hidden: {
                    opacity: 0,
                    y: 40,
                  },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: {
                      type: 'spring' as const,
                      bounce: 0.3,
                      duration: 2.5,
                    },
                  },
                },
              }}
              className="relative mt-20 px-6 lg:px-0 xl:px-10">
              <div className="relative mx-auto max-w-6xl">
                <div className="absolute inset-0 -z-10 rounded-[2.5rem] bg-gradient-to-r from-primary/20 to-purple-500/20 opacity-0 blur-3xl transition-opacity duration-1000 group-hover:opacity-100" />
                <div className="overflow-hidden rounded-[2rem] border border-border/50 bg-background/80 p-2 backdrop-blur-sm">
                  {centerImage?.src ? (
                    <Image
                      src={centerImage.src}
                      alt={centerImage.alt || ''}
                      width={centerImage.width || 1200}
                      height={centerImage.height || 675}
                      className="rounded-[1.5rem] shadow-2xl"
                      priority
                    />
                  ) : demoImage?.light ? (
                    <>
                      <Image
                        src={demoImage.light}
                        alt={demoImage.alt || 'Demo'}
                        width={2700}
                        height={1440}
                        className="z-2 border-border/25 aspect-15/8 relative rounded-2xl border dark:hidden"
                        priority
                      />
                      {demoImage.dark && (
                        <Image
                          src={demoImage.dark}
                          alt={demoImage.alt || 'Demo'}
                          width={2700}
                          height={1440}
                          className="bg-background aspect-15/8 relative hidden rounded-2xl dark:block"
                          priority
                        />
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            </AnimatedGroup>
          )}

          {/* Clients/Logos Section */}
          {(showLogos && logos && logos.length > 0) || (clients?.logos && clients.logos.length > 0) && (
            <div className="mt-20 pb-16">
              <AnimatedGroup
                variants={transitionVariants}
                className="mx-auto max-w-7xl px-6">
                {(clients?.title || showLogos) && (
                  <p className="text-center text-sm text-muted-foreground mb-8">
                    {clients?.title || 'Confiado por desenvolvedores ao redor do mundo'}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-8 opacity-60 grayscale">
                  {(logos || clients?.logos)?.map((logo, index) => (
                    <div key={index} className="relative" style={{ height: logo.height || 32, width: logo.width || 96 }}>
                      <Image
                        src={logo.src}
                        alt={logo.alt}
                        fill
                        className="object-contain"
                      />
                    </div>
                  ))}
                </div>
              </AnimatedGroup>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
