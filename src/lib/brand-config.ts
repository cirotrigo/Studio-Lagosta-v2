import type { Metadata } from 'next'

type LogoPaths = {
  light?: string
  dark?: string
}

type IconPaths = {
  favicon?: string
  apple?: string
  shortcut?: string
}

export type AnalyticsConfig = {
  gtmId?: string
  gaMeasurementId?: string
  facebookPixelId?: string
}

export const site = {
  name: 'Lagosta Criativa - Studio',
  shortName: 'Studio Lagosta',
  description:
    'Studio Lagosta: a plataforma da Lagosta Criativa para criar, agendar e publicar o conteúdo de restaurantes.',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  author: 'Lagosta Criativa (Ciro Trigo)',
  keywords: ['marketing gastronômico', 'restaurantes', 'Instagram', 'Studio Lagosta', 'Lagosta Criativa'],
  ogImage: '/og-image.png',
  logo: {
    light: '/logo-light.svg',
    dark: '/logo-dark.svg',
  } as LogoPaths,
  icons: {
    favicon: '/favicon.svg',
    apple: undefined,
    shortcut: undefined,
  } as IconPaths,
  socials: {
    twitter: '@lagostacriativa',
  },
  support: {
    email: 'contato@lagostacriativa.com.br',
  },
  analytics: {
    gtmId: process.env.NEXT_PUBLIC_GTM_ID,
    gaMeasurementId: process.env.NEXT_PUBLIC_GA_ID,
    facebookPixelId: process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID,
  } as AnalyticsConfig,
} as const

export const siteMetadata: Metadata = {
  title: site.name,
  description: site.description,
  keywords: [...site.keywords],
  authors: [{ name: site.author }],
  openGraph: {
    title: site.name,
    description: site.description,
    url: site.url,
    siteName: site.name,
    images: site.ogImage ? [{ url: site.ogImage }] : undefined,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: site.name,
    description: site.description,
  },
  icons: {
    icon: site.icons.favicon,
    apple: site.icons.apple,
    shortcut: site.icons.shortcut,
  },
}
