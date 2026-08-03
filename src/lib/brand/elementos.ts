/**
 * Biblioteca de elementos gráficos do projeto — ícones, selos, formas,
 * ornamentos e sombras que entram nas artes por cima da foto.
 *
 * Até 03/08/2026 a única porta de entrada era o multipart da aba Marca, e a
 * lógica morava dentro da rota. Uma leva de 36 arquivos vindos do designer só
 * podia ser importada arquivo por arquivo, no navegador. Este serviço é a
 * mesma escrita, extraída para poder ser chamada também pelo MCP local
 * (`upload-element`) — a rota do painel passou a embrulhá-lo, para as duas
 * portas não divergirem.
 *
 * O que NÃO muda em relação ao painel: a chave do Blob
 * (`projects/{id}/elements/{ts}-{nome}`), o acesso público e a linha em
 * `Element`. Arte que referencia a `fileUrl` continua apontando para o arquivo
 * oficial — é o que faz a troca do desenho pelo painel valer para as artes
 * futuras, em vez de cada peça carregar uma cópia congelada.
 */

import sharp from 'sharp'
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'

/** Rasters conferidos pelo sharp; o SVG passa como está (sharp não o reemite). */
const FORMATOS_RASTER: Record<string, { ext: string; contentType: string }> = {
  png: { ext: 'png', contentType: 'image/png' },
  jpeg: { ext: 'jpg', contentType: 'image/jpeg' },
  webp: { ext: 'webp', contentType: 'image/webp' },
}

const SVG_CONTENT_TYPE = 'image/svg+xml'

export interface ImportarElementoInput {
  projectId: number
  /** Bytes do arquivo, já lidos pelo chamador */
  bytes: Buffer
  /** Nome do arquivo de origem — vira a chave no Blob */
  fileName: string
  /** Nome exibido na biblioteca (default: o nome do arquivo) */
  name?: string
  /** Grupo na aba Marca; null deixa em "sem categoria" */
  category?: string | null
  /** clerkId de quem enviou — auditoria, igual ao do painel */
  uploadedBy: string
}

export interface ImportarElementoResult {
  id: number
  name: string
  category: string | null
  fileUrl: string
  width: number | null
  height: number | null
}

function tetoBytes(): number {
  const maxMb = Number(process.env.BLOB_MAX_SIZE_MB || '100')
  return Math.max(1, maxMb) * 1024 * 1024
}

function ehSvg(bytes: Buffer, fileName: string): boolean {
  if (fileName.toLowerCase().endsWith('.svg')) return true
  return bytes.subarray(0, 1024).toString('utf8').trimStart().startsWith('<svg')
}

export async function importarElemento(
  input: ImportarElementoInput,
): Promise<ImportarElementoResult> {
  const { projectId, bytes, fileName, uploadedBy } = input

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    throw new CreativeError('BLOB_NAO_CONFIGURADO', 'BLOB_READ_WRITE_TOKEN não configurado', 500)
  }

  const teto = tetoBytes()
  if (bytes.length > teto) {
    throw new CreativeError(
      'ARQUIVO_GRANDE',
      `Arquivo de ${(bytes.length / 1024 / 1024).toFixed(1)}MB; o teto é ${(teto / 1024 / 1024).toFixed(0)}MB`,
      413,
    )
  }

  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
  }

  let contentType: string
  let ext: string
  let width: number | null = null
  let height: number | null = null

  if (ehSvg(bytes, fileName)) {
    contentType = SVG_CONTENT_TYPE
    ext = 'svg'
  } else {
    // O formato REAL manda, não a extensão: PNG renomeado para .jpg subiria com
    // o content-type errado e o navegador recusaria desenhar.
    const meta = await sharp(bytes).metadata().catch(() => null)
    const formato = meta?.format ? FORMATOS_RASTER[meta.format] : undefined
    if (!formato) {
      throw new CreativeError(
        'FORMATO_NAO_ACEITO',
        `Formato não aceito${meta?.format ? ` (${meta.format})` : ''}. Use PNG, JPG, WebP ou SVG.`,
        415,
      )
    }
    contentType = formato.contentType
    ext = formato.ext
    width = meta?.width ?? null
    height = meta?.height ?? null
  }

  // Mesma chave do painel — a procedência some do caminho, e é isso que se quer:
  // elemento enviado pelo MCP e pelo navegador vivem no mesmo lugar.
  const base = fileName.replace(/\.[^.]+$/, '') || 'elemento'
  const safeName = `${base}.${ext}`.replace(/[^a-z0-9._-]/gi, '_')
  const key = `projects/${projectId}/elements/${Date.now()}-${safeName}`

  const uploaded = await put(key, bytes, { access: 'public', token, contentType })

  const element = await db.element.create({
    data: {
      name: input.name?.trim() || base,
      category: input.category?.trim() || null,
      fileUrl: uploaded.url,
      projectId,
      uploadedBy,
    },
    select: { id: true, name: true, category: true, fileUrl: true },
  })

  return { ...element, width, height }
}

/**
 * clerkId do dono do projeto — o `uploadedBy` que o painel tira da sessão e o
 * MCP não tem. `Project.userId` é o id INTERNO do User (não o clerkId); passar
 * esse cuid adiante já criou User fantasma antes.
 */
export async function resolverUploaderDoProjeto(projectId: number): Promise<string> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
  }
  const user = await db.user.findUnique({
    where: { id: project.userId },
    select: { clerkId: true },
  })
  return user?.clerkId ?? project.userId
}
