/**
 * Diagnose Carousel Failures
 *
 * Lists FAILED CAROUSEL posts in the last 7 days, with errorMessage,
 * timing deltas (to spot timeouts), media URLs, and last PostLog entries.
 *
 * Usage:
 *   npx tsx scripts/diagnose-carousel-failures.ts                # all projects
 *   npx tsx scripts/diagnose-carousel-failures.ts "Seu Quinto"   # filter by project name
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env') })

import { PrismaClient, PostType, PostStatus } from '../prisma/generated/client'

const db = new PrismaClient()

const SEP = '='.repeat(80)
const SEP_LIGHT = '-'.repeat(80)

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str
}

function deltaSeconds(later: Date | null, earlier: Date | null): string {
  if (!later || !earlier) return 'N/A'
  return ((later.getTime() - earlier.getTime()) / 1000).toFixed(1) + 's'
}

async function diagnoseCarouselFailures() {
  const projectFilter = process.argv[2] // optional CLI arg

  try {
    console.log('\n' + SEP)
    console.log('🔍 CAROUSEL FAILURE DIAGNOSTIC')
    if (projectFilter) console.log(`📌 Filter: project name contains "${projectFilter}"`)
    console.log(SEP + '\n')

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const where: any = {
      postType: PostType.CAROUSEL,
      status: PostStatus.FAILED,
      createdAt: { gte: sevenDaysAgo },
    }

    if (projectFilter) {
      where.Project = {
        name: { contains: projectFilter, mode: 'insensitive' },
      }
    }

    const posts = await db.socialPost.findMany({
      where,
      select: {
        id: true,
        status: true,
        postType: true,
        mediaUrls: true,
        blobPathnames: true,
        errorMessage: true,
        failedAt: true,
        createdAt: true,
        processingStartedAt: true,
        laterPostId: true,
        lateStatus: true,
        scheduleType: true,
        scheduledDatetime: true,
        Project: {
          select: {
            id: true,
            name: true,
            laterAccountId: true,
            postingProvider: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    console.log(`📊 Found ${posts.length} FAILED carousel post(s) in the last 7 days\n`)

    if (posts.length === 0) {
      console.log('✅ No failed carousels found.\n')
      return
    }

    // Per-post detail
    for (const [i, post] of posts.entries()) {
      console.log(SEP)
      console.log(`[${i + 1}/${posts.length}] Post ${post.id}`)
      console.log(SEP)
      console.log(`🏢 Project       : ${post.Project.name} (id ${post.Project.id})`)
      console.log(`📤 Provider      : ${post.Project.postingProvider || 'N/A'}`)
      console.log(`🔑 Later acct id : ${post.Project.laterAccountId || 'NOT SET'}`)
      console.log(`📅 Created       : ${post.createdAt.toLocaleString('pt-BR')}`)
      console.log(
        `⚙️  Processing st : ${post.processingStartedAt?.toLocaleString('pt-BR') || 'N/A'}`
      )
      console.log(`❌ Failed at     : ${post.failedAt?.toLocaleString('pt-BR') || 'N/A'}`)
      console.log(
        `⏱  Δ created→failed   : ${deltaSeconds(post.failedAt, post.createdAt)}`
      )
      console.log(
        `⏱  Δ processing→failed: ${deltaSeconds(post.failedAt, post.processingStartedAt)}`
      )
      console.log(`📋 Schedule type : ${post.scheduleType}`)
      console.log(
        `🗓  Scheduled for : ${post.scheduledDatetime?.toLocaleString('pt-BR') || 'N/A'}`
      )
      console.log(`🆔 Later post id : ${post.laterPostId || 'NOT CREATED'}`)
      console.log(`📡 Late status   : ${post.lateStatus || 'N/A'}`)
      console.log(`🖼  Media count   : ${post.mediaUrls.length}`)
      const previewCount = Math.min(2, post.mediaUrls.length)
      for (let j = 0; j < previewCount; j++) {
        console.log(`   [${j + 1}] ${truncate(post.mediaUrls[j], 60)}`)
      }
      if (post.mediaUrls.length > previewCount) {
        console.log(`   ... and ${post.mediaUrls.length - previewCount} more`)
      }

      if (post.errorMessage) {
        console.log(`\n❌ ERROR MESSAGE:`)
        console.log(SEP_LIGHT)
        console.log(post.errorMessage)
        console.log(SEP_LIGHT)
      } else {
        console.log(`\n⚠️  No errorMessage stored on the post`)
      }

      const logs = await db.postLog.findMany({
        where: { postId: post.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })

      if (logs.length > 0) {
        console.log(`\n📜 Last ${logs.length} PostLog entries:`)
        logs.forEach((log, k) => {
          console.log(
            `\n  ${k + 1}. [${log.event}] ${log.createdAt.toLocaleString('pt-BR')}`
          )
          console.log(`     ${log.message}`)
          if (log.metadata) {
            const md = JSON.stringify(log.metadata, null, 2)
              .split('\n')
              .map((l) => '     ' + l)
              .join('\n')
            console.log(`     Metadata:\n${md}`)
          }
        })
      } else {
        console.log(`\n⚠️  No PostLog entries for this post`)
      }

      console.log('')
    }

    // Aggregation by errorMessage prefix
    console.log(SEP)
    console.log('📊 AGGREGATION — failures grouped by errorMessage (first 80 chars)')
    console.log(SEP)
    const buckets = new Map<string, number>()
    for (const post of posts) {
      const key = post.errorMessage
        ? truncate(post.errorMessage, 80)
        : '<no errorMessage>'
      buckets.set(key, (buckets.get(key) || 0) + 1)
    }
    const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1])
    for (const [key, count] of sorted) {
      console.log(`\n  ${count}× ${key}`)
    }

    console.log('\n' + SEP + '\n')
  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

diagnoseCarouselFailures()
