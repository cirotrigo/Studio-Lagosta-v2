import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { findClient, issueAuthorizationCode } from '@/lib/mcp/oauth'

/**
 * Emite o código de autorização depois do usuário aprovar na tela de consentimento.
 *
 * Revalida tudo do lado do servidor — cliente, redirect_uri e PKCE — porque os
 * valores chegam do formulário e não dá para confiar neles.
 */
const approveSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  state: z.string().optional(),
  codeChallenge: z.string().min(20),
})

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = approveSchema.parse(await req.json())

    const client = await findClient(body.clientId)
    if (!client) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Cliente não registrado' },
        { status: 400 },
      )
    }
    if (!client.redirectUris.includes(body.redirectUri)) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'redirect_uri não registrada para este cliente' },
        { status: 400 },
      )
    }

    const code = await issueAuthorizationCode({
      clientId: client.id,
      userId,
      redirectUri: body.redirectUri,
      codeChallenge: body.codeChallenge,
    })

    const destino = new URL(body.redirectUri)
    destino.searchParams.set('code', code)
    if (body.state) destino.searchParams.set('state', body.state)

    return NextResponse.json({ redirectTo: destino.toString() })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: error.errors[0]?.message },
        { status: 400 },
      )
    }
    console.error('[oauth/approve] erro:', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
