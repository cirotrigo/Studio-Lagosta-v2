/**
 * Check for Duplicate Posts
 * Identifies posts with same caption and schedule time
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient } from '../prisma/generated/client'

const db = new PrismaClient()

async function checkDuplicatePosts() {
  try {
    console.log('\n' + '='.repeat(80))
    console.log('🔍 VERIFICANDO POSTS DUPLICADOS')
    console.log('='.repeat(80) + '\n')

    // Get recent posts from last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const recentPosts = await db.socialPost.findMany({
      where: {
        createdAt: { gte: yesterday }
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        caption: true,
        status: true,
        createdAt: true,
        scheduledDatetime: true,
        laterPostId: true,
        publishedUrl: true,
        Project: {
          select: {
            name: true,
          }
        }
      }
    })

    console.log(`📊 Total de posts nas últimas 24h: ${recentPosts.length}\n`)

    // Group by project and caption
    const groupedPosts = new Map<string, typeof recentPosts>()

    recentPosts.forEach(post => {
      const key = `${post.Project.name}:${post.caption?.substring(0, 50)}`
      const existing = groupedPosts.get(key) || []
      existing.push(post)
      groupedPosts.set(key, existing)
    })

    // Find duplicates
    let duplicateCount = 0

    groupedPosts.forEach((posts, key) => {
      if (posts.length > 1) {
        duplicateCount++
        console.log(`\n❌ DUPLICATA ${duplicateCount}:`)
        console.log(`   Projeto: ${posts[0].Project.name}`)
        console.log(`   Caption: "${posts[0].caption?.substring(0, 60)}..."`)
        console.log(`   Total de cópias: ${posts.length}\n`)

        posts.forEach((post, i) => {
          console.log(`   ${i + 1}. Post ID: ${post.id}`)
          console.log(`      Status: ${post.status}`)
          console.log(`      Criado: ${post.createdAt.toLocaleString('pt-BR')}`)
          console.log(`      Agendado: ${post.scheduledDatetime?.toLocaleString('pt-BR') || 'N/A'}`)
          console.log(`      Later Post ID: ${post.laterPostId || 'N/A'}`)
          console.log(`      URL: ${post.publishedUrl || 'N/A'}`)
          console.log()
        })

        console.log('   ' + '-'.repeat(76))
      }
    })

    if (duplicateCount === 0) {
      console.log('✅ Nenhum post duplicado encontrado!\n')
    } else {
      console.log(`\n⚠️  Total de grupos duplicados: ${duplicateCount}`)

      // Count total duplicate posts
      let totalDuplicates = 0
      groupedPosts.forEach((posts) => {
        if (posts.length > 1) {
          totalDuplicates += (posts.length - 1) // Subtract 1 to count only extras
        }
      })
      console.log(`⚠️  Total de posts extras (duplicados): ${totalDuplicates}\n`)
    }

    console.log('='.repeat(80) + '\n')

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

checkDuplicatePosts()
