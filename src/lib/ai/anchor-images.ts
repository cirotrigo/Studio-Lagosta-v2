/**
 * Anchor sheet do projeto — fotos-âncora canônicas por tipo de cena.
 *
 * É a operacionalização da regra "a âncora manda, o prompt só descreve a
 * ação": cena de mesa leva sempre a foto X, salão a foto Y, chopp a foto Z.
 * A trilha `imagem` da geração injeta a âncora de AMBIENTE automaticamente
 * quando a cena é gerada e o chamador não escolheu uma — descrever o lugar
 * por texto faz o modelo inventar um lugar genérico e consistente com o
 * lugar errado (caso real do Espeto Gaúcho, 07/08/2026).
 *
 * A foto é sempre uma CÓPIA PERMANENTE no Blob (resolveImageUrl) — nunca o
 * thumbnailLink assinado do Drive, que expira em horas.
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { resolveImageUrl } from '@/lib/creatives/persist'
import { VERCEL_BLOB_HOST_REGEX } from '@/lib/ai/creative-improvement-service'

/** Tag que a injeção automática procura primeiro. */
export const AMBIENT_SCENE_TAG = 'ambiente'

export interface AnchorImage {
  id: string
  sceneTag: string
  blobUrl: string
  driveFileId: string | null
  label: string | null
}

const ANCHOR_SELECT = {
  id: true,
  sceneTag: true,
  blobUrl: true,
  driveFileId: true,
  label: true,
} as const

export function normalizeSceneTag(tag: string): string {
  return tag
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export async function listarAncoras(projectId: number): Promise<AnchorImage[]> {
  return db.projectAnchorImage.findMany({
    where: { projectId },
    orderBy: [{ sceneTag: 'asc' }, { createdAt: 'desc' }],
    select: ANCHOR_SELECT,
  })
}

export interface DefinirAncoraInput {
  projectId: number
  sceneTag: string
  driveFileId?: string | null
  /** Alternativa ao Drive: URL já no nosso Blob. */
  url?: string | null
  label?: string | null
}

export async function definirAncora(input: DefinirAncoraInput): Promise<AnchorImage> {
  const sceneTag = normalizeSceneTag(input.sceneTag)
  if (!sceneTag) {
    throw new CreativeError('TAG_INVALIDA', 'Tipo de cena inválido (use algo como "ambiente", "mesa").', 400)
  }

  const temDrive = !!input.driveFileId?.trim()
  const temUrl = !!input.url?.trim()
  if (temDrive === temUrl) {
    throw new CreativeError('REF_INVALIDA', 'Informe OU driveFileId OU url (uma das duas).', 400)
  }
  if (temUrl && !VERCEL_BLOB_HOST_REGEX.test(input.url!)) {
    throw new CreativeError('URL_NAO_PERMITIDA', 'URL de âncora precisa ser do Studio (Blob).', 400)
  }

  let blobUrl = input.url?.trim() ?? null
  if (temDrive) {
    const resolved = await resolveImageUrl(undefined, input.driveFileId!.trim())
    if (!resolved.url) {
      throw new CreativeError(
        'FOTO_NAO_RESOLVIDA',
        `Não consegui copiar a foto do Drive: ${resolved.warning ?? 'motivo desconhecido'}`,
        422,
      )
    }
    blobUrl = resolved.url
  }

  return db.projectAnchorImage.create({
    data: {
      projectId: input.projectId,
      sceneTag,
      blobUrl: blobUrl!,
      driveFileId: input.driveFileId?.trim() || null,
      label: input.label?.trim() || null,
    },
    select: ANCHOR_SELECT,
  })
}

export async function removerAncora(projectId: number, ancoraId: string): Promise<void> {
  const removed = await db.projectAnchorImage.deleteMany({ where: { id: ancoraId, projectId } })
  if (removed.count === 0) {
    throw new CreativeError('ANCORA_NAO_ENCONTRADA', 'Âncora não encontrada neste cliente.', 404)
  }
}

/**
 * Âncora para injeção automática na geração de cena: a de AMBIENTE mais
 * recente; sem nenhuma "ambiente", null — injetar âncora de prato numa cena
 * de salão atrapalharia mais do que ajudaria.
 */
export async function ancoraAmbienteAutomatica(projectId: number): Promise<AnchorImage | null> {
  return db.projectAnchorImage.findFirst({
    where: { projectId, sceneTag: AMBIENT_SCENE_TAG },
    orderBy: { createdAt: 'desc' },
    select: ANCHOR_SELECT,
  })
}
