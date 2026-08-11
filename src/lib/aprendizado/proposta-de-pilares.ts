/**
 * O passe que PROPÕE os pilares de um cliente a partir do histórico dele.
 *
 * A taxonomia não é escrita a priori nem copiada de outro restaurante: ela sai
 * do que ESTE cliente já publicou. Um bar de vinhos e uma churrascaria não têm
 * os mesmos baldes, e uma lista genérica ("promoção, produto, bastidor") faria
 * todo mundo parecer igual — que é exatamente o que a destilação existe para
 * evitar.
 *
 * O passe PROPÕE; quem aprova é gente, na aba Marca. Enquanto ninguém aprovar,
 * a lista não classifica nada: `taxonomiaAprovada` só devolve o que passou pelo
 * olho humano.
 *
 * Módulo sem Prisma: recebe os textos e devolve a proposta. Quem lê o
 * histórico e grava é `pilares-service.ts`.
 */

import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { ALVO_PILARES, validarTaxonomia, type Pilar } from './pilares'

/** Um passe por cliente, raro e barato. Vale um modelo melhor que o mini. */
const MODELO = 'gpt-4o-mini'
const TIMEOUT_MS = 90_000

/** Quantos textos do histórico entram no prompt. */
export const MAX_TEXTOS_NA_PROPOSTA = 140

const propostaSchema = z.object({
  pilares: z
    .array(
      z.object({
        slug: z.string().optional().describe('identificador curto em kebab-case, ex: "happy-hour"'),
        nome: z.string().optional().describe('o nome que uma pessoa da agência usaria'),
        descricao: z.string().optional().describe('uma frase dizendo o que entra neste pilar'),
        exemplos: z
          .array(z.string())
          .optional()
          .describe('3 a 6 palavras ou expressões que aparecem nos textos deste pilar'),
      }),
    )
    .optional(),
})

export interface PropostaDePilares {
  pilares: Pilar[]
  avisos: string[]
  /** Quantos textos do histórico sustentaram a proposta. */
  textosAnalisados: number
}

const INSTRUCOES = [
  'Você organiza o conteúdo de Instagram de um restaurante. Abaixo estão TEXTOS de publicações que este cliente já fez.',
  '',
  `Leia tudo e proponha de ${ALVO_PILARES.minimo} a ${ALVO_PILARES.maximo} PILARES DE CONTEÚDO: os assuntos recorrentes deste cliente, do jeito que a agência dele falaria.`,
  '',
  'Regras:',
  '- Os pilares saem DESTES textos. Não proponha assunto que o cliente nunca publicou só porque restaurante costuma publicar.',
  '- Cada pilar é um balde amplo o bastante para caber várias peças, e estreito o bastante para que duas peças do mesmo balde sejam mesmo sobre a mesma coisa. "Happy hour" e "drinks" são o MESMO pilar, não dois.',
  '- Junte o que na prática é a mesma coisa; separe o que o cliente trata como coisas diferentes.',
  '- Nome curto, em português, sem jargão de marketing.',
  '- "descricao" é uma frase dizendo o que entra ali.',
  '- "exemplos" são palavras que de fato aparecem nos textos deste pilar (é o que ajuda a classificar as próximas).',
  '- NÃO crie um pilar chamado "outro", "diversos" ou "geral" — o sistema já tem um balde para o que não se encaixa.',
  '- Ordene do mais frequente para o menos frequente.',
].join('\n')

/** O prompt inteiro. Exportado para inspeção e teste. */
export function montarPromptDaProposta(marca: string, textos: string[]): string {
  return [
    INSTRUCOES,
    '',
    `MARCA: ${marca}`,
    '',
    '=== TEXTOS PUBLICADOS ===',
    textos.map((t, i) => `${i + 1}. ${t}`).join('\n'),
  ].join('\n')
}

/**
 * Propõe a taxonomia. Nunca lança: falha devolve proposta vazia com o motivo —
 * quem chama mostra o aviso e a pessoa escreve os pilares à mão, que continua
 * sendo um caminho válido.
 */
export async function proporPilaresDeTextos(
  marca: string,
  textos: string[],
): Promise<PropostaDePilares> {
  const amostra = textos
    .map((t) => t.trim())
    .filter((t) => t.length >= 15)
    .slice(0, MAX_TEXTOS_NA_PROPOSTA)

  if (amostra.length < 8) {
    return {
      pilares: [],
      avisos: [
        `Só encontrei ${amostra.length} publicação(ões) com texto legível no sistema — pouco para propor pilares. Escreva a lista à mão ou volte depois de algumas semanas de uso do Studio.`,
      ],
      textosAnalisados: amostra.length,
    }
  }

  try {
    const { object } = await generateObject({
      model: openai(MODELO),
      temperature: 0.2,
      maxOutputTokens: 2_000,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      schema: propostaSchema,
      messages: [{ role: 'user', content: montarPromptDaProposta(marca, amostra) }],
    })

    const { pilares, avisos } = validarTaxonomia(
      (object.pilares ?? []).map((p) => ({ ...p, origem: 'llm' as const })),
    )

    /**
     * O teto do LLM é do CÓDIGO, não do prompt.
     *
     * `validarTaxonomia` corta em `MAX_PILARES` (8), que é o teto da edição
     * HUMANA. Pedir "de 5 a 6" no texto não basta: medido em 11/08/2026, o
     * modelo devolveu o teto que lhe deram em 8 de 8 clientes. Mesma lição do
     * piso de confiança e do casamento de pilar — regra dura mora no código.
     *
     * O corte é pela ORDEM em que ele propôs, que é a ordem de importância que
     * ele mesmo declarou; a `ordem` é renumerada para não abrir buraco.
     */
    const noAlvo = pilares.slice(0, ALVO_PILARES.maximo).map((p, i) => ({ ...p, ordem: i }))
    if (pilares.length > noAlvo.length) {
      avisos.push(
        `A proposta veio com ${pilares.length} assuntos e ficou nos ${noAlvo.length} primeiros — ` +
          'lista longa demais para de fato separar. Dá para acrescentar outros à mão na aba Marca.',
      )
    }
    return { pilares: noAlvo, avisos, textosAnalisados: amostra.length }
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : 'erro desconhecido'
    console.warn('[pilares] proposta indisponível:', motivo)
    return {
      pilares: [],
      avisos: [`Não consegui propor a lista agora (${motivo}). Você pode escrever os pilares à mão.`],
      textosAnalisados: amostra.length,
    }
  }
}
