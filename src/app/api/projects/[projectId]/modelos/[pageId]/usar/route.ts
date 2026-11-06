import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { garantirPasta } from '@/lib/compositor/pastas'
import { copiarPaginaDeModelo, ehPastaDaAssinatura, formatoPeloTamanhoLocal } from '@/lib/modelos/copiar-pagina'
import { gravarCopiaDoModelo, urlDoEditor } from '@/lib/modelos/gravar-copia'

export const runtime = 'nodejs'

/**
 * S4 (06/11/2026) — "Usar" um modelo: uma CÓPIA de conteúdo (`isTemplate: false`, tag `de-modelo`) no fim da pasta
 * escolhida ou das Avulsas do mês no formato da página. O modelo nunca é escrito, exceto `usedCount`/`lastUsedAt`.
 * Membro com escrita no projeto basta: usar não é curadoria.
 *
 * ponytail: sem idempotência na v1 — o cliente desabilita o botão enquanto espera; dois cliques que passarem criam
 * duas cópias. Chave por (origem, destino, versão) quando o MCP ou um retry automático passar a chamar esta rota.
 */
const corpoSchema = z.object({ destinoTemplateId: z.number().int().positive().optional() }).strict()

const recusa = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status })

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; pageId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId: idTexto, pageId } = await params
    const projectId = Number(idTexto)
    if (!Number.isInteger(projectId) || projectId <= 0) return recusa(400, 'PROJETO_INVALIDO', 'Projeto inválido.')
    const projeto = await fetchProjectWithShares(projectId)
    if (!hasProjectReadAccess(projeto, { userId, orgId })) return recusa(404, 'PROJETO_NAO_ENCONTRADO', 'Projeto não encontrado.')
    if (!hasProjectWriteAccess(projeto, { userId, orgId })) return recusa(403, 'SEM_ESCRITA', 'Você não pode criar artes neste projeto.')

    const corpo = corpoSchema.safeParse(await request.json().catch(() => ({})))
    if (!corpo.success) return recusa(400, 'PEDIDO_INVALIDO', 'Pedido inválido: só `destinoTemplateId` (número) é aceito.')

    const origem = await db.page.findFirst({
      where: { id: pageId, isTemplate: true, Template: { projectId } },
      select: { id: true, name: true, width: true, height: true, background: true, layers: true, tags: true },
    })
    if (!origem) return recusa(404, 'MODELO_NAO_ENCONTRADO', 'Modelo não encontrado neste projeto.')

    const copia = copiarPaginaDeModelo(origem, { modo: 'usar', novoId: () => crypto.randomUUID(), agora: new Date() })

    let destino: { id: number; name: string }
    if (corpo.data.destinoTemplateId) {
      const pasta = await db.template.findFirst({
        where: { id: corpo.data.destinoTemplateId, projectId },
        select: { id: true, name: true, category: true, tags: true },
      })
      if (!pasta) return recusa(404, 'DESTINO_NAO_ENCONTRADO', 'A pasta de destino não existe neste projeto.')
      if (ehPastaDaAssinatura(pasta)) return recusa(409, 'DESTINO_ASSINATURA', 'A pasta Assinatura não recebe cópias: o compositor usaria a página como variante da marca.')
      destino = pasta
    } else {
      destino = await garantirPasta(projectId, projeto!.userId, null, formatoPeloTamanhoLocal(origem.width, origem.height))
    }

    const { pageId: novaId } = await gravarCopiaDoModelo({ origemId: origem.id, destinoTemplateId: destino.id, copia, contarUso: true })
    return NextResponse.json(
      { pageId: novaId, templateId: destino.id, pastaNome: destino.name, editorUrl: urlDoEditor(destino.id, novaId) },
      { status: 201 },
    )
  } catch (erro) {
    if (erro instanceof CreativeError) return NextResponse.json(erro.toJSON(), { status: erro.status })
    console.error('[modelos/usar] erro ao usar o modelo:', erro)
    return recusa(500, 'ERRO_INTERNO', 'Não foi possível usar o modelo.')
  }
}
