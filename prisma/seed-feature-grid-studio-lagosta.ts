import { PrismaClient } from './generated/client'

const prisma = new PrismaClient()

async function seedFeatureGridStudioLagosta() {
  console.log('🌱 Seeding Feature Grid Items - Studio Lagosta...')

  const adminUserId = 'system'

  // 20 recursos implementados no Studio Lagosta
  const features = [
    // LINHA 1 - Destaques principais
    {
      icon: 'Layout',
      iconColor: 'text-purple-500',
      title: 'Editor Visual Profissional',
      description: 'Editor Konva.js completo similar ao Canva, com layers, ferramentas de design e exportação em alta qualidade para redes sociais.',
      gridArea: 'md:[grid-area:1/1/2/2]',
      order: 0,
    },
    {
      icon: 'Camera',
      iconColor: 'text-pink-500',
      title: 'Produção de Fotos e Vídeos',
      description: 'Crie designs profissionais para redes sociais com templates prontos para Stories, Feed, Reels e Posts com qualidade 4K.',
      gridArea: 'md:[grid-area:1/2/2/3]',
      order: 1,
    },
    {
      icon: 'Sparkles',
      iconColor: 'text-sky-500',
      title: 'IA para Geração de Imagens',
      description: 'Gemini 2.5 Flash integrado para criar imagens únicas com IA usando prompts de texto e imagens de referência.',
      gridArea: 'md:[grid-area:1/3/3/4]', // 2 linhas de altura
      order: 2,
    },

    // LINHA 2
    {
      icon: 'FileStack',
      iconColor: 'text-orange-500',
      title: 'Biblioteca de Templates',
      description: 'Centenas de templates prontos para Story, Feed e Square com campos dinâmicos para personalização rápida.',
      gridArea: 'md:[grid-area:2/1/3/2]',
      order: 3,
    },
    {
      icon: 'Copy',
      iconColor: 'text-green-500',
      title: 'Editor Multi-Páginas',
      description: 'Crie carrosséis e múltiplas páginas no mesmo projeto com navegação entre páginas e preview em tempo real.',
      gridArea: 'md:[grid-area:2/2/3/3]',
      order: 4,
    },

    // LINHA 3 - Inteligência Artificial
    {
      icon: 'Bot',
      iconColor: 'text-blue-500',
      title: 'Agentes de IA Inteligentes',
      description: 'Sistema completo de agentes de IA para atendimento automático, suporte 24/7 e respostas personalizadas aos clientes.',
      gridArea: 'md:[grid-area:3/1/4/2]',
      order: 5,
    },
    {
      icon: 'MessageSquare',
      iconColor: 'text-purple-500',
      title: 'Chat com IA Integrado',
      description: 'Converse com IA para gerar textos, tirar dúvidas e obter sugestões criativas para seus projetos.',
      gridArea: 'md:[grid-area:3/2/4/3]',
      order: 6,
    },
    {
      icon: 'Brain',
      iconColor: 'text-pink-500',
      title: 'Base de Conhecimento IA',
      description: 'Sistema de vetorização de conteúdo para treinar agentes de IA com conhecimento específico do seu negócio.',
      gridArea: 'md:[grid-area:3/3/4/4]',
      order: 7,
    },

    // LINHA 4 - Recursos Visuais
    {
      icon: 'Type',
      iconColor: 'text-indigo-500',
      title: 'Fontes Personalizadas',
      description: 'Faça upload e use fontes personalizadas da sua marca em todos os seus designs com suporte a Google Fonts.',
      gridArea: 'md:[grid-area:4/1/5/2]',
      order: 8,
    },
    {
      icon: 'Palette',
      iconColor: 'text-rose-500',
      title: 'Cores da Marca',
      description: 'Gerencie as cores oficiais da sua marca e aplique em todos os designs com um clique.',
      gridArea: 'md:[grid-area:4/2/5/3]',
      order: 9,
    },
    {
      icon: 'Package',
      iconColor: 'text-teal-500',
      title: 'Elementos e Ícones',
      description: 'Biblioteca completa de elementos visuais, ícones e formas geométricas para enriquecer seus designs.',
      gridArea: 'md:[grid-area:4/3/5/4]',
      order: 10,
    },

    // LINHA 5 - Sistema
    {
      icon: 'Award',
      iconColor: 'text-amber-500',
      title: 'Gestão de Logos',
      description: 'Armazene e organize todos os logos da sua marca com aplicação rápida nos designs.',
      gridArea: 'md:[grid-area:5/1/6/2]',
      order: 11,
    },
    {
      icon: 'Shield',
      iconColor: 'text-red-500',
      title: 'Autenticação Empresarial',
      description: 'Sistema completo de autenticação com sign-in, sign-up, gestão de usuários e sessões seguras.',
      gridArea: 'md:[grid-area:5/2/6/3]',
      order: 12,
    },
    {
      icon: 'CreditCard',
      iconColor: 'text-green-500',
      title: 'Sistema de Créditos',
      description: 'Sistema completo de créditos com histórico, reembolsos automáticos e integração com planos de assinatura.',
      gridArea: 'md:[grid-area:5/3/6/4]',
      order: 13,
    },

    // LINHA 6 - Gestão
    {
      icon: 'Database',
      iconColor: 'text-blue-500',
      title: 'PostgreSQL + Prisma',
      description: 'Banco de dados PostgreSQL gerenciado com Prisma ORM, migrações automáticas e tipos TypeScript.',
      gridArea: 'md:[grid-area:6/1/7/2]',
      order: 14,
    },
    {
      icon: 'Settings',
      iconColor: 'text-purple-500',
      title: 'Painel Admin Completo',
      description: 'Dashboard administrativo com gestão de usuários, créditos, conteúdo, analytics e configurações do sistema.',
      gridArea: 'md:[grid-area:6/2/7/3]',
      order: 15,
    },
    {
      icon: 'FileText',
      iconColor: 'text-orange-500',
      title: 'CMS Integrado',
      description: 'Gerencie páginas, menus, componentes e mídias do site sem tocar em código através do painel admin.',
      gridArea: 'md:[grid-area:6/3/7/4]',
      order: 16,
    },

    // LINHA 7 - Integrações
    {
      icon: 'Activity',
      iconColor: 'text-sky-500',
      title: 'Analytics Avançado',
      description: 'Dashboard com métricas de MRR, ARR, Churn, histórico de uso e relatórios detalhados de performance.',
      gridArea: 'md:[grid-area:7/1/8/2]',
      order: 17,
    },
    {
      icon: 'Cloud',
      iconColor: 'text-yellow-500',
      title: 'Google Drive Integration',
      description: 'Integração completa com Google Drive para backup automático, organização de arquivos e compartilhamento.',
      gridArea: 'md:[grid-area:7/2/8/3]',
      order: 18,
    },
    {
      icon: 'Download',
      iconColor: 'text-green-500',
      title: 'Exportação Profissional',
      description: 'Exporte seus designs em PNG, JPG e formatos otimizados para cada rede social com qualidade profissional.',
      gridArea: 'md:[grid-area:7/3/8/4]',
      order: 19,
    },
  ]

  console.log(`📦 Adicionando ${features.length} recursos...`)

  // Deletar recursos antigos de seed
  await prisma.featureGridItem.deleteMany({
    where: {
      id: {
        startsWith: 'seed-',
      },
    },
  })

  console.log('🗑️  Recursos antigos removidos')

  // Adicionar novos recursos
  for (const feature of features) {
    await prisma.featureGridItem.create({
      data: {
        id: `seed-${feature.order}`,
        ...feature,
        createdBy: adminUserId,
      },
    })
  }

  console.log('✅ Feature Grid Items seeded successfully!')
  console.log(`📊 Total de recursos: ${features.length}`)
  console.log('🎨 Layout: Grid 3 colunas x 7 linhas')
  console.log('🌟 Destaque: IA para Geração de Imagens (2 linhas de altura)')
}

seedFeatureGridStudioLagosta()
  .catch((e) => {
    console.error('❌ Error seeding feature grid:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
