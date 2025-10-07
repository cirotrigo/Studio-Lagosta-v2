import { PrismaClient } from './generated/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding CMS data...')

  // Get or create a system user for seeding
  const systemUser = await prisma.user.findFirst({
    where: { email: 'suporte@aicoders.academy' },
  })

  const createdBy = systemUser?.clerkId || 'system'

  // Create Home Page
  console.log('📄 Creating home page...')
  const homePage = await prisma.cMSPage.upsert({
    where: { slug: 'home' },
    update: {},
    create: {
      title: 'Página Inicial',
      slug: 'home',
      path: '/',
      description: 'Página inicial do Studio Lagosta',
      status: 'PUBLISHED',
      isHome: true,
      metaTitle: 'Lagosta Criativa - Studio',
      metaDesc:
        'Template Next.js pronto para produção pela AI Coders Academy: autenticação, banco de dados, pagamentos e sistema de créditos incluídos.',
      ogImage: '/og-image.png',
      publishedAt: new Date(),
      createdBy,
    },
  })
  console.log('✅ Home page created:', homePage.id)

  // Create Hero Section
  console.log('🦸 Creating hero section...')
  const heroSection = await prisma.cMSSection.create({
    data: {
      pageId: homePage.id,
      type: 'HERO',
      name: 'Hero Principal',
      order: 0,
      isVisible: true,
      content: {
        badge: {
          text: 'Construído com AI Coders Academy',
          link: 'https://aicoders.academy',
        },
        title: {
          lines: [
            'O jeito mais rápido',
            'de construir seu',
            'próximo',
            { text: 'SaaS', gradient: true },
          ],
        },
        description:
          'Template completo com autenticação, banco de dados, sistema de créditos, pagamentos e muito mais. Comece a construir em minutos, não em semanas.',
        ctas: [
          {
            text: 'Começar Grátis',
            href: '/sign-up',
            variant: 'default',
          },
          {
            text: 'Ver Demo',
            href: '#features',
            variant: 'outline',
          },
        ],
        backgroundImage: {
          light: '/grid-light.svg',
          dark: '/grid-dark.svg',
        },
        centerImage: {
          src: '/dashboard-preview.png',
          alt: 'Dashboard Preview',
          width: 800,
          height: 500,
        },
        clients: {
          title: 'Confiado por desenvolvedores ao redor do mundo',
          logos: [
            { src: '/client-1.svg', alt: 'Cliente 1' },
            { src: '/client-2.svg', alt: 'Cliente 2' },
            { src: '/client-3.svg', alt: 'Cliente 3' },
            { src: '/client-4.svg', alt: 'Cliente 4' },
            { src: '/client-5.svg', alt: 'Cliente 5' },
          ],
        },
      },
    },
  })
  console.log('✅ Hero section created:', heroSection.id)

  // Create BentoGrid Section
  console.log('🎨 Creating bento grid section...')
  const bentoSection = await prisma.cMSSection.create({
    data: {
      pageId: homePage.id,
      type: 'BENTO_GRID',
      name: 'Grid de Recursos',
      order: 1,
      isVisible: true,
      content: {
        title: 'Tudo que você precisa para começar',
        subtitle: 'Padrões amigáveis para produção, padrões extensíveis e uma interface de usuário limpa.',
        features: [
          {
            icon: 'Shield',
            title: 'Autenticação',
            description: 'Sistema completo de autenticação com Clerk',
            gridArea: '1 / 1 / 2 / 2',
          },
          {
            icon: 'Database',
            title: 'Banco de Dados',
            description: 'PostgreSQL com Prisma ORM',
            gridArea: '1 / 2 / 2 / 3',
          },
          {
            icon: 'CreditCard',
            title: 'Pagamentos',
            description: 'Integração com Stripe pronta',
            gridArea: '1 / 3 / 2 / 4',
          },
          {
            icon: 'Zap',
            title: 'Sistema de Créditos',
            description: 'Controle de uso e limites',
            gridArea: '2 / 1 / 3 / 2',
          },
          {
            icon: 'Palette',
            title: 'UI/UX Moderno',
            description: 'Tailwind CSS + Radix UI',
            gridArea: '2 / 2 / 3 / 3',
          },
          {
            icon: 'Code',
            title: 'TypeScript',
            description: 'Type-safe de ponta a ponta',
            gridArea: '2 / 3 / 3 / 4',
          },
          {
            icon: 'Rocket',
            title: 'Deploy Rápido',
            description: 'Configurado para Vercel',
            gridArea: '3 / 1 / 4 / 2',
          },
          {
            icon: 'BarChart',
            title: 'Analytics',
            description: 'Rastreamento de uso integrado',
            gridArea: '3 / 2 / 4 / 3',
          },
          {
            icon: 'Mail',
            title: 'Sistema de Emails',
            description: 'Templates prontos para uso',
            gridArea: '3 / 3 / 4 / 4',
          },
          {
            icon: 'Settings',
            title: 'Painel Admin',
            description: 'Gerenciamento completo',
            gridArea: '4 / 1 / 5 / 2',
          },
          {
            icon: 'FileText',
            title: 'Documentação',
            description: 'Guias completos incluídos',
            gridArea: '4 / 2 / 5 / 3',
          },
          {
            icon: 'Sparkles',
            title: 'E muito mais...',
            description: 'Descubra todos os recursos',
            gridArea: '4 / 3 / 5 / 4',
          },
        ],
      },
    },
  })
  console.log('✅ Bento grid section created:', bentoSection.id)

  // Create AI Starter Section
  console.log('🤖 Creating AI starter section...')
  const aiStarterSection = await prisma.cMSSection.create({
    data: {
      pageId: homePage.id,
      type: 'AI_STARTER',
      name: 'Compatibilidade com IA',
      order: 2,
      isVisible: true,
      content: {
        badge: 'Compatível com as melhores ferramentas de IA',
        title: 'Construa com as melhores ferramentas de IA',
        subtitle: 'Integre facilmente com as principais plataformas de IA do mercado',
        tools: [
          { name: 'OpenAI', logo: '/logos/openai.svg' },
          { name: 'Anthropic', logo: '/logos/anthropic.svg' },
          { name: 'Google AI', logo: '/logos/google-ai.svg' },
          { name: 'Hugging Face', logo: '/logos/huggingface.svg' },
          { name: 'Replicate', logo: '/logos/replicate.svg' },
          { name: 'Cohere', logo: '/logos/cohere.svg' },
        ],
        cards: [
          {
            icon: 'Brain',
            title: 'IA Integrada',
            description: 'Conecte-se facilmente com modelos de linguagem avançados',
          },
          {
            icon: 'Workflow',
            title: 'Automação',
            description: 'Automatize tarefas complexas com IA',
          },
          {
            icon: 'TrendingUp',
            title: 'Escalável',
            description: 'Cresça sem limites com infraestrutura pronta',
          },
        ],
      },
    },
  })
  console.log('✅ AI starter section created:', aiStarterSection.id)

  // Create FAQ Section
  console.log('❓ Creating FAQ section...')
  const faqSection = await prisma.cMSSection.create({
    data: {
      pageId: homePage.id,
      type: 'FAQ',
      name: 'Perguntas Frequentes',
      order: 4,
      isVisible: true,
      content: {
        title: 'Perguntas Frequentes',
        subtitle: 'Tudo que você precisa saber sobre o Studio Lagosta',
        faqs: [
          {
            question: 'O que está incluído no template?',
            answer:
              'O template inclui autenticação completa com Clerk, banco de dados PostgreSQL configurado com Prisma, sistema de créditos, integração com Stripe, painel administrativo, UI/UX moderna com Tailwind CSS e Radix UI, e muito mais.',
          },
          {
            question: 'Posso usar em projetos comerciais?',
            answer:
              'Sim! Você pode usar o template em quantos projetos comerciais quiser. A licença permite uso ilimitado.',
          },
          {
            question: 'Recebo atualizações?',
            answer:
              'Sim, você receberá todas as atualizações futuras do template gratuitamente.',
          },
          {
            question: 'Qual suporte está disponível?',
            answer:
              'Oferecemos suporte via Discord, documentação completa e tutoriais em vídeo.',
          },
          {
            question: 'Preciso de conhecimento avançado?',
            answer:
              'Conhecimento básico de Next.js e TypeScript é recomendado. A documentação inclui guias passo a passo.',
          },
          {
            question: 'Como funciona o sistema de créditos?',
            answer:
              'O sistema de créditos permite controlar o uso de recursos por usuário. É totalmente customizável e pode ser integrado com qualquer serviço.',
          },
        ],
      },
    },
  })
  console.log('✅ FAQ section created:', faqSection.id)

  // Create Pricing Section (reference to existing plans)
  console.log('💰 Creating pricing section...')
  const pricingSection = await prisma.cMSSection.create({
    data: {
      pageId: homePage.id,
      type: 'PRICING',
      name: 'Planos e Preços',
      order: 3,
      isVisible: true,
      content: {
        title: 'Escolha o plano ideal para você',
        subtitle: 'Comece grátis e escale conforme cresce',
        displayMode: 'from_database',
      },
    },
  })
  console.log('✅ Pricing section created:', pricingSection.id)

  // Create Main Menu
  console.log('🍔 Creating main menu...')
  const mainMenu = await prisma.cMSMenu.upsert({
    where: { slug: 'main-menu' },
    update: {},
    create: {
      name: 'Menu Principal',
      slug: 'main-menu',
      location: 'header',
      isActive: true,
    },
  })

  // Create Menu Items
  const menuItems = [
    { label: 'Recursos', url: '#features', order: 0 },
    { label: 'Preços', url: '#pricing', order: 1 },
    { label: 'FAQ', url: '#faq', order: 2 },
    { label: 'Sobre', url: '/', order: 3 },
  ]

  for (const item of menuItems) {
    await prisma.cMSMenuItem.create({
      data: {
        menuId: mainMenu.id,
        label: item.label,
        url: item.url,
        order: item.order,
        isVisible: true,
      },
    })
  }
  console.log('✅ Main menu created with', menuItems.length, 'items')

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
