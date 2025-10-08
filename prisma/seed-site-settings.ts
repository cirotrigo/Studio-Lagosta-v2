import { PrismaClient } from './generated/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Site Settings...')

  // Get or create a system user for seeding
  const systemUser = await prisma.user.findFirst({
    where: { email: 'suporte@aicoders.academy' },
  })

  const updatedBy = systemUser?.clerkId || 'system'

  // Deactivate all existing settings
  await prisma.siteSettings.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  })

  // Create default settings
  const settings = await prisma.siteSettings.create({
    data: {
      siteName: 'Studio Lagosta',
      shortName: 'Studio Lagosta',
      description:
        'Template Next.js pronto para produção pela AI Coders Academy: autenticação, banco de dados, pagamentos e sistema de créditos incluídos.',
      logoLight: '/logo-light.svg',
      logoDark: '/logo-dark.svg',
      favicon: '/favicon.ico',
      appleIcon: '/apple-touch-icon.png',
      metaTitle: 'Lagosta Criativa - Studio',
      metaDesc:
        'Template Next.js pronto para produção pela AI Coders Academy: autenticação, banco de dados, pagamentos e sistema de créditos incluídos.',
      ogImage: '/og-image.png',
      keywords: [
        'SaaS',
        'Next.js',
        'TypeScript',
        'Clerk',
        'Prisma',
        'Tailwind CSS',
        'AI Coders Academy',
        'Template',
        'Microsaas',
      ],
      supportEmail: 'suporte@aicoders.academy',
      twitter: '@aicodersacademy',
      gtmId: null,
      gaId: null,
      facebookPixelId: null,
      isActive: true,
      updatedBy,
    },
  })

  console.log('✅ Site settings created:', settings.id)
  console.log('🎉 Seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
