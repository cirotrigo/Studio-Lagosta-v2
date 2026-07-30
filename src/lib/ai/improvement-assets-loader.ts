import { db } from '@/lib/db'
import {
  MAX_SELECTED_LOGOS,
  MAX_SELECTED_ELEMENTS,
} from '@/lib/ai/improvement-assets-constants'

export interface ImprovementAsset {
  fileUrl: string
  name: string
  kind: 'logo' | 'element'
}

/**
 * Identidade do cliente que o sistema injeta no prompt — o que faz a MESMA
 * direção de arte render resultados diferentes por marca. Fica fora do bloco
 * editável de propósito: um prompt de projeto mal escrito não pode apagar a
 * tipografia e a paleta da marca.
 */
export interface BrandIdentity {
  projectName: string
  /** `Project.brandStyleDescription` — hoje preenchido em poucos projetos. */
  styleDescription: string | null
  cuisineType: string | null
  titleFont: string | null
  subtitleFont: string | null
  bodyFont: string | null
}

export interface ImprovementAssetsBundle {
  logos: ImprovementAsset[]
  elements: ImprovementAsset[]
  colors: Array<{ name: string; hexCode: string }>
  /** Direção de arte do projeto; null = usa a padrão. */
  artDirection: string | null
  identity: BrandIdentity | null
}

export async function loadImprovementAssets(
  projectId: number,
  {
    selectedLogoIds,
    selectedElementIds,
  }: {
    selectedLogoIds: number[]
    selectedElementIds: number[]
  },
): Promise<ImprovementAssetsBundle> {
  const cappedLogoIds = selectedLogoIds.slice(0, MAX_SELECTED_LOGOS)
  const cappedElementIds = selectedElementIds.slice(0, MAX_SELECTED_ELEMENTS)

  const [logos, elements, colors, project] = await Promise.all([
    cappedLogoIds.length > 0
      ? db.logo.findMany({
          where: { id: { in: cappedLogoIds }, projectId },
          select: { fileUrl: true, name: true },
        })
      : Promise.resolve([]),
    cappedElementIds.length > 0
      ? db.element.findMany({
          where: { id: { in: cappedElementIds }, projectId },
          select: { fileUrl: true, name: true },
        })
      : Promise.resolve([]),
    db.brandColor.findMany({
      where: { projectId },
      select: { name: true, hexCode: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        artImprovementPrompt: true,
        brandStyleDescription: true,
        cuisineType: true,
        titleFontFamily: true,
        subtitleFontFamily: true,
        bodyFontFamily: true,
      },
    }),
  ])

  return {
    logos: logos.map((l) => ({ fileUrl: l.fileUrl, name: l.name, kind: 'logo' as const })),
    elements: elements.map((e) => ({ fileUrl: e.fileUrl, name: e.name, kind: 'element' as const })),
    colors,
    artDirection: project?.artImprovementPrompt?.trim() || null,
    identity: project
      ? {
          projectName: project.name,
          styleDescription: project.brandStyleDescription?.trim() || null,
          cuisineType: project.cuisineType?.trim() || null,
          titleFont: project.titleFontFamily?.trim() || null,
          subtitleFont: project.subtitleFontFamily?.trim() || null,
          bodyFont: project.bodyFontFamily?.trim() || null,
        }
      : null,
  }
}
