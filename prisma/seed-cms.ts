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

  // Delete existing sections for this page to avoid duplicates
  await prisma.cMSSection.deleteMany({
    where: { pageId: homePage.id },
  })
  console.log('🗑️  Deleted existing sections')

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
          text: 'Novo: Template com sistema de créditos',
          link: '#link',
        },
        title: 'Crie seu microsaas com I.A. em um dia',
        description:
          'Autenticação (Clerk), PostgreSQL + Prisma, pagamentos (Stripe) e sistema de créditos — com UI em Tailwind + Radix. Lance mais rápido com TypeScript do frontend ao backend.',
        ctas: [
          {
            text: 'Criar conta',
            href: '/sign-up',
            variant: 'default',
          },
          {
            text: 'Ver preços',
            href: '#pricing',
            variant: 'ghost',
          },
        ],
        demoImage: {
          light: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=2700&auto=format&fit=crop',
          dark: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?q=80&w=2700&auto=format&fit=crop',
          alt: 'tela do app',
        },
        showLogos: true,
        logos: [
          { src: 'https://html.tailus.io/blocks/customers/nvidia.svg', alt: 'Nvidia Logo', width: 80, height: 20 },
          { src: 'https://html.tailus.io/blocks/customers/column.svg', alt: 'Column Logo', width: 80, height: 16 },
          { src: 'https://html.tailus.io/blocks/customers/github.svg', alt: 'GitHub Logo', width: 80, height: 16 },
          { src: 'https://html.tailus.io/blocks/customers/nike.svg', alt: 'Nike Logo', width: 80, height: 20 },
          { src: 'https://html.tailus.io/blocks/customers/lemonsqueezy.svg', alt: 'Lemon Squeezy Logo', width: 80, height: 20 },
          { src: 'https://html.tailus.io/blocks/customers/laravel.svg', alt: 'Laravel Logo', width: 80, height: 16 },
          { src: 'https://html.tailus.io/blocks/customers/lilly.svg', alt: 'Lilly Logo', width: 80, height: 28 },
          { src: 'https://html.tailus.io/blocks/customers/openai.svg', alt: 'OpenAI Logo', width: 80, height: 24 },
        ],
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
        items: [
          {
            id: '1',
            icon: 'Sparkles',
            iconColor: 'text-sky-500',
            title: 'Sistema de Créditos',
            description: 'Custos por feature tipados, validação e dedução transacional com logs de uso.',
            gridArea: 'md:[grid-area:1/1/2/2]',
          },
          {
            id: '2',
            icon: 'Lock',
            iconColor: 'text-emerald-500',
            title: 'Autenticação Clerk',
            description: 'Login, inscrição e sessões com rotas públicas/protegidas e middleware.',
            gridArea: 'md:[grid-area:1/2/2/3]',
          },
          {
            id: '3',
            icon: 'Settings',
            iconColor: 'text-purple-500',
            title: 'PostgreSQL + Prisma',
            description: 'Esquema, migrações e helpers tipados para operações seguras.',
            gridArea: 'md:[grid-area:1/3/2/4]',
          },
          {
            id: '4',
            icon: 'CreditCard',
            iconColor: 'text-blue-500',
            title: 'Billing (Stripe)',
            description: 'Assinaturas e packs de créditos com webhooks integrados.',
            gridArea: 'md:[grid-area:2/1/3/2]',
          },
          {
            id: '5',
            icon: 'ShieldCheck',
            iconColor: 'text-orange-500',
            title: 'Painel Admin',
            description: 'Gerencie usuários, créditos e visualize análises detalhadas.',
            gridArea: 'md:[grid-area:2/2/3/3]',
          },
          {
            id: '6',
            icon: 'Bot',
            iconColor: 'text-red-500',
            title: 'Integração Vercel AI',
            description: 'Chat com streaming em tempo real usando Vercel AI SDK.',
            gridArea: 'md:[grid-area:2/3/3/4]',
          },
          {
            id: '7',
            icon: 'Router',
            iconColor: 'text-green-500',
            title: 'Suporte Open Router',
            description: 'Conecte-se a qualquer modelo de linguagem grande com Open Router.',
            gridArea: 'md:[grid-area:3/1/4/2]',
          },
          {
            id: '8',
            icon: 'Upload',
            iconColor: 'text-violet-500',
            title: 'Upload de Arquivos',
            description: 'Sistema de upload e gerenciamento de arquivos com armazenamento seguro.',
            gridArea: 'md:[grid-area:3/2/4/3]',
          },
          {
            id: '9',
            icon: 'Image',
            iconColor: 'text-indigo-500',
            title: 'Geração de Imagens',
            description: 'Gere imagens com os modelos mais recentes de IA.',
            gridArea: 'md:[grid-area:3/3/4/4]',
          },
          {
            id: '10',
            icon: 'DollarSign',
            iconColor: 'text-teal-500',
            title: 'Custos Configuráveis',
            description: 'Configure custos por feature e créditos por plano via admin.',
            gridArea: 'md:[grid-area:4/1/5/2]',
          },
          {
            id: '11',
            icon: 'MessageCircle',
            iconColor: 'text-yellow-500',
            title: 'Chat com qualquer LLM',
            description: 'Interface de chat completa com histórico e contexto persistente.',
            gridArea: 'md:[grid-area:4/2/5/3]',
          },
          {
            id: '12',
            icon: 'Search',
            iconColor: 'text-amber-500',
            title: 'UI + App Router',
            description: 'Tailwind v4 + Radix UI com componentes prontos para produção.',
            gridArea: 'md:[grid-area:4/3/5/4]',
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
        badge: {
          text: 'Starter para agentes & IDEs',
          icon: 'Rocket',
        },
        title: 'Funciona com qualquer IA, sem lock‑in',
        subtitle: 'Use este template como ponto de partida em Replit, Cursor, Claude Code, Codex, Gemini, Bolt e mais.',
        tools: [
          'Replit Agents',
          'Cursor AI',
          'Claude Code',
          'OpenAI Codex',
          'Google Gemini',
          'Bolt.new',
        ],
        cards: [
          {
            id: '1',
            icon: 'Sparkles',
            iconColor: 'text-sky-500',
            title: 'Base pronta para produção',
            description: 'Auth (Clerk), DB (Prisma), billing (Stripe) e créditos.',
          },
          {
            id: '2',
            icon: 'Bot',
            iconColor: 'text-emerald-500',
            title: 'Ideal para agentes',
            description: 'Validação com Zod, APIs e handlers tipados, estrutura clara.',
          },
          {
            id: '3',
            icon: 'Zap',
            iconColor: 'text-amber-500',
            title: 'Sem lock‑in',
            description: 'Troque provedores quando quiser.',
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
        title: 'Perguntas frequentes',
        subtitle: 'Respostas para perguntas comuns sobre o template.',
        faqs: [
          {
            question: 'O que está incluído?',
            answer:
              'Autenticação Clerk, Prisma, validação Zod, sistema de créditos e uma base de UI limpa com Tailwind.',
          },
          {
            question: 'Posso usar minha própria autenticação ou cobrança?',
            answer:
              'Sim. O template é modular - troque por seus provedores preferidos conforme necessário.',
          },
          {
            question: 'Existe um esquema de banco de dados?',
            answer:
              'Sim, o esquema e os scripts do Prisma estão incluídos. Execute as migrações com os scripts npm fornecidos.',
          },
          {
            question: 'Como funcionam os créditos?',
            answer:
              'Defina os custos dos recursos em uma única configuração e use auxiliares para validar e deduzir por solicitação.',
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
      location: 'HEADER',
      isActive: true,
    },
  })

  // Delete existing menu items to avoid duplicates
  await prisma.cMSMenuItem.deleteMany({
    where: { menuId: mainMenu.id },
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
