import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit'

const querySchema = z.object({
  folderId: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  pageToken: z.string().min(1).optional(),
  mode: z.enum(['folders', 'images', 'videos']).default('folders'),
})

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ error: 'Google Drive não configurado' }, { status: 503 })
    }

    const { searchParams } = new URL(req.url)
    const parseResult = querySchema.safeParse({
      folderId: searchParams.get('folderId') ?? undefined,
      search: searchParams.get('search') ?? undefined,
      pageToken: searchParams.get('pageToken') ?? undefined,
      mode: searchParams.get('mode') ?? undefined,
    })

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos', details: parseResult.error.flatten() }, { status: 400 })
    }

    assertRateLimit({ key: `drive:list:${userId}` })

    const result = await googleDriveService.listFiles(parseResult.data)

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Limite de requisições atingido' },
        { status: 429, headers: { 'Retry-After': String(error.retryAfter) } },
      )
    }

    console.error('[API] Failed to list Google Drive files', error)
    return NextResponse.json({ error: 'Erro ao listar arquivos do Google Drive' }, { status: 502 })
  }
}
export const runtime = 'nodejs'
