import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectOwnership, hasProjectReadAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { copiarPaginaDeModelo, ehPastaDaAssinatura } from '@/lib/modelos/copiar-pagina'
import { gravarCopiaDoModelo, urlDoEditor } from '@/lib/modelos/gravar-copia'

export const runtime = 'nodejs'

/**
 * S4 (06/11/2026) — "Duplicar" um modelo: outro MODELO na mesma pasta, sem as tags do sistema. É curadoria (o modelo
 * novo entra no pool de todo mundo), então o gate é o do "Marcar modelo" (`hasProjectOwnership`). A Assinatura fica de
 * fora: lá o curador duplica pelo editor, de propósito. Não conta uso do original.
 */
const recusa = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status })

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string; pageId: string }> }) {
  try {
    const { userId, orgId, orgRole } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId: idTexto, pageId } = await params
    const projectId = Number(idTexto)
    if (!Number.isInteger(projectId) || projectId <= 0) return recusa(400, 'PROJETO_INVALIDO', 'Projeto inválido.')
    const projeto = await fetchProjectWithShares(projectId)
    if (!hasProjectReadAccess(projeto, { userId, orgId })) return recusa(404, 'PROJETO_NAO_ENCONTRADO', 'Projeto não encontrado.')
    if (!hasProjectOwnership(projeto, { userId, orgId, orgRole })) {
      return recusa(403, 'SEM_CURADORIA', 'Só o curador (dono do projeto ou admin da organização) duplica modelos.')
    }

    const origem = await db.page.findFirst({
      where: { id: pageId, isTemplate: true, Template: { projectId } },
      select: {
        id: true, name: true, width: true, height: true, background: true, layers: true, tags: true,
        Template: { select: { id: true, name: true, category: true, tags: true } },
      },
    })
    if (!origem) return recusa(404, 'MODELO_NAO_ENCONTRADO', 'Modelo não encontrado neste projeto.')
    if (ehPastaDaAssinatura(origem.Template)) {
      return recusa(409, 'DESTINO_ASSINATURA', 'Modelo da Assinatura se duplica pelo editor: uma cópia aqui viraria variante da marca.')
    }

    const copia = copiarPaginaDeModelo(origem, { modo: 'duplicar', novoId: () => crypto.randomUUID(), agora: new Date() })
    const destino = origem.Template
    const { pageId: novaId } = await gravarCopiaDoModelo({ origemId: origem.id, destinoTemplateId: destino.id, copia, contarUso: false })
    return NextResponse.json(
      { pageId: novaId, templateId: destino.id, pastaNome: destino.name, editorUrl: urlDoEditor(destino.id, novaId) },
      { status: 201 },
    )
  } catch (erro) {
    if (erro instanceof CreativeError) return NextResponse.json(erro.toJSON(), { status: erro.status })
    console.error('[modelos/duplicar] erro ao duplicar o modelo:', erro)
    return recusa(500, 'ERRO_INTERNO', 'Não foi possível duplicar o modelo.')
  }
}
