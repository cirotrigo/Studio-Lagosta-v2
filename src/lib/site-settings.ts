import { db } from '@/lib/db'

export type SiteSettings = {
  id: string
  siteName: string
  shortName: string
  description: string
  logoLight: string
  logoDark: string
  logoFullLight: string | null
  logoFullDark: string | null
  favicon: string
  appleIcon: string | null
  metaTitle: string | null
  metaDesc: string | null
  ogImage: string | null
  keywords: string[]
  supportEmail: string | null
  twitter: string | null
  facebook: string | null
  instagram: string | null
  linkedin: string | null
  github: string | null
  gtmId: string | null
  gaId: string | null
  facebookPixelId: string | null
  isActive: boolean
  updatedBy: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Get active site settings
 * Returns default settings if none found
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  const settings = await db.siteSettings.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  })

  if (!settings) {
    // Return default settings
    return {
      id: 'default',
      siteName: 'Studio Lagosta',
      shortName: 'Studio Lagosta',
      description:
        'Template Next.js pronto para produção pela AI Coders Academy: autenticação, banco de dados, pagamentos e sistema de créditos incluídos.',
      logoLight: '/logo-light.svg',
      logoDark: '/logo-dark.svg',
      logoFullLight: null,
      logoFullDark: null,
      favicon: '/favicon.ico',
      appleIcon: null,
      metaTitle: null,
      metaDesc: null,
      ogImage: '/og-image.png',
      keywords: ['SaaS', 'Next.js', 'TypeScript', 'Clerk', 'Prisma', 'Tailwind CSS'],
      supportEmail: 'suporte@aicoders.academy',
      twitter: '@aicodersacademy',
      facebook: null,
      instagram: null,
      linkedin: null,
      github: null,
      gtmId: null,
      gaId: null,
      facebookPixelId: null,
      isActive: true,
      updatedBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  return settings
}

/**
 * Get settings for brand-config compatibility
 */
export async function getSiteConfig() {
  const settings = await getSiteSettings()

  return {
    name: settings.siteName,
    shortName: settings.shortName,
    description: settings.description,
    logo: {
      light: settings.logoLight,
      dark: settings.logoDark,
    },
    logoFullLight: settings.logoFullLight || undefined,
    logoFullDark: settings.logoFullDark || undefined,
    icons: {
      favicon: settings.favicon,
      apple: settings.appleIcon || undefined,
    },
    ogImage: settings.ogImage || undefined,
    keywords: settings.keywords,
    support: {
      email: settings.supportEmail || undefined,
    },
    socials: {
      twitter: settings.twitter || undefined,
      facebook: settings.facebook || undefined,
      instagram: settings.instagram || undefined,
      linkedin: settings.linkedin || undefined,
      github: settings.github || undefined,
    },
    analytics: {
      gtmId: settings.gtmId || undefined,
      gaMeasurementId: settings.gaId || undefined,
      facebookPixelId: settings.facebookPixelId || undefined,
    },
  }
}
