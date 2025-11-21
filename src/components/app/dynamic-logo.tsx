'use client'

import * as React from 'react'
import Image from 'next/image'
import { useSiteConfig } from '@/hooks/use-site-config'

interface DynamicLogoProps {
  /** Se true, usa a logo completa (com texto). Se false, usa apenas o ícone */
  useFull?: boolean
  /** Classes CSS adicionais */
  className?: string
}

export function DynamicLogo({ useFull = false, className }: DynamicLogoProps) {
  const { data: siteConfig, isLoading } = useSiteConfig()

  // Não renderiza nada até carregar para evitar flash de conteúdo antigo
  if (isLoading || !siteConfig) {
    const skeletonClasses = useFull ? className || 'h-12' : className || 'size-9'
    return <div className={`${skeletonClasses} animate-pulse rounded bg-muted`} />
  }

  const config = siteConfig

  // Para logo completa
  if (useFull) {
    const configWithFull = config as typeof config & { logoFullLight?: string; logoFullDark?: string }
    const logoFullLight = configWithFull.logoFullLight || config.logo?.light
    const logoFullDark = configWithFull.logoFullDark || config.logo?.dark
    const fullLogoClasses = className || 'h-12'

    // Se não tiver logos configuradas, mostra fallback
    if (!logoFullDark && !logoFullLight) {
      return (
        <div className={`${fullLogoClasses} flex items-center justify-center font-bold text-foreground`}>
          {config.shortName || config.name}
        </div>
      )
    }

    return (
      <>
        {/* Logo completa para tema claro (escura) */}
        {logoFullDark && (
          <Image
            src={logoFullDark}
            width={200}
            height={48}
            className={`dark:hidden object-contain ${fullLogoClasses}`}
            alt={config.shortName || config.name}
            style={{ width: 'auto', maxWidth: '200px' }}
          />
        )}
        {/* Logo completa para tema escuro (clara) */}
        {logoFullLight && (
          <Image
            src={logoFullLight}
            width={200}
            height={48}
            className={`hidden dark:block object-contain ${fullLogoClasses}`}
            alt={config.shortName || config.name}
            style={{ width: 'auto', maxWidth: '200px' }}
          />
        )}
      </>
    )
  }

  // Para logo ícone apenas (sem texto)
  const iconClasses = className || 'size-9'
  const logoDark = config.logo?.dark
  const logoLight = config.logo?.light

  // Se não tiver logos configuradas, mostra fallback
  if (!logoDark && !logoLight) {
    return (
      <div className={`${iconClasses} flex items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm`}>
        {(config.shortName || config.name || 'L').charAt(0)}
      </div>
    )
  }

  return (
    <>
      {logoDark && (
        <Image
          src={logoDark}
          width={36}
          height={36}
          className={`dark:hidden object-contain ${iconClasses}`}
          alt={config.shortName || config.name}
        />
      )}
      {logoLight && (
        <Image
          src={logoLight}
          width={36}
          height={36}
          className={`hidden dark:block object-contain ${iconClasses}`}
          alt={config.shortName || config.name}
        />
      )}
    </>
  )
}
