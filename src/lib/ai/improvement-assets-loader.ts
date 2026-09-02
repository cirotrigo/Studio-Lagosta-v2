import { db } from '@/lib/db'
import {
  MAX_SELECTED_LOGOS,
  MAX_SELECTED_ELEMENTS,
} from '@/lib/ai/improvement-assets-constants'
import { loadBrandContext, type BrandContext } from '@/lib/brand/brand-context'
import { KnowledgeCategory } from '@prisma/client'
import { vigenteEm } from '@/lib/knowledge/vigencia'

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
  /**
   * Linhas de endereço e horário da base (ESTABELECIMENTO_INFO + HORARIOS),
   * para a seção [FATOS DO CLIENTE] do prompt — que só entra quando a régua
   * tem bloco de serviço. Ver `fatosDoClienteNaMelhoria`.
   */
  fatos: string[]
}

const LINHA_DE_FATO = /endere[çc]o|funcionamento|hor[áa]rio|aberto|fecha|segunda|ter[çc]a|s[áa]bado|domingo/i

/**
 * As linhas da base que dizem ONDE e QUANDO. Só linhas, nunca a entrada
 * inteira: a ficha do estabelecimento tem público, Instagram e história, e
 * nada disso é fato de serviço.
 */
export async function loadFatosDoCliente(projectId: number): Promise<string[]> {
  try {
    const entradas = await db.knowledgeBaseEntry.findMany({
      where: {
        projectId,
        status: 'ACTIVE',
        ...vigenteEm(),
        category: { in: [KnowledgeCategory.ESTABELECIMENTO_INFO, KnowledgeCategory.HORARIOS] },
      },
      select: { content: true },
      orderBy: { category: 'asc' },
      take: 6,
    })
    const linhas: string[] = []
    for (const e of entradas) {
      for (const bruta of e.content.split('\n')) {
        const linha = bruta.replace(/\s+/g, ' ').trim()
        if (linha.length < 8 || linha.length > 200) continue
        if (!LINHA_DE_FATO.test(linha)) continue
        // Linha de regra ("Nunca sugerir…") não é fato; só o que declara.
        if (/^(nunca|não|nao|regras?|linha pronta|todo post)/i.test(linha)) continue
        if (!linhas.includes(linha)) linhas.push(linha)
        if (linhas.length >= 8) return linhas
      }
    }
    return linhas
  } catch (erro) {
    console.warn('[improve.assets] fatos do cliente indisponíveis — seguindo sem:', erro)
    return []
  }
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

  const [logos, elements, brand, fatos] = await Promise.all([
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
    loadFatosDoCliente(projectId),
  ])

  return {
    logos: logos.map((l) => ({ fileUrl: l.fileUrl, name: l.name, kind: 'logo' as const })),
    elements: elements.map((e) => ({ fileUrl: e.fileUrl, name: e.name, kind: 'element' as const })),
    colors: brand?.colors ?? [],
    artDirection: brand?.artDirection ?? null,
    brand,
    fatos,
  }
}
