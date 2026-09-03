/**
 * A SPEC de uma peça composta — o que o chat, a bancada ou um script dizem ao
 * compositor. Módulo PURO (zod + tipos): a bancada importa sem env.
 *
 * A copy chega JÁ dividida por PAPEL e por LINHA. Quebrar linha é decisão de
 * quem escreve (é o que a leva de setembro da Lagosta fez no `dados.py`), e o
 * compositor a respeita — ele mede se cabe, e recusa com orçamento quando não
 * cabe, em vez de quebrar por conta própria e mudar o ritmo da frase.
 */

import { z } from 'zod'

export const PAPEIS = ['pre', 'headline', 'apoio', 'cta', 'servico'] as const
export type Papel = (typeof PAPEIS)[number]

export const FORMATOS = ['story', 'feed', 'quadrado'] as const
export type Formato = (typeof FORMATOS)[number]

export const ANCORAS = ['topo', 'meio', 'rodape'] as const
export type Ancora = (typeof ANCORAS)[number]

export const ALINHAMENTOS = ['esquerda', 'centro', 'direita'] as const
export type Alinhamento = (typeof ALINHAMENTOS)[number]

export const CANTOS = ['inferior-esquerdo', 'inferior-direito', 'superior-esquerdo', 'superior-direito'] as const
export type Canto = (typeof CANTOS)[number]

export const blocoSchema = z.object({
  papel: z.enum(PAPEIS),
  linhas: z.array(z.string().min(1)).min(1).max(6),
})
export type Bloco = z.infer<typeof blocoSchema>

export const preferenciasSchema = z.object({
  ancora: z.enum([...ANCORAS, 'auto']).optional(),
  alinha: z.enum([...ALINHAMENTOS, 'auto']).optional(),
  cantoDaMarca: z.enum([...CANTOS, 'auto', 'nenhum']).optional(),
  /** `fixo` mantém o enquadramento central; `auto` deixa o compositor escolher o corte que abre área livre. */
  enquadramento: z.enum(['auto', 'fixo']).optional(),
  /** Nome (ou tag) da página de assinatura a usar, quando o cliente tem mais de uma no formato. */
  variante: z.string().max(80).optional(),
})
export type Preferencias = z.infer<typeof preferenciasSchema>

export const specSchema = z.object({
  projectId: z.number().int().positive(),
  formato: z.enum(FORMATOS),
  foto: z
    .object({
      url: z.string().url().optional(),
      driveFileId: z.string().min(1).optional(),
    })
    .optional(),
  blocos: z.array(blocoSchema).min(1).max(5),
  preferencias: preferenciasSchema.optional(),
  nome: z.string().max(120).optional(),
  /** Vínculos frouxos com o plano — sem FK, como todo vínculo da casa. */
  itemDePlanoId: z.string().optional(),
  planoId: z.string().optional(),
  quando: z.string().optional(),
  tema: z.string().optional(),
})
export type SpecDePeca = z.infer<typeof specSchema>

/** Uma spec válida ou a lista de problemas, sem lançar. */
export function validarSpec(entrada: unknown): { spec: SpecDePeca; problemas: [] } | { spec: null; problemas: string[] } {
  const r = specSchema.safeParse(entrada)
  if (r.success) {
    const papeis = r.data.blocos.map((b) => b.papel)
    const repetidos = papeis.filter((p, i) => papeis.indexOf(p) !== i)
    if (repetidos.length > 0) return { spec: null, problemas: [`papel repetido: ${[...new Set(repetidos)].join(', ')}`] }
    return { spec: r.data, problemas: [] }
  }
  return {
    spec: null,
    problemas: r.error.issues.map((p) => `${p.path.join('.') || '(raiz)'}: ${p.message}`),
  }
}

export const DIMENSOES: Record<Formato, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1350 },
  quadrado: { width: 1080, height: 1080 },
}
