'use client'

import * as React from 'react'
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
    const logoFullLight = (config as any).logoFullLight || config.logo?.light
    const logoFullDark = (config as any).logoFullDark || config.logo?.dark
    const fullLogoClasses = className || 'h-12'

    return (
      <>
        {/* Logo completa para tema claro (escura) */}
        <img
          src={logoFullDark}
          className={`dark:hidden object-contain ${fullLogoClasses}`}
          alt={config.shortName || config.name}
          style={{ width: 'auto', maxWidth: '200px' }}
        />
        {/* Logo completa para tema escuro (clara) */}
        <img
          src={logoFullLight}
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
      <img
        src={config.logo?.dark}
        className={`dark:hidden object-contain ${iconClasses}`}
        alt={config.shortName || config.name}
      />
      <img
        src={config.logo?.light}
        className={`hidden dark:block object-contain ${iconClasses}`}
        alt={config.shortName || config.name}
      />
    </>
  )
}
