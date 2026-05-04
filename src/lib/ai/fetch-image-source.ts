import { googleDriveService } from '@/server/google-drive-service'

/**
 * Carrega uma imagem como Buffer a partir de qualquer URL pública conhecida:
 * - Drive via /api/google-drive/image/{fileId} (proxy interno autenticado)
 * - Drive via lh3.googleusercontent.com/d/{fileId}=w... (CDN público)
 * - URL externa qualquer (HTTP/HTTPS) — incluindo Vercel Blob
 *
 * Quando a URL aponta pra Drive (qualquer das formas), prefere usar o serviço
 * do Drive direto (mais rápido, sem hop HTTP intermediário).
 */
export async function fetchImageSource(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const driveFileId = extractDriveFileId(url)
  if (driveFileId) {
    try {
      return await fetchFromDriveService(driveFileId)
    } catch (error) {
      console.warn('[fetchImageSource] Drive service failed, falling back to direct fetch:', error)
      return fetchExternal(url)
    }
  }
  return fetchExternal(url)
}

function extractDriveFileId(url: string): string | null {
  // Formato 1: /api/google-drive/image/{fileId} ou /api/drive/thumbnail/{fileId}
  const apiMatch = url.match(/\/api\/(?:google-drive\/image|drive\/thumbnail)\/([^/?]+)/)
  if (apiMatch?.[1]) return apiMatch[1]

  // Formato 2: lh3.googleusercontent.com/d/{fileId}=...
  const cdnMatch = url.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/)
  if (cdnMatch?.[1]) return cdnMatch[1]

  // Formato 3 (legacy): drive.google.com/uc?export=view&id={fileId}
  const ucMatch = url.match(/drive\.google\.com\/uc\?[^"]*[?&]id=([a-zA-Z0-9_-]+)/)
  if (ucMatch?.[1]) return ucMatch[1]

  return null
}

async function fetchFromDriveService(fileId: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (!googleDriveService.isEnabled()) {
    throw new Error('Google Drive não configurado')
  }
  const { stream, mimeType } = await googleDriveService.getFileStream(fileId)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return { buffer: Buffer.concat(chunks), contentType: mimeType }
}

async function fetchExternal(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem (HTTP ${response.status})`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || 'image/jpeg',
  }
}
