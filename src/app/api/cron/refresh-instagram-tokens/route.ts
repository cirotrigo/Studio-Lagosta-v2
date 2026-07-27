/**
 * Cron Job: renovação dos tokens do Instagram Login
 *
 * Tokens de conta (IGAA...) valem 60 dias. Sem renovação eles simplesmente
 * expiram e a integração para em silêncio — foi o que aconteceu em março/2026,
 * quando ninguém percebeu por meses.
 *
 * Roda diariamente e renova os que vencem nos próximos 10 dias. A API exige
 * que o token tenha ao menos 24h de vida, então renovar cedo é seguro.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { InstagramGraphApiClient, InstagramApiException } from '@/lib/instagram/graph-api-client'

export const runtime = 'nodejs'
export const maxDuration = 120

/** Renova quando falta menos que isto para expirar */
const JANELA_DIAS = 10

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limite = new Date(Date.now() + JANELA_DIAS * 24 * 60 * 60 * 1000)

    const projetos = await db.project.findMany({
      where: {
        instagramAccessToken: { not: null },
        OR: [
          { instagramTokenExpiresAt: null },
          { instagramTokenExpiresAt: { lte: limite } },
        ],
      },
      select: { id: true, name: true, instagramAccessToken: true, instagramTokenExpiresAt: true },
    })

    if (projetos.length === 0) {
      return NextResponse.json({ success: true, renovados: 0, message: 'Nenhum token perto de expirar' })
    }

    console.log(`[Refresh IG Tokens] ${projetos.length} token(s) a renovar`)

    let renovados = 0
    const falhas: Array<{ projeto: string; erro: string }> = []

    for (const projeto of projetos) {
      try {
        const client = new InstagramGraphApiClient(projeto.instagramAccessToken)
        const { access_token, expires_in } = await client.refreshToken()

        if (!access_token) throw new Error('resposta sem access_token')

        const expiraEm = new Date(Date.now() + (expires_in ?? 60 * 24 * 3600) * 1000)
        await db.project.update({
          where: { id: projeto.id },
          data: { instagramAccessToken: access_token, instagramTokenExpiresAt: expiraEm },
        })

        console.log(`[Refresh IG Tokens] ✅ ${projeto.name} renovado até ${expiraEm.toISOString().slice(0, 10)}`)
        renovados++
      } catch (error) {
        const erro =
          error instanceof InstagramApiException
            ? `${error.message} (code ${error.code ?? '?'})`
            : error instanceof Error
              ? error.message
              : 'erro desconhecido'

        // Token já expirado ou revogado exige nova autorização da conta —
        // não adianta tentar de novo amanhã sem intervenção
        console.error(`[Refresh IG Tokens] ❌ ${projeto.name}: ${erro}`)
        falhas.push({ projeto: projeto.name, erro })
      }
    }

    return NextResponse.json({
      success: true,
      renovados,
      falhas: falhas.length > 0 ? falhas : undefined,
      total: projetos.length,
    })
  } catch (error) {
    console.error('[Refresh IG Tokens] Erro:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
