import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { DriveIndisponivelError, filtrarAtalhosDoEscopo, idsDoDriveNaRotaDoProjeto, raizesNaRotaDoProjeto } from '@/lib/google-drive/escopo'
import { PermissionError, requireProjectAccess } from '@/lib/permissions'

const naoEncontrado = () => NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

const querySchema = z.object({
  folderId: z.string().trim().min(1),
  projectId: z.coerce.number().int().positive(),
  fileIds: z.array(z.string().trim().min(1)).optional(),
})

export async function GET(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ error: 'Google Drive não configurado' }, { status: 503 })
    }

    const { searchParams } = new URL(req.url)
    const parsed = querySchema.safeParse({
      folderId: searchParams.get('folderId'),
      projectId: searchParams.get('projectId'),
      fileIds: searchParams.getAll('fileIds') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { folderId: pastaPedida, projectId, fileIds: arquivosPedidos } = parsed.data
    await requireProjectAccess(projectId, { userId, orgId })

    // Pasta e arquivos: todos sob as pastas deste projeto, ou nada.
    const permitidos = await idsDoDriveNaRotaDoProjeto(userId, projectId, [pastaPedida, ...(arquivosPedidos ?? [])])
    if (!permitidos) {
      return naoEncontrado()
    }
    const [folderId, ...fileIds] = permitidos

    const folderMetaPromise = googleDriveService.getFileMetadata(folderId, 'id, name')
    const filesPromise = fileIds?.length
      ? Promise.all(
          fileIds.map(async (id) => {
            const metadata = await googleDriveService.getFileMetadata(
              id,
              'id, name, mimeType, size, webContentLink',
            )
            const safeId = metadata.id ?? id
            return {
              id: safeId,
              name: metadata.name ?? 'Sem nome',
              mimeType: metadata.mimeType ?? 'application/octet-stream',
              size: metadata.size ? Number(metadata.size) : undefined,
              webContentLink: metadata.webContentLink ?? null,
            }
          }),
        )
      : // Os ids pedidos já saem efetivos (atalho → destino conferido); os
        // filhos listados não: atalho para fora do projeto sai (admin: tudo).
        Promise.all([googleDriveService.listFolderFiles(folderId), raizesNaRotaDoProjeto(userId, projectId)]).then(
          ([lista, raizes]) => (raizes ? filtrarAtalhosDoEscopo(lista, raizes) : lista),
        )

    const [folderMeta, files] = await Promise.all([folderMetaPromise, filesPromise])

    const mapped = files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      url: file.webContentLink ?? googleDriveService.getPublicUrl(file.id),
    }))

    return NextResponse.json({
      folderId,
      folderName: folderMeta.name ?? undefined,
      files: mapped,
    })
  } catch (error) {
    if (error instanceof DriveIndisponivelError) {
      return NextResponse.json({ error: 'Google Drive indisponível, tente de novo' }, { status: 503 })
    }
    // Projeto inexistente, sem acesso e pasta fora do projeto: a mesma resposta.
    if (error instanceof PermissionError) {
      return naoEncontrado()
    }

    console.error('[Drive API] Failed to load folder for download', error)
    return NextResponse.json({ error: 'Erro ao preparar download' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
