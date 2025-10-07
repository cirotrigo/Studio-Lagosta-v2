import { PrismaClient } from './generated/client'

const prisma = new PrismaClient()

/**
 * Seed script para popular componentes base do CMS
 * Baseado nos componentes de marketing antigos: Hero, BentoGrid, FAQ, AIStarter, Pricing
 */
async function main() {
  console.log('🌱 Seeding CMS Components...')

  // 1. HERO Component
  console.log('📦 Creating Hero component...')
  await prisma.cMSComponent.upsert({
    where: { slug: 'hero-padrao' },
    update: {},
    create: {
      name: 'Hero - Padrão',
      slug: 'hero-padrao',
      type: 'HERO',
      description: 'Hero section com badge, título, subtítulo, CTAs e imagem de demonstração',
      isGlobal: true,
      createdBy: 'system',
      content: {
        badge: {
          text: 'Novo: Template com sistema de créditos',
          link: '#link',
        },
        title: 'Crie seu microsaas com I.A. em um dia',
        subtitle:
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
        backgroundImage: {
          dark: 'https://images.unsplash.com/photo-1504805572947-34fad45aed93?q=80&w=1920',
          light: '',
        },
        demoImage: {
          dark: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?q=80&w=2700',
          light: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=2700',
          alt: 'tela do app',
        },
        showLogos: true,
        logos: [
          {
            src: 'https://html.tailus.io/blocks/customers/nvidia.svg',
            alt: 'Nvidia',
            width: 80,
            height: 20,
          },
          {
            src: 'https://html.tailus.io/blocks/customers/github.svg',
            alt: 'GitHub',
            width: 80,
            height: 16,
          },
          {
            src: 'https://html.tailus.io/blocks/customers/openai.svg',
            alt: 'OpenAI',
            width: 80,
            height: 24,
          },
        ],
      },
    },
  })

  // 2. BENTO_GRID Component
  console.log('📦 Creating Bento Grid component...')
  await prisma.cMSComponent.upsert({
    where: { slug: 'bento-grid-features' },
    update: {},
    create: {
      name: 'Bento Grid - Features',
      slug: 'bento-grid-features',
      type: 'BENTO_GRID',
      description: 'Grid de features com ícones e descrições em layout bento',
      isGlobal: true,
      createdBy: 'system',
      content: {
        title: 'Tudo que você precisa para começar',
        subtitle: 'Padrões amigáveis para produção, padrões extensíveis e uma interface de usuário limpa.',
        items: [
          {
            id: '1',
            title: 'Sistema de Créditos',
            description: 'Custos por feature tipados, validação e dedução transacional com logs de uso.',
            icon: 'Sparkles',
            iconColor: 'text-sky-500',
            gridArea: 'md:[grid-area:1/1/2/2]',
          },
          {
            id: '2',
            title: 'Autenticação Clerk',
            description: 'Login, inscrição e sessões com rotas públicas/protegidas e middleware.',
            icon: 'Lock',
            iconColor: 'text-emerald-500',
            gridArea: 'md:[grid-area:1/2/2/3]',
          },
          {
            id: '3',
            title: 'PostgreSQL + Prisma',
            description: 'Esquema, migrações e helpers tipados para operações seguras.',
            icon: 'Settings',
            iconColor: 'text-purple-500',
            gridArea: 'md:[grid-area:1/3/2/4]',
          },
          {
            id: '4',
            title: 'Billing (Stripe)',
            description: 'Assinaturas e packs de créditos com webhooks integrados.',
            icon: 'CreditCard',
            iconColor: 'text-blue-500',
            gridArea: 'md:[grid-area:2/1/3/2]',
          },
          {
            id: '5',
            title: 'Painel Admin',
            description: 'Gerencie usuários, créditos e visualize análises detalhadas.',
            icon: 'ShieldCheck',
            iconColor: 'text-orange-500',
            gridArea: 'md:[grid-area:2/2/3/3]',
          },
          {
            id: '6',
            title: 'Integração Vercel AI',
            description: 'Chat com streaming em tempo real usando Vercel AI SDK.',
            icon: 'Bot',
            iconColor: 'text-red-500',
            gridArea: 'md:[grid-area:2/3/3/4]',
          },
          {
            id: '7',
            title: 'Suporte Open Router',
            description: 'Conecte-se a qualquer modelo de linguagem grande com Open Router.',
            icon: 'Router',
            iconColor: 'text-green-500',
            gridArea: 'md:[grid-area:3/1/4/2]',
          },
          {
            id: '8',
            title: 'Upload de Arquivos',
            description: 'Sistema de upload e gerenciamento de arquivos com armazenamento seguro.',
            icon: 'Upload',
            iconColor: 'text-violet-500',
            gridArea: 'md:[grid-area:3/2/4/3]',
          },
          {
            id: '9',
            title: 'Geração de Imagens',
            description: 'Gere imagens com os modelos mais recentes de IA.',
            icon: 'Image',
            iconColor: 'text-indigo-500',
            gridArea: 'md:[grid-area:3/3/4/4]',
          },
          {
            id: '10',
            title: 'Custos Configuráveis',
            description: 'Configure custos por feature e créditos por plano via admin.',
            icon: 'DollarSign',
            iconColor: 'text-teal-500',
            gridArea: 'md:[grid-area:4/1/5/2]',
          },
          {
            id: '11',
            title: 'Chat com qualquer LLM',
            description: 'Interface de chat completa com histórico e contexto persistente.',
            icon: 'MessageCircle',
            iconColor: 'text-yellow-500',
            gridArea: 'md:[grid-area:4/2/5/3]',
          },
          {
            id: '12',
            title: 'UI + App Router',
            description: 'Tailwind v4 + Radix UI com componentes prontos para produção.',
            icon: 'Search',
            iconColor: 'text-amber-500',
            gridArea: 'md:[grid-area:4/3/5/4]',
          },
        ],
      },
    },
  })

  // 3. FAQ Component
  console.log('📦 Creating FAQ component...')
  await prisma.cMSComponent.upsert({
    where: { slug: 'faq-padrao' },
    update: {},
    create: {
      name: 'FAQ - Padrão',
      slug: 'faq-padrao',
      type: 'FAQ',
      description: 'Seção de perguntas frequentes com layout de cards',
      isGlobal: true,
      createdBy: 'system',
      content: {
        title: 'Perguntas frequentes',
        subtitle: 'Respostas para perguntas comuns sobre o template.',
        faqs: [
          {
            id: '1',
            question: 'O que está incluído?',
            answer:
              'Autenticação Clerk, Prisma, validação Zod, sistema de créditos e uma base de UI limpa com Tailwind.',
          },
          {
            id: '2',
            question: 'Posso usar minha própria autenticação ou cobrança?',
            answer: 'Sim. O template é modular - troque por seus provedores preferidos conforme necessário.',
          },
          {
            id: '3',
            question: 'Existe um esquema de banco de dados?',
            answer:
              'Sim, o esquema e os scripts do Prisma estão incluídos. Execute as migrações com os scripts npm fornecidos.',
          },
          {
            id: '4',
            question: 'Como funcionam os créditos?',
            answer:
              'Defina os custos dos recursos em uma única configuração e use auxiliares para validar e deduzir por solicitação.',
          },
        ],
      },
    },
  })

  // 4. AI_STARTER Component
  console.log('📦 Creating AI Starter component...')
  await prisma.cMSComponent.upsert({
    where: { slug: 'ai-starter-compatibilidade' },
    update: {},
    create: {
      name: 'AI Starter - Compatibilidade',
      slug: 'ai-starter-compatibilidade',
      type: 'AI_STARTER',
      description: 'Seção mostrando compatibilidade com ferramentas de IA',
      isGlobal: true,
      createdBy: 'system',
      content: {
        badge: {
          text: 'Starter para agentes & IDEs',
          icon: 'Rocket',
        },
        title: 'Funciona com qualquer IA, sem lock‑in',
        subtitle:
          'Use este template como ponto de partida em Replit, Cursor, Claude Code, Codex, Gemini, Bolt e mais.',
        cards: [
          {
            id: '1',
            title: 'Base pronta para produção',
            description: 'Auth (Clerk), DB (Prisma), billing (Stripe) e créditos.',
            icon: 'Sparkles',
            iconColor: 'text-sky-500',
          },
          {
            id: '2',
            title: 'Ideal para agentes',
            description: 'Validação com Zod, APIs e handlers tipados, estrutura clara.',
            icon: 'Bot',
            iconColor: 'text-emerald-500',
          },
          {
            id: '3',
            title: 'Sem lock‑in',
            description: 'Troque provedores quando quiser.',
            icon: 'Zap',
            iconColor: 'text-amber-500',
          },
        ],
        tools: ['Replit Agents', 'Cursor AI', 'Claude Code', 'OpenAI Codex', 'Google Gemini', 'Bolt.new'],
      },
    },
  })

  // 5. PRICING Component
  console.log('📦 Creating Pricing component...')
  await prisma.cMSComponent.upsert({
    where: { slug: 'pricing-planos' },
    update: {},
    create: {
      name: 'Pricing - Planos',
      slug: 'pricing-planos',
      type: 'PRICING',
      description: 'Seção de pricing com planos do banco de dados',
      isGlobal: true,
      createdBy: 'system',
      content: {
        title: 'Planos para acompanhar seu crescimento',
        subtitle: 'Escolha a cobrança mensal ou anual e desbloqueie recursos avançados conforme sua evolução.',
        showPlans: true,
      },
    },
  })

  console.log('✅ All CMS components seeded successfully!')
}

main()
  .catch((e) => {
    console.error('Error seeding CMS components:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
