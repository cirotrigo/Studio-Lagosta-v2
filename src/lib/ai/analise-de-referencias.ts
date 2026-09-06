/**
 * Lê as peças APROVADAS de um cliente por visão e destila o estilo real da
 * marca — `BrandDNA.estiloDasReferencias` (05/09/2026).
 *
 * O que entra como referência, nesta ordem, até um teto:
 *  1. URLs passadas à mão (o Ciro apontando "estas duas");
 *  2. Generations marcadas como referência de estilo (`styleRefAt`);
 *  3. Artes com "gostei" no feedback (`LearningSignal` tipo `arte`).
 *
 * O leitor é o mesmo modelo do diretor de arte (`gpt-5.2`) com o vocabulário
 * FECHADO de separadores e ícones — texto livre não deduplica e não desenha.
 * Escrita por MERGE do Json com a proveniência (quais artes, quando, modelo),
 * para a análise poder ser refeita e comparada.
 */

import sharp from 'sharp'
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { db } from '@/lib/db'
import { fetchImageSource } from '@/lib/ai/fetch-image-source'
import {
  estiloBrutoSchema,
  normalizarEstilo,
  type EstiloDasReferenciasGravado,
} from '@/lib/brand/estilo-das-referencias'

const MODELO = process.env.OPENAI_PLANNER_MODEL || 'gpt-5.2'
/** Teto de imagens por análise: mais que isto dilui em vez de somar. */
export const MAX_REFERENCIAS = 8
/** Lado maior enviado à visão — o suficiente para ler letra e ornamento fino. */
const LADO_MAXIMO = 1024

export interface ReferenciaColhida {
  generationId: string | null
  url: string
  origem: 'manual' | 'style-ref' | 'gostei'
}

/** Junta as referências do cliente, sem repetir URL, até o teto. */
export async function colherReferencias(projectId: number, urlsManuais: string[] = []): Promise<ReferenciaColhida[]> {
  const vistas = new Set<string>()
  const saida: ReferenciaColhida[] = []
  const empurrar = (r: ReferenciaColhida) => {
    if (!r.url || vistas.has(r.url) || saida.length >= MAX_REFERENCIAS) return
    vistas.add(r.url)
    saida.push(r)
  }
  for (const url of urlsManuais) empurrar({ generationId: null, url, origem: 'manual' })

  const refs = await db.generation.findMany({
    where: { projectId, status: 'COMPLETED', styleRefAt: { not: null }, resultUrl: { not: null } },
    orderBy: { styleRefAt: 'desc' },
    take: MAX_REFERENCIAS,
    select: { id: true, resultUrl: true },
  })
  for (const r of refs) empurrar({ generationId: r.id, url: r.resultUrl!, origem: 'style-ref' })

  const gostei = await db.learningSignal.findMany({
    where: { projectId, tipo: 'arte', escolhido: { path: ['veredito'], equals: 'gostei' }, generationId: { not: null } },
    orderBy: { updatedAt: 'desc' },
    take: MAX_REFERENCIAS,
    select: { generationId: true },
  })
  if (gostei.length) {
    const gens = await db.generation.findMany({
      where: { id: { in: gostei.map((g) => g.generationId!) }, status: 'COMPLETED', resultUrl: { not: null } },
      select: { id: true, resultUrl: true },
    })
    for (const g of gens) empurrar({ generationId: g.id, url: g.resultUrl!, origem: 'gostei' })
  }
  return saida
}

const SYSTEM = `Você é um diretor de arte sênior que documenta a identidade visual de restaurantes a partir de peças de Instagram JÁ APROVADAS pelo cliente. Você recebe várias artes da mesma marca e descreve o que se REPETE entre elas — a assinatura —, nunca o que é particular de uma peça só.

Regras:
- Fale da CAMADA GRÁFICA (texto, separadores, ícones, ornamentos, marca), não do conteúdo das fotos.
- Fonte se descreve pelo PAPEL (serifa alta, slab pesada, grotesk condensada, manuscrita), nunca por nome de arquivo.
- Separadores e ícones vêm do vocabulário fechado descrito no schema (use os identificadores exatamente como estão na lista); se algo não cabe em nenhum item, descreva em "ornamentos". Se não há ícone, use "nenhum".
- Cor em hex aproximado, com o papel (ex.: "#F4301A — manchete e CTA").
- "evitar" é SÓ o que você VERIFICOU não aparecer em nenhuma das peças e que um gerador tenderia a pôr. Nunca uma lista genérica: cada item tem de ser uma ausência observada NESTAS peças. Se a marca USA sombra dura, contorno ou selo, isso vai na tipografia/ornamentos e jamais em "evitar".
- "efeitoDaManchete": olhe as letras da manchete de perto — sombra deslocada e nítida (sombra-dura), sombra desfocada (sombra-suave), contorno, ou nenhum. Diga também, na tipografia, em que cor da paleta a sombra/contorno é feito.
- Português do Brasil, frases curtas e concretas. Nada de adjetivo vazio.`

/**
 * Lê as referências e devolve o estilo. Lança quando não há referência ou a
 * visão falha — quem chama decide (o script mostra o motivo; nada em produção
 * depende disto em tempo de geração).
 */
export async function analisarReferenciasDeEstilo(
  projectId: number,
  opcoes: { urlsManuais?: string[]; nomeDaMarca?: string } = {},
): Promise<{ estilo: EstiloDasReferenciasGravado; referencias: ReferenciaColhida[] }> {
  const referencias = await colherReferencias(projectId, opcoes.urlsManuais ?? [])
  if (referencias.length === 0) throw new Error('nenhuma referência aprovada para este cliente')

  const imagens: Buffer[] = []
  for (const r of referencias) {
    try {
      const { buffer } = await fetchImageSource(r.url)
      imagens.push(await sharp(buffer).resize(LADO_MAXIMO, LADO_MAXIMO, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer())
    } catch (erro) {
      console.warn(`[analise-de-referencias] referência não baixou (${r.url}):`, erro instanceof Error ? erro.message : erro)
    }
  }
  if (imagens.length === 0) throw new Error('nenhuma referência pôde ser baixada')

  const { object } = await generateObject({
    model: openai(MODELO),
    maxOutputTokens: 3000,
    abortSignal: AbortSignal.timeout(120_000),
    schema: estiloBrutoSchema,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          ...imagens.map((buffer) => ({ type: 'image' as const, image: buffer })),
          {
            type: 'text' as const,
            text: `${imagens.length} peça(s) aprovada(s) da marca ${opcoes.nomeDaMarca ?? `#${projectId}`}. Descreva a assinatura visual que se repete entre elas.`,
          },
        ],
      },
    ],
  })

  const estilo: EstiloDasReferenciasGravado = {
    ...normalizarEstilo(object),
    fontes: {
      generationIds: referencias.map((r) => r.generationId).filter((id): id is string => !!id),
      urls: referencias.filter((r) => !r.generationId).map((r) => r.url),
      lidoEm: new Date().toISOString(),
      modelo: MODELO,
    },
  }
  return { estilo, referencias }
}

/** Grava (upsert da linha do DNA; só esta coluna). */
export async function salvarEstiloDasReferencias(projectId: number, estilo: EstiloDasReferenciasGravado): Promise<void> {
  const data = JSON.parse(JSON.stringify(estilo))
  await db.brandDNA.upsert({
    where: { projectId },
    create: { projectId, estiloDasReferencias: data },
    update: { estiloDasReferencias: data },
  })
}
