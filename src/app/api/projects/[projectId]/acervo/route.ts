import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchProjectWithShares, hasProjectReadAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { buscarNoAcervo, listarImagensDoDrive } from '@/lib/creatives/acervo'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Busca no acervo do projeto para a UI (o catálogo semântico que até agora só
 * o MCP enxergava). Ordena por menos usada recentemente — é o rodízio que
 * evita repetir a mesma foto na semana.
 *
 * Projeto sem `_image-catalog.json` cai na listagem crua da pasta em vez de
 * devolver 404: melhor mostrar as fotos sem metadado do que uma tela vazia.
 */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const projectIdNum = Number(projectId)
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!projectIdNum) return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })

  const project = await fetchProjectWithShares(projectIdNum)
  if (!project || !hasProjectReadAccess(project, { userId, orgId })) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const url = new URL(req.url)
  const theme = url.searchParams.get('tema')?.trim() || undefined
  const folder = url.searchParams.get('pasta')?.trim() || undefined
  // Teto 500 (era 100): o "Carregar mais" do picker cresce o pedido em passos
  // de 80, e os acervos reais passam de 800 fotos — com teto 100 o botão
  // morria na segunda página. O custo é só o slice de um catálogo que já está
  // inteiro em memória; as miniaturas quem pagina é o navegador, por lazy load.
  const limit = Math.min(Math.max(Number(url.searchParams.get('limite')) || 40, 1), 500)
  // `?explorando=1`: só olhando o acervo — não registra proposta (a busca do
  // picker que pode virar escolha continua registrando, como sempre).
  const explorando = ['1', 'true'].includes(url.searchParams.get('explorando') ?? '')

  try {
    const resultado = await buscarNoAcervo({
      projectId: projectIdNum,
      theme,
      folder,
      limit,
      ...(explorando ? { registrarSugestao: false } : {}),
    })
    return NextResponse.json({ ...resultado, temCatalogo: true })
  } catch (error) {
    if (error instanceof CreativeError && error.code === 'SEM_CATALOGO') {
      try {
        const cru = await listarImagensDoDrive(projectIdNum, limit, folder)
        return NextResponse.json({
          temCatalogo: false,
          // `total` é quantas casam com o filtro, NÃO quantas vieram nesta
          // página: é dele que o seletor tira o "Carregar mais". Passar a
          // contagem já cortada zerava o botão e escondia 886 das 926 fotos.
          total: cru.total,
          acervoCompleto: cru.acervoCompleto,
          // A varredura crua também descobre as pastas — o seletor mostra os
          // mesmos chips que mostra em projeto catalogado.
          pastasDisponiveis: cru.pastasDisponiveis,
          images: cru.images.map((i) => ({
            driveFileId: i.driveFileId,
            fileName: i.fileName,
            folder: i.folder,
            menuItem: null,
            menuCategory: null,
            description: null,
            tags: [],
            bestFor: [],
            quality: null,
            ultimoUso: 'nunca',
          })),
          aviso:
            'Este projeto não tem catálogo de imagens — a busca por tema não funciona; use as pastas.' +
            (cru.parcial ? ' O acervo é grande e a listagem foi cortada: filtre por pasta.' : ''),
        })
      } catch (fallbackError) {
        if (fallbackError instanceof CreativeError) {
          return NextResponse.json(
            { error: fallbackError.message, code: fallbackError.code },
            { status: fallbackError.status },
          )
        }
        throw fallbackError
      }
    }
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[acervo] erro inesperado:', error)
    return NextResponse.json({ error: 'Erro ao buscar no acervo' }, { status: 500 })
  }
}
