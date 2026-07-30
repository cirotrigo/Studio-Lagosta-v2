import { db } from '@/lib/db'

/**
 * Fonte única da identidade da marca para TODO prompt de geração.
 *
 * Antes deste módulo, seis consumidores (improve, chat, arte-livre,
 * arte-rápida/MCP, generate-ai-text, generate-art) faziam cada um o seu
 * `select` com um recorte diferente — campo novo de identidade só valia depois
 * de adicionado à mão em cada um. Agora o recorte é um só; quem quiser menos,
 * ignora campos.
 *
 * Também é o contrato da prévia de prompt da aba Marca: o que ela mostra é o
 * que os geradores consomem, porque ambos leem DESTE loader. E é o serviço que
 * as futuras tools de MCP (consultar/atualizar DNA via chat) vão embrulhar —
 * validação e escrita moram aqui, não na rota.
 */

export interface BrandDNASections {
  toneOfVoice: string | null
  contentRules: string | null
  composition: string | null
  visualStyle: string | null
  photoDirection: string | null
}

export interface BrandContext {
  projectId: number
  projectName: string
  dna: BrandDNASections
  cuisineType: string | null
  fonts: {
    title: string | null
    subtitle: string | null
    body: string | null
  }
  colors: Array<{ name: string; hexCode: string }>
  logoUrl: string | null
  /** `Project.artImprovementPrompt` — direção de arte própria do improve. */
  artDirection: string | null
}

export const BRAND_DNA_FIELDS = [
  'toneOfVoice',
  'contentRules',
  'composition',
  'visualStyle',
  'photoDirection',
] as const

export type BrandDNAField = (typeof BRAND_DNA_FIELDS)[number]

/** Teto por seção — igual ao dos prompts de IA em Configurações. */
export const BRAND_DNA_MAX_CHARS = 10_000

const nonEmpty = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export async function loadBrandContext(projectId: number): Promise<BrandContext | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      cuisineType: true,
      brandStyleDescription: true,
      artImprovementPrompt: true,
      titleFontFamily: true,
      subtitleFontFamily: true,
      bodyFontFamily: true,
      brandDNA: true,
      BrandColor: {
        select: { name: true, hexCode: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!project) return null

  const dna = project.brandDNA

  return {
    projectId: project.id,
    projectName: project.name,
    dna: {
      toneOfVoice: nonEmpty(dna?.toneOfVoice),
      contentRules: nonEmpty(dna?.contentRules),
      composition: nonEmpty(dna?.composition),
      // Fallback para o campo legado do Project: projetos que descreveram o
      // estilo antes do DNA existir (hoje só o Wine Vix) continuam cobertos
      // sem migração de dados.
      visualStyle: nonEmpty(dna?.visualStyle) ?? nonEmpty(project.brandStyleDescription),
      photoDirection: nonEmpty(dna?.photoDirection),
    },
    cuisineType: nonEmpty(project.cuisineType),
    fonts: {
      title: nonEmpty(project.titleFontFamily),
      subtitle: nonEmpty(project.subtitleFontFamily),
      body: nonEmpty(project.bodyFontFamily),
    },
    colors: project.BrandColor,
    logoUrl: nonEmpty(project.logoUrl),
    artDirection: nonEmpty(project.artImprovementPrompt),
  }
}

/**
 * Escrita do DNA. Upsert campo a campo: só toca no que veio no patch, string
 * vazia vira null (seção "limpa" volta a não entrar no prompt).
 *
 * É deliberadamente um serviço e não código de rota — a rota da UI e as
 * futuras tools de MCP chamam a MESMA função.
 */
export async function updateBrandDNA(
  projectId: number,
  patch: Partial<Record<BrandDNAField, string | null>>,
): Promise<BrandDNASections> {
  const data: Record<string, string | null> = {}
  for (const field of BRAND_DNA_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      data[field] = nonEmpty(patch[field] ?? null)
    }
  }

  const saved = await db.brandDNA.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  })

  return {
    toneOfVoice: saved.toneOfVoice,
    contentRules: saved.contentRules,
    composition: saved.composition,
    visualStyle: saved.visualStyle,
    photoDirection: saved.photoDirection,
  }
}
