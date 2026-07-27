import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isExternalApiAuthorized } from '@/lib/external-api/auth'
import { prepareCreative, CreativeError } from '@/lib/creatives/arte-rapida'

export const maxDuration = 60

const prepareSchema = z
  .object({
    projectId: z.number().int().positive().optional(),
    projectHint: z.string().min(1).optional(),
    theme: z.string().min(1),
    day: z.string().optional(),
  })
  .refine((data) => Boolean(data.projectId ?? data.projectHint), {
    message: 'Provide either projectId or projectHint',
    path: ['projectId'],
  })

/**
 * POST /api/external/creatives/prepare
 *
 * Step 1 of the arte-rápida flow: resolve the project and the template page
 * that best fits a theme/day, and return the slots to fill together with brand
 * and tone-of-voice context. The caller writes the copy and then posts it to
 * /api/external/creatives.
 */
export async function POST(req: NextRequest) {
  if (!isExternalApiAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const input = prepareSchema.parse(await req.json())
    const result = await prepareCreative({
      projectId: input.projectId,
      projectHint: input.projectHint,
      theme: input.theme,
      day: input.day,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 })
    }
    if (error instanceof CreativeError) {
      return NextResponse.json(error.toJSON(), { status: error.status })
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[External API] Error preparing creative:', error)
    return NextResponse.json({ error: 'Failed to prepare creative', details: message }, { status: 500 })
  }
}
