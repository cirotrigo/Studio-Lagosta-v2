'use client'

import * as React from 'react'
import Image from 'next/image'
import { useSiteConfig } from '@/hooks/use-site-config'
import { site } from '@/lib/brand-config'

interface DynamicLogoProps {
  /** Se true, usa a logo completa (com texto). Se false, usa apenas o ícone */
  useFull?: boolean
  /** Classes CSS adicionais */
  className?: string
}

export function DynamicLogo({ useFull = false, className }: DynamicLogoProps) {
  const { data: siteConfig } = useSiteConfig()

  // Se não tiver configuração carregada, usa fallback
  const config = siteConfig || site

  // Para logo completa
  if (useFull) {
    const configWithFull = config as typeof config & { logoFullLight?: string; logoFullDark?: string }
    const logoFullLight = configWithFull.logoFullLight || config.logo?.light
    const logoFullDark = configWithFull.logoFullDark || config.logo?.dark
    const fullLogoClasses = className || 'h-12'

    return (
      <>
        {/* Logo completa para tema claro (escura) */}
        <Image
          src={logoFullDark || ''}
          width={200}
          height={48}
          className={`dark:hidden object-contain ${fullLogoClasses}`}
          alt={config.shortName || config.name}
          style={{ width: 'auto', maxWidth: '200px' }}
        />
        {/* Logo completa para tema escuro (clara) */}
        <Image
          src={logoFullLight || ''}
          width={200}
          height={48}
          className={`hidden dark:block object-contain ${fullLogoClasses}`}
          alt={config.shortName || config.name}
          style={{ width: 'auto', maxWidth: '200px' }}
        />
      </>
    )
  }

  // Para logo ícone apenas (sem texto)
  const iconClasses = className || 'size-9'

  return (
    <>
      <Image
        src={config.logo?.dark || ''}
        width={36}
        height={36}
        className={`dark:hidden object-contain ${iconClasses}`}
        alt={config.shortName || config.name}
      />
      <Image
        src={config.logo?.light || ''}
        width={36}
        height={36}
        className={`hidden dark:block object-contain ${iconClasses}`}
        alt={config.shortName || config.name}
      />
    </>
  )
}
