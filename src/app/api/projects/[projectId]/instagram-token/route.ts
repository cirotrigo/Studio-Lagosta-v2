/**
 * Token do Instagram Login do projeto.
 *
 * O token é gerado no painel da Meta (Instagram → Configuração da API com
 * login empresarial → "Gere tokens de acesso") e vale só para aquela conta.
 * Aqui ele é validado contra a API antes de gravar, e nunca é devolvido.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { InstagramGraphApiClient, InstagramApiException } from '@/lib/instagram/graph-api-client'

const bodySchema = z.object({
  token: z.string().trim().min(20, 'Token muito curto'),
})

async function autorizar(projectId: number) {
  const { userId, orgId } = await auth()
  if (!userId) return { erro: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }

  const project = await fetchProjectWithShares(projectId)
  if (!project) return { erro: NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 }) }
  if (!hasProjectWriteAccess(project, { userId, orgId })) {
    return { erro: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  }
  return { project }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const projectId = Number((await params).projectId)
    if (!projectId) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })

    const { erro, project } = await autorizar(projectId)
    if (erro) return erro

    const { token } = bodySchema.parse(await req.json())

    const client = new InstagramGraphApiClient(token)
    if (!client.isInstagramLoginToken) {
      return NextResponse.json(
        { error: 'Esse token não é do Instagram Login (deve começar com IGAA).' },
        { status: 400 }
      )
    }

    // Confere de qual conta é o token antes de gravar
    const conta = await client.getOwnAccount()
    const esperado = project!.instagramUsername?.replace(/^@+/, '').toLowerCase()
    if (esperado && conta.username.toLowerCase() !== esperado) {
      return NextResponse.json(
        {
          error: `O token é da conta @${conta.username}, mas o projeto é @${esperado}. Nada foi salvo.`,
        },
        { status: 400 }
      )
    }

    // Estende para 60 dias; token recém-criado (<24h) ainda não pode ser renovado
    let tokenFinal = token
    let expiraEm = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    try {
      const renovado = await client.refreshToken()
      if (renovado?.access_token) {
        tokenFinal = renovado.access_token
        expiraEm = new Date(Date.now() + (renovado.expires_in ?? 60 * 24 * 3600) * 1000)
      }
    } catch {
      // segue com o token original — o cron diário renova quando possível
    }

    await db.project.update({
      where: { id: projectId },
      data: {
        instagramAccessToken: tokenFinal,
        instagramTokenExpiresAt: expiraEm,
        instagramAppScopedId: conta.id,
      },
    })

    return NextResponse.json({
      success: true,
      username: conta.username,
      mediaCount: conta.media_count ?? null,
      expiresAt: expiraEm.toISOString(),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    if (error instanceof InstagramApiException) {
      return NextResponse.json(
        { error: `Instagram recusou o token: ${error.message}` },
        { status: 400 }
      )
    }
    console.error('[Instagram Token API] erro:', error)
    return NextResponse.json({ error: 'Erro ao salvar token' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const projectId = Number((await params).projectId)
    if (!projectId) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })

    const { erro } = await autorizar(projectId)
    if (erro) return erro

    await db.project.update({
      where: { id: projectId },
      data: { instagramAccessToken: null, instagramTokenExpiresAt: null, instagramAppScopedId: null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Instagram Token API] erro ao remover:', error)
    return NextResponse.json({ error: 'Erro ao remover token' }, { status: 500 })
  }
}
