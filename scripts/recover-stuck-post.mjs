/**
 * Recover a stuck post: read real state from Zernio and reconcile DB.
 * Usage:
 *   node scripts/recover-stuck-post.mjs <postId> [--publish]
 *
 *   --publish  re-publish immediately via delete+recreate (publishNow)
 *   (without flag, just reconcile status from Zernio)
 */
import { config } from 'dotenv'
config({ path: '/Users/cirotrigo/Documents/Studio-Lagosta-v2/.env' })
config({ path: '/Users/cirotrigo/Documents/Studio-Lagosta-v2/.env.local', override: true })

const postId = process.argv[2]
const shouldPublish = process.argv.includes('--publish')

if (!postId) {
  console.error('Usage: node scripts/recover-stuck-post.mjs <postId> [--publish]')
  process.exit(1)
}

const apiKey = process.env.ZERNIO_API_KEY || process.env.LATER_API_KEY
const baseUrl = process.env.ZERNIO_API_URL || 'https://zernio.com/api/v1'
if (!apiKey) {
  console.error('Missing ZERNIO_API_KEY / LATER_API_KEY in env')
  process.exit(1)
}

async function zernio(path, init = {}) {
  const resp = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await resp.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!resp.ok) {
    const err = new Error(`Zernio ${init.method || 'GET'} ${path} → ${resp.status}: ${text}`)
    err.status = resp.status
    err.body = body
    throw err
  }
  return body
}

const { PrismaClient } = await import('/Users/cirotrigo/Documents/Studio-Lagosta-v2/prisma/generated/client/index.js')
const prisma = new PrismaClient()

try {
  const post = await prisma.socialPost.findUnique({
    where: { id: postId },
    include: { Project: { select: { id: true, name: true, laterAccountId: true } } },
  })
  if (!post) { console.error('Post not found in DB'); process.exit(1) }
  console.log('--- Local post ---')
  console.log({
    id: post.id,
    project: post.Project?.name,
    status: post.status,
    lateStatus: post.lateStatus,
    laterPostId: post.laterPostId,
    scheduledDatetime: post.scheduledDatetime,
    processingStartedAt: post.processingStartedAt,
  })

  if (!post.laterPostId) {
    console.error('Post has no laterPostId — cannot reconcile with Zernio. Resetting to DRAFT.')
    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        status: 'DRAFT',
        processingStartedAt: null,
        errorMessage: 'Recovered: had no laterPostId',
      },
    })
    process.exit(0)
  }

  let zPost
  try {
    const resp = await zernio(`/posts/${post.laterPostId}`)
    zPost = resp.post || resp
  } catch (err) {
    if (err.status === 404) {
      console.log('Zernio post not found (404). Clearing laterPostId and marking FAILED for review.')
      await prisma.socialPost.update({
        where: { id: postId },
        data: {
          laterPostId: null,
          lateStatus: null,
          status: 'FAILED',
          errorMessage: 'Zernio post vanished (404) during recovery',
          failedAt: new Date(),
          processingStartedAt: null,
        },
      })
      process.exit(0)
    }
    throw err
  }

  console.log('--- Zernio state ---')
  console.log({
    id: zPost._id,
    status: zPost.status,
    scheduledFor: zPost.scheduledFor,
    updatedAt: zPost.updatedAt,
    platformStatus: zPost.platforms?.[0]?.status,
  })

  if (shouldPublish) {
    console.log('\n[PUBLISH] Re-publishing via delete + recreate with publishNow=true ...')

    const platforms = (zPost.platforms || []).map(p => ({
      platform: p.platform,
      accountId: typeof p.accountId === 'object' ? (p.accountId._id || p.accountId.id) : p.accountId,
      ...(p.platformSpecificData ? { platformSpecificData: p.platformSpecificData } : {}),
    }))
    const mediaItems = (zPost.mediaItems || zPost.media || []).map(m => ({ type: m.type, url: m.url }))
    const payload = {
      content: zPost.content || zPost.text || '',
      platforms,
      mediaItems,
      publishNow: true,
    }

    await zernio(`/posts/${post.laterPostId}`, { method: 'DELETE' })
    console.log('  DELETE ok')

    const created = await zernio('/posts', { method: 'POST', body: JSON.stringify(payload) })
    const newPost = created.post || created
    console.log('  CREATE ok:', { id: newPost._id, status: newPost.status })

    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        laterPostId: newPost._id,
        lateStatus: newPost.status,
        status:
          newPost.status === 'published' ? 'POSTED' :
          newPost.status === 'failed' ? 'FAILED' :
          'POSTING',
        sentAt: new Date(),
        lastSyncAt: new Date(),
        processingStartedAt: new Date(),
        errorMessage: null,
        failedAt: null,
      },
    })
    await prisma.postLog.create({
      data: {
        postId,
        event: 'SENT',
        message: 'Recovered via manual publishPost (delete+recreate)',
        metadata: { newLaterPostId: newPost._id, newStatus: newPost.status, prevLaterPostId: post.laterPostId },
      },
    })
    console.log('DB updated. Post re-published.')
  } else {
    const statusMap = { draft: 'DRAFT', scheduled: 'SCHEDULED', publishing: 'POSTING', published: 'POSTED', failed: 'FAILED' }
    const mappedStatus = statusMap[zPost.status] || 'SCHEDULED'
    console.log(`\n[RECONCILE] Zernio status=${zPost.status} → local status=${mappedStatus}`)
    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        status: mappedStatus,
        lateStatus: zPost.status,
        scheduledDatetime: zPost.scheduledFor ? new Date(zPost.scheduledFor) : post.scheduledDatetime,
        lastSyncAt: new Date(),
        processingStartedAt: mappedStatus === 'POSTING' ? (post.processingStartedAt || new Date()) : null,
        ...(mappedStatus !== 'POSTING' && mappedStatus !== 'FAILED' ? { errorMessage: null, failedAt: null } : {}),
        ...(mappedStatus === 'POSTED' ? { sentAt: post.sentAt || new Date(), latePublishedAt: zPost.publishedAt ? new Date(zPost.publishedAt) : new Date() } : {}),
      },
    })
    await prisma.postLog.create({
      data: {
        postId,
        event: 'EDITED',
        message: `Recovered (reconciled from Zernio): ${post.status} → ${mappedStatus}`,
        metadata: { zernioStatus: zPost.status, zernioScheduledFor: zPost.scheduledFor },
      },
    })
    console.log('DB reconciled with Zernio.')
  }
} finally {
  await prisma.$disconnect()
}
