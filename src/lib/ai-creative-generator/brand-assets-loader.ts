/**
 * Brand Assets Loader
 * Carrega assets da marca (logo, fontes, cores) de um projeto
 */

import { db } from '@/lib/db'
import type { BrandAssets } from './layout-types'

export async function loadBrandAssets(projectId: number): Promise<BrandAssets> {
  // Buscar logo principal do projeto
  const logo = await db.logo.findFirst({
    where: {
      projectId,
      isProjectLogo: true,
    },
    select: {
      fileUrl: true,
      name: true,
    },
  })

  // Buscar fontes customizadas
  const fonts = await db.customFont.findMany({
    where: { projectId },
    select: {
      fontFamily: true,
      fileUrl: true,
    },
  })

  // Buscar cores da marca
  const colors = await db.brandColor.findMany({
    where: { projectId },
    select: {
      name: true,
      hexCode: true,
    },
  })

  return {
    logo: logo || null,
    fonts,
    colors,
  }
}
