/**
 * Foto do celular direto para o Studio, via link de um toque.
 *
 * O anexo do chat do claude.ai NÃO chega ao conector MCP (os argumentos de
 * tool são texto do modelo — os bytes ficam na plataforma). O caminho viável:
 * a tool pedir-foto gera um link curto; a pessoa toca, escolhe a foto no
 * aparelho e o Studio recebe — já auto-orientada (EXIF) e redimensionada,
 * pronta para virar fundo em criar-arte/ajustar-arte.
 *
 * Segurança: o token É o id (cuid não-adivinhável), com validade de 30min e
 * escopo de UM projeto. Reenviar dentro da validade SUBSTITUI a foto (mandou
 * a errada → manda de novo, sem pedir link novo).
 */
import sharp from 'sharp'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { getPublicAppUrl } from '@/lib/creatives/persist'

export const CHAT_UPLOAD_VALIDADE_MIN = 30
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export interface PedidoDeFoto {
  uploadId: string
  url: string
  expiraEm: string
  mensagem: string
}

export async function pedirFoto(params: { projectId: number }): Promise<PedidoDeFoto> {
  const project = await db.project.findUnique({
    where: { id: params.projectId },
    select: { id: true, name: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${params.projectId}`, 404)
  }

  const upload = await db.chatUpload.create({
    data: {
      projectId: project.id,
      expiresAt: new Date(Date.now() + CHAT_UPLOAD_VALIDADE_MIN * 60_000),
    },
    select: { id: true },
  })

  const url = `${getPublicAppUrl()}/envio/${upload.id}`
  return {
    uploadId: upload.id,
    url,
    expiraEm: `${CHAT_UPLOAD_VALIDADE_MIN} minutos`,
    mensagem: `Link de envio criado (vale ${CHAT_UPLOAD_VALIDADE_MIN} minutos): a pessoa toca, escolhe a foto e pronto. Depois confira com ver-foto-enviada e use a URL recebida como imageUrl em criar-arte ou ajustar-arte.`,
  }
}

/** Estado de um pedido, para a tool ver-foto-enviada e para a página de envio. */
export async function verFoto(params: { projectId?: number; uploadId: string }) {
  const upload = await db.chatUpload.findUnique({
    where: { id: params.uploadId },
    include: { Project: { select: { id: true, name: true } } },
  })
  if (!upload || (params.projectId !== undefined && upload.projectId !== params.projectId)) {
    throw new CreativeError('ENVIO_NAO_ENCONTRADO', 'Pedido de foto não encontrado neste cliente.', 404)
  }

  const expirado = upload.expiresAt.getTime() < Date.now()
  if (upload.status === 'RECEIVED' && upload.blobUrl) {
    return {
      situacao: 'recebida' as const,
      fotoUrl: upload.blobUrl,
      fileName: upload.fileName,
      projeto: upload.Project.name,
      dica: 'Use fotoUrl como imageUrl em criar-arte (ou ajustar-arte, para trocar o fundo de uma arte existente).',
    }
  }
  if (expirado) {
    return {
      situacao: 'expirado' as const,
      projeto: upload.Project.name,
      dica: 'O link venceu sem receber foto. Gere outro com pedir-foto.',
    }
  }
  return {
    situacao: 'aguardando' as const,
    projeto: upload.Project.name,
    dica: 'A pessoa ainda não enviou. Peça para tocar no link; consulte de novo quando ela avisar.',
  }
}

/**
 * Recebe os bytes (rota pública /api/chat-upload/[token]). Auto-orienta pelo
 * EXIF — foto de celular vem deitada sem isso — e limita a 2048px, o
 * suficiente para arte 1080. Reenvio dentro da validade substitui.
 */
export async function receberFoto(
  token: string,
  bytes: Buffer,
): Promise<{ fotoUrl: string; width: number; height: number }> {
  if (bytes.length === 0) {
    throw new CreativeError('ENVIO_VAZIO', 'Nenhum arquivo recebido.', 400)
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new CreativeError('ARQUIVO_GRANDE', 'A foto passou de 25MB. Envie uma menor.', 413)
  }

  const upload = await db.chatUpload.findUnique({ where: { id: token } })
  if (!upload) {
    throw new CreativeError('ENVIO_NAO_ENCONTRADO', 'Link de envio inválido.', 404)
  }
  if (upload.expiresAt.getTime() < Date.now()) {
    throw new CreativeError('ENVIO_EXPIRADO', 'Este link venceu. Peça um novo no chat.', 410)
  }

  let processed: Buffer
  let meta: { width?: number; height?: number }
  try {
    const pipeline = sharp(bytes).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    processed = await pipeline.jpeg({ quality: 90 }).toBuffer()
    meta = await sharp(processed).metadata()
  } catch {
    throw new CreativeError('ARQUIVO_INVALIDO', 'O arquivo não parece ser uma imagem.', 415)
  }

  const blob = await put(`chat-uploads/${upload.projectId}/${token}.jpg`, processed, {
    access: 'public',
    contentType: 'image/jpeg',
    addRandomSuffix: false,
    allowOverwrite: true,
  })

  await db.chatUpload.update({
    where: { id: token },
    data: { status: 'RECEIVED', blobUrl: blob.url },
  })

  return { fotoUrl: blob.url, width: meta.width ?? 0, height: meta.height ?? 0 }
}
