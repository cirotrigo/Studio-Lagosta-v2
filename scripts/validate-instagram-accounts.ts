import dotenv from 'dotenv'
import { db } from '../src/lib/db'

dotenv.config({ path: '.env.local' })

const GRAPH_BASE = 'https://graph.facebook.com/v18.0'

type ProjectRow = {
  id: number
  name: string
  instagramAccountId: string | null
  instagramUserId: string | null
}

type CheckResult =
  | { status: 'VALID_STORIES_ENDPOINT'; accountId: string }
  | { status: 'UNSUPPORTED_REQUEST'; accountId: string; message: string }
  | { status: 'TOKEN_ERROR'; accountId: string; message: string }
  | { status: 'PERMISSION_ERROR'; accountId: string; message: string }
  | { status: 'OTHER_ERROR'; accountId: string; message: string }

function sanitize(message: string) {
  return message.replace(/access_token=[^&\s]+/gi, 'access_token=[REDACTED]')
}

async function checkAccount(accountId: string): Promise<CheckResult> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!token) {
    throw new Error('INSTAGRAM_ACCESS_TOKEN missing')
  }

  const url = new URL(`${GRAPH_BASE}/${accountId}/stories`)
  url.searchParams.set('fields', 'id')
  url.searchParams.set('access_token', token)

  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const raw = await res.text()
  let body: any
  try {
    body = raw ? JSON.parse(raw) : {}
  } catch {
    return { status: 'OTHER_ERROR', accountId, message: 'Invalid JSON response' }
  }

  if (res.ok) {
    return { status: 'VALID_STORIES_ENDPOINT', accountId }
  }

  const apiError = body?.error
  const message = sanitize(apiError?.message || raw || 'Unknown error')
  const code = apiError?.code

  if (code === 190) {
    return { status: 'TOKEN_ERROR', accountId, message }
  }
  if (code === 10 || code === 200 || code === 803) {
    return { status: 'PERMISSION_ERROR', accountId, message }
  }
  if (apiError?.type === 'GraphMethodException') {
    return { status: 'UNSUPPORTED_REQUEST', accountId, message }
  }
  return { status: 'OTHER_ERROR', accountId, message }
}

async function main() {
  const projects = await db.project.findMany({
    select: { id: true, name: true, instagramAccountId: true, instagramUserId: true },
    orderBy: { id: 'asc' },
  })

  const summary = {
    total: projects.length,
    updated: 0,
    valid: 0,
    unsupported: 0,
    permission: 0,
    tokenErrors: 0,
    otherErrors: 0,
    missingBoth: 0,
  }

  for (const project of projects) {
    if (!project.instagramAccountId && !project.instagramUserId) {
      summary.missingBoth++
      console.log(`[MISSING] Project ${project.id} (${project.name}) has no instagramAccountId/instagramUserId`)
      continue
    }

    // Already has instagramUserId; skip
    if (project.instagramUserId) {
      continue
    }

    const accountId = project.instagramAccountId
    if (!accountId) {
      summary.missingBoth++
      console.log(`[MISSING] Project ${project.id} (${project.name}) has no instagramAccountId/instagramUserId`)
      continue
    }

    const result = await checkAccount(accountId)

    switch (result.status) {
      case 'VALID_STORIES_ENDPOINT': {
        summary.valid++
        // Treat accountId as valid igUserId and persist
        await db.project.update({
          where: { id: project.id },
          data: { instagramUserId: accountId },
        })
        summary.updated++
        console.log(`[OK] Project ${project.id} (${project.name}) -> instagramUserId set to ${accountId}`)
        break
      }
      case 'UNSUPPORTED_REQUEST':
        summary.unsupported++
        console.warn(`[UNSUPPORTED] Project ${project.id} (${project.name}) accountId=${accountId} msg="${result.message}"`)
        break
      case 'TOKEN_ERROR':
        summary.tokenErrors++
        console.error(`[TOKEN] Project ${project.id} (${project.name}) token error: ${result.message}`)
        break
      case 'PERMISSION_ERROR':
        summary.permission++
        console.warn(`[PERMISSION] Project ${project.id} (${project.name}) accountId=${accountId} msg="${result.message}"`)
        break
      case 'OTHER_ERROR':
        summary.otherErrors++
        console.warn(`[ERROR] Project ${project.id} (${project.name}) accountId=${accountId} msg="${result.message}"`)
        break
    }
  }

  console.log('\nSummary:', summary)
}

main()
  .catch((err) => {
    console.error('Validation failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
