/**
 * A foto da peça SÓ PARA MEDIR (R10 da revisão de 775f4377).
 *
 * `carregarFoto` do compositor resolve a foto do Drive por `resolveImageUrl`,
 * que PUBLICA uma cópia no Blob (`drive-cache/<id>-s1920.jpg`, público,
 * sobrescrevendo) — certo para COMPOR, porque a página precisa de uma URL
 * permanente; errado para uma tool de LEITURA: `medir-copy` com
 * `fotoDriveId` criava ou sobrescrevia um arquivo remoto, e a escrita ficava
 * mesmo quando a medição falhava depois. Aqui os bytes vêm direto — a URL
 * dada, ou a miniatura grande do Drive — e nada é publicado; a luz média e a
 * escolha da variante saem iguais às da composição.
 *
 * Este módulo não importa `@vercel/blob` nem `persist.ts`, de propósito; há um
 * teste que confere isso no fonte.
 */
import { fetchBuffer } from '@/lib/posts/register-project-fonts'
import { googleDriveService } from '@/server/google-drive-service'
import type { SpecDePeca } from './spec'

export interface FotoParaMedir {
  /** A URL pública quando ela já existia (foto por `url`); `null` quando os bytes vieram do Drive sem publicar. */
  url: string | null
  bytes: Buffer
  largura: number
  altura: number
}

export async function carregarFotoParaMedir(spec: Pick<SpecDePeca, 'foto'>): Promise<{ foto: FotoParaMedir | null; aviso: string | null }> {
  const url = spec.foto?.url ?? null
  const driveFileId = spec.foto?.driveFileId ?? null
  if (!url && !driveFileId) return { foto: null, aviso: null }
  let origem = url
  if (!origem) {
    if (!googleDriveService.isEnabled()) {
      return { foto: null, aviso: 'Google Drive não configurado neste ambiente (GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN)' }
    }
    try {
      const file = await googleDriveService.getFileMetadata(driveFileId!, 'thumbnailLink')
      const thumbnailLink = (file as { thumbnailLink?: string }).thumbnailLink
      if (!thumbnailLink) return { foto: null, aviso: `Arquivo ${driveFileId} do Drive não tem thumbnailLink (não é imagem?)` }
      origem = thumbnailLink.replace(/=s\d+$/, '=s1920')
    } catch (error) {
      return { foto: null, aviso: `Falha ao resolver a imagem no Drive: ${(error as Error).message}` }
    }
  }
  const bytes = await fetchBuffer(origem)
  const sharp = (await import('sharp')).default
  const meta = await sharp(bytes).metadata()
  return { foto: { url, bytes, largura: meta.width ?? 0, altura: meta.height ?? 0 }, aviso: null }
}
