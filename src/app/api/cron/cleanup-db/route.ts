import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    // Verify cron authentication (Vercel Cron secret)
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🧹 Starting automated weekly database cleanup...')

    let totalDeleted = 0
    const results = {
      generations: 0,
      storageObjects: 0,
      usageHistory: 0,
      videoJobs: 0,
      postLogs: 0,
      postRetries: 0,
      subscriptionEvents: 0,
    }

    // 1. Delete old Generations (>30 days)
    const oldGenerations = await db.generation.deleteMany({
      where: {
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }
    })
    results.generations = oldGenerations.count
    totalDeleted += oldGenerations.count

    // 2. Clean deleted StorageObjects
    const deletedStorage = await db.storageObject.deleteMany({
      where: {
        deletedAt: {
          not: null
        }
      }
    })
    results.storageObjects = deletedStorage.count
    totalDeleted += deletedStorage.count

    // 3. Archive old UsageHistory (>90 days)
    const oldUsageHistory = await db.usageHistory.deleteMany({
      where: {
        timestamp: {
          lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        }
      }
    })
    results.usageHistory = oldUsageHistory.count
    totalDeleted += oldUsageHistory.count

    // 4. Delete completed VideoProcessingJobs (>7 days)
    const completedVideoJobs = await db.videoProcessingJob.deleteMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    })
    results.videoJobs = completedVideoJobs.count
    totalDeleted += completedVideoJobs.count

    // 5. Delete failed VideoProcessingJobs (>7 days)
    const failedVideoJobs = await db.videoProcessingJob.deleteMany({
      where: {
        status: 'FAILED',
        createdAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    })
    results.videoJobs += failedVideoJobs.count
    totalDeleted += failedVideoJobs.count

    // 6. Delete verbose PostLogs (SCHEDULED, RETRIED, EDITED)
    const verbosePostLogs = await db.postLog.deleteMany({
      where: {
        event: {
          in: ['SCHEDULED', 'RETRIED', 'EDITED']
        }
      }
    })
    results.postLogs = verbosePostLogs.count
    totalDeleted += verbosePostLogs.count

    // 7. Delete old SENT PostLogs (>30 days, keep FAILED forever for debugging)
    const oldSentLogs = await db.postLog.deleteMany({
      where: {
        event: 'SENT',
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }
    })
    results.postLogs += oldSentLogs.count
    totalDeleted += oldSentLogs.count

    // 8. Delete old PostRetries (>7 days or completed/failed)
    const oldPostRetries = await db.postRetry.deleteMany({
      where: {
        OR: [
          { status: 'SUCCESS' },
          { status: 'FAILED' },
          {
            createdAt: {
              lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        ]
      }
    })
    results.postRetries = oldPostRetries.count
    totalDeleted += oldPostRetries.count

    // 9. Delete old SubscriptionEvents (>180 days)
    const oldSubscriptionEvents = await db.subscriptionEvent.deleteMany({
      where: {
        occurredAt: {
          lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
        }
      }
    })
    results.subscriptionEvents = oldSubscriptionEvents.count
    totalDeleted += oldSubscriptionEvents.count

    console.log('✅ Weekly cleanup completed!')
    console.log(`   Total deleted: ${totalDeleted} records`)
    console.log('   Details:', results)

    return NextResponse.json({
      success: true,
      totalDeleted,
      details: results,
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    console.error('❌ Cron cleanup error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    await db.$disconnect()
  }
}
