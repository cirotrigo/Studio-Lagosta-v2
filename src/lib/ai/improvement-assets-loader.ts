import { db } from '@/lib/db'
import {
  MAX_SELECTED_LOGOS,
  MAX_SELECTED_ELEMENTS,
} from '@/lib/ai/improvement-assets-constants'
import { loadBrandContext, type BrandContext } from '@/lib/brand/brand-context'

export interface ImprovementAsset {
  fileUrl: string
  name: string
  kind: 'logo' | 'element'
}

export interface ImprovementAssetsBundle {
  logos: ImprovementAsset[]
  elements: ImprovementAsset[]
  colors: Array<{ name: string; hexCode: string }>
  /** Direção de arte do projeto; null = usa a padrão. */
  artDirection: string | null
  /**
   * Identidade completa via loader único (`src/lib/brand/brand-context.ts`) —
   * a mesma fonte da aba Marca e da prévia de prompt. Não fazer select próprio
   * de campos de marca aqui: campo novo entra no loader e vale para todos.
   */
  brand: BrandContext | null
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

  const [logos, elements, brand] = await Promise.all([
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
    loadBrandContext(projectId),
  ])

  return {
    logos: logos.map((l) => ({ fileUrl: l.fileUrl, name: l.name, kind: 'logo' as const })),
    elements: elements.map((e) => ({ fileUrl: e.fileUrl, name: e.name, kind: 'element' as const })),
    colors: brand?.colors ?? [],
    artDirection: brand?.artDirection ?? null,
    brand,
  }
}
