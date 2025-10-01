import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { randomBytes } from 'crypto'

export const runtime = 'nodejs'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

export async function POST() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
  const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000'

  if (!clientId) {
    return NextResponse.json({ error: 'Client ID não configurado' }, { status: 500 })
  }

  const redirectUri = `${publicUrl.replace(/\/$/, '')}/google-drive-callback`
  const state = randomBytes(16).toString('hex')
  const scope = encodeURIComponent(DRIVE_SCOPE)
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&access_type=offline&prompt=consent&state=${state}`

  const response = NextResponse.json({ url })
  response.cookies.set('drive_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: publicUrl.startsWith('https://'),
    path: '/google-drive-callback',
    maxAge: 10 * 60,
  })

  return response
}
