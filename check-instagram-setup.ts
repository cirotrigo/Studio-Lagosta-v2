import { db } from './src/lib/db'

async function checkInstagramSetup() {
  console.log('🔍 Verificando setup de Instagram...\n')

  try {
    // 1. Verificar projeto 5
    console.log('1️⃣ Verificando Projeto #5:')
    const project = await db.project.findUnique({
      where: { id: 5 },
      select: {
        id: true,
        name: true,
        instagramUsername: true,
        instagramAccountId: true,
        status: true,
      },
    })

    if (project) {
      console.log(`   ✅ Projeto encontrado: ${project.name}`)
      console.log(`   - instagramUsername: ${project.instagramUsername || '❌ NÃO CONFIGURADO'}`)
      console.log(`   - instagramAccountId: ${project.instagramAccountId || '❌ NÃO CONFIGURADO'}`)
      console.log(`   - status: ${project.status}\n`)
    } else {
      console.log('   ❌ Projeto não encontrado\n')
    }

    // 2. Verificar posts com laterPostId
    console.log('2️⃣ Verificando Posts com Later ID:')
    const postsStats = await db.socialPost.aggregate({
      where: {
        laterPostId: {
          not: null,
        },
      },
      _count: true,
    })

    const postedCount = await db.socialPost.count({
      where: {
        laterPostId: { not: null },
        status: 'POSTED',
      },
    })

    const withAnalyticsCount = await db.socialPost.count({
      where: {
        laterPostId: { not: null },
        analyticsLikes: { not: null },
      },
    })

    console.log(`   - Total com Later ID: ${postsStats._count}`)
    console.log(`   - Com status POSTED: ${postedCount}`)
    console.log(`   - Com analytics preenchido: ${withAnalyticsCount}\n`)

    // 3. Ver alguns posts recentes
    console.log('3️⃣ Últimos 5 Posts (Later):')
    const recentPosts = await db.socialPost.findMany({
      where: { laterPostId: { not: null } },
      select: {
        id: true,
        laterPostId: true,
        postType: true,
        status: true,
        sentAt: true,
        analyticsLikes: true,
        analyticsReach: true,
      },
      orderBy: { sentAt: 'desc' },
      take: 5,
    })

    if (recentPosts.length > 0) {
      recentPosts.forEach((post, i) => {
        console.log(`   ${i + 1}. Post #${post.id} (${post.postType})`)
        console.log(`      Later ID: ${post.laterPostId}`)
        console.log(`      Status: ${post.status}`)
        console.log(`      Publicado: ${post.sentAt ? new Date(post.sentAt).toLocaleDateString('pt-BR') : 'Não'}`)
        console.log(`      Analytics: ${post.analyticsLikes !== null ? `${post.analyticsLikes} likes, ${post.analyticsReach} reach` : '❌ Sem dados'}`)
      })
    } else {
      console.log('   ❌ Nenhum post com Later ID encontrado')
    }
    console.log()

    // 4. Verificar dados em InstagramStory/Feed
    console.log('4️⃣ Verificando modelos Instagram (Boost.space):')
    const storyCount = await db.instagramStory.count()
    const feedCount = await db.instagramFeed.count()
    console.log(`   - Total de Stories: ${storyCount}`)
    console.log(`   - Total de Feeds: ${feedCount}`)
    console.log(`   ${storyCount === 0 && feedCount === 0 ? '⚠️  Nenhum dado (esperado, usando Later)' : '✅ Dados presentes'}\n`)

    // 5. Análise final
    console.log('📊 DIAGNÓSTICO:')
    console.log('=' .repeat(60))

    const issues: string[] = []
    const recommendations: string[] = []

    if (!project?.instagramUsername) {
      issues.push('❌ instagramUsername não configurado no projeto')
      recommendations.push('Preencher instagramUsername no projeto')
    }

    if (postsStats._count === 0) {
      issues.push('❌ Nenhum post publicado via Later ainda')
      recommendations.push('Publicar posts pelo Later para gerar dados')
    } else if (withAnalyticsCount === 0) {
      issues.push('⚠️ Posts existem mas analytics não foram fetchados')
      recommendations.push('Aguardar próxima execução do cron (a cada 6h) ou testar manualmente')
    }

    if (storyCount === 0 && feedCount === 0) {
      recommendations.push('✅ Usando dados de SocialPost (Later) - correto para sua setup')
    }

    if (issues.length === 0) {
      console.log('✅ TUDO CONFIGURADO CORRETAMENTE!')
      console.log('   - Projeto vinculado ao Later')
      console.log('   - Posts sendo publicados')
      console.log('   - Analytics sendo coletados')
      console.log('   - Dados estão prontos para exibição')
    } else {
      console.log('Problemas encontrados:')
      issues.forEach(issue => console.log(`  ${issue}`))
    }

    console.log('\nRecomendações:')
    recommendations.forEach(rec => console.log(`  ${rec}`))

    console.log('\n' + '='.repeat(60))
    console.log('\n🎯 MELHOR OPÇÃO DE IMPLEMENTAÇÃO:')
    console.log('   Modificar aba Instagram para ler dados de SocialPost')
    console.log('   (ao invés de InstagramStory/InstagramFeed que não têm dados)')

  } catch (error) {
    console.error('❌ Erro ao verificar:', error)
  } finally {
    await db.$disconnect()
  }
}

checkInstagramSetup()
