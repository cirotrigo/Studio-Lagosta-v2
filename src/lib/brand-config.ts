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
  name: 'AI Coders Academy – Next.js SaaS Template',
  shortName: 'AI Coders SaaS',
  description:
    'Template Next.js pronto para produção pela AI Coders Academy: autenticação, banco de dados, pagamentos e sistema de créditos incluídos.',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  author: 'AI Coders Academy (Vinicius Lana)',
  keywords: ['SaaS', 'Next.js', 'TypeScript', 'Clerk', 'Prisma', 'Tailwind CSS', 'AI Coders Academy', 'Template', 'Microsaas'],
  ogImage: '/og-image.png',
  logo: {
    light: '/logo-light.svg',
    dark: '/logo-dark.svg',
  } as LogoPaths,
  icons: {
    favicon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon-16x16.png',
  } as IconPaths,
  socials: {
    twitter: '@aicodersacademy',
  },
  support: {
    email: 'suporte@aicoders.academy',
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
