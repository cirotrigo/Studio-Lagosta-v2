import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { lerArtesDoPost } from '@/lib/posts/artes-do-post'

export const runtime = 'nodejs'

/**
 * As artes do post, slide a slide — é o que deixa a revisão da agenda perguntar
 * sobre a arte que está NA TELA em vez de sempre sobre o primeiro slide.
 *
 * Casca fina sobre `src/lib/posts/artes-do-post.ts` (regra da casa: rota
 * embrulha serviço, nunca reimplementa). Somente leitura de propósito: quem
 * REGISTRA arte que falta é `agendarPost`, na criação, e o backfill para o que
 * já existia — abrir o post não pode gravar linha nova na galeria de quem só
 * estava olhando.
 *
 * Serviço que nunca lança + resposta vazia em falha: a barra de revisão some,
 * a tela do post continua de pé.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ postId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { postId } = await params
    const post = await db.socialPost.findUnique({
      where: { id: postId },
      select: { id: true, projectId: true },
    })
    if (!post) return NextResponse.json({ error: 'Post não encontrado' }, { status: 404 })

    const project = await fetchProjectWithShares(post.projectId)
    if (!hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    return NextResponse.json({ artes: await lerArtesDoPost(post.id) })
  } catch (error) {
    console.error('[artes-do-post] erro inesperado ao listar as artes do post:', error)
    return NextResponse.json({ artes: [] })
  }
}
