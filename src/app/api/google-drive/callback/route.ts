import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { google } from 'googleapis'
import { z } from 'zod'

export const runtime = 'nodejs'

const querySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1).optional(),
})

export async function GET(request: Request) {
  try {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
    const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000'

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Credenciais do Google Drive não configuradas' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const parseResult = querySchema.safeParse({
      code: searchParams.get('code'),
      state: searchParams.get('state') ?? undefined,
    })

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos', details: parseResult.error.flatten() }, { status: 400 })
    }

    const cookieStore = await cookies()
    const storedState = cookieStore.get('drive_oauth_state')?.value

    if (storedState && parseResult.data.state !== storedState) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    }

    const redirectUri = `${publicUrl.replace(/\/$/, '')}/google-drive-callback`
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
    const { tokens } = await oauth2Client.getToken(parseResult.data.code)

    const response = NextResponse.json({
      refreshToken: tokens.refresh_token ?? null,
      accessToken: tokens.access_token ?? null,
      scope: tokens.scope ?? null,
      expiryDate: tokens.expiry_date ?? null,
      tokenType: tokens.token_type ?? null,
    })

    response.cookies.set('drive_oauth_state', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: publicUrl.startsWith('https://'),
      path: '/google-drive-callback',
      maxAge: 0,
    })

    return response
  } catch (error) {
    console.error('[API] Google Drive OAuth callback error', error)
    return NextResponse.json({ error: 'Falha ao completar OAuth com Google Drive' }, { status: 500 })
  }
}
