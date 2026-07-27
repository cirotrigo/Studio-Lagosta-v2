import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isExternalApiAuthorized } from '@/lib/external-api/auth'
import { createArteRapida, CreativeError } from '@/lib/creatives/arte-rapida'

// Rendering downloads fonts and the source photo before rasterizing 1080×1920.
export const maxDuration = 120

const createSchema = z.object({
  projectId: z.number().int().positive(),
  sourcePageId: z.string().min(1),
  slotValues: z.record(z.unknown()).optional().default({}),
  name: z.string().optional(),
  imageUrl: z.string().url().optional(),
})

/**
 * POST /api/external/creatives
 *
 * Step 2 of the arte-rápida flow: bake the copy and image into the template
 * page, persist it as an editable Page under the project's "Arte Rápida"
 * template, render it and register it in the Criativos gallery.
 *
 * Returns the rendered PNG url plus `editUrl`, which opens the artwork in the
 * template editor (requires a logged-in Studio session).
 */
export async function POST(req: NextRequest) {
  if (!isExternalApiAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const input = createSchema.parse(await req.json())
    const result = await createArteRapida({
      projectId: input.projectId,
      sourcePageId: input.sourcePageId,
      slotValues: input.slotValues ?? {},
      name: input.name,
      imageUrl: input.imageUrl,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 })
    }
    if (error instanceof CreativeError) {
      return NextResponse.json(error.toJSON(), { status: error.status })
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[External API] Error creating creative:', error)
    return NextResponse.json({ error: 'Failed to create creative', details: message }, { status: 500 })
  }
}
