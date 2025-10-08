import { PrismaClient } from './generated/client'

const prisma = new PrismaClient()

async function seedFeatureGrid() {
  console.log('🌱 Seeding Feature Grid Items...')

  const adminUserId = 'system' // ID genérico para seed

  const features = [
    {
      icon: 'Sparkles',
      iconColor: 'text-sky-500',
      title: 'Autenticação Pronta',
      description: 'Sistema completo de autenticação com Clerk, incluindo sign-in, sign-up e gestão de sessões.',
      gridArea: 'md:[grid-area:1/1/2/2]',
      order: 0,
    },
    {
      icon: 'Database',
      iconColor: 'text-green-500',
      title: 'Banco de Dados PostgreSQL',
      description: 'Prisma ORM configurado com PostgreSQL, migrações automáticas e tipos TypeScript.',
      gridArea: 'md:[grid-area:1/2/2/3]',
      order: 1,
    },
    {
      icon: 'CreditCard',
      iconColor: 'text-purple-500',
      title: 'Sistema de Créditos',
      description: 'Gestão completa de créditos com histórico, reembolsos e integração com planos.',
      gridArea: 'md:[grid-area:1/3/3/4]',
      order: 2,
    },
    {
      icon: 'Shield',
      iconColor: 'text-red-500',
      title: 'Segurança Robusta',
      description: 'Proteção em camadas com middleware, validação Zod e autenticação server-side.',
      gridArea: 'md:[grid-area:2/1/3/2]',
      order: 3,
    },
    {
      icon: 'Code',
      iconColor: 'text-orange-500',
      title: 'TypeScript First',
      description: 'Tipagem completa em todo o projeto para máxima segurança e produtividade.',
      gridArea: 'md:[grid-area:2/2/3/3]',
      order: 4,
    },
    {
      icon: 'Zap',
      iconColor: 'text-yellow-500',
      title: 'React Query',
      description: 'Gerenciamento de estado assíncrono com cache inteligente e atualizações em tempo real.',
      gridArea: 'md:[grid-area:3/1/4/2]',
      order: 5,
    },
    {
      icon: 'Layout',
      iconColor: 'text-pink-500',
      title: 'UI Moderna',
      description: 'Componentes Radix UI + Tailwind CSS com design system completo e dark mode.',
      gridArea: 'md:[grid-area:3/2/5/3]',
      order: 6,
    },
    {
      icon: 'Package',
      iconColor: 'text-sky-500',
      title: 'CMS Integrado',
      description: 'Sistema de gerenciamento de conteúdo com páginas, menus e componentes reutilizáveis.',
      gridArea: 'md:[grid-area:3/3/4/4]',
      order: 7,
    },
    {
      icon: 'Activity',
      iconColor: 'text-green-500',
      title: 'Analytics & Reports',
      description: 'Dashboard administrativo com métricas, MRR, ARR e análise de churn.',
      gridArea: 'md:[grid-area:4/1/5/2]',
      order: 8,
    },
    {
      icon: 'Cloud',
      iconColor: 'text-purple-500',
      title: 'Deploy Fácil',
      description: 'Configurado para Vercel com CI/CD automático e variáveis de ambiente.',
      gridArea: 'md:[grid-area:4/3/5/4]',
      order: 9,
    },
  ]

  for (const feature of features) {
    await prisma.featureGridItem.upsert({
      where: { id: `seed-${feature.order}` },
      update: feature,
      create: {
        id: `seed-${feature.order}`,
        ...feature,
        createdBy: adminUserId,
      },
    })
  }

  console.log('✅ Feature Grid Items seeded successfully!')
}

seedFeatureGrid()
  .catch((e) => {
    console.error('❌ Error seeding feature grid:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
