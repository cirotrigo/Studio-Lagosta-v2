import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import {
  fetchProjectWithShares,
  hasProjectReadAccess,
} from '@/lib/projects/access'
import { loadBrandContext } from '@/lib/brand/brand-context'
import { buildPromptSections } from '@/lib/ai/openai-image-client'

export const runtime = 'nodejs'

/**
 * Prévia do prompt de "Melhorar com IA" — a transparência da aba Marca.
 *
 * Monta as seções com a MESMA função que o improve usa (`buildPromptSections`)
 * e os MESMOS dados (loader único), então o que aparece é o que será enviado.
 * As partes que só existem em runtime (anexos, pedido digitado) entram como
 * placeholder ilustrativo, marcadas com origin: 'runtime'.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const projectId = Number((await params).projectId)
    if (Number.isNaN(projectId)) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }
    const project = await fetchProjectWithShares(projectId)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const brand = await loadBrandContext(projectId)

    const sections = buildPromptSections({
      // Cenário mínimo: sem anexos e sem pedido — o que sobra é exatamente a
      // parte estável do prompt (identidade, cores, direção de arte).
      references: [],
      userRequest: '',
      brandColors: brand?.colors ?? [],
      artDirection: brand?.artDirection ?? null,
      brand,
    })

    // Seções que só nascem em runtime não aparecem no cenário mínimo — a UI
    // as descreve à parte para o usuário saber que existem.
    return NextResponse.json({
      sections,
      runtimeNotes: [
        'Contexto das imagens: numera IMAGEM 1 (arte original), IMAGEM 2 (fundo novo, se enviado) e logos/elementos selecionados no modal.',
        'Pedido do cliente: o texto digitado na hora entra por último, com prioridade sobre a diagramação — nunca sobre identidade e paleta.',
      ],
    })
  } catch (error) {
    console.error('[prompt-preview] GET failed', error)
    return NextResponse.json({ error: 'Erro ao montar a prévia do prompt' }, { status: 500 })
  }
}
