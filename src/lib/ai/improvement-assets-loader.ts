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

export interface ImprovementAssetsBundle {
  logos: ImprovementAsset[]
  elements: ImprovementAsset[]
  colors: Array<{ name: string; hexCode: string }>
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

  const [logos, elements, colors] = await Promise.all([
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
  ])

  return {
    logos: logos.map((l) => ({ fileUrl: l.fileUrl, name: l.name, kind: 'logo' as const })),
    elements: elements.map((e) => ({ fileUrl: e.fileUrl, name: e.name, kind: 'element' as const })),
    colors,
  }
}
