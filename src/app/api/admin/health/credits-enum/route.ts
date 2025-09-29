import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-utils'
import { toPrismaOperationType } from '@/lib/credits/feature-config'
import { OperationType } from '@/lib/prisma-types'

export const runtime = 'nodejs'

export async function GET() {
  const { userId } = await auth()
  if (!userId || !(await isAdmin(userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Validate enum mapping and presence
    const chat = toPrismaOperationType('ai_text_chat')
    const image = toPrismaOperationType('ai_image_generation')

    const ok = chat === OperationType.AI_TEXT_CHAT && image === OperationType.AI_IMAGE_GENERATION

    return NextResponse.json({
      ok,
      mappings: {
        ai_text_chat: String(chat),
        ai_image_generation: String(image),
      },
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error)?.message || 'Failed' }, { status: 500 })
  }
}

